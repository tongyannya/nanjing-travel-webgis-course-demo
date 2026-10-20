<script setup>
import UiSelect from './UiSelect.vue'
import { computed, inject, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import {
  MAX_ATTRACTION_CHOICES,
  attractionChoiceWarnings,
  countAttractionChoices,
} from '../planning/tripForm'
import { PLANNING_NOTICE_KEY } from '../composables/usePlanningNotices'

import {
  ATTRACTION_CATEGORY_LABELS,
  ATTRACTION_CATEGORY_OPTIONS,
  ATTRACTION_QUALITY_OPTIONS,
  ATTRACTION_TAG_OPTIONS,
  createDefaultAttractionFilter,
  filterAttractions,
  isAttractionFilterActive,
} from '../attractions/attractionFilters'

const choices = defineModel({ required: true })
const props = defineProps({
  attractions: { type: Array, required: true },
  dayCount: { type: Number, default: 1 },
})
const emit = defineEmits(['open-full-form'])
const showNotice = inject(PLANNING_NOTICE_KEY, () => Promise.resolve(false))

const searchFilter = ref(createDefaultAttractionFilter())
const selections = ref(null)
const nameElements = new Map()
const expandedGroups = ref({})
const expandableGroups = ref({})
const selectionId = useId()
let selectionObserver

function measureNames() {
  for (const [state, element] of nameElements) {
    if (!element?.getClientRects().length) continue
    const style = getComputedStyle(element)
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.55
    const expandable = element.scrollHeight > lineHeight * 2 + 1
    if (expandableGroups.value[state] !== expandable)
      expandableGroups.value = { ...expandableGroups.value, [state]: expandable }
    if (!expandable && expandedGroups.value[state])
      expandedGroups.value = { ...expandedGroups.value, [state]: false }
  }
}

watch(() => choices.value, measureNames, { deep: true, flush: 'post' })
onMounted(() => {
  if (typeof ResizeObserver === 'function') {
    selectionObserver = new ResizeObserver(measureNames)
    selectionObserver.observe(selections.value)
  }
  window.addEventListener('resize', measureNames)
  measureNames()
})
onBeforeUnmount(() => {
  selectionObserver?.disconnect()
  window.removeEventListener('resize', measureNames)
})

const selectionGroups = computed(() =>
  [
    { state: 'must', label: '已选必须去' },
    { state: 'interested', label: '已选感兴趣' },
    { state: 'excluded', label: '已选排除' },
  ].map((group) => ({
    ...group,
    attractions: props.attractions.filter((item) => choices.value?.[item.id] === group.state),
  })),
)
const choiceLabels = { none: '未选择', must: '必须去', interested: '感兴趣', excluded: '排除' }
const matchingAttractions = computed(() => filterAttractions(props.attractions, searchFilter.value))

const groupedAttractions = computed(() => {
  const groups = []
  matchingAttractions.value.forEach((attraction) => {
    const category = attraction.category || 'unknown'
    let group = groups.find((item) => item.category === category)
    if (!group) {
      group = {
        category,
        label: ATTRACTION_CATEGORY_LABELS[category] || '其他景点',
        attractions: [],
      }
      groups.push(group)
    }
    group.attractions.push(attraction)
  })
  return groups
})

const hasSearchFilter = computed(() => isAttractionFilterActive(searchFilter.value))
const choiceWarnings = computed(() =>
  attractionChoiceWarnings(choices.value, props.dayCount, props.attractions),
)

function updateKeyword(event) {
  searchFilter.value = { ...searchFilter.value, keyword: event.target.value }
}

function updateSingleFilter(field, event) {
  const value = event.target.value
  searchFilter.value = { ...searchFilter.value, [field]: value ? [value] : [] }
}

function clearSearchFilter() {
  searchFilter.value = createDefaultAttractionFilter()
}

function toggleSelection(attractionId) {
  const current = choices.value?.[attractionId] || 'none'
  const next = { none: 'must', must: 'interested', interested: 'excluded', excluded: 'none' }[
    current
  ]
  if (
    ['must', 'excluded'].includes(next) &&
    countAttractionChoices(choices.value)[next] >= MAX_ATTRACTION_CHOICES
  ) {
    void showNotice(
      `${next === 'must' ? '必须去' : '排除'}景点最多只能设置20个，请先取消一个已有选择。`,
    )
    return
  }
  choices.value = { ...choices.value, [attractionId]: next }
}
</script>

<template>
  <div class="wizard-attraction-picker" data-testid="wizard-attraction-picker">
    <p class="form-hint">
      必须去、排除各最多 {{ MAX_ATTRACTION_CHOICES }} 个；达到上限后请先取消已有选择。
    </p>
    <div aria-live="polite" data-testid="wizard-attraction-warnings">
      <p v-for="warning in choiceWarnings" :key="warning" class="preference-notice">
        {{ warning }}
      </p>
    </div>
    <div ref="selections" class="wizard-attraction-picker__selections" aria-live="polite">
      <div
        v-for="group in selectionGroups"
        :key="group.state"
        class="wizard-attraction-picker__selected"
        :data-wizard-selected-group="group.state"
      >
        <div>
          <span>{{ group.label }}</span
          ><b
            :data-testid="group.state === 'must' ? 'wizard-attraction-selected-count' : undefined"
            >{{ group.attractions.length }}</b
          >
        </div>
        <div
          class="wizard-attraction-picker__names"
          :class="{ 'wizard-attraction-picker__names--collapsed': !expandedGroups[group.state] }"
        >
          <button
            v-if="expandableGroups[group.state]"
            type="button"
            class="text-button"
            :data-wizard-expand-group="group.state"
            :aria-expanded="Boolean(expandedGroups[group.state])"
            :aria-controls="`${selectionId}-${group.state}`"
            @click="
              expandedGroups = { ...expandedGroups, [group.state]: !expandedGroups[group.state] }
            "
          >
            {{ expandedGroups[group.state] ? '收起' : '展开全部' }}
          </button>
          <p
            :id="`${selectionId}-${group.state}`"
            :data-testid="group.state === 'must' ? 'wizard-attraction-selected-names' : undefined"
          >
            {{ group.attractions.map((item) => item.name).join('、') || '暂未选择' }}
          </p>
          <p
            :ref="(element) => nameElements.set(group.state, element)"
            class="wizard-attraction-picker__measure"
            aria-hidden="true"
          >
            {{ group.attractions.map((item) => item.name).join('、') || '暂未选择' }}
          </p>
        </div>
      </div>
    </div>

    <div v-if="attractions.length" class="wizard-attraction-picker__filters">
      <label class="wizard-attraction-picker__search">
        <span>名称或别名</span>
        <input
          type="search"
          :value="searchFilter.keyword"
          placeholder="搜索 40 个收录景点"
          data-testid="wizard-attraction-keyword"
          @input="updateKeyword"
        />
      </label>
      <div>
        <label>
          <span>类别</span>
          <UiSelect>
            <select
              :value="searchFilter.categories[0] || ''"
              data-wizard-attraction-filter="categories"
              @change="updateSingleFilter('categories', $event)"
            >
              <option value="">全部类别</option>
              <option
                v-for="option in ATTRACTION_CATEGORY_OPTIONS"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </UiSelect>
        </label>
        <label>
          <span>标签</span>
          <UiSelect>
            <select
              :value="searchFilter.tags[0] || ''"
              data-wizard-attraction-filter="tags"
              @change="updateSingleFilter('tags', $event)"
            >
              <option value="">全部标签</option>
              <option
                v-for="option in ATTRACTION_TAG_OPTIONS"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </UiSelect>
        </label>
        <label>
          <span>等级</span>
          <UiSelect>
            <select
              :value="searchFilter.qualityGrades[0] || ''"
              data-wizard-attraction-filter="qualityGrades"
              @change="updateSingleFilter('qualityGrades', $event)"
            >
              <option value="">全部等级</option>
              <option
                v-for="option in ATTRACTION_QUALITY_OPTIONS"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </UiSelect>
        </label>
      </div>
    </div>

    <div v-if="attractions.length" class="wizard-attraction-picker__result-heading">
      <span>找到 {{ matchingAttractions.length }} / {{ attractions.length }} 个景点</span>
      <button type="button" :disabled="!hasSearchFilter" @click="clearSearchFilter">
        清除查找条件
      </button>
    </div>

    <div class="wizard-attraction-picker__results" data-testid="wizard-attraction-results">
      <div v-if="attractions.length === 0" class="wizard-attraction-picker__empty">
        <strong>景点数据暂未加载</strong>
        <span>当前无法确认必去景点，可以稍后重试或改用完整表单。</span>
        <button
          type="button"
          data-testid="wizard-attraction-open-full-form"
          @click="emit('open-full-form')"
        >
          打开完整表单
        </button>
      </div>
      <div v-else-if="matchingAttractions.length === 0" class="wizard-attraction-picker__empty">
        <strong>没有符合条件的景点</strong>
        <span>查找时保留已选的必去景点。</span>
        <button type="button" @click="clearSearchFilter">清除查找条件</button>
      </div>
      <template v-else>
        <section
          v-for="group in groupedAttractions"
          :key="group.category"
          class="wizard-attraction-group"
        >
          <h3>
            {{ group.label }}<small>{{ group.attractions.length }}</small>
          </h3>
          <div>
            <button
              v-for="attraction in group.attractions"
              :key="attraction.id"
              type="button"
              role="button"
              class="wizard-attraction-option"
              :class="{ active: (choices[attraction.id] || 'none') !== 'none' }"
              :data-choice-state="choices[attraction.id] || 'none'"
              :aria-label="`${attraction.name}，${choiceLabels[choices[attraction.id] || 'none']}，点击切换`"
              :data-wizard-attraction="attraction.id"
              @click="toggleSelection(attraction.id)"
            >
              <i aria-hidden="true">{{
                { must: '✓', interested: '○', excluded: '×' }[choices[attraction.id]] || ''
              }}</i>
              <span>{{ attraction.name }}</span>
              <small>{{ choiceLabels[choices[attraction.id] || 'none'] }}</small>
            </button>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>
