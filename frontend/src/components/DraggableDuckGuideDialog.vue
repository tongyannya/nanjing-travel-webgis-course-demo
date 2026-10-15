<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { duckContentTypeLabel, duckTypeLabel, useDuckCulture } from '../composables/useDuckCulture'
import {
  buildDuckGuideContentQueue,
  chooseDuckGuideContentIndex,
  nextDuckGuideContentIndex,
} from '../planning/duckGuideContent'

const props = defineProps({
  culture: { type: Object, default: null },
  currentDayDuckTypes: { type: Array, default: () => [] },
  open: { type: Boolean, default: false },
  otherDayDuckTypes: { type: Array, default: () => [] },
  selectedDuckType: { type: String, default: '' },
})

const emit = defineEmits(['close', 'retry', 'next', 'details'])
const dialog = ref(null)
const activeIndex = ref(0)
let previousArticleId = null
const { articles, listError, listState, loadArticles, retryLoadArticles } =
  props.culture || useDuckCulture()

const routePayload = computed(() => ({
  currentDayDuckTypes: props.currentDayDuckTypes,
  otherDayDuckTypes: props.otherDayDuckTypes,
}))
const contentQueue = computed(() => buildDuckGuideContentQueue(articles.value, routePayload.value))
const activeArticle = computed(() => contentQueue.value[activeIndex.value] || null)
const queueSignature = computed(() => contentQueue.value.map((article) => article.id).join('|'))

function focusDialog() {
  void nextTick(() => dialog.value?.focus())
}

function requestClose() {
  emit('close')
}

function retry() {
  retryLoadArticles()
  emit('retry')
}

function showNext() {
  activeIndex.value = nextDuckGuideContentIndex(activeIndex.value, contentQueue.value.length)
  previousArticleId = activeArticle.value?.id || null
  emit('next', activeArticle.value?.id || null)
}

function chooseArticle() {
  if (!props.open || !contentQueue.value.length) return
  activeIndex.value = chooseDuckGuideContentIndex(
    contentQueue.value,
    props.selectedDuckType,
    previousArticleId,
  )
  previousArticleId = activeArticle.value?.id || null
}

function handleKeydown(event) {
  if (!props.open || event.key !== 'Escape') return
  event.preventDefault()
  requestClose()
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  if (props.open) {
    void loadArticles()
    focusDialog()
    chooseArticle()
  }
})

onBeforeUnmount(() => document.removeEventListener('keydown', handleKeydown))

watch(
  () => props.open,
  (open) => {
    if (!open) return
    void loadArticles()
    focusDialog()
    chooseArticle()
  },
)

watch([queueSignature, () => props.selectedDuckType], chooseArticle)
</script>

<template>
  <section
    v-if="open"
    ref="dialog"
    class="duck-guide-dialog"
    data-testid="duck-guide-dialog"
    role="dialog"
    aria-label="南京鸭文化向导"
    aria-modal="false"
    tabindex="-1"
  >
    <button
      type="button"
      class="duck-guide-dialog__close"
      data-testid="duck-guide-dialog-close"
      aria-label="关闭鸭文化向导"
      @click="requestClose"
    >
      ×
    </button>

    <div
      v-if="listState === 'idle' || listState === 'loading'"
      class="duck-guide-dialog__status"
      data-testid="duck-guide-dialog-loading"
      role="status"
    >
      正在翻找今天的鸭文化故事……
    </div>

    <div
      v-else-if="listState === 'error'"
      class="duck-guide-dialog__status duck-guide-dialog__status--error"
      data-testid="duck-guide-dialog-error"
      role="alert"
    >
      <b>这次没有读到鸭文化内容</b>
      <p>{{ listError }}</p>
      <button type="button" data-testid="duck-guide-dialog-retry" @click="retry">重新读取</button>
    </div>

    <div
      v-else-if="listState === 'empty' || !activeArticle"
      class="duck-guide-dialog__status"
      data-testid="duck-guide-dialog-empty"
      role="status"
    >
      <b>暂时没有可讲的鸭文化故事</b>
    </div>

    <template v-else>
      <article class="duck-guide-dialog__content" data-testid="duck-guide-dialog-content">
        <p class="duck-guide-dialog__eyebrow">
          <span>{{ duckContentTypeLabel(activeArticle.content_type) }}</span>
          <span>{{ duckTypeLabel(activeArticle.duck_type) }}</span>
        </p>
        <h3 data-testid="duck-guide-dialog-title">{{ activeArticle.title }}</h3>
        <p data-testid="duck-guide-dialog-summary">{{ activeArticle.summary }}</p>
        <button
          type="button"
          class="duck-guide-dialog__details"
          data-testid="duck-guide-dialog-details"
          @click="emit('details', activeArticle.id)"
        >
          了解详情
        </button>
      </article>
      <footer class="duck-guide-dialog__footer">
        <small data-testid="duck-guide-dialog-position">
          {{ activeIndex + 1 }} / {{ contentQueue.length }}
        </small>
        <button
          v-if="contentQueue.length > 1"
          type="button"
          data-testid="duck-guide-dialog-next"
          @click="showNext"
        >
          再讲一个
        </button>
      </footer>
    </template>
  </section>
</template>

<style src="../styles/draggable-duck-guide.css"></style>
