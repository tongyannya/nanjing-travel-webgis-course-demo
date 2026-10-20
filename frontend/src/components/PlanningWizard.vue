<script setup>
import HelpHint from './HelpHint.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

import { TAG_OPTIONS, shiftDate, attractionChoiceWarnings } from '../planning/tripForm'
import { PLAN_TYPES } from '../planning/planningLabels'
import { buildPlanningSummaryRows } from '../planning/planningSummary'
import WizardAttractionPicker from './WizardAttractionPicker.vue'
import TripWeatherSummary from './TripWeatherSummary.vue'

const props = defineProps({
  attractions: { type: Array, required: true },
  open: { type: Boolean, required: true },
  seedFromForm: { type: Boolean, default: false },
  lodgingName: { type: String, default: '' },
  weatherData: { type: Object, default: null },
  weatherState: { type: String, default: 'idle' },
  weatherMessage: { type: String, default: '' },
})
const form = defineModel({ required: true })
const emit = defineEmits(['close', 'open-full-form', 'submit', 'draft-change', 'retry-weather'])

const dialog = ref(null)
const step = ref(0)
const hasReviewedSummary = ref(false)
const answers = reactive({})
const partyAdultCount = ref('')
const partyStudentCount = ref('')
const partySecondCount = ref('')
const otherBudget = ref('')
const validationMessage = ref('')
const isDateCalendarOpen = ref(false)
const calendarView = ref({ year: 2026, month: 0 })
const dateRowEl = ref(null)
let returnFocus = null
if (props.seedFromForm) {
  Object.assign(answers, {
    entry: 'wizard',
    days: form.value.dayCount,
    pace: form.value.preferredPlanType,
    mode: form.value.transportPreference,
    longVisitMeal: form.value.allowSkipMealForLongVisit,
    interest: { ...form.value.tagChoices },
    must: { ...form.value.attractionChoices },
    budget: form.value.budgetUnlimited
      ? 0
      : [300, 600, 1000].includes(form.value.budgetTotal)
        ? form.value.budgetTotal
        : 'other',
  })
  if (form.value.hasSelectedStartDate) answers.date = form.value.startDate
  partyAdultCount.value = String(form.value.party.adult)
  partyStudentCount.value = String(form.value.party.student)
  partySecondCount.value = String(form.value.party.child)
  otherBudget.value = String(form.value.budgetTotal)
}
watch(
  [answers, step, partyAdultCount, partyStudentCount, partySecondCount, otherBudget],
  () => {
    if (props.open) emit('draft-change')
  },
  { deep: true },
)

const questions = computed(() => [
  {
    id: 'entry',
    title: '打算怎么规划行程',
    hint: '问卷逐题填写更方便；完整表单可以集中设置详细条件。',
    type: 'single',
    options: [
      { value: 'wizard', label: '问卷', detail: '逐题引导填写，更方便地确定出行条件' },
      {
        value: 'full',
        label: '完整表单',
        detail: '可分别设置每天的出发、结束时间，集中填写详细条件。',
      },
    ],
  },
  {
    id: 'days',
    title: '这次打算在南京待几天？',
    hint: '先给个大概就行，生成方案之后还能改。',
    type: 'single',
    columns: 2,
    options: [1, 2, 3, 4, 5].map((value) => ({
      value,
      label: `${value} 天`,
      detail: value === 1 ? '只走城内精华' : value === 3 ? '最常见的安排' : '',
    })),
  },
  {
    id: 'date',
    title: '哪天出发？',
    hint: '可以不填，默认从填表的次日出发。',
    type: 'date',
  },
  {
    id: 'who',
    title: '旅行人数',
    hint: '分别填写成人、学生和儿童人数；空白按 0 计，至少填写 1 人。',
    type: 'single',
  },
  {
    id: 'pace',
    title: '想先看哪种节奏？',
    hint: '首次只生成你选择的一套，其余方案可以在结果页按需生成。',
    type: 'single',
    options: [
      { value: 'relaxed', optionKey: 'relaxed', label: '轻松', detail: '先查看留有缓冲的方案' },
      { value: 'compact', optionKey: 'compact', label: '紧凑', detail: '先查看安排更多景点的方案' },
      {
        value: 'duck',
        optionKey: 'duck',
        label: '鸭子特色',
        detail: '先查看含南京鸭用餐区域的方案',
      },
    ],
  },
  {
    id: 'interest',
    title: '想看／不想看哪几类？',
    hint: '点击一次想看，再点一次排除，再点一次取消。',
    type: 'multi',
    columns: 2,
    options: TAG_OPTIONS.map(([value, label]) => ({ value, label })),
  },
  {
    id: 'must',
    title: '有想去／不想去的地方吗？',
    hint: '点击依次切换必须去、感兴趣、排除、取消。',
    type: 'multi',
    options: props.attractions.map((item) => ({ value: item.id, label: item.name })),
  },
  {
    id: 'budget',
    title: '全程门票预算大概多少？',
    hint: '这里填写的是整个团队、整个行程的门票上限。',
    type: 'single',
    columns: 2,
    options: [
      { value: 300, label: '300 元以内' },
      { value: 600, label: '600 元以内' },
      { value: 1000, label: '1000 元以内' },
      { value: 0, label: '不限预算' },
      { value: 'other', label: '其他' },
    ],
  },
  {
    id: 'longVisitMeal',
    title: '游玩较久的景点，可以跳过一餐吗？',
    hint: '景点建议游玩时长达到 240 分钟（4 小时）时，是否允许为完成游览跳过一次午餐或晚餐？',
    type: 'single',
    options: [
      { value: false, label: '保留每餐', detail: '每餐预留 1 小时' },
      { value: true, label: '必要时允许跳过一餐', detail: '优先正常用餐，整个行程最多跳过一次' },
    ],
  },
  {
    id: 'mode',
    title: '路上更想怎么走？',
    type: 'single',
    options: [
      { value: 'public_transit', label: '公共交通优先', detail: '地铁和公交为主' },
      { value: 'taxi', label: '打车／自驾', detail: '按道路行驶路线与耗时安排' },
    ],
  },
])

const isSummary = computed(() => step.value >= questions.value.length)
const currentQuestion = computed(() => questions.value[step.value] || null)
const optionalQuestions = new Set(['date', 'interest', 'must'])
const wizardAttractionChoices = computed({
  get: () => answers.must || Object.fromEntries(props.attractions.map((item) => [item.id, 'none'])),
  set: (value) => {
    answers.must = value
  },
})

function questionAnswered(id) {
  if (id === 'who') return Boolean(customPartyCount())
  if (id === 'budget')
    return (
      answers.budget !== undefined && (answers.budget !== 'other' || customBudgetTotal() !== null)
    )
  if (id === 'interest')
    return Object.values(answers.interest || {}).some((state) => state !== 'none')
  if (id === 'must')
    return Object.values(wizardAttractionChoices.value).some((state) => state !== 'none')
  if (id === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(answers.date || '')
  return Object.hasOwn(answers, id)
}

const missingRequired = computed(() =>
  questions.value.filter(
    (question) => !optionalQuestions.has(question.id) && !questionAnswered(question.id),
  ),
)

// 末页概览：显示最终会发送的有效值（含未询问项的实际默认值）。
const summaryQuestions = {
  planningMethod: 'entry',
  dayCount: 'days',
  dates: 'date',
  party: 'who',
  planType: 'pace',
  transport: 'mode',
  budget: 'budget',
  longVisitMeal: 'longVisitMeal',
  preferredTags: 'interest',
  excludedTags: 'interest',
  mustVisit: 'must',
  interested: 'must',
  excluded: 'must',
}
const summaryRows = computed(() =>
  [
    { id: 'planningMethod', label: '规划方式', value: '问卷', kind: 'plain' },
    {
      id: 'dayCount',
      label: '行程天数',
      value: `${effectiveForm.value.dayCount} 天`,
      kind: 'plain',
    },
    ...buildPlanningSummaryRows(effectiveForm.value, { attractionNames: attractionNameMap.value }),
  ].map((row) => ({
    ...row,
    missing: Boolean(summaryQuestions[row.id] && !questionAnswered(summaryQuestions[row.id])),
    requiredMissing: Boolean(
      summaryQuestions[row.id] &&
      !optionalQuestions.has(summaryQuestions[row.id]) &&
      !questionAnswered(summaryQuestions[row.id]),
    ),
    defaultHint: row.id === 'dates' && !answers.date ? `默认：${row.value}` : '',
  })),
)

const attractionNameMap = computed(() =>
  Object.fromEntries(props.attractions.map((item) => [item.id, item.name])),
)

// 通过纯函数计算“应用答案后”的表单快照，不触碰真实表单。
const effectiveForm = computed(() => previewAppliedForm())
const choiceWarnings = computed(() =>
  attractionChoiceWarnings(
    effectiveForm.value.attractionChoices,
    effectiveForm.value.days.length,
    props.attractions,
  ),
)

function previewAppliedForm() {
  const preview = JSON.parse(JSON.stringify(form.value))
  if (answers.days) {
    preview.dayCount = answers.days
    preview.days = Array.from({ length: preview.dayCount }, (_, index) => ({
      date: shiftDate(preview.startDate, index),
      start_time: form.value.days[index]?.start_time || '09:00',
      end_time: form.value.days[index]?.end_time || '20:00',
    }))
  }
  const departureDate =
    answers.date || (props.seedFromForm ? form.value.startDate : shiftDate(todayText.value, 1))
  preview.startDate = departureDate
  preview.hasSelectedStartDate = Boolean(answers.date)
  preview.days = Array.from({ length: preview.dayCount }, (_, index) => ({
    date: shiftDate(departureDate, index),
    start_time: form.value.days[index]?.start_time || '09:00',
    end_time: form.value.days[index]?.end_time || '20:00',
  }))
  const counts = customPartyCount()
  if (counts)
    preview.party = {
      adult: counts.adults,
      student: counts.students,
      child: counts.second,
      senior: props.seedFromForm ? form.value.party.senior : 0,
    }
  preview.tagChoices = Object.fromEntries(
    TAG_OPTIONS.map(([tag]) => [tag, answers.interest?.[tag] || 'none']),
  )
  preview.attractionChoices = { ...wizardAttractionChoices.value }
  if (!props.seedFromForm) delete preview.manualLocks
  if (answers.budget !== undefined) {
    if (answers.budget === 'other') {
      const total = customBudgetTotal()
      if (total !== null) {
        preview.budgetUnlimited = false
        preview.budgetTotal = total
      }
    } else {
      preview.budgetUnlimited = answers.budget === 0
      if (answers.budget !== 0) preview.budgetTotal = answers.budget
    }
  }
  if (answers.mode) preview.transportPreference = answers.mode
  if (typeof answers.longVisitMeal === 'boolean')
    preview.allowSkipMealForLongVisit = answers.longVisitMeal
  const preferredPlan = PLAN_TYPES.includes(answers.pace)
    ? answers.pace
    : PLAN_TYPES.includes(preview.preferredPlanType)
      ? preview.preferredPlanType
      : 'relaxed'
  preview.preferredPlanType = preferredPlan
  return preview
}

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']

const calendarCells = computed(() => {
  const { year, month } = calendarView.value
  const leading = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7
  const dayCount = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const cells = []
  for (let index = 0; index < leading; index += 1) cells.push({ key: `blank-${index}`, day: 0 })
  for (let day = 1; day <= dayCount; day += 1) {
    cells.push({
      key: `day-${day}`,
      day,
      date: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    })
  }
  return cells
})

const todayText = computed(() => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
})

function optionIdentity(option) {
  return option.optionKey || String(option.value)
}

function isSelected(option) {
  if (currentQuestion.value.id === 'interest')
    return answers.interest?.[option.value] === 'preferred'
  return answers[currentQuestion.value.id] === option.value
}

function pickOption(option) {
  const id = currentQuestion.value.id
  validationMessage.value = ''
  if (id === 'interest') {
    const current = answers.interest?.[option.value] || 'none'
    answers.interest = {
      ...answers.interest,
      [option.value]:
        current === 'none' ? 'preferred' : current === 'preferred' ? 'excluded' : 'none',
    }
    return
  }
  answers[id] = option.value
  if (id === 'entry' && option.value === 'full') {
    openFullForm()
    return
  }
  if (id === 'budget') {
    if (option.value === 'other')
      nextTick(() => dialog.value?.querySelector('[data-testid=wizard-other-budget]')?.focus())
    else otherBudget.value = ''
  }
}

function customPartyCount() {
  const parse = (text, blankValue = null) => {
    const trimmed = text.trim()
    if (!trimmed) return blankValue
    const value = Number(trimmed)
    return Number.isInteger(value) && value >= 0 && value <= 50 ? value : null
  }
  if (
    ![partyAdultCount.value, partyStudentCount.value, partySecondCount.value].some((value) =>
      value.trim(),
    )
  )
    return null
  const adults = parse(partyAdultCount.value, 0)
  const students = parse(partyStudentCount.value, 0)
  const second = parse(partySecondCount.value, 0)
  if (adults === null || students === null || second === null || adults + students + second < 1)
    return null
  return { adults, students, second }
}

function customBudgetTotal() {
  const text = otherBudget.value.trim()
  if (!text) return null
  const value = Number(text)
  return Number.isInteger(value) && value >= 0 ? value : null
}

function next() {
  if (!currentQuestion.value) return
  if (!questionAnswered('entry')) {
    validationMessage.value = '请先选择问卷或完整表单。'
    return
  }
  validationMessage.value = ''
  step.value += 1
  focusFirstControl()
}

function previous() {
  step.value = Math.max(0, step.value - 1)
  validationMessage.value = ''
  focusFirstControl()
}

function editQuestion(index) {
  if (index > 0 && !questionAnswered('entry')) {
    validationMessage.value = '请先选择问卷或完整表单。'
    return
  }
  validationMessage.value = ''
  step.value = index
  focusFirstControl()
}

function applyEffectiveForm() {
  const nextForm = JSON.parse(JSON.stringify(effectiveForm.value))
  Object.keys(form.value).forEach((key) => {
    if (!(key in nextForm)) delete form.value[key]
  })
  Object.assign(form.value, nextForm)
  return form.value.preferredPlanType
}

function applyAnswers() {
  if (missingRequired.value.length) {
    validationMessage.value = '请先填写所有标有感叹号的必填题。'
    return
  }
  const preferredPlan = applyEffectiveForm()
  emit('submit', preferredPlan)
}

// 概览页“上一题”回到最后一道题；打开完整表单仍保留当前答案且不发请求。
function backToEdit() {
  step.value = Math.max(0, questions.value.length - 1)
  focusFirstControl()
}

function openFullForm() {
  // 概览与完整表单使用同一个有效快照，避免只同步日期而丢失其他答案。
  if (
    step.value > 0 ||
    props.seedFromForm ||
    Object.keys(answers).some((key) => key !== 'entry') ||
    partyAdultCount.value ||
    partyStudentCount.value ||
    partySecondCount.value
  )
    applyEffectiveForm()
  emit('open-full-form')
}

function openDateCalendar() {
  const selected = answers.date ? answers.date.split('-').map(Number) : null
  const now = new Date()
  calendarView.value = {
    year: selected ? selected[0] : now.getFullYear(),
    month: selected ? selected[1] - 1 : now.getMonth(),
  }
  isDateCalendarOpen.value = true
}

function toggleDateCalendar() {
  if (isDateCalendarOpen.value) isDateCalendarOpen.value = false
  else openDateCalendar()
}

function shiftCalendarMonth(offset) {
  const target = new Date(Date.UTC(calendarView.value.year, calendarView.value.month + offset, 1))
  calendarView.value = { year: target.getUTCFullYear(), month: target.getUTCMonth() }
}

function selectCalendarDay(cell) {
  if (!cell.date) return
  answers.date = cell.date
  validationMessage.value = ''
  isDateCalendarOpen.value = false
}

function handleDateCalendarOutside(event) {
  if (!dateRowEl.value?.contains(event.target)) isDateCalendarOpen.value = false
}

function editSummaryRow(row) {
  const ids = {
    ...summaryQuestions,
    mustVisit: 'must',
    interested: 'must',
    excluded: 'must',
    preferredTags: 'interest',
    excludedTags: 'interest',
    longVisitMeal: 'longVisitMeal',
  }
  const index = questions.value.findIndex((question) => question.id === ids[row.id])
  if (index >= 0) editQuestion(index)
  else openFullForm()
}

function close() {
  emit('close')
}

function focusFirstControl() {
  nextTick(() => {
    const selector = isSummary.value
      ? '[data-testid=wizard-submit]'
      : currentQuestion.value?.id === 'must'
        ? '[data-testid=wizard-attraction-keyword], [data-testid=wizard-attraction-open-full-form]'
        : '.wizard-option, .planning-wizard__date, .planning-wizard__fill-row input'
    dialog.value?.querySelector(selector)?.focus()
  })
}

function handleKeydown(event) {
  if (!props.open || document.querySelector('.planning-notice-dialog[open]')) return
  if (event.target.closest?.('.ui-select')?.querySelector('[aria-expanded="true"]')) return
  if (event.key === 'Escape') {
    event.preventDefault()
    if (isDateCalendarOpen.value) {
      isDateCalendarOpen.value = false
      return
    }
    close()
    return
  }
  const target = event.target
  if (
    /^[1-9]$/.test(event.key) &&
    !['INPUT', 'TEXTAREA'].includes(target.tagName) &&
    currentQuestion.value?.id !== 'must' &&
    currentQuestion.value?.options
  ) {
    const option = currentQuestion.value.options[Number(event.key) - 1]
    if (option) {
      event.preventDefault()
      pickOption(option)
    }
  }
  if (event.key === 'Tab' && dialog.value) {
    const controls = [
      ...dialog.value.querySelectorAll(
        'button:not([disabled]):not([tabindex="-1"]), input:not([disabled])',
      ),
    ]
    if (!controls.length) return
    const first = controls[0]
    const last = controls.at(-1)
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      if (answers.entry === 'full') answers.entry = 'wizard'
      returnFocus = document.activeElement
      focusFirstControl()
    } else if (returnFocus?.focus) {
      nextTick(() => returnFocus.focus())
    }
  },
  { immediate: true },
)

watch(isDateCalendarOpen, (open) => {
  if (open) document.addEventListener('pointerdown', handleDateCalendarOutside, true)
  else document.removeEventListener('pointerdown', handleDateCalendarOutside, true)
})

watch(step, (value) => {
  isDateCalendarOpen.value = false
  if (value >= questions.value.length) hasReviewedSummary.value = true
})

onMounted(() => document.addEventListener('keydown', handleKeydown, true))
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDateCalendarOutside, true)
  document.removeEventListener('keydown', handleKeydown, true)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="planning-wizard-backdrop"
      data-testid="planning-wizard"
      @click.self="close"
    >
      <section
        ref="dialog"
        class="planning-wizard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="planning-wizard-title"
      >
        <header class="planning-wizard__header">
          <div>
            <span class="context-help-heading"
              >{{ isSummary ? '答案汇总' : '行程条件' }}
              <HelpHint
                label="行程条件"
                test-id="wizard-help"
                text="按问题填写出行日期、同行人数与游玩偏好。最后在本次选择概览核对答案，点击条目可修改，确认后生成行程；完整表单可以集中查看所有条件。"
              />
            </span>
            <small>{{
              isSummary
                ? `住宿：${lodgingName || '尚未安排'}`
                : `第 ${step + 1} / ${questions.length} 题`
            }}</small>
          </div>
          <button type="button" aria-label="关闭问卷" data-testid="wizard-close" @click="close">
            ×
          </button>
          <nav class="planning-wizard__progress" aria-label="问卷题目进度">
            <button
              v-for="(question, index) in questions"
              :key="question.id"
              type="button"
              :data-wizard-progress="question.id"
              :aria-label="`第${index + 1}题：${question.title}`"
              :aria-current="step === index ? 'step' : undefined"
              :class="{ filled: questionAnswered(question.id), current: step === index }"
              @click="editQuestion(index)"
            >
              <span></span>
              <small
                v-if="!optionalQuestions.has(question.id)"
                :data-hover-text="questionAnswered(question.id) ? '已填写' : '必填'"
                :class="{ missing: hasReviewedSummary && !questionAnswered(question.id) }"
                :aria-label="questionAnswered(question.id) ? '已填写' : '必填'"
                >{{ questionAnswered(question.id) ? '✓' : '!' }}</small
              >
            </button>
          </nav>
        </header>

        <div class="planning-wizard__body">
          <template v-if="!isSummary">
            <h2 id="planning-wizard-title">{{ currentQuestion.title }}</h2>
            <p v-if="currentQuestion.hint" class="planning-wizard__hint">
              {{ currentQuestion.hint }}
            </p>
            <div
              v-if="currentQuestion.type === 'date'"
              ref="dateRowEl"
              class="planning-wizard__date-row"
            >
              <input
                v-model="answers.date"
                class="planning-wizard__date"
                data-testid="wizard-date"
                type="date"
                @click="openDateCalendar"
              />
              <button
                type="button"
                class="planning-wizard__date-toggle"
                data-testid="wizard-date-toggle"
                aria-label="打开日历"
                @click="toggleDateCalendar"
              >
                <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                  <rect
                    x="1.5"
                    y="2.5"
                    width="13"
                    height="12"
                    rx="1.5"
                    fill="none"
                    stroke="currentColor"
                  />
                  <path d="M1.5 6h13M4.5 1v3M11.5 1v3" fill="none" stroke="currentColor" />
                </svg>
              </button>
              <div
                v-if="isDateCalendarOpen"
                class="planning-wizard__calendar"
                data-testid="wizard-calendar"
              >
                <header>
                  <button
                    type="button"
                    class="planning-wizard__calendar-month"
                    data-testid="wizard-calendar-prev"
                    aria-label="上一个月"
                    @click="shiftCalendarMonth(-1)"
                  >
                    ‹
                  </button>
                  <strong>{{ calendarView.year }} 年 {{ calendarView.month + 1 }} 月</strong>
                  <button
                    type="button"
                    class="planning-wizard__calendar-month"
                    data-testid="wizard-calendar-next"
                    aria-label="下一个月"
                    @click="shiftCalendarMonth(1)"
                  >
                    ›
                  </button>
                </header>
                <div class="planning-wizard__calendar-grid">
                  <span
                    v-for="label in WEEKDAY_LABELS"
                    :key="label"
                    class="planning-wizard__calendar-weekday"
                    >{{ label }}</span
                  >
                  <template v-for="cell in calendarCells" :key="cell.key">
                    <span v-if="!cell.day" class="planning-wizard__calendar-blank"></span>
                    <button
                      v-else
                      type="button"
                      class="planning-wizard__calendar-day"
                      :class="{
                        'is-selected': cell.date === answers.date,
                        'is-today': cell.date === todayText,
                      }"
                      :data-calendar-date="cell.date"
                      @click="selectCalendarDay(cell)"
                    >
                      {{ cell.day }}
                    </button>
                  </template>
                </div>
              </div>
            </div>
            <TripWeatherSummary
              v-if="currentQuestion.type === 'date'"
              :dates="effectiveForm.days.map((day) => day.date)"
              :weather-data="weatherData"
              :weather-state="weatherState"
              :weather-message="weatherMessage"
              @retry="emit('retry-weather')"
            />
            <WizardAttractionPicker
              v-else-if="currentQuestion.id === 'must'"
              v-model="wizardAttractionChoices"
              :attractions="attractions"
              :day-count="effectiveForm.days.length"
              @open-full-form="openFullForm"
            />
            <div
              v-else-if="currentQuestion.id !== 'who'"
              class="planning-wizard__options"
              :class="{ 'planning-wizard__options--two': currentQuestion.columns === 2 }"
            >
              <button
                v-for="(option, index) in currentQuestion.options"
                :key="optionIdentity(option)"
                type="button"
                class="wizard-option"
                :class="{
                  active: isSelected(option),
                  excluded:
                    currentQuestion.id === 'interest' &&
                    answers.interest?.[option.value] === 'excluded',
                }"
                :aria-pressed="
                  currentQuestion.id === 'interest'
                    ? (answers.interest?.[option.value] || 'none') !== 'none'
                    : isSelected(option)
                "
                :data-wizard-option="optionIdentity(option)"
                @click="pickOption(option)"
              >
                <span>{{ index + 1 }}</span>
                <b
                  >{{
                    currentQuestion.id === 'interest' &&
                    answers.interest?.[option.value] === 'excluded'
                      ? '排除·'
                      : ''
                  }}{{ option.label }}<small v-if="option.detail">{{ option.detail }}</small></b
                >
              </button>
            </div>
            <div v-if="currentQuestion.id === 'who'" class="planning-wizard__fill-row">
              <span>成人</span>
              <input
                v-model="partyAdultCount"
                class="planning-wizard__other"
                data-testid="wizard-party-adult"
                type="text"
                inputmode="numeric"
                placeholder="例如：2"
              />
              <span>人</span>
            </div>
            <div v-if="currentQuestion.id === 'who'" class="planning-wizard__fill-row">
              <span>学生</span>
              <input
                v-model="partyStudentCount"
                class="planning-wizard__other"
                data-testid="wizard-party-student"
                type="text"
                inputmode="numeric"
                placeholder="没有填 0"
              />
              <span>人</span>
            </div>
            <div v-if="currentQuestion.id === 'who'" class="planning-wizard__fill-row">
              <span>儿童</span>
              <input
                v-model="partySecondCount"
                class="planning-wizard__other"
                data-testid="wizard-party-second"
                type="text"
                inputmode="numeric"
                placeholder="没有填 0"
              />
              <span>人</span>
            </div>
            <div
              v-if="currentQuestion.id === 'budget' && answers.budget === 'other'"
              class="planning-wizard__fill-row"
            >
              <span>不超过</span>
              <input
                v-model="otherBudget"
                class="planning-wizard__other"
                data-testid="wizard-other-budget"
                type="text"
                inputmode="numeric"
                placeholder="例如：800"
              />
              <span>元</span>
            </div>
            <p v-if="validationMessage" class="planning-wizard__error">{{ validationMessage }}</p>
          </template>
          <template v-else>
            <h2 id="planning-wizard-title">本次选择概览</h2>
            <p
              v-if="missingRequired.length"
              class="planning-wizard__error"
              data-testid="wizard-required-missing"
            >
              还有必填题未填写，请点击进度条补充：{{
                missingRequired.map((question) => question.title).join('、')
              }}
            </p>
            <p class="planning-wizard__hint">
              未作答的题目显示“未填”；可选题采用默认规则，其他项目显示实际条件，可打开完整表单修改。
            </p>
            <div class="planning-wizard__summary" data-testid="wizard-final-summary">
              <div v-for="row in summaryRows" :key="row.id" :data-wizard-summary-row="row.id">
                <span>{{ row.label }}</span>
                <b
                  :class="{
                    missing: row.requiredMissing,
                    empty: !row.requiredMissing && (row.missing || !row.value),
                  }"
                >
                  {{ row.missing ? '未填' : row.value || '暂无' }}
                  <small
                    v-if="row.missing && row.defaultHint"
                    class="planning-wizard__default-hint"
                    >{{ row.defaultHint }}</small
                  >
                </b>
                <button
                  v-if="
                    row.missing ||
                    ((row.kind === 'tags' || row.id === 'longVisitMeal') && row.value)
                  "
                  type="button"
                  :data-summary-question="row.id"
                  :aria-label="`修改${row.label}`"
                  @click="editSummaryRow(row)"
                >
                  修改
                </button>
              </div>
            </div>
            <div aria-live="polite" data-testid="wizard-choice-warnings">
              <p v-for="warning in choiceWarnings" :key="warning" class="preference-notice">
                {{ warning }}
              </p>
            </div>
          </template>
          <p class="planning-wizard__hint">可以通过顶部进度条切换题目。</p>
        </div>

        <footer class="planning-wizard__footer">
          <button
            type="button"
            class="wizard-ghost"
            data-testid="wizard-previous"
            :disabled="step === 0"
            @click="isSummary ? backToEdit() : previous()"
          >
            上一题
          </button>
          <button
            v-if="isSummary"
            type="button"
            class="wizard-link"
            data-testid="wizard-full-form"
            @click="openFullForm"
          >
            打开完整表单
          </button>
          <button
            v-else
            type="button"
            class="wizard-link"
            data-testid="wizard-full-form"
            @click="openFullForm"
          >
            改用完整表单
          </button>
          <span></span>
          <button
            v-if="!isSummary"
            type="button"
            class="wizard-ghost"
            data-testid="wizard-review-summary"
            @click="editQuestion(questions.length)"
          >
            查看答案汇总
          </button>
          <button
            type="button"
            class="wizard-primary"
            :data-testid="isSummary ? 'wizard-submit' : 'wizard-next'"
            :disabled="isSummary && missingRequired.length > 0"
            @click="isSummary ? applyAnswers() : next()"
          >
            {{ isSummary ? '确认并生成' : '下一题' }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
