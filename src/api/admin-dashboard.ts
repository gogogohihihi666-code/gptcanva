import { adminGet } from './admin-request'

export interface DashboardTrendPoint {
  label: string
  value: number
}

export interface AdminDashboardRiskListItem {
  id: string
  title?: string
  orderNo?: string
  orderType?: string
  status?: string
  paymentStatus?: string
  benefitStatus?: string
  refundStatus?: string
  riskType?: string
  associationNo?: string
  pointAmount?: number
  action?: string
  businessModule?: string
  businessSummary?: string
  riskLevel?: string
  operatorLabel?: string
  errorSummary?: string
  userLabel?: string
  model?: string
  type?: string
  createdAt?: string
  updatedAt?: string
}

export interface AdminDashboardRiskOverview {
  readonly: boolean
  generatedAt: string
  orderSummary: {
    todayOrderCount: number
    last7DaysOrderCount: number
    membershipOrderCount: number
    rechargeOrderCount: number
    statusCounts: Record<string, number>
    recentRiskOrders: AdminDashboardRiskListItem[]
  }
  failedTaskSummary: {
    failedCount: number
    stoppedCount: number
    last7DaysFailedCount: number
    recentFailedTasks: AdminDashboardRiskListItem[]
  }
  pointRiskSummary: {
    compensableCount: number
    pendingRefundCount: number
    manualAdjustmentCount: number
    recentPointRisks: AdminDashboardRiskListItem[]
  }
  auditRiskSummary: {
    highRiskCount: number
    recentHighRiskLogs: AdminDashboardRiskListItem[]
  }
}

export interface AdminDashboardOverview {
  asset: {
    total: number
    published: number
    draft: number
    trend: DashboardTrendPoint[]
  }
  generation: {
    total: number
    completed: number
    failed: number
    today: number
    trend: DashboardTrendPoint[]
  }
  runtime: {
    enabledStorageName: string
    enabledStorageCode: string
    totalStorageConfigs: number
    providerBaseUrl: string
    providerName: string
  }
  riskOverview: AdminDashboardRiskOverview
}

const ADMIN_DASHBOARD_OVERVIEW_PATH = '/api/admin/dashboard/overview'

// 查询后台仪表盘概览数据。
export const getAdminDashboardOverview = async () => {
  return adminGet<AdminDashboardOverview>(ADMIN_DASHBOARD_OVERVIEW_PATH)
}
