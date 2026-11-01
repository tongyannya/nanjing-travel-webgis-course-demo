export function splitUnplannedAttractions(plan) {
  const items = plan?.unplanned_attractions || []
  return {
    unplanned: items.filter((item) => item.reason_code !== 'excluded'),
    excluded: items.filter((item) => item.reason_code === 'excluded'),
  }
}
