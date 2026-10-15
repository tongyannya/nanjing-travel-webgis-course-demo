<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import HelpHint from './HelpHint.vue'

const props = defineProps({
  activePanel: { type: String, required: true },
  attractionTitle: { type: String, default: '' },
  hotelTitle: { type: String, default: '' },
  diningAreaTitle: { type: String, default: '' },
  diningAreaKind: { type: String, default: 'route' },
  diningDensityTitle: { type: String, default: '' },
  diningShopTitle: { type: String, default: '' },
  diningShopCollection: { type: String, default: 'nanjing_cuisine' },
  metroTitle: { type: String, default: '' },
  open: { type: Boolean, required: true },
  planState: { type: String, required: true },
  returnPlanPanel: { type: String, default: 'plans' },
})

const emit = defineEmits(['back', 'close', 'select-panel'])
const body = ref(null)
const panelScrollPositions = new Map()
const detailTitles = computed(() => ({
  attraction: props.attractionTitle,
  hotel: props.hotelTitle,
  diningShop: props.diningShopTitle,
  metro: props.metroTitle,
}))
const scrollKey = computed(() => [props.activePanel, detailTitles.value[props.activePanel]])
let scrollChange = 0
watch(scrollKey, async ([panel, title], [previousPanel, previousTitle]) => {
  if (panel === previousPanel && title === previousTitle) return
  panelScrollPositions.set(previousPanel, body.value?.scrollTop || 0)
  const change = ++scrollChange
  await nextTick()
  if (change !== scrollChange || !body.value) return
  body.value.scrollTop = title !== undefined ? 0 : panelScrollPositions.get(panel) || 0
})
const planningHelpVisible = computed(() => ['plans', 'day'].includes(props.activePanel))
const panelHelp = computed(() => {
  const help = {
    attraction: '查看景点介绍、开放时间与票价。设为“必去”或“不想去”后，生成行程时会使用这些选择。',
    hotel: '查看酒店位置与资料。安排住宿时可以把这里选为住处，再确认首日起点和末日终点。',
    diningHex: '这里列出选中网格内的店铺。可切换普通餐饮与南京鸭，点击店铺查看详情和地图位置。',
    diningArea: '这是行程中预留的用餐区域。点击餐馆查看资料，按当天路线在这一区域自行选择用餐。',
    planner:
      '填写日期、同行人数、游玩节奏和景点偏好，再生成行程。住处、首日起点与末日终点在住宿安排中设置。',
    plans:
      '查看按当前条件生成的路线。可切换方案和日期；点击景点或交通段可在地图中定位。未生成的方案会在首次选择时生成。',
    day: '按时间顺序查看当天的景点、用餐和交通安排。点击地点可在地图中定位；点击交通段可展开具体路线，再查看上下车站与分段。',
    duckCulture:
      '从四类导航了解南京鸭文化。开启鸭文化主题后，可在左侧分别打开南京鸭分布和门店图层；点击鸭子向导听讲解，也可拖动它的位置。',
    saved:
      '打开本机保存的方案，或导入从其他设备导出的方案文件。可改名或删除；保存与导出中还能预览并下载行程图片，或以文件形式导出完整方案。',
    metro:
      '不同颜色代表不同线路，下面的标签显示本站所属线路。安排住宿时，也可以选择地铁站作为住处、首日起点或末日终点。',
  }
  if (props.activePanel === 'diningArea' && props.diningAreaKind === 'overview') {
    return '网格颜色表示餐饮数量。点击网格查看这一格的店铺，再点击店铺查看详情与地图位置。'
  }
  return help[props.activePanel] || ''
})

const panelMeta = computed(() => {
  const panels = {
    overview: { eyebrow: '当前视图', title: '南京主要旅游区域' },
    attraction: { eyebrow: '景点详情', title: props.attractionTitle || '选择一个景点' },
    hotel: { eyebrow: '酒店详情', title: props.hotelTitle || '选择一个酒店' },
    hotelArea: { eyebrow: '酒店查询结果', title: '范围内酒店' },
    diningShop: {
      eyebrow: props.diningShopCollection === 'duck' ? '南京鸭详情' : '南京特色菜详情',
      title: props.diningShopTitle || '餐馆详情',
    },
    diningHex: { eyebrow: '餐饮分布', title: '本格餐饮' },
    diningArea:
      props.diningAreaKind === 'overview'
        ? {
            eyebrow: '餐饮分布',
            title: props.diningDensityTitle || '餐饮分布',
          }
        : { eyebrow: '建议用餐区域', title: props.diningAreaTitle || '餐饮便利区' },
    planner: { eyebrow: '行程条件', title: '完整规划表单' },
    plans: { eyebrow: '规划结果', title: '当前方案' },
    day: { eyebrow: '当天安排', title: '单日计划' },
    duckCulture: { eyebrow: '南京文化主题层', title: '南京鸭事' },
    saved: { eyebrow: '本地方案', title: '已保存方案' },
    metro: {
      eyebrow: '主要地铁站点',
      title: props.metroTitle || '选择一个主要站点',
    },
  }
  return panels[props.activePanel] || panels.overview
})
</script>

<template>
  <aside
    v-show="open"
    class="info-dock"
    data-testid="info-dock"
    :data-active-panel="activePanel"
    aria-label="旅行规划信息面板"
  >
    <header class="info-dock__header">
      <button
        v-if="activePanel !== 'overview'"
        type="button"
        class="info-dock__back"
        aria-label="返回上一级面板"
        data-testid="dock-back"
        @click="emit('back')"
      >
        ‹
      </button>
      <div>
        <small>{{ panelMeta.eyebrow }}</small>
        <div class="info-dock__title-row">
          <h2>{{ panelMeta.title }}</h2>
          <HelpHint
            v-if="panelHelp && open"
            :label="planningHelpVisible ? '规划面板' : panelMeta.title"
            :text="panelHelp"
            :test-id="
              planningHelpVisible ? 'planning-panel-help-trigger' : `dock-help-${activePanel}`
            "
          />
        </div>
      </div>
      <button
        type="button"
        class="info-dock__close"
        aria-label="关闭信息面板"
        @click="emit('close')"
      >
        ✕
      </button>
    </header>

    <div ref="body" class="info-dock__body">
      <section v-show="activePanel === 'overview'" class="info-dock__panel">
        <slot name="overview"></slot>
      </section>
      <section v-show="activePanel === 'attraction'" class="info-dock__panel">
        <slot name="attraction"></slot>
      </section>
      <section v-show="activePanel === 'hotel'" class="info-dock__panel">
        <slot name="hotel"></slot>
      </section>
      <section v-show="activePanel === 'hotelArea'" class="info-dock__panel">
        <slot name="hotelArea"></slot>
      </section>
      <section v-show="activePanel === 'diningArea'" class="info-dock__panel">
        <slot name="diningArea"></slot>
      </section>
      <section v-show="activePanel === 'diningShop'" class="info-dock__panel">
        <slot name="diningShop"></slot>
      </section>
      <section v-show="activePanel === 'diningHex'" class="info-dock__panel">
        <slot name="diningHex"></slot>
      </section>
      <section v-show="activePanel === 'metro'" class="info-dock__panel">
        <slot name="metro"></slot>
      </section>
      <section v-show="activePanel === 'planner'" class="info-dock__panel">
        <slot name="planner"></slot>
      </section>
      <section v-show="['plans', 'day'].includes(activePanel)" class="info-dock__panel">
        <slot name="results"></slot>
      </section>
      <section v-show="activePanel === 'duckCulture'" class="info-dock__panel">
        <slot name="duckCulture"></slot>
      </section>
      <section v-show="activePanel === 'saved'" class="info-dock__panel">
        <slot name="saved"></slot>
      </section>
    </div>

    <button
      v-if="planState === 'success' && !['plans', 'day'].includes(activePanel)"
      type="button"
      class="info-dock__return-plan"
      data-testid="dock-return-to-plan"
      aria-label="返回当前方案"
      data-hover-text="返回当前方案"
      @click="emit('select-panel', returnPlanPanel)"
    >
      当前方案
      <span aria-hidden="true">→</span>
    </button>

    <footer class="info-dock__footer">
      <button
        type="button"
        :class="{
          active:
            activePanel === 'overview' ||
            (activePanel === 'diningArea' && diningAreaKind === 'overview'),
        }"
        data-testid="dock-overview-tab"
        @click="emit('select-panel', 'overview')"
      >
        总览
      </button>
      <button
        type="button"
        :class="{ active: activePanel === 'planner' }"
        data-testid="dock-planner-tab"
        @click="emit('select-panel', 'planner')"
      >
        完整表单
      </button>
      <button
        type="button"
        :class="{
          active:
            ['plans', 'day'].includes(activePanel) ||
            (activePanel === 'diningArea' && diningAreaKind === 'route'),
        }"
        data-testid="dock-results-tab"
        @click="emit('select-panel', 'plans')"
      >
        方案<span v-if="planState === 'loading'"> · 生成中</span>
      </button>
      <button
        type="button"
        :class="{ active: activePanel === 'saved' }"
        data-testid="dock-saved-tab"
        @click="emit('select-panel', 'saved')"
      >
        已保存
      </button>
    </footer>
  </aside>
</template>
