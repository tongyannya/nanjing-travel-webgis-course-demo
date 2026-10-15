<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  duckVisible: { type: Boolean, default: false },
  areaPicking: { type: Boolean, default: false },
  areaSelected: { type: Boolean, default: false },
  pickingSession: { type: Object, default: null },
  getAreaRects: { type: Function, default: () => [] },
})
const storageKey = 'nanjing-webgis-first-use-hints-v1'
const seen = new Set()
let suppressed = []
try {
  const stored = JSON.parse(localStorage.getItem(storageKey) || '[]')
  if (Array.isArray(stored))
    suppressed = stored.filter((kind) => ['duck', 'search', 'areas'].includes(kind))
} catch {
  /* Keep session hints usable when storage is unavailable. */
}
const active = ref('')
const visible = ref(false)
const panel = ref(null)
const position = ref({})
const holes = ref([])
const leaders = ref([])
const texts = {
  duck: '小鸭子可以拖动，也可以点击查看讲解。',
  search:
    '可以点击图中已有图标，也可以从搜索框搜索任意地点，显示在地图上后再点击搜索图标。选择后，通过左下角的“选好了”进入下一题。',
  areas:
    '点击卡片或圆形选择合适的住宿片区；点击圆形还可以查看范围内酒店。选择后，通过左下角的“选好了”进入下一题。',
}
const titles = { search: '选择住宿地点', areas: '选择住宿片区' }
const mask = computed(() => {
  const outer = `M0 0H${window.innerWidth}V${window.innerHeight}H0Z`
  return `path(evenodd, "${outer}${holes.value.map((r) => `M${r.x} ${r.y}h${r.width}v${r.height}h-${r.width}Z`).join('')}")`
})
let timer
function dismiss(forever = false) {
  if (forever) {
    suppressed = [...new Set([...suppressed, active.value])]
    try {
      localStorage.setItem(storageKey, JSON.stringify(suppressed))
    } catch {
      /* Session dismissal still works. */
    }
  }
  active.value = ''
  visible.value = false
}
function rect(selector) {
  const element = document.querySelector(selector)
  if (!element?.getClientRects().length) return null
  const r = element.getBoundingClientRect()
  return r.width && r.height ? { x: r.x, y: r.y, width: r.width, height: r.height } : null
}
function union(rects, margin = 8) {
  if (!rects.length) return { x: 0, y: 0, width: 0, height: 0 }
  const x = Math.max(0, Math.min(...rects.map((r) => r.x)) - margin)
  const y = Math.max(0, Math.min(...rects.map((r) => r.y)) - margin)
  const right = Math.min(window.innerWidth, Math.max(...rects.map((r) => r.x + r.width)) + margin)
  const bottom = Math.min(
    window.innerHeight,
    Math.max(...rects.map((r) => r.y + r.height)) + margin,
  )
  return { x, y, width: right - x, height: bottom - y }
}
function makeLeader(targets, circular = false, duck = false) {
  const box = panel.value?.getBoundingClientRect()
  if (!box || !targets.length) {
    return null
  }
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  const target = targets.reduce((nearest, item) => {
    const distance = (r) => Math.hypot(r.x + r.width / 2 - center.x, r.y + r.height / 2 - center.y)
    return distance(item) < distance(nearest) ? item : nearest
  })
  const end = { x: target.x + target.width / 2, y: target.y + target.height / 2 }
  const dx = end.x - center.x
  const dy = end.y - center.y
  if (!dx && !dy) return
  const startScale = Math.min(box.width / 2 / Math.abs(dx), box.height / 2 / Math.abs(dy))
  const endScale = circular
    ? Math.min(target.width, target.height) / 2 / Math.hypot(dx, dy)
    : Math.min(target.width / 2 / Math.abs(dx), target.height / 2 / Math.abs(dy))
  return {
    x1: duck ? box.right : center.x + dx * startScale,
    y1: duck ? box.bottom : center.y + dy * startScale,
    x2: duck ? target.x + target.width * 0.25 : end.x - dx * endScale,
    y2: duck ? target.y + target.height * 0.2 : end.y - dy * endScale,
    color: getComputedStyle(panel.value).borderTopColor,
  }
}
function measure() {
  const kind = props.areaPicking
    ? 'areas'
    : ['lodging', 'attraction_nearby'].includes(props.pickingSession?.purpose)
      ? 'search'
      : props.duckVisible
        ? 'duck'
        : ''
  if (active.value && active.value !== kind) dismiss()
  if (!active.value && (!kind || seen.has(kind) || suppressed.includes(kind))) {
    visible.value = false
    return
  }
  const modal = [
    ...document.querySelectorAll(
      'dialog[open], .dialog-backdrop, .planning-wizard-backdrop:not(.first-use-veil), .project-introduction-backdrop, .help-tutorial',
    ),
  ].some((e) => e.getClientRects().length)
  const anchor =
    kind === 'duck'
      ? rect('[data-testid=draggable-duck-guide-duck]')
      : rect(
          kind === 'areas'
            ? '[data-testid=accommodation-area-picking]'
            : '[data-testid=picking-toast]',
        )
  const regions = kind === 'areas' ? props.getAreaRects() : []
  if (
    !active.value &&
    kind &&
    !modal &&
    anchor &&
    (kind !== 'areas' || regions.length) &&
    !seen.has(kind) &&
    !suppressed.includes(kind)
  ) {
    active.value = kind
    seen.add(kind)
  }
  if (
    (kind === 'areas' && props.areaSelected) ||
    (kind === 'search' && props.pickingSession?.candidate)
  )
    dismiss()
  visible.value = Boolean(active.value && anchor && !modal)
  if (visible.value) {
    const height = panel.value?.getBoundingClientRect().height || 150
    const width = 300
    const search = rect('[data-testid=top-search]')
    const topTarget = kind === 'areas' ? union(regions, 0) : search
    const top =
      kind === 'duck' ? anchor.y - height - 12 : ((topTarget?.y || 80) + anchor.y) / 2 - height / 2
    const left = kind === 'duck' ? anchor.x - width - 12 : anchor.x + 64
    position.value = {
      width: `${width}px`,
      top: `${Math.max(80, Math.min(top, window.innerHeight - height - 12))}px`,
      left: `${Math.max(12, Math.min(left, window.innerWidth - width - 12))}px`,
    }
    const targets =
      kind === 'search'
        ? [
            rect('[data-testid=top-search]'),
            rect('.search-popover'),
            rect('[role=listbox]'),
          ].filter(Boolean)
        : [
            ...regions,
            ...[...document.querySelectorAll('.accommodation-map-card')]
              .filter((e) => e.getClientRects().length)
              .map((e) => e.getBoundingClientRect()),
          ]
    holes.value = kind === 'duck' ? [] : [union(targets), union([anchor])]
    leaders.value =
      kind === 'duck'
        ? [makeLeader([anchor], false, true)].filter(Boolean)
        : [
            makeLeader(kind === 'search' ? [search].filter(Boolean) : regions, kind === 'areas'),
            makeLeader([anchor]),
          ].filter(Boolean)
  }
  timer = kind ? setTimeout(measure, 100) : undefined
}
watch(
  () => [props.duckVisible, props.areaPicking, props.areaSelected, props.pickingSession],
  () => {
    clearTimeout(timer)
    measure()
  },
  { flush: 'post' },
)
onMounted(measure)
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible && active !== 'duck'"
      class="planning-wizard-backdrop first-use-veil"
      :style="{ clipPath: mask }"
      data-testid="first-use-veil"
    ></div>
    <svg
      v-if="visible && leaders.length"
      class="first-use-leader"
      aria-hidden="true"
      data-testid="first-use-leader"
    >
      <line
        v-for="(leader, index) in leaders"
        :key="index"
        :x1="leader.x1"
        :y1="leader.y1"
        :x2="leader.x2"
        :y2="leader.y2"
        :stroke="leader.color"
        stroke-width="2"
      />
    </svg>
    <aside
      v-if="visible"
      ref="panel"
      class="map-info-window first-use-hint"
      :style="position"
      role="note"
      :data-first-use="active"
      data-testid="first-use-hint"
    >
      <strong v-if="active !== 'duck'">{{ titles[active] }}</strong>
      <p>{{ texts[active] }}</p>
      <button
        type="button"
        class="text-button"
        data-testid="first-use-never"
        @click="dismiss(true)"
      >
        不再提示
      </button>
    </aside>
  </Teleport>
</template>

<style scoped>
/* Only placement is new; window, text action and blur reuse existing UI. */
.first-use-veil {
  pointer-events: none;
  padding: 0;
}
.first-use-hint {
  position: fixed;
  z-index: 80;
}
.first-use-leader {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 80;
  pointer-events: none;
}
.first-use-hint::after {
  display: none;
}
.first-use-hint > .text-button {
  display: block;
  margin-left: auto;
  color: var(--layer-accent);
}
</style>
