<script setup>
import UiSelect from './UiSelect.vue'
import UiDateTime from './UiDateTime.vue'
import { computed, ref } from 'vue'

const form = defineModel({ required: true })
const emit = defineEmits(['change-calendar'])
const timeHints = ref({})

function changeTime(day) {
  const toMinutes = (value) => {
    const [hours, minutes] = value.split(':').map(Number)
    return hours * 60 + minutes
  }
  const earliestEnd = toMinutes(day.start_time) + 180
  if (toMinutes(day.end_time) < earliestEnd) {
    day.end_time = `${String(Math.floor(earliestEnd / 60)).padStart(2, '0')}:${String(earliestEnd % 60).padStart(2, '0')}`
    timeHints.value[day.date] = `每日游玩至少3小时，结束时间已自动调整为 ${day.end_time}。`
  } else {
    delete timeHints.value[day.date]
  }
}

const partyLabels = { adult: '成人', student: '学生', child: '儿童' }
const partyTotal = computed(() =>
  Object.values(form.value.party).reduce((sum, value) => sum + Number(value || 0), 0),
)
</script>

<template>
  <div class="planner-step" data-testid="planner-basic-step">
    <div class="planner-step__heading">
      <strong>基本信息</strong><span>日期 · 时间 · 人数</span>
    </div>

    <section class="form-section first-section">
      <div class="section-title">
        <span>01</span>
        <div>
          <small>日期与每日时间</small>
          <h3>安排每天的窗口</h3>
        </div>
      </div>
      <div class="two-columns">
        <label>
          出发日期
          <UiDateTime
            v-model="form.startDate"
            data-testid="start-date"
            type="date"
            label="出发日期"
            @change="emit('change-calendar', 'date')"
          />
        </label>
        <label>
          行程天数（1–5）
          <UiSelect>
            <select
              v-model.number="form.dayCount"
              data-testid="day-count"
              @change="emit('change-calendar', 'day-count')"
            >
              <option v-for="count in 5" :key="count" :value="count">{{ count }} 天</option>
            </select>
          </UiSelect>
        </label>
      </div>
      <div class="day-times">
        <div v-for="(day, index) in form.days" :key="day.date" class="day-time-row">
          <strong>第 {{ index + 1 }} 天</strong><span>{{ day.date.slice(5) }}</span>
          <UiDateTime
            v-model="day.start_time"
            :data-testid="`day-${index}-start`"
            type="time"
            min="07:00"
            max="15:00"
            :label="`第 ${index + 1} 天出发时间`"
            @change="changeTime(day)"
          />
          <i>至</i>
          <UiDateTime
            v-model="day.end_time"
            :data-testid="`day-${index}-end`"
            type="time"
            min="11:00"
            :label="`第 ${index + 1} 天结束时间`"
            @change="changeTime(day)"
          />
          <p v-if="timeHints[day.date]" class="day-time-hint" role="status">
            {{ timeHints[day.date] }}
          </p>
        </div>
      </div>
    </section>

    <section class="form-section">
      <div class="section-title compact-title">
        <span>02</span>
        <div>
          <small>同行人员</small>
          <h3>谁一起游玩</h3>
        </div>
      </div>
      <div class="party-grid">
        <label v-for="(label, key) in partyLabels" :key="key">
          {{ label }}
          <input
            v-model.number="form.party[key]"
            :data-testid="`party-${key}`"
            type="number"
            min="0"
            max="50"
          />
        </label>
      </div>
      <p class="form-hint">共 {{ partyTotal }} 人；住宿和首末日起终点在“住宿安排”中设置。</p>
    </section>
  </div>
</template>
