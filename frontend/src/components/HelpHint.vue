<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'

const props = defineProps({
  label: { type: String, required: true },
  text: { type: String, required: true },
  testId: { type: String, default: '' },
})
const id = `context-help-${useId()}`
const trigger = ref(null)
const tooltip = ref(null)
const open = ref(false)
const position = ref({})
let showTimer
let hideTimer

function close() {
  clearTimeout(showTimer)
  clearTimeout(hideTimer)
  open.value = false
}

async function show() {
  clearTimeout(showTimer)
  clearTimeout(hideTimer)
  const anchor = trigger.value?.getBoundingClientRect()
  if (!anchor?.width) return
  const panel = trigger.value.closest(
    '.info-dock, .layer-sidebar, .planning-wizard, .export-dialog',
  )
  const bounds = panel?.getBoundingClientRect()
  const width = Math.min(420, bounds ? bounds.width - 28 : 360, window.innerWidth - 24)
  const left = Math.max(
    12,
    Math.min(bounds ? bounds.left + 14 : anchor.left, window.innerWidth - width - 12),
  )
  position.value = { width: `${width}px`, left: `${left}px`, top: `${anchor.bottom + 10}px` }
  open.value = true
  await nextTick()
  const height = tooltip.value?.getBoundingClientRect().height || 0
  if (anchor.bottom + 10 + height > window.innerHeight - 12) {
    position.value.top = `${Math.max(12, anchor.top - height - 10)}px`
  }
}

function scheduleShow() {
  clearTimeout(hideTimer)
  clearTimeout(showTimer)
  showTimer = setTimeout(show, 350)
}

function scheduleHide() {
  clearTimeout(showTimer)
  clearTimeout(hideTimer)
  hideTimer = setTimeout(close, 200)
}

function keepOpen() {
  clearTimeout(hideTimer)
}

function handleKeydown(event) {
  if (open.value && event.key === 'Escape') {
    close()
    event.preventDefault()
    event.stopImmediatePropagation()
  }
}

function handlePointerdown(event) {
  if (!trigger.value?.contains(event.target) && !tooltip.value?.contains(event.target)) close()
}

watch(() => props.text, close)
onMounted(() => {
  window.addEventListener('keydown', handleKeydown, true)
  document.addEventListener('pointerdown', handlePointerdown, true)
  window.addEventListener('resize', close)
  document.addEventListener('scroll', close, true)
})
onBeforeUnmount(() => {
  close()
  window.removeEventListener('keydown', handleKeydown, true)
  document.removeEventListener('pointerdown', handlePointerdown, true)
  window.removeEventListener('resize', close)
  document.removeEventListener('scroll', close, true)
})
</script>

<template>
  <span class="context-help" @mouseenter="scheduleShow" @mouseleave="scheduleHide">
    <button
      ref="trigger"
      type="button"
      class="context-help__trigger"
      :aria-label="`了解${label}的功能和使用方式`"
      :aria-describedby="open ? id : undefined"
      :data-testid="testId || undefined"
      @focus="show"
      @blur="scheduleHide"
      @click.stop="show"
    >
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="8" />
        <path d="M10 8.5v5" />
        <circle cx="10" cy="5.8" r="0.8" class="context-help__dot" />
      </svg>
    </button>
    <Teleport to="body">
      <span
        v-if="open"
        :id="id"
        ref="tooltip"
        class="context-help__tooltip"
        :style="position"
        role="tooltip"
        @mouseenter="keepOpen"
        @mouseleave="scheduleHide"
        >{{ text }}</span
      >
    </Teleport>
  </span>
</template>

<style scoped>
.context-help {
  display: inline-flex;
  flex: 0 0 auto;
  vertical-align: middle;
}
.context-help > .context-help__trigger {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  min-width: 20px;
  padding: 0;
  color: var(--bone-3);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.24);
  border-radius: 50%;
  cursor: help;
}
.context-help__trigger svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-width: 1.5;
}
.context-help__dot {
  fill: currentColor;
  stroke: none;
}
.context-help__trigger:hover,
.context-help__trigger:focus-visible {
  color: var(--bone);
  background: rgba(255, 255, 255, 0.13);
  border-color: rgba(255, 255, 255, 0.46);
}
.context-help__trigger:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 2px;
}
.context-help__tooltip {
  position: fixed;
  z-index: 10000;
  box-sizing: border-box;
  padding: 12px 14px;
  color: var(--bone);
  background: rgba(25, 38, 36, 0.97);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  box-shadow: 0 12px 28px rgba(5, 12, 11, 0.28);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.7;
  text-align: left;
}
</style>
