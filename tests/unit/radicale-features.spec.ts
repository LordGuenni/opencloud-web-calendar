import { describe, it, expect } from 'vitest'
import { generateTodoICS, parseTodoICS } from '../../src/caldav/todos'
import { generateJournalICS, parseJournalICS } from '../../src/caldav/journals'
import { parseFreeBusyICS } from '../../src/caldav/freebusy'
import { generateVCard, parseVCard } from '../../src/caldav/carddav'
import {
  buildPropPatchCalendar,
  buildTodoQuery,
  buildJournalQuery,
  buildFreeBusyQuery
} from '../../src/caldav/xml-builder'
import {
  parseAddressBooks,
  parseAddressData,
  parseCalendars,
  parseCalendarHomeSet,
  parseCurrentUserPrincipal,
  parseEvents
} from '../../src/caldav/xml-parser'

describe('Radicale VTODO support', () => {
  it('generates, parses, and losslessly updates VTODO items', () => {
    const ics = generateTodoICS({
      uid: 'todo-1@opencloud',
      calendarHref: '/caldav/user/cal/',
      summary: 'Buy milk',
      description: 'Organic oat milk',
      status: 'IN-PROCESS',
      priority: 1,
      percentComplete: 50,
      due: new Date('2026-07-01T18:00:00Z'),
      categories: ['Errands']
    })

    const parsed = parseTodoICS(ics, '/caldav/user/cal/todo-1.ics', 'etag-t1')
    expect(parsed).not.toBeNull()
    expect(parsed!.summary).toBe('Buy milk')
    expect(parsed!.status).toBe('IN-PROCESS')
    expect(parsed!.priority).toBe(1)
    expect(parsed!.percentComplete).toBe(50)
    expect(parsed!.categories).toEqual(['Errands'])
    expect(parsed!.due).toBeInstanceOf(Date)

    // Completing sets COMPLETED timestamp and 100%
    const completedIcs = generateTodoICS(
      {
        uid: 'todo-1@opencloud',
        calendarHref: '/caldav/user/cal/',
        summary: 'Buy milk',
        description: 'Organic oat milk',
        status: 'COMPLETED',
        priority: 1,
        percentComplete: 100,
        due: new Date('2026-07-01T18:00:00Z'),
        categories: ['Errands']
      },
      ics
    )
    expect(completedIcs).toContain('STATUS:COMPLETED')
    expect(completedIcs).toContain('COMPLETED:')
  })
})

describe('Radicale VJOURNAL support', () => {
  it('generates and parses VJOURNAL notes', () => {
    const ics = generateJournalICS({
      uid: 'note-1@opencloud',
      calendarHref: '/caldav/user/cal/',
      summary: 'Sprint Retrospective',
      description: 'What went well:\n- CalDAV integration',
      dtstart: new Date('2026-07-02T00:00:00Z'),
      status: 'DRAFT',
      categories: ['Team']
    })

    const parsed = parseJournalICS(ics, '/caldav/user/cal/note-1.ics', 'etag-n1')
    expect(parsed).not.toBeNull()
    expect(parsed!.summary).toBe('Sprint Retrospective')
    expect(parsed!.status).toBe('DRAFT')
    expect(parsed!.categories).toEqual(['Team'])
    expect(parsed!.description).toContain('CalDAV integration')
  })
})

describe('Radicale VFREEBUSY support', () => {
  it('parses VFREEBUSY periods with types', () => {
    const fbIcs = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VFREEBUSY',
      'DTSTART:20260710T000000Z',
      'DTEND:20260711T000000Z',
      'FREEBUSY;FBTYPE=BUSY:20260710T090000Z/20260710T103000Z',
      'FREEBUSY;FBTYPE=BUSY-TENTATIVE:20260710T140000Z/PT1H',
      'END:VFREEBUSY',
      'END:VCALENDAR'
    ].join('\r\n')

    const periods = parseFreeBusyICS(fbIcs)
    expect(periods).toHaveLength(2)
    expect(periods[0].type).toBe('BUSY')
    expect(periods[0].start.toISOString()).toBe('2026-07-10T09:00:00.000Z')
    expect(periods[0].end.toISOString()).toBe('2026-07-10T10:30:00.000Z')
    expect(periods[1].type).toBe('BUSY-TENTATIVE')
    expect(periods[1].end.toISOString()).toBe('2026-07-10T15:00:00.000Z')
  })
})

describe('Radicale CardDAV vCard support', () => {
  it('generates, parses, and preserves unknown vCard fields', () => {
    const original = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'UID:contact-1',
      'FN:Jane Doe',
      'N:Doe;Jane;;;',
      'EMAIL;TYPE=WORK:jane@example.org',
      'TEL;TYPE=CELL:+49 123 4567',
      'ORG:OpenCloud GmbH',
      'TITLE:Engineer',
      'BDAY:19920514',
      'X-CUSTOM-FIELD:keep-me',
      'END:VCARD'
    ].join('\r\n')

    const parsed = parseVCard(original, '/carddav/user/def-addressbook/contact-1.vcf', 'etag-c1')
    expect(parsed).not.toBeNull()
    expect(parsed!.fullName).toBe('Jane Doe')
    expect(parsed!.firstName).toBe('Jane')
    expect(parsed!.lastName).toBe('Doe')
    expect(parsed!.emails).toEqual(['jane@example.org'])
    expect(parsed!.phones).toEqual(['+49 123 4567'])
    expect(parsed!.organization).toBe('OpenCloud GmbH')
    expect(parsed!.birthday).toBe('1992-05-14')

    const updated = generateVCard(
      {
        uid: 'contact-1',
        addressBookHref: '/carddav/user/def-addressbook/',
        fullName: 'Jane Smith',
        firstName: 'Jane',
        lastName: 'Smith',
        emails: ['jane.smith@example.org'],
        phones: ['+49 123 4567'],
        organization: 'OpenCloud GmbH',
        title: 'Lead Engineer',
        birthday: '1992-05-14',
        notes: 'Met at conference'
      },
      original
    )

    expect(updated).toContain('FN:Jane Smith')
    expect(updated).toContain('X-CUSTOM-FIELD:keep-me')
    expect(updated).toContain('BDAY:1992-05-14')
  })
})

describe('CalDAV & CardDAV XML builders/parsers', () => {
  it('builds valid PROPPATCH, VTODO, VJOURNAL, and FREE-BUSY XML', () => {
    const patch = buildPropPatchCalendar('Work & Projects', 'Team schedule', '#22c55e')
    expect(patch).toContain('<d:displayname>Work &amp; Projects</d:displayname>')
    expect(patch).toContain('<ic:calendar-color>#22c55e</ic:calendar-color>')

    expect(buildTodoQuery()).toContain('name="VTODO"')
    expect(buildJournalQuery()).toContain('name="VJOURNAL"')
    expect(buildFreeBusyQuery(new Date('2026-07-01T00:00:00Z'), new Date('2026-07-02T00:00:00Z'))).toContain(
      'free-busy-query'
    )
  })

  it('parses CardDAV addressbooks and address-data responses', () => {
    const booksXml = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav" xmlns:cs="http://calendarserver.org/ns/">
  <d:response>
    <d:href>/carddav/user/def-addressbook/</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype><d:collection/><card:addressbook/></d:resourcetype>
        <d:displayname>Personal Address Book</d:displayname>
        <cs:getctag>ctag-1</cs:getctag>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`

    const books = parseAddressBooks(booksXml)
    expect(books).toHaveLength(1)
    expect(books[0].displayName).toBe('Personal Address Book')

    const contactsXml = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:response>
    <d:href>/carddav/user/def-addressbook/c1.vcf</d:href>
    <d:propstat>
      <d:prop>
        <d:getetag>"abc123"</d:getetag>
        <card:address-data>BEGIN:VCARD\nVERSION:3.0\nFN:Alice\nEND:VCARD</card:address-data>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`

    const contacts = parseAddressData(contactsXml)
    expect(contacts).toHaveLength(1)
    expect(contacts[0].etag).toBe('abc123')
    expect(contacts[0].addressData).toContain('FN:Alice')
  })

  it('parses CalDAV principal, calendar-home, calendars, and events XML with entities', () => {
    const principalXml = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>/caldav/</d:href>
    <d:propstat>
      <d:prop><d:current-user-principal><d:href>/caldav/alice/</d:href></d:current-user-principal></d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`
    expect(parseCurrentUserPrincipal(principalXml)).toBe('/caldav/alice/')

    const homeXml = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:response>
    <d:href>/caldav/alice/</d:href>
    <d:propstat>
      <d:prop><c:calendar-home-set><d:href>/caldav/alice/</d:href></c:calendar-home-set></d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`
    expect(parseCalendarHomeSet(homeXml)).toBe('/caldav/alice/')

    const calendarsXml = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:ic="http://apple.com/ns/ical/" xmlns:cs="http://calendarserver.org/ns/">
  <d:response>
    <d:href>/caldav/alice/work/</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype><d:collection/><c:calendar/></d:resourcetype>
        <d:displayname>Work &amp; Team</d:displayname>
        <ic:calendar-color>#3788d8ff</ic:calendar-color>
        <cs:getctag>ctag-42</cs:getctag>
        <d:current-user-privilege-set><d:privilege><d:read/></d:privilege></d:current-user-privilege-set>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`
    const cals = parseCalendars(calendarsXml)
    expect(cals).toHaveLength(1)
    expect(cals[0].displayName).toBe('Work & Team')
    expect(cals[0].ctag).toBe('ctag-42')
    expect(cals[0].readOnly).toBe(true)

    const eventsXml = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:response>
    <d:href>/caldav/alice/work/ev1.ics</d:href>
    <d:propstat>
      <d:prop>
        <d:getetag>"etag-99"</d:getetag>
        <c:calendar-data>BEGIN:VCALENDAR&#13;
VERSION:2.0&#13;
BEGIN:VEVENT&#13;
UID:ev1&#13;
SUMMARY:Q&amp;A Session&#13;
END:VEVENT&#13;
END:VCALENDAR</c:calendar-data>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`
    const evs = parseEvents(eventsXml)
    expect(evs).toHaveLength(1)
    expect(evs[0].etag).toBe('etag-99')
    expect(evs[0].calendarData).toContain('SUMMARY:Q&A Session')
  })
})
