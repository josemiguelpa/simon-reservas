FROM mcr.microsoft.com/playwright:v1.62.1-jammy

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

COPY . .

ENV HOST=0.0.0.0
ENV PORT=3000

# SIMON sits behind Radware Bot Manager, which redirects headless Chromium to a
# challenge page. Run a real browser against a virtual display instead.
ENV HEADED=true

EXPOSE 3000

# Requires an init process (docker run --init, or init: true in compose):
# xvfb-run blocks forever waiting on Xvfb's USR1 signal when it runs as PID 1.

CMD ["xvfb-run", "-a", "--server-args=-screen 0 1920x1080x24", "node", "src/server.mjs"]
