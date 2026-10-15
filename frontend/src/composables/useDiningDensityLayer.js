import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'

import {
  diningDensityAreasFromSnapshot,
  DINING_SNAPSHOT_NOTE,
  ORDINARY_DENSITY_BANDS,
} from '../map/diningDensityData'
import { diningSnapshotRepository } from '../map/diningSnapshotData'

function errorText(error) {
  return error instanceof Error && error.message
    ? error.message
    : '餐饮分布数据加载失败，请稍后重试。'
}

export function useDiningDensityLayer(repository = diningSnapshotRepository) {
  const areas = shallowRef([])
  const cuisineShops = shallowRef([])
  const snapshotIndex = shallowRef(null)
  const duckAreas = computed(
    () => snapshotIndex.value?.data.cells.filter((cell) => cell.duck.shop_count > 0) || [],
  )
  const bands = ref(ORDINARY_DENSITY_BANDS)
  const dataState = ref('idle')
  const dataMessage = ref('开启“餐饮分布”后读取项目内的静态分档数据。')
  const dataNote = ref('')

  let abortController = null
  let requestSequence = 0

  const areaCount = computed(() => areas.value.length)

  function invalidatePendingRequest() {
    requestSequence += 1
    abortController?.abort()
    abortController = null
  }

  async function loadAreas({ force = false } = {}) {
    if (dataState.value === 'loading') return false
    if (dataState.value === 'success' && !force) return true

    invalidatePendingRequest()
    const sequence = requestSequence
    const controller = new AbortController()
    abortController = controller
    dataState.value = 'loading'
    dataMessage.value = '正在读取固定餐饮分布…'

    try {
      const index = await repository.load({ signal: controller.signal })
      if (sequence !== requestSequence) return false

      const normalized = diningDensityAreasFromSnapshot(index)
      snapshotIndex.value = index
      areas.value = normalized
      cuisineShops.value = index.cuisineShops
      dataNote.value = DINING_SNAPSHOT_NOTE
      dataState.value = 'success'
      dataMessage.value = normalized.length
        ? `已加载461格，显示${normalized.length}格：蓝82、黄75、红80；南京特色菜165家。`
        : '当前静态数据中没有可展示的餐饮密度区域。'
      return true
    } catch (error) {
      if (sequence !== requestSequence || controller.signal.aborted) return false
      areas.value = []
      cuisineShops.value = []
      snapshotIndex.value = null
      dataState.value = 'error'
      dataMessage.value = errorText(error)
      return false
    } finally {
      if (sequence === requestSequence) abortController = null
    }
  }

  function retryAreas() {
    return loadAreas({ force: true })
  }

  function cancelLoad() {
    invalidatePendingRequest()
    if (dataState.value === 'loading') {
      dataState.value = 'idle'
      dataMessage.value = '开启餐饮分布或南京特色菜后读取本地资料。'
    }
  }

  onBeforeUnmount(invalidatePendingRequest)

  return {
    areaCount,
    areas,
    cuisineShops,
    snapshotIndex,
    duckAreas,
    cancelLoad,
    bands,
    dataMessage,
    dataNote,
    dataState,
    loadAreas,
    retryAreas,
  }
}
