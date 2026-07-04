import { test, expect } from 'bun:test'
import { isImage, pickMeme } from './select'
import type { Meme } from './meme-api'

const meme = (over: Partial<Meme> = {}): Meme => ({
  id: 'a', title: 't', url: 'https://i.redd.it/a.png', ups: 10,
  nsfw: false, spoiler: false, postLink: 'https://redd.it/a',
  ...over,
})

const none = (_id: string) => false

test('isImage: true for image urls (any case)', () => {
  expect(isImage('https://i.redd.it/x.png')).toBe(true)
  expect(isImage('https://x/y.JPG')).toBe(true)
  expect(isImage('https://x/y.gif')).toBe(true)
})

test('isImage: false for non-image urls', () => {
  expect(isImage('https://reddit.com/gallery/x')).toBe(false)
})

test('pickMeme: returns the highest-ups eligible image', () => {
  const memes = [meme({ id: 'low', ups: 5 }), meme({ id: 'high', ups: 99 })]
  expect(pickMeme(memes, none)!.id).toBe('high')
})

test('pickMeme: excludes non-image, nsfw, and spoiler posts', () => {
  const memes = [
    meme({ id: 'link', ups: 500, url: 'https://reddit.com/gallery/x' }),
    meme({ id: 'nsfw', ups: 400, nsfw: true }),
    meme({ id: 'spoil', ups: 300, spoiler: true }),
    meme({ id: 'ok', ups: 10 }),
  ]
  expect(pickMeme(memes, none)!.id).toBe('ok')
})

test('pickMeme: excludes already-sent ids', () => {
  const memes = [meme({ id: 'sent', ups: 99 }), meme({ id: 'fresh', ups: 10 })]
  expect(pickMeme(memes, (id) => id === 'sent')!.id).toBe('fresh')
})

test('pickMeme: returns null when nothing is eligible', () => {
  expect(pickMeme([meme({ nsfw: true })], none)).toBe(null)
})
