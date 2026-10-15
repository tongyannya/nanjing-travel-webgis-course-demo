<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({ notice: { type: Object, default: null } })
const emit = defineEmits(['close'])
const dialog = ref(null)
let returnFocus = null

watch(
  () => props.notice,
  async (notice) => {
    if (!notice) {
      dialog.value?.close?.()
      dialog.value?.removeAttribute('open')
      returnFocus?.focus?.()
      return
    }
    returnFocus = document.activeElement
    await nextTick()
    if (!props.notice) return
    if (dialog.value.showModal) dialog.value.showModal()
    else dialog.value.setAttribute('open', '')
    dialog.value.querySelector('button')?.focus()
  },
)

onBeforeUnmount(() => dialog.value?.close?.())
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="planning-notice-dialog"
      data-testid="planning-notice-dialog"
      aria-labelledby="planning-notice-title"
      @cancel.prevent="emit('close', false)"
      @click.self="emit('close', false)"
    >
      <template v-if="notice">
        <h2 id="planning-notice-title">
          {{ notice.title || (notice.allowContinue ? '生成前请确认' : '景点选择提示') }}
        </h2>
        <p v-for="message in notice.messages" :key="message">{{ message }}</p>
        <div class="planning-notice-dialog__actions">
          <button
            type="button"
            class="planning-notice-dialog__button"
            :class="
              notice.allowContinue
                ? 'planning-notice-dialog__button--secondary'
                : 'planning-notice-dialog__button--primary'
            "
            data-testid="planning-notice-back"
            @click="emit('close', false)"
          >
            {{ notice.backLabel || (notice.allowContinue ? '返回修改计划' : '知道了') }}
          </button>
          <button
            v-if="notice.allowContinue"
            type="button"
            class="planning-notice-dialog__button planning-notice-dialog__button--primary"
            data-testid="planning-notice-continue"
            @click="emit('close', true)"
          >
            {{ notice.continueLabel || '继续生成' }}
          </button>
        </div>
      </template>
    </dialog>
  </Teleport>
</template>
