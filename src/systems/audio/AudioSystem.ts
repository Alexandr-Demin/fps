// Procedural audio + selectively loaded samples. Sample shots are layered
// with synthesised sub-bass and a delayed wall-return to give a "real
// gunshot" body in the industrial space.

import { WEAPON } from '../../core/constants'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let listener: AudioListener | null = null
let reverb: ConvolverNode | null = null
let reverbSend: GainNode | null = null

const MASTER_VOLUME = 0.55
let muted = false

// === Sample assets ===================================================
interface SampleSlot {
  url: string
  buffer: AudioBuffer | null
  promise: Promise<AudioBuffer | null> | null
}

const samples: Record<string, SampleSlot> = {
  pistol: { url: '/sounds/pistol-shot.mp3', buffer: null, promise: null },
  reload: { url: '/sounds/reload.mp3',      buffer: null, promise: null },
}

function loadSample(c: AudioContext, key: keyof typeof samples): Promise<AudioBuffer | null> {
  const slot = samples[key]
  if (slot.buffer) return Promise.resolve(slot.buffer)
  if (slot.promise) return slot.promise
  slot.promise = fetch(slot.url)
    .then((r) => {
      if (!r.ok) throw new Error(`sample "${key}" HTTP ${r.status}`)
      return r.arrayBuffer()
    })
    .then((data) => c.decodeAudioData(data))
    .then((buf) => {
      slot.buffer = buf
      return buf
    })
    .catch((err) => {
      console.warn(`[audio] failed to load sample "${key}", falling back to synth:`, err)
      return null
    })
  return slot.promise
}

function ensure(): AudioContext {
  if (ctx) return ctx
  const Ctor = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext
  ctx = new Ctor()
  master = ctx.createGain()
  master.gain.value = muted ? 0 : MASTER_VOLUME
  master.connect(ctx.destination)
  listener = ctx.listener
  reverbSend = ctx.createGain()
  reverbSend.gain.value = 0.32
  reverb = ctx.createConvolver()
  reverb.buffer = buildImpulseResponse(ctx, 2.6, 3.5)
  reverbSend.connect(reverb)
  reverb.connect(master)
  return ctx
}

function buildImpulseResponse(c: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = c.sampleRate
  const len = Math.floor(rate * seconds)
  const buf = c.createBuffer(2, len, rate)
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) {
      const t = i / len
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay)
    }
  }
  return buf
}

function noiseBuffer(c: AudioContext, durationSec: number, color: 'white' | 'pink' = 'white'): AudioBuffer {
  const len = Math.max(1, Math.floor(c.sampleRate * durationSec))
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  if (color === 'pink') {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      b0 = 0.99886 * b0 + w * 0.0555179
      b1 = 0.99332 * b1 + w * 0.0750759
      b2 = 0.96900 * b2 + w * 0.1538520
      b3 = 0.86650 * b3 + w * 0.3104856
      b4 = 0.55000 * b4 + w * 0.5329522
      b5 = -0.7616 * b5 - w * 0.0168980
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
      b6 = w * 0.115926
    }
  } else {
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  }
  return buf
}

function spatialOutput(): { input: GainNode; pannerOrNull: PannerNode | null } {
  // Caller supplies a panner externally when needed. This returns a basic gain.
  const c = ensure()
  const g = c.createGain()
  g.connect(master!)
  // light reverb send for ambience
  const rs = c.createGain()
  rs.gain.value = 0.18
  g.connect(rs)
  rs.connect(reverbSend!)
  return { input: g, pannerOrNull: null }
}

interface PositionalOpts {
  x: number; y: number; z: number
  refDistance?: number
  rolloff?: number
  reverbAmount?: number
}

function spatialPanner(opts: PositionalOpts) {
  const c = ensure()
  const panner = c.createPanner()
  panner.panningModel = 'HRTF'
  panner.distanceModel = 'inverse'
  panner.refDistance = opts.refDistance ?? 3
  panner.rolloffFactor = opts.rolloff ?? 1.4
  panner.maxDistance = 80
  panner.positionX.value = opts.x
  panner.positionY.value = opts.y
  panner.positionZ.value = opts.z
  const dry = c.createGain()
  panner.connect(dry)
  dry.connect(master!)
  const wet = c.createGain()
  wet.gain.value = opts.reverbAmount ?? 0.4
  panner.connect(wet)
  wet.connect(reverbSend!)
  return panner
}

// === Public API =====================================================

export const AudioBus = {
  init() {
    ensure()
    if (ctx!.state === 'suspended') void ctx!.resume()
    // Kick off sample loading early so first use is instant
    void loadSample(ctx!, 'pistol')
    void loadSample(ctx!, 'reload')
  },

  setMuted(value: boolean) {
    muted = value
    if (master && ctx) {
      const target = muted ? 0 : MASTER_VOLUME
      master.gain.cancelScheduledValues(ctx.currentTime)
      master.gain.linearRampToValueAtTime(target, ctx.currentTime + 0.08)
    }
  },

  setListener(pos: [number, number, number], forward: [number, number, number], up: [number, number, number]) {
    if (!listener) return
    const t = ctx!.currentTime + 0.02
    if ('positionX' in listener) {
      listener.positionX.linearRampToValueAtTime(pos[0], t)
      listener.positionY.linearRampToValueAtTime(pos[1], t)
      listener.positionZ.linearRampToValueAtTime(pos[2], t)
      listener.forwardX.linearRampToValueAtTime(forward[0], t)
      listener.forwardY.linearRampToValueAtTime(forward[1], t)
      listener.forwardZ.linearRampToValueAtTime(forward[2], t)
      listener.upX.linearRampToValueAtTime(up[0], t)
      listener.upY.linearRampToValueAtTime(up[1], t)
      listener.upZ.linearRampToValueAtTime(up[2], t)
    } else {
      ;(listener as any).setPosition(...pos)
      ;(listener as any).setOrientation(forward[0], forward[1], forward[2], up[0], up[1], up[2])
    }
  },

  playPistol(at?: [number, number, number]) {
    const c = ensure()
    const now = c.currentTime
    // Heavier reverb send for the shot so the room "carries" it
    const panner = at
      ? spatialPanner({ x: at[0], y: at[1], z: at[2], refDistance: 4, rolloff: 1.0, reverbAmount: 0.85 })
      : null
    const dest: AudioNode = panner ?? master!

    const pistolBuffer = samples.pistol.buffer
    if (pistolBuffer) {
      const dur = Math.min(pistolBuffer.duration, 0.9)

      // --- Layer 1: dry sample (the crack) ---
      const src = c.createBufferSource()
      src.buffer = pistolBuffer
      src.playbackRate.value = 0.96 + Math.random() * 0.08
      const g = c.createGain()
      g.gain.setValueAtTime(1.1, now)
      g.gain.setValueAtTime(1.1, now + dur * 0.85)
      g.gain.linearRampToValueAtTime(0.0, now + dur)
      src.connect(g).connect(dest)
      src.start(now)
      src.stop(now + dur + 0.05)

      // --- Layer 2: sub-bass body thump (chest punch) ---
      // Short 60Hz sine drop adds weight that mp3 samples usually lose.
      const subOsc = c.createOscillator()
      subOsc.type = 'sine'
      subOsc.frequency.setValueAtTime(75, now)
      subOsc.frequency.exponentialRampToValueAtTime(38, now + 0.15)
      const subGain = c.createGain()
      subGain.gain.setValueAtTime(0.0, now)
      subGain.gain.linearRampToValueAtTime(0.55, now + 0.006)
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22)
      // Sub goes mostly dry (low-end through reverb gets muddy)
      const subDist = c.createWaveShaper()
      const curve = new Float32Array(1024)
      for (let i = 0; i < 1024; i++) {
        const x = (i / 512) - 1
        curve[i] = Math.tanh(x * 2.5)
      }
      subDist.curve = curve
      subOsc.connect(subDist).connect(subGain).connect(master!)
      subOsc.start(now)
      subOsc.stop(now + 0.25)

      // --- Layer 3: delayed wall reflection ---
      // A second copy of the shot, attenuated + low-passed + delayed,
      // simulates the bounce returning from far concrete walls.
      const reflSrc = c.createBufferSource()
      reflSrc.buffer = pistolBuffer
      reflSrc.playbackRate.value = src.playbackRate.value * 0.97
      const reflDelay = c.createDelay(0.5)
      reflDelay.delayTime.value = 0.085 + Math.random() * 0.03
      const reflLp = c.createBiquadFilter()
      reflLp.type = 'lowpass'
      reflLp.frequency.value = 900
      const reflGain = c.createGain()
      reflGain.gain.setValueAtTime(0.0, now)
      reflGain.gain.linearRampToValueAtTime(0.45, now + 0.02)
      reflGain.gain.exponentialRampToValueAtTime(0.001, now + dur * 0.9)
      reflSrc.connect(reflDelay).connect(reflLp).connect(reflGain)
      reflGain.connect(master!)
      // Reflection also feeds reverb for extra room sense
      const reflRevSend = c.createGain()
      reflRevSend.gain.value = 0.6
      reflGain.connect(reflRevSend).connect(reverbSend!)
      reflSrc.start(now)
      reflSrc.stop(now + dur + 0.1)
    } else {
      // Fallback synth (sample not yet decoded)
      const osc = c.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(220, now)
      osc.frequency.exponentialRampToValueAtTime(55, now + 0.08)
      const oscGain = c.createGain()
      oscGain.gain.setValueAtTime(0.0, now)
      oscGain.gain.linearRampToValueAtTime(0.85, now + 0.004)
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18)
      osc.connect(oscGain).connect(dest)
      osc.start(now)
      osc.stop(now + 0.2)

      const src = c.createBufferSource()
      src.buffer = noiseBuffer(c, 0.18)
      const hp = c.createBiquadFilter()
      hp.type = 'highpass'; hp.frequency.value = 1200
      const bp = c.createBiquadFilter()
      bp.type = 'bandpass'; bp.frequency.value = 3000; bp.Q.value = 0.7
      const ng = c.createGain()
      ng.gain.setValueAtTime(0.0, now)
      ng.gain.linearRampToValueAtTime(0.5, now + 0.002)
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.12)
      src.connect(hp).connect(bp).connect(ng).connect(dest)
      src.start(now); src.stop(now + 0.2)
    }

    if (panner) {
      // Hold panner alive past full reverb tail
      setTimeout(() => panner.disconnect(), 3500)
    }
  },

  playImpact(at: [number, number, number]) {
    const c = ensure()
    const now = c.currentTime
    const panner = spatialPanner({ x: at[0], y: at[1], z: at[2], refDistance: 2, rolloff: 1.6, reverbAmount: 0.6 })
    const src = c.createBufferSource()
    src.buffer = noiseBuffer(c, 0.12)
    const hp = c.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 2200
    const g = c.createGain()
    g.gain.setValueAtTime(0.0, now)
    g.gain.linearRampToValueAtTime(0.35, now + 0.002)
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.09)
    src.connect(hp).connect(g).connect(panner)
    src.start(now)
    src.stop(now + 0.15)
    setTimeout(() => panner.disconnect(), 800)
  },

  playFootstep(strength = 0.4) {
    const c = ensure()
    const now = c.currentTime
    const src = c.createBufferSource()
    src.buffer = noiseBuffer(c, 0.08)
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 1200
    const g = c.createGain()
    g.gain.setValueAtTime(0.0, now)
    g.gain.linearRampToValueAtTime(0.18 * strength, now + 0.005)
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.08)
    src.connect(lp).connect(g).connect(master!)
    src.start(now)
    src.stop(now + 0.1)
  },

  playJump() {
    const c = ensure()
    const now = c.currentTime
    const src = c.createBufferSource()
    src.buffer = noiseBuffer(c, 0.06)
    const hp = c.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 800
    const g = c.createGain()
    g.gain.setValueAtTime(0.0, now)
    g.gain.linearRampToValueAtTime(0.12, now + 0.003)
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.06)
    src.connect(hp).connect(g).connect(master!)
    src.start(now)
    src.stop(now + 0.08)
  },

  playSlide() {
    const c = ensure()
    const now = c.currentTime
    const src = c.createBufferSource()
    src.buffer = noiseBuffer(c, 0.5)
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 900
    bp.Q.value = 1.5
    const g = c.createGain()
    g.gain.setValueAtTime(0.0, now)
    g.gain.linearRampToValueAtTime(0.22, now + 0.05)
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.6)
    src.connect(bp).connect(g).connect(master!)
    src.start(now)
    src.stop(now + 0.6)
  },

  playReload() {
    const c = ensure()
    const now = c.currentTime
    const reloadBuffer = samples.reload.buffer
    if (reloadBuffer) {
      // Hard-trim playback to the actual reload window so audio finishes
      // exactly when the animation does. No pitch-shifting — clean truncate
      // with a short tail fade to avoid an audible cut.
      const target = WEAPON.RELOAD_TIME
      const playDur = Math.min(reloadBuffer.duration, target)
      const tail = Math.min(0.12, playDur * 0.2)

      const src = c.createBufferSource()
      src.buffer = reloadBuffer
      const g = c.createGain()
      g.gain.setValueAtTime(0.95, now)
      g.gain.setValueAtTime(0.95, now + playDur - tail)
      g.gain.linearRampToValueAtTime(0.0, now + playDur)
      src.connect(g).connect(master!)
      src.start(now)
      src.stop(now + playDur + 0.02)
    } else {
      // Fallback — two mechanical clicks
      for (let i = 0; i < 2; i++) {
        const tStart = now + i * 0.55 + 0.15
        const src = c.createBufferSource()
        src.buffer = noiseBuffer(c, 0.04)
        const hp = c.createBiquadFilter()
        hp.type = 'highpass'; hp.frequency.value = 1500
        const g = c.createGain()
        g.gain.setValueAtTime(0.0, tStart)
        g.gain.linearRampToValueAtTime(0.18, tStart + 0.003)
        g.gain.exponentialRampToValueAtTime(0.001, tStart + 0.04)
        src.connect(hp).connect(g).connect(master!)
        src.start(tStart); src.stop(tStart + 0.05)
      }
    }
  },

  playHurt() {
    const c = ensure()
    const now = c.currentTime
    const osc = c.createOscillator()
    osc.type = 'square'
    osc.frequency.value = 90
    const g = c.createGain()
    g.gain.setValueAtTime(0.0, now)
    g.gain.linearRampToValueAtTime(0.18, now + 0.01)
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.18)
    osc.connect(g).connect(master!)
    osc.start(now); osc.stop(now + 0.2)
  },

  playKillFeedback() {
    const c = ensure()
    const now = c.currentTime
    const osc = c.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, now)
    osc.frequency.linearRampToValueAtTime(1320, now + 0.08)
    const g = c.createGain()
    g.gain.setValueAtTime(0.0, now)
    g.gain.linearRampToValueAtTime(0.18, now + 0.005)
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.18)
    osc.connect(g).connect(master!)
    osc.start(now); osc.stop(now + 0.2)
  },
}

