<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({
  record: { type: Object, default: null },
  attractions: { type: Array, default: () => [] },
})
defineEmits(['cancel'])
const open = defineModel('open', { type: Boolean, default: false })
const imported = ref(null)
const activeRecord = computed(() => imported.value || props.record)
const events = computed(() => activeRecord.value?.events || [])
const selected = ref(0)
const filter = ref('all')
const follow = ref(true)
const playing = ref(false)
const importMessage = ref('')
const fileInput = ref(null)
const eventList = ref(null)
let timer
const phases = {
  request: '旅行条件',
  selection: '逐轮选景',
  optimization: '顺序优化',
  traffic: '道路核对',
  repair: '后续检查',
  dining: '餐饮匹配',
  complete: '最终安排',
}
const statuses = {
  running: '正在记录',
  complete: '生成完成',
  error: '生成失败',
  cancelled: '已取消',
}
const parts = {
  must: '必去',
  interested: '兴趣',
  tags: '标签',
  recommendation: '推荐',
  quality: '等级',
  night: '夜景',
  distance: '距离',
  nearby: '邻近',
}
const sourceNames = {
  endpoint: '路线端点',
  road: '道路途经',
  walk: '步行途经',
  transit_stop: '公交站点',
}
const modes = { taxi: '出租车', walk: '步行', self_drive: '自驾', public_transit: '公共交通' }
const visibleEvents = computed(() =>
  events.value
    .map((event, index) => ({ event, index }))
    .filter(
      ({ event }) =>
        filter.value === 'all' ||
        (filter.value === 'accepted'
          ? event.phase === 'optimization' && event.accepted === true
          : event.phase === filter.value),
    ),
)
const current = computed(() => events.value[selected.value])
const visibleParts = computed(() =>
  current.value?.return_review ? { ...parts, return_distance: '返程' } : parts,
)
const names = computed(() =>
  Object.fromEntries(props.attractions.map((item) => [item.id, item.name])),
)
const status = computed(() => statuses[activeRecord.value?.status] || '等待生成')

function stop() {
  window.clearInterval(timer)
  playing.value = false
}
function choose(index) {
  selected.value = index
  follow.value = false
  stop()
}
function step(offset) {
  const position = visibleEvents.value.findIndex((item) => item.index === selected.value)
  const next =
    visibleEvents.value[Math.max(0, Math.min(visibleEvents.value.length - 1, position + offset))]
  if (next) choose(next.index)
}
function replay() {
  if (playing.value) {
    stop()
    return
  }
  follow.value = false
  if (selected.value >= (visibleEvents.value.at(-1)?.index ?? 0))
    selected.value = visibleEvents.value[0]?.index || 0
  playing.value = true
  timer = window.setInterval(() => {
    const next = visibleEvents.value.find((item) => item.index > selected.value)
    if (next) selected.value = next.index
    else stop()
  }, 1500)
}
function latest() {
  stop()
  filter.value = 'all'
  follow.value = true
  selected.value = Math.max(0, events.value.length - 1)
}
function number(value) {
  return typeof value === 'number' ? value.toFixed(2) : '—'
}
function places(ids) {
  return ids.map((id) => names.value[id] || id).join('、') || '未指定'
}
function order(plan) {
  return plan.days
    .map(
      (day) =>
        `${day.date}：${
          day.items
            .filter((i) => i.type === 'attraction')
            .map((i) => i.name)
            .join(' → ') || '无景点'
        }`,
    )
    .join('\n')
}
function download() {
  const blob = new Blob(
    [
      JSON.stringify(
        { format: 'nanjing-planning-trace', version: 1, ...activeRecord.value },
        null,
        2,
      ),
    ],
    { type: 'application/json' },
  )
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `排程过程_${activeRecord.value.request?.trip_days?.[0]?.date || '记录'}.json`
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
async function importFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  try {
    if (file.size > 20 * 1024 * 1024) throw new Error('请选择不超过20MB的过程记录。')
    const record = JSON.parse(await file.text())
    if (
      record.format !== 'nanjing-planning-trace' ||
      record.version !== 1 ||
      !Array.isArray(record.events) ||
      !record.events.every(
        (item) => item && typeof item.title === 'string' && typeof item.phase === 'string',
      )
    )
      throw new Error('请选择导出的排程过程JSON文件。')
    stop()
    imported.value = record
    selected.value = 0
    follow.value = false
    filter.value = 'all'
    importMessage.value = '已打开过程记录，可逐步回放。'
  } catch (error) {
    importMessage.value = error.message || '过程记录读取失败。'
  }
}
watch(
  () => props.record,
  (record) => {
    stop()
    imported.value = null
    importMessage.value = ''
    selected.value = 0
    follow.value = true
    filter.value = 'all'
    if (record) open.value = true
  },
)
watch(
  () => events.value.length,
  async (length) => {
    if (!follow.value) return
    selected.value = Math.max(0, length - 1)
    await nextTick()
    eventList.value?.querySelector('[aria-current="step"]')?.scrollIntoView({ block: 'nearest' })
  },
)
watch(filter, () => {
  if (!visibleEvents.value.some((item) => item.index === selected.value))
    selected.value = visibleEvents.value[0]?.index || 0
})
watch(open, (value) => {
  if (!value) stop()
})
onBeforeUnmount(stop)
</script>

<template>
  <section
    v-if="open"
    class="trace-window"
    aria-label="排程过程调试窗口"
    data-testid="planning-trace"
    :data-trace-status="activeRecord?.status || 'idle'"
  >
    <header class="trace-header">
      <div>
        <strong>排程过程</strong><span>{{ status }} · {{ events.length }}条记录</span>
      </div>
      <button aria-label="收起排程过程窗口" data-testid="trace-close" @click="open = false">
        收起
      </button>
    </header>
    <div class="trace-tools">
      <select v-model="filter" aria-label="筛选排程阶段">
        <option value="all">全部阶段</option>
        <option value="accepted">采用调整</option>
        <option v-for="(label, key) in phases" :key="key" :value="key">{{ label }}</option>
      </select>
      <button :disabled="!visibleEvents.length" @click="step(-1)">上一步</button>
      <button :disabled="!visibleEvents.length" @click="step(1)">下一步</button>
      <button :disabled="!visibleEvents.length" @click="replay">
        {{ playing ? '暂停回放' : '自动回放' }}
      </button>
      <button :aria-pressed="follow" @click="latest">跟随最新</button>
      <button :disabled="!events.length" data-testid="trace-export" @click="download">
        导出记录
      </button>
      <button :disabled="props.record?.status === 'running'" @click="fileInput.click()">
        导入记录
      </button>
      <button
        v-if="props.record?.status === 'running'"
        data-testid="trace-cancel"
        @click="$emit('cancel')"
      >
        取消生成
      </button>
      <input
        ref="fileInput"
        class="trace-file"
        type="file"
        accept=".json,application/json"
        data-testid="trace-import"
        @change="importFile"
      />
    </div>
    <p v-if="importMessage || activeRecord?.message" class="trace-message" role="status">
      {{ importMessage || activeRecord.message }}
    </p>
    <p v-if="!events.length" class="trace-empty">
      填写旅行条件并点击生成，这里会显示本次计算的选景、排序、交通和餐饮记录。已有方案可以打开“修改方案”后重新生成并记录。
    </p>
    <div v-else class="trace-body">
      <nav ref="eventList" class="trace-events" aria-label="排程步骤">
        <button
          v-for="{ event, index } in visibleEvents"
          :key="index"
          :aria-current="selected === index ? 'step' : undefined"
          @click="choose(index)"
        >
          <small
            >{{ event.sequence }} · {{ phases[event.phase] || event.phase }} ·
            {{ (event.elapsed_ms / 1000).toFixed(2) }}秒</small
          >
          <span>{{ event.title }}</span>
        </button>
      </nav>
      <article v-if="current" class="trace-detail" data-testid="trace-detail">
        <h2>{{ current.title }}</h2>
        <p v-if="current.message">{{ current.message }}</p>
        <template v-if="current.request">
          <p v-for="day in current.request.trip_days" :key="day.date">
            {{ day.date }}：{{ day.start_time }}～{{ day.end_time }}
          </p>
          <p>
            住宿：{{ current.request.lodging.name }}；末日终点：{{
              current.request.last_day_end?.name || '住处'
            }}
          </p>
          <p>
            必须去：{{ places(current.request.preferences.must_visit_ids) }}；感兴趣：{{
              places(current.request.preferences.interested_ids)
            }}；不去：{{ places(current.request.preferences.excluded_ids) }}
          </p>
          <p>
            学生{{ current.request.party.student }}人、成人{{
              current.request.party.adult
            }}人、儿童{{ current.request.party.child }}人；门票预算：{{
              current.request.ticket_budget.unlimited
                ? '不限'
                : `${current.request.ticket_budget.total}元`
            }}
          </p>
        </template>
        <template v-if="current.candidates">
          <p>
            {{ current.current_location }} · {{ current.current_time }}；本轮可行{{
              current.candidate_count
            }}处；已计门票{{ current.ticket_cost_so_far }}元<span v-if="current.meal_deadline"
              >；下餐前游览截止{{ current.meal_deadline }}</span
            >。
          </p>
          <p class="trace-hint">
            先检查时间、开放、预算等条件，再比较得分。偏好标签命中多个只加一次120分；邻近分取当天已选景点中最大的一项。
          </p>
          <div class="trace-table-scroll">
            <table class="trace-scores">
              <thead>
                <tr>
                  <th>景点／判断</th>
                  <th>总分</th>
                  <th v-for="label in visibleParts" :key="label">{{ label }}</th>
                  <th>试排时段</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in current.candidates"
                  :key="row.id"
                  :class="{ 'trace-chosen': row.id === current.selected_id }"
                >
                  <th>
                    {{ row.id === current.selected_id ? '✓ ' : '' }}{{ row.name
                    }}<small
                      >{{ row.reason
                      }}<template v-if="row.duration"> · {{ row.duration }}分钟</template></small
                    >
                    <details v-if="row.attempts?.length">
                      <summary>试排检查</summary>
                      <p v-for="(attempt, index) in row.attempts" :key="index">
                        {{ attempt.attempt }}：{{ attempt.detail }}
                      </p>
                    </details>
                  </th>
                  <td>{{ number(row.score) }}</td>
                  <td v-for="(_, key) in visibleParts" :key="key">
                    {{ number(row.parts?.[key]) }}
                  </td>
                  <td>
                    {{ row.start_time ? `${row.start_time}～${row.end_time}` : '—'
                    }}<small v-if="row.meal_before_visit">先预留用餐</small>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
        <template v-if="current.trial_orders">
          <p v-for="(ids, date) in current.trial_orders" :key="date">
            试排{{ date }}：{{ ids.join(' → ') }}
          </p>
          <div class="trace-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>比较内容</th>
                  <th>当前安排</th>
                  <th>本次试排</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th>交通＋邻近分散代价</th>
                  <td>{{ number(current.before_cost[0]) }}</td>
                  <td>{{ number(current.candidate_cost[0]) }}</td>
                </tr>
                <tr>
                  <th>预留交通／分钟</th>
                  <td>{{ current.before_cost[1] }}</td>
                  <td>{{ current.candidate_cost[1] }}</td>
                </tr>
                <tr>
                  <th>直线距离合计／公里</th>
                  <td>{{ number(current.before_cost[2]) }}</td>
                  <td>{{ number(current.candidate_cost[2]) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
        <details v-if="current.previous_plans">
          <summary>比较前的安排</summary>
          <pre v-for="(plan, index) in current.previous_plans" :key="index">{{ order(plan) }}</pre>
        </details>
        <p v-if="current.raw_minutes !== undefined">
          {{ modes[current.mode] }}预计{{ current.raw_minutes }}分钟，排程预留{{
            current.reserved_minutes
          }}分钟。
        </p>
        <template v-if="current.ordinary_candidates">
          <h3>可行普通餐饮候选（按采用顺序排列）</h3>
          <p>片区至少15个普通正餐样本，优先端点，再比较样本数。</p>
          <div class="trace-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>片区</th>
                  <th>普通样本</th>
                  <th>位置</th>
                  <th>可用饭点</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(area, index) in current.ordinary_candidates" :key="index">
                  <th>{{ area.name }}</th>
                  <td>{{ area.ordinary_count }}</td>
                  <td>{{ sourceNames[area.source] || area.source }}</td>
                  <td>{{ area.start_time }}～{{ area.end_time }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <h3>可行南京鸭候选</h3>
          <p>片区至少1家鸭类正餐候选，先比较候选数，再比较端点等条件。</p>
          <div class="trace-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>片区</th>
                  <th>鸭类正餐候选</th>
                  <th>位置</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(area, index) in current.duck_candidates" :key="index">
                  <th>{{ area.name }}</th>
                  <td>{{ area.duck_count }}</td>
                  <td>{{ sourceNames[area.source] || area.source }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
        <div v-if="current.duck_slots" class="trace-table-scroll">
          <table>
            <thead>
              <tr>
                <th>餐次</th>
                <th>该日已选鸭餐</th>
                <th>正餐候选</th>
                <th>位置</th>
                <th>本轮选择</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(slot, index) in current.duck_slots"
                :key="index"
                :class="{ 'trace-chosen': slot.selected }"
              >
                <th>
                  {{ slot.date }}{{ slot.meal_kind === 'lunch' ? '午餐' : '晚餐'
                  }}<small>{{ slot.area_name }}</small>
                </th>
                <td>{{ slot.already_selected_on_date }}</td>
                <td>{{ slot.duck_count }}</td>
                <td>{{ sourceNames[slot.source] || slot.source }}</td>
                <td>{{ slot.selected ? '✓' : '' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-for="(plan, planIndex) in current.plans || []" :key="planIndex">
          <p>参考门票合计{{ plan.total_ticket_cost }}元</p>
          <template v-for="day in plan.days" :key="day.date">
            <h3>{{ day.date }}</h3>
            <table>
              <thead>
                <tr>
                  <th>地点／安排</th>
                  <th>开始</th>
                  <th>结束</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, index) in day.items" :key="index">
                  <th>{{ item.name }}</th>
                  <td>{{ item.start_time }}</td>
                  <td>{{ item.end_time }}</td>
                </tr>
              </tbody>
            </table>
            <p v-for="(meal, index) in day.meals" :key="index">
              {{ meal.meal_kind === 'lunch' ? '午餐' : '晚餐' }} {{ meal.start_time }}～{{
                meal.end_time
              }}：{{ meal.area_name || '自由用餐'
              }}{{ meal.area_kind === 'duck' ? '（南京鸭）' : '' }}
            </p>
          </template>
        </div>
        <details class="trace-raw">
          <summary>代码位置与原始记录</summary>
          <p>{{ current.function }}</p>
          <pre>{{ JSON.stringify(current, null, 2) }}</pre>
        </details>
      </article>
    </div>
  </section>
</template>

<style scoped>
.trace-window {
  --trace-glass-rgb: 64, 70, 67;
  --trace-heading: #245349;
  --trace-text: #414a42;
  --trace-muted: #71776b;
  position: fixed;
  right: 24px;
  top: 76px;
  z-index: 1600;
  width: min(1180px, calc(100vw - 48px));
  height: min(78vh, 850px);
  min-width: 350px;
  min-height: 300px;
  max-width: calc(100vw - 24px);
  max-height: calc(100vh - 100px);
  display: flex;
  flex-direction: column;
  resize: both;
  overflow: hidden;
  color: var(--bone);
  background: rgba(var(--trace-glass-rgb), 0.88);
  backdrop-filter: blur(30px) saturate(1.1) brightness(0.8);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  box-shadow: var(--shadow-float);
  font-size: 14px;
}
.trace-header,
.trace-tools {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--ink-500);
}
.trace-header {
  justify-content: space-between;
}
.trace-header strong {
  font-size: 18px;
  margin-right: 14px;
}
.trace-header span,
small,
.trace-hint {
  color: var(--bone-2);
}
button,
select {
  cursor: pointer;
  border: 1px solid var(--ink-500);
  border-radius: 5px;
  background: var(--ink-650);
  color: var(--bone);
  padding: 6px 9px;
  font: inherit;
}
button:disabled {
  opacity: 0.45;
  cursor: default;
}
button[aria-pressed='true'],
button[aria-current='step'] {
  border-color: var(--layer-accent);
  background: var(--teal-wash);
}
.trace-file {
  display: none;
}
.trace-message,
.trace-empty {
  padding: 12px 16px;
  margin: 0;
}
.trace-empty {
  flex: 1;
  color: var(--trace-text);
  background: #f4efe2;
}
.trace-body {
  display: grid;
  grid-template-columns: 230px minmax(0, 1fr);
  min-height: 0;
  flex: 1;
}
.trace-events,
.trace-detail {
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}
.trace-events {
  padding: 8px;
  border-right: 1px solid var(--ink-500);
}
.trace-events button {
  display: block;
  width: 100%;
  text-align: left;
  margin-bottom: 6px;
  line-height: 1.5;
}
.trace-events small,
.trace-events span,
th small,
td small {
  display: block;
}
.trace-detail {
  --scrollbar-thumb: #70786d;
  padding: 24px;
  color: var(--trace-text);
  text-shadow: none;
  background-color: #f4efe2;
  background-image:
    radial-gradient(ellipse at 12% 8%, rgba(255, 255, 255, 0.55), transparent 65%),
    repeating-linear-gradient(112deg, rgba(107, 89, 55, 0.025) 0 1px, transparent 1px 7px),
    repeating-linear-gradient(23deg, rgba(107, 89, 55, 0.018) 0 1px, transparent 1px 11px);
  box-shadow: inset 0 1px 6px rgba(88, 68, 42, 0.07);
}
.trace-detail small,
.trace-detail .trace-hint {
  color: var(--trace-muted);
}
.trace-detail h2,
.trace-detail h3,
.trace-detail summary {
  color: var(--trace-heading);
}
.trace-detail p {
  background-image: none;
  text-decoration: none;
}
:global(body.duck-mode .trace-window) {
  --trace-glass-rgb: 73, 69, 64;
  --trace-heading: #874322;
  --trace-text: #4f4035;
  --trace-muted: #7c6d60;
}
h2 {
  font-size: 19px;
  margin: 0 0 12px;
}
h3 {
  font-size: 16px;
  margin: 18px 0 8px;
}
p {
  line-height: 1.7;
}
.trace-table-scroll {
  max-width: 100%;
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
th,
td {
  border: 0;
  padding: 9px 7px;
  text-align: left;
  vertical-align: top;
}
th {
  font-weight: 500;
}
.trace-scores {
  min-width: 900px;
  font-variant-numeric: tabular-nums;
}
.trace-scores th:first-child {
  min-width: 170px;
}
.trace-scores td {
  white-space: nowrap;
}
.trace-chosen {
  background: rgba(50, 135, 121, 0.12);
  color: var(--trace-heading);
}
.trace-detail thead {
  color: var(--trace-heading);
  background: rgba(107, 89, 55, 0.08);
}
.trace-detail tbody tr:nth-child(even):not(.trace-chosen) {
  background: rgba(107, 89, 55, 0.035);
}
details {
  margin-top: 16px;
}
summary {
  cursor: pointer;
}
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 12px;
  line-height: 1.6;
}
@media (max-width: 700px) {
  .trace-window {
    right: 12px;
    width: calc(100vw - 24px);
    min-width: 0;
  }
  .trace-body {
    grid-template-columns: 140px minmax(0, 1fr);
  }
  .trace-events {
    padding: 4px;
  }
  .trace-detail {
    padding: 10px;
  }
}
</style>
