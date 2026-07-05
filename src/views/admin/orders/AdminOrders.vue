<template>
  <AdminPageContainer title="订单审计" description="统一只读查询会员订单、积分充值订单、支付交易状态与权益发放状态。">
    <template #actions>
      <button class="admin-button admin-button--secondary" type="button" :disabled="loading" @click="loadOrders">
        {{ loading ? '刷新中...' : '刷新列表' }}
      </button>
    </template>

    <AdminFilterToolbar
      title="筛选条件"
      description="仅查询订单与审计状态，不会触发支付、退款、发权益或积分变动。"
      :active-count="activeFilterCount"
      :disabled="loading"
      show-reset
      show-apply
      @apply="applyFilters"
      @reset="resetFilters"
    >
      <template #search>
        <input
          v-model.trim="filters.keyword"
          class="admin-input admin-orders-filter__search"
          type="text"
          placeholder="搜索订单号、用户、套餐或充值包"
        >
      </template>
      <template #filters>
        <div class="admin-orders-filter-grid">
          <label class="admin-orders-filter-field">
            <span>订单类型</span>
            <select v-model="filters.orderType" class="admin-select">
              <option value="ALL">全部订单</option>
              <option value="MEMBERSHIP">会员订单</option>
              <option value="RECHARGE">积分充值</option>
            </select>
          </label>
          <label class="admin-orders-filter-field">
            <span>订单状态</span>
            <select v-model="filters.orderStatus" class="admin-select">
              <option value="ALL">全部状态</option>
              <option v-for="status in orderStatusOptions" :key="status" :value="status">{{ status }}</option>
            </select>
          </label>
          <label class="admin-orders-filter-field">
            <span>支付交易</span>
            <select v-model="filters.paymentStatus" class="admin-select">
              <option value="ALL">全部交易</option>
              <option value="NO_TRANSACTION">无交易</option>
              <option v-for="status in paymentStatusOptions" :key="status" :value="status">{{ status }}</option>
            </select>
          </label>
          <label class="admin-orders-filter-field">
            <span>权益发放</span>
            <select v-model="filters.benefitStatus" class="admin-select">
              <option value="ALL">全部权益</option>
              <option value="NO_GRANT">无发放记录</option>
              <option v-for="status in benefitStatusOptions" :key="status" :value="status">{{ status }}</option>
            </select>
          </label>
          <label class="admin-orders-filter-field">
            <span>开始日期</span>
            <input v-model="filters.createdFrom" class="admin-input" type="date">
          </label>
          <label class="admin-orders-filter-field">
            <span>结束日期</span>
            <input v-model="filters.createdTo" class="admin-input" type="date">
          </label>
        </div>
      </template>
      <template #meta>
        <span class="admin-skill-toolbar__summary">共 {{ pagination.total }} 笔订单</span>
      </template>
    </AdminFilterToolbar>

    <div class="admin-grid admin-grid--stats">
      <AdminStatCard label="当前结果" :value="pagination.total" hint="当前筛选条件命中的订单数量" />
      <AdminStatCard label="会员订单" :value="membershipOrderCount" hint="当前页会员订单数量" />
      <AdminStatCard label="充值订单" :value="rechargeOrderCount" hint="当前页积分充值订单数量" />
      <AdminStatCard label="待发放/异常" :value="attentionOrderCount" hint="当前页权益或交易状态需要关注的订单" />
    </div>

    <div class="admin-card">
      <div class="admin-card__header">
        <div>
          <h4 class="admin-card__title">统一订单列表</h4>
          <div class="admin-card__desc">只展示安全摘要，不展示支付 raw payload、签名、证书或密钥字段。</div>
        </div>
      </div>
      <div class="admin-card__content">
        <div v-if="loading" class="admin-empty">正在加载订单...</div>
        <div v-else-if="orders.length === 0" class="admin-empty">当前筛选条件下暂无订单。</div>
        <div v-else class="admin-orders-list">
          <article v-for="order in orders" :key="order.id" class="admin-orders-item">
            <div class="admin-orders-item__main">
              <div class="admin-orders-item__head">
                <div>
                  <div class="admin-orders-item__title">
                    <span class="admin-orders-item__type">{{ getOrderTypeLabel(order.orderType) }}</span>
                    {{ order.title || order.orderNo }}
                  </div>
                  <div class="admin-orders-item__meta">
                    {{ order.orderNo }} · {{ formatUser(order) }} · 创建于 {{ formatDate(order.createdAt) }}
                  </div>
                </div>
                <div class="admin-orders-item__badges">
                  <span class="admin-status" :class="getOrderStatusClass(order.orderStatus)">{{ order.orderStatus || 'UNKNOWN' }}</span>
                  <span class="admin-chip">{{ order.currency || 'CNY' }} {{ order.paidAmount || '0.00' }} / {{ order.totalAmount || '0.00' }}</span>
                </div>
              </div>

              <div class="admin-orders-item__grid">
                <section class="admin-orders-summary">
                  <span>支付交易</span>
                  <strong :class="getTransactionClass(order.paymentTransactions.latestStatus)">
                    {{ order.paymentTransactions.latestStatus }}
                  </strong>
                  <small>{{ order.paymentTransactions.count }} 条交易 · {{ formatPaymentLatest(order) }}</small>
                </section>
                <section class="admin-orders-summary">
                  <span>权益发放</span>
                  <strong :class="getBenefitClass(order.benefitGrants.latestStatus)">
                    {{ order.benefitGrants.latestStatus }}
                  </strong>
                  <small>{{ order.benefitGrants.count }} 条记录 · {{ formatBenefitLatest(order) }}</small>
                </section>
                <section class="admin-orders-summary">
                  <span>积分/权益</span>
                  <strong>{{ formatOrderBenefit(order) }}</strong>
                  <small>{{ formatOrderDetail(order) }}</small>
                </section>
                <section class="admin-orders-summary">
                  <span>时间线</span>
                  <strong>{{ order.paidAt ? '已支付' : '未支付' }}</strong>
                  <small>支付 {{ formatDate(order.paidAt) }} · 退款 {{ formatDate(order.refundedAt) }}</small>
                </section>
              </div>
            </div>
          </article>

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
import { computed, onMounted, reactive } from 'vue'
import AdminFilterToolbar from '@/components/admin/common/AdminFilterToolbar.vue'
import AdminPagination from '@/components/admin/common/AdminPagination.vue'
import AdminStatCard from '@/components/admin/common/AdminStatCard.vue'
import AdminPageContainer from '@/components/admin/layout/AdminPageContainer.vue'
import { useAdminList } from '@/composables/admin/useAdminList'
import {
  listAdminOrders,
  type AdminOrderTypeFilter,
  type AdminUnifiedOrderItem,
} from '@/api/admin-orders'

const filterDefaults = {
  keyword: '',
  orderType: 'ALL' as AdminOrderTypeFilter,
  orderStatus: 'ALL',
  paymentStatus: 'ALL',
  benefitStatus: 'ALL',
  createdFrom: '',
  createdTo: '',
}

const filters = reactive({ ...filterDefaults })

const {
  loading,
  items: orders,
  pagination,
  loadList: loadOrders,
  resetAndLoad,
  handlePaginationChange,
} = useAdminList<AdminUnifiedOrderItem>({
  initialPageSize: 20,
  fetcher: ({ page, pageSize }) => listAdminOrders({
    ...filters,
    page,
    pageSize,
  }),
})

const orderStatusOptions = ['PENDING', 'PAYING', 'PAID', 'BENEFIT_GRANTED', 'CANCELED', 'CLOSED', 'REFUNDED']
const paymentStatusOptions = ['RECEIVED', 'VERIFIED', 'PAID', 'FAILED', 'IGNORED']
const benefitStatusOptions = ['PENDING', 'SUCCESS', 'FAILED', 'REVOKED']

const activeFilterCount = computed(() => [
  filters.keyword,
  filters.orderType !== filterDefaults.orderType,
  filters.orderStatus !== filterDefaults.orderStatus,
  filters.paymentStatus !== filterDefaults.paymentStatus,
  filters.benefitStatus !== filterDefaults.benefitStatus,
  filters.createdFrom,
  filters.createdTo,
].filter(Boolean).length)

const membershipOrderCount = computed(() => orders.value.filter((order) => order.orderType === 'MEMBERSHIP').length)
const rechargeOrderCount = computed(() => orders.value.filter((order) => order.orderType === 'RECHARGE').length)
const attentionOrderCount = computed(() => orders.value.filter((order) => {
  return ['FAILED', 'PENDING', 'NO_GRANT'].includes(order.benefitGrants.latestStatus)
    || ['FAILED', 'NO_TRANSACTION'].includes(order.paymentTransactions.latestStatus)
}).length)

const applyFilters = () => {
  void resetAndLoad()
}

const resetFilters = () => {
  Object.assign(filters, filterDefaults)
  void resetAndLoad()
}

const getOrderTypeLabel = (type: string) => {
  if (type === 'MEMBERSHIP') return '会员'
  if (type === 'RECHARGE') return '充值'
  return type || '订单'
}

const formatDate = (value?: string | null) => {
  if (!value) return '暂无'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '暂无'
  return date.toLocaleString('zh-CN', { hour12: false })
}

const formatUser = (order: AdminUnifiedOrderItem) => {
  const user = order.user
  if (!user) return '未知用户'
  return user.name || user.email || user.phone || user.id || '未知用户'
}

const formatPaymentLatest = (order: AdminUnifiedOrderItem) => {
  const latest = order.paymentTransactions.latest
  if (!latest) return '暂无支付交易'
  return `${latest.provider || 'UNKNOWN'} / ${latest.channel || 'UNKNOWN'} / ${formatDate(latest.paidAt || latest.verifiedAt)}`
}

const formatBenefitLatest = (order: AdminUnifiedOrderItem) => {
  const latest = order.benefitGrants.latest
  if (!latest) return '暂无权益发放'
  return `${latest.grantType || 'UNKNOWN'} / ${formatDate(latest.grantedAt)}`
}

const formatOrderBenefit = (order: AdminUnifiedOrderItem) => {
  if (order.orderType === 'RECHARGE') {
    return `${order.points + order.bonusPoints} 积分`
  }
  return order.membership?.levelName || '会员权益'
}

const formatOrderDetail = (order: AdminUnifiedOrderItem) => {
  if (order.orderType === 'RECHARGE') {
    return `${order.recharge?.packageName || '充值包'} · 基础 ${order.points} / 赠送 ${order.bonusPoints}`
  }
  return `${order.membership?.planName || '会员计划'} · ${formatDate(order.membership?.startTime)} - ${formatDate(order.membership?.endTime)}`
}

const getOrderStatusClass = (status: string) => {
  if (['PAID', 'BENEFIT_GRANTED', 'SUCCESS'].includes(status)) return 'admin-status--success'
  if (['FAILED', 'CANCELED', 'CLOSED', 'REFUNDED'].includes(status)) return 'admin-status--danger'
  return 'admin-status--warning'
}

const getTransactionClass = (status: string) => {
  if (status === 'PAID' || status === 'VERIFIED') return 'is-success'
  if (status === 'FAILED') return 'is-danger'
  if (status === 'NO_TRANSACTION') return 'is-muted'
  return 'is-warning'
}

const getBenefitClass = (status: string) => {
  if (status === 'SUCCESS') return 'is-success'
  if (status === 'FAILED' || status === 'REVOKED') return 'is-danger'
  if (status === 'NO_GRANT') return 'is-muted'
  return 'is-warning'
}

onMounted(() => {
  void loadOrders()
})
</script>

<style scoped>
.admin-orders-filter__search {
  min-width: min(360px, 100%);
}

.admin-orders-filter-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(140px, 1fr));
  gap: 12px;
  width: 100%;
}

.admin-orders-filter-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
}

.admin-orders-filter-field :deep(.admin-select),
.admin-orders-filter-field :deep(.admin-input) {
  width: 100%;
  flex: 0 0 auto;
  min-height: 40px;
  height: 40px;
  padding-block: 0;
  line-height: 40px;
}

.admin-orders-filter-field :deep(select.admin-select),
.admin-orders-filter-field :deep(input.admin-input) {
  box-sizing: border-box;
}

.admin-orders-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.admin-orders-item {
  border: 1px solid var(--line-divider, #00000014);
  border-radius: 12px;
  background: color-mix(in srgb, var(--bg-surface) 86%, var(--bg-block-secondary-default));
  overflow: hidden;
}

.admin-orders-item__main {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
}

.admin-orders-item__head {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  min-width: 0;
}

.admin-orders-item__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 800;
  color: var(--text-primary);
}

.admin-orders-item__type {
  padding: 3px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--brand-main-default) 14%, transparent);
  color: var(--brand-main-default);
  font-size: 12px;
}

.admin-orders-item__meta,
.admin-orders-summary small {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-tertiary);
  overflow-wrap: anywhere;
}

.admin-orders-item__badges {
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}

.admin-orders-item__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.admin-orders-summary {
  min-width: 0;
  padding: 12px;
  border-radius: 10px;
  background: var(--bg-block-secondary-default);
}

.admin-orders-summary span {
  display: block;
  font-size: 12px;
  color: var(--text-tertiary);
}

.admin-orders-summary strong {
  display: block;
  margin-top: 6px;
  font-size: 14px;
  color: var(--text-primary);
  overflow-wrap: anywhere;
}

.admin-orders-summary strong.is-success { color: var(--function-success-default, #12b76a); }
.admin-orders-summary strong.is-warning { color: var(--function-warning-default, #f59e0b); }
.admin-orders-summary strong.is-danger { color: var(--function-danger-default, #ef4444); }
.admin-orders-summary strong.is-muted { color: var(--text-tertiary); }

@media (max-width: 1180px) {
  .admin-orders-filter-grid,
  .admin-orders-item__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .admin-orders-filter-grid,
  .admin-orders-item__grid {
    grid-template-columns: 1fr;
  }

  .admin-orders-item__head {
    flex-direction: column;
  }

  .admin-orders-item__badges {
    justify-content: flex-start;
  }
}
</style>
