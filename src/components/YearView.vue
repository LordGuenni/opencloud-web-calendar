<script setup lang="ts">
import { computed } from 'vue'
import { getLanguage } from '../composables/useLanguage'
import type { Calendar, CalendarEvent } from '../types/calendar'

const props = defineProps<{
  currentDate: Date
  events: readonly CalendarEvent[]
  calendars: readonly Calendar[]
}>()

const emit = defineEmits<{
  'select-date': [date: Date]
  'select-month': [date: Date]
}>()

const locale = computed(() => getLanguage())
const year = computed(() => props.currentDate.getFullYear())

const weekdayHeaders = computed(() => {
  const base = new Date(2024, 0, 1) // Monday
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    return d.toLocaleDateString(locale.value, { weekday: 'narrow' })
  })
})

const calendarColorMap = computed(() => {
  const map = new Map<string, string>()
  for (const cal of props.calendars) {
    map.set(cal.href, cal.color)
  }
  return map
})

const dayColorsMap = computed(() => {
  const map = new Map<string, string[]>()
  for (const e of props.events) {
    if (e.start.getFullYear() !== year.value && e.end.getFullYear() !== year.value) continue
    const key = `${e.start.getFullYear()}-${e.start.getMonth()}-${e.start.getDate()}`
    const color =
      e.virtualType === 'birthday'
        ? '#ec4899'
        : calendarColorMap.value.get(e.calendarHref) || '#3788d8'
    if (!map.has(key)) map.set(key, [])
    const arr = map.get(key)!
    if (arr.length < 3 && !arr.includes(color)) {
      arr.push(color)
    }
  }
  return map
})

const months = computed(() => {
  const today = new Date()
  return Array.from({ length: 12 }, (_, m) => {
    const first = new Date(year.value, m, 1)
    const label = first.toLocaleDateString(locale.value, { month: 'long' })
    const startDow = (first.getDay() + 6) % 7
    const gridStart = new Date(year.value, m, 1 - startDow)

    const days = Array.from({ length: 42 }, (_, idx) => {
      const d = new Date(gridStart)
      d.setDate(gridStart.getDate() + idx)
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      return {
        date: d,
        inMonth: d.getMonth() === m,
        isToday:
          d.getFullYear() === today.getFullYear() &&
          d.getMonth() === today.getMonth() &&
          d.getDate() === today.getDate(),
        colors: dayColorsMap.value.get(key) || []
      }
    })

    return { monthIndex: m, firstDate: first, label, days }
  })
})
</script>

<template>
  <div class="ext:flex-1 ext:overflow-y-auto ext:p-4 sm:ext:p-6 ext:bg-white">
    <div class="ext:grid ext:grid-cols-1 sm:ext:grid-cols-2 lg:ext:grid-cols-3 xl:ext:grid-cols-4 ext:gap-5 ext:max-w-7xl ext:mx-auto">
      <div
        v-for="month in months"
        :key="month.monthIndex"
        class="ext:p-3 ext:rounded-lg ext:border ext:border-gray-200 ext:bg-gray-50"
      >
        <button
          type="button"
          class="ext:w-full ext:text-left ext:text-sm ext:font-semibold ext:text-gray-900 hover:ext:text-blue-600 ext:mb-2 ext:capitalize"
          @click="emit('select-month', month.firstDate)"
        >
          {{ month.label }}
        </button>

        <div class="ext:grid ext:grid-cols-7 ext:gap-0.5 ext:text-center ext:mb-1">
          <div
            v-for="(w, idx) in weekdayHeaders"
            :key="idx"
            class="ext:text-[10px] ext:font-medium ext:text-gray-500"
          >
            {{ w }}
          </div>
        </div>

        <div class="ext:grid ext:grid-cols-7 ext:gap-0.5 ext:text-center">
          <button
            v-for="(day, idx) in month.days"
            :key="idx"
            type="button"
            class="ext:relative ext:h-7 ext:flex ext:flex-col ext:items-center ext:justify-center ext:text-xs ext:rounded ext:transition-colors"
            :class="[
              day.isToday
                ? 'ext:bg-blue-600 ext:text-white ext:font-bold'
                : day.inMonth
                  ? 'ext:text-gray-900 hover:ext:bg-gray-200'
                  : 'ext:text-gray-400 hover:ext:bg-gray-100'
            ]"
            @click="emit('select-date', day.date)"
          >
            <span>{{ day.date.getDate() }}</span>
            <span v-if="day.colors.length > 0" class="ext:flex ext:gap-0.5 ext:mt-0.5">
              <span
                v-for="(c, ci) in day.colors"
                :key="ci"
                class="ext:w-1 ext:h-1 ext:rounded-full"
                :style="{ backgroundColor: day.isToday ? '#ffffff' : c }"
              />
            </span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
