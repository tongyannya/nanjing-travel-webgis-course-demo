export const ATTRACTION_CATEGORY_OPTIONS = Object.freeze([
  { value: 'museum_venue', label: '文博场馆' },
  { value: 'historic_site', label: '历史遗址' },
  { value: 'religious_architecture', label: '古建宗教' },
  { value: 'garden_park', label: '园林公园' },
  { value: 'natural_scenery', label: '自然景观' },
  { value: 'urban_district', label: '城市街区' },
  { value: 'modern_landmark', label: '现代地标' },
  { value: 'themed_experience', label: '主题体验' },
])

export const ATTRACTION_TAG_OPTIONS = Object.freeze([
  { value: 'history', label: '历史文化' },
  { value: 'museum', label: '博物馆' },
  { value: 'architecture', label: '古建筑' },
  { value: 'religion', label: '宗教文化' },
  { value: 'red_culture', label: '红色文化' },
  { value: 'nature', label: '自然风景' },
  { value: 'garden', label: '园林' },
  { value: 'urban_walk', label: '城市街区' },
  { value: 'modern_city', label: '现代地标' },
  { value: 'night_view', label: '夜景' },
  { value: 'art', label: '艺术' },
  { value: 'folk_custom', label: '民俗' },
  { value: 'family', label: '亲子' },
  { value: 'food', label: '美食' },
  { value: 'photography', label: '摄影' },
  { value: 'leisure_walk', label: '休闲散步' },
])

export const ATTRACTION_QUALITY_OPTIONS = Object.freeze([
  { value: '5A', label: '5A' },
  { value: '4A', label: '4A' },
  { value: '3A', label: '3A' },
  { value: 'unrated', label: '未评级' },
])

export const ATTRACTION_PRICE_OPTIONS = Object.freeze([
  { value: 'free', label: '免费' },
  { value: 'paid', label: '收费' },
  { value: 'unknown', label: '票价待确认' },
])

export const ATTRACTION_RESERVATION_OPTIONS = Object.freeze([
  { value: 'yes', label: '通常需要预约' },
  { value: 'conditional', label: '部分情况需要预约' },
  { value: 'no', label: '通常无需预约' },
  { value: 'unknown', label: '预约信息缺失' },
])

function labelsFrom(options) {
  return Object.freeze(Object.fromEntries(options.map(({ value, label }) => [value, label])))
}

export const ATTRACTION_CATEGORY_LABELS = labelsFrom(ATTRACTION_CATEGORY_OPTIONS)
export const ATTRACTION_TAG_LABELS = labelsFrom(ATTRACTION_TAG_OPTIONS)
export const ATTRACTION_RESERVATION_LABELS = labelsFrom(ATTRACTION_RESERVATION_OPTIONS)

const FILTER_ARRAY_FIELDS = Object.freeze([
  'categories',
  'tags',
  'qualityGrades',
  'priceStatuses',
  'reservationStatuses',
])

export function createDefaultAttractionFilter() {
  return {
    keyword: '',
    categories: [],
    tags: [],
    qualityGrades: [],
    priceStatuses: [],
    reservationStatuses: [],
  }
}

function normalizedKeyword(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase()
}

function selectedValues(filter, field) {
  return Array.isArray(filter?.[field]) ? filter[field] : []
}

function matchesSelectedValue(selected, actual) {
  return selected.length === 0 || selected.includes(actual)
}

export function attractionPriceStatus(attraction) {
  const adultPrice = attraction?.ticket?.adult
  if (adultPrice === null || adultPrice === undefined || adultPrice === '') return 'unknown'
  const numericPrice = Number(adultPrice)
  if (!Number.isFinite(numericPrice) || numericPrice < 0) return 'unknown'
  return numericPrice === 0 ? 'free' : 'paid'
}

export function attractionReservationStatus(attraction) {
  const value = attraction?.reservation?.required
  return ATTRACTION_RESERVATION_LABELS[value] ? value : 'unknown'
}

export function attractionQualityStatus(attraction) {
  return attraction?.quality_grade || 'unrated'
}

export function attractionMatchesFilter(attraction, filter = {}) {
  if (!attraction || typeof attraction !== 'object') return false

  const keyword = normalizedKeyword(filter.keyword)
  const searchableNames = [
    attraction.name,
    ...(Array.isArray(attraction.aliases) ? attraction.aliases : []),
  ]
    .map(normalizedKeyword)
    .filter(Boolean)
  const matchesKeyword = keyword === '' || searchableNames.some((name) => name.includes(keyword))

  const categories = selectedValues(filter, 'categories')
  const tags = selectedValues(filter, 'tags')
  const qualityGrades = selectedValues(filter, 'qualityGrades')
  const priceStatuses = selectedValues(filter, 'priceStatuses')
  const reservationStatuses = selectedValues(filter, 'reservationStatuses')

  return (
    matchesKeyword &&
    matchesSelectedValue(categories, attraction.category) &&
    (tags.length === 0 || tags.some((tag) => attraction.tags?.includes(tag))) &&
    matchesSelectedValue(qualityGrades, attractionQualityStatus(attraction)) &&
    matchesSelectedValue(priceStatuses, attractionPriceStatus(attraction)) &&
    matchesSelectedValue(reservationStatuses, attractionReservationStatus(attraction))
  )
}

export function filterAttractions(attractions, filter = {}) {
  if (!Array.isArray(attractions)) return []
  return attractions.filter((attraction) => attractionMatchesFilter(attraction, filter))
}

export function isAttractionFilterActive(filter = {}) {
  return (
    normalizedKeyword(filter.keyword) !== '' ||
    FILTER_ARRAY_FIELDS.some((field) => selectedValues(filter, field).length > 0)
  )
}

export function toggleAttractionFilterValue(filter, field, value) {
  if (!FILTER_ARRAY_FIELDS.includes(field)) return { ...filter }
  const current = selectedValues(filter, field)
  return {
    ...createDefaultAttractionFilter(),
    ...filter,
    [field]: current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value],
  }
}
