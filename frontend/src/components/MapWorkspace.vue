<script setup>
import { PLAN_LABELS } from '../planning/planningLabels'
import { onBeforeUnmount, ref } from 'vue'
import LayerIcon from './LayerIcon.vue'

defineProps({
  activeDay: { type: Object, default: null },
  activeDayIndex: { type: Number, required: true },
  activePlanType: { type: String, required: true },
  accommodationAreasVisible: { type: Boolean, default: false },
  activeDuckNodeCount: { type: Number, default: 0 },
  backendState: { type: String, required: true },
  duckFlavorCount: { type: Number, default: 0 },
  duckRestaurantCount: { type: Number, default: 0 },
  mapMessage: { type: String, required: true },
  mapState: { type: String, required: true },
  landmarksVisible: { type: Boolean, required: true },
  dockOpen: { type: Boolean, required: true },
  panelsHidden: { type: Boolean, required: true },
  railOpen: { type: Boolean, required: true },
  selectedCoordinateText: { type: String, required: true },
  selectedLocationLabel: { type: String, required: true },
})

const emit = defineEmits([
  'fit-attractions',
  'locate',
  'retry-connection',
  'toggle-dock',
  'toggle-landmarks',
  'toggle-panels',
  'toggle-rail',
])

const DOCK_DRAG_THRESHOLD = 48
const dockHandleOffset = ref(0)
const dockHandleDragging = ref(false)
let dockHandlePointerId = null
let dockHandleStartX = 0
let suppressDockHandleClick = false
let dockHandleTimer = null

onBeforeUnmount(() => clearTimeout(dockHandleTimer))

function handleDockHandlePointerDown(event) {
  if (event.button !== 0) return
  dockHandlePointerId = event.pointerId
  dockHandleStartX = event.clientX
  dockHandleOffset.value = 0
  dockHandleDragging.value = true
  suppressDockHandleClick = false
  event.currentTarget.setPointerCapture?.(event.pointerId)
}

function handleDockHandlePointerMove(event) {
  if (!dockHandleDragging.value || event.pointerId !== dockHandlePointerId) return
  dockHandleOffset.value = Math.min(96, Math.max(0, dockHandleStartX - event.clientX))
  if (dockHandleOffset.value > 4) suppressDockHandleClick = true
}

function finishDockHandleDrag(event) {
  if (!dockHandleDragging.value || event.pointerId !== dockHandlePointerId) return
  event.currentTarget.releasePointerCapture?.(event.pointerId)
  const shouldOpen = dockHandleOffset.value >= DOCK_DRAG_THRESHOLD
  dockHandleDragging.value = false
  dockHandlePointerId = null
  dockHandleOffset.value = 0
  if (shouldOpen) emit('toggle-dock')
  if (suppressDockHandleClick) {
    clearTimeout(dockHandleTimer)
    dockHandleTimer = setTimeout(() => {
      dockHandleTimer = null
      suppressDockHandleClick = false
    }, 0)
  }
}

function handleDockHandleClick() {
  if (suppressDockHandleClick) {
    suppressDockHandleClick = false
    return
  }
  emit('toggle-dock')
}
</script>

<template>
  <section
    class="map-stage map-workspace"
    :class="{ 'map-workspace--accommodation-areas': accommodationAreasVisible }"
    data-testid="map-workspace"
    :data-attraction-icons="landmarksVisible ? 'visible' : 'hidden'"
    aria-label="南京交互地图"
  >
    <div class="map-workspace__canvas">
      <slot></slot>
      <div class="map-status" :class="`map-status-${mapState}`">
        <i></i>
        <span>
          <b>{{ mapState === 'ready' ? '先看地图，再做计划。' : '地图状态' }}</b>
          <small>{{ mapMessage }}</small>
        </span>
      </div>
      <div class="map-control-stack" aria-label="地图快捷操作">
        <button
          type="button"
          data-testid="map-locate-button"
          aria-describedby="map-locate-description"
          @click="emit('locate')"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="1.6" />
            <path
              d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
            /></svg
          ><span class="sr-only">当前位置</span>
          <span id="map-locate-description" class="map-control-tooltip" role="tooltip">
            定位到我的当前位置
          </span>
        </button>
        <button
          type="button"
          data-testid="map-fit-button"
          aria-describedby="map-fit-description"
          @click="emit('fit-attractions')"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M5 8V5h3M16 5h3v3M19 16v3h-3M8 19H5v-3"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
            />
            <path
              d="M7.5 15.5 11 9l2.2 3 1.3-1.6 2 5.1h-9Z"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linejoin="round"
            /></svg
          ><span class="sr-only">{{ activeDay ? '当前行程全景' : '全部景点' }}</span>
          <span id="map-fit-description" class="map-control-tooltip" role="tooltip">
            {{ activeDay ? '查看当天行程全景' : '查看全部景点' }}
          </span>
        </button>
        <button
          type="button"
          :class="{ active: landmarksVisible }"
          :aria-pressed="landmarksVisible"
          aria-describedby="map-landmark-description"
          data-testid="map-landmark-toggle"
          @click="emit('toggle-landmarks')"
        >
          <LayerIcon name="landmarks" /><span class="sr-only">显示或隐藏景点专属图标</span>
          <span id="map-landmark-description" class="map-control-tooltip" role="tooltip">
            {{ landmarksVisible ? '隐藏景点专属图标' : '显示景点专属图标' }}
          </span>
        </button>
        <button
          type="button"
          :class="{ active: panelsHidden }"
          :aria-pressed="panelsHidden"
          aria-describedby="map-panels-description"
          data-testid="map-panels-toggle"
          @click="emit('toggle-panels')"
        >
          <LayerIcon :name="panelsHidden ? 'restore' : 'fullscreen'" />
          <span class="sr-only">{{ panelsHidden ? '恢复两侧面板' : '隐藏两侧面板' }}</span>
          <span id="map-panels-description" class="map-control-tooltip" role="tooltip">
            {{ panelsHidden ? '恢复两侧面板' : '隐藏两侧面板，地图铺满' }}
          </span>
        </button>
      </div>
      <button
        v-if="!panelsHidden && !dockOpen"
        type="button"
        class="map-dock-pull-handle"
        :class="{ 'map-dock-pull-handle--dragging': dockHandleDragging }"
        :style="{ '--dock-handle-offset': `${dockHandleOffset}px` }"
        data-testid="map-restore-dock"
        aria-label="向左拖动或点击以展开信息侧栏"
        data-hover-text="向左拖动展开信息侧栏"
        @click="handleDockHandleClick"
        @pointerdown="handleDockHandlePointerDown"
        @pointermove="handleDockHandlePointerMove"
        @pointerup="finishDockHandleDrag"
        @pointercancel="finishDockHandleDrag"
      >
        <span>向左拉开信息栏</span>
      </button>
      <button
        v-if="!panelsHidden && !railOpen"
        type="button"
        class="map-panel-restore map-panel-restore--rail"
        data-testid="map-restore-rail"
        aria-label="恢复图层侧栏"
        data-hover-text="恢复图层侧栏"
        @click="emit('toggle-rail')"
      >
        <LayerIcon name="layers" />
      </button>
      <div class="point-card" data-testid="selected-location-card">
        <small>当前地图选点</small>
        <b data-testid="selected-location-label">{{ selectedLocationLabel }}</b>
        <code>{{ selectedCoordinateText }}</code>
      </div>
      <div v-if="activeDay" class="route-legend">
        <b>{{ PLAN_LABELS[activePlanType] }} · 第 {{ activeDayIndex + 1 }} 天</b>
        <span>数字表示行程顺序</span>
      </div>
      <div v-if="mapState === 'error'" class="map-error-card" data-testid="map-error-card">
        <strong>地图暂时不能使用</strong>
        <p>{{ mapMessage }}</p>
        <button type="button" @click="emit('retry-connection')">重新连接并加载地图</button>
        <small>
          {{
            backendState === 'connected'
              ? '地图暂不可用时，仍可查看景点资料和行程。'
              : '暂时无法连接服务，请检查网络或稍后重试。'
          }}
        </small>
      </div>
      <div class="duck-map-decoration" aria-hidden="true">
        <div class="duck-map-decoration__texture"></div>
        <div class="duck-map-decoration__bar">
          <div class="duck-map-decoration__title">
            <strong>NANJING CULTURE LAYER</strong><b>南京鸭游图鉴</b>
          </div>
          <div class="duck-map-decoration__stat">
            <b data-testid="duck-total-location-count">{{ duckRestaurantCount }}</b
            ><small>鸭味地点</small>
          </div>
          <div class="duck-map-decoration__stat">
            <b data-testid="duck-total-flavor-count">{{ duckFlavorCount }}</b
            ><small>鸭类风味</small>
          </div>
          <div class="duck-map-decoration__stat">
            <b>{{ activeDuckNodeCount }}</b
            ><small>品鉴计划</small>
          </div>
          <div class="duck-map-decoration__city">
            <b>金陵食鸭</b><span>盐水 · 板鸭 · 烤鸭</span>
          </div>
          <div class="duck-map-decoration__bar-duck">
            <svg viewBox="0 0 120 80" fill="none">
              <path
                d="M26 59c0-15 12-27 27-27h22l10-11 4 15h9c0 23-19 41-42 41H41c-8 0-15-7-15-15v-3Z"
                fill="#F6C453"
              />
              <circle cx="70" cy="27" r="3" fill="#3A1F10" />
              <path d="M84 23h17l-12 9" fill="#D97A2B" />
            </svg>
          </div>
        </div>
      </div>
    </div>
    <slot name="timeline"></slot>
  </section>
</template>
