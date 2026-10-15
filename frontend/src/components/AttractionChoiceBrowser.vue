<script setup>
import UiSelect from './UiSelect.vue'
import { computed, inject, ref } from 'vue'
import { MAX_ATTRACTION_CHOICES, attractionChoiceWarnings } from '../planning/tripForm'
import { PLANNING_NOTICE_KEY } from '../composables/usePlanningNotices'

import {
  ATTRACTION_CATEGORY_LABELS,
  ATTRACTION_CATEGORY_OPTIONS,
  ATTRACTION_QUALITY_OPTIONS,
  ATTRACTION_TAG_LABELS,
  ATTRACTION_TAG_OPTIONS,
  createDefaultAttractionFilter,
  filterAttractions,
  isAttractionFilterActive,
} from '../attractions/attractionFilters'

const choices = defineModel({ required: true })
const showNotice = inject(PLANNING_NOTICE_KEY, () => Promise.resolve(false))
const props = defineProps({
  attractions: { type: Array, required: true },
  dayCount: { type: Number, default: 1 },
})

const searchFilter = ref(createDefaultAttractionFilter())
const selectionView = ref('all')

const choiceStates = Object.freeze([
  { value: 'none', label: '自动考虑' },
  { value: 'must', label: '必须去' },
  { value: 'interested', label: '感兴趣' },
  { value: 'excluded', label: '排除' },
])

const selectedCounts = computed(() => {
  const counts = { must: 0, interested: 0, excluded: 0 }
  props.attractions.forEach((attraction) => {
    const state = choices.value?.[attraction.id]
    if (counts[state] !== undefined) counts[state] += 1
  })
  return counts
})

const selectionViews = computed(() => [
  { value: 'all', label: '全部', count: props.attractions.length },
  { value: 'must', label: '必须去', count: selectedCounts.value.must },
  { value: 'interested', label: '感兴趣', count: selectedCounts.value.interested },
  { value: 'excluded', label: '排除', count: selectedCounts.value.excluded },
])

const matchingAttractions = computed(() => filterAttractions(props.attractions, searchFilter.value))

const visibleAttractions = computed(() => {
  if (selectionView.value === 'all') return matchingAttractions.value
  return matchingAttractions.value.filter(
    (attraction) => choices.value?.[attraction.id] === selectionView.value,
  )
})

const hasSearchFilter = computed(() => isAttractionFilterActive(searchFilter.value))
const choiceWarnings = computed(() =>
  attractionChoiceWarnings(choices.value, props.dayCount, props.attractions),
)

function choiceDisabled(attractionId, state) {
  return (
    ['must', 'excluded'].includes(state) &&
    choices.value?.[attractionId] !== state &&
    selectedCounts.value[state] >= MAX_ATTRACTION_CHOICES
  )
}

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

function updateChoice(attractionId, event) {
  if (choiceDisabled(attractionId, event.target.value)) {
    const label = event.target.value === 'must' ? '必须去' : '排除'
    event.target.value = choices.value?.[attractionId] || 'none'
    void showNotice(`${label}景点最多只能设置20个，请先取消一个已有选择。`)
    return
  }
  choices.value = { ...choices.value, [attractionId]: event.target.value }
}

function categoryLabel(attraction) {
  return ATTRACTION_CATEGORY_LABELS[attraction?.category] || '类别暂无'
}

function tagSummary(attraction) {
  if (!Array.isArray(attraction?.tags) || attraction.tags.length === 0) return '标签暂无'
  const labels = attraction.tags.slice(0, 2).map((tag) => ATTRACTION_TAG_LABELS[tag] || tag)
  if (attraction.tags.length > 2) labels.push(`等 ${attraction.tags.length} 项`)
  return labels.join('、')
}

function durationLabel(attraction) {
  const duration = attraction?.duration?.suggested_minutes
  return Number.isFinite(duration) ? `建议 ${duration} 分钟` : '建议时长暂无'
}
</script>

<template>
  <div class="attraction-choice-browser" data-testid="attraction-choice-browser">
    <p class="form-hint">
      必须去、排除各最多 {{ MAX_ATTRACTION_CHOICES }} 个；达到上限后请先取消已有选择。
    </p>
    <div aria-live="polite" data-testid="attraction-choice-warnings">
      <p v-for="warning in choiceWarnings" :key="warning" class="preference-notice">
        {{ warning }}
      </p>
    </div>
    <div class="attraction-choice-summary" aria-label="景点选择数量">
      <button
        v-for="view in selectionViews"
        :key="view.value"
        type="button"
        :class="{ active: selectionView === view.value }"
        :aria-pressed="selectionView === view.value"
        :data-choice-view="view.value"
        :data-choice-count="view.count"
        @click="selectionView = view.value"
      >
        <span>{{ view.label }}</span
        ><b>{{ view.count }}</b>
      </button>
    </div>

    <div class="attraction-choice-filters">
      <label class="attraction-choice-search">
        <span>名称或别名</span>
        <input
          type="search"
          :value="searchFilter.keyword"
          placeholder="搜索 40 个正式景点"
          data-testid="attraction-choice-keyword"
          @input="updateKeyword"
        />
      </label>
      <div class="attraction-choice-filter-grid">
        <label>
          <span>类别</span>
          <UiSelect>
            <select
              :value="searchFilter.categories[0] || ''"
              data-choice-filter="categories"
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
              data-choice-filter="tags"
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
              data-choice-filter="qualityGrades"
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

    <div class="attraction-choice-result-heading" aria-live="polite">
      <span>当前显示 {{ visibleAttractions.length }} / {{ attractions.length }} 个景点</span>
      <button
        type="button"
        :disabled="!hasSearchFilter"
        data-testid="clear-attraction-choice-filter"
        @click="clearSearchFilter"
      >
        清除查找条件
      </button>
    </div>

    <div class="attraction-choices" data-testid="attraction-choice-results">
      <p v-if="attractions.length === 0" class="attraction-choice-empty">
        景点数据暂未加载，当前无法设置景点偏好。
      </p>
      <div v-else-if="visibleAttractions.length === 0" class="attraction-choice-empty">
        <strong>{{
          selectionView === 'all' ? '没有符合条件的景点' : '当前视图没有符合条件的已选景点'
        }}</strong>
        <span>查找时保留已设置的景点。</span>
        <button v-if="hasSearchFilter" type="button" @click="clearSearchFilter">
          清除查找条件
        </button>
      </div>
      <template v-else>
        <label
          v-for="item in visibleAttractions"
          :key="item.id"
          class="attraction-choice"
          :data-attraction-choice-row="item.id"
        >
          <span>
            <b>{{ item.name || '名称暂无' }}</b>
            <small>
              {{ item.id || '编号暂无' }} · {{ categoryLabel(item) }} ·
              {{ item.quality_grade || '未评级' }}
            </small>
            <small>{{ tagSummary(item) }} · {{ durationLabel(item) }}</small>
          </span>
          <UiSelect>
            <select
              :value="choices[item.id] || 'none'"
              :aria-label="`${item.name}的游览偏好`"
              :data-attraction-choice="item.id"
              @change="updateChoice(item.id, $event)"
            >
              <option v-for="state in choiceStates" :key="state.value" :value="state.value">
                {{ state.label }}
              </option>
            </select>
          </UiSelect>
        </label>
      </template>
    </div>
  </div>
</template>
