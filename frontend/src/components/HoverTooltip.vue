<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

const tooltip = ref(null)
const text = ref('')
const visible = ref(false)
const position = ref({ left: '0px', top: '0px' })
let anchor = null

function hide() {
  if (anchor) {
    const ids = (anchor.getAttribute('aria-describedby') || '').split(' ').filter(Boolean)
    const remaining = ids.filter((id) => id !== 'shared-hover-tooltip')
    if (remaining.length) anchor.setAttribute('aria-describedby', remaining.join(' '))
    else anchor.removeAttribute('aria-describedby')
  }
  anchor = null
  visible.value = false
  tooltip.value?.hidePopover?.()
}

async function show(event) {
  const target = event.target instanceof Element ? event.target : event.target?.parentElement
  const candidate = target?.closest('[data-hover-text], [title]')
  if (!candidate || target.closest('.context-help, .context-help__tooltip')) {
    hide()
    return
  }
  // SDK markers may add native titles after rendering; migrate them before the browser displays them.
  const message = candidate.getAttribute('title') || candidate.dataset.hoverText
  for (let element = candidate; element; element = element.parentElement) {
    if (element.hasAttribute('title')) {
      element.dataset.hoverText = element.getAttribute('title') || ''
      element.removeAttribute('title')
    }
  }
  if (!message) return hide()
  hide()
  anchor = candidate
  text.value = message
  visible.value = true
  const ids = (candidate.getAttribute('aria-describedby') || '').split(' ').filter(Boolean)
  candidate.setAttribute('aria-describedby', [...ids, 'shared-hover-tooltip'].join(' '))
  await nextTick()
  if (anchor !== candidate || !candidate.isConnected) return
  tooltip.value?.showPopover?.()
  const bounds = candidate.getBoundingClientRect()
  const size = tooltip.value.getBoundingClientRect()
  const left = Math.max(12, Math.min(bounds.left, window.innerWidth - size.width - 12))
  const top =
    bounds.bottom + size.height + 20 < window.innerHeight
      ? bounds.bottom + 8
      : Math.max(12, bounds.top - size.height - 8)
  position.value = { left: `${left}px`, top: `${top}px` }
}

function leave(event) {
  if (anchor && !(event.relatedTarget instanceof Node && anchor.contains(event.relatedTarget)))
    hide()
}
function keydown(event) {
  if (event.key === 'Escape') hide()
}

onMounted(() => {
  document.addEventListener('pointerover', show)
  document.addEventListener('pointerout', leave)
  document.addEventListener('focusin', show)
  document.addEventListener('focusout', leave)
  document.addEventListener('pointerdown', hide, true)
  document.addEventListener('scroll', hide, true)
  document.addEventListener('keydown', keydown)
  window.addEventListener('resize', hide)
})
onBeforeUnmount(() => {
  hide()
  document.removeEventListener('pointerover', show)
  document.removeEventListener('pointerout', leave)
  document.removeEventListener('focusin', show)
  document.removeEventListener('focusout', leave)
  document.removeEventListener('pointerdown', hide, true)
  document.removeEventListener('scroll', hide, true)
  document.removeEventListener('keydown', keydown)
  window.removeEventListener('resize', hide)
})
</script>

<template>
  <Teleport to="body">
    <div
      id="shared-hover-tooltip"
      ref="tooltip"
      class="hover-tooltip"
      role="tooltip"
      popover="manual"
      :data-visible="visible"
      :style="position"
    >
      {{ text }}
    </div>
  </Teleport>
</template>

<style>
.hover-tooltip {
  position: fixed;
  inset: auto;
  z-index: 10001;
  max-width: min(380px, calc(100vw - 24px));
  margin: 0;
  padding: 7px 10px;
  border: 0;
  border-radius: 6px;
  color: #fff;
  background: var(--hover-tooltip-background, #1a2421);
  font-size: 12px;
  line-height: 1.5;
  text-align: left;
  white-space: pre-line;
  overflow-wrap: anywhere;
  pointer-events: none;
}
body.duck-mode .hover-tooltip {
  --hover-tooltip-background: #3b3028;
  color: var(--bone);
}
.hover-tooltip[data-visible='false'] {
  display: none;
}
.hover-tooltip[data-visible='true'] {
  display: block;
}
</style>
