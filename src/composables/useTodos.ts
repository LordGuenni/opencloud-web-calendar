import { ref, computed, readonly } from 'vue'
import { getCalDAVClient } from '../caldav/client'
import type { Calendar, CalendarEvent, CalendarTodo, TodoFormData } from '../types/calendar'

const todos = ref<CalendarTodo[]>([])
const loading = ref(false)
const error = ref<Error | null>(null)

export function useTodos() {
  const client = getCalDAVClient()

  async function loadTodos(calendars: readonly Calendar[]): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const results = await Promise.all(
        calendars.map(async (cal) => {
          try {
            return await client.fetchTodos(cal.href)
          } catch (e) {
            console.warn(`Failed to fetch tasks for ${cal.displayName}:`, e)
            return []
          }
        })
      )
      todos.value = results.flat()
    } catch (err) {
      error.value = err instanceof Error ? err : new Error('Failed to load tasks')
    } finally {
      loading.value = false
    }
  }

  async function createTodo(formData: TodoFormData): Promise<CalendarTodo> {
    const created = await client.createTodo(formData)
    todos.value = [created, ...todos.value]
    return created
  }

  async function updateTodo(todo: CalendarTodo, formData: TodoFormData): Promise<CalendarTodo> {
    const updated = await client.updateTodo(todo, formData)
    todos.value = todos.value.map((t) => (t.uid === todo.uid && t.href === todo.href ? updated : t))
    return updated
  }

  function toggleTodoComplete(todo: CalendarTodo): Promise<CalendarTodo> {
    const nextStatus = todo.status === 'COMPLETED' ? 'NEEDS-ACTION' : 'COMPLETED'
    return updateTodo(todo, {
      uid: todo.uid,
      calendarHref: todo.calendarHref,
      summary: todo.summary,
      description: todo.description || '',
      status: nextStatus,
      priority: todo.priority,
      percentComplete: nextStatus === 'COMPLETED' ? 100 : 0,
      due: todo.due || null,
      categories: todo.categories || []
    })
  }

  async function removeTodo(todo: CalendarTodo): Promise<void> {
    await client.deleteTodo(todo)
    todos.value = todos.value.filter((t) => !(t.uid === todo.uid && t.href === todo.href))
  }

  /**
   * Convert tasks with due dates into virtual CalendarEvent items so they can
   * optionally appear alongside events on the calendar grid & agenda.
   */
  function getTodoCalendarEvents(calendars: readonly Calendar[]): CalendarEvent[] {
    const normalize = (h: string) => (h.endsWith('/') ? h : `${h}/`)
    const visibleHrefs = new Set(calendars.filter((c) => c.visible).map((c) => normalize(c.href)))

    return todos.value
      .filter((todo) => todo.due && visibleHrefs.has(normalize(todo.calendarHref)))
      .map((todo) => {
        const start = new Date(todo.due!)
        const end = new Date(start)
        end.setDate(end.getDate() + 1)

        return {
          uid: `todo-${todo.uid}`,
          calendarHref: todo.calendarHref,
          href: todo.href,
          etag: todo.etag,
          summary: `${todo.status === 'COMPLETED' ? '✓ ' : '☐ '}${todo.summary}`,
          start,
          end,
          allDay: true,
          description: todo.description,
          categories: todo.categories,
          status: todo.status === 'COMPLETED' ? 'CANCELLED' : 'CONFIRMED',
          icsData: todo.icsData,
          isRecurring: false,
          virtualType: 'todo' as const,
          virtualId: todo.uid
        }
      })
  }

  return {
    todos: computed(() => todos.value),
    loading: readonly(loading),
    error: readonly(error),
    loadTodos,
    createTodo,
    updateTodo,
    toggleTodoComplete,
    removeTodo,
    getTodoCalendarEvents
  }
}
