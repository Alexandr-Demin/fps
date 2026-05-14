import { Canvas } from '@react-three/fiber'
import { Suspense, useEffect, useRef } from 'react'
import { ACESFilmicToneMapping, PCFSoftShadowMap, SRGBColorSpace } from 'three'
import { Scene } from './scene/Scene'
import { HUD } from './ui/HUD'
import { MainMenu, DeathScreen, LevelSelect, PracticeSelect, MpPauseMenu } from './ui/Menu'
import { MpEndScreen } from './ui/MpEndScreen'
import { SettingsDialog } from './ui/SettingsDialog'
import { Input } from './systems/input/input'
import { useGameStore } from './state/gameStore'
import { useEditorStore } from './state/editorStore'
import { useNetStore } from './state/netStore'
import { CAMERA } from './core/constants'
import { AudioBus } from './systems/audio/AudioSystem'
import { EditorUI } from './editor/EditorUI'
import { MultiplayerConnect } from './ui/MultiplayerConnect'
import { MpLobby } from './ui/MpLobby'
import { MpReconnect } from './ui/MpReconnect'
import { MpScoreboard } from './ui/MpScoreboard'
import { KillFeed } from './ui/KillFeed'
import { preloadCharacterAssets } from './systems/character/CharacterModel'

export function App() {
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const pauseMatch = useGameStore((s) => s.pauseMatch)
  const phase = useGameStore((s) => s.phase)

  // Kick the character FBX downloads off as early as possible so the
  // first remote player to spawn doesn't sit invisible while ~5MB
  // streams in under Suspense.
  useEffect(() => {
    preloadCharacterAssets()
  }, [])

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
  // Track whether the upcoming pointer-lock release was caused by an Alt-tap
  // (intentional cursor release for tab switching). The pointerlockchange
  // handler reads this and skips the auto-pause when true.
  const altReleasingRef = useRef(false)

  useEffect(() => {
    const onPlc = () => {
      if (document.pointerLockElement) {
        // Re-acquired — clear any stale flag from a previous Alt-tap.
        altReleasingRef.current = false
        return
      }
      if (altReleasingRef.current) {
        // Alt-initiated release: leave the cursor free but stay in the
        // current phase. The user clicks the canvas to re-capture.
        altReleasingRef.current = false
        return
      }
      const ph = useGameStore.getState().phase
      if (ph === 'playing') {
        pauseMatch()
      } else if (ph === 'mpPlaying') {
        // During reconnect the cursor is released intentionally so the
        // overlay's CANCEL button is clickable — don't also throw up the
        // MP pause menu on top.
        if (useNetStore.getState().reconnecting) return
        // Network match: don't disconnect — just open the MP pause overlay.
        useGameStore.getState().setPhase('mpPaused')
      }
    }
    document.addEventListener('pointerlockchange', onPlc)
    return () => document.removeEventListener('pointerlockchange', onPlc)
  }, [pauseMatch])

  // Alt tap → release cursor without entering pause. Allows quick alt-tab /
  // switch between browser tabs without exiting the match.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'AltLeft' && e.code !== 'AltRight') return
      if (e.repeat) return
      const ph = useGameStore.getState().phase
      if (ph !== 'playing' && ph !== 'mpPlaying') return
      altReleasingRef.current = true
      Input.exitLock()
      // Prevent the browser's default Alt behavior (focus menu bar on Windows)
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
      <KillFeed />
      <MpScoreboard />
      <MainMenu />
      <LevelSelect />
      <PracticeSelect />
      <MultiplayerConnect />
      <MpLobby />
      <MpPauseMenu />
      <MpEndScreen />
      <MpReconnect />
      <DeathScreen />
      <SettingsDialog />
      {phase === 'editor' && <EditorUI />}
    </div>
  )
}
