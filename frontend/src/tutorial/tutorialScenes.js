import { nextTick } from 'vue'
import { DEFAULT_LAYER_VISIBILITY } from '../map/layerVisibility'
import { createTutorialPreloader } from './preload'
import { TUTORIAL_STEPS } from './tutorialSteps'

export function createTutorialScenes({ state: s, actions: a }) {
  let sampleText = '',
    sampleRecordId = '',
    demoSaved = false
  const visible = (selector) =>
    [...document.querySelectorAll(selector)].find((e) => e.getClientRects().length)
  const click = (selector) => {
    const element = visible(selector)
    if (!element || element.disabled) throw new Error('这一页的操作区域尚未显示，请重试。')
    element.click()
  }
  async function waitFor(predicate, signal, message = '这一页的演示暂未准备好，请重试。') {
    const deadline = Date.now() + 35000
    while (!predicate()) {
      signal.throwIfAborted()
      if (Date.now() > deadline) throw new Error(message)
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    signal.throwIfAborted()
  }
  async function loadPlan(signal) {
    if (!sampleRecordId) {
      if (!sampleText) {
        const response = await fetch('/assets/tutorial/example-plan.json', { signal })
        if (!response.ok) throw new Error('演示行程未能载入，请重试。')
        sampleText = await response.text()
      }
      signal.throwIfAborted()
      if (
        !(await a.importPlanFile(
          new File([sampleText], '教程演示行程.json', { type: 'application/json' }),
        ))
      )
        throw new Error(s.saveMessage.value)
      signal.throwIfAborted()
      sampleRecordId = s.savedPlans.value[0].id
    } else if (!a.openSavedPlan(sampleRecordId)) throw new Error('演示行程未能打开，请重试。')
    await nextTick()
    a.selectDockPanel('day')
    await nextTick()
    a.fitPlanOverview({ immediately: true })
  }
  async function showAccommodation(signal, endpoints = false) {
    a.openAccommodationWizard()
    await nextTick()
    if (endpoints) {
      click('[data-testid=stay-mode-search]')
      await nextTick()
      a.handleAccommodationAwareSearchSelect({
        name: '夫子庙贵宾楼(钞库街店)',
        location: { longitude: 118.788459, latitude: 32.018385, coord_system: 'GCJ-02' },
      })
      await nextTick()
      signal.throwIfAborted()
      click('[data-testid=picking-toast-confirm]')
      await nextTick()
    }
  }
  async function openDetails(layer) {
    await nextTick()
    const button = visible(`[data-layer-details-toggle=${layer}]`)
    if (button?.getAttribute('aria-expanded') !== 'true') button?.click()
    await nextTick()
    visible(`[data-layer-detail=${layer}]`)?.scrollIntoView({ block: 'nearest' })
  }
  async function showCell(signal, duck = false) {
    await a.loadDiningDensityAreas()
    await waitFor(() => s.diningDensityState.value !== 'loading', signal)
    if (s.diningDensityState.value !== 'success') throw new Error(s.diningDensityMessage.value)
    signal.throwIfAborted()
    const area = s.diningDensityAreas.value.find((item) => item.id === 'dining_hex_21_9')
    if (!area) throw new Error('餐饮分布资料未能载入，请重试。')
    s.layerVisibility.value[duck ? 'duckDensity' : 'diningDensity'] = true
    await a.handleDiningHexSelect(area, duck ? 'duck' : 'ordinary')
    signal.throwIfAborted()
  }
  async function requireMetro(signal) {
    await a.loadMetroNetwork()
    await waitFor(() => s.metroState.value !== 'loading', signal)
    if (s.metroState.value !== 'success') throw new Error(s.metroMessage.value)
  }
  async function requireDuckShops(signal) {
    await a.loadDuckRestaurants()
    await waitFor(() => s.duckRestaurantState.value !== 'loading', signal)
    if (s.duckRestaurantState.value !== 'success') throw new Error(s.duckRestaurantMessage.value)
  }
  async function requireMap(signal) {
    if (s.mapState.value === 'error') {
      await a.initializeMap()
      signal.throwIfAborted()
    }
    await waitFor(
      () => s.attractions.value.length && ['ready', 'error'].includes(s.mapState.value),
      signal,
    )
    if (s.mapState.value !== 'ready') throw new Error('地图未能打开，请检查地图配置或网络后重试。')
  }
  async function prepareScene(id, signal) {
    await requireMap(signal)
    a.closeWizard()
    if (s.accommodationAreaPicking.value || s.pickingSession.value)
      a.leaveMapAccommodationSelection()
    a.closeAccommodationWizard()
    s.isExportOpen.value = false
    s.isMapFull.value = false
    s.isDockOpen.value = true
    s.railMode.value = 'expanded'
    a.clearPlan()
    a.selectDockPanel('overview')
    a.setDuckMode(id.startsWith('duck-') || ['guide', 'culture'].includes(id))
    s.onlyCurrentDining.value = false
    s.includeDuckTakeaway.value = true
    for (const button of document.querySelectorAll(
      '[data-layer-details-toggle][aria-expanded=true]',
    ))
      button.click()
    for (const button of document.querySelectorAll('.map-info-window__close')) button.click()
    for (const selector of [
      '[data-testid=search-dismiss]',
      '[data-testid=duck-guide-dialog-close]',
    ])
      visible(selector)?.click()
    s.layerVisibility.value = Object.fromEntries(
      Object.keys(DEFAULT_LAYER_VISIBILITY).map((key) => [key, false]),
    )
    await nextTick()
    for (const scroller of document.querySelectorAll('.info-dock__body,.layer-sidebar__body'))
      scroller.scrollTop = 0
    signal.throwIfAborted()
    switch (id) {
      case 'welcome':
        await requireMetro(signal)
        s.layerVisibility.value.attractions = true
        s.layerVisibility.value.metro = true
        a.fitAttractions()
        break
      case 'attractions':
        s.layerVisibility.value.attractions = true
        await openDetails('attractions')
        a.fitAttractions()
        break
      case 'metro':
        await requireMetro(signal)
        s.layerVisibility.value.metro = true
        a.fitAttractions()
        break
      case 'hotels':
        a.focusLocation(
          { name: '新街口', location: { longitude: 118.7838, latitude: 32.0419 } },
          '新街口',
          'map_click',
        )
        s.layerVisibility.value.hotels = true
        s.layerVisibility.value.nearbyHotels = true
        await a.queryHotels({ longitude: 118.7838, latitude: 32.0419, centerLabel: '新街口' })
        signal.throwIfAborted()
        if (s.hotelState.value === 'error') throw new Error(s.hotelMessage.value)
        a.handleNearbyHotelRangeSelect()
        await openDetails('hotels')
        break
      case 'dining-density':
        await showCell(signal)
        break
      case 'dining':
        s.layerVisibility.value.dining = true
        s.layerVisibility.value.nanjingCuisine = true
        await showCell(signal)
        await openDetails('dining')
        break
      case 'search':
        s.searchCategory.value = 'all'
        s.searchKeyword.value = '南京总统府'
        await a.handleSearch()
        signal.throwIfAborted()
        if (s.searchState.value === 'error') throw new Error('搜索未能返回结果，请重试。')
        break
      case 'selection':
        s.layerVisibility.value.attractions = true
        a.focusAttraction(s.attractions.value.find((item) => item.id === 'attr_009'))
        break
      case 'accommodation':
        s.layerVisibility.value.attractions = true
        await showAccommodation(signal)
        break
      case 'accommodation-map':
        await showAccommodation(signal)
        click('[data-testid=stay-mode-recommend]')
        await waitFor(
          () =>
            visible('[data-testid=accommodation-area-picking]') &&
            document.querySelectorAll('.accommodation-map-card').length === 6,
          signal,
        )
        // The tutorial cuts between scenes; avoid measuring circles mid camera animation.
        a.fitAccommodationAreas({ immediately: true })
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        break
      case 'endpoints':
        await showAccommodation(signal, true)
        break
      case 'questionnaire':
      case 'summary':
        await loadPlan(signal)
        a.clearPlan()
        a.selectDockPanel('planner')
        await a.openQuestionnaireFromForm()
        await nextTick()
        if (id === 'summary') {
          click('[data-testid=wizard-review-summary]')
          await nextTick()
        }
        break
      case 'route':
      case 'timeline':
      case 'transport':
      case 'save':
      case 'saved':
        await loadPlan(signal)
        if (id === 'transport') {
          const details = visible('[data-plan-leg] details')
          if (!details) throw new Error('示例交通详情尚未显示，请重试。')
          details.open = true
          details.closest('[data-plan-leg]').scrollIntoView({ block: 'center' })
          const leg = s.activeDay.value.legs.find((item) => item.transit_details)
          if (leg) await a.handlePlanLegFocus(leg)
        } else if (id === 'timeline')
          visible('[data-testid=plan-timeline]')?.scrollIntoView({ block: 'start' })
        else if (id === 'save') s.isExportOpen.value = true
        else if (id === 'saved') {
          if (!demoSaved) {
            demoSaved = a.savePlan('教程练习行程')
            if (!demoSaved) throw new Error(s.saveMessage.value)
          }
          a.selectDockPanel('saved')
        }
        break
      case 'duck-mode':
        s.layerVisibility.value.attractions = true
        a.fitAttractions()
        break
      case 'duck-density':
        await requireDuckShops(signal)
        signal.throwIfAborted()
        await showCell(signal, true)
        break
      case 'duck-shops':
        await requireDuckShops(signal)
        signal.throwIfAborted()
        s.layerVisibility.value.duck = true
        await openDetails('duck')
        a.fitAttractions()
        break
      case 'guide':
        s.layerVisibility.value.attractions = true
        a.fitAttractions()
        await waitFor(() => visible('[data-testid=draggable-duck-guide-duck]'), signal)
        click('[data-testid=draggable-duck-guide-duck]')
        await waitFor(
          () =>
            visible('.draggable-duck-guide-layer__dialog--open') &&
            !visible('.draggable-duck-guide-layer__dialog--open').textContent.includes('正在'),
          signal,
        )
        if (visible('[data-testid=duck-guide-dialog-error]'))
          throw new Error('鸭文化讲解未能载入，请重试。')
        break
      case 'culture':
        a.openDuckCulture()
        await waitFor(
          () =>
            visible('[data-testid=duck-list]') ||
            visible('[data-testid=duck-detail-title]') ||
            visible('[data-testid=duck-list-error]'),
          signal,
        )
        if (visible('[data-testid=duck-list-error]'))
          throw new Error('鸭文化资料未能载入，请重试。')
        break
      default:
        throw new Error('教程步骤不存在。')
    }
    signal.throwIfAborted()
    await nextTick()
    await waitFor(
      () =>
        TUTORIAL_STEPS.find((step) => step.id === id).targets.every((selector) =>
          visible(selector),
        ),
      signal,
    )
    signal.throwIfAborted()
  }
  const preload = createTutorialPreloader(prepareScene)
  prepareScene.preload = async (signal, onStage = () => {}) => {
    // Map failure is global; do not repeat it for all 23 warm-up scenes.
    onStage(0)
    await requireMap(signal)
    return preload(signal, onStage)
  }
  return prepareScene
}
