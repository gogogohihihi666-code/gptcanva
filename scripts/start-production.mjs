import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'

const hasProductionEnvFile = async () => {
  try {
    await fs.access(path.resolve(process.cwd(), '.env.production'))
    return true
  } catch {
    return false
  }
}

const resolveServerEntryPath = async () => {
  try {
    await fs.access(path.resolve(process.cwd(), 'server/index.js'))
    return 'server/index.js'
  } catch {
    return 'dist-service/server/index.js'
  }
}

const start = async () => {
  const hasEnvFile = await hasProductionEnvFile()
  const serverEntryPath = await resolveServerEntryPath()
  const serverArgs = hasEnvFile
    ? ['--env-file=.env.production', serverEntryPath]
    : [serverEntryPath]

  console.info('[start-production] starting production preflight and service')
  const child = spawn('node', serverArgs, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  })

  await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code) => {
      if (code === 0) {
        resolve(undefined)
        return
      }
      reject(new Error(`Production service exited with code ${code ?? 'unknown'}.`))
    })
  })
}

start().catch((error) => {
  console.error('[start-production] startup failed', error instanceof Error ? error.message : 'unknown error')
  process.exit(1)
})
