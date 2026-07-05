<template>
  <AdminPageContainer title="审计日志" description="查看后台关键操作的业务摘要、风险级别与只读变更对比。">
    <template #actions>
      <button class="admin-button admin-button--secondary" type="button" :disabled="loading" @click="loadLogs">
        {{ loading ? '刷新中...' : '刷新列表' }}
      </button>
    </template>

    <AdminFilterToolbar
      title="筛选条件"
      description="按操作人、操作类型、目标对象和时间范围定位后台审计记录。"
      :active-count="activeFilterCount"
      :disabled="loading"
      show-reset
      show-apply
      reset-label="清空筛选"
      apply-label="查询"
      @reset="handleResetFilters"
      @apply="resetAndLoad"
    >
      <template #search>
        <input v-model.trim="filters.operatorKeyword" class="admin-input admin-provider-toolbar__search" type="text" placeholder="搜索操作人姓名、邮箱、手机号">
      </template>
      <template #filters>
        <input v-model.trim="filters.action" class="admin-input" type="text" placeholder="操作类型">
        <input v-model.trim="filters.targetType" class="admin-input" type="text" placeholder="目标类型">
        <input v-model.trim="filters.targetId" class="admin-input" type="text" placeholder="目标 ID">
        <input v-model="filters.createdFrom" class="admin-input" type="datetime-local" title="开始时间">
        <input v-model="filters.createdTo" class="admin-input" type="datetime-local" title="结束时间">
      </template>
      <template #meta>
        <span class="admin-skill-toolbar__summary">共 {{ pagination.total }} 条记录</span>
      </template>
    </AdminFilterToolbar>

    <div class="admin-grid admin-grid--stats">
      <AdminStatCard label="命中记录" :value="pagination.total" hint="当前筛选条件下的审计日志数量" />
      <AdminStatCard label="当前页" :value="logs.length" hint="当前页已加载的操作记录" />
      <AdminStatCard label="业务模块" :value="moduleCount" hint="当前页涉及的业务模块数量" />
      <AdminStatCard label="高风险" :value="highRiskCount" hint="当前页高风险审计记录数量" />
    </div>

    <div class="admin-card">
      <div class="admin-card__header">
        <div>
          <h4 class="admin-card__title">业务审计记录</h4>
          <div class="admin-card__desc">列表展示派生业务摘要；详情仅展示脱敏后的 before / after 和来源信息。</div>
        </div>
      </div>
      <div class="admin-card__content">
        <div v-if="loading" class="admin-empty">正在加载审计日志...</div>
        <div v-else-if="logs.length === 0" class="admin-empty">当前筛选条件下没有审计日志。</div>
        <div v-else class="admin-audit-list">
          <div class="admin-audit-table-wrap">
            <table class="admin-audit-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>操作人</th>
                  <th>业务模块</th>
                  <th>操作类型</th>
                  <th>业务摘要</th>
                  <th>风险</th>
                  <th>对象</th>
                  <th>详情</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="log in logs" :key="log.id">
                  <tr class="admin-audit-table__row">
                    <td class="admin-audit-table__time">
                      <div class="admin-audit-time-stack">
                        <strong>{{ formatDatePart(log.createdAt) }}</strong>
                        <span>{{ formatTimePart(log.createdAt) }}</span>
                      </div>
                    </td>
                    <td>
                      <div class="admin-audit-principal">
                        <div class="admin-audit-principal__avatar">{{ formatOperatorInitial(log) }}</div>
                        <div class="admin-audit-principal__body">
                          <strong>{{ formatOperator(log) }}</strong>
                          <span>{{ log.operatorUserId }}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span class="admin-audit-module">{{ log.businessModule || '其他' }}</span>
                    </td>
                    <td>
                      <div class="admin-audit-action-cell">
                        <strong>{{ log.actionLabel || log.action }}</strong>
                        <span>{{ log.action }}</span>
                      </div>
                    </td>
                    <td>
                      <div class="admin-audit-summary">
                        <strong>{{ log.businessSummary || '暂无摘要' }}</strong>
                        <span v-if="log.changeSummary.length">{{ log.changeSummary[0] }}</span>
                      </div>
                    </td>
                    <td>
                      <span class="admin-audit-risk" :class="`is-${log.riskLevel.toLowerCase()}`">
                        {{ formatRiskLevel(log.riskLevel) }}
                      </span>
                    </td>
                    <td>
                      <div class="admin-audit-target">
                        <strong>{{ log.targetLabel || formatTargetLabel(log) }}</strong>
                        <span>{{ log.targetType }} / {{ log.targetId || '未记录' }}</span>
                      </div>
                    </td>
                    <td>
                      <button
                        class="admin-audit-detail-button"
                        type="button"
                        :class="{ 'is-active': isAuditExpanded(log.id) }"
                        @click="toggleAuditExpanded(log.id)"
                      >
                        {{ isAuditExpanded(log.id) ? '收起' : '查看' }}
                      </button>
                    </td>
                  </tr>
                  <tr v-if="isAuditExpanded(log.id)" class="admin-audit-table__detail-row">
                    <td colspan="8">
                      <div class="admin-audit-detail">
                        <header class="admin-audit-detail__head">
                          <div>
                            <strong>{{ log.businessSummary || '暂无摘要' }}</strong>
                            <span>{{ log.id }}</span>
                          </div>
                          <span class="admin-audit-risk" :class="`is-${log.riskLevel.toLowerCase()}`">
                            {{ formatRiskLevel(log.riskLevel) }}
                          </span>
                        </header>
                        <div class="admin-audit-detail__meta">
                          <span>IP: {{ log.ipAddress || '未记录' }}</span>
                          <span :title="log.userAgent">UA: {{ formatUserAgent(log.userAgent) }}</span>
                        </div>
                        <div v-if="log.changeSummary.length" class="admin-audit-change-list">
                          <strong>可读变更</strong>
                          <span v-for="item in log.changeSummary" :key="item">{{ item }}</span>
                        </div>
                        <div class="admin-audit-json-grid">
                          <section class="admin-audit-json">
                            <header>before</header>
                            <pre>{{ formatJsonPreview(log.beforeJsonPreview) }}</pre>
                          </section>
                          <section class="admin-audit-json">
                            <header>after</header>
                            <pre>{{ formatJsonPreview(log.afterJsonPreview) }}</pre>
                          </section>
                        </div>
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>

          <AdminPagination
            v-model:page="pagination.page"
            v-model:page-size="pagination.pageSize"
            :total="pagination.total"
            :disabled="loading"
            @change="handlePaginationChange"
          />
        </div>
      </div>
    </div>
  </AdminPageContainer>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import AdminFilterToolbar from '@/components/admin/common/AdminFilterToolbar.vue'
import AdminPagination from '@/components/admin/common/AdminPagination.vue'
import AdminStatCard from '@/components/admin/common/AdminStatCard.vue'
import AdminPageContainer from '@/components/admin/layout/AdminPageContainer.vue'
import { useAdminList } from '@/composables/admin/useAdminList'
import {
  listAdminAuditLogs,
  type AdminAuditLogItem,
  type ListAdminAuditLogsOptions,
} from '@/api/admin-audit-logs'

const filterDefaults: ListAdminAuditLogsOptions = {
  action: '',
  targetType: '',
  targetId: '',
  operatorKeyword: '',
  createdFrom: '',
  createdTo: '',
}

const filters = reactive<ListAdminAuditLogsOptions>({ ...filterDefaults })
const expandedAuditIds = ref<Set<string>>(new Set())

const {
  loading,
  items: logs,
  pagination,
  loadList: loadLogs,
  resetAndLoad,
  handlePaginationChange,
} = useAdminList<AdminAuditLogItem>({
  initialPageSize: 20,
  fetcher: ({ page, pageSize }) => listAdminAuditLogs({
    ...filters,
    page,
    pageSize,
  }),
})

const moduleCount = computed(() => new Set(logs.value.map(log => log.businessModule || '其他')).size)
const highRiskCount = computed(() => logs.value.filter(log => log.riskLevel === 'HIGH').length)
const activeFilterCount = computed(() => {
  return [
    filters.action,
    filters.targetType,
    filters.targetId,
    filters.operatorKeyword,
    filters.createdFrom,
    filters.createdTo,
  ].filter(value => String(value || '').trim()).length
})

const handleResetFilters = () => {
  Object.assign(filters, filterDefaults)
  expandedAuditIds.value = new Set()
  resetAndLoad()
}

const isAuditExpanded = (id: string) => expandedAuditIds.value.has(id)

const toggleAuditExpanded = (id: string) => {
  const nextIds = new Set(expandedAuditIds.value)
  if (nextIds.has(id)) {
    nextIds.delete(id)
  } else {
    nextIds.add(id)
  }
  expandedAuditIds.value = nextIds
}

const formatDate = (value: string) => String(value || '').replace('T', ' ').slice(0, 19) || '未知时间'

const formatDatePart = (value: string) => {
  const normalized = formatDate(value)
  return normalized.includes(' ') ? normalized.split(' ')[0] : normalized
}

const formatTimePart = (value: string) => {
  const normalized = formatDate(value)
  return normalized.includes(' ') ? normalized.split(' ')[1] : ''
}

const formatOperator = (log: AdminAuditLogItem) => {
  const operator = log.operator
  if (!operator) {
    return log.operatorUserId || '未知操作人'
  }

  return operator.name || operator.username || operator.email || operator.phone || operator.id
}

const formatOperatorInitial = (log: AdminAuditLogItem) => {
  const value = formatOperator(log).trim()
  return value ? value.slice(0, 1).toUpperCase() : '?'
}

const formatTargetLabel = (log: AdminAuditLogItem) => {
  return log.targetId ? `${log.targetType} ${log.targetId}` : log.targetType || '未记录'
}

const formatRiskLevel = (value: string) => {
  if (value === 'HIGH') return '高'
  if (value === 'MEDIUM') return '中'
  return '低'
}

const formatUserAgent = (value: string) => {
  const text = String(value || '').trim()
  if (!text) {
    return '未记录'
  }

  return text.length > 96 ? `${text.slice(0, 96)}...` : text
}

const formatJsonPreview = (value: string | null) => {
  if (!value) {
    return '无'
  }

  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}

onMounted(() => {
  void loadLogs()
})
</script>

<style scoped>
.admin-audit-list {
  display: grid;
  gap: 14px;
}

.admin-audit-table-wrap {
  min-width: 0;
  overflow-x: auto;
  border: 1px solid var(--line-divider, rgba(0, 0, 0, 0.08));
  border-radius: 8px;
  background: var(--bg-surface);
}

.admin-audit-table {
  width: 100%;
  min-width: 1240px;
  border-collapse: collapse;
  table-layout: fixed;
}

.admin-audit-table th,
.admin-audit-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--line-divider, rgba(0, 0, 0, 0.08));
  text-align: left;
  vertical-align: middle;
}

.admin-audit-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  height: 36px;
  background: var(--bg-surface);
  color: var(--text-tertiary);
  font-size: 11px;
  font-weight: 800;
}

.admin-audit-table th:nth-child(1) { width: 132px; }
.admin-audit-table th:nth-child(2) { width: 220px; }
.admin-audit-table th:nth-child(3) { width: 116px; }
.admin-audit-table th:nth-child(4) { width: 180px; }
.admin-audit-table th:nth-child(5) { width: 300px; }
.admin-audit-table th:nth-child(6) { width: 88px; }
.admin-audit-table th:nth-child(7) { width: 170px; }
.admin-audit-table th:nth-child(8) { width: 84px; }

.admin-audit-table__row:hover td {
  background: var(--bg-block-secondary-default);
}

.admin-audit-time-stack,
.admin-audit-action-cell,
.admin-audit-summary,
.admin-audit-target {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.admin-audit-time-stack strong,
.admin-audit-action-cell strong,
.admin-audit-summary strong,
.admin-audit-target strong {
  min-width: 0;
  color: var(--text-primary);
  font-size: 12px;
  line-height: 1.45;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-audit-time-stack span,
.admin-audit-action-cell span,
.admin-audit-summary span,
.admin-audit-target span,
.admin-audit-principal__body span {
  min-width: 0;
  color: var(--text-tertiary);
  font-size: 11px;
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-audit-principal {
  min-width: 0;
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  align-items: center;
  gap: 9px;
}

.admin-audit-principal__avatar {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--brand-main-block-default);
  color: var(--brand-main-default);
  font-size: 12px;
  font-weight: 800;
}

.admin-audit-principal__body {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.admin-audit-principal__body strong {
  min-width: 0;
  color: var(--text-primary);
  font-size: 12px;
  line-height: 1.45;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-audit-module,
.admin-audit-risk {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  min-height: 24px;
  padding: 0 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}

.admin-audit-module {
  background: var(--brand-main-block-default);
  color: var(--brand-main-default);
}

.admin-audit-risk.is-low {
  background: rgba(20, 184, 166, 0.12);
  color: #0f766e;
}

.admin-audit-risk.is-medium {
  background: rgba(245, 158, 11, 0.14);
  color: #b45309;
}

.admin-audit-risk.is-high {
  background: rgba(239, 68, 68, 0.14);
  color: #b91c1c;
}

.admin-audit-detail-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  padding: 0 12px;
  border: 1px solid var(--line-divider, rgba(0, 0, 0, 0.08));
  border-radius: 999px;
  background: var(--bg-block-secondary-default);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
}

.admin-audit-detail-button:hover,
.admin-audit-detail-button.is-active {
  background: var(--bg-block-secondary-hover);
  border-color: var(--brand-main-default);
  color: var(--brand-main-default);
}

.admin-audit-table__detail-row > td {
  padding: 0;
  background: var(--bg-block-secondary-default);
  vertical-align: top;
}

.admin-audit-detail {
  min-width: 0;
}

.admin-audit-detail__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 46px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--line-divider, rgba(0, 0, 0, 0.08));
}

.admin-audit-detail__head > div {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.admin-audit-detail__head strong {
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.45;
}

.admin-audit-detail__head span,
.admin-audit-detail__meta,
.admin-audit-change-list span {
  color: var(--text-tertiary);
  font-size: 11px;
  line-height: 1.5;
}

.admin-audit-detail__meta,
.admin-audit-change-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--line-divider, rgba(0, 0, 0, 0.08));
}

.admin-audit-change-list {
  display: grid;
  gap: 6px;
}

.admin-audit-change-list strong {
  color: var(--text-secondary);
  font-size: 12px;
}

.admin-audit-json-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.admin-audit-json {
  min-width: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  background: var(--bg-surface);
}

.admin-audit-json + .admin-audit-json {
  border-left: 1px solid var(--line-divider, rgba(0, 0, 0, 0.08));
}

.admin-audit-json header {
  padding: 10px 12px;
  border-bottom: 1px solid var(--line-divider, rgba(0, 0, 0, 0.08));
  color: var(--text-tertiary);
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
}

.admin-audit-json pre {
  max-height: 240px;
  margin: 0;
  padding: 12px;
  overflow: auto;
  color: var(--text-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

:global(html[data-theme='dark']) .admin-audit-table-wrap,
:global(body[lv-theme='dark']) .admin-audit-table-wrap,
:global(html[data-theme='dark']) .admin-audit-table th,
:global(body[lv-theme='dark']) .admin-audit-table th,
:global(html[data-theme='dark']) .admin-audit-table td,
:global(body[lv-theme='dark']) .admin-audit-table td,
:global(html[data-theme='dark']) .admin-audit-detail-button,
:global(body[lv-theme='dark']) .admin-audit-detail-button,
:global(html[data-theme='dark']) .admin-audit-detail__head,
:global(body[lv-theme='dark']) .admin-audit-detail__head,
:global(html[data-theme='dark']) .admin-audit-detail__meta,
:global(body[lv-theme='dark']) .admin-audit-detail__meta,
:global(html[data-theme='dark']) .admin-audit-change-list,
:global(body[lv-theme='dark']) .admin-audit-change-list,
:global(html[data-theme='dark']) .admin-audit-json + .admin-audit-json,
:global(body[lv-theme='dark']) .admin-audit-json + .admin-audit-json,
:global(html[data-theme='dark']) .admin-audit-json header,
:global(body[lv-theme='dark']) .admin-audit-json header {
  border-color: rgba(224, 245, 255, 0.12);
}

:global(html[data-theme='dark']) .admin-audit-table th,
:global(body[lv-theme='dark']) .admin-audit-table th,
:global(html[data-theme='dark']) .admin-audit-json,
:global(body[lv-theme='dark']) .admin-audit-json {
  background: #15161a;
}

:global(html[data-theme='dark']) .admin-audit-table__row:hover td,
:global(body[lv-theme='dark']) .admin-audit-table__row:hover td,
:global(html[data-theme='dark']) .admin-audit-table__detail-row > td,
:global(body[lv-theme='dark']) .admin-audit-table__detail-row > td {
  background: rgba(204, 221, 255, 0.05);
}

@media (max-width: 760px) {
  .admin-audit-table {
    min-width: 1080px;
  }

  .admin-audit-detail__head {
    align-items: flex-start;
    flex-direction: column;
  }

  .admin-audit-json-grid {
    grid-template-columns: 1fr;
  }

  .admin-audit-json + .admin-audit-json {
    border-left: none;
    border-top: 1px solid var(--line-divider, rgba(0, 0, 0, 0.08));
  }
}
</style>
