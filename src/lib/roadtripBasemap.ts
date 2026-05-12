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
const COUNTRY_BOUNDARY_FILTER = ['in', 'admin_level', 0, 1, 2, '0', '1', '2']

const OUTDOOR_DETAIL_PATTERN =
  /(^|[-_\s/])(aerialway|bike|bicycle|bridleway|contour|contours|cycle|cycleway|cycling|foot|footway|hiking|path|paths|piste|rail|railway|ski|steps|track|tracks|trail|trails|transit)(?=$|[-_\s/])/

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

function simplifyLayer(layer: StyleLayer): StyleLayer | null {
  const editableLayer = layer as EditableStyleLayer
  const source = sourceLayer(editableLayer)
  const text = layerText(editableLayer)

  if (source === 'boundary' || text.includes('boundary')) {
    return withFilter(editableLayer, COUNTRY_BOUNDARY_FILTER)
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
