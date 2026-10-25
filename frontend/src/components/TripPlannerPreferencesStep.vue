<script setup>
import UiSelect from './UiSelect.vue'
import UiNumberStepper from './UiNumberStepper.vue'
import { TAG_OPTIONS } from '../planning/tripForm'
import AttractionChoiceBrowser from './AttractionChoiceBrowser.vue'

const form = defineModel({ required: true })
defineProps({ attractions: { type: Array, required: true } })

function cycleTag(tag) {
  const current = form.value.tagChoices[tag] || 'none'
  form.value.tagChoices[tag] =
    current === 'none' ? 'preferred' : current === 'preferred' ? 'excluded' : 'none'
}
</script>

<template>
  <div class="planner-step" data-testid="planner-preferences-step">
    <div class="planner-step__heading">
      <strong>规划偏好</strong><span>预算 · 交通 · 景点取舍</span>
    </div>

    <section class="form-section first-section">
      <div class="section-title">
        <span>04</span>
        <div>
          <small>门票与交通</small>
          <h3>控制行程成本和节奏</h3>
        </div>
      </div>
      <div class="budget-row">
        <label>
          全队全程门票预算
          <UiNumberStepper
            v-model.number="form.budgetTotal"
            data-testid="budget-total"
            label="门票预算"
            :min="0"
            :step="100"
            :disabled="form.budgetUnlimited"
          />
        </label>
        <label class="toggle-row budget-unlimited">
          <input
            v-model="form.budgetUnlimited"
            data-testid="budget-unlimited"
            type="checkbox"
          />不限预算
        </label>
      </div>
      <p class="form-hint">只统计门票；必去景点导致超预算时仍会保留并明确提示。</p>

      <label>
        交通倾向
        <UiSelect>
          <select v-model="form.transportPreference" data-testid="transport-preference">
            <option value="public_transit">公共交通优先</option>
            <option value="taxi">打车／自驾</option>
          </select>
        </UiSelect>
      </label>

      <label>
        先生成的方案
        <UiSelect>
          <select v-model="form.preferredPlanType" data-testid="preferred-plan-type">
            <option value="relaxed">轻松方案</option>
            <option value="compact">紧凑方案</option>
            <option value="duck">鸭子特色方案</option>
          </select>
        </UiSelect>
      </label>
      <p class="form-hint">首次只生成这一套；结果页可再按需生成其余方案。</p>
      <label class="toggle-row">
        <input
          v-model="form.allowSkipMealForLongVisit"
          data-testid="allow-skip-long-visit-meal"
          type="checkbox"
        />长时间游览需要时，允许跳过一餐
      </label>
      <p class="form-hint">
        仅限建议游玩时长达到 240 分钟（4 小时）的景点；优先正常用餐，整个行程最多跳过一次。
      </p>
    </section>

    <section class="form-section">
      <div class="section-title compact-title">
        <span>05</span>
        <div>
          <small>景点偏好</small>
          <h3>决定必须去与避开</h3>
        </div>
      </div>
      <p class="form-hint">每个景点可设为必去、感兴趣或排除；未选择的由系统自动推荐。</p>
      <AttractionChoiceBrowser
        v-model="form.attractionChoices"
        :attractions="attractions"
        :day-count="form.days.length"
      />

      <p class="field-caption">兴趣标签：点击可在“偏好 → 排除 → 不限”间切换</p>
      <div class="tag-grid">
        <button
          v-for="[value, label] in TAG_OPTIONS"
          :key="value"
          type="button"
          class="tag-chip"
          :class="`tag-${form.tagChoices[value] || 'none'}`"
          :data-tag-choice="value"
          @click="cycleTag(value)"
        >
          {{ form.tagChoices[value] === 'excluded' ? '排除·' : '' }}{{ label }}
        </button>
      </div>
      <p class="preference-notice">必去优先级最高；兴趣只帮助排序，开放时间和预算仍会参与校验。</p>
    </section>
  </div>
</template>
