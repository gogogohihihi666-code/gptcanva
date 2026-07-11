<template>
  <ElConfigProvider :locale="zhCn" size="default" :z-index="30000">
    <div id="app">
      <RouteProgressBar />
      <router-view />
      <ThemeToggle />
      <LoginModal
        :visible="loginModalVisible"
        :source="loginModalSource"
        @update:visible="setLoginModalVisible"
        @login-success="handleLoginSuccess"
      />
      <MarketingModal
        :visible="marketingModalVisible"
        @update:visible="setMarketingModalVisible"
      />
      <GlobalLoadingOverlay />
    </div>
  </ElConfigProvider>
</template>

<script setup lang="ts">
import { computed, watch, defineAsyncComponent } from 'vue'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import ThemeToggle from '@/components/ThemeToggle.vue'
import RouteProgressBar from '@/components/common/RouteProgressBar.vue'
import GlobalLoadingOverlay from '@/components/common/GlobalLoadingOverlay.vue'
// 登录与营销弹窗首屏不可见，懒加载到弹出时再下载，缩小主入口体积
const LoginModal = defineAsyncComponent(() => import('@/components/LoginModal.vue'))
const MarketingModal = defineAsyncComponent(() => import('@/components/MarketingModal.vue'))
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useLoginModalStore } from '@/stores/login-modal'
import { useMarketingModalStore } from '@/stores/marketing-modal'
import { isSafeLoginRedirect, normalizeLoginMode, resolveLoginRedirect } from '@/router/login-route-context'

// 读取全局登录态与登录弹窗状态。
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const {
  loginModalVisible,
  loginModalSource,
  loginModalMode,
  loginModalRedirect,
  openLoginModal,
  setLoginModalVisible,
} = useLoginModalStore()
const { marketingModalVisible, setMarketingModalVisible } = useMarketingModalStore()
const loginRouteMode = computed(() => normalizeLoginMode(route.query.mode))
const loginRouteRedirect = computed(() => isSafeLoginRedirect(route.query.redirect) ? String(route.query.redirect) : '')

const openRouteLoginModal = () => {
  const mode = loginRouteMode.value
  openLoginModal(mode === 'admin' ? 'admin-route-guard' : 'route-guard', {
    mode,
    redirect: loginRouteRedirect.value,
  })
}

const handleLoginSuccess = () => {
  const mode = loginModalMode.value
  if (mode === 'admin' && !authStore.isAdmin.value) {
    void router.replace('/admin-forbidden')
    return
  }

  void router.replace(resolveLoginRedirect(mode, loginModalRedirect.value))
}

// /login 保留 mode 和 redirect，页面刷新后仍能恢复对应的安全登录上下文。
watch(() => [route.path, route.query.login, route.query.mode, route.query.redirect], () => {
  if (authStore.isLoggedIn.value) return

  if (route.path === '/login') {
    openRouteLoginModal()
    return
  }

  if (route.path === '/register') {
    openLoginModal('register-route', { mode: 'user' })
    return
  }

  if (route.query.login === '1') {
    openLoginModal('route-guard', { mode: 'user' })
    void router.replace({
      path: route.path,
      query: {
        ...route.query,
        login: undefined,
      },
    })
  }
}, {
  immediate: true,
})
</script>

<style>
 
</style>
