<script setup>
import UiSelect from './UiSelect.vue'
import { ref, watch } from 'vue'

import LayerIcon from './LayerIcon.vue'

const props = defineProps({
  category: { type: String, required: true },
  keyword: { type: String, required: true },
  message: { type: String, required: true },
  results: { type: Array, required: true },
  selectedResultKey: { type: String, default: '' },
  state: { type: String, required: true },
})

const emit = defineEmits(['search', 'select-result', 'update:category', 'update:keyword'])
const dismissed = ref(false)

// 住宿流程经 ref + defineExpose 聚焦搜索框，不做全局 DOM 查询。
function focusInput() {
  document.activeElement?.blur?.()
  keywordInput.value?.focus()
}

const keywordInput = ref(null)

defineExpose({ focusInput })

watch(
  () => props.state,
  () => {
    dismissed.value = false
  },
)

function selectResult(poi) {
  dismissed.value = true
  emit('select-result', poi)
}
</script>

<template>
  <div class="top-search" data-testid="top-search">
    <svg class="top-search__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.6" stroke="#7E918B" stroke-width="1.5" />
      <path d="M10.5 10.5 14 14" stroke="#7E918B" stroke-width="1.5" stroke-linecap="round" />
    </svg>
    <UiSelect>
      <select
        :value="category"
        aria-label="搜索类型"
        data-testid="search-category"
        @change="emit('update:category', $event.target.value)"
      >
        <option value="all">全部</option>
        <option value="attraction">景点</option>
        <option value="hotel">酒店</option>
        <option value="restaurant">饭店</option>
        <option value="transport">车站</option>
      </select>
    </UiSelect>
    <input
      ref="keywordInput"
      :value="keyword"
      data-testid="search-keyword"
      placeholder="搜索景点、酒店、饭店或车站"
      @input="emit('update:keyword', $event.target.value)"
      @keyup.enter="emit('search')"
    />
    <button
      type="button"
      data-testid="search-button"
      :disabled="state === 'loading'"
      @click="emit('search')"
    >
      <kbd>{{ state === 'loading' ? '查询中' : '搜索' }}</kbd>
    </button>
    <div
      v-if="state !== 'idle' && !dismissed"
      class="search-popover"
      :data-search-status="state"
      aria-live="polite"
    >
      <p>
        <b>地点搜索</b><span>{{ message }}</span>
        <button
          type="button"
          class="search-dismiss"
          data-testid="search-dismiss"
          aria-label="关闭地点搜索结果"
          @click="dismissed = true"
        >
          ×
        </button>
      </p>
      <button
        v-for="poi in results.slice(0, 8)"
        :key="poi.poi_id"
        type="button"
        :class="{
          'search-popover__result--formal': poi.isFormalAttraction,
          'search-popover__result--selected': poi.searchKey === selectedResultKey,
        }"
        :data-search-key="poi.searchKey"
        @click="selectResult(poi)"
      >
        <LayerIcon :name="poi.searchIcon || 'search'" />
        <span>
          <b>{{ poi.name }}</b>
          <small v-if="poi.isFormalAttraction">收录景点</small>
          <span>{{ poi.address }}</span>
        </span>
      </button>
    </div>
  </div>
</template>
