<script setup lang="ts">
import { computed } from 'vue'
import { t, getLanguage } from '../composables/useLanguage'
import type { Calendar, CalendarEvent } from '../types/calendar'

const props = defineProps<{
  events: readonly CalendarEvent[]
  calendars: readonly Calendar[]
  currentDate: Date
}>()

const emit = defineEmits<{
  'event-click': [event: CalendarEvent]
}>()

const locale = computed(() => getLanguage())

const calendarMap = computed(() => {
  const map = new Map<string, Calendar>()
  for (const cal of props.calendars) {
    map.set(cal.href, cal)
  }
  return map
})

interface DayGroup {
  dateKey: string
  date: Date
  isToday: boolean
  events: CalendarEvent[]
}

const groupedDays = computed<DayGroup[]>(() => {
  const startOfPeriod = new Date(props.currentDate.getFullYear(), props.currentDate.getMonth(), 1)
  const endOfPeriod = new Date(props.currentDate.getFullYear(), props.currentDate.getMonth() + 2, 0, 23, 59, 59)

  const filtered = props.events
    .filter((e) => e.end >= startOfPeriod && e.start <= endOfPeriod)
    .slice()
    .sort((a, b) => a.start.getTime() - b.start.getTime())

  const groups = new Map<string, DayGroup>()
  const today = new Date()

  for (const event of filtered) {
    const d = new Date(event.start.getFullYear(), event.start.getMonth(), event.start.getDate())
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (!groups.has(key)) {
      groups.set(key, {
        dateKey: key,
        date: d,
        isToday:
          d.getFullYear() === today.getFullYear() &&
          d.getMonth() === today.getMonth() &&
          d.getDate() === today.getDate(),
        events: []
      })
    }
    groups.get(key)!.events.push(event)
  }

  return Array.from(groups.values()).sort((a, b) => a.date.getTime() - b.date.getTime())
})

function formatDayHeader(date: Date): string {
  return date.toLocaleDateString(locale.value, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
}

function formatTimeRange(event: CalendarEvent): string {
  if (event.allDay) return t('All day')
  const fmt = (d: Date) =>
    d.toLocaleTimeString(locale.value, { hour: '2-digit', minute: '2-digit' })
  return `${fmt(event.start)} – ${fmt(event.end)}`
}

function getEventColor(event: CalendarEvent): string {
  if (event.virtualType === 'birthday') return '#ec4899'
  return calendarMap.value.get(event.calendarHref)?.color || '#3788d8'
}

function getCalendarName(event: CalendarEvent): string {
  if (event.virtualType === 'birthday') return t('Contacts')
  return calendarMap.value.get(event.calendarHref)?.displayName || ''
}
</script>

<template>
  <div class="ext:flex-1 ext:overflow-y-auto ext:p-4 sm:ext:p-6 ext:bg-white">
    <div v-if="groupedDays.length === 0" class="ext:flex ext:flex-col ext:items-center ext:justify-center ext:h-64 ext:text-gray-500">
      <svg class="ext:w-12 ext:h-12 ext:mb-3 ext:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
      <p class="ext:text-sm">{{ t('No events found in this period') }}</p>
    </div>

    <div v-else class="ext:max-w-4xl ext:mx-auto ext:space-y-6">
      <section v-for="group in groupedDays" :key="group.dateKey">
        <div
          class="ext:flex ext:items-center ext:gap-2 ext:pb-2 ext:mb-2 ext:border-b ext:border-gray-200"
        >
          <span
            v-if="group.isToday"
            class="ext:px-2 ext:py-0.5 ext:text-xs ext:font-semibold ext:bg-blue-600 ext:text-white ext:rounded-full"
          >
            {{ t('Today') }}
          </span>
          <h3 class="ext:text-sm ext:font-semibold ext:text-gray-900 ext:capitalize">
            {{ formatDayHeader(group.date) }}
          </h3>
        </div>

        <ul class="ext:space-y-2">
          <li
            v-for="event in group.events"
            :key="event.recurrenceId ? `${event.uid}_${event.recurrenceId}` : event.uid"
            class="ext:flex ext:items-start ext:gap-3 ext:p-3 ext:rounded-lg ext:border ext:border-gray-200 ext:bg-gray-50 hover:ext:bg-gray-100 ext:cursor-pointer ext:transition-colors"
            :class="{
              'ext:opacity-60': event.status === 'CANCELLED',
              'ext:border-dashed': event.status === 'TENTATIVE'
            }"
            @click="emit('event-click', event)"
          >
            <div
              class="ext:w-1.5 ext:self-stretch ext:rounded-full ext:shrink-0"
              :style="{ backgroundColor: getEventColor(event) }"
            />
            <div class="ext:w-28 sm:ext:w-32 ext:shrink-0 ext:text-xs ext:font-medium ext:text-gray-600 ext:pt-0.5">
              {{ formatTimeRange(event) }}
            </div>
            <div class="ext:flex-1 ext:min-w-0">
              <div class="ext:flex ext:items-center ext:gap-2 ext:flex-wrap">
                <span
                  class="ext:text-sm ext:font-semibold ext:text-gray-900"
                  :class="{ 'ext:line-through': event.status === 'CANCELLED' }"
                >
                  {{ event.summary }}
                </span>
                <span
                  v-if="event.status === 'TENTATIVE'"
                  class="ext:px-1.5 ext:py-0.5 ext:text-[10px] ext:font-medium ext:bg-yellow-100 ext:text-yellow-800 ext:rounded"
                >
                  {{ t('Tentative') }}
                </span>
                <span
                  v-if="event.status === 'CANCELLED'"
                  class="ext:px-1.5 ext:py-0.5 ext:text-[10px] ext:font-medium ext:bg-red-100 ext:text-red-700 ext:rounded"
                >
                  {{ t('Cancelled') }}
                </span>
                <span
                  v-if="event.isRecurring"
                  class="ext:text-xs ext:text-gray-400"
                  :title="event.rrule"
                >
                  ↻
                </span>
                <span
                  v-if="event.alarms && event.alarms.length > 0"
                  class="ext:text-xs ext:text-gray-400"
                  :title="t('Reminders')"
                >
                  🔔
                </span>
              </div>

              <div v-if="event.location || event.url" class="ext:flex ext:items-center ext:gap-3 ext:mt-1 ext:text-xs ext:text-gray-600 ext:flex-wrap">
                <span v-if="event.location" class="ext:truncate">📍 {{ event.location }}</span>
                <a
                  v-if="event.url"
                  :href="event.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="ext:text-blue-600 hover:ext:underline ext:truncate"
                  @click.stop
                >
                  🔗 {{ event.url }}
                </a>
              </div>

              <p v-if="event.description" class="ext:text-xs ext:text-gray-500 ext:mt-1 ext:line-clamp-2">
                {{ event.description }}
              </p>

              <div v-if="(event.categories && event.categories.length > 0) || getCalendarName(event)" class="ext:flex ext:items-center ext:gap-1.5 ext:mt-1.5 ext:flex-wrap">
                <span
                  v-if="getCalendarName(event)"
                  class="ext:text-[10px] ext:px-1.5 ext:py-0.5 ext:rounded ext:bg-gray-200 ext:text-gray-700"
                >
                  {{ getCalendarName(event) }}
                </span>
                <span
                  v-for="cat in event.categories || []"
                  :key="cat"
                  class="ext:text-[10px] ext:px-1.5 ext:py-0.5 ext:rounded ext:bg-blue-100 ext:text-blue-700"
                >
                  #{{ cat }}
                </span>
              </div>
            </div>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
