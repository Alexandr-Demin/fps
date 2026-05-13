import { useNetStore } from '../../state/netStore'
import { RemotePlayer } from './RemotePlayer'

/**
 * Renders all other players in the current MP room. Input dispatch lives
 * in PlayerController now (driven by the fixed-step sim loop), so this
 * component is purely view-layer.
 */
export function NetRoom() {
  const remotes = useNetStore((s) => s.remotePlayers)
  return (
    <>
      {Object.values(remotes)
        .filter((snap) => snap.alive)
        .map((snap) => (
          <RemotePlayer key={snap.id} snap={snap} />
        ))}
    </>
  )
}
