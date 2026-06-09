import { ref, computed } from 'vue'
import { getCalDAVClient, type Share } from '../caldav/client'
import { getAccessToken } from '../caldav/auth'

export function useSharing(calendarHref: string) {
  const client = getCalDAVClient()
  const shares = ref<Share[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Cache for resolved user profiles (UUID -> display name)
  const userProfiles = ref<Record<string, string>>({})

  const userShares = computed(() => shares.value.filter((s) => s.ShareType === 'map'))
  const tokenShares = computed(() => shares.value.filter((s) => s.ShareType === 'token'))

  async function resolveUser(userIdOrEmail: string): Promise<string> {
    // If it already looks like a UUID, just return it
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userIdOrEmail)) {
      return userIdOrEmail
    }

    const token = getAccessToken()
    if (!token) throw new Error('Not authenticated')

    const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : ''
    const url = `${origin}/graph/v1.0/users?$search=${encodeURIComponent(userIdOrEmail)}`

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to lookup user: ${response.statusText}`)
    }

    const data = await response.json()
    const users = data.value || []

    // Try to find exact match on username or mail
    const exactMatch = users.find((u: any) =>
      u.onPremisesSamAccountName === userIdOrEmail ||
      u.mail === userIdOrEmail ||
      u.displayName === userIdOrEmail
    )

    if (exactMatch && exactMatch.id) {
      userProfiles.value[exactMatch.id] = exactMatch.displayName || exactMatch.onPremisesSamAccountName || exactMatch.id
      return exactMatch.id
    }

    if (users.length > 0 && users[0].id) {
      userProfiles.value[users[0].id] = users[0].displayName || users[0].onPremisesSamAccountName || users[0].id
      return users[0].id
    }

    throw new Error(`User not found: ${userIdOrEmail}`)
  }

  async function loadUserProfile(userId: string) {
    if (userProfiles.value[userId]) return userProfiles.value[userId]

    try {
      const token = getAccessToken()
      if (!token) return userId

      const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : ''
      const url = `${origin}/graph/v1.0/users/${userId}`

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json'
        }
      })

      if (response.ok) {
        const user = await response.json()
        userProfiles.value[userId] = user.displayName || user.onPremisesSamAccountName || userId
        return userProfiles.value[userId]
      }
    } catch {
      // Silently fail and use UUID
    }
    return userId
  }

  async function fetchShares() {
    loading.value = true
    error.value = null
    try {
      // Radicale sharing API uses path without /caldav/ prefix for PathMapped
      const internalPath = calendarHref.startsWith('/caldav/') ? calendarHref.slice(7) : calendarHref
      shares.value = await client.listShares('all', { PathMapped: internalPath })

      // Load user profiles for all map shares
      for (const share of shares.value) {
        if (share.ShareType === 'map' && share.User) {
          loadUserProfile(share.User)
        }
      }
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function shareWithUser(userIdOrEmail: string, permissions: string = 'r') {
    loading.value = true
    error.value = null
    try {
      const resolvedUserId = await resolveUser(userIdOrEmail)

      const internalPath = calendarHref.startsWith('/caldav/') ? calendarHref.slice(7) : calendarHref
      const pathParts = internalPath.split('/').filter(Boolean)
      const calendarName = pathParts.length > 0 ? pathParts[pathParts.length - 1] : 'shared-calendar'

      await client.createShare('map', {
        PathMapped: internalPath,
        User: resolvedUserId,
        Permissions: permissions,
        Enabled: true,
        Hidden: false,
        PathOrToken: `/${resolvedUserId}/${calendarName}-shared/`
      })
      await fetchShares()
    } catch (e: any) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function createPublicLink(permissions: string = 'r') {
    loading.value = true
    error.value = null
    try {
      const internalPath = calendarHref.startsWith('/caldav/') ? calendarHref.slice(7) : calendarHref
      await client.createShare('token', {
        PathMapped: internalPath,
        Permissions: permissions,
        Enabled: true,
        Hidden: false
      })
      await fetchShares()
    } catch (e: any) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function removeShare(share: Share) {
    loading.value = true
    error.value = null
    try {
      const type = share.ShareType as 'map' | 'token'
      await client.deleteShare(type, share.PathOrToken)
      await fetchShares()
    } catch (e: any) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function updatePermissions(share: Share, permissions: string) {
    loading.value = true
    error.value = null
    try {
      const type = share.ShareType as 'map' | 'token'
      await client.updateShare(type, {
        PathOrToken: share.PathOrToken,
        Permissions: permissions
      })
      await fetchShares()
    } catch (e: any) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  return {
    shares,
    userShares,
    tokenShares,
    userProfiles,
    loading,
    error,
    fetchShares,
    shareWithUser,
    createPublicLink,
    removeShare,
    updatePermissions
  }
}
