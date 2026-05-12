import { useRef } from 'react'
import { useEditorStore } from '../state/editorStore'
import { useGameStore } from '../state/gameStore'
import { Inspector } from './Inspector'
import { TemplateChooser } from './TemplateChooser'
import type { EntityKind } from '../core/mapTypes'

const ADD_BUTTONS: { kind: EntityKind; label: string }[] = [
  { kind: 'concrete', label: '+ CONCRETE' },
  { kind: 'metal', label: '+ METAL' },
  { kind: 'playerSpawn', label: '+ P. SPAWN' },
  { kind: 'botSpawn', label: '+ BOT SPAWN' },
  { kind: 'waypoint', label: '+ WAYPOINT' },
]

export function EditorUI() {
  const phase = useEditorStore((s) => s.phase)

  if (phase === 'choosing') {
    return <TemplateChooser />
  }

  return (
    <>
      <Toolbar />
      <div className="ed-side">
        <Inspector />
        <EntityList />
      </div>
      <Statusbar />
    </>
  )
}

function Toolbar() {
  const map = useEditorStore((s) => s.map)
  const snap = useEditorStore((s) => s.snap)
  const setSnap = useEditorStore((s) => s.setSnap)
  const showGrid = useEditorStore((s) => s.showGrid)
  const toggleGrid = useEditorStore((s) => s.toggleGrid)
  const addEntity = useEditorStore((s) => s.addEntity)
  const undo = useEditorStore((s) => s.undo)
  const redo = useEditorStore((s) => s.redo)
  const exportJSON = useEditorStore((s) => s.exportJSON)
  const importJSON = useEditorStore((s) => s.importJSON)
  const setMapName = useEditorStore((s) => s.setMapName)

  const setCurrentMap = useGameStore((s) => s.setCurrentMap)
  const startMatch = useGameStore((s) => s.startMatch)
  const exitEditor = useGameStore((s) => s.exitEditor)

  const fileRef = useRef<HTMLInputElement>(null)

  const suggestedName = () =>
    `${map.name.replace(/\s+/g, '_').toLowerCase() || 'map'}.json`

  // Common identity for save/load pickers — Chromium uses this to remember
  // the last directory the user picked, so subsequent LOAD clicks land in the
  // same folder where SAVE puts maps.
  const PICKER_ID = 'arena-shooter-maps'
  const FILE_TYPES = [
    {
      description: 'Map JSON',
      accept: { 'application/json': ['.json'] as string[] },
    },
  ]

  const handleSave = async () => {
    const json = exportJSON()
    const name = suggestedName()
    const w = window as any
    if (typeof w.showSaveFilePicker === 'function') {
      try {
        const handle = await w.showSaveFilePicker({
          suggestedName: name,
          types: FILE_TYPES,
          startIn: 'downloads',
          id: PICKER_ID,
        })
        const writable = await handle.createWritable()
        await writable.write(json)
        await writable.close()
        return
      } catch (e: any) {
        if (e?.name === 'AbortError') return
        console.warn('[editor] showSaveFilePicker failed, falling back:', e)
      }
    }
    // Legacy fallback — anonymous download to default folder
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleLoad = async () => {
    const w = window as any
    if (typeof w.showOpenFilePicker === 'function') {
      try {
        const [handle] = await w.showOpenFilePicker({
          types: FILE_TYPES,
          startIn: 'downloads',
          multiple: false,
          id: PICKER_ID,
        })
        const file = await handle.getFile()
        const text = await file.text()
        importJSON(text)
        return
      } catch (e: any) {
        if (e?.name === 'AbortError') return
        console.warn('[editor] showOpenFilePicker failed, falling back:', e)
      }
    }
    // Legacy fallback — hidden <input type=file>
    fileRef.current?.click()
  }

  const handleLoadFile = (file: File) => {
    file.text().then((text) => importJSON(text))
  }

  const handleTest = () => {
    setCurrentMap(map)
    startMatch()       // jump straight into the player's draft — bypasses level select
  }

  return (
    <div className="ed-toolbar">
      <div className="ed-tb-section">
        <button className="ed-btn" onClick={exitEditor}>← EXIT</button>
        <input
          className="ed-name"
          value={map.name}
          onChange={(e) => setMapName(e.target.value)}
        />
      </div>

      <div className="ed-tb-section">
        {ADD_BUTTONS.map((b) => (
          <button key={b.kind} className="ed-btn" onClick={() => addEntity(b.kind)}>
            {b.label}
          </button>
        ))}
      </div>

      <div className="ed-tb-section">
        <label className="ed-snap">
          <span className="hud-label">SNAP</span>
          <input
            type="number"
            min="0"
            step="0.1"
            value={snap}
            onChange={(e) => setSnap(parseFloat(e.target.value) || 0)}
          />
        </label>
        <button
          className={`ed-btn ${showGrid ? 'on' : ''}`}
          onClick={toggleGrid}
        >
          GRID {showGrid ? 'ON' : 'OFF'}
        </button>
        <button className="ed-btn" onClick={undo} title="Ctrl+Z">↶ UNDO</button>
        <button className="ed-btn" onClick={redo} title="Ctrl+Y">↷ REDO</button>
      </div>

      <div className="ed-tb-section">
        <button className="ed-btn" onClick={handleSave}>💾 SAVE</button>
        <button className="ed-btn" onClick={handleLoad}>📂 LOAD</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleLoadFile(f)
            e.target.value = ''
          }}
        />
        <button className="ed-btn primary" onClick={handleTest}>▶ TEST</button>
      </div>
    </div>
  )
}

function EntityList() {
  const map = useEditorStore((s) => s.map)
  const selectedId = useEditorStore((s) => s.selectedId)
  const selectEntity = useEditorStore((s) => s.selectEntity)

  return (
    <div className="ed-list">
      <div className="hud-label">OBJECTS ({map.entities.length})</div>
      <div className="ed-list-scroll">
        {map.entities.map((e) => (
          <button
            key={e.id}
            className={`ed-list-row ${e.id === selectedId ? 'selected' : ''}`}
            onClick={() => selectEntity(e.id)}
          >
            <span className={`ed-list-dot ed-${e.kind}`} />
            <span className="ed-list-kind">{e.kind}</span>
            <span className="ed-list-pos">
              {e.pos.map((n) => n.toFixed(1)).join(', ')}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function Statusbar() {
  const map = useEditorStore((s) => s.map)
  const counts = {
    concrete: map.entities.filter((e) => e.kind === 'concrete').length,
    metal: map.entities.filter((e) => e.kind === 'metal').length,
    playerSpawn: map.entities.filter((e) => e.kind === 'playerSpawn').length,
    botSpawn: map.entities.filter((e) => e.kind === 'botSpawn').length,
    waypoint: map.entities.filter((e) => e.kind === 'waypoint').length,
  }
  return (
    <div className="ed-status">
      <span>Concrete: <b>{counts.concrete}</b></span>
      <span>Metal: <b>{counts.metal}</b></span>
      <span>P.Spawn: <b>{counts.playerSpawn}</b></span>
      <span>Bot.Spawn: <b>{counts.botSpawn}</b></span>
      <span>Waypoint: <b>{counts.waypoint}</b></span>
    </div>
  )
}
