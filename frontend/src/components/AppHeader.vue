<script setup>
import { computed } from 'vue'

import { FEATURE_STATES } from '../ui/featureAvailability'
import {
  forecastLabel,
  tempRange,
  weatherTooltip,
  WEATHER_SOURCE_TEXT,
} from '../ui/weatherPresentation'

const props = defineProps({
  backendMessage: { type: String, required: true },
  backendVersion: { type: String, default: '' },
  dockOpen: { type: Boolean, required: true },
  duckMode: { type: Boolean, required: true },
  lodgingName: { type: String, default: '' },
  planningLabel: { type: String, default: '开始规划' },
  railOpen: { type: Boolean, required: true },
  statusClass: { type: String, required: true },
  weatherState: { type: String, default: 'idle' },
  weatherMessage: { type: String, default: '' },
  weatherDate: { type: String, default: '' },
  weatherDates: { type: Array, default: () => [] },
  weatherData: { type: Object, default: null },
  weatherForecast: { type: Object, default: null },
})

const emit = defineEmits([
  'fit-attractions',
  'focus-lodging',
  'locate',
  'open-export',
  'open-data-sources',
  'retry-connection',
  'retry-weather',
  'start-planning',
  'toggle-dock',
  'toggle-duck',
  'toggle-rail',
])

const weatherTitle = computed(() => {
  if (props.weatherState === 'ready') {
    return weatherTooltip(
      props.weatherDates.length ? props.weatherDates : [props.weatherDate],
      props.weatherData,
    )
  }
  if (props.weatherState === 'error') {
    return `${props.weatherMessage}（点击重试）`
  }
  return props.weatherMessage || FEATURE_STATES.weather.description
})

const NO_FORECAST_TITLE = '暂无'
</script>

<template>
  <header class="app-header">
    <div class="app-brand" aria-label="金陵行前">
      <svg class="app-brand__mark" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M3 19h18M4 19V9l8-5 8 5v10"
          stroke="#C13F2C"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path d="M9 19v-5h6v5" stroke="#4E8C86" stroke-width="1.6" stroke-linejoin="round" />
      </svg>
      <span><b>金陵行前</b><small>南京旅行规划辅助</small></span>
    </div>

    <slot name="search"></slot>

    <nav class="app-header__actions" aria-label="页面工具">
      <button
        type="button"
        class="header-button"
        data-testid="toggle-rail"
        :aria-pressed="railOpen"
        @click="emit('toggle-rail')"
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 3.4 21 8.2 12 13 3 8.2z"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linejoin="round"
          />
          <path
            d="M4.6 12.2 12 16.2l7.4-4M4.6 16.2 12 20.2l7.4-4"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        图层
      </button>
      <button
        type="button"
        class="header-button"
        data-testid="toggle-dock"
        :aria-pressed="dockOpen"
        @click="emit('toggle-dock')"
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect
            x="3.4"
            y="4.4"
            width="17.2"
            height="15.2"
            rx="2.4"
            stroke="currentColor"
            stroke-width="1.6"
          />
          <path d="M14.6 4.4v15.2" stroke="currentColor" stroke-width="1.6" />
        </svg>
        面板
      </button>
    </nav>

    <div class="app-header__status" aria-live="polite">
      <span class="sr-only" :class="statusClass" data-testid="backend-status">{{
        backendMessage
      }}</span>
      <button
        type="button"
        data-testid="header-data-sources"
        data-hover-text="查看数据来源与更新方式"
        aria-haspopup="dialog"
        @click="emit('open-data-sources')"
      >
        数据说明
      </button>
    </div>

    <div class="header-weather" data-testid="header-weather" :data-hover-text="weatherTitle">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="9" cy="9" r="3.4" stroke="#D6A231" stroke-width="1.4" />
        <path
          d="M7 17h9a3.5 3.5 0 0 0 .3-7 4.6 4.6 0 0 0-8.7.9A3.1 3.1 0 0 0 7 17Z"
          stroke="#B6C4BE"
          stroke-width="1.4"
          stroke-linejoin="round"
        />
      </svg>
      <span>
        <template v-if="weatherState === 'ready'">
          <b v-if="weatherForecast">
            {{ weatherDate.slice(5) }} {{ forecastLabel(weatherForecast) }}
          </b>
          <b v-else>{{ NO_FORECAST_TITLE }}</b>
          <small>
            <template v-if="weatherForecast">{{ tempRange(weatherForecast) }} · </template>
            <a
              href="https://www.qweather.com"
              target="_blank"
              rel="noopener noreferrer"
              :aria-label="WEATHER_SOURCE_TEXT"
              >和风天气</a
            >
          </small>
        </template>
        <template v-else-if="weatherState === 'loading'">
          <b>天气加载中…</b>
        </template>
        <template v-else-if="weatherState === 'error'">
          <b>天气暂不可用</b>
          <button
            type="button"
            class="header-weather__retry"
            data-testid="weather-retry"
            @click="emit('retry-weather')"
          >
            重试
          </button>
        </template>
        <template v-else>
          <b>{{ NO_FORECAST_TITLE }}</b>
          <small>{{ weatherMessage || FEATURE_STATES.weather.description }}</small>
        </template>
      </span>
    </div>
    <button
      type="button"
      class="duck-switch"
      data-testid="duck-switch"
      :aria-pressed="duckMode"
      @click="emit('toggle-duck')"
    >
      <span class="duck-switch__track"><i></i></span>
      南京鸭文化
    </button>
    <button
      type="button"
      class="header-plan-button"
      data-testid="header-start-planning"
      @click="emit('start-planning', $event.currentTarget)"
    >
      {{ planningLabel }}
    </button>
    <button
      type="button"
      class="app-header__lodging"
      data-testid="header-lodging"
      :data-hover-text="
        lodgingName ? `当前住宿：${lodgingName}` : '尚未安排住宿，可在住宿安排中设置'
      "
      :disabled="!lodgingName"
      @click="emit('focus-lodging')"
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M4 20V7.6A1.6 1.6 0 0 1 5.6 6h7.8A1.6 1.6 0 0 1 15 7.6V20M15 10h3.4A1.6 1.6 0 0 1 20 11.6V20M2.8 20h18.4M7.2 9.8h1.6M10.6 9.8h1.6M7.2 13h1.6M10.6 13h1.6"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <span class="app-header__lodging-text">
        <small>当前住宿</small>
        <b>{{ lodgingName || '尚未安排' }}</b>
      </span>
    </button>
  </header>
</template>
