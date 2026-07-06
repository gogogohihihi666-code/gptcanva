export const GENERATION_PREFLIGHT_STATUS_PATH = '/api/generation/preflight-status'

export const isGenerationPreflightStatusPath = (requestPath: string) => {
  return requestPath === GENERATION_PREFLIGHT_STATUS_PATH
}
