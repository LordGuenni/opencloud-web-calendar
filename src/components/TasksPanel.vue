<script setup lang="ts">
import { ref, computed } from 'vue'
import { t, getLanguage } from '../composables/useLanguage'
import { formatDateForInput } from '../utils/date'
import type { Calendar, CalendarTodo, TodoFormData, TodoStatus } from '../types/calendar'

const props = defineProps<{
  todos: readonly CalendarTodo[]
  calendars: readonly Calendar[]
  loading: boolean
}>()

const emit = defineEmits<{
  create: [data: TodoFormData]
  update: [todo: CalendarTodo, data: TodoFormData]
  toggle: [todo: CalendarTodo]
  delete: [todo: CalendarTodo]
  refresh: []
}>()

const locale = computed(() => getLanguage())
const searchQuery = ref('')
const statusFilter = ref<'all' | 'open' | 'completed' | 'overdue'>('open')
const quickTitle = ref('')
const saving = ref(false)

// Modal state
const editorOpen = ref(false)
const editingTodo = ref<CalendarTodo | null>(null)
const form = ref<TodoFormData>(createEmptyForm())
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

function createEmptyForm(): TodoFormData {
  return {
    calendarHref: writableCalendars.value[0]?.href || props.calendars[0]?.href || '',
    summary: '',
    description: '',
    status: 'NEEDS-ACTION',
    priority: 0,
    percentComplete: 0,
    due: null,
    categories: []
  }
}

const filteredTodos = computed(() => {
  const now = new Date()
  const q = searchQuery.value.trim().toLowerCase()
  const visibleHrefs = new Set(
    props.calendars.filter((c) => c.visible).map((c) => (c.href.endsWith('/') ? c.href : `${c.href}/`))
  )

  return props.todos
    .filter((todo) => {
      const normHref = todo.calendarHref.endsWith('/') ? todo.calendarHref : `${todo.calendarHref}/`
      if (visibleHrefs.size > 0 && !visibleHrefs.has(normHref)) return false

      if (statusFilter.value === 'open' && todo.status === 'COMPLETED') return false
      if (statusFilter.value === 'completed' && todo.status !== 'COMPLETED') return false
      if (
        statusFilter.value === 'overdue' &&
        (todo.status === 'COMPLETED' || !todo.due || todo.due >= now)
      ) {
        return false
      }

      if (q) {
        const hay = [todo.summary, todo.description || '', ...(todo.categories || [])]
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    .slice()
    .sort((a, b) => {
      // Incomplete first, then by priority (1 highest, 0 lowest), then due date
      if ((a.status === 'COMPLETED') !== (b.status === 'COMPLETED')) {
        return a.status === 'COMPLETED' ? 1 : -1
      }
      const pa = a.priority === 0 ? 10 : a.priority
      const pb = b.priority === 0 ? 10 : b.priority
      if (pa !== pb) return pa - pb
      if (a.due && b.due) return a.due.getTime() - b.due.getTime()
      if (a.due) return -1
      if (b.due) return 1
      return a.summary.localeCompare(b.summary)
    })
})

const dueDateInput = computed({
  get: () => (form.value.due ? formatDateForInput(form.value.due) : ''),
  set: (val: string) => {
    form.value.due = val ? new Date(`${val}T23:59:00`) : null
  }
})

function isOverdue(todo: CalendarTodo): boolean {
  return !!todo.due && todo.status !== 'COMPLETED' && todo.due < new Date()
}

function getCalendar(href: string): Calendar | undefined {
  return calendarMap.value.get(href) || calendarMap.value.get(`${href}/`)
}

function isReadOnly(todo: CalendarTodo): boolean {
  return getCalendar(todo.calendarHref)?.readOnly || false
}

function handleQuickAdd() {
  const title = quickTitle.value.trim()
  if (!title || writableCalendars.value.length === 0) return
  emit('create', {
    calendarHref: writableCalendars.value[0].href,
    summary: title,
    description: '',
    status: 'NEEDS-ACTION',
    priority: 0,
    percentComplete: 0,
    due: null,
    categories: []
  })
  quickTitle.value = ''
}

function openCreate() {
  editingTodo.value = null
  form.value = createEmptyForm()
  categoryInput.value = ''
  editorOpen.value = true
}

function openEdit(todo: CalendarTodo) {
  editingTodo.value = todo
  form.value = {
    uid: todo.uid,
    calendarHref: todo.calendarHref,
    summary: todo.summary,
    description: todo.description || '',
    status: todo.status,
    priority: todo.priority,
    percentComplete: todo.percentComplete,
    due: todo.due ? new Date(todo.due) : null,
    categories: todo.categories ? [...todo.categories] : []
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
  saving.value = true
  try {
    if (editingTodo.value) {
      emit('update', editingTodo.value, { ...form.value })
    } else {
      emit('create', { ...form.value })
    }
    editorOpen.value = false
  } finally {
    saving.value = false
  }
}

function handleDelete() {
  if (!editingTodo.value) return
  emit('delete', editingTodo.value)
  editorOpen.value = false
}

function getPriorityLabel(priority: number): string {
  if (priority >= 1 && priority <= 4) return t('High')
  if (priority === 5) return t('Medium')
  if (priority >= 6 && priority <= 9) return t('Low')
  return ''
}

function getPriorityClass(priority: number): string {
  if (priority >= 1 && priority <= 4) return 'ext:bg-red-100 ext:text-red-700'
  if (priority === 5) return 'ext:bg-yellow-100 ext:text-yellow-800'
  return 'ext:bg-gray-200 ext:text-gray-700'
}

const statuses: Array<{ value: TodoStatus; label: string }> = [
  { value: 'NEEDS-ACTION', label: 'Needs Action' },
  { value: 'IN-PROCESS', label: 'In Progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' }
]
</script>

<template>
  <div class="ext:flex-1 ext:flex ext:flex-col ext:overflow-hidden ext:bg-white">
    <!-- Header Bar -->
    <div class="ext:px-4 sm:ext:px-6 ext:py-4 ext:border-b ext:border-gray-200 ext:space-y-3">
      <div class="ext:flex ext:flex-wrap ext:items-center ext:justify-between ext:gap-3">
        <!-- Quick add -->
        <form
          v-if="writableCalendars.length > 0"
          class="ext:flex ext:flex-1 ext:min-w-[240px] ext:gap-2"
          @submit.prevent="handleQuickAdd"
        >
          <input
            v-model="quickTitle"
            type="text"
            :placeholder="t('Add a new task...')"
            class="ext:flex-1 ext:px-3 ext:py-1.5 ext:text-sm ext:border ext:border-gray-300 ext:rounded ext:focus:ring-2 ext:focus:ring-blue-500"
          />
          <button
            type="submit"
            :disabled="!quickTitle.trim()"
            class="ext:px-3 ext:py-1.5 ext:text-sm ext:font-medium ext:bg-blue-600 ext:text-white ext:rounded hover:ext:bg-blue-700 disabled:ext:opacity-50"
          >
            {{ t('Add') }}
          </button>
          <button
            type="button"
            class="ext:px-3 ext:py-1.5 ext:text-sm ext:font-medium ext:border ext:border-gray-300 ext:text-gray-700 ext:bg-white ext:rounded hover:ext:bg-gray-50"
            @click="openCreate"
          >
            + {{ t('New Task') }}
          </button>
        </form>
      </div>

      <!-- Filter & search row -->
      <div class="ext:flex ext:flex-wrap ext:items-center ext:justify-between ext:gap-2">
        <div class="ext:flex ext:rounded ext:border ext:border-gray-300 ext:overflow-hidden">
          <button
            v-for="tab in (['open', 'all', 'overdue', 'completed'] as const)"
            :key="tab"
            type="button"
            class="ext:px-3 ext:py-1 ext:text-xs ext:font-medium ext:border-l first:ext:border-l-0 ext:border-gray-300"
            :class="
              statusFilter === tab
                ? 'ext:bg-blue-600 ext:text-white'
                : 'ext:bg-white ext:text-gray-700 hover:ext:bg-gray-50'
            "
            @click="statusFilter = tab"
          >
            {{
              tab === 'open'
                ? t('Open')
                : tab === 'all'
                  ? t('All')
                  : tab === 'overdue'
                    ? t('Overdue')
                    : t('Completed')
            }}
          </button>
        </div>

        <div class="ext:flex ext:items-center ext:gap-2">
          <input
            v-model="searchQuery"
            type="text"
            :placeholder="t('Search tasks...')"
            class="ext:px-2.5 ext:py-1 ext:text-xs ext:border ext:border-gray-300 ext:rounded ext:w-48"
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
    </div>

    <!-- Task list -->
    <div class="ext:flex-1 ext:overflow-y-auto ext:p-4 sm:ext:p-6">
      <div
        v-if="filteredTodos.length === 0"
        class="ext:flex ext:flex-col ext:items-center ext:justify-center ext:h-56 ext:text-gray-500"
      >
        <p class="ext:text-sm">{{ t('No tasks found') }}</p>
      </div>

      <ul v-else class="ext:max-w-4xl ext:mx-auto ext:space-y-2">
        <li
          v-for="todo in filteredTodos"
          :key="`${todo.href}_${todo.uid}`"
          class="ext:flex ext:items-start ext:gap-3 ext:p-3 ext:rounded-lg ext:border ext:border-gray-200 ext:bg-gray-50 hover:ext:bg-gray-100 ext:transition-colors"
        >
          <input
            type="checkbox"
            :checked="todo.status === 'COMPLETED'"
            :disabled="isReadOnly(todo)"
            class="ext:mt-1 ext:w-4 ext:h-4 ext:rounded ext:border-gray-300 ext:cursor-pointer"
            @change="emit('toggle', todo)"
          />

          <div class="ext:flex-1 ext:min-w-0 ext:cursor-pointer" @click="openEdit(todo)">
            <div class="ext:flex ext:items-center ext:gap-2 ext:flex-wrap">
              <span
                class="ext:text-sm ext:font-medium ext:text-gray-900"
                :class="{ 'ext:line-through ext:text-gray-500': todo.status === 'COMPLETED' }"
              >
                {{ todo.summary }}
              </span>
              <span
                v-if="todo.priority > 0"
                class="ext:px-1.5 ext:py-0.5 ext:text-[10px] ext:font-medium ext:rounded"
                :class="getPriorityClass(todo.priority)"
              >
                {{ getPriorityLabel(todo.priority) }}
              </span>
              <span
                v-if="todo.status === 'IN-PROCESS'"
                class="ext:px-1.5 ext:py-0.5 ext:text-[10px] ext:font-medium ext:bg-blue-100 ext:text-blue-700 ext:rounded"
              >
                {{ t('In Progress') }} ({{ todo.percentComplete }}%)
              </span>
            </div>

            <p v-if="todo.description" class="ext:text-xs ext:text-gray-600 ext:mt-0.5 ext:line-clamp-2">
              {{ todo.description }}
            </p>

            <div class="ext:flex ext:items-center ext:gap-2 ext:mt-1.5 ext:flex-wrap">
              <span
                v-if="getCalendar(todo.calendarHref)"
                class="ext:inline-flex ext:items-center ext:gap-1 ext:text-[10px] ext:px-1.5 ext:py-0.5 ext:rounded ext:bg-gray-200 ext:text-gray-700"
              >
                <span
                  class="ext:w-2 ext:h-2 ext:rounded-full"
                  :style="{ backgroundColor: getCalendar(todo.calendarHref)?.color }"
                />
                {{ getCalendar(todo.calendarHref)?.displayName }}
              </span>
              <span
                v-if="todo.due"
                class="ext:text-xs"
                :class="isOverdue(todo) ? 'ext:text-red-600 ext:font-medium' : 'ext:text-gray-500'"
              >
                📅 {{ todo.due.toLocaleDateString(locale) }}
              </span>
              <span
                v-for="cat in todo.categories || []"
                :key="cat"
                class="ext:text-[10px] ext:px-1.5 ext:py-0.5 ext:rounded ext:bg-blue-100 ext:text-blue-700"
              >
                #{{ cat }}
              </span>
            </div>
          </div>

          <button
            v-if="!isReadOnly(todo)"
            type="button"
            class="ext:p-1 ext:text-gray-400 hover:ext:text-red-600"
            :title="t('Delete')"
            @click="emit('delete', todo)"
          >
            <svg class="ext:w-4 ext:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </li>
      </ul>
    </div>

    <!-- Task Editor Modal -->
    <Teleport to="body">
      <div
        v-if="editorOpen"
        class="ext:fixed ext:inset-0 ext:z-50 ext:flex ext:items-center ext:justify-center ext:bg-black/50 ext:p-4"
        @click.self="editorOpen = false"
      >
        <div class="ext:bg-white ext:rounded-lg ext:shadow-xl ext:w-full ext:max-w-lg ext:max-h-[90vh] ext:flex ext:flex-col">
          <div class="ext:px-6 ext:py-4 ext:border-b ext:flex ext:items-center ext:justify-between">
            <h2 class="ext:text-lg ext:font-semibold ext:text-gray-900">
              {{ editingTodo ? t('Edit Task') : t('New Task') }}
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
                class="ext:w-full ext:px-3 ext:py-2 ext:text-sm ext:border ext:border-gray-300 ext:rounded"
              />
            </div>

            <div v-if="!editingTodo">
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

            <div class="ext:grid ext:grid-cols-2 ext:gap-3">
              <div>
                <label class="ext:block ext:text-sm ext:font-medium ext:text-gray-700 ext:mb-1">{{ t('Due Date') }}</label>
                <input
                  v-model="dueDateInput"
                  type="date"
                  class="ext:w-full ext:px-3 ext:py-2 ext:text-sm ext:border ext:border-gray-300 ext:rounded"
                />
              </div>
              <div>
                <label class="ext:block ext:text-sm ext:font-medium ext:text-gray-700 ext:mb-1">{{ t('Priority') }}</label>
                <select
                  v-model.number="form.priority"
                  class="ext:w-full ext:px-3 ext:py-2 ext:text-sm ext:border ext:border-gray-300 ext:rounded"
                >
                  <option :value="0">{{ t('None') }}</option>
                  <option :value="1">{{ t('High') }}</option>
                  <option :value="5">{{ t('Medium') }}</option>
                  <option :value="9">{{ t('Low') }}</option>
                </select>
              </div>
            </div>

            <div class="ext:grid ext:grid-cols-2 ext:gap-3">
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
              <div>
                <label class="ext:block ext:text-sm ext:font-medium ext:text-gray-700 ext:mb-1">
                  {{ t('Progress') }}: {{ form.percentComplete }}%
                </label>
                <input
                  v-model.number="form.percentComplete"
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  class="ext:w-full ext:mt-2"
                />
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
                rows="3"
                class="ext:w-full ext:px-3 ext:py-2 ext:text-sm ext:border ext:border-gray-300 ext:rounded"
              />
            </div>
          </form>

          <div class="ext:px-6 ext:py-4 ext:border-t ext:bg-gray-50 ext:flex ext:items-center ext:justify-between">
            <div>
              <button
                v-if="editingTodo && !isReadOnly(editingTodo)"
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
                v-if="!editingTodo || !isReadOnly(editingTodo)"
                type="button"
                :disabled="saving || !form.summary.trim()"
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
