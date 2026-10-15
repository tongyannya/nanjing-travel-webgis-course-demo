export const DUCK_RESTAURANT_LIMITED_SEARCH_NOTE = '按鸭菜类别和路线位置筛选的餐馆。'

export const DUCK_TYPE_LABELS = Object.freeze({
  salted_duck: '盐水鸭',
  duck_blood_soup: '鸭血粉丝汤',
  roast_duck: '金陵烤鸭',
  pressed_duck: '板鸭',
  nanjing_cuisine: '南京特色菜',
})

const MEAL_KIND_LABELS = Object.freeze({ lunch: '午餐', dinner: '晚餐' })

export function duckTypeLabel(value) {
  return DUCK_TYPE_LABELS[value] || '主类别待确认'
}

export function mealKindLabel(value) {
  return MEAL_KIND_LABELS[value] || '用餐'
}

export function planItemTypeLabel(item) {
  if (item?.type !== 'duck_restaurant') return ''
  return `鸭类美食 · ${mealKindLabel(item.meal_kind)} · ${duckTypeLabel(item.featured_duck_type)}`
}

export function duckRestaurantInfoLines(item) {
  if (item?.type !== 'duck_restaurant') return []
  return [
    `${mealKindLabel(item.meal_kind)} · 主类别：${duckTypeLabel(item.featured_duck_type)}`,
    DUCK_RESTAURANT_LIMITED_SEARCH_NOTE,
  ]
}
