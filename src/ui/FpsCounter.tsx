import { useEffect, useRef, useState } from 'react'

/**
 * Lightweight FPS meter. Samples frame intervals over a rolling 500ms window
 * and exposes both the average and the 1%-low (worst-frame) value so the
 * player can spot hitches during debug sessions.
 */
export function FpsCounter() {
  const [stats, setStats] = useState({ fps: 0, low: 0 })
  const frames = useRef(0)
  const windowStart = useRef(performance.now())
  const worstDt = useRef(0)

  useEffect(() => {
    let raf = 0
    let lastFrame = performance.now()
    const tick = () => {
      const now = performance.now()
      const dt = now - lastFrame
      lastFrame = now
      frames.current++
      if (dt > worstDt.current) worstDt.current = dt
      if (now - windowStart.current >= 500) {
        const elapsed = now - windowStart.current
        const fps = (frames.current * 1000) / elapsed
        const low = worstDt.current > 0 ? 1000 / worstDt.current : 0
        setStats({ fps, low })
        frames.current = 0
        windowStart.current = now
        worstDt.current = 0
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const color =
    stats.fps >= 90 ? '#7fffa3' :
    stats.fps >= 55 ? '#f0e070' :
    '#ff6850'

  return (
    <div className="fps-counter">
      <div className="fps-row" style={{ color }}>
        <span className="fps-label">FPS</span>
        <span className="fps-value">{stats.fps.toFixed(0)}</span>
      </div>
      <div className="fps-row dim">
        <span className="fps-label">1% LOW</span>
        <span className="fps-value">{stats.low.toFixed(0)}</span>
      </div>
    </div>
  )
}
