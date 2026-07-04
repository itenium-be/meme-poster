FROM oven/bun:1-alpine

RUN apk add --update --no-cache bash dos2unix

WORKDIR /usr/scheduler

COPY start.sh ./
COPY job/*.* ./job/
COPY reddit-job/*.* ./reddit-job/
COPY humor-job/*.* ./humor-job/

RUN dos2unix start.sh job/*.* reddit-job/*.* humor-job/*.*

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=90s \
  CMD pgrep crond || exit 1

CMD ["bash", "start.sh"]
