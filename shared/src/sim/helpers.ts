// Pure-math movement helpers, used by both client (PlayerController) and
// server (ServerSim) so the simulation step matches bit-for-bit. No Three.js
// / Rapier types here — operates on plain Vec3 tuples.

import type { Vec3 } from '../protocol.js'

export function vec3(x: number, y: number, z: number): Vec3 {
  return [x, y, z]
}

export function vec3Set(out: Vec3, x: number, y: number, z: number) {
  out[0] = x
  out[1] = y
  out[2] = z
}

export function vec3Copy(out: Vec3, src: Vec3) {
  out[0] = src[0]
  out[1] = src[1]
  out[2] = src[2]
}

/**
 * Quake-style ground acceleration on a horizontal (xz) velocity. Y is left
 * untouched. wishDir is assumed unit-length in the xz plane.
 */
export function groundAccelerate(
  vel: Vec3,
  wishDirX: number,
  wishDirZ: number,
  wishSpeed: number,
  accel: number,
  dt: number,
) {
  const currentSpeed = vel[0] * wishDirX + vel[2] * wishDirZ
  const addSpeed = wishSpeed - currentSpeed
  if (addSpeed <= 0) return
  let accelSpeed = accel * wishSpeed * dt
  if (accelSpeed > addSpeed) accelSpeed = addSpeed
  vel[0] += wishDirX * accelSpeed
  vel[2] += wishDirZ * accelSpeed
}

/**
 * Air acceleration with capped wish-speed — enables CS/Quake air strafing.
 */
export function airAccelerate(
  vel: Vec3,
  wishDirX: number,
  wishDirZ: number,
  wishSpeed: number,
  airWishCap: number,
  accel: number,
  dt: number,
) {
  const cappedWish = Math.min(wishSpeed, airWishCap)
  const currentSpeed = vel[0] * wishDirX + vel[2] * wishDirZ
  const addSpeed = cappedWish - currentSpeed
  if (addSpeed <= 0) return
  let accelSpeed = accel * cappedWish * dt
  if (accelSpeed > addSpeed) accelSpeed = addSpeed
  vel[0] += wishDirX * accelSpeed
  vel[2] += wishDirZ * accelSpeed
}

/**
 * Exponential friction with stopspeed floor. Operates only on the xz
 * component; y is preserved.
 */
export function applyFrictionXZ(
  vel: Vec3,
  friction: number,
  stopSpeed: number,
  dt: number,
) {
  const speed = Math.hypot(vel[0], vel[2])
  if (speed < 0.01) {
    vel[0] = 0
    vel[2] = 0
    return
  }
  const control = speed < stopSpeed ? stopSpeed : speed
  const drop = control * friction * dt
  const newSpeed = Math.max(0, speed - drop)
  const k = newSpeed / speed
  vel[0] *= k
  vel[2] *= k
}

/** Clamp the xz length of `vel` to `max`. y left alone. */
export function clampHorizontal(vel: Vec3, max: number) {
  const lenSq = vel[0] * vel[0] + vel[2] * vel[2]
  if (lenSq <= max * max) return
  const inv = max / Math.sqrt(lenSq)
  vel[0] *= inv
  vel[2] *= inv
}
