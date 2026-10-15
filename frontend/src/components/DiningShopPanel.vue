<script setup>
import { computed } from 'vue'
import { duckTypeLabel } from '../planning/duckDiningPresentation'
const props = defineProps({ shop: { type: Object, default: null } })
function text(value) {
  return Array.isArray(value) ? value.join('、') || '暂无' : value || '暂无'
}
const dishes = computed(() =>
  [
    ...new Set(
      (Array.isArray(props.shop?.dish_tags)
        ? props.shop.dish_tags
        : (props.shop?.dish_tags || '').split(/[,，、;；|]/)
      )
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ].join('、'),
)
const cost = computed(() => {
  const value = props.shop?.cost_hint || props.shop?.average_cost
  if (!value) return ''
  return Number.isFinite(Number(value)) ? `约 ${Number(value)} 元` : value
})
</script>

<template>
  <article
    v-if="shop"
    class="dining-shop-panel"
    data-testid="dining-shop-panel"
    :data-poi-id="shop.poi_id"
  >
    <small
      >{{ shop.collection === 'duck' ? '南京鸭' : '南京特色菜'
      }}<span v-if="shop.service_mode === 'takeaway'"> · 熟食外带</span></small
    >
    <h3>{{ shop.name }}</h3>
    <dl>
      <div v-if="shop.collection === 'duck'">
        <dt>南京鸭美食</dt>
        <dd>
          {{
            shop.duck_types
              .map(
                (type) =>
                  `${duckTypeLabel(type)}${shop.inferred_duck_types?.includes(type) ? '（公开资料推断）' : ''}`,
              )
              .join('、')
          }}
        </dd>
      </div>
      <div>
        <dt>地址</dt>
        <dd>{{ text(shop.address) }}</dd>
      </div>
      <div v-if="shop.business_tags">
        <dt>餐馆类型</dt>
        <dd>{{ text(shop.business_tags) }}</dd>
      </div>
      <div v-if="dishes">
        <dt>菜品</dt>
        <dd>{{ dishes }}</dd>
      </div>
      <div v-if="shop.opening_hours || shop.collected_opening_hours">
        <dt>营业时间</dt>
        <dd>{{ text(shop.opening_hours || shop.collected_opening_hours) }}</dd>
      </div>
      <div v-if="cost">
        <dt>人均参考</dt>
        <dd>{{ cost }}</dd>
      </div>
      <div v-if="shop.rating != null">
        <dt>评分</dt>
        <dd>{{ shop.rating }}</dd>
      </div>
      <div v-if="shop.telephone">
        <dt>电话</dt>
        <dd>{{ shop.telephone }}</dd>
      </div>
    </dl>
  </article>
</template>

<style scoped>
.dining-shop-panel {
  padding: 16px;
  color: var(--bone-2);
}
.dining-shop-panel small,
.dining-shop-panel dt {
  color: var(--bone-3);
  font-size: 10px;
}
.dining-shop-panel h3 {
  color: var(--bone);
  margin: 5px 0 16px;
  font-size: 16px;
}
.dining-shop-panel dl {
  display: grid;
  gap: 12px;
  margin: 0;
}
.dining-shop-panel dd {
  margin: 3px 0 0;
  font-size: 12px;
  overflow-wrap: anywhere;
  line-height: 1.6;
}
.dining-shop-panel p {
  margin-top: 16px;
  font-size: 10px;
  line-height: 1.6;
  color: var(--bone-3);
}
</style>
