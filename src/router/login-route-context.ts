export type LoginMode = 'user' | 'admin'

type LoginRouteContextInput = {
  fullPath: string
  requiresAdmin: boolean
}

const ADMIN_DEFAULT_ROUTE = '/admin/dashboard'
const USER_DEFAULT_ROUTE = '/'

export const normalizeLoginMode = (value: unknown): LoginMode => value === 'admin' ? 'admin' : 'user'

export const isSafeLoginRedirect = (value: unknown) => {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return false
  }

  let decoded = value
  try {
    for (let index = 0; index < 8; index += 1) {
      const next = decodeURIComponent(decoded)
      if (next === decoded) break
      decoded = next
    }
  } catch {
    return false
  }

  return decoded.startsWith('/')
    && !decoded.startsWith('//')
    && !decoded.includes('\\')
}

export const buildLoginRouteContext = ({ fullPath, requiresAdmin }: LoginRouteContextInput) => ({
  path: '/login',
  query: {
    mode: requiresAdmin ? 'admin' : 'user',
    redirect: isSafeLoginRedirect(fullPath) ? fullPath : requiresAdmin ? ADMIN_DEFAULT_ROUTE : USER_DEFAULT_ROUTE,
  },
})

export const resolveLoginRedirect = (mode: LoginMode, redirect: unknown) => {
  if (!isSafeLoginRedirect(redirect)) {
    return mode === 'admin' ? ADMIN_DEFAULT_ROUTE : USER_DEFAULT_ROUTE
  }

  const nextPath = String(redirect)
  if (mode === 'admin' && nextPath !== '/admin' && !nextPath.startsWith('/admin/')) {
    return ADMIN_DEFAULT_ROUTE
  }

  return nextPath
}
