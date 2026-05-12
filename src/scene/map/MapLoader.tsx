import { useMemo } from 'react'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { Color, MeshStandardMaterial } from 'three'
import { COLLISION } from '../../core/constants'
import {
  filterByKind,
  type ConcreteEntity,
  type MapData,
  type MetalEntity,
} from '../../core/mapTypes'
import { buildConcreteTexture, buildMetalTexture } from './textures'

interface Props {
  map: MapData
  // When true, all colliders are skipped — used by the editor where we don't
  // want physics interfering with object manipulation.
  noColliders?: boolean
}

/**
 * Renders the geometric content of a MapData (concrete + metal boxes) and
 * their colliders. Spawn / waypoint markers are NOT rendered here — they're
 * data-only and consumed by gameplay systems through the game store.
 */
export function MapLoader({ map, noColliders }: Props) {
  // Build once-per-mount textures + shared materials
  const concreteTex = useMemo(() => buildConcreteTexture(), [])
  const metalTex = useMemo(() => buildMetalTexture(), [])

  const sharedConcrete = useMemo(
    () =>
      new MeshStandardMaterial({
        map: concreteTex,
        color: '#aab0bd',
        roughness: 0.82,
        metalness: 0.06,
      }),
    [concreteTex]
  )

  const concreteBoxes = useMemo(
    () => filterByKind(map.entities, 'concrete'),
    [map.entities]
  )
  const metalBoxes = useMemo(
    () => filterByKind(map.entities, 'metal'),
    [map.entities]
  )

  return (
    <group>
      {!noColliders && (
        <RigidBody
          type="fixed"
          colliders={false}
          collisionGroups={
            (COLLISION.GROUP_WORLD << 16) |
            (COLLISION.GROUP_PLAYER | COLLISION.GROUP_BOT | COLLISION.GROUP_WORLD)
          }
        >
          {concreteBoxes.map((b) => (
            <CuboidCollider
              key={`col-${b.id}`}
              args={[b.size[0] / 2, b.size[1] / 2, b.size[2] / 2]}
              position={b.pos}
            />
          ))}
          {metalBoxes.map((b) => (
            <CuboidCollider
              key={`col-${b.id}`}
              args={[b.size[0] / 2, b.size[1] / 2, b.size[2] / 2]}
              position={b.pos}
            />
          ))}
        </RigidBody>
      )}

      {concreteBoxes.map((b) => (
        <ConcreteBox
          key={`v-${b.id}`}
          box={b}
          sharedMaterial={sharedConcrete}
          pickable={!noColliders}
        />
      ))}
      {metalBoxes.map((b) => (
        <MetalBox key={`v-${b.id}`} box={b} tex={metalTex} pickable={!noColliders} />
      ))}
    </group>
  )
}

const noRaycast = () => null
const noRaycastProp = noRaycast as any

function ConcreteBox({
  box,
  sharedMaterial,
  pickable,
}: {
  box: ConcreteEntity
  sharedMaterial: MeshStandardMaterial
  pickable: boolean
}) {
  const mat = box.color
    ? new MeshStandardMaterial({
        map: sharedMaterial.map ?? undefined,
        color: box.color,
        roughness: 0.82,
        metalness: 0.06,
      })
    : sharedMaterial
  return (
    <mesh
      position={box.pos}
      material={mat}
      castShadow
      receiveShadow
      raycast={pickable ? undefined : noRaycastProp}
    >
      <boxGeometry args={box.size} />
    </mesh>
  )
}

function MetalBox({
  box,
  tex,
  pickable,
}: {
  box: MetalEntity
  tex: ReturnType<typeof buildMetalTexture>
  pickable: boolean
}) {
  const mat = useMemo(
    () =>
      new MeshStandardMaterial({
        map: tex,
        color: box.color ?? '#3a3d44',
        emissive: box.emissive ? new Color(box.emissive) : new Color(0x000000),
        emissiveIntensity: box.emissiveIntensity ?? 0,
        roughness: 0.55,
        metalness: 0.7,
        toneMapped: !box.emissive,
      }),
    [box, tex]
  )
  return (
    <mesh
      position={box.pos}
      material={mat}
      castShadow
      receiveShadow
      raycast={pickable ? undefined : noRaycastProp}
    >
      <boxGeometry args={box.size} />
    </mesh>
  )
}
