import { computed, ref } from 'vue'
import type { LoginMode } from '@/router/login-route-context'
import { isSafeLoginRedirect, normalizeLoginMode } from '@/router/login-route-context'

// 全局登录弹窗显隐状态。
const loginModalVisible = ref(false)

// 最近一次打开登录弹窗的来源，便于后续扩展埋点或回跳。
const loginModalSource = ref('')
const loginModalMode = ref<LoginMode>('user')
const loginModalRedirect = ref('')

const resetLoginModalContext = () => {
  loginModalSource.value = ''
  loginModalMode.value = 'user'
  loginModalRedirect.value = ''
}

// 全局登录弹窗状态单例。
export const useLoginModalStore = () => {
  // 是否处于打开状态。
  const isVisible = computed(() => loginModalVisible.value)

  // 打开登录弹窗。
  const openLoginModal = (source = '', context?: { mode?: LoginMode; redirect?: string }) => {
    loginModalSource.value = String(source || '').trim()
    loginModalMode.value = normalizeLoginMode(context?.mode)
    loginModalRedirect.value = isSafeLoginRedirect(context?.redirect) ? String(context?.redirect) : ''
    loginModalVisible.value = true
  }

  // 关闭登录弹窗。
  const closeLoginModal = () => {
    loginModalVisible.value = false
    resetLoginModalContext()
  }

  // 供 v-model 直接写入可见状态。
  const setLoginModalVisible = (visible: boolean) => {
    loginModalVisible.value = Boolean(visible)
    if (!visible) {
      resetLoginModalContext()
    }
  }

  return {
    isVisible,
    loginModalVisible,
    loginModalSource,
    loginModalMode,
    loginModalRedirect,
    openLoginModal,
    closeLoginModal,
    setLoginModalVisible,
  }
}
