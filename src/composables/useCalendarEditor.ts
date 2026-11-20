import { ref, readonly, computed } from 'vue'
import { getCalDAVClient, type CreateCalendarData } from '../caldav/client'
import type { Calendar } from '../types/calendar'

const isOpen = ref(false)
const editingCalendar = ref<Calendar | null>(null)
const formData = ref<CreateCalendarData>(createEmptyFormData())
const saving = ref(false)
const error = ref<Error | null>(null)

function createEmptyFormData(): CreateCalendarData {
  return {
    displayName: '',
    description: '',
    color: '#3788d8'
  }
}

export function useCalendarEditor() {
  const client = getCalDAVClient()
  const isEditing = computed(() => editingCalendar.value !== null)

  function open() {
    editingCalendar.value = null
    formData.value = createEmptyFormData()
    error.value = null
    isOpen.value = true
  }

  function openEdit(calendar: Calendar) {
    editingCalendar.value = calendar
    formData.value = {
      displayName: calendar.displayName,
      description: calendar.description || '',
      color: calendar.color || '#3788d8'
    }
    error.value = null
    isOpen.value = true
  }

  function close() {
    isOpen.value = false
    editingCalendar.value = null
    error.value = null
  }

  async function save(calendarHomeUrl: string): Promise<boolean> {
    saving.value = true
    error.value = null

    try {
      if (editingCalendar.value) {
        await client.updateCalendar(editingCalendar.value.href, formData.value)
      } else {
        await client.createCalendar(calendarHomeUrl, formData.value)
      }
      close()
      return true
    } catch (err) {
      error.value =
        err instanceof Error
          ? err
          : new Error(editingCalendar.value ? 'Failed to update calendar' : 'Failed to create calendar')
      return false
    } finally {
      saving.value = false
    }
  }

  return {
    isOpen: readonly(isOpen),
    isEditing,
    editingCalendar: readonly(editingCalendar),
    formData,
    saving: readonly(saving),
    error: readonly(error),
    open,
    openEdit,
    close,
    save
  }
}
