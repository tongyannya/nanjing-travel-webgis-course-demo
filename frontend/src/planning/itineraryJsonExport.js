import { planTypeLabel, sanitizeFileName } from './itineraryExport'
import { parseItineraryFile, PLAN_FILE_FORMAT } from './itineraryFileImport'

// Preserve the submitted request and loaded response, rather than rebuilding
// conditions from a form that may have been edited after planning.
export function buildItineraryJson({
  response,
  request = null,
  requestSource = 'unavailable',
  activePlanType,
  activeDayIndex = 0,
  exportedAt = new Date(),
  name = '',
}) {
  const plan = response?.plans?.find((item) => item.plan_type === activePlanType)
  if (!plan) throw new Error('请先生成行程方案，或打开一份已保存方案，再导出 JSON。')
  if (!request) throw new Error('生成条件缺失，无法导出可恢复的方案文件。')
  const document = {
    format: PLAN_FILE_FORMAT,
    version: 1,
    exported_at: exportedAt.toISOString(),
    name: name || `南京行程 ${plan.days?.[0]?.date || ''}`,
    selection: {
      plan_type: activePlanType,
      day_index: activeDayIndex,
      date: plan.days?.[activeDayIndex]?.date ?? null,
    },
    request_source: request ? requestSource : 'unavailable',
    request,
    response,
  }
  const date = plan.days?.[0]?.date || '未定日期'
  const text = `${JSON.stringify(document, null, 2)}\n`
  // A portable file must pass the same checks used by the receiving device.
  parseItineraryFile(text)
  return {
    fileName: `${sanitizeFileName(`南京行程_${planTypeLabel(activePlanType)}_${date}`)}.json`,
    text,
  }
}
