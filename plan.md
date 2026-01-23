# Bun + Hono URL Shortener (learning plan)

Goal: build a simple backend URL shortener with **redirects, expirations, and event-level click analytics** using **Bun + Hono + Postgres + Drizzle**.

## What you’re building

### Core features
- **Shorten**: take a long URL and return a short URL.
- **Redirect**: visiting the short URL redirects (302) to the original.
- **Analytics**: record a click event per redirect.
- **Expiration**: optional `expiresAt`; expired links stop redirecting.

### Minimal API surface (suggested)
- `POST /api/links`
  - body: `{ "url": string, "expiresAt"?: string }` (ISO datetime)
  - returns: `{ "code": string, "shortUrl": string, "originalUrl": string, "expiresAt": string|null }`
- `GET /:code`
  - redirect (302) if valid; otherwise 404 (not found) or 410 (expired)
- `GET /api/links/:code`
  - returns metadata + totals (e.g. `clickCount`)
- `GET /api/links/:code/events?from=&to=&limit=`
  - returns recent click events

## Data model (Postgres)

### Table: `links`
- `id` uuid primary key
- `code` text unique not null
- `original_url` text not null
- `created_at` timestamptz not null default now()
- `expires_at` timestamptz null

### Table: `click_events`
- `id` uuid primary key
- `link_id` uuid not null references links(id)
- `clicked_at` timestamptz not null default now()
- `user_agent` text null
- `referer` text null
- `ip_hash` text null (hash IP; don’t store raw IP for a learning project)

## Project structure (suggested)
Keep `src/index.ts` small and split routes + db code:
- `src/index.ts` (Hono app wiring)
- `src/routes/links.ts` (create link + analytics APIs)
- `src/routes/redirect.ts` (GET /:code redirect)
- `src/db/client.ts` (connect to Postgres)
- `src/db/schema.ts` (Drizzle schema)
- `src/lib/slug.ts` (generate short codes)
- `src/lib/validateUrl.ts` (URL validation)

### Basic file-structure example (copy this mental model)

```text
honoUrl/
  src/
    index.ts                # app entry (create app, mount routes, export default)
    env.ts                  # reads env vars, validates required ones
    routes/
      index.ts              # mounts /api and other route groups
      health.ts             # GET /health
      links.ts              # POST /api/links, GET /api/links/:code, etc
      redirect.ts           # GET /:code
    db/
      client.ts             # creates DB client (drizzle + postgres)
      schema.ts             # drizzle schema definitions
      migrations/           # drizzle-kit generated migrations (or /drizzle)
    services/
      linkService.ts        # business logic (create link, fetch, expire checks)
      analyticsService.ts   # record click, query events
    lib/
      slug.ts               # code generation (base62/random)
      validateUrl.ts        # URL validation helpers
      hash.ts               # ip hashing helper
  .env
  .env.example
  docker-compose.yml        # optional: local postgres
  drizzle.config.ts
  package.json
  tsconfig.json
  README.md
  plan.md
```

## Milestones (do these manually)

### Milestone 0: Setup local Postgres (Docker)

Prereq: install Docker Desktop and make sure Docker is running.

1) Create `docker-compose.yml` (in project root):

```yaml
services:
  postgres:
    image: postgres:16
    container_name: honourl-postgres
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
      POSTGRES_DB: honourl
    ports:
      - "5432:5432"
    volumes:
      - honourl_pgdata:/var/lib/postgresql/data
volumes:
  honourl_pgdata:
```

2) Start Postgres:

```sh
docker compose up -d
```

3) Sanity check you can connect (optional but recommended):

```sh
docker exec -it honourl-postgres psql -U app -d honourl
```

4) Create a `.env` file (in project root):

```env
DATABASE_URL=postgresql://app:app@localhost:5432/honourl
# Optional: forces the returned shortUrl host (useful behind proxies)
# BASE_URL=http://localhost:3000
```

You can switch later; your app should only depend on `DATABASE_URL`.

### Milestone 1: Add dependencies and tooling (Drizzle + Postgres)
Install deps:

```sh
bun add drizzle-orm postgres
bun add -d drizzle-kit
```

Update `package.json` scripts (suggested):
- `dev` already exists
- `db:generate` (generate migrations)
- `db:migrate` (apply migrations)

Add:
- `.env.example` with `DATABASE_URL` and optional `BASE_URL`
- `drizzle.config.ts`

Suggested scripts:

```json
{
  "scripts": {
    "dev": "bun run --hot src/index.ts",
    "db:generate": "bunx drizzle-kit generate",
    "db:migrate": "bunx drizzle-kit migrate"
  }
}
```

### Milestone 2: Create schema + migrations
Implement `links` and `click_events` in `src/db/schema.ts`.
Generate and run the initial migration against your DB.

Typical flow:

```sh
# 1) generate a migration from schema changes
bun run db:generate

# 2) apply migrations to the database
bun run db:migrate
```

Acceptance checks:
- Tables exist in Postgres.
- Unique constraint on `links.code` works.

### Milestone 3: Implement “shorten URL” endpoint
Implement `POST /api/links`:
- Validate URL using `new URL(input)` and allow only `http:` / `https:`.
- Parse `expiresAt` if provided; store as timestamptz.
- Generate an auto code (base62/random).
- Insert into `links`. If unique conflict on `code`, retry.
- Return `shortUrl` computed from:
  - `BASE_URL` env if set, else request origin from `c.req.url`

Acceptance checks:
- Creating a link returns a code + short URL.
- Multiple creates generate different codes.

### Milestone 4: Implement redirect + event logging
Implement `GET /:code`:
- Lookup by `code`.
- If not found: 404.
- If expired: 410.
- If valid:
  - Insert a row into `click_events` (best-effort).
  - Redirect (302) to `original_url`.

Event fields:
- `user_agent`: from request header
- `referer`: from request header
- `ip_hash`: hash of IP if you can access it (see notes below)

Acceptance checks:
- Redirect happens quickly.
- Click events accumulate as you refresh.
- Expired link returns 410 and does not redirect.

### Milestone 5: Analytics endpoints
Implement:
- `GET /api/links/:code` returning link metadata + `clickCount`
  - simplest: `SELECT count(*) FROM click_events WHERE link_id = ...`
- `GET /api/links/:code/events`
  - support `from`, `to`, `limit` (keep it simple)

Acceptance checks:
- You can see clickCount increase.
- You can fetch last N events.

### Milestone 6: Hardening basics (still “simple”)
- Rate limit (optional): protect `POST /api/links` from spam
- Input size limits (URL length)
- Better error shapes (consistent JSON)
- Indexes:
  - `links(code)`
  - `click_events(link_id, clicked_at)`

## How Postgres connection works locally

### Local Postgres (Docker) mental model
- Postgres runs on your machine (inside Docker) and listens on a port (commonly `5432`).
- Your app connects using a connection string:
  - `DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/DBNAME`

Typical flow:
1. Start Postgres container.
2. Set `DATABASE_URL` in your environment.
3. App (Bun) uses `DATABASE_URL` to open a TCP connection to `localhost:5432`.

### Local Postgres (native install) mental model
- Same concept, just not in Docker. The server is a local process.
- URL often looks like:
  - `postgresql://USER@localhost:5432/DBNAME`

## Can you use AWS Postgres (RDS)?
Yes. You’ll still use `DATABASE_URL`, but the host will be the RDS endpoint.

### What changes vs local
- The hostname is remote: `something.abcdefg123.us-east-1.rds.amazonaws.com`
- You must allow network access:
  - RDS security group inbound rule for port 5432
  - Source should be **your IP** (or a VPN/bastion), not `0.0.0.0/0`
- You may need TLS:
  - add `?sslmode=require` (or driver-specific SSL config)

Example:
- `DATABASE_URL=postgresql://USER:PASSWORD@RDS_HOST:5432/DBNAME?sslmode=require`

### Tradeoffs (for learning)
- **Pros**: closer to production, learn networking + credentials + SSL
- **Cons**: costs money, can be slower, and you’ll spend time on AWS setup rather than backend code

If you want “hosted but easy”, many learners use Neon/Supabase, but AWS is totally fine if you’re okay with the setup.

## Notes on IP logging behind proxies
Locally you can usually read the remote address, but in real deployments you often need proxy headers:
- `X-Forwarded-For` / `CF-Connecting-IP`

For a learning project:
- Prefer **hashing** the IP with a salt (env var) instead of storing raw IP.
- If you can’t reliably get IP, store `null` and still log UA + referer + timestamp.

## Suggested “manual learning” approach
- After each milestone, write a short note in this file:
  - what you implemented
  - what broke
  - what you learned

## Definition of done
- Create link → returns short URL.
- Visiting short URL → redirects and logs a click event.
- Expiration works (returns 410 after expiry).
- Analytics endpoints show totals and recent events.

