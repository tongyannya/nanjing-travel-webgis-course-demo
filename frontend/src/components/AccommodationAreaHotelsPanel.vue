<script setup>
import { onMounted, ref, watch } from 'vue'
import { HOTEL_PRICE_BAND_LABELS } from '../search/hotelResults'

const props = defineProps({
  active: { type: Boolean, default: true },
  area: { type: Object, default: null },
  query: { type: Object, default: null },
  hotels: { type: Array, default: () => [] },
  selectedHotel: { type: Object, default: null },
  state: { type: String, default: 'idle' },
  message: { type: String, default: '' },
})
const emit = defineEmits(['select-hotel', 'retry'])
const panel = ref(null)

function availableText(value) {
  return value === null || value === undefined || value === '' ? '暂无信息' : value
}
function scrollToSelectedCard() {
  if (!props.active || !panel.value?.getClientRects().length) return
  const card = [...panel.value.querySelectorAll('[data-area-hotel]')].find(
    (element) => element.dataset.areaHotel === props.selectedHotel?.poi_id,
  )
  const body = panel.value.closest('.info-dock__body')
  if (card && body) {
    body.scrollTop += card.getBoundingClientRect().top - body.getBoundingClientRect().top - 12
  }
}
watch(
  [() => props.selectedHotel?.poi_id, () => props.hotels, () => props.active],
  scrollToSelectedCard,
  {
    flush: 'post',
  },
)
onMounted(scrollToSelectedCard)
</script>

<template>
  <section
    v-if="area || query"
    ref="panel"
    class="dining-area-panel"
    data-testid="accommodation-area-hotels"
  >
    <header class="dining-area-panel__summary">
      <div>
        <small>住宿参考范围</small>
        <h3>{{ area?.name || query?.centerLabel || '当前查询范围' }}</h3>
      </div>
    </header>
    <div class="dining-area-panel__boundary">
      <p v-if="area">邻近：{{ area.nearby }}</p>
      <p v-if="area">适合：{{ area.suits }}</p>
      <small>参考范围半径 1000 米；酒店资料来自高德，查询一页最多 20 家。</small>
    </div>
    <section class="dining-area-panel__restaurants" aria-label="范围内酒店">
      <div class="dining-area-panel__section-heading">
        <h4>范围内酒店</h4>
        <button
          v-if="state === 'error'"
          type="button"
          data-testid="area-hotels-retry"
          @click="emit('retry')"
        >
          {{ area ? '重新查询这个片区' : '重新查询当前范围' }}
        </button>
      </div>
      <p
        class="dining-area-panel__status"
        :class="`dining-area-panel__status--${state}`"
        role="status"
      >
        {{ message }}
      </p>
      <ul v-if="state === 'success' && hotels.length" class="restaurant-list">
        <li v-for="hotel in hotels" :key="hotel.poi_id">
          <button
            type="button"
            :class="{ active: selectedHotel?.poi_id === hotel.poi_id }"
            :data-area-hotel="hotel.poi_id"
            @click="emit('select-hotel', hotel)"
          >
            <b>{{ hotel.name }}</b>
            <span
              >{{ hotel.rating == null ? '评分暂无' : `评分 ${hotel.rating}` }} ·
              {{ HOTEL_PRICE_BAND_LABELS[hotel.price_band] || '价位暂无信息' }}</span
            >
            <small>{{ hotel.address || '地址暂无' }}</small>
          </button>
          <div
            v-if="selectedHotel?.poi_id === hotel.poi_id"
            class="restaurant-detail"
            data-testid="area-hotel-detail"
          >
            <small>酒店详情</small>
            <h4>{{ hotel.name }}</h4>
            <dl>
              <div v-if="hotel.distance_m != null">
                <dt>距离</dt>
                <dd>{{ hotel.distance_m }} 米</dd>
              </div>
              <div>
                <dt>评分</dt>
                <dd>{{ availableText(hotel.rating) }}</dd>
              </div>
              <div>
                <dt>参考价位档</dt>
                <dd>{{ HOTEL_PRICE_BAND_LABELS[hotel.price_band] || '暂无信息' }}</dd>
              </div>
              <div>
                <dt>地址</dt>
                <dd>{{ availableText(hotel.address) }}</dd>
              </div>
              <div v-if="hotel.nearest_metro">
                <dt>附近交通</dt>
                <dd>{{ hotel.nearest_metro }}</dd>
              </div>
              <div v-if="hotel.telephone">
                <dt>电话</dt>
                <dd>{{ hotel.telephone }}</dd>
              </div>
            </dl>
          </div>
        </li>
      </ul>
    </section>
  </section>
</template>

<style scoped src="../styles/area-results.css"></style>
