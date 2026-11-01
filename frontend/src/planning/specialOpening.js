// Match the planner's regular weekday, seasonal and monthly closure rules.
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']
const DAY_MS = 24 * 60 * 60 * 1000

function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null
}

function inRange(value, start, end) {
  return start <= end ? value >= start && value <= end : value >= start || value <= end
}

function periodMatchesDate(label, date) {
  const annualRange = label.match(/每年(\d{1,2})月(\d{1,2})日至(\d{1,2})月(\d{1,2})日/)
  if (annualRange) {
    const [, startMonth, startDay, endMonth, endDay] = annualRange.map(Number)
    const matches = inRange(
      (date.getUTCMonth() + 1) * 100 + date.getUTCDate(),
      startMonth * 100 + startDay,
      endMonth * 100 + endDay,
    )
    return label.includes('闭馆') ? !matches : matches
  }
  const months = label.match(/(\d{1,2})月至(?:次年)?(\d{1,2})月/)
  return !months || inRange(date.getUTCMonth() + 1, Number(months[1]), Number(months[2]))
}

function isClosed(attraction, date) {
  const periods = attraction.opening?.regular
  // Missing opening data is unknown, rather than proof of a closure.
  if (!Array.isArray(periods) || !periods.length) return false
  const rule = attraction.opening.closed_rules || ''
  const nextWeek = new Date(date.getTime() + 7 * DAY_MS)
  if (
    rule.includes('每月最后一周周三') &&
    date.getUTCDay() === 3 &&
    nextWeek.getUTCMonth() !== date.getUTCMonth()
  )
    return true
  return !periods.some(
    (period) =>
      period.days?.includes(WEEKDAYS[date.getUTCDay()]) &&
      periodMatchesDate(period.period_label || '', date),
  )
}

export function buildSpecialOpeningRows(plan, request, attractions = []) {
  if (!plan || !request?.preferences) return []
  const preferences = request.preferences
  const must = new Set(preferences.must_visit_ids || [])
  const interested = new Set(preferences.interested_ids || [])
  const excluded = new Set(preferences.excluded_ids || [])
  const excludedTags = new Set(preferences.excluded_tags || [])
  const catalog = new Map(attractions.map((attraction) => [attraction.id, attraction]))
  const dates = (plan.days || [])
    .map((day, index) => ({ value: day.date, date: parseDate(day.date), index }))
    .filter((day) => day.date)
  return [...new Set([...must, ...interested])].flatMap((id) => {
    const attraction = catalog.get(id)
    if (
      !attraction ||
      excluded.has(id) ||
      (!must.has(id) && attraction.tags?.some((tag) => excludedTags.has(tag)))
    )
      return []
    const closedDates = dates
      .filter((day) => isClosed(attraction, day.date))
      .map((day) => ({
        date: day.value,
        label: `第${day.index + 1}天 ${day.value}（周${WEEKDAY_LABELS[day.date.getUTCDay()]}）`,
      }))
    return closedDates.length
      ? [
          {
            attractionId: id,
            name: attraction.name,
            preference: must.has(id) ? '必去' : '感兴趣',
            closedDates,
          },
        ]
      : []
  })
}
