import { sendJson } from '../ai-gateway/shared'
import { requireAdminSessionUser } from '../auth/session'
import { isPrismaConfigured } from '../db/prisma'
import { ADMIN_PROVIDER_HEALTH_PATH } from './constants'
import { getAdminProviderHealthOverview } from './service'

const sendAdminProviderHealthError = (res: any, statusCode: number, message: string) => {
  sendJson(res, statusCode, {
    message,
    error: {
      type: 'admin_provider_health_error',
      message,
    },
  })
}

export const handleAdminProviderHealthRequest = async (req: any, res: any) => {
  try {
    if (!isPrismaConfigured()) {
      sendAdminProviderHealthError(res, 500, 'Missing DATABASE_URL, provider health is unavailable.')
      return
    }

    const requestPath = String(req.url || '').split('?')[0]
    if (req.method !== 'GET' || requestPath !== ADMIN_PROVIDER_HEALTH_PATH) {
      sendAdminProviderHealthError(res, 405, 'Method Not Allowed')
      return
    }

    const currentUser = await requireAdminSessionUser(req, res)
    if (!currentUser) {
      return
    }

    const data = await getAdminProviderHealthOverview()
    sendJson(res, 200, { data })
  } catch (error: any) {
    sendAdminProviderHealthError(res, 500, error?.message || 'Failed to load provider health overview.')
  }
}
