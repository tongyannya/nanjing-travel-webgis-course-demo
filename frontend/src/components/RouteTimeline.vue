<script setup>
import { PLAN_SHORT_LABELS } from '../planning/planningLabels'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { dayEndAdjustment } from '../planning/dayEndAdjustment'

import { planItemTypeLabel } from '../planning/duckDiningPresentation'
import { presentTransportLeg } from '../planning/transitPresentation'
import {
  mealReservationMinutes,
  routeMealItems,
  routeMealText,
  routeSequenceByItemId,
} from '../planning/routeMeals'

const props = defineProps({
  activeDay: { type: Object, default: null },
  activeDayIndex: { type: Number, required: true },
  activePlan: { type: Object, default: null },
  activePlanType: { type: String, required: true },
  focusedPlanLegId: { type: String, default: '' },
  expandedPlanLegIds: { type: Array, default: () => [] },
  allPlanLegsExpanded: { type: Boolean, default: false },
})
const emit = defineEmits([
  'focus-item',
  'focus-leg',
  'focus-meal',
  'select-day',
  'toggle-all-legs',
  'resize',
])
const timeline = ref(null)
let sizeObserver
watch(timeline, (element) => {
  sizeObserver?.disconnect()
  if (!element || typeof ResizeObserver !== 'function') return
  sizeObserver = new ResizeObserver(() => {
    const height = Math.ceil(element.getBoundingClientRect().height)
    if (height) emit('resize', height)
  })
  sizeObserver.observe(element)
})
onBeforeUnmount(() => sizeObserver?.disconnect())
const mealItems = computed(() => routeMealItems(props.activeDay))
const sequenceByItemId = computed(() => routeSequenceByItemId(props.activeDay))
const endAdjustment = computed(() => dayEndAdjustment(props.activeDay))

const visitMinutes = computed(() =>
  (props.activeDay?.items || [])
    .filter((item) => item.type === 'attraction')
    .reduce((sum, item) => sum + item.duration_minutes, 0),
)
const travelMinutes = computed(() =>
  (props.activeDay?.legs || []).reduce(
    (sum, leg) => sum + Number(leg.duration_minutes_rounded || 0),
    0,
  ),
)
const ticketCost = computed(() =>
  (props.activeDay?.items || []).reduce((sum, item) => sum + Number(item.ticket_cost || 0), 0),
)

const TIMELINE_START = 8 * 60
const TIMELINE_END = 21 * 60

function timeMinutes(value) {
  const [hour, minute] = String(value || '00:00')
    .split(':')
    .map(Number)
  return hour * 60 + minute
}

const timelineBounds = computed(() => {
  const values = (props.activeDay?.items || []).flatMap((item) => [
    timeMinutes(item.start_time),
    timeMinutes(item.end_time),
  ])
  if (endAdjustment.value) values.push(endAdjustment.value.start, endAdjustment.value.end)
  const start = Math.floor(Math.min(TIMELINE_START, ...values) / 60) * 60
  const end = Math.ceil(Math.max(TIMELINE_END, ...values) / 60) * 60
  return { start, end: Math.max(end, start + 60) }
})

function timelinePercent(value) {
  const { start, end } = timelineBounds.value
  return ((value - start) / (end - start)) * 100
}

const rulerHours = computed(() => {
  const firstHour = timelineBounds.value.start / 60
  const lastHour = timelineBounds.value.end / 60
  return Array.from({ length: lastHour - firstHour + 1 }, (_, index) => firstHour + index)
})

function minuteLabel(value) {
  const hour = Math.floor(value / 60)
  const minute = value % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

const timelineBlocks = computed(() => {
  const items = props.activeDay?.items || []
  const legs = props.activeDay?.legs || []
  const blocks = []
  items.forEach((item, index) => {
    const start = timeMinutes(item.start_time)
    const end = Math.max(start, timeMinutes(item.end_time))
    if (index > 0) {
      const previousEnd = timeMinutes(items[index - 1].end_time)
      const leg = legs[index - 1] || {}
      if (
        start > previousEnd &&
        (Number(leg.duration_minutes_rounded || 0) > 0 || mealReservationMinutes(leg))
      ) {
        const presentation = presentTransportLeg(leg)
        blocks.push({
          key: `leg-${item.item_id}`,
          type: 'leg',
          name: `${presentation.shortLabel}${mealReservationMinutes(leg) ? ' · 用餐1h' : ''}`,
          title: `${minuteLabel(previousEnd)}—${minuteLabel(start)} · ${presentation.accessibleLabel} ${(leg.meals || []).map(routeMealText).join('；')}`,
          start: previousEnd,
          end: start,
          compact: start - previousEnd <= 30,
          focusItem: item,
          leg,
          legId: `${leg.from_item_id || items[index - 1].item_id}-${leg.to_item_id || item.item_id}`,
        })
      }
    }
    blocks.push({
      key: item.item_id,
      type: item.type,
      name: item.name,
      title: [`${minuteLabel(start)}—${minuteLabel(end)}`, item.name, planItemTypeLabel(item)]
        .filter(Boolean)
        .join(' · '),
      start,
      end,
      compact: end - start <= 30,
      focusItem: item,
      itemId: item.item_id,
    })
  })
  return blocks.map((block) => {
    const left = Math.max(0, Math.min(100, timelinePercent(block.start)))
    const right = Math.max(left, Math.min(100, timelinePercent(block.end)))
    return {
      ...block,
      title:
        block.end > (endAdjustment.value?.start ?? Infinity)
          ? `${block.title} · ${endAdjustment.value.label}。${endAdjustment.value.reason}`
          : block.title,
      left,
      width: Math.max(0.2, right - left),
      startLabel: minuteLabel(block.start),
    }
  })
})

function focusWithKeyboard(event) {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return
  const items = [...event.currentTarget.parentElement.querySelectorAll('.route-timeline__item')]
  const current = items.indexOf(event.currentTarget)
  const next = event.key === 'ArrowRight' ? current + 1 : current - 1
  items.at(Math.max(0, Math.min(items.length - 1, next)))?.focus()
  event.preventDefault()
}

function activateBlock(block) {
  if (block.type === 'leg') emit('focus-leg', block.leg)
  else emit('focus-item', block.focusItem)
}
</script>

<template>
  <section
    v-if="activeDay"
    ref="timeline"
    class="route-timeline"
    data-testid="map-route-timeline"
    aria-label="地图行程时间轴"
  >
    <div class="route-timeline__heading">
      <span
        ><small>当前方案</small
        ><b>{{ PLAN_SHORT_LABELS[activePlanType] }} · 第 {{ activeDayIndex + 1 }} 天</b></span
      >
      <div class="route-timeline__day-controls">
        <nav v-if="activePlan?.days.length > 1" aria-label="地图时间轴日期">
          <button
            v-for="(day, index) in activePlan.days"
            :key="day.date"
            type="button"
            :class="{ active: activeDayIndex === index }"
            :data-timeline-day-index="index"
            @click="emit('select-day', index)"
          >
            第 {{ index + 1 }} 天
          </button>
        </nav>
        <small>点击下方文字或时间轴查看详细信息</small>
      </div>
      <div class="route-timeline__meta">
        <span
          >在馆 <b>{{ (visitMinutes / 60).toFixed(1) }}h</b></span
        >
        <span
          >路上 <b>{{ (travelMinutes / 60).toFixed(1) }}h</b></span
        >
        <span
          >门票 <b>¥{{ ticketCost }}</b></span
        >
        <span
          >结束 <b>{{ activeDay.items.at(-1)?.end_time }}</b></span
        >
      </div>
    </div>
    <div class="route-timeline__meals" aria-label="途中用餐区域">
      <button
        v-for="item in mealItems"
        :key="item.item_id"
        type="button"
        data-map-route-meal
        @click="emit('focus-meal', item.route_meal)"
      >
        {{ sequenceByItemId[item.item_id] }} · {{ item.name }} · 预留1小时 · 查看区域
      </button>
      <button
        v-if="activeDay.legs?.length"
        type="button"
        class="route-timeline__route-toggle text-action"
        data-testid="timeline-toggle-all-routes"
        :aria-pressed="allPlanLegsExpanded"
        @click="emit('toggle-all-legs')"
      >
        {{ allPlanLegsExpanded ? '关闭详细交通路线' : '展示详细交通路线' }}
      </button>
    </div>
    <div class="route-timeline__body">
      <div class="route-timeline__ruler" aria-hidden="true">
        <span
          v-for="(hour, index) in rulerHours"
          :key="hour"
          :class="{
            'is-first': index === 0,
            'is-last': index === rulerHours.length - 1,
          }"
          :style="{ left: `${timelinePercent(hour * 60)}%` }"
          >{{ String(hour).padStart(2, '0') }}:00</span
        >
      </div>
      <div class="route-timeline__track">
        <button
          v-for="block in timelineBlocks"
          :key="block.key"
          type="button"
          :class="[
            `route-timeline__item route-timeline__item--${block.type}`,
            {
              'route-timeline__item--compact': block.compact,
              'route-timeline__item--focused': expandedPlanLegIds.includes(block.legId),
            },
          ]"
          :style="{ left: `${block.left}%`, width: `${block.width}%` }"
          :data-hover-text="block.title || block.name"
          :aria-label="block.title || block.name"
          :data-map-plan-item="block.itemId"
          :data-map-plan-leg="block.legId"
          @click="activateBlock(block)"
          @keydown="focusWithKeyboard"
        >
          <time>{{ block.startLabel }}</time
          ><span>{{
            block.compact && block.type === 'attraction' ? block.name.slice(0, 1) : block.name
          }}</span>
        </button>
      </div>
      <div
        v-if="endAdjustment"
        class="route-timeline__adjustment"
        data-testid="timeline-end-adjustment"
      >
        <span :data-hover-text="endAdjustment.reason">{{ endAdjustment.label }}</span>
        <div class="route-timeline__extension-track">
          <div
            class="route-timeline__extension"
            :style="{
              left: `${timelinePercent(endAdjustment.start)}%`,
              width: `${timelinePercent(endAdjustment.end) - timelinePercent(endAdjustment.start)}%`,
            }"
            :data-hover-text="`${endAdjustment.label}。${endAdjustment.reason}`"
            :aria-label="`${endAdjustment.label}。${endAdjustment.reason}`"
            data-testid="timeline-extension-segment"
            tabindex="0"
          />
        </div>
      </div>
    </div>
  </section>
  <section
    v-else
    class="route-timeline route-timeline--empty"
    data-testid="map-route-timeline"
    aria-label="地图行程时间轴"
  >
    <span><b>先看地图，再做计划。</b> 生成方案后，这里会显示可点击的逐日时间轴。</span>
  </section>
</template>
