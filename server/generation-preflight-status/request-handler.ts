import { sendJson } from '../ai-gateway/shared'
import { isPrismaConfigured } from '../db/prisma'
import { GENERATION_PREFLIGHT_STATUS_PATH } from './constants'
import { getGenerationPreflightStatus } from './service'

const sendGenerationPreflightError = (res: any, statusCode: number, message: string) => {
  sendJson(res, statusCode, {
    message,
    error: {
      type: 'generation_preflight_status_error',
      message,
    },
  })
}

export const handleGenerationPreflightStatusRequest = async (req: any, res: any) => {
  const requestPath = String(req.url || '').split('?')[0]
  if (requestPath !== GENERATION_PREFLIGHT_STATUS_PATH) {
    return false
  }

  if (req.method !== 'GET') {
    sendGenerationPreflightError(res, 405, '仅支持只读状态查询。')
    return true
  }

  const data = await getGenerationPreflightStatus({
    databaseConfigured: isPrismaConfigured(),
  })
  sendJson(res, 200, { data })
  return true
}
