import fs from 'fs'
import path from 'path'

// meme-api postLink is the short form, e.g. https://redd.it/1un1qe3
export function postId(postLink: string): string {
  return postLink.replace(/\/+$/, '').split('/').pop() ?? ''
}

export function hasSent(dir: string, id: string): boolean {
  return fs.existsSync(path.join(dir, id))
}

export function markSent(dir: string, id: string): void {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, id), '')
}
