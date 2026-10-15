import { isCurrentTripForm } from './tripForm'
import { PLAN_TYPES } from './planningLabels'
import { isValidRouteMeals } from './routeMeals'
import { hasValidDayEndAdjustment } from './dayEndAdjustment'

export const SAVED_PLANS_STORAGE_KEY = 'nanjing-webgis-saved-plans-v2'
export const SAVED_PLAN_NAME_MAX_LENGTH = 40

const COLLECTION_VERSION = 2
const RECORD_VERSION = 1
const SNAPSHOT_VERSION = 1

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function readJson(storage, key) {
  const raw = storage.getItem(key)
  if (raw === null) return { exists: false, value: null }
  try {
    return { exists: true, value: JSON.parse(raw) }
  } catch {
    return { exists: true, value: null, invalid: true }
  }
}

function hasCurrentItemSnapshot(item) {
  if (!item) return false
  if (item.type === 'meal_area') {
    const area = item.dining_area
    return Boolean(
      area &&
      typeof area.id === 'string' &&
      area.id === item.ref_id &&
      Number.isFinite(area.center?.longitude) &&
      Number.isFinite(area.center?.latitude) &&
      area.center.coord_system === 'GCJ-02' &&
      Number.isInteger(area.radius_meters) &&
      area.radius_meters >= 100 &&
      area.radius_meters <= 3000,
    )
  }
  if (item.type === 'duck_restaurant') {
    return (
      typeof item.featured_duck_type === 'string' &&
      typeof item.duck_restaurant?.poi_id === 'string' &&
      item.duck_restaurant.poi_id === item.ref_id &&
      Array.isArray(item.duck_restaurant.duck_types) &&
      item.duck_restaurant.duck_types.includes(item.featured_duck_type)
    )
  }
  return true
}

export function hasValidPlanResponse(response) {
  if (
    !response ||
    !Array.isArray(response.plans) ||
    response.plans.length < 1 ||
    response.plans.length > 3 ||
    !Array.isArray(response.global_warnings)
  ) {
    return false
  }
  const types = new Set(response.plans.map((plan) => plan?.plan_type))
  return (
    types.size === response.plans.length &&
    [...types].every((type) => PLAN_TYPES.includes(type)) &&
    response.plans.every(
      (plan) =>
        plan &&
        typeof plan.summary === 'string' &&
        Array.isArray(plan.days) &&
        Array.isArray(plan.warnings) &&
        Array.isArray(plan.unplanned_attractions) &&
        plan.days.every(
          (day) =>
            day &&
            typeof day.date === 'string' &&
            Array.isArray(day.items) &&
            Array.isArray(day.legs) &&
            day.items.every(hasCurrentItemSnapshot) &&
            hasValidDayEndAdjustment(day) &&
            isValidRouteMeals(day, plan.plan_type),
        ),
    )
  )
}

function safePlanType(response, value) {
  return response.plans.some((plan) => plan?.plan_type === value)
    ? value
    : response.plans[0].plan_type
}

function safeDayIndex(response, planType, value) {
  const plan = response.plans.find((item) => item?.plan_type === planType)
  const lastIndex = Math.max(0, (Array.isArray(plan?.days) ? plan.days.length : 0) - 1)
  const index = Number.isInteger(value) ? value : 0
  return Math.max(0, Math.min(index, lastIndex))
}

function normalizedRecord(raw) {
  if (
    !raw ||
    raw.version !== RECORD_VERSION ||
    typeof raw.id !== 'string' ||
    !raw.id ||
    typeof raw.name !== 'string' ||
    normalizeSavedPlanName(raw.name) !== raw.name ||
    Array.from(raw.name).length > SAVED_PLAN_NAME_MAX_LENGTH ||
    !Number.isFinite(Date.parse(raw.savedAt)) ||
    raw.snapshot?.version !== SNAPSHOT_VERSION ||
    !hasValidPlanResponse(raw.snapshot.response) ||
    !isCurrentTripForm(raw.snapshot.tripForm)
  ) {
    return null
  }

  const response = clone(raw.snapshot.response)
  const activePlanType = safePlanType(response, raw.snapshot.activePlanType)
  return {
    version: RECORD_VERSION,
    id: raw.id,
    name: raw.name,
    savedAt: raw.savedAt,
    snapshot: {
      version: SNAPSHOT_VERSION,
      response,
      tripForm: clone(raw.snapshot.tripForm),
      activePlanType,
      activeDayIndex: safeDayIndex(response, activePlanType, raw.snapshot.activeDayIndex),
      ...(raw.snapshot.request
        ? {
            request: clone(raw.snapshot.request),
            requestSource: raw.snapshot.requestSource || 'saved_request',
          }
        : {}),
    },
  }
}

function normalizeCollection(value) {
  if (!value || value.version !== COLLECTION_VERSION || !Array.isArray(value.records)) {
    return { records: [], invalidCollection: true, invalidRecordCount: 0 }
  }

  const records = []
  const ids = new Set()
  const names = new Set()
  let invalidRecordCount = 0
  value.records.forEach((raw) => {
    const record = normalizedRecord(raw)
    const nameKey = record?.name.toLocaleLowerCase()
    if (!record || ids.has(record.id) || names.has(nameKey)) {
      invalidRecordCount += 1
      return
    }
    ids.add(record.id)
    names.add(nameKey)
    records.push(record)
  })
  records.sort((left, right) => Date.parse(right.savedAt) - Date.parse(left.savedAt))
  return { records, invalidCollection: false, invalidRecordCount }
}

function writeCollection(storage, records) {
  try {
    storage.setItem(
      SAVED_PLANS_STORAGE_KEY,
      JSON.stringify({ version: COLLECTION_VERSION, records }),
    )
  } catch {
    throw new Error('浏览器拒绝本地保存，可能是存储空间不足。')
  }
}

function newRecordId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `saved-plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function normalizeSavedPlanName(value) {
  return typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim() : ''
}

export function validateSavedPlanName(value, records = [], excludedId = null) {
  const name = normalizeSavedPlanName(value)
  if (!name) return { name, error: '请输入方案名称。' }
  if (Array.from(name).length > SAVED_PLAN_NAME_MAX_LENGTH) {
    return { name, error: `方案名称不能超过 ${SAVED_PLAN_NAME_MAX_LENGTH} 个字符。` }
  }
  const duplicate = records.some(
    (record) =>
      record.id !== excludedId && record.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
  )
  if (duplicate) return { name, error: '已有同名方案，请换一个名称。' }
  return { name, error: '' }
}

export function loadSavedPlans(storage = window.localStorage) {
  const warnings = []
  let collectionRead
  try {
    collectionRead = readJson(storage, SAVED_PLANS_STORAGE_KEY)
  } catch {
    return { records: [], warnings: ['浏览器拒绝读取本地方案。'] }
  }

  const collection = collectionRead.exists
    ? normalizeCollection(collectionRead.value)
    : { records: [], invalidCollection: false, invalidRecordCount: 0 }
  const records = collection.records
  if (collectionRead.invalid || collection.invalidCollection) {
    warnings.push('本地方案格式无效或数据损坏，已跳过。')
  } else if (collection.invalidRecordCount) {
    warnings.push(`有 ${collection.invalidRecordCount} 条本地方案损坏，已跳过。`)
  }

  return { records, warnings }
}

export function addSavedPlan(storage, records, input) {
  const validation = validateSavedPlanName(input.name, records)
  if (validation.error) throw new Error(validation.error)
  if (!hasValidPlanResponse(input.response)) throw new Error('当前方案数据无效，无法保存。')
  if (!isCurrentTripForm(input.tripForm)) throw new Error('当前规划条件不完整，无法保存。')

  const response = clone(input.response)
  if (input.includeNotices === false) {
    response.global_warnings = []
    response.plans.forEach((plan) => {
      plan.warnings = []
      plan.unplanned_attractions = []
    })
  }
  const activePlanType = safePlanType(response, input.activePlanType)
  const record = {
    version: RECORD_VERSION,
    id: input.id || newRecordId(),
    name: validation.name,
    savedAt: (input.savedAt || new Date()).toISOString(),
    snapshot: {
      version: SNAPSHOT_VERSION,
      response,
      tripForm: clone(input.tripForm),
      activePlanType,
      activeDayIndex: safeDayIndex(response, activePlanType, input.activeDayIndex),
      ...(input.request
        ? { request: clone(input.request), requestSource: input.requestSource || 'saved_request' }
        : {}),
    },
  }
  const nextRecords = [record, ...records]
  writeCollection(storage, nextRecords)
  return nextRecords
}

export function renameSavedPlan(storage, records, id, value) {
  const validation = validateSavedPlanName(value, records, id)
  if (validation.error) throw new Error(validation.error)
  if (!records.some((record) => record.id === id)) throw new Error('找不到要改名的方案。')
  const nextRecords = records.map((record) =>
    record.id === id ? { ...record, name: validation.name } : record,
  )
  writeCollection(storage, nextRecords)
  return nextRecords
}

export function deleteSavedPlan(storage, records, id) {
  if (!records.some((record) => record.id === id)) throw new Error('找不到要删除的方案。')
  const nextRecords = records.filter((record) => record.id !== id)
  writeCollection(storage, nextRecords)
  return nextRecords
}
