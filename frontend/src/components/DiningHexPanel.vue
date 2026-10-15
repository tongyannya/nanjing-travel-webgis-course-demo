<script setup>
import { DUCK_TYPES } from '../map/diningSnapshotData'
import { duckTypeLabel } from '../planning/duckDiningPresentation'

defineProps({
  cell: { type: Object, default: null },
  activeTab: { type: String, default: 'ordinary' },
  duckTabVisible: { type: Boolean, default: false },
  shops: { type: Array, default: () => [] },
  selectedShopId: { type: String, default: '' },
})
const emit = defineEmits(['select-tab', 'select-shop'])
const modeLabels = { meal_candidate: '正餐候选', takeaway: '外带熟食', other_meal_time: '其他餐点' }
</script>

<template>
  <article
    v-if="cell"
    class="dining-hex-panel"
    data-testid="dining-hex-panel"
    :data-hex-id="cell.id"
    :data-active-tab="activeTab"
  >
    <nav class="dining-hex-tabs" aria-label="本格餐饮类型">
      <button
        type="button"
        :class="{ active: activeTab === 'ordinary' }"
        :aria-pressed="activeTab === 'ordinary'"
        data-hex-tab="ordinary"
        @click="emit('select-tab', 'ordinary')"
      >
        普通餐饮
      </button>
      <button
        v-if="duckTabVisible"
        type="button"
        :class="{ active: activeTab === 'duck' }"
        :aria-pressed="activeTab === 'duck'"
        data-hex-tab="duck"
        @click="emit('select-tab', 'duck')"
      >
        南京鸭
      </button>
    </nav>
    <div v-show="activeTab === 'ordinary'" data-hex-pane="ordinary">
      <slot name="ordinary"></slot>
    </div>
    <section
      v-show="activeTab === 'duck' && duckTabVisible"
      class="dining-hex-duck"
      data-hex-pane="duck"
    >
      <h3>本格南京鸭 · {{ cell.duck.shop_count }} 家</h3>
      <dl class="dining-hex-facts">
        <div v-for="(label, mode) in modeLabels" :key="mode">
          <dt>{{ label }}</dt>
          <dd>{{ cell.duck[`${mode}_count`] }} 家</dd>
        </div>
        <div v-for="type in DUCK_TYPES" :key="type">
          <dt>{{ duckTypeLabel(type) }}</dt>
          <dd>{{ cell.duck.type_counts[type] }} 家</dd>
        </div>
      </dl>
      <p>同一店可包含多种鸭菜标签。</p>
      <small>本格完整收录名单 · {{ shops.length }} 家</small>
      <ol class="dining-hex-shop-list" data-testid="duck-hex-shop-list">
        <li v-for="shop in shops" :key="shop.poi_id">
          <button
            type="button"
            :class="{ active: selectedShopId === shop.poi_id }"
            :data-duck-shop-id="shop.poi_id"
            @click="emit('select-shop', shop)"
          >
            <b>{{ shop.name }}</b
            ><span
              >{{ shop.duck_types.map(duckTypeLabel).join('、') }} ·
              {{ modeLabels[shop.service_mode] }}</span
            ><small>{{ shop.address || '地址暂无' }}</small>
          </button>
        </li>
      </ol>
      <p v-if="!shops.length">本格收录鸭店为 0 家。</p>
    </section>
  </article>
</template>

<style scoped>
.dining-hex-tabs {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(242, 239, 230, 0.14);
}
.dining-hex-tabs button {
  background: transparent;
  color: var(--bone-2);
  padding: 7px 10px;
  font-size: 12px;
  border: 1px solid rgba(242, 239, 230, 0.14);
  border-radius: 5px;
}
.dining-hex-tabs button.active {
  color: var(--bone);
  border-color: var(--teal);
  background: var(--teal-wash);
}
.dining-hex-duck {
  padding: 16px;
  color: var(--bone-2);
  font-size: 12px;
}
.dining-hex-duck h3 {
  color: var(--bone);
  font-size: 14px;
  margin: 0 0 16px;
}
.dining-hex-facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.dining-hex-facts dt,
.dining-hex-duck small {
  color: var(--bone-3);
  font-size: 10px;
}
.dining-hex-facts dd {
  margin: 4px 0 0;
  color: var(--teal);
}
.dining-hex-duck p {
  font-size: 11px;
  line-height: 1.6;
}
.dining-hex-shop-list {
  padding: 0;
  list-style: none;
  margin: 10px 0 0;
}
.dining-hex-shop-list button {
  background: transparent;
  display: grid;
  gap: 5px;
  width: 100%;
  padding: 12px 8px;
  text-align: left;
  color: var(--bone-2);
  border: 0;
  border-bottom: 1px solid rgba(242, 239, 230, 0.14);
}
.dining-hex-shop-list button.active {
  background: var(--teal-wash);
}
.dining-hex-shop-list b {
  color: var(--bone);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.dining-hex-shop-list span {
  font-size: 10px;
}
</style>
