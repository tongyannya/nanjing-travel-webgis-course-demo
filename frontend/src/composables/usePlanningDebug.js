import { onBeforeUnmount, onMounted, ref } from 'vue'

const DOUBLE_PRESS_MS = 500

export function usePlanningDebug({ disabled = false } = {}) {
  const enabled = ref(false)
  let previousPress = null

  function reset() {
    previousPress = null
  }

  function handleKeydown(event) {
    const editing = event
      .composedPath()
      .some(
        (node) =>
          node instanceof Element &&
          (node.matches('input, textarea, select, [role="textbox"]') ||
            node.isContentEditable ||
            node.closest('[contenteditable]:not([contenteditable="false"])')),
      )
    if (
      disabled ||
      event.isComposing ||
      editing ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey
    ) {
      reset()
      return
    }
    if (event.code !== 'Backquote') {
      reset()
      return
    }
    if (event.repeat) return
    const now = performance.now()
    if (previousPress !== null && now - previousPress <= DOUBLE_PRESS_MS) {
      event.preventDefault()
      enabled.value = !enabled.value
      reset()
    } else previousPress = now
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeydown)
    window.addEventListener('blur', reset)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleKeydown)
    window.removeEventListener('blur', reset)
  })
  return { enabled }
}
