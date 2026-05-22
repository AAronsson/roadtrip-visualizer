import { useRef, useState } from 'react'
import { searchPlaces } from '../lib/geocode'
import type { GeocodeHit } from '../lib/geocode'
import type { PersistedTripState, Waypoint } from '../types/trip'

function flagUrl(countryCode: string | undefined): string | null {
  if (!countryCode || countryCode.length !== 2) return null
  return `https://flagcdn.com/24x18/${countryCode.toLowerCase()}.png`
}

function defaultAfterId(
  waypoints: Waypoint[],
  visitedWaypointIds: string[],
): string | null {
  const visitedSet = new Set(visitedWaypointIds)
  let lastVisitedIdx = -1
  for (let i = 0; i < waypoints.length; i++) {
    if (visitedSet.has(waypoints[i].id)) lastVisitedIdx = i
  }
  if (lastVisitedIdx >= 0) return waypoints[lastVisitedIdx].id
  return null
}

type EditTripViewProps = {
  waypoints: Waypoint[]
  persisted: PersistedTripState
  defaultWaypointIds: Set<string>
  visitedWaypointIds: string[]
  onToggleVisited: (id: string) => void
  onRemoveWaypoint: (id: string) => void
  onReorder: (fromIdx: number, toIdx: number) => void
  onRenameCustom: (id: string, newName: string) => void
  onSetPriority: (id: string, priority: 0 | 1 | 2 | 3) => void
  onAddWaypoint: (wp: Omit<Waypoint, 'id'>, afterId: string | null) => void
  onBackToMap: () => void
}

export function EditTripView({
  waypoints,
  persisted,
  defaultWaypointIds,
  visitedWaypointIds,
  onToggleVisited,
  onRemoveWaypoint,
  onReorder,
  onRenameCustom,
  onSetPriority,
  onAddWaypoint,
  onBackToMap,
}: EditTripViewProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchHits, setSearchHits] = useState<GeocodeHit[]>([])
  const [searchBusy, setSearchBusy] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [addAfterId, setAddAfterId] = useState<string | null>(() =>
    defaultAfterId(waypoints, visitedWaypointIds),
  )
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const searchDebounceRef = useRef<number | null>(null)
  const visitedSet = new Set(visitedWaypointIds)

  function handleSearchChange(q: string) {
    setSearchQuery(q)
    setSearchError(null)
    if (searchDebounceRef.current) window.clearTimeout(searchDebounceRef.current)
    if (!q.trim()) {
      setSearchHits([])
      return
    }
    searchDebounceRef.current = window.setTimeout(() => {
      setSearchBusy(true)
      searchPlaces(q)
        .then((hits) => {
          setSearchHits(hits)
          setSearchBusy(false)
        })
        .catch((e: unknown) => {
          setSearchError(e instanceof Error ? e.message : 'Sökning misslyckades')
          setSearchBusy(false)
        })
    }, 350)
  }

  function handleSelectHit(hit: GeocodeHit) {
    onAddWaypoint(
      {
        name: hit.displayName,
        lat: hit.lat,
        lng: hit.lng,
        countryCode: hit.countryCode,
        priority: 1,
      },
      addAfterId,
    )
    setSearchQuery('')
    setSearchHits([])
  }

  function startRename(w: Waypoint) {
    setRenamingId(w.id)
    setRenameValue(w.name)
  }

  function commitRename() {
    if (renamingId && renameValue.trim()) {
      onRenameCustom(renamingId, renameValue.trim())
    }
    setRenamingId(null)
  }

  return (
    <div className="edit-trip">
      <header className="edit-trip__header">
        <button
          type="button"
          className="button button--secondary"
          onClick={onBackToMap}
        >
          ← Tillbaka till kartan
        </button>
        <h1 className="edit-trip__title">Redigera resplan</h1>
      </header>

      {waypoints.length === 0 ? (
        <p className="edit-trip__empty">Inga stopp ännu.</p>
      ) : (
        <ol className="edit-trip__list">
          {waypoints.map((w, idx) => {
            const isCustom = !defaultWaypointIds.has(w.id)
            const visited = visitedSet.has(w.id)
            const flag = flagUrl(w.countryCode)
            const isRenaming = renamingId === w.id

            return (
              <li
                key={w.id}
                className={`edit-trip-item ${visited ? 'edit-trip-item--done' : ''} ${w.priority === 3 && !visited ? 'edit-trip-item--preliminary' : ''}`}
              >
                <div className="edit-trip-item__order">
                  <button
                    type="button"
                    className="edit-trip-item__arrow"
                    onClick={() => onReorder(idx, idx - 1)}
                    disabled={idx === 0}
                    aria-label={`Flytta ${w.name} uppåt`}
                    title="Flytta uppåt"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="edit-trip-item__arrow"
                    onClick={() => onReorder(idx, idx + 1)}
                    disabled={idx === waypoints.length - 1}
                    aria-label={`Flytta ${w.name} nedåt`}
                    title="Flytta nedåt"
                  >
                    ▼
                  </button>
                </div>

                {flag ? (
                  <img
                    src={flag}
                    alt=""
                    className="edit-trip-item__flag"
                    width={20}
                    height={15}
                    loading="lazy"
                  />
                ) : (
                  <span className="edit-trip-item__flag edit-trip-item__flag--empty" />
                )}

                <div className="edit-trip-item__body">
                  {isRenaming ? (
                    <input
                      className="input edit-trip-item__rename"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename()
                        if (e.key === 'Escape') setRenamingId(null)
                      }}
                      autoFocus
                      aria-label="Nytt namn"
                    />
                  ) : (
                    <span
                      className={`edit-trip-item__name ${isCustom ? 'edit-trip-item__name--editable' : ''}`}
                      onClick={() => isCustom && startRename(w)}
                      title={isCustom ? 'Klicka för att byta namn' : undefined}
                    >
                      {w.name}
                    </span>
                  )}
                  <span className="edit-trip-item__meta">
                    {visited ? 'Klar' : 'Kommande'}
                    {isCustom ? ' · Eget stopp' : ''}
                  </span>
                </div>

                <label className="edit-trip-item__check">
                  <input
                    type="checkbox"
                    checked={visited}
                    onChange={() => onToggleVisited(w.id)}
                    aria-label={`Markera ${w.name} som klar`}
                  />
                </label>

                <button
                  type="button"
                  className={`edit-trip-item__visibility ${w.priority === 3 ? 'edit-trip-item__visibility--private' : ''}`}
                  onClick={() =>
                    onSetPriority(w.id, w.priority === 3 ? 1 : 3)
                  }
                  aria-label={
                    w.priority === 3
                      ? `Gör ${w.name} synlig publikt`
                      : `Dölj ${w.name} från publika vyn`
                  }
                  title={w.priority === 3 ? 'Dold publikt — klicka för att visa' : 'Synlig publikt — klicka för att dölja'}
                >
                  {w.priority === 3 ? '🔒' : '👁'}
                </button>

                <button
                  type="button"
                  className="edit-trip-item__remove"
                  onClick={() => {
                    if (window.confirm(`Ta bort "${w.name}" från resan?`)) {
                      onRemoveWaypoint(w.id)
                    }
                  }}
                  aria-label={`Ta bort ${w.name}`}
                  title="Ta bort"
                >
                  ×
                </button>
              </li>
            )
          })}
        </ol>
      )}

      <section className="edit-trip__add-section">
        <h2 className="edit-trip__add-title">Lägg till stopp</h2>

        <div className="add-search">
          <input
            type="search"
            className="input"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Sök plats…"
            aria-label="Sök plats att lägga till"
          />
        </div>

        {searchError ? <p className="field-error">{searchError}</p> : null}
        {searchBusy ? <p className="edit-trip__search-hint">Söker…</p> : null}

        {searchHits.length > 0 ? (
          <ul className="hit-list">
            {searchHits.map((hit, i) => (
              <li key={i}>
                <button
                  type="button"
                  className="hit-button"
                  onClick={() => handleSelectHit(hit)}
                >
                  {hit.displayName}
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <label className="add-dialog__label" htmlFor="edit-trip-after">
          Placera efter
        </label>
        <select
          id="edit-trip-after"
          className="input add-dialog__select"
          value={addAfterId ?? ''}
          onChange={(e) => setAddAfterId(e.target.value || null)}
        >
          <option value="">I början av listan</option>
          {waypoints.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </section>
    </div>
  )
}
