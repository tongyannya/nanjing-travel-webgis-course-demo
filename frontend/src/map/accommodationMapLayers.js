import {
  ACCOMMODATION_AREA_OPTIONS,
  ACCOMMODATION_AREA_RADIUS_METERS,
} from '../planning/accommodationOptions'
import { createMapMarkerContent, MAP_MARKER_COLORS } from './mapMarkerIcons'

const AREA_COLOR = MAP_MARKER_COLORS.accommodationAreas

export function createAccommodationMapLayers({
  getMapContext,
  getPadding,
  onAreaSelect,
  onHotelQuerySelect,
}) {
  let entries = []
  let queryCircle = null
  let freePointMarker = null
  let attachedMap = null
  let visible = false
  let picking = false
  let labelPriorityAreaId = ''
  let themeObserver = null

  function remove(overlays) {
    if (overlays.length) getMapContext().map?.remove(overlays)
  }

  function layoutLabels() {
    const { map, AMap } = getMapContext()
    if (!visible || !picking || !map?.lngLatToContainer) return
    const size = map.getSize()
    const [top, right, bottom, left] = getPadding()
    const container = map.getContainer?.()
    const status = container?.closest('.map-workspace')?.querySelector('.map-status')
    const statusBottom = status?.getClientRects().length
      ? status.getBoundingClientRect().bottom - container.getBoundingClientRect().top + 12
      : 0
    const bounds = {
      left: left - 24,
      right: size.width - right + 24,
      top: Math.max(top + 76, statusBottom),
      bottom: size.height - bottom,
    }
    const circles = entries.map((entry) => {
      const point = map.lngLatToContainer([entry.area.longitude, entry.area.latitude])
      const edge = map.lngLatToContainer([
        entry.area.longitude +
          ACCOMMODATION_AREA_RADIUS_METERS /
            (111320 * Math.cos((entry.area.latitude * Math.PI) / 180)),
        entry.area.latitude,
      ])
      return { x: point.x, y: point.y, radius: Math.abs(edge.x - point.x) }
    })
    const rectangles = []
    const sorted = [...entries].sort(
      (a, b) =>
        Number(b.area.id === labelPriorityAreaId) - Number(a.area.id === labelPriorityAreaId) ||
        b.area.latitude - a.area.latitude,
    )
    sorted.forEach((entry) => {
      const point = map.lngLatToContainer([entry.area.longitude, entry.area.latitude])
      if (
        point.x < bounds.left - 80 ||
        point.x > bounds.right + 80 ||
        point.y < bounds.top - 80 ||
        point.y > bounds.bottom + 80
      ) {
        entry.marker.hide()
        entry.leader.hide()
        return
      }
      entry.marker.show()
      entry.leader.show()
      const width = entry.content.offsetWidth || 230
      const height = entry.content.offsetHeight || 124
      const positions = []
      // Search the entire usable viewport; cards must avoid every circle, not just their own.
      for (let x = bounds.left; x <= bounds.right - width; x += 16) {
        for (let y = bounds.top; y <= bounds.bottom - height; y += 16) positions.push({ x, y })
      }
      let best = null
      for (const candidate of positions) {
        const { x, y } = candidate
        const intersectsCircle = circles.some(
          (circle) =>
            Math.hypot(
              circle.x - Math.max(x, Math.min(x + width, circle.x)),
              circle.y - Math.max(y, Math.min(y + height, circle.y)),
            ) <
            circle.radius + 16,
        )
        if (intersectsCircle) continue
        const overlap = rectangles.reduce(
          (sum, rect) =>
            sum +
            Math.max(0, Math.min(x + width + 8, rect.x + rect.width) - Math.max(x - 8, rect.x)) *
              Math.max(0, Math.min(y + height + 8, rect.y + rect.height) - Math.max(y - 8, rect.y)),
          0,
        )
        if (overlap) continue
        const score = Math.hypot(x + width / 2 - point.x, y + height / 2 - point.y)
        if (!best || score < best.score) best = { x, y, width, height, score }
      }
      if (!best) {
        entry.marker.hide()
        entry.leader.hide()
        return
      }
      rectangles.push(best)
      entry.content.dataset.layoutRectangle = JSON.stringify(best)
      entry.marker.setOffset(new AMap.Pixel(best.x - point.x, best.y - point.y))
      const edge = {
        x: Math.max(best.x, Math.min(best.x + width, point.x)),
        y: Math.max(best.y, Math.min(best.y + height, point.y)),
      }
      const distance = Math.hypot(edge.x - point.x, edge.y - point.y)
      const radius =
        circles.find((circle) => circle.x === point.x && circle.y === point.y)?.radius || 0
      const circleEdge = new AMap.Pixel(
        point.x + ((edge.x - point.x) * radius) / distance,
        point.y + ((edge.y - point.y) * radius) / distance,
      )
      entry.leader.setPath([
        map.containerToLngLat(circleEdge),
        map.containerToLngLat(new AMap.Pixel(edge.x, edge.y)),
      ])
      entry.leader.setOptions({
        strokeColor: getComputedStyle(entry.content).borderTopColor,
        strokeWeight: 2,
      })
    })
  }

  function createAreas() {
    const { map, AMap } = getMapContext()
    if (!map || !AMap || entries.length) return
    entries = ACCOMMODATION_AREA_OPTIONS.map((area) => {
      const center = [area.longitude, area.latitude]
      const circle = new AMap.Circle({
        center,
        radius: ACCOMMODATION_AREA_RADIUS_METERS,
        strokeColor: AREA_COLOR,
        strokeOpacity: 0.45,
        strokeWeight: 1,
        fillColor: AREA_COLOR,
        fillOpacity: 0.16,
        zIndex: 300,
        extData: { accommodationAreaId: area.id },
        bubble: false,
        cursor: 'pointer',
      })
      const content = document.createElement('div')
      content.className = 'map-info-window accommodation-map-card'
      content.dataset.accommodationArea = area.id
      content.dataset.areaId = area.id
      content.setAttribute('aria-label', `${area.name}，邻近${area.nearby}，适合${area.suits}`)
      const heading = document.createElement('strong')
      heading.textContent = area.name
      content.appendChild(heading)
      for (const text of [`邻近：${area.nearby}`, `适合：${area.suits}`]) {
        const line = document.createElement('p')
        line.textContent = text
        content.appendChild(line)
      }
      const clickHandler = () => onAreaSelect?.(area)
      content.addEventListener('click', (event) => {
        event.stopPropagation()
        clickHandler()
      })
      content.tabIndex = 0
      content.setAttribute('role', 'button')
      content.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          clickHandler()
        }
      })
      circle.on('click', clickHandler)
      const marker = new AMap.Marker({
        position: center,
        content,
        anchor: 'top-left',
        zIndex: 2000,
        bubble: false,
      })
      const leader = new AMap.Polyline({
        path: [center, center],
        extData: { accommodationLeaderId: area.id },
        strokeColor: AREA_COLOR,
        strokeWeight: 2,
        strokeOpacity: 0.85,
        zIndex: 104,
        bubble: false,
        cursor: 'default',
      })
      map.add([circle, leader, marker])
      return { area, circle, marker, leader, content, clickHandler }
    })
    attachedMap = map
    map.on('moveend', layoutLabels)
    map.on('zoomend', layoutLabels)
    map.on('resize', layoutLabels)
    themeObserver = new MutationObserver(layoutLabels)
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] })
  }

  function syncAreas({ show, choosing = false, selectedAreaId = '', activeAreaIds = [] }) {
    visible = show
    picking = choosing
    labelPriorityAreaId = selectedAreaId
    if (visible) createAreas()
    entries.forEach((entry) => {
      const selected = picking
        ? entry.area.id === selectedAreaId
        : activeAreaIds.includes(entry.area.id)
      entry.circle.setOptions({
        strokeColor: selected ? MAP_MARKER_COLORS.accommodationSelected : AREA_COLOR,
        strokeWeight: selected ? 3 : 1,
        strokeOpacity: selected ? 1 : 0.45,
        fillOpacity: selected ? 0.24 : 0.16,
      })
      if (visible) entry.circle.show()
      else entry.circle.hide()
      for (const overlay of [entry.marker, entry.leader]) {
        if (visible && picking) overlay.show()
        else overlay.hide()
      }
    })
    layoutLabels()
  }

  function fitAreas(areaId = '', { immediately = false } = {}) {
    const { map } = getMapContext()
    const targets = entries
      .filter((entry) => !areaId || entry.area.id === areaId)
      .map((entry) => entry.circle)
    if (!visible || !map || !targets.length) return false
    const [top, right, bottom, left] = getPadding()
    map.setFitView(
      targets,
      immediately,
      [top + (picking ? 100 : 35), bottom + 35, left + (areaId && picking ? 280 : 35), right + 35],
      areaId ? 15 : 13,
    )
    layoutLabels()
    return true
  }

  function syncHotelQuery(query, show, selected = false) {
    queryCircle?.off?.('click', onHotelQuerySelect)
    remove([queryCircle].filter(Boolean))
    queryCircle = null
    const { map, AMap } = getMapContext()
    if (
      !map ||
      !AMap ||
      !show ||
      !Number.isFinite(query?.longitude) ||
      !Number.isFinite(query?.latitude)
    )
      return
    queryCircle = new AMap.Circle({
      center: [query.longitude, query.latitude],
      radius: query.radiusMeters,
      strokeColor: MAP_MARKER_COLORS.hotels,
      strokeOpacity: selected ? 1 : 0.45,
      strokeWeight: selected ? 2 : 1,
      fillColor: '#d6c9ef',
      fillOpacity: selected ? 0.4 : 0.24,
      zIndex: 299,
      bubble: false,
      extData: { hotelQuery: true },
    })
    if (onHotelQuerySelect) queryCircle.on('click', onHotelQuerySelect)
    map.add([queryCircle])
  }

  function syncFreePoint(point) {
    remove([freePointMarker].filter(Boolean))
    freePointMarker = null
    const { map, AMap } = getMapContext()
    if (!map || !AMap || !point) return
    const content = createMapMarkerContent({
      icon: 'searchPoint',
      showIcon: false,
      selected: true,
      markerClass: 'metro-map-marker--dot map-click-point',
      label: '地图点击位置',
    })
    content.tabIndex = -1
    content.dataset.testid = 'map-click-point'
    content.setAttribute('aria-label', '地图点击位置')
    freePointMarker = new AMap.Marker({
      position: [point.longitude, point.latitude],
      content,
      anchor: 'center',
      zIndex: 530,
      clickable: false,
      bubble: true,
    })
    map.add([freePointMarker])
  }

  function fitHotelQuery() {
    const { map } = getMapContext()
    if (!queryCircle || !map) return false
    const [top, right, bottom, left] = getPadding()
    map.setFitView([queryCircle], false, [top + 30, bottom + 30, left + 30, right + 30], 15)
    return true
  }

  function destroy() {
    for (const event of ['moveend', 'zoomend', 'resize']) attachedMap?.off?.(event, layoutLabels)
    themeObserver?.disconnect()
    queryCircle?.off?.('click', onHotelQuerySelect)
    entries.forEach((entry) => entry.circle.off?.('click', entry.clickHandler))
    remove(
      [
        ...entries.flatMap((entry) => [entry.circle, entry.marker, entry.leader]),
        queryCircle,
        freePointMarker,
      ].filter(Boolean),
    )
    entries = []
    queryCircle = null
    freePointMarker = null
    attachedMap = null
  }

  return {
    getAreaScreenRects() {
      const { map } = getMapContext()
      if (!visible || !map?.lngLatToContainer) return []
      const origin = map.getContainer().getBoundingClientRect()
      return entries.map(({ circle }) => {
        const bounds = circle.getBounds()
        const a = map.lngLatToContainer(bounds.getSouthWest())
        const b = map.lngLatToContainer(bounds.getNorthEast())
        return {
          x: origin.x + Math.min(a.x, b.x),
          y: origin.y + Math.min(a.y, b.y),
          width: Math.abs(b.x - a.x),
          height: Math.abs(b.y - a.y),
        }
      })
    },
    syncAreas,
    fitAreas,
    syncHotelQuery,
    syncFreePoint,
    fitHotelQuery,
    destroy,
    layoutLabels,
    get areaCount() {
      return visible ? entries.length : 0
    },
  }
}
