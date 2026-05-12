import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import { useGameStore } from '../../state/gameStore'
import { AudioBus } from '../../systems/audio/AudioSystem'

const fwd = new Vector3()

/** Ticks FX lifetimes and forwards the listener pose to spatial audio. */
export function FxTicker() {
  const { camera } = useThree()

  useFrame((_, dt) => {
    const s = useGameStore.getState()
    s.tickFx(dt)
    s.tickHitEvents(dt)
    camera.getWorldDirection(fwd)
    AudioBus.setListener(
      [camera.position.x, camera.position.y, camera.position.z],
      [fwd.x, fwd.y, fwd.z],
      [0, 1, 0]
    )
  })

  return null
}
