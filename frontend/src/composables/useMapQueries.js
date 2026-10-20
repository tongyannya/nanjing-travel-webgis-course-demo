import { ref } from 'vue'

import { prepareSearchResults } from '../search/searchResults'
import { apiRequest } from '../services/api'

function errorText(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback
}

export function useMapQueries({
  attractions,
  duckRestaurants = ref([]),
  focusLocation,
  hotels = ref([]),
  metroStations = ref([]),
  restaurants = ref([]),
  selectSearchResultOnMap,
  selectedLocation,
  selectedLocationLabel,
  setSearchMarkers,
}) {
  const searchKeyword = ref('')
  const searchCategory = ref('all')
  const searchAroundSelected = ref(false)
  const searchState = ref('idle')
  const searchMessage = ref('搜索结果可设为住处、起点或终点')
  const searchResults = ref([])
  const searchBatchId = ref(0)
  const selectedSearchResult = ref(null)
  const densityState = ref('idle')
  const densityResult = ref(null)
  const densityRadius = ref(500)
  const densityMessage = ref('统计当前地图选点周边餐饮样本')
  const originId = ref('attr_007')
  const destinationId = ref('attr_015')
  const travelMode = ref('public_transit')
  const travelState = ref('idle')
  const travelResult = ref(null)
  const travelMessage = ref('按需查询某两个景点的道路时间')

  async function runSearch() {
    searchBatchId.value += 1
    const currentBatchId = searchBatchId.value
    const keyword = searchKeyword.value.trim()
    if (!keyword) {
      searchState.value = 'error'
      searchMessage.value = '请输入搜索关键词。'
      return
    }
    const category = searchCategory.value
    const center = searchAroundSelected.value ? { ...selectedLocation.value } : null
    const searchOptions = { keyword, category, center, radiusMeters: 3000 }
    searchState.value = 'loading'
    searchMessage.value = '正在查询地点…'
    searchResults.value = []
    selectedSearchResult.value = null
    setSearchMarkers([])
    try {
      const params = new URLSearchParams({ keyword, category })
      if (center) {
        params.set('longitude', center.longitude)
        params.set('latitude', center.latitude)
        params.set('radius', '3000')
      }
      const result = await apiRequest(`/api/poi/search?${params}`)
      if (currentBatchId !== searchBatchId.value) return
      searchResults.value = prepareSearchResults(result.pois, {
        ...searchOptions,
        attractions: attractions.value,
        duckRestaurants: duckRestaurants.value,
        hotels: hotels.value,
        metroStations: metroStations.value,
        restaurants: restaurants.value,
      })
      setSearchMarkers(searchResults.value)
      searchState.value = 'success'
      searchMessage.value = searchResults.value.length
        ? `找到 ${searchResults.value.length} 条结果`
        : '没有找到匹配地点。'
    } catch (error) {
      if (currentBatchId !== searchBatchId.value) return
      searchResults.value = prepareSearchResults([], {
        ...searchOptions,
        attractions: attractions.value,
      })
      setSearchMarkers(searchResults.value)
      searchState.value = 'error'
      const local = searchResults.value.length
        ? `已找到 ${searchResults.value.length} 个收录景点；在线地点查询失败：`
        : ''
      searchMessage.value = local + errorText(error, '地点搜索失败。')
    }
  }

  function selectSearchResult(poi) {
    selectedSearchResult.value = poi
    if (!selectSearchResultOnMap?.(poi)) {
      focusLocation(poi, poi.name, poi.type?.includes('交通') ? 'station' : 'search')
    }
  }

  async function runDensity() {
    densityState.value = 'loading'
    densityMessage.value = '正在读取最多三页餐饮样本…'
    densityResult.value = null
    try {
      const params = new URLSearchParams({
        longitude: selectedLocation.value.longitude,
        latitude: selectedLocation.value.latitude,
        radius: String(densityRadius.value),
      })
      densityResult.value = await apiRequest(`/api/dining-density?${params}`, {}, 25000)
      densityState.value = 'success'
      densityMessage.value = `${selectedLocationLabel.value}周边：${densityResult.value.density_label}`
    } catch (error) {
      densityState.value = 'error'
      densityMessage.value = errorText(error, '餐饮便利度查询失败。')
    }
  }

  async function runTravelTime() {
    const origin = attractions.value.find((item) => item.id === originId.value)
    const destination = attractions.value.find((item) => item.id === destinationId.value)
    if (!origin || !destination || origin.id === destination.id) {
      travelState.value = 'error'
      travelMessage.value = '请选择两个不同的景点。'
      return
    }
    travelState.value = 'loading'
    travelMessage.value = '正在查询高德道路时间…'
    travelResult.value = null
    try {
      travelResult.value = await apiRequest('/api/travel-time', {
        method: 'POST',
        body: JSON.stringify({
          origin: origin.location,
          destination: destination.location,
          mode: travelMode.value,
        }),
      })
      travelState.value = 'success'
      travelMessage.value = `${origin.name} → ${destination.name}`
    } catch (error) {
      travelState.value = 'error'
      travelMessage.value = errorText(error, '交通时间查询失败。')
    }
  }

  return {
    densityMessage,
    densityRadius,
    densityResult,
    densityState,
    destinationId,
    originId,
    runDensity,
    runSearch,
    runTravelTime,
    searchAroundSelected,
    searchBatchId,
    searchCategory,
    searchKeyword,
    searchMessage,
    searchResults,
    searchState,
    selectedSearchResult,
    selectSearchResult,
    travelMessage,
    travelMode,
    travelResult,
    travelState,
  }
}
