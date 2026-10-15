import { TUTORIAL_STEPS } from './tutorialSteps'

export function createTutorialPreloader(prepareScene, warmImages = preloadSceneImages) {
  let complete = false
  return async function preload(signal, onStage = () => {}) {
    if (complete) return
    const failures = []
    for (const step of TUTORIAL_STEPS) {
      signal.throwIfAborted()
      const stage = { welcome: 0, hotels: 1, search: 2, questionnaire: 3 }[step.id]
      if (stage !== undefined) onStage(stage)
      const start = performance.now()
      try {
        await prepareScene(step.id, signal)
        await warmImages(signal)
      } catch {
        signal.throwIfAborted()
        // A failed service remains retryable on its own step, without blocking the others.
        failures.push(step.id)
      } finally {
        performance.measure(`tutorial-preload:${step.id}`, { start, end: performance.now() })
      }
    }
    signal.throwIfAborted()
    complete = true
    return { failedSteps: failures }
  }
}

const warmedImages = new Set()
async function preloadSceneImages(signal) {
  const images = [...document.querySelectorAll('img')].filter(
    (image) => image.getClientRects().length,
  )
  let timer, abort
  try {
    await Promise.race([
      Promise.all(
        images.map(async (image) => {
          const src = image.currentSrc || image.src
          if (!src || warmedImages.has(src)) return
          warmedImages.add(src)
          const preload = new Image()
          preload.src = src
          // Broken optional images keep the application's existing fallback behavior.
          await preload.decode().catch(() => {})
        }),
      ),
      new Promise((resolve, reject) => {
        timer = setTimeout(resolve, 10000)
        abort = () => reject(signal.reason)
        signal.addEventListener('abort', abort, { once: true })
        if (signal.aborted) abort()
      }),
    ])
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', abort)
  }
  signal.throwIfAborted()
}
