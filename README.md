# Is it an OS?

Placeholder experiment — product TBD.

- **Slug:** `iiao`
- **URL:** https://iiao.algor.ist
- **Template:** worker (Cloudflare Workers)

## Develop

```bash
npm install
npx wrangler dev
```

## Deploy

```bash
npm install
npx wrangler deploy
```

Then attach custom domain `iiao.algor.ist` to the Worker.

> v1 of `algor` does not automate DNS. Move `algor.ist` to Cloudflare Free
> when ready for painless subdomains + TLS.
