// gif is intentionally allowed: Slack image blocks render animated gifs fine
import type { Meme } from './meme-api'

const IMAGE_RE = /\.(jpe?g|png|gif)$/i

export function isImage(url: string): boolean {
  return IMAGE_RE.test(url)
}

export function pickMeme(
  memes: Meme[],
  isSent: (id: string) => boolean,
): Meme | null {
  const eligible = memes.filter(
    (m) => isImage(m.url) && !m.nsfw && !m.spoiler && !isSent(m.id),
  )
  if (eligible.length === 0) return null
  return eligible.reduce((best, m) => (m.ups > best.ups ? m : best))
}
