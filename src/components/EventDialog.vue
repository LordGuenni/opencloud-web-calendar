<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useEventEditor } from '../composables/useEventEditor'
import type {
  Calendar,
  EventAlarm,
  EventClassification,
  EventStatus,
  EventTransp,
  RecurrenceFormData
} from '../types/calendar'
import { formatDateForInput, formatTimeForInput } from '../utils/date'
import { t } from '../composables/useLanguage'
import { generateICS } from '../caldav/ics-utils'
import { useLocationSearch } from '../composables/useLocationSearch'

const props = defineProps<{
  calendars: readonly Calendar[]
}>()

const emit = defineEmits<{
  saved: []
  deleted: []
}>()

const {
  isOpen,
  isEditing,
  editingEvent,
  formData,
  saving,
  error,
  conflictData,
  editScope,
  showScopeDialog,
  close,
  save,
  deleteEvent,
  selectEditScope,
  cancelScopeDialog,
  resolveConflictKeepLocal,
  resolveConflictUseServer
} = useEventEditor()

const {
  results: locationResults,
  loading: searchingLocation,
  search: searchLocation,
  clearResults: clearLocationResults
} = useLocationSearch()

const showMoreOptions = ref(false)
const categoryInput = ref('')

const localTimeZone =
  typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC'

const COMMON_TIMEZONES = Array.from(
  new Set([
    localTimeZone,
    'UTC',
    'Europe/Berlin',
    'Europe/London',
    'Europe/Paris',
    'Europe/Zurich',
    'Europe/Vienna',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'Asia/Tokyo',
    'Asia/Shanghai',
    'Asia/Kolkata',
    'Australia/Sydney'
  ])
)

const ALARM_PRESETS = [
  { minutes: 0, label: 'At time of event' },
  { minutes: 5, label: '5 minutes before' },
  { minutes: 15, label: '15 minutes before' },
  { minutes: 30, label: '30 minutes before' },
  { minutes: 60, label: '1 hour before' },
  { minutes: 120, label: '2 hours before' },
  { minutes: 1440, label: '1 day before' },
  { minutes: 10080, label: '1 week before' }
]

const MONTHLY_POSITIONS = [
  { value: 1, label: 'First' },
  { value: 2, label: 'Second' },
  { value: 3, label: 'Third' },
  { value: 4, label: 'Fourth' },
  { value: -1, label: 'Last' }
]

watch(isOpen, (open) => {
  if (open) {
    categoryInput.value = ''
    showMoreOptions.value = Boolean(
      formData.value.timezone ||
        (formData.value.status && formData.value.status !== 'CONFIRMED') ||
        (formData.value.transp && formData.value.transp !== 'OPAQUE') ||
        (formData.value.classification && formData.value.classification !== 'PUBLIC')
    )
  }
})

function handleLocationInput(e: Event) {
  const query = (e.target as HTMLInputElement).value
  searchLocation(query)
}

function selectLocation(displayName: string) {
  formData.value.location = displayName
  clearLocationResults()
}

function handleLocationBlur() {
  setTimeout(() => {
    clearLocationResults()
  }, 200)
}

const WEEKDAYS = [
  { value: 'MO', label: 'Mon' },
  { value: 'TU', label: 'Tue' },
  { value: 'WE', label: 'Wed' },
  { value: 'TH', label: 'Thu' },
  { value: 'FR', label: 'Fri' },
  { value: 'SA', label: 'Sat' },
  { value: 'SU', label: 'Sun' }
]

const hasRecurrence = computed({
  get: () => !!formData.value.recurrence,
  set: (val: boolean) => {
    if (val) {
      const startDay = formData.value.start
      const weekdayValues = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
      const weekday = weekdayValues[startDay.getDay()]
      const nth = Math.ceil(startDay.getDate() / 7)
      formData.value.recurrence = {
        frequency: 'WEEKLY',
        interval: 1,
        endType: 'never',
        monthlyMode: 'dayOfMonth',
        monthlyWeekday: weekday,
        monthlyPosition: nth > 4 ? -1 : nth
      }
    } else {
      formData.value.recurrence = undefined
    }
  }
})

const recurrenceFrequency = computed({
  get: () => formData.value.recurrence?.frequency || 'WEEKLY',
  set: (val: RecurrenceFormData['frequency']) => {
    if (formData.value.recurrence) {
      formData.value.recurrence = { ...formData.value.recurrence, frequency: val }
    }
  }
})

const recurrenceInterval = computed({
  get: () => formData.value.recurrence?.interval || 1,
  set: (val: number) => {
    if (formData.value.recurrence) {
      formData.value.recurrence = { ...formData.value.recurrence, interval: val }
    }
  }
})

const recurrenceMonthlyMode = computed({
  get: () => formData.value.recurrence?.monthlyMode || 'dayOfMonth',
  set: (val: 'dayOfMonth' | 'dayOfWeek') => {
    if (formData.value.recurrence) {
      const weekdayValues = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
      const startDay = formData.value.start
      formData.value.recurrence = {
        ...formData.value.recurrence,
        monthlyMode: val,
        monthlyWeekday: formData.value.recurrence.monthlyWeekday || weekdayValues[startDay.getDay()],
        monthlyPosition:
          formData.value.recurrence.monthlyPosition || Math.min(4, Math.ceil(startDay.getDate() / 7))
      }
    }
  }
})

const recurrenceMonthlyPosition = computed({
  get: () => formData.value.recurrence?.monthlyPosition || 1,
  set: (val: number) => {
    if (formData.value.recurrence) {
      formData.value.recurrence = { ...formData.value.recurrence, monthlyPosition: val }
    }
  }
})

const recurrenceMonthlyWeekday = computed({
  get: () => formData.value.recurrence?.monthlyWeekday || 'MO',
  set: (val: string) => {
    if (formData.value.recurrence) {
      formData.value.recurrence = { ...formData.value.recurrence, monthlyWeekday: val }
    }
  }
})

const recurrenceEndType = computed({
  get: () => formData.value.recurrence?.endType || 'never',
  set: (val: RecurrenceFormData['endType']) => {
    if (formData.value.recurrence) {
      formData.value.recurrence = { ...formData.value.recurrence, endType: val }
    }
  }
})

const recurrenceCount = computed({
  get: () => formData.value.recurrence?.count || 10,
  set: (val: number) => {
    if (formData.value.recurrence) {
      formData.value.recurrence = { ...formData.value.recurrence, count: val }
    }
  }
})

const recurrenceUntil = computed({
  get: () => {
    const d = formData.value.recurrence?.until
    return d ? formatDateForInput(d) : ''
  },
  set: (val: string) => {
    if (formData.value.recurrence && val) {
      formData.value.recurrence = {
        ...formData.value.recurrence,
        until: new Date(val + 'T23:59:59')
      }
    }
  }
})

function isWeekdaySelected(day: string): boolean {
  return formData.value.recurrence?.byDay?.includes(day) || false
}

function toggleWeekday(day: string) {
  if (!formData.value.recurrence) return
  const current = formData.value.recurrence.byDay || []
  const newDays = current.includes(day) ? current.filter((d) => d !== day) : [...current, day]
  formData.value.recurrence = {
    ...formData.value.recurrence,
    byDay: newDays.length > 0 ? newDays : undefined
  }
}

const startDate = computed({
  get: () => formatDateForInput(formData.value.start),
  set: (val: string) => {
    const newDate = new Date(val + 'T' + formatTimeForInput(formData.value.start))
    formData.value.start = newDate
  }
})

const startTime = computed({
  get: () => formatTimeForInput(formData.value.start),
  set: (val: string) => {
    const newDate = new Date(formatDateForInput(formData.value.start) + 'T' + val)
    formData.value.start = newDate
  }
})

const endDate = computed({
  get: () => formatDateForInput(formData.value.end),
  set: (val: string) => {
    const newDate = new Date(val + 'T' + formatTimeForInput(formData.value.end))
    formData.value.end = newDate
  }
})

const endTime = computed({
  get: () => formatTimeForInput(formData.value.end),
  set: (val: string) => {
    const newDate = new Date(formatDateForInput(formData.value.end) + 'T' + val)
    formData.value.end = newDate
  }
})

watch(
  () => formData.value.allDay,
  (allDay) => {
    if (allDay) {
      const start = new Date(formData.value.start)
      start.setHours(0, 0, 0, 0)
      formData.value.start = start

      const end = new Date(formData.value.end)
      end.setHours(23, 59, 59, 999)
      formData.value.end = end
    }
  }
)

const writableCalendars = computed(() => {
  return props.calendars.filter((cal) => !cal.readOnly)
})

const isReadOnly = computed(() => {
  const calendar = props.calendars.find((c) => c.href === formData.value.calendarHref)
  return calendar?.readOnly || false
})

const canChangeCalendar = computed(() => {
  return !isReadOnly.value && editScope.value !== 'single' && writableCalendars.value.length > 0
})

function addAlarm() {
  if (!formData.value.alarms) formData.value.alarms = []
  const existing = new Set(formData.value.alarms.map((a) => a.triggerMinutes))
  const nextDefault = [15, 30, 60, 1440, 0].find((m) => !existing.has(m)) ?? 15
  formData.value.alarms.push({ triggerMinutes: nextDefault })
}

function updateAlarmMinutes(index: number, minutes: number) {
  if (!formData.value.alarms) return
  const next: EventAlarm[] = formData.value.alarms.map((a, i) =>
    i === index ? { ...a, triggerMinutes: minutes } : a
  )
  formData.value.alarms = next
}

function removeAlarm(index: number) {
  if (!formData.value.alarms) return
  formData.value.alarms = formData.value.alarms.filter((_, i) => i !== index)
}

function addCategory() {
  const tag = categoryInput.value.trim()
  if (!tag) return
  if (!formData.value.categories) formData.value.categories = []
  if (!formData.value.categories.includes(tag)) {
    formData.value.categories = [...formData.value.categories, tag]
  }
  categoryInput.value = ''
}

function removeCategory(tag: string) {
  formData.value.categories = (formData.value.categories || []).filter((c) => c !== tag)
}

const isValidHttpUrl = computed(() => {
  const raw = formData.value.url?.trim()
  if (!raw) return false
  try {
    const parsed = new URL(raw)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
})

async function handleSave() {
  if (isReadOnly.value) return
  const result = await save()
  if (result) {
    emit('saved')
  }
}

async function handleDelete() {
  if (isReadOnly.value) return
  const success = await deleteEvent()
  if (success) {
    emit('deleted')
  }
}

function handleClose() {
  close()
}

function handleExport() {
  if (!editingEvent.value) return

  let icsContent: string

  if (editScope.value === 'single') {
    icsContent = generateICS({
      ...formData.value,
      uid: editingEvent.value.uid,
      recurrence: undefined
    })
  } else {
    icsContent = editingEvent.value.icsData
  }

  const safeName = (formData.value.summary || 'event').replace(/[^a-zA-Z0-9_\- ]/g, '_').trim()
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeName}.ics`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

const statusOptions: Array<{ value: EventStatus; label: string }> = [
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'TENTATIVE', label: 'Tentative' },
  { value: 'CANCELLED', label: 'Cancelled' }
]

const transpOptions: Array<{ value: EventTransp; label: string }> = [
  { value: 'OPAQUE', label: 'Busy' },
  { value: 'TRANSPARENT', label: 'Free' }
]

const classOptions: Array<{ value: EventClassification; label: string }> = [
  { value: 'PUBLIC', label: 'Public' },
  { value: 'PRIVATE', label: 'Private' },
  { value: 'CONFIDENTIAL', label: 'Confidential' }
]
</script>

<template>
  <!-- Edit Scope Dialog for recurring events -->
  <Teleport to="body">
    <div
      v-if="showScopeDialog"
      class="ext:fixed ext:inset-0 ext:z-50 ext:flex ext:items-center ext:justify-center ext:bg-black/50"
      @click.self="cancelScopeDialog"
    >
      <div class="ext:bg-white ext:rounded-lg ext:shadow-xl ext:w-full ext:max-w-sm ext:mx-4">
        <div class="ext:px-6 ext:py-4 ext:border-b">
          <h2 class="ext:text-lg ext:font-semibold ext:text-gray-900">
            {{ t('Edit Recurring Event') }}
          </h2>
        </div>
        <div class="ext:px-6 ext:py-4 ext:space-y-3">
          <p class="ext:text-sm ext:text-gray-600">
            {{ t('This is a recurring event. What would you like to edit?') }}
          </p>
          <button
            type="button"
            class="ext:w-full ext:px-4 ext:py-2 ext:text-sm ext:text-left ext:text-gray-900 ext:bg-gray-100 ext:rounded hover:ext:bg-gray-200"
            @click="selectEditScope('single')"
          >
            {{ t('This event only') }}
          </button>
          <button
            type="button"
            class="ext:w-full ext:px-4 ext:py-2 ext:text-sm ext:text-left ext:text-gray-900 ext:bg-gray-100 ext:rounded hover:ext:bg-gray-200"
            @click="selectEditScope('series')"
          >
            {{ t('All events in series') }}
          </button>
        </div>
        <div class="ext:px-6 ext:py-4 ext:border-t ext:bg-gray-50 ext:flex ext:justify-end">
          <button
            type="button"
            class="ext:px-4 ext:py-2 ext:text-sm ext:text-gray-700 ext:bg-gray-200 ext:rounded hover:ext:bg-gray-300"
            @click="cancelScopeDialog"
          >
            {{ t('Cancel') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Main Event Dialog -->
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="ext:fixed ext:inset-0 ext:z-50 ext:flex ext:items-center ext:justify-center ext:bg-black/50"
      @click.self="handleClose"
    >
      <div class="ext:bg-white ext:rounded-lg ext:shadow-xl ext:w-full ext:max-w-lg ext:mx-4 ext:max-h-[90vh] ext:flex ext:flex-col">
        <!-- Header -->
        <div class="ext:flex ext:items-center ext:justify-between ext:px-6 ext:py-4 ext:border-b ext:shrink-0">
          <h2 class="ext:text-lg ext:font-semibold ext:text-gray-900">
            {{ isEditing ? t('Edit Event') : t('New Event') }}
            <span v-if="editScope === 'single'" class="ext:text-sm ext:font-normal ext:text-gray-500">
              — {{ t('this occurrence') }}
            </span>
            <span v-else-if="editScope === 'series'" class="ext:text-sm ext:font-normal ext:text-gray-500">
              — {{ t('entire series') }}
            </span>
          </h2>
          <button
            type="button"
            class="ext:text-gray-500 hover:ext:text-gray-700"
            @click="handleClose"
          >
            <svg class="ext:w-6 ext:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Read-only Banner -->
        <div
          v-if="isReadOnly"
          class="ext:px-6 ext:py-2.5 ext:bg-gray-100 ext:border-b ext:border-gray-200 ext:text-xs ext:text-gray-700 ext:shrink-0"
        >
          {{ t('This calendar is read-only. You cannot make changes.') }}
        </div>

        <!-- Conflict Warning -->
        <div v-if="conflictData" class="ext:px-6 ext:py-4 ext:bg-yellow-50 ext:border-b ext:border-yellow-200 ext:shrink-0">
          <p class="ext:text-sm ext:text-yellow-800 ext:mb-3">
            {{ t('This event was modified by another client. Choose how to resolve:') }}
          </p>
          <div class="ext:flex ext:gap-2">
            <button
              type="button"
              class="ext:px-3 ext:py-1.5 ext:text-sm ext:bg-yellow-600 ext:text-white ext:rounded hover:ext:bg-yellow-700"
              @click="resolveConflictKeepLocal"
            >
              {{ t('Keep my changes') }}
            </button>
            <button
              type="button"
              class="ext:px-3 ext:py-1.5 ext:text-sm ext:bg-gray-200 ext:text-gray-700 ext:rounded hover:ext:bg-gray-300"
              @click="resolveConflictUseServer"
            >
              {{ t('Use server version') }}
            </button>
          </div>
        </div>

        <!-- Form (scrollable) -->
        <form class="ext:px-6 ext:py-4 ext:space-y-4 ext:overflow-y-auto ext:flex-1" @submit.prevent="handleSave">
          <!-- Title -->
          <div>
            <label for="event-title" class="ext:block ext:text-sm ext:font-medium ext:text-gray-700 ext:mb-1">
              {{ t('Title') }}
            </label>
            <input
              id="event-title"
              v-model="formData.summary"
              type="text"
              required
              :disabled="isReadOnly"
              class="ext:w-full ext:px-3 ext:py-2 ext:text-gray-900 ext:border ext:border-gray-300 ext:rounded ext:focus:ring-2 ext:focus:ring-blue-500 ext:focus:border-blue-500 disabled:ext:opacity-60"
              :placeholder="t('Event title')"
            />
          </div>

          <!-- Calendar (create OR move between writable calendars) -->
          <div v-if="canChangeCalendar">
            <label for="event-calendar" class="ext:block ext:text-sm ext:font-medium ext:text-gray-700 ext:mb-1">
              {{ t('Calendar') }}
            </label>
            <select
              id="event-calendar"
              v-model="formData.calendarHref"
              class="ext:w-full ext:px-3 ext:py-2 ext:text-gray-900 ext:border ext:border-gray-300 ext:rounded ext:focus:ring-2 ext:focus:ring-blue-500"
            >
              <option v-for="cal in writableCalendars" :key="cal.href" :value="cal.href">
                {{ cal.displayName }}
              </option>
            </select>
          </div>

          <!-- All Day -->
          <div class="ext:flex ext:items-center ext:gap-2">
            <input
              id="event-allday"
              v-model="formData.allDay"
              type="checkbox"
              :disabled="isReadOnly"
              class="ext:w-4 ext:h-4 ext:rounded ext:border-gray-300"
            />
            <label for="event-allday" class="ext:text-sm ext:font-medium ext:text-gray-900">
              {{ t('All day event') }}
            </label>
          </div>

          <!-- Start -->
          <div :class="formData.allDay ? 'ext:grid ext:grid-cols-1' : 'ext:grid ext:grid-cols-2 ext:gap-4'">
            <div>
              <label for="event-start-date" class="ext:block ext:text-sm ext:font-medium ext:text-gray-700 ext:mb-1">
                {{ t('Start Date') }}
              </label>
              <input
                id="event-start-date"
                v-model="startDate"
                type="date"
                required
                :disabled="isReadOnly"
                class="ext:w-full ext:px-3 ext:py-2 ext:text-gray-900 ext:border ext:border-gray-300 ext:rounded ext:focus:ring-2 ext:focus:ring-blue-500"
              />
            </div>
            <div v-if="!formData.allDay">
              <label for="event-start-time" class="ext:block ext:text-sm ext:font-medium ext:text-gray-700 ext:mb-1">
                {{ t('Start Time') }}
              </label>
              <input
                id="event-start-time"
                v-model="startTime"
                type="time"
                required
                :disabled="isReadOnly"
                class="ext:w-full ext:px-3 ext:py-2 ext:text-gray-900 ext:border ext:border-gray-300 ext:rounded ext:focus:ring-2 ext:focus:ring-blue-500"
              />
            </div>
          </div>

          <!-- End -->
          <div :class="formData.allDay ? 'ext:grid ext:grid-cols-1' : 'ext:grid ext:grid-cols-2 ext:gap-4'">
            <div>
              <label for="event-end-date" class="ext:block ext:text-sm ext:font-medium ext:text-gray-700 ext:mb-1">
                {{ t('End Date') }}
              </label>
              <input
                id="event-end-date"
                v-model="endDate"
                type="date"
                required
                :disabled="isReadOnly"
                class="ext:w-full ext:px-3 ext:py-2 ext:text-gray-900 ext:border ext:border-gray-300 ext:rounded ext:focus:ring-2 ext:focus:ring-blue-500"
              />
            </div>
            <div v-if="!formData.allDay">
              <label for="event-end-time" class="ext:block ext:text-sm ext:font-medium ext:text-gray-700 ext:mb-1">
                {{ t('End Time') }}
              </label>
              <input
                id="event-end-time"
                v-model="endTime"
                type="time"
                required
                :disabled="isReadOnly"
                class="ext:w-full ext:px-3 ext:py-2 ext:text-gray-900 ext:border ext:border-gray-300 ext:rounded ext:focus:ring-2 ext:focus:ring-blue-500"
              />
            </div>
          </div>

          <!-- Recurrence (hidden when editing single occurrence) -->
          <div v-if="editScope !== 'single'" class="ext:space-y-3">
            <div class="ext:flex ext:items-center ext:gap-2">
              <input
                id="event-repeat"
                v-model="hasRecurrence"
                type="checkbox"
                :disabled="isReadOnly"
                class="ext:w-4 ext:h-4 ext:rounded ext:border-gray-300"
              />
              <label for="event-repeat" class="ext:text-sm ext:font-medium ext:text-gray-900">
                {{ t('Repeat') }}
              </label>
            </div>

            <div v-if="hasRecurrence" class="ext:pl-6 ext:space-y-3 ext:border-l-2 ext:border-blue-200">
              <!-- Frequency + Interval -->
              <div class="ext:flex ext:items-center ext:gap-2">
                <label class="ext:text-sm ext:text-gray-700">{{ t('Every') }}</label>
                <input
                  v-model.number="recurrenceInterval"
                  type="number"
                  min="1"
                  max="99"
                  :disabled="isReadOnly"
                  class="ext:w-16 ext:px-2 ext:py-1 ext:text-sm ext:text-gray-900 ext:border ext:border-gray-300 ext:rounded ext:focus:ring-2 ext:focus:ring-blue-500"
                />
                <select
                  v-model="recurrenceFrequency"
                  :disabled="isReadOnly"
                  class="ext:px-2 ext:py-1 ext:text-sm ext:text-gray-900 ext:border ext:border-gray-300 ext:rounded ext:focus:ring-2 ext:focus:ring-blue-500"
                >
                  <option value="DAILY">{{ t('day(s)') }}</option>
                  <option value="WEEKLY">{{ t('week(s)') }}</option>
                  <option value="MONTHLY">{{ t('month(s)') }}</option>
                  <option value="YEARLY">{{ t('year(s)') }}</option>
                </select>
              </div>

              <!-- Weekly: day picker -->
              <div v-if="recurrenceFrequency === 'WEEKLY'" class="ext:flex ext:flex-wrap ext:gap-1">
                <button
                  v-for="day in WEEKDAYS"
                  :key="day.value"
                  type="button"
                  :disabled="isReadOnly"
                  class="ext:px-2 ext:py-1 ext:text-xs ext:rounded ext:border ext:transition-colors"
                  :class="isWeekdaySelected(day.value)
                    ? 'ext:bg-blue-600 ext:text-white ext:border-blue-600'
                    : 'ext:bg-white ext:text-gray-700 ext:border-gray-300 hover:ext:bg-gray-100'"
                  @click="toggleWeekday(day.value)"
                >
                  {{ t(day.label) }}
                </button>
              </div>

              <!-- Monthly: day-of-month vs nth weekday -->
              <div v-if="recurrenceFrequency === 'MONTHLY'" class="ext:space-y-2">
                <div class="ext:flex ext:items-center ext:gap-2">
                  <input
                    id="monthly-dom"
                    v-model="recurrenceMonthlyMode"
                    type="radio"
                    value="dayOfMonth"
                    :disabled="isReadOnly"
                    class="ext:w-4 ext:h-4"
                  />
                  <label for="monthly-dom" class="ext:text-xs ext:text-gray-900">
                    {{ t('On the same day of month') }}
                  </label>
                </div>
                <div class="ext:flex ext:items-center ext:gap-2 ext:flex-wrap">
                  <input
                    id="monthly-dow"
                    v-model="recurrenceMonthlyMode"
                    type="radio"
                    value="dayOfWeek"
                    :disabled="isReadOnly"
                    class="ext:w-4 ext:h-4"
                  />
                  <label for="monthly-dow" class="ext:text-xs ext:text-gray-900">
                    {{ t('On a specific weekday') }}:
                  </label>
                  <select
                    v-model.number="recurrenceMonthlyPosition"
                    :disabled="isReadOnly || recurrenceMonthlyMode !== 'dayOfWeek'"
                    class="ext:px-2 ext:py-1 ext:text-xs ext:border ext:border-gray-300 ext:rounded disabled:ext:opacity-50"
                  >
                    <option v-for="pos in MONTHLY_POSITIONS" :key="pos.value" :value="pos.value">
                      {{ t(pos.label) }}
                    </option>
                  </select>
                  <select
                    v-model="recurrenceMonthlyWeekday"
                    :disabled="isReadOnly || recurrenceMonthlyMode !== 'dayOfWeek'"
                    class="ext:px-2 ext:py-1 ext:text-xs ext:border ext:border-gray-300 ext:rounded disabled:ext:opacity-50"
                  >
                    <option v-for="day in WEEKDAYS" :key="day.value" :value="day.value">
                      {{ t(day.label) }}
                    </option>
                  </select>
                </div>
              </div>

              <!-- End condition -->
              <div class="ext:space-y-2">
                <label class="ext:text-sm ext:font-medium ext:text-gray-700">{{ t('Ends') }}</label>

                <div class="ext:flex ext:items-center ext:gap-2">
                  <input
                    id="end-never"
                    v-model="recurrenceEndType"
                    type="radio"
                    value="never"
                    :disabled="isReadOnly"
                    class="ext:w-4 ext:h-4"
                  />
                  <label for="end-never" class="ext:text-sm ext:text-gray-900">{{ t('Never') }}</label>
                </div>

                <div class="ext:flex ext:items-center ext:gap-2">
                  <input
                    id="end-count"
                    v-model="recurrenceEndType"
                    type="radio"
                    value="count"
                    :disabled="isReadOnly"
                    class="ext:w-4 ext:h-4"
                  />
                  <label for="end-count" class="ext:text-sm ext:text-gray-900">{{ t('After') }}</label>
                  <input
                    v-model.number="recurrenceCount"
                    type="number"
                    min="1"
                    max="999"
                    :disabled="isReadOnly || recurrenceEndType !== 'count'"
                    class="ext:w-20 ext:px-2 ext:py-1 ext:text-sm ext:text-gray-900 ext:border ext:border-gray-300 ext:rounded disabled:ext:opacity-50"
                  />
                  <span class="ext:text-sm ext:text-gray-700">{{ t('occurrences') }}</span>
                </div>

                <div class="ext:flex ext:items-center ext:gap-2">
                  <input
                    id="end-until"
                    v-model="recurrenceEndType"
                    type="radio"
                    value="until"
                    :disabled="isReadOnly"
                    class="ext:w-4 ext:h-4"
                  />
                  <label for="end-until" class="ext:text-sm ext:text-gray-900">{{ t('On') }}</label>
                  <input
                    v-model="recurrenceUntil"
                    type="date"
                    :disabled="isReadOnly || recurrenceEndType !== 'until'"
                    class="ext:px-2 ext:py-1 ext:text-sm ext:text-gray-900 ext:border ext:border-gray-300 ext:rounded disabled:ext:opacity-50"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- Reminders (VALARM) -->
          <div>
            <div class="ext:flex ext:items-center ext:justify-between ext:mb-1">
              <label class="ext:text-sm ext:font-medium ext:text-gray-700">
                {{ t('Reminders') }}
              </label>
              <button
                v-if="!isReadOnly"
                type="button"
                class="ext:text-xs ext:text-blue-600 hover:ext:underline"
                @click="addAlarm"
              >
                + {{ t('Add reminder') }}
              </button>
            </div>
            <div v-if="formData.alarms && formData.alarms.length > 0" class="ext:space-y-1.5">
              <div
                v-for="(alarm, idx) in formData.alarms"
                :key="idx"
                class="ext:flex ext:items-center ext:gap-2"
              >
                <select
                  :value="alarm.triggerMinutes"
                  :disabled="isReadOnly"
                  class="ext:flex-1 ext:px-2.5 ext:py-1.5 ext:text-sm ext:text-gray-900 ext:border ext:border-gray-300 ext:rounded"
                  @change="updateAlarmMinutes(idx, Number(($event.target as HTMLSelectElement).value))"
                >
                  <option
                    v-for="preset in ALARM_PRESETS"
                    :key="preset.minutes"
                    :value="preset.minutes"
                  >
                    {{ t(preset.label) }}
                  </option>
                </select>
                <button
                  v-if="!isReadOnly"
                  type="button"
                  class="ext:p-1 ext:text-gray-400 hover:ext:text-red-600"
                  @click="removeAlarm(idx)"
                >
                  ×
                </button>
              </div>
            </div>
          </div>

          <!-- Location -->
          <div class="ext:relative">
            <label for="event-location" class="ext:block ext:text-sm ext:font-medium ext:text-gray-700 ext:mb-1">
              {{ t('Location') }}
            </label>
            <div class="ext:relative">
              <input
                id="event-location"
                v-model="formData.location"
                type="text"
                :disabled="isReadOnly"
                class="ext:w-full ext:px-3 ext:py-2 ext:border ext:border-gray-300 ext:rounded ext:focus:ring-2 ext:focus:ring-blue-500"
                :placeholder="t('Add location')"
                @input="handleLocationInput"
                @blur="handleLocationBlur"
              />
              <div v-if="searchingLocation" class="ext:absolute ext:right-3 ext:top-2.5">
                <svg class="ext:animate-spin ext:h-4 ext:w-4 ext:text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="ext:opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="ext:opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
            </div>

            <!-- Location Search Results -->
            <div
              v-if="locationResults.length > 0"
              class="ext:absolute ext:z-50 ext:w-full ext:mt-1 ext:bg-white ext:border ext:border-gray-300 ext:rounded ext:shadow-lg ext:max-h-60 ext:overflow-y-auto"
            >
              <button
                v-for="res in locationResults"
                :key="res.display_name"
                type="button"
                class="ext:w-full ext:text-left ext:px-4 ext:py-2 ext:text-sm hover:ext:bg-gray-100 focus:ext:bg-gray-100"
                @click="selectLocation(res.display_name)"
              >
                {{ res.display_name }}
              </button>
            </div>
          </div>

          <!-- Meeting URL / Link -->
          <div>
            <label for="event-url" class="ext:block ext:text-sm ext:font-medium ext:text-gray-700 ext:mb-1">
              {{ t('Meeting URL / Link') }}
            </label>
            <div class="ext:flex ext:gap-2">
              <input
                id="event-url"
                v-model="formData.url"
                type="url"
                :disabled="isReadOnly"
                class="ext:flex-1 ext:px-3 ext:py-2 ext:text-sm ext:text-gray-900 ext:border ext:border-gray-300 ext:rounded ext:focus:ring-2 ext:focus:ring-blue-500"
                :placeholder="t('https://...')"
              />
              <a
                v-if="isValidHttpUrl"
                :href="formData.url"
                target="_blank"
                rel="noopener noreferrer"
                class="ext:px-3 ext:py-2 ext:text-xs ext:font-medium ext:bg-blue-50 ext:text-blue-700 ext:border ext:border-blue-200 ext:rounded hover:ext:bg-blue-100 ext:flex ext:items-center ext:whitespace-nowrap"
              >
                {{ t('Open link') }}
              </a>
            </div>
          </div>

          <!-- Categories -->
          <div>
            <label for="event-categories" class="ext:block ext:text-sm ext:font-medium ext:text-gray-700 ext:mb-1">
              {{ t('Categories') }}
            </label>
            <div v-if="formData.categories && formData.categories.length > 0" class="ext:flex ext:flex-wrap ext:gap-1.5 ext:mb-1.5">
              <span
                v-for="cat in formData.categories"
                :key="cat"
                class="ext:inline-flex ext:items-center ext:gap-1 ext:px-2 ext:py-0.5 ext:text-xs ext:bg-blue-100 ext:text-blue-700 ext:rounded-full"
              >
                #{{ cat }}
                <button
                  v-if="!isReadOnly"
                  type="button"
                  class="hover:ext:text-red-600"
                  @click="removeCategory(cat)"
                >
                  ×
                </button>
              </span>
            </div>
            <input
              v-if="!isReadOnly"
              id="event-categories"
              v-model="categoryInput"
              type="text"
              :placeholder="t('Add tag and press Enter')"
              class="ext:w-full ext:px-3 ext:py-1.5 ext:text-sm ext:text-gray-900 ext:border ext:border-gray-300 ext:rounded"
              @keydown.enter.prevent="addCategory"
            />
          </div>

          <!-- Description -->
          <div>
            <label for="event-description" class="ext:block ext:text-sm ext:font-medium ext:text-gray-700 ext:mb-1">
              {{ t('Description') }}
            </label>
            <textarea
              id="event-description"
              v-model="formData.description"
              rows="3"
              :disabled="isReadOnly"
              class="ext:w-full ext:px-3 ext:py-2 ext:text-gray-900 ext:border ext:border-gray-300 ext:rounded ext:focus:ring-2 ext:focus:ring-blue-500"
              :placeholder="t('Add description')"
            />
          </div>

          <!-- More Options (Timezone, Status, Availability, Visibility) -->
          <div class="ext:border-t ext:border-gray-200 ext:pt-3">
            <button
              type="button"
              class="ext:text-xs ext:font-medium ext:text-blue-600 hover:ext:underline"
              @click="showMoreOptions = !showMoreOptions"
            >
              {{ showMoreOptions ? t('Fewer options') : t('More options') }}
            </button>

            <div v-if="showMoreOptions" class="ext:mt-3 ext:grid ext:grid-cols-1 sm:ext:grid-cols-2 ext:gap-3">
              <div v-if="!formData.allDay">
                <label for="event-timezone" class="ext:block ext:text-xs ext:font-medium ext:text-gray-700 ext:mb-1">
                  {{ t('Timezone') }}
                </label>
                <select
                  id="event-timezone"
                  v-model="formData.timezone"
                  :disabled="isReadOnly"
                  class="ext:w-full ext:px-2.5 ext:py-1.5 ext:text-xs ext:text-gray-900 ext:border ext:border-gray-300 ext:rounded"
                >
                  <option value="">{{ t('Local time (UTC)') }}</option>
                  <option v-for="tz in COMMON_TIMEZONES" :key="tz" :value="tz">
                    {{ tz }}
                  </option>
                </select>
              </div>

              <div>
                <label for="event-status" class="ext:block ext:text-xs ext:font-medium ext:text-gray-700 ext:mb-1">
                  {{ t('Status') }}
                </label>
                <select
                  id="event-status"
                  v-model="formData.status"
                  :disabled="isReadOnly"
                  class="ext:w-full ext:px-2.5 ext:py-1.5 ext:text-xs ext:text-gray-900 ext:border ext:border-gray-300 ext:rounded"
                >
                  <option v-for="s in statusOptions" :key="s.value" :value="s.value">
                    {{ t(s.label) }}
                  </option>
                </select>
              </div>

              <div>
                <label for="event-transp" class="ext:block ext:text-xs ext:font-medium ext:text-gray-700 ext:mb-1">
                  {{ t('Availability') }}
                </label>
                <select
                  id="event-transp"
                  v-model="formData.transp"
                  :disabled="isReadOnly"
                  class="ext:w-full ext:px-2.5 ext:py-1.5 ext:text-xs ext:text-gray-900 ext:border ext:border-gray-300 ext:rounded"
                >
                  <option v-for="opt in transpOptions" :key="opt.value" :value="opt.value">
                    {{ t(opt.label) }}
                  </option>
                </select>
              </div>

              <div>
                <label for="event-class" class="ext:block ext:text-xs ext:font-medium ext:text-gray-700 ext:mb-1">
                  {{ t('Visibility') }}
                </label>
                <select
                  id="event-class"
                  v-model="formData.classification"
                  :disabled="isReadOnly"
                  class="ext:w-full ext:px-2.5 ext:py-1.5 ext:text-xs ext:text-gray-900 ext:border ext:border-gray-300 ext:rounded"
                >
                  <option v-for="opt in classOptions" :key="opt.value" :value="opt.value">
                    {{ t(opt.label) }}
                  </option>
                </select>
              </div>
            </div>
          </div>

          <!-- Error -->
          <div v-if="error && !conflictData" class="ext:text-sm ext:text-red-600">
            {{ error.message }}
          </div>
        </form>

        <!-- Footer -->
        <div class="ext:flex ext:items-center ext:justify-between ext:px-6 ext:py-4 ext:border-t ext:bg-gray-50 ext:shrink-0">
          <div class="ext:flex ext:items-center ext:gap-2">
            <button
              v-if="isEditing && !isReadOnly"
              type="button"
              class="ext:px-4 ext:py-2 ext:text-sm ext:text-red-600 hover:ext:text-red-800"
              :disabled="saving"
              @click="handleDelete"
            >
              {{ editScope === 'single' ? t('Delete this event') : t('Delete') }}
            </button>
            <button
              v-if="isEditing"
              type="button"
              class="ext:flex ext:items-center ext:gap-1.5 ext:px-3 ext:py-2 ext:text-sm ext:text-gray-600 ext:rounded ext:border ext:border-gray-300 hover:ext:bg-gray-100"
              :title="editScope === 'single' ? t('Download this occurrence as .ics') : t('Download as .ics')"
              @click="handleExport"
            >
              <svg class="ext:w-4 ext:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>.ics</span>
            </button>
          </div>
          <div class="ext:flex ext:gap-3">
            <button
              type="button"
              class="ext:px-4 ext:py-2 ext:text-sm ext:text-gray-700 ext:bg-gray-200 ext:rounded hover:ext:bg-gray-300"
              :disabled="saving"
              @click="handleClose"
            >
              {{ t('Cancel') }}
            </button>
            <button
              v-if="!isReadOnly"
              type="button"
              class="ext:px-4 ext:py-2 ext:text-sm ext:rounded"
              :class="(saving || !formData.summary || !formData.summary.trim()) ? 'ext:bg-gray-300 ext:text-gray-500 ext:cursor-not-allowed' : 'ext:bg-blue-600 ext:text-white hover:ext:bg-blue-700'"
              :disabled="saving || !formData.summary || !formData.summary.trim()"
              @click="handleSave"
            >
              {{ saving ? t('Saving...') : t('Save') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
