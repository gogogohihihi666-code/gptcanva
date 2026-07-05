import { sendJson } from '../ai-gateway/shared'
import { requireAdminSessionUser } from '../auth/session'
import { isPrismaConfigured } from '../db/prisma'
import { ADMIN_ORDERS_BASE_PATH } from './constants'
import { listAdminOrders } from './service'
import { readAdminOrdersQuery, sendAdminOrdersError } from './shared'

export const handleAdminOrdersRequest = async (req: any, res: any) => {
  try {
    if (!isPrismaConfigured()) {
      sendAdminOrdersError(res, 500, 'Missing DATABASE_URL, admin orders are unavailable.')
      return
    }

    const currentUser = await requireAdminSessionUser(req, res)
    if (!currentUser) {
      return
    }

    const requestPath = String(req.url || '').split('?')[0]
    if (req.method === 'GET' && requestPath === ADMIN_ORDERS_BASE_PATH) {
      const query = readAdminOrdersQuery(String(req.url || ''))
      const data = await listAdminOrders(query)
      sendJson(res, 200, { data })
      return
    }

    sendAdminOrdersError(res, 405, 'Method Not Allowed')
  } catch (error: any) {
    sendAdminOrdersError(res, 500, error?.message || 'Failed to handle admin orders request.')
  }
}
