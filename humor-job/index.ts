import fs from 'fs'
import os from 'os'
import path from 'path'
import { URL } from 'url'
import { fetchMemes, USER_AGENT } from './meme-api'
import { pickMeme } from './select'
import { hasSent, markSent } from './sent-store'
import { postSlackMeme } from '../job/post-slack'

const SENT_DIR = `${process.env.MEMES_DIR ?? '/memes'}/humor-sent`

async function downloadTo(imageUrl: string, destPath: string): Promise<void> {
  const res = await fetch(imageUrl, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) throw new Error(`Image download returned ${res.status}`)
  fs.writeFileSync(destPath, Buffer.from(await res.arrayBuffer()))
}

async function main(): Promise<void> {
  const subreddit = process.env.MEMEAPI_SUBREDDIT
  if (!subreddit) {
    console.error('MEMEAPI_SUBREDDIT not set; nothing to do')
    process.exit(1)
  }

  let memes
  try {
    memes = await fetchMemes(subreddit)
  } catch (err) {
    console.error('meme-api fetch failed:', (err as Error).message)
    process.exit(1)
  }

  const winner = pickMeme(memes, (id) => hasSent(SENT_DIR, id))
  if (!winner) {
    console.log('Nothing new to post')
    process.exit(0)
  }
  console.log(`Picked "${winner.title}" (${winner.ups} upvotes): ${winner.url}`)

  const ext = path.extname(new URL(winner.url).pathname) || '.jpg'
  const tempPath = path.join(os.tmpdir(), `${winner.id}${ext}`)
  try {
    await downloadTo(winner.url, tempPath)
  } catch (err) {
    console.error('Download failed:', (err as Error).message)
    process.exit(1)
  }

  try {
    await postSlackMeme(tempPath, { title: winner.title, url: winner.postLink })
  } catch (err) {
    console.error('Slack post failed:', (err as Error).message)
    process.exit(1)
  }

  markSent(SENT_DIR, winner.id)
  fs.rmSync(tempPath, { force: true })
  console.log('Posted', winner.id)
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
