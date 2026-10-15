<script setup>
import { computed } from 'vue'

import { presentTransportLeg } from '../planning/transitPresentation'
import { routeMealText } from '../planning/routeMeals'

const props = defineProps({
  leg: { type: Object, required: true },
  active: { type: Boolean, default: false },
})
const emit = defineEmits(['focus-leg', 'focus-meal'])

const presentation = computed(() => presentTransportLeg(props.leg))
</script>

<template>
  <div
    class="leg-line"
    :class="`leg-line--${presentation.status}`"
    :data-plan-leg="`${leg.from_item_id || ''}-${leg.to_item_id || ''}`"
    :data-transit-status="presentation.status"
    :data-transport-mode="leg.mode"
  >
    <button
      type="button"
      class="leg-line__map-toggle"
      :class="{ active }"
      :aria-label="`${active ? '关闭详细路线' : '在地图展开'}：${presentation.accessibleLabel}`"
      data-map-expand-leg
      @click="emit('focus-leg', leg)"
    >
      <span class="leg-line__heading">
        <strong>{{ presentation.modeLabel }}</strong>
        <span>{{ presentation.durationLabel }}</span>
      </span>
      <small>{{ active ? '关闭详细路线' : '在地图展开' }}</small>
    </button>

    <p v-for="meal in leg.meals || []" :key="meal.meal_kind" class="leg-line__meal">
      <span>{{ meal.start_time }}—{{ meal.end_time }} · {{ routeMealText(meal) }}</span>
      <button
        v-if="meal.area"
        type="button"
        data-route-meal
        :data-meal-kind="meal.meal_kind"
        @click="emit('focus-meal', meal)"
      >
        查看用餐区域
      </button>
    </p>

    <template v-if="presentation.status === 'details'">
      <p class="leg-line__summary">{{ presentation.summary }}</p>
      <div class="leg-line__meta" aria-label="公共交通概要">
        <span>{{ presentation.walkingLabel }}</span>
        <span>{{ presentation.transferLabel }}</span>
      </div>
      <details v-if="presentation.segments.length || presentation.transfers.length">
        <summary>查看上下车站与分段</summary>
        <ol v-if="presentation.segments.length" class="leg-segments">
          <li v-for="(segment, segmentIndex) in presentation.segments" :key="segmentIndex">
            <span>{{ segment.modeLabel }}</span>
            <b>{{ segment.lineLabel }}</b>
            <small v-if="segment.stopLabel">{{ segment.stopLabel }}</small>
            <em v-if="segment.durationLabel">{{ segment.durationLabel }}</em>
          </li>
        </ol>
        <ul v-if="presentation.transfers.length" class="leg-transfers">
          <li v-for="(transfer, transferIndex) in presentation.transfers" :key="transferIndex">
            <b>{{ transfer.routeLabel }}</b>
            <small>{{ transfer.stationLabel }}</small>
          </li>
        </ul>
      </details>
    </template>

    <p v-else-if="presentation.status === 'fallback'" class="leg-line__fallback">
      {{ presentation.summary }}
    </p>
  </div>
</template>
