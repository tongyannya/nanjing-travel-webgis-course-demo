import { TRANSPORT_MODE_LABELS } from './planningLabels'

const RIDE_MODE_LABELS = {
  bus: '公交',
  metro: '地铁',
  railway: '铁路',
  taxi: '出租车接驳',
}

function isKnownNumber(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
}

function uniqueText(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim()))]
}

export function transportModeLabel(mode) {
  return TRANSPORT_MODE_LABELS[mode] || mode || '交通'
}

export function rideModeLabel(mode) {
  return RIDE_MODE_LABELS[mode] || mode || '乘车'
}

export function presentTransportLeg(leg = {}) {
  const modeLabel = transportModeLabel(leg.mode)
  const duration = isKnownNumber(leg.duration_minutes_rounded)
    ? Number(leg.duration_minutes_rounded)
    : null
  const durationLabel = duration === null ? '耗时待确认' : `约 ${duration} 分钟`
  const isPublicTransit = leg.mode === 'public_transit'
  const details = isPublicTransit && leg.transit_details ? leg.transit_details : null

  if (!details) {
    const summary = isPublicTransit ? '线路详情暂不可用，当前为本地保守估算。' : ''
    return {
      modeLabel,
      durationLabel,
      status: isPublicTransit ? 'fallback' : 'simple',
      summary,
      shortLabel: modeLabel,
      accessibleLabel: [modeLabel, durationLabel, summary].filter(Boolean).join('，'),
      walkingLabel: '',
      transferLabel: '',
      segments: [],
      transfers: [],
    }
  }

  const segments = (details.ride_segments || []).map((segment) => {
    const segmentModeLabel = rideModeLabel(segment.mode)
    let stopLabel = ''
    if (segment.departure_stop && segment.arrival_stop) {
      stopLabel = `${segment.departure_stop} → ${segment.arrival_stop}`
    } else if (segment.departure_stop) {
      stopLabel = `从 ${segment.departure_stop} 上车`
    } else if (segment.arrival_stop) {
      stopLabel = `在 ${segment.arrival_stop} 下车`
    }
    return {
      modeLabel: segmentModeLabel,
      lineLabel: segment.line_name || `${segmentModeLabel}线路待确认`,
      stopLabel,
      durationLabel: isKnownNumber(segment.duration_minutes)
        ? `${Number(segment.duration_minutes)} 分钟`
        : '',
    }
  })
  const transfers = (details.transfers || []).map((transfer) => {
    const fromLine = transfer.from_line_name || '前一乘车段'
    const toLine = transfer.to_line_name || '后一乘车段'
    const stations = uniqueText([transfer.arrival_stop, transfer.departure_stop])
    return {
      routeLabel: `${fromLine} → ${toLine}`,
      stationLabel: stations.length ? `在${stations.join(' → ')}换乘` : '换乘站待确认',
    }
  })
  let walkingLabel = '步行时间未提供'
  if (isKnownNumber(details.walking_minutes)) {
    walkingLabel = `步行约 ${Number(details.walking_minutes)} 分钟`
  } else if (isKnownNumber(details.walking_distance_m)) {
    walkingLabel = `步行约 ${Number(details.walking_distance_m)} 米（时间未提供）`
  }
  const transferCount = isKnownNumber(details.transfer_count)
    ? Number(details.transfer_count)
    : transfers.length
  const lineNames = uniqueText(
    (details.ride_segments || []).map(
      (segment) => segment.line_name || rideModeLabel(segment.mode),
    ),
  )
  const shortLabel = lineNames.length ? lineNames.join(' → ') : '步行接驳'
  const summary = details.summary || leg.route_summary || `${shortLabel}；${durationLabel}。`
  const walkingInclusion = isKnownNumber(details.walking_minutes)
    ? `包含约${Number(details.walking_minutes)}分钟步行`
    : isKnownNumber(details.walking_distance_m)
      ? `包含约${Number(details.walking_distance_m)}米步行`
      : ''

  return {
    modeLabel,
    durationLabel,
    status: 'details',
    summary,
    shortLabel,
    accessibleLabel: [
      modeLabel,
      duration === null ? durationLabel : `约${duration}分钟`,
      walkingInclusion,
    ]
      .filter(Boolean)
      .join('，'),
    walkingLabel,
    transferLabel: transferCount ? `换乘 ${transferCount} 次` : '无需换乘',
    segments,
    transfers,
  }
}
