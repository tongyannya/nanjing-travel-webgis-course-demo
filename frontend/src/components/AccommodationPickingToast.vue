<script setup>
// 地图左下角“选择中……”浮窗：只有“选好了”才提交当前候选；无候选时禁用确认。
// 几何与左侧图层栏完全重叠（同一 left/width），按钮位于文字下方。
import { onBeforeUnmount, onMounted } from 'vue'

defineProps({
  purpose: { type: String, required: true },
  candidateName: { type: String, default: '' },
})
const emit = defineEmits(['confirm', 'cancel'])
function handleEscape(event) {
  if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('dialog[open]'))
    return
  event.preventDefault()
  emit('cancel')
}
onMounted(() => document.addEventListener('keydown', handleEscape))
onBeforeUnmount(() => document.removeEventListener('keydown', handleEscape))
</script>

<template>
  <div class="picking-toast" data-testid="picking-toast" role="status" aria-live="polite">
    <div class="picking-toast__text">
      <b>选择中……</b>
      <small>{{
        candidateName ||
        (purpose === 'lodging' || purpose === 'attraction_nearby'
          ? '搜索地点或点击已有图标'
          : '在地图或搜索结果中选择一个地点')
      }}</small>
    </div>
    <div class="picking-toast__actions">
      <button
        type="button"
        class="picking-toast__cancel action-button--green"
        data-testid="picking-toast-cancel"
        @click="emit('cancel')"
      >
        上一题
      </button>
      <button
        type="button"
        class="picking-toast__confirm"
        data-testid="picking-toast-confirm"
        :disabled="!candidateName"
        @click="emit('confirm')"
      >
        选好了
      </button>
    </div>
  </div>
</template>
