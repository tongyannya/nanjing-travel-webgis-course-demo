import { createApp, h, nextTick, reactive } from 'vue'

import DraggableDuckGuideDialog from '../components/DraggableDuckGuideDialog.vue'

const SAFE_EDGE = 24
const DEFAULT_BOTTOM = 168
const DUCK_SIZE = 171.6
const DIALOG_GAP = 12
const DIALOG_WIDTH = 324
const DIALOG_ESTIMATED_HEIGHT = 250
const DRAG_THRESHOLD = 5
const DUCK_GUIDE_IMAGE_URL = '/assets/nanjing-duck-guide-book-sprite.png'

let sessionPositionRatio = null

function finiteDimension(value) {
  return Number.isFinite(value) && value > 0 ? value : 0
}

function containerSize(container) {
  const rect = container.getBoundingClientRect?.() || {}
  return {
    height: finiteDimension(container.clientHeight) || finiteDimension(rect.height),
    width: finiteDimension(container.clientWidth) || finiteDimension(rect.width),
  }
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum)
}

function positionBounds(container, safeAreaElement) {
  const { height, width } = containerSize(container)
  const containerRect = container.getBoundingClientRect?.() || {}
  const safeRect = safeAreaElement?.getBoundingClientRect?.() || {}
  const measuredSafeArea =
    finiteDimension(safeRect.width) > 0 && finiteDimension(safeRect.height) > 0
  const minX = measuredSafeArea ? safeRect.left - (containerRect.left || 0) : SAFE_EDGE
  const minY = measuredSafeArea ? safeRect.top - (containerRect.top || 0) : SAFE_EDGE
  const safeRight = measuredSafeArea
    ? safeRect.right - (containerRect.left || 0)
    : width - SAFE_EDGE
  const safeBottom = measuredSafeArea
    ? safeRect.bottom - (containerRect.top || 0)
    : height - SAFE_EDGE
  return {
    height,
    maxX: Math.max(minX, safeRight - DUCK_SIZE),
    maxY: Math.max(minY, safeBottom - DUCK_SIZE),
    minX,
    minY,
    safeBottom,
    safeRight,
    width,
  }
}

function ratioForPosition(position, bounds) {
  const availableX = bounds.maxX - bounds.minX
  const availableY = bounds.maxY - bounds.minY
  return {
    x: availableX > 0 ? (position.x - bounds.minX) / availableX : 0,
    y: availableY > 0 ? (position.y - bounds.minY) / availableY : 0,
  }
}

function positionForRatio(ratio, bounds) {
  return {
    x: bounds.minX + clamp(ratio.x, 0, 1) * (bounds.maxX - bounds.minX),
    y: bounds.minY + clamp(ratio.y, 0, 1) * (bounds.maxY - bounds.minY),
  }
}

function defaultPosition(bounds, initialLeft = SAFE_EDGE) {
  return {
    x: clamp(initialLeft, bounds.minX, bounds.maxX),
    y: clamp(bounds.height - DEFAULT_BOTTOM - DUCK_SIZE, bounds.minY, bounds.maxY),
  }
}

function safeTypes(values) {
  return Array.isArray(values) ? [...values] : []
}

export function createDraggableDuckGuideLayer({ container, culture, onArticleSelect }) {
  const mountElement = document.createElement('div')
  mountElement.className = 'draggable-duck-guide-mount'
  const overlayHost = container.closest('.app-shell') || container
  overlayHost.appendChild(mountElement)
  const initialLeft =
    Number.parseFloat(getComputedStyle(container).getPropertyValue('--overlay-left')) || SAFE_EDGE

  const state = reactive({
    currentDayDuckTypes: [],
    dialogHeight: DIALOG_ESTIMATED_HEIGHT,
    dialogWidth: DIALOG_WIDTH,
    dialogOpen: false,
    dragging: false,
    otherDayDuckTypes: [],
    selectedDuckType: '',
    visible: false,
    x: SAFE_EDGE,
    y: SAFE_EDGE,
  })
  let activePointerId = null
  let destroyed = false
  let dragMoved = false
  let dragStart = null
  let dialogElement = null
  let safeAreaElement = null
  let suppressClickUntil = 0

  function initialPosition(bounds) {
    const dock = overlayHost.querySelector('[data-testid="info-dock"]')
    const dockRect = dock?.getBoundingClientRect()
    if (dockRect?.width && dockRect?.height && getComputedStyle(dock).display !== 'none') {
      const containerRect = container.getBoundingClientRect()
      return {
        x: clamp(
          dockRect.left - containerRect.left + dockRect.width * 0.16,
          bounds.minX,
          bounds.maxX,
        ),
        y: clamp(
          dockRect.bottom - containerRect.top - DUCK_SIZE - SAFE_EDGE,
          bounds.minY,
          bounds.maxY,
        ),
      }
    }
    return defaultPosition(bounds, initialLeft)
  }

  function setPosition(x, y, persist = true) {
    const bounds = positionBounds(container, safeAreaElement)
    state.x = clamp(x, bounds.minX, bounds.maxX)
    state.y = clamp(y, bounds.minY, bounds.maxY)
    if (persist) sessionPositionRatio = ratioForPosition(state, bounds)
  }

  function restorePosition() {
    const bounds = positionBounds(container, safeAreaElement)
    if (sessionPositionRatio) {
      const position = positionForRatio(sessionPositionRatio, bounds)
      setPosition(position.x, position.y)
      return
    }
    const position = initialPosition(bounds)
    setPosition(position.x, position.y, false)
  }

  function stopOverlayEvent(event) {
    event.stopPropagation()
  }

  function stopDragging() {
    window.removeEventListener('pointermove', handlePointerMove, true)
    window.removeEventListener('pointerup', handlePointerUp, true)
    window.removeEventListener('pointercancel', handlePointerCancel, true)
    activePointerId = null
    dragStart = null
    state.dragging = false
  }

  function handlePointerMove(event) {
    if (event.pointerId !== activePointerId || !dragStart) return
    event.preventDefault()
    event.stopPropagation()
    const deltaX = event.clientX - dragStart.clientX
    const deltaY = event.clientY - dragStart.clientY
    if (Math.hypot(deltaX, deltaY) > DRAG_THRESHOLD) dragMoved = true
    setPosition(dragStart.x + deltaX, dragStart.y + deltaY)
  }

  function finishPointer(event, cancelled) {
    if (event.pointerId !== activePointerId) return
    event.preventDefault()
    event.stopPropagation()
    suppressClickUntil = dragMoved || cancelled ? performance.now() + 400 : 0
    stopDragging()
  }

  function handlePointerUp(event) {
    finishPointer(event, false)
  }

  function handlePointerCancel(event) {
    finishPointer(event, true)
  }

  function handlePointerDown(event) {
    if (destroyed || !state.visible || (event.button !== undefined && event.button !== 0)) return
    event.preventDefault()
    event.stopPropagation()
    stopDragging()
    activePointerId = event.pointerId
    dragMoved = false
    dragStart = { clientX: event.clientX, clientY: event.clientY, x: state.x, y: state.y }
    state.dragging = true
    event.currentTarget?.setPointerCapture?.(event.pointerId)
    window.addEventListener('pointermove', handlePointerMove, true)
    window.addEventListener('pointerup', handlePointerUp, true)
    window.addEventListener('pointercancel', handlePointerCancel, true)
  }

  function handleDuckClick(event) {
    event.stopPropagation()
    if (suppressClickUntil > 0 && performance.now() <= suppressClickUntil) {
      suppressClickUntil = 0
      return
    }
    if (!destroyed && state.visible) state.dialogOpen = true
  }

  function closeDialog() {
    state.dialogOpen = false
  }

  function handleResize() {
    if (destroyed) return
    const dialogRect = dialogElement?.getBoundingClientRect()
    if (finiteDimension(dialogRect?.height)) state.dialogHeight = dialogRect.height
    if (finiteDimension(dialogRect?.width)) state.dialogWidth = dialogRect.width
    const bounds = positionBounds(container, safeAreaElement)
    if (sessionPositionRatio) {
      const position = positionForRatio(sessionPositionRatio, bounds)
      setPosition(position.x, position.y)
      return
    }
    const position = initialPosition(bounds)
    setPosition(position.x, position.y, false)
  }

  function dialogPlacement() {
    const bounds = positionBounds(container, safeAreaElement)
    const availableDialogWidth = Math.max(0, bounds.safeRight - bounds.minX)
    const dialogWidth = Math.min(state.dialogWidth, availableDialogWidth)
    const rightCandidate = state.x + DUCK_SIZE + DIALOG_GAP
    const leftCandidate = state.x - dialogWidth - DIALOG_GAP
    const side = rightCandidate + dialogWidth <= bounds.safeRight ? 'right' : 'left'
    const x =
      side === 'right'
        ? rightCandidate
        : clamp(leftCandidate, bounds.minX, Math.max(bounds.minX, bounds.safeRight - dialogWidth))
    const y = clamp(
      state.y + DUCK_SIZE - state.dialogHeight,
      bounds.minY,
      Math.max(bounds.minY, bounds.safeBottom - state.dialogHeight),
    )
    const tailY = state.y + DUCK_SIZE / 2 - y
    return {
      side,
      style: {
        '--duck-guide-tail-y': `${tailY}px`,
        left: `${x}px`,
        top: `${y}px`,
      },
    }
  }

  const app = createApp({
    name: 'DraggableDuckGuideLayerView',
    render() {
      const dialog = dialogPlacement()
      return h(
        'div',
        {
          class: 'draggable-duck-guide-layer',
          'data-testid': 'draggable-duck-guide-layer',
          hidden: !state.visible,
          onClick: stopOverlayEvent,
          onContextmenu: stopOverlayEvent,
          onDblclick: stopOverlayEvent,
          onPointerdown: stopOverlayEvent,
          onWheel: stopOverlayEvent,
        },
        [
          h('span', {
            'aria-hidden': 'true',
            class: 'draggable-duck-guide-layer__safe-area',
            'data-testid': 'draggable-duck-guide-safe-area',
          }),
          h(
            'button',
            {
              'aria-expanded': state.dialogOpen ? 'true' : 'false',
              'aria-label': '南京鸭文化向导，可拖动；点击查看介绍',
              class: [
                'draggable-duck-guide-layer__duck',
                { 'draggable-duck-guide-layer__duck--dragging': state.dragging },
              ],
              'data-testid': 'draggable-duck-guide-duck',
              onClick: handleDuckClick,
              onPointerdown: handlePointerDown,
              style: { left: `${state.x}px`, top: `${state.y}px` },
              title: '拖动小鸭子，点击听它讲南京鸭文化',
              type: 'button',
            },
            [
              h('span', { 'aria-hidden': 'true', class: 'draggable-duck-guide-layer__sprite' }, [
                h('img', {
                  alt: '',
                  draggable: 'false',
                  src: DUCK_GUIDE_IMAGE_URL,
                }),
              ]),
            ],
          ),
          h(
            'div',
            {
              class: [
                'draggable-duck-guide-layer__dialog',
                `draggable-duck-guide-layer__dialog--${dialog.side}`,
                {
                  'draggable-duck-guide-layer__dialog--open': state.visible && state.dialogOpen,
                },
              ],
              'data-testid': 'draggable-duck-guide-dialog-shell',
              onPointerdown: stopOverlayEvent,
              onPointerup: stopOverlayEvent,
              style: dialog.style,
            },
            [
              h(DraggableDuckGuideDialog, {
                culture,
                selectedDuckType: state.selectedDuckType,
                onDetails: onArticleSelect,
                currentDayDuckTypes: state.currentDayDuckTypes,
                onClose: closeDialog,
                open: state.visible && state.dialogOpen,
                otherDayDuckTypes: state.otherDayDuckTypes,
              }),
            ],
          ),
        ],
      )
    },
  })

  app.mount(mountElement)
  safeAreaElement = mountElement.querySelector('[data-testid=draggable-duck-guide-safe-area]')
  dialogElement = mountElement.querySelector('[data-testid=draggable-duck-guide-dialog-shell]')
  restorePosition()
  window.addEventListener('resize', handleResize)
  const resizeObserver =
    typeof ResizeObserver === 'function' ? new ResizeObserver(handleResize) : null
  resizeObserver?.observe(container)
  if (safeAreaElement) resizeObserver?.observe(safeAreaElement)
  if (dialogElement) resizeObserver?.observe(dialogElement)

  return {
    update(payload = {}) {
      if (destroyed) return
      state.currentDayDuckTypes = safeTypes(payload.currentDayDuckTypes)
      state.otherDayDuckTypes = safeTypes(payload.otherDayDuckTypes)
      state.selectedDuckType = payload.selectedDuckType || ''
    },
    setVisible(visible) {
      if (destroyed) return
      state.visible = Boolean(visible)
      if (!state.visible) {
        state.dialogOpen = false
        suppressClickUntil = 0
        stopDragging()
        return
      }
      void nextTick(handleResize)
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      stopDragging()
      window.removeEventListener('resize', handleResize)
      resizeObserver?.disconnect()
      app.unmount()
      mountElement.remove()
    },
  }
}

export function resetDraggableDuckGuideSessionPositionForTests() {
  sessionPositionRatio = null
}
