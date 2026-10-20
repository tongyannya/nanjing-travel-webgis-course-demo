import { PLAN_FORM_LABELS, PLAN_TYPES } from '../planning/planningLabels'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import {
  buildTripRequest,
  createDefaultTripForm,
  restoreTripForm,
  isCurrentTripForm,
  validateTripForm,
} from '../planning/tripForm'
import {
  addSavedPlan,
  deleteSavedPlan as deleteStoredPlan,
  loadSavedPlans,
  renameSavedPlan as renameStoredPlan,
} from '../planning/savedPlansStorage'
import { apiRequest } from '../services/api'
import { parseItineraryFile, PLAN_FILE_MAX_BYTES } from '../planning/itineraryFileImport'

const FORM_STORAGE_KEY = 'nanjing-webgis-trip-form-v1'
const PLAN_REQUEST_TIMEOUT_MS = 120_000

function errorText(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback
}

function historyKey(value) {
  return JSON.stringify(value, (_, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]]),
        )
      : item,
  )
}

function storageRead(key) {
  try {
    return JSON.parse(window.localStorage.getItem(key) || 'null')
  } catch {
    window.localStorage.removeItem(key)
    return null
  }
}

export function useTripPlanning(attractions) {
  const tripForm = ref(createDefaultTripForm())
  const formReady = ref(false)
  const planState = ref('idle')
  const planMessage = ref('填写左侧条件后，先生成你选定的一套方案；其他方案可按需查看。')
  const planResponse = ref(null)
  const activePlanType = ref('relaxed')
  const activeDayIndex = ref(0)
  const loadingPlanType = ref('')
  const savedPlans = ref([])
  const historyPlans = ref([])
  const saveMessage = ref('')
  const activeTripRequest = ref(null)
  const activeTripRequestSource = ref('unavailable')
  let activePlanTask = null
  let disposed = false
  let historySequence = 0
  let activeFormSnapshot = null

  function invalidatePlanTask() {
    const task = activePlanTask
    activePlanTask = null
    task?.controller.abort()
    loadingPlanType.value = ''
    return task
  }

  const activePlan = computed(
    () =>
      planResponse.value?.plans?.find((plan) => plan.plan_type === activePlanType.value) || null,
  )
  const activeDay = computed(() => activePlan.value?.days?.[activeDayIndex.value] || null)
  const hasSavedPlan = computed(() => savedPlans.value.length > 0)

  function rememberDisplayedPlan({ forceNew = false } = {}) {
    if (!activePlan.value) return
    const key = historyKey({ plan: activePlan.value, request: activeTripRequest.value })
    if (!forceNew && historyPlans.value.some((record) => record.key === key)) return
    historyPlans.value.unshift({
      id: `history-${++historySequence}`,
      key,
      name: PLAN_FORM_LABELS[activePlanType.value].replace('方案', '路线'),
      createdAt: new Date().toISOString(),
      snapshot: JSON.parse(
        JSON.stringify({
          tripForm: activeFormSnapshot || tripForm.value,
          request: activeTripRequest.value,
          requestSource: activeTripRequestSource.value,
          response: { ...planResponse.value, plans: [activePlan.value] },
          activePlanType: activePlanType.value,
          activeDayIndex: activeDayIndex.value,
        }),
      ),
    })
  }

  function applySavedPlan(record, message) {
    if (!record || !isCurrentTripForm(record.snapshot.tripForm, attractions.value)) {
      saveMessage.value = '保存的规划条件不完整或无效，请重新生成方案。'
      return false
    }
    invalidatePlanTask()
    tripForm.value = restoreTripForm(record.snapshot.tripForm, attractions.value)
    activeFormSnapshot = JSON.parse(JSON.stringify(record.snapshot.tripForm))
    activeTripRequest.value = record.snapshot.request || buildTripRequest(tripForm.value)
    activeTripRequestSource.value = record.snapshot.requestSource || 'saved_form_reconstructed'
    planResponse.value = JSON.parse(JSON.stringify(record.snapshot.response))
    activePlanType.value = record.snapshot.activePlanType
    activeDayIndex.value = record.snapshot.activeDayIndex
    planState.value = 'success'
    planMessage.value = message
    saveMessage.value = `已打开“${record.name}”，并恢复规划条件。`
    rememberDisplayedPlan()
    return true
  }

  function initializeForm() {
    if (formReady.value || !attractions.value.length) return
    tripForm.value = restoreTripForm(storageRead(FORM_STORAGE_KEY), attractions.value)
    formReady.value = true
    const loaded = loadSavedPlans()
    savedPlans.value = loaded.records
    if (loaded.warnings.length) {
      saveMessage.value = loaded.warnings.join(' ')
    }
  }

  watch(
    tripForm,
    (value) => {
      if (!formReady.value) return
      try {
        window.localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(value))
      } catch {
        // Local persistence must never block planning.
      }
    },
    { deep: true },
  )

  async function requestPlan(type, { preserveLoaded = false } = {}) {
    if (disposed || planState.value === 'loading') return false
    if (!formReady.value) {
      planMessage.value = '景点资料尚未加载，请稍候或重试连接。'
      planState.value = 'error'
      return false
    }
    if (!PLAN_TYPES.includes(type)) return false
    let requestPayload = activeTripRequest.value
    if (!preserveLoaded || !requestPayload) {
      const issues = validateTripForm(tripForm.value)
      if (issues.length) {
        if (!preserveLoaded) planResponse.value = null
        planState.value = 'error'
        planMessage.value = issues.join(' ')
        return false
      }
      requestPayload = buildTripRequest(tripForm.value)
      activeTripRequest.value = JSON.parse(JSON.stringify(requestPayload))
      activeTripRequestSource.value = 'submitted'
      activeFormSnapshot = JSON.parse(JSON.stringify(tripForm.value))
    }
    const task = { controller: new AbortController(), type }
    activePlanTask = task
    const isCurrent = () => !disposed && activePlanTask === task && !task.controller.signal.aborted
    loadingPlanType.value = type
    planState.value = 'loading'
    planMessage.value = `正在生成${PLAN_FORM_LABELS[type]}，检查闭馆、预算、交通和用餐时段…`
    if (!preserveLoaded) planResponse.value = null
    saveMessage.value = ''
    try {
      const result = await apiRequest(
        `/api/plans?plan_type=${encodeURIComponent(type)}`,
        {
          method: 'POST',
          body: JSON.stringify(requestPayload),
          signal: task.controller.signal,
        },
        PLAN_REQUEST_TIMEOUT_MS,
      )
      if (!isCurrent()) return false
      const returnedPlan = result?.plans?.find((plan) => plan.plan_type === type)
      if (!returnedPlan) throw new Error(`未能取得${PLAN_FORM_LABELS[type]}，请稍后重试。`)
      const existingPlans = preserveLoaded ? planResponse.value?.plans || [] : []
      const mergedPlans = [
        ...existingPlans.filter((plan) => plan.plan_type !== type),
        returnedPlan,
      ].sort(
        (left, right) => PLAN_TYPES.indexOf(left.plan_type) - PLAN_TYPES.indexOf(right.plan_type),
      )
      planResponse.value = {
        ...result,
        plans: mergedPlans,
        global_warnings: [
          ...new Set([
            ...(preserveLoaded ? planResponse.value?.global_warnings || [] : []),
            ...(result.global_warnings || []),
          ]),
        ],
      }
      activePlanType.value = type
      activeDayIndex.value = 0
      planState.value = 'success'
      planMessage.value = `${PLAN_FORM_LABELS[type]}已生成。其他方案会在你选择查看时按需生成。`
      rememberDisplayedPlan({ forceNew: true })
      return true
    } catch (error) {
      if (!isCurrent()) return false
      planState.value = planResponse.value ? 'success' : 'error'
      planMessage.value = errorText(error, '行程生成失败，请稍后重试。')
      return false
    } finally {
      if (activePlanTask === task) {
        activePlanTask = null
        loadingPlanType.value = ''
      }
    }
  }

  async function submitPlan(type = tripForm.value.preferredPlanType || 'relaxed') {
    tripForm.value.preferredPlanType = type
    return requestPlan(type)
  }

  function cancelPlan() {
    const task = invalidatePlanTask()
    if (!task) return
    planState.value = planResponse.value ? 'success' : 'idle'
    planMessage.value = planResponse.value
      ? `已取消生成${PLAN_FORM_LABELS[task.type]}，已有方案仍可查看。`
      : '已取消本次生成，没有保存半完成结果。'
  }

  async function selectPlan(type) {
    if (disposed || !PLAN_TYPES.includes(type)) return false
    if (!planResponse.value?.plans?.some((plan) => plan.plan_type === type)) {
      return requestPlan(type, { preserveLoaded: true })
    }
    activePlanType.value = type
    activeDayIndex.value = 0
    rememberDisplayedPlan()
    return true
  }

  function selectDay(index) {
    activeDayIndex.value = index
  }

  function savePlan(name, { includeNotices = true } = {}) {
    if (!planResponse.value) {
      saveMessage.value = '请先生成方案，再保存到这台电脑。'
      return false
    }
    try {
      savedPlans.value = addSavedPlan(window.localStorage, savedPlans.value, {
        name,
        includeNotices,
        response: planResponse.value,
        tripForm: tripForm.value,
        activePlanType: activePlanType.value,
        activeDayIndex: activeDayIndex.value,
        request: activeTripRequest.value,
        requestSource: activeTripRequestSource.value,
      })
      saveMessage.value = `已保存“${savedPlans.value[0].name}”；刷新页面后仍可打开。`
      return true
    } catch (error) {
      saveMessage.value = errorText(error, '本地保存失败，请重试。')
      return false
    }
  }

  function openSavedPlan(id) {
    const record = savedPlans.value.find((item) => item.id === id)
    if (!record) {
      saveMessage.value = '找不到要打开的方案。'
      return false
    }
    return applySavedPlan(record, `已打开保存方案“${record.name}”。`)
  }

  function openHistoryPlan(id) {
    const record = historyPlans.value.find((item) => item.id === id)
    if (!record) return false
    return applySavedPlan(record, `已打开历史方案“${record.name}”。`)
  }

  function deleteHistoryPlan(id) {
    historyPlans.value = historyPlans.value.filter((record) => record.id !== id)
  }

  let importingFile = false
  async function importPlanFile(file) {
    if (disposed || importingFile) return false
    importingFile = true
    try {
      if (!file || file.size > PLAN_FILE_MAX_BYTES) throw new Error('请选择不超过20MB的方案文件。')
      const input = parseItineraryFile(await file.text(), attractions.value)
      if (disposed) return false
      let name = input.name
      let suffix = 2
      while (
        savedPlans.value.some(
          (record) => record.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
        )
      ) {
        name = `${Array.from(input.name).slice(0, 32).join('')} (${suffix++})`
      }
      const records = addSavedPlan(window.localStorage, savedPlans.value, { ...input, name })
      savedPlans.value = records
      return applySavedPlan(records[0], `已导入“${name}”，无需重新生成行程。`)
    } catch (error) {
      saveMessage.value = errorText(error, '方案导入失败，当前行程未改变。')
      return false
    } finally {
      importingFile = false
    }
  }

  function renameSavedPlan(id, name) {
    try {
      savedPlans.value = renameStoredPlan(window.localStorage, savedPlans.value, id, name)
      const record = savedPlans.value.find((item) => item.id === id)
      saveMessage.value = `已改名为“${record.name}”。`
      return true
    } catch (error) {
      saveMessage.value = errorText(error, '方案改名失败，请重试。')
      return false
    }
  }

  function deleteSavedPlan(id) {
    const record = savedPlans.value.find((item) => item.id === id)
    try {
      savedPlans.value = deleteStoredPlan(window.localStorage, savedPlans.value, id)
      saveMessage.value = record ? `已删除“${record.name}”。` : '已删除本地方案。'
      return true
    } catch (error) {
      saveMessage.value = errorText(error, '方案删除失败，请重试。')
      return false
    }
  }

  function clearPlan() {
    invalidatePlanTask()
    planResponse.value = null
    activeTripRequest.value = null
    activeTripRequestSource.value = 'unavailable'
    activeFormSnapshot = null
    planState.value = 'idle'
    planMessage.value = '方案已清空，可修改条件后重新生成。'
    saveMessage.value = ''
    loadingPlanType.value = ''
  }

  onBeforeUnmount(() => {
    disposed = true
    invalidatePlanTask()
  })

  return {
    formReady,
    activeDay,
    activeDayIndex,
    activePlan,
    activePlanType,
    activeTripRequest,
    activeTripRequestSource,
    cancelPlan,
    clearPlan,
    deleteSavedPlan,
    deleteHistoryPlan,
    hasSavedPlan,
    historyPlans,
    initializeForm,
    importPlanFile,
    loadingPlanType,
    openSavedPlan,
    openHistoryPlan,
    planMessage,
    planResponse,
    planState,
    saveMessage,
    savePlan,
    savedPlans,
    renameSavedPlan,
    selectDay,
    selectPlan,
    submitPlan,
    tripForm,
  }
}
