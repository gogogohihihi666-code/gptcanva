import { prisma } from '../db/prisma'

type AccountGenerationStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'STOPPED'
type AccountGenerationRefundStatus = 'NONE' | 'REFUNDED' | 'PENDING_REFUND' | 'NOT_REQUIRED'
type AccountGenerationCompensationStatus = 'NONE' | 'COMPLETED' | 'PENDING'

interface AccountGenerationHistoryRecordInput {
  id: string
  userId: string
  type: string
  status: string
  prompt?: string | null
  modelLabel?: string | null
  modelKey?: string | null
  ratio?: string | null
  resolution?: string | null
  durationLabel?: string | null
  errorMessage?: string | null
  startedAt?: Date | null
  finishedAt?: Date | null
  createdAt: Date
  outputs?: Array<{
    outputType?: string | null
    url?: string | null
  }>
}

interface AccountGenerationPointLogInput {
  userId: string
  sourceId?: string | null
  changeType?: string | null
  changeAmount?: number | null
  metaJson?: unknown
}

const hiddenValuePattern = /\b(token|secret|password|api(?:[_ -]?key)?|authorization|cookie|signature)\b\s*[:=]\s*[^,;\s]+/gi
const externalUrlPattern = /https?:\/\/\S+/gi
const inlineDataPattern = /data:[^\s]+/gi

const safeText = (value: unknown, fallback = '', maxLength = 160) => {
  const text = String(value || '').trim()
  if (!text) return fallback
  const redacted = text
    .replace(hiddenValuePattern, '[hidden]')
    .replace(externalUrlPattern, '[external reference hidden]')
    .replace(inlineDataPattern, '[inline data hidden]')
  return redacted.length > maxLength ? `${redacted.slice(0, maxLength - 1)}...` : redacted
}

const safeTaskId = (value: unknown) => {
  const id = String(value || '').trim()
  if (id.length <= 10) return id
  return `${id.slice(0, 6)}...${id.slice(-4)}`
}

const toIsoString = (value: unknown) => value instanceof Date ? value.toISOString() : ''
const normalizeAmount = (value: unknown) => Math.abs(Number(value || 0))

const normalizeStatus = (value: unknown): AccountGenerationStatus => {
  const status = String(value || '').trim().toUpperCase()
  return ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'STOPPED'].includes(status)
    ? status as AccountGenerationStatus
    : 'PENDING'
}

const readGenerationRecordId = (pointLog: AccountGenerationPointLogInput) => {
  const directId = String(pointLog.sourceId || '').trim()
  if (directId) return directId
  if (!pointLog.metaJson || typeof pointLog.metaJson !== 'object' || Array.isArray(pointLog.metaJson)) return ''
  return String((pointLog.metaJson as Record<string, unknown>).generationRecordId || '').trim()
}

const isLocalNoCallResult = (url: unknown) => /^\/demo\/no-call\/[a-z0-9._/-]+$/i.test(String(url || '').trim())

export const buildAccountGenerationHistoryItems = (input: {
  records: AccountGenerationHistoryRecordInput[]
  pointLogs: AccountGenerationPointLogInput[]
}) => {
  const pointLogsByRecordId = new Map<string, AccountGenerationPointLogInput[]>()
  for (const pointLog of input.pointLogs) {
    const recordId = readGenerationRecordId(pointLog)
    if (!recordId) continue
    const grouped = pointLogsByRecordId.get(recordId) || []
    grouped.push(pointLog)
    pointLogsByRecordId.set(recordId, grouped)
  }

  return input.records.map((record) => {
    const status = normalizeStatus(record.status)
    const relatedPointLogs = pointLogsByRecordId.get(record.id) || []
    const pointCost = relatedPointLogs
      .filter((item) => String(item.changeType || '').toUpperCase() === 'CONSUME')
      .reduce((total, item) => total + normalizeAmount(item.changeAmount), 0)
    const refundedPoints = relatedPointLogs
      .filter((item) => String(item.changeType || '').toUpperCase() === 'REFUND')
      .reduce((total, item) => total + normalizeAmount(item.changeAmount), 0)
    const needsCompensation = pointCost > refundedPoints && ['FAILED', 'STOPPED'].includes(status)
    const refundStatus: AccountGenerationRefundStatus = pointCost <= 0
      ? 'NOT_REQUIRED'
      : refundedPoints >= pointCost
        ? 'REFUNDED'
        : needsCompensation
          ? 'PENDING_REFUND'
          : 'NONE'
    const compensationStatus: AccountGenerationCompensationStatus = refundStatus === 'REFUNDED'
      ? 'COMPLETED'
      : refundStatus === 'PENDING_REFUND'
        ? 'PENDING'
        : 'NONE'
    const outputs = Array.isArray(record.outputs) ? record.outputs : []
    const resultCount = outputs.filter((item) => ['IMAGE', 'VIDEO'].includes(String(item.outputType || '').toUpperCase())).length
    const hasLocalDemoResult = status === 'COMPLETED' && outputs.some((item) => isLocalNoCallResult(item.url))
    const inputSummary = [record.type, record.ratio, record.resolution, record.durationLabel]
      .map((value) => safeText(value, '', 48))
      .filter(Boolean)
      .join(' | ')

    return {
      id: record.id,
      safeTaskId: safeTaskId(record.id),
      type: safeText(record.type, 'GENERATION', 32).toUpperCase(),
      status,
      modelLabel: safeText(record.modelLabel || record.modelKey, 'Model unavailable', 80),
      promptSummary: safeText(record.prompt, 'No prompt summary available'),
      inputSummary: inputSummary || 'No input parameters available',
      errorSummary: ['FAILED', 'STOPPED'].includes(status)
        ? safeText(record.errorMessage, 'No additional error summary is available')
        : '',
      pointCost,
      refundedPoints,
      refundStatus,
      compensationStatus,
      resultCount,
      hasLocalDemoResult,
      createdAt: toIsoString(record.createdAt),
      startedAt: toIsoString(record.startedAt),
      finishedAt: toIsoString(record.finishedAt),
      timeline: [
        { key: 'CREATED', at: toIsoString(record.createdAt) },
        ...(record.startedAt ? [{ key: 'RUNNING', at: toIsoString(record.startedAt) }] : []),
        ...(record.finishedAt ? [{ key: status, at: toIsoString(record.finishedAt) }] : []),
      ],
    }
  })
}

export const listAccountGenerationHistory = async (currentUserId: string) => {
  const records = await prisma.generationRecord.findMany({
    where: { userId: currentUserId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      userId: true,
      type: true,
      status: true,
      prompt: true,
      modelLabel: true,
      modelKey: true,
      ratio: true,
      resolution: true,
      durationLabel: true,
      errorMessage: true,
      startedAt: true,
      finishedAt: true,
      createdAt: true,
      outputs: {
        select: {
          outputType: true,
          url: true,
        },
      },
    },
  })
  const pointLogs = await prisma.pointAccountLog.findMany({
    where: {
      userId: currentUserId,
      sourceType: 'GENERATION_CONSUME',
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      userId: true,
      sourceId: true,
      changeType: true,
      changeAmount: true,
      metaJson: true,
    },
  })

  return buildAccountGenerationHistoryItems({ records, pointLogs })
}
