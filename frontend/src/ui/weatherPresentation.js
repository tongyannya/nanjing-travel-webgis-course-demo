export const WEATHER_SOURCE_TEXT = '天气来源于和风天气，仅供参考'
export const WEATHER_RANGE_TEXT = '仅能展示10天天气'

export function forecastLabel(forecast) {
  const day = forecast?.day_weather
  const night = forecast?.night_weather
  if (!day && !night) return '暂无'
  return day && night && day !== night ? `${day}转${night}` : day || night
}

export function tempRange(forecast) {
  const max = forecast?.day_temp
  const min = forecast?.night_temp
  if (max == null && min == null) return ''
  if (max == null || min == null) return `${min ?? max}°C`
  return `${min}~${max}°C`
}

export function buildWeatherRows(dates, data) {
  const forecasts = new Map((data?.forecast_days || []).map((day) => [day.date, day]))
  return [...new Set(dates.filter(Boolean))].map((date) => {
    const forecast = forecasts.get(date)
    return {
      date,
      available: Boolean(forecast),
      text: forecast
        ? [forecastLabel(forecast), tempRange(forecast)].filter(Boolean).join(' ')
        : '暂无',
      rainy: Boolean(
        forecast && /雨/.test(`${forecast.day_weather || ''}${forecast.night_weather || ''}`),
      ),
    }
  })
}

export function weatherTimestamp(data) {
  const value = data?.report_time || data?.retrieved_time
  const label = data?.report_time ? '发布' : '获取'
  if (!value) return '暂无获取时间'
  const match = value.match(/^\d{4}-(\d{2}-\d{2})[T ](\d{2}:\d{2})/)
  return `${label} ${match ? `${match[1]} ${match[2]}` : value}`
}

export function weatherTooltip(dates, data) {
  const rows = buildWeatherRows(dates, data)
  const suffix = rows.some((row) => !row.available) ? `；${WEATHER_RANGE_TEXT}` : ''
  return [
    ...rows.map((row) => `${row.date} ${row.text}`),
    `${weatherTimestamp(data)}${suffix}`,
  ].join('\n')
}
