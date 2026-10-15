import { computed, onBeforeUnmount, ref } from 'vue'

import { apiRequest } from '../services/api'

const CONTENT_TYPE_LABELS = {
  origin_story: '起源故事',
  classic_recipe: '经典做法',
  food_intro: '美食介绍',
}

const DUCK_TYPE_LABELS = {
  salted_duck: '盐水鸭',
  duck_blood_soup: '鸭血粉丝汤',
  roast_duck: '烤鸭',
  pressed_duck: '板鸭',
  nanjing_cuisine: '金陵鸭馔',
}

export function duckContentTypeLabel(contentType) {
  return CONTENT_TYPE_LABELS[contentType] || '鸭文化内容'
}

export function duckTypeLabel(duckType) {
  return DUCK_TYPE_LABELS[duckType] || '南京鸭文化'
}

/**
 * 鸭文化列表与文章详情状态。
 * 列表只在面板首次打开时请求一次，重复打开直接复用；加载中不重复请求。
 * 详情按需请求并缓存成功结果，用请求序号丢弃过期响应，支持快速切换文章。
 */
export function useDuckCulture() {
  const listState = ref('idle') // idle | loading | success | empty | error
  const listError = ref('')
  const articles = ref([])

  let listRequestId = 0
  let listLoadStarted = false
  let listController = null
  let disposed = false

  const selectedArticleId = ref(null)
  const detailState = ref('idle') // idle | loading | success | error
  const detailError = ref('')
  const detail = ref(null)
  const successDetailCache = new Map()
  let detailRequestId = 0
  let detailController = null

  function invalidateDetailRequest() {
    detailRequestId += 1
    detailController?.abort()
    detailController = null
  }

  const hasLoaded = computed(() => listLoadStarted && listState.value !== 'loading')
  const isDetailView = computed(() => selectedArticleId.value !== null)

  async function loadArticles() {
    if (disposed) return
    if (listLoadStarted && listState.value !== 'error') return
    listLoadStarted = true

    const requestId = ++listRequestId
    const controller = new AbortController()
    listController = controller
    listState.value = 'loading'
    listError.value = ''
    try {
      const payload = await apiRequest('/api/duck-culture', { signal: controller.signal })
      if (requestId !== listRequestId) return
      const items = Array.isArray(payload?.items) ? payload.items : []
      if (items.length === 0) {
        articles.value = []
        listState.value = 'empty'
        return
      }
      articles.value = items
      listState.value = 'success'
    } catch (error) {
      if (requestId !== listRequestId) return
      articles.value = []
      listError.value = error?.message || '鸭文化内容读取失败，请稍后重试。'
      listState.value = 'error'
    } finally {
      if (listController === controller) listController = null
    }
  }

  function retryLoadArticles() {
    void loadArticles()
  }

  async function openArticle(articleId) {
    if (disposed) return
    // 同一篇文章正在加载或已成功展示时，重复点击不重新请求；失败后允许重试。
    if (
      selectedArticleId.value === articleId &&
      (detailState.value === 'loading' || detailState.value === 'success')
    ) {
      return
    }
    invalidateDetailRequest()
    const requestId = detailRequestId
    selectedArticleId.value = articleId

    const cached = successDetailCache.get(articleId)
    if (cached) {
      detail.value = cached
      detailState.value = 'success'
      detailError.value = ''
      return
    }

    const controller = new AbortController()
    detailController = controller
    detail.value = null
    detailState.value = 'loading'
    detailError.value = ''
    try {
      const payload = await apiRequest(`/api/duck-culture/${articleId}`, {
        signal: controller.signal,
      })
      if (requestId !== detailRequestId) return
      detail.value = payload
      detailState.value = 'success'
      successDetailCache.set(articleId, payload)
    } catch (error) {
      if (requestId !== detailRequestId) return
      detail.value = null
      detailError.value = error?.message || '文章内容读取失败，请稍后重试。'
      detailState.value = 'error'
    } finally {
      if (detailController === controller) detailController = null
    }
  }

  function backToList() {
    invalidateDetailRequest()
    selectedArticleId.value = null
    detail.value = null
    detailState.value = 'idle'
    detailError.value = ''
  }

  onBeforeUnmount(() => {
    disposed = true
    listRequestId += 1
    listController?.abort()
    listController = null
    invalidateDetailRequest()
  })

  return {
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
  }
}
