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
const IDLE_FBX = '/assets/character/idle.fbx'
const JUMP_FBX = '/assets/character/jump.fbx'

// Mixamo files export in centimetres; Three.js works in metres.
const MIXAMO_SCALE = 0.01
// Mixamo characters pivot at the hips, with feet roughly at y=0 of the
// scaled mesh. Offset down so the silhouette sits inside the same
// vertical band as the old capsule (top +0.9, bottom -0.9).
const MIXAMO_FOOT_OFFSET = -PLAYER.HEIGHT * 0.5
// Mixamo characters are authored facing +Z in their local space; our
// player convention is yaw=0 → facing -Z (matches the camera-forward
// math in PlayerController). Without this 180° flip the character
// shows up walking backwards on every snapshot.
const MIXAMO_FACING_FIX = Math.PI

// Velocity bands for the locomotion state machine. Cross-fade smooths
// the discontinuities so we don't need hysteresis here.
const IDLE_MAX_SPEED = 0.5
const RUN_MIN_SPEED = 7.0
// Any non-trivial vertical motion picks the jump clip. Bot-only ground
// movement keeps |vy| ~ 0 so this threshold doesn't false-trigger.
const JUMP_MIN_ABS_VY = 1.5
const FADE_S = 0.2

type ClipName = 'idle' | 'walk' | 'run' | 'strafe' | 'jump'

export interface CharacterMotion {
  // Horizontal speed in m/s, post-lerp smoothed.
  horizontal: number
  // Signed vertical speed in m/s; positive = ascending.
  vertical: number
}

/**
 * Mixamo bakes hip translation into every clip ("root motion"), which
 * would drag the character forward independent of the server-reported
 * position. Strip the Hips position channel so the body cycles in
 * place and the server position is the sole source of locomotion.
 */
function stripRootMotion(clip: AnimationClip): AnimationClip {
  // Strip both .position and .scale tracks on the Hips bone. Position
  // is the obvious one (root forward translation + walking bob). Scale
  // tracks are rare in Mixamo exports but show up occasionally and
  // would cause the body to pulse if left in place.
  clip.tracks = clip.tracks.filter(
    (t) => !/Hips\.(position|scale)$/i.test(t.name),
  )
  return clip
}

interface Props {
  state: PlayerState
  // Mutable ref instead of a regular prop — motion updates every frame
  // and we don't want to re-render the whole tree at 60Hz just to feed
  // it to the animation picker.
  motionRef: MutableRefObject<CharacterMotion>
  isBot: boolean
  // Mirrors PlayerSnap.protected — applied per-frame so the flicker
  // matches the previous capsule's behaviour.
  protectedFlag: boolean
}

/**
 * Skinned humanoid model with five locomotion clips. Replaces the
 * procedural capsule used through phase-4. The mesh comes from
 * walk.fbx; the other FBXs contribute their animation clip only.
 *
 * Local player still uses the procedural PlayerController (first-person
 * camera, no body to render). This component is mounted only for
 * remote players and bots.
 */
export function CharacterModel({
  state,
  motionRef,
  isBot,
  protectedFlag,
}: Props) {
  const walkFBX = useFBX(WALK_FBX) as Group
  const runFBX = useFBX(RUN_FBX) as Group
  const strafeFBX = useFBX(STRAFE_FBX) as Group
  const idleFBX = useFBX(IDLE_FBX) as Group
  const jumpFBX = useFBX(JUMP_FBX) as Group

  // Per-role base mesh — humans get the walk.fbx character (the one
  // skinned with the rifle-hold pose); bots get the idle.fbx character
  // (which on Mixamo's Orc Idle page is bound to the orc model by
  // default). SkeletonUtils.clone preserves the skinned-mesh ↔
  // skeleton link so each remote player animates independently, and
  // every Mixamo character shares the same `mixamorig:*` bone naming
  // so all five clips apply to either mesh without translation.
  const baseFBX = isBot ? idleFBX : walkFBX
  const scene = useMemo(
    () => SkeletonUtils.clone(baseFBX) as Group,
    [baseFBX],
  )

  // Clip library, root motion stripped once per source. clone() so we
  // don't mutate the cached drei-managed clip arrays.
  const clips = useMemo(() => {
    const w = walkFBX.animations[0]?.clone()
    const r = runFBX.animations[0]?.clone()
    const s = strafeFBX.animations[0]?.clone()
    const i = idleFBX.animations[0]?.clone()
    const j = jumpFBX.animations[0]?.clone()
    return {
      walk: w ? stripRootMotion(w) : null,
      run: r ? stripRootMotion(r) : null,
      strafe: s ? stripRootMotion(s) : null,
      idle: i ? stripRootMotion(i) : null,
      jump: j ? stripRootMotion(j) : null,
    } as Record<ClipName, AnimationClip | null>
  }, [walkFBX, runFBX, strafeFBX, idleFBX, jumpFBX])

  const mixer = useMemo(() => new AnimationMixer(scene), [scene])
  const currentAction = useRef<AnimationAction | null>(null)
  const currentClipName = useRef<ClipName | ''>('')
  // Flattened list of every SkinnedMesh material in the scene. Built
  // once per scene clone; the per-frame protection flicker writes
  // opacity through this list rather than re-traversing each tick.
  const materialsRef = useRef<any[]>([])

  // Material tint — Mixamo characters default to a beige skin; recolour
  // them so bots read as "orc-themed test fixtures" and humans stay
  // close to the old arena-blue silhouette. transparent=true is
  // required so the protection ping-pong below can drive opacity.
  useEffect(() => {
    const mats: any[] = []
    scene.traverse((o: any) => {
      if (o.isSkinnedMesh && o.material) {
        const arr = Array.isArray(o.material) ? o.material : [o.material]
        for (const m of arr) {
          if (m.color) m.color.set(isBot ? '#7a8b3a' : '#a8b8d0')
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

    // Pick clip from state + visible horizontal / vertical speed. Only
    // act on change — the cross-fade isn't free and re-triggering it
    // every frame would never let any clip settle. Priority order:
    //   1. airborne → jump
    //   2. sliding state → strafe (closest visual we have)
    //   3. running speed → run
    //   4. walking speed → walk
    //   5. otherwise → idle
    const motion = motionRef.current
    let next: ClipName
    if (Math.abs(motion.vertical) > JUMP_MIN_ABS_VY) {
      next = 'jump'
    } else if (state === 'sliding') {
      next = 'strafe'
    } else if (motion.horizontal >= RUN_MIN_SPEED) {
      next = 'run'
    } else if (motion.horizontal > IDLE_MAX_SPEED) {
      next = 'walk'
    } else {
      next = 'idle'
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
      rotation-y={MIXAMO_FACING_FIX}
    />
  )
}

// Pre-warm the drei FBX cache so the first remote player that mounts
// doesn't trigger separate ~1.8MB+ downloads under Suspense. Calling
// this in App.tsx's mount effect kicks the loads off as soon as the
// page boots.
export function preloadCharacterAssets() {
  useFBX.preload(WALK_FBX)
  useFBX.preload(RUN_FBX)
  useFBX.preload(STRAFE_FBX)
  useFBX.preload(IDLE_FBX)
  useFBX.preload(JUMP_FBX)
}
