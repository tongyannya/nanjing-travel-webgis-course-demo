<script setup>
import { defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import { apiRequest } from '../services/api'

// Do not mount the workspace or start its requests until all AMap settings exist.
const Workspace = defineAsyncComponent(() => import('../App.vue'))
const ready = ref(false)
const checking = ref(false)
const message = ref('正在检查本机配置…')
let controller

async function checkConfiguration() {
  if (checking.value) return
  checking.value = true
  controller = new AbortController()
  try {
    const configuration = await apiRequest('/api/map/config', {
      signal: controller.signal,
    })
    if (controller.signal.aborted) return
    ready.value = configuration.enabled === true
    message.value = ready.value
      ? ''
      : configuration.message || '请先填写高德地图配置。'
  } catch (error) {
    if (!controller.signal.aborted)
      message.value = error.message || '配置检查失败，请启动后端后重试。'
  } finally {
    checking.value = false
  }
}

onMounted(checkConfiguration)
onBeforeUnmount(() => controller?.abort())
</script>

<template>
  <Workspace v-if="ready" />
  <main v-else class="course-entry" data-testid="course-configuration-gate">
    <section class="course-entry__card">
      <p class="course-entry__eyebrow">金陵行前 · 课设展示版</p>
      <h1>{{ checking ? '正在检查配置…' : '请先配置高德地图' }}</h1>
      <p role="status">{{ message }}</p>
      <p>
        将项目根目录的 <code>.env.example</code> 复制为
        <code>.env</code>，填写三项高德配置：
      </p>
      <ul>
        <li><code>VITE_AMAP_JS_KEY</code>：Web 端 JS API Key</li>
        <li><code>AMAP_JS_SECURITY_CODE</code>：配套安全密钥</li>
        <li><code>AMAP_WEB_SERVICE_KEY</code>：Web 服务 API Key</li>
      </ul>
      <p>
        保存后重启前后端，再点击下方按钮。和风天气配置可选，未填写时仅天气不可用。
      </p>
      <button type="button" :disabled="checking" @click="checkConfiguration">
        {{ checking ? '检查中…' : '重新检查配置' }}
      </button>
    </section>
  </main>
</template>

<style scoped>
.course-entry {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 24px;
  background: #1c2925;
  color: #f2eee4;
}
.course-entry__card {
  width: min(100%, 620px);
  padding: 32px;
  border: 1px solid #77948b;
  border-radius: 20px;
  background: #303d37;
}
.course-entry__eyebrow {
  color: #b7cec4;
}
h1 {
  margin: 12px 0 20px;
  font-size: 26px;
}
p,
li {
  line-height: 1.8;
  overflow-wrap: anywhere;
}
ul {
  padding-left: 22px;
}
code {
  font-size: 0.92em;
}
button {
  margin-top: 16px;
  padding: 12px 20px;
  border: 1px solid #8bb7aa;
  border-radius: 10px;
  background: #47776a;
  color: #fff;
  cursor: pointer;
}
button:disabled {
  opacity: 0.6;
  cursor: wait;
}
</style>
