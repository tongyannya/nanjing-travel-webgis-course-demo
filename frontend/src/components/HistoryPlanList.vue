<script setup>
defineProps({
  records: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['open-plan', 'delete-plan'])

function formatCreatedAt(value) {
  const date = new Date(value)
  const pad = (part) => String(part).padStart(2, '0')
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
</script>

<template>
  <ul v-if="records.length" class="history-plan-list" data-testid="history-plan-list">
    <li v-for="record in records" :key="record.id" :data-history-id="record.id">
      <button
        type="button"
        class="history-plan-list__open text-action"
        :disabled="disabled"
        @click="emit('open-plan', record.id)"
      >
        {{ record.name }} {{ formatCreatedAt(record.createdAt) }}
      </button>
      <button
        type="button"
        class="history-plan-list__delete text-action"
        @click="emit('delete-plan', record.id)"
      >
        删除
      </button>
    </li>
  </ul>
  <p v-else class="history-plan-list__empty">本次还没有生成方案。</p>
</template>
