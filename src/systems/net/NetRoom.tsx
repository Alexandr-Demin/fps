import { useFrame } from '@react-three/fiber'
import { useNetStore } from '../../state/netStore'
import { NetClient } from './NetClient'
import { RemotePlayer } from './RemotePlayer'

export function NetRoom() {
  const remotes = useNetStore((s) => s.remotePlayers)
  useFrame(() => NetClient.sendInput())
  return (
    <>
      {Object.values(remotes).map((snap) => (
        <RemotePlayer key={snap.id} snap={snap} />
      ))}
    </>
  )
}
