import { XMLParser } from 'fast-xml-parser'
import type { CalendarData, EventData } from '../types/caldav'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  isArray: (name) => name === 'response'
})

interface ParsedMultistatus {
  multistatus?: {
    response?: ParsedResponse | ParsedResponse[]
  }
}

interface ParsedResponse {
  href?: string
  propstat?:
    | {
        prop?: Record<string, unknown>
        status?: string
      }
    | Array<{
        prop?: Record<string, unknown>
        status?: string
      }>
}

export function parseMultistatus(xml: string): ParsedResponse[] {
  const parsed = parser.parse(xml) as ParsedMultistatus
  const responses = parsed.multistatus?.response
  if (!responses) return []
  return Array.isArray(responses) ? responses : [responses]
}

export function parseCurrentUserPrincipal(xml: string): string | null {
  const responses = parseMultistatus(xml)
  for (const response of responses) {
    const propstat = Array.isArray(response.propstat) ? response.propstat[0] : response.propstat
    const principal = propstat?.prop?.['current-user-principal'] as { href?: string } | undefined
    if (principal?.href) {
      return principal.href
    }
  }
  return null
}

export function parseCalendarHomeSet(xml: string): string | null {
  const responses = parseMultistatus(xml)
  for (const response of responses) {
    const propstat = Array.isArray(response.propstat) ? response.propstat[0] : response.propstat
    const homeSet = propstat?.prop?.['calendar-home-set'] as { href?: string } | undefined
    if (homeSet?.href) {
      return homeSet.href
    }
  }
  return null
}

export function parseCalendars(xml: string): CalendarData[] {
  const responses = parseMultistatus(xml)
  const calendars: CalendarData[] = []

  for (const response of responses) {
    const href = response.href
    if (!href) continue

    const propstats = Array.isArray(response.propstat) ? response.propstat : [response.propstat]
    
    let resourceType: Record<string, unknown> | undefined
    let displayname: unknown
    let color: unknown
    let ctag: unknown
    let description: unknown
    let privileges: any
    let foundCalendar = false

    for (const propstat of propstats) {
      if (!propstat?.prop) continue
      
      // We only care about properties that were successfully retrieved (HTTP 200)
      if (propstat.status && !propstat.status.includes('200')) {
        continue
      }

      const prop = propstat.prop
      
      if (prop['resourcetype']) {
        resourceType = prop['resourcetype'] as Record<string, unknown>
        if (resourceType && 'calendar' in resourceType) {
          foundCalendar = true
        }
      }
      
      if (prop['displayname'] !== undefined) displayname = prop['displayname']
      if (prop['calendar-color'] !== undefined) color = prop['calendar-color']
      if (prop['getctag'] !== undefined) ctag = prop['getctag']
      if (prop['calendar-description'] !== undefined) description = prop['calendar-description']
      if (prop['current-user-privilege-set'] !== undefined) privileges = prop['current-user-privilege-set']
    }

    if (!foundCalendar) continue

    let readOnly = false
    if (privileges && typeof privileges === 'object' && privileges.privilege) {
      // If we explicitly received a privilege object with actual privileges
      const privString = JSON.stringify(privileges.privilege).toLowerCase()
      const hasWrite = privString.includes('write') || privString.includes('all')
      readOnly = !hasWrite
    } else {
      // If no explicit privilege data is found, or it's empty, default to owner (writable)
      readOnly = false
    }

    calendars.push({
      href,
      displayName: extractString(displayname),
      color: extractString(color),
      ctag: extractString(ctag),
      description: extractString(description),
      readOnly
    })
  }

  return calendars
}

export function parseEvents(xml: string): EventData[] {
  const responses = parseMultistatus(xml)
  const events: EventData[] = []

  for (const response of responses) {
    const href = response.href
    if (!href) continue

    const propstat = Array.isArray(response.propstat) ? response.propstat[0] : response.propstat
    const prop = propstat?.prop
    if (!prop) continue

    const etag = extractString(prop['getetag'])
    const calendarData = extractString(prop['calendar-data'])

    if (etag && calendarData) {
      events.push({
        href,
        etag: etag.replace(/"/g, ''),
        calendarData
      })
    }
  }

  return events
}

function extractString(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value !== null && '#text' in value) {
    return String((value as { '#text': unknown })['#text'])
  }
  return undefined
}
