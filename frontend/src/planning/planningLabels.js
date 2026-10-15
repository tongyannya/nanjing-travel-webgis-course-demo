// Wording depends on where it appears; short timeline labels stay short.
export const PLAN_LABELS = Object.freeze({
  relaxed: '轻松方案',
  compact: '紧凑方案',
  duck: '鸭子特色',
})
export const PLAN_SHORT_LABELS = Object.freeze({
  relaxed: '轻松',
  compact: '紧凑',
  duck: PLAN_LABELS.duck,
})
export const PLAN_FORM_LABELS = Object.freeze({ ...PLAN_LABELS, duck: '鸭子特色方案' })
export const PLAN_TYPES = Object.freeze(Object.keys(PLAN_LABELS))
export const TRANSPORT_MODE_LABELS = Object.freeze({
  public_transit: '公共交通',
  taxi: '出租车',
  self_drive: '自驾',
  walk: '步行',
})
export const TRANSPORT_PREFERENCE_LABELS = Object.freeze({
  public_transit: '公共交通优先',
  taxi: '打车／自驾',
  self_drive: '打车／自驾',
})
export const ITEM_TYPE_LABELS = Object.freeze({
  start: '出发',
  attraction: '景点',
  meal_area: '用餐区域',
  duck_restaurant: '鸭类美食',
  free_time: '空闲',
  end: '结束',
})
