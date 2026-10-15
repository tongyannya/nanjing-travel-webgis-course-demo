import { computed, onBeforeUnmount, ref } from 'vue'

import { normalizeMetroNetwork } from '../map/metroData'
import { apiRequest } from '../services/api'

function errorText(error) {
  return error instanceof Error && error.message
    ? error.message
    : '地铁线路数据加载失败，请稍后重试。'
}

export function useMetroLayer() {
  const lines = ref([])
  const stations = ref([])
  const verifiedAt = ref('')
  const scopeNote = ref('')
  const dataState = ref('idle')
  const dataMessage = ref('开启“地铁”后读取项目内的静态线路数据。')

  let abortController = null
  let requestSequence = 0

  const lineCount = computed(() => lines.value.length)
  const majorStationCount = computed(
    () => stations.value.filter((station) => station.is_major).length,
  )

  function invalidatePendingRequest() {
    requestSequence += 1
    abortController?.abort()
    abortController = null
  }

  async function loadMetroNetwork({ force = false } = {}) {
    if (dataState.value === 'loading') return false
    // 成功后缓存：开关、缩放、平移都不会重新请求，只有 force 重试才再取一次。
    if (dataState.value === 'success' && !force) return true

    invalidatePendingRequest()
    const sequence = requestSequence
    const controller = new AbortController()
    abortController = controller
    dataState.value = 'loading'
    dataMessage.value = '正在读取主要地铁线路…'

    try {
      const result = await apiRequest('/api/metro-network', { signal: controller.signal })
      if (sequence !== requestSequence) return false

      const { lines: nextLines, stations: nextStations } = normalizeMetroNetwork(result)
      if (
        !nextLines.length ||
        nextLines.length !== (Array.isArray(result?.lines) ? result.lines.length : -1) ||
        nextStations.length !== (Array.isArray(result?.stations) ? result.stations.length : -1)
      ) {
        throw new Error('地铁线路数据的线路或站点字段不完整。')
      }
      lines.value = nextLines
      stations.value = nextStations
      verifiedAt.value = typeof result.verified_at === 'string' ? result.verified_at : ''
      scopeNote.value = typeof result.scope_note === 'string' ? result.scope_note : ''
      dataState.value = 'success'
      dataMessage.value = `已加载 ${nextLines.length} 条主要线路和 ${nextStations.filter((s) => s.is_major).length} 个主要站点。`
      return true
    } catch (error) {
      if (sequence !== requestSequence || controller.signal.aborted) return false
      lines.value = []
      stations.value = []
      dataState.value = 'error'
      dataMessage.value = errorText(error)
      return false
    } finally {
      if (sequence === requestSequence) abortController = null
    }
  }

  function retryMetroNetwork() {
    return loadMetroNetwork({ force: true })
  }

  onBeforeUnmount(invalidatePendingRequest)

  return {
    lineCount,
    lines,
    majorStationCount,
    scopeNote,
    stations,
    verifiedAt,
    dataMessage,
    dataState,
    loadMetroNetwork,
    retryMetroNetwork,
  }
}
