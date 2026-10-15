<script setup>
import { computed, onMounted, watch } from 'vue'

import { FEATURE_STATES } from '../ui/featureAvailability'
import { duckContentTypeLabel, duckTypeLabel, useDuckCulture } from '../composables/useDuckCulture'

const props = defineProps({
  panelOpen: { type: Boolean, default: false },
  navigationRequest: { type: Object, default: null },
})

const {
  articles,
  backToList,
  detail,
  detailError,
  detailState,
  hasLoaded,
  isDetailView,
  listError,
  listState,
  loadArticles,
  openArticle,
  retryLoadArticles,
  selectedArticleId,
} = useDuckCulture()

let pendingNavigation = null
function openRequestedIntroduction() {
  if (!props.panelOpen || !pendingNavigation || listState.value !== 'success') return
  const article = articles.value.find((item) =>
    pendingNavigation.articleId
      ? item.id === pendingNavigation.articleId
      : item.content_type === 'food_intro' && item.duck_type === pendingNavigation.duckType,
  )
  pendingNavigation = null
  if (article) void openArticle(article.id)
}

watch(
  () => props.navigationRequest,
  (request) => {
    if (!request) return
    backToList()
    pendingNavigation = request.articleId || request.duckType ? request : null
    void loadArticles()
    openRequestedIntroduction()
  },
)
watch(listState, openRequestedIntroduction)

onMounted(() => {
  if (props.panelOpen) void loadArticles()
})

watch(
  () => props.panelOpen,
  (open) => {
    if (open) {
      void loadArticles()
      openRequestedIntroduction()
    } else pendingNavigation = null
  },
)

const articleCount = computed(() => articles.value.length)
const detailParagraphs = computed(() => {
  const text = detail.value?.detail || ''
  return text
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
})

/** 按正文出现顺序为引用编号建立 [T?-??] → [1][2][3] 的映射，来源列表用同一顺序展示。 */
const citationOrder = computed(() => {
  const order = []
  const seen = new Set()
  const text = detail.value?.detail || ''
  const pattern = /\[(T\d-\d{2})\]/g
  let match
  while ((match = pattern.exec(text)) !== null) {
    const citationId = match[1]
    if (!seen.has(citationId)) {
      seen.add(citationId)
      order.push(citationId)
    }
  }
  return order
})

const citationIndexById = computed(() => {
  const map = new Map()
  citationOrder.value.forEach((citationId, index) => {
    map.set(citationId, index + 1)
  })
  return map
})

const orderedSources = computed(() => {
  const sources = detail.value?.sources || []
  const byId = new Map(sources.map((source) => [source.citation_id, source]))
  const ordered = []
  const seen = new Set()
  for (const citationId of citationOrder.value) {
    const source = byId.get(citationId)
    if (source && !seen.has(citationId)) {
      ordered.push(source)
      seen.add(citationId)
    }
  }
  // 正文未引用但来源列表里存在的条目，仍按原顺序附在后面，保证信息不丢失。
  for (const source of sources) {
    if (!seen.has(source.citation_id)) {
      ordered.push(source)
      seen.add(source.citation_id)
    }
  }
  return ordered
})

/** 把正文段落拆成文本片段和引用上标，引用显示为按出现顺序编号的 [n]，纯文本处理不注入 HTML。 */
function splitCitations(paragraph) {
  const parts = []
  const pattern = /\[(T\d-\d{2})\]/g
  let cursor = 0
  let match
  while ((match = pattern.exec(paragraph)) !== null) {
    if (match.index > cursor)
      parts.push({ text: paragraph.slice(cursor, match.index), citation: null })
    parts.push({ text: match[1], citation: match[1] })
    cursor = match.index + match[0].length
  }
  if (cursor < paragraph.length) parts.push({ text: paragraph.slice(cursor), citation: null })
  return parts.length > 0 ? parts : [{ text: paragraph, citation: null }]
}
</script>

<template>
  <section class="duck-culture-panel" data-testid="duck-culture-panel">
    <div class="duck-culture-panel__hero" aria-hidden="true">
      <span></span><i></i>
      <svg viewBox="0 0 120 80" preserveAspectRatio="none" fill="none">
        <ellipse cx="59" cy="73" rx="52" ry="4" fill="#98C8DE" />
        <path
          d="M16 73c5 2 10 2 15 1m56 0c7 0 12-1 15-3"
          stroke="#D7EFF7"
          stroke-width="1.5"
          stroke-linecap="round"
        />
        <path
          d="M9 35c2-6 7 2 14 2 5 0 11-5 20-5 15-1 20 3 31 2 14-3 26 7 29 18 4 12-7 21-24 21H36C20 74 7 62 7 49c0-6 0-12 2-14Z"
          fill="#F1A125"
        />
        <path
          d="M9 35c2-6 7 2 14 2 5 0 11-5 20-5 15-1 20 3 31 2 14-3 26 7 29 18 2 8-3 12-12 16-8 3-18 5-27 4l-4-2-1-3-3-1c2-7 3-13-2-18-7 6-17 10-24 4-6-4-6-8-7-8-6 6-12 6-16 3 0-5 0-10 2-12Z"
          fill="#FFE238"
        />
        <path d="M29 38c9-6 23-3 28 6 5 9-1 17-12 18-10 1-17-4-17-12Z" fill="#F1A125" />
        <path d="M29 36c9-6 23-3 28 6 4 8-2 15-12 16-10 1-17-3-17-12Z" fill="#FFE650" />
        <path d="M32 37c4-2 9-2 13-1" stroke="#FFF3A4" stroke-width="2.5" stroke-linecap="round" />
        <path
          d="M49 23C49 9 59 2 71 3c13 0 23 10 23 21 0 10-6 15-18 16-14 2-28-3-27-17Z"
          fill="#FFE238"
        />
        <path d="M50 28c1 5 5 8 12 10-7 0-12-3-13-7Z" fill="#F1A125" />
        <path d="M60 7c7-4 16-3 23 1-1 4-7 3-13 1Z" fill="#FFF3A4" />
        <path d="M86 11c3 3 5 6 6 10" stroke="#FFF3A4" stroke-width="3" stroke-linecap="round" />
        <path d="M93 24c6 3 11 3 16 1 3-2 5 1 4 5-2 6-11 10-18 7-5-2-7-7-2-13Z" fill="#D77528" />
        <path d="M93 22c6 3 11 3 16 1 3-2 5 1 4 5-2 5-11 8-18 6-5-2-7-6-2-12Z" fill="#F79A39" />
        <ellipse cx="77" cy="27" rx="4" ry="2.8" fill="#F7B73A" />
        <circle cx="84" cy="22" r="2.6" fill="#30210F" />
      </svg>
      <div><small>NANJING · DUCK CULTURE</small><b>南京鸭事</b><em>金陵鸭游</em></div>
    </div>

    <template v-if="isDetailView">
      <button
        type="button"
        class="duck-culture-panel__back"
        data-testid="duck-detail-back"
        @click="backToList"
      >
        ‹ 返回文章列表
      </button>
      <div
        v-if="detailState === 'loading'"
        class="duck-culture-panel__status"
        data-testid="duck-detail-loading"
      >
        正在读取文章内容……
      </div>
      <div
        v-else-if="detailState === 'error'"
        class="duck-culture-panel__status duck-culture-panel__status--error"
        data-testid="duck-detail-error"
      >
        <p>{{ detailError }}</p>
        <button
          v-if="selectedArticleId"
          type="button"
          data-testid="duck-detail-retry"
          @click="openArticle(selectedArticleId)"
        >
          重新读取
        </button>
      </div>
      <template v-else-if="detailState === 'success' && detail">
        <h3 class="duck-culture-panel__detail-title" data-testid="duck-detail-title">
          {{ detail.title }}
        </h3>
        <p class="duck-culture-panel__detail-meta">
          <i>{{ duckContentTypeLabel(detail.content_type) }}</i>
          <i>{{ duckTypeLabel(detail.duck_type) }}</i>
        </p>
        <div class="duck-culture-panel__detail-body" data-testid="duck-detail-body">
          <p v-for="(paragraph, index) in detailParagraphs" :key="index">
            <template v-for="(part, partIndex) in splitCitations(paragraph)" :key="partIndex">
              <sup
                v-if="part.citation"
                class="duck-culture-panel__citation"
                :data-citation-id="part.citation"
                >[{{ citationIndexById.get(part.citation) }}]</sup
              >
              <template v-else>{{ part.text }}</template>
            </template>
          </p>
        </div>
        <div class="duck-culture-panel__sources" data-testid="duck-detail-sources">
          <b>内容来源</b>
          <ul>
            <li v-for="(source, index) in orderedSources" :key="source.citation_id">
              <a :href="source.url" target="_blank" rel="noopener noreferrer">
                [{{ index + 1 }}] {{ source.title }}
              </a>
              <small>核实于 {{ source.verified_at }}</small>
            </li>
          </ul>
        </div>
      </template>
    </template>

    <template v-else>
      <p>浏览南京鸭文化故事，点击页面顶栏的“南京鸭文化”开关切换文化视角。</p>

      <div
        v-if="listState === 'loading'"
        class="duck-culture-panel__status"
        data-testid="duck-list-loading"
      >
        正在读取鸭文化内容……
      </div>
      <div
        v-else-if="listState === 'error'"
        class="duck-culture-panel__status duck-culture-panel__status--error"
        data-testid="duck-list-error"
      >
        <p>{{ listError }}</p>
        <button type="button" data-testid="duck-list-retry" @click="retryLoadArticles">
          重新读取
        </button>
      </div>
      <div
        v-else-if="listState === 'empty'"
        class="honest-empty-state"
        data-testid="duck-list-empty"
      >
        <span>{{ FEATURE_STATES.duckCulture.label }}</span>
        <h3>后端暂无鸭文化内容</h3>
        <p>没有可展示的文章。确认后端提供正式内容后，可点击重新读取。</p>
      </div>
      <template v-else-if="listState === 'success'">
        <div class="duck-culture-panel__list-head" data-testid="duck-list-head">
          <b>正式文章</b>
          <span>共 {{ articleCount }} 篇 · 全部带来源</span>
        </div>
        <ul class="duck-culture-panel__list" data-testid="duck-list">
          <li v-for="article in articles" :key="article.id">
            <button
              type="button"
              class="duck-culture-panel__article"
              :data-testid="`duck-article-${article.id}`"
              @click="openArticle(article.id)"
            >
              <b>{{ article.title }}</b>
              <span class="duck-culture-panel__article-tags">
                <i>{{ duckContentTypeLabel(article.content_type) }}</i>
                <i>{{ duckTypeLabel(article.duck_type) }}</i>
              </span>
              <span class="duck-culture-panel__article-summary">{{ article.summary }}</span>
            </button>
          </li>
        </ul>
      </template>
      <div v-else class="honest-empty-state" data-testid="duck-list-idle">
        <span>{{ FEATURE_STATES.duckCulture.label }}</span>
        <h3>打开面板后自动读取内容</h3>
        <p>正在等待面板打开，读取后展示正式文章列表。</p>
      </div>

      <p
        v-if="hasLoaded && listState !== 'error'"
        class="duck-culture-panel__note"
        data-testid="duck-list-footnote"
      >
        内容均来自已核实的公开来源，正文中会标注引用编号。
      </p>
    </template>
  </section>
</template>
