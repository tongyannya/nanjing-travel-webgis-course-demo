<script setup>
import duckArtUrl from '../assets/duck-culture-button.svg?url'

defineProps({ active: { type: Boolean, default: false } })
</script>

<template>
  <svg
    viewBox="90 206 460 452"
    fill="none"
    aria-hidden="true"
    class="duck-culture-toggle-art"
    :data-duck-expression="active ? 'awake' : 'asleep'"
  >
    <g :data-testid="active ? 'duck-raised-wing' : undefined">
      <use :href="`${duckArtUrl}#${active ? 'duck-awake-body' : 'duck-body'}`" />
    </g>
    <g v-if="active">
      <ellipse
        cx="226.5"
        cy="401.8"
        rx="10.5"
        ry="22.4"
        transform="rotate(10 226.5 401.8)"
        fill="#31545e"
      />
      <ellipse
        cx="384.8"
        cy="401.8"
        rx="16.7"
        ry="25.5"
        transform="rotate(9 384.8 401.8)"
        fill="#31545e"
      />
      <ellipse
        cx="226.6"
        cy="392.7"
        rx="1.3"
        ry="1.9"
        transform="rotate(15 226.6 392.7)"
        fill="#fbfbf5"
      />
      <ellipse
        cx="384.7"
        cy="391.5"
        rx="1.9"
        ry="2.5"
        transform="rotate(20 384.7 391.5)"
        fill="#fbfbf5"
      />
    </g>
    <g v-else fill="#31545e">
      <path d="M215 392C220 396 228 398 236 394L237 401C231 407 221 405 215 401L212 397Z" />
      <path d="M369 394C378 400 390 400 401 396L402 403C394 411 377 409 369 402L366 399Z" />
    </g>
  </svg>
</template>
