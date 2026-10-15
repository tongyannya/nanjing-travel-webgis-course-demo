<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, onUpdated, ref, useId } from 'vue'

// Keep each field's option values and change handler in its native form control.
// The visible menu uses the same values, with shared styling and keyboard behavior.
const root = ref(null)
const trigger = ref(null)
const menu = ref(null)
const options = ref([])
const value = ref('')
const disabled = ref(false)
const fieldName = ref('选择选项')
const testId = ref('')
const open = ref(false)
const highlighted = ref(-1)
const position = ref({})
const id = useId()
const selectedLabel = computed(
  () => options.value.find((item) => item.value === value.value)?.label || '',
)
let observer

function field() {
  return root.value?.querySelector('select')
}

function sync() {
  const select = field()
  if (!select) return
  select.tabIndex = -1
  select.setAttribute('aria-hidden', 'true')
  const items = [...select.options].map((option) => ({
    value: option.value,
    label: option.textContent.trim(),
    disabled: option.disabled || option.parentElement?.disabled === true,
    hint: option.getAttribute('title') || '',
  }))
  if (JSON.stringify(items) !== JSON.stringify(options.value)) options.value = items
  value.value = select.value
  disabled.value = select.disabled
  const label = select.closest('label')?.cloneNode(true)
  label?.querySelectorAll('.ui-select').forEach((element) => element.remove())
  fieldName.value = select.getAttribute('aria-label') || label?.textContent.trim() || '选择选项'
  testId.value =
    select.dataset.testid ||
    select.dataset.wizardAttractionFilter ||
    select.dataset.attractionFilter ||
    select.dataset.attractionChoice ||
    ''
  if (disabled.value && open.value) close(false)
}

function placeMenu() {
  if (!open.value || !trigger.value) return
  const box = trigger.value.getBoundingClientRect()
  const measure = document.createElement('span')
  measure.style.cssText = `position:fixed;visibility:hidden;white-space:pre;font:13px ${getComputedStyle(trigger.value).fontFamily}`
  document.body.append(measure)
  const labelWidth = Math.max(
    ...options.value.map((item) => {
      measure.textContent = item.label
      return measure.getBoundingClientRect().width
    }),
  )
  measure.remove()
  const width = Math.min(Math.max(96, labelWidth + 62), 360, innerWidth - 16)
  const below = innerHeight - box.bottom - 12
  const above = box.top - 12
  const upwards = below < 180 && above > below
  const height = Math.min(
    280,
    Math.max(40, upwards ? above : below),
    options.value.length * 38 + 12,
  )
  position.value = {
    left: `${Math.max(8, Math.min(box.left, innerWidth - width - 8))}px`,
    top: `${upwards ? box.top - height - 4 : box.bottom + 4}px`,
    width: `${width}px`,
    maxHeight: `${height}px`,
  }
}

async function expand() {
  sync()
  if (disabled.value || !options.value.length) return
  open.value = true
  highlighted.value = options.value.findIndex(
    (item) => item.value === value.value && !item.disabled,
  )
  if (highlighted.value < 0) highlighted.value = options.value.findIndex((item) => !item.disabled)
  await nextTick()
  menu.value?.showPopover?.()
  placeMenu()
  scrollHighlight()
}

function close(restoreFocus = true) {
  menu.value?.hidePopover?.()
  open.value = false
  if (restoreFocus) trigger.value?.focus()
}

function choose(item) {
  if (item.disabled || disabled.value) return
  const select = field()
  select.value = item.value
  select.dispatchEvent(new Event('change', { bubbles: true }))
  sync()
  close()
}

async function scrollHighlight() {
  await nextTick()
  menu.value
    ?.querySelector(`[data-select-index="${highlighted.value}"]`)
    ?.scrollIntoView?.({ block: 'nearest' })
}

async function handleKey(event) {
  if (event.key === 'Escape' && open.value) {
    event.preventDefault()
    event.stopPropagation()
    close()
  } else if (event.key === 'Tab') close(false)
  else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault()
    if (!open.value) return expand()
    const enabled = options.value
      .map((item, index) => (item.disabled ? -1 : index))
      .filter((index) => index >= 0)
    if (!enabled.length) return
    const index = enabled.indexOf(highlighted.value)
    highlighted.value =
      event.key === 'Home'
        ? enabled[0]
        : event.key === 'End'
          ? enabled.at(-1)
          : enabled[(index + (event.key === 'ArrowUp' ? -1 : 1) + enabled.length) % enabled.length]
    scrollHighlight()
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    if (open.value && options.value[highlighted.value]) choose(options.value[highlighted.value])
    else expand()
  }
}

function outside(event) {
  if (open.value && !root.value?.contains(event.target)) close(false)
}

function onScroll(event) {
  if (!menu.value?.contains(event.target)) placeMenu()
}

onMounted(() => {
  sync()
  observer = new MutationObserver(sync)
  observer.observe(field(), {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['disabled', 'label', 'title'],
  })
  document.addEventListener('pointerdown', outside, true)
  window.addEventListener('resize', placeMenu)
  window.addEventListener('scroll', onScroll, true)
})
onUpdated(sync)
onBeforeUnmount(() => {
  close(false)
  observer?.disconnect()
  document.removeEventListener('pointerdown', outside, true)
  window.removeEventListener('resize', placeMenu)
  window.removeEventListener('scroll', onScroll, true)
})
</script>

<template>
  <span ref="root" class="ui-select" @change="sync">
    <slot />
    <button
      ref="trigger"
      type="button"
      class="ui-select__trigger"
      role="combobox"
      :aria-label="fieldName"
      :aria-expanded="open"
      aria-haspopup="listbox"
      :aria-controls="id"
      :aria-activedescendant="open && highlighted >= 0 ? `${id}-${highlighted}` : undefined"
      :disabled="disabled"
      :data-select-trigger="testId || fieldName"
      @click="open ? close() : expand()"
      @keydown="handleKey"
    >
      <span>{{ selectedLabel }}</span>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
    </button>
    <div
      v-if="open"
      :id="id"
      ref="menu"
      class="ui-select__menu"
      popover="manual"
      role="listbox"
      :aria-label="fieldName"
      :style="position"
    >
      <span
        v-for="(item, index) in options"
        :key="`${item.value}-${index}`"
        class="ui-select__option-wrap"
        role="presentation"
        :data-hover-text="item.hint || undefined"
        ><button
          :id="`${id}-${index}`"
          class="ui-select__option"
          type="button"
          role="option"
          tabindex="-1"
          :aria-selected="item.value === value"
          :disabled="item.disabled"
          :data-hover-text="item.hint || undefined"
          :data-select-value="item.value"
          :data-select-index="index"
          :class="{ 'ui-select__option--highlighted': index === highlighted }"
          @pointermove="highlighted = index"
          @click.stop="choose(item)"
        >
          <span>{{ item.label }}</span
          ><span v-if="item.value === value" aria-hidden="true">✓</span>
        </button>
      </span>
    </div>
  </span>
</template>

<style>
.ui-select {
  display: inline-block;
  width: 100%;
  min-width: 0;
  position: relative;
}
.ui-select > select {
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  margin: 0 !important;
  padding: 0 !important;
  opacity: 0;
  pointer-events: none;
  clip-path: inset(50%);
}
.ui-select__trigger {
  width: 100%;
  min-width: 0;
  min-height: 34px;
  padding: 7px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--bone);
  background: var(--control-surface);
  border: 1px solid color-mix(in srgb, var(--bone-3) 45%, transparent);
  border-radius: 8px;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.ui-select__trigger > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ui-select__trigger svg {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  fill: none;
  stroke: var(--layer-accent);
  stroke-width: 1.5;
  transition: transform 160ms;
}
.ui-select__trigger[aria-expanded='true'] svg {
  transform: rotate(180deg);
}
.ui-select__trigger:hover,
.ui-select__trigger[aria-expanded='true'] {
  background: var(--control-hover);
  border-color: var(--layer-accent);
}
.ui-select__trigger:focus-visible {
  outline: 2px solid var(--layer-accent);
  outline-offset: 2px;
}
.ui-select__trigger:disabled {
  opacity: 0.5;
  cursor: default;
}
.ui-select__menu {
  position: fixed;
  inset: auto;
  margin: 0;
  padding: 5px;
  box-sizing: border-box;
  overflow-y: auto;
  overscroll-behavior: contain;
  color: var(--bone);
  background: var(--control-surface);
  border: 1px solid color-mix(in srgb, var(--layer-accent) 45%, var(--ink-500));
  border-radius: 10px;
  box-shadow: var(--shadow-float);
  z-index: 3000;
}
.ui-select__option-wrap {
  display: block;
}
.ui-select__menu .ui-select__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  min-height: 38px;
  padding: 8px 10px;
  color: var(--bone-2);
  background: transparent;
  border: 0;
  border-radius: 6px;
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
  text-align: left;
  cursor: pointer;
}
.ui-select__menu .ui-select__option[aria-selected='true'] {
  color: var(--layer-accent);
  background: var(--teal-wash);
  font-weight: 700;
}
.ui-select__menu .ui-select__option > span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ui-select__menu .ui-select__option.ui-select__option--highlighted {
  color: var(--bone);
  background: var(--ink-600);
}
.ui-select__menu .ui-select__option:disabled {
  opacity: 0.4;
  cursor: default;
  pointer-events: none;
}
.top-search .ui-select {
  width: 76px;
  flex-shrink: 0;
}
.trip-form .ui-select__trigger {
  min-height: 38px;
  border-radius: 10px;
  font-size: 14px;
}
.top-search .ui-select__trigger {
  min-height: 30px;
  padding: 4px 7px;
  color: inherit;
  background: transparent;
  border: 0;
  border-right: 1px solid color-mix(in srgb, var(--bone-3) 45%, transparent);
  border-radius: 0;
  font-size: 12px;
}
.attraction-choice-filter-grid .ui-select__trigger {
  min-height: 32px;
  padding: 6px 8px;
  font-size: 11px;
}
</style>
