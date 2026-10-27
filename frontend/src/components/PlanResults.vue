<script setup>
import { PLAN_LABELS } from '../planning/planningLabels'
import { computed, ref, watch } from 'vue'

import PlanDayTimeline from './PlanDayTimeline.vue'
import HistoryPlanList from './HistoryPlanList.vue'

const props = defineProps({
  response: { type: Object, default: null },
  planState: { type: String, required: true },
  planMessage: { type: String, required: true },
  planProgress: { type: String, default: '' },
  activePlanType: { type: String, required: true },
  activeDayIndex: { type: Number, required: true },
  attractions: { type: Array, required: true },
  saveMessage: { type: String, default: '' },
  view: { type: String, default: 'plans' },
  focusedPlanLegId: { type: String, default: '' },
  expandedPlanLegIds: { type: Array, default: () => [] },
  loadingPlanType: { type: String, default: '' },
  historyPlans: { type: Array, default: () => [] },
})
const emit = defineEmits([
  'back-to-plans',
  'cancel',
  'clear',
  'edit-plan',
  'focus-item',
  'focus-leg',
  'focus-meal',
  'open-day',
  'retry',
  'save',
  'select-day',
  'select-plan',
  'open-history',
  'delete-history',
  'open-planning-debug',
])

const activePlan = computed(
  () => props.response?.plans?.find((plan) => plan.plan_type === props.activePlanType) || null,
)
const activeDay = computed(() => activePlan.value?.days?.[props.activeDayIndex] || null)
const otherPlansOpen = ref(false)
const historyOpen = ref(false)
watch(
  () => props.response,
  (response) => {
    if (!response) otherPlansOpen.value = false
  },
)

const planTypes = ['relaxed', 'compact', 'duck']
const otherPlanTypes = computed(() => planTypes.filter((type) => type !== props.activePlanType))
const planDescriptions = {
  relaxed: '留出更多停留和缓冲时间',
  compact: '在可用时间内安排更多景点',
  duck: '沿途安排南京鸭用餐区域，尽量分散到不同日期',
}
const attractionCount = (plan) =>
  plan.days.reduce(
    (sum, day) => sum + day.items.filter((item) => item.type === 'attraction').length,
    0,
  )
const duckCount = (plan) =>
  plan.days.reduce(
    (sum, day) =>
      sum +
      day.items.filter((item) => item.type === 'duck_restaurant').length +
      (day.legs || []).reduce(
        (total, leg) =>
          total + (leg.meals || []).filter((meal) => meal.area_kind === 'duck').length,
        0,
      ),
    0,
  )

function attractionName(id) {
  return props.attractions.find((item) => item.id === id)?.name || '景点名称暂不可用'
}

function loadedPlan(type) {
  return props.response?.plans?.find((plan) => plan.plan_type === type) || null
}

function choosePlan(type) {
  emit('select-plan', type)
}
</script>

<template>
  <aside class="results-panel" data-testid="results-panel" :data-plan-status="planState">
    <div class="results-header">
      <div>
        <small>规划结果</small>
        <h2>{{ view === 'day' ? '单日计划' : '当前方案' }}</h2>
      </div>
    </div>

    <div v-if="!response" class="empty-result" :class="`empty-${planState}`">
      <div class="empty-icon" aria-hidden="true">路</div>
      <strong>{{
        planState === 'loading' ? '正在安排开放时间、交通和用餐…' : '还没有生成行程'
      }}</strong>
      <p data-testid="plan-message">{{ planMessage }}</p>
      <div
        v-if="planState === 'loading'"
        class="planning-skeleton"
        role="status"
        aria-live="polite"
        aria-label="生成进度，双击展开排程调试面板"
        @dblclick="emit('open-planning-debug')"
      >
        <span class="planning-skeleton__hint" data-testid="planning-loading-hint">{{
          planProgress || '正在连接规划服务…'
        }}</span>
      </div>
      <button
        v-if="planState === 'loading'"
        type="button"
        class="cancel-button"
        data-testid="result-cancel"
        @click="emit('cancel')"
      >
        取消生成
      </button>
      <button
        v-if="planState === 'error'"
        type="button"
        class="retry-button"
        data-testid="plan-retry"
        @click="emit('retry')"
      >
        重新提交
      </button>
    </div>

    <template v-else>
      <p class="result-feedback" :class="`result-${planState}`" data-testid="plan-message">
        {{ planMessage }}
      </p>
      <p
        v-if="planState === 'loading'"
        role="status"
        aria-live="polite"
        data-testid="planning-loading-hint"
        @dblclick="emit('open-planning-debug')"
      >
        {{ planProgress || '正在连接规划服务…' }}
      </p>
      <div v-show="view === 'plans'">
        <p class="plan-tabs__intro">当前只展示已选择的方案；其他方案需要时再生成。</p>
        <p class="plan-tabs__intro">点击下方卡片查看详情。</p>
        <div class="plan-tabs plan-tabs--current" role="list" aria-label="当前行程方案">
          <button
            v-for="type in [activePlanType]"
            :key="type"
            type="button"
            class="active"
            :class="{ 'is-unloaded': !loadedPlan(type) }"
            aria-current="true"
            :data-plan-type="type"
            :disabled="planState === 'loading'"
            @click="choosePlan(type)"
          >
            <span class="plan-tab__title">
              <b>{{ PLAN_LABELS[type] }}</b>
              <em v-if="type === 'relaxed'">推荐</em>
              <em v-else-if="type === 'duck'" class="duck-tag">南京味道</em>
            </span>
            <small>{{ planDescriptions[type] }}</small>
            <span v-if="loadedPlan(type)" class="plan-tab__stats">
              <span
                ><b>{{ attractionCount(loadedPlan(type)) }}</b> 个景点</span
              >
              <span
                ><b>¥{{ loadedPlan(type).total_ticket_cost }}</b> 门票</span
              >
              <span v-if="type === 'duck'"
                ><b>{{ duckCount(loadedPlan(type)) }}</b> 次南京鸭用餐</span
              >
              <span v-else
                ><b>{{ loadedPlan(type).unplanned_attractions.length }}</b> 个未安排</span
              >
            </span>
            <span v-else class="plan-tab__stats"><span>尚未生成</span></span>
            <span class="plan-tab__action">{{
              loadingPlanType === type
                ? '正在生成…'
                : loadedPlan(type)
                  ? '查看此方案'
                  : '生成并查看'
            }}</span>
          </button>
        </div>
        <button
          type="button"
          class="other-plans-toggle"
          data-testid="other-plans-toggle"
          :aria-expanded="otherPlansOpen"
          aria-controls="other-plan-options"
          @click="otherPlansOpen = !otherPlansOpen"
        >
          <span>其他方案</span>
          <small>{{ otherPlansOpen ? '收起' : '展开查看或生成' }}</small>
          <i aria-hidden="true">⌄</i>
        </button>
        <div
          v-show="otherPlansOpen"
          id="other-plan-options"
          class="plan-tabs plan-tabs--other"
          role="list"
          aria-label="其他行程方案"
        >
          <button
            v-for="type in otherPlanTypes"
            :key="type"
            type="button"
            :class="{ 'is-unloaded': !loadedPlan(type) }"
            :data-plan-type="type"
            :disabled="planState === 'loading'"
            @click="choosePlan(type)"
          >
            <span class="plan-tab__title">
              <b>{{ PLAN_LABELS[type] }}</b>
              <em v-if="type === 'relaxed'">推荐</em>
              <em v-else-if="type === 'duck'" class="duck-tag">南京味道</em>
            </span>
            <small>{{ planDescriptions[type] }}</small>
            <span v-if="loadedPlan(type)" class="plan-tab__stats">
              <span
                ><b>{{ attractionCount(loadedPlan(type)) }}</b> 个景点</span
              >
              <span
                ><b>¥{{ loadedPlan(type).total_ticket_cost }}</b> 门票</span
              >
              <span v-if="type === 'duck'"
                ><b>{{ duckCount(loadedPlan(type)) }}</b> 次南京鸭用餐</span
              >
              <span v-else
                ><b>{{ loadedPlan(type).unplanned_attractions.length }}</b> 个未安排</span
              >
            </span>
            <span v-else class="plan-tab__stats"><span>尚未生成</span></span>
            <span class="plan-tab__action">{{
              loadingPlanType === type
                ? '正在生成…'
                : loadedPlan(type)
                  ? '查看此方案'
                  : '生成并查看'
            }}</span>
          </button>
        </div>
        <section class="plan-history" data-testid="result-plan-history">
          <button
            type="button"
            class="other-plans-toggle"
            data-testid="result-history-toggle"
            :aria-expanded="historyOpen"
            @click="historyOpen = !historyOpen"
          >
            <span>历史方案</span><small>{{ historyOpen ? '收起' : '展开查看' }}</small
            ><i aria-hidden="true">⌄</i>
          </button>
          <div v-show="historyOpen">
            <HistoryPlanList
              :records="historyPlans"
              :disabled="planState === 'loading'"
              @open-plan="emit('open-history', $event)"
              @delete-plan="emit('delete-history', $event)"
            />
          </div>
        </section>
      </div>
      <div v-if="view === 'day'" class="result-day-actions">
        <button
          type="button"
          class="result-back-button"
          data-testid="result-back-to-plans"
          @click="emit('back-to-plans')"
        >
          返回方案选择
        </button>
        <button
          type="button"
          class="result-edit-button"
          data-testid="result-edit-plan"
          @click="emit('edit-plan')"
        >
          修改方案
        </button>
      </div>

      <section v-if="activePlan" class="plan-summary">
        <p>{{ activePlan.summary }}</p>
        <div class="summary-stats">
          <span
            ><b>{{ attractionCount(activePlan) }}</b> 个景点</span
          >
          <span
            ><b>¥{{ activePlan.total_ticket_cost }}</b> 门票</span
          >
          <span
            ><b>{{ activePlan.unplanned_attractions.length }}</b> 未安排</span
          >
        </div>
        <div v-if="activePlan.budget_exceeded" class="warning-box">
          本方案因必须去景点超过门票预算。
        </div>
      </section>

      <div v-if="activePlan" v-show="view === 'day'">
        <PlanDayTimeline
          :active-day="activeDay"
          :active-day-index="activeDayIndex"
          :active-plan="activePlan"
          :active-plan-type="activePlanType"
          :focused-plan-leg-id="focusedPlanLegId"
          :expanded-plan-leg-ids="expandedPlanLegIds"
          @focus-item="emit('focus-item', $event)"
          @focus-leg="emit('focus-leg', $event)"
          @focus-meal="emit('focus-meal', $event)"
          @select-day="emit('select-day', $event)"
        />
      </div>

      <details v-if="activePlan?.unplanned_attractions.length" class="result-details" open>
        <summary>未安排的明确关注景点（{{ activePlan.unplanned_attractions.length }}）</summary>
        <ul>
          <li v-for="item in activePlan.unplanned_attractions" :key="item.attraction_id">
            <b>{{ attractionName(item.attraction_id) }}</b
            ><span>{{ item.message }}</span>
          </li>
        </ul>
      </details>

      <details
        v-if="activePlan?.warnings.length || response.global_warnings.length"
        class="result-details"
      >
        <summary>行程提醒</summary>
        <ul>
          <li
            v-for="warning in [...response.global_warnings, ...activePlan.warnings]"
            :key="warning"
          >
            <span>{{ warning }}</span>
          </li>
        </ul>
      </details>

      <div class="result-actions" data-testid="result-actions">
        <div v-if="view === 'plans'" class="result-plan-actions">
          <button
            type="button"
            class="result-back-button"
            data-testid="plan-clear"
            :disabled="planState === 'loading'"
            @click="emit('clear')"
          >
            清空方案
          </button>
          <button
            type="button"
            class="result-edit-button"
            data-testid="result-edit-plan-footer"
            :disabled="planState === 'loading'"
            @click="emit('edit-plan')"
          >
            修改方案
          </button>
        </div>
        <button type="button" class="save-button" data-testid="save-plan" @click="emit('save')">
          保存当前方案
        </button>
        <span>{{ saveMessage || '只保存在这台电脑的浏览器中' }}</span>
      </div>
    </template>
  </aside>
</template>
