import { onBeforeUnmount, provide, ref } from 'vue'

export const PLANNING_NOTICE_KEY = Symbol('planning-notice')

export function usePlanningNotices() {
  const planningNotice = ref(null)
  let resolveNotice = null

  function closePlanningNotice(confirmed = false) {
    const resolve = resolveNotice
    resolveNotice = null
    planningNotice.value = null
    resolve?.(confirmed)
  }

  function showPlanningNotice(messages, allowContinue = false, labels = {}) {
    closePlanningNotice()
    planningNotice.value = {
      messages: Array.isArray(messages) ? messages : [messages],
      allowContinue,
      ...labels,
    }
    return new Promise((resolve) => {
      resolveNotice = resolve
    })
  }

  provide(PLANNING_NOTICE_KEY, showPlanningNotice)
  onBeforeUnmount(() => closePlanningNotice())
  return { planningNotice, showPlanningNotice, closePlanningNotice }
}
