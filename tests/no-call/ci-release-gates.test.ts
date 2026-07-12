import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

test('ordinary main pushes and pull requests run local verification only', () => {
  const workflow = read('.github/workflows/ci.yml')

  assert.match(workflow, /pull_request:/)
  assert.match(workflow, /push:\s*\n\s+branches:\s*\[main\]/)
  assert.match(workflow, /pull_request:\s*\n\s+branches:\s*\[main\]/)
  assert.match(workflow, /npm\.cmd run test|npm run test/)
  assert.match(workflow, /npm\.cmd run build:service|npm run build:service/)
  assert.match(workflow, /npm\.cmd run build|npm run build/)
  assert.doesNotMatch(workflow, /docker\/login-action|push:\s*true|appleboy\/|workflow_run|environment:\s*production/i)
  assert.doesNotMatch(workflow, /secrets\./)
})

test('npm CI lockfile is versioned for reproducible dependency installation', () => {
  assert.doesNotThrow(() => read('package-lock.json'))
  assert.doesNotMatch(read('.gitignore'), /^package-lock\.json$/m)
})

test('CI supplies Prisma generation with an inert loopback database URL', () => {
  const workflow = read('.github/workflows/ci.yml')

  assert.match(workflow, /name: Install dependencies\s*\n\s+env:\s*\n\s+DATABASE_URL: mysql:\/\/ci:ci@127\.0\.0\.1:3306\/okwook_ci_metadata\s*\n\s+run: npm ci/)
  assert.doesNotMatch(workflow, /DATABASE_URL:\s*\$\{\{\s*secrets\./)
})

test('image publication is manual and uses an immutable commit tag', () => {
  const workflow = read('.github/workflows/docker-image.yml')

  assert.match(workflow, /workflow_dispatch:/)
  assert.match(workflow, /release_commit:/)
  assert.doesNotMatch(workflow, /on:\s*\n\s+push:/)
  assert.doesNotMatch(workflow, /workflow_run|repository_dispatch|type=raw,value=latest/i)
  assert.match(workflow, /sha-\$\{\{ inputs\.release_commit \}\}/)
  assert.match(workflow, /push:\s*true/)
  assert.doesNotMatch(workflow, /environment:\s*production/i)
})

test('production deployment is manual, independent, and pinned to a commit image', () => {
  const workflow = read('.github/workflows/deploy.yml')

  assert.match(workflow, /workflow_dispatch:/)
  assert.match(workflow, /release_commit:/)
  assert.match(workflow, /environment:\s*production/)
  assert.match(workflow, /concurrency:/)
  assert.doesNotMatch(workflow, /workflow_run|repository_dispatch|:latest/i)
  assert.doesNotMatch(workflow, /docker\/login-action|build-push-action/i)
  assert.match(workflow, /sha-\$\{\{ inputs\.release_commit \}\}/)
})
