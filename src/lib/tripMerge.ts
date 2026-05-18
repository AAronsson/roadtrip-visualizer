import type { PersistedTripState, TripFile, Waypoint } from '../types/trip'

/**
 * Merges canonical `trip.json` waypoints with per-device persistence.
 */
export function mergeTripWaypoints(
  file: TripFile,
  persisted: PersistedTripState,
): Waypoint[] {
  const removed = new Set(persisted.removedDefaultIds)
  const defaultsKept = file.waypoints.filter((w) => !removed.has(w.id))
  const keptDefaultIds = new Set(defaultsKept.map((w) => w.id))
  /** Omit customs that duplicate a default that is still shown (avoid two pins). */
  const custom = persisted.customWaypoints.filter((c) => !keptDefaultIds.has(c.id))
  return [...defaultsKept, ...custom]
}

export function isVisited(waypointId: string, persisted: PersistedTripState): boolean {
  return persisted.visitedWaypointIds.includes(waypointId)
}

const KEEP_WHEN_VISITED = new Set(['fjugesta', 'fjugesta-return'])

/** Hide visited stops from map/list/route, but always keep Fjugesta. */
export function waypointsHidingVisited(
  waypoints: Waypoint[],
  visitedWaypointIds: string[],
): Waypoint[] {
  const visited = new Set(visitedWaypointIds)
  return waypoints.filter((w) => KEEP_WHEN_VISITED.has(w.id) || !visited.has(w.id))
}
