import { useEffect, useRef, useState } from 'react'
import type { Waypoint } from '../types/trip'

function flagUrl(countryCode: string | undefined): string | null {
  if (!countryCode || countryCode.length !== 2) return null
  return `https://flagcdn.com/24x18/${countryCode.toLowerCase()}.png`
}

type AddWaypointDialogProps = {
  /** The coords of the dropped pin. */
  lngLat: { lng: number; lat: number }
  /** Best-effort name + country from reverse geocode (null = still loading or failed). */
  geocodeResult: { name: string; countryCode?: string } | null
  /** All current waypoints in order, for the "after which stop" dropdown. */
  waypoints: Waypoint[]
  /** IDs already marked as visited — used to pick the default insertion point. */
  visitedWaypointIds: string[]
  onSave: (
    wp: Omit<Waypoint, 'id'>,
    afterId: string | null,
  ) => void
  onCancel: () => void
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

export function AddWaypointDialog({
  lngLat,
  geocodeResult,
  waypoints,
  visitedWaypointIds,
  onSave,
  onCancel,
}: AddWaypointDialogProps) {
  const fallbackName = `Stopp vid ${lngLat.lat.toFixed(3)}, ${lngLat.lng.toFixed(3)}`
  const [name, setName] = useState('')
  const [countryCode, setCountryCode] = useState<string | undefined>(undefined)
  const [afterId, setAfterId] = useState<string | null>(() =>
    defaultAfterId(waypoints, visitedWaypointIds),
  )
  const nameRef = useRef<HTMLInputElement>(null)
  const [appliedGeocodeResult, setAppliedGeocodeResult] = useState<
    typeof geocodeResult
  >(null)

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  // Fill in name from geocode once it arrives, but only if the user hasn't typed yet.
  // Done during render (not in an effect) per React docs: "Adjusting state when a prop changes".
  if (geocodeResult && geocodeResult !== appliedGeocodeResult) {
    setAppliedGeocodeResult(geocodeResult)
    if (!name) setName(geocodeResult.name)
    if (!countryCode) setCountryCode(geocodeResult.countryCode)
  }

  const flag = flagUrl(countryCode)
  const effectiveName = name.trim() || fallbackName

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSave(
      {
        name: effectiveName,
        lat: lngLat.lat,
        lng: lngLat.lng,
        countryCode,
        priority: 1,
      },
      afterId,
    )
  }

  return (
    <div className="add-dialog-overlay" role="dialog" aria-modal="true" aria-label="Lägg till stopp">
      <div className="add-dialog">
        <h2 className="add-dialog__title">Lägg till stopp</h2>

        <form onSubmit={handleSubmit}>
          <div className="add-dialog__name-row">
            {flag ? (
              <img
                src={flag}
                alt=""
                className="add-dialog__flag"
                width={20}
                height={15}
              />
            ) : (
              <span className="add-dialog__flag add-dialog__flag--empty" />
            )}
            <input
              ref={nameRef}
              type="text"
              className="input add-dialog__name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                geocodeResult === null ? 'Söker namn…' : fallbackName
              }
              aria-label="Namn på stoppet"
            />
          </div>

          <p className="add-dialog__coords">
            {lngLat.lat.toFixed(5)}, {lngLat.lng.toFixed(5)}
          </p>

          <label className="add-dialog__label" htmlFor="add-dialog-after">
            Placera efter
          </label>
          <select
            id="add-dialog-after"
            className="input add-dialog__select"
            value={afterId ?? ''}
            onChange={(e) => setAfterId(e.target.value || null)}
          >
            <option value="">I början av listan</option>
            {waypoints.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>

          <div className="add-dialog__actions">
            <button type="submit" className="button">
              Spara
            </button>
            <button
              type="button"
              className="button button--secondary"
              onClick={onCancel}
            >
              Avbryt
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
