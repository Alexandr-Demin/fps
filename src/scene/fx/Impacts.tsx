import { useMemo } from 'react'
import { useGameStore } from '../../state/gameStore'
import { Quaternion, Vector3 } from 'three'

const upVec = new Vector3(0, 0, 1)
const tmpVec = new Vector3()

export function Impacts() {
  const impacts = useGameStore((s) => s.impacts)

  return (
    <>
      {impacts.map((fx) => {
        // Orient a quad to face the surface normal
        tmpVec.set(fx.normal[0], fx.normal[1], fx.normal[2])
        const quat = new Quaternion().setFromUnitVectors(upVec, tmpVec)
        const alpha = Math.min(1, fx.life / 0.55)
        const lift = 0.02 // avoid z-fighting with surface
        const px = fx.position[0] + fx.normal[0] * lift
        const py = fx.position[1] + fx.normal[1] * lift
        const pz = fx.position[2] + fx.normal[2] * lift

        return (
          <group key={fx.id} position={[px, py, pz]} quaternion={quat}>
            {/* Decal — dark scorch */}
            <mesh>
              <circleGeometry args={[0.12, 12]} />
              <meshBasicMaterial
                color={fx.bot ? '#aa1010' : '#0a0a0c'}
                transparent
                opacity={0.85 * alpha}
                depthWrite={false}
              />
            </mesh>
            {/* Bright sparks core */}
            <mesh position={[0, 0, 0.01]}>
              <circleGeometry args={[0.06, 8]} />
              <meshBasicMaterial
                color={fx.bot ? '#ff5050' : '#ffd28a'}
                transparent
                opacity={alpha * 1.0}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
            {/* Quick spark point light */}
            {fx.life > 0.4 && (
              <pointLight
                color={fx.bot ? '#ff4030' : '#ffb060'}
                intensity={alpha * 1.6}
                distance={3}
                decay={2}
              />
            )}
          </group>
        )
      })}
    </>
  )
}
