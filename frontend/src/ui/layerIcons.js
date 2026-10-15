const DEFAULT_ICON = 'layers'

export const LAYER_ICON_DEFINITIONS = Object.freeze({
  layers: [
    '<path d="m12 3.5 8.5 4.4L12 12.3 3.5 7.9 12 3.5Z" />',
    '<path d="m5 12 7 3.7 7-3.7M5 16.2l7 3.7 7-3.7" />',
  ].join(''),
  attractions: [
    '<path d="M5 20V9h14v11M4 9h16L18.2 5H5.8L4 9Z" />',
    '<path d="M8 9V6M12 9V6M16 9V6M9.5 20v-5h5v5" />',
  ].join(''),
  metro: [
    '<rect x="5" y="3.5" width="14" height="16" rx="5" />',
    '<path d="M8 15.5h8M8.5 20.5 10 18.8M15.5 20.5 14 18.8" />',
    '<circle cx="9" cy="12" r="1" />',
    '<circle cx="15" cy="12" r="1" />',
  ].join(''),
  station: [
    '<rect x="5" y="3.5" width="14" height="15" rx="3" />',
    '<path d="M8 7h8M8 14h8M8 21l2.2-2.5M16 21l-2.2-2.5" />',
    '<circle cx="8.5" cy="11" r="1" fill="currentColor" stroke="none" />',
    '<circle cx="15.5" cy="11" r="1" fill="currentColor" stroke="none" />',
  ].join(''),
  airport: [
    '<path d="m3.5 13 7.2-2.6V5.2c0-1.2.6-2.2 1.3-2.2s1.3 1 1.3 2.2v5.2l7.2 2.6v2l-7.2-1.1v4l2.5 1.5v1.5L12 20l-3.8.9v-1.5l2.5-1.5v-4L3.5 15v-2Z" />',
  ].join(''),
  hotels: '<path d="M4 20V5h16v15M7.5 9h2M14.5 9h2M7.5 13h2M14.5 13h2M10.5 20v-3h3v3" />',
  dining: [
    '<path d="M6 3.5v7M3.8 3.5v4.2A2.2 2.2 0 0 0 6 10M8.2 3.5v4.2A2.2 2.2 0 0 1 6 10v10.5" />',
    '<path d="M16 20.5V4.8a3.2 3.2 0 0 1 3.2 3.2v4H16" />',
  ].join(''),
  diningDensity: [
    '<circle cx="8" cy="9" r="4.3" />',
    '<circle cx="15.5" cy="8" r="3.2" />',
    '<circle cx="14" cy="15.5" r="4.5" />',
  ].join(''),
  duckDensity: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z M6 15l9-9 M9 18l9-9" />',
  saltedDuck: [
    '<path d="M3 17c1 3 17 3 18 0M5 15l3-6 6-1 4 4-2 4H7Z" />',
    '<path d="m8 10 7 4M11 9l6 4M6 4h.01M11 3h.01M16 4h.01" />',
  ].join(''),
  duckSoup: [
    '<path d="M3 12h18c-1 5-4 8-9 8s-8-3-9-8ZM8 21h8M6 9c-2-2 2-3 0-5M12 9c-2-2 2-3 0-5M18 9c-2-2 2-3 0-5" />',
    '<path d="m8 15 2 2 2-2 2 2 2-2" />',
  ].join(''),
  roastDuck: [
    '<path d="M14 9c-3-3-8-1-9 2s1 7 4 7c3 0 6-2 6-5l3-3 2 1 1-2-2-1 1-2-2-1-1 2-3 2Z" />',
    '<path d="m8 12 3 3M5 6c-1-2 1-3 1-4M11 5c-1-2 1-3 1-4M3 21h18" />',
  ].join(''),
  pressedDuck: [
    '<path d="M3 17c1 3 17 3 18 0M5 14l2-6 7-2 5 5-2 5H8Z" />',
    '<path d="m9 8-1 6M13 7l-1 8M17 9l-1 6M4 4h16M8 2v3M16 2v3" />',
  ].join(''),
  duck: [
    '<path d="M2.8 12.2 6.5 14c1.7-1.1 3.7-1.3 5.1-.5v-3.4c-1.4-.8-2.1-2.4-1.8-4 .4-2.2 2.4-3.5 4.5-3.1 2.2.4 3.4 2.5 2.9 4.6l4.4.5-4.8 2.1c-.9 1.1-.8 2.5.4 4 1.1 1.4 1.6 2.6 1.1 4.1-.8 2.6-3.3 3.7-7.3 3.7H8.7c-4 0-6.2-3.2-5.9-7.8Z" />',
    '<circle cx="14.7" cy="6.6" r=".75" fill="currentColor" stroke="none" />',
    '<path d="M6.8 16.1c1.9 1.4 4.2 1.7 6.2.2" />',
  ].join(''),
  mealAreas: [
    '<circle cx="8" cy="12" r="4.2" />',
    '<circle cx="16" cy="12" r="4.2" />',
    '<path d="M10.5 8.8h3M10.5 15.2h3" />',
  ].join(''),
  route: [
    '<path d="m4 19 5-7 4.8 3.2L20 6" />',
    '<path d="M16.8 5.5h3.8v3.8" />',
    '<circle cx="4" cy="19" r="1.6" fill="currentColor" stroke="none" />',
  ].join(''),
  search: ['<circle cx="10.5" cy="10.5" r="5.8" />', '<path d="m15 15 4.5 4.5" />'].join(''),
  searchPoint: '<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />',
  filter: '<path d="M4 6h16M7 12h10M10 18h4" />',
  legend: [
    '<rect x="4" y="4" width="6" height="6" rx="1.3" />',
    '<circle cx="7" cy="17" r="3" />',
    '<path d="M14 7h6M14 17h6" />',
  ].join(''),
  save: '<path d="M6 3.5h12v17L12 16.7 6 20.5v-17Z" />',
  landmarks: '<path d="M3.5 20V10l4-3.2 3.5 3.5V5l4.5-1.5L20.5 6v14M2.5 20h19" />',
  fullscreen: '<path d="M8.5 4H4v4.5M15.5 4H20v4.5M20 15.5V20h-4.5M8.5 20H4v-4.5" />',
  restore: ['<path d="M9 4H4v5M15 4h5v5M20 15v5h-5M9 20H4v-5" />', '<path d="M9 9h6v6H9z" />'].join(
    '',
  ),
})

export function layerIconName(name) {
  return Object.hasOwn(LAYER_ICON_DEFINITIONS, name) ? name : DEFAULT_ICON
}

export function layerIconMarkup(name) {
  return LAYER_ICON_DEFINITIONS[layerIconName(name)]
}

export function createLayerIconElement(name, className = 'layer-icon') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('class', className)
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('aria-hidden', 'true')
  svg.innerHTML = layerIconMarkup(name)
  return svg
}
