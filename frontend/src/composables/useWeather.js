import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { apiRequest } from '../services/api'

export const NO_FORECAST_MESSAGE = '暂时无法获取该日期天气'

export function todayInNanjing(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
}

function errorText(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback
}

export function useWeather({ activeDay, activePlan = ref(null) }) {
  const weatherState = ref('idle') // idle | loading | ready | empty | error
  const weatherMessage = ref('')
  const weatherData = ref(null)

  // Bumped on every run; stale responses from fast date switches are dropped.
  let requestSequence = 0
  let controller = null
  let disposed = false

  const weatherDate = computed(() => {
    const planDate = activeDay.value?.date || activePlan.value?.days?.[0]?.date
    if (planDate) return planDate
    return todayInNanjing()
  })

  const weatherDates = computed(() =>
    activePlan.value?.days?.length
      ? activePlan.value.days.map((day) => day.date)
      : [weatherDate.value],
  )

  const activeForecast = computed(() => {
    const date = weatherDate.value
    if (!date || !weatherData.value?.forecast_days?.length) return null
    return weatherData.value.forecast_days.find((day) => day.date === date) || null
  })

  const dateInRange = computed(
    () => weatherState.value === 'ready' && activeForecast.value !== null,
  )

  async function loadWeather() {
    if (disposed) return
    controller?.abort()
    controller = new AbortController()
    requestSequence += 1
    const sequence = requestSequence

    weatherState.value = 'loading'
    weatherMessage.value = '天气加载中…'
    try {
      const result = await apiRequest('/api/weather', { signal: controller.signal }, 10000)
      if (disposed || sequence !== requestSequence) return
      if (!result?.forecast_days?.length) {
        weatherState.value = 'empty'
        weatherMessage.value = NO_FORECAST_MESSAGE
        return
      }
      weatherData.value = result
      weatherState.value = 'ready'
      weatherMessage.value = activeForecast.value ? '' : NO_FORECAST_MESSAGE
    } catch (error) {
      if (disposed || sequence !== requestSequence) return
      weatherState.value = 'error'
      weatherMessage.value = errorText(error, '天气查询失败，请稍后重试。')
    } finally {
      if (sequence === requestSequence) controller = null
    }
  }

  function retryWeather() {
    return loadWeather()
  }

  onBeforeUnmount(() => {
    disposed = true
    requestSequence += 1
    controller?.abort()
    controller = null
  })

  watch(weatherDate, () => {
    // The displayed day changed; an out-of-range date keeps data but must say so.
    if (weatherState.value === 'ready') {
      weatherMessage.value = activeForecast.value ? '' : NO_FORECAST_MESSAGE
    }
  })

  return {
    dateInRange,
    loadWeather,
    retryWeather,
    weatherData,
    weatherDate,
    weatherDates,
    weatherForecast: activeForecast,
    weatherMessage,
    weatherState,
  }
}
