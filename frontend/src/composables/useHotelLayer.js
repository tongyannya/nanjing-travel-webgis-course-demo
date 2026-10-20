import { getCurrentInstance, onBeforeUnmount, ref } from 'vue'

import { apiRequest } from '../services/api'

export const HOTEL_QUERY_RADIUS_METERS = 1000
export const HOTEL_QUERY_PAGE_SIZE = 20
export const HOTEL_QUERY_MAX_PAGES = 2

function errorText(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback
}

export function useHotelLayer({ getQueryCenter }) {
  const hotels = ref([])
  const hotelState = ref('idle')
  const hotelMessage = ref('开启后查看当前范围酒店，点击刷新更新。')
  const hotelCount = ref(0)
  const hotelQuery = ref(null)
  const hotelQueryComplete = ref(false)
  let requestSequence = 0
  let hotelAbortController = null

  async function queryHotels(
    centerOverride = null,
    { replace = false, fetchAllPages = false } = {},
  ) {
    const center =
      centerOverride || (typeof getQueryCenter === 'function' ? getQueryCenter() : null)
    if (!center || center.longitude == null || center.latitude == null) {
      hotelState.value = 'error'
      hotelMessage.value = '还没有可用的查询中心，请先在地图上选择位置或景点。'
      return
    }

    hotelAbortController?.abort()
    const requestId = ++requestSequence
    const controller = new AbortController()
    hotelAbortController = controller
    hotelState.value = 'loading'
    hotelQueryComplete.value = false
    hotelMessage.value = `正在查询 ${center.centerLabel || '当前范围'} 周边 ${HOTEL_QUERY_RADIUS_METERS} 米内酒店…`
    if (replace) {
      hotels.value = []
      hotelCount.value = 0
      hotelQuery.value = null
    }
    try {
      const params = new URLSearchParams({
        longitude: String(center.longitude),
        latitude: String(center.latitude),
        radius_meters: String(HOTEL_QUERY_RADIUS_METERS),
        page_num: '1',
        page_size: String(HOTEL_QUERY_PAGE_SIZE),
      })
      const uniqueHotels = new Map()
      let result
      let partial = false
      for (let page = 1; page <= HOTEL_QUERY_MAX_PAGES; page += 1) {
        params.set('page_num', String(page))
        try {
          result = await apiRequest(
            `/api/hotels/search?${params}`,
            { signal: controller.signal },
            25000,
          )
        } catch (error) {
          if (page === 1 || controller.signal.aborted) throw error
          partial = true
          break
        }
        if (requestId !== requestSequence || controller.signal.aborted) return false
        for (const hotel of result.hotels || []) {
          if (!uniqueHotels.has(hotel.poi_id)) uniqueHotels.set(hotel.poi_id, hotel)
        }
        if (!fetchAllPages && !result.has_more) break
      }
      if (requestId !== requestSequence) return false
      hotels.value = [...uniqueHotels.values()]
      hotelCount.value = hotels.value.length
      hotelQuery.value = {
        centerLabel: center.centerLabel || '当前选点',
        radiusMeters: result.radius_meters || HOTEL_QUERY_RADIUS_METERS,
        longitude: center.longitude,
        latitude: center.latitude,
      }
      hotelState.value = 'success'
      hotelQueryComplete.value = !partial
      hotelMessage.value = hotelCount.value
        ? `以${hotelQuery.value.centerLabel}为中心 ${hotelQuery.value.radiusMeters} 米内找到 ${hotelCount.value} 家酒店`
        : `${hotelQuery.value.centerLabel} 周边 ${hotelQuery.value.radiusMeters} 米内没有查到酒店。`
      if (partial)
        hotelMessage.value += fetchAllPages
          ? '；第二页暂未取得，已保留第一页结果，再次点击片区圆圈可重新查询。'
          : '；第二页暂未取得，已保留第一页结果，可点击刷新重试。'
    } catch (error) {
      if (requestId !== requestSequence || controller.signal.aborted) return false
      hotelState.value = 'error'
      hotelMessage.value = errorText(error, '酒店查询失败，请稍后重试。')
      return false
    } finally {
      if (requestId === requestSequence) hotelAbortController = null
    }
    return true
  }

  function refreshHotels() {
    return queryHotels()
  }

  function cancelQuery() {
    requestSequence += 1
    hotelAbortController?.abort()
    hotelAbortController = null
    if (hotelState.value === 'loading') hotelState.value = hotelQuery.value ? 'success' : 'idle'
  }

  if (getCurrentInstance()) {
    onBeforeUnmount(() => {
      requestSequence += 1
      hotelAbortController?.abort()
      hotelAbortController = null
    })
  }

  return {
    hotels,
    hotelCount,
    hotelMessage,
    hotelQuery,
    hotelQueryComplete,
    hotelState,
    queryHotels,
    refreshHotels,
    cancelQuery,
  }
}
