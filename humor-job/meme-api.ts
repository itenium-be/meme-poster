import { postId } from './sent-store'

// meme-api 403s bare bot user-agents (e.g. python-urllib); a Mozilla token passes.
export const USER_AGENT = 'Mozilla/5.0 (compatible; slack-meme-poster/1.0)'

export interface Meme {
  id: string
  title: string
  url: string
  ups: number
  nsfw: boolean
  spoiler: boolean
  postLink: string
}

interface RawMeme {
  title: string
  url: string
  ups: number
  nsfw: boolean
  spoiler: boolean
  postLink: string
}

function normalize(raw: RawMeme): Meme {
  return {
    id: postId(raw.postLink),
    title: raw.title,
    url: raw.url,
    ups: raw.ups,
    nsfw: raw.nsfw,
    spoiler: raw.spoiler,
    postLink: raw.postLink,
  }
}

export function parseMemesResponse(json: unknown): Meme[] {
  const memes = (json as { memes?: RawMeme[] })?.memes
  if (!Array.isArray(memes)) {
    throw new Error('Unexpected meme-api response body')
  }
  return memes.map(normalize)
}

export async function fetchMemes(
  subreddit: string,
  count = 50,
  fetchFn: typeof fetch = fetch,
): Promise<Meme[]> {
  const url = `https://meme-api.com/gimme/${encodeURIComponent(subreddit)}/${count}`
  const res = await fetchFn(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) {
    throw new Error(`meme-api returned ${res.status} for ${url}`)
  }
  return parseMemesResponse(await res.json())
}
