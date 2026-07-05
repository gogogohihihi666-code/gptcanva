<template>
  <AdminPageContainer title="AI 健康检查" description="只读检查 Provider、模型、任务 gate、Worker、存储和真实 smoke gate；本页面不会调用外部服务。">
    <template #actions>
      <button class="admin-button admin-button--secondary" type="button" :disabled="loading" @click="loadOverview">
        {{ loading ? '刷新中...' : '刷新检查' }}
      </button>
    </template>

    <div class="admin-grid admin-grid--stats">
      <AdminStatCard label="Provider" :value="overview?.providerSummary.enabled ?? 0" hint="已启用配置数量" />
      <AdminStatCard label="模型" :value="overview?.modelSummary.enabled ?? 0" hint="已启用模型数量" />
      <AdminStatCard label="存储" :value="overview?.storageSummary.enabled ?? 0" hint="已启用存储配置" />
      <AdminStatCard label="真实外呼" :value="overview?.willCallExternal ? 'YES' : 'NO'" hint="本检查必须保持 no-call" />
    </div>

    <div v-if="loading" class="admin-empty">正在加载 AI Provider 健康检查...</div>
    <div v-else-if="loadError" class="admin-empty admin-provider-health-error">{{ loadError }}</div>
    <div v-else-if="!overview" class="admin-empty">暂无健康检查结果。</div>
    <template v-else>
      <section class="admin-card admin-provider-health-nocall">
        <div class="admin-card__header">
          <div>
            <h4 class="admin-card__title">No-call 状态</h4>
            <div class="admin-card__desc">这些开关由只读接口返回，用于确认页面不会触发真实生成、扣积分、上传或 smoke。</div>
          </div>
          <span class="admin-status admin-status--success">只读</span>
        </div>
        <div class="admin-card__content admin-provider-health-flags">
          <span :class="flagClass(!overview.willCallExternal)">willCallExternal=false</span>
          <span :class="flagClass(!overview.willCallProvider)">willCallProvider=false</span>
          <span :class="flagClass(!overview.willUploadStorage)">willUploadStorage=false</span>
          <span :class="flagClass(!overview.willCreateGenerationTask)">willCreateGenerationTask=false</span>
          <span :class="flagClass(!overview.willChargePoints)">willChargePoints=false</span>
          <span :class="flagClass(!overview.realProviderSmokeAllowed)">realProviderSmokeAllowed=false</span>
        </div>
      </section>

      <div class="admin-provider-health-grid">
        <section class="admin-card admin-provider-health-card">
          <div class="admin-card__header">
            <div>
              <h4 class="admin-card__title">Provider 配置</h4>
              <div class="admin-card__desc">只展示配置状态，不展示密钥、endpoint 或 bucket 明文。</div>
            </div>
            <RouterLink class="admin-provider-health-link" to="/admin/providers">查看配置页</RouterLink>
          </div>
          <div class="admin-card__content">
            <div class="admin-provider-health-metrics">
              <span>总数 {{ overview.providerSummary.total }}</span>
              <span>启用 {{ overview.providerSummary.enabled }}</span>
              <span>缺少引用 {{ overview.providerSummary.missingKey }}</span>
              <span>旧表 {{ overview.providerSummary.legacyTotal }}</span>
            </div>
            <ReadonlyList :items="overview.providerSummary.items" empty-text="暂无 Provider 配置。" />
          </div>
        </section>

        <section class="admin-card admin-provider-health-card">
          <div class="admin-card__header">
            <div>
              <h4 class="admin-card__title">模型配置</h4>
              <div class="admin-card__desc">汇总 enabled / visible / approved / pricing gate 状态，字段缺失时显示未知。</div>
            </div>
          </div>
          <div class="admin-card__content">
            <div class="admin-provider-health-metrics">
              <span>总数 {{ overview.modelSummary.total }}</span>
              <span>启用 {{ overview.modelSummary.enabled }}</span>
              <span>可见 {{ overview.modelSummary.visible }}</span>
              <span>价格 {{ overview.modelSummary.priced }}</span>
            </div>
            <ReadonlyList :items="overview.modelSummary.items" empty-text="暂无模型配置。" />
          </div>
        </section>

        <section class="admin-card admin-provider-health-card">
          <div class="admin-card__header">
            <div>
              <h4 class="admin-card__title">任务创建 gate</h4>
              <div class="admin-card__desc">只读检查是否具备 Provider / 模型前置条件，不进入任务生命周期。</div>
            </div>
          </div>
          <div class="admin-card__content admin-provider-health-stack">
            <div class="admin-list-item">
              <div>
                <div class="admin-list-item__title">Provider gate</div>
                <div class="admin-list-item__meta">{{ overview.generationGateSummary.hasEnabledProvider ? '存在启用 Provider' : '未发现启用 Provider' }}</div>
              </div>
              <span :class="overview.generationGateSummary.hasEnabledProvider ? 'admin-status admin-status--success' : 'admin-status admin-status--warning'">
                {{ overview.generationGateSummary.hasEnabledProvider ? 'PASS' : 'WARN' }}
              </span>
            </div>
            <div class="admin-list-item">
              <div>
                <div class="admin-list-item__title">模型 gate</div>
                <div class="admin-list-item__meta">{{ overview.generationGateSummary.hasEnabledModel ? '存在启用模型' : '未发现启用模型' }}</div>
              </div>
              <span :class="overview.generationGateSummary.hasEnabledModel ? 'admin-status admin-status--success' : 'admin-status admin-status--warning'">
                {{ overview.generationGateSummary.hasEnabledModel ? 'PASS' : 'WARN' }}
              </span>
            </div>
            <div class="admin-empty admin-empty--compact">{{ overview.generationGateSummary.summary }}</div>
          </div>
        </section>

        <section class="admin-card admin-provider-health-card">
          <div class="admin-card__header">
            <div>
              <h4 class="admin-card__title">Worker no-call gate</h4>
              <div class="admin-card__desc">本接口不导入或执行生成 Worker，也不调用 Provider executor。</div>
            </div>
          </div>
          <div class="admin-card__content admin-provider-health-stack">
            <div class="admin-list-item">
              <div>
                <div class="admin-list-item__title">Provider 调用</div>
                <div class="admin-list-item__meta">{{ overview.workerGateSummary.summary }}</div>
              </div>
              <span class="admin-status admin-status--success">NO-CALL</span>
            </div>
          </div>
        </section>

        <section class="admin-card admin-provider-health-card">
          <div class="admin-card__header">
            <div>
              <h4 class="admin-card__title">存储配置</h4>
              <div class="admin-card__desc">只展示存储配置状态，不上传文件，不展示 bucket / endpoint 明文。</div>
            </div>
            <RouterLink class="admin-provider-health-link" to="/admin/storage">查看存储页</RouterLink>
          </div>
          <div class="admin-card__content">
            <div class="admin-provider-health-metrics">
              <span>总数 {{ overview.storageSummary.total }}</span>
              <span>启用 {{ overview.storageSummary.enabled }}</span>
              <span>默认 {{ overview.storageSummary.defaultConfigured ? '有' : '无' }}</span>
              <span>凭据缺口 {{ overview.storageSummary.missingCredential }}</span>
            </div>
            <ReadonlyList :items="overview.storageSummary.items" empty-text="暂无存储配置，系统可能回退本地 uploads。" />
          </div>
        </section>

        <section class="admin-card admin-provider-health-card">
          <div class="admin-card__header">
            <div>
              <h4 class="admin-card__title">真实 smoke gate</h4>
              <div class="admin-card__desc">当前阶段必须显示 realProviderSmokeAllowed=false。</div>
            </div>
          </div>
          <div class="admin-card__content admin-provider-health-stack">
            <div class="admin-list-item">
              <div>
                <div class="admin-list-item__title">{{ overview.smokeGateSummary.gateName }}</div>
                <div class="admin-list-item__meta">{{ overview.smokeGateSummary.summary }}</div>
              </div>
              <span :class="flagClass(!overview.smokeGateSummary.realProviderSmokeAllowed)">false</span>
            </div>
          </div>
        </section>
      </div>

      <section class="admin-card">
        <div class="admin-card__header">
          <div>
            <h4 class="admin-card__title">风险项</h4>
            <div class="admin-card__desc">PASS / WARN / BLOCKED / UNKNOWN 仅用于人工排查，不触发任何修复动作。</div>
          </div>
        </div>
        <div class="admin-card__content">
          <div v-if="overview.riskItems.length === 0" class="admin-empty admin-empty--compact">暂无风险项。</div>
          <div v-else class="admin-provider-health-risk-list">
            <article v-for="item in overview.riskItems" :key="item.key" class="admin-provider-health-risk-item">
              <div>
                <strong>{{ item.title }}</strong>
                <span>{{ item.summary }}</span>
              </div>
              <span :class="riskStatusClass(item.status)">{{ item.status }}</span>
            </article>
          </div>
        </div>
      </section>
    </template>
  </AdminPageContainer>
</template>

<script setup lang="ts">
import { defineComponent, h, onMounted, ref } from 'vue'
import AdminPageContainer from '@/components/admin/layout/AdminPageContainer.vue'
import AdminStatCard from '@/components/admin/common/AdminStatCard.vue'
import {
  getAdminProviderHealthOverview,
  type AdminProviderHealthOverview,
  type ProviderHealthRiskStatus,
} from '@/api/admin-provider-health'

const ReadonlyList = defineComponent({
  props: {
    items: {
      type: Array<Record<string, unknown>>,
      required: true,
    },
    emptyText: {
      type: String,
      required: true,
    },
  },
  setup(props) {
    return () => {
      if (props.items.length === 0) {
        return h('div', { class: 'admin-empty admin-empty--compact' }, props.emptyText)
      }

      return h('div', { class: 'admin-provider-health-readonly-list' }, props.items.map((item, index) => {
        const title = String(item.name || item.code || item.modelKey || item.id || `item-${index + 1}`)
        const status = String(item.credentialStatus || item.endpointStatus || item.pricingStatus || '')
        return h('article', { class: 'admin-provider-health-readonly-item' }, [
          h('strong', title),
          h('span', Object.entries(item)
            .filter(([key]) => !['id', 'name'].includes(key))
            .map(([key, value]) => `${key}: ${String(value)}`)
            .join(' / ') || status || 'readonly'),
        ])
      }))
    }
  },
})

const loading = ref(false)
const loadError = ref('')
const overview = ref<AdminProviderHealthOverview | null>(null)

const flagClass = (ok: boolean) => ok ? 'admin-status admin-status--success' : 'admin-status admin-status--warning'

const riskStatusClass = (status: ProviderHealthRiskStatus) => {
  if (status === 'PASS') return 'admin-status admin-status--success'
  if (status === 'BLOCKED') return 'admin-status admin-status--danger'
  return 'admin-status admin-status--warning'
}

const loadOverview = async () => {
  loading.value = true
  loadError.value = ''
  try {
    overview.value = await getAdminProviderHealthOverview()
  } catch (error: any) {
    loadError.value = error?.message || '加载 AI 健康检查失败。'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadOverview()
})
</script>

<style scoped>
.admin-provider-health-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.admin-provider-health-card,
.admin-provider-health-nocall {
  min-width: 0;
}

.admin-provider-health-link {
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

.admin-provider-health-flags,
.admin-provider-health-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.admin-provider-health-metrics {
  margin-bottom: 12px;
}

.admin-provider-health-metrics span {
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

.admin-provider-health-stack,
.admin-provider-health-risk-list,
.admin-provider-health-readonly-list {
  display: grid;
  gap: 8px;
}

.admin-provider-health-readonly-item,
.admin-provider-health-risk-item {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--line-divider, rgba(0, 0, 0, 0.08));
  border-radius: 8px;
  background: var(--bg-block-secondary-default);
}

.admin-provider-health-readonly-item strong,
.admin-provider-health-readonly-item span,
.admin-provider-health-risk-item strong,
.admin-provider-health-risk-item span {
  min-width: 0;
}

.admin-provider-health-readonly-item strong,
.admin-provider-health-risk-item strong {
  display: block;
  overflow: hidden;
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-provider-health-readonly-item span,
.admin-provider-health-risk-item div span {
  display: block;
  overflow: hidden;
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-provider-health-error {
  color: var(--danger-default, #b42318);
}

@media (max-width: 980px) {
  .admin-provider-health-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 560px) {
  .admin-provider-health-link {
    width: 100%;
  }

  .admin-provider-health-readonly-item,
  .admin-provider-health-risk-item {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
