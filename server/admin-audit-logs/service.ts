import type { Prisma } from '@prisma/client'
import prisma from '../db/prisma'
import { buildPageResult, resolvePagination } from '../shared/pagination'
import type { ListAdminAuditLogsOptions } from './shared'

type AdminAuditBusinessViewInput = {
  id: string
  action: string
  targetType: string
  targetId?: string | null
  beforeJson?: unknown
  afterJson?: unknown
}

const SENSITIVE_AUDIT_KEY_PATTERN = /(rawPayloadJson|api.?key|access.?key|secret|token|password|cookie|authorization|signature|private.?key|certificate|signed.?url|base64|credential|encrypted)/i
const MAX_JSON_PREVIEW_LENGTH = 1200

const normalizeDate = (value?: string) => {
  const rawValue = String(value || '').trim()
  if (!rawValue) {
    return null
  }

  const date = new Date(rawValue)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return date
}

const findOperatorIdsByKeyword = async (keyword: string) => {
  const normalizedKeyword = String(keyword || '').trim()
  if (!normalizedKeyword) {
    return null
  }

  const users = await prisma.appUser.findMany({
    where: {
      OR: [
        { id: normalizedKeyword },
        { username: { contains: normalizedKeyword } },
        { name: { contains: normalizedKeyword } },
        { email: { contains: normalizedKeyword } },
        { phone: { contains: normalizedKeyword } },
      ],
    },
    select: {
      id: true,
    },
    take: 100,
  })

  return users.map(user => user.id)
}

const buildAdminAuditLogWhere = async (options: ListAdminAuditLogsOptions): Promise<Prisma.AdminAuditLogWhereInput> => {
  const where: Prisma.AdminAuditLogWhereInput = {}
  const action = String(options.action || '').trim()
  const targetType = String(options.targetType || '').trim()
  const targetId = String(options.targetId || '').trim()
  const createdFrom = normalizeDate(options.createdFrom)
  const createdTo = normalizeDate(options.createdTo)
  const operatorIds = await findOperatorIdsByKeyword(String(options.operatorKeyword || '').trim())

  if (action) {
    where.action = { contains: action }
  }

  if (targetType) {
    where.targetType = { contains: targetType }
  }

  if (targetId) {
    where.targetId = { contains: targetId }
  }

  if (createdFrom || createdTo) {
    where.createdAt = {
      ...(createdFrom ? { gte: createdFrom } : {}),
      ...(createdTo ? { lte: createdTo } : {}),
    }
  }

  if (operatorIds) {
    where.operatorUserId = operatorIds.length ? { in: operatorIds } : '__NO_MATCH__'
  }

  return where
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)
}

const sanitizeAuditDisplayValue = (value: unknown): unknown => {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value === 'bigint') {
    return Number(value)
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (Array.isArray(value)) {
    return value.map(item => sanitizeAuditDisplayValue(item))
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    const safeEntries = entries
      .filter(([key]) => !SENSITIVE_AUDIT_KEY_PATTERN.test(key))
      .map(([key, item]) => [key, sanitizeAuditDisplayValue(item)])

    return {
      ...Object.fromEntries(safeEntries),
      ...(safeEntries.length < entries.length ? { redactedFields: entries.length - safeEntries.length } : {}),
    }
  }

  return value
}

const serializeAuditJsonPreview = (value: unknown) => {
  const safeValue = sanitizeAuditDisplayValue(value)
  if (safeValue === null || safeValue === undefined) {
    return null
  }

  const text = JSON.stringify(safeValue)
  if (!text) {
    return null
  }

  return text.length > MAX_JSON_PREVIEW_LENGTH ? `${text.slice(0, MAX_JSON_PREVIEW_LENGTH)}...` : text
}

const readPath = (value: unknown, path: string[]) => {
  let current = value
  for (const key of path) {
    if (!isPlainRecord(current)) {
      return undefined
    }
    current = current[key]
  }
  return current
}

const formatCompactValue = (value: unknown) => {
  const safeValue = sanitizeAuditDisplayValue(value)
  if (safeValue === null || safeValue === undefined || safeValue === '') {
    return 'empty'
  }
  if (typeof safeValue === 'string' || typeof safeValue === 'number' || typeof safeValue === 'boolean') {
    const text = String(safeValue)
    return text.length > 80 ? `${text.slice(0, 80)}...` : text
  }
  return '[object]'
}

const buildChangeSummary = (beforeJson: unknown, afterJson: unknown) => {
  if (!isPlainRecord(beforeJson) || !isPlainRecord(afterJson)) {
    return []
  }

  const keys = Array.from(new Set([...Object.keys(beforeJson), ...Object.keys(afterJson)]))
    .filter(key => !SENSITIVE_AUDIT_KEY_PATTERN.test(key))
    .slice(0, 8)

  return keys
    .filter(key => JSON.stringify(sanitizeAuditDisplayValue(beforeJson[key])) !== JSON.stringify(sanitizeAuditDisplayValue(afterJson[key])))
    .map(key => `${key}: ${formatCompactValue(beforeJson[key])} -> ${formatCompactValue(afterJson[key])}`)
}

const resolveBusinessModule = (action: string, targetType: string) => {
  if (action.includes('points') || targetType.includes('point')) return '积分调整'
  if (action.includes('membership')) return '会员权益'
  if (action.includes('order')) return '订单'
  if (action.includes('payment')) return '支付交易'
  if (action.includes('generation')) return '生成任务'
  if (targetType === 'app_user' || action.includes('user')) return '用户管理'
  if (targetType.includes('provider') || targetType.includes('model')) return 'AI 配置'
  if (targetType.includes('storage')) return '存储配置'
  if (targetType.includes('redis') || targetType.includes('system') || targetType.includes('conversation') || targetType.includes('skill')) return '系统配置'
  return '其他'
}

const resolveActionLabel = (action: string) => {
  const actionLabels: Record<string, string> = {
    admin_user_create: '创建用户',
    admin_user_role_update: '更新用户角色',
    admin_user_status_update: '更新用户状态',
    admin_user_profile_update: '更新用户资料',
    admin_user_points_adjust: '手动调整积分',
    admin_user_membership_grant: '手动调整会员权益',
    admin_user_reset_login_state: '重置登录状态',
    admin_user_delete: '删除用户',
    admin_generation_points_compensate: '生成任务积分补偿',
    admin_provider_create: '创建 AI 厂商',
    admin_provider_update: '更新 AI 厂商',
    admin_provider_delete: '删除 AI 厂商',
    admin_provider_model_create: '创建 AI 模型',
    admin_provider_model_batch_upsert: '批量保存 AI 模型',
    admin_provider_model_update: '更新 AI 模型',
    admin_provider_model_delete: '删除 AI 模型',
    admin_storage_config_create: '创建存储配置',
    admin_storage_config_update: '更新存储配置',
    admin_storage_config_activate: '启用存储配置',
    admin_system_config_update: '更新系统配置',
    admin_system_config_section_update: '更新系统配置分区',
    admin_redis_settings_update: '更新 Redis 设置',
    admin_redis_clear: '清理 Redis 缓存',
    admin_skill_create: '创建技能配置',
    admin_skill_update: '更新技能配置',
    admin_skill_enabled_update: '切换技能启用状态',
    admin_skill_delete: '删除技能配置',
    admin_conversation_settings_update: '更新会话配置',
  }

  return actionLabels[action] || action || '未知操作'
}

const resolveRiskLevel = (action: string, targetType: string) => {
  const text = `${action} ${targetType}`.toLowerCase()
  if (/(delete|clear|provider|storage|system_config|redis|credential)/.test(text)) {
    return 'HIGH'
  }
  if (/(points_adjust|membership|compensate|role_update|status_update|config|skill)/.test(text)) {
    return 'MEDIUM'
  }
  return 'LOW'
}

const buildTargetLabel = (targetType: string, targetId?: string | null) => {
  const typeLabels: Record<string, string> = {
    app_user: '用户',
    point_account_log: '积分流水',
    ai_provider: 'AI 厂商',
    ai_model: 'AI 模型',
    object_storage_config: '存储配置',
    system_config: '系统配置',
    redis_settings: 'Redis 设置',
    redis_cache: 'Redis 缓存',
    skill_definition: '技能配置',
    conversation_settings: '会话配置',
  }
  const label = typeLabels[targetType] || targetType || '对象'
  return targetId ? `${label} ${targetId}` : label
}

const buildBusinessSummary = (input: AdminAuditBusinessViewInput, actionLabel: string, moduleLabel: string) => {
  const action = String(input.action || '')
  const target = buildTargetLabel(String(input.targetType || ''), input.targetId)

  if (action === 'admin_user_points_adjust') {
    const requestAction = String(readPath(input.beforeJson, ['request', 'action']) || '')
    const changeAmount = readPath(input.beforeJson, ['request', 'changeAmount'])
    const remark = String(readPath(input.beforeJson, ['request', 'remark']) || '').trim()
    const direction = requestAction === 'DECREASE' ? '扣减' : '增加'
    const amountText = Number(changeAmount) > 0 ? `${Number(changeAmount)} 积分` : '积分'
    return `管理员为 ${target} ${direction} ${amountText}${remark ? `，原因：${remark}` : ''}`
  }

  if (action === 'admin_user_membership_grant') {
    const levelId = String(readPath(input.beforeJson, ['request', 'levelId']) || readPath(input.afterJson, ['levelId']) || '').trim()
    return `管理员调整 ${target} 的会员权益${levelId ? `，会员等级：${levelId}` : ''}`
  }

  if (action === 'admin_user_status_update') {
    const beforeStatus = readPath(input.beforeJson, ['status'])
    const afterStatus = readPath(input.afterJson, ['status'])
    return `管理员将 ${target} 状态从 ${formatCompactValue(beforeStatus)} 改为 ${formatCompactValue(afterStatus)}`
  }

  if (action === 'admin_generation_points_compensate') {
    return `管理员记录生成任务积分补偿，关联对象：${target}`
  }

  if (action.includes('delete')) {
    return `管理员执行删除操作：${target}`
  }

  if (moduleLabel === '系统配置') {
    return `管理员${actionLabel}：${target}`
  }

  return `${actionLabel}：${target}`
}

export const buildAdminAuditBusinessView = (input: AdminAuditBusinessViewInput) => {
  const action = String(input.action || '').trim()
  const targetType = String(input.targetType || '').trim()
  const businessModule = resolveBusinessModule(action, targetType)
  const actionLabel = resolveActionLabel(action)
  const riskLevel = resolveRiskLevel(action, targetType)

  return {
    businessModule,
    actionLabel,
    businessSummary: buildBusinessSummary(input, actionLabel, businessModule),
    targetLabel: buildTargetLabel(targetType, input.targetId),
    riskLevel,
    changeSummary: buildChangeSummary(input.beforeJson, input.afterJson),
    beforeJsonPreview: serializeAuditJsonPreview(input.beforeJson),
    afterJsonPreview: serializeAuditJsonPreview(input.afterJson),
  }
}

export const listAdminAuditLogs = async (options: ListAdminAuditLogsOptions = {}) => {
  const where = await buildAdminAuditLogWhere(options)
  const totalCount = await prisma.adminAuditLog.count({ where })
  const pagination = resolvePagination({
    page: options.page || 1,
    pageSize: options.pageSize || 20,
  }, totalCount, {
    defaultPageSize: 20,
    maxPageSize: 100,
  })

  const logs = await prisma.adminAuditLog.findMany({
    where,
    orderBy: [
      { createdAt: 'desc' },
      { id: 'desc' },
    ],
    skip: pagination.skip,
    take: pagination.pageSize,
  })

  const operatorIds = Array.from(new Set(logs.map(log => log.operatorUserId).filter(Boolean)))
  const operators = operatorIds.length
    ? await prisma.appUser.findMany({
        where: { id: { in: operatorIds } },
        select: {
          id: true,
          username: true,
          name: true,
          email: true,
          phone: true,
          avatarUrl: true,
          role: true,
        },
      })
    : []
  const operatorMap = new Map(operators.map(operator => [operator.id, operator]))

  return buildPageResult(logs.map(log => {
    const operator = operatorMap.get(log.operatorUserId) || null
    const businessView = buildAdminAuditBusinessView({
      id: log.id,
      action: log.action,
      targetType: log.targetType,
      targetId: log.targetId,
      beforeJson: log.beforeJson,
      afterJson: log.afterJson,
    })
    return {
      id: log.id,
      operatorUserId: log.operatorUserId,
      operator: operator
        ? {
            id: operator.id,
            username: operator.username || '',
            name: operator.name || '',
            email: operator.email || '',
            phone: operator.phone || '',
            avatarUrl: operator.avatarUrl || '',
            role: operator.role,
          }
        : null,
      action: log.action,
      targetType: log.targetType,
      targetId: log.targetId || '',
      businessModule: businessView.businessModule,
      actionLabel: businessView.actionLabel,
      businessSummary: businessView.businessSummary,
      targetLabel: businessView.targetLabel,
      riskLevel: businessView.riskLevel,
      changeSummary: businessView.changeSummary,
      beforeJsonPreview: businessView.beforeJsonPreview,
      afterJsonPreview: businessView.afterJsonPreview,
      ipAddress: log.ipAddress || '',
      userAgent: log.userAgent || '',
      createdAt: log.createdAt.toISOString(),
    }
  }), pagination)
}

export const __adminAuditLogTestHooks = {
  buildAdminAuditBusinessView,
  sanitizeAuditDisplayValue,
}
