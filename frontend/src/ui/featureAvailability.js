export const FEATURE_STATES = Object.freeze({
  attractions: { state: 'ready', label: '已接入', description: '使用项目景点数据' },
  planning: { state: 'ready', label: '已接入', description: '真实三方案生成与地图联动' },
  placeSearch: { state: 'ready', label: '已接入', description: '高德地点搜索与地图选点' },
  diningQuery: {
    state: 'ready',
    label: '已接入',
    description: '规划内真实便利区与范围内饭店按需查询',
  },
  savedPlans: {
    state: 'ready',
    label: '已接入',
    description: '可命名保存、打开、改名和删除多份本地方案',
  },
  metro: {
    state: 'ready',
    label: '已接入',
    description: '8 条经核实的主要地铁线路与主要站点，静态数据',
  },
  hotels: {
    state: 'ready',
    label: '已接入',
    description: '按需查询当前范围酒店位置与参考价位档',
  },
  weather: { state: 'ready', label: '已接入', description: '南京天气预报' },
  duckCulture: {
    state: 'ready',
    label: '已接入',
    description: '8 篇带来源的正式鸭文化正文与文章列表',
  },
  routeEditing: { state: 'coming', label: '接入中', description: '删除、排序和重新检查尚未接入' },
  exportImages: {
    state: 'ready',
    label: '已接入',
    description: '当前方案可导出整段长图和逐日图片行程单',
  },
})
