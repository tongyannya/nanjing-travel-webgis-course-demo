// 住宿安排状态：区分“正在编辑的草稿”和“已确认值”，避免取消后污染当前方案。
// 地图选点会话只负责收集候选地点；只有浮窗“选好了”才把候选写回草稿或已确认值。
import { ref, watch } from 'vue'

import { ACCOMMODATION_AREA_OPTIONS, findAccommodationArea } from '../planning/accommodationOptions'

// 选点会话目的：住宿、景点附近、首日起点、末日终点。四种 purpose 不串值。
export const PICKING_PURPOSES = ['lodging', 'attraction_nearby', 'first_start', 'last_end']

export const STAY_MODES = ['search_poi', 'attraction_nearby', 'recommend', 'poi']

const ENDPOINT_FIELDS = { first_start: 'firstDayStart', last_end: 'lastDayEnd' }

function locationRef(sourceMethod, name, longitude, latitude, displayIcon = '') {
  const result = {
    source_method: sourceMethod,
    name,
    location: { longitude, latitude, coord_system: 'GCJ-02' },
  }
  if (displayIcon) result.display_icon = displayIcon
  return result
}

export function isPickingPurpose(value) {
  return PICKING_PURPOSES.includes(value)
}

// 地点来源映射到后端允许的枚举：车站类 POI 用 station（仅起终点 purpose），
// 其余统一 search；不扩展后端契约。
export function sourceMethodForPoi(poi, purpose) {
  if (
    (purpose === 'first_start' || purpose === 'last_end') &&
    String(poi?.type || '').includes('交通')
  )
    return 'station'
  return 'search'
}

export function poiToLocation(poi, purpose) {
  if (!Number.isFinite(poi?.location?.longitude) || !Number.isFinite(poi?.location?.latitude))
    return null
  const name = String(poi?.name || '').trim()
  if (!name) return null
  return locationRef(
    sourceMethodForPoi(poi, purpose),
    name,
    poi.location.longitude,
    poi.location.latitude,
    poi.searchIcon || '',
  )
}

function endpointPropertyName(field) {
  return field === 'firstDayStart' ? 'useFirstDayStart' : 'useLastDayEnd'
}

function confirmedFromForm(form) {
  if (!form?.accommodationConfirmed || !form.lodging?.name) return null
  const areaId = findAccommodationArea(form.accommodationAreaId)?.id || null
  const confirmed = {
    areaId,
    location: JSON.parse(JSON.stringify(form.lodging)),
  }
  for (const field of Object.values(ENDPOINT_FIELDS)) {
    if (form[endpointPropertyName(field)] && form[field]) {
      confirmed[field] = { use: true, location: JSON.parse(JSON.stringify(form[field])) }
    }
  }
  return confirmed
}

export function useAccommodationPlanning({ tripForm }) {
  // 已确认值：areaId 为六片区 ID 或 null；location 为 lodging 地点结构。
  // firstDayStart/lastDayEnd 仅在用户显式选择其他地点时存在。
  const confirmedAccommodation = ref(null)
  const accommodationDraft = ref(null)
  const accommodationStep = ref('stay-choice')
  // 选点会话：{ purpose, candidate: { name, longitude, latitude, sourceMethod? } | null }
  const pickingSession = ref(null)

  // 表单可能在初始化、打开保存方案时被整体替换；确认态必须始终跟随当前表单，
  // 不能残留上一个方案的住宿，也不能在刷新后退回空状态。
  watch(
    tripForm,
    (form) => {
      confirmedAccommodation.value = confirmedFromForm(form)
    },
    { deep: true, immediate: true },
  )

  function startPickingSession(purpose) {
    if (!isPickingPurpose(purpose)) return false
    pickingSession.value = { purpose, candidate: null }
    return true
  }

  function updatePickingCandidate(candidate) {
    if (!pickingSession.value) return
    pickingSession.value = {
      ...pickingSession.value,
      candidate: candidate ? { ...candidate } : null,
    }
  }

  function cancelPickingSession() {
    pickingSession.value = null
  }

  // 只有浮窗“选好了”调用；无候选时返回 false，不产生任何写入。
  // 住宿分支确认后回到问卷的 endpoints 步骤继续设置首末日；
  // 首末日分支确认后回到 endpoints（问卷仍开着）。
  function confirmPickingSession() {
    const session = pickingSession.value
    if (!session?.candidate) return false
    const { purpose, candidate } = session
    pickingSession.value = null
    if (purpose === 'lodging' || purpose === 'attraction_nearby') {
      if (!accommodationDraft.value) startDraft()
      const name = purpose === 'attraction_nearby' ? `${candidate.name}附近` : candidate.name
      accommodationDraft.value = {
        ...accommodationDraft.value,
        stayMode: 'poi',
        poiLocation: locationRef(
          candidate.sourceMethod || 'search',
          name,
          candidate.longitude,
          candidate.latitude,
          candidate.displayIcon || '',
        ),
      }
      accommodationStep.value = 'endpoints'
      return true
    }
    const field = ENDPOINT_FIELDS[purpose]
    if (!field) return false
    if (!accommodationDraft.value) startDraft()
    accommodationDraft.value = {
      ...accommodationDraft.value,
      endpoints: {
        ...accommodationDraft.value.endpoints,
        [field]: {
          kind: 'poi',
          poi: {
            name: candidate.name,
            location: {
              longitude: candidate.longitude,
              latitude: candidate.latitude,
            },
            type: candidate.sourceMethod === 'station' ? '交通服务;火车站' : '',
            searchIcon: candidate.displayIcon || '',
          },
        },
      },
    }
    accommodationStep.value = 'endpoints'
    return true
  }

  // ---- 问卷草稿：从“还不知道”六片区 + 首末日起终点，一次性提交 ----
  function startDraft() {
    accommodationDraft.value = { stayMode: null, areaId: null, endpoints: {} }
    accommodationStep.value = 'stay-choice'
  }

  function setDraftStayChoice(mode) {
    if (!STAY_MODES.includes(mode)) return false
    if (!accommodationDraft.value) startDraft()
    accommodationDraft.value = { ...accommodationDraft.value, stayMode: mode }
    // recommend enters area selection; useAccommodationFlow coordinates POI picking.
    if (mode === 'recommend') accommodationStep.value = 'area-pick'
    return true
  }

  function chooseDraftArea(areaId) {
    if (!findAccommodationArea(areaId)) return false
    accommodationDraft.value = {
      ...accommodationDraft.value,
      stayMode: 'recommend',
      areaId,
    }
    accommodationStep.value = 'endpoints'
    return true
  }

  // value: { kind: 'lodging' } | { kind: 'poi', poi } | { kind: 'none' }
  function setDraftEndpoint(purpose, value) {
    const field = ENDPOINT_FIELDS[purpose]
    if (!field || !accommodationDraft.value) return false
    const endpoints = { ...accommodationDraft.value.endpoints }
    if (value?.kind === 'poi' && poiToLocation(value.poi, purpose)) {
      endpoints[field] = { kind: 'poi', poi: { ...value.poi } }
    } else {
      endpoints[field] = { kind: value?.kind === 'poi' ? 'lodging' : 'none' }
    }
    accommodationDraft.value = { ...accommodationDraft.value, endpoints }
    return true
  }

  // 提交问卷：一次性写入 tripForm 并更新已确认值；任一地点非法则整体失败。
  // stayMode：'poi'（搜索/景点附近选点）、'recommend'（六片区）；首末日总是重新提交。
  function commitDraftToForm() {
    const draft = accommodationDraft.value
    if (!draft) return null
    const area = draft.stayMode === 'recommend' ? findAccommodationArea(draft.areaId) : null
    if (draft.stayMode === 'poi' && !draft.poiLocation) return null
    if (draft.stayMode === 'recommend' && !area) return null
    const nextConfirmed = { ...(confirmedAccommodation.value || {}) }
    if (draft.stayMode === 'poi') {
      nextConfirmed.areaId = null
      nextConfirmed.location = JSON.parse(JSON.stringify(draft.poiLocation))
    }
    if (area) {
      nextConfirmed.areaId = area.id
      nextConfirmed.location = locationRef(
        'search',
        `${area.name}一带`,
        area.longitude,
        area.latitude,
      )
    }
    const nextEndpoints = { firstDayStart: null, lastDayEnd: null }
    for (const [purpose, field] of Object.entries(ENDPOINT_FIELDS)) {
      const endpoint = draft.endpoints[field]
      if (!endpoint || endpoint.kind !== 'poi') continue
      const location = poiToLocation(endpoint.poi, purpose)
      if (!location) return null
      nextEndpoints[field] = location
    }
    // 全部合法后一次性写入。
    tripForm.value.accommodationAreaId = nextConfirmed.areaId || null
    if (draft.stayMode === 'poi' || area) applyConfirmedLodgingToFormWith(nextConfirmed)
    for (const field of Object.keys(ENDPOINT_FIELDS).map((p) => ENDPOINT_FIELDS[p])) {
      const location = nextEndpoints[field]
      tripForm.value[endpointPropertyName(field)] = Boolean(location)
      if (location) tripForm.value[field] = JSON.parse(JSON.stringify(location))
      if (location) {
        nextConfirmed[field] = { use: true, location: JSON.parse(JSON.stringify(location)) }
      } else {
        delete nextConfirmed[field]
      }
    }
    confirmedAccommodation.value = nextConfirmed
    accommodationDraft.value = null
    accommodationStep.value = 'stay-choice'
    return { confirmed: nextConfirmed }
  }

  function applyConfirmedLodgingToFormWith(confirmed) {
    if (!confirmed?.location) return
    tripForm.value.lodging = JSON.parse(JSON.stringify(confirmed.location))
    tripForm.value.accommodationConfirmed = true
  }

  // 问卷内回退：endpoints → 片区选择或第一题；不改动草稿内容。
  function backToStep(step) {
    if (!['stay-choice', 'area-pick', 'endpoints'].includes(step)) return false
    accommodationStep.value = step
    return true
  }

  function cancelDraft() {
    accommodationDraft.value = null
    accommodationStep.value = 'stay-choice'
  }

  // 再次修改：住宿值回显（片区/名称提示），首末日一律清空重新选择。
  function startEditDraft() {
    const confirmed = confirmedAccommodation.value
    const draft = {
      stayMode: confirmed?.areaId ? 'recommend' : confirmed ? 'poi' : null,
      areaId: confirmed?.areaId || null,
      poiLocation: confirmed?.location ? JSON.parse(JSON.stringify(confirmed.location)) : null,
      endpoints: {},
    }
    accommodationDraft.value = draft
    accommodationStep.value = 'stay-choice'
  }

  function areaDisplayName() {
    const area = findAccommodationArea(confirmedAccommodation.value?.areaId)
    if (area) return `${area.name}一带`
    return confirmedAccommodation.value?.location?.name || ''
  }

  return {
    ACCOMMODATION_AREA_OPTIONS,
    confirmedAccommodation,
    accommodationDraft,
    accommodationStep,
    pickingSession,
    startPickingSession,
    updatePickingCandidate,
    cancelPickingSession,
    confirmPickingSession,
    startDraft,
    setDraftStayChoice,
    chooseDraftArea,
    setDraftEndpoint,
    commitDraftToForm,
    backToStep,
    cancelDraft,
    startEditDraft,
    areaDisplayName,
  }
}
