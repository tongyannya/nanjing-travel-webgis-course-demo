<script setup>
import { computed } from 'vue'
import { buildWeatherRows, WEATHER_RANGE_TEXT, weatherTimestamp } from '../ui/weatherPresentation'

const props = defineProps({
  dates: { type: Array, required: true },
  weatherData: { type: Object, default: null },
  weatherState: { type: String, default: 'idle' },
  weatherMessage: { type: String, default: '' },
})
const emit = defineEmits(['retry'])
const rows = computed(() => buildWeatherRows(props.dates, props.weatherData))
const rainy = computed(() => props.weatherState === 'ready' && rows.value.some((row) => row.rainy))
</script>

<template>
  <section class="trip-weather-summary" data-testid="wizard-trip-weather" aria-live="polite">
    <b>行程期间天气</b>
    <p v-if="weatherState === 'loading' || weatherState === 'idle'">天气加载中…</p>
    <template v-else>
      <p v-for="row in rows" :key="row.date" :data-weather-date="row.date">
        <span>{{ row.date }}</span>
        <span>{{ weatherState === 'ready' ? row.text : '暂无' }}</span>
      </p>
      <small v-if="weatherState === 'ready'">
        {{ weatherTimestamp(weatherData) }}；{{ WEATHER_RANGE_TEXT }}
      </small>
      <p v-else-if="weatherState === 'error'" class="trip-weather-summary__error">
        天气暂不可用
        <button type="button" class="text-button" @click="emit('retry')">重试</button>
      </p>
    </template>
    <p v-if="rainy" class="trip-weather-summary__rain" data-testid="wizard-weather-rain">
      行程期间可能有阴雨天气
    </p>
    <small
      >天气来源于<a href="https://www.qweather.com" target="_blank" rel="noopener noreferrer"
        >和风天气</a
      >，仅供参考</small
    >
  </section>
</template>

<style>
.trip-weather-summary {
  display: grid;
  gap: 5px;
  margin-top: 16px;
  padding: 12px 14px;
  border: 1px solid var(--teal);
  border-radius: var(--radius-md);
  background: var(--teal-wash);
  color: var(--bone-2);
  font-size: 13px;
}
.trip-weather-summary > b {
  color: var(--bone);
}
.trip-weather-summary p {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 0;
}
.trip-weather-summary small {
  color: var(--bone-2);
  font-size: 12px;
}
.trip-weather-summary__rain {
  color: var(--gold);
}
.trip-weather-summary a {
  color: inherit;
}
.trip-weather-summary a:hover {
  color: var(--bone);
  text-decoration: underline;
}
</style>
