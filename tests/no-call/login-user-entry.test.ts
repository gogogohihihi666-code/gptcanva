import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()
const readProjectFile = (relativePath: string) => readFileSync(path.join(root, relativePath), 'utf8')

test('public login entry hides administrator authentication and prefers a user code method', () => {
  const app = readProjectFile('src/App.vue')
  const modal = readProjectFile('src/components/LoginModal.vue')

  assert.match(app, /openLoginModal\(mode === 'admin' \? 'admin-route-guard' : 'route-guard'/)
  assert.match(app, /:source="loginModalSource"/)
  assert.match(modal, /source\?: string/)
  assert.match(modal, /const isAdminLoginContext = computed\(\(\) => props\.source === 'admin-route-guard'\)/)
  assert.match(modal, /!isAdminPasswordMethod\(item\)/)
  assert.match(modal, /const defaultInteractiveMethod = computed\(\(\) => \{[\s\S]*find\(item => item\.category === 'CODE'\)[\s\S]*interactiveMethods\.value\[0\] \|\| null/)
  assert.match(modal, /syncActiveMethod\(true\)/)
})
