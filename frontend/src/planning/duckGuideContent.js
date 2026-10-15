export const DUCK_GUIDE_TYPES = Object.freeze([
  'salted_duck',
  'duck_blood_soup',
  'roast_duck',
  'pressed_duck',
  'nanjing_cuisine',
])

const DUCK_GUIDE_TYPE_SET = new Set(DUCK_GUIDE_TYPES)

function appendKnownTypes(values, ordered, seen) {
  if (!Array.isArray(values)) return
  values.forEach((value) => {
    if (!DUCK_GUIDE_TYPE_SET.has(value) || seen.has(value)) return
    seen.add(value)
    ordered.push(value)
  })
}

/**
 * Keep only supported route types, preserving the route's first-appearance order.
 * Types already used by the current day are omitted from the other-day group.
 */
export function normalizeDuckGuidePayload(payload = {}) {
  const seen = new Set()
  const currentDayDuckTypes = []
  const otherDayDuckTypes = []
  appendKnownTypes(payload.currentDayDuckTypes, currentDayDuckTypes, seen)
  appendKnownTypes(payload.otherDayDuckTypes, otherDayDuckTypes, seen)
  return { currentDayDuckTypes, otherDayDuckTypes }
}

function routeItemDuckTypes(item) {
  if (!item || item.type !== 'duck_restaurant') return []
  if (DUCK_GUIDE_TYPE_SET.has(item.featured_duck_type)) return [item.featured_duck_type]
  return []
}

function dayDuckTypes(day) {
  return [
    ...(day?.legs || []).flatMap((leg) =>
      (leg.meals || [])
        .filter((meal) => meal.area_kind === 'duck')
        .flatMap((meal) => meal.area?.duck_types || []),
    ),
    ...(Array.isArray(day?.items) ? day.items.flatMap(routeItemDuckTypes) : []),
  ]
}

/**
 * Build the frozen map-overlay payload from a duck plan without guessing from names or notes.
 * The selected day comes first; all remaining days keep their route and item order.
 */
export function buildDuckGuideRoutePayload(activePlan, activeDayIndex = 0) {
  if (activePlan?.plan_type !== 'duck' || !Array.isArray(activePlan.days)) {
    return { currentDayDuckTypes: [], otherDayDuckTypes: [] }
  }
  const safeDayIndex =
    Number.isInteger(activeDayIndex) && activePlan.days[activeDayIndex] ? activeDayIndex : 0
  return normalizeDuckGuidePayload({
    currentDayDuckTypes: dayDuckTypes(activePlan.days[safeDayIndex]),
    otherDayDuckTypes: activePlan.days
      .filter((_day, index) => index !== safeDayIndex)
      .flatMap(dayDuckTypes),
  })
}

function validArticles(articles) {
  if (!Array.isArray(articles)) return []
  const seenIds = new Set()
  return articles.filter((article) => {
    if (!article || typeof article !== 'object' || typeof article.id !== 'string') return false
    if (!article.id || seenIds.has(article.id)) return false
    seenIds.add(article.id)
    return true
  })
}

/**
 * Queue formal summaries by current day, other days, then the remaining general culture list.
 * Articles keep the backend list order within each route type, making “next” deterministic.
 */
export function buildDuckGuideContentQueue(articles, payload = {}) {
  const candidates = validArticles(articles)
  const { currentDayDuckTypes, otherDayDuckTypes } = normalizeDuckGuidePayload(payload)
  const prioritizedTypes = [...currentDayDuckTypes, ...otherDayDuckTypes]
  const queuedIds = new Set()
  const queue = []

  prioritizedTypes.forEach((duckType) => {
    candidates.forEach((article) => {
      if (article.duck_type !== duckType || queuedIds.has(article.id)) return
      queuedIds.add(article.id)
      queue.push(article)
    })
  })
  candidates.forEach((article) => {
    if (queuedIds.has(article.id)) return
    queuedIds.add(article.id)
    queue.push(article)
  })
  return queue
}

export function nextDuckGuideContentIndex(currentIndex, itemCount) {
  if (!Number.isInteger(itemCount) || itemCount <= 1) return 0
  const safeIndex = Number.isInteger(currentIndex) && currentIndex >= 0 ? currentIndex : 0
  return (safeIndex + 1) % itemCount
}

export function chooseDuckGuideContentIndex(
  articles,
  selectedDuckType,
  previousId,
  random = Math.random,
) {
  if (!articles.length) return 0
  if (selectedDuckType) {
    const introduction = articles.findIndex(
      (article) => article.duck_type === selectedDuckType && article.content_type === 'food_intro',
    )
    if (introduction >= 0) return introduction
    const related = articles.findIndex((article) => article.duck_type === selectedDuckType)
    if (related >= 0) return related
  }
  const candidates = articles
    .map((article, index) => ({ article, index }))
    .filter(({ article }) => articles.length === 1 || article.id !== previousId)
  return candidates[Math.floor(random() * candidates.length)].index
}
