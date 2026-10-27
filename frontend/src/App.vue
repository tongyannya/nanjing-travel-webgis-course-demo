<script setup>
import { computed, defineAsyncComponent, nextTick, onMounted, ref, watch } from 'vue'

import AppHeader from './components/AppHeader.vue'
import DataSourcesDialog from './components/DataSourcesDialog.vue'
import AttractionDetailPanel from './components/AttractionDetailPanel.vue'
import AccommodationWizard from './components/AccommodationWizard.vue'
import AccommodationAreaPickingBar from './components/AccommodationAreaPickingBar.vue'
import FirstUseHints from './components/FirstUseHints.vue'
import AccommodationAreaHotelsPanel from './components/AccommodationAreaHotelsPanel.vue'
import { useAccommodationHotels, mergeHotelLayers } from './composables/useAccommodationHotels'
import { ACCOMMODATION_AREA_OPTIONS } from './planning/accommodationOptions'
import DiningAreaPanel from './components/DiningAreaPanel.vue'
import { routeMealItems } from './planning/routeMeals'
import { isNanjingLocation } from './planning/diningAreas'
import DiningShopPanel from './components/DiningShopPanel.vue'
import DiningHexPanel from './components/DiningHexPanel.vue'
import DuckCulturePanel from './components/DuckCulturePanel.vue'
import ExportDialog from './components/ExportDialog.vue'
import HotelDetailPanel from './components/HotelDetailPanel.vue'
import InfoDock from './components/InfoDock.vue'
import LayerSidebar from './components/LayerSidebar.vue'
import MapUtilityTools from './components/MapUtilityTools.vue'
import MapWorkspace from './components/MapWorkspace.vue'
import PlanResults from './components/PlanResults.vue'
import PlanningWizard from './components/PlanningWizard.vue'
import PlanningNoticeDialog from './components/PlanningNoticeDialog.vue'
import HoverTooltip from './components/HoverTooltip.vue'
import { usePlanningNotices } from './composables/usePlanningNotices'
import {
  attractionChoiceWarnings,
  countAttractionChoices,
  createDefaultTripForm,
  MAX_ATTRACTION_CHOICES,
  validateTripForm,
} from './planning/tripForm'
import RouteTimeline from './components/RouteTimeline.vue'
import SavedPlansPanel from './components/SavedPlansPanel.vue'
import SplashScreen from './components/SplashScreen.vue'
import TopSearch from './components/TopSearch.vue'
import TripPlannerForm from './components/TripPlannerForm.vue'
import OverviewPanel from './components/OverviewPanel.vue'
import {
  createDefaultAttractionFilter,
  filterAttractions,
  toggleAttractionFilterValue,
} from './attractions/attractionFilters'
import { useBackendStatus } from './composables/useBackendStatus'
import { useAttractionCatalog } from './composables/useAttractionCatalog'
import { useAccommodationFlow } from './composables/useAccommodationFlow'
import { useMapPresentation } from './composables/useMapPresentation'
import { useDiningDensityLayer } from './composables/useDiningDensityLayer'
import { useDuckRestaurantLayer } from './composables/useDuckRestaurantLayer'
import { useHotelLayer } from './composables/useHotelLayer'
import { useDiningAreaInteraction } from './composables/useDiningAreaInteraction'
import { useMapQueries } from './composables/useMapQueries'
import { useMetroLayer } from './composables/useMetroLayer'
import { useTravelMap } from './composables/useTravelMap'
import { useTripPlanning } from './composables/useTripPlanning'
import { usePlanningDebug } from './composables/usePlanningDebug'
import { useUiShell } from './composables/useUiShell'
import { useProjectIntroduction } from './composables/useProjectIntroduction'
import ProjectIntroductionDialog from './components/ProjectIntroductionDialog.vue'
import { useWeather } from './composables/useWeather'
import { DEFAULT_LAYER_VISIBILITY } from './map/layerVisibility'
import { buildDuckGuideRoutePayload } from './planning/duckGuideContent'
import { isTutorialDemoWindow } from './tutorial/demoContext'
import { createTutorialScenes } from './tutorial/tutorialScenes'

const attractions = ref([])
const tutorialDemo = isTutorialDemoWindow()
const {
  enabled: planningDebug,
  open: traceWindowOpen,
  reveal: revealPlanningDebug,
} = usePlanningDebug({ disabled: tutorialDemo })
const PlanningTraceWindow = defineAsyncComponent(
  () => import('./components/PlanningTraceWindow.vue'),
)
const HelpTutorial = defineAsyncComponent(() => import('./components/HelpTutorial.vue'))
const isTutorialOpen = ref(false)
const hasOpenedTutorial = ref(false)
watch(isTutorialOpen, (open) => {
  if (open) hasOpenedTutorial.value = true
})
const isDataSourcesOpen = ref(false)
const layerVisibility = ref({ ...DEFAULT_LAYER_VISIBILITY })
const accommodationAreaPicking = ref(false)
const selectedAccommodationArea = ref(null)
const pickedAccommodationArea = ref(null)
const nearbyHotelRangeSelected = ref(false)
let areaPickingUi = null
const mapAttractionFilter = ref(createDefaultAttractionFilter())
const landmarkIconsVisible = ref(true)
const filteredAttractions = computed(() =>
  filterAttractions(attractions.value, mapAttractionFilter.value),
)
const filteredAttractionCount = computed(() => filteredAttractions.value.length)

const { backendMessage, backendState, backendVersion, checkBackend, statusClass } =
  useBackendStatus()

const {
  activeDockPanel,
  closeWizard,
  collapseRail,
  finishSplash,
  isDockOpen,
  isDuckMode,
  isExportOpen,
  isMapFull,
  isRailOpen,
  isSplashVisible,
  isWizardOpen,
  openWizard,
  railMode,
  selectDockPanel,
  setDuckMode,
  shellClasses,
  toggleDock,
  toggleDuckMode,
  toggleMapFull,
  toggleRail,
} = useUiShell()

const {
  dialogMode,
  hasDiscoveredAuthor,
  openIntroduction,
  openAuthorLetters,
  closeIntroduction,
  recordLandmarkClick,
} = useProjectIntroduction(isSplashVisible)

async function openIntroductionTutorial(dismiss) {
  closeIntroduction(dismiss)
  await nextTick()
  isTutorialOpen.value = true
}

// Keep the current day visible while browsing map place details.
const routeDetailPanels = new Set([
  'attraction',
  'hotel',
  'metro',
  'diningArea',
  'diningHex',
  'diningShop',
])
const dayRouteContext = ref(false)
watch(activeDockPanel, (panel) => {
  if (panel === 'day') dayRouteContext.value = true
  else if (!routeDetailPanels.has(panel)) dayRouteContext.value = false
})
const showPlanTimeline = computed(
  () =>
    !accommodationAreaPicking.value &&
    Boolean(activeDay.value) &&
    (dayRouteContext.value || activeDockPanel.value === 'diningArea'),
)
const timelineHeight = ref(98)

// 高德 setFitView 需要为覆盖在地图上的顶栏、左右栏和时间轴预留空间，
// 否则“数学上完整”的路线仍会被界面面板遮住。
const mapViewportPadding = computed(() => {
  if (isMapFull.value) return [70, 70, 90, 70]
  const left = isRailOpen.value ? (railMode.value === 'collapsed' ? 100 : 287) : 70
  const right = isDockOpen.value ? 426 : 70
  const bottom = showPlanTimeline.value ? Math.max(136, timelineHeight.value + 38) : 90
  return [80, right, bottom, left]
})

const {
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
  formReady,
  initializeForm,
  importPlanFile,
  loadingPlanType,
  openSavedPlan,
  openHistoryPlan,
  planMessage,
  planProgress,
  planResponse,
  planState,
  planningTrace,
  saveMessage,
  savePlan,
  savedPlans,
  renameSavedPlan,
  restoreActivePlanForm,
  selectDay,
  selectPlan,
  submitPlan,
  tripForm,
} = useTripPlanning(attractions)

const pendingPlanningMode = ref('')
const wizardRevision = ref(0)
const plannerRevision = ref(0)
const wizardFromFullForm = ref(false)
let fullFormEdited = false
let fullFormFromWizard = false
const headerPlanningLabel = computed(() =>
  activePlan.value || pendingPlanningMode.value ? '重新规划' : '开始规划',
)
const overviewPlanningLabel = computed(() =>
  pendingPlanningMode.value ? '继续规划' : activePlan.value ? '修改当前计划' : '开始规划',
)
watch(
  () => JSON.stringify(tripForm.value),
  (value, previous) => {
    if (
      value !== previous &&
      activeDockPanel.value === 'planner' &&
      !isWizardOpen.value &&
      planState.value !== 'loading'
    )
      pendingPlanningMode.value = 'full'
  },
)

const duckGuidePayload = computed(() =>
  buildDuckGuideRoutePayload(activePlan.value, activeDayIndex.value),
)

const { catalogMessage, loadAttractions } = useAttractionCatalog({
  attractions,
  initializeForm,
})

const selectedDiningHex = ref(null)
const {
  onlyCurrentDining,
  totalDuckRestaurantCount,
  totalDuckFlavorCount: duckFlavorCount,
  duckRestaurantCount,
  duckRestaurantMessage,
  duckRestaurants,
  duckRestaurantState,
  loadDuckRestaurants,
  retryDuckRestaurants,
  selectedDuckTypes,
  includeDuckTakeaway,
  duckTypeCounts,
  toggleDuckType,
  resetDuckFilters,
} = useDuckRestaurantLayer(undefined, selectedDiningHex)
const {
  loadWeather,
  retryWeather,
  weatherData,
  weatherDate,
  weatherDates,
  weatherForecast,
  weatherMessage,
  weatherState,
} = useWeather({ activeDay, activePlan })

watch(weatherDate, (newDate, oldDate) => {
  // First resolve happens after the form initializes; avoid a duplicate fetch.
  if (oldDate === undefined) return
  if (weatherState.value === 'idle' || weatherState.value === 'error') loadWeather()
})

const defaultSaveName = computed(() =>
  tripForm.value.startDate ? `南京行程 ${tripForm.value.startDate}` : '南京行程方案',
)

function handleSavePlan(name, options) {
  if (savePlan(name, options)) isExportOpen.value = false
}
watch([activeDockPanel, isDockOpen], ([panel, open], [previousPanel, previousOpen]) => {
  if (previousPanel === 'saved' && previousOpen && (panel !== 'saved' || !open)) {
    saveMessage.value = ''
  }
})

async function handleOpenSavedPlan(id) {
  if (!(await confirmLeavingAccommodationSelection())) return
  if (openSavedPlan(id)) {
    pendingPlanningMode.value = ''
    wizardRevision.value += 1
    selectDockPanel('plans')
  }
}
async function handleOpenHistoryPlan(id) {
  if (!(await confirmLeavingAccommodationSelection())) return
  if (openHistoryPlan(id)) {
    pendingPlanningMode.value = ''
    wizardRevision.value += 1
    selectDockPanel('plans')
  }
}
async function handleImportPlan(file) {
  if (!(await confirmLeavingAccommodationSelection())) return
  if (await importPlanFile(file)) {
    pendingPlanningMode.value = ''
    wizardRevision.value += 1
    selectDockPanel('plans')
  }
}

function handleRenameSavedPlan({ id, name }) {
  renameSavedPlan(id, name)
}

const {
  loadRestaurants,
  loadRouteRestaurants,
  mapRestaurantCount,
  mapRestaurants,
  mealAreaCount,
  restaurantMessage,
  restaurantResponseNote,
  restaurants,
  restaurantState,
  retryRestaurants,
  selectDiningDensityArea,
  selectDiningSnapshotCell,
  selectMealArea,
  selectNearbyDiningArea,
  selectRestaurant,
  selectedAreaState,
  selectedAreaKind,
  selectedDiningArea,
  selectedMealItem,
  selectedOverviewArea,
  selectedRestaurant,
  validMealAreaItems,
} = useDiningAreaInteraction({ activeDay, activePlanType, planResponse })

const {
  areaCount: diningDensityCount,
  areas: diningDensityAreas,
  cuisineShops,
  snapshotIndex,
  duckAreas: duckDensityAreas,
  cancelLoad: cancelDiningSnapshotLoad,
  dataMessage: diningDensityMessage,
  dataNote: diningDensityNote,
  dataState: diningDensityState,
  loadAreas: loadDiningDensityAreas,
  retryAreas: retryDiningDensityAreas,
} = useDiningDensityLayer()
const selectedLocalShop = ref(null)
const localShopReturnPanel = ref('overview')
const diningHexReturnPanel = ref('overview')
const activeHexTab = ref('ordinary')
const selectedHexShopId = ref('')
const hexDuckShops = computed(
  () => snapshotIndex.value?.getDuckShopsForCell(selectedDiningHex.value?.id) || [],
)
const selectedMapRestaurant = ref(null)
watch(
  activeDay,
  (day, previous) => {
    if (day === previous) return
    selectedDiningHex.value = null
    selectedLocalShop.value = null
    selectedMapRestaurant.value = null
    selectedHexShopId.value = ''
    if (['diningHex', 'diningShop', 'diningArea'].includes(activeDockPanel.value))
      selectDockPanel(day ? 'day' : 'overview')
  },
  { flush: 'sync' },
)
const duckCultureNavigation = ref(null)
function openDuckCulture(duckType = null) {
  duckCultureNavigation.value = { duckType }
  selectDockPanel('duckCulture')
}
function openDuckCultureArticle(articleId) {
  duckCultureNavigation.value = { articleId }
  selectDockPanel('duckCulture')
}
const selectedQueryLocalShop = computed(
  () => snapshotIndex.value?.getShop(selectedRestaurant.value?.poi_id) || null,
)

const {
  dataMessage: metroMessage,
  dataState: metroState,
  lineCount: metroLineCount,
  lines: metroLines,
  loadMetroNetwork,
  retryMetroNetwork,
  stations: metroStations,
  verifiedAt: metroVerifiedAt,
} = useMetroLayer()

const selectedMetroStation = ref(null)
const selectedAttraction = ref(null)
const selectedHotel = ref(null)

function handleMetroStationSelect(station) {
  if (!station) return
  handlePickingCandidateFromStation(station)
  selectedMetroStation.value = station
  selectDockPanel('metro')
}

function handleAttractionSelect(attraction) {
  selectedAttraction.value = attraction
  selectDockPanel('attraction')
}

function handleHotelSelect(hotel) {
  selectedHotel.value = hotel
  if (hotel.markerSource === 'area') {
    selectedAccommodationArea.value =
      ACCOMMODATION_AREA_OPTIONS.find((area) => areaHotels.activeAreaIds.value.includes(area.id)) ||
      null
    nearbyHotelRangeSelected.value = false
    selectDockPanel('hotelArea')
  } else if (hotel.markerSource === 'nearby') {
    selectedAccommodationArea.value = null
    nearbyHotelRangeSelected.value = true
    selectDockPanel('hotelArea')
  } else selectDockPanel('hotel')
}

function handleSearchResultDetails({ kind, item }) {
  if (kind === 'hotel') handleHotelSelect(item)
  else if (kind === 'metro') handleMetroStationSelect(item)
  else if (kind === 'restaurant') handleRestaurantSelect(item)
  else if (kind === 'attraction') handleAttractionSelect(item)
}

function handleSearchMarkerSelect(poi) {
  selectedSearchResult.value = poi
}

function findHotelsAroundAttraction() {
  const attraction = selectedAttraction.value
  if (!attraction?.location) return
  layerVisibility.value.hotels = true
  layerVisibility.value.nearbyHotels = true
  queryHotels({
    longitude: attraction.location.longitude,
    latitude: attraction.location.latitude,
    centerLabel: attraction.name,
  })
}

async function findRestaurantsAroundAttraction() {
  const attraction = selectedAttraction.value
  if (!attraction?.location) return
  layerVisibility.value.dining = true
  layerVisibility.value.nearbyDining = true
  selectedLocalShop.value = null
  if (
    !selectNearbyDiningArea({
      centerLabel: attraction.name,
      location: attraction.location,
      returnPanel: 'attraction',
    })
  )
    return
  selectDockPanel('diningArea')
  await loadRestaurants({ force: true })
}

async function handleLocationResolved({ centerLabel, location }) {
  layerVisibility.value.dining = true
  layerVisibility.value.nearbyDining = true
  selectedLocalShop.value = null
  if (!selectNearbyDiningArea({ centerLabel, location, returnPanel: 'overview' })) return
  await loadRestaurants({ force: true })
}

const currentLodging = computed(() =>
  tripForm.value.accommodationConfirmed ? tripForm.value.lodging : null,
)

const {
  hotels,
  hotelCount,
  hotelMessage,
  hotelQuery,
  hotelState,
  queryHotels,
  refreshHotels,
  cancelQuery,
} = useHotelLayer({
  getQueryCenter: () => ({
    longitude: selectedLocation.value.longitude,
    latitude: selectedLocation.value.latitude,
    centerLabel: selectedLocationLabel.value,
  }),
})

const areaHotels = useAccommodationHotels()
const nearbyHotelsVisible = computed(
  () => layerVisibility.value.hotels && layerVisibility.value.nearbyHotels,
)
const normalAccommodationAreasVisible = computed(
  () => layerVisibility.value.hotels && layerVisibility.value.accommodationAreas,
)
const accommodationAreasVisible = computed(
  () => accommodationAreaPicking.value || normalAccommodationAreasVisible.value,
)
const visibleHotels = computed(() =>
  mergeHotelLayers(
    nearbyHotelsVisible.value ? hotels.value : [],
    normalAccommodationAreasVisible.value ? areaHotels.activeHotels.value : [],
  ),
)
const hotelPanelResult = computed(() =>
  selectedAccommodationArea.value
    ? areaHotels.cache.value[selectedAccommodationArea.value.id]
    : {
        hotels: hotels.value,
        query: hotelQuery.value,
        state: hotelState.value,
        message: hotelMessage.value,
      },
)
const selectedHotelQuery = computed(() => {
  if (selectedHotel.value?.markerSource !== 'area') return hotelQuery.value
  const id = selectedHotel.value.poi_id
  const current =
    selectedAccommodationArea.value && areaHotels.cache.value[selectedAccommodationArea.value.id]
  if (current?.hotels.some((hotel) => hotel.poi_id === id)) return current.query
  return (
    Object.values(areaHotels.cache.value).find((entry) =>
      entry.hotels.some((hotel) => hotel.poi_id === id),
    )?.query || null
  )
})

watch(nearbyHotelsVisible, (visible) => {
  if (!visible) {
    cancelQuery()
    return
  }
  if (hotelState.value !== 'loading') void queryHotels(null, { replace: true })
})
watch(normalAccommodationAreasVisible, (visible) => {
  if (visible) void areaHotels.preload()
  else {
    areaHotels.activeAreaIds.value = []
    selectedAccommodationArea.value = null
    if (selectedHotel.value?.markerSource === 'area') {
      selectedHotel.value = null
      clearHotelSelection()
    }
  }
})
watch(hotelQuery, () => {
  nearbyHotelRangeSelected.value = false
})

function refreshNearbyHotels() {
  layerVisibility.value.hotels = true
  layerVisibility.value.nearbyHotels = true
  void refreshHotels()
}

function handleNearbyHotelRangeSelect() {
  selectedHotel.value = null
  clearHotelSelection()
  selectedAccommodationArea.value = null
  nearbyHotelRangeSelected.value = true
  selectDockPanel('hotelArea')
  fitNearbyHotelRange()
}

function beginAccommodationAreaPicking({ resume = false } = {}) {
  areaPickingUi = {
    dockOpen: isDockOpen.value,
    panel: activeDockPanel.value,
    landmarkIcons: landmarkIconsVisible.value,
  }
  landmarkIconsVisible.value = false
  isDockOpen.value = false
  if (!resume)
    pickedAccommodationArea.value =
      ACCOMMODATION_AREA_OPTIONS.find(
        (area) => area.id === accommodation.accommodationDraft.value?.areaId,
      ) || null
  nextTick(fitAccommodationAreas)
}

function endAccommodationAreaPicking() {
  if (!areaPickingUi) return
  activeDockPanel.value = areaPickingUi.panel
  isDockOpen.value = areaPickingUi.dockOpen
  landmarkIconsVisible.value = areaPickingUi.landmarkIcons
  areaPickingUi = null
}

function handleAccommodationAreaSelect(area) {
  if (accommodationAreaPicking.value) {
    pickedAccommodationArea.value = area
    layerVisibility.value.hotels = true
    layerVisibility.value.accommodationAreas = true
    if (!areaHotels.activeAreaIds.value.includes(area.id)) areaHotels.toggleArea(area.id)
    else void areaHotels.loadArea(area.id)
    selectedAccommodationArea.value = area
    selectedHotel.value = null
    clearHotelSelection()
    nearbyHotelRangeSelected.value = false
    selectDockPanel('hotelArea')
    fitAccommodationArea(area)
    return
  }
  const shown = areaHotels.toggleArea(area.id)
  selectedHotel.value = null
  clearHotelSelection()
  nearbyHotelRangeSelected.value = false
  selectedAccommodationArea.value = shown
    ? area
    : ACCOMMODATION_AREA_OPTIONS.find((candidate) =>
        areaHotels.activeAreaIds.value.includes(candidate.id),
      ) || null
  if (shown) fitAccommodationArea(area)
  if (selectedAccommodationArea.value || hotelQuery.value) selectDockPanel('hotelArea')
  else if (activeDockPanel.value === 'hotelArea') selectDockPanel('overview')
}

function confirmAccommodationArea() {
  if (pickedAccommodationArea.value) handleAccommodationPickArea(pickedAccommodationArea.value.id)
}

function retryAccommodationAreaHotels() {
  if (selectedAccommodationArea.value)
    void areaHotels.loadArea(selectedAccommodationArea.value.id, { force: true })
  else refreshNearbyHotels()
}

function handleAreaHotelSelect(hotel) {
  const item = visibleHotels.value.find((candidate) => candidate.poi_id === hotel.poi_id) || hotel
  selectedHotel.value = item
  showHotelInfo(item, { scope: selectedAccommodationArea.value ? 'area' : 'nearby' })
  selectDockPanel('hotelArea')
}

watch(selectedHotel, (hotel) => {
  if (!hotel) clearHotelSelection()
})

async function handleToggleLayer(layerId) {
  if (
    layerId === 'route' &&
    !layerVisibility.value.route &&
    !(await confirmLeavingAccommodationSelection())
  )
    return
  if (
    ['accommodationAreas', 'hotels'].includes(layerId) &&
    selectedHotel.value?.markerSource === 'area'
  ) {
    selectedHotel.value = null
  }
  if (['accommodationAreas', 'nearbyHotels'].includes(layerId)) {
    const enabled = layerVisibility.value.hotels && layerVisibility.value[layerId]
    if (!enabled && !layerVisibility.value.hotels) {
      layerVisibility.value.nearbyHotels = false
      layerVisibility.value.accommodationAreas = false
    }
    layerVisibility.value[layerId] = !enabled
    if (!enabled) layerVisibility.value.hotels = true
    return
  }
  toggleLayer(layerId)
}

const {
  diningAreaOverlayCount,
  diningDensityOverlayCount,
  duckDensityOverlayCount,
  focusDuckDensityArea,
  duckRestaurantMarkerCount,
  fitAttractions,
  fitAccommodationAreas,
  getAccommodationGuideRects,
  fitAccommodationArea,
  fitNearbyHotelRange,
  mapFocusInProgress,
  fitPlanOverview,
  focusAttraction,
  focusCurrentLodging,
  focusDiningArea,
  focusDiningDensityArea,
  focusLocation,
  focusedPlanLegGeometry,
  expandedPlanLegIds,
  allPlanLegsExpanded,
  toggleAllPlanLegs,
  focusedPlanLegId,
  focusedPlanLegSegmentCount,
  focusPlanItem,
  focusPlanLeg,
  initializeMap,
  locateMessage,
  locateState,
  mapContainer,
  mapMessage,
  mapState,
  metroPolylineCount,
  metroStationCount,
  requestLocation,
  restaurantMarkerCount,
  selectedCoordinateText,
  selectedLocation,
  selectedLocationLabel,
  selectedLocationSource,
  setHotelMarkers,
  setSearchMarkers,
  selectSearchResultOnMap,
  showRestaurantInfo,
  showHotelInfo,
  clearHotelSelection,
} = useTravelMap({
  attractions,
  activeDay,
  activeDayIndex,
  activePlan,
  activeTripRequest,
  attractionLayerVisible: computed(() => layerVisibility.value.attractions),
  duckGuideVisible: computed(() => isDuckMode.value && !accommodationAreaPicking.value),
  duckGuidePayload,
  hotelLayerVisible: computed(() => layerVisibility.value.hotels),
  hotelQuery,
  nearbyHotelLayerVisible: nearbyHotelsVisible,
  nearbyHotelRangeSelected,
  onHotelQuerySelect: handleNearbyHotelRangeSelect,
  accommodationAreasVisible,
  activeAccommodationAreaIds: areaHotels.activeAreaIds,
  accommodationAreaPicking,
  selectedAccommodationArea: computed(() =>
    accommodationAreaPicking.value
      ? pickedAccommodationArea.value
      : selectedAccommodationArea.value,
  ),
  onAccommodationAreaSelect: handleAccommodationAreaSelect,
  diningAreaLayerVisible: computed(() => layerVisibility.value.mealAreas),
  duckRestaurantLayerVisible: computed(() => isDuckMode.value && layerVisibility.value.duck),
  duckRestaurants,
  selectedDuckTypes,
  duckDensityAreas,
  selectedDiningHex,
  duckDensityLayerVisible: computed(() => isDuckMode.value && layerVisibility.value.duckDensity),
  onDuckDensityAreaSelect: (cell) => handleDiningHexSelect(cell, 'duck'),
  onDuckRestaurantSelect: handleDuckShopSelect,
  onDuckCultureSelect: openDuckCulture,
  onDuckGuideArticleSelect: openDuckCultureArticle,
  diningDensityAreas,
  cuisineShops,
  cuisineLayerVisible: computed(() => layerVisibility.value.nanjingCuisine),
  nearbyDiningLayerVisible: computed(() => layerVisibility.value.nearbyDining),
  diningDensityLayerVisible: computed(() => layerVisibility.value.diningDensity),
  mapAttractionFilter,
  mapViewportPadding,
  tripForm,
  loadAttractions,
  metroLines,
  metroLayerVisible: computed(() => layerVisibility.value.metro),
  metroStations,
  onAttractionSelect: handleAttractionSelect,
  onAttractionMarkerClick: (attraction) => recordLandmarkClick(attraction.id),
  onHotelSelect: handleHotelSelect,
  onMapClick: () => {
    selectedHotel.value = null
  },
  getRestaurantFocusArea: (item) => {
    const cell = selectedDiningHex.value
    return cell &&
      isNanjingLocation(item?.location) &&
      snapshotIndex.value?.findCell(item.location)?.id === cell.id
      ? { cell }
      : null
  },
  onDiningAreaSelect: (item) => handlePlanItemFocus(item),
  onDiningDensityAreaSelect: (item) => handleDiningHexSelect(item, 'ordinary'),
  onLocationResolved: handleLocationResolved,
  onMetroStationSelect: handleMetroStationSelect,
  onRestaurantSelect: (item) => handleRestaurantSelect(item),
  onSearchResultDetails: handleSearchResultDetails,
  onSearchResultSelect: handleSearchMarkerSelect,
  restaurantLayerVisible: computed(() => layerVisibility.value.dining),
  restaurants: mapRestaurants,
  routeLayerVisible: computed(() => layerVisibility.value.route),
  searchLayerVisible: computed(() => layerVisibility.value.search),
  currentLodging,
  currentLodgingLayerVisible: computed(() => layerVisibility.value.currentLodging),
  selectedMealItem,
  selectedMetroStation,
  selectedOverviewArea,
  selectedRestaurant: selectedMapRestaurant,
  validMealAreaItems,
})

const {
  densityMessage,
  densityRadius,
  densityResult,
  densityState,
  destinationId,
  originId,
  runDensity,
  runSearch,
  runTravelTime,
  searchAroundSelected,
  searchCategory,
  searchKeyword,
  searchMessage,
  searchResults,
  searchState,
  selectedSearchResult,
  selectSearchResult,
  travelMessage,
  travelMode,
  travelResult,
  travelState,
} = useMapQueries({
  attractions,
  duckRestaurants,
  focusLocation,
  hotels: visibleHotels,
  metroStations,
  restaurants: mapRestaurants,
  selectSearchResultOnMap,
  selectedLocation,
  selectedLocationLabel,
  setSearchMarkers,
})

const {
  accommodation,
  accommodationWizardOpen,
  topSearchRef,
  lodgingName,
  pickingSession,
  continueAccommodationWizard,
  leaveMapAccommodationSelection,
  hasPendingAccommodation,
  isMapAccommodationSelection,
  closeAccommodationWizard,
  openAccommodationWizard,
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
} = useAccommodationFlow({
  tripForm,
  areaPicking: accommodationAreaPicking,
  onAreaPickingStarted: beginAccommodationAreaPicking,
  onAreaPickingEnded: endAccommodationAreaPicking,
  onCommitted: handleAccommodationChanged,
  layerVisibility,
  searchCategory,
  selectSearchResult,
  selectedLocation,
  selectedLocationLabel,
  selectedLocationSource,
})

const {
  activeDuckNodeCount,
  duckLayerAllowed,
  fitMapOverview,
  toggleLayer,
  resetLayers: resetMapLayers,
  handlePlanItemFocus: presentPlanItemFocus,
  handleRestaurantSelect: presentRestaurantSelect,
} = useMapPresentation({
  layerVisibility,
  mapViewportPadding,
  planning: { activeDay, activePlan, planResponse, planState },
  ui: {
    isDuckMode,
    setDuckMode,
    toggleDuckMode,
    selectDockPanel,
    activeDockPanel,
    accommodationAreaPicking,
  },
  map: {
    fitPlanOverview,
    fitAttractions,
    fitAccommodationAreas,
    mapFocusInProgress,
    focusPlanItem,
    focusDiningArea,
    focusDiningDensityArea,
    setHotelMarkers,
  },
  dining: {
    selectMealArea,
    selectDiningDensityArea,
    selectRestaurant,
    loadRestaurants,
    loadRouteRestaurants,
    selectedLocalShop,
    localShopReturnPanel,
  },
  layers: {
    duckRestaurantState,
    loadDuckRestaurants,
    diningDensityState,
    loadDiningDensityAreas,
    cancelDiningSnapshotLoad,
    metroState,
    loadMetroNetwork,
  },
  hotel: { hotels: visibleHotels, hotelQuery, selectedHotel },
})

function resetLayers() {
  resetDuckFilters()
  resetMapLayers()
}

async function handleDiningHexSelect(area, tab = 'ordinary') {
  diningHexReturnPanel.value = 'overview'
  const cell = snapshotIndex.value?.getCell(area.id)
  if (!cell || (tab === 'duck' && !isDuckMode.value)) return
  selectedDiningHex.value = cell
  selectedLocalShop.value = null
  selectedHexShopId.value = ''
  activeHexTab.value = tab
  if (isDuckMode.value) layerVisibility.value.duck = true
  if (tab === 'duck') onlyCurrentDining.value = true
  if (tab === 'duck') focusDuckDensityArea(cell)
  else focusDiningDensityArea(area)
  selectDockPanel('diningHex')
  if (tab === 'ordinary') await handleHexTabSelect('ordinary')
}

async function handlePlanMealFocus(meal) {
  const item = routeMealItems(activeDay.value).find((value) => value.route_meal === meal)
  if (!item) return
  if (!snapshotIndex.value) await loadDiningDensityAreas()
  if (!snapshotIndex.value) return
  if (meal.area_kind === 'duck') {
    setDuckMode(true)
    includeDuckTakeaway.value = false
  }
  layerVisibility.value.mealAreas = true
  focusDiningArea(item)
  await handleDiningHexSelect(meal.area, meal.area_kind === 'duck' ? 'duck' : 'ordinary')
  diningHexReturnPanel.value = 'day'
}

function handlePlanItemFocus(item) {
  if (item?.type === 'route_meal') return handlePlanMealFocus(item.route_meal)
  return presentPlanItemFocus(item)
}

async function handleHexTabSelect(tab) {
  if (!selectedDiningHex.value || (tab === 'duck' && !isDuckMode.value)) return
  activeHexTab.value = tab
  if (tab === 'duck') return
  selectedLocalShop.value = null
  selectDiningSnapshotCell(selectedDiningHex.value)
  layerVisibility.value.dining = true
  layerVisibility.value.nearbyDining = true
  await loadRestaurants()
}

function handleDuckShopSelect(shop) {
  if (!isDuckMode.value) return
  localShopReturnPanel.value =
    activeDockPanel.value === 'diningShop' ? localShopReturnPanel.value : activeDockPanel.value
  selectedLocalShop.value = enrichLocalShop(shop)
  selectedMapRestaurant.value = selectedLocalShop.value
  selectedHexShopId.value = shop.poi_id
  if (selectedDiningHex.value?.id === shop.display_hex_id) {
    activeHexTab.value = 'duck'
    localShopReturnPanel.value = 'diningHex'
  }
  selectDockPanel('diningShop')
}

function enrichLocalShop(shop) {
  return { ...snapshotIndex.value?.getOrdinaryShop(shop.poi_id), ...shop }
}

function handleRestaurantSelect(restaurant) {
  const previousSelection = selectedMapRestaurant.value
  presentRestaurantSelect(
    restaurant?.local_shop
      ? { ...restaurant, local_shop: enrichLocalShop(restaurant.local_shop) }
      : restaurant,
  )
  selectedMapRestaurant.value = selectedLocalShop.value || selectedRestaurant.value || restaurant
  selectedHexShopId.value = restaurant.poi_id
  if (
    activeDockPanel.value === 'diningArea' &&
    selectedAreaKind.value === 'overview' &&
    selectedOverviewArea.value?.id === selectedDiningHex.value?.id
  ) {
    activeHexTab.value = 'ordinary'
    selectDockPanel('diningHex')
  }
  if (selectedMapRestaurant.value === previousSelection) {
    showRestaurantInfo(selectedMapRestaurant.value)
  }
}

watch(isDuckMode, (enabled) => {
  if (enabled) {
    if (selectedDiningHex.value && hexDuckShops.value.length) {
      layerVisibility.value.duck = true
      onlyCurrentDining.value = true
      activeHexTab.value = 'duck'
    }
    return
  }
  const duckDetail = selectedLocalShop.value?.collection === 'duck'
  if (duckDetail) selectedLocalShop.value = null
  selectedHexShopId.value = ''
  if (activeHexTab.value === 'duck') {
    selectedDiningHex.value = null
    activeHexTab.value = 'ordinary'
    if (activeDockPanel.value === 'diningHex' || duckDetail) selectDockPanel('overview')
  } else if (duckDetail) selectDockPanel('overview')
})

async function handleSearch() {
  layerVisibility.value.search = true
  await runSearch()
}

function toggleMapFilter({ field, value }) {
  mapAttractionFilter.value = toggleAttractionFilterValue(mapAttractionFilter.value, field, value)
}

function updateMapFilterKeyword(keyword) {
  mapAttractionFilter.value = { ...mapAttractionFilter.value, keyword }
}

function resetMapFilters() {
  mapAttractionFilter.value = createDefaultAttractionFilter()
}

async function handleFilteredAttractionSelect(attraction) {
  layerVisibility.value.attractions = true
  await nextTick()
  focusAttraction(attraction)
}

function retryConnection() {
  return Promise.allSettled([
    checkBackend(),
    loadAttractions(),
    mapState.value === 'error' ? initializeMap() : Promise.resolve(),
    metroState.value === 'error' ? loadMetroNetwork() : Promise.resolve(),
  ])
}

async function handleSubmitPlan() {
  if (!(await confirmLeavingAccommodationSelection())) return
  if (!(await confirmGeneration())) return
  selectDockPanel('plans')
  await submitPlan(tripForm.value.preferredPlanType)
  if (planState.value === 'success') pendingPlanningMode.value = ''
  if (planState.value === 'success' || planState.value === 'error') selectDockPanel('plans')
}

async function handleAccommodationChanged({ changed, continuePlanning }) {
  if (continuePlanning) {
    wizardFromFullForm.value = false
    wizardRevision.value += 1
    pendingPlanningMode.value = ''
    await nextTick()
    openWizard()
    return
  }
  if (!changed || !activePlan.value || planState.value === 'loading') return
  const type = activePlanType.value
  const regenerate = await showPlanningNotice(
    '住宿安排已修改，重新制定方案后才会应用到路线。是否立刻重新生成当前方案？',
    true,
    { title: '重新生成方案？', backLabel: '暂不生成', continueLabel: '立刻重新生成' },
  )
  if (!regenerate || !(await confirmGeneration())) return
  selectDockPanel('plans')
  await submitPlan(type)
  if (planState.value === 'success') pendingPlanningMode.value = ''
}

async function handleWizardSubmit(preferredPlan) {
  if (!(await confirmLeavingAccommodationSelection())) return
  if (!(await confirmGeneration())) return
  closeWizard()
  selectDockPanel('plans')
  await submitPlan(preferredPlan)
  if (planState.value === 'success') pendingPlanningMode.value = ''
}
async function handlePlanSelection(type) {
  if (!(await confirmLeavingAccommodationSelection())) return
  const selected = await selectPlan(type)
  if (selected) {
    if (type === 'duck') setDuckMode(true)
    selectDockPanel('day')
  }
}

function handleDockBack() {
  if (activeDockPanel.value === 'diningShop') {
    selectDockPanel(localShopReturnPanel.value || 'overview')
    return
  }
  if (dayRouteContext.value && routeDetailPanels.has(activeDockPanel.value)) {
    selectDockPanel('day')
    return
  }
  if (activeDockPanel.value === 'diningHex') {
    selectDockPanel(diningHexReturnPanel.value)
    return
  }
  if (activeDockPanel.value === 'day') selectDockPanel('plans')
  else if (activeDockPanel.value === 'diningArea') {
    if (selectedAreaKind.value === 'overview') selectDockPanel('overview')
    else if (selectedAreaKind.value === 'nearby')
      selectDockPanel(selectedDiningArea.value?.return_panel || 'overview')
    else selectDockPanel('day')
  } else selectDockPanel('overview')
}

async function openFullPlanner() {
  if (!(await confirmLeavingAccommodationSelection())) return
  fullFormFromWizard = isWizardOpen.value
  fullFormEdited = false
  closeWizard()
  selectDockPanel('planner')
}

async function openCurrentPlanEditor() {
  if (!(await confirmLeavingAccommodationSelection())) return
  restoreActivePlanForm()
  plannerRevision.value += 1
  fullFormFromWizard = false
  fullFormEdited = false
  closeWizard()
  selectDockPanel('planner')
}

function handleCurrentLodgingFocus() {
  if (!currentLodging.value) return
  layerVisibility.value.search = true
  layerVisibility.value.currentLodging = true
  focusCurrentLodging()
}

// 快速问卷入口：住宿未确认时先引导住宿，不打开规划问卷。
async function confirmLeavingAccommodationSelection() {
  if (!isMapAccommodationSelection.value) {
    if (accommodationWizardOpen.value || pickingSession.value) closeAccommodationWizard()
    return true
  }
  if (planningNotice.value) return false
  const exit = await showPlanningNotice('正在选择住宿相关地点，是否退出本次选择？', true, {
    title: '退出住宿选择？',
    backLabel: '继续选择住宿',
    continueLabel: '退出住宿选择',
  })
  if (!exit) return false
  leaveMapAccommodationSelection()
  return true
}

async function handleAccommodationEntrance(event) {
  if (!(await confirmLeavingAccommodationSelection())) return
  continueAccommodationWizard(event)
}

async function handleDockPanelSelection(panel) {
  if (
    (panel === 'planner' || (activeDay.value && ['plans', 'day'].includes(panel))) &&
    !(await confirmLeavingAccommodationSelection())
  )
    return
  if (panel === 'planner') return openFullPlanner()
  selectDockPanel(panel)
}

async function handleDaySelection(index) {
  if (await confirmLeavingAccommodationSelection()) selectDay(index)
}

async function handlePlanLegFocus(leg) {
  if (await confirmLeavingAccommodationSelection()) await focusPlanLeg(leg)
}

async function handleAllPlanLegs() {
  if (await confirmLeavingAccommodationSelection()) await toggleAllPlanLegs()
}

async function canOpenPlanning(event) {
  if (!(await confirmLeavingAccommodationSelection())) return false
  if (!formReady.value) {
    planMessage.value = catalogMessage.value || '正式景点正在加载，请稍候。'
    selectDockPanel('plans')
    return false
  }
  return guardPlanningBeforeAccommodation(event)
}

async function openWizardGuarded(event) {
  if (!(await canOpenPlanning(event))) return
  const previous = tripForm.value
  tripForm.value = {
    ...createDefaultTripForm(attractions.value),
    lodging: JSON.parse(JSON.stringify(previous.lodging)),
    accommodationConfirmed: previous.accommodationConfirmed,
    accommodationAreaId: previous.accommodationAreaId,
  }
  fullFormFromWizard = false
  wizardFromFullForm.value = false
  wizardRevision.value += 1
  plannerRevision.value += 1
  pendingPlanningMode.value = ''
  openWizard()
}

async function openQuestionnaireFromForm(event) {
  if (!(await canOpenPlanning(event))) return
  const unchanged = fullFormFromWizard && !fullFormEdited
  if (!unchanged) {
    wizardFromFullForm.value = true
    wizardRevision.value += 1
  }
  fullFormFromWizard = false
  pendingPlanningMode.value = ''
  openWizard()
}

async function openOverviewPlanning(event) {
  if (!(await canOpenPlanning(event))) return
  if (pendingPlanningMode.value === 'full' || (!pendingPlanningMode.value && activePlan.value))
    openFullPlanner()
  else openWizard()
}

function setAttractionPreference(state) {
  if (!selectedAttraction.value) return
  const id = selectedAttraction.value.id
  if (
    tripForm.value.attractionChoices[id] !== state &&
    countAttractionChoices(tripForm.value.attractionChoices)[state] >= MAX_ATTRACTION_CHOICES
  ) {
    void showPlanningNotice(
      `${state === 'must' ? '必须去' : '排除'}景点最多只能设置20个，请先取消一个已有选择。`,
    )
    return
  }
  tripForm.value.attractionChoices[id] =
    tripForm.value.attractionChoices[id] === state ? 'none' : state
}

const { planningNotice, showPlanningNotice, closePlanningNotice } = usePlanningNotices()

async function confirmGeneration() {
  if (validateTripForm(tripForm.value).length) return true
  const warnings = attractionChoiceWarnings(
    tripForm.value.attractionChoices,
    tripForm.value.days.length,
    attractions.value,
  )
  return !warnings.length || (await showPlanningNotice(warnings, true))
}

const prepareTutorialScene = tutorialDemo
  ? createTutorialScenes({
      state: {
        attractions,
        mapState,
        hotelState,
        hotelMessage,
        metroState,
        metroMessage,
        duckRestaurantState,
        duckRestaurantMessage,
        diningDensityState,
        diningDensityMessage,
        searchState,
        searchKeyword,
        searchCategory,
        layerVisibility,
        isDockOpen,
        isMapFull,
        railMode,
        isExportOpen,
        accommodationAreaPicking,
        pickingSession,
        onlyCurrentDining,
        includeDuckTakeaway,
        diningDensityAreas,
        savedPlans,
        saveMessage,
        activeDay,
      },
      actions: {
        closeWizard,
        leaveMapAccommodationSelection,
        closeAccommodationWizard,
        openAccommodationWizard,
        clearPlan,
        selectDockPanel,
        setDuckMode,
        fitAttractions,
        focusLocation,
        fitPlanOverview,
        queryHotels,
        loadMetroNetwork,
        handleNearbyHotelRangeSelect,
        fitAccommodationAreas,
        loadDiningDensityAreas,
        handleDiningHexSelect,
        handleSearch,
        focusAttraction,
        handleAccommodationAwareSearchSelect,
        openQuestionnaireFromForm,
        importPlanFile,
        openSavedPlan,
        savePlan,
        loadDuckRestaurants,
        openDuckCulture,
        handlePlanLegFocus,
        initializeMap,
      },
    })
  : undefined

onMounted(() => {
  // Independent tasks start together; the map reuses the shared catalog request.
  void Promise.allSettled([
    checkBackend(),
    loadAttractions(),
    initializeMap(),
    loadMetroNetwork(),
    loadWeather(),
  ])
})
</script>

<template>
  <HoverTooltip v-if="!isTutorialOpen && !tutorialDemo" />
  <PlanningNoticeDialog :notice="planningNotice" @close="closePlanningNotice" />
  <PlanningTraceWindow
    v-if="!tutorialDemo"
    v-model:open="traceWindowOpen"
    :record="planningTrace"
    :attractions="attractions"
    @cancel="cancelPlan"
  />
  <SplashScreen :visible="isSplashVisible" @finish="finishSplash" />
  <div class="app-shell" :class="shellClasses">
    <AppHeader
      :backend-message="backendMessage"
      :backend-version="backendVersion"
      :dock-open="isDockOpen && !isMapFull"
      :duck-mode="isDuckMode"
      :lodging-name="lodgingName"
      :planning-label="headerPlanningLabel"
      :rail-open="isRailOpen && !isMapFull"
      :status-class="statusClass"
      :weather-data="weatherData"
      :weather-date="weatherDate"
      :weather-dates="weatherDates"
      :weather-forecast="weatherForecast"
      :weather-message="weatherMessage"
      :weather-state="weatherState"
      @fit-attractions="fitMapOverview"
      @focus-lodging="handleCurrentLodgingFocus"
      @locate="requestLocation"
      @open-export="isExportOpen = true"
      @open-data-sources="isDataSourcesOpen = true"
      @retry-connection="retryConnection"
      @retry-weather="retryWeather"
      @start-planning="openWizardGuarded"
      @toggle-dock="toggleDock"
      @toggle-duck="toggleDuckMode"
      @toggle-rail="toggleRail"
    >
      <template #search>
        <TopSearch
          ref="topSearchRef"
          v-model:category="searchCategory"
          v-model:keyword="searchKeyword"
          :message="searchMessage"
          :results="searchResults"
          :selected-result-key="selectedSearchResult?.searchKey || ''"
          :state="searchState"
          @search="handleSearch"
          @select-result="handleAccommodationAwareSearchSelect"
        />
      </template>
    </AppHeader>

    <main class="planner-workspace">
      <LayerSidebar
        :active-panel="activeDockPanel"
        :attraction-count="attractions.length"
        :dining-density-count="diningDensityCount"
        :cuisine-count="cuisineShops.length"
        :dining-density-message="diningDensityMessage"
        :dining-density-state="diningDensityState"
        :dining-area-kind="selectedAreaKind"
        :duck-density-count="duckDensityAreas.length"
        :duck-restaurant-count="duckRestaurantCount"
        :duck-restaurant-marker-count="duckRestaurantMarkerCount"
        :selected-duck-types="selectedDuckTypes"
        :include-duck-takeaway="includeDuckTakeaway"
        :only-current-duck-dining="onlyCurrentDining"
        :has-current-dining-hex="Boolean(selectedDiningHex)"
        :duck-type-counts="duckTypeCounts"
        :duck-restaurant-message="duckRestaurantMessage"
        :duck-restaurant-state="duckRestaurantState"
        :filter-result-count="filteredAttractionCount"
        :filter-results="filteredAttractions"
        :has-plan="Boolean(planResponse)"
        :hotel-message="hotelMessage"
        :hotel-query="hotelQuery"
        :hotel-state="hotelState"
        :hotel-visible-count="visibleHotels.length"
        :nearby-hotel-count="hotelCount"
        :layer-visibility="layerVisibility"
        :map-filter="mapAttractionFilter"
        :meal-area-count="mealAreaCount"
        :metro-count="metroLineCount"
        :metro-message="metroMessage"
        :metro-state="metroState"
        :open="isRailOpen && !isMapFull"
        :plan-state="planState"
        :rail-mode="railMode"
        :restaurant-count="mapRestaurantCount"
        :restaurant-message="restaurantMessage"
        :restaurant-state="restaurantState"
        :search-result-count="searchResults.length"
        :current-lodging-name="currentLodging?.name || ''"
        :show-duck-layer="duckLayerAllowed"
        @collapse="collapseRail"
        @refresh-hotels="refreshNearbyHotels"
        @retry-dining-density="retryDiningDensityAreas"
        @retry-duck-restaurants="retryDuckRestaurants"
        @retry-metro="retryMetroNetwork"
        @reset-layers="resetLayers"
        @open-duck-culture="openDuckCulture()"
        @reset-map-filters="resetMapFilters"
        @select-attraction="handleFilteredAttractionSelect"
        @select-panel="handleDockPanelSelection"
        @toggle-map-filter="toggleMapFilter"
        @toggle-layer="handleToggleLayer"
        @toggle-duck-type="toggleDuckType"
        @toggle-duck-takeaway="includeDuckTakeaway = !includeDuckTakeaway"
        @toggle-duck-current-only="onlyCurrentDining = !onlyCurrentDining"
        @update-filter-keyword="updateMapFilterKeyword"
      >
        <MapUtilityTools
          v-model:density-radius="densityRadius"
          v-model:destination-id="destinationId"
          v-model:origin-id="originId"
          v-model:search-around-selected="searchAroundSelected"
          v-model:travel-mode="travelMode"
          :attractions="attractions"
          :density-message="densityMessage"
          :density-result="densityResult"
          :density-state="densityState"
          :locate-message="locateMessage"
          :locate-state="locateState"
          :travel-message="travelMessage"
          :travel-result="travelResult"
          :travel-state="travelState"
          @run-density="runDensity"
          @run-travel-time="runTravelTime"
        />
      </LayerSidebar>

      <MapWorkspace
        :accommodation-areas-visible="accommodationAreasVisible"
        :active-day="accommodationAreaPicking ? null : activeDay"
        :active-day-index="activeDayIndex"
        :active-plan-type="activePlanType"
        :backend-state="backendState"
        :planning-debug="planningDebug"
        :timeline-height="showPlanTimeline ? timelineHeight : 0"
        @open-planning-debug="revealPlanningDebug"
        :dock-open="isDockOpen && !isMapFull"
        :duck-flavor-count="duckFlavorCount"
        :duck-restaurant-count="totalDuckRestaurantCount"
        :active-duck-node-count="activeDuckNodeCount"
        :map-message="mapMessage"
        :map-state="mapState"
        :landmarks-visible="landmarkIconsVisible"
        :panels-hidden="isMapFull"
        :rail-open="isRailOpen && !isMapFull"
        :selected-coordinate-text="selectedCoordinateText"
        :selected-location-label="selectedLocationLabel"
        @fit-attractions="fitMapOverview"
        @locate="requestLocation"
        @retry-connection="retryConnection"
        @toggle-dock="toggleDock"
        @toggle-landmarks="landmarkIconsVisible = !landmarkIconsVisible"
        @toggle-panels="toggleMapFull"
        @toggle-rail="toggleRail"
      >
        <div
          ref="mapContainer"
          class="map-container"
          :data-map-status="mapState"
          :data-focused-plan-leg="focusedPlanLegId"
          :data-focused-route-geometry="focusedPlanLegGeometry"
          :data-focused-route-segment-count="focusedPlanLegSegmentCount"
          :data-expanded-plan-legs="expandedPlanLegIds.join(',')"
          :data-all-plan-legs-expanded="allPlanLegsExpanded"
          :data-dining-area-overlays="diningAreaOverlayCount"
          :data-dining-density-overlays="diningDensityOverlayCount"
          :data-duck-density-overlays="duckDensityOverlayCount"
          :data-duck-restaurant-markers="duckRestaurantMarkerCount"
          :data-metro-polylines="metroPolylineCount"
          :data-metro-stations="metroStationCount"
          :data-restaurant-markers="restaurantMarkerCount"
        ></div>
        <template #timeline>
          <RouteTimeline
            @resize="timelineHeight = $event"
            :active-day="activeDay"
            :active-day-index="activeDayIndex"
            :active-plan="activePlan"
            :active-plan-type="activePlanType"
            :focused-plan-leg-id="focusedPlanLegId"
            :expanded-plan-leg-ids="expandedPlanLegIds"
            :all-plan-legs-expanded="allPlanLegsExpanded"
            :class="{ 'route-timeline--visually-hidden': !showPlanTimeline }"
            @focus-item="handlePlanItemFocus"
            @focus-leg="handlePlanLegFocus"
            @toggle-all-legs="handleAllPlanLegs"
            @focus-meal="handlePlanMealFocus"
            @select-day="handleDaySelection"
          />
        </template>
      </MapWorkspace>

      <AccommodationAreaPickingBar
        v-if="accommodationAreaPicking"
        :candidate-name="pickedAccommodationArea?.name || ''"
        @next="confirmAccommodationArea"
        @back="handleAccommodationBackToStep('stay-choice')"
        @cancel="closeAccommodationWizard"
      />

      <InfoDock
        :active-panel="activeDockPanel"
        :attraction-title="selectedAttraction?.name"
        :hotel-title="selectedHotel?.name"
        :dining-area-title="selectedMealItem?.name"
        :dining-area-kind="selectedAreaKind"
        :dining-density-title="selectedOverviewArea?.density_label"
        :dining-shop-title="selectedLocalShop?.name"
        :dining-shop-collection="selectedLocalShop?.collection"
        :metro-title="selectedMetroStation?.name"
        :open="isDockOpen && !isMapFull"
        :plan-state="planState"
        :return-plan-panel="dayRouteContext ? 'day' : 'plans'"
        @back="handleDockBack"
        @close="isDockOpen = false"
        @select-panel="handleDockPanelSelection"
      >
        <template #overview>
          <OverviewPanel
            :has-pending-accommodation="hasPendingAccommodation"
            :attraction-count="attractions.length"
            :duck-mode="isDuckMode"
            :has-saved-plan="hasSavedPlan"
            :lodging-name="lodgingName"
            :planning-label="overviewPlanningLabel"
            :has-discovered-author="hasDiscoveredAuthor"
            @open-accommodation="handleAccommodationEntrance"
            @open-duck-culture="openDuckCulture()"
            @open-saved="selectDockPanel('saved')"
            @open-export="isExportOpen = true"
            @toggle-duck="toggleDuckMode"
            @open-tutorial="isTutorialOpen = true"
            @open-introduction="openIntroduction"
            @open-author="openAuthorLetters"
            @start-planning="openOverviewPlanning"
          />
        </template>
        <template #attraction>
          <AttractionDetailPanel
            :attraction="selectedAttraction"
            :preference="
              selectedAttraction ? tripForm.attractionChoices[selectedAttraction.id] : 'none'
            "
            @find-hotels="findHotelsAroundAttraction"
            @find-restaurants="findRestaurantsAroundAttraction"
            @set-preference="setAttractionPreference"
          />
        </template>
        <template #hotel>
          <HotelDetailPanel :hotel="selectedHotel" :query="selectedHotelQuery" />
        </template>
        <template #hotelArea>
          <AccommodationAreaHotelsPanel
            :active="isDockOpen && activeDockPanel === 'hotelArea'"
            :area="selectedAccommodationArea"
            :query="hotelPanelResult.query"
            :hotels="hotelPanelResult.hotels"
            :selected-hotel="selectedHotel"
            :state="hotelPanelResult.state"
            :message="hotelPanelResult.message"
            @select-hotel="handleAreaHotelSelect"
            @retry="retryAccommodationAreaHotels"
          />
        </template>
        <template #planner>
          <TripPlannerForm
            :key="plannerRevision"
            v-model="tripForm"
            :attractions="attractions"
            :plan-state="planState"
            :has-current-plan="Boolean(activePlan)"
            @edited="fullFormEdited = true"
            @submit="handleSubmitPlan"
            @cancel="cancelPlan"
            @open-questionnaire="openQuestionnaireFromForm"
          />
        </template>
        <template #results>
          <PlanResults
            :response="planResponse"
            :plan-state="planState"
            :plan-message="planMessage"
            :plan-progress="planProgress"
            :active-plan-type="activePlanType"
            :active-day-index="activeDayIndex"
            :attractions="attractions"
            :save-message="saveMessage"
            :view="activeDockPanel"
            :focused-plan-leg-id="focusedPlanLegId"
            :expanded-plan-leg-ids="expandedPlanLegIds"
            :loading-plan-type="loadingPlanType"
            :history-plans="historyPlans"
            @open-history="handleOpenHistoryPlan"
            @delete-history="deleteHistoryPlan"
            @back-to-plans="selectDockPanel('plans')"
            @edit-plan="openCurrentPlanEditor"
            @cancel="cancelPlan"
            @select-plan="handlePlanSelection"
            @select-day="handleDaySelection"
            @focus-item="handlePlanItemFocus"
            @focus-leg="handlePlanLegFocus"
            @focus-meal="handlePlanMealFocus"
            @retry="handleSubmitPlan"
            @open-planning-debug="revealPlanningDebug"
            @save="isExportOpen = true"
            @clear="clearPlan"
          />
        </template>
        <template #diningShop>
          <DiningShopPanel :shop="selectedLocalShop" />
        </template>
        <template #diningHex>
          <DiningHexPanel
            :cell="selectedDiningHex"
            :active-tab="activeHexTab"
            :duck-tab-visible="isDuckMode"
            :shops="hexDuckShops"
            :selected-shop-id="selectedHexShopId"
            @select-tab="handleHexTabSelect"
            @select-shop="handleDuckShopSelect"
          >
            <template #ordinary>
              <DiningAreaPanel
                v-if="selectedOverviewArea?.id === selectedDiningHex?.id"
                :active="activeDockPanel === 'diningHex' && activeHexTab === 'ordinary'"
                :area="selectedDiningArea"
                area-kind="overview"
                :area-state="selectedAreaState"
                :overview-note="diningDensityNote"
                :restaurant-message="restaurantMessage"
                :restaurant-response-note="restaurantResponseNote"
                :restaurants="restaurants"
                :restaurant-state="restaurantState"
                :selected-restaurant="selectedRestaurant"
                :local-shop="selectedQueryLocalShop"
                @load-restaurants="loadRestaurants"
                @retry-restaurants="retryRestaurants"
                @select-restaurant="handleRestaurantSelect"
              />
            </template>
          </DiningHexPanel>
        </template>
        <template #diningArea>
          <DiningAreaPanel
            v-if="selectedAreaKind !== 'overview' || !selectedDiningHex"
            :active="activeDockPanel === 'diningArea'"
            :area="selectedDiningArea"
            :area-kind="selectedAreaKind"
            :area-state="selectedAreaState"
            :item="selectedMealItem"
            :overview-note="diningDensityNote"
            :restaurant-message="restaurantMessage"
            :restaurant-response-note="restaurantResponseNote"
            :restaurants="restaurants"
            :restaurant-state="restaurantState"
            :selected-restaurant="selectedRestaurant"
            :local-shop="selectedQueryLocalShop"
            @load-restaurants="loadRestaurants"
            @retry-restaurants="retryRestaurants"
            @select-restaurant="handleRestaurantSelect"
          />
        </template>
        <template #duckCulture>
          <DuckCulturePanel
            :panel-open="isDockOpen && activeDockPanel === 'duckCulture'"
            :navigation-request="duckCultureNavigation"
          />
        </template>
        <template #metro>
          <section class="metro-station-panel" data-testid="metro-station-panel">
            <div v-if="selectedMetroStation" class="metro-station-panel__body">
              <div class="metro-station-panel__lines">
                <span
                  v-for="lineId in selectedMetroStation.line_ids"
                  :key="lineId"
                  class="metro-station-panel__line-badge"
                  :style="{
                    background:
                      metroLines.find((line) => line.id === lineId)?.color || 'var(--ink-600)',
                  }"
                  >{{ metroLines.find((line) => line.id === lineId)?.short_name || lineId }}</span
                >
              </div>
              <p class="metro-station-panel__verified">数据核实日期：{{ metroVerifiedAt }}</p>
            </div>
            <p v-else class="metro-station-panel__placeholder">
              在地图上点击一个主要站点查看详情。
            </p>
          </section>
        </template>
        <template #saved>
          <SavedPlansPanel
            :save-message="saveMessage"
            :saved-plans="savedPlans"
            :history-plans="historyPlans"
            @open-history="handleOpenHistoryPlan"
            @delete-history="deleteHistoryPlan"
            @delete-plan="deleteSavedPlan"
            @open-plan="handleOpenSavedPlan"
            @import-file="handleImportPlan"
            @rename-plan="handleRenameSavedPlan"
          />
        </template>
      </InfoDock>
    </main>
  </div>
  <ExportDialog
    :attractions="attractions"
    :weather-data="weatherData"
    :active-day-index="activeDayIndex"
    :active-plan-type="activePlanType"
    :default-save-name="defaultSaveName"
    :has-plan="Boolean(planResponse)"
    :open="isExportOpen"
    :plan-response="planResponse"
    :trip-request="activeTripRequest"
    :request-source="activeTripRequestSource"
    :save-message="saveMessage"
    @close="isExportOpen = false"
    @save="handleSavePlan"
  />
  <HelpTutorial
    v-if="hasOpenedTutorial || tutorialDemo"
    :open="isTutorialOpen || tutorialDemo"
    :demo="tutorialDemo"
    :prepare-scene="prepareTutorialScene"
    :preload="prepareTutorialScene?.preload"
    :get-area-rects="getAccommodationGuideRects"
    @close="isTutorialOpen = false"
  />
  <DataSourcesDialog
    v-if="isDataSourcesOpen"
    :backend-message="backendMessage"
    :backend-state="backendState"
    @close="isDataSourcesOpen = false"
    @retry-connection="retryConnection"
  />
  <ProjectIntroductionDialog
    v-if="dialogMode"
    :mode="dialogMode"
    @close="closeIntroduction"
    @open-tutorial="openIntroductionTutorial"
  />
  <FirstUseHints
    :duck-visible="isDuckMode && !accommodationAreaPicking"
    :area-picking="accommodationAreaPicking"
    :area-selected="Boolean(pickedAccommodationArea)"
    :picking-session="pickingSession"
    :get-area-rects="getAccommodationGuideRects"
  />
  <PlanningWizard
    :key="wizardRevision"
    v-model="tripForm"
    :attractions="attractions"
    :lodging-name="lodgingName"
    :open="isWizardOpen"
    :seed-from-form="wizardFromFullForm"
    :weather-data="weatherData"
    :weather-state="weatherState"
    :weather-message="weatherMessage"
    @retry-weather="retryWeather"
    @close="closeWizard"
    @open-full-form="openFullPlanner"
    @submit="handleWizardSubmit"
    @draft-change="pendingPlanningMode = 'wizard'"
  />
  <AccommodationWizard
    :open="accommodationWizardOpen"
    :draft="accommodation.accommodationDraft.value"
    :step="accommodation.accommodationStep.value"
    :areas="accommodation.ACCOMMODATION_AREA_OPTIONS"
    :picking-session="pickingSession"
    :confirmed-name="lodgingName"
    @close="closeAccommodationWizard"
    @pick-mode="handleAccommodationPickMode"
    @pick-area="handleAccommodationPickArea"
    @pick-endpoint="handleAccommodationPickEndpoint"
    @back-to-step="handleAccommodationBackToStep"
    @start-picking="handleEndpointPicking"
    @commit="handleAccommodationCommit"
    @cancel="handleAccommodationCancel"
  />
</template>
