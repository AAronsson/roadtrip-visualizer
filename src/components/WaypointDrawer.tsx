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
  onClearDeviceData,
  geoActive,
  geoError,
  onStartGeo,
  onStopGeo,
  onCenterOnUser,
  hasUserPosition,
}: WaypointDrawerProps) {
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
          <a href="#/itinerary" className="button button--secondary waypoint-drawer__itinerary">
            Itinerary →
          </a>

          <ul className="waypoint-list">
            {waypoints.map((w) => {
              const visited = persisted.visitedWaypointIds.includes(w.id)
              const isDefault = defaultWaypointIds.has(w.id)
              const f = flagUrl(w.countryCode)
              return (
                <li
                  key={w.id}
                  className={`waypoint-item ${visited ? 'waypoint-item--done' : ''} ${w.priority === 3 ? 'waypoint-item--preliminary' : ''}`}
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

          {/*
          <section className="drawer-section">
            <h3>Add stop</h3>
            … search + coordinates …
          </section>
          */}

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
