<template>
  <AdminPageContainer title="生成记录" description="先打通生成记录后台列表、状态筛选、结果预览和错误排查，便于定位线上生成链路问题。">
    <template #actions>
      <button class="admin-button admin-button--secondary" type="button" @click="loadRecords" :disabled="loading">
        {{ loading ? '刷新中...' : '刷新列表' }}
      </button>
    </template>

    <AdminFilterToolbar
      title="筛选条件"
      description="当前展示全站生成记录，筛选与分页均由服务端完成。"
      :active-count="activeFilterCount"
      :disabled="loading"
      collapsible
      show-reset
      show-apply
      @apply="applyFilters"
      @reset="resetFilters"
    >
      <template #search>
        <div class="admin-generation-audit-search">
          <input v-model.trim="filters.keyword" class="admin-input" type="text" placeholder="Search task or prompt">
          <input v-model.trim="filters.userKeyword" class="admin-input" type="text" placeholder="Search user">
          <input v-model="filters.createdFrom" class="admin-input" type="date" title="From">
          <input v-model="filters.createdTo" class="admin-input" type="date" title="To">
        </div>
      </template>
      <template #filters>
        <div class="admin-generation-audit-filters">
          <AdminFilterChips :groups="filterChipGroups" compact @select="handleChipSelect" />
          <label class="admin-generation-audit-field">
            <span>Refund status</span>
            <select v-model="filters.refundStatus" class="admin-input" @change="applyFilters">
              <option v-for="option in refundStatusOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
        </div>
      </template>
      <template #meta>
        <span class="admin-skill-toolbar__summary">共 {{ pagination.total }} 条记录</span>
      </template>
    </AdminFilterToolbar>

    <div class="admin-grid admin-grid--stats">
      <AdminStatCard label="记录总数" :value="pagination.total" hint="当前筛选条件命中的全站记录数" />
      <AdminStatCard label="当前页" :value="records.length" hint="当前页加载的生成记录数" />
      <AdminStatCard label="成功完成" :value="completedCount" hint="当前页已完成且无错误的记录数" />
      <AdminStatCard label="失败记录" :value="failedCount" hint="当前页优先用于排查厂商、落盘和入库问题" />
    </div>

    <div class="admin-card">
      <div class="admin-card__header">
        <div>
          <h4 class="admin-card__title">记录列表</h4>
          <div class="admin-card__desc">展示 prompt、模型、生成状态、结果图与错误信息，帮助后台快速排查生成链路。</div>
        </div>
      </div>
      <div class="admin-card__content">
        <div v-if="loading" class="admin-empty">正在加载生成记录...</div>
        <div v-else-if="records.length === 0" class="admin-empty">当前筛选条件下还没有生成记录。</div>
        <div v-else class="admin-generation-list">
          <div v-for="record in records" :key="record.id" class="admin-generation-card">
            <div class="admin-generation-card__preview">
              <img
                v-if="getPreviewUrl(record)"
                :src="getPreviewUrl(record) || ''"
                :alt="record.prompt || '生成结果预览'"
                class="admin-generation-card__image"
              >
              <div v-else class="admin-generation-card__image admin-generation-card__image--empty">
                无结果预览
              </div>
            </div>

            <div class="admin-generation-card__body">
              <div class="admin-generation-card__head">
                <div>
                  <div class="admin-generation-card__title">{{ buildRecordTitle(record) }}</div>
                  <div class="admin-generation-card__meta">
                    用户：{{ record.user?.name || record.user?.email || record.user?.phone || '未知用户' }} · 类型：{{ record.type || 'unknown' }} · 创建于 {{ formatDate(record.createdAt) }}
                  </div>
                </div>
                <div class="admin-generation-card__tags">
                  <AdminStatusBadge category="generationStatus" :value="getRecordStatus(record)" />
                  <span class="admin-chip">模型：{{ record.model || record.modelKey || '未记录' }}</span>
                </div>
              </div>

              <div class="admin-generation-card__prompt">
                {{ record.prompt || '暂无提示词' }}
              </div>

              <div class="admin-generation-card__stats">
                <span>比例：{{ record.ratio || '未记录' }}</span>
                <span>分辨率：{{ record.resolution || '未记录' }}</span>
                <span>功能：{{ record.feature || '未记录' }}</span>
                <span>技能：{{ record.skill || '未记录' }}</span>
                <span>输出数：{{ record.outputs.length || record.images.length }}</span>
              </div>

              <div v-if="record.error" class="admin-generation-card__error">
                <strong>错误信息：</strong>{{ formatGenerationError(record.error, '任务执行失败') }}
              </div>

              <div v-else-if="record.content && record.type === 'agent'" class="admin-generation-card__content-preview">
                <strong>文本结果：</strong>{{ record.content }}
              </div>

              <div class="admin-generation-audit-panel">
                <div class="admin-generation-audit-panel__item">
                  <span>Point cost</span>
                  <strong>{{ formatPointAmount(record.pointAudit?.pointAmount) }}</strong>
                  <small>Logs {{ record.pointAudit?.relatedPointLogs.length || 0 }}</small>
                </div>
                <div class="admin-generation-audit-panel__item">
                  <span>Refund status</span>
                  <strong :class="getRefundStatusClass(record.pointAudit?.refundStatus, record.pointAudit?.isCompensable)">
                    {{ formatRefundStatus(record.pointAudit?.refundStatus, record.pointAudit?.isCompensable) }}
                  </strong>
                  <small>Refunded {{ formatPointAmount(record.pointAudit?.refundAmount) }}</small>
                </div>
                <div class="admin-generation-audit-panel__item">
                  <span>Review note</span>
                  <strong>{{ formatCompensationSummary(record.pointAudit?.compensationSummary) }}</strong>
                  <small>{{ record.pointAudit?.pointLogId ? `Consume log ${record.pointAudit.pointLogId}` : 'No consume log' }}</small>
                </div>
              </div>

              <div class="admin-generation-card__footer">
                <div class="admin-generation-card__meta">
                  任务 ID：{{ record.agentTaskId || '未记录' }}
                </div>
                <div class="admin-generation-card__meta admin-generation-card__footer-actions">
                  {{ buildOutputSummary(record) }}
                  <button class="admin-inline-button" type="button" @click="openReadonlyDetail(record)">View details</button>
                </div>
              </div>
            </div>
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
    <div v-if="detailRecord" class="admin-dialog-mask" @click.self="closeReadonlyDetail">
      <div class="admin-dialog admin-generation-audit-dialog">
        <div class="admin-dialog__header">
          <div>
            <h4 class="admin-dialog__title">Failed task readonly detail</h4>
            <p class="admin-dialog__desc">Read-only audit for task, point logs, and refund status. No retry or compensation action is available here.</p>
          </div>
          <button class="admin-icon-button" type="button" @click="closeReadonlyDetail">x</button>
        </div>
        <div class="admin-dialog__body">
          <div class="admin-generation-audit-detail-grid">
            <section>
              <span>Task ID</span>
              <strong>{{ detailRecord.id }}</strong>
            </section>
            <section>
              <span>User</span>
              <strong>{{ detailRecord.user?.name || detailRecord.user?.email || detailRecord.user?.phone || detailRecord.user?.id || 'Unknown' }}</strong>
            </section>
            <section>
              <span>Status</span>
              <strong>{{ getRecordStatus(detailRecord) }}</strong>
            </section>
            <section>
              <span>Refund status</span>
              <strong>{{ formatRefundStatus(detailRecord.pointAudit?.refundStatus, detailRecord.pointAudit?.isCompensable) }}</strong>
            </section>
          </div>

          <div class="admin-generation-audit-detail-section">
            <h5>Error</h5>
            <p>{{ formatGenerationError(detailRecord.error, 'No error message') }}</p>
          </div>

          <div class="admin-generation-audit-detail-section">
            <h5>Related point logs</h5>
            <div v-if="!detailRecord.pointAudit?.relatedPointLogs.length" class="admin-empty">No related point logs.</div>
            <div v-else class="admin-generation-audit-log-list">
              <div v-for="log in detailRecord.pointAudit.relatedPointLogs" :key="log.id" class="admin-generation-audit-log">
                <strong>{{ log.changeType }} {{ log.changeAmount }}</strong>
                <span>{{ log.accountNo }} · {{ log.associationNo || log.sourceId || '-' }}</span>
                <small>{{ formatDate(log.createdAt) }} · {{ log.modelName || log.modelKey || '-' }}</small>
              </div>
            </div>
          </div>

          <div class="admin-generation-audit-detail-section">
            <h5>Manual review note</h5>
            <p>{{ formatCompensationSummary(detailRecord.pointAudit?.compensationSummary) }}</p>
          </div>
        </div>
      </div>
    </div>
  </AdminPageContainer>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import AdminFilterChips, { type AdminFilterChipGroup } from '@/components/admin/common/AdminFilterChips.vue'
import AdminFilterToolbar from '@/components/admin/common/AdminFilterToolbar.vue'
import AdminPagination from '@/components/admin/common/AdminPagination.vue'
import AdminStatCard from '@/components/admin/common/AdminStatCard.vue'
import AdminStatusBadge from '@/components/admin/common/AdminStatusBadge.vue'
import AdminPageContainer from '@/components/admin/layout/AdminPageContainer.vue'
import { useAdminList } from '@/composables/admin/useAdminList'
import { resolveAdminDictionaryItem } from '@/config/adminDictionaries'
import {
  listAdminGenerationRecords,
  type AdminGenerationRecordItem,
  type AdminGenerationRefundStatusFilter,
  type AdminGenerationRecordStatusFilter,
  type AdminGenerationRecordTypeFilter,
} from '@/api/admin-generation-records'
import { normalizeGenerationErrorMessage } from '@/shared/generation-error'

type GenerationStatusFilter = AdminGenerationRecordStatusFilter
type GenerationTypeFilter = AdminGenerationRecordTypeFilter
type GenerationRefundStatusFilter = AdminGenerationRefundStatusFilter

const formatGenerationError = (message?: string | null, fallback = '任务执行失败') => {
  return normalizeGenerationErrorMessage(String(message || '').trim(), fallback)
}

const filters = reactive<{
  keyword: string
  userKeyword: string
  type: GenerationTypeFilter
  status: GenerationStatusFilter
  refundStatus: GenerationRefundStatusFilter
  createdFrom: string
  createdTo: string
}>({
  keyword: '',
  userKeyword: '',
  type: 'all',
  status: 'all',
  refundStatus: 'all',
  createdFrom: '',
  createdTo: '',
})

const filterDefaults = {
  keyword: '',
  userKeyword: '',
  type: 'all' as GenerationTypeFilter,
  status: 'all' as GenerationStatusFilter,
  refundStatus: 'all' as GenerationRefundStatusFilter,
  createdFrom: '',
  createdTo: '',
}

const detailRecord = ref<AdminGenerationRecordItem | null>(null)

const {
  loading,
  items: records,
  pagination,
  loadList: loadRecords,
  resetAndLoad,
  handlePaginationChange,
} = useAdminList<AdminGenerationRecordItem>({
  initialPageSize: 10,
  fetcher: ({ page, pageSize }) => listAdminGenerationRecords({
    keyword: filters.keyword,
    userKeyword: filters.userKeyword,
    type: filters.type,
    status: filters.status,
    refundStatus: filters.refundStatus,
    createdFrom: filters.createdFrom,
    createdTo: filters.createdTo,
    page,
    pageSize,
  }),
})

const typeOptions: Array<{ label: string; value: GenerationTypeFilter }> = [
  { label: '全部类型', value: 'all' },
  { label: '图片', value: 'image' },
  { label: '视频', value: 'video' },
  { label: '智能体', value: 'agent' },
  { label: '深度研究', value: 'research' },
  { label: '数字人', value: 'digital-human' },
  { label: '动态内容', value: 'motion' },
]

const statusOptions: Array<{ label: string; value: GenerationStatusFilter }> = [
  { label: '全部状态', value: 'all' },
  { label: resolveAdminDictionaryItem('generationStatus', 'completed').label, value: 'completed' },
  { label: resolveAdminDictionaryItem('generationStatus', 'failed').label, value: 'failed' },
  { label: 'STOPPED', value: 'stopped' },
  { label: resolveAdminDictionaryItem('generationStatus', 'running').label, value: 'running' },
]

const refundStatusOptions: Array<{ label: string; value: GenerationRefundStatusFilter }> = [
  { label: 'All refund states', value: 'all' },
  { label: 'Refunded', value: 'refunded' },
  { label: 'Pending review', value: 'pending_refund' },
  { label: 'Not refundable', value: 'not_refundable' },
  { label: 'Compensable', value: 'compensable' },
]

const filterChipGroups = computed<AdminFilterChipGroup[]>(() => [
  {
    key: 'type',
    label: '类型',
    modelValue: filters.type,
    options: typeOptions,
  },
  {
    key: 'status',
    label: '状态',
    modelValue: filters.status,
    options: statusOptions,
  },
])

const getRecordStatus = (record: AdminGenerationRecordItem): GenerationStatusFilter => {
  if (record.stopped) {
    return 'stopped'
  }

  if (record.error) {
    return 'failed'
  }

  if (record.done) {
    return 'completed'
  }

  return 'running'
}

const completedCount = computed(() => records.value.filter((record) => getRecordStatus(record) === 'completed').length)
const failedCount = computed(() => records.value.filter((record) => getRecordStatus(record) === 'failed').length)
const activeFilterCount = computed(() => {
  return [
    filters.keyword,
    filters.userKeyword,
    filters.type !== filterDefaults.type,
    filters.status !== filterDefaults.status,
    filters.refundStatus !== filterDefaults.refundStatus,
    filters.createdFrom,
    filters.createdTo,
  ].filter(Boolean).length
})

const setType = (type: GenerationTypeFilter) => {
  filters.type = type
  void resetAndLoad()
}

const setStatus = (status: GenerationStatusFilter) => {
  filters.status = status
  void resetAndLoad()
}

const applyFilters = () => {
  void resetAndLoad()
}

const resetFilters = () => {
  Object.assign(filters, filterDefaults)
  void resetAndLoad()
}

const openReadonlyDetail = (record: AdminGenerationRecordItem) => {
  detailRecord.value = record
}

const closeReadonlyDetail = () => {
  detailRecord.value = null
}

const formatPointAmount = (value?: number | null) => {
  const amount = Number(value || 0)
  return `${amount} pts`
}

const formatRefundStatus = (status?: string, isCompensable?: boolean) => {
  if (isCompensable) return 'COMPENSABLE'
  if (status === 'REFUNDED') return 'REFUNDED'
  if (status === 'PENDING_REFUND') return 'PENDING_REFUND'
  if (status === 'NOT_REFUNDABLE') return 'NOT_REFUNDABLE'
  return 'UNKNOWN'
}

const formatCompensationSummary = (value?: string | null) => {
  if (!value) return 'No compensation action suggested'
  if (value === 'PENDING_REFUND') return 'Manual review may be needed'
  if (value === 'REFUNDED') return 'Points already returned'
  if (value === 'NOT_REFUNDABLE') return 'No point refund needed'
  return value
}

const getRefundStatusClass = (status?: string, isCompensable?: boolean) => {
  if (isCompensable || status === 'PENDING_REFUND') return 'is-warning'
  if (status === 'REFUNDED') return 'is-success'
  if (status === 'NOT_REFUNDABLE') return 'is-muted'
  return 'is-muted'
}

const handleChipSelect = (payload: { groupKey: string; value: string }) => {
  if (payload.groupKey === 'type') {
    setType(payload.value as GenerationTypeFilter)
    return
  }

  if (payload.groupKey === 'status') {
    setStatus(payload.value as GenerationStatusFilter)
  }
}

const getPreviewUrl = (record: AdminGenerationRecordItem) => {
  const imageOutput = record.outputs.find((output) => output.outputType === 'image' && output.url)
  if (imageOutput?.url) {
    return imageOutput.url
  }

  const videoOutput = record.outputs.find((output) => output.outputType === 'video' && output.url)
  if (videoOutput?.url) {
    return videoOutput.url
  }

  return record.images[0] || ''
}

const buildRecordTitle = (record: AdminGenerationRecordItem) => {
  if (record.model) {
    return `${record.model} 生成记录`
  }

  if (record.modelKey) {
    return `${record.modelKey} 生成记录`
  }

  return '生成记录'
}

const buildOutputSummary = (record: AdminGenerationRecordItem) => {
  const outputTypes = record.outputs.map((output) => output.outputType)
  if (outputTypes.length) {
    return `输出类型：${outputTypes.join(' / ')}`
  }

  if (record.images.length) {
    return `图片结果：${record.images.length} 张`
  }

  return '暂无输出结果'
}

const formatDate = (value?: string) => {
  if (!value) {
    return '未知时间'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

onMounted(() => {
  void loadRecords()
})
</script>

<style scoped>
.admin-generation-audit-search,
.admin-generation-audit-filters {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  width: 100%;
}

.admin-generation-audit-search .admin-input {
  min-width: min(180px, 100%);
  flex: 1 1 180px;
}

.admin-generation-audit-field {
  display: inline-flex;
  flex-direction: column;
  gap: 6px;
  min-width: min(220px, 100%);
  color: var(--text-tertiary);
  font-size: 12px;
  font-weight: 700;
}

.admin-generation-audit-field .admin-input {
  width: 100%;
}

.admin-generation-audit-panel,
.admin-generation-audit-detail-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.admin-generation-audit-panel__item,
.admin-generation-audit-detail-grid section,
.admin-generation-audit-log {
  min-width: 0;
  padding: 12px;
  border-radius: 12px;
  background: var(--bg-block-secondary-default);
}

.admin-generation-audit-panel__item span,
.admin-generation-audit-detail-grid span {
  display: block;
  color: var(--text-tertiary);
  font-size: 12px;
}

.admin-generation-audit-panel__item strong,
.admin-generation-audit-detail-grid strong {
  display: block;
  margin-top: 6px;
  color: var(--text-primary);
  overflow-wrap: anywhere;
}

.admin-generation-audit-panel__item small,
.admin-generation-audit-log small {
  display: block;
  margin-top: 4px;
  color: var(--text-tertiary);
  overflow-wrap: anywhere;
}

.admin-generation-audit-panel__item strong.is-success { color: var(--function-success-default, #12b76a); }
.admin-generation-audit-panel__item strong.is-warning { color: var(--function-warning-default, #f59e0b); }
.admin-generation-audit-panel__item strong.is-muted { color: var(--text-tertiary); }

.admin-generation-card__footer-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.admin-generation-audit-dialog {
  width: min(760px, 100%);
}

.admin-generation-audit-detail-section {
  margin-top: 16px;
}

.admin-generation-audit-detail-section h5 {
  margin: 0 0 8px;
  color: var(--text-primary);
  font-size: 14px;
}

.admin-generation-audit-detail-section p {
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.7;
  overflow-wrap: anywhere;
}

.admin-generation-audit-log-list {
  display: grid;
  gap: 10px;
}

.admin-generation-audit-log {
  display: grid;
  gap: 4px;
}

.admin-generation-audit-log span {
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}

@media (max-width: 960px) {
  .admin-generation-audit-panel,
  .admin-generation-audit-detail-grid {
    grid-template-columns: 1fr;
  }

  .admin-generation-card__footer-actions {
    justify-content: flex-start;
  }
}
</style>
