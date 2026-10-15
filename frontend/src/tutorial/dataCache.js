// Each embedded demonstration has its own module instance and memory cache.
export function createTutorialDataCache() {
  const results = new Map()
  return async function request(path, options, load) {
    const cacheable =
      (options.method || 'GET').toUpperCase() === 'GET' &&
      /^\/api\/(hotels\/search|poi\/search|duck-culture(?:\/[^/?]+)?)(?:\?|$)/.test(path)
    if (!cacheable) return load()
    if (options.signal?.aborted) throw new Error('操作已取消。')
    if (results.has(path)) return structuredClone(results.get(path))
    const result = await load()
    if (options.signal?.aborted) throw new Error('操作已取消。')
    results.set(path, structuredClone(result))
    return result
  }
}
