import { Vector3 } from 'three'

/**
 * Quake-style ground acceleration. Accelerates current velocity toward `wishDir`
 * up to `wishSpeed`. Doesn't add speed beyond wishSpeed along that direction.
 */
export function groundAccelerate(
  velocity: Vector3,
  wishDir: Vector3,
  wishSpeed: number,
  accel: number,
  dt: number
) {
  const currentSpeed = velocity.dot(wishDir)
  const addSpeed = wishSpeed - currentSpeed
  if (addSpeed <= 0) return
  let accelSpeed = accel * wishSpeed * dt
  if (accelSpeed > addSpeed) accelSpeed = addSpeed
  velocity.addScaledVector(wishDir, accelSpeed)
}

/**
 * Air acceleration with capped wish-speed. Capping wish-speed enables
 * classic air strafing — speed can grow beyond walking pace if you rotate
 * the view tangent to your velocity while pressing strafe + forward.
 */
export function airAccelerate(
  velocity: Vector3,
  wishDir: Vector3,
  wishSpeed: number,
  airWishCap: number,
  accel: number,
  dt: number
) {
  const cappedWish = Math.min(wishSpeed, airWishCap)
  const currentSpeed = velocity.dot(wishDir)
  const addSpeed = cappedWish - currentSpeed
  if (addSpeed <= 0) return
  let accelSpeed = accel * cappedWish * dt
  if (accelSpeed > addSpeed) accelSpeed = addSpeed
  velocity.addScaledVector(wishDir, accelSpeed)
}

/**
 * Exponential friction with stopspeed floor (Quake-style). Operates on the
 * horizontal component only — caller passes a flat vector.
 */
export function applyFriction(velocity: Vector3, friction: number, stopSpeed: number, dt: number) {
  const speed = velocity.length()
  if (speed < 0.01) {
    velocity.set(0, 0, 0)
    return
  }
  const control = speed < stopSpeed ? stopSpeed : speed
  const drop = control * friction * dt
  const newSpeed = Math.max(0, speed - drop)
  velocity.multiplyScalar(newSpeed / speed)
}

/** Clamp a vector's xz length without touching y. */
export function clampHorizontal(v: Vector3, max: number) {
  const lenSq = v.x * v.x + v.z * v.z
  if (lenSq <= max * max) return
  const inv = max / Math.sqrt(lenSq)
  v.x *= inv
  v.z *= inv
}
