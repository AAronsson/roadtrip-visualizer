import type { Waypoint } from '../types/trip'

/** Public OSRM demo — fair use; replace with your own OSRM for heavy traffic. */
const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving'

type OsrmResponse = {
  code: string
  routes?: Array<{
    geometry?: { type?: string; coordinates?: [number, number][] }
  }>
}

function appendSegment(
  merged: [number, number][],
  segment: [number, number][],
) {
  if (segment.length === 0) return
  if (merged.length === 0) {
    merged.push(...segment)
    return
  }
  const last = merged[merged.length - 1]
  const first = segment[0]
  if (last[0] === first[0] && last[1] === first[1]) {
    merged.push(...segment.slice(1))
  } else {
    merged.push(...segment)
  }
}

async function fetchOneLeg(
  a: Waypoint,
  b: Waypoint,
): Promise<[number, number][]> {
  const path = `${a.lng},${a.lat};${b.lng},${b.lat}`
  const url = `${OSRM_BASE}/${path}?overview=full&geometries=geojson`
  const res = await fetch(url)
  const data = (await res.json()) as OsrmResponse
  if (
    data.code === 'Ok' &&
    data.routes?.[0]?.geometry?.coordinates &&
    data.routes[0].geometry.coordinates.length >= 2
  ) {
    return data.routes[0].geometry.coordinates as [number, number][]
  }
  return [
    [a.lng, a.lat],
    [b.lng, b.lat],
  ]
}

async function fetchSegmentBySegment(
  waypoints: Waypoint[],
): Promise<[number, number][]> {
  const merged: [number, number][] = []
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i]
    const b = waypoints[i + 1]
    try {
      const seg = await fetchOneLeg(a, b)
      appendSegment(merged, seg)
    } catch {
      appendSegment(merged, [
        [a.lng, a.lat],
        [b.lng, b.lat],
      ])
    }
  }
  return merged
}

/**
 * Driving directions along the road network (OpenStreetMap via OSRM).
 * Falls back to straight segments when a leg cannot be routed (e.g. some ferry gaps).
 */
export async function fetchRoadRouteCoordinates(
  waypoints: Waypoint[],
): Promise<[number, number][]> {
  if (waypoints.length < 2) return []

  const coordStr = waypoints.map((w) => `${w.lng},${w.lat}`).join(';')
  const url = `${OSRM_BASE}/${coordStr}?overview=full&geometries=geojson`

  if (url.length > 7500) {
    return fetchSegmentBySegment(waypoints)
  }

  try {
    const res = await fetch(url)
    const data = (await res.json()) as OsrmResponse
    if (
      data.code === 'Ok' &&
      data.routes?.[0]?.geometry?.coordinates &&
      data.routes[0].geometry.coordinates.length >= 2
    ) {
      return data.routes[0].geometry.coordinates as [number, number][]
    }
  } catch {
    /* use per-leg routing */
  }

  return fetchSegmentBySegment(waypoints)
}
