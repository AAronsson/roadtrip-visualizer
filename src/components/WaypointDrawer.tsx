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
  geoActive: boolean
  geoError: string | null
  onStartGeo: () => void
  onStopGeo: () => void
  onCenterOnUser: () => void
  hasUserPosition: boolean
  cloudEnabled: boolean
  writeCloud: boolean
  cloudUpdatedAt: string | null
  cloudMessage: string | null
  cloudBusy: boolean
  onStartAddMode?: () => void
}

export function WaypointDrawer({
  open,
  onToggleOpen,
  waypoints,
  persisted,
  defaultWaypointIds,
  onToggleVisited,
  onRemoveWaypoint,
  geoActive,
  geoError,
  onStartGeo,
  onStopGeo,
  onCenterOnUser,
  hasUserPosition,
  cloudEnabled,
  writeCloud,
  cloudUpdatedAt,
  cloudMessage,
  cloudBusy,
  onStartAddMode,
}: WaypointDrawerProps) {
  const cloudTime =
    cloudUpdatedAt &&
    (() => {
      try {
        return new Date(cloudUpdatedAt).toLocaleString()
      } catch {
        return cloudUpdatedAt
      }
    })()
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
          <div className="waypoint-drawer__nav">
            <a href="#/itinerary" className="button button--secondary waypoint-drawer__nav-btn">
              Resplan →
            </a>
            {writeCloud ? (
              <a href="#/edit" className="button button--secondary waypoint-drawer__nav-btn">
                Redigera →
              </a>
            ) : null}
          </div>
          {writeCloud && onStartAddMode ? (
            <button
              type="button"
              className="button waypoint-drawer__add-btn"
              onClick={onStartAddMode}
            >
              + Lägg till stopp på karta
            </button>
          ) : null}

          {cloudEnabled && writeCloud ? (
            <section className="drawer-section">
              <h3>Delad progress</h3>
              <p className="waypoint-drawer__hint">
                {cloudBusy
                  ? 'Sparar…'
                  : cloudTime
                    ? `Senast sparad: ${cloudTime}`
                    : 'Sparas automatiskt till familjen.'}
              </p>
              {cloudMessage ? (
                <p className="waypoint-drawer__hint">{cloudMessage}</p>
              ) : null}
            </section>
          ) : null}

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
                    onClick={() => {
                      if (window.confirm(`Ta bort "${w.name}" från resan?`)) {
                        onRemoveWaypoint(w.id)
                      }
                    }}
                    aria-label={`Ta bort ${w.name}`}
                    title="Ta bort från resan"
                  >
                    ×
                  </button>
                </li>
              )
            })}
          </ul>

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
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={onStopGeo}
                >
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

        </div>
      </aside>
    </>
  )
}
