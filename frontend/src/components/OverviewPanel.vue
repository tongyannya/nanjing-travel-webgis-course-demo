<script setup>
import NanjingLandmarkSkyline from './NanjingLandmarkSkyline.vue'
import DuckCultureToggleArt from './DuckCultureToggleArt.vue'

defineProps({
  attractionCount: { type: Number, default: 0 },
  hasSavedPlan: { type: Boolean, default: false },
  duckMode: { type: Boolean, default: false },
  lodgingName: { type: String, default: '' },
  hasPendingAccommodation: { type: Boolean, default: false },
  planningLabel: { type: String, default: '开始规划' },
  hasDiscoveredAuthor: { type: Boolean, default: false },
})
const emit = defineEmits([
  'open-duck-culture',
  'open-saved',
  'open-export',
  'toggle-duck',
  'open-tutorial',
  'open-introduction',
  'open-author',
  'open-accommodation',
  'start-planning',
])
</script>

<template>
  <section class="overview-panel" data-testid="overview-panel">
    <NanjingLandmarkSkyline />
    <div class="overview-panel__hero">
      <p>点击景点查看信息，或开始制定行程。</p>
      <small>收录 {{ attractionCount }} 个景点，查看资料并规划你的南京之行。</small>
    </div>
    <button
      type="button"
      class="overview-panel__primary"
      data-testid="overview-start-planning"
      @click="emit('start-planning', $event.currentTarget)"
    >
      {{ planningLabel }}
    </button>
    <button
      type="button"
      class="overview-panel__accommodation"
      data-testid="overview-accommodation"
      @click="emit('open-accommodation', $event.currentTarget)"
    >
      {{ hasPendingAccommodation ? '继续修改住宿安排' : lodgingName ? '修改住宿安排' : '住宿安排' }}
      <span>{{ lodgingName || '尚未安排，先选择住处再规划' }}</span>
    </button>
    <div class="overview-plan-actions" role="group" aria-label="方案文件与保存">
      <button
        type="button"
        class="overview-plan-actions__open action-button--red"
        data-testid="overview-open-saved"
        @click="emit('open-saved')"
      >
        打开/导入方案
      </button>
      <button
        type="button"
        class="overview-plan-actions__export action-button--green"
        data-testid="overview-open-export"
        @click="emit('open-export')"
      >
        保存/导出方案
      </button>
    </div>
    <button
      type="button"
      class="overview-duck-culture action-button--green"
      data-testid="overview-open-duck"
      @click="emit('open-duck-culture')"
    >
      了解南京鸭文化
    </button>
    <button
      type="button"
      class="overview-duck-toggle action-button--green"
      data-testid="overview-toggle-duck"
      :aria-pressed="duckMode"
      @click="emit('toggle-duck')"
    >
      <span>{{ duckMode ? '关闭南京鸭文化' : '开启南京鸭文化' }}<small>（文化层）</small></span>
      <DuckCultureToggleArt :active="duckMode" />
    </button>
    <div class="overview-panel__help-links">
      <button
        type="button"
        class="overview-panel__tutorial"
        data-testid="overview-open-tutorial"
        @click="emit('open-tutorial', $event.currentTarget)"
      >
        使用教程
      </button>
      <button
        type="button"
        class="overview-panel__tutorial"
        data-testid="overview-open-introduction"
        @click="emit('open-introduction')"
      >
        查看开屏弹窗
      </button>
    </div>
    <button
      v-if="hasDiscoveredAuthor"
      type="button"
      class="overview-panel__tutorial"
      data-testid="overview-open-author"
      @click="emit('open-author')"
    >
      查看作者的话
    </button>
  </section>
</template>
