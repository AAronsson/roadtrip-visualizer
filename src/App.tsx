import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TripMap } from './components/TripMap'
import { ViewerControls } from './components/ViewerControls'
import { WaypointDrawer } from './components/WaypointDrawer'
import { ItineraryView } from './components/ItineraryView'
import { mergeTripWaypoints, waypointsHidingVisited } from './lib/tripMerge'
import { fetchRoadRouteCoordinates } from './lib/osrmRoute'
import { resolveBasemap } from './lib/mapStyle'
import {
  clearPersistedState,
  loadPersistedState,
  savePersistedState,
} from './lib/tripStorage'
import {
  canWriteCloud,
  fetchLiveTripState,
  isCloudSyncEnabled,
  isViewOnlyCloud,
  liveStateToPersisted,
  saveLiveTripState,
} from './lib/tripSync'
import type { PersistedTripState, TripFile } from './types/trip'

type View = 'map' | 'itinerary'

function viewFromHash(): View {
  return window.location.hash.startsWith('#/itinerary') ? 'itinerary' : 'map'
}

const emptyPersisted = (): PersistedTripState => ({
  visitedWaypointIds: [],
  customWaypoints: [],
  removedDefaultIds: [],
})

export default function App() {
  const basemap = useMemo(() => resolveBasemap(), [])
  const [tripFile, setTripFile] = useState<TripFile | null>(null)
  const [persisted, setPersisted] = useState(loadPersistedState)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedWaypointId, setSelectedWaypointId] = useState<string | null>(
    null,
  )
  const [userPosition, setUserPosition] = useState<{
    lng: number
    lat: number
  } | null>(null)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [geoActive, setGeoActive] = useState(false)
  const watchIdRef = useRef<number | null>(null)
  const [recenterOnUserKey, setRecenterOnUserKey] = useState(0)
  const [view, setView] = useState<View>(viewFromHash)
  const [cloudUpdatedAt, setCloudUpdatedAt] = useState<string | null>(null)
  const [cloudMessage, setCloudMessage] = useState<string | null>(null)
  const [cloudBusy, setCloudBusy] = useState(false)
  const viewOnlyCloud = isViewOnlyCloud()
  const writeCloud = canWriteCloud()

  useEffect(() => {
    const onHashChange = () => setView(viewFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    void fetch(`${import.meta.env.BASE_URL}trip.json`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status))
        return r.json() as Promise<TripFile>
      })
      .then((data) => {
        if (!data?.waypoints || !Array.isArray(data.waypoints)) {
          setTripFile({ waypoints: [] })
        } else {
          setTripFile(data)
        }
      })
      .catch(() => setTripFile({ waypoints: [] }))
  }, [])

  const waypoints = useMemo(() => {
    if (!tripFile) return []
    return mergeTripWaypoints(tripFile, persisted)
  }, [tripFile, persisted])

  const activeWaypoints = useMemo(
    () => waypointsHidingVisited(waypoints, persisted.visitedWaypointIds),
    [waypoints, persisted.visitedWaypointIds],
  )

  useEffect(() => {
    if (
      selectedWaypointId &&
      !activeWaypoints.some((w) => w.id === selectedWaypointId)
    ) {
      setSelectedWaypointId(null)
    }
  }, [activeWaypoints, selectedWaypointId])

  const waypointSig = useMemo(
    () => activeWaypoints.map((w) => `${w.id}:${w.lat},${w.lng}`).join('|'),
    [activeWaypoints],
  )

  const straightRouteCoords = useMemo(
    () =>
      activeWaypoints.length < 2
        ? []
        : activeWaypoints.map((w) => [w.lng, w.lat] as [number, number]),
    [activeWaypoints],
  )

  const [osrmRouteMatch, setOsrmRouteMatch] = useState<{
    sig: string
    coords: [number, number][]
  } | null>(null)

  useEffect(() => {
    if (activeWaypoints.length < 2) return
    const sigAtStart = waypointSig
    let cancelled = false
    void fetchRoadRouteCoordinates(activeWaypoints).then((coords) => {
      if (cancelled) return
      if (coords.length >= 2) {
        setOsrmRouteMatch({ sig: sigAtStart, coords })
      }
    })
    return () => {
      cancelled = true
    }
  }, [activeWaypoints, waypointSig])

  const routeLineCoordinates =
    activeWaypoints.length < 2
      ? []
      : osrmRouteMatch?.sig === waypointSig && osrmRouteMatch.coords.length >= 2
        ? osrmRouteMatch.coords
        : straightRouteCoords

  const defaultWaypointIds = useMemo(
    () => new Set((tripFile?.waypoints ?? []).map((w) => w.id)),
    [tripFile],
  )

  const applyLiveFromCloud = useCallback((live: Awaited<ReturnType<typeof fetchLiveTripState>>) => {
    if (!live) return
    const next = liveStateToPersisted(live)
    savePersistedState(next)
    setPersisted(next)
    setCloudUpdatedAt(live.updatedAt ?? null)
    if (live.position) {
      setUserPosition({ lat: live.position.lat, lng: live.position.lng })
    }
  }, [])

  const refreshFromCloud = useCallback(async () => {
    if (!isCloudSyncEnabled()) return
    setCloudBusy(true)
    setCloudMessage(null)
    try {
      const live = await fetchLiveTripState()
      applyLiveFromCloud(live)
      setCloudMessage('Hämtat.')
    } catch (e) {
      setCloudMessage(e instanceof Error ? e.message : 'Kunde inte hämta.')
    } finally {
      setCloudBusy(false)
    }
  }, [applyLiveFromCloud])

  useEffect(() => {
    if (!isCloudSyncEnabled() || !viewOnlyCloud) return
    void refreshFromCloud()
  }, [refreshFromCloud, viewOnlyCloud])

  const saveToCloud = useCallback(async () => {
    if (!writeCloud) return
    setCloudBusy(true)
    setCloudMessage(null)
    try {
      await saveLiveTripState(persisted, userPosition)
      setCloudMessage('Sparat för familjen.')
      setCloudUpdatedAt(new Date().toISOString())
    } catch (e) {
      setCloudMessage(e instanceof Error ? e.message : 'Kunde inte spara.')
    } finally {
      setCloudBusy(false)
    }
  }, [persisted, userPosition, writeCloud])

  const updatePersisted = useCallback((next: PersistedTripState) => {
    if (viewOnlyCloud) return
    savePersistedState(next)
    setPersisted(next)
  }, [viewOnlyCloud])

  const toggleVisited = useCallback(
    (id: string) => {
      const has = persisted.visitedWaypointIds.includes(id)
      const visitedWaypointIds = has
        ? persisted.visitedWaypointIds.filter((x) => x !== id)
        : [...persisted.visitedWaypointIds, id]
      updatePersisted({ ...persisted, visitedWaypointIds })
    },
    [persisted, updatePersisted],
  )

  const removeWaypoint = useCallback(
    (id: string) => {
      const isCustom = persisted.customWaypoints.some((c) => c.id === id)
      if (isCustom) {
        updatePersisted({
          ...persisted,
          customWaypoints: persisted.customWaypoints.filter((c) => c.id !== id),
          visitedWaypointIds: persisted.visitedWaypointIds.filter((x) => x !== id),
        })
      } else {
        updatePersisted({
          ...persisted,
          removedDefaultIds: [...persisted.removedDefaultIds, id],
          visitedWaypointIds: persisted.visitedWaypointIds.filter((x) => x !== id),
        })
      }
      setSelectedWaypointId((cur) => (cur === id ? null : cur))
    },
    [persisted, updatePersisted],
  )

  const clearDeviceData = useCallback(() => {
    clearPersistedState()
    setPersisted(emptyPersisted())
    setSelectedWaypointId(null)
    setUserPosition(null)
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    setGeoActive(false)
    setGeoError(null)
  }, [])

  const stopGeo = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    setGeoActive(false)
    setUserPosition(null)
  }, [])

  const startGeo = useCallback(() => {
    setGeoError(null)
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported in this browser.')
      return
    }
    stopGeo()
    setGeoActive(true)
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setUserPosition({
          lng: pos.coords.longitude,
          lat: pos.coords.latitude,
        })
        setGeoError(null)
      },
      (err) => {
        setGeoError(err.message)
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 25_000 },
    )
  }, [stopGeo])

  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [])

  const centerOnUser = useCallback(() => {
    setRecenterOnUserKey((k) => k + 1)
  }, [])

  if (!tripFile) {
    return (
      <div className="app-loading">
        <p>Loading trip…</p>
      </div>
    )
  }

  if (view === 'itinerary') {
    return (
      <ItineraryView
        waypoints={waypoints}
        visitedWaypointIds={persisted.visitedWaypointIds}
        onToggleVisited={viewOnlyCloud ? () => {} : toggleVisited}
        onBackToMap={() => {
          window.location.hash = ''
        }}
      />
    )
  }

  return (
    <div className="app-shell">
      <TripMap
        basemap={basemap}
        waypoints={waypoints}
        routeLineCoordinates={routeLineCoordinates}
        visitedWaypointIds={persisted.visitedWaypointIds}
        selectedWaypointId={selectedWaypointId}
        onSelectWaypoint={setSelectedWaypointId}
        userPosition={userPosition}
        recenterOnUserKey={recenterOnUserKey}
      />

      {basemap.isFallback ? (
        <div className="basemap-banner" role="status">
          Using a free fallback map (no hillshade). Add{' '}
          <code>VITE_MAPTILER_API_KEY</code> in <code>.env</code> for terrain and
          richer detail — see README.
        </div>
      ) : null}

      {viewOnlyCloud ? (
        <ViewerControls
          cloudUpdatedAt={cloudUpdatedAt}
          cloudMessage={cloudMessage}
          cloudBusy={cloudBusy}
          hasUserPosition={userPosition != null}
          onRefreshFromCloud={refreshFromCloud}
          onCenterOnUser={centerOnUser}
        />
      ) : (
        <WaypointDrawer
          open={drawerOpen}
          onToggleOpen={() => setDrawerOpen((o) => !o)}
          waypoints={waypoints}
          persisted={persisted}
          defaultWaypointIds={defaultWaypointIds}
          onToggleVisited={toggleVisited}
          onRemoveWaypoint={removeWaypoint}
          onClearDeviceData={clearDeviceData}
          geoActive={geoActive}
          geoError={geoError}
          onStartGeo={startGeo}
          onStopGeo={stopGeo}
          onCenterOnUser={centerOnUser}
          hasUserPosition={userPosition != null}
          cloudEnabled={isCloudSyncEnabled()}
          viewOnlyCloud={false}
          writeCloud={writeCloud}
          cloudUpdatedAt={cloudUpdatedAt}
          cloudMessage={cloudMessage}
          cloudBusy={cloudBusy}
          onRefreshFromCloud={refreshFromCloud}
          onSaveToCloud={saveToCloud}
        />
      )}
    </div>
  )
}
