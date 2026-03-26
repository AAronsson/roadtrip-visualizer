import type { PersistedTripState, TripFile, Waypoint } from '../types/trip'

/**
 * Merges canonical `trip.json` waypoints with per-device persistence.
 */
export function mergeTripWaypoints(
  file: TripFile,
  persisted: PersistedTripState,
): Waypoint[] {
  const defaultById = new Map(file.waypoints.map((w) => [w.id, w]))
  const removed = new Set(persisted.removedDefaultIds)
  const defaultsKept = file.waypoints.filter((w) => !removed.has(w.id))
  const custom = persisted.customWaypoints.filter((c) => !defaultById.has(c.id))
  return [...defaultsKept, ...custom]
}

export function isVisited(waypointId: string, persisted: PersistedTripState): boolean {
  return persisted.visitedWaypointIds.includes(waypointId)
}
