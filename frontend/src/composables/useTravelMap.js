import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import { createDiningMapLayers } from '../map/diningMapLayers'
import { createDuckDensityMapLayer } from '../map/duckDensityMapLayer'
import { createDiningDensityMapLayer } from '../map/diningDensityMapLayer'
import { createDuckRestaurantMapLayer } from '../map/duckRestaurantMapLayer'
import { DUCK_TYPES } from '../map/diningSnapshotData'
import { displayedDuckType } from '../map/duckRestaurantPresentation'
import { createMetroMapLayer } from '../map/metroMapLayer'
import { duckRestaurantInfoLines, duckTypeLabel } from '../planning/duckDiningPresentation'
import { apiRequest } from '../services/api'
import { loadAMap } from '../services/amap'
import { createPlaceMapLayers } from '../map/placeMapLayers'
import { createAccommodationMapLayers } from '../map/accommodationMapLayers'
import { routeSequenceByItemId } from '../planning/routeMeals'
import { createPlanMapLayer } from '../map/planMapLayer'
import { createDraggableDuckGuideLayer } from '../map/draggableDuckGuideLayer'
import { useDuckCulture } from './useDuckCulture'

const NANJING_CENTER = [118.7969, 32.0603]
const LAOMENDONG_CENTER = { longitude: 118.787645, latitude: 32.011604 }
function errorText(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback
}

export function useTravelMap({
  attractions,
  activeDay,
  activeDayIndex = ref(0),
  activePlan = ref(null),
  activeTripRequest = ref(null),
  duckGuideVisible = ref(false),
  duckGuidePayload = ref({}),
  attractionLayerVisible,
  hotelLayerVisible,
  hotelQuery = ref(null),
  nearbyHotelLayerVisible = hotelLayerVisible,
  nearbyHotelRangeSelected = ref(false),
  onHotelQuerySelect,
  accommodationAreasVisible = ref(false),
  accommodationAreaPicking = ref(false),
  selectedAccommodationArea = ref(null),
  activeAccommodationAreaIds = ref([]),
  onAccommodationAreaSelect,
  diningDensityAreas = ref([]),
  duckDensityAreas = ref([]),
  duckDensityLayerVisible = ref(false),
  selectedDiningHex = ref(null),
  onDuckDensityAreaSelect,
  onDuckRestaurantSelect,
  onDuckCultureSelect,
  onDuckGuideArticleSelect,
  cuisineShops = ref([]),
  cuisineLayerVisible = ref(false),
  nearbyDiningLayerVisible = ref(true),
  diningDensityLayerVisible = ref(false),
  diningAreaLayerVisible,
  duckRestaurantLayerVisible = ref(false),
  duckRestaurants = ref([]),
  selectedDuckTypes = ref([...DUCK_TYPES]),
  mapAttractionFilter,
  mapViewportPadding = ref([90, 80, 120, 80]),
  tripForm = ref(null),
  loadAttractions,
  metroLines = ref([]),
  metroLayerVisible = ref(false),
  metroStations = ref([]),
  onAttractionSelect,
  onAttractionMarkerClick,
  onHotelSelect,
  onMapClick,
  getRestaurantFocusArea,
  onDiningDensityAreaSelect,
  onDiningAreaSelect,
  onLocationResolved,
  onMetroStationSelect,
  onRestaurantSelect,
  onSearchResultSelect,
  restaurantLayerVisible,
  restaurants,
  routeLayerVisible,
  searchLayerVisible = ref(true),
  currentLodging = ref(null),
  currentLodgingLayerVisible = ref(true),
  selectedMealItem,
  selectedMetroStation = ref(null),
  selectedOverviewArea = ref(null),
  selectedRestaurant,
  validMealAreaItems,
  onSearchResultDetails,
}) {
  const mapContainer = ref(null)
  const mapState = ref('loading')
  const mapMessage = ref('正在加载南京地图…')
  const selectedLocation = ref({ ...LAOMENDONG_CENTER })
  const selectedLocationLabel = ref('老门东地图选点')
  const selectedLocationSource = ref('map_click')
  const selectedMapPoint = ref(null)
  const freeMapPoint = ref(null)
  const mapFocusInProgress = ref(false)
  const selectedAttractionId = computed(() =>
    selectedMapPoint.value?.kind === 'attraction' ? selectedMapPoint.value.key : '',
  )
  const locateState = ref('idle')
  const locateMessage = ref('定位功能暂未测试，可使用搜索或地图点选')
  const focusedPlanLegId = ref('')
  const focusedPlanLegGeometry = ref('none')
  const focusedPlanLegSegmentCount = ref(0)
  const expandedPlanLegIds = ref([])
  const allPlanLegsExpanded = computed(() => {
    const legs = activeDay.value?.legs || []
    return (
      legs.length > 0 &&
      legs.every((leg) =>
        expandedPlanLegIds.value.includes(`${leg.from_item_id}-${leg.to_item_id}`),
      )
    )
  })
  const diningAreaOverlayCount = ref(0)
  const diningDensityOverlayCount = ref(0)
  const duckDensityOverlayCount = ref(0)
  const metroPolylineCount = ref(0)
  const metroStationCount = ref(0)
  const restaurantMarkerCount = ref(0)
  const duckRestaurantMarkerCount = ref(0)

  let AMap
  let map
  let infoWindow
  let mapOutsideClickHandler = null
  let duckRestaurantMapLayer = null
  let diningMapLayers = null
  let diningDensityMapLayer = null
  let duckDensityMapLayer = null
  let metroMapLayer = null
  let locateRequestSequence = 0
  let mapInitializationSequence = 0
  let disposed = false
  let mapEventHandlers = []
  let mapConfigController = null
  let duckGuideLayer = null
  const duckGuideCulture = useDuckCulture()
  const guideSelectedRestaurant = ref(null)
  const selectedDuckGuideType = computed(() => {
    const matchesSelection = (shop) =>
      shop?.name === selectedLocationLabel.value &&
      Math.abs(shop?.location?.longitude - selectedLocation.value?.longitude) < 0.000001 &&
      Math.abs(shop?.location?.latitude - selectedLocation.value?.latitude) < 0.000001
    const restaurant = guideSelectedRestaurant.value
    const shop =
      (restaurant?.duck_types?.length && restaurant) ||
      (restaurant && duckRestaurants.value.find((shop) => shop.poi_id === restaurant.poi_id)) ||
      duckRestaurants.value.find(matchesSelection)
    return shop
      ? shop.featured_duck_type ||
          displayedDuckType(shop, selectedDuckTypes.value) ||
          shop.duck_types[0]
      : ''
  })

  function syncDuckGuide() {
    if (!map || mapState.value !== 'ready' || disposed) return
    if (!duckGuideLayer && duckGuideVisible.value) {
      duckGuideLayer = createDraggableDuckGuideLayer({
        container: mapContainer.value,
        culture: duckGuideCulture,
        onArticleSelect: onDuckGuideArticleSelect,
      })
    }
    duckGuideLayer?.update({
      ...duckGuidePayload.value,
      selectedDuckType: selectedDuckGuideType.value,
    })
    duckGuideLayer?.setVisible(duckGuideVisible.value)
  }

  const getMapContext = () => ({ map, AMap, infoWindow })
  const accommodationLayers = createAccommodationMapLayers({
    getMapContext,
    getPadding: () => fitPadding(),
    onAreaSelect: onAccommodationAreaSelect,
    onHotelQuerySelect,
  })

  function syncAccommodationLayers() {
    accommodationLayers.syncAreas({
      show: accommodationAreasVisible.value,
      choosing: accommodationAreaPicking.value,
      selectedAreaId: selectedAccommodationArea.value?.id || '',
      activeAreaIds: activeAccommodationAreaIds.value,
    })
    accommodationLayers.syncHotelQuery(
      hotelQuery.value,
      nearbyHotelLayerVisible.value,
      nearbyHotelRangeSelected.value,
    )
    if (mapContainer.value) {
      mapContainer.value.dataset.accommodationAreas = String(accommodationLayers.areaCount)
      mapContainer.value.dataset.hotelQueryRadius =
        nearbyHotelLayerVisible.value && hotelQuery.value
          ? String(hotelQuery.value.radiusMeters)
          : ''
    }
  }

  function fitAccommodationAreas(options = {}) {
    return accommodationLayers.fitAreas('', options)
  }

  function fitAccommodationArea(area) {
    return accommodationLayers.fitAreas(area?.id || '')
  }
  const placeLayers = createPlaceMapLayers({
    getMapContext,
    activeDay,
    routeLayerVisible,
    attractions,
    selectedAttractionId,
    selectedMapPoint,
    attractionLayerVisible,
    mapAttractionFilter,
    hotelLayerVisible,
    searchLayerVisible,
    currentLodging,
    currentLodgingLayerVisible,
    focusLocation,
    fitPadding,
    buildInfoContent,
    onAttractionSelect,
    onAttractionMarkerClick,
    onHotelSelect,
    onSearchResultSelect,
    onSearchResultDetails,
  })
  const {
    focusAttraction,
    focusCurrentLodging,
    syncLodgingMarker,
    applyLodgingMarkerVisibility,
    addAttractionMarkers,
    applyAttractionMarkerVisibility,
    selectSearchResultOnMap,
    setSearchMarkers,
    setHotelMarkers,
    applyHotelMarkerVisibility,
    fitAttractions,
  } = placeLayers
  const planLayer = createPlanMapLayer({
    getMapContext,
    isDisposed: () => disposed,
    activeDay,
    activeDayIndex,
    activePlan,
    activeTripRequest,
    tripForm,
    currentLodging,
    mapState,
    selectedAttractionId,
    selectedMapPoint,
    routeLayerVisible,
    focusedPlanLegId,
    focusedPlanLegGeometry,
    focusedPlanLegSegmentCount,
    expandedPlanLegIds,
    fitPadding,
    focusPlanItem,
    onDiningAreaSelect,
  })
  const {
    clearPlanLayers,
    applyPlanLayerVisibility,
    renderActivePlanOnMap,
    fitPlanOverview,
    clearFocusedPlanLeg,
    focusPlanLeg,
    toggleAllPlanLegs,
  } = planLayer

  const selectedCoordinateText = computed(
    () =>
      `${selectedLocation.value.longitude.toFixed(6)}, ${selectedLocation.value.latitude.toFixed(6)}`,
  )

  function buildInfoContent(title, lines) {
    const container = document.createElement('div')
    container.className = 'map-info-window'
    const close = document.createElement('button')
    close.type = 'button'
    close.className = 'map-info-window__close'
    close.setAttribute('aria-label', '关闭地点信息')
    close.textContent = '×'
    close.addEventListener('click', (event) => {
      event.stopPropagation()
      infoWindow?.close()
    })
    container.appendChild(close)
    const heading = document.createElement('strong')
    heading.textContent = title
    container.appendChild(heading)
    lines.filter(Boolean).forEach((line) => {
      const paragraph = document.createElement('p')
      paragraph.textContent = line
      container.appendChild(paragraph)
    })
    return container
  }

  function sameSelectedPoint(item) {
    const point = selectedMapPoint.value?.item
    const selected = point?.searchDetailItem || point
    return Boolean(
      selected &&
      item?.name === selected.name &&
      Math.abs(item?.location?.longitude - selected.location.longitude) < 0.000001 &&
      Math.abs(item?.location?.latitude - selected.location.latitude) < 0.000001,
    )
  }

  function syncPointSelection() {
    const point = selectedMapPoint.value
    placeLayers.applyPointSelection()
    planLayer.applyAttractionMarkerSelection()
    metroMapLayer?.selectStation(point?.kind === 'metro' ? point.key : '')
    const restaurant = point?.kind === 'restaurant' ? point.item : null
    diningMapLayers?.selectRestaurant(restaurant?.poi_id)
    duckRestaurantMapLayer?.selectRestaurant(restaurant)
  }

  function selectMapPoint(selection) {
    if (selection) {
      freeMapPoint.value = null
      accommodationLayers.syncFreePoint(null)
    }
    infoWindow?.close?.()
    selectedMapPoint.value = selection
      ? {
          ...selection,
          key: String(
            selection.key ||
              selection.item.id ||
              selection.item.poi_id ||
              selection.item.item_id ||
              selection.item.name,
          ),
        }
      : null
    guideSelectedRestaurant.value = null
    syncPointSelection()
  }

  function focusLocation(item, label = item.name, source = 'search', selection) {
    if (!Number.isFinite(item?.location?.longitude) || !Number.isFinite(item?.location?.latitude)) {
      return false
    }
    const attraction = attractions.value.find(
      (candidate) =>
        candidate.name === label &&
        Math.abs(candidate.location.longitude - item.location.longitude) < 0.000001 &&
        Math.abs(candidate.location.latitude - item.location.latitude) < 0.000001,
    )
    selectMapPoint(
      selection || { kind: attraction ? 'attraction' : 'location', item: attraction || item },
    )
    selectedLocation.value = {
      longitude: item.location.longitude,
      latitude: item.location.latitude,
    }
    selectedLocationLabel.value = label
    selectedLocationSource.value = source
    mapFocusInProgress.value = true
    nextTick(() => {
      mapFocusInProgress.value = false
    })
    if (map && selection?.focus !== false) {
      const station =
        source === 'station' ||
        selection?.kind === 'metro' ||
        item.source_method === 'station' ||
        ['metro', 'station', 'airport'].includes(item.display_icon) ||
        item.searchDetailKind === 'metro' ||
        String(item.type || '').includes('交通')
      const restaurantArea = selection?.kind === 'restaurant' && getRestaurantFocusArea?.(item)
      if (station) return true
      if (selection?.kind === 'hotel') {
        if (selection.hotelScope === 'area' && accommodationAreasVisible.value) {
          const id = activeAccommodationAreaIds.value[0] || selectedAccommodationArea.value?.id
          if (id && accommodationLayers.fitAreas(id)) return true
        } else if (selection.hotelScope === 'nearby' && nearbyHotelLayerVisible.value) {
          if (accommodationLayers.fitHotelQuery()) return true
        }
      }
      if (restaurantArea) {
        if (restaurantArea.kind === 'duck') focusDuckDensityArea(restaurantArea.cell)
        else focusDiningDensityArea(restaurantArea.cell)
        return true
      }
      const p = map.lngLatToContainer?.([item.location.longitude, item.location.latitude])
      const size = map.getSize?.() || {
        width: mapContainer.value?.clientWidth,
        height: mapContainer.value?.clientHeight,
      }
      const [top, right, bottom, left] = fitPadding()
      const inside =
        p && p.x >= left && p.x <= size.width - right && p.y >= top && p.y <= size.height - bottom
      const comfortable =
        inside &&
        p.x >= left + 48 &&
        p.x <= size.width - right - 48 &&
        p.y >= top + 48 &&
        p.y <= size.height - bottom - 48
      if (!(comfortable && Math.abs((map.getZoom?.() ?? 0) - 15) < 0.01)) {
        map.setZoomAndCenter(15, [item.location.longitude, item.location.latitude], !inside)
      }
    }
    return true
  }

  function clearHotelSelection() {
    if (selectedMapPoint.value?.kind === 'hotel') selectMapPoint(null)
  }

  function syncMarkerDisplay() {
    if (mapContainer.value && map) {
      mapContainer.value.dataset.markerDisplay = (map.getZoom?.() ?? 12) < 14 ? 'dots' : 'icons'
    }
  }

  function fitPadding(fallback = [90, 80, 120, 80]) {
    const candidate = Array.isArray(mapViewportPadding)
      ? mapViewportPadding
      : mapViewportPadding?.value
    if (
      !Array.isArray(candidate) ||
      candidate.length !== 4 ||
      candidate.some((value) => !Number.isFinite(Number(value)))
    ) {
      return fallback
    }
    return candidate.map(Number)
  }

  function syncDiningAreaLayers() {
    if (!diningMapLayers) return
    const sequenceByItemId = routeSequenceByItemId(activeDay.value)
    diningAreaOverlayCount.value = diningMapLayers.renderAreas(validMealAreaItems.value, {
      selectedItemId: selectedMealItem.value?.item_id,
      sequenceByItemId,
      visible: diningAreaLayerVisible.value,
    })
  }

  function syncDiningDensityLayers() {
    if (!diningDensityMapLayer) return
    diningDensityOverlayCount.value = diningDensityMapLayer.render(diningDensityAreas.value, {
      selectedAreaId: selectedDiningHex.value?.id || selectedOverviewArea.value?.id,
      visible: diningDensityLayerVisible.value,
      borderOnly: duckDensityLayerVisible.value,
    })
  }

  function syncDuckDensityLayers() {
    if (
      !duckDensityMapLayer &&
      map &&
      AMap &&
      duckDensityAreas.value.length &&
      duckDensityLayerVisible.value
    ) {
      duckDensityMapLayer = createDuckDensityMapLayer({
        AMap,
        map,
        onAreaSelect: onDuckDensityAreaSelect,
      })
    }
    if (!duckDensityMapLayer) return
    duckDensityOverlayCount.value = duckDensityMapLayer.render(duckDensityAreas.value, {
      selectedAreaId: selectedDiningHex.value?.id,
      visible: duckDensityLayerVisible.value,
    })
  }

  function syncMetroLayers() {
    if (!metroMapLayer) return
    const rendered = metroMapLayer.render(metroLines.value, metroStations.value, {
      selectedStationId: selectedMapPoint.value?.kind === 'metro' ? selectedMapPoint.value.key : '',
      visible: metroLayerVisible.value,
    })
    metroPolylineCount.value = rendered.polylineCount
    metroStationCount.value = rendered.stationCount
  }

  function focusMetroStation(station) {
    if (!station) return
    if (!sameSelectedPoint(station) || selectedMapPoint.value?.kind !== 'search') {
      focusLocation(station, station.name, 'station', {
        kind: 'metro',
        item: station,
        focus: false,
      })
    }
    metroMapLayer?.focusStation(station)
  }

  function syncRestaurantLayers() {
    if (!diningMapLayers) return
    restaurantMarkerCount.value = diningMapLayers.renderRestaurants(restaurants.value, {
      selectedPoiId:
        selectedMapPoint.value?.kind === 'restaurant' ? selectedMapPoint.value.item.poi_id : '',
      visible: restaurantLayerVisible.value,
      cuisineShops: cuisineShops.value,
      cuisineVisible: cuisineLayerVisible.value,
      nearbyVisible: nearbyDiningLayerVisible.value,
      excludedPoiIds: duckRestaurantLayerVisible.value
        ? duckRestaurants.value.map((shop) => shop.poi_id)
        : [],
    })
  }

  function syncDuckRestaurantLayers() {
    if (
      !duckRestaurantMapLayer &&
      map &&
      AMap &&
      duckRestaurantLayerVisible.value &&
      duckRestaurants.value.length
    ) {
      duckRestaurantMapLayer = createDuckRestaurantMapLayer({
        AMap,
        map,
        onCountChange: (count) => {
          duckRestaurantMarkerCount.value = count
        },
        onRestaurantSelect: (shop) => {
          focusLocation(shop, shop.name, 'search', { kind: 'restaurant', item: shop })
          onDuckRestaurantSelect?.(shop)
          showRestaurantInfo(shop)
        },
      })
    }
    if (!duckRestaurantMapLayer) return
    duckRestaurantMapLayer.render(duckRestaurants.value, {
      visible: duckRestaurantLayerVisible.value,
      types: selectedDuckTypes.value,
      selectedPoiId:
        selectedMapPoint.value?.kind === 'restaurant' ? selectedMapPoint.value.item.poi_id : '',
    })
  }

  function showRestaurantInfo(restaurant) {
    const location = restaurant?.location
    if (
      !map ||
      !infoWindow ||
      !Number.isFinite(location?.longitude) ||
      !Number.isFinite(location?.latitude)
    )
      return false
    if (
      !sameSelectedPoint(restaurant) ||
      !['restaurant', 'search'].includes(selectedMapPoint.value?.kind)
    ) {
      focusLocation(restaurant, restaurant.name, 'search', { kind: 'restaurant', item: restaurant })
    } else if (!mapFocusInProgress.value && getRestaurantFocusArea?.(restaurant)) {
      focusLocation(restaurant, restaurant.name, 'search', { kind: 'restaurant', item: restaurant })
    }
    guideSelectedRestaurant.value = restaurant
    const rating = restaurant.rating == null ? '评分暂无' : `评分 ${restaurant.rating}`
    const cost = restaurant.average_cost ?? restaurant.average_cost_yuan
    const content = buildInfoContent(restaurant.name, [
      restaurant.address || '地址暂无',
      `${rating} · ${cost == null ? '人均暂无' : `人均约 ${cost} 元`}`,
    ])
    content.dataset.restaurantInfo = restaurant.poi_id
    const duckShop = restaurant.duck_types?.length
      ? restaurant
      : duckRestaurants.value.find((shop) => shop.poi_id === restaurant.poi_id)
    if (duckShop) {
      const duckType = displayedDuckType(duckShop, selectedDuckTypes.value)
      const link = document.createElement('button')
      link.type = 'button'
      link.className = 'map-info-culture-link'
      link.dataset.duckCultureType = duckType
      link.textContent = `了解${duckTypeLabel(duckType)}`
      link.addEventListener('click', () => onDuckCultureSelect?.(duckType))
      content.appendChild(link)
    }
    infoWindow.setContent(content)
    infoWindow.open(map, [location.longitude, location.latitude])
    return true
  }

  async function initializeMap() {
    if (disposed) return
    destroyMap()
    const requestId = mapInitializationSequence
    const isCurrent = () => !disposed && requestId === mapInitializationSequence
    const configController = new AbortController()
    mapConfigController = configController
    mapState.value = 'loading'
    mapMessage.value = '正在加载南京地图与景点…'
    try {
      const [catalogLoaded, loadedAMap] = await Promise.all([
        loadAttractions(),
        (async () => {
          const config = await apiRequest('/api/map/config', { signal: configController.signal })
          if (!isCurrent()) return null
          if (!config.enabled) throw new Error(config.message)
          return loadAMap({
            jsKey: config.js_key,
            securityProxyUrl: new URL(config.security_proxy_url, window.location.origin).href,
          })
        })(),
      ])
      if (!isCurrent()) return
      if (!catalogLoaded) throw new Error('正式景点加载失败，请恢复后端连接后重试。')
      await nextTick()
      if (!isCurrent()) return
      AMap = loadedAMap
      map = new AMap.Map(mapContainer.value, {
        center: NANJING_CENTER,
        mapStyle: 'amap://styles/whitesmoke',
        zoom: 12,
        viewMode: '2D',
        doubleClickZoom: false,
      })
      diningMapLayers = createDiningMapLayers({
        AMap,
        map,
        getFitPadding: () => fitPadding([130, 110, 180, 110]),
        onAreaSelect: onDiningAreaSelect,
        onRestaurantSelect: (restaurant) => {
          focusLocation(restaurant, restaurant.name, 'search', {
            kind: 'restaurant',
            item: restaurant,
          })
          onRestaurantSelect?.(restaurant)
          showRestaurantInfo(restaurant)
        },
      })
      diningDensityMapLayer = createDiningDensityMapLayer({
        AMap,
        map,
        onAreaSelect: onDiningDensityAreaSelect,
      })
      syncDuckDensityLayers()
      metroMapLayer = createMetroMapLayer({
        AMap,
        map,
        onStationSelect: (station) => {
          focusLocation(station, station.name, 'station', {
            kind: 'metro',
            item: station,
            focus: false,
          })
          onMetroStationSelect?.(station)
        },
      })
      syncDiningDensityLayers()
      syncMetroLayers()
      syncDiningAreaLayers()
      syncRestaurantLayers()
      infoWindow = new AMap.InfoWindow({
        isCustom: true,
        offset: new AMap.Pixel(0, -28),
        autoMove: false,
      })
      mapOutsideClickHandler = (event) => {
        if (
          !(event.target instanceof Element) ||
          event.target.closest(
            '.amap-info, .map-info-window, .amap-marker, .map-symbol-marker, .draggable-duck-guide-layer, .duck-guide-dialog',
          )
        )
          return
        selectMapPoint(null)
      }
      mapContainer.value.addEventListener('click', mapOutsideClickHandler, true)
      const initializedMap = map
      syncMarkerDisplay()
      const completeHandler = () => {
        if (!isCurrent() || map !== initializedMap) return
        mapState.value = 'ready'
        mapMessage.value = `南京主要旅游区域 · ${attractions.value.length} 个正式景点`
        syncAccommodationLayers()
        if (!fitAccommodationAreas() && !activeDay.value) fitAttractions()
      }
      const clickHandler = (event) => {
        if (!isCurrent() || map !== initializedMap) return
        guideSelectedRestaurant.value = null
        selectMapPoint(null)
        selectedLocation.value = {
          longitude: event.lnglat.getLng(),
          latitude: event.lnglat.getLat(),
        }
        selectedLocationLabel.value = '地图点击位置'
        selectedLocationSource.value = 'map_click'
        freeMapPoint.value = { ...selectedLocation.value }
        accommodationLayers.syncFreePoint(freeMapPoint.value)
        onMapClick?.()
      }
      mapEventHandlers = [
        ['complete', completeHandler],
        ['click', clickHandler],
        ['zoomchange', syncMarkerDisplay],
      ]
      mapEventHandlers.forEach(([event, handler]) => map.on(event, handler))
      addAttractionMarkers()
      placeLayers.restoreSearchMarkers()
      syncDuckRestaurantLayers()
      // Draw hotel batches that arrived while the SDK was still loading.
      placeLayers.restoreHotelMarkers()
      syncLodgingMarker()
      syncAccommodationLayers()
      accommodationLayers.syncFreePoint(freeMapPoint.value)
    } catch (error) {
      if (!isCurrent()) return
      destroyMap()
      mapState.value = 'error'
      mapMessage.value = errorText(error, '地图加载失败，请检查配置和网络。')
    } finally {
      if (mapConfigController === configController) mapConfigController = null
    }
  }

  function requestLocation() {
    if (!map || !AMap) {
      locateState.value = 'error'
      locateMessage.value = '地图尚未加载，不能请求当前位置。'
      return
    }
    const requestId = ++locateRequestSequence
    const locatedMap = map
    locateState.value = 'loading'
    locateMessage.value = '正在请求浏览器定位权限…'
    AMap.plugin('AMap.Geolocation', () => {
      if (disposed || requestId !== locateRequestSequence || map !== locatedMap) return
      const geolocation = new AMap.Geolocation({
        enableHighAccuracy: true,
        timeout: 10000,
        zoomToAccuracy: true,
      })
      geolocation.getCurrentPosition((status, result) => {
        if (disposed || requestId !== locateRequestSequence || map !== locatedMap) return
        if (status === 'complete' && result.position) {
          selectedLocation.value = {
            longitude: result.position.lng,
            latitude: result.position.lat,
          }
          selectedLocationLabel.value = '当前位置'
          selectedLocationSource.value = 'current_location'
          selectMapPoint(null)
          freeMapPoint.value = null
          accommodationLayers.syncFreePoint(null)
          locateState.value = 'success'
          locateMessage.value = `定位成功，精度约 ${Math.round(result.accuracy || 0)} 米`
          map.setZoomAndCenter(16, [result.position.lng, result.position.lat])
          onLocationResolved?.({
            centerLabel: '当前位置',
            location: {
              longitude: result.position.lng,
              latitude: result.position.lat,
              coord_system: 'GCJ-02',
            },
          })
        } else {
          locateState.value = 'error'
          locateMessage.value = '定位失败或权限被拒绝，请使用搜索或地图点选。'
        }
      })
    })
  }

  function focusPlanItem(item, { focus = true } = {}) {
    clearFocusedPlanLeg()
    if (item?.type === 'attraction') {
      const attraction = attractions.value.find((candidate) => candidate.id === item.ref_id)
      // Route nodes only carry the PlanResponse snapshot. Reuse the formal attraction path so
      // map and dock details stay identical to clicking the underlying attraction marker.
      if (attraction && focusAttraction(attraction)) return
    }
    focusLocation(item, item.name, 'search', { kind: 'plan', item, focus })
    if (item.type === 'duck_restaurant') {
      guideSelectedRestaurant.value = {
        ...item.duck_restaurant,
        featured_duck_type: item.featured_duck_type,
      }
    }
    if (!map || !infoWindow) return
    const details = [`${item.start_time}—${item.end_time}`]
    if (item.type === 'duck_restaurant') details.push(...duckRestaurantInfoLines(item))
    else details.push(item.notes)
    infoWindow.setContent(buildInfoContent(item.name, details))
    infoWindow.open(map, [item.location.longitude, item.location.latitude])
  }

  function focusDiningArea(item) {
    diningMapLayers?.selectArea(item?.item_id, { focus: Boolean(item) })
  }

  function focusDiningDensityArea(area) {
    diningDensityMapLayer?.selectArea(area?.id, {
      focus: Boolean(area),
      borderOnly: duckDensityLayerVisible.value,
    })
  }

  function focusDuckDensityArea(cell) {
    duckDensityMapLayer?.selectArea(cell?.id, { focus: Boolean(cell) })
  }

  function destroyMap() {
    if (mapOutsideClickHandler)
      mapContainer.value?.removeEventListener('click', mapOutsideClickHandler, true)
    mapOutsideClickHandler = null
    mapInitializationSequence += 1
    duckGuideLayer?.destroy()
    duckGuideLayer = null
    mapConfigController?.abort()
    mapConfigController = null
    planLayer.reset()
    accommodationLayers.destroy()
    if (mapContainer.value) {
      mapContainer.value.dataset.accommodationAreas = '0'
      mapContainer.value.dataset.hotelQueryRadius = ''
    }
    locateRequestSequence += 1
    placeLayers.reset()
    duckRestaurantMapLayer?.destroy()
    duckRestaurantMapLayer = null
    diningMapLayers?.destroy()
    diningMapLayers = null
    diningDensityMapLayer?.destroy()
    diningDensityMapLayer = null
    duckDensityMapLayer?.destroy()
    duckDensityMapLayer = null
    metroMapLayer?.destroy()
    metroMapLayer = null
    mapEventHandlers.forEach(([event, handler]) => map?.off?.(event, handler))
    mapEventHandlers = []
    infoWindow?.close?.()
    if (map) map.destroy()
    map = null
    infoWindow = null
    diningAreaOverlayCount.value = 0
    diningDensityOverlayCount.value = 0
    duckDensityOverlayCount.value = 0
    restaurantMarkerCount.value = 0
    duckRestaurantMarkerCount.value = 0
    metroPolylineCount.value = 0
    metroStationCount.value = 0
  }

  // AMap owns DOM nodes and event listeners, so it must be explicitly destroyed.
  onBeforeUnmount(() => {
    disposed = true
    destroyMap()
  })

  watch(
    [attractionLayerVisible, mapAttractionFilter, activeDay, routeLayerVisible],
    applyAttractionMarkerVisibility,
    {
      deep: true,
    },
  )
  watch(selectedAttractionId, () => {
    placeLayers.applyAttractionMarkerSelection()
    planLayer.applyAttractionMarkerSelection()
  })
  watch(routeLayerVisible, applyPlanLayerVisibility)
  watch(hotelLayerVisible, applyHotelMarkerVisibility)
  watch(
    [
      hotelQuery,
      hotelLayerVisible,
      nearbyHotelLayerVisible,
      nearbyHotelRangeSelected,
      activeAccommodationAreaIds,
      accommodationAreasVisible,
      accommodationAreaPicking,
      selectedAccommodationArea,
    ],
    syncAccommodationLayers,
    { deep: true, flush: 'post' },
  )
  watch(
    hotelQuery,
    () => {
      if (nearbyHotelLayerVisible.value) accommodationLayers.fitHotelQuery()
    },
    { flush: 'post' },
  )
  watch(searchLayerVisible, applyLodgingMarkerVisibility)
  watch(currentLodgingLayerVisible, applyLodgingMarkerVisibility)
  watch(currentLodging, syncLodgingMarker, { deep: true })
  watch([activeDay, routeLayerVisible], applyLodgingMarkerVisibility, { deep: true })
  watch(duckDensityLayerVisible, (visible) => {
    syncDuckDensityLayers()
    diningDensityMapLayer?.selectArea(
      selectedDiningHex.value?.id || selectedOverviewArea.value?.id,
      { borderOnly: visible },
    )
  })
  watch(duckDensityAreas, syncDuckDensityLayers)
  watch(selectedDiningHex, (cell) => {
    duckDensityMapLayer?.selectArea(cell?.id)
    diningDensityMapLayer?.selectArea(cell?.id || selectedOverviewArea.value?.id, {
      borderOnly: duckDensityLayerVisible.value,
    })
  })
  watch(diningDensityLayerVisible, (visible) => diningDensityMapLayer?.setVisible(visible))
  watch(metroLayerVisible, (visible) => metroMapLayer?.setVisible(visible))
  watch(diningAreaLayerVisible, (visible) => diningMapLayers?.setAreasVisible(visible))
  watch(restaurantLayerVisible, (visible) => diningMapLayers?.setRestaurantsVisible(visible))
  watch([duckRestaurantLayerVisible, duckRestaurants, selectedDuckTypes], syncDuckRestaurantLayers)
  watch([activePlan, activeDay, activeDayIndex, mapState, currentLodging], renderActivePlanOnMap, {
    flush: 'post',
  })
  watch([duckGuideVisible, duckGuidePayload, selectedDuckGuideType, mapState], syncDuckGuide, {
    deep: true,
    flush: 'post',
  })
  watch([activeDay, validMealAreaItems], syncDiningAreaLayers, { deep: true })
  watch(diningDensityAreas, syncDiningDensityLayers, { deep: true })
  watch([metroLines, metroStations], syncMetroLayers, { deep: true })
  watch(selectedMetroStation, (station) => {
    if (
      station &&
      (!sameSelectedPoint(station) || !['metro', 'search'].includes(selectedMapPoint.value?.kind))
    ) {
      focusLocation(station, station.name, 'station', {
        kind: 'metro',
        item: station,
        focus: false,
      })
    } else if (!station && selectedMapPoint.value?.kind === 'metro') selectMapPoint(null)
  })
  watch(
    [
      restaurants,
      cuisineShops,
      cuisineLayerVisible,
      nearbyDiningLayerVisible,
      duckRestaurants,
      duckRestaurantLayerVisible,
    ],
    syncRestaurantLayers,
    { deep: true },
  )
  watch(selectedMealItem, (item) => diningMapLayers?.selectArea(item?.item_id))
  watch(selectedOverviewArea, (area) =>
    diningDensityMapLayer?.selectArea(selectedDiningHex.value?.id || area?.id, {
      borderOnly: duckDensityLayerVisible.value,
    }),
  )
  watch(selectedRestaurant, (restaurant) => {
    if (restaurant) showRestaurantInfo(restaurant)
    else if (selectedMapPoint.value?.kind === 'restaurant') {
      guideSelectedRestaurant.value = null
      selectMapPoint(null)
    }
    syncPointSelection()
  })

  return {
    clearPlanLayers,
    diningAreaOverlayCount,
    diningDensityOverlayCount,
    duckDensityOverlayCount,
    focusDuckDensityArea,
    duckRestaurantMarkerCount,
    fitAttractions,
    fitAccommodationAreas,
    getAccommodationGuideRects: () => accommodationLayers?.getAreaScreenRects() || [],
    fitAccommodationArea,
    fitNearbyHotelRange: accommodationLayers.fitHotelQuery,
    mapFocusInProgress,
    fitPlanOverview,
    focusAttraction,
    focusCurrentLodging,
    focusDiningArea,
    focusDiningDensityArea,
    focusLocation,
    focusMetroStation,
    focusedPlanLegGeometry,
    expandedPlanLegIds,
    allPlanLegsExpanded,
    toggleAllPlanLegs,
    focusedPlanLegId,
    focusedPlanLegSegmentCount,
    focusPlanItem,
    focusPlanLeg,
    initializeMap,
    locateMessage,
    locateState,
    mapContainer,
    mapMessage,
    mapState,
    metroPolylineCount,
    metroStationCount,
    renderActivePlanOnMap,
    requestLocation,
    restaurantMarkerCount,
    selectedCoordinateText,
    selectedLocation,
    selectedLocationLabel,
    selectedLocationSource,
    setHotelMarkers,
    setSearchMarkers,
    selectSearchResultOnMap,
    showRestaurantInfo,
    showHotelInfo: placeLayers.showHotelInfo,
    clearHotelSelection,
  }
}
