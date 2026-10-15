<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import UiSelect from './UiSelect.vue'

defineOptions({ inheritAttrs: false })
const props = defineProps({
  modelValue: { type: String, default: '' },
  type: { type: String, default: 'date' },
  label: { type: String, required: true },
  disabled: { type: Boolean, default: false },
  min: { type: String, default: '' },
  max: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'change'])
const root = ref(null)
const trigger = ref(null)
const popup = ref(null)
const native = ref(null)
const open = ref(false)
const position = ref({})
const month = ref(new Date())
const hour = ref('09')
const minute = ref('00')
const pad = (value) => String(value).padStart(2, '0')
const allowedTime = (value) =>
  (!props.min || value >= props.min) && (!props.max || value <= props.max)
const allowedHour = (value) =>
  (!props.min || `${value}:59` >= props.min) && (!props.max || `${value}:00` <= props.max)
const timeRangeHint = computed(
  () => `允许时间范围：${props.min || '00:00'}–${props.max || '23:59'}`,
)
watch(hour, (value) => {
  const time = `${value}:${minute.value}`
  if (props.min && time < props.min) minute.value = props.min.slice(3)
  if (props.max && time > props.max) minute.value = props.max.slice(3)
})
const dateText = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const display = computed(() => props.modelValue.replaceAll('-', '/') || '请选择')
const days = computed(() => {
  const first = new Date(month.value.getFullYear(), month.value.getMonth(), 1)
  const offset = (first.getDay() + 6) % 7
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(first.getFullYear(), first.getMonth(), index - offset + 1)
    return {
      value: dateText(date),
      day: date.getDate(),
      outside: date.getMonth() !== first.getMonth(),
    }
  })
})

function place() {
  if (!open.value || !trigger.value || !popup.value) return
  const box = trigger.value.getBoundingClientRect()
  const width = Math.min(props.type === 'date' ? 272 : 224, innerWidth - 16)
  const height = popup.value.scrollHeight + 2
  const below = innerHeight - box.bottom - 12
  const upwards = below < height && box.top > below
  position.value = {
    width: `${width}px`,
    left: `${Math.max(8, Math.min(box.left, innerWidth - width - 8))}px`,
    top: `${upwards ? Math.max(8, box.top - height - 4) : box.bottom + 4}px`,
    maxHeight: `${Math.max(80, upwards ? box.top - 12 : below)}px`,
  }
}
async function expand() {
  if (props.disabled) return
  month.value = new Date(
    (props.type === 'date' && props.modelValue ? props.modelValue : dateText(new Date())) +
      'T12:00:00',
  )
  ;[hour.value, minute.value] = (
    props.type === 'time' && props.modelValue ? props.modelValue : '09:00'
  ).split(':')
  open.value = true
  await nextTick()
  popup.value?.showPopover?.()
  place()
  popup.value?.querySelector('[aria-pressed="true"], button')?.focus()
}
function close(restoreFocus = true) {
  popup.value?.hidePopover?.()
  open.value = false
  if (restoreFocus) trigger.value?.focus()
}
function choose(value) {
  if (props.type === 'time' && !allowedTime(value)) return
  native.value.value = value
  native.value.dispatchEvent(new Event('input', { bubbles: true }))
  native.value.dispatchEvent(new Event('change', { bubbles: true }))
  close()
}
function shiftMonth(amount) {
  month.value = new Date(month.value.getFullYear(), month.value.getMonth() + amount, 1)
}
function handleKey(event) {
  if (event.key === 'Escape' && open.value) {
    event.preventDefault()
    event.stopPropagation()
    close()
  } else if (event.key === 'Tab' && open.value) {
    window.setTimeout(() => {
      if (!root.value?.contains(document.activeElement)) close(false)
    }, 0)
  }
}
function outside(event) {
  if (open.value && !root.value?.contains(event.target)) close(false)
}
function scroll(event) {
  if (!popup.value?.contains(event.target)) place()
}
document.addEventListener('pointerdown', outside, true)
window.addEventListener('resize', place)
window.addEventListener('scroll', scroll, true)
watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) close(false)
  },
)
onBeforeUnmount(() => {
  close(false)
  document.removeEventListener('pointerdown', outside, true)
  window.removeEventListener('resize', place)
  window.removeEventListener('scroll', scroll, true)
})
</script>

<template>
  <span ref="root" class="ui-date-time" @keydown="handleKey">
    <input
      ref="native"
      v-bind="$attrs"
      :type="type"
      :value="modelValue"
      :disabled="disabled"
      :min="min || undefined"
      :max="max || undefined"
      tabindex="-1"
      aria-hidden="true"
      @input="emit('update:modelValue', $event.target.value)"
      @change="emit('change', $event)"
    />
    <button
      ref="trigger"
      type="button"
      class="ui-date-time__trigger"
      :aria-label="label"
      :aria-expanded="open"
      aria-haspopup="dialog"
      :disabled="disabled"
      :data-date-time-trigger="$attrs['data-testid']"
      @click="open ? close() : expand()"
    >
      <span>{{ display }}</span>
      <svg v-if="type === 'date'" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="5" width="16" height="16" rx="3" />
        <path d="M4 10h16M8 3v4M16 3v4M8 14h2M14 14h2M8 17h2" />
      </svg>
      <svg v-else viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 6v6l4 2" />
      </svg>
    </button>
    <div
      v-if="open"
      ref="popup"
      class="ui-date-time__popup"
      popover="manual"
      role="dialog"
      :aria-label="label"
      :style="position"
      :data-date-time-popup="type"
    >
      <template v-if="type === 'date'">
        <header>
          <button
            type="button"
            aria-label="上一个月"
            data-calendar-shift="-1"
            @click="shiftMonth(-1)"
          >
            ‹
          </button>
          <strong>{{ month.getFullYear() }} 年 {{ month.getMonth() + 1 }} 月</strong>
          <button
            type="button"
            aria-label="下一个月"
            data-calendar-shift="1"
            @click="shiftMonth(1)"
          >
            ›
          </button>
        </header>
        <div class="ui-date-time__calendar">
          <small v-for="day in ['一', '二', '三', '四', '五', '六', '日']" :key="day">{{
            day
          }}</small>
          <button
            v-for="day in days"
            :key="day.value"
            type="button"
            :data-calendar-date="day.value"
            :aria-pressed="day.value === modelValue"
            :class="{ 'is-outside': day.outside }"
            @click="choose(day.value)"
          >
            {{ day.day }}
          </button>
        </div>
        <footer>
          <button type="button" @click="choose(dateText(new Date()))">今天</button
          ><button type="button" @click="close()">取消</button>
        </footer>
      </template>
      <template v-else>
        <strong>选择时间</strong>
        <div class="ui-date-time__time">
          <label
            >小时<UiSelect
              ><select v-model="hour" aria-label="小时" data-testid="time-hour">
                <option
                  v-for="value in 24"
                  :key="value"
                  :value="pad(value - 1)"
                  :disabled="!allowedHour(pad(value - 1))"
                  :title="!allowedHour(pad(value - 1)) ? timeRangeHint : undefined"
                >
                  {{ pad(value - 1) }}
                </option>
              </select></UiSelect
            ></label
          >
          <label
            >分钟<UiSelect
              ><select v-model="minute" aria-label="分钟" data-testid="time-minute">
                <option
                  v-for="value in 60"
                  :key="value"
                  :value="pad(value - 1)"
                  :disabled="!allowedTime(`${hour}:${pad(value - 1)}`)"
                  :title="!allowedTime(`${hour}:${pad(value - 1)}`) ? timeRangeHint : undefined"
                >
                  {{ pad(value - 1) }}
                </option>
              </select></UiSelect
            ></label
          >
        </div>
        <footer>
          <button type="button" @click="close()">取消</button
          ><button
            type="button"
            class="ui-date-time__confirm"
            data-time-confirm
            :disabled="!allowedTime(`${hour}:${minute}`)"
            @click="choose(`${hour}:${minute}`)"
          >
            确定
          </button>
        </footer>
      </template>
    </div>
  </span>
</template>

<style>
.ui-date-time {
  display: block;
  min-width: 0;
  position: relative;
}
.ui-date-time > input {
  position: absolute;
  width: 1px !important;
  height: 1px !important;
  padding: 0 !important;
  opacity: 0;
  pointer-events: none;
  clip-path: inset(50%);
}
.ui-date-time__trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-height: 38px;
  padding: 7px 10px;
  color: var(--bone);
  background: var(--control-surface);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 10px;
  font-size: 14px;
}
.day-time-row .ui-date-time__trigger {
  min-height: 32px;
  padding: 5px 7px;
}
.ui-date-time__trigger > span {
  color: inherit;
  font-size: inherit;
  white-space: nowrap;
}
.ui-date-time__trigger svg {
  width: 17px;
  height: 17px;
  flex: none;
  fill: none;
  stroke: var(--layer-accent);
  stroke-width: 1.5;
}
.ui-date-time__trigger:hover,
.ui-date-time__trigger[aria-expanded='true'] {
  background: var(--control-hover);
  border-color: var(--layer-accent);
}
.ui-date-time__popup {
  position: fixed;
  inset: auto;
  margin: 0;
  padding: 10px;
  overflow-y: auto;
  color: var(--bone);
  background: var(--control-surface);
  border: 1px solid var(--layer-accent);
  border-radius: 10px;
  box-shadow: var(--shadow-float);
  z-index: 3000;
}
.ui-date-time__popup header,
.ui-date-time__popup footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.ui-date-time__popup strong {
  font-size: 13px;
}
.ui-date-time__popup button {
  min-height: 28px;
  padding: 4px 8px;
  color: var(--bone);
  background: transparent;
  border: 0;
  border-radius: 6px;
  font-size: 13px;
}
.ui-date-time__popup button:hover {
  background: var(--control-hover);
}
.ui-date-time__calendar {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
  margin: 8px 0;
}
.ui-date-time__calendar small {
  text-align: center;
  padding: 3px;
  color: var(--bone-2);
}
.ui-date-time__calendar button {
  padding: 4px 0;
}
.ui-date-time__calendar .is-outside {
  color: var(--bone-3);
}
.ui-date-time__calendar [aria-pressed='true'],
.ui-date-time__popup .ui-date-time__confirm {
  color: var(--bone);
  background: var(--red);
}
.ui-date-time__time {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin: 10px 0;
}
.ui-date-time__time label {
  display: grid;
  gap: 5px;
  margin: 0;
  font-size: 12px;
}
</style>
