let loaderPromise
let amapPromise

function loadLoaderScript() {
  if (window.AMapLoader) {
    return Promise.resolve()
  }
  if (loaderPromise) {
    return loaderPromise
  }

  let currentPromise
  currentPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://webapi.amap.com/loader.js'
    script.async = true
    script.onload = resolve
    script.onerror = () => {
      script.remove()
      if (loaderPromise === currentPromise) loaderPromise = undefined
      reject(new Error('高德地图加载器下载失败，请检查网络连接。'))
    }
    document.head.appendChild(script)
  })
  loaderPromise = currentPromise
  return loaderPromise
}

export async function loadAMap({ jsKey, securityProxyUrl }) {
  if (!jsKey || !securityProxyUrl) {
    throw new Error('缺少高德地图配置，请检查本地 .env。')
  }
  if (amapPromise) {
    return amapPromise
  }

  window._AMapSecurityConfig = { serviceHost: securityProxyUrl }
  const loadingPromise = loadLoaderScript().then(() =>
    window.AMapLoader.load({
      key: jsKey,
      version: '2.0',
      plugins: [],
    }),
  )
  let retryablePromise
  retryablePromise = loadingPromise.catch((error) => {
    if (amapPromise === retryablePromise) amapPromise = undefined
    throw error
  })
  amapPromise = retryablePromise
  return amapPromise
}
