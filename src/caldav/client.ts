import { discoverCalendars, listCalendars } from './discovery'
import {
  fetchEvents as fetchEventsFromCalendar,
  createEvent,
  updateEvent,
  moveEvent,
  deleteEvent,
  fetchSingleEvent,
  updateEventOccurrence,
  deleteEventOccurrence,
  updateEventSeries
} from './events'
import {
  createCalendar as createCalendarRequest,
  updateCalendar as updateCalendarRequest,
  exportCalendarICS as exportCalendarICSRequest,
  deleteCalendar as deleteCalendarRequest,
  type CreateCalendarData,
  type UpdateCalendarData
} from './calendar-management'
import {
  fetchTodos,
  createTodo,
  updateTodo,
  deleteTodo
} from './todos'
import {
  fetchJournals,
  createJournal,
  updateJournal,
  deleteJournal
} from './journals'
import { fetchFreeBusy } from './freebusy'
import {
  discoverAddressBooks,
  fetchContacts,
  createContact,
  updateContact,
  deleteContact
} from './carddav'
import * as sharing from './sharing'
import type {
  AddressBook,
  Calendar,
  CalendarEvent,
  CalendarJournal,
  CalendarTodo,
  Contact,
  ContactFormData,
  DateRange,
  EventFormData,
  FreeBusyPeriod,
  JournalFormData,
  TodoFormData
} from '../types/calendar'

export { CalDAVError, AuthenticationError, NotFoundError, ConflictError, NetworkError } from './errors'
export type { CreateCalendarData, UpdateCalendarData } from './calendar-management'
export type { Share, ShareInfo, ShareType } from './sharing'

export interface CalDAVClient {
  discoverCalendars(): Promise<Calendar[]>
  refreshCalendars(calendarHomeUrl: string): Promise<Calendar[]>
  fetchEvents(calendarHref: string, range: DateRange): Promise<CalendarEvent[]>
  fetchAllEvents(calendars: Calendar[], range: DateRange): Promise<CalendarEvent[]>
  createEvent(formData: EventFormData): Promise<CalendarEvent>
  updateEvent(event: CalendarEvent, formData: EventFormData): Promise<CalendarEvent>
  moveEvent(event: CalendarEvent, formData: EventFormData): Promise<CalendarEvent>
  deleteEvent(event: CalendarEvent): Promise<void>
  fetchSingleEvent(href: string): Promise<CalendarEvent | null>
  updateEventOccurrence(event: CalendarEvent, recurrenceId: string, formData: EventFormData): Promise<void>
  deleteEventOccurrence(event: CalendarEvent, recurrenceId: string): Promise<void>
  updateEventSeries(event: CalendarEvent, formData: EventFormData): Promise<void>
  createCalendar(calendarHomeUrl: string, data: CreateCalendarData): Promise<Calendar>
  updateCalendar(calendarHref: string, data: UpdateCalendarData): Promise<void>
  exportCalendarICS(calendarHref: string): Promise<string>
  deleteCalendar(calendarHref: string): Promise<void>

  // Tasks (VTODO)
  fetchTodos(calendarHref: string): Promise<CalendarTodo[]>
  createTodo(formData: TodoFormData): Promise<CalendarTodo>
  updateTodo(todo: CalendarTodo, formData: TodoFormData): Promise<CalendarTodo>
  deleteTodo(todo: CalendarTodo): Promise<void>

  // Notes / Journals (VJOURNAL)
  fetchJournals(calendarHref: string): Promise<CalendarJournal[]>
  createJournal(formData: JournalFormData): Promise<CalendarJournal>
  updateJournal(journal: CalendarJournal, formData: JournalFormData): Promise<CalendarJournal>
  deleteJournal(journal: CalendarJournal): Promise<void>

  // Free/Busy (RFC 4791)
  fetchFreeBusy(calendarHref: string, start: Date, end: Date): Promise<FreeBusyPeriod[]>

  // Contacts (CardDAV)
  discoverAddressBooks(): Promise<AddressBook[]>
  fetchContacts(addressBookHref: string): Promise<Contact[]>
  createContact(formData: ContactFormData): Promise<Contact>
  updateContact(contact: Contact, formData: ContactFormData): Promise<Contact>
  deleteContact(contact: Contact): Promise<void>

  // Sharing methods
  getSharingInfo(): Promise<sharing.ShareInfo>
  listShares(type?: sharing.ShareType, filter?: { PathOrToken?: string; PathMapped?: string }): Promise<sharing.Share[]>
  createShare(type: 'map' | 'token', data: any): Promise<{ PathOrToken: string }>
  updateShare(type: 'map' | 'token', data: any): Promise<void>
  deleteShare(type: 'map' | 'token', PathOrToken: string): Promise<void>
  enableShare(type: 'map' | 'token', PathOrToken: string): Promise<void>
  disableShare(type: 'map' | 'token', PathOrToken: string): Promise<void>
  hideShare(type: 'map' | 'token', PathOrToken: string): Promise<void>
  unhideShare(type: 'map' | 'token', PathOrToken: string): Promise<void>
}

export function createCalDAVClient(): CalDAVClient {
  return {
    discoverCalendars,

    refreshCalendars: listCalendars,

    fetchEvents: fetchEventsFromCalendar,

    async fetchAllEvents(calendars: Calendar[], range: DateRange): Promise<CalendarEvent[]> {
      const visibleCalendars = calendars.filter((c) => c.visible)
      const results = await Promise.all(
        visibleCalendars.map((cal) => fetchEventsFromCalendar(cal.href, range))
      )
      return results.flat()
    },

    createEvent,
    updateEvent,
    moveEvent,
    deleteEvent,
    fetchSingleEvent,
    updateEventOccurrence,
    deleteEventOccurrence,
    updateEventSeries,
    createCalendar: createCalendarRequest,
    updateCalendar: updateCalendarRequest,
    exportCalendarICS: exportCalendarICSRequest,
    deleteCalendar: deleteCalendarRequest,

    // Tasks
    fetchTodos,
    createTodo,
    updateTodo,
    deleteTodo,

    // Journals
    fetchJournals,
    createJournal,
    updateJournal,
    deleteJournal,

    // Free/Busy
    fetchFreeBusy,

    // Contacts (CardDAV)
    discoverAddressBooks,
    fetchContacts,
    createContact,
    updateContact,
    deleteContact,

    // Sharing methods
    getSharingInfo: sharing.getSharingInfo,
    listShares: sharing.listShares,
    createShare: sharing.createShare,
    updateShare: sharing.updateShare,
    deleteShare: sharing.deleteShare,
    enableShare: sharing.enableShare,
    disableShare: sharing.disableShare,
    hideShare: sharing.hideShare,
    unhideShare: sharing.unhideShare
  }
}

// Singleton instance
let clientInstance: CalDAVClient | null = null

export function getCalDAVClient(): CalDAVClient {
  if (!clientInstance) {
    clientInstance = createCalDAVClient()
  }
  return clientInstance
}
