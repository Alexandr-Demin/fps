import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type {
  EntityKind,
  MapData,
  MapEntity,
  Vec3Tuple,
} from '../core/mapTypes'
import { nextEntityId } from '../core/mapTypes'
import { SECTOR_17 } from '../core/maps/sector17'
import { EMPTY_TEMPLATE } from '../core/maps/emptyTemplate'

const HISTORY_LIMIT = 50

export type EditorPhase = 'choosing' | 'editing'

interface EditorState {
  phase: EditorPhase
  map: MapData
  selectedId: string | null
  snap: number
  showGrid: boolean
  history: MapData[]
  future: MapData[]
  // Live spawn anchor — follows OrbitControls' target so new entities appear
  // where the user is currently looking, not at world origin.
  spawnPoint: Vec3Tuple

  reset: () => void
  startEditing: (template: 'empty' | 'sector17' | MapData) => void

  selectEntity: (id: string | null) => void
  updateEntity: (id: string, patch: Partial<MapEntity>) => void
  addEntity: (
    kind: EntityKind,
    posOverride?: Vec3Tuple,
    sizeOverride?: Vec3Tuple
  ) => string
  deleteEntity: (id: string) => void
  duplicateSelected: () => void
  snapSelectedToGround: () => void

  setSnap: (n: number) => void
  toggleGrid: () => void
  setSpawnPoint: (p: Vec3Tuple) => void

  undo: () => void
  redo: () => void

  exportJSON: () => string
  importJSON: (json: string) => void

  // Replace the map wholesale (used by Save-And-Test → publish to gameStore)
  setMapName: (name: string) => void
}

const cloneMap = (m: MapData): MapData => ({
  name: m.name,
  entities: m.entities.map((e) => ({ ...e } as MapEntity)),
  fog: m.fog ? { ...m.fog } : undefined,
})

const defaultSize = (kind: EntityKind): Vec3Tuple => {
  switch (kind) {
    case 'concrete':
    case 'metal':
      return [2, 2, 2]
    default:
      return [0.6, 0.6, 0.6]
  }
}

export const useEditorStore = create<EditorState>()(
  subscribeWithSelector((set, get) => ({
    phase: 'choosing',
    map: { name: 'NEW MAP', entities: [] },
    selectedId: null,
    snap: 0.5,
    showGrid: true,
    history: [],
    future: [],
    spawnPoint: [0, 0, 0],

    reset: () =>
      set({
        phase: 'choosing',
        map: { name: 'NEW MAP', entities: [] },
        selectedId: null,
        history: [],
        future: [],
      }),

    startEditing: (template) => {
      let map: MapData
      if (template === 'empty') map = cloneMap(EMPTY_TEMPLATE)
      else if (template === 'sector17') map = cloneMap(SECTOR_17)
      else map = cloneMap(template)
      set({
        phase: 'editing',
        map,
        selectedId: null,
        history: [],
        future: [],
      })
    },

    selectEntity: (id) => set({ selectedId: id }),

    updateEntity: (id, patch) =>
      set((s) => {
        const prev = s.map
        const entities = prev.entities.map((e) =>
          e.id === id ? ({ ...e, ...patch } as MapEntity) : e
        )
        return pushHistory(s, { ...prev, entities })
      }),

    addEntity: (kind, posOverride, sizeOverride) => {
      const id = nextEntityId(kind)
      const base = posOverride ?? get().spawnPoint
      const size = sizeOverride ?? defaultSize(kind)

      // Smart Y default per kind so new entities don't intersect the floor
      let y = base[1]
      if (kind === 'concrete' || kind === 'metal') {
        y = size[1] / 2  // box sits on the floor
      } else if (kind === 'playerSpawn' || kind === 'botSpawn') {
        y = 2.5
      } else if (kind === 'waypoint') {
        y = 1.5
      }

      // Small jitter so repeat clicks don't stack identical entities.
      const jit = 0.6
      const pos: Vec3Tuple = [
        base[0] + (Math.random() - 0.5) * jit,
        y,
        base[2] + (Math.random() - 0.5) * jit,
      ]

      let entity: MapEntity
      if (kind === 'concrete' || kind === 'metal') {
        entity = {
          id,
          kind,
          pos,
          size,
          ...(kind === 'metal' ? { emissive: '#a8c4ff', emissiveIntensity: 2.0 } : {}),
        } as MapEntity
      } else {
        entity = { id, kind, pos } as MapEntity
      }
      set((s) =>
        pushHistory(s, {
          ...s.map,
          entities: [...s.map.entities, entity],
        })
      )
      set({ selectedId: id })
      return id
    },

    deleteEntity: (id) =>
      set((s) => {
        const next = pushHistory(s, {
          ...s.map,
          entities: s.map.entities.filter((e) => e.id !== id),
        })
        return { ...next, selectedId: s.selectedId === id ? null : s.selectedId }
      }),

    duplicateSelected: () => {
      const s = get()
      if (!s.selectedId) return
      const src = s.map.entities.find((e) => e.id === s.selectedId)
      if (!src) return
      const dup: MapEntity = {
        ...(src as any),
        id: nextEntityId(src.kind),
        pos: [src.pos[0] + 1, src.pos[1], src.pos[2] + 1],
      }
      set((prev) =>
        pushHistory(prev, {
          ...prev.map,
          entities: [...prev.map.entities, dup],
        })
      )
      set({ selectedId: dup.id })
    },

    snapSelectedToGround: () => {
      const s = get()
      if (!s.selectedId) return
      const ent = s.map.entities.find((e) => e.id === s.selectedId)
      if (!ent) return
      const newY =
        ent.kind === 'concrete' || ent.kind === 'metal' ? ent.size[1] / 2 : 0
      if (Math.abs(ent.pos[1] - newY) < 1e-4) return
      const pos: Vec3Tuple = [ent.pos[0], newY, ent.pos[2]]
      set((st) =>
        pushHistory(st, {
          ...st.map,
          entities: st.map.entities.map((e) =>
            e.id === ent.id ? ({ ...e, pos } as MapEntity) : e
          ),
        })
      )
    },

    setSnap: (n) => set({ snap: Math.max(0, n) }),
    toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
    setSpawnPoint: (p) => set({ spawnPoint: p }),

    undo: () =>
      set((s) => {
        const prev = s.history[s.history.length - 1]
        if (!prev) return {}
        return {
          history: s.history.slice(0, -1),
          future: [s.map, ...s.future].slice(0, HISTORY_LIMIT),
          map: prev,
        }
      }),

    redo: () =>
      set((s) => {
        const next = s.future[0]
        if (!next) return {}
        return {
          history: [...s.history, s.map].slice(-HISTORY_LIMIT),
          future: s.future.slice(1),
          map: next,
        }
      }),

    exportJSON: () => JSON.stringify(get().map, null, 2),

    importJSON: (json) => {
      try {
        const parsed = JSON.parse(json) as MapData
        if (!parsed || !Array.isArray(parsed.entities)) {
          throw new Error('Invalid map: missing entities array')
        }
        set((s) =>
          pushHistory(s, {
            name: parsed.name ?? 'IMPORTED',
            entities: parsed.entities,
            fog: parsed.fog,
          })
        )
      } catch (e) {
        console.warn('[editor] importJSON failed:', e)
        alert('Не удалось загрузить карту: ' + (e instanceof Error ? e.message : String(e)))
      }
    },

    setMapName: (name) =>
      set((s) => pushHistory(s, { ...s.map, name })),
  }))
)

function pushHistory(s: EditorState, nextMap: MapData): Partial<EditorState> {
  return {
    history: [...s.history, s.map].slice(-HISTORY_LIMIT),
    future: [],
    map: nextMap,
  }
}
