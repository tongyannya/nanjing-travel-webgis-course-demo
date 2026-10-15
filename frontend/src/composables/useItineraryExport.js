import { computed, nextTick, onBeforeUnmount, ref } from 'vue'

import { toBlob } from 'html-to-image'

import { selectExportPixelRatio } from '../planning/itineraryExport'
import { buildItineraryJson } from '../planning/itineraryJsonExport'

// Local PNG and portable plan files share busy state and URL cleanup.
// One export runs at a time; the sheet snapshot is fixed by the caller before
// this composable touches the DOM, so later plan/date changes cannot leak into
// an image that is already rendering.

const IDLE_STATE = Object.freeze({ kind: '', status: 'idle', fileName: '', error: '' })

function createState() {
  return { ...IDLE_STATE }
}

export function useItineraryExport() {
  const state = ref(createState())
  const isGenerating = computed(() => state.value.status === 'generating')
  const preview = ref(null)
  let lastDownloadAt = -Infinity

  let exportSequence = 0
  let disposed = false
  const pendingObjectUrls = new Map()

  function revokeActiveObjectUrl() {
    pendingObjectUrls.forEach((timer, url) => {
      clearTimeout(timer)
      URL.revokeObjectURL(url)
    })
    pendingObjectUrls.clear()
  }

  function saveBlob(blob, fileName) {
    if (Date.now() - lastDownloadAt < 1000) return false
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.append(link)
    link.click()
    link.remove()
    lastDownloadAt = Date.now()
    // Keep the URL alive briefly: Safari can cancel the download if it is
    // revoked synchronously after the click.
    const timer = setTimeout(() => {
      URL.revokeObjectURL(url)
      pendingObjectUrls.delete(url)
    }, 2000)
    pendingObjectUrls.set(url, timer)
    return true
  }

  // Closing the dialog (or unmounting) abandons any in-flight rendering: the
  // pending blob is dropped, no download fires and no state survives.
  function resetExport() {
    exportSequence += 1
    state.value = createState()
    revokeActiveObjectUrl()
    if (preview.value) URL.revokeObjectURL(preview.value.url)
    preview.value = null
  }

  async function exportSheet({ kind, fileName, getElement, previewOnly = false }) {
    if (disposed || isGenerating.value || (!previewOnly && Date.now() - lastDownloadAt < 1000))
      return false
    const requestId = ++exportSequence
    const isCurrent = () => !disposed && requestId === exportSequence
    state.value = { kind, status: 'generating', fileName: '', error: '' }
    try {
      await nextTick()
      if (!isCurrent()) return false
      const element = typeof getElement === 'function' ? getElement() : null
      if (!element) throw new Error('导出模板尚未渲染，请重试。')
      if (document.fonts?.ready) await document.fonts.ready
      if (!isCurrent()) return false
      const { pixelRatio, error } = selectExportPixelRatio(
        element.offsetWidth,
        element.offsetHeight,
      )
      if (error) throw new Error(error)
      const blob = await toBlob(element, {
        pixelRatio,
        backgroundColor: '#f2ecdf',
        skipFonts: true,
      })
      if (!isCurrent()) return false
      if (!blob || !blob.size) throw new Error('生成的图片数据为空，请重试。')
      if (preview.value) URL.revokeObjectURL(preview.value.url)
      preview.value = { kind, fileName, blob, url: URL.createObjectURL(blob) }
      if (!previewOnly) saveBlob(blob, fileName)
      state.value = { kind, status: previewOnly ? 'preview' : 'success', fileName, error: '' }
      return true
    } catch (error) {
      if (isCurrent()) {
        state.value = {
          kind,
          status: 'error',
          fileName: '',
          error: error?.message || '图片生成失败，请重试。',
        }
      }
      return false
    }
  }

  function exportJson(input) {
    if (disposed || isGenerating.value || Date.now() - lastDownloadAt < 1000) return false
    state.value = { kind: 'json', status: 'generating', fileName: '', error: '' }
    try {
      const { fileName, text } = buildItineraryJson(input)
      saveBlob(new Blob([text], { type: 'application/json;charset=utf-8' }), fileName)
      state.value = { kind: 'json', status: 'success', fileName, error: '' }
      return true
    } catch (error) {
      state.value = {
        kind: 'json',
        status: 'error',
        fileName: '',
        error: error?.message || 'JSON 导出失败，请重试。',
      }
      return false
    }
  }

  function downloadPreview() {
    if (disposed || isGenerating.value || !preview.value) return false
    if (!saveBlob(preview.value.blob, preview.value.fileName)) return false
    state.value = {
      kind: preview.value.kind,
      status: 'success',
      fileName: preview.value.fileName,
      error: '',
    }
    return true
  }

  onBeforeUnmount(() => {
    disposed = true
    exportSequence += 1
    revokeActiveObjectUrl()
    if (preview.value) URL.revokeObjectURL(preview.value.url)
  })

  return { isGenerating, resetExport, exportSheet, exportJson, downloadPreview, preview, state }
}
