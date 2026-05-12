import { MATCH } from '../../core/constants'
import { Bot } from './Bot'

export function BotSwarm() {
  const ids = Array.from({ length: MATCH.BOT_COUNT }, (_, i) => i)
  return (
    <>
      {ids.map((id) => (
        <Bot key={id} id={id} />
      ))}
    </>
  )
}
