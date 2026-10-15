export function isValidMealHexagon(area) {
  return Boolean(
    area &&
    typeof area.id === 'string' &&
    /^dining_hex_-?\d+_-?\d+$/u.test(area.id) &&
    area.center?.coord_system === 'GCJ-02' &&
    Number.isFinite(area.center.longitude) &&
    Number.isFinite(area.center.latitude) &&
    Array.isArray(area.boundary) &&
    area.boundary.length === 6 &&
    area.boundary.every(
      (point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite),
    ) &&
    Number.isInteger(area.ordinary_count) &&
    area.ordinary_count >= 0 &&
    Number.isInteger(area.duck_meal_count) &&
    area.duck_meal_count >= 0 &&
    typeof area.data_version === 'string' &&
    Array.isArray(area.duck_types),
  )
}

export function routeMealItemId(leg, meal) {
  return `${leg.from_item_id}_${leg.to_item_id}_${meal.meal_kind}`
}

function mealItemsForLeg(leg) {
  return [...(leg?.meals || [])]
    .sort((left, right) => left.start_time.localeCompare(right.start_time))
    .map((meal) => ({
      type: 'route_meal',
      item_id: routeMealItemId(leg, meal),
      name: `${meal.meal_kind === 'lunch' ? '午餐' : '晚餐'} · ${meal.area_kind === 'duck' ? '南京鸭用餐区域' : '餐饮便利区'}`,
      meal_kind: meal.meal_kind,
      start_time: meal.start_time,
      end_time: meal.end_time,
      dining_area: meal.area,
      route_meal: meal,
    }))
}

// Meals take a chronological number without becoming route destinations.
export function routeSequenceItems(day) {
  return (day?.items || []).flatMap((item) => [
    item,
    ...(day.legs || []).filter((leg) => leg.from_item_id === item.item_id).flatMap(mealItemsForLeg),
  ])
}

export function routeSequenceByItemId(day) {
  return Object.fromEntries(routeSequenceItems(day).map((item, index) => [item.item_id, index + 1]))
}

export function routeMealItems(day) {
  return (day?.legs || [])
    .flatMap(mealItemsForLeg)
    .filter((item) => isValidMealHexagon(item.dining_area))
}

export function mealReservationMinutes(leg) {
  return (leg?.meals || []).reduce((sum, meal) => sum + meal.duration_minutes, 0)
}

export function routeMealText(meal) {
  return `${meal.meal_kind === 'lunch' ? '午餐' : '晚餐'}：途中预留1小时${meal.area_kind === 'duck' ? '南京鸭用餐' : '用餐'}${meal.area ? '，在所选蜂巢内自行选择餐馆' : '，自由安排'}`
}

export function isValidRouteMeals(day, planType) {
  const seen = new Set()
  const clock = (value) => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/u.test(value)) return NaN
    const [hour, minute] = value.split(':').map(Number)
    return hour * 60 + minute
  }
  return (day.legs || []).every((leg) => {
    if (!Object.hasOwn(leg, 'meals')) return true
    if (!Array.isArray(leg.meals)) return false
    const previous = day.items.find((item) => item.item_id === leg.from_item_id)
    const following = day.items.find((item) => item.item_id === leg.to_item_id)
    if (!previous || !following) return false
    if (
      clock(following.start_time) - clock(previous.end_time) <
      leg.duration_minutes_rounded + mealReservationMinutes(leg)
    )
      return false
    return leg.meals.every((meal) => {
      const valid =
        ['lunch', 'dinner'].includes(meal.meal_kind) &&
        !seen.has(meal.meal_kind) &&
        meal.duration_minutes === 60 &&
        clock(meal.end_time) - clock(meal.start_time) === 60 &&
        clock(meal.start_time) >= clock(previous.end_time) &&
        clock(meal.end_time) <= clock(following.start_time) &&
        !day.items.some((item) => item.meal_kind === meal.meal_kind) &&
        ['ordinary', 'duck'].includes(meal.area_kind) &&
        (meal.area === null || isValidMealHexagon(meal.area)) &&
        (meal.area_kind !== 'duck' || (planType === 'duck' && meal.area?.duck_meal_count > 0))
      seen.add(meal.meal_kind)
      return valid
    })
  })
}
