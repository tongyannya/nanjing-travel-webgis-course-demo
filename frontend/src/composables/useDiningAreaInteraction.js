import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { apiRequest } from '../services/api'
import { diningSnapshotRepository } from '../map/diningSnapshotData'
import { routeMealItems } from '../planning/routeMeals'
import {
  isValidDiningAreaSnapshot,
  diningAreaContextKey,
  diningDensityContextKey,
  normalizeRestaurantResults,
  isNanjingLocation,
  RESTAURANT_PAGE_SIZE,
} from '../planning/diningAreas'

const RESTAURANT_REQUEST_TIMEOUT_MS = 25_000
export const NEARBY_RESTAURANT_RADIUS_METERS = 600

function distanceMeters(a, b) {
  const radians = (value) => (value * Math.PI) / 180
  const h =
    Math.sin(radians(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(radians(a.latitude)) *
      Math.cos(radians(b.latitude)) *
      Math.sin(radians(b.longitude - a.longitude) / 2) ** 2
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h))))
}

function errorText(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback
}

export function useDiningAreaInteraction({
  activeDay,
  activePlanType,
  planResponse = ref(null),
  snapshotRepository = diningSnapshotRepository,
}) {
  const selectedMealItem = ref(null)
  const selectedOverviewArea = ref(null)
  const selectedNearbyArea = ref(null)
  const selectedContextKey = ref('')
  const restaurantState = ref('idle')
  const restaurantMessage = ref('选择用餐区域后，可按需查看范围内饭店。')
  const restaurantResponseNote = ref('')
  const restaurants = ref([])
  const selectedRestaurant = ref(null)

  let restaurantAbortController = null
  let requestSequence = 0
  let routePreloadSequence = 0
  const routePreloadControllers = new Set()
  const restaurantCache = new Map()
  const restaurantCacheVersion = ref(0)

  const activePlanIdentity = computed(
    () => planResponse.value?.request_id || planResponse.value?.generated_at || 'current-plan',
  )

  function routeContextKey(item) {
    const contextKey = diningAreaContextKey(item)
    if (!contextKey) return ''
    return [activePlanIdentity.value, activePlanType.value, contextKey].join(':')
  }

  const validMealAreaItems = computed(() => [
    ...routeMealItems(activeDay.value),
    ...(activeDay.value?.items || []).filter(
      (item) => item.type === 'meal_area' && isValidDiningAreaSnapshot(item.dining_area),
    ),
  ])
  const mealAreaCount = computed(() => validMealAreaItems.value.length)
  const selectedAreaKind = computed(() => {
    if (selectedNearbyArea.value) return 'nearby'
    if (selectedOverviewArea.value) return 'overview'
    if (selectedMealItem.value) return 'route'
    return 'none'
  })
  const selectedDiningArea = computed(() => {
    if (selectedAreaKind.value === 'nearby') return selectedNearbyArea.value
    if (selectedAreaKind.value === 'overview') return selectedOverviewArea.value
    return isValidDiningAreaSnapshot(selectedMealItem.value?.dining_area)
      ? selectedMealItem.value.dining_area
      : null
  })
  const selectedAreaState = computed(() => {
    if (selectedAreaKind.value === 'none') return 'idle'
    if (selectedAreaKind.value === 'overview') return 'ready'
    return selectedDiningArea.value ? 'ready' : 'error'
  })
  const restaurantCount = computed(() => restaurants.value.length)
  const mapRestaurants = computed(() => {
    restaurantCacheVersion.value
    const unique = new Map()
    for (const item of validMealAreaItems.value) {
      const cached = restaurantCache.get(routeContextKey(item))
      for (const restaurant of cached?.restaurants || []) {
        if (!unique.has(restaurant.poi_id)) unique.set(restaurant.poi_id, restaurant)
      }
    }
    for (const restaurant of restaurants.value) {
      if (!unique.has(restaurant.poi_id)) unique.set(restaurant.poi_id, restaurant)
    }
    return [...unique.values()]
  })
  const mapRestaurantCount = computed(() => mapRestaurants.value.length)

  function invalidateRoutePreload() {
    routePreloadSequence += 1
    for (const controller of routePreloadControllers) controller.abort()
    routePreloadControllers.clear()
  }

  function invalidatePendingRequest() {
    requestSequence += 1
    restaurantAbortController?.abort()
    restaurantAbortController = null
    invalidateRoutePreload()
  }

  function restaurantSearchPath(area) {
    const params = new URLSearchParams({
      longitude: String(area.center.longitude),
      latitude: String(area.center.latitude),
      radius_meters: String(area.radius_meters),
      page_num: '1',
      page_size: String(RESTAURANT_PAGE_SIZE),
    })
    return `/api/restaurants/search?${params}`
  }

  function requestRestaurantPage(area, signal) {
    return apiRequest(restaurantSearchPath(area), { signal }, RESTAURANT_REQUEST_TIMEOUT_MS)
  }

  function clearRestaurantResult(message = '点击“查看范围内饭店”后，加载当前区域第一页候选。') {
    restaurantState.value = 'idle'
    restaurantMessage.value = message
    restaurantResponseNote.value = ''
    restaurants.value = []
    selectedRestaurant.value = null
  }

  function restoreCachedResult(contextKey, fallbackMessage) {
    const cached = restaurantCache.get(contextKey)
    if (!cached) {
      clearRestaurantResult(fallbackMessage)
      return false
    }
    restaurantState.value = 'success'
    restaurantMessage.value = cached.message
    restaurantResponseNote.value = cached.note
    restaurants.value = cached.restaurants
    selectedRestaurant.value = null
    return true
  }

  function selectMealArea(item) {
    if (!item || item.type !== 'meal_area') return false
    const contextKey = routeContextKey(item)
    if (contextKey && contextKey === selectedContextKey.value) return true

    invalidatePendingRequest()
    selectedMealItem.value = item
    selectedOverviewArea.value = null
    selectedNearbyArea.value = null
    selectedContextKey.value = contextKey
    if (isValidDiningAreaSnapshot(item.dining_area)) {
      restoreCachedResult(contextKey, '点击“查看范围内饭店”后，加载当前区域第一页候选。')
    } else {
      clearRestaurantResult('当前用餐区域数据不完整，无法查询饭店，请重新生成方案。')
    }
    return true
  }

  function selectDiningDensityArea(area) {
    const contextKey = diningDensityContextKey(area)
    if (!contextKey) return false
    return selectOverviewArea(area, contextKey)
  }

  function selectDiningSnapshotCell(cell) {
    if (!cell?.ordinary || !cell?.boundary) return false
    const area = {
      id: cell.id,
      center: cell.center,
      boundary: cell.boundary,
      radius_meters: 600,
      density_level: cell.ordinary.band,
      density_label: `${cell.ordinary.meal_sample_count} 家餐饮`,
      meal_sample_count: cell.ordinary.meal_sample_count,
      is_capped: cell.ordinary.is_capped,
    }
    return selectOverviewArea(
      area,
      [`overview:${area.id}`, area.center.longitude, area.center.latitude, 600].join(':'),
    )
  }

  function selectOverviewArea(area, contextKey) {
    if (contextKey === selectedContextKey.value) return true

    invalidatePendingRequest()
    selectedMealItem.value = null
    selectedOverviewArea.value = area
    selectedNearbyArea.value = null
    selectedContextKey.value = contextKey
    restoreCachedResult(contextKey, '正在读取本格收录的餐饮资料…')
    return true
  }

  function selectNearbyDiningArea({ centerLabel, location, returnPanel = 'overview' }) {
    if (!isNanjingLocation(location)) return false
    invalidatePendingRequest()
    selectedMealItem.value = null
    selectedOverviewArea.value = null
    selectedNearbyArea.value = {
      id: `nearby:${location.longitude}:${location.latitude}`,
      name: `${centerLabel || '当前位置'}附近餐饮`,
      center: { ...location },
      radius_meters: NEARBY_RESTAURANT_RADIUS_METERS,
      restaurant_count: 0,
      density_level: 'nearby',
      density_label: '周边餐饮',
      has_suitable_area: true,
      is_capped: false,
      message: `按${centerLabel || '当前位置'}周边 ${NEARBY_RESTAURANT_RADIUS_METERS} 米查询第一页餐馆。`,
      note: '当前查询中心周边的餐饮资料。',
      source: 'amap',
      return_panel: returnPanel,
    }
    selectedContextKey.value = [
      'nearby',
      location.longitude,
      location.latitude,
      NEARBY_RESTAURANT_RADIUS_METERS,
    ].join(':')
    clearRestaurantResult('正在准备加载附近第一页餐馆候选…')
    return true
  }

  function selectRestaurant(restaurant) {
    if (!restaurants.value.some((item) => item.poi_id === restaurant?.poi_id)) {
      const cachedRoute = validMealAreaItems.value
        .map((item) => ({ item, key: routeContextKey(item) }))
        .map(({ item, key }) => ({ item, key, cached: restaurantCache.get(key) }))
        .find(({ cached }) =>
          cached?.restaurants?.some((item) => item.poi_id === restaurant?.poi_id),
        )
      if (cachedRoute) {
        selectedMealItem.value = cachedRoute.item
        selectedOverviewArea.value = null
        selectedNearbyArea.value = null
        selectedContextKey.value = cachedRoute.key
        restoreCachedResult(cachedRoute.key, '')
      }
    }
    selectedRestaurant.value =
      restaurants.value.find((item) => item.poi_id === restaurant?.poi_id) || null
  }

  async function loadRestaurants({ force = false } = {}) {
    const area = selectedDiningArea.value
    if (!area) {
      restaurantState.value = 'error'
      restaurantMessage.value =
        selectedAreaKind.value === 'route'
          ? '当前方案缺少有效餐饮区域，无法查询饭店，请重新生成方案。'
          : '当前没有可查询的餐饮区域。'
      return false
    }
    if (restaurantState.value === 'loading') return false
    if (restaurantState.value === 'success' && !force) return true

    invalidatePendingRequest()
    const sequence = requestSequence
    const contextKey = selectedContextKey.value
    const controller = new AbortController()
    restaurantAbortController = controller
    restaurantState.value = 'loading'
    const isOverview = selectedAreaKind.value === 'overview'
    restaurantMessage.value = isOverview ? '正在读取本格收录的餐饮资料…' : '正在加载当前区域饭店…'
    restaurantResponseNote.value = ''
    restaurants.value = []
    selectedRestaurant.value = null

    try {
      let result
      if (isOverview) {
        const index = await snapshotRepository.load({ signal: controller.signal })
        const cell = index.getCell(area.id)
        if (!cell || cell.ordinary.meal_sample_count !== area.meal_sample_count) {
          throw new Error('本格餐饮资料与分布数量不一致，请重试或核对本地数据。')
        }
        result = {
          restaurants: index.getOrdinaryShopsForCell(area.id).map((shop) => ({
            ...shop,
            distance_m: distanceMeters(cell.center, shop.location),
          })),
          note: `采集时间：${index.data.collection_period.ordinary_until.slice(0, 10)}。`,
        }
      } else {
        result = await requestRestaurantPage(area, controller.signal)
      }
      if (sequence !== requestSequence || contextKey !== selectedContextKey.value) return false

      restaurants.value = isOverview
        ? result.restaurants
        : normalizeRestaurantResults(result.restaurants)
      restaurantResponseNote.value = typeof result.note === 'string' ? result.note : ''
      restaurantState.value = 'success'
      restaurantMessage.value = restaurants.value.length
        ? isOverview
          ? `本格收录 ${restaurants.value.length} 家餐饮。`
          : `本次取得 ${restaurants.value.length} 家餐饮。`
        : '该区域本次未取得可展示饭店。'
      if (selectedAreaKind.value === 'overview' || selectedAreaKind.value === 'route') {
        restaurantCache.set(contextKey, {
          message: restaurantMessage.value,
          note: restaurantResponseNote.value,
          restaurants: restaurants.value,
        })
        restaurantCacheVersion.value += 1
      }
      return true
    } catch (error) {
      if (
        sequence !== requestSequence ||
        contextKey !== selectedContextKey.value ||
        controller.signal.aborted
      ) {
        return false
      }
      restaurantState.value = 'error'
      restaurantMessage.value = errorText(error, '饭店查询失败，请稍后重试。')
      return false
    } finally {
      if (sequence === requestSequence) restaurantAbortController = null
    }
  }

  async function loadRouteRestaurants({ force = false } = {}) {
    const planIdentity = activePlanIdentity.value
    const planType = activePlanType.value
    const routeAreas = validMealAreaItems.value.map((item) => ({
      area: item.dining_area,
      contextKey: routeContextKey(item),
    }))
    if (!routeAreas.length) return false
    if (routeAreas.every(({ area }) => area.boundary)) {
      invalidateRoutePreload()
      const sequence = routePreloadSequence
      const controller = new AbortController()
      routePreloadControllers.add(controller)
      try {
        const index = await snapshotRepository.load({ signal: controller.signal })
        if (
          sequence !== routePreloadSequence ||
          planIdentity !== activePlanIdentity.value ||
          planType !== activePlanType.value
        )
          return false
        for (const { area, contextKey } of routeAreas) {
          const shops = index.getOrdinaryShopsForCell(area.id)
          restaurantCache.set(contextKey, {
            restaurants: shops,
            note: '',
            message: `本格收录 ${shops.length} 家餐饮。`,
          })
        }
        restaurantCacheVersion.value += 1
        restaurantState.value = 'success'
        return true
      } catch (error) {
        if (sequence !== routePreloadSequence || controller.signal.aborted) return false
        restaurantState.value = 'error'
        restaurantMessage.value = errorText(error, '本地餐饮资料读取失败，请重试。')
        return false
      } finally {
        routePreloadControllers.delete(controller)
      }
    }

    const pendingAreas = force
      ? routeAreas
      : routeAreas.filter(({ contextKey }) => !restaurantCache.has(contextKey))
    if (!pendingAreas.length) {
      restaurantState.value = 'success'
      restaurantMessage.value = `当前路线 ${routeAreas.length} 个用餐区域的餐馆已加载。`
      return true
    }

    routePreloadSequence += 1
    const sequence = routePreloadSequence
    for (const controller of routePreloadControllers) controller.abort()
    routePreloadControllers.clear()
    restaurantState.value = 'loading'
    restaurantMessage.value = `正在加载当前路线 ${routeAreas.length} 个用餐区域的餐馆…`
    restaurantResponseNote.value = ''

    const results = await Promise.allSettled(
      pendingAreas.map(async ({ area, contextKey }) => {
        const controller = new AbortController()
        routePreloadControllers.add(controller)
        try {
          const result = await requestRestaurantPage(area, controller.signal)
          return {
            contextKey,
            note: typeof result.note === 'string' ? result.note : '',
            restaurants: normalizeRestaurantResults(result.restaurants),
          }
        } finally {
          routePreloadControllers.delete(controller)
        }
      }),
    )

    if (
      sequence !== routePreloadSequence ||
      planIdentity !== activePlanIdentity.value ||
      planType !== activePlanType.value
    ) {
      return false
    }

    let loadedCount = 0
    let firstError = null
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const loaded = result.value
        restaurantCache.set(loaded.contextKey, {
          message: loaded.restaurants.length
            ? `本次取得 ${loaded.restaurants.length} 家可展示饭店。`
            : '该区域本次未取得可展示饭店。',
          note: loaded.note,
          restaurants: loaded.restaurants,
        })
        loadedCount += 1
      } else if (!firstError) {
        firstError = result.reason
      }
    }
    if (loadedCount) restaurantCacheVersion.value += 1

    const cachedCount = routeAreas.filter(({ contextKey }) =>
      restaurantCache.has(contextKey),
    ).length
    if (cachedCount === routeAreas.length) {
      restaurantState.value = 'success'
      restaurantMessage.value = `已加载当前路线 ${routeAreas.length} 个用餐区域的餐馆。`
      return true
    }
    if (cachedCount > 0) {
      restaurantState.value = 'success'
      restaurantMessage.value = `已加载 ${cachedCount}/${routeAreas.length} 个用餐区域的餐馆，其余区域可稍后重试。`
      return true
    }
    restaurantState.value = 'error'
    restaurantMessage.value = errorText(firstError, '路线餐馆查询失败，请稍后重试。')
    return false
  }

  function retryRestaurants() {
    return loadRestaurants({ force: true })
  }

  function resetDiningContext() {
    invalidatePendingRequest()
    selectedMealItem.value = null
    selectedOverviewArea.value = null
    selectedNearbyArea.value = null
    selectedContextKey.value = ''
    clearRestaurantResult('选择用餐区域后，可按需查看范围内饭店。')
  }

  function cancelRoutePreloadForContextChange() {
    invalidateRoutePreload()
    if (selectedAreaKind.value === 'none' && restaurantState.value === 'loading') {
      clearRestaurantResult('选择用餐区域后，可按需查看范围内饭店。')
    }
  }

  watch(
    [activePlanType, activeDay],
    () => {
      if (selectedAreaKind.value === 'route') resetDiningContext()
      else cancelRoutePreloadForContextChange()
    },
    { flush: 'sync' },
  )
  watch(
    activePlanIdentity,
    (identity, previousIdentity) => {
      if (identity === previousIdentity) return
      for (const key of restaurantCache.keys()) {
        if (!key.startsWith('overview:')) restaurantCache.delete(key)
      }
      restaurantCacheVersion.value += 1
      if (selectedAreaKind.value === 'route') resetDiningContext()
      else cancelRoutePreloadForContextChange()
    },
    { flush: 'sync' },
  )
  onBeforeUnmount(invalidatePendingRequest)

  return {
    loadRestaurants,
    loadRouteRestaurants,
    mapRestaurantCount,
    mapRestaurants,
    mealAreaCount,
    restaurantCount,
    restaurantMessage,
    restaurantResponseNote,
    restaurants,
    restaurantState,
    resetDiningContext,
    retryRestaurants,
    selectDiningDensityArea,
    selectDiningSnapshotCell,
    selectMealArea,
    selectNearbyDiningArea,
    selectRestaurant,
    selectedAreaState,
    selectedAreaKind,
    selectedDiningArea,
    selectedMealItem,
    selectedNearbyArea,
    selectedOverviewArea,
    selectedRestaurant,
    validMealAreaItems,
  }
}
