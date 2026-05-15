import { Suspense, useRef } from 'react'
import { CharacterModel, type CharacterMotion } from './CharacterModel'

/**
 * Invisible always-mounted CharacterModel instance. Forces the FBX
 * pipeline (download → parse → SkeletonUtils.clone → material compile
 * → first AnimationAction setup) to happen once during app boot,
 * before any real remote player or bot mounts. Without this the first
 * encounter visibly hitches while three.js compiles the skinned-mesh
 * shader for the first time.
 *
 * The warmup mounts at the far edge of the playable space and uses
 * visible=false so it never renders. The Suspense fallback is null so
 * a delayed FBX load doesn't pop placeholder geometry into the scene.
 */
export function CharacterWarmup() {
  const motionRef = useRef<CharacterMotion>({ horizontal: 0, vertical: 0 })
  return (
    <group visible={false} position={[0, -200, 0]}>
      <Suspense fallback={null}>
        <CharacterModel
          state="standing"
          motionRef={motionRef}
          isBot={false}
          protectedFlag={false}
        />
      </Suspense>
    </group>
  )
}
