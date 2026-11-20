import ICAL from 'ical.js'
import { authenticatedFetch } from './auth'
import { CalDAVError, AuthenticationError } from './errors'
import { buildFreeBusyQuery } from './xml-builder'
import type { FreeBusyPeriod } from '../types/calendar'

export function parseFreeBusyICS(icsData: string): FreeBusyPeriod[] {
  const periods: FreeBusyPeriod[] = []
  try {
    const jcalData = ICAL.parse(icsData)
    const comp = new ICAL.Component(jcalData)
    const vfb = comp.getFirstSubcomponent('vfreebusy')
    if (!vfb) return []

    const fbProps = vfb.getAllProperties('freebusy')
    for (const prop of fbProps) {
      const fbTypeRaw = String(prop.getParameter('fbtype') || 'BUSY').toUpperCase()
      const type: FreeBusyPeriod['type'] =
        fbTypeRaw === 'BUSY-TENTATIVE' ||
        fbTypeRaw === 'BUSY-UNAVAILABLE' ||
        fbTypeRaw === 'FREE'
          ? fbTypeRaw
          : 'BUSY'

      const values = prop.getValues()
      for (const val of values) {
        if (val && typeof val === 'object' && 'start' in val) {
          const period = val as ICAL.Period
          const start = period.start?.toJSDate()
          const end = period.getEnd()?.toJSDate()
          if (start && end && end > start) {
            periods.push({ start, end, type })
          }
        } else if (typeof val === 'string') {
          const parsed = parsePeriodString(val, type)
          if (parsed) periods.push(parsed)
        }
      }
    }
  } catch (e) {
    console.error('Failed to parse VFREEBUSY:', e)
  }

  return periods.sort((a, b) => a.start.getTime() - b.start.getTime())
}

function parsePeriodString(raw: string, type: FreeBusyPeriod['type']): FreeBusyPeriod | null {
  const parts = raw.split('/')
  if (parts.length !== 2) return null
  try {
    const start = ICAL.Time.fromDateTimeString(parts[0]).toJSDate()
    let end: Date
    if (parts[1].startsWith('P') || parts[1].startsWith('+P')) {
      const dur = ICAL.Duration.fromString(parts[1])
      end = new Date(start.getTime() + dur.toSeconds() * 1000)
    } else {
      end = ICAL.Time.fromDateTimeString(parts[1]).toJSDate()
    }
    if (end > start) {
      return { start, end, type }
    }
  } catch {
    // ignore invalid period
  }
  return null
}

export async function fetchFreeBusy(
  calendarHref: string,
  start: Date,
  end: Date
): Promise<FreeBusyPeriod[]> {
  const response = await authenticatedFetch(calendarHref, {
    method: 'REPORT',
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      Depth: '1'
    },
    body: buildFreeBusyQuery(start, end)
  })

  if (response.status === 401) throw new AuthenticationError()
  if (!response.ok) {
    throw new CalDAVError(`Free/Busy query failed: ${response.statusText}`, response.status)
  }

  const text = await response.text()
  return parseFreeBusyICS(text)
}
