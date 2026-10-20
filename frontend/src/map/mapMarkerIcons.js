import { createLayerIconElement, layerIconName } from '../ui/layerIcons'

export const MAP_MARKER_COLORS = Object.freeze({
  attractions: '#2563eb',
  metro: '#1d4ed8',
  station: '#1d4ed8',
  airport: '#1d4ed8',
  hotels: '#8b5cf6',
  accommodationAreas: '#e89a55',
  accommodationSelected: '#b86424',
  dining: '#0f766e',
  nanjingCuisine: '#ec8eaf',
  duck: '#9a5b22',
  mealAreas: '#7d7b39',
  route: '#c13f2c',
  search: '#7bbced',
  searchPoint: '#7bbced',
  selectedSearch: '#d6a231',
})

export function createMapSequenceBadge(sequence, tagName = 'span') {
  const badge = document.createElement(tagName)
  if (tagName === 'button') badge.type = 'button'
  badge.className = 'map-symbol-marker__sequence'
  badge.textContent = Array.isArray(sequence) ? sequence.join('·') : String(sequence)
  return badge
}

export function createMapMarkerContent({
  attractionId = '',
  caption = '',
  color,
  icon = 'search',
  label = '',
  markerClass = '',
  selected = false,
  selectedColor = MAP_MARKER_COLORS.selectedSearch,
  sequence = null,
  showIcon = true,
} = {}) {
  const kind = layerIconName(icon)
  const content = document.createElement('button')
  content.type = 'button'
  content.className = ['map-symbol-marker', `map-symbol-marker--${kind}`, markerClass]
    .filter(Boolean)
    .join(' ')
  content.dataset.markerIcon = kind
  content.dataset.markerColor = color || MAP_MARKER_COLORS[kind] || MAP_MARKER_COLORS.search
  content.dataset.markerSelectedColor = selectedColor
  content.style.setProperty(
    '--map-marker-color',
    selected ? content.dataset.markerSelectedColor : content.dataset.markerColor,
  )
  content.classList.toggle('map-symbol-marker--selected', selected)
  if (label) {
    content.title = label
    content.setAttribute('aria-label', label)
  }
  if (showIcon) {
    const number = /^attr_(\d{3})$/.exec(attractionId)?.[1]
    const hasAttractionImage =
      kind === 'attractions' &&
      number &&
      Number(number) >= 1 &&
      Number(number) <= 41 &&
      Number(number) !== 35
    if (hasAttractionImage) {
      const image = document.createElement('img')
      image.className = 'map-symbol-marker__attraction-image'
      image.src = `${import.meta.env.BASE_URL}assets/attractions/icons/${attractionId}.png`
      image.alt = ''
      image.draggable = false
      content.classList.add('map-symbol-marker--attraction-image')
      content.dataset.attractionId = attractionId
      content.appendChild(
        createLayerIconElement(
          kind,
          'map-symbol-marker__icon map-symbol-marker__attraction-fallback',
        ),
      )
      image.addEventListener(
        'error',
        () => {
          content.classList.remove('map-symbol-marker--attraction-image')
          image.remove()
        },
        { once: true },
      )
      content.appendChild(image)
    } else content.appendChild(createLayerIconElement(kind, 'map-symbol-marker__icon'))
  }
  if (caption) {
    const captionElement = document.createElement('span')
    captionElement.className = 'map-symbol-marker__caption'
    captionElement.textContent = caption
    content.appendChild(captionElement)
  }
  if (sequence !== null && sequence !== undefined) {
    content.appendChild(createMapSequenceBadge(sequence))
  }
  return content
}

export function setMapMarkerSelected(content, selected) {
  if (!content) return
  content.classList.toggle('map-symbol-marker--selected', Boolean(selected))
  const kind = content.dataset.markerIcon
  content.style.setProperty(
    '--map-marker-color',
    selected
      ? content.dataset.markerSelectedColor || MAP_MARKER_COLORS.selectedSearch
      : content.dataset.markerColor || MAP_MARKER_COLORS[kind] || MAP_MARKER_COLORS.search,
  )
}
