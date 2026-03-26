export type Waypoint = {
  id: string
  name: string
  /** Latitude (WGS84) */
  lat: number
  /** Longitude (WGS84) */
  lng: number
  /** ISO 3166-1 alpha-2; optional, used for flags */
  countryCode?: string
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
