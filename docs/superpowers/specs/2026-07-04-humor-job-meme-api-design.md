# humor-job — meme-api.com meme poster

**Date:** 2026-07-04
**Status:** Approved design, pending implementation

## Problem

The Monday `reddit-job` stopped working. Reddit retired anonymous access to its
`.json` API: `https://www.reddit.com/r/<sub>/top.json` now returns `403` for any
unauthenticated client (verified across `www`/`old` hosts, generic and full
browser header sets). Only a logged-in browser session or the OAuth API can
reach it. A cron bot has neither, so `fetchTopPosts` throws and the job exits 1.

The Friday `job` is unaffected — it posts local files and never touches Reddit.

## Decision

Build a new `humor-job` that sources memes from **meme-api.com** (a third-party
Reddit proxy on its own infrastructure, unaffected by Reddit's edge blocking).
Retire `reddit-job` by unsetting its cron vars (files left dormant on disk).

### Why not Reddit OAuth

OAuth would preserve the exact `top?t=week` semantics, but requires registering a
Reddit app + storing client credentials, and may still be IP-blocked from the
datacenter host. The user chose meme-api for simplicity, accepting the tradeoff
below.

### Tradeoff accepted

meme-api exposes only the subreddit's **hot** listing (cached) with no time
window and no timestamps. So the job posts *"the biggest meme trending now,"* not
*"top of the last 7 days."* This is acceptable for the Monday post.

## Data source

`GET https://meme-api.com/gimme/<subreddit>/50`

- Returns a cached batch of hot posts (observed ~16–40 for ProgrammerHumor, all
  image posts).
- Fields used: `title`, `url`, `ups`, `nsfw`, `spoiler`, `postLink`.
- Requires a browser-ish `User-Agent`; meme-api returns `403` to default bot UAs
  (e.g. Python urllib). Bun's `fetch` default UA works, but the job sets an
  explicit `User-Agent` to be safe.

## Selection

From the batch:
1. Keep image posts only — `url` matches `/\.(jpe?g|png|gif)$/i`.
2. Drop `nsfw` and `spoiler` posts.
3. Drop any post id already sent (dedup).
4. Pick the highest `ups`.
5. If nothing eligible remains → log "nothing new", exit 0.

## Dedup

- Post id = last path segment of `postLink` (e.g. `redd.it/1un1qe3` → `1un1qe3`).
- Persistent store: empty marker file named `<id>` in `${MEMES_DIR}/humor-sent/`.
- `hasSent(id)` = `existsSync` (O(1)); `markSent(id)` writes the marker after a
  successful Slack post.
- Store grows unbounded but files are empty and tiny; no pruning needed (YAGNI).

## Flow (`humor-job/index.ts`)

1. Read `MEMEAPI_SUBREDDIT`; exit 1 if unset.
2. Fetch batch; on failure log + exit 1 (no fallback — matches current
   fail-and-skip posture).
3. `pickMeme(batch, isSent)` → winner or null (null → log + exit 0).
4. Download `winner.url` to a temp file.
5. Upload via existing `postSlackMeme(tempPath, { title: winner.title, url: winner.postLink })`.
6. `markSent(id)`, log, done.

## Components

| File                     | Responsibility                              | Reuse                        |
|--------------------------|---------------------------------------------|------------------------------|
| `humor-job/meme-api.ts`  | fetch batch + `normalize()` to `Meme` type  | new                          |
| `humor-job/select.ts`    | `pickMeme(memes, isSent)` — filter + max-ups | adapts `reddit-job/select.ts` |
| `humor-job/sent-store.ts`| `postId()`, `hasSent()`, `markSent()`        | new                          |
| `humor-job/index.ts`     | orchestration (thin)                        | mirrors `reddit-job/index.ts` |
| `job/post-slack.ts`      | Slack upload                                | reused as-is                 |

`slug.ts` and `schedule.ts` are not needed (temp files need no slug; no time
window).

## Config / wiring

New `humor-job` block in `start.sh`, mirroring the reddit block:
- `cd humor-job && bun install`
- run on `MEMEAPI_POST_ON_STARTUP`
- append cron `${MEMEAPI_POST_CRON} ${BUN} /usr/scheduler/humor-job/index.ts`,
  gated on `MEMEAPI_SUBREDDIT` being set.

Environment variables (added to `.env` / `.env.sample`):

| Var                       | Example              | Purpose                      |
|---------------------------|----------------------|------------------------------|
| `MEMEAPI_SUBREDDIT`       | `ProgrammerHumor`    | source subreddit             |
| `MEMEAPI_POST_CRON`       | `0 9 * * mon`        | schedule                     |
| `MEMEAPI_POST_ON_STARTUP` | `1`                  | run once on container start  |

The old `reddit-job` cron block stays but goes dormant when its vars are unset.
`reddit-job/` files are left on disk, untouched.

## Error handling

Any step failing → `console.error` + `process.exit(1)`, except "no eligible
meme" → exit 0. Same posture as the current jobs.

## Testing (TDD, `bun test`)

- `meme-api.test.ts` — `normalize()` field mapping; fetch throws on non-200 and
  on malformed body (mocked `fetch`).
- `select.test.ts` — picks highest-ups; excludes non-image, nsfw, spoiler, and
  already-sent; returns null when empty.
- `sent-store.test.ts` — `postId()` parsing; `hasSent`/`markSent` round-trip
  against a temp dir.
- `index.ts` stays thin; covered by the unit tests above.

## Out of scope

- True `top?t=week` semantics (would require Reddit OAuth).
- meme-api outage fallback (accepted: skip that week).
- Deleting `reddit-job/` (left dormant).
- Pruning the sent-id store.
