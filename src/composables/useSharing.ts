import { ref, computed } from 'vue'
import { getCalDAVClient, type Share } from '../caldav/client'
import { useUserProfiles } from './useUserProfiles'

export function useSharing(calendarHref: string) {
  const client = getCalDAVClient()
  const shares = ref<Share[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const { userProfiles, loadUserProfile, resolveUser } = useUserProfiles()

  const userShares = computed(() => shares.value.filter((s) => s.ShareType === 'map'))
  const tokenShares = computed(() => shares.value.filter((s) => s.ShareType === 'token'))

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
