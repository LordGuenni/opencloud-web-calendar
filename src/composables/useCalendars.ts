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
  const { userProfiles, loadUserProfile, cleanUserId } = useUserProfiles()

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
      calendars.value = (discovered.map(cal => {
        // Radicale calendars in 'all' list have PathOrToken starting with / recipientId /
        // We match them by comparing the trailing part of the href with PathOrToken
        const calPath = cal.href.startsWith('/caldav/') ? cal.href.slice(7) : cal.href

        const matchingShare = allShares.find(s =>
          s.PathOrToken === calPath ||
          s.PathOrToken === `/${calPath}` ||
          calPath === `/${s.PathOrToken}` ||
          calPath.endsWith(s.PathOrToken)
        )

        const ownerId = matchingShare ? cleanUserId(matchingShare.Owner) : null
        if (matchingShare && ownerId && ownerId.toLowerCase().trim() !== normalizedCurrentUserId) {
          // If the recipient has NOT enabled this share, don't show it in the main list
          if (!matchingShare.EnabledByUser || matchingShare.HiddenByUser || !matchingShare.EnabledByOwner) {
            return null
          }

          // It's an active shared calendar owned by someone else
          loadUserProfile(ownerId)
          return {
            ...cal,
            isShared: true,
            owner: ownerId,
            sharePathOrToken: matchingShare.PathOrToken
          }
        }
        return cal
      }).filter(Boolean) as Calendar[])

      // Identify pending invitations
      pendingShares.value = allShares.filter(
        share => {
          const ownerId = cleanUserId(share.Owner)
          if (ownerId.toLowerCase().trim() === normalizedCurrentUserId) return false

          // MUST be enabled by owner to be a valid invitation
          if (!share.EnabledByOwner) return false
          
          // An invitation is "Pending" if it's NOT enabled by user AND it's STILL hidden (Radicale default)
          if (share.EnabledByUser || !share.HiddenByUser) return false

          // If explicitly shared with this user
          if (share.User) {
            const normalizedShareUser = share.User.toLowerCase().trim()
            if (normalizedShareUser === normalizedCurrentUserId) {
              return true
            }
          }

          // Fallback discovery via path
          const pathOrToken = share.PathOrToken.toLowerCase()
          const isOurPath = pathOrToken.includes(`/${normalizedCurrentUserId}/`)

          return isOurPath
        }
      )

      // Resolve owner profiles for all pending shares
      for (const share of pendingShares.value) {
        if (share.Owner) {
          loadUserProfile(cleanUserId(share.Owner))
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
      // To Accept, we set EnabledByUser: true AND HiddenByUser: false
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

  /**
   * Resiliently removes/hides a share for a recipient.
   * To "Leave", we set BOTH EnabledByUser and HiddenByUser to false.
   * This distinguishes it from "Invited" (false, true).
   */
  async function recipientRemoveShare(pathOrToken: string) {
    const cleanPath = pathOrToken.startsWith('/') ? pathOrToken.slice(1) : pathOrToken
    const pathsToTry = [...new Set([
      pathOrToken,
      pathOrToken.endsWith('/') ? pathOrToken : `${pathOrToken}/`,
      `/${pathOrToken}`,
      `/${cleanPath}/`,
      cleanPath
    ])]

    let lastErr: any = null

    // recipients are permitted to toggle HiddenByUser and EnabledByUser
    for (const p of pathsToTry) {
      try {
        await client.updateShare('map', { PathOrToken: p, Enabled: false, Hidden: false })
        return true
      } catch (e) { lastErr = e }
    }

    throw lastErr || new Error('Failed to hide shared calendar')
  }

  async function declineShare(share: Share) {
    loading.value = true
    try {
      await recipientRemoveShare(share.PathOrToken)
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
      const path = calendar.sharePathOrToken || (calendar.href.startsWith('/caldav/') ? calendar.href.slice(7) : calendar.href)
      await recipientRemoveShare(path)
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
