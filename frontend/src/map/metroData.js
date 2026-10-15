// Display palette shared by map lines and station badges; formal source data stays intact.
export const METRO_LINE_COLORS = Object.freeze({
  metro_line_1: '#3F78A6',
  metro_line_2: '#B65369',
  metro_line_3: '#558861',
  metro_line_4: '#8271A3',
  metro_line_5: '#9D842D',
  metro_line_7: '#AD648F',
  metro_line_10: '#98704B',
  metro_line_s1: '#367F80',
})

export function metroLineColor(line) {
  return METRO_LINE_COLORS[line.id] || line.color
}

const ALLOWED_MAJOR_REASONS = new Set([
  'interchange',
  'gateway',
  'near_formal_attraction',
  'owner_confirmed',
])

function isFiniteCoordinate(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

export function isValidMetroLine(line) {
  return Boolean(
    line &&
    typeof line.id === 'string' &&
    /^metro_line_[a-z0-9_]+$/.test(line.id) &&
    typeof line.name === 'string' &&
    line.name.trim() &&
    typeof line.short_name === 'string' &&
    line.short_name.trim() &&
    typeof line.color === 'string' &&
    /^#[0-9A-F]{6}$/.test(line.color) &&
    Array.isArray(line.path) &&
    line.path.length >= 2 &&
    line.path.every(
      (point) =>
        Array.isArray(point) &&
        point.length === 2 &&
        isFiniteCoordinate(point[0]) &&
        isFiniteCoordinate(point[1]),
    ) &&
    Array.isArray(line.station_ids) &&
    line.station_ids.length >= 2,
  )
}

export function isValidMetroStation(station) {
  return Boolean(
    station &&
    typeof station.id === 'string' &&
    station.id.startsWith('metro_station_') &&
    typeof station.name === 'string' &&
    station.name.trim() &&
    station.location?.coord_system === 'GCJ-02' &&
    isFiniteCoordinate(station.location.longitude) &&
    station.location.longitude >= 118.2 &&
    station.location.longitude <= 119.5 &&
    isFiniteCoordinate(station.location.latitude) &&
    station.location.latitude >= 31.2 &&
    station.location.latitude <= 32.7 &&
    Array.isArray(station.line_ids) &&
    station.line_ids.length >= 1 &&
    typeof station.is_major === 'boolean' &&
    Array.isArray(station.major_reasons) &&
    (station.major_reasons.length === 0) === !station.is_major &&
    station.major_reasons.every((reason) => ALLOWED_MAJOR_REASONS.has(reason)),
  )
}

export function normalizeMetroNetwork(payload) {
  const lines = (Array.isArray(payload?.lines) ? payload.lines : [])
    .filter(isValidMetroLine)
    .map((line) => ({ ...line, color: metroLineColor(line) }))
  const stations = (Array.isArray(payload?.stations) ? payload.stations : []).filter(
    isValidMetroStation,
  )
  return { lines, stations }
}
