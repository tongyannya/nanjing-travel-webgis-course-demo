<script setup>
import HelpHint from './HelpHint.vue'
// 住宿问卷：视觉与交互完全复用规划问卷（planning-wizard）的样式类。
// Two branches: select an existing place or choose a recommended area.
// Selecting a place hides the wizard for the picking session managed by useAccommodationFlow.
// 选点确认后回到首末日题。每次打开问卷都要求重新确认首末日。
import { computed, nextTick, ref, watch } from 'vue'

import { TRIP_ENDPOINT_OPTIONS } from '../planning/accommodationOptions'
import AccommodationPickingToast from './AccommodationPickingToast.vue'

const props = defineProps({
  open: { type: Boolean, required: true },
  draft: { type: Object, default: null },
  step: { type: String, required: true },
  areas: { type: Array, required: true },
  pickingSession: { type: Object, default: null },
  confirmedName: { type: String, default: '' },
  searchHint: { type: String, default: '' },
})
const emit = defineEmits([
  'close',
  'pick-mode', // { mode } 某分支被选中
  'pick-area', // areaId
  'pick-endpoint', // { purpose, kind, poi? }
  'start-picking', // purpose 进入地图选点会话（隐藏问卷）
  'back-to-step', // 目标步骤：stay-choice | area-pick
  'commit',
  'cancel',
])

const dialog = ref(null)
const endpointPurpose = ref('first_start') // endpoints 步骤当前编辑的目的
const validationMessage = ref('')

const STEP_TITLES = {
  'stay-choice': '第 1 步：打算住在什么地方',
  'area-pick': '第 2 步：选一个大致位置',
  endpoints: '第 3 步：出发点和返回点',
  review: '看一遍答案',
}

const PURPOSE_LABELS = {
  first_start: '首日从哪里出发？',
  last_end: '最后一天回到哪里？',
}

watch(
  () => props.step,
  (step) => {
    if (step === 'endpoints') endpointPurpose.value = 'first_start'
    validationMessage.value = ''
    isReview.value = false
  },
)

watch(
  () => props.open,
  (open) => {
    if (!open) isReview.value = false
  },
)

watch(
  () => props.open,
  (open) => {
    if (open)
      nextTick(() =>
        dialog.value?.querySelector('button:not(.context-help__trigger), input')?.focus(),
      )
  },
  { immediate: true },
)

const isReview = ref(false)

// 汇总页摘要：住处名与首末日选择。
const reviewStayText = computed(() => {
  if (props.draft?.stayMode === 'recommend') {
    const area = props.areas.find((item) => item.id === props.draft?.areaId)
    return area ? `${area.name}一带` : ''
  }
  return props.draft?.poiLocation?.name || ''
})

const reviewRows = computed(() => [
  { label: '住处', value: reviewStayText.value },
  { label: '首日起点', value: endpointDisplay('first_start') },
  { label: '末日终点', value: endpointDisplay('last_end') },
])

function currentDraftEndpoint(purpose) {
  const field = purpose === 'first_start' ? 'firstDayStart' : 'lastDayEnd'
  return props.draft?.endpoints?.[field] || null
}

function endpointDisplay(purpose) {
  const endpoint = currentDraftEndpoint(purpose)
  if (!endpoint || endpoint.kind !== 'poi') return '住处，不需要额外设置'
  return endpoint.poi?.name || ''
}

function endpointActive(kind) {
  const endpoint = currentDraftEndpoint(endpointPurpose.value)
  if (kind === 'lodging') return !endpoint || endpoint.kind !== 'poi'
  if (kind === 'none') return endpoint?.kind === 'none'
  return endpoint?.kind === 'poi' && endpoint?.poi?.name === kind
}

function selectEndpointOption(option) {
  // option: { kind: 'lodging' } | { kind: 'poi', poi } | { kind: 'search' }
  if (option.kind === 'search') {
    emit('start-picking', endpointPurpose.value)
    return
  }
  validationMessage.value = ''
  emit('pick-endpoint', { purpose: endpointPurpose.value, kind: option.kind, poi: option.poi })
}

function switchEndpoint(purpose) {
  endpointPurpose.value = purpose
  validationMessage.value = ''
}

function goBack() {
  if (isReview.value) {
    isReview.value = false
    return
  }
  const step = props.step
  if (step === 'endpoints') {
    emit('back-to-step', props.draft?.stayMode === 'recommend' ? 'area-pick' : 'stay-choice')
    return
  }
  if (step === 'area-pick') emit('back-to-step', 'stay-choice')
}

function openReview() {
  isReview.value = true
}

function submit() {
  emit('commit')
}

function close() {
  emit('close')
}

function handleKeydown(event) {
  if (!props.open) return
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
  }
}

function endpointOptions() {
  return [
    { kind: 'lodging', label: '住处', detail: '不需要额外设置' },
    ...TRIP_ENDPOINT_OPTIONS.map((option) => ({
      kind: 'poi',
      poi: {
        name: option.name,
        location: { longitude: option.longitude, latitude: option.latitude },
        type: '交通服务;火车站',
        searchIcon: option.displayIcon,
      },
      label: option.name,
    })),
    { kind: 'search', label: '搜索其他地点', detail: '在地图或搜索结果中选择' },
  ]
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="planning-wizard-backdrop"
      data-testid="accommodation-wizard"
      @click.self="close"
    >
      <section
        ref="dialog"
        class="planning-wizard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="accommodation-wizard-title"
        @keydown="handleKeydown"
      >
        <header class="planning-wizard__header">
          <div>
            <span class="context-help-heading"
              >住宿安排
              <HelpHint
                label="住宿安排"
                test-id="accommodation-help"
                text="搜索酒店、景点等地点，或点击地图上已有图标选定住处；也可选择推荐片区。地图空白处不能设为住处。住处用于每天出发和返回，首日到达地点与末日离开地点可以另外设置。最后确认本次选择。"
              />
            </span>
            <small>{{ isReview ? STEP_TITLES.review : STEP_TITLES[step] || '' }}</small>
          </div>
          <button
            type="button"
            aria-label="关闭住宿安排"
            data-testid="accommodation-close"
            @click="close"
          >
            ×
          </button>
        </header>

        <div class="planning-wizard__body">
          <template v-if="step === 'stay-choice'">
            <h2 id="accommodation-wizard-title">打算住在什么地方？</h2>
            <p v-if="confirmedName" class="planning-wizard__hint">
              当前住宿：{{ confirmedName }}；修改后需要重新确认首日出发点和最后一天返回点。
            </p>
            <div class="planning-wizard__options">
              <button
                type="button"
                class="wizard-option"
                data-testid="stay-mode-search"
                @click="emit('pick-mode', { mode: 'search_poi' })"
              >
                <span>1</span>
                <b>搜索或选择已有地点<small>搜索酒店、景点等地点，或点击地图上的已有图标</small></b>
              </button>
              <button
                type="button"
                class="wizard-option"
                data-testid="stay-mode-recommend"
                @click="emit('pick-mode', { mode: 'recommend' })"
              >
                <span>2</span>
                <b>还不知道<small>从六个推荐片区里选一个大致位置</small></b>
              </button>
            </div>
            <p v-if="searchHint" class="planning-wizard__hint">{{ searchHint }}</p>
          </template>

          <template v-else-if="step === 'area-pick'">
            <h2 id="accommodation-wizard-title">选一个大致位置</h2>
            <p class="planning-wizard__hint">推荐片区用作规划起点，可随时修改。</p>
            <div class="accommodation-area-grid">
              <button
                v-for="area in areas"
                :key="area.id"
                type="button"
                class="wizard-option accommodation-area-card"
                :class="{ active: draft?.areaId === area.id }"
                :data-area-id="area.id"
                @click="emit('pick-area', area.id)"
              >
                <span>{{ areas.indexOf(area) + 1 }}</span>
                <b
                  >{{ area.name }}<small>邻近：{{ area.nearby }}｜适合：{{ area.suits }}</small></b
                >
              </button>
            </div>
          </template>

          <template v-else-if="step === 'endpoints' && isReview">
            <h2 id="accommodation-wizard-title">看一遍答案</h2>
            <p class="planning-wizard__hint">
              确认本次住宿选择；返回可继续修改，完成后写入顶栏并用于规划。
            </p>
            <div class="planning-wizard__summary" data-testid="accommodation-summary">
              <div v-for="row in reviewRows" :key="row.label">
                <span>{{ row.label }}</span>
                <b :class="{ empty: !row.value }">{{ row.value || '尚未选择' }}</b>
              </div>
            </div>
            <p class="planning-wizard__hint" data-testid="accommodation-effective-hint">
              修改住宿安排后，需重新制定方案才能生效。
            </p>
          </template>

          <template v-else-if="step === 'endpoints'">
            <h2 id="accommodation-wizard-title">{{ PURPOSE_LABELS[endpointPurpose] }}</h2>
            <div class="accommodation-endpoint-tabs" role="tablist" aria-label="切换首末日设置">
              <button
                type="button"
                :class="{ active: endpointPurpose === 'first_start' }"
                :aria-selected="endpointPurpose === 'first_start'"
                data-testid="endpoint-tab-first"
                role="tab"
                @click="switchEndpoint('first_start')"
              >
                首日起点
              </button>
              <button
                type="button"
                :class="{ active: endpointPurpose === 'last_end' }"
                :aria-selected="endpointPurpose === 'last_end'"
                data-testid="endpoint-tab-last"
                role="tab"
                @click="switchEndpoint('last_end')"
              >
                末日终点
              </button>
            </div>
            <p class="planning-wizard__hint">当前：{{ endpointDisplay(endpointPurpose) }}</p>
            <div class="planning-wizard__options">
              <button
                v-for="(option, index) in endpointOptions()"
                :key="option.kind === 'poi' ? option.poi.name : option.kind"
                type="button"
                class="wizard-option"
                :class="{
                  active: endpointActive(option.kind === 'poi' ? option.poi.name : option.kind),
                }"
                :data-testid="
                  option.kind === 'poi' ? `endpoint-${option.poi.name}` : `endpoint-${option.kind}`
                "
                @click="selectEndpointOption(option)"
              >
                <span>{{ index + 1 }}</span>
                <b
                  >{{ option.label }}<small v-if="option.detail">{{ option.detail }}</small></b
                >
              </button>
            </div>
          </template>
        </div>

        <footer class="planning-wizard__footer">
          <button
            type="button"
            class="wizard-ghost"
            data-testid="accommodation-back"
            :disabled="step === 'stay-choice'"
            @click="goBack"
          >
            上一题
          </button>
          <span></span>
          <button
            v-if="step === 'endpoints' && !isReview"
            type="button"
            class="wizard-primary"
            data-testid="accommodation-review"
            @click="openReview"
          >
            看一遍答案
          </button>
          <button
            v-if="step === 'endpoints' && isReview"
            type="button"
            class="wizard-primary"
            data-testid="accommodation-commit"
            @click="submit"
          >
            完成住宿安排
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
  <AccommodationPickingToast
    v-if="pickingSession"
    :purpose="pickingSession.purpose"
    :candidate-name="pickingSession.candidate?.name || ''"
    @confirm="emit('commit')"
    @cancel="emit('cancel')"
  />
</template>
