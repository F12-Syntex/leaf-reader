---
name: verify
description: Build, run and drive leaf-reader in this environment to verify changes end-to-end.
---

# Verifying leaf-reader changes

Build and serve (production is fastest to drive):

```bash
yarn install --frozen-lockfile   # if node_modules missing
yarn build
yarn start -p 3789 &             # library page at http://localhost:3789
```

Drive with Playwright against the pre-installed Chromium (`playwright-core`
installed in the session scratchpad, NOT the repo):

```js
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
```

The library page gates its content on client mount (localStorage hydration),
so wait for a real selector (e.g. `.lib-grid`, `.lookup`) — `networkidle`
alone still shows the "Loading…" shell.

Gotchas:
- **Kill any old `next-server` before re-driving after a rebuild** — a stale
  server holds the previous `.next` manifests, client chunks 404, hydration
  never runs, and selectors time out even though `curl` returns 200.
  `pkill -f next-server` then restart.
- `yarn lint` currently fails in fresh containers with
  `Cannot find module 'typescript'` (eslint-config-next peer) — pre-existing,
  not a signal about your change. `yarn build` compiling is the syntax check.
- Reader flows: open `/book/reincarnated-third-life` (books ship in
  `public/books/`).
