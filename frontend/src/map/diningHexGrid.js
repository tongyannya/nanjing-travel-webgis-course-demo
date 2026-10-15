const METERS_PER_LATITUDE_DEGREE = 111_320

export const DINING_GRID = Object.freeze({
  coord_system: 'GCJ-02',
  layout: 'flat_top',
  origin: Object.freeze({ longitude: 118.6, latitude: 31.85 }),
  hex_radius_meters: 570,
  meters_per_latitude_degree: METERS_PER_LATITUDE_DEGREE,
  ordinary_radius_meters: 600,
  ordinary_max_pages: 5,
})

export function diningHexIdForLocation(location, grid = DINING_GRID) {
  if (
    !Number.isFinite(location?.longitude) ||
    !Number.isFinite(location?.latitude) ||
    location.longitude < 118 ||
    location.longitude > 119.3 ||
    location.latitude < 31.2 ||
    location.latitude > 32.7
  ) {
    throw new Error('餐饮点位坐标无效。')
  }
  const latitudeScale = grid.meters_per_latitude_degree
  const longitudeScale = latitudeScale * Math.cos((grid.origin.latitude * Math.PI) / 180)
  const x = (location.longitude - grid.origin.longitude) * longitudeScale
  const y = (location.latitude - grid.origin.latitude) * latitudeScale
  const radius = grid.hex_radius_meters
  const q = ((2 / 3) * x) / radius
  const r = ((-1 / 3) * x + (Math.sqrt(3) / 3) * y) / radius
  const cubeY = -q - r
  let roundedQ = Math.round(q)
  const roundedY = Math.round(cubeY)
  let roundedR = Math.round(r)
  const dq = Math.abs(roundedQ - q)
  const dy = Math.abs(roundedY - cubeY)
  const dr = Math.abs(roundedR - r)
  if (dq > dy && dq > dr) roundedQ = -roundedY - roundedR
  else if (dr >= dy) roundedR = -roundedQ - roundedY
  return `dining_hex_${roundedQ}_${roundedR}`
}

export function diningHexagonPath(cell) {
  // Give the SDK its own path, so polygon processing cannot mutate shared data.
  return cell.boundary.map(([longitude, latitude]) => [longitude, latitude])
}

export function createDiningHexGrid(cells, grid = DINING_GRID) {
  const byId = new Map(cells.map((cell) => [cell.id, cell]))
  if (byId.size !== cells.length) throw new Error('餐饮网格编号重复。')
  return Object.freeze({
    getCell: (id) => byId.get(id) || null,
    findCell: (location) => byId.get(diningHexIdForLocation(location, grid)) || null,
  })
}
