<template>
  <AdminPageContainer title="风险总览" description="集中查看订单、生成任务、积分流水和审计日志的只读风险摘要。">
    <template #actions>
      <button class="admin-button admin-button--secondary" type="button" @click="loadOverview" :disabled="loading">
        {{ loading ? '刷新中...' : '刷新统计' }}
      </button>
    </template>

    <div class="admin-grid admin-grid--stats">
      <AdminStatCard label="今日订单" :value="riskOverview?.orderSummary.todayOrderCount ?? 0" hint="会员订单与积分充值订单合计" />
      <AdminStatCard label="失败/停止任务" :value="failedTaskTotal" hint="全站 FAILED 与 STOPPED 生成任务" />
      <AdminStatCard label="积分核查项" :value="riskOverview?.pointRiskSummary.compensableCount ?? 0" hint="近 7 日可核查的生成积分流水" />
      <AdminStatCard label="高风险审计" :value="riskOverview?.auditRiskSummary.highRiskCount ?? 0" hint="近 7 日高风险后台操作" />
    </div>

    <div v-if="loading" class="admin-empty">正在加载风险总览...</div>
    <div v-else-if="!overview" class="admin-empty">暂未获取到后台风险总览。</div>
    <template v-else>
      <div class="admin-risk-grid">
        <section class="admin-card admin-risk-card">
          <div class="admin-card__header">
            <div>
              <h4 class="admin-card__title">订单风险摘要</h4>
              <div class="admin-card__desc">只读汇总会员订单、积分充值订单、支付状态与权益状态。</div>
            </div>
            <RouterLink class="admin-risk-link" to="/admin/orders">查看订单审计</RouterLink>
          </div>
          <div class="admin-card__content">
            <div class="admin-risk-metrics">
              <span>近 7 日 {{ riskOverview.orderSummary.last7DaysOrderCount }}</span>
              <span>会员 {{ riskOverview.orderSummary.membershipOrderCount }}</span>
              <span>充值 {{ riskOverview.orderSummary.rechargeOrderCount }}</span>
            </div>
            <div class="admin-risk-status-strip">
              <span v-for="item in orderStatusItems" :key="item.key">{{ item.label }} {{ item.value }}</span>
            </div>
            <div v-if="riskOverview.orderSummary.recentRiskOrders.length === 0" class="admin-empty admin-empty--compact">暂无异常订单。</div>
            <div v-else class="admin-risk-list">
              <article v-for="item in riskOverview.orderSummary.recentRiskOrders" :key="item.id" class="admin-risk-item">
                <strong>{{ item.title || item.orderNo || item.id }}</strong>
                <span>{{ item.orderType }} / {{ item.status }} / {{ formatDate(item.createdAt) }}</span>
              </article>
            </div>
          </div>
        </section>

        <section class="admin-card admin-risk-card">
          <div class="admin-card__header">
            <div>
              <h4 class="admin-card__title">失败任务摘要</h4>
              <div class="admin-card__desc">只读查看 FAILED / STOPPED 任务、错误摘要和近期失败趋势。</div>
            </div>
            <RouterLink class="admin-risk-link" to="/admin/generations">查看生成任务</RouterLink>
          </div>
          <div class="admin-card__content">
            <div class="admin-risk-metrics">
              <span>FAILED {{ riskOverview.failedTaskSummary.failedCount }}</span>
              <span>STOPPED {{ riskOverview.failedTaskSummary.stoppedCount }}</span>
              <span>近 7 日 {{ riskOverview.failedTaskSummary.last7DaysFailedCount }}</span>
            </div>
            <div v-if="riskOverview.failedTaskSummary.recentFailedTasks.length === 0" class="admin-empty admin-empty--compact">暂无失败或停止任务。</div>
            <div v-else class="admin-risk-list">
              <article v-for="item in riskOverview.failedTaskSummary.recentFailedTasks" :key="item.id" class="admin-risk-item">
                <strong>{{ item.model || item.type || item.id }}</strong>
                <span>{{ item.status }} / {{ item.errorSummary || '无错误摘要' }}</span>
              </article>
            </div>
          </div>
        </section>

        <section class="admin-card admin-risk-card">
          <div class="admin-card__header">
            <div>
              <h4 class="admin-card__title">积分异常摘要</h4>
              <div class="admin-card__desc">只读汇总待核查生成消耗流水和管理员手动调整记录。</div>
            </div>
            <RouterLink class="admin-risk-link" to="/admin/marketing">查看积分流水</RouterLink>
          </div>
          <div class="admin-card__content">
            <div class="admin-risk-metrics">
              <span>可核查 {{ riskOverview.pointRiskSummary.compensableCount }}</span>
              <span>待处理 {{ riskOverview.pointRiskSummary.pendingRefundCount }}</span>
              <span>手动调整 {{ riskOverview.pointRiskSummary.manualAdjustmentCount }}</span>
            </div>
            <div v-if="riskOverview.pointRiskSummary.recentPointRisks.length === 0" class="admin-empty admin-empty--compact">暂无积分异常摘要。</div>
            <div v-else class="admin-risk-list">
              <article v-for="item in riskOverview.pointRiskSummary.recentPointRisks" :key="item.id" class="admin-risk-item">
                <strong>{{ item.riskType || item.action || 'POINT_RISK' }}</strong>
                <span>{{ item.associationNo || item.id }} / {{ item.pointAmount ?? 0 }} points</span>
              </article>
            </div>
          </div>
        </section>

        <section class="admin-card admin-risk-card">
          <div class="admin-card__header">
            <div>
              <h4 class="admin-card__title">审计高风险摘要</h4>
              <div class="admin-card__desc">只读展示近期高风险后台操作，便于快速追踪操作人和业务模块。</div>
            </div>
            <RouterLink class="admin-risk-link" to="/admin/audit-logs">查看审计日志</RouterLink>
          </div>
          <div class="admin-card__content">
            <div class="admin-risk-metrics">
              <span>近 7 日高风险 {{ riskOverview.auditRiskSummary.highRiskCount }}</span>
              <span>只读</span>
            </div>
            <div v-if="riskOverview.auditRiskSummary.recentHighRiskLogs.length === 0" class="admin-empty admin-empty--compact">暂无高风险审计日志。</div>
            <div v-else class="admin-risk-list">
              <article v-for="item in riskOverview.auditRiskSummary.recentHighRiskLogs" :key="item.id" class="admin-risk-item">
                <strong>{{ item.businessModule || '审计日志' }}</strong>
                <span>{{ item.businessSummary || item.id }}</span>
              </article>
            </div>
          </div>
        </section>
      </div>

      <div class="admin-grid admin-grid--two">
        <div class="admin-card">
          <div class="admin-card__header">
            <div>
              <h4 class="admin-card__title">生成概览</h4>
              <div class="admin-card__desc">当前账号生成记录和近 7 日趋势。</div>
            </div>
          </div>
          <div class="admin-card__content">
            <div class="admin-list">
              <div class="admin-list-item">
                <div>
                  <div class="admin-list-item__title">完成记录</div>
                  <div class="admin-list-item__meta">失败记录：{{ overview.generation.failed }}</div>
                </div>
                <div class="admin-status admin-status--success">{{ overview.generation.completed }}</div>
              </div>
              <div class="admin-list-item admin-list-item--stack">
                <div>
                  <div class="admin-list-item__title">最近 7 日生成趋势</div>
                  <div class="admin-list-item__meta">按天统计当前账号的生成记录数量。</div>
                </div>
                <div class="admin-trend-list">
                  <div v-for="item in overview.generation.trend" :key="`generation-${item.label}`" class="admin-trend-item">
                    <span>{{ item.label }}</span>
                    <strong>{{ item.value }}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="admin-card">
          <div class="admin-card__header">
            <div>
              <h4 class="admin-card__title">资源与运行态</h4>
              <div class="admin-card__desc">当前账号资源沉淀，以及默认厂商与存储配置是否可读。</div>
            </div>
          </div>
          <div class="admin-card__content">
            <div class="admin-list">
              <div class="admin-list-item">
                <div>
                  <div class="admin-list-item__title">资源概览</div>
                  <div class="admin-list-item__meta">总资源：{{ overview.asset.total }} / 草稿：{{ overview.asset.draft }}</div>
                </div>
                <div class="admin-list-item__meta">已发布：{{ overview.asset.published }}</div>
              </div>
              <div class="admin-list-item">
                <div>
                  <div class="admin-list-item__title">当前默认厂商</div>
                  <div class="admin-list-item__meta">{{ overview.runtime.providerName || '默认生成配置' }}</div>
                </div>
                <div class="admin-status admin-status--success">只读</div>
              </div>
              <div class="admin-list-item">
                <div>
                  <div class="admin-list-item__title">当前存储方案</div>
                  <div class="admin-list-item__meta">{{ overview.runtime.enabledStorageName || '未配置' }}</div>
                </div>
                <div class="admin-list-item__meta">配置数：{{ overview.runtime.totalStorageConfigs }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </AdminPageContainer>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AdminStatCard from '@/components/admin/common/AdminStatCard.vue'
import AdminPageContainer from '@/components/admin/layout/AdminPageContainer.vue'
import {
  getAdminDashboardOverview,
  type AdminDashboardOverview,
  type AdminDashboardRiskOverview,
} from '@/api/admin-dashboard'

const loading = ref(false)
const overview = ref<AdminDashboardOverview | null>(null)
const emptyRiskOverview: AdminDashboardRiskOverview = {
  readonly: true,
  generatedAt: '',
  orderSummary: {
    todayOrderCount: 0,
    last7DaysOrderCount: 0,
    membershipOrderCount: 0,
    rechargeOrderCount: 0,
    statusCounts: {},
    recentRiskOrders: [],
  },
  failedTaskSummary: {
    failedCount: 0,
    stoppedCount: 0,
    last7DaysFailedCount: 0,
    recentFailedTasks: [],
  },
  pointRiskSummary: {
    compensableCount: 0,
    pendingRefundCount: 0,
    manualAdjustmentCount: 0,
    recentPointRisks: [],
  },
  auditRiskSummary: {
    highRiskCount: 0,
    recentHighRiskLogs: [],
  },
}

const riskOverview = computed(() => overview.value?.riskOverview || emptyRiskOverview)
const failedTaskTotal = computed(() => {
  const summary = riskOverview.value?.failedTaskSummary
  return (summary?.failedCount || 0) + (summary?.stoppedCount || 0)
})
const orderStatusItems = computed(() => {
  const counts = riskOverview.value?.orderSummary.statusCounts || {}
  return [
    { key: 'PENDING', label: 'PENDING', value: counts.PENDING || 0 },
    { key: 'PAYING', label: 'PAYING', value: counts.PAYING || 0 },
    { key: 'FAILED', label: 'FAILED', value: counts.FAILED || 0 },
    { key: 'BENEFIT_GRANTED', label: 'BENEFIT', value: counts.BENEFIT_GRANTED || 0 },
  ]
})

const formatDate = (value?: string) => String(value || '').replace('T', ' ').slice(0, 16) || '未记录'

const loadOverview = async () => {
  loading.value = true
  try {
    overview.value = await getAdminDashboardOverview()
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadOverview()
})
</script>

<style scoped>
.admin-risk-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.admin-risk-card {
  min-width: 0;
}

.admin-risk-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid var(--line-divider, rgba(0, 0, 0, 0.08));
  border-radius: 6px;
  color: var(--brand-main-default);
  font-size: 12px;
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
}

.admin-risk-metrics,
.admin-risk-status-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.admin-risk-metrics span,
.admin-risk-status-strip span {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 0 9px;
  border-radius: 999px;
  background: var(--bg-block-secondary-default);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.admin-risk-list {
  display: grid;
  gap: 8px;
}

.admin-risk-item {
  min-width: 0;
  display: grid;
  gap: 3px;
  padding: 10px 12px;
  border: 1px solid var(--line-divider, rgba(0, 0, 0, 0.08));
  border-radius: 8px;
  background: var(--bg-block-secondary-default);
}

.admin-risk-item strong,
.admin-risk-item span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-risk-item strong {
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.45;
}

.admin-risk-item span {
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 1.45;
}

.admin-empty--compact {
  min-height: 72px;
  padding: 18px;
}

@media (max-width: 980px) {
  .admin-risk-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 560px) {
  .admin-card__header {
    align-items: flex-start;
    gap: 10px;
  }

  .admin-risk-link {
    width: 100%;
  }
}
</style>
