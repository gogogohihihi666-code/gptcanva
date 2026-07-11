import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildLoginRouteContext,
  resolveLoginRedirect,
} from '../../src/router/login-route-context'

test('preserves user and administrator login route context without external redirects', () => {
  assert.deepEqual(
    buildLoginRouteContext({ fullPath: '/account', requiresAdmin: false }),
    { path: '/login', query: { mode: 'user', redirect: '/account' } },
  )
  assert.deepEqual(
    buildLoginRouteContext({ fullPath: '/admin/dashboard?tab=risk', requiresAdmin: true }),
    { path: '/login', query: { mode: 'admin', redirect: '/admin/dashboard?tab=risk' } },
  )
  assert.equal(resolveLoginRedirect('user', '/account'), '/account')
  assert.equal(resolveLoginRedirect('admin', '/admin/providers?tab=models'), '/admin/providers?tab=models')
  assert.equal(resolveLoginRedirect('user', 'https://evil.example'), '/')
  assert.equal(resolveLoginRedirect('user', '//evil.example'), '/')
  assert.equal(resolveLoginRedirect('user', '/%2F%2Fevil.example'), '/')
  assert.equal(resolveLoginRedirect('user', 'javascript:alert(1)'), '/')
  assert.equal(resolveLoginRedirect('admin', '/account'), '/admin/dashboard')
})

test('login entry wires a real modal and maintains separate user and admin contexts', async () => {
  const { readFileSync } = await import('node:fs')
  const { resolve } = await import('node:path')
  const root = process.cwd()
  const router = readFileSync(resolve(root, 'src/router/index.ts'), 'utf8')
  const app = readFileSync(resolve(root, 'src/App.vue'), 'utf8')
  const modal = readFileSync(resolve(root, 'src/components/LoginModal.vue'), 'utf8')

  assert.match(router, /path: '\/login'/)
  assert.match(router, /buildLoginRouteContext/)
  assert.match(app, /route\.path === '\/login'/)
  assert.match(app, /@login-success="handleLoginSuccess"/)
  assert.match(modal, /'login-success': \[\]/)
  assert.match(modal, /isAdminLoginContext/)
  assert.match(modal, /!isAdminPasswordMethod\(item\)/)
})
