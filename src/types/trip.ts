export type Waypoint = {
  id: string
  name: string
  /** Latitude (WGS84) */
  lat: number
  /** Longitude (WGS84) */
  lng: number
  /** ISO 3166-1 alpha-2; optional, used for flags */
  countryCode?: string
  /**
   * Optional planning priority:
   *  0 = mandatory (start/end, ferries)
   *  1 = primary goal
   *  2 = highly desired
   *  3 = if it fits / transit
   */
  priority?: 0 | 1 | 2 | 3
  /** YYYY-MM-DD — fixed/locked date we sleep here (e.g. ferry crossings). */
  date?: string
  /** YYYY-MM-DD — preliminary planned date (first night if multi-night stay). */
  plannedDate?: string
  /** YYYY-MM-DD — must visit by this date at the latest. */
  latestDate?: string
}

export type TripFile = {
  waypoints: Waypoint[]
}

export type PersistedTripState = {
  visitedWaypointIds: string[]
  /** Stops added in the app (not in the last loaded default file) */
  customWaypoints: Waypoint[]
  /** IDs from trip.json that the user removed on this device */
  removedDefaultIds: string[]
}
