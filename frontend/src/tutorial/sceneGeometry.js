export function visibleTutorialRects(selectors, document, viewport) {
  return selectors.flatMap((selector) =>
    [...document.querySelectorAll(selector)]
      .filter((e) => e.getClientRects().length)
      .flatMap((element) => {
        const r = element.getBoundingClientRect()
        let left = r.left,
          right = r.right,
          top = r.top,
          bottom = r.bottom
        if (selector === '[data-testid=map-workspace]') {
          const sidebar = document.querySelector('.layer-sidebar')?.getBoundingClientRect()
          const dock = document.querySelector('.info-dock')?.getBoundingClientRect()
          const header = document.querySelector('.app-header')?.getBoundingClientRect()
          const timeline = document.querySelector('[data-testid=map-route-timeline]')
          if (sidebar?.width) left = Math.max(left, sidebar.right + 8)
          if (dock?.width) right = Math.min(right, dock.left - 8)
          if (header?.height) top = Math.max(top, header.bottom + 8)
          if (timeline?.getClientRects().length)
            bottom = Math.min(bottom, timeline.getBoundingClientRect().top - 8)
        }
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          const style = document.defaultView.getComputedStyle(parent)
          const bounds = parent.getBoundingClientRect()
          if (['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowY)) {
            top = Math.max(top, bounds.top)
            bottom = Math.min(bottom, bounds.bottom)
          }
          if (['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowX)) {
            left = Math.max(left, bounds.left)
            right = Math.min(right, bounds.right)
          }
        }
        left = Math.max(4, left - 4)
        top = Math.max(4, top - 4)
        right = Math.min(viewport.width - 4, right + 4)
        bottom = Math.min(viewport.height - 4, bottom + 4)
        if (selector === '[data-testid=map-workspace]' && right > left && bottom > top) {
          // Keep the surrounding map blurred; focus on the middle of the usable map area.
          const insetX = (right - left) * 0.15
          const insetY = (bottom - top) * 0.15
          left += insetX
          right -= insetX
          top += insetY
          bottom -= insetY
        }
        return right > left && bottom > top
          ? [{ x: left, y: top, width: right - left, height: bottom - top }]
          : []
      }),
  )
}

export function placeTutorialCard(targets, size, viewport, placement = 'auto') {
  const { width, height } = size
  // Prefer the middle when several positions leave the targets unobstructed.
  const center = (viewport.width - width) / 2
  const right = viewport.width - width - 12
  const centerRight = Math.min(
    right,
    Math.max(
      center + viewport.width * 0.1,
      ...targets.map((target) => target.x + target.width + 24),
    ),
  )
  const xs = {
    left: [12, center, right],
    right: [right, center, 12],
    'center-right': [centerRight, right, center, 12],
    auto: [center, 12, right],
  }[placement] || [center, 12, right]
  const ys = [Math.max(80, (viewport.height - height) / 2), 84, viewport.height - height - 12]
  const overlap = (a, b) =>
    Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  const candidates = xs.flatMap((x) =>
    ys.map((y) => ({ x: Math.max(12, x), y: Math.max(12, y), width, height })),
  )
  return candidates.reduce((best, candidate) => {
    const score = (r) =>
      targets.reduce(
        (sum, t) =>
          sum +
          overlap(r, { x: t.x - 10, y: t.y - 10, width: t.width + 20, height: t.height + 20 }),
        0,
      )
    return score(candidate) < score(best) ? candidate : best
  })
}

export function tutorialLeader(card, target) {
  const x = card.x + card.width / 2,
    y = card.y + card.height / 2
  const tx = target.x + target.width / 2,
    ty = target.y + target.height / 2
  const dx = tx - x,
    dy = ty - y
  if (!dx && !dy) return null
  const start = Math.min(card.width / 2 / Math.abs(dx), card.height / 2 / Math.abs(dy))
  const end = Math.min(target.width / 2 / Math.abs(dx), target.height / 2 / Math.abs(dy))
  return { x1: x + dx * start, y1: y + dy * start, x2: tx - dx * end, y2: ty - dy * end }
}

export function combineTutorialRects(rects, viewport) {
  if (!rects.length) return null
  const x = Math.max(4, Math.min(...rects.map((r) => r.x)) - 4)
  const y = Math.max(4, Math.min(...rects.map((r) => r.y)) - 4)
  const right = Math.min(viewport.width - 4, Math.max(...rects.map((r) => r.x + r.width)) + 4)
  const bottom = Math.min(viewport.height - 4, Math.max(...rects.map((r) => r.y + r.height)) + 4)
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null
}
