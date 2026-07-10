export const ACCOUNT_GENERATION_HISTORY_PATH = '/api/account/generation-history'

export const isAccountGenerationHistoryPath = (requestPath: string) => (
  requestPath === ACCOUNT_GENERATION_HISTORY_PATH
)
