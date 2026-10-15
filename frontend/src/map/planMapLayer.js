import { createMapMarkerContent, setMapMarkerSelected } from './mapMarkerIcons'
import { apiRequest } from '../services/api'
import { routeSequenceByItemId } from '../planning/routeMeals'

export const PLAN_ROUTE_COLOR = '#D6A231'
export const PUBLIC_TRANSIT_ROUTE_COLOR = '#1E6F54'
export const TAXI_ROUTE_COLOR = '#9F251F'

export function routeSegmentStyle(mode) {
  const styles = {
    walk: {
      strokeColor: '#fffdf7',
      outlineColor: '#64748b',
      strokeStyle: 'dashed',
      strokeWeight: 4,
      isOutline: true,
      borderWeight: 4,
    },
    bus: {
      strokeColor: PUBLIC_TRANSIT_ROUTE_COLOR,
      strokeStyle: 'solid',
      strokeWeight: 5,
      isOutline: false,
      borderWeight: 0,
    },
    metro: {
      strokeColor: PUBLIC_TRANSIT_ROUTE_COLOR,
      strokeStyle: 'solid',
      strokeWeight: 5,
      isOutline: false,
      borderWeight: 0,
    },
    railway: {
      strokeColor: PUBLIC_TRANSIT_ROUTE_COLOR,
      strokeStyle: 'solid',
      strokeWeight: 5,
      isOutline: false,
      borderWeight: 0,
    },
    taxi: {
      strokeColor: TAXI_ROUTE_COLOR,
      strokeStyle: 'solid',
      strokeWeight: 5,
      isOutline: false,
      borderWeight: 0,
    },
    self_drive: {
      strokeColor: '#fffdf7',
      outlineColor: '#0891b2',
      strokeStyle: 'solid',
      strokeWeight: 5,
      isOutline: true,
      borderWeight: 4,
    },
  }
  return styles[mode] || styles.bus
}

export function createPlanMapLayer({
  getMapContext,
  isDisposed,
  activeDay,
  activeDayIndex,
  activePlan,
  activeTripRequest,
  tripForm,
  currentLodging,
  selectedAttractionId,
  selectedMapPoint,
  mapState,
  routeLayerVisible,
  focusedPlanLegId,
  focusedPlanLegGeometry,
  focusedPlanLegSegmentCount,
  expandedPlanLegIds,
  fitPadding,
  focusPlanItem,
  onDiningAreaSelect,
}) {
  let planMarkers = []
  let planPolyline = null
  let planLayerSequence = 0
  let renderedContext = null
  const viewedLegLayers = new Map()
  const roadRouteCache = new Map()
  const endpointSnapshots = new WeakMap()

  function planEndpointSnapshot() {
    const plan = activePlan.value || activeDay.value
    if (!plan) return null
    if (endpointSnapshots.has(plan)) return endpointSnapshots.get(plan)
    const request = activeTripRequest?.value
    const form = tripForm?.value
    const metadata = {
      lodging: form?.lodging || currentLodging?.value || null,
      firstDayStart: form?.useFirstDayStart ? form.firstDayStart : null,
      lastDayEnd: form?.useLastDayEnd ? form.lastDayEnd : null,
    }
    const references = request
      ? {
          lodging: request.lodging,
          firstDayStart: request.first_day_start,
          lastDayEnd: request.last_day_end,
        }
      : metadata
    const snapshot = Object.fromEntries(
      Object.entries(references).map(([key, reference]) => {
        if (!reference) return [key, null]
        const copy = JSON.parse(JSON.stringify(reference))
        // Display icons are frontend metadata; only attach them to the submitted location.
        if (metadata[key]?.display_icon && samePlanLocation(reference, metadata[key]))
          copy.display_icon = metadata[key].display_icon
        return [key, copy]
      }),
    )
    endpointSnapshots.set(plan, snapshot)
    return snapshot
  }

  function uniquePlanMarkerOverlays() {
    return [...new Set(planMarkers.map(({ marker }) => marker).filter(Boolean))]
  }

  function clearPlanLayers() {
    const { map } = getMapContext()
    planLayerSequence += 1
    renderedContext = null
    const uniqueEntries = new Map(planMarkers.map((entry) => [entry.marker, entry]))
    uniqueEntries.forEach(({ marker, clickHandler }) => marker.off?.('click', clickHandler))
    // Route layers are derived state: remove the old day before drawing the next one.
    const markerOverlays = uniquePlanMarkerOverlays()
    if (map && markerOverlays.length) map.remove(markerOverlays)
    if (map && planPolyline) map.remove(planPolyline)
    const viewedPolylines = [...viewedLegLayers.values()].flatMap((entry) => entry.polylines)
    if (map && viewedPolylines.length) map.remove(viewedPolylines)
    planMarkers = []
    planPolyline = null
    viewedLegLayers.clear()
    expandedPlanLegIds.value = []
    focusedPlanLegId.value = ''
    focusedPlanLegGeometry.value = 'none'
    focusedPlanLegSegmentCount.value = 0
  }

  function applyPlanLayerVisibility() {
    const routeVisible = routeLayerVisible.value
    if (planPolyline) {
      if (routeVisible) planPolyline.show()
      else planPolyline.hide()
    }
    viewedLegLayers.forEach(({ polylines }, identifier) => {
      const focused = identifier === focusedPlanLegId.value
      polylines.forEach((polyline) => {
        polyline.setOptions?.({
          strokeOpacity: focused ? 1 : 0.82,
          zIndex: focused ? 285 : 265,
        })
        if (routeVisible && expandedPlanLegIds.value.includes(identifier)) polyline.show()
        else polyline.hide()
      })
    })
    uniquePlanMarkerOverlays().forEach((marker) => {
      if (routeVisible) marker.show()
      else marker.hide()
    })
  }

  function endpointReference(item) {
    const references = planEndpointSnapshot()
    if (!references || !['start', 'end'].includes(item?.type)) return null
    if (item.type === 'start') {
      return activeDayIndex.value === 0 && references.firstDayStart
        ? references.firstDayStart
        : references.lodging
    }
    const finalDayIndex = Math.max(0, (activePlan?.value?.days?.length || 1) - 1)
    return activeDayIndex.value === finalDayIndex && references.lastDayEnd
      ? references.lastDayEnd
      : references.lodging
  }

  function endpointIcon(item) {
    const reference = endpointReference(item)
    if (reference?.display_icon) return reference.display_icon
    if (reference?.source_method === 'station') return 'metro'
    if (reference?.source_method === 'hotel') return 'hotels'
    if (['current_location', 'map_click'].includes(reference?.source_method)) return 'searchPoint'
    return 'searchPoint'
  }

  function samePlanLocation(left, right) {
    return (
      Boolean(left?.location && right?.location) &&
      Math.abs(left.location.longitude - right.location.longitude) < 0.000001 &&
      Math.abs(left.location.latitude - right.location.latitude) < 0.000001
    )
  }

  function markerPriority(item) {
    return { attraction: 4, start: 3, end: 3, duck_restaurant: 2, meal_area: 1 }[item.type] || 2
  }

  function groupPlanItems(items) {
    const groups = []
    items.forEach((item, index) => {
      let group = groups.find(({ entries }) => samePlanLocation(entries[0].item, item))
      if (!group) {
        group = { entries: [] }
        groups.push(group)
      }
      group.entries.push({ index, item })
    })
    return groups
  }

  function visibleSequenceLabel(entries, sequenceByItemId) {
    const hasClickableNode = entries.some(({ item }) => item.type !== 'meal_area')
    const sequences = entries
      .filter(({ item }) => !hasClickableNode || item.type !== 'meal_area')
      .map(({ item }) => sequenceByItemId[item.item_id])
    return sequences.join('·')
  }

  function viewportPadding(fallback) {
    const [top, right, bottom, left] = fitPadding(fallback)
    return [top, bottom, left, right]
  }

  function renderActivePlanOnMap() {
    const { map, AMap } = getMapContext()
    if (!map || mapState.value !== 'ready') return
    const day = activeDay.value
    const endpoints = planEndpointSnapshot()
    if (
      renderedContext?.map === map &&
      renderedContext.day === day &&
      renderedContext.plan === activePlan.value &&
      renderedContext.endpoints === endpoints &&
      renderedContext.dayIndex === activeDayIndex.value
    )
      return
    clearPlanLayers()
    renderedContext = {
      map,
      day,
      plan: activePlan.value,
      dayIndex: activeDayIndex.value,
      endpoints,
    }
    if (!day?.items?.length) return
    const sequenceByItemId = routeSequenceByItemId(day)
    const path = day.items.map((item) => [item.location.longitude, item.location.latitude])
    const markerGroups = groupPlanItems(day.items).map(({ entries }) => {
      // 同坐标时优先保留必须点击的景点，其次保留起终点；餐饮便利区仍可点击范围圆。
      const representative = entries.reduce((current, candidate) =>
        markerPriority(candidate.item) > markerPriority(current.item) ? candidate : current,
      )
      const { index, item } = representative
      const position = [item.location.longitude, item.location.latitude]
      const isLodging =
        ['start', 'end'].includes(item.type) &&
        endpoints?.lodging &&
        samePlanLocation(item, endpoints.lodging)
      const icon = isLodging
        ? endpoints.lodging.display_icon || 'hotels'
        : ['start', 'end'].includes(item.type)
          ? endpointIcon(item)
          : item.type === 'meal_area'
            ? 'mealAreas'
            : item.type === 'duck_restaurant'
              ? 'duck'
              : 'attractions'
      const markerContent = createMapMarkerContent({
        attractionId: item.type === 'attraction' ? item.ref_id : '',
        color:
          item.type === 'meal_area'
            ? '#7d7b39'
            : item.type === 'duck_restaurant'
              ? '#d6a231'
              : isLodging
                ? '#d6a231'
                : icon === 'hotels'
                  ? '#8b5cf6'
                  : '#c13f2c',
        icon,
        label: `${item.start_time} ${item.name}`,
        markerClass: `plan-map-marker marker-${item.type}${isLodging ? ' plan-lodging-map-marker' : ''}`,
        sequence: visibleSequenceLabel(entries, sequenceByItemId),
        selected:
          (item.type === 'attraction' && item.ref_id === selectedAttractionId?.value) ||
          (selectedMapPoint?.value?.kind === 'plan' &&
            entries.some(({ item: entry }) => entry.item_id === selectedMapPoint.value.key)),
      })
      markerContent.dataset.planMarker = item.item_id
      markerContent.dataset.planMarkerItems = entries
        .map(({ item: entry }) => entry.item_id)
        .join(',')
      const marker = new AMap.Marker({
        position,
        anchor: 'center',
        content: markerContent,
        // 路线节点必须始终高于搜索、餐饮、酒店和地铁站图标。
        zIndex: 1100 + markerPriority(item) * 100 + index,
      })
      const clickHandler = () => {
        if (item.type === 'meal_area') onDiningAreaSelect?.(item)
        else focusPlanItem(item, { focus: !['metro', 'station', 'airport'].includes(icon) })
      }
      marker.on('click', clickHandler)
      return { entries, marker, markerContent, clickHandler }
    })
    planMarkers = markerGroups.flatMap(({ entries, marker, markerContent, clickHandler }) =>
      entries.map(({ item }) => ({ item, marker, markerContent, clickHandler })),
    )
    planPolyline = new AMap.Polyline({
      path,
      strokeColor: PLAN_ROUTE_COLOR,
      strokeWeight: 4,
      strokeOpacity: 0.58,
      strokeStyle: 'dashed',
      lineJoin: 'round',
      zIndex: 220,
    })
    const markerOverlays = uniquePlanMarkerOverlays()
    map.add([...markerOverlays, planPolyline])
    applyPlanLayerVisibility()
    if (markerOverlays.length) {
      map.setFitView([...markerOverlays, planPolyline], true, viewportPadding(), 13)
    }
  }

  function legIdentifier(leg) {
    return `${leg?.from_item_id || ''}-${leg?.to_item_id || ''}`
  }

  function fitPlanOverview({ immediately = true } = {}) {
    const { map } = getMapContext()
    if (!map || !planMarkers.length) return
    map.setFitView(
      [
        ...uniquePlanMarkerOverlays(),
        planPolyline,
        ...expandedPlanLegIds.value.flatMap((id) => viewedLegLayers.get(id)?.polylines || []),
      ].filter(Boolean),
      immediately,
      viewportPadding(),
      13,
    )
  }

  function clearFocusedPlanLeg({ fitOverview = false } = {}) {
    const { map } = getMapContext()
    expandedPlanLegIds.value = []
    focusedPlanLegId.value = ''
    focusedPlanLegGeometry.value = 'none'
    focusedPlanLegSegmentCount.value = 0
    if (!map) return
    applyPlanLayerVisibility()
    if (fitOverview) fitPlanOverview()
  }

  function routePolylines(routeSegments) {
    const { AMap } = getMapContext()
    return routeSegments
      .filter((segment) => Array.isArray(segment.path) && segment.path.length >= 2)
      .map(
        (segment) =>
          new AMap.Polyline({
            path: segment.path,
            ...routeSegmentStyle(segment.mode),
            strokeOpacity: 1,
            lineJoin: 'round',
            zIndex: 285,
          }),
      )
  }

  function fallbackLegPolyline(fromEntry, toEntry, mode) {
    const { AMap } = getMapContext()
    if (!fromEntry || !toEntry) return []
    const fallbackStyle = ['bus', 'metro', 'taxi'].includes(mode)
      ? routeSegmentStyle(mode)
      : {
          strokeColor: PLAN_ROUTE_COLOR,
          strokeWeight: 5,
          strokeStyle: 'dashed',
          isOutline: false,
          borderWeight: 0,
        }
    return [
      new AMap.Polyline({
        path: [
          [fromEntry.item.location.longitude, fromEntry.item.location.latitude],
          [toEntry.item.location.longitude, toEntry.item.location.latitude],
        ],
        ...fallbackStyle,
        strokeOpacity: 0.92,
        lineJoin: 'round',
        zIndex: 285,
      }),
    ]
  }

  function storeViewedLeg(identifier, polylines, geometry) {
    const { map } = getMapContext()
    if (!map || !polylines.length) return null
    const previous = viewedLegLayers.get(identifier)
    if (previous?.polylines?.length && previous.polylines !== polylines) {
      map.remove(previous.polylines)
    }
    const entry = { geometry, polylines }
    viewedLegLayers.set(identifier, entry)
    if (!previous || previous.polylines !== polylines) map.add(polylines)
    applyPlanLayerVisibility()
    return entry
  }

  function focusViewedLeg(entry, { identifier }) {
    const { map } = getMapContext()
    if (!map || focusedPlanLegId.value !== identifier || !entry?.polylines?.length) return
    focusedPlanLegGeometry.value = entry.geometry
    focusedPlanLegSegmentCount.value = entry.polylines.length
    applyPlanLayerVisibility()
    fitPlanOverview()
  }

  function roadRouteCacheKey(leg, fromEntry, toEntry) {
    const from = fromEntry.item.location
    const to = toEntry.item.location
    return [leg.mode, from.longitude, from.latitude, to.longitude, to.latitude].join(':')
  }

  async function roadRouteSegments(leg, fromEntry, toEntry) {
    const key = roadRouteCacheKey(leg, fromEntry, toEntry)
    if (roadRouteCache.has(key)) return roadRouteCache.get(key)
    const from = fromEntry.item.location
    const to = toEntry.item.location
    const request = apiRequest('/api/travel-time', {
      method: 'POST',
      body: JSON.stringify({
        origin: { longitude: from.longitude, latitude: from.latitude, coord_system: 'GCJ-02' },
        destination: { longitude: to.longitude, latitude: to.latitude, coord_system: 'GCJ-02' },
        mode: leg.mode,
      }),
    }).then((response) => response.driving_details?.route_segments || [])
    roadRouteCache.set(key, request)
    try {
      return await request
    } catch (error) {
      roadRouteCache.delete(key)
      throw error
    }
  }

  async function showPlanLeg(leg, focus = true) {
    const { map } = getMapContext()
    if (!map || !leg) return
    const identifier = legIdentifier(leg)
    const fromEntry = planMarkers.find(({ item }) => item.item_id === leg.from_item_id)
    const toEntry = planMarkers.find(({ item }) => item.item_id === leg.to_item_id)
    if (focus) focusedPlanLegId.value = identifier
    const cachedLayers = viewedLegLayers.get(identifier)
    if (cachedLayers) {
      applyPlanLayerVisibility()
      focusViewedLeg(cachedLayers, { identifier, fromEntry, toEntry })
      if (cachedLayers.geometry === 'detailed' || cachedLayers.geometry === 'loading') return
    }
    const embeddedPolylines = routePolylines(
      leg.path_details?.route_segments || leg.transit_details?.route_segments || [],
    )
    if (embeddedPolylines.length) {
      const entry = storeViewedLeg(identifier, embeddedPolylines, 'detailed')
      focusViewedLeg(entry, { identifier, fromEntry, toEntry })
      return
    }

    const fallback = fallbackLegPolyline(fromEntry, toEntry, leg.mode)
    const isRoadMode = ['taxi', 'self_drive'].includes(leg.mode)
    const fallbackEntry = storeViewedLeg(identifier, fallback, isRoadMode ? 'loading' : 'fallback')
    focusViewedLeg(fallbackEntry, { identifier, fromEntry, toEntry })
    if (!isRoadMode || !fromEntry || !toEntry) return

    const context = {
      map,
      sequence: planLayerSequence,
      day: activeDay.value,
      plan: activePlan.value,
      dayIndex: activeDayIndex.value,
    }
    const isCurrent = () =>
      !isDisposed() &&
      getMapContext().map === context.map &&
      planLayerSequence === context.sequence &&
      activeDay.value === context.day &&
      activePlan.value === context.plan &&
      activeDayIndex.value === context.dayIndex

    try {
      const segments = await roadRouteSegments(leg, fromEntry, toEntry)
      if (!isCurrent()) return
      const detailedPolylines = routePolylines(segments)
      if (!detailedPolylines.length) {
        const entry = viewedLegLayers.get(identifier)
        if (entry) entry.geometry = 'fallback'
        if (focusedPlanLegId.value === identifier) focusedPlanLegGeometry.value = 'fallback'
        return
      }
      const entry = storeViewedLeg(identifier, detailedPolylines, 'detailed')
      focusViewedLeg(entry, { identifier, fromEntry, toEntry })
    } catch {
      if (!isCurrent()) return
      const entry = viewedLegLayers.get(identifier)
      if (entry) entry.geometry = 'fallback'
      if (focusedPlanLegId.value === identifier) focusedPlanLegGeometry.value = 'fallback'
    }
  }

  async function focusPlanLeg(leg) {
    if (!getMapContext().map || !leg) return
    const identifier = legIdentifier(leg)
    if (expandedPlanLegIds.value.includes(identifier)) {
      expandedPlanLegIds.value = expandedPlanLegIds.value.filter((id) => id !== identifier)
      if (focusedPlanLegId.value === identifier) {
        focusedPlanLegId.value = ''
        focusedPlanLegGeometry.value = 'none'
        focusedPlanLegSegmentCount.value = 0
      }
      applyPlanLayerVisibility()
      fitPlanOverview()
      return
    }
    clearFocusedPlanLeg()
    expandedPlanLegIds.value = [identifier]
    await showPlanLeg(leg)
  }

  async function toggleAllPlanLegs() {
    const { map } = getMapContext()
    const legs = activeDay.value?.legs || []
    if (!map || !legs.length) return
    const identifiers = legs.map(legIdentifier)
    if (identifiers.every((id) => expandedPlanLegIds.value.includes(id))) {
      clearFocusedPlanLeg({ fitOverview: true })
      return
    }
    clearFocusedPlanLeg()
    const sequence = planLayerSequence
    expandedPlanLegIds.value = identifiers
    // Keep cached geometry separate from the user's currently expanded routes.
    await Promise.allSettled(legs.map((leg) => showPlanLeg(leg, false)))
    if (
      isDisposed() ||
      sequence !== planLayerSequence ||
      expandedPlanLegIds.value.join(',') !== identifiers.join(',')
    )
      return
    const routes = identifiers.flatMap((id) => viewedLegLayers.get(id)?.polylines || [])
    map.setFitView([...uniquePlanMarkerOverlays(), ...routes], true, viewportPadding(), 13)
  }

  function reset() {
    clearPlanLayers()
  }

  return {
    applyAttractionMarkerSelection() {
      const seen = new Set()
      planMarkers.forEach(({ marker, markerContent }) => {
        if (seen.has(marker)) return
        seen.add(marker)
        const selected = planMarkers.some(
          (entry) =>
            entry.marker === marker &&
            ((entry.item.type === 'attraction' &&
              entry.item.ref_id === selectedAttractionId?.value) ||
              (selectedMapPoint?.value?.kind === 'plan' &&
                entry.item.item_id === selectedMapPoint.value.key)),
        )
        setMapMarkerSelected(markerContent, selected)
      })
    },
    clearPlanLayers,
    applyPlanLayerVisibility,
    renderActivePlanOnMap,
    fitPlanOverview,
    clearFocusedPlanLeg,
    focusPlanLeg,
    toggleAllPlanLegs,
    reset,
  }
}
