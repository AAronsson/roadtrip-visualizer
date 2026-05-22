export type GeocodeHit = {
  displayName: string
  lat: number
  lng: number
  countryCode?: string
}

function normalizeCountryCode(code: string | undefined): string | undefined {
  if (!code || code.length !== 2) return undefined
  return code.toUpperCase()
}

/** MapTiler Geocoding (needs VITE_MAPTILER_API_KEY). */
async function geocodeMapTiler(query: string): Promise<GeocodeHit[]> {
  const key = import.meta.env.VITE_MAPTILER_API_KEY?.trim()
  if (!key) return []
  const path = encodeURIComponent(query)
  const url = `https://api.maptiler.com/geocoding/${path}.json?key=${key}&limit=6`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Geocoding failed (${res.status})`)
  const data = (await res.json()) as {
    features?: Array<{
      place_name?: string
      text?: string
      center?: [number, number]
      properties?: { country_code?: string }
    }>
  }
  const feats = data.features ?? []
  return feats
    .filter((f) => f.center && f.center.length >= 2)
    .map((f) => ({
      displayName: f.place_name ?? f.text ?? 'Unknown',
      lat: f.center![1],
      lng: f.center![0],
      countryCode: normalizeCountryCode(f.properties?.country_code),
    }))
}

/** OSM Nominatim (no key; respect usage policy — low volume, identify app). */
async function geocodeNominatim(query: string): Promise<GeocodeHit[]> {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', query)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('limit', '6')
  const res = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
    },
  })
  if (!res.ok) throw new Error(`Nominatim failed (${res.status})`)
  const rows = (await res.json()) as Array<{
    display_name?: string
    lat?: string
    lon?: string
    address?: { country_code?: string }
  }>
  return rows
    .filter((r) => r.lat != null && r.lon != null)
    .map((r) => ({
      displayName: r.display_name ?? 'Unknown',
      lat: parseFloat(r.lat!),
      lng: parseFloat(r.lon!),
      countryCode: normalizeCountryCode(r.address?.country_code),
    }))
}

export async function searchPlaces(query: string): Promise<GeocodeHit[]> {
  const q = query.trim()
  if (!q) return []
  const mapTiler = await geocodeMapTiler(q)
  if (mapTiler.length > 0) return mapTiler
  return geocodeNominatim(q)
}

/** MapTiler reverse geocoding. */
async function reverseGeocodeMapTiler(
  lat: number,
  lng: number,
): Promise<GeocodeHit | null> {
  const key = import.meta.env.VITE_MAPTILER_API_KEY?.trim()
  if (!key) return null
  const url = `https://api.maptiler.com/geocoding/${lng},${lat}.json?key=${key}&limit=1`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = (await res.json()) as {
    features?: Array<{
      place_name?: string
      text?: string
      properties?: { country_code?: string }
    }>
  }
  const f = data.features?.[0]
  if (!f) return null
  return {
    displayName: f.place_name ?? f.text ?? '',
    lat,
    lng,
    countryCode: normalizeCountryCode(f.properties?.country_code),
  }
}

/** Nominatim reverse geocoding. */
async function reverseGeocodeNominatim(
  lat: number,
  lng: number,
): Promise<GeocodeHit | null> {
  const url = new URL('https://nominatim.openstreetmap.org/reverse')
  url.searchParams.set('lat', String(lat))
  url.searchParams.set('lon', String(lng))
  url.searchParams.set('format', 'jsonv2')
  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } })
  if (!res.ok) return null
  const r = (await res.json()) as {
    display_name?: string
    name?: string
    address?: { country_code?: string; city?: string; town?: string; village?: string }
  }
  const name =
    r.name ??
    r.address?.city ??
    r.address?.town ??
    r.address?.village ??
    r.display_name ??
    ''
  if (!name) return null
  return {
    displayName: name,
    lat,
    lng,
    countryCode: normalizeCountryCode(r.address?.country_code),
  }
}

export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<{ name: string; countryCode?: string } | null> {
  try {
    const hit = await reverseGeocodeMapTiler(lat, lng)
    if (hit?.displayName) return { name: hit.displayName, countryCode: hit.countryCode }
  } catch {
    /* fall through */
  }
  try {
    const hit = await reverseGeocodeNominatim(lat, lng)
    if (hit?.displayName) return { name: hit.displayName, countryCode: hit.countryCode }
  } catch {
    /* fall through */
  }
  return null
}
