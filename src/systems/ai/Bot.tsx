import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  CapsuleCollider,
  RigidBody,
  useRapier,
  type RapierRigidBody,
} from '@react-three/rapier'
import { Group, Mesh, MeshStandardMaterial, Vector3 } from 'three'
import { BOT, COLLISION, HITBOX } from '../../core/constants'
import {
  buildWaypointGraph,
  filterGraphLOS,
  findPath,
  nearestWaypoint,
  type WaypointGraph,
} from './waypoints'
import { filterByKind } from '../../core/mapTypes'
import { playerHandle } from '../movement/PlayerController'
import { BotRegistry } from './BotRegistry'
import { registerBotCollider, unregisterBotCollider } from '../combat/hitscan'
import { useGameStore } from '../../state/gameStore'
import { AudioBus } from '../audio/AudioSystem'

type BotPhase = 'patrol' | 'chase' | 'attack' | 'search' | 'dead'

interface Props {
  id: number
}

const tmpVec = new Vector3()

export function Bot({ id }: Props) {
  const bodyRef = useRef<RapierRigidBody>(null!)
  const meshRef = useRef<Group>(null!)
  const headMatRef = useRef<MeshStandardMaterial>(null!)
  const eyeMatRef = useRef<MeshStandardMaterial>(null!)
  const hpBarGroupRef = useRef<Group>(null!)
  const hpBarFillRef = useRef<Mesh>(null!)
  const { world, rapier } = useRapier()
  const { camera } = useThree()
  const showHitboxes = useGameStore((s) => s.showHitboxes)

  const headMaterial = useMemo(
    () => new MeshStandardMaterial({ color: '#1d1f24', roughness: 0.55, metalness: 0.4 }),
    []
  )
  const eyeMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        color: '#000',
        emissive: '#ff5028',
        emissiveIntensity: 1.2,
        toneMapped: false,
      }),
    []
  )
  // Assign refs to created materials for direct mutation
  headMatRef.current = headMaterial
  eyeMatRef.current = eyeMaterial

  // Subscribe to the current map; build a waypoint graph, then filter its
  // links through a physics-LOS test so connections blocked by walls are
  // dropped (otherwise bots would direct-steer into walls and stall).
  //
  // The LOS filter is computed in a deferred effect, not useMemo: physics
  // colliders for the map are registered through their own useEffects after
  // render, so a synchronous raycast during render would see an empty world.
  const currentMap = useGameStore((s) => s.currentMap)
  const rawGraph = useMemo<WaypointGraph>(
    () => buildWaypointGraph(currentMap),
    [currentMap]
  )
  const [waypointGraph, setWaypointGraph] = useState<WaypointGraph>(rawGraph)

  useEffect(() => {
    let cancelled = false
    // Defer one frame so MapLoader's colliders are mounted before we cast.
    const t = setTimeout(() => {
      if (cancelled) return
      const filtered = filterGraphLOS(rawGraph, (a, b) => {
        const dir = new Vector3().subVectors(b, a)
        const dist = dir.length()
        if (dist < 0.01) return false
        dir.divideScalar(dist)
        const ray = new rapier.Ray(
          { x: a.x, y: a.y + 0.3, z: a.z },
          { x: dir.x, y: dir.y, z: dir.z }
        )
        const hit = world.castRay(ray, dist * 0.95, true)
        return !hit
      })
      setWaypointGraph(filtered)
    }, 80)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [rawGraph, world, rapier])

  const hp = useRef(BOT.MAX_HP)
  const phase = useRef<BotPhase>('patrol')
  // Path-based navigation — A* over the LOS-filtered waypoint graph.
  const path = useRef<number[]>([])
  const pathIdx = useRef(0)
  const reactionTimer = useRef(0)
  const attackTimer = useRef(0)
  const searchTimer = useRef(0)
  const stuckTimer = useRef(0)
  const lastSeenPlayer = useRef(new Vector3())
  const yaw = useRef(Math.random() * Math.PI * 2)
  const velocity = useRef(new Vector3())
  const respawnTimer = useRef(0)
  const grounded = useRef(false)
  const damageFlash = useRef(0)
  // Combat accuracy state
  const burstShots = useRef(0)
  const lastShotAt = useRef(-999)
  const spottedAt = useRef(-1)
  const pathRefreshTimer = useRef(0)

  // Build kinematic character controller for the bot
  const controller = useMemo(() => {
    const c = world.createCharacterController(0.02)
    c.enableAutostep(0.4, 0.15, true)
    c.enableSnapToGround(0.35)
    c.setSlideEnabled(true)
    c.setMaxSlopeClimbAngle((55 * Math.PI) / 180)
    c.setApplyImpulsesToDynamicBodies(false)
    return c
  }, [world])

  useEffect(() => {
    return () => {
      try {
        world.removeCharacterController(controller)
      } catch {}
    }
  }, [world, controller])

  // Read live spawn data from the current map. If the map has zero bot spawns,
  // fall back to a single safe location so we don't crash.
  function getBotSpawns(): [number, number, number][] {
    const map = useGameStore.getState().currentMap
    const list = filterByKind(map.entities, 'botSpawn').map((e) => e.pos)
    return list.length > 0 ? list : [[0, 2.5, 0]]
  }

  // Each bot gets a deterministic starting spawn keyed off id, plus a small
  // random jitter so they never overlap. Subsequent respawns pick a random
  // spawn from the half farthest from the player.
  function pickSpawn(initial: boolean): [number, number, number] {
    const spawns = getBotSpawns()
    let idx: number
    if (initial) {
      idx = id % spawns.length
    } else {
      const ranked = spawns
        .map((s, i) => {
          const dx = s[0] - playerHandle.pos.x
          const dz = s[2] - playerHandle.pos.z
          return { i, d: dx * dx + dz * dz }
        })
        .sort((a, b) => b.d - a.d)
      const pool = ranked.slice(0, Math.max(2, Math.ceil(ranked.length / 2)))
      idx = pool[Math.floor(Math.random() * pool.length)].i
    }
    const s = spawns[idx]
    return [s[0] + (Math.random() - 0.5) * 3, s[1], s[2] + (Math.random() - 0.5) * 3]
  }

  // Spawn / register
  useEffect(() => {
    const spawn = pickSpawn(true)
    const body = bodyRef.current
    if (body) {
      body.setTranslation({ x: spawn[0], y: spawn[1], z: spawn[2] }, true)
    }
    const collider = body?.collider(0)
    if (collider) registerBotCollider((collider as any).handle, id)

    pickPatrolPath(new Vector3(spawn[0], spawn[1], spawn[2]))

    const reg = {
      id,
      position: new Vector3(spawn[0], spawn[1], spawn[2]),
      hp: BOT.MAX_HP,
      applyDamage: (amount: number) => {
        if (phase.current === 'dead') return false
        hp.current -= amount
        damageFlash.current = 1
        // Being hit always alerts the bot and starts a chase — recompute
        // the path so the bot actually navigates toward the player rather
        // than following an obsolete patrol route.
        phase.current = 'chase'
        lastSeenPlayer.current.copy(playerHandle.pos)
        reactionTimer.current = BOT.REACTION_TIME
        pickChasePath(playerHandle.pos)
        if (hp.current <= 0) {
          die()
          return true
        }
        return false
      },
      isDead: () => phase.current === 'dead',
    }
    BotRegistry.register(reg)

    return () => {
      BotRegistry.unregister(id)
      if (collider) unregisterBotCollider((collider as any).handle)
    }
  }, [id])

  function die() {
    phase.current = 'dead'
    respawnTimer.current = BOT.RESPAWN_DELAY
    // visually drop the bot below the floor
    const body = bodyRef.current
    if (body) {
      const t = body.translation()
      body.setTranslation({ x: t.x, y: t.y - 30, z: t.z }, true)
    }
  }

  function respawn() {
    const spawn = pickSpawn(false)
    const body = bodyRef.current
    if (body) body.setTranslation({ x: spawn[0], y: spawn[1], z: spawn[2] }, true)
    hp.current = BOT.MAX_HP
    phase.current = 'patrol'
    velocity.current.set(0, 0, 0)
    burstShots.current = 0
    spottedAt.current = -1
    stuckTimer.current = 0
    pickPatrolPath(new Vector3(spawn[0], spawn[1], spawn[2]))
  }

  // Build an A* path from the bot's current pos to a random distant waypoint.
  // The bot then walks node-to-node until the path is exhausted, then picks
  // again. This makes bots roam the entire map, not just their local cluster.
  function pickPatrolPath(fromPos?: Vector3) {
    const N = waypointGraph.points.length
    if (N === 0) {
      path.current = []
      pathIdx.current = 0
      return
    }
    const start = fromPos
      ? nearestWaypoint(waypointGraph, fromPos)
      : nearestWaypoint(waypointGraph, getMyPos())
    for (let attempt = 0; attempt < 10; attempt++) {
      const targetIdx = Math.floor(Math.random() * N)
      if (targetIdx === start) continue
      const p = findPath(waypointGraph, start, targetIdx)
      if (p.length >= 2) {
        path.current = p
        pathIdx.current = 1   // skip the starting node since we're already there
        return
      }
    }
    // Fallback for fragmented graphs (walls without waypoints at gaps): pick
    // any random waypoint and direct-steer toward it. The character controller
    // will slide along walls; stuck-detection will repath if we get pinned.
    let targetIdx = Math.floor(Math.random() * N)
    if (targetIdx === start) targetIdx = (start + 1) % N
    path.current = [start, targetIdx]
    pathIdx.current = 1
  }

  function pickChasePath(targetPos: Vector3) {
    if (waypointGraph.points.length === 0) {
      path.current = []
      pathIdx.current = 0
      return
    }
    const start = nearestWaypoint(waypointGraph, getMyPos())
    const end = nearestWaypoint(waypointGraph, targetPos)
    const p = findPath(waypointGraph, start, end)
    if (p.length >= 2) {
      path.current = p
      pathIdx.current = 1
    } else {
      path.current = p
      pathIdx.current = 0
    }
  }

  // Advance the path cursor as the bot reaches each node; return the world-
  // space position of the current target node, or null when the path is
  // exhausted.
  function nextPathNode(myPos: Vector3): Vector3 | null {
    while (pathIdx.current < path.current.length) {
      const idx = path.current[pathIdx.current]
      const p = waypointGraph.points[idx]
      if (!p) {
        pathIdx.current++
        continue
      }
      const dx = p.x - myPos.x
      const dz = p.z - myPos.z
      if (Math.hypot(dx, dz) < BOT.WAYPOINT_TOLERANCE) {
        pathIdx.current++
        continue
      }
      return p
    }
    return null
  }

  function getMyPos(): Vector3 {
    const body = bodyRef.current
    if (!body) return new Vector3()
    const t = body.translation()
    return new Vector3(t.x, t.y, t.z)
  }

  function canSeePlayer(playerPos: Vector3): boolean {
    const body = bodyRef.current
    if (!body) return false
    const t = body.translation()
    const eye = new Vector3(t.x, t.y + 0.5, t.z)
    const toPlayer = new Vector3(
      playerPos.x - eye.x,
      playerPos.y - eye.y,
      playerPos.z - eye.z
    )
    const distSq = toPlayer.lengthSq()
    if (distSq > BOT.SIGHT_RANGE * BOT.SIGHT_RANGE) return false
    const dist = Math.sqrt(distSq)
    toPlayer.divideScalar(dist)

    // FOV check: bot's facing yaw
    const facing = new Vector3(-Math.sin(yaw.current), 0, -Math.cos(yaw.current))
    const flatTo = new Vector3(toPlayer.x, 0, toPlayer.z).normalize()
    const dot = facing.dot(flatTo)
    const halfFov = Math.cos(BOT.SIGHT_FOV * 0.5)
    if (dot < halfFov) return false

    // Raycast LOS check
    const ray = new rapier.Ray(
      { x: eye.x, y: eye.y, z: eye.z },
      { x: toPlayer.x, y: toPlayer.y, z: toPlayer.z }
    )
    const ownCollider = body.collider(0)
    const hit = world.castRay(
      ray,
      dist + 0.5,
      true,
      undefined,
      undefined,
      undefined,
      body
    )
    if (!hit) return true
    // If first thing we hit is close to player, treat as visible
    return hit.timeOfImpact + 0.6 >= dist
  }

  useFrame((_, dtRaw) => {
    const body = bodyRef.current
    if (!body) return
    const dt = Math.min(dtRaw, 1 / 30)
    const gamePhase = useGameStore.getState().phase
    if (gamePhase === 'paused' || gamePhase === 'menu') return

    damageFlash.current = Math.max(0, damageFlash.current - dt * 3)

    // ===== DEAD STATE =====
    if (phase.current === 'dead') {
      respawnTimer.current -= dt
      if (respawnTimer.current <= 0) respawn()
      const t = body.translation()
      if (meshRef.current) meshRef.current.position.set(t.x, t.y, t.z)
      if (hpBarGroupRef.current) hpBarGroupRef.current.position.set(0, -1000, 0)
      return
    }

    const t = body.translation()
    const myPos = tmpVec.set(t.x, t.y, t.z)
    const playerPos = playerHandle.pos
    const distToPlayer = myPos.distanceTo(playerPos)

    // ===== PERCEPTION =====
    const nowSec = performance.now() / 1000
    const sees = canSeePlayer(playerPos)
    if (sees) {
      if (spottedAt.current < 0) spottedAt.current = nowSec
      reactionTimer.current += dt
      if (reactionTimer.current >= BOT.REACTION_TIME) {
        lastSeenPlayer.current.copy(playerPos)
        const prev = phase.current
        if (distToPlayer <= BOT.ATTACK_RANGE) phase.current = 'attack'
        else phase.current = 'chase'
        // First transition into chase → build path to player so the bot
        // navigates around walls instead of getting stuck on them.
        if (prev !== 'chase' && phase.current === 'chase') {
          pickChasePath(playerPos)
          pathRefreshTimer.current = 0
        }
      }
      // While actively chasing a visible target, refresh the path every
      // ~0.6 s so the bot adapts as the player moves.
      if (phase.current === 'chase') {
        pathRefreshTimer.current += dt
        if (pathRefreshTimer.current > 0.6) {
          pathRefreshTimer.current = 0
          pickChasePath(playerPos)
        }
      }
    } else {
      pathRefreshTimer.current = 0
      spottedAt.current = -1
      reactionTimer.current = Math.max(0, reactionTimer.current - dt * 0.7)
      if (phase.current === 'attack' || phase.current === 'chase') {
        phase.current = 'search'
        searchTimer.current = BOT.SEARCH_DURATION
        // Search target is the last place we saw the player — path there.
        pickChasePath(lastSeenPlayer.current)
      }
    }

    if (phase.current === 'search') {
      searchTimer.current -= dt
      if (searchTimer.current <= 0) {
        phase.current = 'patrol'
        pickPatrolPath()
      }
    }

    // ===== MOVE TARGET =====
    let moveTarget: Vector3 | null = null
    let moveSpeed = BOT.WALK_SPEED

    switch (phase.current) {
      case 'patrol': {
        moveTarget = nextPathNode(myPos)
        if (!moveTarget) {
          pickPatrolPath()
          moveTarget = nextPathNode(myPos)
        }
        moveSpeed = BOT.WALK_SPEED
        break
      }
      case 'chase': {
        // Follow the precomputed waypoint path toward last seen player. Once
        // we're past the last node OR we have direct line-of-sight to the
        // player, switch to direct steering.
        const node = nextPathNode(myPos)
        if (node && myPos.distanceTo(lastSeenPlayer.current) > 6) {
          moveTarget = node
        } else {
          moveTarget = lastSeenPlayer.current
        }
        moveSpeed = BOT.CHASE_SPEED
        break
      }
      case 'search': {
        const node = nextPathNode(myPos)
        if (node) {
          moveTarget = node
        } else {
          moveTarget = lastSeenPlayer.current
          if (myPos.distanceTo(moveTarget) < BOT.WAYPOINT_TOLERANCE) {
            // Arrived at last-seen spot, look around
            yaw.current += dt * 1.2
            moveTarget = null
          }
        }
        moveSpeed = BOT.WALK_SPEED * 1.1
        break
      }
      case 'attack': {
        // Hold position, face player. CS-bots stop to shoot — moving while
        // firing would also tank accuracy.
        moveTarget = null
        moveSpeed = 0
        attackTimer.current += dt
        const dx = playerPos.x - myPos.x
        const dz = playerPos.z - myPos.z
        const desiredYaw = Math.atan2(-dx, -dz)
        let dy = desiredYaw - yaw.current
        while (dy > Math.PI) dy -= Math.PI * 2
        while (dy < -Math.PI) dy += Math.PI * 2
        yaw.current += dy * Math.min(1, dt * 8)

        // Reaction lag before first shot once spotted — CS-style.
        const spotElapsed = spottedAt.current >= 0 ? nowSec - spottedAt.current : 0
        if (
          attackTimer.current >= BOT.ATTACK_INTERVAL &&
          spotElapsed >= BOT.SPOTTING_DELAY
        ) {
          attackTimer.current = 0
          fireAtPlayer(myPos, playerPos)
        }

        if (distToPlayer > BOT.ATTACK_RANGE * 1.1) {
          phase.current = 'chase'
          pickChasePath(playerPos)
        }
        break
      }
    }

    // ===== STEERING =====
    const desired = new Vector3()
    if (moveTarget) {
      const dir = new Vector3().subVectors(moveTarget, myPos)
      dir.y = 0
      if (dir.lengthSq() > 0.01) {
        dir.normalize()
        // Face move direction
        const desiredYaw = Math.atan2(-dir.x, -dir.z)
        let dy = desiredYaw - yaw.current
        while (dy > Math.PI) dy -= Math.PI * 2
        while (dy < -Math.PI) dy += Math.PI * 2
        yaw.current += dy * Math.min(1, dt * 6)
        desired.copy(dir).multiplyScalar(moveSpeed)
      }
    }

    // Apply simple physics: horizontal lerp to desired, vertical gravity
    const accel = 12
    velocity.current.x += (desired.x - velocity.current.x) * Math.min(1, dt * accel)
    velocity.current.z += (desired.z - velocity.current.z) * Math.min(1, dt * accel)

    // Gravity
    const groundRay = new rapier.Ray(
      { x: myPos.x, y: myPos.y - BOT.HEIGHT * 0.5 + BOT.RADIUS, z: myPos.z },
      { x: 0, y: -1, z: 0 }
    )
    const gHit = world.castRay(groundRay, 0.35, true, undefined, undefined, undefined, body)
    grounded.current = !!gHit
    if (grounded.current) {
      if (velocity.current.y < 0) velocity.current.y = -1.5
    } else {
      velocity.current.y -= 28 * dt
      if (velocity.current.y < -45) velocity.current.y = -45
    }

    const dx = velocity.current.x * dt
    const dy = velocity.current.y * dt
    const dz = velocity.current.z * dt

    const collider = body.collider(0)
    controller.computeColliderMovement(collider, { x: dx, y: dy, z: dz })
    const mv = controller.computedMovement()

    body.setTranslation(
      { x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z },
      true
    )

    // Stuck detection: if the bot wants to move but actual horizontal
    // movement is tiny, count seconds. After STUCK_REPATH_TIME, force a
    // repath — typically a waypoint is on the wrong side of a wall.
    const wantedHoriz = Math.hypot(dx, dz)
    const actualHoriz = Math.hypot(mv.x, mv.z)
    if (wantedHoriz > 0.01 && actualHoriz < wantedHoriz * 0.25) {
      stuckTimer.current += dt
      if (stuckTimer.current > BOT.STUCK_REPATH_TIME) {
        stuckTimer.current = 0
        if (phase.current === 'chase' || phase.current === 'search') {
          pickChasePath(lastSeenPlayer.current)
        } else {
          pickPatrolPath()
        }
      }
    } else {
      stuckTimer.current = 0
    }

    // Update mesh
    if (meshRef.current) {
      meshRef.current.position.set(t.x + mv.x, t.y + mv.y, t.z + mv.z)
      meshRef.current.rotation.y = yaw.current
    }

    // Update HP bar — billboard above head, fill scaled by HP ratio
    if (hpBarGroupRef.current) {
      const g = hpBarGroupRef.current
      g.position.set(t.x + mv.x, t.y + mv.y + BOT.HEIGHT * 0.5 + 0.45, t.z + mv.z)
      g.quaternion.copy(camera.quaternion)
    }
    if (hpBarFillRef.current) {
      const ratio = Math.max(0, Math.min(1, hp.current / BOT.MAX_HP))
      hpBarFillRef.current.scale.x = ratio
      // anchor fill to the left edge of the 0.7-wide bar
      hpBarFillRef.current.position.x = -0.35 * (1 - ratio)
      const mat = hpBarFillRef.current.material as MeshStandardMaterial
      mat.color.setRGB(
        ratio < 0.35 ? 1.0 : 1.0 - ratio * 0.4,
        ratio < 0.35 ? 0.2 : 0.85,
        ratio < 0.35 ? 0.15 : 0.4
      )
    }
    // Tint head red on damage flash, alert color when chase/attack
    if (headMatRef.current) {
      const alert = phase.current === 'attack' || phase.current === 'chase' ? 1 : 0
      const flash = damageFlash.current
      const r = 0.16 + flash * 0.7 + alert * 0.15
      const g = 0.18 - flash * 0.15
      const b = 0.22 - flash * 0.18
      headMatRef.current.color.setRGB(r, g, b)
    }
    if (eyeMatRef.current) {
      const intensity =
        phase.current === 'attack' ? 5.5 :
        phase.current === 'chase' ? 3.5 :
        phase.current === 'search' ? 2 : 0.8
      eyeMatRef.current.emissiveIntensity = intensity
    }

    // Update registry position
    const reg = BotRegistry.get(id)
    if (reg) reg.position.set(t.x + mv.x, t.y + mv.y, t.z + mv.z)
  })

  function fireAtPlayer(from: Vector3, playerPos: Vector3) {
    const body = bodyRef.current
    if (!body) return
    // Tir / safe mode — bots track the player but don't fire at all:
    // no muzzle audio, no wall impacts, no damage. Pure target dummies.
    if (!useGameStore.getState().botsCanDamage) return
    const origin = new Vector3(from.x, from.y + 0.5, from.z)
    const dir = new Vector3().subVectors(playerPos, origin).normalize()

    // CS-style accuracy model: spread is the sum of base + a movement
    // penalty proportional to the player's horizontal speed + a burst
    // penalty for sustained fire. Fast strafing → much harder to hit;
    // standing still → the first few shots in a burst land tight.
    const now = performance.now() / 1000
    if (now - lastShotAt.current > BOT.BURST_RESET) burstShots.current = 0
    const playerSpeed = Math.hypot(playerHandle.vel.x, playerHandle.vel.z)
    let spread = BOT.ATTACK_SPREAD_BASE
    spread += playerSpeed * BOT.ATTACK_SPREAD_PLAYER_VEL
    spread += burstShots.current * BOT.ATTACK_SPREAD_BURST
    if (spread > BOT.ATTACK_SPREAD_MAX) spread = BOT.ATTACK_SPREAD_MAX
    burstShots.current++
    lastShotAt.current = now

    dir.x += (Math.random() - 0.5) * spread
    dir.y += (Math.random() - 0.5) * spread * 0.6  // less vertical wander
    dir.z += (Math.random() - 0.5) * spread
    dir.normalize()

    const ray = new rapier.Ray(origin, dir)
    const hit = world.castRay(
      ray,
      BOT.ATTACK_RANGE + 2,
      true,
      undefined,
      undefined,
      undefined,
      body
    )

    AudioBus.playPistol([origin.x, origin.y, origin.z])

    // If LOS to player is clear (no hit before player distance), apply damage
    const distToPlayer = origin.distanceTo(playerPos)
    if (!hit || hit.timeOfImpact > distToPlayer - 0.6) {
      const store = useGameStore.getState()
      if (store.botsCanDamage) {
        AudioBus.playHurt()
        store.damagePlayer(BOT.ATTACK_DAMAGE)
      }
    } else {
      // Add a wall impact for visual feedback
      const point: [number, number, number] = [
        origin.x + dir.x * hit.timeOfImpact,
        origin.y + dir.y * hit.timeOfImpact,
        origin.z + dir.z * hit.timeOfImpact,
      ]
      AudioBus.playImpact(point)
      useGameStore.getState().addImpact(point, [0, 1, 0], false)
    }
  }

  return (
    <>
      <RigidBody
        ref={bodyRef}
        type="kinematicPosition"
        colliders={false}
        position={[0, 50, 0]}
        enabledRotations={[false, false, false]}
        collisionGroups={
          (COLLISION.GROUP_BOT << 16) | (COLLISION.GROUP_WORLD | COLLISION.GROUP_PLAYER)
        }
      >
        <CapsuleCollider args={[BOT.HEIGHT * 0.5 - BOT.RADIUS, BOT.RADIUS]} />
      </RigidBody>

      {/* Visual mesh — separated from body so we can render it freely */}
      <group ref={meshRef}>
        {/* Body */}
        <mesh position={[0, 0, 0]} castShadow receiveShadow>
          <capsuleGeometry args={[BOT.RADIUS * 0.95, BOT.HEIGHT - BOT.RADIUS * 2, 6, 12]} />
          <meshStandardMaterial color="#2a2d33" roughness={0.75} metalness={0.25} />
        </mesh>
        {/* Head (cube — brutalist robot) */}
        <mesh position={[0, BOT.HEIGHT * 0.5 - 0.05, 0]} material={headMaterial} castShadow>
          <boxGeometry args={[0.42, 0.32, 0.36]} />
        </mesh>
        {/* Eye / sensor strip */}
        <mesh position={[0, BOT.HEIGHT * 0.5 - 0.05, -0.19]} material={eyeMaterial}>
          <boxGeometry args={[0.3, 0.07, 0.02]} />
        </mesh>
        {/* Shoulder boxes for silhouette */}
        <mesh position={[0.3, BOT.HEIGHT * 0.25, 0]} castShadow>
          <boxGeometry args={[0.14, 0.18, 0.22]} />
          <meshStandardMaterial color="#15171b" roughness={0.7} metalness={0.4} />
        </mesh>
        <mesh position={[-0.3, BOT.HEIGHT * 0.25, 0]} castShadow>
          <boxGeometry args={[0.14, 0.18, 0.22]} />
          <meshStandardMaterial color="#15171b" roughness={0.7} metalness={0.4} />
        </mesh>

        {/* Debug hitbox wireframes — toggled from settings dialog */}
        {showHitboxes && (
          <group>
            {[HITBOX.HEAD, HITBOX.TORSO, HITBOX.LEGS].map((zone, i) => (
              <mesh key={i} position={zone.center as unknown as [number, number, number]}>
                <boxGeometry args={zone.size as unknown as [number, number, number]} />
                <meshBasicMaterial
                  color={zone.color}
                  wireframe
                  transparent
                  opacity={0.75}
                  depthTest={false}
                  toneMapped={false}
                />
              </mesh>
            ))}
          </group>
        )}
      </group>

      {/* HP bar — billboarded above the bot's head */}
      <group ref={hpBarGroupRef} position={[0, -1000, 0]}>
        {/* Outline / background */}
        <mesh position={[0, 0, -0.002]} renderOrder={10}>
          <planeGeometry args={[0.78, 0.12]} />
          <meshBasicMaterial color="#000" transparent opacity={0.75} depthTest={false} />
        </mesh>
        {/* Track */}
        <mesh position={[0, 0, -0.001]} renderOrder={11}>
          <planeGeometry args={[0.7, 0.06]} />
          <meshBasicMaterial color="#2a2d33" depthTest={false} />
        </mesh>
        {/* Fill — scaled from left edge */}
        <mesh ref={hpBarFillRef} position={[0, 0, 0]} renderOrder={12}>
          <planeGeometry args={[0.7, 0.06]} />
          <meshStandardMaterial
            color="#dfe6f0"
            emissive="#ffffff"
            emissiveIntensity={0.4}
            depthTest={false}
            toneMapped={false}
          />
        </mesh>
      </group>
    </>
  )
}
