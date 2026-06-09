import { discoverCalendars, listCalendars } from './discovery'
import {
  fetchEvents as fetchEventsFromCalendar,
  createEvent,
  updateEvent,
  deleteEvent,
  fetchSingleEvent,
  updateEventOccurrence,
  deleteEventOccurrence,
  updateEventSeries
} from './events'
import {
  createCalendar as createCalendarRequest,
  deleteCalendar as deleteCalendarRequest,
  type CreateCalendarData
} from './calendar-management'
import * as sharing from './sharing'
import type { Calendar, CalendarEvent, EventFormData, DateRange } from '../types/calendar'

export { CalDAVError, AuthenticationError, NotFoundError, ConflictError, NetworkError } from './errors'
export type { CreateCalendarData } from './calendar-management'
export type { Share, ShareInfo, ShareType } from './sharing'

export interface CalDAVClient {
  discoverCalendars(): Promise<Calendar[]>
  refreshCalendars(calendarHomeUrl: string): Promise<Calendar[]>
  fetchEvents(calendarHref: string, range: DateRange): Promise<CalendarEvent[]>
  fetchAllEvents(calendars: Calendar[], range: DateRange): Promise<CalendarEvent[]>
  createEvent(formData: EventFormData): Promise<CalendarEvent>
  updateEvent(event: CalendarEvent, formData: EventFormData): Promise<CalendarEvent>
  deleteEvent(event: CalendarEvent): Promise<void>
  fetchSingleEvent(href: string): Promise<CalendarEvent | null>
  updateEventOccurrence(event: CalendarEvent, recurrenceId: string, formData: EventFormData): Promise<void>
  deleteEventOccurrence(event: CalendarEvent, recurrenceId: string): Promise<void>
  updateEventSeries(event: CalendarEvent, formData: EventFormData): Promise<void>
  createCalendar(calendarHomeUrl: string, data: CreateCalendarData): Promise<Calendar>
  deleteCalendar(calendarHref: string): Promise<void>

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
    deleteEvent,
    fetchSingleEvent,
    updateEventOccurrence,
    deleteEventOccurrence,
    updateEventSeries,
    createCalendar: createCalendarRequest,
    deleteCalendar: deleteCalendarRequest,

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
