import { CanvasTexture, RepeatWrapping, Texture } from 'three'

/**
 * Procedural concrete texture: noise + panel seams + sparse rust.
 * Single shared instance reused across all concrete boxes.
 */
export function buildConcreteTexture(): Texture {
  const size = 256
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#878c98'
  ctx.fillRect(0, 0, size, size)

  // noise
  const img = ctx.getImageData(0, 0, size, size)
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 36
    img.data[i] = Math.max(0, Math.min(255, img.data[i] + n))
    img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1] + n))
    img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2] + n))
  }
  ctx.putImageData(img, 0, 0)

  // panel seams
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'
  ctx.lineWidth = 2
  ctx.strokeRect(0, 0, size, size)
  ctx.beginPath()
  ctx.moveTo(0, size / 2); ctx.lineTo(size, size / 2)
  ctx.moveTo(size / 2, 0); ctx.lineTo(size / 2, size)
  ctx.stroke()

  // rust spots
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = `rgba(${100 + Math.random() * 40},${60 + Math.random() * 30},${30 + Math.random() * 20},0.18)`
    ctx.beginPath()
    ctx.arc(Math.random() * size, Math.random() * size, 4 + Math.random() * 14, 0, Math.PI * 2)
    ctx.fill()
  }
  const tex = new CanvasTexture(c)
  tex.wrapS = tex.wrapT = RepeatWrapping
  tex.anisotropy = 4
  tex.repeat.set(2, 2)
  return tex
}

/** Procedural brushed-metal texture with bolt grid. */
export function buildMetalTexture(): Texture {
  const size = 256
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#2a2d33'
  ctx.fillRect(0, 0, size, size)
  for (let y = 0; y < size; y += 2) {
    ctx.fillStyle = `rgba(${30 + Math.random() * 60},${30 + Math.random() * 60},${30 + Math.random() * 60},0.4)`
    ctx.fillRect(0, y, size, 1)
  }
  for (let x = 16; x < size; x += 64) {
    for (let y = 16; y < size; y += 64) {
      ctx.fillStyle = '#1a1c20'
      ctx.beginPath()
      ctx.arc(x, y, 3, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#0a0b0d'
      ctx.lineWidth = 1
      ctx.stroke()
    }
  }
  const tex = new CanvasTexture(c)
  tex.wrapS = tex.wrapT = RepeatWrapping
  return tex
}
