import { ref, readonly, onMounted, onUnmounted } from 'vue'
import { getCalDAVClient } from '../caldav/client'
import { waitForUserId } from '../caldav/auth'
import { discoverUserPrincipal, discoverCalendarHome } from '../caldav/discovery'
import { useUserProfiles } from './useUserProfiles'
import type { Calendar } from '../types/calendar'
import type { Share } from '../caldav/client'

const calendars = ref<Calendar[]>([])
const pendingShares = ref<Share[]>([])
const loading = ref(false)
const error = ref<Error | null>(null)
const calendarHomeUrl = ref<string>('')
let pollInterval: ReturnType<typeof setInterval> | null = null

export function useCalendars() {
  const client = getCalDAVClient()
  const { userProfiles, loadUserProfile } = useUserProfiles()

  async function loadCalendars(): Promise<void> {
    loading.value = true
    error.value = null

    try {
      // Store calendar home URL for later use (calendar creation)
      const principal = await discoverUserPrincipal()
      const home = await discoverCalendarHome(principal)
      calendarHomeUrl.value = home

      calendars.value = await client.discoverCalendars()

      await loadPendingShares()
    } catch (err) {
      error.value = err instanceof Error ? err : new Error('Failed to load calendars')
      console.error('Failed to load calendars:', err)
    } finally {
      loading.value = false
    }
  }

  async function loadPendingShares() {
    try {
      const currentUserId = await waitForUserId()
      if (!currentUserId) return

      const shares = await client.listShares('all')
      const normalizedCurrentUserId = currentUserId.toLowerCase().trim()

      pendingShares.value = shares.filter(
        share => {
          // If explicitly shared with this user
          if (share.User) {
            const normalizedShareUser = share.User.toLowerCase().trim()
            if (normalizedShareUser === normalizedCurrentUserId) {
              return !share.EnabledByUser || share.HiddenByUser
            }
          }

          // Radicale sometimes doesn't set 'User' on 'all' list for the recipient
          // but we can identify it if PathOrToken contains our userId and it's not owned by us
          const pathOrToken = share.PathOrToken.toLowerCase()
          const isOurPath = pathOrToken.includes(`/${normalizedCurrentUserId}/`)
          const isNotOurOwn = share.Owner.toLowerCase().trim() !== normalizedCurrentUserId

          if (isOurPath && isNotOurOwn) {
            return !share.EnabledByUser || share.HiddenByUser
          }

          return false
        }
      )

      // Resolve owner profiles for all pending shares
      for (const share of pendingShares.value) {
        if (share.Owner) {
          loadUserProfile(share.Owner)
        }
      }
    } catch (err) {
      console.warn('Failed to load pending shares:', err)
    }
  }

  function startPolling() {
    if (pollInterval) return
    // Poll for new invitations every 30 seconds
    pollInterval = setInterval(() => {
      loadPendingShares()
    }, 30000)
  }

  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval)
      pollInterval = null
    }
  }

  onMounted(() => {
    startPolling()
  })

  onUnmounted(() => {
    stopPolling()
  })

  async function acceptShare(share: Share) {
    loading.value = true
    try {
      await client.updateShare('map', {
        PathOrToken: share.PathOrToken,
        Enabled: true,
        Hidden: false
      })
      await loadCalendars()
    } catch (err) {
      console.error('Failed to accept share:', err)
      error.value = err instanceof Error ? err : new Error('Failed to accept share')
    } finally {
      loading.value = false
    }
  }

  async function declineShare(share: Share) {
    loading.value = true
    try {
      await client.deleteShare('map', share.PathOrToken)
      await loadPendingShares()
    } catch (err) {
      console.error('Failed to decline share:', err)
      error.value = err instanceof Error ? err : new Error('Failed to decline share')
    } finally {
      loading.value = false
    }
  }

  function toggleCalendarVisibility(calendarHref: string): void {
    const calendar = calendars.value.find((c) => c.href === calendarHref)
    if (calendar) {
      calendar.visible = !calendar.visible
    }
  }

  function setCalendarVisibility(calendarHref: string, visible: boolean): void {
    const calendar = calendars.value.find((c) => c.href === calendarHref)
    if (calendar) {
      calendar.visible = visible
    }
  }

  function getCalendarByHref(href: string): Calendar | undefined {
    return calendars.value.find((c) => c.href === href)
  }

  function getDefaultCalendar(): Calendar | undefined {
    return calendars.value[0]
  }

  async function deleteCalendarByHref(calendarHref: string): Promise<boolean> {
    loading.value = true
    error.value = null

    try {
      await client.deleteCalendar(calendarHref)
      // Remove from local state
      calendars.value = calendars.value.filter((c) => c.href !== calendarHref)
      return true
    } catch (err) {
      error.value = err instanceof Error ? err : new Error('Failed to delete calendar')
      console.error('Failed to delete calendar:', err)
      return false
    } finally {
      loading.value = false
    }
  }

  return {
    calendars: readonly(calendars),
    pendingShares: readonly(pendingShares),
    userProfiles,
    loading: readonly(loading),
    error: readonly(error),
    calendarHomeUrl: readonly(calendarHomeUrl),
    loadCalendars,
    loadPendingShares,
    acceptShare,
    declineShare,
    toggleCalendarVisibility,
    setCalendarVisibility,
    getCalendarByHref,
    getDefaultCalendar,
    deleteCalendar: deleteCalendarByHref
  }
}
