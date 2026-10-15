<script setup>
import { onBeforeUnmount, onMounted } from 'vue'

defineProps({ candidateName: { type: String, default: '' } })
const emit = defineEmits(['back', 'next', 'cancel'])
function handleKeydown(event) {
  if (event.key !== 'Escape') return
  event.preventDefault()
  emit('cancel')
}
onMounted(() => document.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <section class="picking-toast" data-testid="accommodation-area-picking" aria-label="选择住宿片区">
    <div class="picking-toast__text">
      <b>在地图上选择住宿片区</b>
      <small>{{ candidateName || '点击一个浅橙色圆形，再点选好了；每个范围半径 1000 米。' }}</small>
    </div>
    <div class="picking-toast__actions">
      <button
        type="button"
        class="picking-toast__cancel action-button--green"
        data-testid="accommodation-area-back"
        @click="emit('back')"
      >
        上一题
      </button>
      <button
        type="button"
        class="picking-toast__confirm"
        data-testid="accommodation-area-next"
        :disabled="!candidateName"
        @click="emit('next')"
      >
        选好了
      </button>
    </div>
  </section>
</template>
