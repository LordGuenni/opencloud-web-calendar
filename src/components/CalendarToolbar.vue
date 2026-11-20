<script setup lang="ts">
import { computed, ref } from 'vue'
import { t, getLanguage } from '../composables/useLanguage'
import type { AppSection, CalendarViewType } from '../types/calendar'

const props = defineProps<{
  currentDate: Date
  viewType: CalendarViewType
  activeSection: AppSection
  searchQuery: string
  categoryFilter: string
  categories: readonly string[]
  openTasksCount: number
  notificationsEnabled: boolean
  notificationsSupported: boolean
  canCreateEvent: boolean
}>()

const emit = defineEmits<{
  prev: []
  next: []
  today: []
  'change-view': [view: CalendarViewType]
  'change-section': [section: AppSection]
  'update:searchQuery': [query: string]
  'update:categoryFilter': [category: string]
  'create-event': []
  'open-freebusy': []
  'toggle-notifications': []
  'toggle-sidebar': []
}>()

const searchInputRef = ref<HTMLInputElement | null>(null)
const locale = computed(() => getLanguage())

const title = computed(() => {
  const date = props.currentDate
  if (props.viewType === 'year') {
    return String(date.getFullYear())
  }
  if (props.viewType === 'timeGridDay') {
    return date.toLocaleDateString(locale.value, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }
  return date.toLocaleDateString(locale.value, {
    year: 'numeric',
    month: 'long'
  })
})

function focusSearch() {
  searchInputRef.value?.focus()
}

defineExpose({ focusSearch })
</script>

<template>
  <div class="ext:border-b ext:border-gray-200 ext:bg-white ext:px-3 sm:ext:px-4 ext:py-2 ext:space-y-2">
    <!-- Row 1: App section tabs + Calendar actions -->
    <div class="ext:flex ext:flex-wrap ext:items-center ext:justify-between ext:gap-2">
      <div class="ext:flex ext:items-center ext:gap-1.5 sm:ext:gap-2">
        <!-- Sidebar toggle: mobile only -->
        <button
          type="button"
          class="sm:ext:hidden ext:p-1.5 ext:text-gray-700 ext:rounded ext:border ext:border-gray-300 ext:bg-white hover:ext:bg-gray-50"
          :title="t('Toggle sidebar')"
          @click="emit('toggle-sidebar')"
        >
          <svg class="ext:w-5 ext:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7" />
          </svg>
        </button>

        <!-- Section switcher -->
        <div class="ext:flex ext:rounded-md ext:border ext:border-gray-300 ext:overflow-hidden">
          <button
            v-for="sec in (['calendar', 'tasks', 'notes', 'contacts'] as AppSection[])"
            :key="sec"
            type="button"
            class="ext:px-2.5 sm:ext:px-3 ext:py-1.5 ext:text-xs sm:ext:text-sm ext:font-medium ext:border-l first:ext:border-l-0 ext:border-gray-300 ext:flex ext:items-center ext:gap-1.5"
            :class="
              activeSection === sec
                ? 'ext:bg-blue-600 ext:text-white'
                : 'ext:bg-white ext:text-gray-700 hover:ext:bg-gray-50'
            "
            @click="emit('change-section', sec)"
          >
            <span>
              {{
                sec === 'calendar'
                  ? t('Calendar')
                  : sec === 'tasks'
                    ? t('Tasks')
                    : sec === 'notes'
                      ? t('Notes')
                      : t('Contacts')
              }}
            </span>
            <span
              v-if="sec === 'tasks' && openTasksCount > 0"
              class="ext:px-1.5 ext:py-0.2 ext:text-[10px] ext:rounded-full"
              :class="
                activeSection === 'tasks'
                  ? 'ext:bg-white/20 ext:text-white'
                  : 'ext:bg-blue-100 ext:text-blue-700'
              "
            >
              {{ openTasksCount }}
            </span>
          </button>
        </div>
      </div>

      <!-- Right quick actions (in calendar mode) -->
      <div v-if="activeSection === 'calendar'" class="ext:flex ext:items-center ext:gap-1.5 sm:ext:gap-2 ext:flex-wrap">
        <!-- Search input -->
        <div class="ext:relative">
          <input
            ref="searchInputRef"
            :value="searchQuery"
            type="text"
            :placeholder="t('Search events...')"
            class="ext:w-36 sm:ext:w-48 ext:pl-7 ext:pr-6 ext:py-1 ext:text-xs sm:ext:text-sm ext:border ext:border-gray-300 ext:rounded ext:bg-white ext:text-gray-900"
            @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
          />
          <svg
            class="ext:w-3.5 ext:h-3.5 ext:text-gray-400 ext:absolute ext:left-2 ext:top-1/2 -ext:translate-y-1/2 ext:pointer-events-none"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <button
            v-if="searchQuery"
            type="button"
            class="ext:absolute ext:right-1.5 ext:top-1/2 -ext:translate-y-1/2 ext:text-gray-400 hover:ext:text-gray-700 ext:text-xs"
            :title="t('Clear search')"
            @click="emit('update:searchQuery', '')"
          >
            ×
          </button>
        </div>

        <!-- Category filter -->
        <select
          v-if="categories.length > 0"
          :value="categoryFilter"
          class="ext:px-2 ext:py-1 ext:text-xs sm:ext:text-sm ext:border ext:border-gray-300 ext:rounded ext:bg-white ext:text-gray-700"
          @change="emit('update:categoryFilter', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">{{ t('All categories') }}</option>
          <option v-for="cat in categories" :key="cat" :value="cat">#{{ cat }}</option>
        </select>

        <!-- Free/Busy button -->
        <button
          type="button"
          class="ext:px-2.5 ext:py-1 ext:text-xs sm:ext:text-sm ext:font-medium ext:text-gray-700 ext:rounded ext:border ext:border-gray-300 ext:bg-white hover:ext:bg-gray-50"
          :title="t('Free / Busy Availability')"
          @click="emit('open-freebusy')"
        >
          {{ t('Free / Busy') }}
        </button>

        <!-- Notifications Bell -->
        <button
          v-if="notificationsSupported"
          type="button"
          class="ext:p-1.5 ext:rounded ext:border ext:border-gray-300 ext:bg-white hover:ext:bg-gray-50"
          :class="notificationsEnabled ? 'ext:text-blue-600' : 'ext:text-gray-400'"
          :title="notificationsEnabled ? t('Notifications enabled') : t('Enable notifications')"
          @click="emit('toggle-notifications')"
        >
          <svg class="ext:w-4 ext:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        </button>

        <!-- New Event CTA -->
        <button
          v-if="canCreateEvent"
          type="button"
          class="ext:px-3 ext:py-1 ext:text-xs sm:ext:text-sm ext:font-medium ext:bg-blue-600 ext:text-white ext:rounded hover:ext:bg-blue-700"
          @click="emit('create-event')"
        >
          + {{ t('New Event') }}
        </button>
      </div>
    </div>

    <!-- Row 2 (Calendar section only): Date Navigation + Title + View Switcher -->
    <div v-if="activeSection === 'calendar'" class="ext:flex ext:flex-wrap ext:items-center ext:justify-between ext:gap-2">
      <div class="ext:flex ext:items-center ext:gap-1.5 sm:ext:gap-2">
        <button
          type="button"
          class="ext:px-2.5 sm:ext:px-3 ext:py-1 ext:text-xs sm:ext:text-sm ext:font-medium ext:text-gray-700 ext:rounded ext:border ext:border-gray-300 ext:bg-white hover:ext:bg-gray-50"
          @click="emit('today')"
        >
          {{ t('Today') }}
        </button>
        <button
          type="button"
          class="ext:p-1 ext:text-gray-700 ext:rounded ext:border ext:border-gray-300 ext:bg-white hover:ext:bg-gray-50"
          @click="emit('prev')"
        >
          <svg class="ext:w-4 ext:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          type="button"
          class="ext:p-1 ext:text-gray-700 ext:rounded ext:border ext:border-gray-300 ext:bg-white hover:ext:bg-gray-50"
          @click="emit('next')"
        >
          <svg class="ext:w-4 ext:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <h2 class="ext:text-base sm:ext:text-lg ext:font-semibold ext:text-gray-900 ext:ml-2 ext:truncate">
          {{ title }}
        </h2>
      </div>

      <!-- View switcher -->
      <div class="ext:flex ext:rounded ext:border ext:border-gray-300 ext:overflow-hidden">
        <button
          v-for="v in (['dayGridMonth', 'timeGridWeek', 'timeGridDay', 'agenda', 'year'] as CalendarViewType[])"
          :key="v"
          type="button"
          :class="[
            'ext:px-2 sm:ext:px-2.5 ext:py-1 ext:text-xs sm:ext:text-sm ext:font-medium ext:border-l first:ext:border-l-0 ext:border-gray-300',
            viewType === v ? 'ext:bg-blue-500 ext:text-white' : 'ext:bg-white ext:text-gray-700 hover:ext:bg-gray-50'
          ]"
          @click="emit('change-view', v)"
        >
          {{
            v === 'dayGridMonth'
              ? t('Month')
              : v === 'timeGridWeek'
                ? t('Week')
                : v === 'timeGridDay'
                  ? t('Day')
                  : v === 'agenda'
                    ? t('Agenda')
                    : t('Year')
          }}
        </button>
      </div>
    </div>
  </div>
</template>
