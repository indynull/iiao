# Is it an OS? (iiao)

Paste any URL (or free-form claim). We **fetch the page**, extract title/meta/headings/text,
count OS-ish lexicon, score eight axes, then stamp a satirical but **content-weighted** verdict.

**Live:** https://iiao.algor.ist

Permalinks encode the subject in the path (no server store):

```
https://iiao.algor.ist/is/<base64url(subject)>
```

Same subject + same page signals → same determination.

## Stack

| Piece | Role |
|-------|------|
| Vite SPA | UI + content-weighted analysis engine |
| Worker (Hono) | `/api/probe` page extract, `/api/health`, static assets |

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
