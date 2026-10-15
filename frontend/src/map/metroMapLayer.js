import { isValidMetroLine, isValidMetroStation, metroLineColor } from './metroData'
import { createMapMarkerContent, setMapMarkerSelected } from './mapMarkerIcons'

// 任务书层级要求：地铁折线高于餐饮密度蜂巢（110），低于用餐区域（180）、
// 路线虚线（220）、交通段（260）、路线编号（300+）和饭店 Marker（320）。
export const METRO_LINE_Z_INDEX = 120
// 主要站 Marker 需在自家折线之上且不被半透明蜂巢遮住，但仍低于用餐区与路线层。
export const METRO_STATION_Z_INDEX = 160
export const METRO_STATION_COLOR = '#000000'

function stationMarkerContent(station) {
  const interchange = station.major_reasons.includes('interchange')
  return createMapMarkerContent({
    color: METRO_STATION_COLOR,
    icon: 'metro',
    label: `地铁站：${station.name}`,
    markerClass: interchange
      ? 'metro-map-marker metro-map-marker--interchange'
      : 'metro-map-marker metro-map-marker--dot',
    showIcon: interchange,
  })
}

function removeOverlays(map, overlays) {
  if (overlays.length) map.remove(overlays)
}

export function createMetroMapLayer({ AMap, map, onStationSelect }) {
  let polylines = []
  let stationMarkers = []
  const lineEventHandlers = new Map()
  let visible = false
  let selectedStationId = ''
  let tooltipElement = null

  function ensureTooltip() {
    if (tooltipElement || !map) return
    tooltipElement = document.createElement('div')
    tooltipElement.className = 'metro-line-tooltip'
    tooltipElement.setAttribute('role', 'tooltip')
    Object.assign(tooltipElement.style, {
      position: 'absolute',
      zIndex: '170',
      padding: '7px 10px',
      borderRadius: '6px',
      background: '#1a2421',
      color: '#fff',
      fontSize: '12px',
      lineHeight: '1.5',
      pointerEvents: 'none',
      whiteSpace: 'nowrap',
      display: 'none',
      transform: 'translate(12px, -50%)',
    })
    const container = map.getContainer?.() || document.body
    container.appendChild(tooltipElement)
  }

  function showLineTooltip(line, event) {
    ensureTooltip()
    if (!tooltipElement) return
    let x = event?.pixel?.getX?.() ?? event?.pixel?.x
    let y = event?.pixel?.getY?.() ?? event?.pixel?.y
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      const lnglat = event?.lnglat
      const containerPixel = lnglat && map?.lngLatToContainer?.(lnglat)
      x = containerPixel?.getX?.() ?? containerPixel?.x
      y = containerPixel?.getY?.() ?? containerPixel?.y
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    tooltipElement.textContent = line.short_name
    tooltipElement.style.left = `${x}px`
    tooltipElement.style.top = `${y}px`
    tooltipElement.style.display = 'block'
  }

  function hideLineTooltip() {
    if (tooltipElement) tooltipElement.style.display = 'none'
  }

  function removeTooltip() {
    hideLineTooltip()
    if (tooltipElement?.parentNode) tooltipElement.parentNode.removeChild(tooltipElement)
    tooltipElement = null
  }

  function applyVisibility() {
    polylines.forEach((overlay) => {
      if (visible) overlay.show()
      else overlay.hide()
    })
    stationMarkers.forEach(({ marker }) => {
      if (visible) marker.show()
      else marker.hide()
    })
    if (!visible) hideLineTooltip()
  }

  function applySelection() {
    stationMarkers.forEach(({ content, marker, station }) => {
      const selected = station.id === selectedStationId
      setMapMarkerSelected(content, selected)
      marker.setOptions({ zIndex: selected ? METRO_STATION_Z_INDEX + 20 : METRO_STATION_Z_INDEX })
    })
  }

  function clear() {
    hideLineTooltip()
    polylines.forEach((polyline) => {
      const handlers = lineEventHandlers.get(polyline)
      if (!handlers) return
      polyline.off?.('mousemove', handlers.mousemove)
      polyline.off?.('click', handlers.click)
      polyline.off?.('mouseout', handlers.mouseout)
    })
    lineEventHandlers.clear()
    removeOverlays(map, polylines)
    stationMarkers.forEach(({ marker, clickHandler }) => marker.off?.('click', clickHandler))
    removeOverlays(
      map,
      stationMarkers.map(({ marker }) => marker),
    )
    polylines = []
    stationMarkers = []
  }

  function destroyLayerDom() {
    removeTooltip()
  }

  function render(lines, stations, options = {}) {
    clear()
    visible = Boolean(options.visible)
    selectedStationId = options.selectedStationId || ''

    polylines = (Array.isArray(lines) ? lines : []).filter(isValidMetroLine).map((line) => {
      const polyline = new AMap.Polyline({
        path: line.path,
        strokeColor: metroLineColor(line),
        strokeWeight: 5,
        strokeOpacity: 0.9,
        isOutline: true,
        outlineColor: '#FFFCF5',
        borderWeight: 1,
        lineJoin: 'round',
        bubble: false,
        zIndex: METRO_LINE_Z_INDEX,
      })
      // 悬停折线显示线路名；颜色不是唯一识别方式（任务书要求）。
      // click 兜底：触屏或快速划过时也能唤出提示。
      const mousemove = (event) => {
        showLineTooltip(line, event)
      }
      const click = (event) => {
        showLineTooltip(line, event)
      }
      const mouseout = hideLineTooltip
      lineEventHandlers.set(polyline, { click, mousemove, mouseout })
      polyline.on('mousemove', mousemove)
      polyline.on('click', click)
      polyline.on('mouseout', mouseout)
      return polyline
    })

    stationMarkers = (Array.isArray(stations) ? stations : [])
      .filter((station) => station.is_major && isValidMetroStation(station))
      .map((station) => {
        const content = stationMarkerContent(station)
        content.dataset.metroStationId = station.id
        const marker = new AMap.Marker({
          position: [station.location.longitude, station.location.latitude],
          title: station.name,
          content,
          anchor: 'center',
          bubble: false,
          zIndex: METRO_STATION_Z_INDEX,
        })
        const clickHandler = () => onStationSelect?.(station)
        marker.on('click', clickHandler)
        return { content, marker, station, clickHandler }
      })

    const overlays = [...polylines, ...stationMarkers.map(({ marker }) => marker)]
    if (overlays.length) map.add(overlays)
    applyVisibility()
    applySelection()
    return { polylineCount: polylines.length, stationCount: stationMarkers.length }
  }

  function setVisible(nextVisible) {
    visible = Boolean(nextVisible)
    applyVisibility()
  }

  function selectStation(stationId) {
    selectedStationId = stationId || ''
    applySelection()
  }

  function focusStation(station) {
    if (!map || !station?.location) return
    map.setZoomAndCenter(14, [station.location.longitude, station.location.latitude])
  }

  function destroy() {
    clear()
    destroyLayerDom()
    selectedStationId = ''
  }

  return {
    clear,
    destroy,
    focusStation,
    getCount: () => ({ polylineCount: polylines.length, stationCount: stationMarkers.length }),
    render,
    selectStation,
    setVisible,
  }
}
