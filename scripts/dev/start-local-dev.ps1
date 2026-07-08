$ErrorActionPreference = 'Stop'

$Workspace = 'F:\Canva'
$LogDir = Join-Path $Workspace '.codex-temp'
$DatabaseContainerName = 'canana-local-mariadb'
$BackendPort = 5409
$FrontendPort = 5010
$DatabasePort = 3306
$DockerEngineTimeoutSeconds = 90
$DatabaseReadyTimeoutSeconds = 90
$BackendReadyTimeoutSeconds = 60
$DockerDesktopCandidates = @(
  'C:\Program Files\Docker\Docker\Docker Desktop.exe',
  "$env:LOCALAPPDATA\Docker\Docker Desktop.exe"
)

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Write-LauncherLog {
  param([string]$Message)

  Add-Content -LiteralPath (Join-Path $LogDir 'local-dev-launcher.log') -Value "[$(Get-Date -Format s)] $Message"
}

function Test-PortListening {
  param([int]$Port)

  $output = netstat -ano | Select-String -Pattern ":$Port\s+.*LISTENING"
  return $null -ne $output
}

function Invoke-DockerQuiet {
  param(
    [string[]]$Arguments,
    [string]$LogName
  )

  $logPath = Join-Path $LogDir $LogName
  & docker @Arguments *> $logPath
  return $LASTEXITCODE -eq 0
}

function Start-DockerDesktopIfAvailable {
  foreach ($candidate in $DockerDesktopCandidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
      try {
        Start-Process -FilePath $candidate -WindowStyle Minimized
        Write-LauncherLog "requested Docker Desktop startup from $candidate"
        return
      } catch {
        Write-LauncherLog "failed to request Docker Desktop startup from $candidate"
      }
    }
  }
}

function Wait-DockerEngine {
  $deadline = (Get-Date).AddSeconds($DockerEngineTimeoutSeconds)
  $requestedDockerDesktop = $false

  while ((Get-Date) -lt $deadline) {
    if (Invoke-DockerQuiet -Arguments @('info') -LogName 'docker-info.log') {
      Write-LauncherLog 'Docker engine is available'
      return $true
    }

    try {
      Start-Service -Name 'com.docker.service' -ErrorAction SilentlyContinue
    } catch {
      Write-LauncherLog 'Docker service start attempt failed or requires manual Docker Desktop startup'
    }

    if (-not $requestedDockerDesktop) {
      Start-DockerDesktopIfAvailable
      $requestedDockerDesktop = $true
    }

    Start-Sleep -Seconds 3
  }

  Write-LauncherLog 'Docker engine was not available before timeout'
  return $false
}

function Test-DatabaseContainerRunning {
  $state = & docker inspect -f '{{.State.Running}}' $DatabaseContainerName 2>$null
  return $LASTEXITCODE -eq 0 -and "$state".Trim() -eq 'true'
}

function Test-DatabasePing {
  if (-not (Test-DatabaseContainerRunning)) {
    return $false
  }

  & docker exec $DatabaseContainerName mariadb-admin ping --silent *> (Join-Path $LogDir 'database-ping.log')
  if ($LASTEXITCODE -eq 0) {
    return $true
  }

  & docker exec $DatabaseContainerName mysqladmin ping --silent *> (Join-Path $LogDir 'database-ping.log')
  return $LASTEXITCODE -eq 0
}

function Ensure-LocalDatabase {
  if (-not (Wait-DockerEngine)) {
    return $false
  }

  $containerNames = & docker ps -a --filter "name=$DatabaseContainerName" --format '{{.Names}}' 2>$null
  if ($LASTEXITCODE -ne 0 -or $containerNames -notcontains $DatabaseContainerName) {
    Write-LauncherLog "database container $DatabaseContainerName not found"
    return $false
  }

  if (-not (Test-DatabaseContainerRunning)) {
    if (Invoke-DockerQuiet -Arguments @('start', $DatabaseContainerName) -LogName 'database-dev-out.log') {
      Write-LauncherLog "started database container $DatabaseContainerName"
    } else {
      Write-LauncherLog "failed to start database container $DatabaseContainerName"
      return $false
    }
  } else {
    Write-LauncherLog "database container $DatabaseContainerName already running"
  }

  $deadline = (Get-Date).AddSeconds($DatabaseReadyTimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if ((Test-PortListening -Port $DatabasePort) -and (Test-DatabasePing)) {
      Write-LauncherLog "database ready on $DatabasePort"
      return $true
    }

    Start-Sleep -Seconds 2
  }

  Write-LauncherLog "database did not become ready before timeout"
  return $false
}

function Start-LocalDevProcess {
  param(
    [string]$Name,
    [int]$Port,
    [string]$Command,
    [string]$OutLog
  )

  if (Test-PortListening -Port $Port) {
    Write-LauncherLog "$Name already listening on $Port"
    return
  }

  $cmd = "Set-Location -LiteralPath '$Workspace'; $Command *> '$OutLog'"
  Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-NoExit', '-Command', $cmd) -WorkingDirectory $Workspace -WindowStyle Hidden
  Write-LauncherLog "started $Name on $Port"
}

function Wait-BackendReady {
  $deadline = (Get-Date).AddSeconds($BackendReadyTimeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    if (Test-PortListening -Port $BackendPort) {
      try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:$BackendPort/api/system-init/status" -TimeoutSec 5
        if ($response.StatusCode -eq 200) {
          Write-LauncherLog "backend ready on $BackendPort"
          return $true
        }
      } catch {
        Write-LauncherLog 'backend not ready yet'
      }
    }

    Start-Sleep -Seconds 2
  }

  Write-LauncherLog "backend did not become ready before timeout"
  return $false
}

Write-LauncherLog 'local dev startup requested'

$databaseReady = Ensure-LocalDatabase
if (-not $databaseReady) {
  Write-LauncherLog 'continuing to backend startup after database readiness failed'
}

Start-LocalDevProcess `
  -Name 'backend' `
  -Port $BackendPort `
  -Command 'npm.cmd run dev:server' `
  -OutLog (Join-Path $LogDir 'backend-dev-out.log')

Wait-BackendReady | Out-Null

Start-LocalDevProcess `
  -Name 'frontend' `
  -Port $FrontendPort `
  -Command 'npm.cmd run dev:client -- --host 0.0.0.0 --port 5010' `
  -OutLog (Join-Path $LogDir 'frontend-dev-out.log')

Write-LauncherLog 'local dev startup completed'
