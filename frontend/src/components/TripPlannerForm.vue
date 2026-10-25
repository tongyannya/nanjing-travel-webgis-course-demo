<script setup>
import { computed, ref, watch } from 'vue'

import { syncTripDays } from '../planning/tripForm'
import { PLAN_FORM_LABELS } from '../planning/planningLabels'
import TripPlannerBasicStep from './TripPlannerBasicStep.vue'
import TripPlannerPreferencesStep from './TripPlannerPreferencesStep.vue'

const form = defineModel({ required: true })
defineProps({
  attractions: { type: Array, required: true },
  planState: { type: String, required: true },
  hasCurrentPlan: { type: Boolean, default: false },
})
const emit = defineEmits(['submit', 'cancel', 'open-questionnaire', 'edited'])
watch(form, () => emit('edited'), { deep: true, flush: 'sync' })

const activeStep = ref('basic')
const selectedPlanLabel = computed(
  () => PLAN_FORM_LABELS[form.value.preferredPlanType] || PLAN_FORM_LABELS.relaxed,
)

function changeCalendar(reason) {
  if (reason === 'date') form.value.hasSelectedStartDate = true
  syncTripDays(form.value)
}

function showStep(step) {
  activeStep.value = step
}
</script>

<template>
  <form class="trip-form" data-testid="trip-form" @submit.prevent="emit('submit')">
    <nav class="form-progress" aria-label="规划表单步骤">
      <button
        type="button"
        :class="{ active: activeStep === 'basic' }"
        :aria-current="activeStep === 'basic' ? 'step' : undefined"
        data-testid="planner-step-basic"
        @click="showStep('basic')"
      >
        <span>1</span>基本信息
      </button>
      <button
        type="button"
        :class="{ active: activeStep === 'preferences' }"
        :aria-current="activeStep === 'preferences' ? 'step' : undefined"
        data-testid="planner-step-preferences"
        @click="showStep('preferences')"
      >
        <span>2</span>规划偏好
      </button>
    </nav>

    <TripPlannerBasicStep
      v-if="activeStep === 'basic'"
      v-model="form"
      @change-calendar="changeCalendar"
    />
    <TripPlannerPreferencesStep v-else v-model="form" :attractions="attractions" />

    <section
      class="form-submit"
      :class="{ 'form-submit--with-return': hasCurrentPlan && activeStep === 'preferences' }"
    >
      <p class="form-submit__hint">
        {{
          activeStep === 'basic'
            ? '确认日期和同行人员后，再设置偏好；住宿在右侧总览的“住宿安排”中设置。'
            : `先生成${selectedPlanLabel}；其他方案可在结果页按需生成。`
        }}
      </p>
      <button
        v-if="activeStep === 'basic'"
        type="button"
        class="planner-questionnaire action-button--green"
        data-testid="planner-use-questionnaire"
        @click="emit('open-questionnaire', $event.currentTarget)"
      >
        改用问卷
      </button>
      <button
        v-if="activeStep === 'basic'"
        type="button"
        class="generate-button"
        data-testid="planner-next-step"
        @click="showStep('preferences')"
      >
        下一步：规划偏好
      </button>
      <template v-else>
        <button
          v-if="planState !== 'loading'"
          type="submit"
          class="generate-button"
          data-testid="trip-submit"
        >
          生成{{ selectedPlanLabel }}
        </button>
        <button
          v-else
          type="button"
          class="cancel-button"
          data-testid="trip-cancel"
          @click="emit('cancel')"
        >
          取消生成
        </button>
      </template>
    </section>
  </form>
</template>
