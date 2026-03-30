import type { StyleSpecification } from 'maplibre-gl'

/**
 * MapLibre GL 5+ expects a valid `projection` when migrating styles. Some
 * third-party styles (e.g. older CARTO GL JSON) omit it, which causes:
 * `TypeError: Cannot read properties of undefined (reading 'projection')`.
 */
export async function fetchStyleJsonWithMercator(
  styleUrl: string,
): Promise<StyleSpecification> {
  const res = await fetch(styleUrl)
  if (!res.ok) {
    throw new Error(`Map style HTTP ${res.status}`)
  }
  const style = (await res.json()) as StyleSpecification & {
    projection?: unknown
  }
  if (style.projection == null) {
    style.projection = { type: 'mercator' }
  }
  return style
}
