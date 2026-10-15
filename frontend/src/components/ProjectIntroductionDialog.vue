<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { AUTHOR_LETTERS, PROJECT_INTRODUCTION } from '../content/projectIntroduction'
import '../styles/project-introduction.css'

const props = defineProps({ mode: { type: String, required: true } })
const emit = defineEmits(['close', 'open-tutorial'])
const root = ref(null)
const closeButton = ref(null)
const dismissed = ref(false)
const articleIndex = ref(0)
const isAuthor = computed(() => props.mode === 'author')
const article = computed(() =>
  isAuthor.value ? AUTHOR_LETTERS[articleIndex.value] : PROJECT_INTRODUCTION,
)
let previousFocus
let underlyingApp
let wasInert

function close() {
  emit('close', !isAuthor.value && dismissed.value)
}

function handleKeydown(event) {
  event.stopImmediatePropagation()
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
  } else if (event.key === 'Tab') {
    const controls = [...root.value.querySelectorAll('button, input, [tabindex="0"]')].filter(
      (item) => !item.disabled && item.getClientRects().length,
    )
    const index = controls.indexOf(document.activeElement)
    event.preventDefault()
    controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length]?.focus()
  }
}

onMounted(() => {
  previousFocus = document.activeElement
  underlyingApp = document.getElementById('app')
  wasInert = underlyingApp?.inert
  if (underlyingApp) underlyingApp.inert = true
  document.addEventListener('keydown', handleKeydown, true)
  closeButton.value?.focus()
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown, true)
  if (underlyingApp) underlyingApp.inert = wasInert
  previousFocus?.focus?.()
})
</script>

<template>
  <Teleport to="body">
    <div
      ref="root"
      class="project-introduction-backdrop"
      data-testid="project-introduction"
      :data-mode="mode"
      @click.self="close"
    >
      <section
        class="project-introduction"
        :class="{ 'project-introduction--author': isAuthor }"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-introduction-title"
      >
        <header>
          <div>
            <small v-if="!isAuthor">南京旅行规划辅助</small>
            <h2 id="project-introduction-title">
              {{ isAuthor ? '作者的话' : '金陵行前：玩转南京鸭' }}
            </h2>
          </div>
          <button
            ref="closeButton"
            type="button"
            aria-label="关闭介绍"
            data-testid="intro-close"
            @click="close"
          >
            ×
          </button>
        </header>
        <div class="project-introduction__main">
          <nav v-if="isAuthor" class="project-introduction__letters" aria-label="作者的话文章">
            <button
              v-for="(letter, index) in AUTHOR_LETTERS"
              :key="letter.id"
              type="button"
              :aria-current="index === articleIndex ? 'true' : undefined"
              :class="
                index % 2
                  ? 'project-introduction__red-action'
                  : 'project-introduction__green-action'
              "
              @click="articleIndex = index"
            >
              <b>{{ letter.title }}</b
              ><small>{{ letter.date }}</small>
            </button>
          </nav>
          <article class="project-introduction__body" data-testid="intro-body" tabindex="0">
            <h3 v-if="isAuthor">{{ article.title }}</h3>
            <p>{{ article.lead }}</p>
            <section v-for="section in article.sections" :key="section.title">
              <h3>{{ section.title }}</h3>
              <p>{{ section.text }}</p>
            </section>
            <p class="project-introduction__ending">{{ article.ending }}</p>
          </article>
        </div>
        <footer>
          <label
            v-if="!isAuthor"
            class="project-introduction__dismiss"
            :class="{ 'project-introduction__dismiss--checked': dismissed }"
          >
            <input
              v-model="dismissed"
              class="sr-only"
              type="checkbox"
              data-testid="intro-dismiss"
            />
            <span class="layer-switch__check" aria-hidden="true"></span>不再自动显示
          </label>
          <div class="project-introduction__actions">
            <button
              v-if="!isAuthor"
              class="project-introduction__green-action"
              type="button"
              data-testid="intro-tutorial"
              @click="emit('open-tutorial', dismissed)"
            >
              查看使用教程
            </button>
            <button
              type="button"
              class="project-introduction__enter project-introduction__red-action"
              data-testid="intro-enter"
              @click="close"
            >
              {{ isAuthor ? '继续逛南京' : '进入地图' }}
            </button>
          </div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
