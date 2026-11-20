export interface Calendar {
  href: string
  displayName: string
  color: string
  ctag: string
  description?: string
  visible: boolean
  readOnly?: boolean
  isShared?: boolean
  owner?: string
  sharePathOrToken?: string
}

export type EventStatus = 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED'
export type EventTransp = 'OPAQUE' | 'TRANSPARENT'
export type EventClassification = 'PUBLIC' | 'PRIVATE' | 'CONFIDENTIAL'

export interface EventAlarm {
  /** Trigger offset in minutes before event start (0 = at start, 15 = 15 min before, 1440 = 1 day before) */
  triggerMinutes: number
  description?: string
}

export interface CalendarEvent {
  uid: string
  calendarHref: string
  href: string
  etag: string
  summary: string
  start: Date
  end: Date
  allDay: boolean
  description?: string
  location?: string
  url?: string
  categories?: string[]
  status?: EventStatus
  transp?: EventTransp
  classification?: EventClassification
  timezone?: string
  alarms?: EventAlarm[]
  icsData: string
  rrule?: string
  recurrenceId?: string
  isRecurring: boolean
  /** Virtual overlay events (e.g., task due dates or contact birthdays) */
  virtualType?: 'todo' | 'birthday'
  virtualId?: string
}

export interface RecurrenceFormData {
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  interval: number
  endType: 'never' | 'count' | 'until'
  count?: number
  until?: Date
  byDay?: string[]
  /** For MONTHLY: 'dayOfMonth' (default) or 'dayOfWeek' (e.g. 2nd Tuesday via bySetPos + byDay) */
  monthlyMode?: 'dayOfMonth' | 'dayOfWeek'
  monthlyWeekday?: string // e.g. 'MO'..'SU'
  monthlyPosition?: number // 1, 2, 3, 4, or -1 (last)
}

export interface EventFormData {
  uid?: string
  calendarHref: string
  summary: string
  start: Date
  end: Date
  allDay: boolean
  description: string
  location: string
  url?: string
  categories?: string[]
  status?: EventStatus
  transp?: EventTransp
  classification?: EventClassification
  timezone?: string
  alarms?: EventAlarm[]
  recurrence?: RecurrenceFormData
}

export interface DateRange {
  start: Date
  end: Date
}

export type TodoStatus = 'NEEDS-ACTION' | 'IN-PROCESS' | 'COMPLETED' | 'CANCELLED'

export interface CalendarTodo {
  uid: string
  calendarHref: string
  href: string
  etag: string
  summary: string
  description?: string
  status: TodoStatus
  priority: number // 0 = none, 1 = high, 5 = medium, 9 = low
  percentComplete: number
  due?: Date
  completed?: Date
  categories?: string[]
  icsData: string
}

export interface TodoFormData {
  uid?: string
  calendarHref: string
  summary: string
  description: string
  status: TodoStatus
  priority: number
  percentComplete: number
  due?: Date | null
  categories?: string[]
}

export type JournalStatus = 'DRAFT' | 'FINAL' | 'CANCELLED'

export interface CalendarJournal {
  uid: string
  calendarHref: string
  href: string
  etag: string
  summary: string
  description?: string
  dtstart?: Date
  lastModified?: Date
  status?: JournalStatus
  categories?: string[]
  icsData: string
}

export interface JournalFormData {
  uid?: string
  calendarHref: string
  summary: string
  description: string
  dtstart?: Date | null
  status?: JournalStatus
  categories?: string[]
}

export interface FreeBusyPeriod {
  start: Date
  end: Date
  type: 'BUSY' | 'BUSY-TENTATIVE' | 'BUSY-UNAVAILABLE' | 'FREE'
}

export interface FreeBusyResult {
  calendarHref: string
  calendarName: string
  color: string
  periods: FreeBusyPeriod[]
  error?: string
}

export interface AddressBook {
  href: string
  displayName: string
  description?: string
  ctag: string
}

export interface Contact {
  uid: string
  addressBookHref: string
  href: string
  etag: string
  fullName: string
  firstName?: string
  lastName?: string
  emails: string[]
  phones: string[]
  organization?: string
  title?: string
  birthday?: string // YYYY-MM-DD or --MM-DD
  notes?: string
  vcardData: string
}

export interface ContactFormData {
  uid?: string
  addressBookHref: string
  fullName: string
  firstName: string
  lastName: string
  emails: string[]
  phones: string[]
  organization: string
  title: string
  birthday: string
  notes: string
}

export type CalendarViewType =
  | 'dayGridMonth'
  | 'timeGridWeek'
  | 'timeGridDay'
  | 'agenda'
  | 'year'

export type AppSection = 'calendar' | 'tasks' | 'notes' | 'contacts'
