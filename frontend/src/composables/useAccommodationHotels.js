import { computed, ref } from 'vue'
import { ACCOMMODATION_AREA_OPTIONS } from '../planning/accommodationOptions'
import { MAP_MARKER_COLORS } from '../map/mapMarkerIcons'
import { useHotelLayer } from './useHotelLayer'

export function mergeHotelLayers(nearby, areas) {
  const hotels = new Map()
  for (const [items, markerSource, markerColor] of [
    [nearby, 'nearby', MAP_MARKER_COLORS.hotels],
    [areas, 'area', MAP_MARKER_COLORS.accommodationAreas],
  ]) {
    for (const hotel of items) {
      const key =
        hotel.poi_id || `${hotel.location?.longitude},${hotel.location?.latitude}:${hotel.name}`
      hotels.set(key, { ...hotel, markerSource, markerColor })
    }
  }
  return [...hotels.values()]
}

export function useAccommodationHotels() {
  const activeAreaIds = ref([])
  const pending = new Map()
  const layers = Object.fromEntries(
    ACCOMMODATION_AREA_OPTIONS.map((area) => [
      area.id,
      useHotelLayer({
        getQueryCenter: () => ({
          longitude: area.longitude,
          latitude: area.latitude,
          centerLabel: area.name,
        }),
      }),
    ]),
  )
  const cache = computed(() =>
    Object.fromEntries(
      Object.entries(layers).map(([id, layer]) => [
        id,
        {
          hotels: layer.hotels.value,
          query: layer.hotelQuery.value,
          state: layer.hotelState.value,
          message: layer.hotelMessage.value,
        },
      ]),
    ),
  )
  const activeHotels = computed(() =>
    activeAreaIds.value.flatMap((id) => cache.value[id]?.hotels || []),
  )

  function loadArea(id, { force = false } = {}) {
    const layer = layers[id]
    if (!layer) return Promise.resolve(false)
    if (pending.has(id)) return pending.get(id)
    if (!force && layer.hotelState.value === 'success' && layer.hotelQueryComplete.value)
      return Promise.resolve(true)
    const request = layer
      .queryHotels(null, { replace: true, fetchAllPages: true })
      .finally(() => pending.delete(id))
    pending.set(id, request)
    return request
  }
  function preload() {
    return Promise.allSettled(ACCOMMODATION_AREA_OPTIONS.map((area) => loadArea(area.id)))
  }
  function toggleArea(id) {
    if (activeAreaIds.value.includes(id)) {
      if (!pending.has(id) && !layers[id].hotelQueryComplete.value) {
        void loadArea(id)
        return true
      }
      activeAreaIds.value = activeAreaIds.value.filter((active) => active !== id)
      return false
    }
    activeAreaIds.value = [id]
    void loadArea(id)
    return true
  }
  return { cache, activeAreaIds, activeHotels, loadArea, preload, toggleArea }
}
