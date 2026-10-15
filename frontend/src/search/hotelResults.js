export const HOTEL_PRICE_BAND_LABELS = Object.freeze({
  under_200: '价位 200 元以下',
  '200_300': '价位 200—300 元',
  '300_400': '价位 300—400 元',
  '400_500': '价位 400—500 元',
  over_500: '价位 500 元以上',
  unknown: '价位暂无信息',
})

/**
 * Re-bind the selected hotel to a fresh result batch: keep it only when the
 * same POI still exists there, so a stale hotel can never be displayed
 * together with a newer query's center/range.
 */
export function rebindSelectedHotel(currentHotel, nextHotels) {
  if (!currentHotel) return null
  return (nextHotels || []).find((hotel) => hotel.poi_id === currentHotel.poi_id) || null
}
