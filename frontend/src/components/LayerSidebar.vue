<script setup>
import HelpHint from './HelpHint.vue'
import { computed, ref } from 'vue'

import {
  ATTRACTION_CATEGORY_LABELS,
  ATTRACTION_CATEGORY_OPTIONS,
  ATTRACTION_PRICE_OPTIONS,
  ATTRACTION_QUALITY_OPTIONS,
  ATTRACTION_RESERVATION_OPTIONS,
  ATTRACTION_TAG_OPTIONS,
  isAttractionFilterActive,
} from '../attractions/attractionFilters'
import LayerIcon from './LayerIcon.vue'
import { MAP_MARKER_COLORS } from '../map/mapMarkerIcons'
import { PLAN_ROUTE_COLOR, routeSegmentStyle } from '../map/planMapLayer'
import { DUCK_TYPES } from '../map/diningSnapshotData'
import { DUCK_TYPE_ICONS } from '../map/duckRestaurantPresentation'
import { duckTypeLabel } from '../planning/duckDiningPresentation'

const props = defineProps({
  activePanel: { type: String, required: true },
  attractionCount: { type: Number, default: 0 },
  cuisineCount: { type: Number, default: 0 },
  diningDensityCount: { type: Number, default: 0 },
  diningDensityMessage: { type: String, default: '' },
  diningDensityState: { type: String, default: 'idle' },
  diningAreaKind: { type: String, default: 'route' },
  duckDensityCount: { type: Number, default: 0 },
  duckRestaurantCount: { type: Number, default: 0 },
  duckRestaurantMarkerCount: { type: Number, default: 0 },
  selectedDuckTypes: { type: Array, default: () => [...DUCK_TYPES] },
  includeDuckTakeaway: { type: Boolean, default: false },
  onlyCurrentDuckDining: { type: Boolean, default: true },
  hasCurrentDiningHex: { type: Boolean, default: false },
  duckTypeCounts: { type: Object, default: () => ({}) },
  duckRestaurantMessage: { type: String, default: '' },
  duckRestaurantState: { type: String, default: 'idle' },
  filterResultCount: { type: Number, default: 0 },
  filterResults: { type: Array, default: () => [] },
  hasPlan: { type: Boolean, default: false },
  hotelMessage: { type: String, default: '' },
  hotelQuery: { type: Object, default: null },
  hotelState: { type: String, default: 'idle' },
  hotelVisibleCount: { type: Number, default: 0 },
  nearbyHotelCount: { type: Number, default: 0 },
  layerVisibility: { type: Object, required: true },
  mapFilter: { type: Object, required: true },
  mealAreaCount: { type: Number, default: 0 },
  metroCount: { type: Number, default: 0 },
  metroMessage: { type: String, default: '' },
  metroState: { type: String, default: 'idle' },
  open: { type: Boolean, required: true },
  planState: { type: String, required: true },
  railMode: { type: String, required: true },
  restaurantCount: { type: Number, default: 0 },
  restaurantMessage: { type: String, default: '' },
  restaurantState: { type: String, default: 'idle' },
  searchResultCount: { type: Number, default: 0 },
  currentLodgingName: { type: String, default: '' },
  showDuckLayer: { type: Boolean, default: false },
})

const emit = defineEmits([
  'collapse',
  'open-duck-culture',
  'refresh-hotels',
  'retry-dining-density',
  'retry-duck-restaurants',
  'retry-metro',
  'reset-layers',
  'reset-map-filters',
  'select-attraction',
  'select-panel',
  'toggle-map-filter',
  'toggle-layer',
  'toggle-duck-type',
  'toggle-duck-takeaway',
  'toggle-duck-current-only',
  'update-filter-keyword',
])

const legendOpen = ref(true)
const openGroups = ref({ default: true, planning: true })
const openLayerDetails = ref({})

const hotelCountText = computed(() =>
  props.hotelVisibleCount > 0 || props.hotelState !== 'idle'
    ? String(props.hotelVisibleCount)
    : '暂无',
)

const filterGroups = Object.freeze([
  { field: 'categories', label: '类别', options: ATTRACTION_CATEGORY_OPTIONS },
  { field: 'tags', label: '标签', options: ATTRACTION_TAG_OPTIONS },
  { field: 'qualityGrades', label: '质量等级', options: ATTRACTION_QUALITY_OPTIONS },
  { field: 'priceStatuses', label: '成人票价', options: ATTRACTION_PRICE_OPTIONS },
  {
    field: 'reservationStatuses',
    label: '预约条件',
    options: ATTRACTION_RESERVATION_OPTIONS,
  },
])

const hasActiveMapFilter = computed(() => isAttractionFilterActive(props.mapFilter))
const layerHelp = {
  diningDensity: '点击网格查看店铺名单，再点击店铺查看资料。',
  duckDensity:
    '查看南京鸭店的集中分布。点击网格查看这一格的鸭店；左侧“南京鸭”图层可以单独显示门店位置，并按鸭味类型筛选。',
  duck: '显示南京鸭门店的位置。展开后可以选择鸭味类型，“包括熟食外带”用于加入外带店；点击门店查看资料，鸭子向导可讲解选中店铺。',
}
const markerLegend = computed(() => [
  { key: 'attractions', label: '景点（专属图标／蓝色符号）' },
  { key: 'hotels', label: '酒店与住宿' },
  { key: 'dining', label: '当前查看的餐饮' },
  { key: 'nanjingCuisine', label: '南京特色菜馆' },
  ...(props.showDuckLayer ? [{ key: 'duck', label: '南京鸭门店' }] : []),
  { key: 'search', label: '搜索结果' },
])
const transportLegend = [
  { mode: 'metro', label: '详细公共交通路线' },
  { mode: 'taxi', label: '详细出租车路线' },
  { mode: 'walk', label: '详细步行路线' },
  { mode: 'self_drive', label: '详细自驾路线' },
].map((item) => ({ ...item, style: routeSegmentStyle(item.mode) }))
function toggleLegend() {
  if (props.railMode === 'collapsed') emit('collapse')
  legendOpen.value = !legendOpen.value
}

function filterValueSelected(field, value) {
  return props.mapFilter[field]?.includes(value) || false
}

function attractionCategoryLabel(attraction) {
  return ATTRACTION_CATEGORY_LABELS[attraction?.category] || '类别暂无'
}

const layers = computed(() => [
  {
    id: 'attractions',
    label: '景点',
    count: String(props.attractionCount),
    available: true,
  },
  {
    id: 'metro',
    label: '地铁',
    count:
      props.metroState === 'loading'
        ? '加载中'
        : props.metroState === 'success'
          ? `${props.metroCount} 线`
          : props.metroState === 'error'
            ? '失败'
            : '未加载',
    available: true,
  },
  { id: 'hotels', label: '酒店', count: hotelCountText.value, available: true },
  {
    id: 'diningDensity',
    label: '餐饮分布',
    count:
      props.diningDensityState === 'loading'
        ? '加载中'
        : props.diningDensityState === 'success'
          ? String(props.diningDensityCount)
          : props.diningDensityState === 'error'
            ? '失败'
            : '未加载',
    available: true,
  },
  {
    id: 'dining',
    label: '餐饮',
    count:
      props.cuisineCount > 0
        ? '已收录'
        : props.restaurantState === 'loading'
          ? '加载中'
          : props.restaurantState === 'success'
            ? String(props.restaurantCount)
            : '未加载',
    available: true,
  },
  {
    id: 'duckDensity',
    label: '南京鸭分布',
    count:
      props.diningDensityState === 'success'
        ? String(props.duckDensityCount)
        : props.diningDensityState === 'loading'
          ? '加载中'
          : props.diningDensityState === 'error'
            ? '失败'
            : '未加载',
    available: true,
  },
  {
    id: 'duck',
    label: '南京鸭',
    count:
      props.duckRestaurantState === 'loading'
        ? '加载中'
        : props.duckRestaurantState === 'success'
          ? String(props.duckRestaurantCount)
          : props.duckRestaurantState === 'error'
            ? '失败'
            : '未加载',
    available: true,
  },
  {
    id: 'search',
    label: '搜索结果',
    count: props.searchResultCount ? String(props.searchResultCount) : '无',
    available: props.searchResultCount > 0,
  },
  {
    id: 'mealAreas',
    label: '用餐区域',
    count: props.mealAreaCount ? String(props.mealAreaCount) : '无',
    available: props.mealAreaCount > 0,
  },
  {
    id: 'route',
    label: '规划路线',
    count: props.hasPlan ? '当前' : '待生成',
    available: props.hasPlan,
  },
])

const layerGroups = computed(() => [
  {
    id: 'default',
    label: '默认图层',
    layers: layers.value.filter(
      (layer) =>
        [
          'attractions',
          'metro',
          'hotels',
          'diningDensity',
          'dining',
          'duckDensity',
          'duck',
          'search',
        ].includes(layer.id) &&
        (!['duck', 'duckDensity'].includes(layer.id) || props.showDuckLayer),
    ),
  },
  {
    id: 'planning',
    label: '规划图层',
    layers: layers.value.filter((layer) => ['mealAreas', 'route'].includes(layer.id)),
  },
])

function isLayerActive(layerId) {
  return Boolean(props.layerVisibility[layerId])
}

function toggleGroup(groupId) {
  if (props.railMode === 'collapsed') emit('collapse')
  openGroups.value[groupId] = !openGroups.value[groupId]
}

function toggleLayerDetails(layerId) {
  if (props.railMode === 'collapsed') emit('collapse')
  openLayerDetails.value[layerId] = !openLayerDetails.value[layerId]
}
</script>

<template>
  <aside
    v-show="open"
    class="layer-sidebar tools-panel"
    :class="{ 'layer-sidebar--collapsed': railMode === 'collapsed' }"
    data-testid="layer-sidebar"
    aria-label="地图图层与工具"
  >
    <div class="layer-sidebar__scroll">
      <div class="layer-sidebar__header">
        <LayerIcon name="layers" />
        <h2 class="context-help-heading">
          地图图层
          <HelpHint
            v-if="railMode !== 'collapsed'"
            label="地图图层"
            test-id="layers-help"
            text="勾选图层可以显示或隐藏地图内容；名称右侧的箭头可展开说明与筛选。点击地图上的地点查看右侧详情，点击地点信息框外的地图可关闭地点信息。"
          />
        </h2>
        <button
          type="button"
          class="rail-collapse-button"
          :aria-label="railMode === 'collapsed' ? '展开图层栏' : '收起为图标条'"
          data-testid="collapse-rail"
          @click="emit('collapse')"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              :d="railMode === 'collapsed' ? 'm9 5 7 7-7 7' : 'm15 5-7 7 7 7'"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </div>

      <section
        v-for="group in layerGroups"
        :key="group.id"
        class="layer-sidebar__section layer-group"
        :data-layer-group="group.id"
      >
        <header class="layer-group__header">
          <button
            type="button"
            class="layer-group__trigger"
            :aria-expanded="openGroups[group.id]"
            :data-layer-group-toggle="group.id"
            @click="toggleGroup(group.id)"
          >
            <span>{{ group.label }}</span>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="m7 10 5 5 5-5" stroke="currentColor" stroke-width="1.8" />
            </svg>
          </button>
          <button v-if="group.id === 'default'" type="button" @click="emit('reset-layers')">
            恢复默认
          </button>
        </header>

        <div v-show="railMode === 'collapsed' || openGroups[group.id]" class="layer-group__body">
          <div
            v-for="layer in group.layers"
            :key="layer.id"
            class="layer-entry"
            :class="{ 'layer-entry--open': openLayerDetails[layer.id] }"
          >
            <div class="layer-entry__row">
              <button
                type="button"
                class="layer-switch"
                :class="{
                  'layer-switch--active': isLayerActive(layer.id),
                  'layer-switch--unavailable': !layer.available,
                }"
                :data-hover-text="
                  !layer.available ? `${layer.label}图层暂无正式点位；仍可预设开关状态` : undefined
                "
                :aria-checked="isLayerActive(layer.id)"
                :data-layer-id="layer.id"
                role="switch"
                @click="emit('toggle-layer', layer.id)"
              >
                <i class="layer-switch__check" aria-hidden="true"></i>
                <b>{{ layer.label }}</b>
                <LayerIcon :name="layer.id" />
                <em v-if="!layerHelp[layer.id] || railMode === 'collapsed'">{{ layer.count }}</em>
              </button>
              <HelpHint
                v-if="layerHelp[layer.id] && railMode !== 'collapsed'"
                :label="layer.label"
                :text="layerHelp[layer.id]"
                :test-id="`layer-help-${layer.id}`"
              />
              <em v-if="layerHelp[layer.id] && railMode !== 'collapsed'" class="layer-entry__count">
                {{ layer.count }}
              </em>
              <button
                type="button"
                class="layer-detail-toggle"
                :aria-expanded="Boolean(openLayerDetails[layer.id])"
                :aria-label="`${openLayerDetails[layer.id] ? '收起' : '展开'}${layer.label}说明`"
                :data-layer-details-toggle="layer.id"
                :data-testid="layer.id === 'attractions' ? 'map-filter-toggle' : undefined"
                @click="toggleLayerDetails(layer.id)"
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="m7 10 5 5 5-5" stroke="currentColor" stroke-width="1.8" />
                </svg>
              </button>
            </div>

            <div
              v-show="openLayerDetails[layer.id]"
              class="layer-detail"
              :data-layer-detail="layer.id"
            >
              <template v-if="layer.id === 'attractions'">
                <div class="map-filter-body" data-testid="map-filter-body">
                  <div class="context-help-heading map-filter-help-heading">
                    景点筛选
                    <HelpHint
                      label="景点筛选"
                      test-id="filters-help"
                      text="这些条件用来筛选地图上显示的景点。同一组中符合任意一项即可，不同组的条件需要同时满足；行程中的必去与不想去，在景点详情或规划问卷中设置。"
                    />
                  </div>
                  <label class="map-filter-search">
                    <span>名称或别名</span>
                    <input
                      type="search"
                      :value="mapFilter.keyword"
                      placeholder="搜索景点"
                      data-testid="map-filter-keyword"
                      @input="emit('update-filter-keyword', $event.target.value)"
                    />
                  </label>
                  <p class="map-filter-semantics">同组命中任一项，不同组需同时满足。</p>
                  <fieldset
                    v-for="group in filterGroups"
                    :key="group.field"
                    class="map-filter-group"
                    :data-filter-group="group.field"
                  >
                    <legend>{{ group.label }}</legend>
                    <div class="filter-chips" :aria-label="`按${group.label}筛选`">
                      <button
                        v-for="option in group.options"
                        :key="option.value"
                        type="button"
                        :class="{ active: filterValueSelected(group.field, option.value) }"
                        :aria-pressed="filterValueSelected(group.field, option.value)"
                        :data-filter-field="group.field"
                        :data-filter-value="option.value"
                        @click="
                          emit('toggle-map-filter', { field: group.field, value: option.value })
                        "
                      >
                        {{ option.label }}
                      </button>
                    </div>
                  </fieldset>
                  <div class="map-filter-summary" aria-live="polite">
                    <span>
                      当前显示 {{ layerVisibility.attractions ? filterResultCount : 0 }} /
                      {{ attractionCount }} 个景点
                    </span>
                    <button
                      type="button"
                      :disabled="!hasActiveMapFilter"
                      data-testid="reset-map-filters"
                      @click="emit('reset-map-filters')"
                    >
                      清除筛选
                    </button>
                  </div>
                  <small v-if="!layerVisibility.attractions" class="map-filter-layer-note">
                    景点图层已关闭，当前条件仍匹配 {{ filterResultCount }} 个景点。
                  </small>
                  <div class="map-filter-results" data-testid="map-filter-results">
                    <p v-if="attractionCount === 0" class="map-filter-empty">景点数据暂未加载。</p>
                    <div v-else-if="filterResults.length === 0" class="map-filter-empty">
                      <strong>没有符合全部条件的景点</strong>
                      <span>可以清除筛选后重新查找。</span>
                      <button type="button" @click="emit('reset-map-filters')">一键清除</button>
                    </div>
                    <ul v-else aria-label="匹配景点结果">
                      <li v-for="attraction in filterResults" :key="attraction.id">
                        <button
                          type="button"
                          :data-attraction-result="attraction.id"
                          @click="emit('select-attraction', attraction)"
                        >
                          <span>
                            <b>{{ attraction.name || '名称暂无' }}</b>
                            <small>
                              {{ attraction.id || '编号暂无' }} ·
                              {{ attractionCategoryLabel(attraction) }}
                            </small>
                          </span>
                          <em>{{ attraction.quality_grade || '未评级' }}</em>
                        </button>
                      </li>
                    </ul>
                  </div>
                </div>
              </template>

              <template v-else-if="layer.id === 'metro'">
                <p data-testid="metro-layer-info">
                  {{ metroMessage || '开启后加载主要地铁线路和站点。' }}
                </p>
                <button
                  v-if="metroState === 'error'"
                  type="button"
                  data-testid="retry-metro"
                  @click="emit('retry-metro')"
                >
                  重试静态数据
                </button>
                <small>显示主要线路和站点；点击站点可设为住处或起终点。</small>
              </template>

              <template v-else-if="layer.id === 'hotels'">
                <div class="dining-sublayers">
                  <div class="dining-sublayers__entry">
                    <button
                      type="button"
                      class="layer-switch"
                      role="switch"
                      data-layer-id="nearbyHotels"
                      data-testid="hotel-nearby-toggle"
                      :class="{
                        'layer-switch--active':
                          layerVisibility.hotels && layerVisibility.nearbyHotels,
                      }"
                      :style="{ '--dining-sublayer-color': MAP_MARKER_COLORS.hotels }"
                      :aria-checked="
                        Boolean(layerVisibility.hotels && layerVisibility.nearbyHotels)
                      "
                      @click="emit('toggle-layer', 'nearbyHotels')"
                    >
                      <i class="layer-switch__check" aria-hidden="true"></i><b>点击区域附近旅馆</b
                      ><em>{{ nearbyHotelCount }}</em>
                    </button>
                    <small
                      >每次开启按当前选点重新查询。点击淡紫色范围圆查看名单。地图选点改变后，点击刷新查询1000米内的酒店。</small
                    >
                    <small
                      ><button
                        type="button"
                        class="text-button"
                        data-testid="refresh-hotels"
                        :disabled="hotelState === 'loading'"
                        @click="emit('refresh-hotels')"
                      >
                        {{ hotelState === 'loading' ? '正在查询…' : '刷新当前范围' }}
                      </button></small
                    >
                    <small data-testid="hotel-layer-info"
                      >当前找到{{ nearbyHotelCount }}家酒店</small
                    >
                    <small v-if="hotelState === 'error'" role="status">{{ hotelMessage }}</small>
                  </div>
                  <div class="dining-sublayers__entry">
                    <button
                      type="button"
                      class="layer-switch"
                      role="switch"
                      data-layer-id="accommodationAreas"
                      data-testid="hotel-recommended-areas-toggle"
                      :class="{
                        'layer-switch--active':
                          layerVisibility.hotels && layerVisibility.accommodationAreas,
                      }"
                      :style="{ '--dining-sublayer-color': MAP_MARKER_COLORS.accommodationAreas }"
                      :aria-checked="
                        Boolean(layerVisibility.hotels && layerVisibility.accommodationAreas)
                      "
                      @click="emit('toggle-layer', 'accommodationAreas')"
                    >
                      <i class="layer-switch__check" aria-hidden="true"></i><b>推荐住宿片区</b
                      ><em>6</em>
                    </button>
                    <small
                      >一次查看一个片区，切换片区自动隐藏上一片区旅馆；再次点击隐藏，图层开关保留缓存。</small
                    >
                  </div>
                </div>
              </template>

              <template v-else-if="layer.id === 'diningDensity'">
                <p data-testid="dining-density-layer-info">{{ diningDensityMessage }}</p>
                <button
                  v-if="diningDensityState === 'error'"
                  type="button"
                  data-testid="retry-dining-density"
                  @click="emit('retry-dining-density')"
                >
                  重试静态数据
                </button>
                <small
                  >蓝色15–48家、黄色50–99家、红色100家及以上。点击蜂巢格查看本格采集的餐饮名单。
                  <span class="dining-density-legend" aria-label="普通餐饮数量图例">
                    <i class="dining-density-legend__blue"></i>15–48
                    <i class="dining-density-legend__yellow"></i>50–99
                    <i class="dining-density-legend__red"></i>≥100
                  </span></small
                >
              </template>

              <template v-else-if="layer.id === 'dining'">
                <div class="dining-sublayers">
                  <div class="dining-sublayers__entry">
                    <button
                      type="button"
                      role="switch"
                      data-layer-id="nanjingCuisine"
                      class="layer-switch"
                      :class="{
                        'layer-switch--active':
                          layerVisibility.dining && layerVisibility.nanjingCuisine,
                      }"
                      :style="{ '--dining-sublayer-color': MAP_MARKER_COLORS.nanjingCuisine }"
                      :aria-checked="layerVisibility.dining && layerVisibility.nanjingCuisine"
                      @click="emit('toggle-layer', 'nanjingCuisine')"
                    >
                      <i class="layer-switch__check" aria-hidden="true"></i><b>南京特色菜</b
                      ><em>{{
                        cuisineCount || (diningDensityState === 'loading' ? '加载中' : '165')
                      }}</em>
                    </button>
                    <small
                      >粉色图标为本地收录的南京特色菜馆，收录截至2026年10月4日，仅供参考。</small
                    >
                  </div>
                  <div class="dining-sublayers__entry">
                    <button
                      type="button"
                      role="switch"
                      data-layer-id="nearbyDining"
                      class="layer-switch"
                      :class="{
                        'layer-switch--active':
                          layerVisibility.dining && layerVisibility.nearbyDining,
                      }"
                      :style="{ '--dining-sublayer-color': MAP_MARKER_COLORS.dining }"
                      :aria-checked="layerVisibility.dining && layerVisibility.nearbyDining"
                      @click="emit('toggle-layer', 'nearbyDining')"
                    >
                      <i class="layer-switch__check" aria-hidden="true"></i><b>当前查看的餐饮</b
                      ><em>{{ restaurantCount }}</em>
                    </button>
                    <small>主动搜索餐饮、点击分布图蜂巢格或生成路线后，显示当前查看的餐饮。</small>
                  </div>
                </div>
                <p v-if="diningDensityState === 'error'">
                  {{ diningDensityMessage
                  }}<button
                    type="button"
                    data-testid="retry-cuisine"
                    @click="emit('retry-dining-density')"
                  >
                    重试本地资料
                  </button>
                </p>
              </template>

              <template v-else-if="layer.id === 'duckDensity'">
                <p>固定461格中的178格：1家61格、2–5家71格、超过5家46格。</p>
                <div class="duck-density-legend">
                  <span v-for="(label, index) in ['1家', '2–5家', '超过5家']" :key="label"
                    ><i :class="`duck-stripe duck-stripe--${index}`"></i>{{ label }}</span
                  >
                </div>
                <small>点击蜂巢格查看本格统计和完整收录名单。</small>
                <button
                  v-if="diningDensityState === 'error'"
                  type="button"
                  @click="emit('retry-dining-density')"
                >
                  重试本地资料
                </button>
              </template>
              <template v-else-if="layer.id === 'duck'">
                <div class="dining-sublayers duck-type-filters" data-testid="duck-type-filters">
                  <button
                    type="button"
                    class="layer-switch"
                    :class="{ 'layer-switch--active': onlyCurrentDuckDining }"
                    role="checkbox"
                    :aria-checked="onlyCurrentDuckDining"
                    data-testid="duck-current-only-filter"
                    @click="emit('toggle-duck-current-only')"
                  >
                    <i class="layer-switch__check" aria-hidden="true"></i><b>仅当前查看餐饮</b>
                  </button>
                  <button
                    v-for="type in DUCK_TYPES"
                    :key="type"
                    type="button"
                    class="layer-switch"
                    :class="{ 'layer-switch--active': selectedDuckTypes.includes(type) }"
                    role="checkbox"
                    :aria-checked="selectedDuckTypes.includes(type)"
                    :data-duck-type-filter="type"
                    @click="emit('toggle-duck-type', type)"
                  >
                    <i class="layer-switch__check" aria-hidden="true"></i>
                    <b><LayerIcon :name="DUCK_TYPE_ICONS[type]" />{{ duckTypeLabel(type) }}</b>
                    <em>{{ duckTypeCounts[type] || 0 }}</em>
                  </button>
                  <button
                    type="button"
                    class="layer-switch"
                    :class="{ 'layer-switch--active': includeDuckTakeaway }"
                    role="checkbox"
                    :aria-checked="includeDuckTakeaway"
                    data-testid="duck-takeaway-filter"
                    @click="emit('toggle-duck-takeaway')"
                  >
                    <i class="layer-switch__check" aria-hidden="true"></i><b>包括熟食外带</b>
                  </button>
                </div>
                <p class="duck-point-counts" data-testid="duck-point-counts">
                  符合筛选 <em data-testid="duck-filtered-count">{{ duckRestaurantCount }}</em> 家 ·
                  当前绘制
                  <em data-testid="duck-drawn-count">{{ duckRestaurantMarkerCount }}</em> 家
                </p>
                <p data-testid="duck-layer-info">{{ duckRestaurantMessage }}</p>
                <small v-if="onlyCurrentDuckDining && !hasCurrentDiningHex"
                  >尚未查看餐饮六边形，可点击分布格或行程用餐区域。</small
                >
                <button
                  v-if="duckRestaurantState === 'error'"
                  type="button"
                  data-testid="retry-duck-restaurants"
                  @click="emit('retry-duck-restaurants')"
                >
                  重试南京鸭资料
                </button>
                <small>点击图标查看店铺；“带”为熟食外带。</small>
                <button
                  type="button"
                  class="duck-culture-link"
                  data-testid="layer-open-duck-culture"
                  @click="emit('open-duck-culture')"
                >
                  了解南京鸭文化
                </button>
              </template>

              <template v-else-if="layer.id === 'search'">
                <div v-if="currentLodgingName" class="dining-sublayers">
                  <button
                    type="button"
                    role="switch"
                    data-layer-id="currentLodging"
                    class="layer-switch"
                    :class="{
                      'layer-switch--active':
                        layerVisibility.search && layerVisibility.currentLodging,
                    }"
                    :style="{ '--dining-sublayer-color': MAP_MARKER_COLORS.selectedSearch }"
                    :aria-checked="layerVisibility.search && layerVisibility.currentLodging"
                    @click="emit('toggle-layer', 'currentLodging')"
                  >
                    <i class="layer-switch__check" aria-hidden="true"></i><b>当前住宿</b>
                  </button>
                  <small>{{ currentLodgingName }}</small>
                </div>
                <p>显示最近一次搜索得到的候选点；可随时关闭，重新搜索后会替换旧结果。</p>
              </template>

              <template v-else-if="layer.id === 'mealAreas'">
                <p>显示行程中建议就餐位置的范围，点击后可查看周边餐馆。</p>
                <div class="layer-symbol-legend" data-testid="meal-area-legend">
                  <div><i class="legend-meal-hex"></i><span>建议用餐区域（蜂巢）</span></div>
                </div>
              </template>

              <template v-else-if="layer.id === 'route'">
                <p>显示当前方案各段路线；点击路线段后加载实际交通路径。</p>
                <div class="layer-symbol-legend" data-testid="planning-route-legend">
                  <div>
                    <i class="legend-route-number" :style="{ color: MAP_MARKER_COLORS.route }">1</i
                    ><span>行程访问编号（同址合并）</span>
                  </div>
                  <div>
                    <i class="legend-overview-route" :style="{ borderColor: PLAN_ROUTE_COLOR }"></i
                    ><span>当前路线（虚线连线）</span>
                  </div>
                  <div v-for="item in transportLegend" :key="item.mode">
                    <svg class="legend-transport" viewBox="0 0 24 12" aria-hidden="true">
                      <path
                        v-if="item.style.isOutline"
                        d="M2 6H22"
                        :stroke="item.style.outlineColor"
                        stroke-width="8"
                      />
                      <path
                        d="M2 6H22"
                        :stroke="item.style.strokeColor"
                        stroke-width="4"
                        :stroke-dasharray="item.style.strokeStyle === 'dashed' ? '4 3' : undefined"
                      /></svg
                    ><span>{{ item.label }}</span>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </section>

      <section
        class="layer-sidebar__section map-legend accordion-section"
        :class="{ 'accordion-section--open': legendOpen }"
      >
        <h3>
          <button
            type="button"
            class="accordion-trigger"
            :aria-expanded="legendOpen"
            data-testid="map-legend-toggle"
            @click="toggleLegend"
          >
            <span class="section-heading"><LayerIcon name="legend" /><span>图例</span></span>
            <span>{{ legendOpen ? '收起' : '查看' }}</span>
          </button>
        </h3>
        <div class="accordion-body" data-testid="map-legend-body">
          <div v-for="item in markerLegend" :key="item.key">
            <i class="legend-marker" :style="{ '--legend-color': MAP_MARKER_COLORS[item.key] }"
              ><LayerIcon :name="item.key"
            /></i>
            <span>{{ item.label }}</span>
          </div>
          <div>
            <i class="legend-marker legend-metro-interchange"><LayerIcon name="metro" /></i
            ><span>地铁换乘站（黑色图标）</span>
          </div>
          <div><i class="legend-metro-station"></i><span>地铁站点（黑点）</span></div>
          <div data-testid="map-click-legend">
            <i
              class="legend-marker map-symbol-marker metro-map-marker--dot map-click-point"
              :style="{ '--map-marker-color': MAP_MARKER_COLORS.selectedSearch }"
            ></i
            ><span>当前点击区域</span>
          </div>
          <div>
            <span class="legend-density-hexes"
              ><i class="dining-density-legend__blue"></i
              ><i class="dining-density-legend__yellow"></i
              ><i class="dining-density-legend__red"></i></span
            ><span>餐饮数量蜂巢</span>
          </div>
          <div v-if="showDuckLayer">
            <LayerIcon class="legend-duck-density" name="duckDensity" /><span
              >南京鸭分布（斜线蜂巢）</span
            >
          </div>
        </div>
      </section>

      <nav class="workspace-nav" aria-label="产品面板入口">
        <button
          type="button"
          :class="{
            active:
              activePanel === 'overview' ||
              (activePanel === 'diningArea' && diningAreaKind === 'overview'),
          }"
          @click="emit('select-panel', 'overview')"
        >
          <span>当前视图</span><small>南京主要旅游区域</small>
        </button>
        <button
          type="button"
          :class="{ active: activePanel === 'planner' }"
          data-testid="rail-planner-tab"
          @click="emit('select-panel', 'planner')"
        >
          <span>完整表单</span><small>编辑全部规划字段</small>
        </button>
        <button
          type="button"
          :class="{
            active:
              ['plans', 'day'].includes(activePanel) ||
              (activePanel === 'diningArea' && diningAreaKind === 'route'),
          }"
          data-testid="rail-results-tab"
          @click="emit('select-panel', 'plans')"
        >
          <span>方案结果</span
          ><small>{{
            planState === 'loading' ? '正在生成' : hasPlan ? '已有方案' : '等待生成'
          }}</small>
        </button>
      </nav>

      <section class="layer-sidebar__section layer-sidebar__tools">
        <h3><span>真实地图查询</span></h3>
        <slot></slot>
      </section>
    </div>
  </aside>
</template>
