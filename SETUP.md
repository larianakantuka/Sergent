# serg · GitHub Pages + MongoDB

The dashboard lives at **https://gshergd.github.io/serg/**. Every short link uses **https://ser.gt.tc/12345**, exactly five digits. InfinityFree serves redirects only; opening its root sends visitors to the GitHub dashboard.

```
GitHub Pages dashboard → Vercel Node API → MongoDB Atlas
Visitor → ser.gt.tc/12345 → outbound API lookup → destination
```

No Supabase, workers, cross-site requests into InfinityFree, or MongoDB credentials in browser code. The Node API is necessary because browsers cannot safely connect directly to MongoDB.

Publish these new source changes to GitHub first (commit/push), so Vercel can import the new `backend` directory. The source changes have not been committed or pushed automatically. Leaving the API address blank during this first publish is safe: login stays disabled until configured.

## 1. MongoDB Atlas

Create an Atlas project and cluster. Under Database Access create a dedicated database user with read/write access **only to the `serg` database**. Copy its Node.js connection string. URL-encode special characters in its username/password. Keep this URI private.

Under Network Access allow the outbound IPs of your API host. Standard Vercel deployments may not have fixed outbound IPs; if you choose Atlas's Allow Access from Anywhere option, use a strong unique database password and the restricted database user above. For a restricted IP allowlist, use static egress on your hosting plan. The database still requires TLS and authentication. Do not paste the URI into config.js.

## 2. Deploy the API to Vercel

Import this GitHub repo as a Vercel project. Set **Root Directory to `backend`**, Framework Preset to Other, and use Node 22.x. No custom build command is needed. The endpoint is `/api/handler`.

On your computer, install Node.js 22, open a terminal inside `backend`, and run `npm ci`. Run `npm run hash-password` and type a strong owner password when prompted; input is hidden. Save the printed `OWNER_PASSWORD_HASH`. Run `npm run generate-secret` and save the generated resolver secret. The owner password itself is never stored in the source or database.

Add these Vercel environment variables (Production):

| Name | Value |
| --- | --- |
| `MONGODB_URI` | Private Atlas connection string |
| `MONGODB_DB` | `serg` |
| `OWNER_PASSWORD_HASH` | The generated `scrypt:…` hash |
| `RESOLVER_SECRET` | The generated 64-character hex secret |
| `FRONTEND_ORIGIN` | `https://gshergd.github.io` (no `/serg` path) |

Redeploy after changing environment variables. Visit `https://YOUR_BACKEND.vercel.app/api/handler?action=health` and confirm a JSON response with `ok: true`. Health checks do not verify the MongoDB connection; a successful dashboard login does.

Vercel deployment protection must permit public access to this production endpoint. Application authentication protects owner operations, and the resolver secret protects lookups. Preview deployment URLs with a hosting login screen will not work as the backend.

## 3. GitHub Pages dashboard

Set `apiBaseUrl` in the root `config.js` to your production Vercel URL, e.g. `https://serg-api.vercel.app` (no `/api` suffix). This API address is public and safe to commit. No password hash, MongoDB URI, resolver secret, or session token belongs here.

Keep Pages publishing from the repository root as you already configured. The root `index.html`, relative asset paths and `.nojekyll` work under `/serg/`. Commit/push your changes to publish when ready. If you use an existing custom Pages workflow instead of branch publishing, its output must include index.html, config.js and assets/. No new workflow has been added.

Open https://gshergd.github.io/serg/ and sign in with your owner password. Only this owner password can create sessions. There is no sign-up, no user-registration endpoint, and no public write access.

## 4. InfinityFree redirect-only upload

Download `ser-gt-tc-infinityfree.zip`, extract locally, and upload the **contents** of `htdocs/` to the document root assigned to ser.gt.tc, including `.htaccess`.

**Updating the old version:** remove its app.php, view.php, assets directory, config.example.php and any old setup/admin PHP files from that domain's document root. Replace index.php and .htaccess with these versions. Replace the old config.php entirely with a copy of the new config.example.php, then fill the values below. This is a different configuration format; old MySQL settings will not work. Back up old files/data first if needed. No old dashboard should remain on this host. Existing v1 MySQL links are not imported automatically into MongoDB.

Edit the new private config.php on InfinityFree:

```php
return [
    'api_base_url' => 'https://YOUR_BACKEND.vercel.app',
    'resolver_secret' => 'THE_SAME_RESOLVER_SECRET_AS_VERCEL',
];
```

Activate HTTPS for ser.gt.tc. No MySQL database, owner password, setup page or dashboard is needed on InfinityFree. PHP cURL with outbound HTTPS is required; certificate verification stays enabled. The upload ZIP intentionally contains no real config.php or secrets.

## Verify the complete deployment

1. Sign in at GitHub Pages and create a link. The displayed address must be `https://ser.gt.tc/` followed by exactly five digits.
2. Open that link in a different browser. Confirm it reaches the destination.
3. Pause it in the dashboard, then reload the short URL. It must return HTTP 410. Resume and retry.
4. Open the dashboard in a private window. It must ask for the owner password.
5. Open https://ser.gt.tc/. It must send you to GitHub Pages with no InfinityFree dashboard.

## Behavior and security

Codes run from `00000` through `99999`. MongoDB's unique `_id` reserves each code atomically; collisions retry, and near capacity the allocator finds a free slot. Paused codes stay reserved. At 100,000 it fails instead of generating a longer link. Five digits are guessable; shortened URLs are not access control for private documents.

Links can be copied, searched, paused and resumed. Labels are rendered as text. Destinations allow HTTP(S), forbid credentials/control characters/backslashes, and reject direct self-redirects to ser.gt.tc. Redirects use HTTP 302 with no-store caching. Counts are redirect GET requests, not unique humans; HEAD requests do not increment them.

Owner passwords use salted scrypt hashes. Random owner-session tokens are stored hashed in MongoDB, expire after one hour, and are kept in browser sessionStorage, not the repo. Logout revokes the current token. Login attempts are limited per client IP to 10 per 15-minute window using shared database state. Rotating the owner password hash does not revoke existing sessions by itself: delete the `sessions` collection's documents in Atlas to revoke all sessions immediately. TTL indexes clean expired sessions and attempt records; expiration is also checked on every protected request.

InfinityFree holds only the lookup secret; the API rejects unauthenticated lookups. Browser requests use an exact allowed Origin and bearer authentication. The backend's secrets live only in its environment. Back up MongoDB separately; repo/ZIP files contain no live links.

InfinityFree's mandatory browser check can still inject `?i=1`, delay redirects or block preview bots. Generated URLs have exactly five digits, but the host controls its challenge. Its shortener policy and suspension risk still apply. MongoDB/API outages or cold starts can delay redirects; the PHP endpoint fails with 503 instead of sending visitors to an unvalidated address. This ZIP cannot remove the host's security check.

References: [InfinityFree restrictions](https://forum.infinityfree.com/t/browser-security-system-features-and-limitations/49353), [shortener policy](https://forum.infinityfree.com/t/can-i-use-infinityfree-as-url-shortener/31273), [MongoDB Node client](https://www.mongodb.com/docs/drivers/node/current/connect/mongoclient/), [Vercel Node runtime](https://vercel.com/docs/functions/runtimes/node-js).

## Development and tests

API: create backend/.env privately from .env.example and run `node --env-file=.env dev.mjs` from backend. Serve the repo root with any static server. For local browser testing set FRONTEND_ORIGIN to the exact local static origin and set config.js temporarily to http://127.0.0.1:8787; restore production settings before publishing. No local HTTP option is shipped in the production InfinityFree resolver.

`npm test` checks password verification and URL validation. The integration suite in backend/tests/integration.mjs requires a disposable local MongoDB URI and exercises API authorization, sessions, links and capacity; see its environment guard. PHP lint checks use `php -l infinityfree/index.php` and `php -l infinityfree/resolver.php`.
