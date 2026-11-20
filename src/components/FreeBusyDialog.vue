<script setup lang="ts">
import { ref, watch } from 'vue'
import { getCalDAVClient } from '../caldav/client'
import { t } from '../composables/useLanguage'
import { formatDateForInput } from '../utils/date'
import type { Calendar, FreeBusyPeriod, FreeBusyResult } from '../types/calendar'

const props = defineProps<{
  isOpen: boolean
  calendars: readonly Calendar[]
  initialDate?: Date
}>()

const emit = defineEmits<{
  close: []
}>()

const client = getCalDAVClient()
const selectedDate = ref(formatDateForInput(props.initialDate || new Date()))
const selectedCalendarHrefs = ref<string[]>([])
const loading = ref(false)
const results = ref<FreeBusyResult[]>([])
const hours = Array.from({ length: 16 }, (_, i) => i + 7) // 07:00 - 22:00

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      selectedDate.value = formatDateForInput(props.initialDate || new Date())
      selectedCalendarHrefs.value = props.calendars.map((c) => c.href)
      results.value = []
      if (props.calendars.length > 0) {
        checkAvailability()
      }
    }
  }
)

function toggleCalendar(href: string) {
  if (selectedCalendarHrefs.value.includes(href)) {
    selectedCalendarHrefs.value = selectedCalendarHrefs.value.filter((h) => h !== href)
  } else {
    selectedCalendarHrefs.value = [...selectedCalendarHrefs.value, href]
  }
}

async function checkAvailability() {
  if (!selectedDate.value || selectedCalendarHrefs.value.length === 0) return
  loading.value = true

  const dayStart = new Date(`${selectedDate.value}T00:00:00`)
  const dayEnd = new Date(`${selectedDate.value}T23:59:59`)

  const targetCalendars = props.calendars.filter((c) =>
    selectedCalendarHrefs.value.includes(c.href)
  )

  try {
    results.value = await Promise.all(
      targetCalendars.map(async (cal) => {
        try {
          const periods = await client.fetchFreeBusy(cal.href, dayStart, dayEnd)
          return {
            calendarHref: cal.href,
            calendarName: cal.displayName,
            color: cal.color,
            periods
          }
        } catch (err) {
          return {
            calendarHref: cal.href,
            calendarName: cal.displayName,
            color: cal.color,
            periods: [] as FreeBusyPeriod[],
            error: err instanceof Error ? err.message : String(err)
          }
        }
      })
    )
  } finally {
    loading.value = false
  }
}

function getBlockStyle(period: FreeBusyPeriod) {
  const dayBase = new Date(`${selectedDate.value}T07:00:00`).getTime()
  const dayEnd = new Date(`${selectedDate.value}T23:00:00`).getTime()
  const totalMs = dayEnd - dayBase

  const clampedStart = Math.max(period.start.getTime(), dayBase)
  const clampedEnd = Math.min(period.end.getTime(), dayEnd)
  if (clampedEnd <= clampedStart) return { display: 'none' }

  const leftPct = ((clampedStart - dayBase) / totalMs) * 100
  const widthPct = ((clampedEnd - clampedStart) / totalMs) * 100

  return {
    left: `${leftPct}%`,
    width: `${Math.max(widthPct, 1)}%`
  }
}

function formatPeriodTooltip(period: FreeBusyPeriod): string {
  const fmt = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const label =
    period.type === 'BUSY-TENTATIVE'
      ? t('Busy (Tentative)')
      : period.type === 'BUSY-UNAVAILABLE'
        ? t('Unavailable')
        : t('Busy')
  return `${fmt(period.start)} – ${fmt(period.end)} (${label})`
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="ext:fixed ext:inset-0 ext:z-50 ext:flex ext:items-center ext:justify-center ext:p-4 ext:bg-black/50"
      @click.self="emit('close')"
    >
      <div class="ext:bg-white ext:rounded-lg ext:shadow-xl ext:w-full ext:max-w-4xl ext:max-h-[90vh] ext:flex ext:flex-col">
        <div class="ext:px-6 ext:py-4 ext:border-b ext:border-gray-200 ext:flex ext:items-center ext:justify-between">
          <h2 class="ext:text-lg ext:font-semibold ext:text-gray-900">
            {{ t('Free / Busy Availability') }}
          </h2>
          <button
            type="button"
            class="ext:text-gray-400 hover:ext:text-gray-600"
            @click="emit('close')"
          >
            <svg class="ext:w-6 ext:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="ext:p-6 ext:overflow-y-auto ext:flex-1 ext:space-y-5">
          <!-- Controls -->
          <div class="ext:flex ext:flex-wrap ext:items-end ext:gap-4">
            <div>
              <label for="fb-date" class="ext:block ext:text-xs ext:font-medium ext:text-gray-700 ext:mb-1">
                {{ t('Date') }}
              </label>
              <input
                id="fb-date"
                v-model="selectedDate"
                type="date"
                class="ext:px-3 ext:py-1.5 ext:text-sm ext:border ext:border-gray-300 ext:rounded"
              />
            </div>

            <div class="ext:flex-1 ext:min-w-[200px]">
              <div class="ext:text-xs ext:font-medium ext:text-gray-700 ext:mb-1">
                {{ t('Select calendars') }}
              </div>
              <div class="ext:flex ext:flex-wrap ext:gap-2">
                <label
                  v-for="cal in calendars"
                  :key="cal.href"
                  class="ext:inline-flex ext:items-center ext:gap-1.5 ext:px-2 ext:py-1 ext:text-xs ext:rounded ext:border ext:border-gray-300 ext:bg-gray-50 ext:cursor-pointer"
                >
                  <input
                    type="checkbox"
                    :checked="selectedCalendarHrefs.includes(cal.href)"
                    class="ext:w-3.5 ext:h-3.5"
                    @change="toggleCalendar(cal.href)"
                  />
                  <span
                    class="ext:w-2.5 ext:h-2.5 ext:rounded-full"
                    :style="{ backgroundColor: cal.color }"
                  />
                  <span class="ext:text-gray-900">{{ cal.displayName }}</span>
                </label>
              </div>
            </div>

            <button
              type="button"
              class="ext:px-4 ext:py-2 ext:bg-blue-600 ext:text-white ext:text-sm ext:font-medium ext:rounded hover:ext:bg-blue-700 disabled:ext:opacity-50"
              :disabled="loading || selectedCalendarHrefs.length === 0"
              @click="checkAvailability"
            >
              {{ loading ? t('Checking...') : t('Check Availability') }}
            </button>
          </div>

          <!-- Timeline Grid -->
          <div v-if="results.length > 0" class="ext:border ext:border-gray-200 ext:rounded-lg ext:overflow-x-auto">
            <div class="ext:min-w-[640px]">
              <!-- Hour header -->
              <div class="ext:flex ext:border-b ext:border-gray-200 ext:bg-gray-50">
                <div class="ext:w-40 ext:shrink-0 ext:px-3 ext:py-2 ext:text-xs ext:font-semibold ext:text-gray-600">
                  {{ t('Calendar') }}
                </div>
                <div class="ext:flex-1 ext:grid ext:grid-cols-16">
                  <div
                    v-for="h in hours"
                    :key="h"
                    class="ext:text-[10px] ext:text-gray-500 ext:border-l ext:border-gray-200 ext:py-2 ext:text-center"
                  >
                    {{ String(h).padStart(2, '0') }}
                  </div>
                </div>
              </div>

              <!-- Rows -->
              <div
                v-for="res in results"
                :key="res.calendarHref"
                class="ext:flex ext:items-center ext:border-b ext:border-gray-200 last:ext:border-b-0"
              >
                <div class="ext:w-40 ext:shrink-0 ext:px-3 ext:py-3 ext:flex ext:items-center ext:gap-2 ext:min-w-0">
                  <span
                    class="ext:w-2.5 ext:h-2.5 ext:rounded-full ext:shrink-0"
                    :style="{ backgroundColor: res.color }"
                  />
                  <span class="ext:text-xs ext:font-medium ext:text-gray-900 ext:truncate">
                    {{ res.calendarName }}
                  </span>
                </div>

                <div class="ext:flex-1 ext:relative ext:h-10 ext:bg-white">
                  <!-- Hour grid lines -->
                  <div class="ext:absolute ext:inset-0 ext:grid ext:grid-cols-16 ext:pointer-events-none">
                    <div
                      v-for="h in hours"
                      :key="h"
                      class="ext:border-l ext:border-gray-100"
                    />
                  </div>

                  <!-- Error or empty -->
                  <div
                    v-if="res.error"
                    class="ext:absolute ext:inset-0 ext:flex ext:items-center ext:px-3 ext:text-xs ext:text-red-600"
                  >
                    {{ res.error }}
                  </div>
                  <div
                    v-else-if="res.periods.length === 0"
                    class="ext:absolute ext:inset-0 ext:flex ext:items-center ext:px-3 ext:text-xs ext:text-gray-400"
                  >
                    {{ t('No busy periods') }}
                  </div>

                  <!-- Busy blocks -->
                  <div
                    v-for="(period, idx) in res.periods"
                    :key="idx"
                    class="ext:absolute ext:top-1.5 ext:bottom-1.5 ext:rounded ext:opacity-85"
                    :class="period.type === 'BUSY-TENTATIVE' ? 'ext:border ext:border-dashed ext:opacity-60' : ''"
                    :style="{
                      ...getBlockStyle(period),
                      backgroundColor: res.color
                    }"
                    :title="formatPeriodTooltip(period)"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="ext:px-6 ext:py-4 ext:border-t ext:border-gray-200 ext:bg-gray-50 ext:flex ext:justify-end">
          <button
            type="button"
            class="ext:px-4 ext:py-2 ext:text-sm ext:text-gray-700 ext:bg-gray-200 ext:rounded hover:ext:bg-gray-300"
            @click="emit('close')"
          >
            {{ t('Close') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
