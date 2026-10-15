<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import LayerIcon from './LayerIcon.vue'

const props = defineProps({ stage: { type: Number, default: 0 } })
const slot = ref(0)
const destination = ref(0)
const hopping = ref(false)
const requested = ref(0)
let landing, frame
const waiters = []
function advance() {
  if (hopping.value) return
  if (slot.value >= requested.value) {
    for (const resolve of waiters.splice(0)) resolve()
    return
  }
  destination.value = slot.value + 1
  hopping.value = true
  landing = setTimeout(() => {
    slot.value = destination.value
    hopping.value = false
    // Commit each landing before starting the next hop, even if stages finish together.
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(advance)
    })
  }, 480)
}
watch(
  () => props.stage,
  (stage) => {
    requested.value = Math.max(requested.value, Math.min(3, stage))
    advance()
  },
  { immediate: true },
)
function finish() {
  requested.value = 3
  return new Promise((resolve) => {
    waiters.push(resolve)
    advance()
  })
}
defineExpose({ finish })
onBeforeUnmount(() => {
  clearTimeout(landing)
  cancelAnimationFrame(frame)
  for (const resolve of waiters.splice(0)) resolve()
})
</script>

<template>
  <div class="tutorial-loading-content">
    <p role="status">加载中...</p>
    <div class="tutorial-duck-track" aria-hidden="true" data-testid="tutorial-loading-animation">
      <span
        class="tutorial-duck-walker"
        :style="{ left: `${destination * 40 + 2}px` }"
        :data-slot="slot"
        :data-hopping="hopping"
      >
        <LayerIcon name="duck" class="tutorial-loading-duck" :class="{ 'is-hopping': hopping }" />
      </span>
      <span
        v-for="index in 4"
        :key="index"
        class="tutorial-loading-segment"
        :class="{ 'is-pressed': !hopping && slot === index - 1, 'is-filled': slot >= index - 1 }"
      ></span>
    </div>
  </div>
</template>
