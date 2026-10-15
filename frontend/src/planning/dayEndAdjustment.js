const validTime = (value) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/u.test(value)
const minutes = (value) => {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

export function dayEndAdjustment(day) {
  const adjustment = day?.end_time_adjustment
  const arrival = day?.items?.at(-1)?.end_time
  if (
    !adjustment ||
    !validTime(adjustment.planned_end_time) ||
    !validTime(adjustment.extended_end_time) ||
    !validTime(arrival) ||
    typeof adjustment.reason !== 'string' ||
    !adjustment.reason.trim()
  )
    return null
  const start = minutes(adjustment.planned_end_time)
  const end = minutes(adjustment.extended_end_time)
  if (end - start !== 30 || minutes(arrival) <= start || minutes(arrival) > end) return null
  return {
    ...adjustment,
    start,
    end,
    label: `原计划结束 ${adjustment.planned_end_time} · 延后至 ${adjustment.extended_end_time}`,
  }
}

export function hasValidDayEndAdjustment(day) {
  return day?.end_time_adjustment === undefined || Boolean(dayEndAdjustment(day))
}
