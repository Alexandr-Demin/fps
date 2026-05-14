import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { useFBX } from '@react-three/drei'
import {
  AnimationMixer,
  type AnimationAction,
  type AnimationClip,
  type Group,
  LoopRepeat,
} from 'three'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js'
import { PLAYER } from '../../core/constants'
import type { PlayerState } from '@shared/protocol'

const WALK_FBX = '/assets/character/walk.fbx'
const RUN_FBX = '/assets/character/run.fbx'
const STRAFE_FBX = '/assets/character/strafe.fbx'

// Mixamo files export in centimetres; Three.js works in metres.
const MIXAMO_SCALE = 0.01
// Mixamo characters pivot at the hips, with feet roughly at y=0 of the
// scaled mesh. Offset down so the silhouette sits inside the same
// vertical band as the old capsule (top +0.9, bottom -0.9).
const MIXAMO_FOOT_OFFSET = -PLAYER.HEIGHT * 0.5

// Velocity bands for the locomotion state machine. Cross-fade smooths
// the discontinuities so we don't need hysteresis here.
const WALK_MIN_SPEED = 0.5
const RUN_MIN_SPEED = 7.0
const FADE_S = 0.2

type ClipName = 'walk' | 'run' | 'strafe'

/**
 * Mixamo bakes hip translation into every clip ("root motion"), which
 * would drag the character forward independent of the server-reported
 * position. Strip the Hips position channel so the body cycles in
 * place and the server position is the sole source of locomotion.
 */
function stripRootMotion(clip: AnimationClip): AnimationClip {
  clip.tracks = clip.tracks.filter((t) => !/Hips\.position$/i.test(t.name))
  return clip
}

interface Props {
  state: PlayerState
  // Mutable ref instead of a regular prop — speed updates every frame
  // and we don't want to re-render the whole tree at 60Hz just to feed
  // it to the animation picker.
  speedRef: MutableRefObject<number>
  isBot: boolean
  // Mirrors PlayerSnap.protected — applied per-frame so the flicker
  // matches the previous capsule's behaviour.
  protectedFlag: boolean
}

/**
 * Skinned humanoid model with three locomotion clips. Replaces the
 * procedural capsule we used through phase-4. The mesh comes from
 * walk.fbx; run and strafe contribute only their animation clip.
 *
 * Local player still uses the procedural PlayerController (first-person
 * camera, no body to render). This component is mounted only for
 * remote players and bots.
 */
export function CharacterModel({ state, speedRef, isBot, protectedFlag }: Props) {
  const walkFBX = useFBX(WALK_FBX) as Group
  const runFBX = useFBX(RUN_FBX) as Group
  const strafeFBX = useFBX(STRAFE_FBX) as Group

  // Per-instance mesh clone. SkeletonUtils.clone preserves the
  // skinned-mesh ↔ skeleton link across copies so each remote player
  // animates independently.
  const scene = useMemo(() => SkeletonUtils.clone(walkFBX) as Group, [walkFBX])

  // Clip library, root motion stripped once per source. clone() so we
  // don't mutate the cached drei-managed clip arrays.
  const clips = useMemo(() => {
    const w = walkFBX.animations[0]?.clone()
    const r = runFBX.animations[0]?.clone()
    const s = strafeFBX.animations[0]?.clone()
    return {
      walk: w ? stripRootMotion(w) : null,
      run: r ? stripRootMotion(r) : null,
      strafe: s ? stripRootMotion(s) : null,
    } as Record<ClipName, AnimationClip | null>
  }, [walkFBX, runFBX, strafeFBX])

  const mixer = useMemo(() => new AnimationMixer(scene), [scene])
  const currentAction = useRef<AnimationAction | null>(null)
  const currentClipName = useRef<ClipName | ''>('')
  // Flattened list of every SkinnedMesh material in the scene. Built
  // once per scene clone; the per-frame protection flicker writes
  // opacity through this list rather than re-traversing each tick.
  const materialsRef = useRef<any[]>([])

  // Material tint — Mixamo characters default to a beige skin; recolour
  // them so bots read as "test fixtures" and humans stay close to the
  // old arena-blue silhouette. transparent=true is required so the
  // protection ping-pong below can drive opacity.
  useEffect(() => {
    const mats: any[] = []
    scene.traverse((o: any) => {
      if (o.isSkinnedMesh && o.material) {
        const arr = Array.isArray(o.material) ? o.material : [o.material]
        for (const m of arr) {
          if (m.color) m.color.set(isBot ? '#5a6470' : '#a8b8d0')
          m.transparent = true
          m.opacity = 1
          mats.push(m)
        }
      }
    })
    materialsRef.current = mats
  }, [scene, isBot])

  // Teardown — stop everything when the player despawns.
  useEffect(() => {
    return () => {
      mixer.stopAllAction()
      mixer.uncacheRoot(scene)
    }
  }, [mixer, scene])

  useFrame((_, dt) => {
    mixer.update(dt)

    // Spawn-protection opacity flicker. Mirrors the previous capsule's
    // ping-pong so the visual cue stays familiar.
    const opacity = protectedFlag
      ? 0.5 + 0.15 * Math.sin((performance.now() / 1000) * Math.PI * 4)
      : 1
    for (const m of materialsRef.current) m.opacity = opacity

    // Pick clip from state + visible horizontal speed. Only act on
    // change — the cross-fade isn't free and re-triggering it every
    // frame would never let any clip settle.
    let next: ClipName
    if (state === 'sliding') {
      next = 'strafe'
    } else {
      const sp = speedRef.current
      if (sp >= RUN_MIN_SPEED) next = 'run'
      else if (sp >= WALK_MIN_SPEED) next = 'walk'
      else next = 'walk' // no idle clip yet — walk freezes in place at v=0
    }

    if (currentClipName.current === next) return
    const clip = clips[next]
    if (!clip) return

    const newAction = mixer.clipAction(clip)
    newAction.reset().setLoop(LoopRepeat, Infinity).fadeIn(FADE_S).play()
    const prev = currentAction.current
    if (prev && prev !== newAction) prev.fadeOut(FADE_S)

    currentAction.current = newAction
    currentClipName.current = next
  })

  return (
    <primitive
      object={scene}
      scale={MIXAMO_SCALE}
      position-y={MIXAMO_FOOT_OFFSET}
    />
  )
}

// Pre-warm the drei FBX cache so the first remote player that mounts
// doesn't trigger three separate ~1.8MB downloads under Suspense.
// Calling this in App.tsx's mount effect kicks the loads off as soon
// as the page boots.
export function preloadCharacterAssets() {
  useFBX.preload(WALK_FBX)
  useFBX.preload(RUN_FBX)
  useFBX.preload(STRAFE_FBX)
}
