import { ref, watch } from 'vue'
import { AUTHOR_LANDMARK_SEQUENCE, PROJECT_INTRODUCTION } from '../content/projectIntroduction'

export const INTRO_DISMISSED_KEY = 'nanjing-webgis-project-introduction-dismissed'
export const INTRO_SESSION_KEY = 'nanjing-webgis-project-introduction-session'
export const AUTHOR_UNLOCKED_KEY = 'nanjing-webgis-author-unlocked'

function readStored(storage, key) {
  try {
    return window[storage].getItem(key)
  } catch {
    return null
  }
}

function writeStored(storage, key, value) {
  try {
    window[storage].setItem(key, value)
  } catch {
    // Closing the dialog remains available when browser storage is unavailable.
  }
}

export function useProjectIntroduction(isSplashVisible) {
  const dialogMode = ref(null)
  const hasDiscoveredAuthor = ref(readStored('localStorage', AUTHOR_UNLOCKED_KEY) === '1')
  let landmarkIndex = 0
  let openingHandled = false

  watch(
    isSplashVisible,
    (visible) => {
      if (visible || openingHandled) return
      openingHandled = true
      const id = PROJECT_INTRODUCTION.id
      if (
        readStored('localStorage', INTRO_DISMISSED_KEY) !== id &&
        readStored('sessionStorage', INTRO_SESSION_KEY) !== id
      ) {
        dialogMode.value = 'intro'
      }
    },
    { immediate: true },
  )

  function closeIntroduction(dismiss = false) {
    if (dialogMode.value === 'intro') {
      writeStored('sessionStorage', INTRO_SESSION_KEY, PROJECT_INTRODUCTION.id)
      if (dismiss) writeStored('localStorage', INTRO_DISMISSED_KEY, PROJECT_INTRODUCTION.id)
    }
    dialogMode.value = null
  }

  function recordLandmarkClick(id) {
    if (dialogMode.value) return
    if (id === AUTHOR_LANDMARK_SEQUENCE[landmarkIndex]) landmarkIndex += 1
    else landmarkIndex = id === AUTHOR_LANDMARK_SEQUENCE[0] ? 1 : 0
    if (landmarkIndex === AUTHOR_LANDMARK_SEQUENCE.length) {
      landmarkIndex = 0
      hasDiscoveredAuthor.value = true
      writeStored('localStorage', AUTHOR_UNLOCKED_KEY, '1')
      dialogMode.value = 'author'
    }
  }

  function openIntroduction() {
    dialogMode.value = 'intro'
  }

  function openAuthorLetters() {
    if (hasDiscoveredAuthor.value) dialogMode.value = 'author'
  }

  return {
    dialogMode,
    hasDiscoveredAuthor,
    openIntroduction,
    openAuthorLetters,
    closeIntroduction,
    recordLandmarkClick,
  }
}
