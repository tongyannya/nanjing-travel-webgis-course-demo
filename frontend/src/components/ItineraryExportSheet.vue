<script setup>
import { DUCK_CANDIDATE_MISSING_TEXT, EXPORT_SHEET_WIDTH } from '../planning/itineraryExport'

// Static export sheet used for both the full long image and the per-day image.
// It renders a prepared view model from planning/itineraryExport.js at a fixed
// width; it must stay free of interactive controls and remote assets.
defineProps({
  sheet: { type: Object, required: true },
})
</script>

<template>
  <article
    class="itinerary-sheet"
    :class="{ 'itinerary-sheet--duck': sheet.planType === 'duck' }"
    :style="{ width: `${EXPORT_SHEET_WIDTH}px` }"
    data-testid="itinerary-sheet"
  >
    <header class="itinerary-sheet__header">
      <h1 class="itinerary-sheet__title">{{ sheet.title }}</h1>
      <p class="itinerary-sheet__plan">
        <b class="itinerary-sheet__plan-label">{{ sheet.planLabel }}</b>
        <span class="itinerary-sheet__plan-summary">{{ sheet.planSummary }}</span>
      </p>
      <p class="itinerary-sheet__meta">
        <span>{{ sheet.periodLabel }}</span>
        <span>{{ sheet.ticketLabel }}</span>
      </p>
      <p v-if="sheet.budgetWarning" class="itinerary-sheet__budget">
        {{ sheet.budgetWarning }}
      </p>
    </header>

    <section
      v-for="day in sheet.days"
      :key="`${day.dayNumber}-${day.date}`"
      class="itinerary-sheet__day"
    >
      <header class="itinerary-sheet__day-header">
        <h2>第 {{ day.dayNumber }} 天 · {{ day.dateLabel }} · {{ day.weatherLabel }}</h2>
        <span v-if="sheet.kind === 'full'">{{ day.dayTicketLabel }}</span>
      </header>
      <ol class="itinerary-sheet__timeline">
        <template v-for="(entry, entryIndex) in day.entries" :key="entryIndex">
          <li
            v-if="entry.kind === 'item'"
            class="itinerary-sheet__item"
            :class="`itinerary-sheet__item--${entry.type}`"
          >
            <time class="itinerary-sheet__time">{{ entry.timeLabel }}</time>
            <div class="itinerary-sheet__item-body">
              <p class="itinerary-sheet__item-kind">
                {{ [entry.typeLabel, entry.mealLabel].filter(Boolean).join(' · ') }}
              </p>
              <p class="itinerary-sheet__item-name">{{ entry.name }}</p>
              <p
                v-if="entry.ticketLabel || entry.durationLabel"
                class="itinerary-sheet__item-facts"
              >
                <span v-if="entry.ticketLabel">{{ entry.ticketLabel }}</span>
                <span v-if="entry.durationLabel">停留{{ entry.durationLabel }}</span>
              </p>
              <p
                v-if="entry.duckCandidateMissing"
                class="itinerary-sheet__item-note itinerary-sheet__item-note--warn"
              >
                {{ DUCK_CANDIDATE_MISSING_TEXT }}
              </p>
              <p v-if="entry.diningLine" class="itinerary-sheet__item-note">
                {{ entry.diningLine }}
              </p>
              <p v-if="entry.notes" class="itinerary-sheet__item-note">{{ entry.notes }}</p>
            </div>
          </li>
          <li v-else class="itinerary-sheet__leg" :class="`itinerary-sheet__leg--${entry.status}`">
            <span class="itinerary-sheet__leg-arrow" aria-hidden="true">↓</span>
            <p class="itinerary-sheet__leg-text">{{ entry.text }}</p>
          </li>
        </template>
      </ol>
    </section>

    <section v-if="sheet.unplanned.length" class="itinerary-sheet__block">
      <h3>未安排的明确关注景点（{{ sheet.unplanned.length }}）</h3>
      <ul>
        <li v-for="(item, index) in sheet.unplanned" :key="index">
          <b>{{ item.name }}</b
          ><span>：{{ item.message }}</span>
        </li>
      </ul>
    </section>

    <section v-if="sheet.warnings.length" class="itinerary-sheet__block">
      <h3>{{ sheet.warningsTitle }}</h3>
      <p v-if="sheet.warningsNote" class="itinerary-sheet__block-note">
        {{ sheet.warningsNote }}
      </p>
      <ul>
        <li v-for="(warning, index) in sheet.warnings" :key="index">{{ warning }}</li>
      </ul>
    </section>

    <footer class="itinerary-sheet__footer">{{ sheet.footnote }}</footer>
  </article>
</template>

<style>
.itinerary-sheet {
  --sheet-ink: #1f2d2a;
  --sheet-accent: #4e8c86;
  --sheet-action: #c84e37;
  --sheet-muted: #596b63;
  --sheet-line: #bfb9ab;
  --sheet-wash: #e4e8dd;
  background-color: #f2ecdf;
  background-image:
    repeating-linear-gradient(0deg, #ffffff10 0 1px, transparent 1px 4px),
    repeating-linear-gradient(90deg, #82684908 0 1px, transparent 1px 5px);
  color: var(--sheet-ink);
  font-family:
    'PingFang SC', 'Microsoft YaHei', 'Source Han Sans SC', 'Noto Sans CJK SC', sans-serif;
  font-size: 15px;
  line-height: 1.55;
  padding: 42px 48px 26px;
  box-sizing: border-box;
  overflow-wrap: anywhere;
}

.itinerary-sheet p,
.itinerary-sheet h1,
.itinerary-sheet h2,
.itinerary-sheet h3,
.itinerary-sheet ul,
.itinerary-sheet ol,
.itinerary-sheet li,
.itinerary-sheet figure {
  margin: 0;
  padding: 0;
}

.itinerary-sheet ul,
.itinerary-sheet ol {
  list-style: none;
}

.itinerary-sheet__header {
  border-bottom: 3px solid var(--sheet-accent);
  padding-bottom: 18px;
  margin-bottom: 22px;
}

.itinerary-sheet__title {
  font-size: 30px;
  font-weight: 700;
  color: var(--sheet-ink);
  letter-spacing: 2px;
}

.itinerary-sheet__plan {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-top: 14px;
}

.itinerary-sheet__plan-label {
  flex: none;
  background: var(--sheet-accent);
  color: #ffffff;
  font-size: 16px;
  padding: 3px 14px;
  border-radius: 999px;
}

.itinerary-sheet__plan-summary {
  font-size: 15px;
  color: var(--sheet-muted);
}

.itinerary-sheet__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 28px;
  margin-top: 12px;
  font-size: 14px;
  color: var(--sheet-muted);
}

.itinerary-sheet__budget {
  margin-top: 10px;
  font-size: 14px;
  color: var(--sheet-action);
  background: var(--sheet-wash);
  border: 1px solid var(--sheet-line);
  border-radius: 6px;
  padding: 6px 12px;
}

.itinerary-sheet__day + .itinerary-sheet__day {
  margin-top: 26px;
}

.itinerary-sheet__day-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  background: var(--sheet-wash);
  border-left: 5px solid var(--sheet-accent);
  padding: 8px 14px;
  border-radius: 0 8px 8px 0;
}

.itinerary-sheet__day-header h2 {
  font-size: 19px;
  color: var(--sheet-ink);
}

.itinerary-sheet__day-header span {
  font-size: 13px;
  color: var(--sheet-muted);
}

.itinerary-sheet__timeline {
  margin-top: 6px;
}

.itinerary-sheet__item {
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr);
  gap: 4px 16px;
  padding: 10px 6px 10px 14px;
}

.itinerary-sheet__item + .itinerary-sheet__item {
  border-top: 1px dashed var(--sheet-line);
}

.itinerary-sheet__time {
  font-size: 15px;
  font-weight: 700;
  color: var(--sheet-ink);
  font-variant-numeric: tabular-nums;
}

.itinerary-sheet__item-kind {
  font-size: 12.5px;
  color: var(--sheet-accent);
  letter-spacing: 1px;
}

.itinerary-sheet__item-name {
  font-size: 17.5px;
  font-weight: 700;
  color: var(--sheet-ink);
}

.itinerary-sheet__item-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 18px;
  font-size: 13px;
  color: var(--sheet-muted);
}

.itinerary-sheet__item-note {
  font-size: 13px;
  color: var(--sheet-muted);
}

.itinerary-sheet__item-note--warn {
  color: var(--sheet-action);
}

.itinerary-sheet__leg {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-left: 130px;
  padding: 2px 6px 8px;
}

.itinerary-sheet__leg-arrow {
  flex: none;
  color: var(--sheet-accent);
  font-size: 14px;
  line-height: 1.45;
}

.itinerary-sheet__leg-text {
  font-size: 13.5px;
  color: var(--sheet-muted);
}

.itinerary-sheet__leg--fallback .itinerary-sheet__leg-text,
.itinerary-sheet__leg--missing .itinerary-sheet__leg-text {
  color: var(--sheet-action);
}

.itinerary-sheet__block {
  margin-top: 24px;
  background: var(--sheet-wash);
  border: 1px solid var(--sheet-line);
  border-radius: 8px;
  padding: 14px 18px;
}

.itinerary-sheet__block h3 {
  font-size: 15px;
  color: var(--sheet-ink);
  margin-bottom: 8px;
}

.itinerary-sheet__block-note {
  font-size: 12.5px;
  color: var(--sheet-action);
  margin-bottom: 8px;
}

.itinerary-sheet__block li {
  font-size: 13.5px;
  color: var(--sheet-muted);
  padding: 3px 0 3px 16px;
  position: relative;
}

.itinerary-sheet__block li::before {
  content: '·';
  position: absolute;
  left: 4px;
  color: var(--sheet-accent);
  font-weight: 700;
}

.itinerary-sheet__block li b {
  color: var(--sheet-ink);
}

.itinerary-sheet__footer {
  margin-top: 26px;
  border-top: 1px solid var(--sheet-line);
  padding-top: 12px;
  font-size: 12px;
  color: var(--sheet-muted);
}
.itinerary-sheet--duck {
  --sheet-ink: #4b291b;
  --sheet-accent: #b98423;
  --sheet-action: #c46c29;
  --sheet-muted: #79604c;
  --sheet-wash: #ece0c7;
}
.itinerary-sheet__day-header h2,
.itinerary-sheet__item--attraction .itinerary-sheet__time {
  color: var(--sheet-action);
}
</style>
