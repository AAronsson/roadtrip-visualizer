import type { Waypoint } from '../types/trip'

function isWaypoint(x: unknown): x is Waypoint {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return (
    typeof o.id === 'string' &&
    typeof o.name === 'string' &&
    typeof o.lat === 'number' &&
    Number.isFinite(o.lat) &&
    typeof o.lng === 'number' &&
    Number.isFinite(o.lng) &&
    (o.countryCode === undefined || typeof o.countryCode === 'string')
  )
}

export type ParsedTripImport = {
  waypoints: Waypoint[]
  visitedWaypointIds: string[]
}

/** Accepts `trip.json` / export shape; optional `visitedWaypointIds` for device state. */
export function parseTripImportJson(data: unknown): ParsedTripImport {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid file: expected a JSON object.')
  }
  const o = data as Record<string, unknown>
  if (!Array.isArray(o.waypoints)) {
    throw new Error('Invalid file: missing "waypoints" array.')
  }
  const waypoints = o.waypoints.filter(isWaypoint)
  if (waypoints.length === 0) {
    throw new Error('Invalid file: no valid waypoints.')
  }
  let visitedWaypointIds: string[] = []
  if (Array.isArray(o.visitedWaypointIds)) {
    visitedWaypointIds = o.visitedWaypointIds.filter(
      (x): x is string => typeof x === 'string',
    )
  }
  return { waypoints, visitedWaypointIds }
}
