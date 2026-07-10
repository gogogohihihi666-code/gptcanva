import { sendJson } from '../ai-gateway/shared'
import { requireCurrentSessionUser } from '../auth/session'
import { isPrismaConfigured } from '../db/prisma'
import { ACCOUNT_GENERATION_HISTORY_PATH } from './constants'
import { listAccountGenerationHistory } from './service'

export const handleAccountGenerationHistoryRequest = async (req: any, res: any) => {
  if (!isPrismaConfigured()) {
    sendJson(res, 500, { error: 'Generation history is unavailable' })
    return
  }

  const currentUser = await requireCurrentSessionUser(req, res)
  if (!currentUser?.id) return

  if (req.method === 'GET' && String(req.url || '').split('?')[0] === ACCOUNT_GENERATION_HISTORY_PATH) {
    const data = await listAccountGenerationHistory(currentUser.id)
    sendJson(res, 200, { data })
    return
  }

  sendJson(res, 405, { error: 'Method Not Allowed' })
}
