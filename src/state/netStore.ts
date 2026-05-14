import { create } from 'zustand'
import type {
  GameMode,
  MatchResult,
  PlayerSnap,
  RoomPhase,
  RoomSummary,
} from '@shared/protocol'

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

export type NetPhase = 'idle' | 'connecting' | 'lobby' | 'connected' | 'error'

interface NetState {
  phase: NetPhase
  serverUrl: string
  myId: string | null
  nickname: string
  error: string | null
  remotePlayers: Record<string, PlayerSnap>
  // Which kind of lobby UI to show after the connect screen — drives
  // the split between MpLobby's duel and arena views. Set by the menu
  // when the player clicks DUEL or ARENA; the lobby itself doesn't
  // mutate it.
  lobbyMode: GameMode
  // Lobby snapshot — list of open rooms with their hosts and slot counts.
  // Pushed by the server on any composition change.
  rooms: RoomSummary[]
  // Current room id when in-room; null while in the lobby phase.
  currentRoomId: string | null
  // Match-phase mirror of the room we're currently in. Drives the
  // end-of-match overlay. Defaults to 'playing'; flips to 'ended'
  // when the matchEnded event arrives.
  currentRoomPhase: RoomPhase
  // Epoch ms the current match ends at, or null when the mode has no
  // timer (duel). Updated from every snapshot so HUD countdown stays
  // accurate across brief disconnects.
  currentMatchEndsAt: number | null
  // Final top-5 leaderboard set by the matchEnded event. Cleared on
  // join / leave. The MpEndScreen renders this.
  currentMatchResults: MatchResult[] | null
  // Mirrors the server's spawn-protection state for the local player.
  // Updated from every snapshot. Drives the PROTECTED HUD pill.
  myProtected: boolean
  // Round-trip latency in milliseconds, refreshed on each pong reply.
  // null when not connected (or before the first pong lands).
  rttMs: number | null
  // Reconnect state. When `reconnecting` is true the UI overlays a
  // "Reconnecting…" panel and gameplay input is gated. NetClient drives
  // these values; UI is read-only.
  reconnecting: boolean
  reconnectAttempt: number
  reconnectMaxAttempts: number
  setServerUrl: (url: string) => void
  setNickname: (n: string) => void
  setLobbyMode: (m: GameMode) => void
  setPhase: (p: NetPhase) => void
  setError: (e: string | null) => void
  setMyId: (id: string | null) => void
  setRtt: (ms: number | null) => void
  setRooms: (rooms: RoomSummary[]) => void
  setCurrentRoomId: (id: string | null) => void
  setRoomPhase: (p: RoomPhase) => void
  setMatchEndsAt: (ms: number | null) => void
  setMatchResults: (r: MatchResult[] | null) => void
  setMyProtected: (v: boolean) => void
  setReconnect: (state: {
    reconnecting: boolean
    attempt: number
    max: number
  }) => void
  upsertRemote: (snaps: PlayerSnap[]) => void
  addRemote: (snap: PlayerSnap) => void
  removeRemote: (id: string) => void
  clearRemotes: () => void
}

// Pick the default server URL with this priority:
//   1. VITE_MP_SERVER env (explicit override — useful for dev pointing at a
//      remote host while running Vite locally).
//   2. Same-origin: derive ws(s):// from window.location so a single deployed
//      host serves the client AND accepts WS on the same port. This is what
//      lets a friend open one tunnel URL and play without configuring
//      anything.
//   3. ws://localhost:2567 fallback (SSR / unusual environments).
function defaultServerUrl(): string {
  const envUrl = (import.meta as any).env?.VITE_MP_SERVER as string | undefined
  if (envUrl) return envUrl
  if (typeof window !== 'undefined' && window.location) {
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${wsProto}//${window.location.host}`
  }
  return 'ws://localhost:2567'
}

export const useNetStore = create<NetState>((set) => ({
  phase: 'idle',
  serverUrl: defaultServerUrl(),
  myId: null,
  nickname: loadOrGenerateNickname(),
  error: null,
  remotePlayers: {},
  lobbyMode: 'duel',
  rooms: [],
  currentRoomId: null,
  currentRoomPhase: 'playing',
  currentMatchEndsAt: null,
  currentMatchResults: null,
  myProtected: false,
  rttMs: null,
  reconnecting: false,
  reconnectAttempt: 0,
  reconnectMaxAttempts: 5,
  setServerUrl: (url) => set({ serverUrl: url }),
  setNickname: (n) => {
    const trimmed = n.trim().slice(0, 16)
    if (typeof localStorage !== 'undefined' && trimmed) {
      localStorage.setItem(NICKNAME_KEY, trimmed)
    }
    set({ nickname: trimmed })
  },
  setLobbyMode: (m) => set({ lobbyMode: m }),
  setPhase: (p) => set({ phase: p }),
  setError: (e) => set({ error: e }),
  setMyId: (id) => set({ myId: id }),
  setRtt: (ms) => set({ rttMs: ms }),
  setRooms: (rooms) => set({ rooms }),
  setCurrentRoomId: (id) => set({ currentRoomId: id }),
  setRoomPhase: (p) => set({ currentRoomPhase: p }),
  setMatchEndsAt: (ms) => set({ currentMatchEndsAt: ms }),
  setMatchResults: (r) => set({ currentMatchResults: r }),
  setMyProtected: (v) => set({ myProtected: v }),
  setReconnect: ({ reconnecting, attempt, max }) =>
    set({
      reconnecting,
      reconnectAttempt: attempt,
      reconnectMaxAttempts: max,
    }),
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
