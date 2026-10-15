import { DUCK_TYPES } from './diningSnapshotData'

export const DUCK_TYPE_ICONS = Object.freeze({
  salted_duck: 'saltedDuck',
  duck_blood_soup: 'duckSoup',
  roast_duck: 'roastDuck',
  pressed_duck: 'pressedDuck',
})

export function filterDuckShops(shops, types, includeTakeaway) {
  const selected = new Set(types)
  return shops.filter(
    (shop) =>
      (includeTakeaway || shop.service_mode !== 'takeaway') &&
      shop.duck_types.some((type) => selected.has(type)),
  )
}

export function displayedDuckType(shop, types = DUCK_TYPES) {
  if (types.length === 1 && shop.duck_types.includes(types[0])) return types[0]
  return shop.primary_duck_type
}
