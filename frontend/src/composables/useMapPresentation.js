import { computed, nextTick, watch } from 'vue'
import { rebindSelectedHotel } from '../search/hotelResults'
import { DEFAULT_LAYER_VISIBILITY, GENERATED_ROUTE_LAYER_VISIBILITY } from '../map/layerVisibility'

export function useMapPresentation({
  layerVisibility,
  mapViewportPadding,
  planning,
  ui,
  map,
  dining,
  layers,
  hotel,
}) {
  const { activeDay, activePlan, planResponse, planState } = planning
  const { isDuckMode, setDuckMode, selectDockPanel, activeDockPanel, accommodationAreaPicking } = ui
  const {
    fitPlanOverview,
    mapFocusInProgress,
    fitAttractions,
    fitAccommodationAreas,
    focusPlanItem,
    focusDiningArea,
    focusDiningDensityArea,
    setHotelMarkers,
  } = map
  const {
    selectMealArea,
    selectDiningDensityArea,
    selectRestaurant,
    loadRestaurants,
    loadRouteRestaurants,
    selectedLocalShop,
    localShopReturnPanel,
  } = dining
  const {
    duckRestaurantState,
    loadDuckRestaurants,
    diningDensityState,
    loadDiningDensityAreas,
    cancelDiningSnapshotLoad,
    metroState,
    loadMetroNetwork,
  } = layers
  const { hotels, hotelQuery, selectedHotel } = hotel

  const activeDuckNodeCount = computed(() =>
    activePlan.value?.plan_type === 'duck'
      ? activePlan.value.days.reduce(
          (total, day) =>
            total +
            day.items.filter((item) => item.type === 'duck_restaurant').length +
            (day.legs || []).reduce(
              (sum, leg) =>
                sum + (leg.meals || []).filter((meal) => meal.area_kind === 'duck').length,
              0,
            ),
          0,
        )
      : 0,
  )
  const duckLayerAllowed = computed(() => isDuckMode.value)
  // A plan change enables the duck theme once; a later manual exit remains respected.
  watch(activePlan, (plan, previous) => {
    if (plan?.plan_type === 'duck' && plan !== previous) setDuckMode(true)
  })

  function fitMapOverview() {
    if (accommodationAreaPicking?.value && fitAccommodationAreas?.()) return
    if (activeDay.value) fitPlanOverview({ immediately: false })
    else if (layerVisibility.value.accommodationAreas && fitAccommodationAreas?.()) return
    else fitAttractions()
  }

  watch(hotels, (nextHotels) => {
    setHotelMarkers(nextHotels)
    selectedHotel.value = rebindSelectedHotel(selectedHotel.value, nextHotels)
  })

  // A new query batch must never be shown together with a stale selected hotel:
  // keep the selection only if the same POI exists in the new batch.
  watch(hotelQuery, () => {
    selectedHotel.value = rebindSelectedHotel(selectedHotel.value, hotels.value)
  })

  watch(mapViewportPadding, (padding, previous) => {
    // Wrapping the timeline updates later fits without replacing a selected place's camera.
    const timelineOnly = padding.every((value, index) => index === 2 || value === previous[index])
    if (
      (timelineOnly && activeDockPanel.value !== 'day') ||
      mapFocusInProgress?.value ||
      layerVisibility.value.accommodationAreas ||
      (layerVisibility.value.hotels && layerVisibility.value.nearbyHotels && hotelQuery.value)
    )
      return
    nextTick(fitMapOverview)
  })

  function showOnlyGeneratedRoute() {
    const previous = layerVisibility.value
    layerVisibility.value = {
      ...GENERATED_ROUTE_LAYER_VISIBILITY,
      diningDensity: previous.diningDensity,
      nanjingCuisine: previous.nanjingCuisine,
      dining: previous.dining && previous.nanjingCuisine,
      duckDensity: previous.duckDensity,
      duck: previous.duck,
      currentLodging: previous.currentLodging,
    }
  }

  watch(planState, (state, previousState) => {
    if (previousState === 'loading' && (state === 'success' || state === 'error')) {
      if (state === 'success') showOnlyGeneratedRoute()
      selectDockPanel('plans')
    }
  })

  watch(
    planResponse,
    (response, previousResponse) => {
      if (!response || planState.value === 'loading') return
      // Restored and imported plans use the same layer presentation as newly generated plans.
      showOnlyGeneratedRoute()
      if (!previousResponse) selectDockPanel('plans')
    },
    { immediate: true },
  )

  watch(
    duckLayerAllowed,
    (enabled) => {
      if (enabled && duckRestaurantState.value !== 'success') loadDuckRestaurants()
    },
    { immediate: true },
  )

  function toggleLayer(layerId) {
    if (['duck', 'duckDensity'].includes(layerId) && !duckLayerAllowed.value) return
    if (layerId === 'currentLodging') {
      const nextVisible = !(layerVisibility.value.search && layerVisibility.value.currentLodging)
      layerVisibility.value.currentLodging = nextVisible
      if (nextVisible) layerVisibility.value.search = true
    } else if (['nanjingCuisine', 'nearbyDining'].includes(layerId)) {
      const nextVisible = !(layerVisibility.value.dining && layerVisibility.value[layerId])
      layerVisibility.value[layerId] = nextVisible
      if (nextVisible) layerVisibility.value.dining = true
    } else {
      layerVisibility.value[layerId] = !layerVisibility.value[layerId]
    }
    if (
      ['dining', 'nearbyDining'].includes(layerId) &&
      layerVisibility.value.dining &&
      layerVisibility.value.nearbyDining &&
      layerVisibility.value.route &&
      activeDay.value
    ) {
      void loadRouteRestaurants()
    }
    if (layerId === 'metro' && layerVisibility.value.metro && metroState.value === 'idle') {
      loadMetroNetwork()
    }
  }

  function resetLayers() {
    layerVisibility.value = { ...DEFAULT_LAYER_VISIBILITY }
  }

  watch(
    () =>
      layerVisibility.value.diningDensity ||
      (layerVisibility.value.dining && layerVisibility.value.nanjingCuisine) ||
      (duckLayerAllowed.value && (layerVisibility.value.duckDensity || layerVisibility.value.duck)),
    (visible) => {
      if (!visible) cancelDiningSnapshotLoad?.()
      else if (diningDensityState.value === 'idle') void loadDiningDensityAreas()
    },
    { flush: 'sync' },
  )

  async function handlePlanItemFocus(item) {
    focusPlanItem(item)
    if (item?.type !== 'meal_area') return
    selectMealArea(item)
    if (selectedLocalShop) selectedLocalShop.value = null
    focusDiningArea(item)
    layerVisibility.value.dining = true
    layerVisibility.value.nearbyDining = true
    selectDockPanel('diningArea')
    await loadRestaurants()
  }

  async function handleDiningDensityAreaSelect(area) {
    if (!selectDiningDensityArea(area)) return
    if (selectedLocalShop) selectedLocalShop.value = null
    focusDiningDensityArea(area)
    layerVisibility.value.dining = true
    layerVisibility.value.nearbyDining = true
    selectDockPanel('diningArea')
    await loadRestaurants()
  }

  function handleRestaurantSelect(restaurant) {
    if (restaurant?.dining_sources?.[0] === 'nanjing_cuisine') {
      localShopReturnPanel.value =
        activeDockPanel.value === 'diningShop' ? localShopReturnPanel.value : activeDockPanel.value
      selectedLocalShop.value = restaurant.local_shop
      selectDockPanel('diningShop')
      return
    }
    if (selectedLocalShop) selectedLocalShop.value = null
    selectRestaurant(restaurant)
    selectDockPanel('diningArea')
  }

  return {
    activeDuckNodeCount,
    duckLayerAllowed,
    fitMapOverview,
    toggleLayer,
    resetLayers,
    handlePlanItemFocus,
    handleDiningDensityAreaSelect,
    handleRestaurantSelect,
  }
}
