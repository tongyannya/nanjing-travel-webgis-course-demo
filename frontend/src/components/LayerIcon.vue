<script setup>
import { computed } from 'vue'

import { layerIconMarkup, layerIconName } from '../ui/layerIcons'

const props = defineProps({
  name: { type: String, required: true },
})

const resolvedName = computed(() => layerIconName(props.name))
const markup = computed(() => layerIconMarkup(resolvedName.value))
</script>

<template>
  <!-- Markup only comes from the closed local icon registry; no user HTML enters v-html. -->
  <svg
    class="layer-icon"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    :data-icon-name="resolvedName"
    v-html="markup"
  ></svg>
</template>
