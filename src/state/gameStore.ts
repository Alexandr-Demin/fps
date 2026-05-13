import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { GamePhase, HitEvent, HitTotals, HitZone, ImpactFx, MuzzleFlashFx, Vec3 } from '../core/types'
import type { MapData } from '../core/mapTypes'
import { SECTOR_17 } from '../core/maps/sector17'
import { MATCH, PLAYER, WEAPON } from '../core/constants'

interface GameState {
  phase: GamePhase
  hp: number
  ammo: number
  reserve: number
  reloading: boolean
  kills: number
  deaths: number
  lastDamageAt: number
  lastHitAt: number
  respawnAt: number
  playerPos: Vec3
  impacts: ImpactFx[]
  muzzleFlashes: MuzzleFlashFx[]
  hitEvents: HitEvent[]
  hitTotals: HitTotals
  _impactSeq: number
  _muzzleSeq: number
  _hitSeq: number

  // settings
  muted: boolean
  botsCanDamage: boolean
  showHitboxes: boolean
  settingsOpen: boolean

  // map (used by gameplay; replaced on test-play from editor)
  currentMap: MapData

  // actions
  startMatch: () => void
  pauseMatch: () => void
  resumeMatch: () => void
  setPhase: (p: GamePhase) => void
  damagePlayer: (amount: number) => void
  consumeAmmo: () => boolean
  beginReload: () => void
  finishReload: () => void
  registerKill: () => void
  killPlayer: () => void
  respawnPlayer: () => void
  setPlayerPos: (p: Vec3) => void
  addImpact: (position: Vec3, normal: Vec3, bot?: boolean) => void
  addMuzzleFlash: () => void
  tickFx: (dt: number) => void
  registerHit: () => void

  recordShot: () => void
  recordHit: (zone: HitZone, damage: number, killed: boolean, target?: string) => void
  tickHitEvents: (dt: number) => void
  resetHitStats: () => void

  toggleMute: () => void
  setBotsCanDamage: (v: boolean) => void
  setShowHitboxes: (v: boolean) => void
  openSettings: () => void
  closeSettings: () => void

  setCurrentMap: (m: MapData) => void
  enterEditor: () => void
  exitEditor: () => void
}

const emptyTotals: HitTotals = {
  head: 0, torso: 0, legs: 0,
  totalDamage: 0, kills: 0, shots: 0, bodyHits: 0,
}

export const useGameStore = create<GameState>()(
  subscribeWithSelector((set, get) => ({
    phase: 'menu',
    hp: PLAYER.MAX_HP,
    ammo: WEAPON.MAG_SIZE,
    reserve: WEAPON.RESERVE,
    reloading: false,
    kills: 0,
    deaths: 0,
    lastDamageAt: -999,
    lastHitAt: -999,
    respawnAt: 0,
    playerPos: [0, 2, 0],
    impacts: [],
    muzzleFlashes: [],
    hitEvents: [],
    hitTotals: { ...emptyTotals },
    _impactSeq: 0,
    _muzzleSeq: 0,
    _hitSeq: 0,

    muted: false,
    botsCanDamage: true,
    showHitboxes: false,
    settingsOpen: false,

    currentMap: SECTOR_17,

    startMatch: () =>
      set({
        phase: 'playing',
        hp: PLAYER.MAX_HP,
        ammo: WEAPON.MAG_SIZE,
        reserve: WEAPON.RESERVE,
        kills: 0,
        deaths: 0,
        reloading: false,
        hitEvents: [],
        hitTotals: { ...emptyTotals },
      }),

    pauseMatch: () => {
      if (get().phase === 'playing') set({ phase: 'paused' })
    },
    resumeMatch: () => {
      if (get().phase === 'paused') set({ phase: 'playing' })
    },
    setPhase: (phase) => set({ phase }),

    damagePlayer: (amount) => {
      const { hp, phase } = get()
      if (phase !== 'playing') return
      const next = Math.max(0, hp - amount)
      set({ hp: next, lastDamageAt: performance.now() / 1000 })
      if (next <= 0) get().killPlayer()
    },

    consumeAmmo: () => {
      const { ammo, reloading } = get()
      if (reloading || ammo <= 0) return false
      set({ ammo: ammo - 1 })
      return true
    },

    beginReload: () => {
      const { ammo, reserve, reloading } = get()
      if (reloading || ammo >= WEAPON.MAG_SIZE || reserve <= 0) return
      set({ reloading: true })
    },

    finishReload: () => {
      const { ammo, reserve } = get()
      // Infinite reserve: top up to full mag without decrementing the pool.
      if (!isFinite(reserve)) {
        set({ ammo: WEAPON.MAG_SIZE, reloading: false })
        return
      }
      const need = WEAPON.MAG_SIZE - ammo
      const take = Math.min(need, reserve)
      set({ ammo: ammo + take, reserve: reserve - take, reloading: false })
    },

    registerKill: () => set((s) => ({ kills: s.kills + 1 })),

    killPlayer: () =>
      set((s) => ({
        phase: 'dead',
        deaths: s.deaths + 1,
        respawnAt: performance.now() / 1000 + MATCH.RESPAWN_DELAY,
      })),

    respawnPlayer: () =>
      set({
        phase: 'playing',
        hp: PLAYER.MAX_HP,
        ammo: WEAPON.MAG_SIZE,
        reserve: WEAPON.RESERVE,
        reloading: false,
      }),

    setPlayerPos: (p) => set({ playerPos: p }),

    addImpact: (position, normal, bot) =>
      set((s) => {
        const id = s._impactSeq + 1
        const next: ImpactFx = { id, position, normal, life: 0.55, bot }
        // Cap to avoid runaway
        const list = s.impacts.length > 24 ? s.impacts.slice(-24) : s.impacts
        return { impacts: [...list, next], _impactSeq: id }
      }),

    addMuzzleFlash: () =>
      set((s) => {
        const id = s._muzzleSeq + 1
        return {
          muzzleFlashes: [...s.muzzleFlashes, { id, life: 0.07 }].slice(-4),
          _muzzleSeq: id,
        }
      }),

    tickFx: (dt) =>
      set((s) => {
        if (s.impacts.length === 0 && s.muzzleFlashes.length === 0) return {}
        const impacts = s.impacts.length
          ? s.impacts
              .map((f) => ({ ...f, life: f.life - dt }))
              .filter((f) => f.life > 0)
          : s.impacts
        const muzzleFlashes = s.muzzleFlashes.length
          ? s.muzzleFlashes
              .map((f) => ({ ...f, life: f.life - dt }))
              .filter((f) => f.life > 0)
          : s.muzzleFlashes
        return { impacts, muzzleFlashes }
      }),

    registerHit: () => set({ lastHitAt: performance.now() / 1000 }),

    recordShot: () =>
      set((s) => ({
        hitTotals: { ...s.hitTotals, shots: s.hitTotals.shots + 1 },
      })),

    recordHit: (zone, damage, killed, target) =>
      set((s) => {
        const id = s._hitSeq + 1
        const event: HitEvent = { id, zone, damage: Math.round(damage), killed, life: 3.0, target }
        const events = [event, ...s.hitEvents].slice(0, 8)
        const totals: HitTotals = {
          ...s.hitTotals,
          totalDamage: s.hitTotals.totalDamage + Math.round(damage),
          bodyHits: s.hitTotals.bodyHits + 1,
          kills: s.hitTotals.kills + (killed ? 1 : 0),
          head: s.hitTotals.head + (zone === 'HEAD' ? 1 : 0),
          torso: s.hitTotals.torso + (zone === 'TORSO' ? 1 : 0),
          legs: s.hitTotals.legs + (zone === 'LEGS' ? 1 : 0),
        }
        return { hitEvents: events, hitTotals: totals, _hitSeq: id }
      }),

    tickHitEvents: (dt) =>
      set((s) => {
        if (s.hitEvents.length === 0) return {}
        const next = s.hitEvents
          .map((e) => ({ ...e, life: e.life - dt }))
          .filter((e) => e.life > 0)
        return { hitEvents: next }
      }),

    resetHitStats: () =>
      set({ hitEvents: [], hitTotals: { ...emptyTotals } }),

    toggleMute: () => set((s) => ({ muted: !s.muted })),
    setBotsCanDamage: (v) => set({ botsCanDamage: v }),
    setShowHitboxes: (v) => set({ showHitboxes: v }),
    openSettings: () => set({ settingsOpen: true }),
    closeSettings: () => set({ settingsOpen: false }),

    setCurrentMap: (m) => set({ currentMap: m }),
    enterEditor: () => set({ phase: 'editor', settingsOpen: false }),
    exitEditor: () => set({ phase: 'menu' }),
  }))
)

export const selectIsLive = (s: GameState) => s.phase === 'playing'
