import { PLAN_TYPES, TRANSPORT_PREFERENCE_LABELS } from './planningLabels'
import { ATTRACTION_TAG_OPTIONS } from '../attractions/attractionFilters'

export const TAG_OPTIONS = ATTRACTION_TAG_OPTIONS.map(({ value, label }) => [value, label])
export const MAX_ATTRACTION_CHOICES = 20

export function countAttractionChoices(choices) {
  const counts = { must: 0, interested: 0, excluded: 0 }
  Object.values(choices || {}).forEach((state) => {
    if (Object.hasOwn(counts, state)) counts[state] += 1
  })
  return counts
}

export function attractionChoiceWarnings(choices, dayCount, attractions = []) {
  const counts = countAttractionChoices(choices)
  const warnings = []
  if (counts.must > dayCount * 2) {
    warnings.push(
      `必须去景点建议少于${dayCount}天×2=${dayCount * 2}个，当前${counts.must}个，可能无法全部安排。`,
    )
  }
  if (attractions.length && attractions.every((item) => choices?.[item.id] === 'interested')) {
    warnings.push('所有景点都设为感兴趣，相当于未设置景点兴趣偏好，无法帮助系统区分优先顺序。')
  }
  return warnings
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

// display_icon 只服务前端路线节点复原，不属于后端 LocationRef 契约。
function requestLocationRef(value) {
  if (!value) return null
  return {
    source_method: value.source_method,
    name: value.name,
    location: clone(value.location),
  }
}

export function shiftDate(value, offset) {
  const [year, month, day] = value.split('-').map(Number)
  const target = new Date(Date.UTC(year, month - 1, day + offset))
  return target.toISOString().slice(0, 10)
}

function locationRef(sourceMethod, name, longitude, latitude) {
  return {
    source_method: sourceMethod,
    name,
    location: { longitude, latitude, coord_system: 'GCJ-02' },
  }
}

export function createDefaultTripForm(attractions = []) {
  const choices = Object.fromEntries(attractions.map((item) => [item.id, 'none']))
  const tags = Object.fromEntries(TAG_OPTIONS.map(([value]) => [value, 'none']))
  const now = new Date()
  const startDate = shiftDate(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    1,
  )
  return {
    version: 1,
    startDate,
    // 默认日期只用于表单占位；只有用户主动确认后，天气才按行程日期显示。
    hasSelectedStartDate: false,
    dayCount: 1,
    days: [{ date: startDate, start_time: '09:00', end_time: '20:00' }],
    // 新表单不再携带静默认住宿； lodging 先占位为空，由住宿流程确认后写入。
    lodging: locationRef('search', '', 118.7838, 32.0419),
    useFirstDayStart: false,
    firstDayStart: null,
    useLastDayEnd: false,
    lastDayEnd: null,
    party: { adult: 1, student: 0, child: 0, senior: 0 },
    budgetUnlimited: false,
    budgetTotal: 300,
    transportPreference: 'public_transit',
    preferredPlanType: 'relaxed',
    allowSkipMealForLongVisit: false,
    attractionChoices: choices,
    tagChoices: tags,
    // 住宿确认状态独立于地点值：未走完住宿流程时一律为 false。
    accommodationConfirmed: false,
    accommodationAreaId: null,
  }
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isLocationRef(value) {
  return (
    isRecord(value) &&
    ['search', 'current_location', 'map_click', 'station', 'hotel'].includes(value.source_method) &&
    typeof value.name === 'string' &&
    isRecord(value.location) &&
    value.location.coord_system === 'GCJ-02' &&
    Number.isFinite(value.location.longitude) &&
    Math.abs(value.location.longitude) <= 180 &&
    Number.isFinite(value.location.latitude) &&
    Math.abs(value.location.latitude) <= 90
  )
}

export function isCurrentTripForm(saved, attractions = []) {
  if (!isRecord(saved) || saved.version !== 1) return false
  if (
    Object.hasOwn(saved, 'allowSkipMealForLongVisit') &&
    typeof saved.allowSkipMealForLongVisit !== 'boolean'
  )
    return false
  if (
    typeof saved.startDate !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(saved.startDate) ||
    !Number.isFinite(Date.parse(`${saved.startDate}T00:00:00Z`)) ||
    shiftDate(saved.startDate, 0) !== saved.startDate ||
    !Number.isInteger(saved.dayCount) ||
    saved.dayCount < 1 ||
    saved.dayCount > 5 ||
    !Array.isArray(saved.days) ||
    saved.days.length !== saved.dayCount
  )
    return false
  if (
    !saved.days.every(
      (day, index) =>
        isRecord(day) &&
        day.date === shiftDate(saved.startDate, index) &&
        typeof day.start_time === 'string' &&
        /^([01]\d|2[0-3]):[0-5]\d$/u.test(day.start_time) &&
        typeof day.end_time === 'string' &&
        /^([01]\d|2[0-3]):[0-5]\d$/u.test(day.end_time),
    )
  )
    return false
  if (
    ![
      'hasSelectedStartDate',
      'useFirstDayStart',
      'useLastDayEnd',
      'budgetUnlimited',
      'accommodationConfirmed',
    ].every((key) => typeof saved[key] === 'boolean')
  )
    return false
  if (
    !isLocationRef(saved.lodging) ||
    ![saved.firstDayStart, saved.lastDayEnd].every(
      (value) => value === null || isLocationRef(value),
    ) ||
    (saved.useFirstDayStart && !saved.firstDayStart) ||
    (saved.useLastDayEnd && !saved.lastDayEnd)
  )
    return false
  if (
    !isRecord(saved.party) ||
    saved.party.senior !== 0 ||
    !['adult', 'student', 'child'].every(
      (key) =>
        saved.party[key] === null ||
        typeof saved.party[key] === 'string' ||
        Number.isFinite(saved.party[key]),
    ) ||
    !(typeof saved.budgetTotal === 'string' || Number.isFinite(saved.budgetTotal))
  )
    return false
  if (
    !Object.hasOwn(TRANSPORT_PREFERENCE_LABELS, saved.transportPreference) ||
    !PLAN_TYPES.includes(saved.preferredPlanType)
  )
    return false
  if (
    !isRecord(saved.attractionChoices) ||
    !Object.values(saved.attractionChoices).every((value) =>
      ['none', 'must', 'interested', 'excluded'].includes(value),
    ) ||
    !attractions.every((item) => Object.hasOwn(saved.attractionChoices, item.id)) ||
    !isRecord(saved.tagChoices) ||
    !TAG_OPTIONS.every(([tag]) => ['none', 'preferred', 'excluded'].includes(saved.tagChoices[tag]))
  )
    return false
  return saved.accommodationAreaId === null || typeof saved.accommodationAreaId === 'string'
}

export function restoreTripForm(saved, attractions = []) {
  const restored = isCurrentTripForm(saved, attractions)
    ? {
        ...clone(saved),
        transportPreference:
          saved.transportPreference === 'self_drive' ? 'taxi' : saved.transportPreference,
        allowSkipMealForLongVisit: saved.allowSkipMealForLongVisit ?? false,
      }
    : createDefaultTripForm(attractions)
  delete restored.manualLocks
  return restored
}

export function syncTripDays(form) {
  form.dayCount = Math.max(1, Math.min(5, Number(form.dayCount) || 1))
  form.days = Array.from({ length: form.dayCount }, (_, index) => ({
    date: shiftDate(form.startDate, index),
    start_time: form.days[index]?.start_time || '09:00',
    end_time: form.days[index]?.end_time || '20:00',
  }))
}

function selectedIds(choices, state) {
  return Object.entries(choices)
    .filter(([, value]) => value === state)
    .map(([id]) => id)
}

// 儿童输入可能为空字符串或 null；展示版一律按 0 计算。
export function partyCount(value) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return 0
  const value_ = Number(trimmed)
  return Number.isFinite(value_) && value_ > 0 ? Math.floor(value_) : 0
}

export function validateTripForm(form) {
  const issues = []
  const counts = countAttractionChoices(form.attractionChoices)
  if (counts.must > MAX_ATTRACTION_CHOICES) issues.push('必须去景点最多设置 20 个，请先减少选择。')
  if (counts.excluded > MAX_ATTRACTION_CHOICES)
    issues.push('排除景点最多设置 20 个，请先减少选择。')
  if (!PLAN_TYPES.includes(form.preferredPlanType)) issues.push('请选择要先生成的方案。')
  if (!form.accommodationConfirmed) issues.push('请先完成住宿安排，再生成方案。')
  if (!form.lodging.name.trim()) issues.push('住宿地点名称不能为空，请重新完成住宿安排。')
  if (partyCount(form.party.adult) + partyCount(form.party.student) < 1) {
    issues.push('游玩人数至少包含一名成人或学生。')
  }
  if (!form.budgetUnlimited && (form.budgetTotal === '' || Number(form.budgetTotal) < 0)) {
    issues.push('门票预算必须是 0 或更大的数字。')
  }
  form.days.forEach((day, index) => {
    const toMinutes = (value) => {
      const [hours, minutes] = value.split(':').map(Number)
      return hours * 60 + minutes
    }
    if (day.start_time > '15:00') issues.push(`第 ${index + 1} 天开始时间不能晚于15:00。`)
    if (day.start_time < '07:00') issues.push(`第 ${index + 1} 天开始时间不能早于07:00。`)
    if (day.end_time < '11:00') issues.push(`第 ${index + 1} 天结束时间不能早于11:00。`)
    if (toMinutes(day.end_time) - toMinutes(day.start_time) < 180)
      issues.push(`第 ${index + 1} 天结束时间至少比开始时间晚3小时。`)
  })
  return issues
}

export function buildTripRequest(form) {
  const requestId = `req_local_${Date.now().toString(36)}`
  return {
    request_id: requestId,
    trip_days: clone(form.days),
    lodging: requestLocationRef(form.lodging),
    first_day_start:
      form.useFirstDayStart && form.firstDayStart ? requestLocationRef(form.firstDayStart) : null,
    last_day_end:
      form.useLastDayEnd && form.lastDayEnd ? requestLocationRef(form.lastDayEnd) : null,
    // 老人和空儿童、学生统一按 0。
    party: {
      adult: partyCount(form.party.adult),
      student: partyCount(form.party.student),
      child: partyCount(form.party.child),
      senior: 0,
    },
    ticket_budget: {
      unlimited: Boolean(form.budgetUnlimited),
      total: form.budgetUnlimited ? null : Number(form.budgetTotal),
    },
    transport_preference:
      form.transportPreference === 'self_drive' ? 'taxi' : form.transportPreference,
    allow_skip_meal_for_long_visit: Boolean(form.allowSkipMealForLongVisit),
    preferences: {
      must_visit_ids: selectedIds(form.attractionChoices, 'must'),
      interested_ids: selectedIds(form.attractionChoices, 'interested'),
      excluded_ids: selectedIds(form.attractionChoices, 'excluded'),
      preferred_tags: selectedIds(form.tagChoices, 'preferred'),
      excluded_tags: selectedIds(form.tagChoices, 'excluded'),
    },
    manual_locks: [],
  }
}
