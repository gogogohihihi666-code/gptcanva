import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()
const readProjectFile = (relativePath: string) => readFileSync(path.join(root, relativePath), 'utf8')

test('register route opens the user verification entry with an explicit auto-registration notice', () => {
  const router = readProjectFile('src/router/index.ts')
  const app = readProjectFile('src/App.vue')
  const modal = readProjectFile('src/components/LoginModal.vue')

  assert.match(router, /path: '\/register'/)
  assert.match(app, /route\.path === '\/register'/)
  assert.match(app, /openLoginModal\('register-route', \{ mode: 'user' \}\)/)
  assert.match(modal, /const isRegistrationEntry = computed\(\(\) => props\.source === 'register-route'\)/)
  assert.match(modal, /首次使用验证码登录将自动创建账号/)
  assert.match(modal, /method\.allowSignUp/)
  assert.doesNotMatch(modal, /ADMIN_PASSWORD/)
})
