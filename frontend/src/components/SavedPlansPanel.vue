<script setup>
import { ref } from 'vue'
import HistoryPlanList from './HistoryPlanList.vue'

import { SAVED_PLAN_NAME_MAX_LENGTH, validateSavedPlanName } from '../planning/savedPlansStorage'

const props = defineProps({
  savedPlans: { type: Array, required: true },
  saveMessage: { type: String, default: '' },
  historyPlans: { type: Array, default: () => [] },
})
const emit = defineEmits([
  'delete-plan',
  'open-plan',
  'rename-plan',
  'import-file',
  'open-history',
  'delete-history',
])
const fileInput = ref(null)
const historyOpen = ref(true)
function selectFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (file) emit('import-file', file)
}

const editingId = ref(null)
const editName = ref('')
const editError = ref('')
const confirmingDeleteId = ref(null)

function formatSavedAt(value) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function beginRename(record) {
  confirmingDeleteId.value = null
  editingId.value = record.id
  editName.value = record.name
  editError.value = ''
}

function cancelRename() {
  editingId.value = null
  editError.value = ''
}

function submitRename(id) {
  const validation = validateSavedPlanName(editName.value, props.savedPlans, id)
  editName.value = validation.name
  editError.value = validation.error
  if (validation.error) return
  emit('rename-plan', { id, name: validation.name })
  cancelRename()
}

function beginDelete(id) {
  cancelRename()
  confirmingDeleteId.value = id
}

function confirmDelete(id) {
  emit('delete-plan', id)
  confirmingDeleteId.value = null
}
</script>

<template>
  <section class="saved-plans-panel" data-testid="saved-plans-panel">
    <p>打开本机保存的方案，或导入从其他设备导出的方案文件。</p>
    <input
      ref="fileInput"
      type="file"
      accept=".json,application/json"
      hidden
      data-testid="plan-import-file"
      @change="selectFile"
    />
    <button
      type="button"
      class="saved-plans-panel__export"
      data-testid="plan-import-button"
      @click="fileInput.click()"
    >
      导入方案文件
    </button>
    <h3 class="saved-plans-panel__saved-title">本机已保存方案</h3>
    <p v-if="saveMessage" class="saved-plans-panel__feedback" role="status">
      {{ saveMessage }}
    </p>
    <div v-if="savedPlans.length" class="saved-plans-list">
      <article v-for="record in savedPlans" :key="record.id" class="saved-plan-card">
        <div class="saved-plan-card__identity">
          <span aria-hidden="true">◇</span>
          <div v-if="editingId !== record.id">
            <b>{{ record.name }}</b>
            <small>保存于 {{ formatSavedAt(record.savedAt) }}</small>
          </div>
          <div v-else class="saved-plan-card__rename">
            <input
              v-model="editName"
              :maxlength="SAVED_PLAN_NAME_MAX_LENGTH"
              :aria-label="`修改“${record.name}”的名称`"
              @keydown.enter.prevent="submitRename(record.id)"
              @keydown.escape.prevent="cancelRename"
            />
            <small v-if="editError" role="alert">{{ editError }}</small>
          </div>
        </div>

        <div v-if="confirmingDeleteId === record.id" class="saved-plan-card__confirm">
          <span>确定删除“{{ record.name }}”吗？</span>
          <button type="button" @click="confirmingDeleteId = null">取消</button>
          <button
            type="button"
            class="danger"
            :data-testid="`confirm-delete-${record.id}`"
            @click="confirmDelete(record.id)"
          >
            确认删除
          </button>
        </div>
        <div v-else-if="editingId === record.id" class="saved-plan-card__actions">
          <button type="button" @click="cancelRename">取消</button>
          <button
            type="button"
            :data-testid="`confirm-rename-${record.id}`"
            @click="submitRename(record.id)"
          >
            保存名称
          </button>
        </div>
        <div v-else class="saved-plan-card__actions">
          <button
            type="button"
            :data-testid="`open-saved-plan-${record.id}`"
            @click="emit('open-plan', record.id)"
          >
            打开
          </button>
          <button type="button" @click="beginRename(record)">改名</button>
          <button type="button" @click="beginDelete(record.id)">删除</button>
        </div>
      </article>
    </div>
    <div v-else class="dock-empty-state">
      <b>还没有已保存方案</b>
      <p>可以导入方案文件，也可以生成行程后保存。</p>
    </div>
    <section class="saved-plans-panel__history layer-group" data-testid="saved-plan-history">
      <header class="layer-group__header">
        <button
          type="button"
          class="layer-group__trigger"
          :aria-expanded="historyOpen"
          data-testid="saved-history-toggle"
          @click="historyOpen = !historyOpen"
        >
          <span>历史方案</span>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="m7 10 5 5 5-5" stroke="currentColor" stroke-width="1.8" />
          </svg>
        </button>
      </header>
      <div v-show="historyOpen" class="layer-group__body">
        <p>本次浏览记录，刷新后清空。</p>
        <HistoryPlanList
          :records="historyPlans"
          @open-plan="emit('open-history', $event)"
          @delete-plan="emit('delete-history', $event)"
        />
      </div>
    </section>
  </section>
</template>
