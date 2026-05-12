// Lightweight global input state. Avoids React re-renders on key events.
// Polled inside useFrame by gameplay systems.

export interface InputState {
  forward: number   // -1..1
  strafe: number    // -1..1
  jumpHeld: boolean
  jumpPressed: boolean // edge-triggered, cleared after read
  crouchHeld: boolean
  crouchPressed: boolean // edge-triggered, cleared after read
  sprintHeld: boolean
  firePressed: boolean
  fireHeld: boolean
  aimHeld: boolean    // RMB held → ADS / scope
  reloadPressed: boolean
  yaw: number      // accumulated, radians
  pitch: number    // accumulated, radians
  mouseDX: number  // per-frame, consumed in useFrame
  mouseDY: number
}

const SENS = 0.0022
const PITCH_LIMIT = Math.PI / 2 - 0.02

class InputManager {
  state: InputState = {
    forward: 0,
    strafe: 0,
    jumpHeld: false,
    jumpPressed: false,
    crouchHeld: false,
    crouchPressed: false,
    sprintHeld: false,
    firePressed: false,
    fireHeld: false,
    aimHeld: false,
    reloadPressed: false,
    yaw: 0,
    pitch: 0,
    mouseDX: 0,
    mouseDY: 0,
  }

  private pointerLocked = false
  private listeners: Array<() => void> = []
  private boundElement: HTMLElement | null = null

  attach(element: HTMLElement) {
    this.boundElement = element
    const kd = (e: KeyboardEvent) => this.handleKey(e, true)
    const ku = (e: KeyboardEvent) => this.handleKey(e, false)
    const md = (e: MouseEvent) => this.handleMouse(e, true)
    const mu = (e: MouseEvent) => this.handleMouse(e, false)
    const mm = (e: MouseEvent) => this.handleMouseMove(e)
    const ctx = (e: MouseEvent) => e.preventDefault()
    const plc = () => {
      this.pointerLocked = document.pointerLockElement === element
    }
    const blur = () => this.releaseAll()

    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    window.addEventListener('mousedown', md)
    window.addEventListener('mouseup', mu)
    window.addEventListener('mousemove', mm)
    window.addEventListener('contextmenu', ctx)
    document.addEventListener('pointerlockchange', plc)
    window.addEventListener('blur', blur)

    this.listeners = [
      () => window.removeEventListener('keydown', kd),
      () => window.removeEventListener('keyup', ku),
      () => window.removeEventListener('mousedown', md),
      () => window.removeEventListener('mouseup', mu),
      () => window.removeEventListener('mousemove', mm),
      () => window.removeEventListener('contextmenu', ctx),
      () => document.removeEventListener('pointerlockchange', plc),
      () => window.removeEventListener('blur', blur),
    ]
  }

  detach() {
    this.listeners.forEach((off) => off())
    this.listeners = []
  }

  requestLock() {
    if (!this.boundElement) return
    if (document.pointerLockElement !== this.boundElement) {
      this.boundElement.requestPointerLock?.()
    }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock?.()
  }

  isLocked() {
    return this.pointerLocked
  }

  resetLook(yaw: number = 0, pitch: number = 0) {
    this.state.yaw = yaw
    this.state.pitch = pitch
  }

  private updateAxes() {
    const s = this.state
    let f = 0, r = 0
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) f += 1
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) f -= 1
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) r += 1
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) r -= 1
    s.forward = f
    s.strafe = r
    s.sprintHeld = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')
    s.crouchHeld = this.keys.has('ControlLeft') || this.keys.has('KeyC')
    s.jumpHeld = this.keys.has('Space')
  }

  private keys = new Set<string>()

  private handleKey(e: KeyboardEvent, down: boolean) {
    // Block page-level browser shortcuts during gameplay so the game keeps
    // focus and movement keys don't double as page navigation. Only active
    // while the pointer is locked — outside of an active match (menus,
    // editor, paused with mouse free) we leave browser shortcuts alone.
    // Note: privileged shortcuts (Ctrl+T/W/N, Ctrl+Shift+T, Ctrl+Tab,
    // Alt+F4, Cmd+Q) cannot be intercepted by JS — only the Keyboard Lock
    // API in fullscreen can suppress those.
    if (this.pointerLocked && this.shouldSuppressBrowserShortcut(e)) {
      e.preventDefault()
    }

    if (e.repeat) return
    if (down) {
      // edges
      if (e.code === 'Space' && !this.keys.has('Space')) this.state.jumpPressed = true
      if (e.code === 'KeyR') this.state.reloadPressed = true
      if (
        (e.code === 'ControlLeft' || e.code === 'KeyC') &&
        !this.keys.has('ControlLeft') &&
        !this.keys.has('KeyC')
      ) {
        this.state.crouchPressed = true
      }
      this.keys.add(e.code)
    } else {
      this.keys.delete(e.code)
    }
    this.updateAxes()
  }

  private shouldSuppressBrowserShortcut(e: KeyboardEvent): boolean {
    const c = e.code

    // Standalone keys that scroll the page or hijack focus.
    if (c === 'Space' || c === 'Tab' || c === 'Backspace') return true
    if (c === 'ArrowUp' || c === 'ArrowDown' || c === 'ArrowLeft' || c === 'ArrowRight') return true
    if (c === 'PageUp' || c === 'PageDown' || c === 'Home' || c === 'End') return true
    // Firefox quick-find triggers
    if (c === 'Slash' || c === 'Quote') return true
    // Function keys that browsers reserve (find, reload, focus-address, caret).
    // F11 (fullscreen) and F12 (devtools) are intentionally NOT blocked.
    if (c === 'F1' || c === 'F3' || c === 'F4' || c === 'F5' || c === 'F6' || c === 'F7') return true

    // Ctrl/Cmd + key combos that conflict with browser features.
    if (e.ctrlKey || e.metaKey) {
      // Keep devtools combos (Ctrl+Shift+I/J/C) working for development.
      if (e.shiftKey && (c === 'KeyI' || c === 'KeyJ' || c === 'KeyC')) return false
      const blocked = new Set([
        'KeyR', // reload
        'KeyS', // save page
        'KeyP', // print
        'KeyF', // find
        'KeyG', // find again
        'KeyD', // bookmark
        'KeyH', // history
        'KeyJ', // downloads (also opens overlay in some browsers)
        'KeyL', // address bar focus
        'KeyU', // view source
        'KeyA', // select all
        'KeyE', // search bar focus
        'Equal', 'Minus', // zoom in / out
        'Digit0', // reset zoom
      ])
      if (blocked.has(c)) return true
    }

    return false
  }

  private handleMouse(e: MouseEvent, down: boolean) {
    if (e.button === 0) {
      if (down && !this.state.fireHeld) this.state.firePressed = true
      this.state.fireHeld = down
    } else if (e.button === 2) {
      this.state.aimHeld = down
    }
  }

  private handleMouseMove(e: MouseEvent) {
    if (!this.pointerLocked) return
    this.state.mouseDX += e.movementX
    this.state.mouseDY += e.movementY
  }

  /** Call once per frame from the camera system. */
  consumeLook() {
    const s = this.state
    // Reduced sensitivity when ADS for steady aim
    const scale = s.aimHeld ? 0.55 : 1
    s.yaw -= s.mouseDX * SENS * scale
    s.pitch -= s.mouseDY * SENS * scale
    if (s.pitch > PITCH_LIMIT) s.pitch = PITCH_LIMIT
    if (s.pitch < -PITCH_LIMIT) s.pitch = -PITCH_LIMIT
    s.mouseDX = 0
    s.mouseDY = 0
    return { yaw: s.yaw, pitch: s.pitch }
  }

  /** Call once per frame from gameplay; clears edge-triggered flags. */
  consumeEdges() {
    const fire = this.state.firePressed
    const jump = this.state.jumpPressed
    const reload = this.state.reloadPressed
    const crouch = this.state.crouchPressed
    this.state.firePressed = false
    this.state.jumpPressed = false
    this.state.reloadPressed = false
    this.state.crouchPressed = false
    return { fire, jump, reload, crouch }
  }

  private releaseAll() {
    this.keys.clear()
    this.state.fireHeld = false
    this.state.firePressed = false
    this.state.aimHeld = false
    this.state.jumpHeld = false
    this.state.jumpPressed = false
    this.state.crouchHeld = false
    this.state.crouchPressed = false
    this.state.sprintHeld = false
    this.state.forward = 0
    this.state.strafe = 0
  }
}

export const Input = new InputManager()
