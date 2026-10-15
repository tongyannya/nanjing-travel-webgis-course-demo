<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { DATA_SOURCE_GROUPS } from '../content/dataSources'

defineProps({
  backendMessage: { type: String, required: true },
  backendState: { type: String, required: true },
})
const emit = defineEmits(['close', 'retry-connection'])
const dialog = ref(null)
const closeButton = ref(null)
let previousFocus

function handleKeydown(event) {
  if (event.key !== 'Tab') return
  const controls = [...dialog.value.querySelectorAll('button, [tabindex="0"]')].filter(
    (control) => !control.disabled && control.getClientRects().length,
  )
  const index = controls.indexOf(document.activeElement)
  event.preventDefault()
  controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length]?.focus()
}

onMounted(() => {
  previousFocus = document.activeElement
  dialog.value.showModal()
  closeButton.value.focus()
})

onBeforeUnmount(() => {
  dialog.value?.close()
  previousFocus?.focus({ preventScroll: true })
})
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="data-sources-dialog"
      data-testid="data-sources-dialog"
      aria-labelledby="data-sources-title"
      aria-describedby="data-sources-lead"
      @cancel.prevent="emit('close')"
      @click.self="emit('close')"
      @keydown.stop="handleKeydown"
    >
      <header>
        <div>
          <h2 id="data-sources-title">数据说明</h2>
          <p id="data-sources-lead">当前程序使用的数据来源与更新方式</p>
        </div>
        <button
          ref="closeButton"
          type="button"
          data-testid="data-sources-close"
          aria-label="关闭数据说明"
          @click="emit('close')"
        >
          ×
        </button>
      </header>
      <div class="data-sources-dialog__body" tabindex="0" aria-label="数据来源详情">
        <table>
          <colgroup>
            <col class="data-sources-dialog__name" />
            <col class="data-sources-dialog__source" />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">数据内容</th>
              <th scope="col">来源</th>
              <th scope="col">使用与更新方式</th>
            </tr>
          </thead>
          <tbody v-for="group in DATA_SOURCE_GROUPS" :key="group.title">
            <tr class="data-sources-dialog__group">
              <th colspan="3" scope="colgroup">
                <h3>{{ group.title }}</h3>
                <p>{{ group.note }}</p>
              </th>
            </tr>
            <tr v-for="row in group.rows" :key="row.name">
              <th scope="row">{{ row.name }}</th>
              <td>{{ row.source }}</td>
              <td>{{ row.description }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <footer>
        <p aria-live="polite" :data-state="backendState">
          <span>连接状态</span>{{ backendMessage }}
        </p>
        <button
          type="button"
          data-testid="data-sources-retry"
          :disabled="backendState === 'checking'"
          @click="emit('retry-connection')"
        >
          {{ backendState === 'checking' ? '检查中…' : '重新连接' }}
        </button>
      </footer>
    </dialog>
  </Teleport>
</template>
