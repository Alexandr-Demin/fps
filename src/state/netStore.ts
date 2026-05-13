import { create } from 'zustand'
import type { PlayerSnap } from '@shared/protocol'

const NICKNAME_KEY = 'sector17.nickname'

function generateNickname(): string {
  const rand =
    typeof crypto !== 'undefined' && (crypto as any).randomUUID
      ? (crypto as any).randomUUID().slice(0, 6)
      : Math.random().toString(16).slice(2, 8)
  return 'PLAYER_' + rand.toUpperCase()
}

function loadOrGenerateNickname(): string {
  if (typeof localStorage === 'undefined') return generateNickname()
  const stored = localStorage.getItem(NICKNAME_KEY)
  if (stored) return stored
  const fresh = generateNickname()
  localStorage.setItem(NICKNAME_KEY, fresh)
  return fresh
}

export type NetPhase = 'idle' | 'connecting' | 'connected' | 'error'

interface NetState {
  phase: NetPhase
  serverUrl: string
  myId: string | null
  nickname: string
  error: string | null
  remotePlayers: Record<string, PlayerSnap>
  setServerUrl: (url: string) => void
  setNickname: (n: string) => void
  setPhase: (p: NetPhase) => void
  setError: (e: string | null) => void
  setMyId: (id: string | null) => void
  upsertRemote: (snaps: PlayerSnap[]) => void
  addRemote: (snap: PlayerSnap) => void
  removeRemote: (id: string) => void
  clearRemotes: () => void
}

export const useNetStore = create<NetState>((set) => ({
  phase: 'idle',
  serverUrl:
    (import.meta as any).env?.VITE_MP_SERVER ?? 'ws://localhost:2567',
  myId: null,
  nickname: loadOrGenerateNickname(),
  error: null,
  remotePlayers: {},
  setServerUrl: (url) => set({ serverUrl: url }),
  setNickname: (n) => {
    const trimmed = n.trim().slice(0, 16)
    if (typeof localStorage !== 'undefined' && trimmed) {
      localStorage.setItem(NICKNAME_KEY, trimmed)
    }
    set({ nickname: trimmed })
  },
  setPhase: (p) => set({ phase: p }),
  setError: (e) => set({ error: e }),
  setMyId: (id) => set({ myId: id }),
  upsertRemote: (snaps) => {
    const next: Record<string, PlayerSnap> = {}
    for (const s of snaps) next[s.id] = s
    set({ remotePlayers: next })
  },
  addRemote: (snap) =>
    set((s) => ({
      remotePlayers: { ...s.remotePlayers, [snap.id]: snap },
    })),
  removeRemote: (id) =>
    set((s) => {
      const next = { ...s.remotePlayers }
      delete next[id]
      return { remotePlayers: next }
    }),
  clearRemotes: () => set({ remotePlayers: {} }),
}))
