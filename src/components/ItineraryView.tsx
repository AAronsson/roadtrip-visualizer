import { useMemo } from 'react'
import type { Waypoint } from '../types/trip'

/**
 * Approximate driving time and distance per day, manually maintained.
 * Numbers come from OSRM round-trips through that day's stops; husbil
 * realistically lands a bit higher on time, lower on autobahn cruise.
 */
const DAILY_DRIVE: Record<string, { km: number; hours: number }> = {
  '2026-05-26': { km: 710, hours: 9.2 },
  '2026-05-27': { km: 710, hours: 7.6 },
  '2026-05-28': { km: 600, hours: 7.0 },
  '2026-05-29': { km: 180, hours: 2.1 },
  '2026-05-30': { km: 410, hours: 5.2 },
  '2026-05-31': { km: 250, hours: 2.7 },
  '2026-06-01': { km: 80, hours: 1.3 },
  '2026-06-02': { km: 240, hours: 3.4 },
  '2026-06-03': { km: 420, hours: 5.1 },
  '2026-06-04': { km: 220, hours: 3.0 },
  '2026-06-05': { km: 190, hours: 2.4 },
  '2026-06-06': { km: 60, hours: 1.1 },
  '2026-06-07': { km: 340, hours: 5.4 },
  '2026-06-08': { km: 930, hours: 9.8 },
  '2026-06-09': { km: 710, hours: 9.3 },
}

type ItineraryViewProps = {
  waypoints: Waypoint[]
  visitedWaypointIds: string[]
  onToggleVisited: (id: string) => void
  onBackToMap: () => void
}

type DayGroup = {
  /** YYYY-MM-DD */
  date: string
  /** Sleep place (waypoint with date or plannedDate matching this day) */
  sleepWaypoint: Waypoint | null
  /** All waypoints attributed to this day, in route order */
  waypoints: Waypoint[]
  /** True when one of the day's waypoints has a fixed (non-preliminary) date */
  hasFixedDate: boolean
}

function effectiveDate(w: Waypoint): string | null {
  return w.date ?? w.plannedDate ?? null
}

function todayIsoDate(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDate(iso: string): { weekday: string; date: string } {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return { weekday: '', date: iso }
  const date = new Date(Date.UTC(y, m - 1, d))
  const weekday = date.toLocaleDateString('sv-SE', {
    weekday: 'short',
    timeZone: 'UTC',
  })
  const dateLabel = date.toLocaleDateString('sv-SE', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
  return { weekday, date: dateLabel }
}

/**
 * Group waypoints into travel days. A no-date waypoint is attributed to the
 * next dated waypoint (the day's sleep place). Trailing no-date waypoints
 * after the last dated stop fall into the last group.
 */
function groupByDay(waypoints: Waypoint[]): DayGroup[] {
  const groups: DayGroup[] = []
  let buffer: Waypoint[] = []

  for (const w of waypoints) {
    const d = effectiveDate(w)
    if (d) {
      const existing = groups.find((g) => g.date === d)
      if (existing) {
        existing.waypoints.push(...buffer, w)
        if (w.date) existing.hasFixedDate = true
        existing.sleepWaypoint = w
      } else {
        groups.push({
          date: d,
          sleepWaypoint: w,
          waypoints: [...buffer, w],
          hasFixedDate: !!w.date,
        })
      }
      buffer = []
    } else {
      buffer.push(w)
    }
  }

  if (buffer.length > 0) {
    if (groups.length > 0) {
      groups[groups.length - 1].waypoints.push(...buffer)
    }
  }

  groups.sort((a, b) => a.date.localeCompare(b.date))
  return groups
}

function flagUrl(countryCode: string | undefined): string | null {
  if (!countryCode || countryCode.length !== 2) return null
  return `https://flagcdn.com/24x18/${countryCode.toLowerCase()}.png`
}

export function ItineraryView({
  waypoints,
  visitedWaypointIds,
  onToggleVisited,
  onBackToMap,
}: ItineraryViewProps) {
  const days = useMemo(() => groupByDay(waypoints), [waypoints])
  const today = todayIsoDate()

  return (
    <div className="itinerary">
      <header className="itinerary__header">
        <button
          type="button"
          className="button button--secondary"
          onClick={onBackToMap}
        >
          ← Back to map
        </button>
        <h1 className="itinerary__title">Itinerary</h1>
      </header>

      {days.length === 0 ? (
        <p className="itinerary__empty">No dated stops yet.</p>
      ) : (
        <ol className="itinerary__days">
          {days.map((day) => {
            const isPast = day.date < today
            const isToday = day.date === today
            const fmt = formatDate(day.date)
            return (
              <li
                key={day.date}
                className={`itinerary-day ${isPast ? 'itinerary-day--past' : ''} ${isToday ? 'itinerary-day--today' : ''}`}
              >
                <div className="itinerary-day__head">
                  <span className="itinerary-day__weekday">{fmt.weekday}</span>
                  <span className="itinerary-day__date">{fmt.date}</span>
                  {day.hasFixedDate ? (
                    <span className="itinerary-day__badge">Fixed</span>
                  ) : null}
                  {DAILY_DRIVE[day.date] ? (
                    <span className="itinerary-day__drive">
                      ~{DAILY_DRIVE[day.date].km} km · ~
                      {DAILY_DRIVE[day.date].hours} h
                    </span>
                  ) : null}
                </div>
                <ul className="itinerary-day__stops">
                  {day.waypoints.map((w) => {
                    const visited = visitedWaypointIds.includes(w.id)
                    const f = flagUrl(w.countryCode)
                    const isSleep = day.sleepWaypoint?.id === w.id
                    return (
                      <li
                        key={w.id}
                        className={`itinerary-stop ${visited ? 'itinerary-stop--done' : ''}`}
                      >
                        <label className="itinerary-stop__label">
                          <input
                            type="checkbox"
                            checked={visited}
                            onChange={() => onToggleVisited(w.id)}
                            aria-label={`Mark ${w.name} as done`}
                          />
                          {f ? (
                            <img
                              src={f}
                              alt=""
                              className="itinerary-stop__flag"
                              width={20}
                              height={15}
                              loading="lazy"
                            />
                          ) : (
                            <span className="itinerary-stop__flag itinerary-stop__flag--empty" />
                          )}
                          <span className="itinerary-stop__name">{w.name}</span>
                          {isSleep ? (
                            <span
                              className="itinerary-stop__role"
                              aria-label="Sleep here"
                              title="Sleep here"
                            >
                              ☾
                            </span>
                          ) : null}
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
