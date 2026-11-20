<script setup lang="ts">
import { ref, computed } from 'vue'
import { t, getLanguage } from '../composables/useLanguage'
import { formatDateForInput } from '../utils/date'
import type { Calendar, CalendarJournal, JournalFormData, JournalStatus } from '../types/calendar'

const props = defineProps<{
  journals: readonly CalendarJournal[]
  calendars: readonly Calendar[]
  loading: boolean
}>()

const emit = defineEmits<{
  create: [data: JournalFormData]
  update: [journal: CalendarJournal, data: JournalFormData]
  delete: [journal: CalendarJournal]
  refresh: []
}>()

const locale = computed(() => getLanguage())
const searchQuery = ref('')
const editorOpen = ref(false)
const editingJournal = ref<CalendarJournal | null>(null)
const categoryInput = ref('')

const writableCalendars = computed(() => props.calendars.filter((c) => !c.readOnly))

const calendarMap = computed(() => {
  const map = new Map<string, Calendar>()
  for (const c of props.calendars) {
    map.set(c.href, c)
    if (!c.href.endsWith('/')) map.set(`${c.href}/`, c)
  }
  return map
})

function createEmptyForm(): JournalFormData {
  return {
    calendarHref: writableCalendars.value[0]?.href || props.calendars[0]?.href || '',
    summary: '',
    description: '',
    dtstart: new Date(),
    status: 'FINAL',
    categories: []
  }
}

const form = ref<JournalFormData>(createEmptyForm())

const dateInput = computed({
  get: () => (form.value.dtstart ? formatDateForInput(form.value.dtstart) : ''),
  set: (val: string) => {
    form.value.dtstart = val ? new Date(`${val}T00:00:00`) : null
  }
})

const filteredJournals = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  const visibleHrefs = new Set(
    props.calendars.filter((c) => c.visible).map((c) => (c.href.endsWith('/') ? c.href : `${c.href}/`))
  )

  return props.journals.filter((j) => {
    const norm = j.calendarHref.endsWith('/') ? j.calendarHref : `${j.calendarHref}/`
    if (visibleHrefs.size > 0 && !visibleHrefs.has(norm)) return false
    if (!q) return true
    const hay = [j.summary, j.description || '', ...(j.categories || [])].join(' ').toLowerCase()
    return hay.includes(q)
  })
})

function getCalendar(href: string): Calendar | undefined {
  return calendarMap.value.get(href) || calendarMap.value.get(`${href}/`)
}

function isReadOnly(journal: CalendarJournal): boolean {
  return getCalendar(journal.calendarHref)?.readOnly || false
}

function openCreate() {
  editingJournal.value = null
  form.value = createEmptyForm()
  categoryInput.value = ''
  editorOpen.value = true
}

function openEdit(journal: CalendarJournal) {
  editingJournal.value = journal
  form.value = {
    uid: journal.uid,
    calendarHref: journal.calendarHref,
    summary: journal.summary,
    description: journal.description || '',
    dtstart: journal.dtstart ? new Date(journal.dtstart) : null,
    status: journal.status || 'FINAL',
    categories: journal.categories ? [...journal.categories] : []
  }
  categoryInput.value = ''
  editorOpen.value = true
}

function addCategory() {
  const tag = categoryInput.value.trim()
  if (!tag) return
  if (!form.value.categories) form.value.categories = []
  if (!form.value.categories.includes(tag)) {
    form.value.categories.push(tag)
  }
  categoryInput.value = ''
}

function removeCategory(tag: string) {
  form.value.categories = (form.value.categories || []).filter((c) => c !== tag)
}

function handleSave() {
  if (!form.value.summary.trim()) return
  if (editingJournal.value) {
    emit('update', editingJournal.value, { ...form.value })
  } else {
    emit('create', { ...form.value })
  }
  editorOpen.value = false
}

function handleDelete() {
  if (!editingJournal.value) return
  emit('delete', editingJournal.value)
  editorOpen.value = false
}

const statuses: Array<{ value: JournalStatus; label: string }> = [
  { value: 'FINAL', label: 'Final' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'CANCELLED', label: 'Cancelled' }
]
</script>

<template>
  <div class="ext:flex-1 ext:flex ext:flex-col ext:overflow-hidden ext:bg-white">
    <!-- Toolbar -->
    <div class="ext:px-4 sm:ext:px-6 ext:py-3 ext:border-b ext:border-gray-200 ext:flex ext:flex-wrap ext:items-center ext:justify-between ext:gap-3">
      <div class="ext:flex ext:items-center ext:gap-2">
        <button
          v-if="writableCalendars.length > 0"
          type="button"
          class="ext:px-3 ext:py-1.5 ext:text-sm ext:font-medium ext:bg-blue-600 ext:text-white ext:rounded hover:ext:bg-blue-700"
          @click="openCreate"
        >
          + {{ t('New Note') }}
        </button>
      </div>

      <div class="ext:flex ext:items-center ext:gap-2">
        <input
          v-model="searchQuery"
          type="text"
          :placeholder="t('Search notes...')"
          class="ext:px-2.5 ext:py-1.5 ext:text-sm ext:border ext:border-gray-300 ext:rounded ext:w-56"
        />
        <button
          type="button"
          class="ext:p-1.5 ext:text-gray-600 hover:ext:bg-gray-100 ext:rounded"
          :title="t('Refresh')"
          @click="emit('refresh')"
        >
          <svg
            class="ext:w-4 ext:h-4"
            :class="{ 'ext:animate-spin': loading }"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Grid of Notes -->
    <div class="ext:flex-1 ext:overflow-y-auto ext:p-4 sm:ext:p-6">
      <div
        v-if="filteredJournals.length === 0"
        class="ext:flex ext:flex-col ext:items-center ext:justify-center ext:h-56 ext:text-gray-500"
      >
        <p class="ext:text-sm">{{ t('No notes yet') }}</p>
      </div>

      <div
        v-else
        class="ext:grid ext:grid-cols-1 md:ext:grid-cols-2 lg:ext:grid-cols-3 ext:gap-4 ext:max-w-6xl ext:mx-auto"
      >
        <article
          v-for="journal in filteredJournals"
          :key="`${journal.href}_${journal.uid}`"
          class="ext:p-4 ext:rounded-lg ext:border ext:border-gray-200 ext:bg-gray-50 hover:ext:bg-gray-100 ext:cursor-pointer ext:flex ext:flex-col ext:gap-2 ext:transition-colors"
          @click="openEdit(journal)"
        >
          <div class="ext:flex ext:items-start ext:justify-between ext:gap-2">
            <h3 class="ext:text-sm ext:font-semibold ext:text-gray-900 ext:line-clamp-2">
              {{ journal.summary }}
            </h3>
            <span
              v-if="journal.status === 'DRAFT'"
              class="ext:px-1.5 ext:py-0.5 ext:text-[10px] ext:bg-yellow-100 ext:text-yellow-800 ext:rounded ext:shrink-0"
            >
              {{ t('Draft') }}
            </span>
          </div>

          <p v-if="journal.description" class="ext:text-xs ext:text-gray-600 ext:whitespace-pre-line ext:line-clamp-4 ext:flex-1">
            {{ journal.description }}
          </p>

          <div class="ext:flex ext:items-center ext:justify-between ext:gap-2 ext:pt-2 ext:border-t ext:border-gray-200 ext:text-[11px] ext:text-gray-500">
            <div class="ext:flex ext:items-center ext:gap-1.5 ext:flex-wrap">
              <span
                v-if="getCalendar(journal.calendarHref)"
                class="ext:inline-flex ext:items-center ext:gap-1"
              >
                <span
                  class="ext:w-2 ext:h-2 ext:rounded-full"
                  :style="{ backgroundColor: getCalendar(journal.calendarHref)?.color }"
                />
                {{ getCalendar(journal.calendarHref)?.displayName }}
              </span>
              <span
                v-for="cat in journal.categories || []"
                :key="cat"
                class="ext:px-1.5 ext:py-0.5 ext:text-[10px] ext:bg-blue-100 ext:text-blue-700 ext:rounded"
              >
                #{{ cat }}
              </span>
            </div>
            <span v-if="journal.dtstart" class="ext:shrink-0">
              {{ journal.dtstart.toLocaleDateString(locale) }}
            </span>
          </div>
        </article>
      </div>
    </div>

    <!-- Note Editor Modal -->
    <Teleport to="body">
      <div
        v-if="editorOpen"
        class="ext:fixed ext:inset-0 ext:z-50 ext:flex ext:items-center ext:justify-center ext:bg-black/50 ext:p-4"
        @click.self="editorOpen = false"
      >
        <div class="ext:bg-white ext:rounded-lg ext:shadow-xl ext:w-full ext:max-w-xl ext:max-h-[90vh] ext:flex ext:flex-col">
          <div class="ext:px-6 ext:py-4 ext:border-b ext:flex ext:items-center ext:justify-between">
            <h2 class="ext:text-lg ext:font-semibold ext:text-gray-900">
              {{ editingJournal ? t('Edit Note') : t('New Note') }}
            </h2>
            <button type="button" class="ext:text-gray-500 hover:ext:text-gray-700" @click="editorOpen = false">
              <svg class="ext:w-5 ext:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form class="ext:px-6 ext:py-4 ext:space-y-4 ext:overflow-y-auto ext:flex-1" @submit.prevent="handleSave">
            <div>
              <label class="ext:block ext:text-sm ext:font-medium ext:text-gray-700 ext:mb-1">{{ t('Title') }}</label>
              <input
                v-model="form.summary"
                type="text"
                required
                :placeholder="t('Note title')"
                class="ext:w-full ext:px-3 ext:py-2 ext:text-sm ext:border ext:border-gray-300 ext:rounded"
              />
            </div>

            <div class="ext:grid ext:grid-cols-1 sm:ext:grid-cols-3 ext:gap-3">
              <div v-if="!editingJournal">
                <label class="ext:block ext:text-sm ext:font-medium ext:text-gray-700 ext:mb-1">{{ t('Calendar') }}</label>
                <select
                  v-model="form.calendarHref"
                  class="ext:w-full ext:px-3 ext:py-2 ext:text-sm ext:border ext:border-gray-300 ext:rounded"
                >
                  <option v-for="cal in writableCalendars" :key="cal.href" :value="cal.href">
                    {{ cal.displayName }}
                  </option>
                </select>
              </div>
              <div>
                <label class="ext:block ext:text-sm ext:font-medium ext:text-gray-700 ext:mb-1">{{ t('Date') }}</label>
                <input
                  v-model="dateInput"
                  type="date"
                  class="ext:w-full ext:px-3 ext:py-2 ext:text-sm ext:border ext:border-gray-300 ext:rounded"
                />
              </div>
              <div>
                <label class="ext:block ext:text-sm ext:font-medium ext:text-gray-700 ext:mb-1">{{ t('Status') }}</label>
                <select
                  v-model="form.status"
                  class="ext:w-full ext:px-3 ext:py-2 ext:text-sm ext:border ext:border-gray-300 ext:rounded"
                >
                  <option v-for="s in statuses" :key="s.value" :value="s.value">
                    {{ t(s.label) }}
                  </option>
                </select>
              </div>
            </div>

            <!-- Categories -->
            <div>
              <label class="ext:block ext:text-sm ext:font-medium ext:text-gray-700 ext:mb-1">{{ t('Categories') }}</label>
              <div class="ext:flex ext:flex-wrap ext:gap-1.5 ext:mb-1.5">
                <span
                  v-for="cat in form.categories || []"
                  :key="cat"
                  class="ext:inline-flex ext:items-center ext:gap-1 ext:px-2 ext:py-0.5 ext:text-xs ext:bg-blue-100 ext:text-blue-700 ext:rounded-full"
                >
                  #{{ cat }}
                  <button type="button" class="hover:ext:text-red-600" @click="removeCategory(cat)">×</button>
                </span>
              </div>
              <input
                v-model="categoryInput"
                type="text"
                :placeholder="t('Add tag and press Enter')"
                class="ext:w-full ext:px-3 ext:py-1.5 ext:text-sm ext:border ext:border-gray-300 ext:rounded"
                @keydown.enter.prevent="addCategory"
              />
            </div>

            <div>
              <label class="ext:block ext:text-sm ext:font-medium ext:text-gray-700 ext:mb-1">{{ t('Description') }}</label>
              <textarea
                v-model="form.description"
                rows="8"
                :placeholder="t('Write your note...')"
                class="ext:w-full ext:px-3 ext:py-2 ext:text-sm ext:border ext:border-gray-300 ext:rounded"
              />
            </div>
          </form>

          <div class="ext:px-6 ext:py-4 ext:border-t ext:bg-gray-50 ext:flex ext:items-center ext:justify-between">
            <div>
              <button
                v-if="editingJournal && !isReadOnly(editingJournal)"
                type="button"
                class="ext:px-3 ext:py-2 ext:text-sm ext:text-red-600 hover:ext:text-red-800"
                @click="handleDelete"
              >
                {{ t('Delete') }}
              </button>
            </div>
            <div class="ext:flex ext:gap-2">
              <button
                type="button"
                class="ext:px-4 ext:py-2 ext:text-sm ext:text-gray-700 ext:bg-gray-200 ext:rounded hover:ext:bg-gray-300"
                @click="editorOpen = false"
              >
                {{ t('Cancel') }}
              </button>
              <button
                v-if="!editingJournal || !isReadOnly(editingJournal)"
                type="button"
                :disabled="!form.summary.trim()"
                class="ext:px-4 ext:py-2 ext:text-sm ext:bg-blue-600 ext:text-white ext:rounded hover:ext:bg-blue-700 disabled:ext:opacity-50"
                @click="handleSave"
              >
                {{ t('Save') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
