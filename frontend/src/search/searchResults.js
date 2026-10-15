const EARTH_RADIUS_METERS = 6_371_000
const EXACT_NAME_MAX_DISTANCE_METERS = 2_000
const CONTAINED_NAME_MAX_DISTANCE_METERS = 500
const DETAIL_MATCH_MAX_DISTANCE_METERS = 500

function finiteCoordinate(location) {
  return Number.isFinite(location?.longitude) && Number.isFinite(location?.latitude)
}

export function normalizedPlaceName(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/[\s·•・,，。.!！?？、()（）[\]【】'"“”‘’\-—_]/g, '')
}

export function locationDistanceMeters(left, right) {
  if (!finiteCoordinate(left) || !finiteCoordinate(right)) return Number.POSITIVE_INFINITY
  const latitude1 = (left.latitude * Math.PI) / 180
  const latitude2 = (right.latitude * Math.PI) / 180
  const deltaLatitude = ((right.latitude - left.latitude) * Math.PI) / 180
  const deltaLongitude = ((right.longitude - left.longitude) * Math.PI) / 180
  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(deltaLongitude / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(haversine))
}

function providerId(item) {
  return String(item?.poi_id || item?.provider_id || '')
}

function providerIds(item) {
  return [providerId(item), ...(Array.isArray(item?.provider_ids) ? item.provider_ids : [])]
    .map(String)
    .filter(Boolean)
}

function sameProvider(left, right) {
  const rightIds = new Set(providerIds(right))
  return providerIds(left).some((id) => rightIds.has(id))
}

function nearbyNamedItem(
  poi,
  items,
  { namesFor = (item) => [item.name], maxDistance = DETAIL_MATCH_MAX_DISTANCE_METERS } = {},
) {
  const poiName = normalizedPlaceName(poi?.name)
  if (!poiName) return null
  const candidates = (Array.isArray(items) ? items : [])
    .map((item) => ({
      distance: locationDistanceMeters(poi?.location, item?.location),
      item,
      names: namesFor(item).map(normalizedPlaceName).filter(Boolean),
    }))
    .filter(({ distance, names }) => distance <= maxDistance && names.includes(poiName))
    .sort((left, right) => left.distance - right.distance)
  return candidates[0]?.item || null
}

export function matchFormalAttraction(poi, attractions) {
  const poiName = normalizedPlaceName(poi?.name)
  if (!poiName) return null
  const candidates = (Array.isArray(attractions) ? attractions : [])
    .map((attraction) => {
      const names = [attraction.name, ...(attraction.aliases || [])]
        .map(normalizedPlaceName)
        .filter(Boolean)
      const exact = names.includes(poiName)
      const contained = names.some(
        (name) =>
          (Math.min(name.length, poiName.length) >= 4 &&
            (name.includes(poiName) || poiName.includes(name))) ||
          ['古', '南京', '南京市'].some((prefix) => poiName === prefix + name),
      )
      return {
        attraction,
        distance: locationDistanceMeters(poi?.location, attraction?.location),
        exact,
        contained,
      }
    })
    .filter(
      ({ distance, exact, contained }) =>
        (exact && distance <= EXACT_NAME_MAX_DISTANCE_METERS) ||
        (contained && distance <= CONTAINED_NAME_MAX_DISTANCE_METERS),
    )
    .sort(
      (left, right) => Number(right.exact) - Number(left.exact) || left.distance - right.distance,
    )
  return candidates[0]?.attraction || null
}

function matchKnownPoi(poi, items) {
  const providerMatch = (Array.isArray(items) ? items : []).find((item) => sameProvider(poi, item))
  return providerMatch || nearbyNamedItem(poi, items)
}

function matchMetroStation(poi, stations) {
  const providerMatch = (Array.isArray(stations) ? stations : []).find((station) =>
    sameProvider(poi, station),
  )
  if (providerMatch) return providerMatch
  return nearbyNamedItem(poi, stations, {
    namesFor: (station) => [station.name, `${station.name}站`, `${station.name}地铁站`],
    maxDistance: 350,
  })
}

function inferredIcon(poi) {
  const typecode = String(poi?.typecode || '')
  const type = String(poi?.type || '')
  if (typecode.startsWith('05') || /餐饮|餐厅|饭店|小吃|咖啡|茶艺/.test(type)) return 'dining'
  if (typecode.startsWith('10') || /住宿|酒店|宾馆|旅馆|民宿/.test(type)) return 'hotels'
  return 'search'
}

function assignFormalAttractions(pois, attractions) {
  const candidates = pois.map((poi, sourceIndex) => {
    const attraction = matchFormalAttraction(poi, attractions)
    return {
      attraction,
      distance: locationDistanceMeters(poi?.location, attraction?.location),
      sourceIndex,
    }
  })
  const winnerByAttraction = new Map()
  candidates.forEach((candidate) => {
    if (!candidate.attraction) return
    const key = candidate.attraction.id || normalizedPlaceName(candidate.attraction.name)
    const current = winnerByAttraction.get(key)
    if (
      !current ||
      candidate.distance < current.distance ||
      (candidate.distance === current.distance && candidate.sourceIndex < current.sourceIndex)
    ) {
      winnerByAttraction.set(key, candidate)
    }
  })
  return new Map(
    [...winnerByAttraction.values()].map(({ attraction, sourceIndex }) => [
      sourceIndex,
      attraction,
    ]),
  )
}

export function prepareSearchResults(
  pois,
  {
    attractions = [],
    duckRestaurants = [],
    hotels = [],
    metroStations = [],
    restaurants = [],
    keyword = '',
    category = 'all',
    center = null,
    radiusMeters = Number.POSITIVE_INFINITY,
  } = {},
) {
  const sourcePois = Array.isArray(pois) ? pois : []
  const formalAttractions = assignFormalAttractions(sourcePois, attractions)
  const results = sourcePois
    .map((poi, index) => {
      const attraction = formalAttractions.get(index) || null
      const duckRestaurant = matchKnownPoi(poi, duckRestaurants)
      const hotel = matchKnownPoi(poi, hotels)
      const restaurant = matchKnownPoi(poi, restaurants)
      const metroStation = matchMetroStation(poi, metroStations)
      const icon = attraction
        ? 'attractions'
        : duckRestaurant
          ? 'duck'
          : hotel
            ? 'hotels'
            : restaurant
              ? 'dining'
              : metroStation
                ? 'search'
                : inferredIcon(poi)
      const detailKind = attraction
        ? 'attraction'
        : metroStation
          ? 'metro'
          : hotel
            ? 'hotel'
            : restaurant
              ? 'restaurant'
              : ''
      const detailItem = attraction || metroStation || hotel || restaurant || null
      return {
        result: {
          ...poi,
          searchKey: providerId(poi) || `search-${index}`,
          searchIcon: icon,
          searchDetailKind: detailKind,
          searchDetailItem: detailItem,
          isFormalAttraction: Boolean(attraction),
        },
        sourceIndex: index,
      }
    })
    .sort(
      (left, right) =>
        Number(right.result.isFormalAttraction) - Number(left.result.isFormalAttraction) ||
        left.sourceIndex - right.sourceIndex,
    )
    .map(({ result }) => result)

  // The formal catalog is searchable independently of provider naming and result coverage.
  const query = normalizedPlaceName(keyword)
  if (!query || !['all', 'attraction'].includes(category)) return results
  const present = new Set(
    results.filter((poi) => poi.isFormalAttraction).map((poi) => poi.searchDetailItem.id),
  )
  const missing = attractions
    .filter(
      (attraction) =>
        !present.has(attraction.id) &&
        finiteCoordinate(attraction.location) &&
        [attraction.name, ...(attraction.aliases || [])].some((name) =>
          normalizedPlaceName(name).includes(query),
        ) &&
        (!center || locationDistanceMeters(center, attraction.location) <= radiusMeters),
    )
    .map((attraction) => ({
      poi_id: `formal:${attraction.id}`,
      searchKey: `formal:${attraction.id}`,
      name: attraction.name,
      address: attraction.address || '',
      location: attraction.location,
      source: 'formal_catalog',
      searchIcon: 'attractions',
      searchDetailKind: 'attraction',
      searchDetailItem: attraction,
      isFormalAttraction: true,
    }))
  const combined = [
    ...results.filter((poi) => poi.isFormalAttraction),
    ...missing,
    ...results.filter((poi) => !poi.isFormalAttraction),
  ]
  const rank = (poi) => {
    if (!poi.isFormalAttraction) return 3
    const names = [poi.searchDetailItem.name, ...(poi.searchDetailItem.aliases || [])].map(
      normalizedPlaceName,
    )
    return names.includes(query) ? 0 : names.some((name) => name.includes(query)) ? 1 : 2
  }
  return combined.sort((left, right) => rank(left) - rank(right))
}
