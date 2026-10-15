// 固定展示数据：六个住宿推荐片区与首末日起终点候选。
// 代表坐标只作为规划起点使用，不伪装成具体酒店；来源统一走后端允许的
// `source_method: 'search'`，片区 ID 只保存在前端住宿状态中用于展示回显。
export const ACCOMMODATION_AREA_RADIUS_METERS = 1000
export const ACCOMMODATION_AREA_OPTIONS = [
  {
    id: 'xinjiekou_daxinggong',
    name: '新街口—大行宫',
    nearby: '总统府、1912 街区，往南京博物院方向方便',
    suits: '首次来南京、重视交通和餐饮便利',
    longitude: 118.78443,
    latitude: 32.043088,
  },
  {
    id: 'fuzimiao_laomendong',
    name: '夫子庙—老门东',
    nearby: '夫子庙、秦淮河、老门东、中华门',
    suits: '喜欢夜游、老城氛围和步行串联',
    longitude: 118.788709,
    latitude: 32.014973,
  },
  {
    id: 'muxuyuan_zhongshanling',
    name: '苜蓿园—下马坊—钟灵街',
    nearby: '中山陵、明孝陵、美龄宫、灵谷寺',
    suits: '把钟山景区作为重点、愿意早出发',
    longitude: 118.845863,
    latitude: 32.034515,
  },
  {
    id: 'xuanwumen_gulou',
    name: '玄武门—鼓楼—鸡鸣寺',
    nearby: '玄武湖、鸡鸣寺、南京城墙、颐和路',
    suits: '喜欢湖景、人文和市中心慢游',
    longitude: 118.783097,
    latitude: 32.065678,
  },
  {
    id: 'mochouou_yunjin',
    name: '莫愁湖—云锦路—奥体中心',
    nearby: '莫愁湖、南京大屠杀遇难同胞纪念馆、奥体片区',
    suits: '看重较新住宿和河西行程',
    longitude: 118.754187,
    latitude: 32.028876,
  },
  {
    id: 'nanjingsouth_yuhuatai',
    name: '南京南站—雨花台',
    nearby: '南京南站、雨花台，去牛首山方向换乘方便',
    suits: '到达较晚、离开较早或计划去城南',
    longitude: 118.799135,
    latitude: 31.972595,
  },
]

// 首日/末日固定候选枢纽；代表坐标取站前公共到达区域（GCJ-02）。
export const TRIP_ENDPOINT_OPTIONS = [
  {
    id: 'nanjing_south_station',
    name: '南京南站',
    longitude: 118.804186,
    latitude: 31.976237,
    displayIcon: 'station',
  },
  {
    id: 'nanjing_station',
    name: '南京站',
    longitude: 118.79784,
    latitude: 32.08773,
    displayIcon: 'station',
  },
  {
    id: 'lukou_airport',
    name: '南京禄口国际机场',
    longitude: 118.86375,
    latitude: 31.741846,
    displayIcon: 'airport',
  },
]

export const ACCOMMODATION_COORD_RANGE = Object.freeze({
  minLongitude: 118.35,
  maxLongitude: 119.15,
  minLatitude: 31.2,
  maxLatitude: 32.2,
})

function validCoordinate(option) {
  return (
    Number.isFinite(option.longitude) &&
    Number.isFinite(option.latitude) &&
    option.longitude >= ACCOMMODATION_COORD_RANGE.minLongitude &&
    option.longitude <= ACCOMMODATION_COORD_RANGE.maxLongitude &&
    option.latitude >= ACCOMMODATION_COORD_RANGE.minLatitude &&
    option.latitude <= ACCOMMODATION_COORD_RANGE.maxLatitude
  )
}

export function findAccommodationArea(id) {
  return ACCOMMODATION_AREA_OPTIONS.find((area) => area.id === id) || null
}

// 校验配置本身：文案完整、坐标落在南京范围内的 GCJ-02 区间。
export function validateAccommodationOptions() {
  const issues = []
  const seenIds = new Set()
  ACCOMMODATION_AREA_OPTIONS.forEach((area) => {
    if (!area.id || seenIds.has(area.id)) issues.push(`片区 ID 缺失或重复：${area.id}`)
    seenIds.add(area.id)
    if (!area.name.trim() || !area.nearby.trim() || !area.suits.trim())
      issues.push(`片区文案不完整：${area.id}`)
    if (!validCoordinate(area)) issues.push(`片区坐标超出南京范围：${area.id}`)
  })
  TRIP_ENDPOINT_OPTIONS.forEach((option) => {
    if (!option.name.trim() || !validCoordinate(option))
      issues.push(`起终点候选不完整：${option.id}`)
  })
  return issues
}

// 片区代表点转换成与 TripRequest 地点一致的地点结构。
export function accommodationAreaLocation(area) {
  return {
    longitude: area.longitude,
    latitude: area.latitude,
    coord_system: 'GCJ-02',
  }
}
