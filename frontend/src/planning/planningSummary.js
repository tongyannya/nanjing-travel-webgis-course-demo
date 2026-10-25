// 从最终表单值生成“本次会发送的请求概览”。快速问卷末页与单元测试共用，
// 必须与 buildTripRequest 的取值逻辑保持一致：只显示有效值，不用“保留当前表单值”。
import { ATTRACTION_TAG_LABELS } from '../attractions/attractionFilters'
import { PLAN_FORM_LABELS, TRANSPORT_PREFERENCE_LABELS } from './planningLabels'
import { partyCount } from './tripForm'

function endpointText(location) {
  if (!location?.name) return '住处'
  return location.name
}

export function dayRangeText(form) {
  const first = form.days?.[0]?.date || form.startDate || ''
  const last = form.days?.[form.days.length - 1]?.date || first
  return first === last ? first : `${first} 至 ${last}`
}

export function buildPlanningSummaryRows(form, { attractionNames = {} } = {}) {
  const rows = [
    { id: 'lodging', label: '住宿', value: form.lodging?.name || '未安排', kind: 'lodging' },
    {
      id: 'firstDayStart',
      label: '首日起点',
      value:
        form.useFirstDayStart && form.firstDayStart
          ? endpointText(form.firstDayStart)
          : '住处，不额外设置',
      kind: 'endpoint',
    },
    {
      id: 'lastDayEnd',
      label: '末日终点',
      value:
        form.useLastDayEnd && form.lastDayEnd ? endpointText(form.lastDayEnd) : '住处，不额外设置',
      kind: 'endpoint',
    },
    {
      id: 'dates',
      label: '出发日期',
      value: `${form.startDate} 出发`,
      kind: 'plain',
    },
  ]
  rows.push({
    id: 'dayTimes',
    label: '每天起止时间',
    value: (form.days || [])
      .map((day, index) => `第 ${index + 1} 天 ${day.start_time}–${day.end_time}`)
      .join('；'),
    kind: 'plain',
  })
  rows.push({
    id: 'party',
    label: '成人／学生／儿童',
    value: `${partyCount(form.party.adult)}／${partyCount(form.party.student)}／${partyCount(form.party.child)}`,
    kind: 'plain',
  })
  rows.push({
    id: 'planType',
    label: '方案类型',
    value: PLAN_FORM_LABELS[form.preferredPlanType] || PLAN_FORM_LABELS.relaxed,
    kind: 'plain',
  })
  rows.push({
    id: 'transport',
    label: '交通',
    value: TRANSPORT_PREFERENCE_LABELS[form.transportPreference] || form.transportPreference,
    kind: 'plain',
  })
  rows.push({
    id: 'budget',
    label: '门票预算',
    value: form.budgetUnlimited ? '不限' : `${form.budgetTotal} 元`,
    kind: 'plain',
  })
  rows.push({
    id: 'longVisitMeal',
    label: '长时游览用餐',
    value: form.allowSkipMealForLongVisit
      ? '必要时整个行程最多跳过一餐'
      : '保留每餐，各预留 1 小时',
    kind: 'plain',
  })
  rows.push({
    id: 'preferredTags',
    label: '偏好标签',
    value: selectedTagLabels(form.tagChoices, 'preferred'),
    kind: 'tags',
  })
  rows.push({
    id: 'excludedTags',
    label: '排除标签',
    value: selectedTagLabels(form.tagChoices, 'excluded'),
    kind: 'tags',
  })
  rows.push({
    id: 'mustVisit',
    label: '必去景点',
    value: selectedAttractionLabels(form.attractionChoices, 'must', attractionNames),
    kind: 'tags',
  })
  rows.push({
    id: 'interested',
    label: '感兴趣景点',
    value: selectedAttractionLabels(form.attractionChoices, 'interested', attractionNames),
    kind: 'tags',
  })
  rows.push({
    id: 'excluded',
    label: '排除景点',
    value: selectedAttractionLabels(form.attractionChoices, 'excluded', attractionNames),
    kind: 'tags',
  })
  return rows
}

function selectedTagLabels(tagChoices, state) {
  return Object.entries(tagChoices || {})
    .filter(([, value]) => value === state)
    .map(([id]) => ATTRACTION_TAG_LABELS[id] || id)
    .join('、')
}

function selectedAttractionLabels(choices, state, names) {
  return Object.entries(choices || {})
    .filter(([, value]) => value === state)
    .map(([id]) => names[id] || id)
    .join('、')
}
