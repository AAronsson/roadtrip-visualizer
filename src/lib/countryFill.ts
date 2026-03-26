import type { Feature, FeatureCollection } from 'geojson'

/** Deterministic pastel fill for Natural Earth ISO_A2. */
export function fillColorForIso(iso: string | undefined): string {
  if (!iso || iso === '-99') return '#e6e2da'
  let h = 0
  for (let i = 0; i < iso.length; i++) h = (h * 31 + iso.charCodeAt(i)) >>> 0
  const hue = h % 360
  return `hsl(${hue} 32% 86%)`
}

export function annotateCountryFills(collection: FeatureCollection): FeatureCollection {
  const features: Feature[] = collection.features.map((f) => {
    const iso = f.properties && 'ISO_A2' in f.properties ? f.properties.ISO_A2 : undefined
    const fill = fillColorForIso(typeof iso === 'string' ? iso : undefined)
    return {
      ...f,
      properties: { ...(f.properties ?? {}), tripFill: fill },
    }
  })
  return { type: 'FeatureCollection', features }
}
