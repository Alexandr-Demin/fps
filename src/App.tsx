import { Canvas } from '@react-three/fiber'
import { Suspense, useEffect, useRef } from 'react'
import { ACESFilmicToneMapping, PCFSoftShadowMap, SRGBColorSpace } from 'three'
import { Scene } from './scene/Scene'
import { HUD } from './ui/HUD'
import { MainMenu, DeathScreen, LevelSelect } from './ui/Menu'
import { SettingsDialog } from './ui/SettingsDialog'
import { Input } from './systems/input/input'
import { useGameStore } from './state/gameStore'
import { useEditorStore } from './state/editorStore'
import { CAMERA } from './core/constants'
import { AudioBus } from './systems/audio/AudioSystem'
import { EditorUI } from './editor/EditorUI'
import { MultiplayerConnect } from './ui/MultiplayerConnect'

export function App() {
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const pauseMatch = useGameStore((s) => s.pauseMatch)
  const phase = useGameStore((s) => s.phase)

  // Bind global input to the canvas DOM element once it's mounted
  useEffect(() => {
    const el = canvasContainerRef.current
    if (!el) return
    Input.attach(el)
    const onClick = () => {
      const ph = useGameStore.getState().phase
      if (ph === 'playing' || ph === 'mpPlaying') Input.requestLock()
    }
    el.addEventListener('click', onClick)
    return () => {
      el.removeEventListener('click', onClick)
      Input.detach()
    }
  }, [])

  // ESC → pause (when playing). The browser fires its own pointerlock-loss
  // on ESC; we listen for that to switch into paused state.
  useEffect(() => {
    const onPlc = () => {
      if (document.pointerLockElement) return
      if (useGameStore.getState().phase === 'playing') {
        pauseMatch()
      }
    }
    document.addEventListener('pointerlockchange', onPlc)
    return () => document.removeEventListener('pointerlockchange', onPlc)
  }, [pauseMatch])

  // M key toggles mute (works both in gameplay and menus)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyM' && !e.repeat) {
        useGameStore.getState().toggleMute()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Keep audio bus mute state synced with store
  useEffect(() => {
    return useGameStore.subscribe(
      (s) => s.muted,
      (m) => AudioBus.setMuted(m)
    )
  }, [])

  // F2 toggles the map editor — only available outside active gameplay
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'F2' || e.repeat) return
      const g = useGameStore.getState()
      const ed = useEditorStore.getState()
      if (g.phase === 'editor') {
        // Close
        g.exitEditor()
        ed.reset()
      } else if (g.phase === 'menu' || g.phase === 'paused') {
        ed.reset()
        g.enterEditor()
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div
      ref={canvasContainerRef}
      style={{ position: 'fixed', inset: 0, background: '#050505' }}
    >
      <Canvas
        shadows={{ type: PCFSoftShadowMap }}
        dpr={[1, 1.5]}
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
          alpha: false,
          stencil: false,
        }}
        camera={{
          fov: CAMERA.FOV_BASE,
          near: 0.05,
          far: 200,
          position: [0, 2, 5],
        }}
        onCreated={({ gl }) => {
          gl.toneMapping = ACESFilmicToneMapping
          gl.toneMappingExposure = 1.75
          gl.outputColorSpace = SRGBColorSpace
        }}
        onPointerMissed={(e) => {
          if (useGameStore.getState().phase === 'editor') {
            console.log('[editor] pointer MISSED — no R3F target', e.button)
          }
        }}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>

      {(phase === 'playing' || phase === 'mpPlaying') && <HUD />}
      <MainMenu />
      <LevelSelect />
      <MultiplayerConnect />
      <DeathScreen />
      <SettingsDialog />
      {phase === 'editor' && <EditorUI />}
    </div>
  )
}
