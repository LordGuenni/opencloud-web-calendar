import { ref, onUnmounted } from 'vue'
import type { CalendarEvent } from '../types/calendar'

const firedReminders = new Set<string>()

export function useReminders(
  getEvents: () => readonly CalendarEvent[],
  onInAppReminder?: (title: string, body: string) => void
) {
  const notificationsSupported = typeof window !== 'undefined' && 'Notification' in window
  const permission = ref<NotificationPermission>(
    notificationsSupported ? Notification.permission : 'denied'
  )
  const enabled = ref<boolean>(
    notificationsSupported && Notification.permission === 'granted'
  )

  let checkTimer: ReturnType<typeof setInterval> | null = null

  async function requestPermission(): Promise<boolean> {
    if (!notificationsSupported) return false
    try {
      const result = await Notification.requestPermission()
      permission.value = result
      enabled.value = result === 'granted'
      return enabled.value
    } catch {
      return false
    }
  }

  function toggleNotifications(): Promise<boolean> | boolean {
    if (!notificationsSupported) return false
    if (permission.value !== 'granted') {
      return requestPermission()
    }
    enabled.value = !enabled.value
    return enabled.value
  }

  function checkReminders(): void {
    const now = Date.now()
    const windowMs = 60_000 // check reminders due within the last 60 seconds

    for (const event of getEvents()) {
      if (!event.alarms || event.alarms.length === 0) continue
      if (event.status === 'CANCELLED') continue

      const eventStartMs = event.start.getTime()
      for (const alarm of event.alarms) {
        const triggerMs = eventStartMs - alarm.triggerMinutes * 60_000
        const key = `${event.uid}_${event.recurrenceId || ''}_${alarm.triggerMinutes}_${triggerMs}`

        if (firedReminders.has(key)) continue

        if (now >= triggerMs && now - triggerMs <= windowMs) {
          firedReminders.add(key)
          const timeStr = event.allDay
            ? event.start.toLocaleDateString()
            : event.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          const body = alarm.description && alarm.description !== event.summary
            ? `${timeStr} — ${alarm.description}`
            : event.location
              ? `${timeStr} • ${event.location}`
              : timeStr

          onInAppReminder?.(event.summary, body)

          if (notificationsSupported && enabled.value && Notification.permission === 'granted') {
            try {
              new Notification(event.summary, {
                body,
                tag: key
              })
            } catch {
              // Ignore browser notification errors in restricted contexts
            }
          }
        }
      }
    }
  }

  function start(): void {
    if (checkTimer) return
    checkReminders()
    checkTimer = setInterval(checkReminders, 30_000)
  }

  function stop(): void {
    if (checkTimer) {
      clearInterval(checkTimer)
      checkTimer = null
    }
  }

  onUnmounted(() => {
    stop()
  })

  return {
    notificationsSupported,
    permission,
    enabled,
    requestPermission,
    toggleNotifications,
    checkReminders,
    start,
    stop
  }
}
