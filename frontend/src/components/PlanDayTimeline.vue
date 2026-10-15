<script setup>
import { PLAN_LABELS, ITEM_TYPE_LABELS } from '../planning/planningLabels'
import TransportLegDetails from './TransportLegDetails.vue'
import { planItemTypeLabel } from '../planning/duckDiningPresentation'
import { computed } from 'vue'
import { dayEndAdjustment } from '../planning/dayEndAdjustment'
import { routeSequenceByItemId } from '../planning/routeMeals'

const props = defineProps({
  activeDay: { type: Object, default: null },
  activeDayIndex: { type: Number, required: true },
  activePlan: { type: Object, required: true },
  activePlanType: { type: String, required: true },
  focusedPlanLegId: { type: String, default: '' },
  expandedPlanLegIds: { type: Array, default: () => [] },
})
const emit = defineEmits(['focus-item', 'focus-leg', 'focus-meal', 'select-day'])
const sequenceByItemId = computed(() => routeSequenceByItemId(props.activeDay))
const endAdjustment = computed(() => dayEndAdjustment(props.activeDay))

function typeLabel(item) {
  return planItemTypeLabel(item) || ITEM_TYPE_LABELS[item.type]
}

function legId(leg) {
  return `${leg?.from_item_id || ''}-${leg?.to_item_id || ''}`
}

function showLeg(leg) {
  return Number(leg?.duration_minutes_rounded || 0) > 0 || Boolean(leg?.meals?.length)
}
</script>

<template>
  <div class="day-tabs" role="tablist" aria-label="选择行程日期">
    <button
      v-for="(day, index) in activePlan.days"
      :key="day.date"
      type="button"
      :class="{ active: activeDayIndex === index }"
      :aria-selected="activeDayIndex === index"
      :data-day-index="index"
      role="tab"
      @click="emit('select-day', index)"
    >
      第 {{ index + 1 }} 天<small>{{ day.date.slice(5) }}</small>
    </button>
  </div>

  <section v-if="activeDay" class="timeline-card" data-testid="plan-timeline">
    <div class="timeline-heading">
      <strong>{{ PLAN_LABELS[activePlanType] }} · 第 {{ activeDayIndex + 1 }} 天</strong>
      <span>{{ activeDay.items[0]?.start_time }}—{{ activeDay.items.at(-1)?.end_time }}</span>
    </div>
    <p
      v-if="endAdjustment"
      class="timeline-end-adjustment"
      :data-hover-text="endAdjustment.reason"
      data-testid="day-timeline-end-adjustment"
    >
      {{ endAdjustment.label }}
    </p>
    <ol class="timeline-list">
      <li v-for="(item, index) in activeDay.items" :key="item.item_id" :class="`node-${item.type}`">
        <TransportLegDetails
          v-if="index && showLeg(activeDay.legs[index - 1])"
          :leg="activeDay.legs[index - 1]"
          :active="expandedPlanLegIds.includes(legId(activeDay.legs[index - 1]))"
          @focus-leg="emit('focus-leg', $event)"
          @focus-meal="emit('focus-meal', $event)"
        />
        <button
          type="button"
          :aria-label="`${item.start_time} 至 ${item.end_time}，${typeLabel(item)}：${item.name}`"
          :data-plan-item="item.item_id"
          @click="emit('focus-item', item)"
        >
          <time>{{ item.start_time }}</time>
          <i>{{ sequenceByItemId[item.item_id] }}</i>
          <span>
            <small>{{ typeLabel(item) }}</small>
            <b :data-hover-text="item.name">{{ item.name }}</b>
            <em>
              {{ item.end_time }} · {{ item.duration_minutes }} 分钟
              <span v-if="item.ticket_cost"> · 门票 ¥{{ item.ticket_cost }}</span>
            </em>
          </span>
        </button>
      </li>
    </ol>
  </section>
</template>
