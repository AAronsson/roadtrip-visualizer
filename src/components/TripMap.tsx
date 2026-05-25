import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { fetchStyleJsonWithMercator } from '../lib/ensureStyleMercator'
import type { BasemapInfo } from '../lib/mapStyle'
import { addTripPoiLayers, TRIP_POI_LAYER_IDS, poiSubclassLabel } from '../lib/tripPois'
import type { RouteSegment, Waypoint } from '../types/trip'

const EUROPE_BOUNDS: maplibregl.LngLatBoundsLike = [
  [-32, 35],
  [48, 72],
]

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildPoiPopupHtml(
  name: string | undefined,
  subclass: string | undefined,
  lng: number,
  lat: number,
): string {
  const typeLabel = poiSubclassLabel(subclass)
  const displayName = name && name.trim() ? name : typeLabel
  const gmaps = `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`
  return `
    <div class="trip-poi-popup">
      <div class="trip-poi-popup__name">${escapeHtml(displayName)}</div>
      <div class="trip-poi-popup__type">${escapeHtml(typeLabel)}</div>
      <div class="trip-poi-popup__links">
        <a href="${gmaps}" target="_blank" rel="noopener noreferrer">Google Maps</a>
      </div>
    </div>
  `
}

function buildWaypointsGeoJSON(
  waypoints: Waypoint[],
  visitedIds: Set<string>,
  selectedId: string | null,
) {
  const features = waypoints.map((w) => ({
    type: 'Feature' as const,
    properties: {
      id: w.id,
      name: w.name,
      shortName: w.name.length > 16 ? `${w.name.slice(0, 14)}…` : w.name,
      visited: visitedIds.has(w.id),
      selected: w.id === selectedId,
      preliminary: w.priority === 3,
    },
    geometry: { type: 'Point' as const, coordinates: [w.lng, w.lat] },
  }))

  // Draw order is source order: last drawn = on top. Put preliminary at the
  // bottom, visited above normal, and the selected stop above everything so
  // duplicate-coordinate stops (e.g. malmo / malmo-return) reveal the green
  // pin when one of them is visited.
  const score = (p: (typeof features)[number]['properties']) =>
    p.selected ? 3 : p.visited ? 2 : p.preliminary ? 0 : 1
  features.sort((a, b) => score(a.properties) - score(b.properties))

  return { type: 'FeatureCollection' as const, features }
}

function buildRouteGeoJSON(segments: RouteSegment[]) {
  const features = segments
    .filter((s) => s.coords.length >= 2)
    .map((s) => ({
      type: 'Feature' as const,
      properties: { visited: s.visited },
      geometry: {
        type: 'LineString' as const,
        coordinates: s.coords,
      },
    }))
  // Draw visited (green) segments on top so they're not hidden by overlapping
  // unvisited legs (e.g. shared road between malmo and malmo-return).
  features.sort((a, b) => Number(a.properties.visited) - Number(b.properties.visited))
  return { type: 'FeatureCollection' as const, features }
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
  /** Per-leg route polylines from OSRM (or straight fallback), with visited flag. */
  routeSegments: RouteSegment[]
  visitedWaypointIds: string[]
  selectedWaypointId: string | null
  onSelectWaypoint: (id: string | null) => void
  userPosition: { lng: number; lat: number } | null
  /** Increment from parent to fly the map to `userPosition`. */
  recenterOnUserKey: number
  /** When true, clicks on empty map areas drop a pending pin. */
  addModeActive?: boolean
  /** Temporary pin placed during add-mode. */
  pendingPin?: { lng: number; lat: number } | null
  /** Called with the clicked lngLat when user taps the map in add-mode. */
  onMapTapInAddMode?: (lngLat: { lng: number; lat: number }) => void
  /** Called when the user taps the pending pin marker. */
  onPendingPinTap?: () => void
}

export function TripMap({
  basemap,
  waypoints,
  routeSegments,
  visitedWaypointIds,
  selectedWaypointId,
  onSelectWaypoint,
  userPosition,
  recenterOnUserKey,
  addModeActive = false,
  pendingPin = null,
  onMapTapInAddMode,
  onPendingPinTap,
}: TripMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markerRef = useRef<maplibregl.Marker | null>(null)
  const pendingMarkerRef = useRef<maplibregl.Marker | null>(null)
  const onSelectRef = useRef(onSelectWaypoint)
  const waypointsRef = useRef(waypoints)
  const visitedRef = useRef(visitedWaypointIds)
  const selectedRef = useRef(selectedWaypointId)
  const userPositionRef = useRef(userPosition)
  const routeSegmentsRef = useRef(routeSegments)
  const addModeRef = useRef(addModeActive)
  const onMapTapRef = useRef(onMapTapInAddMode)
  const onPendingPinTapRef = useRef(onPendingPinTap)

  useEffect(() => {
    onSelectRef.current = onSelectWaypoint
  }, [onSelectWaypoint])

  useEffect(() => {
    addModeRef.current = addModeActive
    onMapTapRef.current = onMapTapInAddMode
    onPendingPinTapRef.current = onPendingPinTap
    const canvas = mapRef.current?.getCanvas()
    if (canvas) canvas.style.cursor = addModeActive ? 'crosshair' : ''
  }, [addModeActive, onMapTapInAddMode, onPendingPinTap])

  useEffect(() => {
    waypointsRef.current = waypoints
    visitedRef.current = visitedWaypointIds
    selectedRef.current = selectedWaypointId
    routeSegmentsRef.current = routeSegments
  }, [waypoints, visitedWaypointIds, selectedWaypointId, routeSegments])

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
    routeSource.setData(buildRouteGeoJSON(routeSegmentsRef.current))
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

      addTripPoiLayers(mapInstance)

      for (const layerId of TRIP_POI_LAYER_IDS) {
        mapInstance.on('click', layerId, (e) => {
          if (addModeRef.current) return
          const feature = e.features?.[0]
          if (!feature || feature.geometry.type !== 'Point') return
          e.originalEvent.stopPropagation()
          const [lng, lat] = feature.geometry.coordinates as [number, number]
          const props = (feature.properties ?? {}) as Record<string, unknown>
          const name = typeof props.name === 'string' ? props.name : undefined
          const subclass = typeof props.subclass === 'string' ? props.subclass : undefined
          new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: '240px' })
            .setLngLat([lng, lat])
            .setHTML(buildPoiPopupHtml(name, subclass, lng, lat))
            .addTo(mapInstance)
        })
        mapInstance.on('mouseenter', layerId, () => {
          if (!addModeRef.current) mapInstance.getCanvas().style.cursor = 'pointer'
        })
        mapInstance.on('mouseleave', layerId, () => {
          mapInstance.getCanvas().style.cursor = addModeRef.current ? 'crosshair' : ''
        })
      }

      mapInstance.addSource('trip-route', {
        type: 'geojson',
        data: buildRouteGeoJSON(routeSegmentsRef.current),
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
          'line-color': [
            'case',
            ['get', 'visited'],
            '#15803d',
            '#b45309',
          ],
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
          'circle-opacity': [
            'case',
            ['get', 'visited'],
            1,
            ['get', 'preliminary'],
            0.55,
            1,
          ],
          'circle-stroke-opacity': [
            'case',
            ['get', 'visited'],
            1,
            ['get', 'preliminary'],
            0.55,
            1,
          ],
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
          'text-opacity': [
            'case',
            ['get', 'visited'],
            1,
            ['get', 'preliminary'],
            0.6,
            1,
          ],
        },
      })

      const onWaypointClick = (e: maplibregl.MapLayerMouseEvent) => {
        e.originalEvent.stopPropagation()
        if (addModeRef.current) {
          // Clicking an existing waypoint in add-mode cancels add-mode and selects the waypoint
          const id = e.features?.[0]?.properties?.id
          if (typeof id === 'string') onSelectRef.current(id)
          // Parent will handle cancelling add-mode via onSelectWaypoint side-effect
          return
        }
        const id = e.features?.[0]?.properties?.id
        if (typeof id === 'string') onSelectRef.current(id)
      }
      mapInstance.on('click', 'trip-waypoints-circle', onWaypointClick)
      mapInstance.on('mouseenter', 'trip-waypoints-circle', () => {
        if (!addModeRef.current) mapInstance.getCanvas().style.cursor = 'pointer'
      })
      mapInstance.on('mouseleave', 'trip-waypoints-circle', () => {
        mapInstance.getCanvas().style.cursor = addModeRef.current ? 'crosshair' : ''
      })
      mapInstance.on('click', (e) => {
        if (!addModeRef.current) return
        const features = mapInstance.queryRenderedFeatures(e.point, {
          layers: ['trip-waypoints-circle'],
        })
        if (features.length > 0) return // handled by waypoint click
        onMapTapRef.current?.({ lng: e.lngLat.lng, lat: e.lngLat.lat })
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
      pendingMarkerRef.current?.remove()
      pendingMarkerRef.current = null
      map?.remove()
      mapRef.current = null
    }
  }, [basemap.styleUrl, basemap.hasTerrainHint])

  useEffect(() => {
    syncTripData()
  }, [waypoints, visitedWaypointIds, selectedWaypointId, routeSegments])

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

  useEffect(() => {
    const map = mapRef.current
    if (!map?.isStyleLoaded()) {
      // Wait until style is loaded, then try again via the existing syncTripData pattern.
      // pendingPin is re-evaluated on every render so it will self-correct.
      return
    }

    if (!pendingPin) {
      pendingMarkerRef.current?.remove()
      pendingMarkerRef.current = null
      return
    }

    const { lng, lat } = pendingPin
    if (!pendingMarkerRef.current) {
      const marker = new maplibregl.Marker({ color: '#f59e0b' })
        .setLngLat([lng, lat])
        .addTo(map)
      const el = marker.getElement()
      el.style.cursor = 'pointer'
      el.title = 'Tap för att namnge och spara'
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        onPendingPinTapRef.current?.()
      })
      pendingMarkerRef.current = marker
    } else {
      pendingMarkerRef.current.setLngLat([lng, lat])
    }
  }, [pendingPin])

  return (
    <div
      ref={containerRef}
      className="trip-map-canvas"
      role="application"
      aria-label="Roadtrip map"
    />
  )
}
