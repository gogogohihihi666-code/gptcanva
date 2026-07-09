import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const readText = (path: string) => readFileSync(resolve(root, path), 'utf8')

describe('dev server local env bootstrap', () => {
  it('loads .env.development before prisma generate without exposing DATABASE_URL', () => {
    const packageJson = JSON.parse(readText('package.json')) as { scripts: Record<string, string> }
    const scriptPath = 'scripts/dev/run-dev-server-with-env.mjs'
    const absoluteScriptPath = resolve(root, scriptPath)

    assert.equal(packageJson.scripts['dev:server'], `node ${scriptPath}`)
    assert.equal(existsSync(absoluteScriptPath), true)

    const script = readText(scriptPath)

    assert.match(script, /dotenv\.config\(\{\s*path:\s*envPath,\s*quiet:\s*true/)
    assert.match(script, /runCommand\('prisma generate'/)
    assert.match(script, /runCommand\('server dev'/)
    assert.match(script, /tsx/)
    assert.match(script, /watch/)
    assert.match(script, /server\/index\.ts/)
    assert.match(script, /cmd\.exe/)
    assert.match(script, /\/d/)
    assert.match(script, /\/s/)
    assert.match(script, /\/c/)
    assert.match(script, /shell:\s*false/)
    assert.match(script, /NODE_ENV\s*===\s*'production'/)
    assert.match(script, /Missing required local development environment variable: DATABASE_URL/)
    assert.doesNotMatch(script, /console\.log\([^)]*DATABASE_URL/i)
    assert.doesNotMatch(script, /console\.error\([^)]*DATABASE_URL[^)]*process\.env/i)
  })
})
