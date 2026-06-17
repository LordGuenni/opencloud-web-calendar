import { reactive } from 'vue'
import { getAccessToken } from '../caldav/auth'

const userProfiles = reactive<Record<string, string>>({})

export function useUserProfiles() {
  function cleanUserId(id: string): string {
    if (!id) return id
    // If it's a URL or path, get the last segment
    if (id.includes('/')) {
      const segments = id.split('/').filter(Boolean)
      // For principal URLs like /caldav/user/, segments are ['caldav', 'user']
      // We want the last one, unless it's 'caldav'
      if (segments.length > 1 && segments[0] === 'caldav') {
        return segments[1]
      }
      return segments.pop() || id
    }
    return id
  }

  async function loadUserProfile(userId: string): Promise<string> {
    const cleanedId = cleanUserId(userId)
    if (userProfiles[cleanedId]) return userProfiles[cleanedId]
    if (userProfiles[userId]) return userProfiles[userId]

    try {
      const token = getAccessToken()
      if (!token) return cleanedId

      const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : ''

      // Try direct ID lookup first
      const url = `${origin}/graph/v1.0/users/${cleanedId}`
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json'
        }
      })

      if (response.ok) {
        const user = await response.json()
        const name = user.displayName || user.onPremisesSamAccountName || cleanedId
        userProfiles[cleanedId] = name
        userProfiles[userId] = name
        return name
      }

      // Fallback: search by ID/username
      const searchUrl = `${origin}/graph/v1.0/users?$search=${encodeURIComponent('"' + cleanedId + '"')}`
      const searchResponse = await fetch(searchUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json'
        }
      })

      if (searchResponse.ok) {
        const data = await searchResponse.json()
        const user = data.value?.find((u: any) => u.id === cleanedId || u.onPremisesSamAccountName === cleanedId || u.mail === cleanedId) || data.value?.[0]
        if (user) {
          const name = user.displayName || user.onPremisesSamAccountName || cleanedId
          userProfiles[cleanedId] = name
          userProfiles[userId] = name
          return name
        }
      }
    } catch {
      // Silently fail and use UUID
    }
    return cleanedId
  }

  async function resolveUser(userIdOrEmail: string): Promise<string> {
    // If it already looks like a UUID, just return it
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userIdOrEmail)) {
      return userIdOrEmail
    }

    const token = getAccessToken()
    if (!token) throw new Error('Not authenticated')

    const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : ''
    const url = `${origin}/graph/v1.0/users?$search=${encodeURIComponent('"' + userIdOrEmail + '"')}`

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
      userProfiles[exactMatch.id] = exactMatch.displayName || exactMatch.onPremisesSamAccountName || exactMatch.id
      return exactMatch.id
    }

    if (users.length > 0 && users[0].id) {
      userProfiles[users[0].id] = users[0].displayName || users[0].onPremisesSamAccountName || users[0].id
      return users[0].id
    }

    throw new Error(`User not found: ${userIdOrEmail}`)
  }

  return {
    userProfiles,
    loadUserProfile,
    resolveUser,
    cleanUserId
  }
}
