import { ref, computed, readonly } from 'vue'
import { getCalDAVClient } from '../caldav/client'
import type { AddressBook, CalendarEvent, Contact, ContactFormData, DateRange } from '../types/calendar'

const addressBooks = ref<AddressBook[]>([])
const contacts = ref<Contact[]>([])
const loading = ref(false)
const error = ref<Error | null>(null)
const available = ref(false)

export function useContacts() {
  const client = getCalDAVClient()

  async function loadContacts(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const books = await client.discoverAddressBooks()
      addressBooks.value = books
      available.value = books.length > 0

      if (books.length === 0) {
        contacts.value = []
        return
      }

      const results = await Promise.all(
        books.map(async (book) => {
          try {
            return await client.fetchContacts(book.href)
          } catch (e) {
            console.warn(`Failed to fetch contacts from ${book.displayName}:`, e)
            return []
          }
        })
      )
      contacts.value = results.flat().sort((a, b) => a.fullName.localeCompare(b.fullName))
    } catch (err) {
      error.value = err instanceof Error ? err : new Error('Failed to load contacts')
    } finally {
      loading.value = false
    }
  }

  async function createContact(formData: ContactFormData): Promise<Contact> {
    const created = await client.createContact(formData)
    contacts.value = [...contacts.value, created].sort((a, b) =>
      a.fullName.localeCompare(b.fullName)
    )
    return created
  }

  async function updateContact(contact: Contact, formData: ContactFormData): Promise<Contact> {
    const updated = await client.updateContact(contact, formData)
    contacts.value = contacts.value
      .map((c) => (c.uid === contact.uid && c.href === contact.href ? updated : c))
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
    return updated
  }

  async function removeContact(contact: Contact): Promise<void> {
    await client.deleteContact(contact)
    contacts.value = contacts.value.filter(
      (c) => !(c.uid === contact.uid && c.href === contact.href)
    )
  }

  /**
   * Generate virtual all-day birthday events from CardDAV contacts that have BDAY set.
   */
  function getBirthdayCalendarEvents(range: DateRange): CalendarEvent[] {
    const startYear = range.start.getFullYear()
    const endYear = range.end.getFullYear()
    const results: CalendarEvent[] = []

    for (const contact of contacts.value) {
      if (!contact.birthday) continue
      const parsed = parseBirthdayParts(contact.birthday)
      if (!parsed) continue

      for (let year = startYear; year <= endYear; year++) {
        const start = new Date(year, parsed.month - 1, parsed.day)
        const end = new Date(year, parsed.month - 1, parsed.day + 1)

        if (end < range.start || start > range.end) continue

        const age = parsed.year ? year - parsed.year : null
        const ageSuffix = age !== null && age > 0 ? ` (${age})` : ''

        results.push({
          uid: `bday-${contact.uid}-${year}`,
          calendarHref: '__birthdays__',
          href: contact.href,
          etag: contact.etag,
          summary: `🎂 ${contact.fullName}${ageSuffix}`,
          start,
          end,
          allDay: true,
          description: contact.organization || undefined,
          icsData: '',
          isRecurring: false,
          virtualType: 'birthday',
          virtualId: contact.uid
        })
      }
    }

    return results
  }

  return {
    addressBooks: computed(() => addressBooks.value),
    contacts: computed(() => contacts.value),
    loading: readonly(loading),
    error: readonly(error),
    available: readonly(available),
    loadContacts,
    createContact,
    updateContact,
    removeContact,
    getBirthdayCalendarEvents
  }
}

function parseBirthdayParts(bday: string): { year?: number; month: number; day: number } | null {
  const full = bday.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (full) {
    return { year: Number(full[1]), month: Number(full[2]), day: Number(full[3]) }
  }
  const noYear = bday.match(/^--(\d{2})-(\d{2})$/)
  if (noYear) {
    return { month: Number(noYear[1]), day: Number(noYear[2]) }
  }
  return null
}
