import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()
const readProjectFile = (relativePath: string) => readFileSync(path.join(root, relativePath), 'utf8')

test('login agreement consent remains operable without weakening EMAIL_CODE authentication', () => {
  const modal = readProjectFile('src/components/LoginModal.vue')
  const css = readProjectFile('src/components/LoginModal.css')

  assert.match(modal, /const agreementInputId = 'login-agreement-checkbox'/)
  assert.match(modal, /<input[\s\S]*:id="agreementInputId"[\s\S]*v-model="agreementChecked"[\s\S]*type="checkbox"[\s\S]*class="login-agreement-checkbox"/)
  assert.match(modal, /<label :for="agreementInputId" class="login-agreement-label">/)
  assert.match(modal, /id="login-agreement-description"/)
  assert.match(modal, /@click\.stop/)
  assert.doesNotMatch(modal, /class="sf-hidden"/)
  assert.match(modal, /const agreementChecked = ref\(false\)/)
  assert.match(modal, /policySettings\.value\.agreementRequired \|\| agreementChecked\.value/)
  assert.match(modal, /请先阅读并同意协议后登录/)
  assert.doesNotMatch(modal, /验证码已自动填充：\$\{issuedCode\.value\}/)
  assert.match(modal, /ElMessage\.success\('验证码已自动填充'\)/)

  assert.doesNotMatch(css, /\.login-agreement-checkbox\s*\{[^}]*display\s*:\s*none/i)
  assert.match(css, /\.login-agreement-checkbox\s*\{[\s\S]*width:\s*20px[\s\S]*height:\s*20px/)
  assert.match(css, /\.login-agreement-checkbox:focus-visible\s*\{[\s\S]*outline:/)
  assert.match(css, /@media \(max-width: 480px\)[\s\S]*\.login-agreement\s*\{[\s\S]*flex-wrap:\s*wrap/)
})
