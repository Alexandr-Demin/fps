import { Suspense, useRef } from 'react'
import { CharacterModel, type CharacterMotion } from './CharacterModel'

/**
 * Invisible always-mounted CharacterModel instances. Forces the FBX
 * pipeline (download → parse → SkeletonUtils.clone → material compile
 * → first AnimationAction setup) to happen once during app boot,
 * before any real remote player or bot mounts. Without this the first
 * encounter visibly hitches while three.js compiles the skinned-mesh
 * shader for the first time.
 *
 * Two warmups — one for the human mesh path (walk.fbx) and one for
 * the bot mesh path (idle.fbx), since they're cloned from different
 * source scenes and each needs its own first-frame setup.
 *
 * Mounted far below the playable area with visible=false so they
 * never render. The Suspense fallback is null so a delayed FBX load
 * doesn't pop placeholder geometry into the scene.
 */
export function CharacterWarmup() {
  const humanMotion = useRef<CharacterMotion>({ horizontal: 0, vertical: 0 })
  const botMotion = useRef<CharacterMotion>({ horizontal: 0, vertical: 0 })
  return (
    <group visible={false} position={[0, -200, 0]}>
      <Suspense fallback={null}>
        <CharacterModel
          state="standing"
          motionRef={humanMotion}
          isBot={false}
          protectedFlag={false}
        />
      </Suspense>
      <Suspense fallback={null}>
        <CharacterModel
          state="standing"
          motionRef={botMotion}
          isBot={true}
          protectedFlag={false}
        />
      </Suspense>
    </group>
  )
}
