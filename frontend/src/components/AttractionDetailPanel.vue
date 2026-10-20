<script setup>
import { computed, ref, watch } from 'vue'

import { TAG_OPTIONS } from '../planning/tripForm'

const props = defineProps({
  attraction: { type: Object, default: null },
  preference: { type: String, default: 'none' },
})
const emit = defineEmits(['find-hotels', 'find-restaurants', 'set-preference'])

const tagLabels = Object.fromEntries(TAG_OPTIONS)

const CATEGORY_LABELS = {
  museum_venue: '博物馆场馆',
  historic_site: '历史遗迹',
  religious_architecture: '宗教建筑',
  garden_park: '园林公园',
  natural_scenery: '自然风光',
  urban_district: '城市街区',
  modern_landmark: '现代地标',
  themed_experience: '主题体验',
}

const categoryLabel = computed(() => CATEGORY_LABELS[props.attraction?.category] || '景点')
const openingText = computed(() => {
  const periods = props.attraction?.opening?.regular || []
  if (!periods.length) return '暂无信息'
  return periods.map((period) => `${period.open}—${period.close}`).join('；')
})
const reservationText = computed(() => {
  const required = props.attraction?.reservation?.required
  if (required === 'yes') return '通常需要预约'
  if (required === 'conditional') return '部分情况需要预约'
  if (required === 'no') return '通常无需预约'
  return '暂无信息'
})
const source = computed(() => props.attraction?.sources?.[0] || null)

const image = computed(() => props.attraction?.image || null)
const imageAlt = computed(() => (image.value ? `${props.attraction.name}的照片` : ''))
// 图片加载失败只影响当前景点：切换景点时立即重置，失败状态不得沿用。
const imageFailed = ref(false)
watch(
  () => props.attraction?.id,
  () => {
    imageFailed.value = false
  },
)

// 票价未核实时用友好文案，避免整块“暂无信息”。
function ticket(value) {
  return value === null || value === undefined || value === '' ? '以现场公示为准' : `￥${value}`
}

function display(value) {
  return value === null || value === undefined || value === '' ? '暂无信息' : value
}
</script>

<template>
  <section v-if="attraction" class="attraction-detail" data-testid="attraction-detail-panel">
    <figure class="attraction-detail__photo" data-testid="attraction-detail-photo">
      <img
        v-if="image && !imageFailed"
        :src="image.path"
        :alt="imageAlt"
        loading="lazy"
        @error="imageFailed = true"
      />
      <div v-else-if="image && imageFailed" class="attraction-detail__photo-fallback">
        <span>照片暂时无法加载</span>
        <small>图片信息仍可在下方来源中查看</small>
      </div>
      <div v-else class="attraction-detail__photo-fallback">
        <span>暂无照片</span>
      </div>
      <a
        v-if="image"
        class="attraction-detail__photo-link"
        :href="image.source_url"
        target="_blank"
        rel="noopener noreferrer"
        >来源页面</a
      >
    </figure>
    <p v-if="image" class="attraction-detail__photo-source">
      图片来源：{{ image.source_organization }}
    </p>
    <div class="attraction-detail__identity">
      <span>{{ categoryLabel }}</span>
      <h3>{{ attraction.name }}</h3>
      <p>{{ attraction.address || '暂无地址信息' }}</p>
    </div>
    <div class="attraction-detail__tags">
      <span v-if="attraction.quality_grade">{{ attraction.quality_grade }}</span>
      <span v-for="tag in attraction.tags || []" :key="tag">{{ tagLabels[tag] || tag }}</span>
    </div>
    <div class="attraction-detail__actions">
      <button
        type="button"
        class="attraction-detail__must"
        :class="{ active: preference === 'must' }"
        @click="emit('set-preference', 'must')"
      >
        {{ preference === 'must' ? '已设为必去' : '必去' }}
      </button>
      <button
        type="button"
        class="attraction-detail__exclude"
        :class="{ active: preference === 'excluded' }"
        @click="emit('set-preference', 'excluded')"
      >
        {{ preference === 'excluded' ? '已设为不想去' : '不想去' }}
      </button>
    </div>

    <p
      v-if="preference === 'must' || preference === 'excluded'"
      class="form-hint"
      data-testid="attraction-preference-next-generation"
    >
      会在下一次生成方案时生效。
    </p>

    <h4>开放与预约</h4>
    <dl class="detail-grid">
      <div>
        <dt>常规开放</dt>
        <dd>{{ openingText }}</dd>
      </div>
      <div>
        <dt>停止入场</dt>
        <dd>{{ display(attraction.opening?.last_entry) }}</dd>
      </div>
      <div>
        <dt>闭馆规则</dt>
        <dd>{{ display(attraction.opening?.closed_rules) }}</dd>
      </div>
      <div>
        <dt>预约</dt>
        <dd>{{ reservationText }}</dd>
      </div>
      <div>
        <dt>官方渠道</dt>
        <dd>{{ display(attraction.reservation?.channel_name) }}</dd>
      </div>
    </dl>

    <h4>参考票价与游玩时间</h4>
    <dl class="detail-grid detail-grid--tickets">
      <div>
        <dt>成人</dt>
        <dd>{{ ticket(attraction.ticket?.adult) }}</dd>
      </div>
      <div>
        <dt>学生</dt>
        <dd>{{ ticket(attraction.ticket?.student) }}</dd>
      </div>
      <div>
        <dt>儿童</dt>
        <dd>{{ ticket(attraction.ticket?.child) }}</dd>
      </div>
      <div>
        <dt>建议游玩</dt>
        <dd>{{ display(attraction.duration?.suggested_minutes) }} 分钟</dd>
      </div>
    </dl>

    <h4>介绍</h4>
    <p class="attraction-detail__description">
      {{ attraction.description_detail || attraction.description_short || '暂无信息' }}
    </p>

    <div class="attraction-detail__coming">
      <button
        type="button"
        data-testid="find-nearby-restaurants"
        :disabled="!attraction?.location"
        @click="emit('find-restaurants')"
      >
        查看附近餐饮
      </button>
      <button
        type="button"
        data-testid="find-nearby-hotels"
        :disabled="!attraction?.location"
        @click="emit('find-hotels')"
      >
        查看附近酒店
      </button>
    </div>
    <p class="attraction-detail__source">
      来源：{{ source?.title || '暂无信息' }}<br />最后核实：{{ source?.verified_at || '暂无信息' }}
    </p>
  </section>
  <section v-else class="dock-empty-state" data-testid="attraction-detail-empty">
    <b>尚未选择景点</b>
    <p>请在地图上点击项目景点，详情会显示在这里。</p>
  </section>
</template>
