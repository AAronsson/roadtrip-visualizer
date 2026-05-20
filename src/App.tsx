import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TripMap } from './components/TripMap'
import { ViewerControls } from './components/ViewerControls'
import { WaypointDrawer } from './components/WaypointDrawer'
import { ItineraryView } from './components/ItineraryView'
import {
  mergePersistedStates,
  mergeTripWaypoints,
  waypointsForPublicView,
} from './lib/tripMerge'
import {
  fetchRoadRouteCoordinates,
  splitPolylineByWaypoints,
} from './lib/osrmRoute'
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
import type {
  LiveTripState,
  PersistedTripState,
  RouteSegment,
  TripFile,
} from './types/trip'

type View = 'map' | 'itinerary'

const PUBLIC_REFRESH_MS = 15 * 60 * 1000
const STATE_SAVE_DEBOUNCE_MS = 1500
const POSITION_SAVE_INTERVAL_MS = 2 * 60 * 1000

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
  const [cloudPositionAt, setCloudPositionAt] = useState<string | null>(null)
  const [cloudMessage, setCloudMessage] = useState<string | null>(null)
  const [cloudBusy, setCloudBusy] = useState(false)
  const [initialFetchDone, setInitialFetchDone] = useState(
    () => !isCloudSyncEnabled(),
  )

  const viewOnlyCloud = isViewOnlyCloud()
  const writeCloud = canWriteCloud()

  // baseline = last known server state, used for 3-way merge on autosave.
  const baselineRef = useRef<PersistedTripState>(emptyPersisted())
  const lastLivePositionRef = useRef<LiveTripState['position'] | null>(null)
  const persistedRef = useRef(persisted)
  const userPositionRef = useRef(userPosition)

  useEffect(() => {
    persistedRef.current = persisted
  }, [persisted])
  useEffect(() => {
    userPositionRef.current = userPosition
  }, [userPosition])

  useEffect(() => {
    const onHashChange = () => setView(viewFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // Public viewers cannot reach the itinerary page.
  useEffect(() => {
    if (viewOnlyCloud && view === 'itinerary') {
      window.location.hash = ''
    }
  }, [viewOnlyCloud, view])

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

  // Route polyline uses the full planned route (preliminary stops included).
  const routeWaypoints = waypoints

  // Public viewers don't see preliminary unvisited pins; keyed users see all.
  const displayWaypoints = useMemo(
    () =>
      viewOnlyCloud
        ? waypointsForPublicView(waypoints, persisted.visitedWaypointIds)
        : waypoints,
    [waypoints, viewOnlyCloud, persisted.visitedWaypointIds],
  )

  useEffect(() => {
    if (
      selectedWaypointId &&
      !displayWaypoints.some((w) => w.id === selectedWaypointId)
    ) {
      setSelectedWaypointId(null)
    }
  }, [displayWaypoints, selectedWaypointId])

  const waypointSig = useMemo(
    () => routeWaypoints.map((w) => `${w.id}:${w.lat},${w.lng}`).join('|'),
    [routeWaypoints],
  )

  const [osrmRouteMatch, setOsrmRouteMatch] = useState<{
    sig: string
    legs: [number, number][][]
  } | null>(null)

  useEffect(() => {
    if (routeWaypoints.length < 2) return
    const sigAtStart = waypointSig
    let cancelled = false
    void fetchRoadRouteCoordinates(routeWaypoints).then((coords) => {
      if (cancelled) return
      if (coords.length < 2) return
      const legs = splitPolylineByWaypoints(coords, routeWaypoints)
      if (legs.length >= 1) {
        setOsrmRouteMatch({ sig: sigAtStart, legs })
      }
    })
    return () => {
      cancelled = true
    }
  }, [routeWaypoints, waypointSig])

  const routeSegments = useMemo<RouteSegment[]>(() => {
    if (routeWaypoints.length < 2) return []
    const visited = new Set(persisted.visitedWaypointIds)
    const legs =
      osrmRouteMatch?.sig === waypointSig && osrmRouteMatch.legs.length >= 1
        ? osrmRouteMatch.legs
        : routeWaypoints.slice(0, -1).map((w, i) => {
            const next = routeWaypoints[i + 1]
            return [
              [w.lng, w.lat] as [number, number],
              [next.lng, next.lat] as [number, number],
            ]
          })
    return legs.map((coords, i) => ({
      coords,
      visited:
        visited.has(routeWaypoints[i]?.id ?? '') &&
        visited.has(routeWaypoints[i + 1]?.id ?? ''),
    }))
  }, [
    routeWaypoints,
    waypointSig,
    osrmRouteMatch,
    persisted.visitedWaypointIds,
  ])

  const defaultWaypointIds = useMemo(
    () => new Set((tripFile?.waypoints ?? []).map((w) => w.id)),
    [tripFile],
  )

  const applyServerSnapshot = useCallback((live: LiveTripState | null) => {
    if (!live) return
    const next = liveStateToPersisted(live)
    baselineRef.current = next
    lastLivePositionRef.current = live.position ?? null
    savePersistedState(next)
    setPersisted(next)
    setCloudUpdatedAt(live.updatedAt ?? null)
    if (live.position) {
      setUserPosition({ lat: live.position.lat, lng: live.position.lng })
      setCloudPositionAt(live.position.at || null)
    } else {
      setCloudPositionAt(null)
    }
  }, [])

  const refreshFromCloud = useCallback(async () => {
    if (!isCloudSyncEnabled()) return
    setCloudBusy(true)
    try {
      const live = await fetchLiveTripState()
      applyServerSnapshot(live)
      setCloudMessage('Hämtat.')
    } catch (e) {
      setCloudMessage(e instanceof Error ? e.message : 'Kunde inte hämta.')
    } finally {
      setCloudBusy(false)
    }
  }, [applyServerSnapshot])

  // Initial fetch (both modes) so keyed devices start from the server snapshot.
  useEffect(() => {
    if (!isCloudSyncEnabled()) return
    let cancelled = false
    void (async () => {
      try {
        const live = await fetchLiveTripState()
        if (cancelled) return
        applyServerSnapshot(live)
      } catch (e) {
        if (cancelled) return
        setCloudMessage(e instanceof Error ? e.message : 'Kunde inte hämta.')
      } finally {
        if (!cancelled) setInitialFetchDone(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [applyServerSnapshot])

  // Public viewers auto-refresh every 15 minutes.
  useEffect(() => {
    if (!viewOnlyCloud) return
    const id = window.setInterval(() => {
      void refreshFromCloud()
    }, PUBLIC_REFRESH_MS)
    return () => window.clearInterval(id)
  }, [viewOnlyCloud, refreshFromCloud])

  const performSave = useCallback(async (): Promise<void> => {
    if (!writeCloud) return
    try {
      setCloudBusy(true)
      const live = await fetchLiveTripState()
      const serverState = live ? liveStateToPersisted(live) : emptyPersisted()
      const merged = mergePersistedStates(
        serverState,
        baselineRef.current,
        persistedRef.current,
      )

      // Preserve the most recent known position. If we are not actively sharing
      // GPS, send the server's last position back so the blob keeps it.
      const local = userPositionRef.current
      let position: { lat: number; lng: number; at?: string } | null = null
      let savedPositionAt: string | null = null
      if (local) {
        const at = new Date().toISOString()
        position = { lat: local.lat, lng: local.lng, at }
        savedPositionAt = at
      } else if (live?.position) {
        position = {
          lat: live.position.lat,
          lng: live.position.lng,
          at: live.position.at || undefined,
        }
        savedPositionAt = live.position.at || null
      }

      await saveLiveTripState(merged, position)
      baselineRef.current = merged
      lastLivePositionRef.current = position
        ? {
            lat: position.lat,
            lng: position.lng,
            at: position.at ?? new Date().toISOString(),
          }
        : null
      savePersistedState(merged)
      setPersisted(merged)
      setCloudUpdatedAt(new Date().toISOString())
      setCloudPositionAt(savedPositionAt)
      setCloudMessage('Sparat.')
    } catch (e) {
      setCloudMessage(e instanceof Error ? e.message : 'Kunde inte spara.')
    } finally {
      setCloudBusy(false)
    }
  }, [writeCloud])

  const saveTimerRef = useRef<number | null>(null)
  const scheduleSave = useCallback(
    (delayMs: number = STATE_SAVE_DEBOUNCE_MS) => {
      if (!writeCloud) return
      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current)
      }
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null
        void performSave()
      }, delayMs)
    },
    [writeCloud, performSave],
  )

  useEffect(() => {
    return () => {
      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
    }
  }, [])

  // Throttled position autosave while live GPS is on.
  useEffect(() => {
    if (!writeCloud || !geoActive) return
    const id = window.setInterval(() => {
      if (!userPositionRef.current) return
      scheduleSave(0)
    }, POSITION_SAVE_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [writeCloud, geoActive, scheduleSave])

  const updatePersisted = useCallback(
    (next: PersistedTripState) => {
      if (viewOnlyCloud) return
      savePersistedState(next)
      setPersisted(next)
      scheduleSave()
    },
    [viewOnlyCloud, scheduleSave],
  )

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

  const resetTrip = useCallback(async () => {
    if (saveTimerRef.current != null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    const empty = emptyPersisted()
    clearPersistedState()
    setPersisted(empty)
    baselineRef.current = empty
    setSelectedWaypointId(null)
    setUserPosition(null)
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    setGeoActive(false)
    setGeoError(null)

    if (!writeCloud) return
    try {
      setCloudBusy(true)
      await saveLiveTripState(empty, null)
      setCloudUpdatedAt(new Date().toISOString())
      setCloudPositionAt(null)
      setCloudMessage('Resan återställd.')
    } catch (e) {
      setCloudMessage(e instanceof Error ? e.message : 'Kunde inte återställa.')
    } finally {
      setCloudBusy(false)
    }
  }, [writeCloud])

  const stopGeo = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    setGeoActive(false)
    // Keep userPosition so the last known dot stays on the map for the
    // keyed user, and so autosave can preserve it from the server.
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

  // Save once shortly after GPS starts producing positions, so the family
  // sees the new spot quickly instead of waiting for the throttled interval.
  const lastSharedPositionSaveRef = useRef<number>(0)
  useEffect(() => {
    if (!writeCloud || !geoActive || !userPosition) return
    const now = Date.now()
    if (now - lastSharedPositionSaveRef.current < 30_000) return
    lastSharedPositionSaveRef.current = now
    scheduleSave(2000)
  }, [writeCloud, geoActive, userPosition, scheduleSave])

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

  if (!tripFile || !initialFetchDone) {
    return (
      <div className="app-loading">
        <p>Loading trip…</p>
      </div>
    )
  }

  if (view === 'itinerary' && !viewOnlyCloud) {
    return (
      <ItineraryView
        waypoints={waypoints}
        visitedWaypointIds={persisted.visitedWaypointIds}
        onToggleVisited={toggleVisited}
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
        waypoints={displayWaypoints}
        routeSegments={routeSegments}
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
          cloudPositionAt={cloudPositionAt}
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
          onResetTrip={resetTrip}
          geoActive={geoActive}
          geoError={geoError}
          onStartGeo={startGeo}
          onStopGeo={stopGeo}
          onCenterOnUser={centerOnUser}
          hasUserPosition={userPosition != null}
          cloudEnabled={isCloudSyncEnabled()}
          writeCloud={writeCloud}
          cloudUpdatedAt={cloudUpdatedAt}
          cloudMessage={cloudMessage}
          cloudBusy={cloudBusy}
        />
      )}
    </div>
  )
}
