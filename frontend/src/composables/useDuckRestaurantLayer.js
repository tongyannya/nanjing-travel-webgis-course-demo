import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'

import { diningSnapshotRepository, DUCK_TYPES } from '../map/diningSnapshotData'
import { filterDuckShops } from '../map/duckRestaurantPresentation'

function errorText(error) {
  return error instanceof Error && error.message ? error.message : '鸭味地点加载失败，请稍后重试。'
}

export function useDuckRestaurantLayer(
  repository = diningSnapshotRepository,
  selectedDiningHex = ref(null),
) {
  const allDuckShops = shallowRef([])
  const selectedDuckTypes = ref([...DUCK_TYPES])
  const includeDuckTakeaway = ref(true)
  const onlyCurrentDining = ref(false)
  const scopedDuckShops = computed(() => {
    if (!onlyCurrentDining.value) return allDuckShops.value
    const cellId = selectedDiningHex.value?.id
    return cellId ? allDuckShops.value.filter((shop) => shop.display_hex_id === cellId) : []
  })
  const totalDuckRestaurantCount = computed(() => allDuckShops.value.length)
  const totalDuckFlavorCount = computed(
    () => new Set(allDuckShops.value.flatMap((shop) => shop.duck_types)).size,
  )
  const duckRestaurants = computed(() =>
    filterDuckShops(scopedDuckShops.value, selectedDuckTypes.value, includeDuckTakeaway.value),
  )
  const duckTypeCounts = computed(() =>
    Object.fromEntries(
      DUCK_TYPES.map((type) => [
        type,
        scopedDuckShops.value.filter(
          (shop) =>
            (includeDuckTakeaway.value || shop.service_mode !== 'takeaway') &&
            shop.duck_types.includes(type),
        ).length,
      ]),
    ),
  )
  const duckRestaurantState = ref('idle')
  const duckRestaurantMessage = ref('开启后读取本地收录的南京鸭门店。')
  const duckRestaurantNote = ref('')
  const duckRestaurantCount = computed(() => duckRestaurants.value.length)
  let requestSequence = 0

  async function loadDuckRestaurants({ force = false } = {}) {
    if (duckRestaurantState.value === 'loading') return false
    if (!force && duckRestaurantState.value === 'success') return true
    const sequence = ++requestSequence
    duckRestaurantState.value = 'loading'
    duckRestaurantMessage.value = '正在读取本地南京鸭门店…'
    try {
      const index = await repository.load()
      if (sequence !== requestSequence) return false
      allDuckShops.value = index.duckShops
      duckRestaurantNote.value = '南京鸭资料采集于2026年10月4日。'
      duckRestaurantState.value = 'success'
      duckRestaurantMessage.value = '南京鸭资料采集于2026年10月4日。'
      return true
    } catch (error) {
      if (sequence !== requestSequence) return false
      allDuckShops.value = []
      duckRestaurantNote.value = ''
      duckRestaurantState.value = 'error'
      duckRestaurantMessage.value = errorText(error)
      return false
    }
  }

  function retryDuckRestaurants() {
    return loadDuckRestaurants({ force: true })
  }

  function toggleDuckType(type) {
    if (!DUCK_TYPES.includes(type)) return
    selectedDuckTypes.value = selectedDuckTypes.value.includes(type)
      ? selectedDuckTypes.value.filter((value) => value !== type)
      : DUCK_TYPES.filter((value) => value === type || selectedDuckTypes.value.includes(value))
  }

  function resetDuckFilters() {
    selectedDuckTypes.value = [...DUCK_TYPES]
    includeDuckTakeaway.value = true
    onlyCurrentDining.value = false
  }

  onBeforeUnmount(() => {
    requestSequence += 1
  })

  return {
    onlyCurrentDining,
    totalDuckRestaurantCount,
    totalDuckFlavorCount,
    duckRestaurantCount,
    duckRestaurantMessage,
    duckRestaurantNote,
    duckRestaurants,
    duckRestaurantState,
    loadDuckRestaurants,
    retryDuckRestaurants,
    selectedDuckTypes,
    includeDuckTakeaway,
    duckTypeCounts,
    toggleDuckType,
    resetDuckFilters,
  }
}
