#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const envPath = resolve(workspaceRoot, '.env.development')

if (process.env.NODE_ENV === 'production') {
  console.error('[dev-server] Refusing to load local development env while NODE_ENV=production.')
  process.exit(1)
}

if (!existsSync(envPath)) {
  console.error('[dev-server] Missing .env.development. Create it from .env.development.example before starting local dev.')
  process.exit(1)
}

const loadedEnv = dotenv.config({ path: envPath, quiet: true })
if (loadedEnv.error) {
  console.error('[dev-server] Failed to load .env.development.')
  process.exit(1)
}

if (!process.env.DATABASE_URL) {
  console.error('[dev-server] Missing required local development environment variable: DATABASE_URL.')
  process.exit(1)
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const localBinExt = process.platform === 'win32' ? '.cmd' : ''
const localTsx = resolve(workspaceRoot, 'node_modules', '.bin', `tsx${localBinExt}`)
const tsxCommand = existsSync(localTsx) ? localTsx : 'tsx'
const children = new Set()

const buildSpawnInput = (command, args) => {
  if (process.platform !== 'win32' || !command.endsWith('.cmd')) {
    return { command, args }
  }

  return {
    command: 'cmd.exe',
    args: ['/d', '/s', '/c', command, ...args],
  }
}

const stopChildren = (signal) => {
  for (const child of children) {
    if (!child.killed) {
      child.kill(signal)
    }
  }
}

process.on('SIGINT', () => {
  stopChildren('SIGINT')
})

process.on('SIGTERM', () => {
  stopChildren('SIGTERM')
})

const runCommand = (label, command, args) => new Promise((resolveCommand, rejectCommand) => {
  console.log(`[dev-server] Starting ${label}...`)
  const spawnInput = buildSpawnInput(command, args)
  const child = spawn(spawnInput.command, spawnInput.args, {
    cwd: workspaceRoot,
    env: process.env,
    shell: false,
    stdio: 'inherit',
  })

  children.add(child)

  child.on('error', (error) => {
    children.delete(child)
    rejectCommand(error)
  })

  child.on('exit', (code, signal) => {
    children.delete(child)
    if (code === 0) {
      resolveCommand()
      return
    }
    if (signal) {
      rejectCommand(new Error(`${label} stopped by ${signal}`))
      return
    }
    rejectCommand(new Error(`${label} exited with code ${code ?? 'unknown'}`))
  })
})

try {
  await runCommand('prisma generate', npmCommand, ['run', 'prisma:generate'])
  await runCommand('server dev', tsxCommand, ['watch', 'server/index.ts'])
} catch (error) {
  console.error(`[dev-server] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
