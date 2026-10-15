import {
  ATTRACTION_RESERVATION_LABELS,
  attractionMatchesFilter,
  attractionReservationStatus,
} from '../attractions/attractionFilters'
import { MAP_MARKER_COLORS, createMapMarkerContent, setMapMarkerSelected } from './mapMarkerIcons'
import { HOTEL_PRICE_BAND_LABELS } from '../search/hotelResults'

const ATTRACTION_MARKER_Z_INDEX = 500
const SEARCH_MARKER_Z_INDEX = 340
const SELECTED_SEARCH_MARKER_Z_INDEX = 520

export function createPlaceMapLayers({
  getMapContext,
  attractions,
  selectedAttractionId,
  selectedMapPoint,
  attractionLayerVisible,
  mapAttractionFilter,
  activeDay,
  routeLayerVisible,
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
}) {
  let attractionMarkers = []
  let hotelMarkers = []
  let pendingSearchResults = []
  let pendingHotelMarkers = []
  let searchMarkers = []
  let selectedSearchResultKey = ''
  let lodgingEntry = null

  function isLodgingVisible() {
    return Boolean(
      currentLodging?.value && currentLodgingLayerVisible?.value && searchLayerVisible.value,
    )
  }

  function matchesCurrentLodging(item) {
    const lodging = currentLodging?.value
    return (
      (isLodgingVisible() || routeClaimsCurrentLodging()) &&
      Math.abs(item?.location?.longitude - lodging.location.longitude) < 0.000001 &&
      Math.abs(item?.location?.latitude - lodging.location.latitude) < 0.000001
    )
  }

  function routeClaimsCurrentLodging() {
    const lodging = currentLodging?.value
    return Boolean(
      lodging &&
      routeLayerVisible?.value &&
      activeDay?.value?.items?.some(
        (item) =>
          Math.abs(item.location.longitude - lodging.location.longitude) < 0.000001 &&
          Math.abs(item.location.latitude - lodging.location.latitude) < 0.000001,
      ),
    )
  }

  function focusCurrentLodging() {
    const lodging = currentLodging?.value
    if (
      !lodging ||
      !focusLocation(lodging, lodging.name, 'search', { kind: 'lodging', item: lodging })
    )
      return false
    const { map, infoWindow } = getMapContext()
    if (map && infoWindow) {
      infoWindow.setContent(buildInfoContent(lodging.name, ['当前住宿']))
      infoWindow.open(map, [lodging.location.longitude, lodging.location.latitude])
    }
    return true
  }

  function clearLodgingMarker() {
    if (!lodgingEntry) return
    const { map } = getMapContext()
    lodgingEntry.marker.off?.('click', lodgingEntry.clickHandler)
    map?.remove([lodgingEntry.marker])
    lodgingEntry = null
  }

  function applyLodgingMarkerVisibility() {
    if (lodgingEntry) {
      if (isLodgingVisible() && !routeClaimsCurrentLodging()) lodgingEntry.marker.show()
      else lodgingEntry.marker.hide()
      applyHotelMarkerVisibility()
    }
    applySearchMarkerVisibility()
  }

  function syncLodgingMarker() {
    const { map, AMap } = getMapContext()
    if (!map) return
    if (!lodgingEntry && !currentLodging?.value) return
    clearLodgingMarker()
    const lodging = currentLodging?.value
    if (
      Number.isFinite(lodging?.location?.longitude) &&
      Number.isFinite(lodging?.location?.latitude)
    ) {
      const content = createMapMarkerContent({
        color: MAP_MARKER_COLORS.selectedSearch,
        icon: lodging.display_icon || 'hotels',
        label: `当前住宿：${lodging.name}`,
        markerClass: 'current-lodging-map-marker',
      })
      content.dataset.currentLodgingMarker = 'true'
      const marker = new AMap.Marker({
        position: [lodging.location.longitude, lodging.location.latitude],
        title: lodging.name,
        anchor: 'center',
        content,
        zIndex: SELECTED_SEARCH_MARKER_Z_INDEX,
      })
      const clickHandler = focusCurrentLodging
      marker.on('click', clickHandler)
      lodgingEntry = { marker, content, clickHandler }
      map.add([marker])
    }
    applyLodgingMarkerVisibility()
    applyPointSelection()
    if (!lodgingEntry) applyHotelMarkerVisibility()
  }

  function focusAttraction(attraction, selection) {
    const { map, infoWindow } = getMapContext()
    if (!focusLocation(attraction, attraction?.name, 'search', selection)) return false
    onAttractionSelect?.(attraction)
    if (!map || !infoWindow) return true

    const position = [attraction.location.longitude, attraction.location.latitude]
    const duration = attraction.duration?.suggested_minutes
    const durationText = Number.isFinite(duration) ? `建议游玩 ${duration} 分钟` : '建议时长暂无'
    const reservationStatus = attractionReservationStatus(attraction)
    infoWindow.setContent(
      buildInfoContent(attraction.name || '景点名称暂无', [
        attraction.address || '地址暂无',
        `${attraction.quality_grade || '未评级'} · ${durationText}`,
        ATTRACTION_RESERVATION_LABELS[reservationStatus],
      ]),
    )
    infoWindow.open(map, position)
    return true
  }

  function addAttractionMarkers() {
    const { map, AMap } = getMapContext()
    attractionMarkers = attractions.value
      .filter(
        (attraction) =>
          Number.isFinite(attraction?.location?.longitude) &&
          Number.isFinite(attraction?.location?.latitude),
      )
      .map((attraction) => {
        const position = [attraction.location.longitude, attraction.location.latitude]
        const content = createMapMarkerContent({
          caption: attraction.name,
          attractionId: attraction.id,
          icon: 'attractions',
          label: `景点：${attraction.name}`,
          markerClass: 'attraction-map-marker',
          selected: attraction.id === selectedAttractionId?.value,
        })
        const marker = new AMap.Marker({
          position,
          title: attraction.name,
          anchor: 'center',
          content,
          // 正式景点高于地铁、酒店、餐馆和普通搜索结果；路线编号节点仍保持最高层。
          zIndex: ATTRACTION_MARKER_Z_INDEX,
        })
        const clickHandler = () => {
          if (focusAttraction(attraction)) onAttractionMarkerClick?.(attraction)
        }
        marker.on('click', clickHandler)
        return { attraction, content, marker, clickHandler }
      })
    map.add(attractionMarkers.map(({ marker }) => marker))
    applyAttractionMarkerVisibility()
    applyAttractionMarkerSelection()
  }

  function applyAttractionMarkerSelection() {
    attractionMarkers.forEach(({ attraction, content, marker }) => {
      const selected = attraction.id === selectedAttractionId?.value
      setMapMarkerSelected(content, selected)
      marker.setzIndex?.(selected ? 550 : ATTRACTION_MARKER_Z_INDEX)
    })
  }

  function applyAttractionMarkerVisibility() {
    const { map } = getMapContext()
    if (!map) return
    const routeAttractionIds = new Set(
      routeLayerVisible?.value
        ? (activeDay?.value?.items || [])
            .filter((item) => item.type === 'attraction')
            .map((item) => item.ref_id)
        : [],
    )
    const searchedAttractionIds = new Set(
      searchLayerVisible.value
        ? pendingSearchResults
            .filter((poi) => poi.searchDetailKind === 'attraction')
            .map((poi) => poi.searchDetailItem?.id)
        : [],
    )
    attractionMarkers.forEach(({ attraction, marker }) => {
      const visible =
        !routeAttractionIds.has(attraction.id) &&
        (searchedAttractionIds.has(attraction.id) ||
          (attractionLayerVisible.value &&
            attractionMatchesFilter(attraction, mapAttractionFilter.value)))
      if (visible) marker.show()
      else marker.hide()
    })
  }

  function searchResultKey(poi) {
    return String(poi?.searchKey || poi?.poi_id || '')
  }

  function searchResultInfoLines(poi) {
    const rating = poi.rating == null ? '评分暂无' : `评分 ${poi.rating}`
    const cost = poi.average_cost_yuan == null ? '人均暂无' : `人均约 ${poi.average_cost_yuan} 元`
    return [poi.address || '地址暂无', `${rating} · ${cost}`]
  }

  function openSearchResultInfo(poi) {
    const { map, infoWindow } = getMapContext()
    if (!map || !infoWindow) return
    infoWindow.setContent(buildInfoContent(poi.name || '地点名称暂无', searchResultInfoLines(poi)))
    infoWindow.open(map, [poi.location.longitude, poi.location.latitude])
  }

  function applySearchMarkerSelection() {
    searchMarkers.forEach(({ content, marker, poi }) => {
      const selected = selectedMapPoint
        ? selectedMapPoint.value?.kind === 'search' &&
          searchResultKey(poi) === selectedMapPoint.value.key
        : searchResultKey(poi) === selectedSearchResultKey
      setMapMarkerSelected(content, selected)
      marker.setzIndex?.(selected ? SELECTED_SEARCH_MARKER_Z_INDEX : SEARCH_MARKER_Z_INDEX)
    })
  }

  function applySearchMarkerVisibility() {
    searchMarkers.forEach(({ marker, poi }) => {
      if (searchLayerVisible.value && !matchesCurrentLodging(poi)) marker.show()
      else marker.hide()
    })
    applyAttractionMarkerVisibility()
  }

  function selectSearchMarker(poi, { openDetails = false } = {}) {
    if (!poi?.location) return false
    selectedSearchResultKey = searchResultKey(poi)
    onSearchResultSelect?.(poi)
    applySearchMarkerSelection()
    if (poi.searchDetailKind === 'attraction' && poi.searchDetailItem) {
      focusAttraction(poi.searchDetailItem)
      applySearchMarkerSelection()
      return true
    }
    if (
      !focusLocation(poi, poi.name, poi.searchDetailKind === 'metro' ? 'station' : 'search', {
        kind: 'search',
        item: poi,
        key: searchResultKey(poi),
      })
    ) {
      return false
    }
    applySearchMarkerSelection()
    openSearchResultInfo(poi)
    if (openDetails && poi.searchDetailKind && poi.searchDetailItem) {
      onSearchResultDetails?.({
        kind: poi.searchDetailKind,
        item: poi.searchDetailItem,
        poi,
      })
    }
    return true
  }

  function selectSearchResultOnMap(poi) {
    return selectSearchMarker(poi, {
      openDetails: poi?.searchDetailKind === 'attraction',
    })
  }

  function clearSearchMarkers() {
    const { map } = getMapContext()
    searchMarkers.forEach(({ marker, clickHandler }) => marker.off?.('click', clickHandler))
    if (map && searchMarkers.length) map.remove(searchMarkers.map(({ marker }) => marker))
    searchMarkers = []
    selectedSearchResultKey = ''
  }

  function setSearchMarkers(pois) {
    const { map, AMap } = getMapContext()
    pendingSearchResults = Array.isArray(pois) ? pois : []
    if (!map) return
    clearSearchMarkers()
    searchMarkers = pendingSearchResults
      .filter(
        (poi) =>
          Number.isFinite(poi?.location?.longitude) &&
          Number.isFinite(poi?.location?.latitude) &&
          !(poi.searchDetailKind === 'attraction' && poi.searchDetailItem),
      )
      .map((poi) => {
        const position = [poi.location.longitude, poi.location.latitude]
        const content = createMapMarkerContent({
          color: MAP_MARKER_COLORS.search,
          attractionId: poi.searchDetailKind === 'attraction' ? poi.searchDetailItem?.id : '',
          icon: poi.searchIcon || 'search',
          label: `搜索结果：${poi.name}`,
          markerClass: 'search-result-map-marker',
        })
        const marker = new AMap.Marker({
          position,
          title: poi.name,
          anchor: 'center',
          content,
          zIndex: SEARCH_MARKER_Z_INDEX,
        })
        const clickHandler = () => {
          const alreadySelected = selectedSearchResultKey === searchResultKey(poi)
          selectSearchMarker(poi, { openDetails: alreadySelected })
        }
        marker.on('click', clickHandler)
        return { clickHandler, content, marker, poi }
      })
    if (searchMarkers.length) map.add(searchMarkers.map(({ marker }) => marker))
    applySearchMarkerVisibility()
    applySearchMarkerSelection()
  }

  function setHotelMarkers(hotels) {
    const { map, AMap } = getMapContext()
    // Always remember the newest batch so hotels that arrive before the map SDK
    // finishes loading are drawn by initializeMap instead of being lost.
    pendingHotelMarkers = hotels || []
    if (!map) return
    // Derived layer state: replace the whole batch so re-enabling never stacks duplicates.
    clearHotelMarkers()
    hotelMarkers = pendingHotelMarkers.map((hotel) => {
      const position = [hotel.location.longitude, hotel.location.latitude]
      const content = createMapMarkerContent({
        icon: 'hotels',
        color: hotel.markerColor || MAP_MARKER_COLORS.hotels,
        label: `酒店：${hotel.name}`,
        markerClass: 'hotel-map-marker',
      })
      content.dataset.hotelId = hotel.poi_id || hotel.id || hotel.name
      content.dataset.hotelSource = hotel.markerSource || 'nearby'
      const marker = new AMap.Marker({
        position,
        title: hotel.name,
        anchor: 'center',
        content,
      })
      const clickHandler = () => {
        showHotelInfo(hotel)
        onHotelSelect?.(hotel)
      }
      marker.on('click', clickHandler)
      return { marker, content, clickHandler, hotel }
    })
    if (hotelMarkers.length) map.add(hotelMarkers.map(({ marker }) => marker))
    applyHotelMarkerVisibility()
    applyPointSelection()
  }

  function showHotelInfo(hotel, { scope = hotel.markerSource } = {}) {
    if (
      !focusLocation(hotel, hotel.name, 'hotel', { kind: 'hotel', item: hotel, hotelScope: scope })
    )
      return
    const { map, infoWindow } = getMapContext()
    if (!map || !infoWindow) return
    const rating = hotel.rating == null ? '评分暂无' : `评分 ${hotel.rating}`
    const priceBand = HOTEL_PRICE_BAND_LABELS[hotel.price_band] || '价位暂无信息'
    infoWindow.setContent(
      buildInfoContent(hotel.name, [hotel.address || '地址暂无', `${rating} · ${priceBand}`]),
    )
    infoWindow.open(map, [hotel.location.longitude, hotel.location.latitude])
  }

  function applyPointSelection() {
    applyAttractionMarkerSelection()
    applySearchMarkerSelection()
    hotelMarkers.forEach(({ hotel, content, marker }) => {
      const selected =
        selectedMapPoint?.value?.kind === 'hotel' &&
        selectedMapPoint.value.key === String(hotel.id || hotel.poi_id || hotel.name)
      setMapMarkerSelected(content, selected)
      marker.setzIndex?.(selected ? SELECTED_SEARCH_MARKER_Z_INDEX : SEARCH_MARKER_Z_INDEX)
    })
    if (lodgingEntry)
      setMapMarkerSelected(lodgingEntry.content, selectedMapPoint?.value?.kind === 'lodging')
    if (selectedMapPoint && selectedMapPoint.value?.kind !== 'search') selectedSearchResultKey = ''
  }

  function applyHotelMarkerVisibility() {
    const { map } = getMapContext()
    if (!map) return
    hotelMarkers.forEach(({ marker, hotel }) => {
      if (hotelLayerVisible.value && !matchesCurrentLodging(hotel)) marker.show()
      else marker.hide()
    })
  }

  function fitAttractions() {
    const { map } = getMapContext()
    if (map && attractionMarkers.length) {
      // Shell padding is top/right/bottom/left; AMap expects top/bottom/left/right.
      const [top, right, bottom, left] = fitPadding()
      map.setFitView(
        attractionMarkers.map(({ marker }) => marker),
        false,
        [top, bottom, left, right],
      )
    }
  }

  function restoreSearchMarkers() {
    if (pendingSearchResults.length) setSearchMarkers(pendingSearchResults)
  }

  function restoreHotelMarkers() {
    if (pendingHotelMarkers.length) setHotelMarkers(pendingHotelMarkers)
  }

  function reset() {
    clearLodgingMarker()
    clearSearchMarkers()
    const { map } = getMapContext()
    attractionMarkers.forEach(({ marker, clickHandler }) => marker.off?.('click', clickHandler))
    if (map && attractionMarkers.length) map.remove(attractionMarkers.map(({ marker }) => marker))
    attractionMarkers = []
    clearHotelMarkers()
  }

  function clearHotelMarkers() {
    const { map } = getMapContext()
    hotelMarkers.forEach(({ marker, clickHandler }) => marker.off?.('click', clickHandler))
    if (map && hotelMarkers.length) map.remove(hotelMarkers.map(({ marker }) => marker))
    hotelMarkers = []
  }

  return {
    focusCurrentLodging,
    syncLodgingMarker,
    applyLodgingMarkerVisibility,
    focusAttraction,
    addAttractionMarkers,
    applyAttractionMarkerVisibility,
    applyAttractionMarkerSelection,
    applyPointSelection,
    applySearchMarkerVisibility,
    selectSearchResultOnMap,
    setSearchMarkers,
    setHotelMarkers,
    showHotelInfo,
    applyHotelMarkerVisibility,
    fitAttractions,
    restoreSearchMarkers,
    restoreHotelMarkers,
    reset,
  }
}
