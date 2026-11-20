import { authenticatedFetch } from './auth'
import { CalDAVError, AuthenticationError, NotFoundError, ConflictError } from './errors'
import {
  buildPropfindCurrentUserPrincipal,
  buildPropfindAddressBookHome,
  buildPropfindAddressBooks,
  buildAddressBookQuery
} from './xml-builder'
import {
  parseCurrentUserPrincipal,
  parseAddressBookHomeSet,
  parseAddressBooks,
  parseAddressData
} from './xml-parser'
import { generateUID } from './ics-utils'
import type { AddressBook, Contact, ContactFormData } from '../types/calendar'

const CARDDAV_BASE = '/carddav/'

async function propfind(url: string, body: string, depth: '0' | '1' = '0'): Promise<string> {
  const response = await authenticatedFetch(url, {
    method: 'PROPFIND',
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      Depth: depth
    },
    body
  })

  if (response.status === 401) throw new AuthenticationError()
  if (response.status === 404) throw new NotFoundError(`CardDAV resource not found: ${url}`)
  if (!response.ok && response.status !== 207) {
    throw new CalDAVError(`CardDAV PROPFIND failed: ${response.statusText}`, response.status)
  }
  return response.text()
}

export async function discoverAddressBooks(): Promise<AddressBook[]> {
  try {
    const principalXml = await propfind(CARDDAV_BASE, buildPropfindCurrentUserPrincipal(), '0')
    const principal = parseCurrentUserPrincipal(principalXml)
    if (!principal) return []

    const homeXml = await propfind(principal, buildPropfindAddressBookHome(), '0')
    const home = parseAddressBookHomeSet(homeXml)
    if (!home) return []

    const booksXml = await propfind(home, buildPropfindAddressBooks(), '1')
    const rawBooks = parseAddressBooks(booksXml)

    return rawBooks.map((b) => ({
      href: b.href,
      displayName: b.displayName || 'Contacts',
      description: b.description,
      ctag: b.ctag || ''
    }))
  } catch (e) {
    console.warn('CardDAV discovery unavailable:', e)
    return []
  }
}

export function parseVCard(
  vcardData: string,
  href: string,
  etag: string
): Contact | null {
  try {
    // Unfold folded lines per RFC 6350 / RFC 2426
    const unfolded = vcardData.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '')
    const lines = unfolded.split(/\r?\n/)

    let uid = ''
    let fullName = ''
    let firstName = ''
    let lastName = ''
    const emails: string[] = []
    const phones: string[] = []
    let organization = ''
    let title = ''
    let birthday = ''
    let notes = ''

    for (const line of lines) {
      const colonIdx = line.indexOf(':')
      if (colonIdx === -1) continue

      const keyPart = line.slice(0, colonIdx)
      const rawValue = line.slice(colonIdx + 1)
      const propName = keyPart.split(';')[0].replace(/^[^.]+\./, '').toUpperCase()
      const value = unescapeVCardText(rawValue)

      switch (propName) {
        case 'UID':
          uid = value.trim()
          break
        case 'FN':
          fullName = value.trim()
          break
        case 'N': {
          const parts = rawValue.split(';').map(unescapeVCardText)
          lastName = parts[0]?.trim() || ''
          firstName = parts[1]?.trim() || ''
          break
        }
        case 'EMAIL':
          if (value.trim()) emails.push(value.trim())
          break
        case 'TEL':
          if (value.trim()) phones.push(value.trim())
          break
        case 'ORG':
          organization = rawValue.split(';').map(unescapeVCardText).filter(Boolean).join(' - ')
          break
        case 'TITLE':
          title = value.trim()
          break
        case 'BDAY':
          birthday = normalizeBirthday(value.trim())
          break
        case 'NOTE':
          notes = value
          break
      }
    }

    if (!uid) {
      const filename = href.substring(href.lastIndexOf('/') + 1).replace(/\.vcf$/i, '')
      uid = filename || generateUID()
    }

    if (!fullName) {
      fullName = [firstName, lastName].filter(Boolean).join(' ') || emails[0] || uid
    }

    const addressBookHref = href.substring(0, href.lastIndexOf('/') + 1)

    return {
      uid,
      addressBookHref,
      href,
      etag,
      fullName,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      emails,
      phones,
      organization: organization || undefined,
      title: title || undefined,
      birthday: birthday || undefined,
      notes: notes || undefined,
      vcardData
    }
  } catch (e) {
    console.error('Failed to parse vCard:', e)
    return null
  }
}

export function generateVCard(formData: ContactFormData, existingVCard?: string): string {
  const uid = formData.uid || generateUID()
  const fn =
    formData.fullName.trim() ||
    [formData.firstName.trim(), formData.lastName.trim()].filter(Boolean).join(' ') ||
    formData.emails[0] ||
    'Contact'

  // Preserve unknown lines from existing vCard when editing
  const managedProps = new Set(['BEGIN', 'END', 'VERSION', 'PRODID', 'UID', 'FN', 'N', 'EMAIL', 'TEL', 'ORG', 'TITLE', 'BDAY', 'NOTE', 'REV'])
  const preservedLines: string[] = []

  if (existingVCard) {
    const unfolded = existingVCard.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '')
    for (const line of unfolded.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const colonIdx = trimmed.indexOf(':')
      if (colonIdx === -1) continue
      const propName = trimmed.slice(0, colonIdx).split(';')[0].replace(/^[^.]+\./, '').toUpperCase()
      if (!managedProps.has(propName)) {
        preservedLines.push(trimmed)
      }
    }
  }

  const lines: string[] = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    'PRODID:-//OpenCloud//Calendar//EN',
    `UID:${uid}`,
    `FN:${escapeVCardText(fn)}`,
    `N:${escapeVCardText(formData.lastName.trim())};${escapeVCardText(formData.firstName.trim())};;;`
  ]

  for (const email of formData.emails.map((e) => e.trim()).filter(Boolean)) {
    lines.push(`EMAIL;TYPE=INTERNET:${escapeVCardText(email)}`)
  }
  for (const phone of formData.phones.map((p) => p.trim()).filter(Boolean)) {
    lines.push(`TEL;TYPE=CELL:${escapeVCardText(phone)}`)
  }
  if (formData.organization.trim()) {
    lines.push(`ORG:${escapeVCardText(formData.organization.trim())}`)
  }
  if (formData.title.trim()) {
    lines.push(`TITLE:${escapeVCardText(formData.title.trim())}`)
  }
  if (formData.birthday.trim()) {
    lines.push(`BDAY:${formData.birthday.trim()}`)
  }
  if (formData.notes.trim()) {
    lines.push(`NOTE:${escapeVCardText(formData.notes.trim())}`)
  }

  lines.push(`REV:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`)
  lines.push(...preservedLines)
  lines.push('END:VCARD')

  return lines.join('\r\n')
}

export async function fetchContacts(addressBookHref: string): Promise<Contact[]> {
  const response = await authenticatedFetch(addressBookHref, {
    method: 'REPORT',
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      Depth: '1'
    },
    body: buildAddressBookQuery()
  })

  if (response.status === 401) throw new AuthenticationError()
  if (response.status === 404) return []
  if (!response.ok && response.status !== 207) {
    throw new CalDAVError(`Failed to fetch contacts: ${response.statusText}`, response.status)
  }

  const xml = await response.text()
  const rawContacts = parseAddressData(xml)
  const contacts: Contact[] = []

  for (const item of rawContacts) {
    const filename = item.href.substring(item.href.lastIndexOf('/') + 1)
    const fixedHref = addressBookHref.endsWith('/')
      ? `${addressBookHref}${filename}`
      : `${addressBookHref}/${filename}`
    const parsed = parseVCard(item.addressData, fixedHref, item.etag)
    if (parsed) contacts.push(parsed)
  }

  return contacts.sort((a, b) => a.fullName.localeCompare(b.fullName))
}

export async function createContact(formData: ContactFormData): Promise<Contact> {
  const uid = formData.uid || generateUID()
  const vcardData = generateVCard({ ...formData, uid })
  const baseHref = formData.addressBookHref.endsWith('/')
    ? formData.addressBookHref
    : `${formData.addressBookHref}/`
  const href = `${baseHref}${uid}.vcf`

  const response = await authenticatedFetch(href, {
    method: 'PUT',
    headers: {
      'Content-Type': 'text/vcard; charset=utf-8',
      'If-None-Match': '*'
    },
    body: vcardData
  })

  if (response.status === 401) throw new AuthenticationError()
  if (response.status === 412) throw new ConflictError('Contact already exists')
  if (!response.ok && response.status !== 201) {
    throw new CalDAVError(`Failed to create contact: ${response.statusText}`, response.status)
  }

  const etag = response.headers.get('ETag')?.replace(/"/g, '') || ''
  return parseVCard(vcardData, href, etag)!
}

export async function updateContact(
  contact: Contact,
  formData: ContactFormData
): Promise<Contact> {
  const vcardData = generateVCard({ ...formData, uid: contact.uid }, contact.vcardData)
  const headers: Record<string, string> = {
    'Content-Type': 'text/vcard; charset=utf-8'
  }
  if (contact.etag) {
    headers['If-Match'] = `"${contact.etag}"`
  }

  const response = await authenticatedFetch(contact.href, {
    method: 'PUT',
    headers,
    body: vcardData
  })

  if (response.status === 401) throw new AuthenticationError()
  if (response.status === 404) throw new NotFoundError('Contact not found')
  if (response.status === 412) throw new ConflictError('Contact was modified by another client')
  if (!response.ok && response.status !== 204) {
    throw new CalDAVError(`Failed to update contact: ${response.statusText}`, response.status)
  }

  const etag = response.headers.get('ETag')?.replace(/"/g, '') || contact.etag
  return parseVCard(vcardData, contact.href, etag)!
}

export async function deleteContact(contact: Contact): Promise<void> {
  const headers: Record<string, string> = {}
  if (contact.etag) {
    headers['If-Match'] = `"${contact.etag}"`
  }

  const response = await authenticatedFetch(contact.href, {
    method: 'DELETE',
    headers
  })

  if (response.status === 401) throw new AuthenticationError()
  if (response.status === 404) return
  if (!response.ok && response.status !== 204) {
    throw new CalDAVError(`Failed to delete contact: ${response.statusText}`, response.status)
  }
}

function normalizeBirthday(raw: string): string {
  // Handle YYYYMMDD -> YYYY-MM-DD, YYYY-MM-DD, or --MMDD -> --MM-DD
  const digits8 = raw.match(/^(\d{4})(\d{2})(\d{2})/)
  if (digits8) return `${digits8[1]}-${digits8[2]}-${digits8[3]}`

  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/)
  if (iso) return iso[1]

  const noYearCompact = raw.match(/^--(\d{2})(\d{2})/)
  if (noYearCompact) return `--${noYearCompact[1]}-${noYearCompact[2]}`

  const noYearDash = raw.match(/^--(\d{2}-\d{2})/)
  if (noYearDash) return `--${noYearDash[1]}`

  return raw
}

function escapeVCardText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
}

function unescapeVCardText(text: string): string {
  return text
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
}
