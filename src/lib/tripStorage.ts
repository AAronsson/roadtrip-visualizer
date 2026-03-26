import type { PersistedTripState, Waypoint } from '../types/trip'

const STORAGE_KEY = 'roadtrip-map-state-v1'

const emptyState = (): PersistedTripState => ({
  visitedWaypointIds: [],
  customWaypoints: [],
  removedDefaultIds: [],
})

export function loadPersistedState(): PersistedTripState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyState()
    const parsed = JSON.parse(raw) as Partial<PersistedTripState>
    return {
      visitedWaypointIds: Array.isArray(parsed.visitedWaypointIds)
        ? parsed.visitedWaypointIds.filter((x): x is string => typeof x === 'string')
        : [],
      customWaypoints: Array.isArray(parsed.customWaypoints)
        ? parsed.customWaypoints.filter(isWaypoint)
        : [],
      removedDefaultIds: Array.isArray(parsed.removedDefaultIds)
        ? parsed.removedDefaultIds.filter((x): x is string => typeof x === 'string')
        : [],
    }
  } catch {
    return emptyState()
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

export function savePersistedState(state: PersistedTripState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function clearPersistedState(): void {
  localStorage.removeItem(STORAGE_KEY)
}
