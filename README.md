# Hono URL Shortener

Minimal URL shortener API built with Hono, Drizzle ORM, and Postgres. It
supports short link creation, optional expiration, redirects, and click
analytics with OpenAPI + Swagger UI.

## Features

- Create short links with optional `expiresAt`
- Redirects with 302 and click event tracking
- Click analytics: count + events (user-agent, referer, IP hash)
- OpenAPI spec and interactive Swagger UI
- Postgres-backed storage with Drizzle migrations

## Tech Stack

- Runtime: Bun
- API: Hono + Zod OpenAPI
- Database: Postgres + Drizzle ORM

## Getting Started

### Prerequisites

- Bun
- Postgres (local or via Docker)

### Install

```sh
bun install
```

### Environment

Copy `.env.example` to `.env` and update values.

```
DATABASE_URL=postgresql://app:app@localhost:5432/honourl
BASE_URL=http://localhost:3000
```

### Migrate database

```sh
bun run db:generate
bun run db:migrate
```

### Run

```sh
bun run dev
```

Server starts on `http://localhost:3000`.

## API

### OpenAPI + Swagger UI

- `GET /openapi.json`
- `GET /docs`

### Create a short link

`POST /api/links`

```json
{
  "url": "https://example.com",
  "expiresAt": "2026-12-31T23:59:59.000Z"
}
```

Response:

```json
{
  "code": "abc123",
  "shortUrl": "http://localhost:3000/abc123",
  "originalUrl": "https://example.com",
  "expiresAt": "2026-12-31T23:59:59.000Z"
}
```

### Link metadata

`GET /api/links/:code`

### Click events

`GET /api/links/:code/events?from=&to=&limit=`

### Redirect

`GET /:code`

Returns:

- `302` redirect to original URL
- `404` if not found
- `410` if expired

## Notes

- `BASE_URL` is optional and overrides the host used in `shortUrl`
- Click events store a hashed IP for privacy
