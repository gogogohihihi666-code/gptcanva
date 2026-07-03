import { setTimeout as sleep } from 'node:timers/promises'
import prisma from './prisma'
import { writeScopedLog } from '../shared/logging'

export interface PrismaRetryOptions {
  attempts?: number
  baseDelayMs?: number
  maxDelayMs?: number
  scope?: string
  operationName?: string
}

export interface PrismaTransactionRetryOptions extends PrismaRetryOptions {
  maxWait?: number
  timeout?: number
  isolationLevel?: unknown
}

type TransactionCapableClient = {
  $transaction: <T>(
    operation: (tx: any) => Promise<T>,
    options?: {
      maxWait?: number
      timeout?: number
      isolationLevel?: unknown
    },
  ) => Promise<T>
}

const DEFAULT_RETRY_ATTEMPTS = Number.parseInt(process.env.PRISMA_DEADLOCK_RETRY_ATTEMPTS || '4', 10)
const DEFAULT_BASE_DELAY_MS = Number.parseInt(process.env.PRISMA_DEADLOCK_RETRY_BASE_DELAY_MS || '80', 10)
const DEFAULT_MAX_DELAY_MS = Number.parseInt(process.env.PRISMA_DEADLOCK_RETRY_MAX_DELAY_MS || '1200', 10)

const RETRYABLE_PRISMA_CODES = new Set([
  'P2034',
  'P2024',
])

const RETRYABLE_DRIVER_CODES = new Set([
  'ER_LOCK_DEADLOCK',
  'ER_LOCK_WAIT_TIMEOUT',
  'ER_LOCK_ABORTED',
])

const RETRYABLE_ERRNOS = new Set([
  1205,
  1213,
])

const RETRYABLE_SQL_STATES = new Set([
  '40001',
  '41000',
])

const getObjectField = (value: unknown, field: string) => {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  return (value as Record<string, unknown>)[field]
}

const collectErrorChain = (error: unknown) => {
  const chain: unknown[] = []
  const seen = new Set<unknown>()
  let current: unknown = error

  while (current && !seen.has(current)) {
    chain.push(current)
    seen.add(current)
    current = getObjectField(current, 'cause')
  }

  return chain
}

export const isRetryablePrismaConcurrencyError = (error: unknown) => {
  for (const item of collectErrorChain(error)) {
    const code = String(getObjectField(item, 'code') || '')
    const errno = Number(getObjectField(item, 'errno') || getObjectField(item, 'number') || 0)
    const sqlState = String(getObjectField(item, 'sqlState') || getObjectField(item, 'sqlstate') || '')
    const message = item instanceof Error ? item.message : String(item || '')

    if (RETRYABLE_PRISMA_CODES.has(code)) {
      return true
    }
    if (RETRYABLE_DRIVER_CODES.has(code)) {
      return true
    }
    if (RETRYABLE_ERRNOS.has(errno)) {
      return true
    }
    if (RETRYABLE_SQL_STATES.has(sqlState)) {
      return true
    }
    if (/deadlock|lock wait timeout|write conflict|serialization failure/i.test(message)) {
      return true
    }
  }

  return false
}

const normalizePositiveInteger = (value: number, fallback: number) => {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

const calculateRetryDelay = (attemptIndex: number, options: Required<Pick<PrismaRetryOptions, 'baseDelayMs' | 'maxDelayMs'>>) => {
  const exponentialDelay = options.baseDelayMs * (2 ** Math.max(0, attemptIndex - 1))
  const cappedDelay = Math.min(options.maxDelayMs, exponentialDelay)
  const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(cappedDelay * 0.35)))

  return cappedDelay + jitter
}

export const withPrismaConcurrencyRetry = async <T>(
  operation: () => Promise<T>,
  options: PrismaRetryOptions = {},
): Promise<T> => {
  const attempts = normalizePositiveInteger(options.attempts ?? DEFAULT_RETRY_ATTEMPTS, DEFAULT_RETRY_ATTEMPTS)
  const baseDelayMs = normalizePositiveInteger(options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS, DEFAULT_BASE_DELAY_MS)
  const maxDelayMs = normalizePositiveInteger(options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS, DEFAULT_MAX_DELAY_MS)
  const scope = options.scope || 'Prisma'
  const operationName = options.operationName || 'database_operation'

  let lastError: unknown

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      const retryable = isRetryablePrismaConcurrencyError(error)
      if (!retryable || attempt >= attempts) {
        throw error
      }

      const delayMs = calculateRetryDelay(attempt, { baseDelayMs, maxDelayMs })
      writeScopedLog('warn', scope, 'retryable_database_concurrency_error', {
        operationName,
        attempt,
        attempts,
        delayMs,
        message: error instanceof Error ? error.message : String(error),
      })
      await sleep(delayMs)
    }
  }

  throw lastError
}

export const runPrismaTransactionWithRetry = async <T>(
  operation: (tx: any) => Promise<T>,
  options: PrismaTransactionRetryOptions = {},
): Promise<T> => {
  const client = prisma as unknown as TransactionCapableClient
  const transactionOptions = {
    maxWait: options.maxWait ?? Number.parseInt(process.env.PRISMA_TRANSACTION_MAX_WAIT_MS || '5000', 10),
    timeout: options.timeout ?? Number.parseInt(process.env.PRISMA_TRANSACTION_TIMEOUT_MS || '15000', 10),
    isolationLevel: options.isolationLevel,
  }

  return withPrismaConcurrencyRetry(
    () => client.$transaction(operation, transactionOptions),
    {
      attempts: options.attempts,
      baseDelayMs: options.baseDelayMs,
      maxDelayMs: options.maxDelayMs,
      scope: options.scope,
      operationName: options.operationName || 'database_transaction',
    },
  )
}
