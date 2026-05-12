import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { Grid, OrbitControls, TransformControls } from '@react-three/drei'
import { Object3D, Raycaster, Vector2, Vector3 } from 'three'
import { useEditorStore } from '../state/editorStore'
import { MapLoader } from '../scene/map/MapLoader'
import type { MapEntity, Vec3Tuple } from '../core/mapTypes'

/**
 * 3D content of the editor: orbit camera, grid, selection handles, and the
 * actual map rendered via MapLoader (in noColliders mode) plus marker meshes
 * for spawns/waypoints.
 */
export function EditorScene() {
  const phase = useEditorStore((s) => s.phase)
  const map = useEditorStore((s) => s.map)
  const selectedId = useEditorStore((s) => s.selectedId)
  const showGrid = useEditorStore((s) => s.showGrid)
  const snap = useEditorStore((s) => s.snap)
  const selectEntity = useEditorStore((s) => s.selectEntity)
  const updateEntity = useEditorStore((s) => s.updateEntity)

  const { camera, gl, scene } = useThree()
  const orbitRef = useRef<any>(null)
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale'>('translate')

  // Diagnostic raycast probe — on every click in editor, runs an independent
  // raycast and dumps all intersections to console. Lets us see exactly what
  // R3F's picker sees vs what we expect.
  useEffect(() => {
    if (phase !== 'editing') return
    const canvas = gl.domElement
    const onMouseDown = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const ndc = new Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      )
      const rc = new Raycaster()
      rc.setFromCamera(ndc, camera)
      const hits = rc.intersectObject(scene, true)
      console.log(
        `[editor probe] click (btn ${e.button}) → ${hits.length} hits`,
        hits.slice(0, 6).map((h) => ({
          dist: h.distance.toFixed(2),
          name: h.object.name || h.object.type,
          uuid: h.object.uuid.slice(0, 8),
          hasPointerDown: !!(h.object as any).__r3f?.eventCount,
          raycastDisabled: h.object.raycast === (() => null),
        }))
      )
    }
    canvas.addEventListener('mousedown', onMouseDown)
    return () => canvas.removeEventListener('mousedown', onMouseDown)
  }, [phase, camera, gl, scene])

  // Reposition camera to a useful orbit view when entering editor — close
  // enough to see newly-spawned 2m cubes without straining.
  useEffect(() => {
    if (phase !== 'editing') return
    camera.position.set(18, 14, 18)
    camera.lookAt(0, 0, 0)
    useEditorStore.getState().setSpawnPoint([0, 0, 0])
  }, [phase, camera])

  // Flatten tone-mapping exposure for the editor so material colors read
  // as-authored, independent of gameplay's lighting balance.
  useEffect(() => {
    const prev = gl.toneMappingExposure
    gl.toneMappingExposure = 1.0
    return () => {
      gl.toneMappingExposure = prev
    }
  }, [gl])

  // Hotkeys: W = move, E = rotate, R = scale, Delete, Ctrl+D, Ctrl+Z/Y
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const editor = useEditorStore.getState()
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.code === 'KeyW') setTransformMode('translate')
      else if (e.code === 'KeyE') setTransformMode('rotate')
      else if (e.code === 'KeyR') setTransformMode('scale')
      else if (e.code === 'Delete' && editor.selectedId) editor.deleteEntity(editor.selectedId)
      else if (e.code === 'KeyD' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        editor.duplicateSelected()
      } else if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        if (e.shiftKey) editor.redo()
        else editor.undo()
      } else if (e.code === 'KeyY' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        editor.redo()
      } else if (e.code === 'Escape') {
        editor.selectEntity(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Track meshes by entity id for transform-controls to attach to.
  // Register-callback bumps a tick counter so the parent re-renders after a
  // mesh is committed — otherwise TransformControls would miss the freshly
  // mounted object on the same frame a new entity is added.
  const meshes = useRef<Map<string, Object3D>>(new Map())
  const [, bumpMeshes] = useReducer((x: number) => x + 1, 0)
  const registerMesh = useCallback((id: string, obj: Object3D | null) => {
    if (obj) {
      meshes.current.set(id, obj)
      console.log('[editor] mesh registered:', id, 'total:', meshes.current.size)
    } else {
      meshes.current.delete(id)
      console.log('[editor] mesh unregistered:', id, 'total:', meshes.current.size)
    }
    bumpMeshes()
  }, [])
  const selectedObj = selectedId ? meshes.current.get(selectedId) ?? null : null

  // Log selection state changes
  useEffect(() => {
    console.log(
      '[editor] selectedId =', selectedId,
      '· selectedObj resolved:', !!selectedObj,
      selectedObj ? `(${selectedObj.position.x.toFixed(2)}, ${selectedObj.position.y.toFixed(2)}, ${selectedObj.position.z.toFixed(2)})` : ''
    )
  }, [selectedId, selectedObj])

  // Drag-end size baking. drei's TransformControls auto-disables our
  // OrbitControls (via makeDefault) when the gizmo is being dragged, so we
  // don't need a manual orbit-toggle. We only need to bake scale into the
  // entity's size on drag end (to avoid the geometry-arg feedback loop).
  const dragStartSize = useRef<Vec3Tuple | null>(null)
  const handleDragStart = () => {
    const s = useEditorStore.getState()
    if (transformMode === 'scale' && s.selectedId) {
      const ent = s.map.entities.find((x) => x.id === s.selectedId)
      if (ent && 'size' in ent) dragStartSize.current = [...ent.size] as Vec3Tuple
    }
  }
  const handleDragEnd = () => {
    const s = useEditorStore.getState()
    if (
      transformMode === 'scale' &&
      dragStartSize.current &&
      selectedObj &&
      s.selectedId
    ) {
      const start = dragStartSize.current
      const newSize: Vec3Tuple = [
        Math.max(0.05, snapNum(start[0] * selectedObj.scale.x, s.snap)),
        Math.max(0.05, snapNum(start[1] * selectedObj.scale.y, s.snap)),
        Math.max(0.05, snapNum(start[2] * selectedObj.scale.z, s.snap)),
      ]
      s.updateEntity(s.selectedId, { size: newSize } as any)
      selectedObj.scale.set(1, 1, 1)
      dragStartSize.current = null
    }
  }

  // Called by TransformControls every change frame. We only commit translation
  // here; scale is baked on drag-end (see dragging-changed handler above).
  const onObjectChange = () => {
    const obj = selectedObj
    if (!obj || !selectedId || transformMode !== 'translate') return
    const newPos = snapVec(obj.position, snap)
    updateEntity(selectedId, { pos: newPos })
  }

  if (phase !== 'editing') {
    // Choosing-template phase — render empty scene so the UI sits on top.
    return (
      <>
        <ambientLight intensity={0.7} />
        <directionalLight position={[10, 20, 10]} intensity={1.0} />
      </>
    )
  }

  return (
    <>
      {/* Editor lighting — flat, even, bright. No shadows. No physically
          based balance — the goal is readability while authoring. */}
      <ambientLight intensity={2.0} />
      <directionalLight position={[20, 35, 10]} intensity={1.8} />
      <directionalLight position={[-20, 20, -10]} intensity={1.0} />
      <hemisphereLight args={['#c8d6f0', '#3a4050', 1.2]} />

      {showGrid && (
        <Grid
          position={[0, 0.01, 0]}
          args={[200, 200]}
          cellSize={snap > 0 ? snap : 0.5}
          cellThickness={0.6}
          cellColor="#3a4050"
          sectionSize={Math.max(snap, 0.5) * 10}
          sectionThickness={1.2}
          sectionColor="#7a90b8"
          fadeDistance={120}
          fadeStrength={1}
          infiniteGrid
        />
      )}

      <OrbitControls
        ref={orbitRef}
        makeDefault
        enableDamping
        dampingFactor={0.12}
        minDistance={2}
        maxDistance={300}
        onChange={() => {
          const t = orbitRef.current?.target
          if (t) useEditorStore.getState().setSpawnPoint([t.x, t.y, t.z])
        }}
      />

      {/* Spawn cursor — small ring marking where the next entity will appear */}
      <SpawnCursor />

      {/* Map content, no physics */}
      <MapLoader map={map} noColliders />

      {/* Hit-targets for selection — invisible meshes that match boxes,
          plus visible markers for spawns/waypoints */}
      {map.entities.map((e) => (
        <EntityHandle
          key={e.id}
          entity={e}
          selected={e.id === selectedId}
          registerMesh={registerMesh}
          selectEntity={selectEntity}
        />
      ))}

      {selectedObj && (
        <TransformControls
          object={selectedObj}
          mode={transformMode}
          size={1.3}
          translationSnap={snap > 0 ? snap : null}
          scaleSnap={snap > 0 ? snap : null}
          onMouseDown={(e) => {
            console.log('[editor] TC mouseDown', e)
            handleDragStart()
          }}
          onMouseUp={(e) => {
            console.log('[editor] TC mouseUp', e)
            handleDragEnd()
          }}
          onObjectChange={() => {
            console.log('[editor] TC objectChange', selectedObj?.position?.toArray())
            onObjectChange()
          }}
        />
      )}
    </>
  )
}

function SpawnCursor() {
  const p = useEditorStore((s) => s.spawnPoint)
  return (
    <group position={[p[0], 0.02, p[2]]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh raycast={(() => null) as any}>
        <ringGeometry args={[0.6, 0.9, 32]} />
        <meshBasicMaterial color="#ff8a3d" transparent opacity={0.85} depthTest={false} toneMapped={false} />
      </mesh>
      <mesh raycast={(() => null) as any}>
        <ringGeometry args={[0.05, 0.12, 16]} />
        <meshBasicMaterial color="#ff8a3d" transparent opacity={0.9} depthTest={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

function snapNum(v: number, s: number): number {
  if (s <= 0) return v
  return Math.round(v / s) * s
}

function snapVec(v: Vector3, s: number): Vec3Tuple {
  return [snapNum(v.x, s), snapNum(v.y, s), snapNum(v.z, s)]
}

function EntityHandle({
  entity,
  selected,
  registerMesh,
  selectEntity,
}: {
  entity: MapEntity
  selected: boolean
  registerMesh: (id: string, obj: Object3D | null) => void
  selectEntity: (id: string | null) => void
}) {
  // Register the OUTER node — for boxes this is the mesh itself, for markers
  // it's the wrapping group. That way TransformControls moves obj.position
  // == entity.pos with no offset gymnastics.
  const groupRef = useRef<any>(null)
  const id = entity.id
  useEffect(() => {
    registerMesh(id, groupRef.current)
    return () => registerMesh(id, null)
  }, [registerMesh, id])

  const onClick = (ev: any) => {
    ev.stopPropagation()
    console.log('[editor] picker onPointerDown →', entity.kind, id, 'pos:', entity.pos)
    selectEntity(id)
  }

  // When selected, disable raycast on the picker mesh so it doesn't intercept
  // pointer events meant for the TransformControls gizmo handles.
  const ignoreRaycast = selected ? (() => null as any) : undefined

  if (entity.kind === 'concrete' || entity.kind === 'metal') {
    const grounded = Math.abs(entity.pos[1] - entity.size[1] / 2) < 1e-3
    const selectionColor = grounded ? '#5af07b' : '#ffaa44'
    return (
      <>
        <mesh
          ref={groupRef}
          position={entity.pos}
          onPointerDown={onClick}
          raycast={ignoreRaycast as any}
        >
          <boxGeometry args={entity.size} />
          <meshBasicMaterial
            color={selected ? selectionColor : '#ffffff'}
            wireframe
            transparent
            opacity={selected ? 0.95 : 0}
            depthTest={false}
          />
        </mesh>
        {grounded && (
          <mesh
            position={[entity.pos[0], 0.015, entity.pos[2]]}
            rotation={[-Math.PI / 2, 0, 0]}
            raycast={(() => null) as any}
          >
            <planeGeometry args={[entity.size[0], entity.size[2]]} />
            <meshBasicMaterial
              color="#5af07b"
              transparent
              opacity={selected ? 0.35 : 0.18}
              depthTest={false}
              toneMapped={false}
            />
          </mesh>
        )}
      </>
    )
  }

  const color =
    entity.kind === 'playerSpawn' ? '#5af07b' :
    entity.kind === 'botSpawn' ? '#ff5a5a' :
    '#ffd066'

  return (
    <group ref={groupRef} position={entity.pos}>
      <mesh onPointerDown={onClick} position={[0, 0.9, 0]} raycast={ignoreRaycast as any}>
        <cylinderGeometry args={[0.25, 0.4, 1.8, 6]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={selected ? 1.6 : 0.7}
          transparent
          opacity={0.55}
          depthTest={false}
          toneMapped={false}
        />
      </mesh>
      {selected && (
        <mesh position={[0, 0.9, 0]} raycast={(() => null) as any}>
          <cylinderGeometry args={[0.4, 0.5, 1.85, 6]} />
          <meshBasicMaterial color="#ffaa44" wireframe transparent opacity={0.9} depthTest={false} />
        </mesh>
      )}
    </group>
  )
}
