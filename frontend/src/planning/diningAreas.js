import { isValidDiningDensityArea } from '../map/diningDensityData'
import { isValidMealHexagon } from './routeMeals'

export const RESTAURANT_PAGE_SIZE = 20

function isFiniteCoordinate(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

export function isNanjingLocation(location) {
  return Boolean(
    location &&
    location.coord_system === 'GCJ-02' &&
    isFiniteCoordinate(location.longitude) &&
    location.longitude >= 118.0 &&
    location.longitude <= 119.3 &&
    isFiniteCoordinate(location.latitude) &&
    location.latitude >= 31.2 &&
    location.latitude <= 32.7,
  )
}

export function isValidDiningAreaSnapshot(area) {
  if (isValidMealHexagon(area)) return true
  return Boolean(
    area &&
    typeof area.id === 'string' &&
    area.id.trim() &&
    area.has_suitable_area === true &&
    isNanjingLocation(area.center) &&
    Number.isInteger(area.radius_meters) &&
    area.radius_meters >= 100 &&
    area.radius_meters <= 3000,
  )
}

export function diningAreaContextKey(item) {
  if (!item || !['meal_area', 'route_meal'].includes(item.type)) return ''
  const area = item.dining_area
  if (isValidMealHexagon(area)) return `route:${item.item_id}:${area.data_version}:${area.id}`
  if (!isValidDiningAreaSnapshot(area)) {
    return ''
  }
  return [
    `route:${item.item_id}`,
    area.id,
    area.center.longitude,
    area.center.latitude,
    area.radius_meters,
  ].join(':')
}

export function diningDensityContextKey(area) {
  if (!isValidDiningDensityArea(area)) return ''
  return [
    `overview:${area.id}`,
    area.center.longitude,
    area.center.latitude,
    area.radius_meters,
  ].join(':')
}

export function normalizeRestaurantResults(restaurants) {
  const unique = new Map()
  for (const restaurant of Array.isArray(restaurants) ? restaurants : []) {
    if (
      !restaurant ||
      typeof restaurant.poi_id !== 'string' ||
      !restaurant.poi_id.trim() ||
      typeof restaurant.name !== 'string' ||
      !restaurant.name.trim() ||
      !isNanjingLocation(restaurant.location)
    ) {
      continue
    }
    if (!unique.has(restaurant.poi_id)) unique.set(restaurant.poi_id, restaurant)
  }
  return [...unique.values()].slice(0, RESTAURANT_PAGE_SIZE)
}
