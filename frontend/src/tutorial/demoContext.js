import { PROJECT_INTRODUCTION } from '../content/projectIntroduction'

export function isTutorialDemoWindow(target = window) {
  return (
    target.parent !== target &&
    new URLSearchParams(target.location.search).get('tutorial-demo') === '1'
  )
}

export function createMemoryStorage() {
  const values = new Map()
  return {
    get length() {
      return values.size
    },
    key(index) {
      return [...values.keys()][index] ?? null
    },
    getItem(key) {
      return values.get(String(key)) ?? null
    },
    setItem(key, value) {
      values.set(String(key), String(value))
    },
    removeItem(key) {
      values.delete(String(key))
    },
    clear() {
      values.clear()
    },
  }
}

export function installTutorialDemoStorage(target = window) {
  if (!isTutorialDemoWindow(target)) return false
  const local = createMemoryStorage()
  local.setItem('nanjing-webgis-project-introduction-dismissed', PROJECT_INTRODUCTION.id)
  local.setItem('nanjing-webgis-first-use-hints-v1', JSON.stringify(['duck', 'search', 'areas']))
  Object.defineProperty(target, 'localStorage', { configurable: true, value: local })
  Object.defineProperty(target, 'sessionStorage', {
    configurable: true,
    value: createMemoryStorage(),
  })
  return true
}
