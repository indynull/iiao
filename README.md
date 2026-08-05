# Is it an OS? (iiao)

Paste any URL (or free-form claim). Receive a solemn, chaotic determination of
operating-system-ness: decision tree, radar, gauges, red flags, rubber stamp.

**Live:** https://iiao.algor.ist

Permalinks encode the subject in the path (no server store):

```
https://iiao.algor.ist/is/<base64url(subject)>
```

Same subject → same seeded chaos.

## Stack

| Piece | Role |
|-------|------|
| Vite SPA | UI + deterministic analysis engine |
| Worker (Hono) | `/api/probe` HTTP glance, `/api/health`, static assets |

## Dev

```bash
npm install
npm run build
npm run dev:worker   # http://127.0.0.1:8787
# or UI-only: npm run dev
```

## Deploy

```bash
npm run deploy
# custom domain already attached: iiao.algor.ist
```
