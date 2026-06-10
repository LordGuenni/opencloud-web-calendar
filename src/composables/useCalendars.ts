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
      const currentUserId = await waitForUserId()
      if (!currentUserId) throw new Error('User not authenticated')
      const normalizedCurrentUserId = currentUserId.toLowerCase().trim()

      // Store calendar home URL for later use (calendar creation)
      const principal = await discoverUserPrincipal()
      const home = await discoverCalendarHome(principal)
      calendarHomeUrl.value = home

      const discovered = await client.discoverCalendars()
      const allShares = await client.listShares('all')

      // Process discovered calendars and identify shared ones
      calendars.value = discovered.map(cal => {
        // Radicale calendars in 'all' list have PathOrToken starting with / recipientId /
        // We match them by comparing the trailing part of the href with PathOrToken
        const calPath = cal.href.startsWith('/caldav/') ? cal.href.slice(7) : cal.href

        const matchingShare = allShares.find(s =>
          s.PathOrToken === calPath ||
          s.PathOrToken === `/${calPath}` ||
          calPath === `/${s.PathOrToken}` ||
          calPath.endsWith(s.PathOrToken)
        )

        if (matchingShare && matchingShare.Owner.toLowerCase().trim() !== normalizedCurrentUserId) {
          // It's a shared calendar owned by someone else
          loadUserProfile(matchingShare.Owner)
          return {
            ...cal,
            isShared: true,
            owner: matchingShare.Owner,
            sharePathOrToken: matchingShare.PathOrToken
          }
        }
        return cal
      })

      // Identify pending invitations (exclude those owned by the current user)
      pendingShares.value = allShares.filter(
        share => {
          const normalizedOwner = share.Owner.toLowerCase().trim()
          if (normalizedOwner === normalizedCurrentUserId) return false

          // If explicitly shared with this user
          if (share.User) {
            const normalizedShareUser = share.User.toLowerCase().trim()
            if (normalizedShareUser === normalizedCurrentUserId) {
              return !share.EnabledByUser || share.HiddenByUser
            }
          }

          // Fallback discovery via path
          const pathOrToken = share.PathOrToken.toLowerCase()
          const isOurPath = pathOrToken.includes(`/${normalizedCurrentUserId}/`)

          if (isOurPath) {
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
      error.value = err instanceof Error ? err : new Error('Failed to load calendars')
      console.error('Failed to load calendars:', err)
    } finally {
      loading.value = false
    }
  }

  async function loadPendingShares() {
    await loadCalendars()
  }

  function startPolling() {
    if (pollInterval) return
    // Poll for new invitations and calendar updates every 30 seconds
    pollInterval = setInterval(() => {
      loadCalendars()
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
      await loadCalendars()
    } catch (err) {
      console.error('Failed to decline share:', err)
      error.value = err instanceof Error ? err : new Error('Failed to decline share')
    } finally {
      loading.value = false
    }
  }

  async function leaveCalendar(calendar: Calendar) {
    if (!calendar.isShared) return false

    loading.value = true
    try {
      // In Radicale, the recipient "leaves" by deleting their mapping resource
      await client.deleteCalendar(calendar.href)
      await loadCalendars()
      return true
    } catch (err) {
      console.error('Failed to leave calendar:', err)
      error.value = err instanceof Error ? err : new Error('Failed to leave calendar')
      return false
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
    leaveCalendar,
    toggleCalendarVisibility,
    setCalendarVisibility,
    getCalendarByHref,
    getDefaultCalendar,
    deleteCalendar: deleteCalendarByHref
  }
}
