import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const readText = (path: string) => readFileSync(resolve(root, path), 'utf8')

describe('OKWook brand and domain no-call', () => {
  it('uses the approved public identity without changing technical compatibility names', () => {
    const brand = readText('src/config/brand.ts')
    const index = readText('index.html')
    const publicSettings = readText('src/stores/system-settings.ts')
    const footer = readText('src/components/home/components/HomeFooter.vue')
    const home = readText('src/views/home/home.vue')
    const adminSidebar = readText('src/components/admin/layout/AdminSidebar.vue')
    const install = readText('src/views/install/InstallView.vue')

    assert.match(brand, /BRAND_NAME\s*=\s*'OKWook'/)
    assert.match(brand, /www\.okwook\.com/)
    assert.match(brand, /Confront It OK\. Astonish It Wo\. Command It OK\./)
    assert.match(brand, /直面挑战，震撼全场，掌控一切。/)
    assert.match(index, /<title>OKWook/)
    assert.match(index, /og:title/)
    assert.match(index, /og:description/)
    assert.match(publicSettings, /resolveBrandName/)
    assert.match(footer, /BRAND_ENGLISH_SLOGAN/)
    assert.match(footer, /flex-wrap:\s*wrap/)
    assert.match(home, /HomeFooter/)
    assert.match(readText('src\/components\/home\/components\/HomeHeader.vue'), /home-header-brand-slogan[\s\S]*overflow-wrap/)
    assert.match(adminSidebar, /OKWook/)
    assert.match(install, /BRAND_NAME/)
    assert.doesNotMatch(brand, /a\.share-dns\.com|b\.share-dns\.net/)
  })

  it('keeps local development URLs and no-call boundaries unchanged', () => {
    const api = readText('src/api/http.ts')
    const startScript = readText('scripts/dev/start-local-dev.ps1')
    const noCallTest = readText('tests/no-call/user-generation-ui-no-call-guidance.test.ts')
    const authService = readText('server/auth/service.ts')

    assert.match(api, /buildApiUrl/)
    assert.doesNotMatch(api, /okwook\.com/)
    assert.match(startScript, /http:\/\/localhost:\$BackendPort/)
    assert.match(noCallTest, /no-call/)
    assert.match(authService, /canana_session/)
  })
})
