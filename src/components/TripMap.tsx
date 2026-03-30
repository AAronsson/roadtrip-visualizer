import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { annotateCountryFills } from '../lib/countryFill'
import { fetchStyleJsonWithMercator } from '../lib/ensureStyleMercator'
import type { BasemapInfo } from '../lib/mapStyle'
import type { FeatureCollection } from 'geojson'
import type { Waypoint } from '../types/trip'

const EUROPE_BOUNDS: maplibregl.LngLatBoundsLike = [
  [-32, 35],
  [48, 72],
]

function buildWaypointsGeoJSON(
  waypoints: Waypoint[],
  visitedIds: Set<string>,
  selectedId: string | null,
) {
  return {
    type: 'FeatureCollection' as const,
    features: waypoints.map((w) => ({
      type: 'Feature' as const,
      properties: {
        id: w.id,
        name: w.name,
        shortName: w.name.length > 16 ? `${w.name.slice(0, 14)}…` : w.name,
        visited: visitedIds.has(w.id),
        selected: w.id === selectedId,
      },
      geometry: { type: 'Point' as const, coordinates: [w.lng, w.lat] },
    })),
  }
}

function buildRouteGeoJSON(coords: [number, number][]) {
  if (coords.length < 2) {
    return { type: 'FeatureCollection' as const, features: [] }
  }
  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        properties: {},
        geometry: {
          type: 'LineString' as const,
          coordinates: coords,
        },
      },
    ],
  }
}

function applyTerrainIfPresent(map: maplibregl.Map) {
  type StyleWithTerrain = {
    terrain?: { source: string; exaggeration?: number }
  }
  const terrain = (map.getStyle() as StyleWithTerrain).terrain
  if (terrain?.source) {
    map.setTerrain({
      source: terrain.source,
      exaggeration: terrain.exaggeration ?? 1.15,
    })
  }
}

type TripMapProps = {
  basemap: BasemapInfo
  waypoints: Waypoint[]
  /** Polyline in map order [lng, lat]; from OSRM or straight fallback. */
  routeLineCoordinates: [number, number][]
  visitedWaypointIds: string[]
  selectedWaypointId: string | null
  onSelectWaypoint: (id: string | null) => void
  userPosition: { lng: number; lat: number } | null
  /** Increment from parent to fly the map to `userPosition`. */
  recenterOnUserKey: number
}

export function TripMap({
  basemap,
  waypoints,
  routeLineCoordinates,
  visitedWaypointIds,
  selectedWaypointId,
  onSelectWaypoint,
  userPosition,
  recenterOnUserKey,
}: TripMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markerRef = useRef<maplibregl.Marker | null>(null)
  const onSelectRef = useRef(onSelectWaypoint)
  const waypointsRef = useRef(waypoints)
  const visitedRef = useRef(visitedWaypointIds)
  const selectedRef = useRef(selectedWaypointId)
  const userPositionRef = useRef(userPosition)
  const routeCoordsRef = useRef(routeLineCoordinates)

  useEffect(() => {
    onSelectRef.current = onSelectWaypoint
  }, [onSelectWaypoint])

  useEffect(() => {
    waypointsRef.current = waypoints
    visitedRef.current = visitedWaypointIds
    selectedRef.current = selectedWaypointId
    routeCoordsRef.current = routeLineCoordinates
  }, [waypoints, visitedWaypointIds, selectedWaypointId, routeLineCoordinates])

  useEffect(() => {
    userPositionRef.current = userPosition
  }, [userPosition])

  const syncTripData = () => {
    const map = mapRef.current
    if (!map?.isStyleLoaded()) return
    const wpSource = map.getSource('trip-waypoints') as
      | maplibregl.GeoJSONSource
      | undefined
    const routeSource = map.getSource('trip-route') as
      | maplibregl.GeoJSONSource
      | undefined
    if (!wpSource || !routeSource) return
    wpSource.setData(
      buildWaypointsGeoJSON(
        waypointsRef.current,
        new Set(visitedRef.current),
        selectedRef.current,
      ),
    )
    routeSource.setData(buildRouteGeoJSON(routeCoordsRef.current))
  }

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    let map: maplibregl.Map | null = null
    let cancelled = false

    void (async () => {
      let style: maplibregl.MapOptions['style'] = basemap.styleUrl
      try {
        style = await fetchStyleJsonWithMercator(basemap.styleUrl)
      } catch {
        /* offline or blocked: fall back to URL (may still error on some styles) */
      }

      if (cancelled) return

      map = new maplibregl.Map({
        container: el,
        style,
        center: [12, 54],
        zoom: 4.25,
        maxBounds: EUROPE_BOUNDS,
        minZoom: 3,
        maxZoom: 18,
      })

      if (cancelled) {
        map.remove()
        return
      }

      const mapInstance = map
      mapInstance.addControl(new maplibregl.NavigationControl(), 'top-right')
      mapInstance.addControl(
        new maplibregl.ScaleControl({ maxWidth: 120 }),
        'bottom-left',
      )
      mapRef.current = mapInstance

      mapInstance.on('load', () => {
      if (basemap.hasTerrainHint) {
        applyTerrainIfPresent(mapInstance)
      }

      const styleLayers = mapInstance.getStyle().layers ?? []
      const beforeSymbolId = styleLayers.find((l) => l.type === 'symbol')?.id

      void (async () => {
        try {
          const res = await fetch(
            `${import.meta.env.BASE_URL}europe-countries.geojson`,
          )
          const raw = (await res.json()) as FeatureCollection
          const data = annotateCountryFills(raw)
          if (mapInstance.getSource('trip-europe-countries')) return
          mapInstance.addSource('trip-europe-countries', { type: 'geojson', data })
          mapInstance.addLayer(
            {
              id: 'trip-europe-fills',
              type: 'fill',
              source: 'trip-europe-countries',
              paint: {
                'fill-color': ['get', 'tripFill'],
                'fill-opacity': 0.42,
              },
            },
            beforeSymbolId,
          )
          mapInstance.addLayer(
            {
              id: 'trip-europe-outlines',
              type: 'line',
              source: 'trip-europe-countries',
              paint: {
                'line-color': 'rgba(55,48,40,0.35)',
                'line-width': 0.65,
              },
            },
            beforeSymbolId,
          )
        } catch {
          /* optional layer */
        }
      })()

      mapInstance.addSource('trip-route', {
        type: 'geojson',
        data: buildRouteGeoJSON(routeCoordsRef.current),
      })
      mapInstance.addSource('trip-waypoints', {
        type: 'geojson',
        data: buildWaypointsGeoJSON(
          waypointsRef.current,
          new Set(visitedRef.current),
          selectedRef.current,
        ),
      })

      mapInstance.addLayer({
        id: 'trip-route-line',
        type: 'line',
        source: 'trip-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#b45309',
          'line-width': 4,
          'line-opacity': 0.88,
        },
      })
      mapInstance.addLayer({
        id: 'trip-waypoints-circle',
        type: 'circle',
        source: 'trip-waypoints',
        paint: {
          'circle-radius': 10,
          'circle-color': [
            'case',
            ['get', 'visited'],
            '#15803d',
            '#1d4ed8',
          ],
          'circle-stroke-width': [
            'case',
            ['get', 'selected'],
            4,
            2,
          ],
          'circle-stroke-color': '#ffffff',
        },
      })
      mapInstance.addLayer({
        id: 'trip-waypoints-label',
        type: 'symbol',
        source: 'trip-waypoints',
        layout: {
          'text-field': ['get', 'shortName'],
          'text-size': 11,
          'text-offset': [0, 1.45],
          'text-anchor': 'top',
          'text-max-width': 9,
        },
        paint: {
          'text-color': '#0f172a',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.25,
        },
      })

      const onWaypointClick = (e: maplibregl.MapLayerMouseEvent) => {
        e.originalEvent.stopPropagation()
        const id = e.features?.[0]?.properties?.id
        if (typeof id === 'string') onSelectRef.current(id)
      }
      mapInstance.on('click', 'trip-waypoints-circle', onWaypointClick)
      mapInstance.on('mouseenter', 'trip-waypoints-circle', () => {
        mapInstance.getCanvas().style.cursor = 'pointer'
      })
      mapInstance.on('mouseleave', 'trip-waypoints-circle', () => {
        mapInstance.getCanvas().style.cursor = ''
      })

      syncTripData()

      const pos = userPositionRef.current
      if (pos) {
        markerRef.current = new maplibregl.Marker({ color: '#dc2626' })
          .setLngLat([pos.lng, pos.lat])
          .addTo(mapInstance)
      }
    })
    })()

    return () => {
      cancelled = true
      markerRef.current?.remove()
      markerRef.current = null
      map?.remove()
      mapRef.current = null
    }
  }, [basemap.styleUrl, basemap.hasTerrainHint])

  useEffect(() => {
    syncTripData()
  }, [waypoints, visitedWaypointIds, selectedWaypointId, routeLineCoordinates])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.isStyleLoaded()) return

    if (!userPosition) {
      markerRef.current?.remove()
      markerRef.current = null
      return
    }

    const { lng, lat } = userPosition
    if (!markerRef.current) {
      markerRef.current = new maplibregl.Marker({ color: '#dc2626' })
        .setLngLat([lng, lat])
        .addTo(map)
    } else {
      markerRef.current.setLngLat([lng, lat])
    }
  }, [userPosition])

  useEffect(() => {
    if (recenterOnUserKey === 0) return
    const pos = userPositionRef.current
    if (!pos) return
    const map = mapRef.current
    if (!map?.isStyleLoaded()) return
    map.flyTo({
      center: [pos.lng, pos.lat],
      zoom: Math.max(map.getZoom(), 8),
      essential: true,
    })
  }, [recenterOnUserKey])

  return (
    <div
      ref={containerRef}
      className="trip-map-canvas"
      role="application"
      aria-label="Roadtrip map"
    />
  )
}
