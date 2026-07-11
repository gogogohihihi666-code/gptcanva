export const BRAND_NAME = 'OKWook'
export const BRAND_SITE_URL = 'https://www.okwook.com'
export const BRAND_SITE_HOST = 'www.okwook.com'
export const BRAND_ENGLISH_SLOGAN = 'Confront It OK. Astonish It Wo. Command It OK.'
export const BRAND_CHINESE_SLOGAN = '直面挑战，震撼全场，掌控一切。'
export const BRAND_META_DESCRIPTION = `${BRAND_NAME} - ${BRAND_ENGLISH_SLOGAN}`

const LEGACY_DEFAULT_BRAND_NAMES = new Set(['canana', 'cananamind', 'canvasmind'])

export const resolveBrandName = (value?: string | null) => {
  const normalized = String(value || '').trim()
  return !normalized || LEGACY_DEFAULT_BRAND_NAMES.has(normalized.toLowerCase())
    ? BRAND_NAME
    : normalized
}

export const resolveBrandDescription = (value?: string | null) => {
  return String(value || '').trim() || BRAND_META_DESCRIPTION
}
