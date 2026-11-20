import ICAL from 'ical.js'
import type {
  CalendarEvent,
  EventAlarm,
  EventClassification,
  EventFormData,
  EventStatus,
  EventTransp,
  DateRange,
  RecurrenceFormData
} from '../types/calendar'

/**
 * Parse an ICS string and return one or more CalendarEvent objects.
 * For recurring events, occurrences within the given range are expanded.
 * For non-recurring events, a single-element array is returned.
 */
export function parseICS(
  icsData: string,
  href: string,
  etag: string,
  range?: DateRange
): CalendarEvent[] {
  try {
    const jcalData = ICAL.parse(icsData)
    const comp = new ICAL.Component(jcalData)
    const vevents = comp.getAllSubcomponents('vevent')

    if (vevents.length === 0) return []

    // Extract calendar href from event href
    const calendarHref = href.substring(0, href.lastIndexOf('/') + 1)

    // Separate master event from exception overrides
    let masterVevent: ICAL.Component | null = null
    const exceptions: ICAL.Component[] = []

    for (const vevent of vevents) {
      if (vevent.getFirstPropertyValue('recurrence-id')) {
        exceptions.push(vevent)
      } else {
        masterVevent = vevent
      }
    }

    // If no master found, just use the first vevent
    if (!masterVevent) {
      masterVevent = vevents[0]
    }

    const masterEvent = new ICAL.Event(masterVevent)
    const rruleProp = masterVevent.getFirstPropertyValue('rrule')
    const isRecurring = masterEvent.isRecurring()

    if (!isRecurring) {
      const parsed = parseVevent(masterVevent, href, etag, calendarHref, icsData)
      return parsed ? [parsed] : []
    }

    // Build a map of exception overrides keyed by RECURRENCE-ID
    const exceptionMap = new Map<string, ICAL.Component>()
    for (const exc of exceptions) {
      const recId = exc.getFirstPropertyValue('recurrence-id') as ICAL.Time
      if (recId) {
        exceptionMap.set(recId.toString(), exc)
      }
    }

    // Also collect EXDATE values to skip
    const exdates = new Set<string>()
    const exdateProps = masterVevent.getAllProperties('exdate')
    for (const prop of exdateProps) {
      const values = prop.getValues() as ICAL.Time[]
      for (const val of values) {
        exdates.add(val.toString())
      }
    }

    const rruleStr = rruleProp ? rruleProp.toString() : undefined
    const results: CalendarEvent[] = []
    const dtstart = masterVevent.getFirstPropertyValue('dtstart') as ICAL.Time
    if (!dtstart) return []

    const masterMeta = extractEventMetadata(masterVevent)
    const duration = masterEvent.duration

    // Set expansion bounds
    const rangeStart = range
      ? ICAL.Time.fromJSDate(range.start, false)
      : ICAL.Time.fromJSDate(new Date(Date.now() - 365 * 86400000), false)
    const rangeEnd = range
      ? ICAL.Time.fromJSDate(range.end, false)
      : ICAL.Time.fromJSDate(new Date(Date.now() + 365 * 86400000), false)

    // Use ical.js expansion
    const iter = masterEvent.iterator(dtstart)
    let next: ICAL.Time | null
    const MAX_OCCURRENCES = 500 // safety limit

    for (let i = 0; i < MAX_OCCURRENCES; i++) {
      next = iter.next()
      if (!next) break

      // Past the range end, stop
      if (next.compare(rangeEnd) > 0) break

      // Calculate occurrence end
      const occEnd = next.clone()
      occEnd.addDuration(duration)

      // Before range start, skip
      if (occEnd.compare(rangeStart) < 0) continue

      // Check if this occurrence is excluded
      const nextStr = next.toString()
      if (exdates.has(nextStr)) continue

      // Check if there's an exception override
      const exceptionVevent = exceptionMap.get(nextStr)
      if (exceptionVevent) {
        const excEvent = parseVevent(exceptionVevent, href, etag, calendarHref, icsData)
        if (excEvent) {
          const recId = exceptionVevent.getFirstPropertyValue('recurrence-id') as ICAL.Time
          results.push({
            ...excEvent,
            isRecurring: true,
            rrule: rruleStr,
            recurrenceId: recId.toString()
          })
        }
        continue
      }

      // Regular occurrence
      const allDay = next.isDate
      const start = next.toJSDate()
      const end = occEnd.toJSDate()

      results.push({
        uid: masterEvent.uid,
        calendarHref,
        href,
        etag,
        summary: masterEvent.summary || '',
        start,
        end,
        allDay,
        description: masterEvent.description || undefined,
        location: masterEvent.location || undefined,
        ...masterMeta,
        icsData,
        isRecurring: true,
        rrule: rruleStr,
        recurrenceId: nextStr
      })
    }

    return results
  } catch (e) {
    console.error('Failed to parse ICS:', e)
    return []
  }
}

function extractEventMetadata(vevent: ICAL.Component): {
  url?: string
  categories?: string[]
  status?: EventStatus
  transp?: EventTransp
  classification?: EventClassification
  timezone?: string
  alarms?: EventAlarm[]
} {
  const urlVal = vevent.getFirstPropertyValue('url')
  const url = typeof urlVal === 'string' && urlVal.trim() ? urlVal.trim() : undefined

  const catProps = vevent.getAllProperties('categories')
  const categorySet = new Set<string>()
  for (const prop of catProps) {
    const values = prop.getValues()
    for (const v of values) {
      if (typeof v === 'string') {
        for (const part of v.split(',')) {
          const trimmed = part.trim()
          if (trimmed) categorySet.add(trimmed)
        }
      }
    }
  }
  const categories = categorySet.size > 0 ? Array.from(categorySet) : undefined

  const rawStatus = vevent.getFirstPropertyValue('status')
  const statusStr = typeof rawStatus === 'string' ? rawStatus.toUpperCase() : undefined
  const status: EventStatus | undefined =
    statusStr === 'CONFIRMED' || statusStr === 'TENTATIVE' || statusStr === 'CANCELLED'
      ? statusStr
      : undefined

  const rawTransp = vevent.getFirstPropertyValue('transp')
  const transpStr = typeof rawTransp === 'string' ? rawTransp.toUpperCase() : undefined
  const transp: EventTransp | undefined =
    transpStr === 'OPAQUE' || transpStr === 'TRANSPARENT' ? transpStr : undefined

  const rawClass = vevent.getFirstPropertyValue('class')
  const classStr = typeof rawClass === 'string' ? rawClass.toUpperCase() : undefined
  const classification: EventClassification | undefined =
    classStr === 'PUBLIC' || classStr === 'PRIVATE' || classStr === 'CONFIDENTIAL'
      ? classStr
      : undefined

  const dtstartProp = vevent.getFirstProperty('dtstart')
  const tzidParam = dtstartProp?.getParameter('tzid')
  const timezone = typeof tzidParam === 'string' && tzidParam.trim() ? tzidParam.trim() : undefined

  const alarms = parseAlarms(vevent)

  return {
    url,
    categories,
    status,
    transp,
    classification,
    timezone,
    alarms: alarms.length > 0 ? alarms : undefined
  }
}

export function parseAlarms(vevent: ICAL.Component): EventAlarm[] {
  const alarms: EventAlarm[] = []
  const valarms = vevent.getAllSubcomponents('valarm')

  for (const valarm of valarms) {
    const triggerProp = valarm.getFirstProperty('trigger')
    if (!triggerProp) continue

    const triggerVal = triggerProp.getFirstValue()
    let minutes: number | null = null

    if (triggerVal && typeof (triggerVal as ICAL.Duration).toSeconds === 'function') {
      const secs = (triggerVal as ICAL.Duration).toSeconds()
      // Negative duration means before start -> store as positive minutes before
      minutes = Math.max(0, Math.round(-secs / 60))
    } else if (typeof triggerVal === 'string') {
      minutes = parseTriggerStringToMinutes(triggerVal)
    }

    if (minutes !== null) {
      const descVal = valarm.getFirstPropertyValue('description')
      alarms.push({
        triggerMinutes: minutes,
        description: typeof descVal === 'string' && descVal.trim() ? descVal.trim() : undefined
      })
    }
  }

  return alarms
}

function parseTriggerStringToMinutes(trigger: string): number | null {
  const match = trigger.trim().match(/^(-?)P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i)
  if (!match) return null
  const [, sign, weeks, days, hours, mins, secs] = match
  const totalMinutes =
    (Number(weeks || 0) * 7 * 24 * 60) +
    (Number(days || 0) * 24 * 60) +
    (Number(hours || 0) * 60) +
    Number(mins || 0) +
    Math.round(Number(secs || 0) / 60)

  // Only treat negative or zero triggers as "before start"
  return sign === '-' || totalMinutes === 0 ? totalMinutes : 0
}

export function formatMinutesToTrigger(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes))
  if (safe === 0) return 'PT0S'
  if (safe % (7 * 24 * 60) === 0) return `-P${safe / (7 * 24 * 60)}W`
  if (safe % (24 * 60) === 0) return `-P${safe / (24 * 60)}D`
  if (safe % 60 === 0) return `-PT${safe / 60}H`
  return `-PT${safe}M`
}

function parseVevent(
  vevent: ICAL.Component,
  href: string,
  etag: string,
  calendarHref: string,
  icsData: string
): CalendarEvent | null {
  const event = new ICAL.Event(vevent)
  const dtstart = vevent.getFirstPropertyValue('dtstart') as ICAL.Time | null
  const dtend = vevent.getFirstPropertyValue('dtend') as ICAL.Time | null

  if (!dtstart) return null

  const allDay = dtstart.isDate
  const start = dtstart.toJSDate()
  let end: Date

  if (dtend) {
    end = dtend.toJSDate()
  } else {
    end = new Date(start)
    if (allDay) {
      end.setDate(end.getDate() + 1)
    }
  }

  const rruleProp = vevent.getFirstPropertyValue('rrule')
  const recIdProp = vevent.getFirstPropertyValue('recurrence-id') as ICAL.Time | null
  const meta = extractEventMetadata(vevent)

  return {
    uid: event.uid,
    calendarHref,
    href,
    etag,
    summary: event.summary || '',
    start,
    end,
    allDay,
    description: event.description || undefined,
    location: event.location || undefined,
    ...meta,
    icsData,
    isRecurring: !!rruleProp || !!recIdProp,
    rrule: rruleProp ? rruleProp.toString() : undefined,
    recurrenceId: recIdProp ? recIdProp.toString() : undefined
  }
}

export function generateICS(formData: EventFormData): string {
  const uid = formData.uid || generateUID()
  const comp = new ICAL.Component('vcalendar')
  comp.addPropertyWithValue('version', '2.0')
  comp.addPropertyWithValue('prodid', '-//OpenCloud//Calendar//EN')

  const vevent = new ICAL.Component('vevent')
  vevent.addPropertyWithValue('uid', uid)
  applyFormDataToVevent(vevent, formData, true)

  comp.addSubcomponent(vevent)
  return comp.toString()
}

/**
 * Losslessly patch an existing VEVENT inside an ICS document so that
 * unknown properties (e.g. ATTENDEE, ORGANIZER, X-*, ATTACH) created by
 * external CalDAV clients are preserved on edit.
 */
export function updateEventICS(icsData: string, formData: EventFormData): string {
  try {
    const jcalData = ICAL.parse(icsData)
    const comp = new ICAL.Component(jcalData)
    const vevents = comp.getAllSubcomponents('vevent')

    let masterVevent: ICAL.Component | null = null
    for (const vevent of vevents) {
      if (!vevent.getFirstPropertyValue('recurrence-id')) {
        masterVevent = vevent
        break
      }
    }

    if (!masterVevent) {
      return generateICS(formData)
    }

    applyFormDataToVevent(masterVevent, formData, true)
    return comp.toString()
  } catch {
    return generateICS(formData)
  }
}

function applyFormDataToVevent(
  vevent: ICAL.Component,
  formData: EventFormData,
  includeRRule: boolean
): void {
  vevent.updatePropertyWithValue('dtstamp', ICAL.Time.fromJSDate(new Date(), true))
  vevent.updatePropertyWithValue('last-modified', ICAL.Time.fromJSDate(new Date(), true))
  vevent.updatePropertyWithValue('summary', formData.summary)

  // Start & End
  vevent.removeAllProperties('dtstart')
  vevent.removeAllProperties('dtend')
  vevent.removeAllProperties('duration')

  if (formData.allDay) {
    const startTime = createICALDate(formData.start)
    const endDate = new Date(formData.end)
    // RFC 5545 all-day DTEND is exclusive; ensure at least +1 day after start
    if (
      endDate.getFullYear() === formData.start.getFullYear() &&
      endDate.getMonth() === formData.start.getMonth() &&
      endDate.getDate() === formData.start.getDate()
    ) {
      endDate.setDate(endDate.getDate() + 1)
    }
    const endTime = createICALDate(endDate)
    const startProp = vevent.addPropertyWithValue('dtstart', startTime)
    startProp.setParameter('value', 'DATE')
    const endProp = vevent.addPropertyWithValue('dtend', endTime)
    endProp.setParameter('value', 'DATE')
  } else if (formData.timezone && formData.timezone !== 'UTC') {
    const startTime = createICALDateTimeInTimeZone(formData.start, formData.timezone)
    const endTime = createICALDateTimeInTimeZone(formData.end, formData.timezone)
    const startProp = vevent.addPropertyWithValue('dtstart', startTime)
    startProp.setParameter('tzid', formData.timezone)
    const endProp = vevent.addPropertyWithValue('dtend', endTime)
    endProp.setParameter('tzid', formData.timezone)
  } else {
    vevent.addPropertyWithValue('dtstart', ICAL.Time.fromJSDate(formData.start, true))
    vevent.addPropertyWithValue('dtend', ICAL.Time.fromJSDate(formData.end, true))
  }

  // Description
  if (formData.description) {
    vevent.updatePropertyWithValue('description', formData.description)
  } else {
    vevent.removeAllProperties('description')
  }

  // Location
  if (formData.location) {
    vevent.updatePropertyWithValue('location', formData.location)
  } else {
    vevent.removeAllProperties('location')
  }

  // URL
  if (formData.url && formData.url.trim()) {
    vevent.updatePropertyWithValue('url', formData.url.trim())
  } else {
    vevent.removeAllProperties('url')
  }

  // Categories
  vevent.removeAllProperties('categories')
  const cleanedCategories = (formData.categories || []).map((c) => c.trim()).filter(Boolean)
  if (cleanedCategories.length > 0) {
    const catProp = new ICAL.Property('categories')
    catProp.setValues(cleanedCategories)
    vevent.addProperty(catProp)
  }

  // Status
  if (formData.status) {
    vevent.updatePropertyWithValue('status', formData.status)
  } else {
    vevent.removeAllProperties('status')
  }

  // Transparency (Busy/Free)
  if (formData.transp) {
    vevent.updatePropertyWithValue('transp', formData.transp)
  } else {
    vevent.removeAllProperties('transp')
  }

  // Classification (Public/Private/Confidential)
  if (formData.classification) {
    vevent.updatePropertyWithValue('class', formData.classification)
  } else {
    vevent.removeAllProperties('class')
  }

  // RRULE
  if (includeRRule) {
    vevent.removeAllProperties('rrule')
    if (formData.recurrence) {
      const rruleStr = buildRRuleString(formData.recurrence, formData.allDay)
      vevent.addPropertyWithValue('rrule', ICAL.Recur.fromString(rruleStr))
    }
  }

  // Alarms (VALARM)
  const existingAlarms = vevent.getAllSubcomponents('valarm')
  for (const existing of existingAlarms) {
    vevent.removeSubcomponent(existing)
  }
  if (formData.alarms && formData.alarms.length > 0) {
    for (const alarm of formData.alarms) {
      const valarm = new ICAL.Component('valarm')
      valarm.addPropertyWithValue('action', 'DISPLAY')
      valarm.addPropertyWithValue(
        'description',
        alarm.description || formData.summary || 'Reminder'
      )
      const triggerDuration = ICAL.Duration.fromString(formatMinutesToTrigger(alarm.triggerMinutes))
      valarm.addPropertyWithValue('trigger', triggerDuration)
      vevent.addSubcomponent(valarm)
    }
  }
}

function createICALDate(date: Date): ICAL.Time {
  return new ICAL.Time(
    {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      isDate: true
    },
    ICAL.Timezone.localTimezone
  )
}

function createICALDateTimeInTimeZone(date: Date, timeZone: string): ICAL.Time {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    })
    const parts = formatter.formatToParts(date)
    const map: Record<string, number> = {}
    for (const p of parts) {
      if (p.type !== 'literal') {
        map[p.type] = Number(p.value)
      }
    }
    return new ICAL.Time(
      {
        year: map.year,
        month: map.month,
        day: map.day,
        hour: map.hour === 24 ? 0 : map.hour,
        minute: map.minute,
        second: map.second,
        isDate: false
      },
      ICAL.Timezone.localTimezone
    )
  } catch {
    return ICAL.Time.fromJSDate(date, true)
  }
}

export function buildRRuleString(rec: RecurrenceFormData, allDay: boolean): string {
  const parts: string[] = [`FREQ=${rec.frequency}`]

  if (rec.interval > 1) {
    parts.push(`INTERVAL=${rec.interval}`)
  }

  if (rec.frequency === 'WEEKLY' && rec.byDay && rec.byDay.length > 0) {
    parts.push(`BYDAY=${rec.byDay.join(',')}`)
  }

  if (
    rec.frequency === 'MONTHLY' &&
    rec.monthlyMode === 'dayOfWeek' &&
    rec.monthlyWeekday &&
    rec.monthlyPosition
  ) {
    parts.push(`BYDAY=${rec.monthlyPosition}${rec.monthlyWeekday}`)
  }

  if (rec.endType === 'count' && rec.count) {
    parts.push(`COUNT=${rec.count}`)
  } else if (rec.endType === 'until' && rec.until) {
    if (allDay) {
      parts.push(`UNTIL=${formatICALDate(rec.until)}`)
    } else {
      parts.push(`UNTIL=${formatICALDateTime(rec.until)}`)
    }
  }

  return parts.join(';')
}

/**
 * Parse an RRULE string into RecurrenceFormData for the edit form.
 */
export function parseRRuleToFormData(rruleStr: string): RecurrenceFormData {
  const recur = ICAL.Recur.fromString(rruleStr)

  const frequency = recur.freq as RecurrenceFormData['frequency']
  const interval = recur.interval || 1

  let endType: RecurrenceFormData['endType'] = 'never'
  let count: number | undefined
  let until: Date | undefined

  if (recur.count) {
    endType = 'count'
    count = recur.count
  } else if (recur.until) {
    endType = 'until'
    until = recur.until.toJSDate()
  }

  let byDay: string[] | undefined
  let monthlyMode: 'dayOfMonth' | 'dayOfWeek' | undefined
  let monthlyWeekday: string | undefined
  let monthlyPosition: number | undefined

  if (recur.parts && recur.parts.BYDAY) {
    const rawByDay = recur.parts.BYDAY as string[]
    if (frequency === 'MONTHLY' && rawByDay.length > 0) {
      const m = String(rawByDay[0]).match(/^(-?\d+)?(MO|TU|WE|TH|FR|SA|SU)$/)
      if (m) {
        monthlyMode = 'dayOfWeek'
        monthlyPosition = m[1] ? Number(m[1]) : (recur.parts.BYSETPOS?.[0] as number) || 1
        monthlyWeekday = m[2]
      }
    } else {
      byDay = rawByDay
    }
  }

  return {
    frequency,
    interval,
    endType,
    count,
    until,
    byDay,
    monthlyMode,
    monthlyWeekday,
    monthlyPosition
  }
}

/**
 * Update an existing ICS resource to add an EXDATE (exclude one occurrence)
 * and optionally add an exception VEVENT with RECURRENCE-ID.
 */
export function addExceptionToICS(
  icsData: string,
  recurrenceId: string,
  exceptionFormData?: EventFormData
): string {
  const jcalData = ICAL.parse(icsData)
  const comp = new ICAL.Component(jcalData)
  const vevents = comp.getAllSubcomponents('vevent')

  let masterVevent: ICAL.Component | null = null
  for (const vevent of vevents) {
    if (!vevent.getFirstPropertyValue('recurrence-id')) {
      masterVevent = vevent
      break
    }
  }

  if (!masterVevent) return icsData

  const masterDtstart = masterVevent.getFirstPropertyValue('dtstart') as ICAL.Time
  const isDate = masterDtstart?.isDate || false
  const recIdTime = isDate
    ? ICAL.Time.fromDateString(recurrenceId)
    : ICAL.Time.fromDateTimeString(recurrenceId)

  if (exceptionFormData) {
    const existingExceptions = comp.getAllSubcomponents('vevent')
    for (const exc of existingExceptions) {
      const excRecId = exc.getFirstPropertyValue('recurrence-id') as ICAL.Time | null
      if (excRecId && excRecId.toString() === recurrenceId) {
        comp.removeSubcomponent(exc)
      }
    }

    const excVevent = new ICAL.Component('vevent')
    const masterEvent = new ICAL.Event(masterVevent)

    excVevent.addPropertyWithValue('uid', masterEvent.uid)
    const recIdProp = excVevent.addPropertyWithValue('recurrence-id', recIdTime)
    if (isDate) {
      recIdProp.setParameter('value', 'DATE')
    }

    applyFormDataToVevent(excVevent, exceptionFormData, false)
    comp.addSubcomponent(excVevent)
  } else {
    const exdateProp = masterVevent.addPropertyWithValue('exdate', recIdTime)
    if (isDate) {
      exdateProp.setParameter('value', 'DATE')
    }
  }

  return comp.toString()
}

/**
 * Update an existing ICS resource to modify the master (series) event properties.
 */
export function updateSeriesICS(icsData: string, formData: EventFormData): string {
  return updateEventICS(icsData, formData)
}

export function generateUID(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 10)
  return `${timestamp}-${random}@opencloud`
}

function formatICALDateTime(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function formatICALDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}
