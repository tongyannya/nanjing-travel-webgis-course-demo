<script setup>
defineOptions({ inheritAttrs: false })
const props = defineProps({
  modelValue: { type: [Number, String], default: 0 },
  disabled: { type: Boolean, default: false },
  min: { type: Number, default: 0 },
  step: { type: Number, default: 1 },
  label: { type: String, required: true },
})
const emit = defineEmits(['update:modelValue'])
function change(amount) {
  emit(
    'update:modelValue',
    Math.max(props.min, (Number(props.modelValue) || 0) + amount * props.step),
  )
}
</script>

<template>
  <span class="ui-number-stepper" :class="{ 'ui-number-stepper--disabled': disabled }">
    <input
      v-bind="$attrs"
      type="number"
      :value="modelValue"
      :min="min"
      :step="step"
      :disabled="disabled"
      :aria-label="label"
      @input="
        emit('update:modelValue', $event.target.value === '' ? '' : Number($event.target.value))
      "
    />
    <span class="ui-number-stepper__buttons">
      <button
        type="button"
        :aria-label="`${label}增加${step}`"
        :disabled="disabled"
        data-testid="budget-increase"
        @click="change(1)"
      >
        <svg viewBox="0 0 12 8" aria-hidden="true"><path d="m2 6 4-4 4 4" /></svg>
      </button>
      <button
        type="button"
        :aria-label="`${label}减少${step}`"
        :disabled="disabled || Number(modelValue) <= min"
        data-testid="budget-decrease"
        @click="change(-1)"
      >
        <svg viewBox="0 0 12 8" aria-hidden="true"><path d="m2 2 4 4 4-4" /></svg>
      </button>
    </span>
  </span>
</template>

<style>
.ui-number-stepper {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 28px;
  position: relative;
  min-width: 0;
}
.ui-number-stepper input {
  width: 100%;
  padding-right: 34px;
  grid-area: 1 / 1 / 2 / 3;
  appearance: textfield;
}
.ui-number-stepper input::-webkit-inner-spin-button,
.ui-number-stepper input::-webkit-outer-spin-button {
  appearance: none;
  margin: 0;
}
.ui-number-stepper__buttons {
  grid-area: 1 / 2;
  z-index: 1;
  display: grid;
  padding: 3px;
}
.ui-number-stepper__buttons button {
  display: grid;
  place-items: center;
  min-height: 0;
  padding: 1px 3px;
  color: var(--bone-3);
  border: 0;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
}
.ui-number-stepper__buttons button:hover:not(:disabled) {
  color: var(--bone);
  background: var(--control-hover);
}
.ui-number-stepper__buttons button:disabled {
  opacity: 0.35;
  cursor: default;
}
.ui-number-stepper svg {
  width: 12px;
  height: 8px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
}
</style>
