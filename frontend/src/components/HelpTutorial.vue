<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { TUTORIAL_STEPS } from '../tutorial/tutorialSteps'
import {
  placeTutorialCard,
  tutorialLeader,
  visibleTutorialRects,
  combineTutorialRects,
} from '../tutorial/sceneGeometry'
import '../styles/tutorial.css'
import TutorialLoading from './TutorialLoading.vue'

const props = defineProps({
  demo: { type: Boolean, default: false },
  open: { type: Boolean, default: true },
  prepareScene: { type: Function, default: async () => {} },
  preload: { type: Function, default: async () => {} },
  getAreaRects: { type: Function, default: () => [] },
})
const emit = defineEmits(['close'])
const stepIndex = ref(0)
const displayedIndex = ref(0)
const current = computed(() => TUTORIAL_STEPS[displayedIndex.value])
const preloaded = ref(false)
const preloadMs = ref(null)
const preloadFailures = ref([])
const loadingStage = ref(0)
const loadingAnimation = ref(null)
const frameElement = ref(null)
const controls = ref(null)
const nextButton = ref(null)
const stepToggle = ref(null)
const stepMenu = ref(null)
const menuOpen = ref(false)
const menuPosition = ref({})
const highlights = ref([])
const viewport = ref({ width: window.innerWidth, height: window.innerHeight })
const card = ref({ x: 12, y: 100, width: 380, height: 208 })
const status = ref('loading')
const busy = computed(() => ['loading', 'switching'].includes(status.value))
const error = ref('')
const frameReady = ref(false)
const frameLoaded = ref(false)
const frameMounted = ref(true)
const active = ref(props.open)
const leaders = computed(() =>
  highlights.value.map((target) => tutorialLeader(card.value, target)).filter(Boolean),
)
const maskPath = computed(
  () =>
    `M0 0H${viewport.value.width}V${viewport.value.height}H0Z` +
    highlights.value.map((r) => `M${r.x} ${r.y}h${r.width}v${r.height}h-${r.width}Z`).join(''),
)
const maskClip = computed(() => `path(evenodd, "${maskPath.value}")`)
const frameUrl = computed(() => {
  const url = new URL(window.location.href)
  url.search = '?tutorial-demo=1&splash=0'
  url.hash = ''
  return url.href
})
let previousFocus, underlyingApp, wasInert, observer, timer, startupTimer, controller
let scrollPositions = []
let disposed = false
let overlayActive = false
let announcedLoaded = false

function close() {
  if (props.demo)
    window.parent.postMessage({ type: 'webgis-tutorial-close' }, window.location.origin)
  else emit('close')
}
function measure() {
  if (!active.value) return
  viewport.value = { width: window.innerWidth, height: window.innerHeight }
  if (status.value === 'switching') return
  let targets =
    status.value === 'ready'
      ? visibleTutorialRects(current.value.targets, document, viewport.value)
      : []
  if (status.value === 'ready' && current.value.id === 'accommodation-map') {
    const area = combineTutorialRects(
      [
        ...props.getAreaRects(),
        ...visibleTutorialRects(['.accommodation-map-card'], document, viewport.value),
      ],
      viewport.value,
    )
    targets = [
      area,
      ...visibleTutorialRects(
        ['[data-testid=accommodation-area-picking]'],
        document,
        viewport.value,
      ),
    ].filter(Boolean)
  }
  if (status.value === 'ready' && current.value.id === 'guide') {
    targets = [combineTutorialRects(targets, viewport.value)].filter(Boolean)
  }
  if (JSON.stringify(targets) !== JSON.stringify(highlights.value)) highlights.value = targets
  const height = controls.value?.getBoundingClientRect().height || 208
  card.value = placeTutorialCard(
    targets,
    { width: Math.min(380, window.innerWidth - 24), height },
    viewport.value,
    current.value.placement,
  )
  if (menuOpen.value && stepToggle.value) {
    const anchor = stepToggle.value.getBoundingClientRect()
    const height = Math.min(280, viewport.value.height - 24)
    const width = Math.min(380, viewport.value.width - 24)
    menuPosition.value = {
      left: `${Math.max(12, Math.min(anchor.left, viewport.value.width - width - 12))}px`,
      top: `${Math.max(12, anchor.bottom + height + 6 <= viewport.value.height - 12 ? anchor.bottom + 6 : anchor.top - height - 6)}px`,
      width: `${width}px`,
      maxHeight: `${height}px`,
    }
  }
}
async function prepare() {
  controller?.abort()
  controller = new AbortController()
  const task = controller
  const requestedIndex = stepIndex.value
  status.value = preloaded.value ? 'switching' : 'loading'
  menuOpen.value = false
  error.value = ''
  if (!preloaded.value) highlights.value = []
  measure()
  try {
    if (!preloaded.value) {
      const start = performance.now()
      const result = await props.preload(task.signal, (stage) => (loadingStage.value = stage))
      await nextTick()
      await loadingAnimation.value?.finish()
      if (disposed || task.signal.aborted) return
      preloadMs.value = Math.round(performance.now() - start)
      preloadFailures.value = result?.failedSteps || []
      preloaded.value = true
    }
    await props.prepareScene(TUTORIAL_STEPS[requestedIndex].id, task.signal)
    if (disposed || task.signal.aborted) return
    displayedIndex.value = requestedIndex
    status.value = 'ready'
    await nextTick()
    measure()
    if (!highlights.value.length) throw new Error('这一页的演示区域未显示，请重试。')
    if (props.demo && !announcedLoaded) {
      announcedLoaded = true
      window.parent.postMessage({ type: 'webgis-tutorial-loaded' }, window.location.origin)
    }
    nextButton.value?.focus()
  } catch (failure) {
    if (disposed || task.signal.aborted) return
    displayedIndex.value = requestedIndex
    status.value = 'error'
    error.value = failure instanceof Error ? failure.message : '演示暂未准备好，请重试。'
    await nextTick()
    measure()
  }
}
function advance() {
  if (busy.value) return
  if (stepIndex.value === TUTORIAL_STEPS.length - 1) close()
  else stepIndex.value += 1
}
function previous() {
  if (!busy.value && stepIndex.value > 0) stepIndex.value -= 1
}
async function toggleStepMenu() {
  if (busy.value) return
  menuOpen.value = !menuOpen.value
  if (menuOpen.value) {
    await nextTick()
    measure()
    const selected = stepMenu.value?.querySelector('[aria-checked=true]')
    selected?.focus({ preventScroll: true })
    selected?.scrollIntoView?.({ block: 'nearest' })
  } else stepToggle.value?.focus()
}
function selectStep(index) {
  if (busy.value) return
  menuOpen.value = false
  if (index === stepIndex.value) stepToggle.value?.focus()
  else stepIndex.value = index
}
function dismissStepMenu(event) {
  if (
    menuOpen.value &&
    !stepMenu.value?.contains(event.target) &&
    !stepToggle.value?.contains(event.target)
  )
    menuOpen.value = false
}
function retryFrame() {
  error.value = ''
  frameReady.value = false
  frameElement.value.src = frameUrl.value
  startDeadline()
}
function startDeadline() {
  clearTimeout(startupTimer)
  startupTimer = setTimeout(() => {
    if (!frameReady.value) error.value = '演示页面尚未打开，可以重试或退出教程。'
  }, 30000)
}
function receive(event) {
  if (props.demo) {
    if (event.source !== window.parent || event.origin !== window.location.origin) return
    if (event.data?.type === 'webgis-tutorial-pause') {
      active.value = false
      controller?.abort()
      deactivateOverlay()
    } else if (event.data?.type === 'webgis-tutorial-resume') {
      active.value = true
      activateOverlay()
      if (stepIndex.value === 0) void prepare()
      else stepIndex.value = 0
    }
    return
  }
  if (event.source !== frameElement.value?.contentWindow || event.origin !== window.location.origin)
    return
  if (event.data?.type === 'webgis-tutorial-ready') {
    frameReady.value = true
    clearTimeout(startupTimer)
    if (active.value) frameElement.value?.focus()
  } else if (event.data?.type === 'webgis-tutorial-loaded') {
    frameLoaded.value = true
  } else if (event.data?.type === 'webgis-tutorial-close') close()
}
function handleKeydown(event) {
  if (!active.value) return
  event.stopImmediatePropagation()
  if (event.key === 'Escape') {
    event.preventDefault()
    if (menuOpen.value) {
      menuOpen.value = false
      stepToggle.value?.focus()
      return
    }
    close()
    return
  }
  if (!props.demo && frameReady.value) return
  if (
    menuOpen.value &&
    ['ArrowDown', 'ArrowUp', 'Home', 'End', 'ArrowLeft', 'ArrowRight'].includes(event.key)
  ) {
    event.preventDefault()
    const buttons = [...stepMenu.value.querySelectorAll('button')]
    const index = buttons.indexOf(document.activeElement)
    let next = index
    if (event.key === 'ArrowDown') next = (index + 1) % buttons.length
    else if (event.key === 'ArrowUp') next = (index - 1 + buttons.length) % buttons.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = buttons.length - 1
    buttons[next]?.focus({ preventScroll: true })
    buttons[next]?.scrollIntoView?.({ block: 'nearest' })
    return
  }
  if (props.demo && ['ArrowRight', 'ArrowLeft'].includes(event.key)) {
    event.preventDefault()
    if (event.key === 'ArrowRight') advance()
    else previous()
  }
  if (event.key === 'Tab') {
    const buttons = [...(controls.value?.querySelectorAll('button:not([disabled])') || [])]
    const index = buttons.indexOf(document.activeElement)
    event.preventDefault()
    buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus()
  }
}
watch(stepIndex, prepare)
watch(controls, (element) => {
  observer?.disconnect()
  if (element && active.value) observer?.observe(element)
})
function activateOverlay() {
  if (overlayActive) return
  overlayActive = true
  previousFocus = document.activeElement
  scrollPositions = [...document.querySelectorAll('.info-dock__body,.layer-sidebar__body')].map(
    (element) => [element, element.scrollTop],
  )
  underlyingApp = document.getElementById('app')
  wasInert = underlyingApp?.inert
  if (underlyingApp) underlyingApp.inert = true
  document.addEventListener('keydown', handleKeydown, true)
  if (props.demo) {
    window.addEventListener('resize', measure)
    if (typeof ResizeObserver === 'function') {
      observer = new ResizeObserver(measure)
      if (controls.value) observer.observe(controls.value)
    }
    timer = setInterval(measure, 150)
  }
}
function deactivateOverlay() {
  if (!overlayActive) return
  overlayActive = false
  observer?.disconnect()
  clearTimeout(startupTimer)
  clearInterval(timer)
  document.removeEventListener('keydown', handleKeydown, true)
  window.removeEventListener('resize', measure)
  if (underlyingApp) underlyingApp.inert = wasInert
  for (const [element, position] of scrollPositions) element.scrollTop = position
  previousFocus?.focus?.({ preventScroll: true })
}
watch(
  () => props.open,
  async (open) => {
    if (props.demo) return
    active.value = open
    if (open) {
      frameMounted.value = true
      activateOverlay()
      await nextTick()
      if (frameLoaded.value)
        frameElement.value?.contentWindow.postMessage(
          { type: 'webgis-tutorial-resume' },
          window.location.origin,
        )
      else startDeadline()
      frameElement.value?.focus()
    } else {
      if (frameLoaded.value)
        frameElement.value?.contentWindow.postMessage(
          { type: 'webgis-tutorial-pause' },
          window.location.origin,
        )
      else {
        // Leaving before preparation completes cancels the unfinished demonstration.
        frameMounted.value = false
        frameReady.value = false
        error.value = ''
      }
      deactivateOverlay()
    }
  },
)
onMounted(() => {
  window.addEventListener('message', receive)
  if (active.value) activateOverlay()
  if (props.demo) {
    window.parent.postMessage({ type: 'webgis-tutorial-ready' }, window.location.origin)
    void prepare()
  } else startDeadline()
})
onBeforeUnmount(() => {
  disposed = true
  controller?.abort()
  deactivateOverlay()
  window.removeEventListener('message', receive)
})
</script>

<template>
  <Teleport to="body">
    <section
      v-show="active"
      class="help-tutorial"
      role="dialog"
      aria-modal="true"
      :aria-hidden="!active"
      :inert="!active"
      aria-label="独立使用教程"
      data-testid="help-tutorial"
      :data-step-id="demo ? current.id : undefined"
      :data-card-placement="demo ? current.placement : undefined"
      :data-status="demo ? status : error ? 'error' : frameReady ? 'ready' : 'loading'"
      :data-preload-ms="demo ? preloadMs : undefined"
      :data-preload-failures="demo ? preloadFailures.join(',') : undefined"
      :data-cached="!demo ? frameLoaded : undefined"
      @click="dismissStepMenu"
    >
      <template v-if="!demo">
        <iframe
          v-if="frameMounted"
          ref="frameElement"
          class="tutorial-frame"
          :src="frameUrl"
          title="独立实机教程演示"
          data-testid="tutorial-frame"
        ></iframe>
        <div
          v-if="!frameReady && !error"
          class="planning-wizard-backdrop tutorial-loading"
          data-testid="tutorial-loading"
        >
          <TutorialLoading />
        </div>
        <div v-if="!frameReady && error" class="planning-wizard-backdrop tutorial-veil"></div>
        <aside
          v-if="!frameReady && error"
          ref="controls"
          class="map-info-window tutorial-controls tutorial-controls--error"
          data-testid="tutorial-controls"
        >
          <strong>使用教程</strong>
          <p role="alert">{{ error }}</p>
          <nav>
            <button
              v-if="error"
              type="button"
              class="action-button--green"
              data-testid="tutorial-retry"
              @click="retryFrame"
            >
              重试</button
            ><button type="button" class="text-button" data-testid="tutorial-exit" @click="close">
              退出教程
            </button>
          </nav>
        </aside>
      </template>
      <template v-else>
        <div
          v-if="status === 'loading'"
          class="planning-wizard-backdrop tutorial-loading"
          data-testid="tutorial-loading"
        >
          <TutorialLoading ref="loadingAnimation" :stage="loadingStage" />
        </div>
        <div
          v-if="status !== 'loading'"
          class="planning-wizard-backdrop tutorial-veil"
          :style="{ clipPath: maskClip }"
          data-testid="tutorial-veil"
        ></div>
        <svg
          class="tutorial-lines"
          :viewBox="`0 0 ${viewport.width} ${viewport.height}`"
          aria-hidden="true"
        >
          <rect
            v-for="(r, index) in highlights"
            :key="`rect-${index}`"
            v-bind="r"
            rx="8"
            fill="none"
            stroke="var(--layer-accent)"
            stroke-width="2"
            data-tutorial-highlight
          />
          <line
            v-for="(line, index) in leaders"
            :key="`line-${index}`"
            v-bind="line"
            stroke="var(--teal)"
            stroke-width="2"
            data-tutorial-leader
          />
        </svg>
        <aside
          v-if="status !== 'loading'"
          ref="controls"
          class="map-info-window tutorial-controls"
          :aria-busy="busy"
          :style="{ left: `${card.x}px`, top: `${card.y}px`, width: `${card.width}px` }"
          data-testid="tutorial-controls"
        >
          <div class="tutorial-progress">
            <small>使用教程 · 第 {{ displayedIndex + 1 }} / {{ TUTORIAL_STEPS.length }} 步</small>
            <button
              ref="stepToggle"
              type="button"
              class="text-button tutorial-step-toggle"
              aria-label="选择教程步骤"
              aria-haspopup="menu"
              :aria-expanded="menuOpen"
              :disabled="busy"
              aria-controls="tutorial-step-menu"
              data-testid="tutorial-step-toggle"
              @click="toggleStepMenu"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
            </button>
            <div
              v-if="menuOpen"
              id="tutorial-step-menu"
              ref="stepMenu"
              class="tutorial-step-menu"
              :style="menuPosition"
              role="menu"
              aria-label="教程步骤"
              data-testid="tutorial-step-menu"
            >
              <button
                v-for="(step, index) in TUTORIAL_STEPS"
                :key="step.id"
                type="button"
                role="menuitemradio"
                :aria-checked="displayedIndex === index"
                :data-tutorial-step="step.id"
                @click="selectStep(index)"
              >
                <span>{{ index + 1 }}.</span> {{ step.title }}
              </button>
            </div>
          </div>
          <div aria-live="polite" aria-atomic="true">
            <strong>{{ current.title }}</strong>
            <p v-if="error" role="alert">{{ error }}</p>
            <p v-else>{{ current.text }}</p>
          </div>
          <nav aria-label="教程操作">
            <button type="button" class="text-button" data-testid="tutorial-exit" @click="close">
              退出教程
            </button>
            <button
              v-if="error"
              type="button"
              class="action-button--green"
              data-testid="tutorial-retry"
              @click="prepare"
            >
              重试
            </button>
            <button
              type="button"
              class="action-button--green"
              :disabled="stepIndex === 0 || busy"
              data-testid="tutorial-previous"
              @click="previous"
            >
              上一步
            </button>
            <button
              ref="nextButton"
              type="button"
              class="action-button--red"
              :disabled="busy"
              data-testid="tutorial-next"
              @click="advance"
            >
              {{
                stepIndex === TUTORIAL_STEPS.length - 1
                  ? '完成，回到地图'
                  : error
                    ? '跳过这一步'
                    : '下一步'
              }}
            </button>
          </nav>
        </aside>
      </template>
    </section>
  </Teleport>
</template>
