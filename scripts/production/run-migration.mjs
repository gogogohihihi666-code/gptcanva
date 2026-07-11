import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import dotenv from 'dotenv'
import { assertProductionMigrationAuthorization } from './migration-authorization.mjs'

const loadPrivateProductionEnv = async () => {
  const envPath = path.resolve(process.cwd(), '.env.production')
  try {
    await fs.access(envPath)
    dotenv.config({ path: envPath, quiet: true })
  } catch {
    // A managed runtime may inject its environment without a local file.
  }
}

const runMigration = () => new Promise((resolve, reject) => {
  const child = spawn('npx', ['prisma', 'migrate', 'deploy'], {
    stdio: 'ignore',
    shell: process.platform === 'win32',
    env: process.env,
  })

  child.once('error', reject)
  child.once('close', (code) => {
    if (code === 0) {
      resolve(undefined)
      return
    }
    reject(new Error(`Prisma migration command failed with exit code ${code ?? 'unknown'}.`))
  })
})

const main = async () => {
  await loadPrivateProductionEnv()
  assertProductionMigrationAuthorization(process.env)
  console.info('[production-migration] authorization accepted')
  console.info('[production-migration] running Prisma migration')
  await runMigration()
  console.info('[production-migration] migration completed')
}

main().catch((error) => {
  console.error('[production-migration] migration failed', error instanceof Error ? error.message : 'unknown error')
  process.exit(1)
})
