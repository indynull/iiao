# Is it an OS? (iiao)

Paste a link or describe a product. Get a satirical judgment.

**Live:** https://iiao.algor.ist

## Stack

| Piece | Role |
|-------|------|
| Vite SPA | UI |
| Worker | `/api/judge`, probe, telemetry |
| Workers AI | free Llama judgments (rules fallback) |
| KV | recent queries + counters (owner-only) |

## Dev

```bash
npm install
npm run build
npm run dev:worker   # needs wrangler + remote AI
```

## Deploy

```bash
npm run deploy
# secrets (once):
#   npx wrangler secret put TELEMETRY_TOKEN
```

## Telemetry (owner)

Judgments log **thing**, answer, confidence, engine, url-vs-claim, host — not full free-text dumps of long claims beyond 200 chars, no cookies, no Google Analytics.

```bash
# Recent + top things (Bearer or ?token=)
curl -sS -H "Authorization: Bearer $TELEMETRY_TOKEN" \
  https://iiao.algor.ist/api/telemetry | jq .
```

Local secret after setup (gitignored): `.wrangler/telemetry-token.txt`

### HN / analytics advice

- **Skip Google Analytics** for a joke site on HN — heavy, creepy optics, ad blockers.
- **Cloudflare Web Analytics** (free, cookieless): enable in the dashboard for the zone/worker if you want pageviews.
- **This KV telemetry** is enough to see *what people ask*.

## License

MIT (or your choice).
