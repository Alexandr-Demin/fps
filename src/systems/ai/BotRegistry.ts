// Global registry so external systems (Weapon hitscan) can interact with
// bots by id without prop-drilling. Each bot registers/unregisters in its
// own lifecycle.

import { Vector3 } from 'three'

export interface BotRegistration {
  id: number
  position: Vector3
  hp: number
  applyDamage: (amount: number) => boolean // returns true if kill
  isDead: () => boolean
}

class Registry {
  private bots = new Map<number, BotRegistration>()

  register(b: BotRegistration) {
    this.bots.set(b.id, b)
  }

  unregister(id: number) {
    this.bots.delete(id)
  }

  get(id: number) {
    return this.bots.get(id)
  }

  damage(id: number, amount: number) {
    const b = this.bots.get(id)
    if (!b) return false
    return b.applyDamage(amount)
  }

  all(): BotRegistration[] {
    return Array.from(this.bots.values())
  }
}

export const BotRegistry = new Registry()
