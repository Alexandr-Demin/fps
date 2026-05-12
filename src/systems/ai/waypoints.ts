import { Vector3 } from 'three'
import type { MapData } from '../../core/mapTypes'
import { filterByKind } from '../../core/mapTypes'

export interface WaypointGraph {
  points: Vector3[]
  links: number[][]
}

/**
 * Build a waypoint adjacency graph from the current map's waypoint entities.
 * Two waypoints are linked if their euclidean distance is below `linkDist`.
 * Caching is the caller's responsibility — this is cheap enough to call on
 * demand (~few hundred dist comparisons).
 */
export function buildWaypointGraph(map: MapData, linkDist = 28): WaypointGraph {
  const points = filterByKind(map.entities, 'waypoint').map(
    (w) => new Vector3(w.pos[0], w.pos[1], w.pos[2])
  )
  if (points.length === 0) {
    // Fallback: synthesize a single waypoint at origin so the bot AI doesn't
    // crash on an empty map.
    points.push(new Vector3(0, 1.5, 0))
  }
  const links: number[][] = points.map(() => [])
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const d = points[i].distanceTo(points[j])
      if (d < linkDist) {
        links[i].push(j)
        links[j].push(i)
      }
    }
  }
  return { points, links }
}

export function nearestWaypoint(graph: WaypointGraph, p: Vector3): number {
  let bestIdx = 0
  let bestDist = Infinity
  for (let i = 0; i < graph.points.length; i++) {
    const d = graph.points[i].distanceToSquared(p)
    if (d < bestDist) {
      bestDist = d
      bestIdx = i
    }
  }
  return bestIdx
}

export function pickRandomNeighbor(graph: WaypointGraph, idx: number): number {
  const links = graph.links[idx]
  if (!links || links.length === 0) return idx
  return links[Math.floor(Math.random() * links.length)]
}

/**
 * A* shortest path between two waypoint indices. Returns the full sequence
 * including endpoints, or an empty array if no path exists.
 */
export function findPath(
  graph: WaypointGraph,
  from: number,
  to: number
): number[] {
  if (from === to) return [from]
  if (!graph.points[from] || !graph.points[to]) return []

  const cameFrom = new Map<number, number>()
  const gScore = new Map<number, number>([[from, 0]])
  const fScore = new Map<number, number>([
    [from, graph.points[from].distanceTo(graph.points[to])],
  ])
  const open = new Set<number>([from])

  while (open.size > 0) {
    let current = -1
    let bestF = Infinity
    for (const n of open) {
      const fn = fScore.get(n) ?? Infinity
      if (fn < bestF) {
        bestF = fn
        current = n
      }
    }
    if (current < 0) break
    if (current === to) {
      const path: number[] = [current]
      while (cameFrom.has(path[0])) path.unshift(cameFrom.get(path[0])!)
      return path
    }
    open.delete(current)
    const neighbors = graph.links[current] || []
    for (const nb of neighbors) {
      const tentative =
        (gScore.get(current) ?? Infinity) +
        graph.points[current].distanceTo(graph.points[nb])
      if (tentative < (gScore.get(nb) ?? Infinity)) {
        cameFrom.set(nb, current)
        gScore.set(nb, tentative)
        fScore.set(
          nb,
          tentative + graph.points[nb].distanceTo(graph.points[to])
        )
        open.add(nb)
      }
    }
  }
  return []
}

/**
 * Returns a copy of the graph where each link is filtered through a custom
 * LOS predicate — e.g. a physics raycast against the world. This prunes
 * connections that exist by distance but are blocked by walls.
 */
export function filterGraphLOS(
  graph: WaypointGraph,
  losTest: (a: Vector3, b: Vector3) => boolean
): WaypointGraph {
  const links = graph.links.map((list, i) =>
    list.filter((j) => losTest(graph.points[i], graph.points[j]))
  )
  return { points: graph.points, links }
}
