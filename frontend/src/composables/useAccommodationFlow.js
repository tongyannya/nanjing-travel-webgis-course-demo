import { computed, nextTick, ref, watch } from 'vue'
import { sourceMethodForPoi, useAccommodationPlanning } from './useAccommodationPlanning'

export function useAccommodationFlow({
  tripForm,
  layerVisibility,
  searchCategory,
  selectSearchResult,
  selectedLocation,
  selectedLocationLabel,
  selectedLocationSource,
  onCommitted,
  areaPicking = ref(false),
  onAreaPickingStarted,
  onAreaPickingEnded,
}) {
  // 住宿安排：草稿与已确认值分离；选点会话只收集候选，确认时才写回表单。
  const accommodation = useAccommodationPlanning({ tripForm })
  const accommodationWizardOpen = ref(false)
  const topSearchRef = ref(null)
  let accommodationReturnFocus = null
  let accommodationResume = null // 选点前的问卷状态，用于取消后恢复
  let previousAreaLayers = null
  let pausedPickingSession = null
  let pausedAreaPicking = false
  let continuePlanningAfterAccommodation = false
  const hasPendingAccommodation = computed(() => Boolean(accommodation.accommodationDraft.value))
  const isMapAccommodationSelection = computed(
    () =>
      areaPicking.value || ['lodging', 'attraction_nearby'].includes(pickingSession.value?.purpose),
  )

  function finishAreaPicking() {
    if (!areaPicking.value) return
    areaPicking.value = false
    if (previousAreaLayers) layerVisibility.value = previousAreaLayers
    previousAreaLayers = null
    onAreaPickingEnded?.()
  }

  function startAreaPicking({ resume = false } = {}) {
    if (!areaPicking.value) previousAreaLayers = { ...layerVisibility.value }
    accommodation.setDraftStayChoice('recommend')
    areaPicking.value = true
    layerVisibility.value = Object.fromEntries(
      Object.keys(layerVisibility.value).map((key) => [
        key,
        ['attractions', 'hotels', 'accommodationAreas'].includes(key),
      ]),
    )
    accommodationWizardOpen.value = false
    onAreaPickingStarted?.({ resume })
  }

  function handleAccommodationBackToStep(step) {
    if (step === 'area-pick') {
      startAreaPicking()
      return
    }
    finishAreaPicking()
    accommodation.backToStep(step)
    accommodationWizardOpen.value = true
  }

  const lodgingName = computed(() => {
    if (tripForm.value.lodging?.name) return tripForm.value.lodging.name
    return ''
  })

  const pickingSession = computed(() => accommodation.pickingSession.value)

  watch(pickingSession, (session) => {
    if (session) layerVisibility.value.search = true
  })

  function openAccommodationWizard(event) {
    continuePlanningAfterAccommodation = false
    finishAreaPicking()
    accommodationReturnFocus = event instanceof HTMLElement ? event : document.activeElement
    // Reopening starts a new draft; an earlier picking session must not intercept its commit.
    accommodation.cancelPickingSession()
    accommodationResume = null
    pausedPickingSession = null
    pausedAreaPicking = false
    if (tripForm.value.accommodationConfirmed) accommodation.startEditDraft()
    else accommodation.startDraft()
    accommodationWizardOpen.value = true
  }

  function closeAccommodationWizard() {
    continuePlanningAfterAccommodation = false
    pausedAreaPicking = areaPicking.value
    pausedPickingSession = pickingSession.value
    finishAreaPicking()
    accommodation.cancelPickingSession()
    accommodationWizardOpen.value = false
    restoreAccommodationFocus()
  }

  function continueAccommodationWizard(event) {
    if (!hasPendingAccommodation.value) return openAccommodationWizard(event)
    accommodationReturnFocus = event instanceof HTMLElement ? event : document.activeElement
    if (pausedAreaPicking) {
      pausedAreaPicking = false
      startAreaPicking({ resume: true })
    } else if (pausedPickingSession) {
      accommodation.pickingSession.value = pausedPickingSession
      pausedPickingSession = null
      accommodationWizardOpen.value = false
    } else accommodationWizardOpen.value = true
  }

  function leaveMapAccommodationSelection() {
    continuePlanningAfterAccommodation = false
    finishAreaPicking()
    accommodation.cancelPickingSession()
    accommodationResume = null
    pausedPickingSession = null
    pausedAreaPicking = false
    accommodation.backToStep('stay-choice')
    accommodationWizardOpen.value = false
  }

  function restoreAccommodationFocus() {
    nextTick(() => {
      const target = accommodationReturnFocus
      if (target instanceof HTMLElement && target.isConnected) target.focus()
      accommodationReturnFocus = null
    })
  }

  function handleAccommodationPickMode({ mode, back = false }) {
    if (mode === 'recommend') {
      startAreaPicking()
      return
    }
    // endpoints 的“上一题”：poi 分支回第一题；recommend 分支回片区选择。
    if (back) {
      accommodation.setDraftStayChoice(mode)
      return
    }
    // The merged place option enters the picking session without changing the draft.
    const purpose = mode === 'attraction_nearby' ? 'attraction_nearby' : 'lodging'
    accommodationResume = {
      step: accommodation.accommodationStep.value,
      draft: JSON.parse(JSON.stringify(accommodation.accommodationDraft.value || {})),
    }
    if (purpose === 'attraction_nearby') searchCategory.value = 'attraction'
    accommodation.startPickingSession(purpose)
    accommodationWizardOpen.value = false
    nextTick(() => topSearchRef.value?.focusInput())
  }

  // 首末日“搜索其他地点”：purpose 不同，不能误写住宿。
  function handleEndpointPicking(purpose) {
    accommodationResume = {
      step: accommodation.accommodationStep.value,
      draft: JSON.parse(JSON.stringify(accommodation.accommodationDraft.value || {})),
    }
    accommodation.startPickingSession(purpose)
    accommodationWizardOpen.value = false
    nextTick(() => topSearchRef.value?.focusInput())
  }

  function handleAccommodationPickArea(areaId) {
    if (!accommodation.chooseDraftArea(areaId)) return
    finishAreaPicking()
    accommodationWizardOpen.value = true
  }

  function handleAccommodationPickEndpoint({ purpose, kind, poi }) {
    accommodation.setDraftEndpoint(purpose, { kind, poi })
  }

  function handleAccommodationCommit() {
    // 选点会话中：浮窗“选好了”提交候选，问卷回到 endpoints 继续设首末日。
    if (pickingSession.value) {
      accommodation.confirmPickingSession()
      accommodationResume = null
      accommodationWizardOpen.value = true
      return
    }
    const previous = accommodationPlanSignature(tripForm.value)
    const result = accommodation.commitDraftToForm()
    if (!result || !tripForm.value.accommodationConfirmed) return
    layerVisibility.value.search = true
    layerVisibility.value.currentLodging = true
    accommodationWizardOpen.value = false
    const continuePlanning = continuePlanningAfterAccommodation
    continuePlanningAfterAccommodation = false
    if (!continuePlanning) restoreAccommodationFocus()
    onCommitted?.({
      changed: previous !== accommodationPlanSignature(tripForm.value),
      continuePlanning,
    })
  }

  function handleAccommodationCancel() {
    if (pickingSession.value) {
      const purpose = pickingSession.value.purpose
      accommodation.cancelPickingSession()
      // 恢复问卷与草稿（景点附近等分支取消后回原步骤）。
      if (accommodationResume) {
        accommodation.accommodationDraft.value = accommodationResume.draft
        accommodation.accommodationStep.value = accommodationResume.step
        accommodationResume = null
      }
      if (purpose === 'lodging' || purpose === 'attraction_nearby')
        accommodation.backToStep('stay-choice')
      accommodationWizardOpen.value = true
    }
  }

  // 选点会话期间搜索/地图点击只更新候选，不提交住宿。
  function handlePickingCandidateFromSearch(poi) {
    if (!pickingSession.value) return false
    accommodation.updatePickingCandidate({
      name: poi?.name || '',
      longitude: poi?.location?.longitude,
      latitude: poi?.location?.latitude,
      sourceMethod: sourceMethodForPoi(poi, pickingSession.value.purpose),
      displayIcon: poi?.searchIcon || '',
    })
    return true
  }

  // 未确认住宿时拦截规划入口：引导先完成住宿，保留已答内容。
  function guardPlanningBeforeAccommodation(event) {
    if (tripForm.value.accommodationConfirmed) return true
    continueAccommodationWizard(event instanceof HTMLElement ? event : undefined)
    continuePlanningAfterAccommodation = true
    return false
  }

  // 搜索结果始终走标准地图选中流程；选点会话中再同步为住宿候选。
  function handleAccommodationAwareSearchSelect(poi) {
    selectSearchResult(poi)
    handlePickingCandidateFromSearch(poi)
  }

  // Existing place markers can become candidates; free coordinates cannot become lodging.
  function handleMapClickForAccommodation() {
    const session = pickingSession.value
    if (!session) return
    const source = selectedLocationSource.value
    if (source === 'map_click') {
      if (session.purpose === 'lodging' || session.purpose === 'attraction_nearby') return
    } else if (!['search', 'station', 'hotel'].includes(source)) return
    const previous = session.candidate
    const samePlace =
      previous?.name === selectedLocationLabel.value &&
      previous?.longitude === selectedLocation.value.longitude &&
      previous?.latitude === selectedLocation.value.latitude
    accommodation.updatePickingCandidate({
      name: selectedLocationLabel.value,
      longitude: selectedLocation.value.longitude,
      latitude: selectedLocation.value.latitude,
      sourceMethod: source === 'station' ? 'station' : 'search',
      displayIcon: samePlace ? previous.displayIcon || '' : '',
    })
  }

  watch(selectedLocation, () => handleMapClickForAccommodation(), { deep: true })

  function handlePickingCandidateFromStation(station) {
    if (!pickingSession.value) return
    accommodation.updatePickingCandidate({
      name: station.name,
      longitude: station.location?.longitude,
      latitude: station.location?.latitude,
      sourceMethod: 'station',
      displayIcon: 'metro',
    })
  }
  return {
    accommodation,
    accommodationWizardOpen,
    topSearchRef,
    lodgingName,
    pickingSession,
    hasPendingAccommodation,
    isMapAccommodationSelection,
    openAccommodationWizard,
    continueAccommodationWizard,
    leaveMapAccommodationSelection,
    closeAccommodationWizard,
    handleAccommodationPickMode,
    handleEndpointPicking,
    handleAccommodationPickArea,
    handleAccommodationBackToStep,
    handleAccommodationPickEndpoint,
    handleAccommodationCommit,
    handleAccommodationCancel,
    guardPlanningBeforeAccommodation,
    handleAccommodationAwareSearchSelect,
    handlePickingCandidateFromStation,
  }
}

export function accommodationPlanSignature(form) {
  const place = (location) =>
    location ? [location.name, location.longitude, location.latitude] : null
  return JSON.stringify([
    place(form.lodging),
    form.useFirstDayStart ? place(form.firstDayStart) : null,
    form.useLastDayEnd ? place(form.lastDayEnd) : null,
  ])
}
