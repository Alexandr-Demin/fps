import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import { Group, Mesh, Quaternion, Vector3 } from 'three'
import { CAMERA, HITBOX, WEAPON } from '../../core/constants'
import { Input } from '../input/input'
import { useGameStore } from '../../state/gameStore'
import { castHitscan } from './hitscan'
import { AudioBus } from '../audio/AudioSystem'
import { ViewModel, type ViewModelHandle } from './ViewModel'
import { BotRegistry } from '../ai/BotRegistry'
import { playerHandle } from '../movement/PlayerController'
import { NetClient } from '../net/NetClient'
import { useNetStore } from '../../state/netStore'
import type { HitZone } from '@shared/protocol'

const tmpDir = new Vector3()
const tmpQuat = new Quaternion()
const FORWARD = Object.freeze({ x: 0, y: 0, z: -1 })

export function Weapon() {
  const { camera } = useThree()
  const { world, rapier } = useRapier()
  const viewModelRef = useRef<ViewModelHandle>(null!)
  const cooldown = useRef(0)
  const reloadCooldown = useRef(0)
  const shotsInBurst = useRef(0)
  const lastShotAt = useRef(0)

  const phase = useGameStore((s) => s.phase)
  const reloading = useGameStore((s) => s.reloading)
  const ammo = useGameStore((s) => s.ammo)
  const reserve = useGameStore((s) => s.reserve)

  // Trigger reload completion timer
  useEffect(() => {
    if (!reloading) return
    const t = setTimeout(() => {
      useGameStore.getState().finishReload()
    }, WEAPON.RELOAD_TIME * 1000)
    AudioBus.playReload()
    viewModelRef.current?.playReload(WEAPON.RELOAD_TIME)
    return () => clearTimeout(t)
  }, [reloading])

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 1 / 30)
    cooldown.current = Math.max(0, cooldown.current - dt)
    reloadCooldown.current = Math.max(0, reloadCooldown.current - dt)

    if (phase !== 'playing' && phase !== 'mpPlaying') return

    // Determine if we should fire this frame. Allow held-fire (semi-auto feel
    // is preserved by FIRE_INTERVAL gating).
    const wantFire = Input.state.fireHeld
    if (wantFire && cooldown.current <= 0 && !reloading) {
      const fired = useGameStore.getState().consumeAmmo()
      if (fired) {
        cooldown.current = WEAPON.FIRE_INTERVAL
        fireShot()
      } else if (reserve > 0) {
        useGameStore.getState().beginReload()
      }
    }

    // Reload trigger
    if (Input.state.reloadPressed) {
      // consumed in input system shortly — we just check the held state
    }
    // Explicit reload check via consumeEdges happens in player controller;
    // weapon polls a separate flag set by global key listener:
    if (kReloadEdge.current) {
      kReloadEdge.current = false
      useGameStore.getState().beginReload()
    }
  })

  // Reload key edge listener separate from PlayerController to keep concerns clean
  const kReloadEdge = useRef(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyR' && !e.repeat) kReloadEdge.current = true
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function fireShot() {
    // Forward direction from camera
    camera.getWorldQuaternion(tmpQuat)
    tmpDir.set(FORWARD.x, FORWARD.y, FORWARD.z).applyQuaternion(tmpQuat).normalize()

    // Apply small spread
    const spread = WEAPON.SPREAD_BASE
    tmpDir.x += (Math.random() - 0.5) * spread
    tmpDir.y += (Math.random() - 0.5) * spread
    tmpDir.z += (Math.random() - 0.5) * spread
    tmpDir.normalize()

    const origin = camera.position.clone()
    const hit = castHitscan(world, rapier, origin, tmpDir, playerHandle.body as any)

    // FX + audio
    const store = useGameStore.getState()
    store.addMuzzleFlash()
    store.recordShot()
    AudioBus.playPistol([origin.x, origin.y, origin.z])

    // In MP, broadcast the shot so other clients can play positional
    // gunfire audio. Cosmetic-only; server doesn't run hit detection here.
    if (phase === 'mpPlaying') {
      NetClient.sendShot(
        [origin.x, origin.y, origin.z],
        [tmpDir.x, tmpDir.y, tmpDir.z],
      )
    }

    if (hit) {
      store.addImpact(
        [hit.point.x, hit.point.y, hit.point.z],
        [hit.normal.x, hit.normal.y, hit.normal.z],
        hit.isBot || hit.isRemotePlayer
      )
      AudioBus.playImpact([hit.point.x, hit.point.y, hit.point.z])
      if (hit.isRemotePlayer && hit.remotePlayerId) {
        // Resolve the hit zone by comparing the impact-point's Y to the
        // remote player's body center (mirrors the bot HITBOX logic so
        // damage values are consistent across SP and MP).
        const remote = useNetStore.getState().remotePlayers[hit.remotePlayerId]
        let multiplier = HITBOX.TORSO.multiplier
        let zone: HitZone = 'torso'
        if (remote) {
          const dy = hit.point.y - remote.pos[1]
          if (dy >= HITBOX.HEAD.yMin) {
            multiplier = HITBOX.HEAD.multiplier
            zone = 'head'
          } else if (dy >= HITBOX.TORSO.yMin) {
            multiplier = HITBOX.TORSO.multiplier
            zone = 'torso'
          } else {
            multiplier = HITBOX.LEGS.multiplier
            zone = 'legs'
          }
        }
        const damage = WEAPON.DAMAGE * multiplier
        NetClient.sendHit(hit.remotePlayerId, damage, zone)
        store.registerHit()
        // Feed the hit into the local debug log. `killed` is always false
        // here — the actual frag confirmation comes from the server via
        // `died` (handled in NetClient) since the shooter can't know if a
        // peer also dealt damage in parallel.
        const zoneUpper = (
          { head: 'HEAD', torso: 'TORSO', legs: 'LEGS' } as const
        )[zone]
        store.recordHit(zoneUpper, damage, false)
      }
      if (hit.isBot && hit.botId != null) {
        // Resolve hit zone by Y offset from the bot's center.
        const bot = BotRegistry.get(hit.botId)
        let multiplier = HITBOX.TORSO.multiplier
        let zone: 'HEAD' | 'TORSO' | 'LEGS' = 'TORSO'
        if (bot) {
          const dy = hit.point.y - bot.position.y
          if (dy >= HITBOX.HEAD.yMin) {
            multiplier = HITBOX.HEAD.multiplier
            zone = 'HEAD'
          } else if (dy >= HITBOX.TORSO.yMin) {
            multiplier = HITBOX.TORSO.multiplier
            zone = 'TORSO'
          } else {
            multiplier = HITBOX.LEGS.multiplier
            zone = 'LEGS'
          }
        }
        const dmg = WEAPON.DAMAGE * multiplier
        const killed = BotRegistry.damage(hit.botId, dmg)
        store.registerHit()
        store.recordHit(zone, dmg, killed)
        if (killed) {
          store.registerKill()
          AudioBus.playKillFeedback()
        }
      }
    }

    // ===== Recoil pattern =====
    // CS/Valorant-style: vertical kick grows with sustained fire, horizontal
    // alternates left/right with jitter. Pattern resets after RECOIL_BURST_RESET
    // seconds without firing, so tap-fire stays accurate.
    const now = performance.now() / 1000
    if (now - lastShotAt.current > WEAPON.RECOIL_BURST_RESET) {
      shotsInBurst.current = 0
    }
    shotsInBurst.current++
    lastShotAt.current = now
    const n = shotsInBurst.current

    const pitchMul = Math.min(WEAPON.RECOIL_PITCH_MAX, 1 + (n - 1) * WEAPON.RECOIL_PITCH_GROWTH)
    const yawMul   = Math.min(WEAPON.RECOIL_YAW_MAX,   0.4 + (n - 1) * WEAPON.RECOIL_YAW_GROWTH)
    const pitchJitter = 0.88 + Math.random() * 0.24
    const yawJitter   = 0.55 + Math.random() * 0.9
    const yawSign = (n % 2 === 0) ? -1 : 1
    // Positive pitch in YXZ Euler = camera tilts UP. Real recoil throws the
    // muzzle up → barrel-up → view-up → positive pitch kick.
    const pitchKick = WEAPON.RECOIL_PITCH * pitchMul * pitchJitter
    const yawKick   = WEAPON.RECOIL_YAW * yawMul * yawJitter * yawSign

    window.dispatchEvent(
      new CustomEvent('gz:recoil', {
        detail: {
          pitch: pitchKick,
          yaw: yawKick,
          punch: WEAPON.RECOIL_PUNCH * (0.7 + Math.min(1, n * 0.12)),
        },
      })
    )

    viewModelRef.current?.kick()
  }

  return <ViewModel ref={viewModelRef} />
}
