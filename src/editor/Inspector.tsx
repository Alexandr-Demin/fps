import { useEditorStore } from '../state/editorStore'
import type { MapEntity, Vec3Tuple } from '../core/mapTypes'

const KIND_LABEL: Record<MapEntity['kind'], string> = {
  concrete: 'Concrete box',
  metal: 'Metal box',
  playerSpawn: 'Player spawn',
  botSpawn: 'Bot spawn',
  waypoint: 'Waypoint',
  targetDummy: 'Target dummy',
}

const KIND_COLOR: Record<MapEntity['kind'], string> = {
  concrete: '#aab0bd',
  metal: '#9bb0d8',
  playerSpawn: '#5af07b',
  botSpawn: '#ff5a5a',
  waypoint: '#ffd066',
  targetDummy: '#ffd070',
}

export function Inspector() {
  const map = useEditorStore((s) => s.map)
  const selectedId = useEditorStore((s) => s.selectedId)
  const updateEntity = useEditorStore((s) => s.updateEntity)
  const deleteEntity = useEditorStore((s) => s.deleteEntity)
  const duplicateSelected = useEditorStore((s) => s.duplicateSelected)
  const snapSelectedToGround = useEditorStore((s) => s.snapSelectedToGround)

  const entity = selectedId ? map.entities.find((e) => e.id === selectedId) : null

  if (!entity) {
    return (
      <div className="ed-inspector ed-inspector-empty">
        <div className="hud-label">INSPECTOR</div>
        <div className="ed-inspector-hint">
          <b>Camera:</b><br />
          LMB-drag — orbit · RMB-drag — pan · wheel — zoom<br />
          The <span style={{ color: '#ff8a3d' }}>orange ring</span> is the spawn anchor — new objects appear there.<br />
          <br />
          <b>Selection:</b><br />
          Click an object to select it. Drag colored gizmo arrows to move.<br />
          <br />
          <kbd>W</kbd> move &nbsp; <kbd>E</kbd> rotate &nbsp; <kbd>R</kbd> scale<br />
          <kbd>Del</kbd> delete &nbsp; <kbd>Ctrl+D</kbd> duplicate<br />
          <kbd>Ctrl+Z</kbd>/<kbd>Y</kbd> undo/redo &nbsp; <kbd>Esc</kbd> deselect
        </div>
      </div>
    )
  }

  const hasSize = entity.kind === 'concrete' || entity.kind === 'metal'
  const targetY = hasSize ? (entity as any).size[1] / 2 : 0
  const isGrounded = Math.abs(entity.pos[1] - targetY) < 1e-3

  return (
    <div className="ed-inspector">
      <div className="ed-inspector-head">
        <span
          className="ed-inspector-dot"
          style={{ background: KIND_COLOR[entity.kind] }}
        />
        <div className="hud-label">{KIND_LABEL[entity.kind]}</div>
        {isGrounded && (
          <span className="ed-grounded-flag" title="Bottom face is flush with floor">
            ● ON FLOOR
          </span>
        )}
      </div>
      <div className="ed-inspector-id">id: {entity.id}</div>

      <NumberTriple
        label="POS"
        value={entity.pos}
        onChange={(pos) => updateEntity(entity.id, { pos })}
        step={0.5}
      />

      <button
        className={`ed-ground-btn ${isGrounded ? 'ok' : ''}`}
        onClick={snapSelectedToGround}
        disabled={isGrounded}
        title="Place selected object onto the floor"
      >
        ⤓ {isGrounded ? 'ON FLOOR' : 'SNAP TO FLOOR'}
      </button>

      {hasSize && (
        <NumberTriple
          label="SIZE"
          value={(entity as any).size}
          onChange={(size) => updateEntity(entity.id, { size } as any)}
          step={0.5}
          min={0.1}
        />
      )}

      {entity.kind === 'concrete' && (
        <ColorRow
          label="COLOR (override)"
          value={entity.color}
          onChange={(color) => updateEntity(entity.id, { color } as any)}
          allowNone
        />
      )}

      {entity.kind === 'metal' && (
        <>
          <ColorRow
            label="EMISSIVE"
            value={entity.emissive}
            onChange={(emissive) =>
              updateEntity(entity.id, { emissive } as any)
            }
          />
          <SliderRow
            label="EMISSIVE INT."
            value={entity.emissiveIntensity ?? 0}
            min={0}
            max={6}
            step={0.1}
            onChange={(v) =>
              updateEntity(entity.id, { emissiveIntensity: v } as any)
            }
          />
        </>
      )}

      <div className="ed-inspector-actions">
        <button onClick={duplicateSelected}>DUPLICATE</button>
        <button className="warn" onClick={() => deleteEntity(entity.id)}>DELETE</button>
      </div>
    </div>
  )
}

function NumberTriple({
  label,
  value,
  onChange,
  step = 0.5,
  min,
}: {
  label: string
  value: Vec3Tuple
  onChange: (v: Vec3Tuple) => void
  step?: number
  min?: number
}) {
  const set = (i: number, v: number) => {
    const next: Vec3Tuple = [...value] as Vec3Tuple
    next[i] = min != null ? Math.max(min, v) : v
    onChange(next)
  }
  return (
    <div className="ed-field">
      <div className="hud-label">{label}</div>
      <div className="ed-triple">
        {(['X', 'Y', 'Z'] as const).map((axis, i) => (
          <label key={axis} className="ed-num">
            <span className="ed-num-axis">{axis}</span>
            <input
              type="number"
              step={step}
              value={Number(value[i].toFixed(3))}
              onChange={(e) => set(i, parseFloat(e.target.value) || 0)}
            />
          </label>
        ))}
      </div>
    </div>
  )
}

function ColorRow({
  label,
  value,
  onChange,
  allowNone,
}: {
  label: string
  value: string | undefined
  onChange: (c: string | undefined) => void
  allowNone?: boolean
}) {
  return (
    <div className="ed-field">
      <div className="hud-label">{label}</div>
      <div className="ed-color-row">
        <input
          type="color"
          value={value ?? '#888888'}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          type="text"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value || undefined)}
          placeholder={allowNone ? '— inherit —' : '#a8c4ff'}
        />
        {allowNone && value && (
          <button onClick={() => onChange(undefined)}>×</button>
        )}
      </div>
    </div>
  )
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <div className="ed-field">
      <div className="hud-label">{label}</div>
      <div className="ed-slider-row">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
        />
        <span>{value.toFixed(2)}</span>
      </div>
    </div>
  )
}
