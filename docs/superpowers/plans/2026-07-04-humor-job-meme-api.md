# humor-job (meme-api.com) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new `humor-job` cron job that posts the biggest currently-trending image meme from a subreddit to Slack, sourced from meme-api.com, never repeating one already sent.

**Architecture:** Fetch a batch of hot memes from `meme-api.com/gimme/<sub>/50`, filter to fresh non-nsfw images, pick the highest `ups`, download it, upload via the existing `job/post-slack.ts`, then record its reddit post id to a marker dir so it is never reposted. Pure logic (parse, select, id/dedup) is split from I/O for unit testing; `index.ts` is a thin orchestrator.

**Tech Stack:** Bun + TypeScript, `bun:test`, Bun's global `fetch`, `@slack/web-api` (via the reused `job/post-slack.ts`).

**Spec:** `docs/superpowers/specs/2026-07-04-humor-job-meme-api-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `humor-job/package.json` | package manifest (mirrors `reddit-job`) |
| `humor-job/tsconfig.json` | TS config (copy of `reddit-job/tsconfig.json`) |
| `humor-job/sent-store.ts` | `postId()`, `hasSent()`, `markSent()` — id parsing + dedup marker files |
| `humor-job/meme-api.ts` | `Meme` type, `normalize()`, `parseMemesResponse()`, `fetchMemes()` |
| `humor-job/select.ts` | `isImage()`, `pickMeme()` — filter + highest-ups pick |
| `humor-job/index.ts` | thin orchestrator |
| `humor-job/*.test.ts` | unit tests for the three logic modules |
| `Dockerfile` | add COPY + dos2unix for `humor-job` |
| `start.sh` | install/run/cron wiring for `humor-job` |
| `.env.sample` | add `MEMEAPI_*` vars; disable the retired `REDDIT_SUBREDDIT` |

Reused as-is: `job/post-slack.ts` (Slack upload). Not needed: `slug.ts`, `schedule.ts`.

---

## Task 1: Scaffold the humor-job package

**Files:**
- Create: `humor-job/package.json`
- Create: `humor-job/tsconfig.json`

- [ ] **Step 1: Create `humor-job/package.json`**

```json
{
  "name": "humor-meme-poster",
  "version": "1.0.0",
  "description": "Post the top trending image meme from a subreddit via meme-api.com",
  "type": "module",
  "scripts": {
    "start": "bun index.ts",
    "test": "bun test"
  },
  "license": "MIT",
  "devDependencies": {
    "@slack/web-api": "^7.17.0",
    "@types/bun": "^1.3.14"
  }
}
```

- [ ] **Step 2: Create `humor-job/tsconfig.json`** (identical to `reddit-job/tsconfig.json`)

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": false,
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["bun"]
  }
}
```

- [ ] **Step 3: Install deps**

Run: `cd humor-job && bun install`
Expected: creates `humor-job/bun.lock` and `humor-job/node_modules`, exit 0.

- [ ] **Step 4: Commit**

```bash
git add humor-job/package.json humor-job/tsconfig.json humor-job/bun.lock
git commit -m "chore: scaffold humor-job package"
```

---

## Task 2: sent-store (id parsing + dedup markers)

**Files:**
- Create: `humor-job/sent-store.ts`
- Test: `humor-job/sent-store.test.ts`

- [ ] **Step 1: Write the failing test** — `humor-job/sent-store.test.ts`

```ts
import { test, expect } from 'bun:test'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { postId, hasSent, markSent } from './sent-store'

test('postId: extracts id from redd.it postLink', () => {
  expect(postId('https://redd.it/1un1qe3')).toBe('1un1qe3')
})

test('postId: ignores a trailing slash', () => {
  expect(postId('https://redd.it/1un1qe3/')).toBe('1un1qe3')
})

test('hasSent/markSent: round-trip in a fresh dir', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'humor-sent-'))
  expect(hasSent(dir, 'abc')).toBe(false)
  markSent(dir, 'abc')
  expect(hasSent(dir, 'abc')).toBe(true)
})

test('markSent: creates the dir if it does not exist', () => {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'humor-')), 'nested')
  markSent(dir, 'x')
  expect(hasSent(dir, 'x')).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd humor-job && bun test sent-store.test.ts`
Expected: FAIL — cannot resolve `./sent-store`.

- [ ] **Step 3: Write minimal implementation** — `humor-job/sent-store.ts`

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd humor-job && bun test sent-store.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add humor-job/sent-store.ts humor-job/sent-store.test.ts
git commit -m "feat: humor-job sent-store (id parsing + dedup markers)"
```

---

## Task 3: meme-api client (fetch + parse)

**Files:**
- Create: `humor-job/meme-api.ts`
- Test: `humor-job/meme-api.test.ts`

- [ ] **Step 1: Write the failing test** — `humor-job/meme-api.test.ts`

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd humor-job && bun test meme-api.test.ts`
Expected: FAIL — cannot resolve `./meme-api`.

- [ ] **Step 3: Write minimal implementation** — `humor-job/meme-api.ts`

```ts
import { postId } from './sent-store'

// meme-api 403s bare bot user-agents (e.g. python-urllib); a Mozilla token passes.
const USER_AGENT = 'Mozilla/5.0 (compatible; slack-meme-poster/1.0)'

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd humor-job && bun test meme-api.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add humor-job/meme-api.ts humor-job/meme-api.test.ts
git commit -m "feat: humor-job meme-api client (fetch + parse)"
```

---

## Task 4: selection (filter + highest-ups)

**Files:**
- Create: `humor-job/select.ts`
- Test: `humor-job/select.test.ts`

- [ ] **Step 1: Write the failing test** — `humor-job/select.test.ts`

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd humor-job && bun test select.test.ts`
Expected: FAIL — cannot resolve `./select`.

- [ ] **Step 3: Write minimal implementation** — `humor-job/select.ts`

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd humor-job && bun test select.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add humor-job/select.ts humor-job/select.test.ts
git commit -m "feat: humor-job selection (filter + highest-ups)"
```

---

## Task 5: orchestrator (index.ts)

**Files:**
- Create: `humor-job/index.ts`

No unit test — this is thin glue over the tested modules; it is exercised in Task 7.

- [ ] **Step 1: Write `humor-job/index.ts`**

```ts
import fs from 'fs'
import os from 'os'
import path from 'path'
import { URL } from 'url'
import { fetchMemes } from './meme-api'
import { pickMeme } from './select'
import { hasSent, markSent } from './sent-store'
import { postSlackMeme } from '../job/post-slack'

const SENT_DIR = `${process.env.MEMES_DIR ?? '/memes'}/humor-sent`

async function downloadTo(imageUrl: string, destPath: string): Promise<void> {
  const res = await fetch(imageUrl)
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
```

- [ ] **Step 2: Typecheck**

Run: `cd humor-job && bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add humor-job/index.ts
git commit -m "feat: humor-job orchestrator"
```

---

## Task 6: wiring (Dockerfile, start.sh, .env.sample)

**Files:**
- Modify: `Dockerfile:9-11`
- Modify: `start.sh` (add humor-job install/run block and cron append)
- Modify: `.env.sample:20-23`

- [ ] **Step 1: Dockerfile — copy and normalize humor-job**

In `Dockerfile`, after the `reddit-job` COPY line, add the humor-job COPY, and extend the `dos2unix` line:

```dockerfile
COPY start.sh ./
COPY job/*.* ./job/
COPY reddit-job/*.* ./reddit-job/
COPY humor-job/*.* ./humor-job/

RUN dos2unix start.sh job/*.* reddit-job/*.* humor-job/*.*
```

- [ ] **Step 2: start.sh — install/run block**

In `start.sh`, after the `reddit-job` block (the one ending `cd ../`), add:

```bash
cd ./humor-job
bun install
if [ "$MEMEAPI_POST_ON_STARTUP" ]; then
  bun run start
fi
cd ../
```

- [ ] **Step 3: start.sh — cron append**

In `start.sh`, after the existing `if [ "$REDDIT_SUBREDDIT" ]; then ... fi` cron block, add:

```bash
# Only schedule the meme-api job when a subreddit is configured.
if [ "$MEMEAPI_SUBREDDIT" ]; then
  echo "Scheduling meme-api posting at: ${MEMEAPI_POST_CRON}"
  echo "${MEMEAPI_POST_CRON} ${BUN} /usr/scheduler/humor-job/index.ts" >> crontab.txt
fi
```

- [ ] **Step 4: .env.sample — retire reddit, add meme-api vars**

Replace the reddit block (`.env.sample:20-23`) with:

```bash
# Reddit job — RETIRED (reddit blocked the anonymous .json API). Left disabled.
REDDIT_SUBREDDIT=

# Meme-api job (leave MEMEAPI_SUBREDDIT empty to disable):
MEMEAPI_SUBREDDIT=ProgrammerHumor
MEMEAPI_POST_CRON="0 9 * * mon"
MEMEAPI_POST_ON_STARTUP=
```

- [ ] **Step 5: Verify start.sh is valid shell**

Run: `bash -n start.sh`
Expected: no output, exit 0.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile start.sh .env.sample
git commit -m "feat: wire humor-job into Docker/start.sh; retire reddit-job"
```

---

## Task 7: end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Full unit suite passes**

Run: `cd humor-job && bun test`
Expected: PASS — 14 tests across sent-store, meme-api, select.

- [ ] **Step 2: Live meme-api smoke (no Slack post)**

Confirms the real API + parse + select path against production data. Run from repo root:

```bash
cd humor-job && bun -e '
import { fetchMemes } from "./meme-api"
import { pickMeme } from "./select"
const memes = await fetchMemes(process.env.MEMEAPI_SUBREDDIT ?? "ProgrammerHumor")
console.log("fetched:", memes.length)
const w = pickMeme(memes, () => false)
console.log("winner:", w?.id, w?.ups, w?.url)
'
```

Expected: `fetched:` a positive number and a `winner:` line with an `i.redd.it`/`i.imgur.com` image url. If `fetched: 0` or an error, stop — meme-api or the subreddit name is the problem.

- [ ] **Step 3: Full real run to Slack (optional, user-gated)**

Only with real `SLACK_BOT_TOKEN`/`SLACK_CHANNEL_ID` in `.env` and the user's OK to post to the channel. Run from repo root so Bun loads `.env`:

```bash
MEMEAPI_SUBREDDIT=ProgrammerHumor bun humor-job/index.ts
```

Expected: logs `Picked ...`, `About to upload meme: ...`, `Posted <id>`; the meme appears in Slack; a marker file `<id>` exists under `${MEMES_DIR}/humor-sent/`. Running again should skip that id (posts a different meme or logs `Nothing new to post`).

- [ ] **Step 4: Final commit (if any verification fixups were needed)**

```bash
git add -A && git commit -m "test: verify humor-job end-to-end"
```

---

## Self-Review

**Spec coverage:**
- Data source (meme-api `/gimme/<sub>/50`, browser UA) → Task 3 ✓
- Selection (image, drop nsfw/spoiler/sent, highest-ups, null when empty) → Task 4 ✓
- Dedup (postId from postLink, marker files, hasSent/markSent) → Task 2 ✓
- Flow (read subreddit → fetch → pick → download → post → markSent) → Task 5 ✓
- Config/wiring (Dockerfile, start.sh block + cron, `.env.sample` vars, reddit retired) → Task 6 ✓
- Error handling (exit 1 on failures, exit 0 on "nothing eligible") → Task 5 (index.ts) ✓
- Testing (meme-api, select, sent-store unit tests) → Tasks 2–4 ✓

**Placeholder scan:** none — every code/step is concrete.

**Type consistency:** `Meme` (fields `id,title,url,ups,nsfw,spoiler,postLink`) defined in Task 3, consumed identically in Tasks 4 and 5. `pickMeme(memes, isSent)`, `hasSent(dir,id)`, `markSent(dir,id)`, `postId(postLink)`, `fetchMemes(subreddit,count?,fetchFn?)`, `parseMemesResponse(json)`, `isImage(url)` — signatures match across tasks. `postSlackMeme(filePath, {title, url})` matches `job/post-slack.ts`.
