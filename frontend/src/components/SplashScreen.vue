<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import splashImage from '../assets/nanjing-duck-map-v1.png'

const props = defineProps({ visible: { type: Boolean, required: true } })
const emit = defineEmits(['finish'])

const imageFailed = ref(false)
let timerId

function finish() {
  window.clearTimeout(timerId)
  emit('finish')
}

function handleKeydown(event) {
  if (event.key === 'Escape' && props.visible) finish()
}

function scheduleFinish() {
  window.clearTimeout(timerId)
  if (!props.visible) return

  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  timerId = window.setTimeout(finish, reducedMotion ? 180 : 3920)
}

watch(() => props.visible, scheduleFinish)

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  scheduleFinish()
})

onBeforeUnmount(() => {
  window.clearTimeout(timerId)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Transition name="splash-fade">
    <div
      v-if="visible"
      class="splash-screen"
      role="dialog"
      aria-modal="true"
      aria-label="玩转南京鸭开屏动画"
      data-testid="splash-screen"
    >
      <div class="splash-screen__ambient" aria-hidden="true"></div>
      <div class="splash-screen__map" aria-hidden="true">
        <svg viewBox="0 0 800 560" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="splash-paper" x1="0" y1="0" x2="1" y2="1">
              <stop stop-color="#fffdf4" />
              <stop offset="1" stop-color="#e8e5d3" />
            </linearGradient>
          </defs>
          <path
            d="M48 34 Q31 40 36 63 L59 505 Q62 530 89 526 L744 501 Q771 499 765 469 L742 55 Q739 27 710 31Z"
            fill="url(#splash-paper)"
            stroke="rgba(255,255,255,.92)"
            stroke-width="8"
          />
          <path
            d="M72 402 C190 330 216 432 337 356 C457 280 515 394 742 253 L757 314 C555 439 459 342 352 424 C231 516 172 403 77 478Z"
            fill="#afd1d0"
            opacity=".72"
          />
          <ellipse cx="574" cy="151" rx="113" ry="72" fill="#c2d8d5" opacity=".78" />
          <path
            d="M476 304 C565 218 711 239 752 351 L763 474 L513 488 C470 435 447 354 476 304Z"
            fill="#cad8b0"
            opacity=".78"
          />
          <g fill="none" stroke="#fff" stroke-linecap="round" opacity=".9">
            <path
              class="splash-screen__road"
              d="M91 120 C217 173 287 133 423 185 S618 198 730 136"
              stroke-width="12"
            />
            <path
              class="splash-screen__road"
              d="M121 260 C259 221 304 277 429 248 S624 263 723 231"
              stroke-width="10"
            />
            <path
              class="splash-screen__road"
              d="M187 69 C198 181 245 238 232 471"
              stroke-width="9"
            />
            <path
              class="splash-screen__road"
              d="M394 53 C369 174 431 243 406 493"
              stroke-width="10"
            />
            <path
              class="splash-screen__road"
              d="M653 80 C593 174 606 319 686 458"
              stroke-width="9"
            />
          </g>
          <path
            class="splash-screen__road"
            d="M79 365 C176 293 242 348 330 276 S491 194 568 250 S658 335 735 299"
            fill="none"
            stroke="#47897f"
            stroke-width="8"
            stroke-linecap="round"
          />
          <path
            class="splash-screen__road"
            d="M139 441 C244 386 265 319 357 333 S489 384 565 318 S655 189 717 177"
            fill="none"
            stroke="#c94b35"
            stroke-width="7"
            stroke-linecap="round"
          />
          <g class="splash-screen__pin splash-screen__pin--one" transform="translate(290 320)">
            <circle r="18" fill="#fff" />
            <circle r="11" fill="#c94b35" />
          </g>
          <g class="splash-screen__pin splash-screen__pin--two" transform="translate(501 351)">
            <circle r="18" fill="#fff" />
            <circle r="11" fill="#c94b35" />
          </g>
          <g class="splash-screen__pin splash-screen__pin--three" transform="translate(654 210)">
            <circle r="18" fill="#fff" />
            <circle r="11" fill="#e6b640" />
          </g>
        </svg>
      </div>
      <div class="splash-screen__duck" :class="{ 'is-missing': imageFailed }" aria-hidden="true">
        <img :src="splashImage" alt="" @error="imageFailed = true" />
      </div>
      <section class="splash-screen__copy">
        <small>从一张地图开始</small>
        <h1>玩转南京<em>鸭</em></h1>
        <p>看清空间，再安排每一天</p>
      </section>
      <button type="button" class="splash-screen__skip" data-testid="splash-skip" @click="finish">
        跳过动画
      </button>
      <div class="splash-screen__glass-exit" aria-hidden="true"></div>
    </div>
  </Transition>
</template>
