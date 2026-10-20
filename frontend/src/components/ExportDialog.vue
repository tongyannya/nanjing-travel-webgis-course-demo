<script setup>
import HelpHint from './HelpHint.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import ItineraryExportSheet from './ItineraryExportSheet.vue'
import { useItineraryExport } from '../composables/useItineraryExport'
import {
  buildDayItinerarySheet,
  buildDayOptions,
  buildFullItinerarySheet,
} from '../planning/itineraryExport'
import { SAVED_PLAN_NAME_MAX_LENGTH } from '../planning/savedPlansStorage'

const props = defineProps({
  hasPlan: { type: Boolean, default: false },
  open: { type: Boolean, required: true },
  defaultSaveName: { type: String, default: '南京行程方案' },
  saveMessage: { type: String, default: '' },
  planResponse: { type: Object, default: null },
  tripRequest: { type: Object, default: null },
  requestSource: { type: String, default: 'unavailable' },
  activePlanType: { type: String, default: 'relaxed' },
  activeDayIndex: { type: Number, default: 0 },
  weatherData: { type: Object, default: null },
  attractions: { type: Array, default: () => [] },
})
const emit = defineEmits(['close', 'save'])
const closeButton = ref(null)
const nameInput = ref(null)
const activeTab = ref('save')
const planName = ref('南京行程方案')
const submitted = ref(false)
const includeNotices = ref(true)

const sheetHost = ref(null)
const exportJob = ref(null)
const daySelectedIndex = ref(0)
const {
  isGenerating,
  resetExport,
  exportSheet,
  exportJson,
  preview,
  downloadPreview,
  state: exportState,
} = useItineraryExport()
const hasJsonPlan = computed(
  () =>
    props.hasPlan &&
    props.planResponse?.plans?.some((plan) => plan.plan_type === props.activePlanType),
)

const fullSheet = computed(() =>
  props.hasPlan
    ? buildFullItinerarySheet(props.planResponse, props.activePlanType, {
        weatherData: props.weatherData,
        attractions: props.attractions,
      })
    : null,
)
const dayOptions = computed(() =>
  props.hasPlan ? buildDayOptions(props.planResponse, props.activePlanType) : [],
)
const daySheet = computed(() =>
  props.hasPlan
    ? buildDayItinerarySheet(props.planResponse, props.activePlanType, daySelectedIndex.value, {
        weatherData: props.weatherData,
        attractions: props.attractions,
      })
    : null,
)

function defaultDayIndex() {
  return dayOptions.value.some((option) => option.index === props.activeDayIndex)
    ? props.activeDayIndex
    : 0
}

// Status is kept per export kind so switching tabs never mixes feedback.
function statusFor(kind) {
  return exportState.value.kind === kind ? exportState.value.status : 'idle'
}

function messageFor(kind) {
  return exportState.value.kind === kind ? exportState.value : null
}

function handleKeydown(event) {
  if (event.key === 'Escape' && props.open) emit('close')
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      activeTab.value = 'save'
      planName.value = props.defaultSaveName
      submitted.value = false
      includeNotices.value = true
      daySelectedIndex.value = defaultDayIndex()
      nextTick(() => {
        if (props.hasPlan) nameInput.value?.select()
        else closeButton.value?.focus()
      })
    } else {
      exportJob.value = null
      resetExport()
    }
  },
  { immediate: true },
)

function handlePrimaryAction() {
  if (activeTab.value !== 'save' || !props.hasPlan) return
  submitted.value = true
  emit('save', planName.value, { includeNotices: includeNotices.value })
}

function selectExportDay(index) {
  if (isGenerating.value) return
  resetExport()
  daySelectedIndex.value = index
}

async function startExport(kind, previewOnly = false) {
  if (isGenerating.value) return
  const result = kind === 'full' ? fullSheet.value : daySheet.value
  if (!result?.ok) return
  // The snapshot is fixed here: later plan/date changes cannot touch this job.
  exportJob.value = { kind, sheet: result.sheet }
  await exportSheet({
    kind,
    fileName: result.fileName,
    previewOnly,
    getElement: () => sheetHost.value?.querySelector('[data-testid="itinerary-sheet"]'),
  })
}

function startJsonExport() {
  if (!hasJsonPlan.value) return
  exportJson({
    response: props.planResponse,
    request: props.tripRequest,
    requestSource: props.requestSource,
    activePlanType: props.activePlanType,
    activeDayIndex: props.activeDayIndex,
  })
}

onMounted(() => document.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="dialog-backdrop"
      data-testid="export-dialog"
      @click.self="emit('close')"
    >
      <section class="export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title">
        <header>
          <h2 id="export-title" class="context-help-heading">
            保存与导出
            <HelpHint
              label="保存与导出"
              test-id="export-help"
              text="保存到这台电脑后可重新打开行程。以文件形式导出完整方案，可在其他设备导入恢复；整段长图和逐日行程单支持预览后下载，可分享或打印。"
            />
          </h2>
          <button ref="closeButton" type="button" aria-label="关闭弹窗" @click="emit('close')">
            ✕
          </button>
        </header>
        <div class="export-dialog__body">
          <div class="export-dialog__tabs" role="tablist" aria-label="导出方式">
            <button
              v-for="tab in [
                ['save', '保存到这台电脑'],
                ['long', '整段长图'],
                ['day', '逐日行程单'],
                ['json', '以文件形式导出'],
              ]"
              :key="tab[0]"
              type="button"
              role="tab"
              :class="{ active: activeTab === tab[0] }"
              :aria-selected="activeTab === tab[0]"
              :disabled="isGenerating"
              @click="activeTab = tab[0]"
            >
              {{ tab[1] }}
            </button>
          </div>

          <div v-if="activeTab === 'save'" class="export-dialog__panel">
            <label class="export-dialog__field">
              <span>方案名称</span>
              <input
                ref="nameInput"
                v-model="planName"
                :maxlength="SAVED_PLAN_NAME_MAX_LENGTH"
                :disabled="!hasPlan"
                data-testid="saved-plan-name"
                @keydown.enter.prevent="handlePrimaryAction"
              />
            </label>
            <p
              v-if="submitted && saveMessage"
              class="export-dialog__feedback"
              data-testid="save-feedback"
              role="alert"
            >
              {{ saveMessage }}
            </p>
            <fieldset class="export-dialog__contents">
              <legend>包含内容</legend>
              <label
                ><input type="checkbox" checked disabled />
                行程条件（住处、日期、人员、预算、交通倾向）</label
              >
              <label
                ><input type="checkbox" checked disabled /> 已生成方案、当前方案与日期选择</label
              >
              <label
                ><input
                  v-model="includeNotices"
                  type="checkbox"
                  data-testid="save-include-notices"
                />
                冲突提示与未安排原因</label
              >
            </fieldset>
            <div class="export-dialog__notice">
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M8 2.5 14.5 13.5H1.5L8 2.5Z"
                  stroke="currentColor"
                  stroke-width="1.3"
                  stroke-linejoin="round"
                />
                <path d="M8 7v3M8 11.6v.6" stroke="currentColor" stroke-width="1.5" />
              </svg>
              <span v-if="hasPlan"
                >方案只存在这台电脑的浏览器里。清除浏览数据、使用无痕窗口或更换电脑后，已保存的方案会丢失。</span
              >
              <span v-else>请先生成行程方案，再保存到这台电脑。</span>
            </div>
          </div>

          <div v-else-if="activeTab === 'long'" class="export-dialog__panel">
            <template v-if="fullSheet?.ok">
              <div class="export-dialog__export-summary" data-testid="long-export-summary">
                <b>{{ fullSheet.sheet.planLabel }} · {{ fullSheet.sheet.periodLabel }}</b>
                <span>{{ fullSheet.sheet.ticketLabel }}</span>
                <small>导出包含全部日期的行程长图，固定宽度 1080 像素。</small>
              </div>
              <div
                class="export-dialog__export-status"
                data-testid="long-export-status"
                :data-export-status="statusFor('full')"
              >
                <template v-if="statusFor('full') === 'generating'">
                  <span>正在生成图片，请稍候…</span>
                </template>
                <template v-else-if="statusFor('full') === 'success'">
                  <span data-testid="long-export-file-name"
                    >已生成
                    {{ messageFor('full')?.fileName }}；若浏览器未自动保存，请检查下载记录。</span
                  >
                </template>
                <template v-else-if="statusFor('full') === 'error'">
                  <span role="alert">{{ messageFor('full')?.error }}</span>
                  <button
                    type="button"
                    data-testid="long-export-retry"
                    :disabled="isGenerating"
                    @click="startExport('full')"
                  >
                    重试
                  </button>
                </template>
                <template v-else>
                  <span>可先预览实际PNG图片，再下载保存。</span>
                </template>
              </div>
              <button
                type="button"
                class="export-dialog__preview-button"
                data-testid="long-preview-button"
                :disabled="isGenerating"
                @click="startExport('full', true)"
              >
                预览图片
              </button>
              <button
                type="button"
                class="export-dialog__download"
                data-testid="long-export-button"
                :disabled="isGenerating"
                @click="startExport('full')"
              >
                {{
                  isGenerating && statusFor('full') === 'generating'
                    ? '正在生成…'
                    : '下载整段长图 PNG'
                }}
              </button>
            </template>
            <div v-else class="export-dialog__unavailable">
              <b>整段长图</b>
              <p>请先生成行程方案，或打开一份已保存方案，再导出图片行程单。</p>
              <span>当前没有可导出的方案</span>
            </div>
          </div>

          <div v-else-if="activeTab === 'day'" class="export-dialog__panel">
            <template v-if="dayOptions.length">
              <div
                class="export-dialog__day-options"
                role="group"
                aria-label="选择要导出的日期"
                data-testid="day-export-options"
              >
                <button
                  v-for="option in dayOptions"
                  :key="option.index"
                  type="button"
                  :class="{ active: daySelectedIndex === option.index }"
                  :aria-pressed="daySelectedIndex === option.index"
                  :disabled="isGenerating"
                  :data-day-option="option.index"
                  @click="selectExportDay(option.index)"
                >
                  {{ option.label }}<small>{{ option.date.slice(5) }}</small>
                </button>
              </div>
              <div
                v-if="daySheet?.ok"
                class="export-dialog__export-summary"
                data-testid="day-export-summary"
              >
                <b>{{ daySheet.sheet.planLabel }} · {{ daySheet.sheet.periodLabel }}</b>
                <span>{{ daySheet.sheet.ticketLabel }}</span>
                <small>每次选择一天并下载一张 PNG；方案级提醒会标注为“整份方案提醒”。</small>
              </div>
              <div
                v-else
                class="export-dialog__export-status"
                data-export-status="error"
                role="alert"
              >
                <span>{{ daySheet?.error || '这一天的行程数据不完整，无法导出。' }}</span>
              </div>
              <div
                class="export-dialog__export-status"
                data-testid="day-export-status"
                :data-export-status="statusFor('day')"
              >
                <template v-if="statusFor('day') === 'generating'">
                  <span>正在生成图片，请稍候…</span>
                </template>
                <template v-else-if="statusFor('day') === 'success'">
                  <span data-testid="day-export-file-name"
                    >已生成
                    {{ messageFor('day')?.fileName }}；若浏览器未自动保存，请检查下载记录。</span
                  >
                </template>
                <template v-else-if="statusFor('day') === 'error'">
                  <span role="alert">{{ messageFor('day')?.error }}</span>
                  <button
                    type="button"
                    data-testid="day-export-retry"
                    :disabled="isGenerating"
                    @click="startExport('day')"
                  >
                    重试
                  </button>
                </template>
                <template v-else>
                  <span>可先预览这一天的实际PNG图片，再下载保存。</span>
                </template>
              </div>
              <button
                type="button"
                class="export-dialog__preview-button"
                data-testid="day-preview-button"
                :disabled="isGenerating || !daySheet?.ok"
                @click="startExport('day', true)"
              >
                预览图片
              </button>
              <button
                type="button"
                class="export-dialog__download"
                data-testid="day-export-button"
                :disabled="isGenerating || !daySheet?.ok"
                @click="startExport('day')"
              >
                {{
                  isGenerating && statusFor('day') === 'generating'
                    ? '正在生成…'
                    : `下载第 ${daySelectedIndex + 1} 天行程单 PNG`
                }}
              </button>
            </template>
            <div v-else class="export-dialog__unavailable">
              <b>逐日行程单</b>
              <p>请先生成行程方案，或打开一份已保存方案，再导出图片行程单。</p>
              <span>当前没有可导出的方案</span>
            </div>
          </div>

          <div v-else class="export-dialog__panel" data-testid="json-export-panel">
            <template v-if="hasJsonPlan">
              <div class="export-dialog__export-summary">
                <b>以文件形式导出</b>
                <span>包含生成条件、全部已生成方案，以及当前查看的方案和日期。</span>
                <small>在其他设备打开“打开/导入方案”，导入此文件即可恢复行程，无需重新生成。</small>
              </div>
              <div
                class="export-dialog__export-status"
                data-testid="json-export-status"
                :data-export-status="statusFor('json')"
                role="status"
              >
                <span v-if="statusFor('json') === 'success'">
                  已生成 {{ messageFor('json')?.fileName }}；若浏览器未自动保存，请检查下载记录。
                </span>
                <span v-else-if="statusFor('json') === 'error'" role="alert">
                  {{ messageFor('json')?.error }}
                </span>
                <span v-else>无需先保存，点击即可下载当前结果；导出不会重新计算行程。</span>
              </div>
              <button
                type="button"
                class="export-dialog__download"
                data-testid="json-export-button"
                :disabled="isGenerating"
                @click="startJsonExport"
              >
                {{ statusFor('json') === 'error' ? '重试下载 JSON' : '下载行程 JSON' }}
              </button>
            </template>
            <div v-else class="export-dialog__unavailable">
              <b>以文件形式导出</b>
              <p>请先生成行程方案，或打开一份已保存方案，再导出 JSON。</p>
              <span>当前没有可导出的方案</span>
            </div>
          </div>
          <div
            v-if="
              preview &&
              ((activeTab === 'long' && preview.kind === 'full') ||
                (activeTab === 'day' && preview.kind === 'day'))
            "
            class="export-dialog__image-preview"
            data-testid="image-export-preview"
          >
            <img :src="preview.url" :alt="preview.fileName" />
            <button
              type="button"
              class="export-dialog__download"
              data-testid="preview-download"
              :disabled="isGenerating"
              @click="downloadPreview"
            >
              下载预览图片
            </button>
          </div>
        </div>
        <footer>
          <button type="button" class="export-dialog__cancel" @click="emit('close')">取消</button>
          <button
            v-if="activeTab === 'save'"
            type="button"
            class="export-dialog__primary"
            :disabled="!hasPlan"
            @click="handlePrimaryAction"
          >
            保存到这台电脑
          </button>
        </footer>
      </section>
    </div>

    <div
      v-if="open"
      ref="sheetHost"
      class="itinerary-export-stage"
      aria-hidden="true"
      data-testid="itinerary-export-stage"
    >
      <ItineraryExportSheet v-if="exportJob" :sheet="exportJob.sheet" />
    </div>
  </Teleport>
</template>
