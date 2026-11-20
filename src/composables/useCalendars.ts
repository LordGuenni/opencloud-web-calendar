import { ref, readonly, onMounted, onUnmounted } from 'vue'
import { getCalDAVClient } from '../caldav/client'
import { waitForUserId } from '../caldav/auth'
import { discoverUserPrincipal, discoverCalendarHome } from '../caldav/discovery'
import { useUserProfiles } from './useUserProfiles'
import type { Calendar } from '../types/calendar'
import type { Share } from '../caldav/client'

export interface JoinedCalendarRecord {
  token: string
  displayName: string
  color: string
  permissions: string // 'r' | 'rw'
  owner?: string
  joinedAt: number
}

const calendars = ref<Calendar[]>([])
const pendingShares = ref<Share[]>([])
const loading = ref(false)
const error = ref<Error | null>(null)
const calendarHomeUrl = ref<string>('')
let pollInterval: ReturnType<typeof setInterval> | null = null

function getStorageKey(userId: string): string {
  return `opencloud_web_cal_joined_tokens_${userId}`
}

export function getJoinedTokenCalendars(userId: string): JoinedCalendarRecord[] {
  try {
    const raw = localStorage.getItem(getStorageKey(userId))
    return raw ? JSON.parse(raw) : []
  } catch (e) {
    console.error('Failed to read joined token calendars:', e)
    return []
  }
}

export function saveJoinedTokenCalendars(userId: string, records: JoinedCalendarRecord[]): void {
  try {
    localStorage.setItem(getStorageKey(userId), JSON.stringify(records))
  } catch (e) {
    console.error('Failed to save joined token calendars:', e)
  }
}

export function addJoinedTokenCalendar(userId: string, record: JoinedCalendarRecord): void {
  const existing = getJoinedTokenCalendars(userId)
  const normalize = (t: string) => {
    const p = t.startsWith('/caldav/') ? t.slice(7) : t
    return p.startsWith('/') ? p : `/${p}`
  }
  const target = normalize(record.token)
  const filtered = existing.filter((r) => normalize(r.token) !== target)
  filtered.push(record)
  saveJoinedTokenCalendars(userId, filtered)
}

export function removeJoinedTokenCalendar(userId: string, token: string): void {
  const existing = getJoinedTokenCalendars(userId)
  const normalize = (t: string) => {
    const p = t.startsWith('/caldav/') ? t.slice(7) : t
    return p.startsWith('/') ? p : `/${p}`
  }
  const target = normalize(token)
  const filtered = existing.filter((r) => normalize(r.token) !== target)
  saveJoinedTokenCalendars(userId, filtered)
}

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
      const normalize = (path: string) => {
        const p = path.startsWith('/caldav/') ? path.slice(7) : path
        return p.endsWith('/') ? p : p + '/'
      }

      calendars.value = (discovered.map(cal => {
        const calPath = normalize(cal.href)

        const matchingShare = allShares.find(s => {
          const sharePath = normalize(s.PathOrToken)
          return (
            sharePath === calPath ||
            calPath.endsWith(sharePath) ||
            sharePath.endsWith(calPath)
          )
        })

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

      // Add fallback for enabled shared calendars that were not found by discovery
      const discoveredHrefs = new Set(calendars.value.map((c) => normalize(c.href)))

      for (const share of allShares) {
        const ownerId = cleanUserId(share.Owner)
        if (ownerId.toLowerCase().trim() === normalizedCurrentUserId) continue

        if (share.EnabledByUser && !share.HiddenByUser && share.EnabledByOwner) {
          const sharePath = normalize(share.PathOrToken)
          if (!discoveredHrefs.has(sharePath)) {
            // This is an enabled share that discovery missed
            loadUserProfile(ownerId)
            calendars.value.push({
              href: `/caldav/${sharePath}`,
              displayName:
                share.PathOrToken.split('/').filter(Boolean).pop()?.replace('-shared', '') ||
                'Shared Calendar',
              color: '#3788d8', // Default color
              ctag: '',
              visible: true,
              isShared: true,
              owner: ownerId,
              sharePathOrToken: share.PathOrToken,
              readOnly: share.Permissions === 'r'
            })
            discoveredHrefs.add(sharePath)
          }
        }
      }

      // Add joined token-based calendars from local storage
      const joinedTokenCals = getJoinedTokenCalendars(normalizedCurrentUserId)
      for (const joined of joinedTokenCals) {
        const tokenPath = joined.token.startsWith('/') ? joined.token : `/${joined.token}`
        const fullHref = tokenPath.startsWith('/caldav/') ? tokenPath : `/caldav${tokenPath}`
        const normalizedHref = normalize(fullHref)

        if (!discoveredHrefs.has(normalizedHref)) {
          calendars.value.push({
            href: fullHref.endsWith('/') ? fullHref : `${fullHref}/`,
            displayName: joined.displayName || 'Shared Calendar',
            color: joined.color || '#3788d8',
            ctag: '',
            visible: true,
            isShared: true,
            owner: joined.owner || '',
            sharePathOrToken: joined.token,
            readOnly: joined.permissions === 'r'
          })
          discoveredHrefs.add(normalizedHref)
        }
      }

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
   * Removes/hides a share for a recipient.
   * To "Leave", we set BOTH EnabledByUser and HiddenByUser to false.
   * This distinguishes it from "Invited" (false, true).
   */
  async function recipientRemoveShare(pathOrToken: string) {
    try {
      await client.updateShare('map', { PathOrToken: pathOrToken, Enabled: false, Hidden: false })
      return true
    } catch (e) {
      console.error('Failed to update share map:', e)
      throw new Error('Failed to hide shared calendar')
    }
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
      const currentUserId = await waitForUserId()
      const normalizedCurrentUserId = (currentUserId || '').toLowerCase().trim()
      const path = calendar.sharePathOrToken || (calendar.href.startsWith('/caldav/') ? calendar.href.slice(7) : calendar.href)

      // If it's a token share or joined via link, remove from local storage
      if (path.includes('.token') || path.startsWith('/.token') || path.startsWith('.token')) {
        removeJoinedTokenCalendar(normalizedCurrentUserId, path)
        await loadCalendars()
        return true
      }

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

  async function joinCalendarViaInvite(record: {
    token?: string
    calendarPath?: string
    displayName: string
    color: string
    permissions: string
    owner?: string
  }): Promise<boolean> {
    try {
      const currentUserId = await waitForUserId()
      if (!currentUserId) throw new Error('User not authenticated')
      const normalizedCurrentUserId = currentUserId.toLowerCase().trim()

      const internalPath = record.calendarPath
        ? record.calendarPath.startsWith('/caldav/')
          ? record.calendarPath.slice(7)
          : record.calendarPath
        : ''

      let mappedSuccess = false

      // Try creating a server-side mapped share so user is registered in Radicale and appears under "Share with users"
      if (internalPath) {
        try {
          const pathParts = internalPath.split('/').filter(Boolean)
          const calendarName = pathParts.length > 0 ? pathParts[pathParts.length - 1] : 'shared-calendar'

          await client.createShare('map', {
            PathMapped: internalPath,
            User: normalizedCurrentUserId,
            Permissions: record.permissions || 'rw',
            Enabled: true,
            Hidden: false,
            PathOrToken: `/${normalizedCurrentUserId}/${calendarName}-shared/`
          })
          mappedSuccess = true
        } catch (e) {
          console.warn('Direct mapped share creation not available, falling back to token share:', e)
        }
      }

      // If mapped share was not created, save token share locally
      if (!mappedSuccess && record.token) {
        addJoinedTokenCalendar(normalizedCurrentUserId, {
          token: record.token,
          displayName: record.displayName,
          color: record.color,
          permissions: record.permissions,
          owner: record.owner,
          joinedAt: Date.now()
        })
      }

      await loadCalendars()
      return true
    } catch (err) {
      console.error('Failed to join calendar:', err)
      error.value = err instanceof Error ? err : new Error('Failed to join calendar')
      return false
    }
  }

  function isCalendarAlreadyJoined(tokenOrPath: string, currentUserId?: string): boolean {
    if (!tokenOrPath) return false
    const normalize = (t: string) => {
      let p = t.startsWith('/caldav/') ? t.slice(7) : t
      p = p.startsWith('/') ? p : `/${p}`
      return p.endsWith('/') ? p : `${p}/`
    }
    const target = normalize(tokenOrPath)

    // Check in currently loaded calendars
    const inLoaded = calendars.value.some((c) => {
      const cPath = normalize(c.sharePathOrToken || c.href)
      return cPath === target || cPath.endsWith(target) || target.endsWith(cPath)
    })
    if (inLoaded) return true

    // Check in local storage if userId is provided
    if (currentUserId) {
      const joined = getJoinedTokenCalendars(currentUserId.toLowerCase().trim())
      return joined.some((r) => normalize(r.token) === target)
    }

    return false
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
    joinCalendarViaInvite,
    joinCalendarViaToken: joinCalendarViaInvite,
    isCalendarAlreadyJoined,
    toggleCalendarVisibility,
    setCalendarVisibility,
    getCalendarByHref,
    getDefaultCalendar,
    deleteCalendar: deleteCalendarByHref
  }
}
