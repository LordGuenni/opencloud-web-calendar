import { authenticatedFetch } from './auth'
import { CalDAVError } from './errors'

export type ShareType = 'token' | 'map' | 'all'

export interface Share {
  ShareType: ShareType
  PathOrToken: string
  PathMapped: string
  Owner: string
  User: string
  Permissions: string
  EnabledByOwner: boolean
  EnabledByUser: boolean
  HiddenByOwner: boolean
  HiddenByUser: boolean
  TimestampCreated: number
  TimestampUpdated: number
  Properties: Record<string, any>
  Actions: Record<string, any>
}

export interface ShareInfo {
  ApiVersion: number
  Status: string
  FeatureEnabledCollectionByMap: boolean
  PermittedCreateCollectionByMap: boolean
  FeatureEnabledCollectionByToken: boolean
  PermittedCreateCollectionByToken: boolean
  SupportedConversions: string[]
  PermittedPropertiesOverlay: boolean
  SupportedPropertiesOverlay: string[]
  SupportedActions: Record<string, any>
}

const SHARING_BASE = '/caldav/.sharing/v1'

async function sharingRequest<T>(hook: string, type: ShareType = 'all', data: any = {}): Promise<T> {
  const url = `${SHARING_BASE}/${type}/${hook}`
  const response = await authenticatedFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(data)
  })

  if (!response.ok) {
    throw new CalDAVError(`Sharing API request failed: ${response.statusText}`, response.status)
  }

  const result = await response.json()

  // Radicale returns 'not-found' for empty lists, treat it as a successful empty response
  if (result.Status === 'not-found') {
    return { ...result, Content: [] } as T
  }

  if (result.Status !== 'success') {
    throw new CalDAVError(`Sharing API error: ${result.Status}`)
  }

  return result as T
}

export async function getSharingInfo(): Promise<ShareInfo> {
  return await sharingRequest<ShareInfo>('info', 'all')
}

export async function listShares(type: ShareType = 'all', filter: { PathOrToken?: string; PathMapped?: string } = {}): Promise<Share[]> {
  const result = await sharingRequest<{ Content: Share[] }>('list', type, filter)
  return result.Content || []
}

export async function createShare(
  type: 'map' | 'token',
  data: {
    PathMapped: string
    PathOrToken?: string
    User?: string
    Permissions?: string
    Enabled?: boolean
    Hidden?: boolean
    Properties?: Record<string, any>
    Actions?: Record<string, any>
    Conversion?: string
  }
): Promise<{ PathOrToken: string }> {
  return await sharingRequest<{ PathOrToken: string }>('create', type, data)
}

export async function updateShare(
  type: 'map' | 'token',
  data: {
    PathOrToken: string
    PathMapped?: string
    User?: string
    Permissions?: string
    Enabled?: boolean
    Hidden?: boolean
    Properties?: Record<string, any>
    Actions?: Record<string, any>
  }
): Promise<void> {
  await sharingRequest<void>('update', type, data)
}

export async function deleteShare(type: 'map' | 'token', PathOrToken: string): Promise<void> {
  await sharingRequest<void>('delete', type, { PathOrToken })
}

export async function enableShare(type: 'map' | 'token', PathOrToken: string): Promise<void> {
  await sharingRequest<void>('enable', type, { PathOrToken })
}

export async function disableShare(type: 'map' | 'token', PathOrToken: string): Promise<void> {
  await sharingRequest<void>('disable', type, { PathOrToken })
}

export async function hideShare(type: 'map' | 'token', PathOrToken: string): Promise<void> {
  await sharingRequest<void>('hide', type, { PathOrToken })
}

export async function unhideShare(type: 'map' | 'token', PathOrToken: string): Promise<void> {
  await sharingRequest<void>('unhide', type, { PathOrToken })
}
