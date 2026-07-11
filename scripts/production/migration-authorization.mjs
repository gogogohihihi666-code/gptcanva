export const assertProductionMigrationAuthorization = (env = process.env) => {
  const errors = []
  if (String(env.NODE_ENV || '').trim().toLowerCase() !== 'production') {
    errors.push('NODE_ENV must be production.')
  }
  if (String(env.OKWOOK_ALLOW_PRODUCTION_MIGRATION || '').trim() !== '1') {
    errors.push('OKWOOK_ALLOW_PRODUCTION_MIGRATION=1 is required.')
  }
  if (String(env.OKWOOK_PRODUCTION_BACKUP_VERIFIED || '').trim() !== '1') {
    errors.push('OKWOOK_PRODUCTION_BACKUP_VERIFIED=1 is required.')
  }
  if (errors.length) {
    throw new Error(`Production migration authorization failed: ${errors.join(' ')}`)
  }
}
