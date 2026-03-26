import { useId, useRef, useState } from 'react'
import {
  parseTripImportJson,
  type ParsedTripImport,
} from '../lib/tripImport'
import { searchPlaces, type GeocodeHit } from '../lib/geocode'
import type { PersistedTripState, Waypoint } from '../types/trip'

function flagUrl(countryCode: string | undefined): string | null {
  if (!countryCode || countryCode.length !== 2) return null
  return `https://flagcdn.com/24x18/${countryCode.toLowerCase()}.png`
}

type WaypointDrawerProps = {
  open: boolean
  onToggleOpen: () => void
  waypoints: Waypoint[]
  persisted: PersistedTripState
  defaultWaypointIds: Set<string>
  onToggleVisited: (id: string) => void
  onRemoveWaypoint: (id: string) => void
  onAddWaypoint: (w: Waypoint) => void
  onExportJson: () => void
  onImportTrip: (parsed: ParsedTripImport) => void
  onClearDeviceData: () => void
  geoActive: boolean
  geoError: string | null
  onStartGeo: () => void
  onStopGeo: () => void
  onCenterOnUser: () => void
  hasUserPosition: boolean
}

export function WaypointDrawer({
  open,
  onToggleOpen,
  waypoints,
  persisted,
  defaultWaypointIds,
  onToggleVisited,
  onRemoveWaypoint,
  onAddWaypoint,
  onExportJson,
  onImportTrip,
  onClearDeviceData,
  geoActive,
  geoError,
  onStartGeo,
  onStopGeo,
  onCenterOnUser,
  hasUserPosition,
}: WaypointDrawerProps) {
  const formId = useId()
  const importInputRef = useRef<HTMLInputElement>(null)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [latStr, setLatStr] = useState('')
  const [lngStr, setLngStr] = useState('')
  const [hits, setHits] = useState<GeocodeHit[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const runSearch = async () => {
    setSearchError(null)
    setSearching(true)
    setHits([])
    try {
      const results = await searchPlaces(query)
      setHits(results)
      if (results.length === 0) setSearchError('No results — try another name or use coordinates.')
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : 'Search failed')
    } finally {
      setSearching(false)
    }
  }

  const addFromCoordinates = () => {
    const lat = parseFloat(latStr.replace(',', '.'))
    const lng = parseFloat(lngStr.replace(',', '.'))
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      setSearchError('Enter valid latitude and longitude.')
      return
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setSearchError('Coordinates out of range.')
      return
    }
    const id = `custom-${Date.now()}`
    onAddWaypoint({
      id,
      name: `${lat.toFixed(2)}, ${lng.toFixed(2)}`,
      lat,
      lng,
    })
    setLatStr('')
    setLngStr('')
    setSearchError(null)
  }

  const pickHit = (h: GeocodeHit) => {
    const id = `custom-${Date.now()}`
    onAddWaypoint({
      id,
      name: h.displayName.split(',').slice(0, 2).join(',').trim() || h.displayName,
      lat: h.lat,
      lng: h.lng,
      countryCode: h.countryCode,
    })
    setHits([])
    setQuery('')
  }

  return (
    <>
      <button
        type="button"
        className="drawer-toggle"
        onClick={onToggleOpen}
        aria-expanded={open}
        aria-controls="waypoint-drawer"
      >
        {open ? 'Hide trip' : 'Trip'}
      </button>

      <aside
        id="waypoint-drawer"
        className={`waypoint-drawer ${open ? 'waypoint-drawer--open' : ''}`}
        aria-hidden={!open}
      >
        <div className="waypoint-drawer__inner">
          <h2 className="waypoint-drawer__title">Stops</h2>
          <p className="waypoint-drawer__hint">
            Green = done. Blue = upcoming. Edit canonical stops in{' '}
            <code>public/trip.json</code> and redeploy.
          </p>

          <ul className="waypoint-list">
            {waypoints.map((w) => {
              const visited = persisted.visitedWaypointIds.includes(w.id)
              const isDefault = defaultWaypointIds.has(w.id)
              const f = flagUrl(w.countryCode)
              return (
                <li
                  key={w.id}
                  className={`waypoint-item ${visited ? 'waypoint-item--done' : ''}`}
                >
                  {f ? (
                    <img
                      src={f}
                      alt=""
                      className="waypoint-item__flag"
                      width={24}
                      height={18}
                      loading="lazy"
                    />
                  ) : (
                    <span className="waypoint-item__flag waypoint-item__flag--empty" />
                  )}
                  <div className="waypoint-item__body">
                    <span className="waypoint-item__name">{w.name}</span>
                    <span className="waypoint-item__meta">
                      {visited ? 'Done' : 'Upcoming'}
                      {!isDefault ? ' · Added here' : ''}
                    </span>
                  </div>
                  <label className="waypoint-item__check">
                    <input
                      type="checkbox"
                      checked={visited}
                      onChange={() => onToggleVisited(w.id)}
                      aria-label={`Mark ${w.name} as done`}
                    />
                  </label>
                  <button
                    type="button"
                    className="waypoint-item__remove"
                    onClick={() => onRemoveWaypoint(w.id)}
                    aria-label={`Remove ${w.name}`}
                  >
                    Remove
                  </button>
                </li>
              )
            })}
          </ul>

          <section className="drawer-section">
            <h3>Add stop</h3>
            <div className="add-search">
              <label htmlFor={`${formId}-q`} className="sr-only">
                Search place name
              </label>
              <input
                id={`${formId}-q`}
                type="search"
                className="input"
                placeholder="City or place name"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void runSearch())}
              />
              <button
                type="button"
                className="button"
                onClick={() => void runSearch()}
                disabled={searching || !query.trim()}
              >
                {searching ? '…' : 'Search'}
              </button>
            </div>
            {searchError ? <p className="field-error">{searchError}</p> : null}
            {hits.length > 0 ? (
              <ul className="hit-list">
                {hits.map((h, i) => (
                  <li key={`${h.lat},${h.lng},${i}`}>
                    <button type="button" className="hit-button" onClick={() => pickHit(h)}>
                      {h.displayName}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            <p className="coord-label">Or coordinates (WGS84)</p>
            <div className="coord-row">
              <label htmlFor={`${formId}-lat`} className="sr-only">
                Latitude
              </label>
              <input
                id={`${formId}-lat`}
                className="input input--narrow"
                placeholder="Lat"
                value={latStr}
                onChange={(e) => setLatStr(e.target.value)}
                inputMode="decimal"
              />
              <label htmlFor={`${formId}-lng`} className="sr-only">
                Longitude
              </label>
              <input
                id={`${formId}-lng`}
                className="input input--narrow"
                placeholder="Lng"
                value={lngStr}
                onChange={(e) => setLngStr(e.target.value)}
                inputMode="decimal"
              />
              <button type="button" className="button" onClick={addFromCoordinates}>
                Add
              </button>
            </div>
          </section>

          <section className="drawer-section">
            <h3>Your position</h3>
            <p className="waypoint-drawer__hint">
              Uses the device GPS (HTTPS only in production). Red pin on the map.
            </p>
            <div className="button-row">
              {!geoActive ? (
                <button type="button" className="button" onClick={onStartGeo}>
                  Share location
                </button>
              ) : (
                <button type="button" className="button button--secondary" onClick={onStopGeo}>
                  Stop sharing
                </button>
              )}
              <button
                type="button"
                className="button button--secondary"
                onClick={onCenterOnUser}
                disabled={!hasUserPosition}
              >
                Center map
              </button>
            </div>
            {geoError ? <p className="field-error">{geoError}</p> : null}
          </section>

          <section className="drawer-section drawer-section--actions">
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              aria-label="Choose trip JSON file to import"
              onChange={async (e) => {
                const input = e.target
                const file = input.files?.[0]
                input.value = ''
                if (!file) return
                setImportMessage(null)
                try {
                  const text = await file.text()
                  let raw: unknown
                  try {
                    raw = JSON.parse(text) as unknown
                  } catch {
                    throw new Error('File is not valid JSON.')
                  }
                  const parsed = parseTripImportJson(raw)
                  onImportTrip(parsed)
                  setImportMessage('Imported on this device.')
                } catch (err) {
                  setImportMessage(
                    err instanceof Error ? err.message : 'Import failed.',
                  )
                }
              }}
            />
            <button type="button" className="button" onClick={onExportJson}>
              Export trip JSON
            </button>
            <button
              type="button"
              className="button button--secondary"
              onClick={() => importInputRef.current?.click()}
            >
              Import trip JSON
            </button>
            {importMessage ? (
              <p className={importMessage.startsWith('Imported') ? 'import-ok' : 'field-error'}>
                {importMessage}
              </p>
            ) : null}
            <button
              type="button"
              className="button button--danger"
              onClick={() => {
                if (window.confirm('Clear visited, custom stops, and removals on this device?')) {
                  onClearDeviceData()
                }
              }}
            >
              Reset this device
            </button>
          </section>
        </div>
      </aside>
    </>
  )
}
