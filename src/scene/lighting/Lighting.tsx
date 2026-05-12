import { RENDER } from '../../core/constants'

export function Lighting() {
  return (
    <>
      {/* Heavy fragment-shader cost grows linearly with point lights on
          meshStandardMaterial — keep the count low and compensate with
          stronger ambient/hemi for the indirect lift. */}
      <ambientLight intensity={1.25} color={RENDER.AMBIENT_COLOR} />

      {/* Sole shadow caster — directional sun-equivalent */}
      <directionalLight
        position={[20, 35, 10]}
        intensity={2.6}
        color={RENDER.KEY_COLOR}
        castShadow
        shadow-mapSize-width={RENDER.SHADOW_MAP_SIZE}
        shadow-mapSize-height={RENDER.SHADOW_MAP_SIZE}
        shadow-camera-near={0.5}
        shadow-camera-far={120}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
        shadow-bias={-0.0015}
      />

      {/* Warm rim from reactor core — single accent */}
      <pointLight position={[0, 12, 0]} intensity={5.0} distance={44} color={RENDER.RIM_COLOR} decay={1.6} />

      {/* Two ceiling fixtures — diagonal placement covers most of the arena
          while keeping fragment cost down. Drop the other 3 — ambient + hemi
          pick up the slack. */}
      <pointLight position={[-12, 17, -12]} intensity={6.0} distance={48} color="#bcd0ff" decay={1.7} />
      <pointLight position={[ 12, 17,  12]} intensity={6.0} distance={48} color="#bcd0ff" decay={1.7} />

      {/* Hemi for soft sky/ground gradient — almost-free indirect fill */}
      <hemisphereLight args={['#9aaac4', '#2c303a', 1.1]} />
    </>
  )
}
