import ICAL from 'ical.js'
import { authenticatedFetch } from './auth'
import { CalDAVError, AuthenticationError, NotFoundError, ConflictError } from './errors'
import { buildTodoQuery } from './xml-builder'
import { parseEvents } from './xml-parser'
import { generateUID } from './ics-utils'
import type { CalendarTodo, TodoFormData, TodoStatus } from '../types/calendar'

export function parseTodoICS(
  icsData: string,
  href: string,
  etag: string
): CalendarTodo | null {
  try {
    const jcalData = ICAL.parse(icsData)
    const comp = new ICAL.Component(jcalData)
    const vtodo = comp.getFirstSubcomponent('vtodo')
    if (!vtodo) return null

    const calendarHref = href.substring(0, href.lastIndexOf('/') + 1)
    const uid = String(vtodo.getFirstPropertyValue('uid') || '')
    if (!uid) return null

    const summary = String(vtodo.getFirstPropertyValue('summary') || '')
    const descVal = vtodo.getFirstPropertyValue('description')
    const description = typeof descVal === 'string' && descVal ? descVal : undefined

    const rawStatus = String(vtodo.getFirstPropertyValue('status') || 'NEEDS-ACTION').toUpperCase()
    const status: TodoStatus =
      rawStatus === 'COMPLETED' ||
      rawStatus === 'IN-PROCESS' ||
      rawStatus === 'CANCELLED' ||
      rawStatus === 'NEEDS-ACTION'
        ? rawStatus
        : 'NEEDS-ACTION'

    const rawPriority = vtodo.getFirstPropertyValue('priority')
    const priority = typeof rawPriority === 'number' ? rawPriority : Number(rawPriority) || 0

    const rawPercent = vtodo.getFirstPropertyValue('percent-complete')
    const percentComplete =
      typeof rawPercent === 'number'
        ? rawPercent
        : status === 'COMPLETED'
          ? 100
          : Number(rawPercent) || 0

    const dueProp = vtodo.getFirstPropertyValue('due') as ICAL.Time | null
    const due = dueProp ? dueProp.toJSDate() : undefined

    const completedProp = vtodo.getFirstPropertyValue('completed') as ICAL.Time | null
    const completed = completedProp ? completedProp.toJSDate() : undefined

    const catProps = vtodo.getAllProperties('categories')
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
      status,
      priority,
      percentComplete,
      due,
      completed,
      categories: catSet.size > 0 ? Array.from(catSet) : undefined,
      icsData
    }
  } catch (e) {
    console.error('Failed to parse VTODO ICS:', e)
    return null
  }
}

export function generateTodoICS(formData: TodoFormData, existingIcs?: string): string {
  const uid = formData.uid || generateUID()
  let comp: ICAL.Component
  let vtodo: ICAL.Component

  if (existingIcs) {
    try {
      comp = new ICAL.Component(ICAL.parse(existingIcs))
      const found = comp.getFirstSubcomponent('vtodo')
      if (found) {
        vtodo = found
      } else {
        vtodo = new ICAL.Component('vtodo')
        vtodo.addPropertyWithValue('uid', uid)
        comp.addSubcomponent(vtodo)
      }
    } catch {
      comp = new ICAL.Component('vcalendar')
      comp.addPropertyWithValue('version', '2.0')
      comp.addPropertyWithValue('prodid', '-//OpenCloud//Calendar//EN')
      vtodo = new ICAL.Component('vtodo')
      vtodo.addPropertyWithValue('uid', uid)
      comp.addSubcomponent(vtodo)
    }
  } else {
    comp = new ICAL.Component('vcalendar')
    comp.addPropertyWithValue('version', '2.0')
    comp.addPropertyWithValue('prodid', '-//OpenCloud//Calendar//EN')
    vtodo = new ICAL.Component('vtodo')
    vtodo.addPropertyWithValue('uid', uid)
    comp.addSubcomponent(vtodo)
  }

  const now = ICAL.Time.fromJSDate(new Date(), true)
  vtodo.updatePropertyWithValue('dtstamp', now)
  vtodo.updatePropertyWithValue('last-modified', now)
  vtodo.updatePropertyWithValue('summary', formData.summary)
  vtodo.updatePropertyWithValue('status', formData.status)

  if (formData.description) {
    vtodo.updatePropertyWithValue('description', formData.description)
  } else {
    vtodo.removeAllProperties('description')
  }

  if (formData.priority > 0) {
    vtodo.updatePropertyWithValue('priority', formData.priority)
  } else {
    vtodo.removeAllProperties('priority')
  }

  const percent = formData.status === 'COMPLETED' ? 100 : formData.percentComplete
  vtodo.updatePropertyWithValue('percent-complete', percent)

  vtodo.removeAllProperties('due')
  if (formData.due) {
    vtodo.addPropertyWithValue('due', ICAL.Time.fromJSDate(formData.due, true))
  }

  if (formData.status === 'COMPLETED') {
    if (!vtodo.getFirstPropertyValue('completed')) {
      vtodo.addPropertyWithValue('completed', now)
    }
  } else {
    vtodo.removeAllProperties('completed')
  }

  vtodo.removeAllProperties('categories')
  const cats = (formData.categories || []).map((c) => c.trim()).filter(Boolean)
  if (cats.length > 0) {
    const catProp = new ICAL.Property('categories')
    catProp.setValues(cats)
    vtodo.addProperty(catProp)
  }

  return comp.toString()
}

export async function fetchTodos(calendarHref: string): Promise<CalendarTodo[]> {
  const response = await authenticatedFetch(calendarHref, {
    method: 'REPORT',
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      Depth: '1'
    },
    body: buildTodoQuery()
  })

  if (response.status === 401) throw new AuthenticationError()
  if (response.status === 404) return []
  if (!response.ok && response.status !== 207) {
    throw new CalDAVError(`Failed to fetch tasks: ${response.statusText}`, response.status)
  }

  const xml = await response.text()
  const rawItems = parseEvents(xml)
  const todos: CalendarTodo[] = []

  for (const item of rawItems) {
    const filename = item.href.substring(item.href.lastIndexOf('/') + 1)
    const fixedHref = calendarHref.endsWith('/')
      ? `${calendarHref}${filename}`
      : `${calendarHref}/${filename}`
    const parsed = parseTodoICS(item.calendarData, fixedHref, item.etag)
    if (parsed) todos.push(parsed)
  }

  return todos
}

export async function createTodo(formData: TodoFormData): Promise<CalendarTodo> {
  const uid = formData.uid || generateUID()
  const icsData = generateTodoICS({ ...formData, uid })
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
  if (response.status === 412) throw new ConflictError('Task already exists')
  if (!response.ok && response.status !== 201) {
    throw new CalDAVError(`Failed to create task: ${response.statusText}`, response.status)
  }

  const etag = response.headers.get('ETag')?.replace(/"/g, '') || ''
  return (
    parseTodoICS(icsData, href, etag) || {
      uid,
      calendarHref: baseHref,
      href,
      etag,
      summary: formData.summary,
      description: formData.description || undefined,
      status: formData.status,
      priority: formData.priority,
      percentComplete: formData.percentComplete,
      due: formData.due || undefined,
      categories: formData.categories,
      icsData
    }
  )
}

export async function updateTodo(
  todo: CalendarTodo,
  formData: TodoFormData
): Promise<CalendarTodo> {
  const icsData = generateTodoICS({ ...formData, uid: todo.uid }, todo.icsData)

  const headers: Record<string, string> = {
    'Content-Type': 'text/calendar; charset=utf-8'
  }
  if (todo.etag) {
    headers['If-Match'] = `"${todo.etag}"`
  }

  const response = await authenticatedFetch(todo.href, {
    method: 'PUT',
    headers,
    body: icsData
  })

  if (response.status === 401) throw new AuthenticationError()
  if (response.status === 404) throw new NotFoundError('Task not found')
  if (response.status === 412) throw new ConflictError('Task was modified by another client')
  if (!response.ok && response.status !== 204) {
    throw new CalDAVError(`Failed to update task: ${response.statusText}`, response.status)
  }

  const etag = response.headers.get('ETag')?.replace(/"/g, '') || todo.etag
  return (
    parseTodoICS(icsData, todo.href, etag) || {
      ...todo,
      summary: formData.summary,
      description: formData.description || undefined,
      status: formData.status,
      priority: formData.priority,
      percentComplete: formData.status === 'COMPLETED' ? 100 : formData.percentComplete,
      due: formData.due || undefined,
      categories: formData.categories,
      etag,
      icsData
    }
  )
}

export async function deleteTodo(todo: CalendarTodo): Promise<void> {
  const headers: Record<string, string> = {}
  if (todo.etag) {
    headers['If-Match'] = `"${todo.etag}"`
  }

  const response = await authenticatedFetch(todo.href, {
    method: 'DELETE',
    headers
  })

  if (response.status === 401) throw new AuthenticationError()
  if (response.status === 404) return
  if (!response.ok && response.status !== 204) {
    throw new CalDAVError(`Failed to delete task: ${response.statusText}`, response.status)
  }
}
