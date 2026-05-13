import { Fog } from 'three'
import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { Physics } from '@react-three/rapier'
import { RENDER } from '../core/constants'
import { Lighting } from './lighting/Lighting'
import { Impacts } from './fx/Impacts'
import { FxTicker } from './fx/FxTicker'
import { PlayerController } from '../systems/movement/PlayerController'
import { Weapon } from '../systems/combat/Weapon'
import { BotSwarm } from '../systems/ai/BotSwarm'
import { MapLoader } from './map/MapLoader'
import { useGameStore } from '../state/gameStore'
import { EditorScene } from '../editor/EditorScene'
import { NetRoom } from '../systems/net/NetRoom'

function FogSetter() {
  const { scene } = useThree()
  const map = useGameStore((s) => s.currentMap)
  const phase = useGameStore((s) => s.phase)
  useEffect(() => {
    if (phase === 'editor') {
      // Disable fog while editing so all geometry is readable regardless of
      // distance from camera. Restored when leaving editor.
      scene.fog = null
      return () => {}
    }
    const f = map.fog ?? { near: RENDER.FOG_NEAR, far: RENDER.FOG_FAR, color: RENDER.FOG_COLOR }
    scene.fog = new Fog(f.color, f.near, f.far)
    scene.background = null
    return () => {
      scene.fog = null
    }
  }, [scene, map, phase])
  return null
}

export function Scene() {
  const phase = useGameStore((s) => s.phase)
  const map = useGameStore((s) => s.currentMap)
  const isEditor = phase === 'editor'

  return (
    <>
      <FogSetter />
      <color attach="background" args={[isEditor ? '#1a2030' : '#080a0e']} />
      {!isEditor && <Lighting />}

      {isEditor ? (
        // Editor scene: no physics, no gameplay systems. The editor renders
        // map data directly and adds its own orbit/transform controls.
        <EditorScene />
      ) : (
        <Physics gravity={[0, -28, 0]} timeStep={1 / 60}>
          <MapLoader map={map} />
          <PlayerController />
          {phase === 'playing' && <BotSwarm />}
          <Weapon />
          {(phase === 'mpPlaying' || phase === 'mpPaused') && <NetRoom />}
        </Physics>
      )}

      <Impacts />
      <FxTicker />
    </>
  )
}
