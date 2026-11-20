<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useAuthStore } from '@opencloud-eu/web-pkg'
import CalendarToolbar from '../components/CalendarToolbar.vue'
import CalendarSidebar from '../components/CalendarSidebar.vue'
import CalendarView from '../components/CalendarView.vue'
import AgendaView from '../components/AgendaView.vue'
import YearView from '../components/YearView.vue'
import TasksPanel from '../components/TasksPanel.vue'
import JournalsPanel from '../components/JournalsPanel.vue'
import ContactsPanel from '../components/ContactsPanel.vue'
import FreeBusyDialog from '../components/FreeBusyDialog.vue'
import EventDialog from '../components/EventDialog.vue'
import CalendarDialog from '../components/CalendarDialog.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import ICSImportDialog from '../components/ICSImportDialog.vue'
import CalendarSharingDialog from '../components/CalendarSharingDialog.vue'
import InviteJoinDialog, { type InviteData } from '../components/InviteJoinDialog.vue'
import { useCalendars } from '../composables/useCalendars'
import { useEvents } from '../composables/useEvents'
import { useEventEditor } from '../composables/useEventEditor'
import { useCalendarEditor } from '../composables/useCalendarEditor'
import { useTodos } from '../composables/useTodos'
import { useJournals } from '../composables/useJournals'
import { useContacts } from '../composables/useContacts'
import { useReminders } from '../composables/useReminders'
import { useTheme } from '../composables/useTheme'
import { getExtendedRange } from '../utils/date'
import { getCalDAVClient } from '../caldav/client'
import { initAuthStore } from '../caldav/auth'
import { initLanguage, t } from '../composables/useLanguage'
import type {
  AppSection,
  Calendar,
  CalendarEvent,
  CalendarJournal,
  CalendarTodo,
  CalendarViewType,
  Contact,
  ContactFormData,
  DateRange,
  JournalFormData,
  TodoFormData
} from '../types/calendar'

// Initialize auth store for CalDAV requests
const authStore = useAuthStore()
initAuthStore(authStore)

// Initialize language from user profile
initLanguage()

const {
  calendars,
  loading: calendarsLoading,
  calendarHomeUrl,
  loadCalendars,
  toggleCalendarVisibility,
  getDefaultCalendar,
  deleteCalendar,
  leaveCalendar,
  joinCalendarViaInvite,
  isCalendarAlreadyJoined,
  pendingShares,
  acceptShare,
  declineShare,
  userProfiles
} = useCalendars()

const {
  events: allLoadedEvents,
  allCategories,
  fetchEvents,
  invalidateCache,
  getVisibleEvents,
  updateEventInCache
} = useEvents()

const {
  todos,
  loading: todosLoading,
  loadTodos,
  createTodo,
  updateTodo,
  toggleTodoComplete,
  removeTodo,
  getTodoCalendarEvents
} = useTodos()

const {
  journals,
  loading: journalsLoading,
  loadJournals,
  createJournal,
  updateJournal,
  removeJournal
} = useJournals()

const {
  addressBooks,
  contacts,
  loading: contactsLoading,
  available: contactsAvailable,
  loadContacts,
  createContact,
  updateContact,
  removeContact,
  getBirthdayCalendarEvents
} = useContacts()

const { openCreate, openEdit } = useEventEditor()
const { open: openCalendarEditor, openEdit: openCalendarEdit } = useCalendarEditor()
const importDialogRef = ref<InstanceType<typeof ICSImportDialog> | null>(null)
const toolbarRef = ref<InstanceType<typeof CalendarToolbar> | null>(null)
const { isDark } = useTheme()

const sidebarOpen = ref(false)
const activeSection = ref<AppSection>('calendar')
const searchQuery = ref('')
const categoryFilter = ref('')
const freeBusyOpen = ref(false)

// Overlay toggles (persisted in localStorage)
const showTasksOnCalendar = ref(localStorage.getItem('oc_cal_show_tasks') === 'true')
const showBirthdaysOnCalendar = ref(localStorage.getItem('oc_cal_show_birthdays') !== 'false')

watch(showTasksOnCalendar, (val) => {
  localStorage.setItem('oc_cal_show_tasks', String(val))
})
watch(showBirthdaysOnCalendar, (val) => {
  localStorage.setItem('oc_cal_show_birthdays', String(val))
})

function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value
}

// Confirmation dialog state
const confirmAction = ref<{
  type: 'delete' | 'leave'
  isOpen: boolean
  calendarHref: string
  calendarName: string
  calendar?: Calendar
} | null>(null)

// Sharing dialog state
const sharingCalendar = ref<Calendar | null>(null)

// Invite Join dialog state
const pendingJoinInvite = ref<InviteData | null>(null)
const joinLoading = ref(false)
const toastMessage = ref<string | null>(null)
let toastTimeout: ReturnType<typeof setTimeout> | null = null

function showToast(message: string) {
  toastMessage.value = message
  if (toastTimeout) clearTimeout(toastTimeout)
  toastTimeout = setTimeout(() => {
    toastMessage.value = null
  }, 3500)
}

// Browser + in-app reminder engine
const {
  notificationsSupported,
  enabled: notificationsEnabled,
  toggleNotifications,
  start: startReminders
} = useReminders(
  () => allLoadedEvents.value,
  (title, body) => {
    showToast(`${t('Reminder: %{title}', { title })} (${body})`)
  }
)

async function handleToggleNotifications() {
  const enabled = await toggleNotifications()
  showToast(enabled ? t('Notifications enabled') : t('Notifications disabled'))
}

function checkJoinInvite() {
  const hash = window.location.hash
  const search = window.location.search

  let params = new URLSearchParams(search)
  if (!params.get('join_token') && !params.get('path') && hash.includes('?')) {
    params = new URLSearchParams(hash.substring(hash.indexOf('?')))
  }

  const token = params.get('join_token') || params.get('token')
  const path = params.get('path') ? decodeURIComponent(params.get('path')!) : undefined

  if (token || path) {
    const decodedToken = token ? decodeURIComponent(token) : undefined
    const name = params.get('name') ? decodeURIComponent(params.get('name')!) : t('Shared Calendar')
    const color = params.get('color') ? decodeURIComponent(params.get('color')!) : '#3788d8'
    const perm = params.get('perm') || 'r'
    const owner = params.get('owner') ? decodeURIComponent(params.get('owner')!) : undefined

    const checkKey = decodedToken || path || ''
    if (isCalendarAlreadyJoined(checkKey)) {
      showToast(t('You are already subscribed to this calendar.'))
      clearJoinUrlParams()
      return
    }

    pendingJoinInvite.value = {
      token: decodedToken,
      calendarPath: path,
      displayName: name,
      color,
      permissions: perm,
      owner
    }
  }
}

function clearJoinUrlParams() {
  try {
    const url = new URL(window.location.href)
    url.searchParams.delete('join_token')
    url.searchParams.delete('token')
    url.searchParams.delete('path')
    url.searchParams.delete('name')
    url.searchParams.delete('color')
    url.searchParams.delete('perm')
    url.searchParams.delete('owner')

    if (url.hash.includes('?')) {
      const hashBase = url.hash.split('?')[0]
      url.hash = hashBase
    }
    window.history.replaceState({}, document.title, url.toString())
  } catch {
    // Ignore
  }
}

async function handleJoinCalendar() {
  if (!pendingJoinInvite.value) return
  joinLoading.value = true
  try {
    const success = await joinCalendarViaInvite(pendingJoinInvite.value)
    if (success) {
      showToast(t('Joined calendar successfully'))
      await loadEventsForCurrentRange(true)
    }
  } catch (e) {
    console.error('Failed to join calendar:', e)
  } finally {
    joinLoading.value = false
    pendingJoinInvite.value = null
    clearJoinUrlParams()
  }
}

function handleCancelJoin() {
  pendingJoinInvite.value = null
  clearJoinUrlParams()
}

const calendarViewRef = ref<InstanceType<typeof CalendarView> | null>(null)
const currentDate = ref(new Date())
const viewType = ref<CalendarViewType>('dayGridMonth')

function getActiveRange(): DateRange {
  if (viewType.value === 'year') {
    const y = currentDate.value.getFullYear()
    return {
      start: new Date(y, 0, 1),
      end: new Date(y, 11, 31, 23, 59, 59)
    }
  }
  return getExtendedRange(currentDate.value)
}

const visibleEvents = computed<CalendarEvent[]>(() => {
  const baseEvents = getVisibleEvents(
    calendars.value as Calendar[],
    searchQuery.value,
    categoryFilter.value
  )

  const overlays: CalendarEvent[] = []
  if (showTasksOnCalendar.value) {
    overlays.push(...getTodoCalendarEvents(calendars.value))
  }
  if (showBirthdaysOnCalendar.value && contactsAvailable.value) {
    overlays.push(...getBirthdayCalendarEvents(getActiveRange()))
  }

  if (overlays.length === 0) return baseEvents

  const q = searchQuery.value.trim().toLowerCase()
  const filteredOverlays = q
    ? overlays.filter((e) => e.summary.toLowerCase().includes(q))
    : overlays

  return [...baseEvents, ...filteredOverlays]
})

const openTasksCount = computed(
  () => todos.value.filter((todo) => todo.status !== 'COMPLETED' && todo.status !== 'CANCELLED').length
)

const canCreateEvent = computed(() => calendars.value.some((c) => !c.readOnly))

function handleKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null
  const isTyping =
    target &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable)

  if (isTyping || e.ctrlKey || e.metaKey || e.altKey) return

  if (activeSection.value === 'calendar') {
    switch (e.key) {
      case 't':
        handleToday()
        break
      case 'n':
        if (canCreateEvent.value) handleQuickCreateEvent()
        break
      case '/':
        e.preventDefault()
        toolbarRef.value?.focusSearch()
        break
      case 'm':
        handleViewChange('dayGridMonth')
        break
      case 'w':
        handleViewChange('timeGridWeek')
        break
      case 'd':
        handleViewChange('timeGridDay')
        break
      case 'a':
        handleViewChange('agenda')
        break
      case 'y':
        handleViewChange('year')
        break
      case 'ArrowLeft':
        handlePrev()
        break
      case 'ArrowRight':
        handleNext()
        break
    }
  }
}

onMounted(async () => {
  await loadCalendars()
  await Promise.all([
    loadEventsForCurrentRange(true),
    loadTodos(calendars.value),
    loadJournals(calendars.value),
    loadContacts()
  ])
  startReminders()
  checkJoinInvite()
  window.addEventListener('hashchange', checkJoinInvite)
  window.addEventListener('popstate', checkJoinInvite)
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('hashchange', checkJoinInvite)
  window.removeEventListener('popstate', checkJoinInvite)
  window.removeEventListener('keydown', handleKeydown)
})

watch(
  () => calendars.value.map((c) => `${c.href}:${c.ctag}`).join(','),
  () => {
    loadEventsForCurrentRange()
    loadTodos(calendars.value)
    loadJournals(calendars.value)
  }
)

async function loadEventsForCurrentRange(forceRefresh = false) {
  const range = getActiveRange()
  await fetchEvents(calendars.value as Calendar[], range, forceRefresh)
}

function handlePrev() {
  if (viewType.value === 'year') {
    currentDate.value = new Date(currentDate.value.getFullYear() - 1, 0, 1)
    loadEventsForCurrentRange()
  } else if (viewType.value === 'agenda') {
    currentDate.value = new Date(
      currentDate.value.getFullYear(),
      currentDate.value.getMonth() - 1,
      1
    )
    loadEventsForCurrentRange()
  } else {
    calendarViewRef.value?.prev()
  }
}

function handleNext() {
  if (viewType.value === 'year') {
    currentDate.value = new Date(currentDate.value.getFullYear() + 1, 0, 1)
    loadEventsForCurrentRange()
  } else if (viewType.value === 'agenda') {
    currentDate.value = new Date(
      currentDate.value.getFullYear(),
      currentDate.value.getMonth() + 1,
      1
    )
    loadEventsForCurrentRange()
  } else {
    calendarViewRef.value?.next()
  }
}

function handleToday() {
  currentDate.value = new Date()
  if (viewType.value !== 'year' && viewType.value !== 'agenda') {
    calendarViewRef.value?.today()
  } else {
    loadEventsForCurrentRange()
  }
}

function handleViewChange(view: CalendarViewType) {
  viewType.value = view
  loadEventsForCurrentRange()
}

function handleDateChange(date: Date) {
  currentDate.value = date
  loadEventsForCurrentRange()
}

function handleMiniCalendarSelect(date: Date) {
  activeSection.value = 'calendar'
  currentDate.value = date
  if (viewType.value === 'year') {
    viewType.value = 'timeGridDay'
  }
  loadEventsForCurrentRange()
  sidebarOpen.value = false
}

function handleYearSelectMonth(date: Date) {
  currentDate.value = date
  viewType.value = 'dayGridMonth'
  loadEventsForCurrentRange()
}

function handleYearSelectDate(date: Date) {
  currentDate.value = date
  viewType.value = 'timeGridDay'
  loadEventsForCurrentRange()
}

function handleToggleCalendar(href: string) {
  toggleCalendarVisibility(href)
}

function handleEventClick(event: CalendarEvent) {
  if (event.virtualType === 'todo') {
    activeSection.value = 'tasks'
    return
  }
  if (event.virtualType === 'birthday') {
    activeSection.value = 'contacts'
    return
  }
  openEdit(event)
}

function handleQuickCreateEvent() {
  const writable = calendars.value.find((c) => !c.readOnly) || getDefaultCalendar()
  if (!writable) return
  const start = new Date(currentDate.value)
  const now = new Date()
  start.setHours(now.getHours() + 1, 0, 0, 0)
  const end = new Date(start.getTime() + 3600000)
  openCreate(writable.href, start, end, false)
}

function handleDateSelect(start: Date, end: Date, allDay: boolean) {
  const defaultCalendar = calendars.value.find((c) => !c.readOnly) || getDefaultCalendar()
  if (defaultCalendar) {
    openCreate(defaultCalendar.href, start, end, allDay)
  }
}

async function handleEventDrop(event: CalendarEvent, start: Date, end: Date) {
  if (event.virtualType) return
  const client = getCalDAVClient()
  try {
    if (event.isRecurring && event.recurrenceId) {
      await client.updateEventOccurrence(event, event.recurrenceId, {
        uid: event.uid,
        calendarHref: event.calendarHref,
        summary: event.summary,
        start,
        end,
        allDay: event.allDay,
        description: event.description || '',
        location: event.location || '',
        url: event.url,
        categories: event.categories,
        status: event.status,
        transp: event.transp,
        classification: event.classification,
        timezone: event.timezone,
        alarms: event.alarms
      })
      invalidateCache(event.calendarHref)
      await loadEventsForCurrentRange(true)
    } else {
      const updated = await client.updateEvent(event, {
        uid: event.uid,
        calendarHref: event.calendarHref,
        summary: event.summary,
        start,
        end,
        allDay: event.allDay,
        description: event.description || '',
        location: event.location || '',
        url: event.url,
        categories: event.categories,
        status: event.status,
        transp: event.transp,
        classification: event.classification,
        timezone: event.timezone,
        alarms: event.alarms
      })
      updateEventInCache(updated)
    }
  } catch (err) {
    console.error('Failed to update event:', err)
    await loadEventsForCurrentRange(true)
  }
}

async function handleEventSaved() {
  invalidateCache()
  await loadEventsForCurrentRange(true)
}

async function handleEventDeleted() {
  invalidateCache()
  await loadEventsForCurrentRange(true)
}

function handleCreateCalendar() {
  openCalendarEditor()
}

function handleEditCalendar(calendar: Calendar) {
  openCalendarEdit(calendar)
}

async function handleExportCalendar(calendar: Calendar) {
  const client = getCalDAVClient()
  try {
    const icsContent = await client.exportCalendarICS(calendar.href)
    const safeName = (calendar.displayName || 'calendar').replace(/[^a-zA-Z0-9_\- ]/g, '_').trim()
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${safeName}.ics`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showToast(t('Calendar exported successfully'))
  } catch (err) {
    console.error('Failed to export calendar:', err)
    showToast(t('Failed to export calendar'))
  }
}

function handleDeleteCalendar(calendarHref: string) {
  const calendar = calendars.value.find((c) => c.href === calendarHref)
  if (calendar) {
    confirmAction.value = {
      type: calendar.isShared ? 'leave' : 'delete',
      isOpen: true,
      calendarHref,
      calendarName: calendar.displayName,
      calendar
    }
  }
}

function handleShareCalendar(calendarHref: string) {
  const calendar = calendars.value.find((c) => c.href === calendarHref)
  if (calendar) {
    sharingCalendar.value = calendar
  }
}

async function confirmCalendarAction() {
  if (!confirmAction.value) return

  let success = false
  if (confirmAction.value.type === 'leave' && confirmAction.value.calendar) {
    success = await leaveCalendar(confirmAction.value.calendar)
  } else {
    success = await deleteCalendar(confirmAction.value.calendarHref)
  }

  if (success) {
    invalidateCache()
    await loadEventsForCurrentRange(true)
  }
  confirmAction.value = null
}

function cancelCalendarAction() {
  confirmAction.value = null
}

async function handleCalendarSaved() {
  invalidateCache()
  await loadCalendars()
}

async function handleManualRefresh() {
  invalidateCache()
  await loadCalendars()
  await Promise.all([
    loadEventsForCurrentRange(true),
    loadTodos(calendars.value),
    loadJournals(calendars.value),
    loadContacts()
  ])
}

function handleImportCalendar() {
  importDialogRef.value?.open()
}

async function handleImported() {
  invalidateCache()
  await loadCalendars()
  await loadEventsForCurrentRange(true)
}

// Task handlers
async function handleCreateTodo(data: TodoFormData) {
  await createTodo(data)
}
async function handleUpdateTodo(todo: CalendarTodo, data: TodoFormData) {
  await updateTodo(todo, data)
}
async function handleToggleTodo(todo: CalendarTodo) {
  await toggleTodoComplete(todo)
}
async function handleDeleteTodo(todo: CalendarTodo) {
  await removeTodo(todo)
}

// Journal handlers
async function handleCreateJournal(data: JournalFormData) {
  await createJournal(data)
}
async function handleUpdateJournal(journal: CalendarJournal, data: JournalFormData) {
  await updateJournal(journal, data)
}
async function handleDeleteJournal(journal: CalendarJournal) {
  await removeJournal(journal)
}

// Contact handlers
async function handleCreateContact(data: ContactFormData) {
  await createContact(data)
}
async function handleUpdateContact(contact: Contact, data: ContactFormData) {
  await updateContact(contact, data)
}
async function handleDeleteContact(contact: Contact) {
  await removeContact(contact)
}

void isDark
</script>

<template>
  <div class="ext:flex ext:flex-col ext:h-full ext:bg-white">
    <CalendarToolbar
      ref="toolbarRef"
      :current-date="currentDate"
      :view-type="viewType"
      :active-section="activeSection"
      :search-query="searchQuery"
      :category-filter="categoryFilter"
      :categories="allCategories"
      :open-tasks-count="openTasksCount"
      :notifications-enabled="notificationsEnabled"
      :notifications-supported="notificationsSupported"
      :can-create-event="canCreateEvent"
      @prev="handlePrev"
      @next="handleNext"
      @today="handleToday"
      @change-view="handleViewChange"
      @change-section="activeSection = $event"
      @update:search-query="searchQuery = $event"
      @update:category-filter="categoryFilter = $event"
      @create-event="handleQuickCreateEvent"
      @open-freebusy="freeBusyOpen = true"
      @toggle-notifications="handleToggleNotifications"
      @toggle-sidebar="toggleSidebar"
    />

    <div class="ext:flex ext:flex-1 ext:overflow-hidden ext:relative">
      <!-- Mobile sidebar backdrop -->
      <div
        v-if="sidebarOpen"
        class="sm:ext:hidden ext:absolute ext:inset-0 ext:z-10 ext:bg-black/30"
        @click="sidebarOpen = false"
      />

      <CalendarSidebar
        :calendars="calendars"
        :events="visibleEvents"
        :current-date="currentDate"
        :pending-shares="pendingShares"
        :user-profiles="userProfiles"
        :loading="calendarsLoading"
        :is-open="sidebarOpen"
        :show-tasks-on-calendar="showTasksOnCalendar"
        :show-birthdays-on-calendar="showBirthdaysOnCalendar"
        :has-contacts-available="contactsAvailable"
        @toggle="handleToggleCalendar"
        @create="handleCreateCalendar"
        @edit="handleEditCalendar"
        @export="handleExportCalendar"
        @delete="handleDeleteCalendar"
        @share="handleShareCalendar"
        @import="handleImportCalendar"
        @accept-share="acceptShare"
        @decline-share="declineShare"
        @refresh="handleManualRefresh"
        @select-date="handleMiniCalendarSelect"
        @update:show-tasks-on-calendar="showTasksOnCalendar = $event"
        @update:show-birthdays-on-calendar="showBirthdaysOnCalendar = $event"
      />

      <!-- Main Workspace -->
      <template v-if="activeSection === 'calendar'">
        <AgendaView
          v-if="viewType === 'agenda'"
          :events="visibleEvents"
          :calendars="calendars"
          :current-date="currentDate"
          @event-click="handleEventClick"
        />
        <YearView
          v-else-if="viewType === 'year'"
          :events="visibleEvents"
          :calendars="calendars"
          :current-date="currentDate"
          @select-date="handleYearSelectDate"
          @select-month="handleYearSelectMonth"
        />
        <CalendarView
          v-else
          ref="calendarViewRef"
          :events="visibleEvents"
          :calendars="calendars"
          :current-date="currentDate"
          :view-type="viewType"
          @date-change="handleDateChange"
          @event-click="handleEventClick"
          @date-select="handleDateSelect"
          @event-drop="handleEventDrop"
        />
      </template>

      <TasksPanel
        v-else-if="activeSection === 'tasks'"
        :todos="todos"
        :calendars="calendars"
        :loading="todosLoading"
        @create="handleCreateTodo"
        @update="handleUpdateTodo"
        @toggle="handleToggleTodo"
        @delete="handleDeleteTodo"
        @refresh="loadTodos(calendars)"
      />

      <JournalsPanel
        v-else-if="activeSection === 'notes'"
        :journals="journals"
        :calendars="calendars"
        :loading="journalsLoading"
        @create="handleCreateJournal"
        @update="handleUpdateJournal"
        @delete="handleDeleteJournal"
        @refresh="loadJournals(calendars)"
      />

      <ContactsPanel
        v-else-if="activeSection === 'contacts'"
        :address-books="addressBooks"
        :contacts="contacts"
        :loading="contactsLoading"
        @create="handleCreateContact"
        @update="handleUpdateContact"
        @delete="handleDeleteContact"
        @refresh="loadContacts"
      />
    </div>

    <EventDialog
      :calendars="calendars"
      @saved="handleEventSaved"
      @deleted="handleEventDeleted"
    />

    <CalendarDialog :calendar-home-url="calendarHomeUrl" @saved="handleCalendarSaved" />

    <FreeBusyDialog
      :is-open="freeBusyOpen"
      :calendars="calendars"
      :initial-date="currentDate"
      @close="freeBusyOpen = false"
    />

    <ICSImportDialog
      ref="importDialogRef"
      :calendars="calendars"
      :calendar-home-url="calendarHomeUrl"
      :default-calendar="getDefaultCalendar() || null"
      @imported="handleImported"
    />

    <CalendarSharingDialog
      v-if="sharingCalendar"
      :calendar="sharingCalendar"
      :is-open="!!sharingCalendar"
      @close="sharingCalendar = null"
    />

    <ConfirmDialog
      :is-open="confirmAction?.isOpen || false"
      :title="confirmAction?.type === 'leave' ? t('Leave Calendar') : t('Delete Calendar')"
      :message="confirmAction?.type === 'leave'
        ? t(`Are you sure you want to leave '%{name}'? You will no longer have access to this calendar.`, { name: confirmAction?.calendarName || '' })
        : t(`Are you sure you want to delete '%{name}'? All events in this calendar will be permanently deleted.`, { name: confirmAction?.calendarName || '' })"
      :confirm-text="confirmAction?.type === 'leave' ? t('Leave') : t('Delete')"
      :confirm-danger="true"
      @confirm="confirmCalendarAction"
      @cancel="cancelCalendarAction"
    />

    <InviteJoinDialog
      :is-open="!!pendingJoinInvite"
      :invite-data="pendingJoinInvite"
      :loading="joinLoading"
      @join="handleJoinCalendar"
      @close="handleCancelJoin"
    />

    <!-- Toast Notification -->
    <div
      v-if="toastMessage"
      class="ext:fixed ext:bottom-6 ext:right-6 ext:z-50 ext:bg-gray-900/90 ext:text-white ext:px-4 ext:py-2.5 ext:rounded-lg ext:shadow-lg ext:text-sm ext:flex ext:items-center ext:gap-2 ext:backdrop-blur-sm"
    >
      <svg class="ext:w-4 ext:h-4 ext:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
      </svg>
      <span>{{ toastMessage }}</span>
    </div>
  </div>
</template>

<style>
/* ============================================================
   Dark mode overrides
   Uses OpenCloud's --oc-role-* CSS variables that are set on
   document.documentElement and switch automatically with theme.
   ============================================================ */

/* --- Backgrounds --- */
[data-calendar-theme="dark"] .ext\:bg-white {
  background-color: var(--oc-role-surface) !important;
}
[data-calendar-theme="dark"] .ext\:bg-gray-50 {
  background-color: var(--oc-role-surface-container) !important;
}
[data-calendar-theme="dark"] .ext\:bg-gray-100 {
  background-color: var(--oc-role-surface-container-high) !important;
}
[data-calendar-theme="dark"] .ext\:bg-gray-200 {
  background-color: var(--oc-role-surface-container-high) !important;
}
[data-calendar-theme="dark"] .hover\:ext\:bg-gray-50:hover {
  background-color: var(--oc-role-surface-container-high) !important;
}
[data-calendar-theme="dark"] .hover\:ext\:bg-gray-100:hover {
  background-color: var(--oc-role-surface-container-highest) !important;
}
[data-calendar-theme="dark"] .hover\:ext\:bg-gray-200:hover {
  background-color: var(--oc-role-surface-container-highest) !important;
}
[data-calendar-theme="dark"] .hover\:ext\:bg-gray-300:hover {
  background-color: var(--oc-role-surface-container-highest) !important;
}

/* --- Text colors --- */
[data-calendar-theme="dark"] .ext\:text-gray-900 {
  color: var(--oc-role-on-surface) !important;
}
[data-calendar-theme="dark"] .ext\:text-gray-700 {
  color: var(--oc-role-on-surface-variant) !important;
}
[data-calendar-theme="dark"] .ext\:text-gray-600 {
  color: var(--oc-role-outline) !important;
}
[data-calendar-theme="dark"] .ext\:text-gray-500 {
  color: var(--oc-role-outline) !important;
}
[data-calendar-theme="dark"] .ext\:text-gray-400 {
  color: var(--oc-role-outline) !important;
}
[data-calendar-theme="dark"] .hover\:ext\:text-gray-700:hover {
  color: var(--oc-role-on-surface) !important;
}

/* --- Borders --- */
[data-calendar-theme="dark"] .ext\:border-gray-100,
[data-calendar-theme="dark"] .ext\:border-gray-200,
[data-calendar-theme="dark"] .ext\:border-gray-300 {
  border-color: var(--oc-role-outline-variant) !important;
}
[data-calendar-theme="dark"] .ext\:border-gray-900 {
  border-color: var(--oc-role-on-surface) !important;
}
[data-calendar-theme="dark"] .ext\:border-b,
[data-calendar-theme="dark"] .ext\:border-t,
[data-calendar-theme="dark"] .ext\:border-r,
[data-calendar-theme="dark"] .ext\:border-l {
  border-color: var(--oc-role-outline-variant);
}

/* --- Primary / Blue & Badges --- */
[data-calendar-theme="dark"] .ext\:bg-blue-50,
[data-calendar-theme="dark"] .ext\:bg-blue-100 {
  background-color: var(--oc-role-primary-container) !important;
}
[data-calendar-theme="dark"] .ext\:text-blue-700 {
  color: var(--oc-role-on-primary-container) !important;
}
[data-calendar-theme="dark"] .ext\:bg-blue-500,
[data-calendar-theme="dark"] .ext\:bg-blue-600 {
  background-color: var(--oc-role-primary) !important;
}
[data-calendar-theme="dark"] .hover\:ext\:bg-blue-700:hover {
  background-color: var(--oc-role-primary-container) !important;
  color: var(--oc-role-on-primary-container) !important;
}
[data-calendar-theme="dark"] .ext\:text-blue-600 {
  color: var(--oc-role-primary) !important;
}
[data-calendar-theme="dark"] .hover\:ext\:bg-blue-50:hover,
[data-calendar-theme="dark"] .hover\:ext\:bg-blue-100:hover {
  background-color: var(--oc-role-primary-container) !important;
}
[data-calendar-theme="dark"] .ext\:border-blue-200 {
  border-color: var(--oc-role-primary-container) !important;
}
[data-calendar-theme="dark"] .ext\:border-blue-600 {
  border-color: var(--oc-role-primary) !important;
}
[data-calendar-theme="dark"] .ext\:bg-blue-600.ext\:text-white,
[data-calendar-theme="dark"] .ext\:bg-blue-500.ext\:text-white {
  background-color: var(--oc-role-primary) !important;
  color: var(--oc-role-on-primary) !important;
}

/* --- Focus rings --- */
[data-calendar-theme="dark"] .ext\:focus\:ring-blue-500:focus {
  --tw-ring-color: var(--oc-role-primary) !important;
}
[data-calendar-theme="dark"] .ext\:focus\:border-blue-500:focus {
  border-color: var(--oc-role-primary) !important;
}

/* --- Error / Red --- */
[data-calendar-theme="dark"] .ext\:bg-red-100 {
  background-color: var(--oc-role-error-container) !important;
}
[data-calendar-theme="dark"] .ext\:text-red-700 {
  color: var(--oc-role-on-error-container) !important;
}
[data-calendar-theme="dark"] .ext\:text-red-600,
[data-calendar-theme="dark"] .hover\:ext\:text-red-600:hover,
[data-calendar-theme="dark"] .hover\:ext\:text-red-800:hover {
  color: var(--oc-role-error) !important;
}
[data-calendar-theme="dark"] .ext\:bg-red-600 {
  background-color: var(--oc-role-error-container) !important;
  color: var(--oc-role-on-error-container) !important;
}
[data-calendar-theme="dark"] .hover\:ext\:bg-red-700:hover {
  background-color: var(--oc-role-error) !important;
}

/* --- Warning / Yellow --- */
[data-calendar-theme="dark"] .ext\:bg-yellow-50,
[data-calendar-theme="dark"] .ext\:bg-yellow-100 {
  background-color: var(--oc-role-surface-container-high) !important;
}
[data-calendar-theme="dark"] .ext\:border-yellow-200 {
  border-color: var(--oc-role-outline-variant) !important;
}
[data-calendar-theme="dark"] .ext\:text-yellow-800 {
  color: var(--oc-role-on-surface) !important;
}
[data-calendar-theme="dark"] .ext\:bg-yellow-600 {
  background-color: var(--oc-role-primary) !important;
}
[data-calendar-theme="dark"] .hover\:ext\:bg-yellow-700:hover {
  background-color: var(--oc-role-primary-container) !important;
}

/* --- Inputs (inside dark theme) --- */
[data-calendar-theme="dark"] input,
[data-calendar-theme="dark"] select,
[data-calendar-theme="dark"] textarea {
  background-color: var(--oc-role-surface-container-low) !important;
  color: var(--oc-role-on-surface) !important;
  border-color: var(--oc-role-outline-variant) !important;
}
[data-calendar-theme="dark"] input[type="checkbox"],
[data-calendar-theme="dark"] input[type="radio"] {
  background-color: var(--oc-role-surface-container-low) !important;
  accent-color: var(--oc-role-primary) !important;
}
[data-calendar-theme="dark"] input::placeholder,
[data-calendar-theme="dark"] textarea::placeholder {
  color: var(--oc-role-outline) !important;
}
[data-calendar-theme="dark"] option {
  background-color: var(--oc-role-surface-container) !important;
  color: var(--oc-role-on-surface) !important;
}

/* --- Dialog shadows --- */
[data-calendar-theme="dark"] .ext\:shadow-xl,
[data-calendar-theme="dark"] .ext\:shadow-lg {
  --tw-shadow-color: rgba(0, 0, 0, 0.5) !important;
}
</style>
