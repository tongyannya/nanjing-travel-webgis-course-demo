<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { AUTHOR_LETTERS, PROJECT_INTRODUCTION } from '../content/projectIntroduction'
import { RELEASE_NOTES } from '../content/releaseNotes'
import '../styles/project-introduction.css'

const props = defineProps({ mode: { type: String, required: true } })
const emit = defineEmits(['close', 'open-tutorial'])
const root = ref(null)
const closeButton = ref(null)
const articleBody = ref(null)
const dismissed = ref(false)
const articleIndex = ref(0)
const showingUpdates = ref(false)
const updatesTrigger = ref(null)
const isAuthor = computed(() => props.mode === 'author')
const isReader = computed(() => isAuthor.value || showingUpdates.value)
const articles = computed(() => (showingUpdates.value ? RELEASE_NOTES : AUTHOR_LETTERS))
const title = computed(() =>
  showingUpdates.value ? '更新日志' : isAuthor.value ? '作者的话' : '金陵行前：玩转南京鸭',
)
const article = computed(() =>
  isReader.value ? articles.value[articleIndex.value] : PROJECT_INTRODUCTION,
)
let previousFocus
let underlyingApp
let wasInert

watch([articleIndex, showingUpdates], async () => {
  await nextTick()
  if (articleBody.value) articleBody.value.scrollTop = 0
})

function close() {
  if (showingUpdates.value) {
    showingUpdates.value = false
    articleIndex.value = 0
    nextTick(() => updatesTrigger.value?.focus())
    return
  }
  emit('close', !isAuthor.value && dismissed.value)
}

function openUpdates() {
  articleIndex.value = RELEASE_NOTES.length - 1
  showingUpdates.value = true
  nextTick(() => closeButton.value?.focus())
}

function handleKeydown(event) {
  event.stopImmediatePropagation()
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
  } else if (event.key === 'Tab') {
    const controls = [
      ...root.value.querySelectorAll('button, input, a[href], [tabindex="0"]'),
    ].filter((item) => !item.disabled && item.getClientRects().length)
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
      :data-mode="showingUpdates ? 'updates' : mode"
      @click.self="close"
    >
      <section
        class="project-introduction"
        :class="{ 'project-introduction--author': isReader }"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-introduction-title"
      >
        <header>
          <div>
            <small v-if="!isReader">南京旅行规划辅助</small>
            <h2 id="project-introduction-title">
              {{ title }}
            </h2>
          </div>
          <button
            ref="closeButton"
            type="button"
            :aria-label="showingUpdates ? '关闭更新日志，返回项目介绍' : '关闭介绍'"
            data-testid="intro-close"
            @click="close"
          >
            ×
          </button>
        </header>
        <div class="project-introduction__main">
          <nav
            v-if="isReader"
            class="project-introduction__letters"
            :aria-label="showingUpdates ? '更新日志文章' : '作者的话文章'"
          >
            <button
              v-for="(letter, index) in articles"
              :key="letter.id"
              :data-author-letter="isAuthor ? letter.id : undefined"
              :data-release-note="showingUpdates ? letter.id : undefined"
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
          <article
            ref="articleBody"
            class="project-introduction__body"
            data-testid="intro-body"
            tabindex="0"
          >
            <h3 v-if="isReader">{{ article.title }}</h3>
            <small v-if="showingUpdates" class="project-introduction__publication">{{
              article.publication
            }}</small>
            <p v-if="article.lead">{{ article.lead }}</p>
            <p
              v-for="(paragraph, index) in article.paragraphs"
              :key="`${article.id}-${index}`"
              class="project-introduction__paragraph"
            >
              {{ paragraph }}
            </p>
            <section v-for="section in article.sections" :key="section.title">
              <h3>{{ section.title }}</h3>
              <p v-for="(paragraph, index) in section.paragraphs || [section.text]" :key="index">
                {{ paragraph }}
                <a
                  v-if="
                    section.link && (!section.paragraphs || index === section.paragraphs.length - 1)
                  "
                  :href="section.link.href"
                  target="_blank"
                  rel="noopener noreferrer"
                  >{{ section.link.label }}</a
                >
              </p>
            </section>
            <p v-if="article.ending" class="project-introduction__ending">{{ article.ending }}</p>
            <p v-if="article.signature" class="project-introduction__signature">
              {{ article.signature }}
            </p>
          </article>
        </div>
        <footer>
          <div v-if="!isReader" class="project-introduction__preferences">
            <label
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
            <button
              ref="updatesTrigger"
              type="button"
              class="project-introduction__updates-link"
              data-testid="intro-updates"
              @click="openUpdates"
            >
              查看更新日志
            </button>
          </div>
          <div class="project-introduction__actions">
            <button
              v-if="!isReader"
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
              {{ showingUpdates ? '返回项目介绍' : isAuthor ? '继续逛南京' : '进入地图' }}
            </button>
          </div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
