import { describe, it, expect } from 'vitest'
import {
  generateICS,
  parseICS,
  updateEventICS,
  buildRRuleString,
  parseRRuleToFormData,
  formatMinutesToTrigger
} from '../../src/caldav/ics-utils'
import type { EventFormData } from '../../src/types/calendar'

describe('ics-utils: rich VEVENT fields & lossless editing', () => {
  it('generates and parses alarms, url, categories, status, transp, class, and timezone', () => {
    const start = new Date('2026-06-15T10:00:00Z')
    const end = new Date('2026-06-15T11:30:00Z')

    const formData: EventFormData = {
      uid: 'rich-event-1@opencloud',
      calendarHref: '/caldav/user/cal/',
      summary: 'Architecture Review',
      start,
      end,
      allDay: false,
      description: 'Discuss Radicale features',
      location: 'Room 42',
      url: 'https://meet.example.org/arch-review',
      categories: ['Work', 'Engineering'],
      status: 'TENTATIVE',
      transp: 'TRANSPARENT',
      classification: 'PRIVATE',
      timezone: 'Europe/Berlin',
      alarms: [{ triggerMinutes: 15 }, { triggerMinutes: 1440 }]
    }

    const ics = generateICS(formData)
    expect(ics).toContain('URL:https://meet.example.org/arch-review')
    expect(ics).toContain('STATUS:TENTATIVE')
    expect(ics).toContain('TRANSP:TRANSPARENT')
    expect(ics).toContain('CLASS:PRIVATE')
    expect(ics).toContain('TZID=Europe/Berlin')
    expect(ics).toContain('BEGIN:VALARM')
    expect(ics).toContain('TRIGGER:-PT15M')
    expect(ics).toContain('TRIGGER:-P1D')

    const parsed = parseICS(ics, '/caldav/user/cal/rich-event-1.ics', 'etag-1')
    expect(parsed).toHaveLength(1)
    const ev = parsed[0]
    expect(ev.summary).toBe('Architecture Review')
    expect(ev.url).toBe('https://meet.example.org/arch-review')
    expect(ev.categories).toEqual(['Work', 'Engineering'])
    expect(ev.status).toBe('TENTATIVE')
    expect(ev.transp).toBe('TRANSPARENT')
    expect(ev.classification).toBe('PRIVATE')
    expect(ev.timezone).toBe('Europe/Berlin')
    expect(ev.alarms?.map((a) => a.triggerMinutes)).toEqual([15, 1440])
  })

  it('preserves unknown external client properties when updating an event losslessly', () => {
    const externalICS = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Mozilla.org/NONSGML Mozilla Calendar V1.1//EN',
      'BEGIN:VEVENT',
      'UID:ext-123@thunderbird',
      'DTSTAMP:20260601T080000Z',
      'DTSTART:20260620T090000Z',
      'DTEND:20260620T100000Z',
      'SUMMARY:External Event',
      'ORGANIZER;CN=Alice:mailto:alice@example.org',
      'ATTENDEE;PARTSTAT=ACCEPTED:mailto:bob@example.org',
      'X-MOZ-GENERATION:3',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n')

    const updated = updateEventICS(externalICS, {
      uid: 'ext-123@thunderbird',
      calendarHref: '/caldav/user/cal/',
      summary: 'Renamed External Event',
      start: new Date('2026-06-20T09:00:00Z'),
      end: new Date('2026-06-20T10:30:00Z'),
      allDay: false,
      description: 'Updated description',
      location: '',
      status: 'CONFIRMED',
      alarms: [{ triggerMinutes: 30 }]
    })

    expect(updated).toContain('SUMMARY:Renamed External Event')
    expect(updated).toContain('ORGANIZER')
    expect(updated).toContain('alice@example.org')
    expect(updated).toContain('ATTENDEE')
    expect(updated).toContain('bob@example.org')
    expect(updated).toContain('X-MOZ-GENERATION:3')
    expect(updated).toContain('TRIGGER:-PT30M')
  })

  it('supports monthly weekday-position recurrence rules (e.g. 2nd Tuesday & Last Friday)', () => {
    const rrule = buildRRuleString(
      {
        frequency: 'MONTHLY',
        interval: 1,
        endType: 'count',
        count: 6,
        monthlyMode: 'dayOfWeek',
        monthlyPosition: 2,
        monthlyWeekday: 'TU'
      },
      false
    )
    expect(rrule).toBe('FREQ=MONTHLY;BYDAY=2TU;COUNT=6')

    const parsed = parseRRuleToFormData(rrule)
    expect(parsed.frequency).toBe('MONTHLY')
    expect(parsed.monthlyMode).toBe('dayOfWeek')
    expect(parsed.monthlyPosition).toBe(2)
    expect(parsed.monthlyWeekday).toBe('TU')
    expect(parsed.count).toBe(6)

    const lastFri = parseRRuleToFormData('FREQ=MONTHLY;BYDAY=-1FR')
    expect(lastFri.monthlyMode).toBe('dayOfWeek')
    expect(lastFri.monthlyPosition).toBe(-1)
    expect(lastFri.monthlyWeekday).toBe('FR')
  })

  it('formats alarm trigger durations cleanly', () => {
    expect(formatMinutesToTrigger(0)).toBe('PT0S')
    expect(formatMinutesToTrigger(15)).toBe('-PT15M')
    expect(formatMinutesToTrigger(60)).toBe('-PT1H')
    expect(formatMinutesToTrigger(1440)).toBe('-P1D')
    expect(formatMinutesToTrigger(10080)).toBe('-P1W')
  })
})
