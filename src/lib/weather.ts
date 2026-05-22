export type DayWeather = {
  tempMax: number
  tempMin: number
  weatherCode: number
  windMaxKmh: number | null
}

const cache = new Map<string, DayWeather | null>()

const FORECAST_BASE = 'https://api.open-meteo.com/v1/forecast'
const ARCHIVE_BASE = 'https://archive-api.open-meteo.com/v1/archive'

const DAILY_PARAMS =
  'weathercode,temperature_2m_max,temperature_2m_min,windspeed_10m_max'

/** Show extra wind hint above this max gust (km/h). */
export const HIGH_WIND_KMH = 45

function cacheKey(lat: number, lng: number, date: string): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)},${date}`
}

function todayIsoDate(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

type OpenMeteoDaily = {
  daily?: {
    time?: string[]
    temperature_2m_max?: (number | null)[]
    temperature_2m_min?: (number | null)[]
    weathercode?: (number | null)[]
    windspeed_10m_max?: (number | null)[]
  }
}

function parseDaily(data: OpenMeteoDaily, date: string): DayWeather | null {
  const times = data.daily?.time
  if (!times?.length) return null
  const i = times.indexOf(date)
  if (i < 0) return null

  const tempMax = data.daily?.temperature_2m_max?.[i]
  const tempMin = data.daily?.temperature_2m_min?.[i]
  const weatherCode = data.daily?.weathercode?.[i]
  const windRaw = data.daily?.windspeed_10m_max?.[i]

  if (
    tempMax == null ||
    tempMin == null ||
    weatherCode == null ||
    Number.isNaN(tempMax) ||
    Number.isNaN(tempMin)
  ) {
    return null
  }

  return {
    tempMax,
    tempMin,
    weatherCode,
    windMaxKmh:
      windRaw != null && !Number.isNaN(windRaw) ? windRaw : null,
  }
}

async function fetchOpenMeteoDaily(
  base: string,
  lat: number,
  lng: number,
  date: string,
): Promise<DayWeather | null> {
  const url = new URL(base)
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lng))
  url.searchParams.set('daily', DAILY_PARAMS)
  url.searchParams.set('windspeed_unit', 'kmh')
  url.searchParams.set('timezone', 'auto')
  url.searchParams.set('start_date', date)
  url.searchParams.set('end_date', date)

  const res = await fetch(url)
  if (!res.ok) return null
  const data = (await res.json()) as OpenMeteoDaily
  return parseDaily(data, date)
}

/**
 * Weather for one calendar day at a coordinate. Returns null when unavailable
 * (too far ahead, API miss, etc.) — callers should render nothing.
 */
export async function fetchDayWeather(
  lat: number,
  lng: number,
  date: string,
): Promise<DayWeather | null> {
  const key = cacheKey(lat, lng, date)
  if (cache.has(key)) return cache.get(key) ?? null

  const today = todayIsoDate()
  const forecastHorizon = addDays(today, 16)

  if (date > forecastHorizon) {
    cache.set(key, null)
    return null
  }

  let result: DayWeather | null
  if (date >= today) {
    result = await fetchOpenMeteoDaily(FORECAST_BASE, lat, lng, date)
  } else {
    result = await fetchOpenMeteoDaily(ARCHIVE_BASE, lat, lng, date)
    if (!result) {
      result = await fetchOpenMeteoDaily(FORECAST_BASE, lat, lng, date)
    }
  }

  cache.set(key, result)
  return result
}

/** WMO weather code → compact symbol for itinerary. */
export function weatherSymbol(code: number): string {
  if (code === 0) return '☀'
  if (code <= 3) return '⛅'
  if (code === 45 || code === 48) return '🌫'
  if (code >= 51 && code <= 57) return '🌦'
  if (code >= 61 && code <= 67) return '🌧'
  if (code >= 71 && code <= 77) return '❄'
  if (code >= 80 && code <= 82) return '🌦'
  if (code >= 85 && code <= 86) return '🌨'
  if (code >= 95) return '⛈'
  return '☁'
}

export function formatDayWeather(w: DayWeather): {
  symbol: string
  temps: string
  wind: string | null
} {
  const max = Math.round(w.tempMax)
  const min = Math.round(w.tempMin)
  const wind =
    w.windMaxKmh != null && w.windMaxKmh >= HIGH_WIND_KMH
      ? `${Math.round(w.windMaxKmh)} km/h`
      : null
  return {
    symbol: weatherSymbol(w.weatherCode),
    temps: `${max}° / ${min}°`,
    wind,
  }
}
