import { createMapMarkerContent, MAP_MARKER_COLORS, setMapMarkerSelected } from './mapMarkerIcons'
import { displayedDuckType, DUCK_TYPE_ICONS } from './duckRestaurantPresentation'

// Keep a small buffer around the viewport so points remain available while panning.
const VIEWPORT_BUFFER = 0.2
const NAME_ZOOM = 16

export function createDuckRestaurantMapLayer({ AMap, map, onRestaurantSelect, onCountChange }) {
  const entries = new Map()
  let shops = []
  let types = []
  let visible = false
  let selectedPoiId = null
  let destroyed = false
  let resizeFrame = null

  function inViewport(shop, bounds) {
    if (!bounds) return true
    const sw = bounds.getSouthWest()
    const ne = bounds.getNorthEast()
    const dx = (ne.getLng() - sw.getLng()) * VIEWPORT_BUFFER
    const dy = (ne.getLat() - sw.getLat()) * VIEWPORT_BUFFER
    return (
      shop.location.longitude >= sw.getLng() - dx &&
      shop.location.longitude <= ne.getLng() + dx &&
      shop.location.latitude >= sw.getLat() - dy &&
      shop.location.latitude <= ne.getLat() + dy
    )
  }

  function removeEntry(id, entry) {
    entry.marker.off('click', entry.clickHandler)
    map.remove(entry.marker)
    entries.delete(id)
  }

  function updateViewport() {
    if (destroyed) return
    const bounds = map.getBounds?.()
    const showNames = (map.getZoom?.() || 12) >= NAME_ZOOM
    const desired = new Map(
      (visible ? shops : [])
        .filter((shop) => inViewport(shop, bounds))
        .map((shop) => [shop.poi_id, shop]),
    )
    for (const [id, entry] of entries) {
      const shop = desired.get(id)
      if (!shop || entry.type !== displayedDuckType(shop, types)) removeEntry(id, entry)
    }
    const added = []
    for (const [id, shop] of desired) {
      let entry = entries.get(id)
      if (!entry) {
        const type = displayedDuckType(shop, types)
        const content = createMapMarkerContent({
          icon: DUCK_TYPE_ICONS[type],
          color: MAP_MARKER_COLORS.duck,
          label: `南京鸭：${shop.name}${shop.service_mode === 'takeaway' ? ' · 熟食外带' : ''}`,
          markerClass: 'duck-restaurant-map-marker',
        })
        content.dataset.duckRestaurantMarker = id
        content.dataset.duckType = type
        content.dataset.serviceMode = shop.service_mode
        if (shop.service_mode === 'takeaway') {
          const badge = document.createElement('span')
          badge.className = 'duck-restaurant-map-marker__takeaway'
          badge.textContent = '带'
          content.appendChild(badge)
        }
        const caption = document.createElement('span')
        caption.className = 'map-symbol-marker__caption'
        caption.textContent = shop.name
        content.appendChild(caption)
        const marker = new AMap.Marker({
          position: [shop.location.longitude, shop.location.latitude],
          anchor: 'center',
          title: shop.name,
          content,
          zIndex: 320,
        })
        const clickHandler = () => onRestaurantSelect?.(shop)
        marker.on('click', clickHandler)
        entry = { marker, content, caption, clickHandler, type }
        entries.set(id, entry)
        added.push(marker)
      }
      entry.caption.hidden = !showNames
      const selected = id === selectedPoiId
      setMapMarkerSelected(entry.content, selected)
      entry.marker.setzIndex(selected ? 360 : 320)
    }
    if (added.length) map.add(added)
    onCountChange?.(entries.size)
  }

  // AMap emits resize before committing its new bounds; read them on the next frame.
  function onResize() {
    if (resizeFrame !== null || destroyed) return
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = null
      updateViewport()
    })
  }
  const events = ['moveend', 'zoomend', 'complete']
  events.forEach((event) => map.on(event, updateViewport))
  map.on('resize', onResize)

  function render(nextShops, options = {}) {
    if (destroyed) return 0
    shops = nextShops
    types = options.types || []
    visible = Boolean(options.visible)
    selectedPoiId = options.selectedPoiId || null
    updateViewport()
    return entries.size
  }

  function selectRestaurant(shop, { focus = false } = {}) {
    if (destroyed) return
    selectedPoiId = shop?.poi_id || null
    if (focus && visible && shops.some((candidate) => candidate.poi_id === selectedPoiId)) {
      map.setZoomAndCenter(16, [shop.location.longitude, shop.location.latitude], true)
    }
    updateViewport()
  }

  function destroy() {
    if (destroyed) return
    destroyed = true
    if (resizeFrame !== null) cancelAnimationFrame(resizeFrame)
    resizeFrame = null
    events.forEach((event) => map.off(event, updateViewport))
    map.off('resize', onResize)
    for (const [id, entry] of entries) removeEntry(id, entry)
    shops = []
    onCountChange?.(0)
  }

  return { render, selectRestaurant, destroy }
}
