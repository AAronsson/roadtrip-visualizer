export type BasemapInfo = {
  styleUrl: string
  hasTerrainHint: boolean
  isFallback: boolean
}

/**
 * Resolves the MapLibre style URL. Without a key, uses a free CARTO vector style
 * (no hillshade); add a MapTiler key for terrain and richer outdoor detail.
 */
export function resolveBasemap(): BasemapInfo {
  const custom = import.meta.env.VITE_MAP_STYLE_URL?.trim()
  if (custom) {
    return { styleUrl: custom, hasTerrainHint: true, isFallback: false }
  }
  const key = import.meta.env.VITE_MAPTILER_API_KEY?.trim()
  if (key) {
    return {
      styleUrl: `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${key}`,
      hasTerrainHint: true,
      isFallback: false,
    }
  }
  return {
    styleUrl: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
    hasTerrainHint: false,
    isFallback: true,
  }
}
