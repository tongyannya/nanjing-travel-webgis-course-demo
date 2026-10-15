import { computed, ref, watch } from 'vue'

export const SPLASH_STORAGE_KEY = 'nanjing-webgis-v10-splash-seen'

function readSplashPreference() {
  if (typeof window === 'undefined') return false

  const query = new URLSearchParams(window.location.search)
  if (query.get('splash') === '1') return true
  if (query.get('splash') === '0') return false

  try {
    return window.sessionStorage.getItem(SPLASH_STORAGE_KEY) !== '1'
  } catch {
    return true
  }
}

export function useUiShell() {
  const activeDockPanel = ref('overview')
  const isDockOpen = ref(true)
  const isDuckMode = ref(false)
  const isExportOpen = ref(false)
  const isMapFull = ref(false)
  const isWizardOpen = ref(false)
  const railMode = ref('expanded')
  const isSplashVisible = ref(readSplashPreference())
  const isRailOpen = computed(() => railMode.value !== 'hidden')

  const shellClasses = computed(() => ({
    'app-shell--dock-closed': !isDockOpen.value,
    'app-shell--rail-closed': railMode.value === 'hidden',
    'app-shell--rail-collapsed': railMode.value === 'collapsed',
    'app-shell--map-full': isMapFull.value,
  }))

  watch(
    isDuckMode,
    (enabled) => {
      if (typeof document !== 'undefined') document.body.classList.toggle('duck-mode', enabled)
    },
    { immediate: true },
  )

  function finishSplash() {
    isSplashVisible.value = false
    try {
      window.sessionStorage.setItem(SPLASH_STORAGE_KEY, '1')
    } catch {
      // 会话存储不可用时仍允许用户正常进入应用。
    }
  }

  function selectDockPanel(panel) {
    activeDockPanel.value = panel
    isDockOpen.value = true
  }

  function toggleDock() {
    if (isMapFull.value) {
      isMapFull.value = false
      isDockOpen.value = true
      return
    }
    isDockOpen.value = !isDockOpen.value
  }

  function toggleDuckMode() {
    isDuckMode.value = !isDuckMode.value
  }

  function setDuckMode(enabled) {
    isDuckMode.value = Boolean(enabled)
  }

  function openWizard() {
    isWizardOpen.value = true
  }

  function closeWizard() {
    isWizardOpen.value = false
  }

  function collapseRail() {
    if (isMapFull.value) isMapFull.value = false
    railMode.value = railMode.value === 'collapsed' ? 'expanded' : 'collapsed'
  }

  function toggleRail() {
    if (isMapFull.value) {
      isMapFull.value = false
      railMode.value = 'expanded'
      return
    }
    railMode.value = railMode.value === 'hidden' ? 'expanded' : 'hidden'
  }

  function toggleMapFull() {
    isMapFull.value = !isMapFull.value
  }

  return {
    activeDockPanel,
    closeWizard,
    collapseRail,
    finishSplash,
    isDockOpen,
    isDuckMode,
    isExportOpen,
    isMapFull,
    isRailOpen,
    isSplashVisible,
    isWizardOpen,
    openWizard,
    railMode,
    selectDockPanel,
    setDuckMode,
    shellClasses,
    toggleDock,
    toggleDuckMode,
    toggleMapFull,
    toggleRail,
  }
}
