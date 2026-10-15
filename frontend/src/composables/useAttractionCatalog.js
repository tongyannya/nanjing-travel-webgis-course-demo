import { onBeforeUnmount, ref } from 'vue'
import { apiRequest } from '../services/api'

// The formal catalog owns form restoration; neither operation depends on the map SDK.
export function useAttractionCatalog({ attractions, initializeForm }) {
  const catalogState = ref('idle')
  const catalogMessage = ref('')
  let pending = null
  let controller = null
  let disposed = false

  function loadAttractions() {
    if (disposed) return Promise.resolve(false)
    if (catalogState.value === 'ready') return Promise.resolve(true)
    if (pending) return pending
    controller = new AbortController()
    catalogState.value = 'loading'
    catalogMessage.value = '正在加载正式景点…'
    pending = (async () => {
      try {
        const result = await apiRequest('/api/attractions', { signal: controller.signal })
        if (disposed) return false
        if (!Array.isArray(result.items) || !result.items.length) {
          throw new Error('正式景点目录为空，请检查后端数据。')
        }
        attractions.value = result.items
        initializeForm()
        catalogState.value = 'ready'
        catalogMessage.value = ''
        return true
      } catch (error) {
        if (!disposed) {
          catalogState.value = 'error'
          catalogMessage.value = error instanceof Error ? error.message : '正式景点加载失败。'
        }
        return false
      } finally {
        pending = null
        controller = null
      }
    })()
    return pending
  }

  onBeforeUnmount(() => {
    disposed = true
    controller?.abort()
  })

  return { catalogState, catalogMessage, loadAttractions }
}
