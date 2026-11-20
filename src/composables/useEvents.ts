import { ref, computed, readonly } from 'vue'
import { getCalDAVClient } from '../caldav/client'
import type { Calendar, CalendarEvent, DateRange } from '../types/calendar'

interface CachedCalendarEvents {
  ctag: string
  rangeKey: string
  events: CalendarEvent[]
}

const events = ref<CalendarEvent[]>([])
const loading = ref(false)
const error = ref<Error | null>(null)
const currentRange = ref<DateRange | null>(null)
const ctagCache = new Map<string, CachedCalendarEvents>()

function normalizeHref(href: string): string {
  return href.endsWith('/') ? href : `${href}/`
}

function getRangeKey(range: DateRange): string {
  return `${range.start.toISOString()}_${range.end.toISOString()}`
}

export function useEvents() {
  const client = getCalDAVClient()

  function invalidateCache(calendarHref?: string): void {
    if (calendarHref) {
      ctagCache.delete(normalizeHref(calendarHref))
    } else {
      ctagCache.clear()
    }
  }

  async function fetchEvents(
    calendars: Calendar[],
    range: DateRange,
    forceRefresh = false
  ): Promise<void> {
    loading.value = true
    error.value = null
    currentRange.value = range

    const rangeKey = getRangeKey(range)
    const visibleCalendars = calendars.filter((c) => c.visible)

    try {
      const results = await Promise.all(
        visibleCalendars.map(async (cal) => {
          const key = normalizeHref(cal.href)
          const cached = ctagCache.get(key)

          // Use cached events if CTag is non-empty and matches for the same date range
          if (
            !forceRefresh &&
            cached &&
            cal.ctag &&
            cached.ctag === cal.ctag &&
            cached.rangeKey === rangeKey
          ) {
            return cached.events
          }

          try {
            const fetched = await client.fetchEvents(cal.href, range)
            if (cal.ctag) {
              ctagCache.set(key, {
                ctag: cal.ctag,
                rangeKey,
                events: fetched
              })
            }
            return fetched
          } catch (calErr) {
            console.error(`Failed to fetch events for calendar ${cal.displayName}:`, calErr)
            return cached ? cached.events : []
          }
        })
      )

      events.value = results.flat()
    } catch (err) {
      error.value = err instanceof Error ? err : new Error('Failed to fetch events')
      console.error('Failed to fetch events:', err)
    } finally {
      loading.value = false
    }
  }

  async function refreshEvents(calendars: Calendar[], forceRefresh = true): Promise<void> {
    if (currentRange.value) {
      await fetchEvents(calendars, currentRange.value, forceRefresh)
    }
  }

  function getVisibleEvents(
    calendars: Calendar[],
    searchQuery = '',
    categoryFilter = ''
  ): CalendarEvent[] {
    const visibleHrefs = new Set(
      calendars.filter((c) => c.visible).map((c) => normalizeHref(c.href))
    )
    const q = searchQuery.trim().toLowerCase()
    const cat = categoryFilter.trim().toLowerCase()

    return events.value.filter((e) => {
      if (!visibleHrefs.has(normalizeHref(e.calendarHref))) return false

      if (cat) {
        const hasCat = (e.categories || []).some((c) => c.toLowerCase() === cat)
        if (!hasCat) return false
      }

      if (q) {
        const haystack = [
          e.summary,
          e.description || '',
          e.location || '',
          e.url || '',
          ...(e.categories || [])
        ]
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(q)) return false
      }

      return true
    })
  }

  const allCategories = computed<string[]>(() => {
    const set = new Set<string>()
    for (const e of events.value) {
      for (const c of e.categories || []) {
        set.add(c)
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  })

  function addEvent(event: CalendarEvent): void {
    invalidateCache(event.calendarHref)
    events.value = [...events.value, event]
  }

  function updateEventInCache(updatedEvent: CalendarEvent): void {
    invalidateCache(updatedEvent.calendarHref)
    if (updatedEvent.recurrenceId) {
      events.value = events.value.map((e) =>
        e.uid === updatedEvent.uid && e.recurrenceId === updatedEvent.recurrenceId
          ? updatedEvent
          : e
      )
    } else {
      events.value = events.value.map((e) => (e.uid === updatedEvent.uid ? updatedEvent : e))
    }
  }

  function removeEvent(uid: string, recurrenceId?: string): void {
    invalidateCache()
    if (recurrenceId) {
      events.value = events.value.filter(
        (e) => !(e.uid === uid && e.recurrenceId === recurrenceId)
      )
    } else {
      events.value = events.value.filter((e) => e.uid !== uid)
    }
  }

  function findEventByUid(uid: string): CalendarEvent | undefined {
    return events.value.find((e) => e.uid === uid)
  }

  const visibleEventsComputed = computed(() => events.value)

  return {
    events: computed(() => events.value),
    loading: readonly(loading),
    error: readonly(error),
    currentRange: readonly(currentRange),
    visibleEvents: visibleEventsComputed,
    allCategories,
    fetchEvents,
    refreshEvents,
    invalidateCache,
    getVisibleEvents,
    addEvent,
    updateEventInCache,
    removeEvent,
    findEventByUid
  }
}
