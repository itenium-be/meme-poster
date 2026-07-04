#!/bin/bash

echo "Bun: $(bun --version)"
BUN="$(command -v bun)"



cd ./job
bun install
if [ "$POST_MEME_ON_STARTUP" ]; then
  bun run start
fi
cd ../


cd ./reddit-job
bun install
if [ "$REDDIT_POST_ON_STARTUP" ]; then
  bun run start
fi
cd ../


cd ./humor-job
bun install
if [ "$MEMEAPI_POST_ON_STARTUP" ]; then
  bun run start
fi
cd ../


# POST_CRON='0 16 * * fri'
echo "Scheduling posting at: ${POST_CRON}"
echo "${POST_CRON} ${BUN} /usr/scheduler/job/meme-poster.ts" > crontab.txt

# Only schedule the Reddit job when a subreddit is configured.
if [ "$REDDIT_SUBREDDIT" ]; then
  echo "Scheduling Reddit posting at: ${REDDIT_POST_CRON}"
  echo "${REDDIT_POST_CRON} ${BUN} /usr/scheduler/reddit-job/index.ts" >> crontab.txt
fi

# Only schedule the meme-api job when a subreddit is configured.
if [ "$MEMEAPI_SUBREDDIT" ]; then
  echo "Scheduling meme-api posting at: ${MEMEAPI_POST_CRON}"
  echo "${MEMEAPI_POST_CRON} ${BUN} /usr/scheduler/humor-job/index.ts" >> crontab.txt
fi

crontab crontab.txt
crond -f
