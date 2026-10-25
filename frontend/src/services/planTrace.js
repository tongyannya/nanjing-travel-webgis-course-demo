import { apiBaseUrl } from './api'

export async function requestPlanTrace(payload, type, { signal, onEvent, timeoutMs = 120_000 }) {
  const controller = new AbortController()
  const abort = () => controller.abort()
  const timeout = window.setTimeout(abort, timeoutMs)
  if (signal?.aborted) abort()
  else signal?.addEventListener('abort', abort, { once: true })
  let reader
  try {
    const response = await fetch(
      `${apiBaseUrl}/api/plans/trace?plan_type=${encodeURIComponent(type)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      },
    )
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(body.error?.message || `过程记录请求失败（HTTP ${response.status}）。`)
    }
    if (!response.body) throw new Error('浏览器未能读取过程记录，请换用新版浏览器。')
    reader = response.body.getReader()
    const decoder = new TextDecoder()
    let pending = ''
    let result = null
    function accept(line) {
      if (!line.trim()) return
      const record = JSON.parse(line)
      if (record.type === 'event') onEvent(record.event)
      else if (record.type === 'result') result = record.response
      else if (record.type === 'error') throw new Error(record.error?.message || '行程生成失败。')
      else throw new Error('收到无法识别的过程记录。')
    }
    while (true) {
      const { value, done } = await reader.read()
      pending += decoder.decode(value, { stream: !done })
      const lines = pending.split('\n')
      pending = lines.pop()
      for (const line of lines) accept(line)
      if (done) break
    }
    accept(pending)
    if (!result) throw new Error('过程记录连接已结束，但尚未取得完整行程，请重新生成。')
    return result
  } catch (error) {
    if (error.name === 'AbortError')
      throw new Error(signal?.aborted ? '操作已取消。' : '请求超时，请稍后重试。', { cause: error })
    if (error instanceof TypeError)
      throw new Error('过程记录连接中断，请检查网络或稍后重试。', { cause: error })
    if (error instanceof SyntaxError)
      throw new Error('过程记录格式不完整，请重新生成。', { cause: error })
    throw error
  } finally {
    await reader?.cancel().catch(() => {})
    reader?.releaseLock()
    window.clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}
