import { ref } from 'vue'
import { getAccessToken } from '../caldav/auth'

const userProfiles = ref<Record<string, string>>({})

export function useUserProfiles() {
  async function loadUserProfile(userId: string): Promise<string> {
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

  return {
    userProfiles,
    loadUserProfile,
    resolveUser
  }
}
