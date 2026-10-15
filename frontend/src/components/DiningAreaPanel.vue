<script setup>
import { computed, onMounted, ref, watch } from 'vue'

const props = defineProps({
  active: { type: Boolean, default: true },
  area: { type: Object, default: null },
  areaKind: { type: String, default: 'route' },
  areaState: { type: String, required: true },
  item: { type: Object, default: null },
  overviewNote: { type: String, default: '' },
  restaurantMessage: { type: String, required: true },
  restaurantResponseNote: { type: String, default: '' },
  restaurants: { type: Array, required: true },
  restaurantState: { type: String, required: true },
  selectedRestaurant: { type: Object, default: null },
  localShop: { type: Object, default: null },
})

const emit = defineEmits(['load-restaurants', 'retry-restaurants', 'select-restaurant'])
const panel = ref(null)

function scrollToSelectedCard() {
  if (!props.active || !panel.value?.getClientRects().length) return
  const card = [...panel.value.querySelectorAll('[data-restaurant-id]')].find(
    (element) => element.dataset.restaurantId === props.selectedRestaurant?.poi_id,
  )
  if (!card) return
  const body = panel.value.closest('.info-dock__body')
  if (body) {
    body.scrollTop += card.getBoundingClientRect().top - body.getBoundingClientRect().top - 12
  }
}
watch([() => props.selectedRestaurant?.poi_id, () => props.active], scrollToSelectedCard, {
  flush: 'post',
})
onMounted(scrollToSelectedCard)

const mealLabel = computed(() =>
  props.areaKind === 'nearby'
    ? '周边餐饮查询'
    : props.areaKind === 'overview'
      ? '餐饮分布'
      : props.item?.meal_kind === 'lunch'
        ? '建议午餐'
        : props.item?.meal_kind === 'dinner'
          ? '建议晚餐'
          : '建议用餐',
)

const panelTitle = computed(() =>
  props.areaKind === 'nearby'
    ? props.area?.name || '附近餐饮'
    : props.areaKind === 'overview'
      ? `${props.area?.density_label || '餐饮分布'}区域`
      : props.item?.name || props.area?.name,
)

function availableText(value, formatter = (item) => String(item)) {
  return value === null || value === undefined || value === '' ? '暂无信息' : formatter(value)
}

function restaurantMeta(restaurant) {
  return [
    availableText(restaurant.distance_m, (value) => `距离约 ${value} 米`),
    availableText(restaurant.category),
    availableText(restaurant.rating, (value) => `评分 ${value}`),
    availableText(restaurant.average_cost, (value) => `人均约 ${value} 元`),
  ]
}
</script>

<template>
  <article
    ref="panel"
    class="dining-area-panel"
    data-testid="dining-area-panel"
    :data-area-kind="areaKind"
  >
    <div v-if="areaState === 'idle'" class="dining-area-panel__empty">
      <strong>还没有选择餐饮区域</strong>
      <p>请从规划时间轴选择“用餐区域”，或开启“餐饮分布”后点击一个蜂巢格。</p>
    </div>

    <div
      v-else-if="areaState === 'error'"
      class="dining-area-panel__notice dining-area-panel__notice--warning"
      data-testid="dining-area-error"
    >
      <strong>用餐区域数据不完整</strong>
      <p>{{ restaurantMessage }}</p>
    </div>

    <template v-else>
      <header class="dining-area-panel__summary">
        <div>
          <small>{{ mealLabel }}</small>
          <h3>{{ panelTitle }}</h3>
          <time v-if="areaKind === 'route'">{{ item?.start_time }}—{{ item?.end_time }}</time>
        </div>
        <span :class="`density-badge density-badge--${area?.density_level}`">
          {{ area?.density_label }}
        </span>
      </header>

      <dl class="dining-area-panel__facts">
        <div>
          <dt>{{ areaKind === 'route' ? '实际范围' : '查看范围' }}</dt>
          <dd>{{ area?.radius_meters }} 米</dd>
        </div>
        <div>
          <dt>
            {{
              areaKind === 'overview' ? '收录餐饮' : areaKind === 'nearby' ? '候选结果' : '采集餐饮'
            }}
          </dt>
          <dd>
            {{
              areaKind === 'overview'
                ? `${area?.meal_sample_count} 家`
                : areaKind === 'nearby'
                  ? `${restaurants.length} 家`
                  : `${area?.restaurant_count} 家`
            }}
          </dd>
        </div>
        <div>
          <dt>数据来源</dt>
          <dd>
            {{
              areaKind === 'overview'
                ? '本地采样资料'
                : area?.source === 'amap'
                  ? '高德地图'
                  : '暂无信息'
            }}
          </dd>
        </div>
      </dl>

      <div class="dining-area-panel__boundary" data-testid="dining-area-boundary">
        <template v-if="areaKind === 'overview'">
          <p>本格采集范围为中心周围600米，六边形中心到顶点570米。</p>
          <small>{{ overviewNote }}</small>
        </template>
        <template v-else>
          <p>{{ area?.message }}</p>
          <small>{{ area?.note }}</small>
        </template>
      </div>

      <section class="dining-area-panel__restaurants" aria-labelledby="restaurant-result-title">
        <div class="dining-area-panel__section-heading">
          <div>
            <small>{{ areaKind === 'overview' ? '本地资料' : '按需查询' }}</small>
            <h4 id="restaurant-result-title">
              {{ areaKind === 'overview' ? '本格餐饮' : '范围内饭店' }}
            </h4>
          </div>
          <button
            v-if="restaurantState === 'idle' && areaKind === 'route'"
            type="button"
            data-testid="load-restaurants"
            @click="emit('load-restaurants')"
          >
            查看范围内饭店
          </button>
          <button
            v-if="restaurantState === 'error'"
            type="button"
            data-testid="retry-restaurants"
            @click="emit('retry-restaurants')"
          >
            重试查询
          </button>
          <button
            v-else-if="restaurantState === 'success' && restaurants.length === 0"
            type="button"
            data-testid="retry-restaurants"
            @click="emit('retry-restaurants')"
          >
            重新加载
          </button>
        </div>

        <p
          class="dining-area-panel__status"
          :class="`dining-area-panel__status--${restaurantState}`"
          :data-restaurant-status="restaurantState"
        >
          {{ restaurantMessage }}
        </p>

        <div
          v-if="restaurantState === 'loading'"
          class="dining-area-panel__loading"
          aria-live="polite"
        >
          <i></i><i></i><i></i
          ><span>{{ areaKind === 'overview' ? '正在读取本地名单' : '正在加载餐饮资料' }}</span>
        </div>

        <ol v-if="restaurants.length" class="restaurant-list" data-testid="restaurant-list">
          <li v-for="restaurant in restaurants" :key="restaurant.poi_id">
            <button
              type="button"
              :class="{ active: selectedRestaurant?.poi_id === restaurant.poi_id }"
              :data-restaurant-id="restaurant.poi_id"
              @click="emit('select-restaurant', restaurant)"
            >
              <b>{{ restaurant.name }}</b>
              <span>{{ restaurantMeta(restaurant).join(' · ') }}</span>
              <small>{{ availableText(restaurant.address) }}</small>
            </button>
            <div
              v-if="selectedRestaurant?.poi_id === restaurant.poi_id"
              class="restaurant-detail"
              data-testid="restaurant-detail"
            >
              <small>饭店详情</small>
              <h4>{{ selectedRestaurant.name }}</h4>
              <dl>
                <div>
                  <dt>距离</dt>
                  <dd>
                    {{ availableText(selectedRestaurant.distance_m, (value) => `${value} 米`) }}
                  </dd>
                </div>
                <div v-if="selectedRestaurant.rating != null">
                  <dt>评分</dt>
                  <dd>{{ availableText(selectedRestaurant.rating) }}</dd>
                </div>
                <div v-if="selectedRestaurant.average_cost != null">
                  <dt>人均</dt>
                  <dd>
                    {{
                      availableText(selectedRestaurant.average_cost, (value) => `约 ${value} 元`)
                    }}
                  </dd>
                </div>
                <div>
                  <dt>地址</dt>
                  <dd>{{ availableText(selectedRestaurant.address) }}</dd>
                </div>
                <div v-if="selectedRestaurant.telephone">
                  <dt>电话</dt>
                  <dd>{{ availableText(selectedRestaurant.telephone) }}</dd>
                </div>
                <template v-if="localShop">
                  <div v-if="localShop.dish_tags?.length">
                    <dt>菜品</dt>
                    <dd>
                      {{
                        availableText(
                          Array.isArray(localShop.dish_tags)
                            ? localShop.dish_tags.join('、')
                            : localShop.dish_tags,
                        )
                      }}
                    </dd>
                  </div>
                  <div v-if="localShop.opening_hours || localShop.collected_opening_hours">
                    <dt>营业时间</dt>
                    <dd>
                      {{
                        availableText(localShop.opening_hours || localShop.collected_opening_hours)
                      }}
                    </dd>
                  </div>
                </template>
              </dl>
            </div>
          </li>
        </ol>

        <small v-if="restaurantResponseNote" class="dining-area-panel__response-note">
          {{ restaurantResponseNote }}
        </small>
      </section>
    </template>
  </article>
</template>

<style scoped src="../styles/area-results.css"></style>
