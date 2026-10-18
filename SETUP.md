# Sergent backend — current setup

This separate repository is deployed at https://backend-rho-lovat-88.vercel.app.
Vercel's Root Directory must be the repository root (`.`), not `backend`.
`dev.mjs` is for local testing only; Vercel runs `api/handler.js` automatically.

The dashboard is in Gshergd/serg at https://gshergd.github.io/serg/.
InfinityFree at https://ser.gt.tc only redirects short links.

## Three connections

1. Dashboard `config.js`: `apiBaseUrl` must be `https://backend-rho-lovat-88.vercel.app`.
2. Vercel environment: `MONGODB_URI` connects the backend to Atlas.
3. InfinityFree `config.php`: API base URL and resolver secret must match the backend.

The prepared private setup files on the owner's computer already have matching values. Never commit those files, owner passwords or database connection strings.

## MongoDB account steps

Sign into cloud.mongodb.com. Create a project if asked, then Create Cluster → Free/M0. Name it serg. Do not choose a paid tier.

Create a database user (separate from your MongoDB website login), save its password, and grant read/write to the serg database. In Connect → Drivers → Node.js, copy the connection string and replace the password placeholder with that database user's password, URL-encoded if necessary. The app creates its database and collections on first successful connection: no manual collection/schema creation is needed.

Atlas Network Access must permit the API host's outbound addresses. Standard Vercel deployments can have changing egress IPs; a restricted allowlist requires static egress. If choosing Allow Access from Anywhere, retain TLS, a strong unique database password and the serg-only database user.

## Vercel environment

Production needs MONGODB_URI, OWNER_PASSWORD_HASH and RESOLVER_SECRET. MONGODB_DB defaults to serg; FRONTEND_ORIGIN defaults to https://gshergd.github.io. Import the prepared private environment file after filling the MongoDB URI, then redeploy. Environment changes do not update an already running deployment by themselves.

After deploying the diagnostics change, `/api/handler?action=health` reports missing setting names without exposing values. `/api/handler?action=health&check=db` also verifies MongoDB connectivity. Success must show ok=true and database=connected.

## GitHub Pages

In Gshergd/serg → Settings → Pages, select Deploy from a branch → main → /(root) → Save. This affects the serg repository only. Publish the frontend config.js change too.

## InfinityFree

Upload the prepared private config.php to the ser.gt.tc document root alongside index.php and resolver.php. Its resolver secret must match RESOLVER_SECRET on Vercel. No other file change is needed if the redirect-only ZIP is already uploaded. Do not put the private config.php in either public repository.
