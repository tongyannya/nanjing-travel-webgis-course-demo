import { isTutorialDemoWindow } from '../tutorial/demoContext'
import { createTutorialDataCache } from '../tutorial/dataCache'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL
const tutorialRequest = createTutorialDataCache()

export async function apiRequest(path, options = {}, timeoutMs = 15000) {
  if (isTutorialDemoWindow())
    return tutorialRequest(path, options, () => performApiRequest(path, options, timeoutMs))
  return performApiRequest(path, options, timeoutMs)
}

async function performApiRequest(path, options, timeoutMs) {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)
  const externalSignal = options.signal
  const abortFromExternal = () => controller.abort()
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort()
    else externalSignal.addEventListener('abort', abortFromExternal, { once: true })
  }

  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      signal: controller.signal,
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      const apiError = new Error(
        result.error?.message || result.detail || `请求失败（HTTP ${response.status}）`,
      )
      apiError.code = result.error?.code || 'http_error'
      apiError.details = result.error?.details || []
      apiError.status = response.status
      throw apiError
    }
    return result
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(
        externalSignal?.aborted ? '操作已取消。' : '请求超时，请检查后端和网络连接。',
        { cause: error },
      )
    }
    if (error instanceof TypeError) {
      throw new Error('无法连接后端服务，请先启动后端后再重试。', { cause: error })
    }
    throw error
  } finally {
    window.clearTimeout(timeoutId)
    externalSignal?.removeEventListener('abort', abortFromExternal)
  }
}

export { apiBaseUrl }
