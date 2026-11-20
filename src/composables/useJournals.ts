import { ref, computed, readonly } from 'vue'
import { getCalDAVClient } from '../caldav/client'
import type { Calendar, CalendarJournal, JournalFormData } from '../types/calendar'

const journals = ref<CalendarJournal[]>([])
const loading = ref(false)
const error = ref<Error | null>(null)

export function useJournals() {
  const client = getCalDAVClient()

  async function loadJournals(calendars: readonly Calendar[]): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const results = await Promise.all(
        calendars.map(async (cal) => {
          try {
            return await client.fetchJournals(cal.href)
          } catch (e) {
            console.warn(`Failed to fetch notes for ${cal.displayName}:`, e)
            return []
          }
        })
      )
      journals.value = results.flat().sort((a, b) => {
        const ta = (a.lastModified || a.dtstart)?.getTime() || 0
        const tb = (b.lastModified || b.dtstart)?.getTime() || 0
        return tb - ta
      })
    } catch (err) {
      error.value = err instanceof Error ? err : new Error('Failed to load notes')
    } finally {
      loading.value = false
    }
  }

  async function createJournal(formData: JournalFormData): Promise<CalendarJournal> {
    const created = await client.createJournal(formData)
    journals.value = [created, ...journals.value]
    return created
  }

  async function updateJournal(
    journal: CalendarJournal,
    formData: JournalFormData
  ): Promise<CalendarJournal> {
    const updated = await client.updateJournal(journal, formData)
    journals.value = journals.value.map((j) =>
      j.uid === journal.uid && j.href === journal.href ? updated : j
    )
    return updated
  }

  async function removeJournal(journal: CalendarJournal): Promise<void> {
    await client.deleteJournal(journal)
    journals.value = journals.value.filter(
      (j) => !(j.uid === journal.uid && j.href === journal.href)
    )
  }

  return {
    journals: computed(() => journals.value),
    loading: readonly(loading),
    error: readonly(error),
    loadJournals,
    createJournal,
    updateJournal,
    removeJournal
  }
}
