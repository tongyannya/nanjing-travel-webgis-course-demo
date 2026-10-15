import { PLAN_LABELS, ITEM_TYPE_LABELS } from './planningLabels'
import { mealKindLabel, planItemTypeLabel } from './duckDiningPresentation'
import { presentTransportLeg } from './transitPresentation'
import { buildWeatherRows, WEATHER_SOURCE_TEXT } from '../ui/weatherPresentation'

// Image itinerary export (task X1). This module is pure data work: it turns the
// currently selected plan snapshot into stable view models for the export sheet
// template. No DOM access, no image library, no side effects.

export const EXPORT_SHEET_TITLE = '南京行程单'
export const EXPORT_SHEET_WIDTH = 1080
export const EXPORT_SHEET_FOOTNOTE =
  '数据为生成时的方案快照；实时交通、开放与营业情况请以现场为准。'

export const EXPORT_PIXEL_RATIO = 2

// Chrome/Edge cap a single canvas edge near 65535 px; stay clearly below it.
const CANVAS_MAX_EDGE_PX = 64000

export function selectExportPixelRatio(cssWidth, cssHeight) {
  const longestEdge = Math.max(Number(cssWidth) || 0, Number(cssHeight) || 0)
  if (!longestEdge) {
    return { pixelRatio: EXPORT_PIXEL_RATIO, error: '导出模板尺寸为零，请重试。' }
  }
  if (longestEdge > CANVAS_MAX_EDGE_PX) {
    return {
      pixelRatio: 1,
      error: '行程内容过长，超出浏览器画布尺寸上限，无法导出图片。',
    }
  }
  if (longestEdge * EXPORT_PIXEL_RATIO > CANVAS_MAX_EDGE_PX) {
    return { pixelRatio: 1 }
  }
  return { pixelRatio: EXPORT_PIXEL_RATIO }
}

export const UNPLANNED_REASON_LABELS = Object.freeze({
  closed: '常规闭馆',
  time_conflict: '时间冲突',
  budget: '门票预算不足',
  too_far: '距离过远',
  excluded: '被用户排除',
  missing_data: '资料不足',
  capacity: '当天时间容量不足',
})

const WARNINGS_TITLE_FULL = '行程提醒'
const WARNINGS_TITLE_DAY = '整份方案提醒'
const WARNINGS_NOTE_DAY = '以下为整份方案的提醒。'
const BUDGET_EXCEEDED_TEXT = '本方案因必须去景点超过门票预算。'
const MISSING_TRAFFIC_TEXT = '交通信息缺失'
export const DUCK_CANDIDATE_MISSING_TEXT = '鸭类候选信息缺失'
const EXPORT_FILE_NAME_MAX_LENGTH = 120
const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const PLAN_IMAGE_INTRODUCTIONS = Object.freeze({
  relaxed: '放慢游览节奏，留出更充足的时间细看景点。',
  compact: '行程安排更充实，适合希望多看多逛的旅行。',
  duck: '以轻松节奏游览南京，沿途体验特色鸭味与鸭文化。',
})

export function planTypeLabel(planType) {
  return PLAN_LABELS[planType] || '行程方案'
}

function nonEmptyText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function knownNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null
}

function itemTypeLabel(item) {
  return planItemTypeLabel(item) || ITEM_TYPE_LABELS[item?.type] || '行程节点'
}

function dateLabel(date) {
  const text = nonEmptyText(date)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '日期待确认'
  const parsed = new Date(`${text}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return text
  return `${text} ${WEEKDAY_LABELS[parsed.getDay()]}`
}

function sumTicketCost(items) {
  return items.reduce((sum, item) => {
    const value = knownNumber(item?.ticket_cost)
    return value === null ? sum : sum + value
  }, 0)
}

function formatAmount(value) {
  const amount = knownNumber(value)
  return amount === null ? '待确认' : `¥${Math.round(amount * 100) / 100}`
}

function formatDuration(minutes) {
  const value = knownNumber(minutes)
  return value !== null && value > 0 ? `约 ${value} 分钟` : ''
}

function findPlan(response, planType) {
  if (!response || !Array.isArray(response.plans)) return null
  return response.plans.find((plan) => plan?.plan_type === planType) || null
}

function planDays(plan) {
  return Array.isArray(plan.days) ? plan.days : []
}

function mergeWarnings(response, plan) {
  const combined = [
    ...(Array.isArray(response?.global_warnings) ? response.global_warnings : []),
    ...(Array.isArray(plan.warnings) ? plan.warnings : []),
  ]
  const seen = new Set()
  return combined.reduce((result, text) => {
    const value = nonEmptyText(text)
    if (value && !seen.has(value)) {
      seen.add(value)
      result.push(value)
    }
    return result
  }, [])
}

function buildUnplannedList(plan, attractions) {
  const nameById = new Map(
    (Array.isArray(attractions) ? attractions : []).map((attraction) => [
      attraction?.id,
      nonEmptyText(attraction?.name),
    ]),
  )
  return (Array.isArray(plan.unplanned_attractions) ? plan.unplanned_attractions : []).map(
    (unplanned) => {
      const id = nonEmptyText(unplanned?.attraction_id)
      const knownName = nameById.get(id)
      const message = nonEmptyText(unplanned?.message)
      const reasonLabel = UNPLANNED_REASON_LABELS[unplanned?.reason_code] || ''
      return {
        name: knownName || (id ? `未安排景点（${id}）` : '未安排景点（编号缺失）'),
        message: message || reasonLabel || '原因待确认',
      }
    },
  )
}

function buildItemView(item) {
  const type = item?.type
  const isDuck = type === 'duck_restaurant'
  const fallbackName = isDuck ? nonEmptyText(item?.duck_restaurant?.name) : ''
  const ticket = knownNumber(item?.ticket_cost)
  let ticketLabel = ''
  if (type === 'attraction') {
    if (ticket === 0) ticketLabel = '门票免费'
    else if (ticket !== null) ticketLabel = `门票 ¥${ticket}`
    else ticketLabel = '门票待确认'
  }
  const diningArea = type === 'meal_area' ? item?.dining_area : null
  return {
    kind: 'item',
    type,
    typeLabel: itemTypeLabel(item),
    mealLabel: !isDuck && item?.meal_kind ? mealKindLabel(item.meal_kind) : '',
    name: nonEmptyText(item?.name) || fallbackName || '名称待确认',
    timeLabel: [
      nonEmptyText(item?.start_time) || '时间待确认',
      nonEmptyText(item?.end_time) || '时间待确认',
    ].join(' – '),
    durationLabel: formatDuration(item?.duration_minutes),
    ticketLabel,
    notes: nonEmptyText(item?.notes),
    duckCandidateMissing: isDuck && !item?.duck_restaurant,
    diningLine: nonEmptyText(diningArea?.message),
  }
}

function buildLegView(leg) {
  if (!leg) {
    return { kind: 'leg', type: null, text: MISSING_TRAFFIC_TEXT, status: 'missing' }
  }
  const presentation = presentTransportLeg(leg)
  const routeSummaryText = (Array.isArray(leg.route_summary) ? leg.route_summary : [])
    .map((text) => nonEmptyText(text))
    .filter(Boolean)
    .join('；')
  const summaryText =
    presentation.status === 'fallback'
      ? [routeSummaryText, presentation.summary].filter(Boolean).join('；')
      : nonEmptyText(presentation.summary) || routeSummaryText
  const text = [
    presentation.modeLabel,
    presentation.durationLabel,
    summaryText,
    ...(leg.meals || []).map(
      (meal) =>
        `${meal.start_time}—${meal.end_time} · ${meal.meal_kind === 'lunch' ? '午餐' : '晚餐'}预留1小时${meal.area_kind === 'duck' ? '南京鸭用餐' : '用餐'}${meal.area ? ` · ${meal.area.name}，区域内自行选餐馆` : ''}`,
    ),
  ]
    .filter(Boolean)
    .join(' · ')
  return { kind: 'leg', type: leg.mode || null, text, status: presentation.status }
}

function buildDayView(day, dayIndex, weatherData) {
  const items = Array.isArray(day?.items) ? day.items : []
  const legs = Array.isArray(day?.legs) ? day.legs : []
  const legByPair = new Map(legs.map((leg) => [`${leg?.from_item_id}->${leg?.to_item_id}`, leg]))
  const entries = []
  const weather = buildWeatherRows([day?.date], weatherData)[0]
  items.forEach((item, itemIndex) => {
    if (itemIndex > 0) {
      const pairKey = `${items[itemIndex - 1]?.item_id}->${item?.item_id}`
      entries.push(buildLegView(legByPair.get(pairKey)))
    }
    entries.push(buildItemView(item))
  })
  return {
    dayNumber: dayIndex + 1,
    date: nonEmptyText(day?.date),
    dateLabel: dateLabel(day?.date),
    weatherLabel: weather?.available ? `天气 ${weather.text}` : '天气暂无',
    dayTicketLabel: `当日门票小计（参考估算）：${formatAmount(sumTicketCost(items))}`,
    entries,
  }
}

function buildSheetBase(response, plan, planType, warningsTitle, warningsNote, weatherData) {
  const warnings = mergeWarnings(response, plan)
  if (
    buildWeatherRows(
      planDays(plan).map((day) => day.date),
      weatherData,
    ).some((row) => row.rainy)
  ) {
    const rainWarning = '行程期间可能有阴雨天气'
    if (!warnings.includes(rainWarning)) warnings.push(rainWarning)
  }
  return {
    title: EXPORT_SHEET_TITLE,
    planType,
    planLabel: planTypeLabel(planType),
    planSummary: PLAN_IMAGE_INTRODUCTIONS[planType] || '暂无方案说明',
    warningsTitle,
    warningsNote,
    warnings,
    footnote: `${EXPORT_SHEET_FOOTNOTE} ${WEATHER_SOURCE_TEXT}。`,
  }
}

export function buildFullItinerarySheet(response, planType, options = {}) {
  const plan = findPlan(response, planType)
  if (!plan) {
    return { ok: false, error: '请先生成或打开一个行程方案，再导出整段长图。' }
  }
  const days = planDays(plan)
  if (!days.length) {
    return { ok: false, error: '当前方案没有行程日期，无法导出整段长图。' }
  }
  const firstDate = nonEmptyText(days[0]?.date)
  const lastDate = nonEmptyText(days[days.length - 1]?.date)
  const rangeLabel =
    firstDate === lastDate
      ? firstDate || '日期待确认'
      : `${firstDate || '日期待确认'} 至 ${lastDate || '日期待确认'}`
  const dayViews = days.map((day, index) => buildDayView(day, index, options.weatherData))
  const brokenDay = dayViews.find(
    (dayView) => !dayView.entries.some((entry) => entry.kind === 'item'),
  )
  if (brokenDay) {
    return {
      ok: false,
      error: `第 ${brokenDay.dayNumber} 天的行程数据不完整，无法导出整段长图。`,
    }
  }
  const sheet = {
    ...buildSheetBase(response, plan, planType, WARNINGS_TITLE_FULL, '', options.weatherData),
    kind: 'full',
    periodLabel: `${rangeLabel} · 共 ${days.length} 天`,
    ticketLabel: `全队全程预计门票（参考估算）：${formatAmount(plan.total_ticket_cost)}`,
    budgetWarning: plan.budget_exceeded ? BUDGET_EXCEEDED_TEXT : '',
    unplanned: buildUnplannedList(plan, options.attractions),
    days: dayViews,
  }
  return {
    ok: true,
    sheet,
    fileName: `${sanitizeFileName(
      `${EXPORT_SHEET_TITLE}_${planTypeLabel(planType)}_${
        firstDate === lastDate || !lastDate ? firstDate || '未知日期' : `${firstDate}至${lastDate}`
      }`,
    )}.png`,
  }
}

export function buildDayItinerarySheet(response, planType, dayIndex, options = {}) {
  const plan = findPlan(response, planType)
  if (!plan) {
    return { ok: false, error: '请先生成或打开一个行程方案，再导出当日行程单。' }
  }
  const days = planDays(plan)
  if (!days.length) {
    return { ok: false, error: '当前方案没有行程日期，无法导出当日行程单。' }
  }
  if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex >= days.length) {
    return {
      ok: false,
      error: `当前方案没有${
        Number.isInteger(dayIndex) ? `第 ${dayIndex + 1} 天` : '所选日期'
      }的行程，无法导出当日行程单。`,
    }
  }
  const dayView = buildDayView(days[dayIndex], dayIndex, options.weatherData)
  if (!dayView.entries.some((entry) => entry.kind === 'item')) {
    return { ok: false, error: '这一天的行程数据不完整，无法导出当日行程单。' }
  }
  const sheet = {
    ...buildSheetBase(
      response,
      plan,
      planType,
      WARNINGS_TITLE_DAY,
      WARNINGS_NOTE_DAY,
      options.weatherData,
    ),
    kind: 'day',
    periodLabel: `第 ${dayView.dayNumber} 天 · ${dayView.dateLabel} · ${dayView.weatherLabel}`,
    ticketLabel: dayView.dayTicketLabel,
    budgetWarning: plan.budget_exceeded ? BUDGET_EXCEEDED_TEXT : '',
    unplanned: [],
    days: [dayView],
  }
  return {
    ok: true,
    sheet,
    fileName: `${sanitizeFileName(
      `${EXPORT_SHEET_TITLE}_${planTypeLabel(planType)}_第${dayView.dayNumber}天_${
        dayView.date || '未知日期'
      }`,
    )}.png`,
  }
}

export function buildDayOptions(response, planType) {
  const plan = findPlan(response, planType)
  if (!plan) return []
  return planDays(plan).map((day, index) => ({
    index,
    label: `第 ${index + 1} 天`,
    date: nonEmptyText(day?.date),
    dateLabel: dateLabel(day?.date),
  }))
}

// Windows forbids < > : " / \ | ? * and control characters in file names, and
// names must not start or end with dots or whitespace.
export function sanitizeFileName(value) {
  const cleaned = String(value ?? '')
    // Control characters are genuinely forbidden in Windows file names, so the
    // range below is intentional and not an accidental regex side effect.
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const truncated = Array.from(cleaned).slice(0, EXPORT_FILE_NAME_MAX_LENGTH).join('')
  return truncated.replace(/^[\s.]+/, '').replace(/[\s.]+$/, '')
}
