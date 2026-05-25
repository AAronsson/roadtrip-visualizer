import type maplibregl from 'maplibre-gl'

export const TRIP_POI_LAYER_IDS = [
  'trip-poi-camping',
  'trip-poi-nature',
  'trip-poi-place',
  'trip-poi-utility',
  'trip-poi-viewpoint',
] as const

const SUBCLASS_LABELS: Record<string, string> = {
  caravan_site: 'Campingplats',
  peak: 'Bergstopp',
  waterfall: 'Vattenfall',
  viewpoint: 'Utsiktspunkt',
  attraction: 'Sevärdhet',
  monument: 'Monument',
  memorial: 'Minnesmärke',
  castle: 'Slott',
  ruins: 'Ruin',
  archaeological_site: 'Arkeologisk plats',
  beach: 'Strand',
  picnic_site: 'Picknickplats',
  drinking_water: 'Dricksvatten',
  waste_disposal: 'Tömning',
}

export function poiSubclassLabel(subclass: string | undefined | null): string {
  if (typeof subclass !== 'string' || !subclass) return 'Plats'
  return SUBCLASS_LABELS[subclass] ?? subclass
}

type PoiSource = { source: string; sourceLayer: string }

type PoiCategory = {
  id: string
  color: string
  subclasses: string[]
  /** Markers appear from this zoom. */
  minzoom: number
  /** Optional name label appears from this zoom. */
  labelMinzoom: number
}

const CATEGORIES: PoiCategory[] = [
  {
    id: 'camping',
    color: '#f97316',
    subclasses: ['caravan_site'],
    minzoom: 3,
    labelMinzoom: 6,
  },
  {
    id: 'nature',
    color: '#059669',
    subclasses: ['waterfall'],
    minzoom: 8,
    labelMinzoom: 11,
  },
  {
    id: 'place',
    color: '#7c3aed',
    subclasses: [
      'attraction',
      'monument',
      'memorial',
      'castle',
      'ruins',
      'archaeological_site',
      'beach',
      'picnic_site',
    ],
    minzoom: 8,
    labelMinzoom: 11,
  },
  {
    id: 'utility',
    color: '#475569',
    subclasses: ['drinking_water', 'waste_disposal'],
    minzoom: 3,
    labelMinzoom: 7,
  },
]

const VIEWPOINT_MINZOOM = 8

function findPoiSource(map: maplibregl.Map): PoiSource | null {
  const layers = map.getStyle().layers ?? []
  for (const layer of layers) {
    const sourceLayer = (layer as { 'source-layer'?: string })['source-layer']
    const source = (layer as { source?: string }).source
    if (sourceLayer === 'poi' && typeof source === 'string') {
      return { source, sourceLayer }
    }
  }
  return null
}

const NAME_FIELD: maplibregl.ExpressionSpecification = [
  'coalesce',
  ['get', 'name:sv'],
  ['get', 'name_sv'],
  ['get', 'name:latin'],
  ['get', 'name'],
  '',
]

export function addTripPoiLayers(map: maplibregl.Map, beforeId?: string): void {
  const poi = findPoiSource(map)
  if (!poi) return

  for (const cat of CATEGORIES) {
    const filter: maplibregl.FilterSpecification = [
      'match',
      ['get', 'subclass'],
      cat.subclasses,
      true,
      false,
    ]

    map.addLayer(
      {
        id: `trip-poi-${cat.id}`,
        type: 'circle',
        source: poi.source,
        'source-layer': poi.sourceLayer,
        minzoom: cat.minzoom,
        filter,
        paint: {
          'circle-radius': 5,
          'circle-color': cat.color,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.95,
        },
      },
      beforeId,
    )

    map.addLayer(
      {
        id: `trip-poi-${cat.id}-label`,
        type: 'symbol',
        source: poi.source,
        'source-layer': poi.sourceLayer,
        minzoom: cat.labelMinzoom,
        filter,
        layout: {
          'text-field': NAME_FIELD,
          'text-size': 11,
          'text-offset': [0, 0.9],
          'text-anchor': 'top',
          'text-max-width': 9,
          'text-optional': true,
        },
        paint: {
          'text-color': cat.color,
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.25,
        },
      },
      beforeId,
    )
  }

  map.addLayer(
    {
      id: 'trip-poi-viewpoint',
      type: 'symbol',
      source: poi.source,
      'source-layer': poi.sourceLayer,
      minzoom: VIEWPOINT_MINZOOM,
      filter: ['==', ['get', 'subclass'], 'viewpoint'],
      layout: {
        'text-field': ['concat', '△ ', NAME_FIELD],
        'text-size': 11,
        'text-anchor': 'center',
        'text-max-width': 9,
        'text-optional': true,
      },
      paint: {
        'text-color': '#4338ca',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.5,
      },
    },
    beforeId,
  )
}
