import { Prisma } from '@prisma/client'
import { prisma } from '../db/prisma'
import { buildPageResult, resolvePagination } from '../shared/pagination'
import type { AdminGenerationRecordsQuery } from './shared'

type GenerationRefundStatus = 'UNKNOWN' | 'REFUNDED' | 'PENDING_REFUND' | 'NOT_REFUNDABLE'

interface GenerationPointAuditLogItem {
  id: string
  accountNo: string
  changeType: string
  action: string
  changeAmount: number
  balanceAfter: number
  availableAmount: number
  sourceId: string
  associationNo: string
  remark: string
  endpointType: string
  providerId: string
  modelKey: string
  modelName: string
  createdAt: string
}

interface GenerationPointAuditSummary {
  pointLogId: string
  pointAmount: number
  refundStatus: GenerationRefundStatus
  refundAmount: number
  isCompensable: boolean
  compensationSummary: string
  relatedPointLogs: GenerationPointAuditLogItem[]
}

// 后台生成记录输出关联，按排序返回图片、视频、文本等结果。
const buildRecordInclude = () => ({
  session: {
    select: {
      id: true,
      title: true,
    },
  },
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      avatarUrl: true,
    },
  },
  outputs: {
    orderBy: { sortOrder: 'asc' as const },
  },
  agentRun: {
    include: {
      steps: {
        orderBy: { sortOrder: 'asc' as const },
      },
      processSections: {
        orderBy: { sortOrder: 'asc' as const },
      },
    },
  },
})

// 数据库枚举值转换成前端展示使用的短横线格式。
const formatRecordType = (type: unknown) => {
  return String(type || '').toLowerCase().replaceAll('_', '-')
}

const readPointLogMeta = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {} as Record<string, unknown>
  }
  return value as Record<string, unknown>
}

const toIsoString = (value: unknown) => {
  if (value instanceof Date) {
    return value.toISOString()
  }
  return String(value || '')
}

const normalizeAuditAmount = (value: unknown) => Math.abs(Number(value || 0))

const isFailedOrStoppedRecord = (record: any) => {
  const status = String(record?.status || '').trim().toUpperCase()
  return status === 'FAILED' || status === 'STOPPED'
}

export const buildGenerationPointAuditMap = (input: {
  records: any[]
  pointLogs: any[]
}) => {
  const recordsById = new Map(input.records.map((record) => [String(record.id || '').trim(), record]))
  const groupedLogs = new Map<string, any[]>()

  for (const pointLog of input.pointLogs) {
    const generationRecordId = String(readPointLogMeta(pointLog.metaJson).generationRecordId || '').trim()
    if (!generationRecordId || !recordsById.has(generationRecordId)) {
      continue
    }
    const list = groupedLogs.get(generationRecordId) || []
    list.push(pointLog)
    groupedLogs.set(generationRecordId, list)
  }

  const auditMap = new Map<string, GenerationPointAuditSummary>()
  for (const [recordId, record] of recordsById.entries()) {
    const logs = groupedLogs.get(recordId) || []
    const consumeLogs = logs.filter((item) => String(item.changeType || '').toUpperCase() === 'CONSUME')
    const refundLogs = logs.filter((item) => String(item.changeType || '').toUpperCase() === 'REFUND')
    const pointAmount = consumeLogs.reduce((sum, item) => sum + normalizeAuditAmount(item.changeAmount), 0)
    const refundAmount = refundLogs.reduce((sum, item) => sum + normalizeAuditAmount(item.changeAmount), 0)
    const failedOrStopped = isFailedOrStoppedRecord(record)
    const refundStatus: GenerationRefundStatus = pointAmount <= 0
      ? 'NOT_REFUNDABLE'
      : refundAmount >= pointAmount
        ? 'REFUNDED'
        : failedOrStopped
          ? 'PENDING_REFUND'
          : 'NOT_REFUNDABLE'
    const isCompensable = Boolean(pointAmount > 0 && refundAmount <= 0 && failedOrStopped)
    const firstConsumeLog = consumeLogs[0]
    const relatedPointLogs = logs
      .slice()
      .sort((left, right) => toIsoString(left.createdAt).localeCompare(toIsoString(right.createdAt)))
      .map((item) => {
        const meta = readPointLogMeta(item.metaJson)
        return {
          id: String(item.id || '').trim(),
          accountNo: String(item.accountNo || '').trim(),
          changeType: String(item.changeType || '').trim(),
          action: String(item.action || '').trim(),
          changeAmount: Number(item.changeAmount || 0),
          balanceAfter: Number(item.balanceAfter || 0),
          availableAmount: Number(item.availableAmount || 0),
          sourceId: String(item.sourceId || '').trim(),
          associationNo: String(item.associationNo || '').trim(),
          remark: String(item.remark || '').trim(),
          endpointType: String(meta.endpointType || '').trim(),
          providerId: String(meta.providerId || '').trim(),
          modelKey: String(meta.modelKey || '').trim(),
          modelName: String(meta.modelName || '').trim(),
          createdAt: toIsoString(item.createdAt),
        }
      })

    auditMap.set(recordId, {
      pointLogId: String(firstConsumeLog?.id || '').trim(),
      pointAmount,
      refundStatus,
      refundAmount,
      isCompensable,
      compensationSummary: isCompensable
        ? 'PENDING_REFUND'
        : refundStatus === 'REFUNDED'
          ? 'REFUNDED'
          : refundStatus,
      relatedPointLogs,
    })
  }

  return auditMap
}

const buildGenerationPointAudits = async (records: any[]) => {
  const recordIds = records.map((record) => String(record.id || '').trim()).filter(Boolean)
  const userIds = Array.from(new Set(records.map((record) => String(record.userId || '').trim()).filter(Boolean)))
  if (!recordIds.length || !userIds.length) {
    return new Map<string, GenerationPointAuditSummary>()
  }

  const pointLogs = await prisma.pointAccountLog.findMany({
    where: {
      sourceType: 'GENERATION_CONSUME',
      userId: {
        in: userIds,
      },
    },
    orderBy: [
      { createdAt: 'desc' },
      { id: 'desc' },
    ],
  })

  return buildGenerationPointAuditMap({ records, pointLogs })
}

// 后台额外带上用户摘要，方便定位是哪位用户触发的生成任务。
const serializeAdminGenerationRecord = (record: any, pointAudit?: GenerationPointAuditSummary) => ({
  id: record.id,
  sessionId: record.sessionId,
  sessionTitle: record.session?.title || '',
  source: '',
  type: formatRecordType(record.type),
  prompt: record.prompt,
  content: record.content || '',
  error: record.errorMessage || '',
  model: record.modelLabel || '',
  modelKey: record.modelKey || '',
  ratio: record.ratio || '',
  resolution: record.resolution || '',
  duration: record.durationLabel || '',
  feature: record.feature || '',
  skill: record.skill || 'general',
  done: ['COMPLETED', 'FAILED', 'STOPPED'].includes(String(record.status || '')),
  stopped: record.status === 'STOPPED',
  agentTaskId: record.agentTaskId || undefined,
  createdAt: record.createdAt,
  user: {
    id: record.user?.id || '',
    name: record.user?.name || '',
    email: record.user?.email || '',
    phone: record.user?.phone || '',
    avatarUrl: record.user?.avatarUrl || '',
  },
  pointAudit: pointAudit || {
    pointLogId: '',
    pointAmount: 0,
    refundStatus: 'NOT_REFUNDABLE',
    refundAmount: 0,
    isCompensable: false,
    compensationSummary: 'NOT_REFUNDABLE',
    relatedPointLogs: [],
  },
  outputs: (record.outputs || []).map((output: any) => ({
    outputType: String(output.outputType || '').toLowerCase(),
    url: output.url || '',
    textContent: output.textContent || '',
    sortOrder: output.sortOrder || 0,
    metaJson: output.metaJson || null,
  })),
  images: (record.outputs || [])
    .filter((output: any) => output.outputType === 'IMAGE' && output.url)
    .map((output: any) => output.url),
  agentRun: record.agentRun
    ? {
        id: record.agentRun.id,
        query: record.agentRun.query,
        skill: record.agentRun.skill || 'general',
        status: String(record.agentRun.status || '').toLowerCase(),
        user: {
          name: record.agentRun.agentName || '',
          avatarSrc: record.agentRun.agentAvatarUrl || undefined,
        },
        indicator: {
          status: String(record.agentRun.indicatorStatus || '').toLowerCase(),
          title: record.agentRun.indicatorTitle || '',
          description: record.agentRun.indicatorDescription || '',
        },
        result: {
          title: record.agentRun.resultTitle || '',
          summary: record.agentRun.resultSummary || '',
          images: [],
          expectedImageCount: Number(record.agentRun.expectedImageCount || 0),
          outputVisible: Boolean(record.agentRun.outputVisible),
        },
        steps: (record.agentRun.steps || []).map((step: any) => ({
          id: step.stepKey,
          title: step.title,
          status: String(step.status || '').toLowerCase(),
          description: step.description || undefined,
        })),
        processSections: (record.agentRun.processSections || []).map((section: any) => ({
          key: section.sectionKey,
          kind: String(section.kind || '').toLowerCase(),
          label: section.label,
          paragraphs: Array.isArray(section.paragraphsJson) ? section.paragraphsJson : [],
          taskItems: Array.isArray(section.taskItemsJson) ? section.taskItemsJson : [],
        })),
      }
    : undefined,
})

// 构造后台生成记录筛选条件，尽量把关键词筛选下推数据库。
const buildRecordWhereInput = (query: AdminGenerationRecordsQuery): Prisma.GenerationRecordWhereInput => {
  const andConditions: Prisma.GenerationRecordWhereInput[] = []

  if (query.keyword) {
    andConditions.push({
      OR: [
        { prompt: { contains: query.keyword } },
        { content: { contains: query.keyword } },
        { skill: { contains: query.keyword } },
        { feature: { contains: query.keyword } },
        { agentTaskId: { contains: query.keyword } },
      ],
    })
  }

  if (query.userKeyword) {
    andConditions.push({
      user: {
        OR: [
          { name: { contains: query.userKeyword } },
          { email: { contains: query.userKeyword } },
          { phone: { contains: query.userKeyword } },
        ],
      },
    })
  }

  if (query.modelKeyword) {
    andConditions.push({
      OR: [
        { modelLabel: { contains: query.modelKeyword } },
        { modelKey: { contains: query.modelKeyword } },
      ],
    })
  }

  if (query.errorKeyword) {
    andConditions.push({
      errorMessage: { contains: query.errorKeyword },
    })
  }

  if (query.createdFrom) {
    andConditions.push({
      createdAt: {
        gte: query.createdFrom,
      },
    })
  }

  if (query.createdTo) {
    andConditions.push({
      createdAt: {
        lte: query.createdTo,
      },
    })
  }

  if (query.status === 'COMPLETED') {
    andConditions.push({ status: 'COMPLETED', errorMessage: null })
  } else if (query.status === 'FAILED') {
    andConditions.push({
      OR: [
        { status: 'FAILED' },
        { errorMessage: { not: null } },
      ],
    })
  } else if (query.status === 'RUNNING') {
    andConditions.push({
      status: {
        in: ['PENDING', 'RUNNING'],
      },
    })
  } else if (query.status === 'STOPPED') {
    andConditions.push({ status: 'STOPPED' })
  }

  if (query.type !== 'ALL') {
    if (query.type === 'RESEARCH') {
      andConditions.push({ id: '__no_research_generation_type__' })
    } else {
      andConditions.push({ type: query.type })
    }
  }

  return andConditions.length ? { AND: andConditions } : {}
}

// 分页查询全站生成记录，供后台排查生成链路问题。
export const listAdminGenerationRecords = async (query: AdminGenerationRecordsQuery) => {
  const where = buildRecordWhereInput(query)
  const refundStatus = String(query.refundStatus || 'ALL').trim().toUpperCase()
  if (refundStatus !== 'ALL') {
    const records = await prisma.generationRecord.findMany({
      where,
      include: buildRecordInclude(),
      orderBy: {
        createdAt: 'desc',
      },
    })
    const pointAuditMap = await buildGenerationPointAudits(records)
    const filteredRecords = records.filter((record) => {
      const audit = pointAuditMap.get(record.id)
      if (!audit) return refundStatus === 'NOT_REFUNDABLE'
      if (refundStatus === 'COMPENSABLE') return audit.isCompensable
      return audit.refundStatus === refundStatus
    })
    const pagination = resolvePagination(query, filteredRecords.length, {
      defaultPageSize: 10,
      maxPageSize: 100,
    })
    const pageRecords = filteredRecords.slice(pagination.skip, pagination.skip + pagination.pageSize)
    return buildPageResult(pageRecords.map((record) => serializeAdminGenerationRecord(record, pointAuditMap.get(record.id))), pagination)
  }

  const totalCount = await prisma.generationRecord.count({ where })
  const pagination = resolvePagination(query, totalCount, {
    defaultPageSize: 10,
    maxPageSize: 100,
  })
  const records = await prisma.generationRecord.findMany({
    where,
    include: buildRecordInclude(),
    orderBy: {
      createdAt: 'desc',
    },
    skip: pagination.skip,
    take: pagination.pageSize,
  })
  const pointAuditMap = await buildGenerationPointAudits(records)

  return buildPageResult(records.map((record) => serializeAdminGenerationRecord(record, pointAuditMap.get(record.id))), pagination)
}
