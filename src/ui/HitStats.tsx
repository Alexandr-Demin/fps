import { useGameStore } from '../state/gameStore'
import { HITBOX } from '../core/constants'
import type { HitZone } from '../core/types'

const ZONE_COLOR: Record<HitZone, string> = {
  HEAD:  HITBOX.HEAD.color,
  TORSO: HITBOX.TORSO.color,
  LEGS:  HITBOX.LEGS.color,
}

const ZONE_LABEL: Record<HitZone, string> = {
  HEAD:  'HEAD',
  TORSO: 'TORSO',
  LEGS:  'LEGS',
}

export function HitStats() {
  const events = useGameStore((s) => s.hitEvents)
  const t = useGameStore((s) => s.hitTotals)

  const accuracy = t.shots > 0 ? Math.round((t.bodyHits / t.shots) * 100) : 0
  const totalBodyMax = Math.max(1, t.head + t.torso + t.legs)

  return (
    <div className="hitstats">
      <div className="hitstats-title">HIT LOG</div>
      <div className="hitstats-log">
        {events.length === 0 ? (
          <div className="hitstats-empty">no hits yet</div>
        ) : (
          events.map((e) => {
            const alpha = Math.min(1, e.life / 1.0)
            return (
              <div
                key={e.id}
                className={`hitstats-row${e.killed ? ' kill' : ''}`}
                style={{ opacity: 0.35 + alpha * 0.65 }}
              >
                <span className="hitstats-bar" style={{ background: ZONE_COLOR[e.zone] }} />
                <span className="hitstats-zone" style={{ color: ZONE_COLOR[e.zone] }}>
                  {ZONE_LABEL[e.zone]}
                </span>
                <span className="hitstats-dmg">{e.damage}</span>
                {e.killed && <span className="hitstats-kill">KILL</span>}
              </div>
            )
          })
        )}
      </div>

      <div className="hitstats-totals">
        <div className="hitstats-title">TOTALS</div>
        <ZoneRow zone="HEAD"  hits={t.head}  total={totalBodyMax} />
        <ZoneRow zone="TORSO" hits={t.torso} total={totalBodyMax} />
        <ZoneRow zone="LEGS"  hits={t.legs}  total={totalBodyMax} />

        <div className="hitstats-summary">
          <div>
            <span className="hud-label">DMG</span>
            <span className="hitstats-val">{t.totalDamage}</span>
          </div>
          <div>
            <span className="hud-label">SHOTS</span>
            <span className="hitstats-val">{t.shots}</span>
          </div>
          <div>
            <span className="hud-label">ACC</span>
            <span className="hitstats-val">{accuracy}%</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function ZoneRow({ zone, hits, total }: { zone: HitZone; hits: number; total: number }) {
  const pct = (hits / total) * 100
  return (
    <div className="hitstats-zonerow">
      <span className="hitstats-zone" style={{ color: ZONE_COLOR[zone] }}>
        {ZONE_LABEL[zone]}
      </span>
      <span className="hitstats-track">
        <span
          className="hitstats-fill"
          style={{ width: `${pct}%`, background: ZONE_COLOR[zone] }}
        />
      </span>
      <span className="hitstats-count">{hits}</span>
    </div>
  )
}
