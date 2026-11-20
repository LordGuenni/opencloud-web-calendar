import ICAL from 'ical.js'
import { authenticatedFetch } from './auth'
import { CalDAVError, AuthenticationError, NotFoundError, ConflictError } from './errors'
import { buildJournalQuery } from './xml-builder'
import { parseEvents } from './xml-parser'
import { generateUID } from './ics-utils'
import type { CalendarJournal, JournalFormData, JournalStatus } from '../types/calendar'

export function parseJournalICS(
  icsData: string,
  href: string,
  etag: string
): CalendarJournal | null {
  try {
    const jcalData = ICAL.parse(icsData)
    const comp = new ICAL.Component(jcalData)
    const vjournal = comp.getFirstSubcomponent('vjournal')
    if (!vjournal) return null

    const calendarHref = href.substring(0, href.lastIndexOf('/') + 1)
    const uid = String(vjournal.getFirstPropertyValue('uid') || '')
    if (!uid) return null

    const summary = String(vjournal.getFirstPropertyValue('summary') || '')
    const descVal = vjournal.getFirstPropertyValue('description')
    const description = typeof descVal === 'string' && descVal ? descVal : undefined

    const dtstartProp = vjournal.getFirstPropertyValue('dtstart') as ICAL.Time | null
    const dtstart = dtstartProp ? dtstartProp.toJSDate() : undefined

    const lastModProp = vjournal.getFirstPropertyValue('last-modified') as ICAL.Time | null
    const lastModified = lastModProp ? lastModProp.toJSDate() : undefined

    const rawStatus = vjournal.getFirstPropertyValue('status')
    const statusStr = typeof rawStatus === 'string' ? rawStatus.toUpperCase() : undefined
    const status: JournalStatus | undefined =
      statusStr === 'DRAFT' || statusStr === 'FINAL' || statusStr === 'CANCELLED'
        ? statusStr
        : undefined

    const catProps = vjournal.getAllProperties('categories')
    const catSet = new Set<string>()
    for (const prop of catProps) {
      for (const v of prop.getValues()) {
        if (typeof v === 'string') {
          for (const part of v.split(',')) {
            const trimmed = part.trim()
            if (trimmed) catSet.add(trimmed)
          }
        }
      }
    }

    return {
      uid,
      calendarHref,
      href,
      etag,
      summary,
      description,
      dtstart,
      lastModified,
      status,
      categories: catSet.size > 0 ? Array.from(catSet) : undefined,
      icsData
    }
  } catch (e) {
    console.error('Failed to parse VJOURNAL ICS:', e)
    return null
  }
}

export function generateJournalICS(formData: JournalFormData, existingIcs?: string): string {
  const uid = formData.uid || generateUID()
  let comp: ICAL.Component
  let vjournal: ICAL.Component

  if (existingIcs) {
    try {
      comp = new ICAL.Component(ICAL.parse(existingIcs))
      const found = comp.getFirstSubcomponent('vjournal')
      if (found) {
        vjournal = found
      } else {
        vjournal = new ICAL.Component('vjournal')
        vjournal.addPropertyWithValue('uid', uid)
        comp.addSubcomponent(vjournal)
      }
    } catch {
      comp = new ICAL.Component('vcalendar')
      comp.addPropertyWithValue('version', '2.0')
      comp.addPropertyWithValue('prodid', '-//OpenCloud//Calendar//EN')
      vjournal = new ICAL.Component('vjournal')
      vjournal.addPropertyWithValue('uid', uid)
      comp.addSubcomponent(vjournal)
    }
  } else {
    comp = new ICAL.Component('vcalendar')
    comp.addPropertyWithValue('version', '2.0')
    comp.addPropertyWithValue('prodid', '-//OpenCloud//Calendar//EN')
    vjournal = new ICAL.Component('vjournal')
    vjournal.addPropertyWithValue('uid', uid)
    comp.addSubcomponent(vjournal)
  }

  const now = ICAL.Time.fromJSDate(new Date(), true)
  vjournal.updatePropertyWithValue('dtstamp', now)
  vjournal.updatePropertyWithValue('last-modified', now)
  vjournal.updatePropertyWithValue('summary', formData.summary)

  if (formData.description) {
    vjournal.updatePropertyWithValue('description', formData.description)
  } else {
    vjournal.removeAllProperties('description')
  }

  vjournal.removeAllProperties('dtstart')
  if (formData.dtstart) {
    vjournal.addPropertyWithValue('dtstart', ICAL.Time.fromJSDate(formData.dtstart, true))
  }

  if (formData.status) {
    vjournal.updatePropertyWithValue('status', formData.status)
  } else {
    vjournal.removeAllProperties('status')
  }

  vjournal.removeAllProperties('categories')
  const cats = (formData.categories || []).map((c) => c.trim()).filter(Boolean)
  if (cats.length > 0) {
    const catProp = new ICAL.Property('categories')
    catProp.setValues(cats)
    vjournal.addProperty(catProp)
  }

  return comp.toString()
}

export async function fetchJournals(calendarHref: string): Promise<CalendarJournal[]> {
  const response = await authenticatedFetch(calendarHref, {
    method: 'REPORT',
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      Depth: '1'
    },
    body: buildJournalQuery()
  })

  if (response.status === 401) throw new AuthenticationError()
  if (response.status === 404) return []
  if (!response.ok && response.status !== 207) {
    throw new CalDAVError(`Failed to fetch notes: ${response.statusText}`, response.status)
  }

  const xml = await response.text()
  const rawItems = parseEvents(xml)
  const journals: CalendarJournal[] = []

  for (const item of rawItems) {
    const filename = item.href.substring(item.href.lastIndexOf('/') + 1)
    const fixedHref = calendarHref.endsWith('/')
      ? `${calendarHref}${filename}`
      : `${calendarHref}/${filename}`
    const parsed = parseJournalICS(item.calendarData, fixedHref, item.etag)
    if (parsed) journals.push(parsed)
  }

  return journals
}

export async function createJournal(formData: JournalFormData): Promise<CalendarJournal> {
  const uid = formData.uid || generateUID()
  const icsData = generateJournalICS({ ...formData, uid })
  const baseHref = formData.calendarHref.endsWith('/')
    ? formData.calendarHref
    : `${formData.calendarHref}/`
  const href = `${baseHref}${uid}.ics`

  const response = await authenticatedFetch(href, {
    method: 'PUT',
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'If-None-Match': '*'
    },
    body: icsData
  })

  if (response.status === 401) throw new AuthenticationError()
  if (response.status === 412) throw new ConflictError('Note already exists')
  if (!response.ok && response.status !== 201) {
    throw new CalDAVError(`Failed to create note: ${response.statusText}`, response.status)
  }

  const etag = response.headers.get('ETag')?.replace(/"/g, '') || ''
  return (
    parseJournalICS(icsData, href, etag) || {
      uid,
      calendarHref: baseHref,
      href,
      etag,
      summary: formData.summary,
      description: formData.description || undefined,
      dtstart: formData.dtstart || undefined,
      status: formData.status,
      categories: formData.categories,
      icsData
    }
  )
}

export async function updateJournal(
  journal: CalendarJournal,
  formData: JournalFormData
): Promise<CalendarJournal> {
  const icsData = generateJournalICS({ ...formData, uid: journal.uid }, journal.icsData)

  const headers: Record<string, string> = {
    'Content-Type': 'text/calendar; charset=utf-8'
  }
  if (journal.etag) {
    headers['If-Match'] = `"${journal.etag}"`
  }

  const response = await authenticatedFetch(journal.href, {
    method: 'PUT',
    headers,
    body: icsData
  })

  if (response.status === 401) throw new AuthenticationError()
  if (response.status === 404) throw new NotFoundError('Note not found')
  if (response.status === 412) throw new ConflictError('Note was modified by another client')
  if (!response.ok && response.status !== 204) {
    throw new CalDAVError(`Failed to update note: ${response.statusText}`, response.status)
  }

  const etag = response.headers.get('ETag')?.replace(/"/g, '') || journal.etag
  return (
    parseJournalICS(icsData, journal.href, etag) || {
      ...journal,
      summary: formData.summary,
      description: formData.description || undefined,
      dtstart: formData.dtstart || undefined,
      status: formData.status,
      categories: formData.categories,
      etag,
      icsData
    }
  )
}

export async function deleteJournal(journal: CalendarJournal): Promise<void> {
  const headers: Record<string, string> = {}
  if (journal.etag) {
    headers['If-Match'] = `"${journal.etag}"`
  }

  const response = await authenticatedFetch(journal.href, {
    method: 'DELETE',
    headers
  })

  if (response.status === 401) throw new AuthenticationError()
  if (response.status === 404) return
  if (!response.ok && response.status !== 204) {
    throw new CalDAVError(`Failed to delete note: ${response.statusText}`, response.status)
  }
}
