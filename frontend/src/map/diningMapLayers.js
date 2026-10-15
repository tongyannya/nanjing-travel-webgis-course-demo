import { isValidDiningAreaSnapshot } from '../planning/diningAreas'
import { createMapMarkerContent, MAP_MARKER_COLORS, setMapMarkerSelected } from './mapMarkerIcons'

const DENSITY_STYLES = Object.freeze({
  unsuitable: { strokeColor: '#b45309', fillColor: '#f59e0b' },
  normal: { strokeColor: '#0f766e', fillColor: '#2a9d8f' },
  rich: { strokeColor: '#b7791f', fillColor: '#d6a231' },
  cluster: { strokeColor: '#b23a2b', fillColor: '#d75b45' },
})

function areaStyle(level, selected) {
  const colors = DENSITY_STYLES[level] || DENSITY_STYLES.normal
  return {
    ...colors,
    strokeOpacity: selected ? 0.95 : 0.78,
    strokeWeight: selected ? 5 : 2,
    fillOpacity: selected ? 0.22 : 0.12,
    zIndex: selected ? 205 : 180,
  }
}

function removeEntries(map, entries) {
  entries.forEach(({ overlay, clickHandler }) => overlay.off?.('click', clickHandler))
  if (entries.length) map.remove(entries.map(({ overlay }) => overlay))
}

export function diningAreaSequencePosition(area) {
  if (area.boundary) return area.boundary[1]
  const diagonalMeters = area.radius_meters / Math.sqrt(2)
  const latitudeRadians = (area.center.latitude * Math.PI) / 180
  const latitudeOffset = diagonalMeters / 111_320
  const longitudeOffset = diagonalMeters / (111_320 * Math.cos(latitudeRadians))
  return [area.center.longitude + longitudeOffset, area.center.latitude + latitudeOffset]
}

function areaSequenceContent(item, sequence) {
  const content = document.createElement('button')
  content.type = 'button'
  content.className = 'dining-area-map-sequence'
  content.textContent = String(sequence)
  content.title = `路线序号 ${sequence}：${item.name}`
  content.setAttribute('aria-label', content.title)
  return content
}

export function createDiningMapLayers({
  AMap,
  map,
  onAreaSelect,
  onRestaurantSelect,
  getFitPadding = () => [130, 110, 180, 110],
}) {
  let areaEntries = []
  let restaurantEntries = []
  let areasVisible = true
  let restaurantsVisible = false
  let selectedAreaItemId = ''
  let selectedRestaurantPoiId = ''

  function applyAreaVisibility() {
    areaEntries.forEach(({ labelOverlay, overlay }) => {
      for (const target of [overlay, labelOverlay]) {
        if (areasVisible) target.show()
        else target.hide()
      }
    })
  }

  function applyRestaurantVisibility() {
    restaurantEntries.forEach(({ overlay }) => {
      if (restaurantsVisible) overlay.show()
      else overlay.hide()
    })
  }

  function applyAreaSelection({ focus = false } = {}) {
    let selectedEntry = null
    areaEntries.forEach((entry) => {
      const selected = entry.item.item_id === selectedAreaItemId
      entry.overlay.setOptions(
        areaStyle(
          entry.item.route_meal?.area_kind === 'duck'
            ? 'rich'
            : entry.item.dining_area.density_level,
          selected,
        ),
      )
      entry.labelContent.classList.toggle('dining-area-map-sequence--selected', selected)
      entry.labelOverlay.setzIndex?.(selected ? 218 : 208)
      if (selected) selectedEntry = entry
    })
    if (focus && selectedEntry) {
      map.setFitView([selectedEntry.overlay], true, getFitPadding(), 15)
    }
  }

  function applyRestaurantSelection({ focus = false } = {}) {
    let selectedEntry = null
    restaurantEntries.forEach((entry) => {
      const selected = entry.restaurant.poi_id === selectedRestaurantPoiId
      setMapMarkerSelected(entry.content, selected)
      entry.content.classList.toggle('restaurant-map-marker--selected', selected)
      entry.overlay.setzIndex?.(selected ? 360 : 320)
      if (selected) selectedEntry = entry
    })
    if (focus && selectedEntry) {
      const location = selectedEntry.restaurant.location
      map.setZoomAndCenter(16, [location.longitude, location.latitude])
    }
  }

  function clearAreas() {
    areaEntries.forEach(({ labelOverlay, labelClickHandler, overlay, clickHandler }) => {
      overlay.off?.('click', clickHandler)
      labelOverlay.off?.('click', labelClickHandler)
    })
    if (areaEntries.length) {
      map.remove(areaEntries.flatMap(({ labelOverlay, overlay }) => [overlay, labelOverlay]))
    }
    areaEntries = []
  }

  function clearRestaurants() {
    removeEntries(map, restaurantEntries)
    restaurantEntries = []
    selectedRestaurantPoiId = ''
  }

  function renderAreas(items, { selectedItemId = '', sequenceByItemId = {}, visible = true } = {}) {
    areasVisible = Boolean(visible)
    selectedAreaItemId = selectedItemId || ''
    const validItems = (Array.isArray(items) ? items : []).filter(
      (item) =>
        ['meal_area', 'route_meal'].includes(item?.type) &&
        isValidDiningAreaSnapshot(item.dining_area),
    )
    if (
      validItems.length === areaEntries.length &&
      validItems.every(
        (item, index) =>
          areaEntries[index].item === item &&
          areaEntries[index].sequence === (sequenceByItemId[item.item_id] || index + 1),
      )
    ) {
      applyAreaVisibility()
      applyAreaSelection()
      return areaEntries.length
    }
    clearAreas()
    areaEntries = validItems.map((item, index) => {
      const area = item.dining_area
      const sequence = sequenceByItemId[item.item_id] || index + 1
      const overlay = area.boundary
        ? new AMap.Polygon({
            path: area.boundary.map((point) => [...point]),
            bubble: false,
            ...areaStyle(
              item.route_meal?.area_kind === 'duck' ? 'rich' : 'normal',
              item.item_id === selectedAreaItemId,
            ),
          })
        : new AMap.Circle({
            center: [area.center.longitude, area.center.latitude],
            radius: area.radius_meters,
            bubble: false,
            ...areaStyle(area.density_level, item.item_id === selectedAreaItemId),
          })
      const clickHandler = () => onAreaSelect?.(item)
      const labelContent = areaSequenceContent(item, sequence)
      const labelOverlay = new AMap.Marker({
        position: diningAreaSequencePosition(area),
        title: labelContent.title,
        anchor: 'center',
        content: labelContent,
        bubble: false,
        zIndex: 208,
      })
      const labelClickHandler = () => onAreaSelect?.(item)
      overlay.on('click', clickHandler)
      labelOverlay.on('click', labelClickHandler)
      return {
        clickHandler,
        item,
        labelClickHandler,
        labelContent,
        labelOverlay,
        overlay,
        sequence,
      }
    })
    if (areaEntries.length) {
      map.add(areaEntries.flatMap(({ labelOverlay, overlay }) => [overlay, labelOverlay]))
    }
    applyAreaVisibility()
    applyAreaSelection()
    return areaEntries.length
  }

  function renderRestaurants(
    restaurants,
    {
      selectedPoiId = '',
      visible = false,
      cuisineShops = [],
      cuisineVisible = false,
      nearbyVisible = true,
      excludedPoiIds = [],
    } = {},
  ) {
    restaurantsVisible = Boolean(visible)
    const unique = new Map()
    for (const shop of cuisineVisible ? cuisineShops : []) {
      unique.set(shop.poi_id, { ...shop, dining_sources: ['nanjing_cuisine'], local_shop: shop })
    }
    for (const restaurant of nearbyVisible && Array.isArray(restaurants) ? restaurants : []) {
      const localShop = cuisineShops.find((shop) => shop.poi_id === restaurant.poi_id)
      unique.set(
        restaurant.poi_id,
        localShop
          ? { ...restaurant, dining_sources: ['nearby', 'nanjing_cuisine'], local_shop: localShop }
          : restaurant,
      )
    }
    // The duck layer owns matching POIs while visible, including ordinary-list results.
    for (const id of excludedPoiIds) unique.delete(id)
    const nextRestaurants = [...unique.values()]
    if (
      nextRestaurants.length === restaurantEntries.length &&
      nextRestaurants.every(
        (restaurant, index) => restaurantEntries[index].restaurant === restaurant,
      )
    ) {
      selectedRestaurantPoiId = selectedPoiId || ''
      applyRestaurantVisibility()
      applyRestaurantSelection()
      return restaurantEntries.length
    }
    clearRestaurants()
    selectedRestaurantPoiId = selectedPoiId || ''
    restaurantEntries = nextRestaurants.map((restaurant) => {
      const content = createMapMarkerContent({
        icon: 'dining',
        color:
          restaurant.dining_sources?.[0] === 'nanjing_cuisine'
            ? MAP_MARKER_COLORS.nanjingCuisine
            : MAP_MARKER_COLORS.dining,
        label: `饭店：${restaurant.name}`,
        markerClass: 'restaurant-map-marker',
      })
      content.dataset.restaurantMarker = restaurant.poi_id
      content.dataset.diningSources = (restaurant.dining_sources || ['nearby']).join(',')
      const overlay = new AMap.Marker({
        position: [restaurant.location.longitude, restaurant.location.latitude],
        title: restaurant.name,
        anchor: 'center',
        content,
        zIndex: 320,
      })
      const clickHandler = () => onRestaurantSelect?.(restaurant)
      overlay.on('click', clickHandler)
      return { clickHandler, content, overlay, restaurant }
    })
    if (restaurantEntries.length) map.add(restaurantEntries.map(({ overlay }) => overlay))
    applyRestaurantVisibility()
    applyRestaurantSelection()
    return restaurantEntries.length
  }

  function selectArea(itemId, options) {
    selectedAreaItemId = itemId || ''
    applyAreaSelection(options)
  }

  function selectRestaurant(poiId, options) {
    selectedRestaurantPoiId = poiId || ''
    applyRestaurantSelection(options)
  }

  function setAreasVisible(visible) {
    areasVisible = Boolean(visible)
    applyAreaVisibility()
  }

  function setRestaurantsVisible(visible) {
    restaurantsVisible = Boolean(visible)
    applyRestaurantVisibility()
  }

  function destroy() {
    clearAreas()
    clearRestaurants()
    selectedAreaItemId = ''
  }

  return {
    clearAreas,
    clearRestaurants,
    destroy,
    getAreaCount: () => areaEntries.length,
    getRestaurantCount: () => restaurantEntries.length,
    renderAreas,
    renderRestaurants,
    selectArea,
    selectRestaurant,
    setAreasVisible,
    setRestaurantsVisible,
  }
}
