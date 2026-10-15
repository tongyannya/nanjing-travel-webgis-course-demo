import { normalizeDiningDensityAreas } from './diningDensityData'
import { diningHexagonPath } from './diningHexGrid'

const DENSITY_STYLES = Object.freeze({
  blue: { strokeColor: '#174f9a', fillColor: '#2f7de1' },
  yellow: { strokeColor: '#a87805', fillColor: '#f2c744' },
  red: { strokeColor: '#9f251f', fillColor: '#e3483d' },
})

export function diningDensityAreaStyle(level, selected = false, borderOnly = false) {
  const colors = DENSITY_STYLES[level] || DENSITY_STYLES.blue
  return {
    ...colors,
    strokeOpacity: selected ? 0.9 : 0,
    strokeWeight: selected ? 2 : 0,
    fillOpacity: selected && !borderOnly ? 0.42 : 0.22,
    zIndex: selected ? 145 : 110,
  }
}

function removeEntries(map, entries) {
  entries.forEach(({ overlay, clickHandler }) => overlay.off?.('click', clickHandler))
  if (entries.length) map.remove(entries.map(({ overlay }) => overlay))
}

export function createDiningDensityMapLayer({ AMap, map, onAreaSelect }) {
  let entries = []
  let visible = false
  let selectedAreaId = ''
  let selectionBorderOnly = false

  function applyVisibility() {
    entries.forEach(({ overlay }) => {
      if (visible) overlay.show()
      else overlay.hide()
    })
  }

  function applySelection({ focus = false } = {}) {
    let selectedEntry = null
    entries.forEach((entry) => {
      const selected = entry.area.id === selectedAreaId
      entry.overlay.setOptions(
        diningDensityAreaStyle(entry.area.density_level, selected, selectionBorderOnly),
      )
      if (selected) selectedEntry = entry
    })
    if (focus && selectedEntry) {
      map.setFitView([selectedEntry.overlay], false, [130, 110, 180, 110])
    }
  }

  function clear() {
    removeEntries(map, entries)
    entries = []
  }

  function render(areas, options = {}) {
    const nextAreas = normalizeDiningDensityAreas(areas)
    visible = Boolean(options.visible)
    selectedAreaId = options.selectedAreaId || ''
    selectionBorderOnly = Boolean(options.borderOnly)
    if (
      nextAreas.length === entries.length &&
      nextAreas.every((area, index) => entries[index].area === area)
    ) {
      applyVisibility()
      applySelection()
      return entries.length
    }
    clear()
    entries = nextAreas.map((area) => {
      const overlay = new AMap.Polygon({
        path: diningHexagonPath(area),
        bubble: false,
        ...diningDensityAreaStyle(area.density_level, area.id === selectedAreaId),
      })
      const clickHandler = () => onAreaSelect?.(area)
      overlay.on('click', clickHandler)
      return { area, clickHandler, overlay }
    })
    if (entries.length) map.add(entries.map(({ overlay }) => overlay))
    applyVisibility()
    applySelection()
    return entries.length
  }

  function selectArea(areaId, options) {
    selectedAreaId = areaId || ''
    selectionBorderOnly = Boolean(options?.borderOnly)
    applySelection(options)
  }

  function setVisible(nextVisible) {
    visible = Boolean(nextVisible)
    applyVisibility()
  }

  function destroy() {
    clear()
    selectedAreaId = ''
  }

  return {
    clear,
    destroy,
    getCount: () => entries.length,
    render,
    selectArea,
    setVisible,
  }
}
