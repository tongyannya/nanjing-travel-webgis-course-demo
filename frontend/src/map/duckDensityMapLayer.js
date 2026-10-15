import { diningHexagonPath } from './diningHexGrid'

export const DUCK_STRIPE_SPACING = Object.freeze({ one: 28, two_to_five: 18, over_five: 11 })
export const DUCK_STRIPE_COLOR = '#67432d'
export const DUCK_SELECTED_STRIPE_COLOR = '#d97a2b'

// Reuse normal and selected patterns per band; polygons provide hit testing and visible outlines.
export function createDuckDensityMapLayer({ AMap, map, onAreaSelect }) {
  const canvas = document.createElement('canvas')
  canvas.dataset.duckDensityCanvas = ''
  canvas.style.pointerEvents = 'none'
  const context = canvas.getContext('2d')
  let entries = []
  let visible = false
  let selectedId = ''
  const patterns = new Map()
  for (const [band, spacing] of Object.entries(DUCK_STRIPE_SPACING)) {
    for (const selected of [false, true]) {
      const tile = document.createElement('canvas')
      tile.width = tile.height = spacing
      const brush = tile.getContext('2d')
      brush.strokeStyle = selected ? DUCK_SELECTED_STRIPE_COLOR : DUCK_STRIPE_COLOR
      brush.lineWidth = 1.5
      brush.beginPath()
      for (const offset of [-spacing, 0, spacing]) {
        brush.moveTo(offset, selected ? 0 : spacing)
        brush.lineTo(offset + spacing, selected ? spacing : 0)
      }
      brush.stroke()
      patterns.set(`${band}:${selected}`, context.createPattern(tile, 'repeat'))
    }
  }
  function draw() {
    const size = map.getSize()
    const ratio = window.devicePixelRatio || 1
    canvas.width = Math.round(size.width * ratio)
    canvas.height = Math.round(size.height * ratio)
    canvas.style.width = `${size.width}px`
    canvas.style.height = `${size.height}px`
    context.scale(ratio, ratio)
    if (!visible) return
    for (const { cell } of entries) {
      const path = cell.boundary.map((position) => map.lngLatToContainer(position))
      context.beginPath()
      path.forEach((point, index) =>
        index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y),
      )
      context.closePath()
      context.fillStyle = patterns.get(`${cell.duck.band}:${cell.id === selectedId}`)
      context.fill()
    }
  }
  // The SDK leaves display:none on canvases constructed with visible:false, even after show().
  const layer = new AMap.CustomLayer(canvas, { zIndex: 100, render: draw })
  layer.render = draw
  map.add(layer)
  function apply() {
    for (const { cell, overlay } of entries) {
      overlay.setOptions({
        strokeWeight: cell.id === selectedId ? 2.5 : 1,
        strokeColor: cell.id === selectedId ? DUCK_SELECTED_STRIPE_COLOR : DUCK_STRIPE_COLOR,
        strokeOpacity: cell.id === selectedId ? 1 : 0.7,
        fillOpacity: 0,
        zIndex: cell.id === selectedId ? 146 : 121,
      })
      if (visible) overlay.show()
      else overlay.hide()
    }
    if (visible) layer.show()
    else layer.hide()
    draw()
  }
  function clear() {
    for (const { overlay, clickHandler } of entries) overlay.off('click', clickHandler)
    if (entries.length) map.remove(entries.map(({ overlay }) => overlay))
    entries = []
  }
  function render(cells, options = {}) {
    const next = cells.filter((cell) => cell.duck.shop_count > 0)
    visible = Boolean(options.visible)
    selectedId = options.selectedAreaId || ''
    if (
      next.length !== entries.length ||
      next.some((cell, index) => entries[index].cell !== cell)
    ) {
      clear()
      entries = next.map((cell) => {
        const overlay = new AMap.Polygon({
          path: diningHexagonPath(cell),
          bubble: false,
          fillOpacity: 0,
          strokeWeight: 0,
          zIndex: 121,
        })
        overlay.setExtData({ duck_hex_id: cell.id, duck_band: cell.duck.band })
        const clickHandler = () => onAreaSelect?.(cell)
        overlay.on('click', clickHandler)
        return { cell, overlay, clickHandler }
      })
      if (entries.length) map.add(entries.map(({ overlay }) => overlay))
    }
    apply()
    return entries.length
  }
  function selectArea(id, { focus = false } = {}) {
    selectedId = id || ''
    apply()
    const entry = entries.find(({ cell }) => cell.id === id)
    if (focus && entry) map.setFitView([entry.overlay], false, [130, 110, 180, 110])
  }
  function setVisible(value) {
    visible = Boolean(value)
    apply()
  }
  function destroy() {
    clear()
    map.remove(layer)
    canvas.width = canvas.height = 0
  }
  return { render, selectArea, setVisible, destroy, getCount: () => entries.length }
}
