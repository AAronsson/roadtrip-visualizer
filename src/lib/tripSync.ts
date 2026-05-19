import type { LiveTripState, PersistedTripState, Waypoint } from '../types/trip'

const liveStateUrl = import.meta.env.VITE_LIVE_STATE_URL?.trim() || ''
const syncApiUrl = import.meta.env.VITE_TRIP_SYNC_API_URL?.trim() || ''

export function isCloudSyncEnabled(): boolean {
  return liveStateUrl.length > 0
}

export function getWriteKeyFromUrl(): string | null {
  const key = new URLSearchParams(window.location.search).get('key')?.trim()
  return key || null
}

export function canWriteCloud(): boolean {
  return Boolean(syncApiUrl && getWriteKeyFromUrl())
}

export function isViewOnlyCloud(): boolean {
  return isCloudSyncEnabled() && !canWriteCloud()
}

export async function fetchLiveTripState(): Promise<LiveTripState | null> {
  if (!liveStateUrl) return null
  const res = await fetch(liveStateUrl, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Could not load shared trip (${res.status})`)
  const data = (await res.json()) as Partial<LiveTripState>
  return normalizeLiveState(data)
}

export async function saveLiveTripState(
  persisted: PersistedTripState,
  position: { lat: number; lng: number } | null,
): Promise<void> {
  const writeKey = getWriteKeyFromUrl()
  if (!syncApiUrl || !writeKey) {
    throw new Error('Missing save URL or ?key= in the address bar')
  }

  const body: LiveTripState = {
    visitedWaypointIds: persisted.visitedWaypointIds,
    customWaypoints: persisted.customWaypoints,
    removedDefaultIds: persisted.removedDefaultIds,
  }
  if (position) {
    body.position = { ...position, at: new Date().toISOString() }
  }

  const res = await fetch(syncApiUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Write-Key': writeKey,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `Save failed (${res.status})`)
  }
}

function normalizeLiveState(data: Partial<LiveTripState>): LiveTripState {
  return {
    visitedWaypointIds: Array.isArray(data.visitedWaypointIds)
      ? data.visitedWaypointIds.filter((x): x is string => typeof x === 'string')
      : [],
    customWaypoints: Array.isArray(data.customWaypoints)
      ? data.customWaypoints.filter(isWaypoint)
      : [],
    removedDefaultIds: Array.isArray(data.removedDefaultIds)
      ? data.removedDefaultIds.filter((x): x is string => typeof x === 'string')
      : [],
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
    position:
      data.position &&
      typeof data.position.lat === 'number' &&
      typeof data.position.lng === 'number'
        ? {
            lat: data.position.lat,
            lng: data.position.lng,
            at: typeof data.position.at === 'string' ? data.position.at : '',
          }
        : undefined,
  }
}

function isWaypoint(x: unknown): x is Waypoint {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return (
    typeof o.id === 'string' &&
    typeof o.name === 'string' &&
    typeof o.lat === 'number' &&
    typeof o.lng === 'number' &&
    (o.countryCode === undefined || typeof o.countryCode === 'string')
  )
}

export function liveStateToPersisted(live: LiveTripState): PersistedTripState {
  return {
    visitedWaypointIds: live.visitedWaypointIds,
    customWaypoints: live.customWaypoints,
    removedDefaultIds: live.removedDefaultIds,
  }
}
