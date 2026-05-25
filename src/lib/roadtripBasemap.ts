import type { StyleSpecification } from 'maplibre-gl'

type StyleLayer = NonNullable<StyleSpecification['layers']>[number]

type EditableStyleLayer = StyleLayer & {
  id: string
  type: string
  'source-layer'?: string
  filter?: unknown
}

const HIDDEN_TRANSPORT_CLASSES = [
  'aerialway',
  'bicycle',
  'bike',
  'bridleway',
  'cycleway',
  'footway',
  'path',
  'pedestrian',
  'piste',
  'rail',
  'railway',
  'ski',
  'steps',
  'track',
  'trail',
  'transit',
]

const ROAD_FILTER = ['!in', 'class', ...HIDDEN_TRANSPORT_CLASSES]
const COUNTRY_BOUNDARY_FILTER = [
  'all',
  ['in', 'admin_level', 0, 1, 2, '0', '1', '2'],
  ['any', ['!has', 'maritime'], ['==', 'maritime', 0], ['==', 'maritime', '0']],
]

const HIDDEN_POI_CLASSES = ['aerialway', 'airport', 'bus', 'lodging', 'railway']
const HIDDEN_POI_SUBCLASSES = [
  'aerodrome',
  'airfield',
  'airport',
  'apartment',
  'bed_and_breakfast',
  'bus_station',
  'bus_stop',
  'chalet',
  'guest_house',
  'halt',
  'helipad',
  'hostel',
  'hotel',
  'motel',
  'station',
  'subway',
  'tram_stop',
]
const POI_FILTER = [
  'all',
  ['!in', 'class', ...HIDDEN_POI_CLASSES],
  ['!in', 'subclass', ...HIDDEN_POI_SUBCLASSES],
]

const OUTDOOR_DETAIL_PATTERN =
  /(^|[-_\s/])(aerialway|bike|bicycle|bridleway|cliff|contour|contours|cycle|cycleway|cycling|foot|footway|hiking|path|paths|piste|rail|railway|ski|steps|track|tracks|trail|trails|transit)(?=$|[-_\s/])/

const SMALL_PLACE_PATTERN =
  /(^|[-_\s/])(village|hamlet|locality|farm|isolated_dwelling|suburb|neighbourhood|other)(?=$|[-_\s/])/

const SMALL_PLACE_MINZOOM = 10

function sourceLayer(layer: EditableStyleLayer): string {
  return layer['source-layer']?.toLowerCase() ?? ''
}

function layerText(layer: EditableStyleLayer): string {
  return `${layer.id} ${sourceLayer(layer)}`.toLowerCase()
}

function combineFilter(existing: unknown, next: unknown): unknown {
  if (!existing) return next
  return ['all', existing, next]
}

function withFilter(layer: EditableStyleLayer, filter: unknown): StyleLayer {
  return {
    ...layer,
    filter: combineFilter(layer.filter, filter),
  } as StyleLayer
}

function withMinzoom(layer: EditableStyleLayer, min: number): StyleLayer {
  const existing = (layer as { minzoom?: number }).minzoom ?? 0
  return { ...layer, minzoom: Math.max(existing, min) } as StyleLayer
}

function simplifyLayer(layer: StyleLayer): StyleLayer | null {
  const editableLayer = layer as EditableStyleLayer
  const source = sourceLayer(editableLayer)
  const text = layerText(editableLayer)

  if (source === 'boundary' || text.includes('boundary')) {
    return withFilter(editableLayer, COUNTRY_BOUNDARY_FILTER)
  }

  if (source === 'aerodrome_label' || source === 'aeroway') {
    return null
  }

  if (source === 'poi') {
    return withFilter(editableLayer, POI_FILTER)
  }

  if (source === 'place' && SMALL_PLACE_PATTERN.test(text)) {
    return withMinzoom(editableLayer, SMALL_PLACE_MINZOOM)
  }

  if (source === 'transportation' || source === 'transportation_name') {
    return withFilter(editableLayer, ROAD_FILTER)
  }

  if (OUTDOOR_DETAIL_PATTERN.test(text)) {
    return null
  }

  return layer
}

export function simplifyBasemapForRoadtrips(
  style: StyleSpecification,
): StyleSpecification {
  return {
    ...style,
    layers: style.layers?.map(simplifyLayer).filter((layer) => layer !== null),
  }
}
