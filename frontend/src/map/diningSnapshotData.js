import { createDiningHexGrid, DINING_GRID, diningHexIdForLocation } from './diningHexGrid'

export const DUCK_TYPES = Object.freeze([
  'salted_duck',
  'duck_blood_soup',
  'roast_duck',
  'pressed_duck',
])
const EMPTY_SHOPS = Object.freeze([])
const MODES = ['meal_candidate', 'takeaway', 'other_meal_time']

function requireValid(condition) {
  if (!condition) throw new Error('餐饮资料暂时无法读取，请稍后重试。')
}

function ordinaryBand(count) {
  requireValid(Number.isInteger(count) && count >= 0 && count !== 49)
  return count < 15 ? 'hidden' : count <= 48 ? 'blue' : count <= 99 ? 'yellow' : 'red'
}

function duckBand(count) {
  return count === 0 ? 'hidden' : count === 1 ? 'one' : count <= 5 ? 'two_to_five' : 'over_five'
}

function freezeData(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeData)
    Object.freeze(value)
  }
  return value
}

export function createDiningSnapshotIndex(data) {
  requireValid(
    data?.data_version === 'dining-map-snapshot-2026-10-05-v2' &&
      /^[a-f0-9]{64}$/.test(data.source_digest) &&
      data.cells?.length === 461 &&
      data.shops?.length === 1670 &&
      data.ordinary_shops?.length === 15819 &&
      data.grid &&
      Object.keys(DINING_GRID).every((key) =>
        key === 'origin'
          ? data.grid.origin?.longitude === 118.6 && data.grid.origin?.latitude === 31.85
          : data.grid[key] === DINING_GRID[key],
      ),
  )
  const grid = createDiningHexGrid(data.cells, data.grid)
  const byPoiId = new Map()
  const grouped = new Map(data.cells.map((cell) => [cell.id, []]))
  const duckShops = []
  const cuisineShops = []
  const ordinaryById = new Map()
  const ordinaryGrouped = new Map()
  for (const shop of data.ordinary_shops) {
    requireValid(
      typeof shop.poi_id === 'string' &&
        shop.poi_id.trim() &&
        !ordinaryById.has(shop.poi_id) &&
        typeof shop.name === 'string' &&
        shop.name.trim() &&
        shop.location?.coord_system === 'GCJ-02' &&
        Number.isFinite(shop.location.longitude) &&
        Number.isFinite(shop.location.latitude),
    )
    ordinaryById.set(shop.poi_id, shop)
  }
  for (const shop of data.shops) {
    requireValid(
      typeof shop.poi_id === 'string' &&
        shop.poi_id.trim() &&
        !byPoiId.has(shop.poi_id) &&
        typeof shop.name === 'string' &&
        shop.name.trim() &&
        shop.location?.coord_system === 'GCJ-02' &&
        MODES.includes(shop.service_mode) &&
        Array.isArray(shop.duck_types) &&
        new Set(shop.duck_types).size === shop.duck_types.length &&
        shop.duck_types.every((type) => DUCK_TYPES.includes(type)) &&
        shop.display_hex_id === (grid.findCell(shop.location)?.id || null),
    )
    byPoiId.set(shop.poi_id, shop)
    if (shop.collection === 'duck') {
      requireValid(shop.duck_types.length && shop.duck_types.includes(shop.primary_duck_type))
      duckShops.push(shop)
      if (shop.display_hex_id) grouped.get(shop.display_hex_id).push(shop)
    } else {
      requireValid(
        shop.collection === 'nanjing_cuisine' &&
          !shop.duck_types.length &&
          shop.primary_duck_type === null &&
          shop.service_mode === 'meal_candidate' &&
          shop.nanjing_cuisine_tag === true,
      )
      cuisineShops.push(shop)
    }
  }
  const ordinaryCounts = { hidden: 0, blue: 0, yellow: 0, red: 0 }
  const duckCounts = { hidden: 0, one: 0, two_to_five: 0, over_five: 0 }
  for (const cell of data.cells) {
    const ordinaryIds = cell.ordinary?.poi_ids
    requireValid(
      Array.isArray(ordinaryIds) &&
        ordinaryIds.length === cell.ordinary.meal_sample_count &&
        new Set(ordinaryIds).size === ordinaryIds.length &&
        ordinaryIds.every((id) => ordinaryById.has(id)),
    )
    ordinaryGrouped.set(cell.id, Object.freeze(ordinaryIds.map((id) => ordinaryById.get(id))))
    const members = grouped.get(cell.id)
    const expectedMembers = members.map((shop) => shop.poi_id).sort()
    requireValid(
      cell.id === `dining_hex_${cell.q}_${cell.r}` &&
        cell.center?.coord_system === 'GCJ-02' &&
        diningHexIdForLocation(cell.center, data.grid) === cell.id &&
        Array.isArray(cell.boundary) &&
        cell.boundary.length === 6 &&
        cell.boundary.every(
          (point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite),
        ) &&
        cell.ordinary?.band === ordinaryBand(cell.ordinary?.meal_sample_count) &&
        Number.isInteger(cell.ordinary.pages_queried) &&
        cell.ordinary.pages_queried >= 1 &&
        cell.ordinary.pages_queried <= 5 &&
        typeof cell.ordinary.is_capped === 'boolean' &&
        cell.duck?.shop_count === members.length &&
        cell.duck.band === duckBand(members.length) &&
        Array.isArray(cell.duck.poi_ids) &&
        JSON.stringify(cell.duck.poi_ids) === JSON.stringify(expectedMembers) &&
        MODES.every(
          (mode) =>
            cell.duck[`${mode}_count`] ===
            members.filter((shop) => shop.service_mode === mode).length,
        ) &&
        DUCK_TYPES.every(
          (type) =>
            cell.duck.type_counts?.[type] ===
            members.filter((shop) => shop.duck_types.includes(type)).length,
        ),
    )
    ordinaryCounts[cell.ordinary.band] += 1
    duckCounts[cell.duck.band] += 1
  }
  requireValid(
    duckShops.length === 1505 &&
      cuisineShops.length === 165 &&
      duckShops.filter((shop) => shop.service_mode !== 'takeaway').length === 1085 &&
      duckShops.filter((shop) => shop.display_hex_id).length === 910 &&
      JSON.stringify(ordinaryCounts) ===
        JSON.stringify({ hidden: 224, blue: 82, yellow: 75, red: 80 }) &&
      JSON.stringify(duckCounts) ===
        JSON.stringify({ hidden: 283, one: 61, two_to_five: 71, over_five: 46 }),
  )
  freezeData(data)
  grouped.forEach((members) => Object.freeze(members))
  return Object.freeze({
    data,
    duckShops: Object.freeze(duckShops),
    cuisineShops: Object.freeze(cuisineShops),
    getCell: grid.getCell,
    findCell: grid.findCell,
    getShop: (id) => byPoiId.get(id) || null,
    getOrdinaryShop: (id) => ordinaryById.get(id) || null,
    getDuckShopsForCell: (id) => grouped.get(id) || EMPTY_SHOPS,
    getOrdinaryShopsForCell: (id) => ordinaryGrouped.get(id) || EMPTY_SHOPS,
  })
}

function abortError() {
  return new DOMException('餐饮数据读取已取消。', 'AbortError')
}

export function createDiningSnapshotRepository(
  importer = () => import('../../../data/formal/dining_map_snapshot.json'),
) {
  let pending = null
  function load({ signal } = {}) {
    if (signal?.aborted) return Promise.reject(abortError())
    if (!pending) {
      const task = Promise.resolve()
        .then(importer)
        .then((module) => createDiningSnapshotIndex(module.default))
      pending = task.catch((error) => {
        pending = null
        throw error
      })
    }
    if (!signal) return pending
    const shared = pending
    return new Promise((resolve, reject) => {
      const removeListener = () => signal.removeEventListener('abort', onAbort)
      const onAbort = () => {
        removeListener()
        reject(abortError())
      }
      signal.addEventListener('abort', onAbort, { once: true })
      shared.then(
        (value) => {
          removeListener()
          resolve(value)
        },
        (error) => {
          removeListener()
          reject(error)
        },
      )
    })
  }
  return Object.freeze({ load })
}

export const diningSnapshotRepository = createDiningSnapshotRepository()
