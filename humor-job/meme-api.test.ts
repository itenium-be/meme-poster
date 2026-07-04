import { test, expect } from 'bun:test'
import { parseMemesResponse, fetchMemes, type Meme } from './meme-api'

const raw = {
  title: 'positiveFeedbackLoop',
  url: 'https://i.redd.it/abc.png',
  ups: 21430,
  nsfw: false,
  spoiler: false,
  postLink: 'https://redd.it/1un1qe3',
  author: 'x', subreddit: 'ProgrammerHumor', preview: [],
}

test('parseMemesResponse: maps fields and derives id', () => {
  const [m] = parseMemesResponse({ count: 1, memes: [raw] })
  expect(m).toEqual({
    id: '1un1qe3',
    title: 'positiveFeedbackLoop',
    url: 'https://i.redd.it/abc.png',
    ups: 21430,
    nsfw: false,
    spoiler: false,
    postLink: 'https://redd.it/1un1qe3',
  } as Meme)
})

test('parseMemesResponse: throws on a body without a memes array', () => {
  expect(() => parseMemesResponse({ code: 404, message: 'not found' })).toThrow()
})

test('fetchMemes: throws on non-200', async () => {
  const fakeFetch = (async () => ({ ok: false, status: 403 })) as unknown as typeof fetch
  await expect(fetchMemes('x', 50, fakeFetch)).rejects.toThrow('403')
})

test('fetchMemes: returns parsed memes on 200', async () => {
  const fakeFetch = (async () => ({
    ok: true,
    status: 200,
    json: async () => ({ count: 1, memes: [raw] }),
  })) as unknown as typeof fetch
  const memes = await fetchMemes('x', 50, fakeFetch)
  expect(memes[0].id).toBe('1un1qe3')
})
