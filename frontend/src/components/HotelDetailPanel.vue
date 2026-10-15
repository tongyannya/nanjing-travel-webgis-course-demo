<script setup>
import { computed } from 'vue'

import { HOTEL_PRICE_BAND_LABELS } from '../search/hotelResults'

const props = defineProps({
  hotel: { type: Object, default: null },
  query: { type: Object, default: null },
})

function display(value) {
  return value === null || value === undefined || value === '' ? '暂无信息' : value
}

const ratingText = computed(() =>
  props.hotel?.rating == null ? '暂无信息' : `${props.hotel.rating} 分`,
)
const priceText = computed(() => HOTEL_PRICE_BAND_LABELS[props.hotel?.price_band] || '暂无信息')
const sourceText = computed(() => {
  if (!props.hotel) return '暂无信息'
  return props.hotel.source === 'amap' ? '高德地图' : display(props.hotel.source)
})
const fetchedAtText = computed(() => {
  const value = props.hotel?.fetched_at
  if (!value) return '暂无信息'
  return String(value).replace('T', ' ')
})
</script>

<template>
  <section v-if="hotel" class="hotel-detail" data-testid="hotel-detail-panel">
    <div class="attraction-detail__identity">
      <span>酒店 · 参考信息</span>
      <h3>{{ hotel.name }}</h3>
      <p>{{ hotel.address || '暂无地址信息' }}</p>
    </div>

    <h4>位置与参考</h4>
    <dl class="detail-grid">
      <div>
        <dt>评分</dt>
        <dd>{{ ratingText }}</dd>
      </div>
      <div>
        <dt>参考价位档</dt>
        <dd>{{ priceText }}</dd>
      </div>
      <div>
        <dt>附近交通</dt>
        <dd>{{ display(hotel.nearest_metro) }}</dd>
      </div>
    </dl>

    <h4>数据来源</h4>
    <dl class="detail-grid">
      <div>
        <dt>来源</dt>
        <dd>{{ sourceText }}</dd>
      </div>
      <div>
        <dt>获取时间</dt>
        <dd>{{ fetchedAtText }}</dd>
      </div>
      <div v-if="query">
        <dt>查询范围</dt>
        <dd>以{{ query.centerLabel }}为中心 {{ query.radiusMeters }} 米</dd>
      </div>
    </dl>
  </section>
  <section v-else class="dock-empty-state" data-testid="hotel-detail-empty">
    <b>尚未选择酒店</b>
    <p>开启酒店图层后点击地图上的酒店标记，详情会显示在这里。</p>
  </section>
</template>
