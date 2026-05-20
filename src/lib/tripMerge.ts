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

/**
 * Public view hides preliminary (priority 3) stops that are not yet visited.
 * Visited preliminary stops are shown (they are confirmed by visit).
 */
export function waypointsForPublicView(
  waypoints: Waypoint[],
  visitedWaypointIds: string[],
): Waypoint[] {
  const visited = new Set(visitedWaypointIds)
  return waypoints.filter((w) => w.priority !== 3 || visited.has(w.id))
}

/**
 * 3-way merge of persisted trip state. Lets two keyed devices change different
 * fields without overwriting each other.
 *
 * Conceptually: take the latest `server` state, then re-apply each device-local
 * change (vs the last known `baseline` snapshot) on top.
 */
export function mergePersistedStates(
  server: PersistedTripState,
  baseline: PersistedTripState,
  local: PersistedTripState,
): PersistedTripState {
  return {
    visitedWaypointIds: mergeIdList(
      server.visitedWaypointIds,
      baseline.visitedWaypointIds,
      local.visitedWaypointIds,
    ),
    removedDefaultIds: mergeIdList(
      server.removedDefaultIds,
      baseline.removedDefaultIds,
      local.removedDefaultIds,
    ),
    customWaypoints: mergeCustomWaypoints(
      server.customWaypoints,
      baseline.customWaypoints,
      local.customWaypoints,
    ),
  }
}

function mergeIdList(
  server: string[],
  baseline: string[],
  local: string[],
): string[] {
  const baselineSet = new Set(baseline)
  const localSet = new Set(local)
  const added = local.filter((id) => !baselineSet.has(id))
  const removed = baseline.filter((id) => !localSet.has(id))
  const result = new Set(server)
  for (const id of added) result.add(id)
  for (const id of removed) result.delete(id)
  return [...result]
}

function mergeCustomWaypoints(
  server: Waypoint[],
  baseline: Waypoint[],
  local: Waypoint[],
): Waypoint[] {
  const baselineIds = new Set(baseline.map((w) => w.id))
  const localIds = new Set(local.map((w) => w.id))
  const addedLocal = local.filter((w) => !baselineIds.has(w.id))
  const removedLocally = [...baselineIds].filter((id) => !localIds.has(id))

  const byId = new Map<string, Waypoint>()
  for (const w of server) byId.set(w.id, w)
  for (const w of addedLocal) byId.set(w.id, w)
  for (const id of removedLocally) byId.delete(id)
  return [...byId.values()]
}
