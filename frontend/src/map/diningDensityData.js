export const ORDINARY_DENSITY_BANDS = Object.freeze([
  { level: 'blue', label: '15–48 家', sample_range: '15–48' },
  { level: 'yellow', label: '50–99 家', sample_range: '50–99' },
  { level: 'red', label: '100 家及以上', sample_range: '≥100' },
])

export const DINING_SNAPSHOT_NOTE = '餐饮资料采集于2026年10月4日。'

export function diningDensityAreasFromSnapshot(index) {
  return index.data.cells
    .filter((cell) => cell.ordinary.band !== 'hidden')
    .map((cell) => ({
      id: cell.id,
      center: cell.center,
      boundary: cell.boundary,
      radius_meters: index.data.grid.ordinary_radius_meters,
      hex_radius_meters: index.data.grid.hex_radius_meters,
      density_level: cell.ordinary.band,
      density_label: ORDINARY_DENSITY_BANDS.find((band) => band.level === cell.ordinary.band).label,
      meal_sample_count: cell.ordinary.meal_sample_count,
      is_capped: cell.ordinary.is_capped,
    }))
}

export function isValidDiningDensityArea(area) {
  const count = area?.meal_sample_count
  const band =
    count >= 100 ? 'red' : count >= 50 ? 'yellow' : count >= 15 && count <= 48 ? 'blue' : null
  return Boolean(
    /^dining_hex_-?\d+_-?\d+$/.test(area?.id) &&
    Number.isInteger(count) &&
    band &&
    area.density_level === band &&
    area.center?.coord_system === 'GCJ-02' &&
    Number.isFinite(area.center.longitude) &&
    Number.isFinite(area.center.latitude) &&
    area.radius_meters === 600 &&
    Array.isArray(area.boundary) &&
    area.boundary.length === 6 &&
    area.boundary.every(
      (point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite),
    ),
  )
}

export function normalizeDiningDensityAreas(areas) {
  const unique = new Map()
  for (const area of Array.isArray(areas) ? areas : []) {
    if (isValidDiningDensityArea(area) && !unique.has(area.id)) unique.set(area.id, area)
  }
  return [...unique.values()]
}
