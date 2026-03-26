import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TripMap } from './components/TripMap'
import { WaypointDrawer } from './components/WaypointDrawer'
import { mergeTripWaypoints } from './lib/tripMerge'
import { resolveBasemap } from './lib/mapStyle'
import {
  clearPersistedState,
  loadPersistedState,
  savePersistedState,
} from './lib/tripStorage'
import type { PersistedTripState, TripFile, Waypoint } from './types/trip'

const emptyPersisted = (): PersistedTripState => ({
  visitedWaypointIds: [],
  customWaypoints: [],
  removedDefaultIds: [],
})

function normalizeWaypointForExport(w: Waypoint): Waypoint {
  const out: Waypoint = {
    id: w.id,
    name: w.name,
    lat: w.lat,
    lng: w.lng,
  }
  if (w.countryCode) out.countryCode = w.countryCode
  return out
}

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

  useEffect(() => {
    void fetch('/trip.json')
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

  const defaultWaypointIds = useMemo(
    () => new Set((tripFile?.waypoints ?? []).map((w) => w.id)),
    [tripFile],
  )

  const updatePersisted = useCallback((next: PersistedTripState) => {
    savePersistedState(next)
    setPersisted(next)
  }, [])

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

  const addWaypoint = useCallback(
    (w: Waypoint) => {
      if (persisted.customWaypoints.some((c) => c.id === w.id)) return
      updatePersisted({
        ...persisted,
        customWaypoints: [...persisted.customWaypoints, w],
      })
    },
    [persisted, updatePersisted],
  )

  const exportJson = useCallback(() => {
    const payload: TripFile = {
      waypoints: waypoints.map(normalizeWaypointForExport),
    }
    const text = `${JSON.stringify(payload, null, 2)}\n`
    const blob = new Blob([text], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'trip-export.json'
    a.click()
    URL.revokeObjectURL(url)
  }, [waypoints])

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

  return (
    <div className="app-shell">
      <TripMap
        basemap={basemap}
        waypoints={waypoints}
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

      <WaypointDrawer
        open={drawerOpen}
        onToggleOpen={() => setDrawerOpen((o) => !o)}
        waypoints={waypoints}
        persisted={persisted}
        defaultWaypointIds={defaultWaypointIds}
        onToggleVisited={toggleVisited}
        onRemoveWaypoint={removeWaypoint}
        onAddWaypoint={addWaypoint}
        onExportJson={exportJson}
        onClearDeviceData={clearDeviceData}
        geoActive={geoActive}
        geoError={geoError}
        onStartGeo={startGeo}
        onStopGeo={stopGeo}
        onCenterOnUser={centerOnUser}
        hasUserPosition={userPosition != null}
      />
    </div>
  )
}
