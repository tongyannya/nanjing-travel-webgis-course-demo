import { createDefaultTripForm, isCurrentTripForm, validateTripForm } from './tripForm'
import { hasValidPlanResponse } from './savedPlansStorage'

export const PLAN_FILE_FORMAT = 'nanjing-webgis-plan'
export const PLAN_FILE_MAX_BYTES = 20 * 1024 * 1024
const clone = (value) => JSON.parse(JSON.stringify(value))
function validResponse(value) {
  try {
    return hasValidPlanResponse(value)
  } catch {
    return false
  }
}
const time = (value) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
const location = (value) =>
  value &&
  value.coord_system === 'GCJ-02' &&
  Number.isFinite(value.longitude) &&
  Math.abs(value.longitude) <= 180 &&
  Number.isFinite(value.latitude) &&
  Math.abs(value.latitude) <= 90

export function formFromRequest(request, attractions = [], planType = 'relaxed') {
  if (!request || !Array.isArray(request.trip_days) || !request.preferences)
    throw new Error('方案文件的生成条件不完整。')
  if (
    !request.lodging ||
    !request.party ||
    !request.ticket_budget ||
    (request.manual_locks &&
      (!Array.isArray(request.manual_locks) || request.manual_locks.length)) ||
    !['adult', 'student', 'child', 'senior'].every(
      (key) => Number.isInteger(request.party[key]) && request.party[key] >= 0,
    ) ||
    (!request.ticket_budget.unlimited &&
      (!Number.isFinite(request.ticket_budget.total) || request.ticket_budget.total < 0))
  )
    throw new Error('方案文件的住处、人数或预算条件无效。')
  const form = createDefaultTripForm(attractions)
  form.days = clone(request.trip_days)
  form.dayCount = form.days.length
  form.startDate = form.days[0]?.date
  form.hasSelectedStartDate = true
  form.lodging = clone(request.lodging)
  form.accommodationConfirmed = true
  form.firstDayStart = request.first_day_start ? clone(request.first_day_start) : null
  form.useFirstDayStart = Boolean(form.firstDayStart)
  form.lastDayEnd = request.last_day_end ? clone(request.last_day_end) : null
  form.useLastDayEnd = Boolean(form.lastDayEnd)
  form.party = clone(request.party)
  form.budgetUnlimited = request.ticket_budget?.unlimited
  form.budgetTotal = request.ticket_budget?.total ?? 0
  form.transportPreference = request.transport_preference
  form.preferredPlanType = planType
  form.allowSkipMealForLongVisit = request.allow_skip_meal_for_long_visit ?? false
  form.attractionChoices = Object.fromEntries(
    Object.keys(form.attractionChoices).map((id) => [id, 'none']),
  )
  form.tagChoices = Object.fromEntries(Object.keys(form.tagChoices).map((id) => [id, 'none']))
  for (const [field, state] of [
    ['must_visit_ids', 'must'],
    ['interested_ids', 'interested'],
    ['excluded_ids', 'excluded'],
  ]) {
    if (!Array.isArray(request.preferences[field])) throw new Error('方案文件的景点偏好无效。')
    for (const id of request.preferences[field]) {
      if (
        typeof id !== 'string' ||
        !id ||
        (form.attractionChoices[id] && form.attractionChoices[id] !== 'none')
      )
        throw new Error('方案文件的景点选择存在重复或冲突。')
      form.attractionChoices[id] = state
    }
  }
  for (const [field, state] of [
    ['preferred_tags', 'preferred'],
    ['excluded_tags', 'excluded'],
  ]) {
    if (!Array.isArray(request.preferences[field])) throw new Error('方案文件的类别偏好无效。')
    for (const id of request.preferences[field]) {
      if (!Object.hasOwn(form.tagChoices, id) || form.tagChoices[id] !== 'none')
        throw new Error('方案文件的类别选择无效或冲突。')
      form.tagChoices[id] = state
    }
  }
  if (!isCurrentTripForm(form, attractions) || validateTripForm(form).length)
    throw new Error('方案文件的日期、住处或规划条件无效。')
  return form
}

export function parseItineraryFile(text, attractions = []) {
  if (typeof text !== 'string' || new Blob([text]).size > PLAN_FILE_MAX_BYTES)
    throw new Error('方案文件不能超过20MB。')
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('无法读取方案文件，请选择导出的JSON方案文件。')
  }
  if (data?.format !== PLAN_FILE_FORMAT || data.version !== 1)
    throw new Error('不是当前版本的南京行程方案文件。')
  const response = data.response
  if (
    !validResponse(response) ||
    !response.plans.every(
      (plan) =>
        plan.days.length >= 1 &&
        plan.days.length <= 5 &&
        Number.isFinite(plan.total_ticket_cost) &&
        plan.days.every(
          (day) =>
            day.items.length <= 100 &&
            day.legs.length <= 100 &&
            day.items.every(
              (item) =>
                typeof item.item_id === 'string' &&
                typeof item.name === 'string' &&
                ['start', 'end', 'attraction', 'meal', 'meal_area', 'duck_restaurant'].includes(
                  item.type,
                ) &&
                time(item.start_time) &&
                time(item.end_time) &&
                location(item.location) &&
                Number.isFinite(item.duration_minutes) &&
                item.duration_minutes >= 0,
            ) &&
            day.legs.every(
              (leg) =>
                day.items.some((item) => item.item_id === leg.from_item_id) &&
                day.items.some((item) => item.item_id === leg.to_item_id),
            ),
        ),
    )
  )
    throw new Error('方案文件的行程数据不完整或已损坏。')
  const type = data.selection?.plan_type
  const plan = response.plans.find((plan) => plan.plan_type === type)
  const index = data.selection?.day_index
  if (!plan || !Number.isInteger(index) || index < 0 || index >= plan.days.length)
    throw new Error('方案文件的当前方案或日期选择无效。')
  const form = formFromRequest(data.request, attractions, type)
  if (
    !response.plans.every(
      (plan) =>
        plan.days.length === form.days.length &&
        plan.days.every(
          (day, i) =>
            day.date === form.days[i].date &&
            (!day.end_time_adjustment ||
              day.end_time_adjustment.planned_end_time === form.days[i].end_time),
        ),
    )
  )
    throw new Error('方案文件中的条件与行程日期不一致。')
  return {
    response: clone(response),
    tripForm: form,
    request: clone(data.request),
    requestSource: 'imported_file',
    activePlanType: type,
    activeDayIndex: index,
    name:
      typeof data.name === 'string' && data.name.trim()
        ? Array.from(data.name.trim()).slice(0, 40).join('')
        : `南京行程 ${form.startDate}`,
  }
}
