import { computed, onBeforeUnmount, ref } from 'vue'

import { apiRequest } from '../services/api'

function errorText(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback
}

export function useBackendStatus() {
  const backendState = ref('checking')
  const backendVersion = ref('')
  const backendMessage = ref('正在检查服务连接…')
  const statusClass = computed(() => `status-badge status-${backendState.value}`)
  let pending = null
  let controller = null
  let disposed = false

  function checkBackend() {
    if (disposed) return Promise.resolve(false)
    if (pending) return pending
    controller = new AbortController()
    pending = runCheck().finally(() => {
      pending = null
      controller = null
    })
    return pending
  }

  async function runCheck() {
    backendState.value = 'checking'
    backendMessage.value = '正在检查服务连接…'
    backendVersion.value = ''
    try {
      const result = await apiRequest('/api/health', { signal: controller.signal }, 5000)
      if (disposed) return false
      backendState.value = result.status === 'ok' ? 'connected' : 'error'
      backendVersion.value = result.version || ''
      backendMessage.value = result.status === 'ok' ? '服务连接正常' : '服务暂时不可用'
      return result.status === 'ok'
    } catch (error) {
      if (disposed) return false
      backendState.value = 'error'
      backendMessage.value = errorText(error, '暂时无法连接服务，请稍后重试。')
      return false
    }
  }

  onBeforeUnmount(() => {
    disposed = true
    controller?.abort()
  })

  return {
    backendMessage,
    backendState,
    backendVersion,
    checkBackend,
    statusClass,
  }
}
