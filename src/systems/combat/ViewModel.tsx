import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Group, Mesh, MeshStandardMaterial, PointLight, Vector3 } from 'three'
import { useGameStore } from '../../state/gameStore'
import { playerHandle } from '../movement/PlayerController'
import { Input } from '../input/input'
import { WEAPON } from '../../core/constants'

export interface ViewModelHandle {
  kick: () => void
  playReload: (durationSec: number) => void
}

/**
 * First-person view model: parented to the camera through useFrame
 * (not as a Three child of camera, because R3F's default camera lives outside
 * the scene). We update its world transform every frame to match the camera
 * plus an offset + procedural sway / bob / recoil.
 */
export const ViewModel = forwardRef<ViewModelHandle>(function ViewModel(_, ref) {
  const groupRef = useRef<Group>(null!)
  const flashLightRef = useRef<PointLight>(null!)
  const flashMeshRef = useRef<Mesh>(null!)
  const muzzleAnchor = useRef(new Vector3())

  // Spring-damper state for view-model kick. Two channels:
  //   pos.z = backwards travel along barrel axis
  //   rot.x = nose-up pitch
  const kickPos = useRef(0)        // current offset (m)
  const kickVel = useRef(0)        // m/s
  const kickRot = useRef(0)        // current rotation (rad)
  const kickRotVel = useRef(0)
  const reloadPhase = useRef(0)
  const reloadDuration = useRef(0)
  const swayPos = useRef(new Vector3())
  const swayPosTarget = useRef(new Vector3())

  const { camera } = useThree()

  useImperativeHandle(ref, () => ({
    kick: () => {
      // Inject impulse into the spring — gun shoots backwards and tilts up.
      kickVel.current += WEAPON.VIEWMODEL_KICK_IMPULSE * 0.05
      kickRotVel.current += WEAPON.VIEWMODEL_KICK_IMPULSE * 0.18
      // briefly fire muzzle flash light
      if (flashLightRef.current) flashLightRef.current.intensity = 8
      if (flashMeshRef.current) (flashMeshRef.current.material as any).opacity = 1
    },
    playReload: (durationSec) => {
      reloadDuration.current = durationSec
      reloadPhase.current = 0
    },
  }))

  // Base offset of weapon relative to camera (right-hand FPS standard)
  const baseOffset = useMemo(() => new Vector3(0.22, -0.22, -0.42), [])
  // ADS offset — camera must look down the sight plane.
  // Sights sit at gun-local y=0.114 (rear) / y=0.118 (front). Picking
  // ads.y = -0.114 puts the rear-sight notch level with the camera optical
  // axis, so the player sees the front post settled into the rear notch.
  const adsOffset = useMemo(() => new Vector3(0.0, -0.114, -0.28), [])
  const currentOffset = useRef(new Vector3().copy(baseOffset))
  const adsAmount = useRef(0)

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 1 / 30)
    const g = groupRef.current
    if (!g) return

    // ---- recoil spring integration (semi-implicit Euler) ----
    const K = WEAPON.VIEWMODEL_SPRING_K
    const C = WEAPON.VIEWMODEL_SPRING_DAMP
    // Position channel
    kickVel.current += (-K * kickPos.current - C * kickVel.current) * dt
    kickPos.current += kickVel.current * dt
    // Rotation channel
    kickRotVel.current += (-K * kickRot.current - C * kickRotVel.current) * dt
    kickRot.current += kickRotVel.current * dt

    // ---- reload anim phase ----
    if (reloadDuration.current > 0) {
      reloadPhase.current += dt / reloadDuration.current
      if (reloadPhase.current >= 1) {
        reloadPhase.current = 0
        reloadDuration.current = 0
      }
    }

    // ---- sway from movement velocity ----
    const vel = playerHandle.vel
    const horizSpeed = Math.hypot(vel.x, vel.z)
    swayPosTarget.current.set(
      -vel.x * 0.003,
      -horizSpeed * 0.004 + Math.sin(performance.now() * 0.008) * 0.005,
      -horizSpeed * 0.002
    )
    swayPos.current.lerp(swayPosTarget.current, Math.min(1, dt * 6))

    // ---- compute final offset in camera space (lerp toward ADS pose) ----
    const wantAds = Input.state.aimHeld ? 1 : 0
    adsAmount.current += (wantAds - adsAmount.current) * Math.min(1, dt * 14)
    // Lerp base ↔ ads offset by adsAmount
    currentOffset.current.lerpVectors(baseOffset, adsOffset, adsAmount.current)
    const offset = new Vector3().copy(currentOffset.current)
    // Sway is dampened while aiming
    const swayDamp = 1 - adsAmount.current * 0.85
    offset.addScaledVector(swayPos.current, swayDamp)
    // kickPos is signed — positive = pushed back (+Z in camera space)
    offset.z += kickPos.current * (1 - adsAmount.current * 0.35)
    offset.y += kickPos.current * 0.25 + Math.max(0, kickRot.current) * 0.02

    // reload: dip down + rotate
    if (reloadDuration.current > 0) {
      const p = reloadPhase.current
      const dip = Math.sin(p * Math.PI) * 0.18
      offset.y -= dip
      offset.z += dip * 0.5
    }

    // Apply offset in camera space
    const worldOffset = offset.clone().applyQuaternion(camera.quaternion)
    g.position.copy(camera.position).add(worldOffset)
    g.quaternion.copy(camera.quaternion)

    // Pitch up slightly with recoil + reload rotation
    // rotateX(+angle) tilts the gun barrel upwards (positive pitch). Match
    // camera-recoil so the view-model rises in concert with the view kick.
    const localPitch = kickRot.current * 0.35 + (reloadDuration.current > 0 ? Math.sin(reloadPhase.current * Math.PI) * 0.9 : 0)
    g.rotateX(localPitch)
    g.rotateZ(reloadDuration.current > 0 ? Math.sin(reloadPhase.current * Math.PI) * 0.3 : 0)

    // Muzzle flash decay
    if (flashLightRef.current) {
      flashLightRef.current.intensity = Math.max(0, flashLightRef.current.intensity - dt * 80)
    }
    if (flashMeshRef.current) {
      const m = flashMeshRef.current.material as MeshStandardMaterial
      m.opacity = Math.max(0, m.opacity - dt * 18)
    }
  })

  return (
    <group ref={groupRef} renderOrder={1000}>
      {/* Pistol body */}
      <mesh position={[0, 0, 0]} castShadow={false}>
        <boxGeometry args={[0.06, 0.12, 0.22]} />
        <meshStandardMaterial color="#1a1c20" metalness={0.7} roughness={0.45} />
      </mesh>
      {/* Slide */}
      <mesh position={[0, 0.07, -0.02]}>
        <boxGeometry args={[0.05, 0.045, 0.24]} />
        <meshStandardMaterial color="#262a30" metalness={0.85} roughness={0.3} />
      </mesh>
      {/* Barrel */}
      <mesh position={[0, 0.07, -0.18]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.015, 0.015, 0.08, 12]} />
        <meshStandardMaterial color="#0a0b0d" metalness={0.9} roughness={0.25} />
      </mesh>
      {/* Grip */}
      <mesh position={[0, -0.09, 0.06]} rotation={[0.2, 0, 0]}>
        <boxGeometry args={[0.055, 0.13, 0.085]} />
        <meshStandardMaterial color="#15171a" metalness={0.2} roughness={0.85} />
      </mesh>
      {/* Trigger guard */}
      <mesh position={[0, -0.025, 0.0]}>
        <torusGeometry args={[0.025, 0.005, 6, 16, Math.PI]} />
        <meshStandardMaterial color="#202327" metalness={0.5} roughness={0.6} />
      </mesh>
      {/* Front sight — tall thin post with bright tritium-style emissive dot */}
      <mesh position={[0, 0.118, -0.12]}>
        <boxGeometry args={[0.005, 0.030, 0.008]} />
        <meshStandardMaterial color="#0a0b0d" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.126, -0.122]}>
        <boxGeometry args={[0.0055, 0.005, 0.0035]} />
        <meshStandardMaterial color="#ffd267" emissive="#ffb040" emissiveIntensity={2.4} toneMapped={false} />
      </mesh>

      {/* Rear sight — two posts forming the notch, with dots flanking */}
      <mesh position={[-0.013, 0.114, 0.08]}>
        <boxGeometry args={[0.014, 0.022, 0.012]} />
        <meshStandardMaterial color="#0a0b0d" roughness={0.6} />
      </mesh>
      <mesh position={[ 0.013, 0.114, 0.08]}>
        <boxGeometry args={[0.014, 0.022, 0.012]} />
        <meshStandardMaterial color="#0a0b0d" roughness={0.6} />
      </mesh>
      {/* Rear notch dots */}
      <mesh position={[-0.014, 0.118, 0.074]}>
        <boxGeometry args={[0.005, 0.005, 0.003]} />
        <meshStandardMaterial color="#ffd267" emissive="#ffb040" emissiveIntensity={1.6} toneMapped={false} />
      </mesh>
      <mesh position={[ 0.014, 0.118, 0.074]}>
        <boxGeometry args={[0.005, 0.005, 0.003]} />
        <meshStandardMaterial color="#ffd267" emissive="#ffb040" emissiveIntensity={1.6} toneMapped={false} />
      </mesh>

      {/* Muzzle flash sprite */}
      <mesh ref={flashMeshRef} position={[0, 0.07, -0.28]} renderOrder={1001}>
        <planeGeometry args={[0.18, 0.18]} />
        <meshStandardMaterial
          color="#ffb070"
          emissive="#ffaa55"
          emissiveIntensity={2}
          transparent
          opacity={0}
          depthWrite={false}
        />
      </mesh>
      {/* Muzzle flash light */}
      <pointLight
        ref={flashLightRef}
        position={[0, 0.07, -0.28]}
        intensity={0}
        distance={6}
        color="#ffaa66"
        decay={2}
      />
    </group>
  )
})
