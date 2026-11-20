<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { getLanguage } from '../composables/useLanguage'
import type { CalendarEvent } from '../types/calendar'

const props = defineProps<{
  currentDate: Date
  events: readonly CalendarEvent[]
}>()

const emit = defineEmits<{
  'select-date': [date: Date]
}>()

const displayMonth = ref(new Date(props.currentDate.getFullYear(), props.currentDate.getMonth(), 1))

watch(
  () => props.currentDate,
  (newDate) => {
    displayMonth.value = new Date(newDate.getFullYear(), newDate.getMonth(), 1)
  }
)

const locale = computed(() => getLanguage())

const monthLabel = computed(() =>
  displayMonth.value.toLocaleDateString(locale.value, { month: 'long', year: 'numeric' })
)

const weekdayHeaders = computed(() => {
  // Monday-first short weekday names
  const base = new Date(2024, 0, 1) // Monday
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    return d.toLocaleDateString(locale.value, { weekday: 'narrow' })
  })
})

const eventDaySet = computed(() => {
  const set = new Set<string>()
  for (const e of props.events) {
    const d = e.start
    set.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`)
  }
  return set
})

interface MiniDay {
  date: Date
  inMonth: boolean
  isToday: boolean
  isSelected: boolean
  hasEvent: boolean
}

const days = computed<MiniDay[]>(() => {
  const year = displayMonth.value.getFullYear()
  const month = displayMonth.value.getMonth()
  const firstOfMonth = new Date(year, month, 1)
  const startDow = (firstOfMonth.getDay() + 6) % 7 // Monday = 0
  const gridStart = new Date(year, month, 1 - startDow)

  const today = new Date()
  const sel = props.currentDate

  return Array.from({ length: 42 }, (_, idx) => {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + idx)
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    return {
      date: d,
      inMonth: d.getMonth() === month,
      isToday:
        d.getFullYear() === today.getFullYear() &&
        d.getMonth() === today.getMonth() &&
        d.getDate() === today.getDate(),
      isSelected:
        d.getFullYear() === sel.getFullYear() &&
        d.getMonth() === sel.getMonth() &&
        d.getDate() === sel.getDate(),
      hasEvent: eventDaySet.value.has(key)
    }
  })
})

function prevMonth() {
  displayMonth.value = new Date(
    displayMonth.value.getFullYear(),
    displayMonth.value.getMonth() - 1,
    1
  )
}

function nextMonth() {
  displayMonth.value = new Date(
    displayMonth.value.getFullYear(),
    displayMonth.value.getMonth() + 1,
    1
  )
}
</script>

<template>
  <div class="ext:mb-5 ext:select-none">
    <div class="ext:flex ext:items-center ext:justify-between ext:mb-2">
      <button
        type="button"
        class="ext:p-1 ext:text-gray-500 hover:ext:text-gray-700 hover:ext:bg-gray-200 ext:rounded"
        @click="prevMonth"
      >
        <svg class="ext:w-3.5 ext:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <span class="ext:text-xs ext:font-semibold ext:text-gray-700 ext:capitalize">
        {{ monthLabel }}
      </span>
      <button
        type="button"
        class="ext:p-1 ext:text-gray-500 hover:ext:text-gray-700 hover:ext:bg-gray-200 ext:rounded"
        @click="nextMonth"
      >
        <svg class="ext:w-3.5 ext:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>

    <div class="ext:grid ext:grid-cols-7 ext:gap-0.5 ext:text-center ext:mb-1">
      <div
        v-for="(w, i) in weekdayHeaders"
        :key="i"
        class="ext:text-[10px] ext:font-medium ext:text-gray-500"
      >
        {{ w }}
      </div>
    </div>

    <div class="ext:grid ext:grid-cols-7 ext:gap-0.5 ext:text-center">
      <button
        v-for="(day, idx) in days"
        :key="idx"
        type="button"
        class="ext:relative ext:h-7 ext:w-7 ext:mx-auto ext:flex ext:flex-col ext:items-center ext:justify-center ext:text-xs ext:rounded-full ext:transition-colors"
        :class="[
          day.isToday
            ? 'ext:bg-blue-600 ext:text-white ext:font-bold'
            : day.isSelected
              ? 'ext:bg-blue-100 ext:text-blue-700 ext:font-semibold'
              : day.inMonth
                ? 'ext:text-gray-900 hover:ext:bg-gray-200'
                : 'ext:text-gray-400 hover:ext:bg-gray-100'
        ]"
        @click="emit('select-date', day.date)"
      >
        <span>{{ day.date.getDate() }}</span>
        <span
          v-if="day.hasEvent"
          class="ext:w-1 ext:h-1 ext:rounded-full ext:absolute ext:bottom-0.5"
          :class="day.isToday ? 'ext:bg-white' : 'ext:bg-blue-500'"
        />
      </button>
    </div>
  </div>
</template>
