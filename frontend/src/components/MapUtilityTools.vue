<script setup>
import UiSelect from './UiSelect.vue'
defineProps({
  attractions: { type: Array, required: true },
  densityMessage: { type: String, required: true },
  densityRadius: { type: Number, required: true },
  densityResult: { type: Object, default: null },
  densityState: { type: String, required: true },
  destinationId: { type: String, required: true },
  locateMessage: { type: String, required: true },
  locateState: { type: String, required: true },
  originId: { type: String, required: true },
  searchAroundSelected: { type: Boolean, required: true },
  travelMessage: { type: String, required: true },
  travelMode: { type: String, required: true },
  travelResult: { type: Object, default: null },
  travelState: { type: String, required: true },
})

const emit = defineEmits([
  'run-density',
  'run-travel-time',
  'update:density-radius',
  'update:destination-id',
  'update:origin-id',
  'update:search-around-selected',
  'update:travel-mode',
])
</script>

<template>
  <details class="utility-tools" data-testid="map-utility-tools">
    <summary><span>地图查询</span><small>按需展开</small></summary>
    <section class="utility-tools__section">
      <h3>选点与搜索范围</h3>
      <label class="toggle-row">
        <input
          type="checkbox"
          :checked="searchAroundSelected"
          @change="emit('update:search-around-selected', $event.target.checked)"
        />
        搜索限制在选点周边 3 公里
      </label>
      <p class="feedback" :class="`feedback-${locateState}`" :data-locate-status="locateState">
        {{ locateMessage }}
      </p>
    </section>
    <section class="utility-tools__section">
      <h3><span>周边餐饮便利度</span><small>实时查询</small></h3>
      <UiSelect>
        <select
          :value="densityRadius"
          aria-label="餐饮统计范围"
          @change="emit('update:density-radius', Number($event.target.value))"
        >
          <option :value="300">300 米</option>
          <option :value="500">500 米</option>
          <option :value="1000">1 公里</option>
        </select>
      </UiSelect>
      <button
        type="button"
        class="tool-button"
        data-testid="density-button"
        :disabled="densityState === 'loading'"
        @click="emit('run-density')"
      >
        统计餐饮便利度
      </button>
      <p class="feedback" :class="`feedback-${densityState}`" :data-density-status="densityState">
        {{ densityMessage }}
      </p>
      <div v-if="densityResult" class="metric-card">
        <strong>{{ densityResult.sampled_count }}</strong>
        <span>家去重样本 · {{ densityResult.density_label }}</span>
      </div>
    </section>
    <section class="utility-tools__section">
      <h3><span>具体路段道路时间</span><small>高德路线</small></h3>
      <UiSelect>
        <select
          :value="originId"
          aria-label="交通查询起点"
          data-testid="origin-select"
          @change="emit('update:origin-id', $event.target.value)"
        >
          <option v-for="item in attractions" :key="item.id" :value="item.id">
            {{ item.name }}
          </option>
        </select>
      </UiSelect>
      <UiSelect>
        <select
          :value="destinationId"
          aria-label="交通查询终点"
          data-testid="destination-select"
          @change="emit('update:destination-id', $event.target.value)"
        >
          <option v-for="item in attractions" :key="item.id" :value="item.id">
            {{ item.name }}
          </option>
        </select>
      </UiSelect>
      <UiSelect>
        <select
          :value="travelMode"
          aria-label="交通方式"
          data-testid="travel-mode"
          @change="emit('update:travel-mode', $event.target.value)"
        >
          <option value="public_transit">公共交通</option>
          <option value="taxi">出租车</option>
          <option value="self_drive">自驾</option>
        </select>
      </UiSelect>
      <button
        type="button"
        class="tool-button"
        data-testid="travel-button"
        :disabled="travelState === 'loading'"
        @click="emit('run-travel-time')"
      >
        查询道路时间
      </button>
      <p class="feedback" :class="`feedback-${travelState}`" :data-travel-status="travelState">
        {{ travelMessage }}
      </p>
      <div v-if="travelResult" class="metric-card travel-card">
        <strong>{{ travelResult.display }}</strong>
        <span>约 {{ (travelResult.distance_m / 1000).toFixed(1) }} 公里</span>
      </div>
    </section>
  </details>
</template>
