import { Hono } from "hono";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { db } from "../db/client";
import { clickEvents } from "../db/schema";
import { links } from "../db/schema";
import { isValidHttpUrl } from "../lib/validateUrl";
import { generateCode } from "../lib/slug";

const MAX_RETRIES = 5;

export const linksRouter = new Hono();

linksRouter.post("/links", async (c) => {
  const body = await c.req.json().catch(() => null);

  if (!body || typeof body.url !== "string") {
    return c.json({ error: "url is required" }, 400);
  }

  if (!isValidHttpUrl(body.url)) {
    return c.json({ error: "url must be http/https" }, 400);
  }

  let expiresAt: Date | null = null;
  if (typeof body.expiresAt === "string") {
    const parsed = new Date(body.expiresAt);
    if (Number.isNaN(parsed.getTime())) {
      return c.json({ error: "expiresAt must be ISO datetime" }, 400);
    }
    expiresAt = parsed;
  }

  let created = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const code = generateCode();

    try {
      const inserted = await db
        .insert(links)
        .values({
          code,
          originalUrl: body.url,
          expiresAt,
        })
        .returning();

      created = inserted[0];
      break;
    } catch (err) {
      // If the code conflicts, retry. Otherwise rethrow.
      if (
        err instanceof Error &&
        err.message.toLowerCase().includes("unique")
      ) {
        continue;
      }
      throw err;
    }
  }

  if (!created) {
    return c.json({ error: "failed to create short url" }, 500);
  }

  const baseUrl =
    process.env.BASE_URL ?? new URL(c.req.url).origin;

  const shortUrl = `${baseUrl}/${created.code}`;

  return c.json({
    code: created.code,
    shortUrl,
    originalUrl: created.originalUrl,
    expiresAt: created.expiresAt ?? null,
  });
});

linksRouter.get("/links/:code", async (c) => {
  const code = c.req.param("code");

  const found = await db
    .select()
    .from(links)
    .where(eq(links.code, code))
    .limit(1);

  const link = found[0];
  if (!link) {
    return c.json({ error: "not found" }, 404);
  }

  const countRow = await db
    .select({ count: sql<number>`count(*)` })
    .from(clickEvents)
    .where(eq(clickEvents.linkId, link.id));

  const clickCount = Number(countRow[0]?.count ?? 0);

  return c.json({
    code: link.code,
    originalUrl: link.originalUrl,
    createdAt: link.createdAt,
    expiresAt: link.expiresAt ?? null,
    clickCount,
  });
});

linksRouter.get("/links/:code/events", async (c) => {
  const code = c.req.param("code");

  const found = await db
    .select()
    .from(links)
    .where(eq(links.code, code))
    .limit(1);

  const link = found[0];
  if (!link) {
    return c.json({ error: "not found" }, 404);
  }

  const fromParam = c.req.query("from");
  const toParam = c.req.query("to");
  const limitParam = c.req.query("limit");

  const from = fromParam ? new Date(fromParam) : null;
  const to = toParam ? new Date(toParam) : null;

  if (fromParam && Number.isNaN(from?.getTime())) {
    return c.json({ error: "from must be ISO datetime" }, 400);
  }
  if (toParam && Number.isNaN(to?.getTime())) {
    return c.json({ error: "to must be ISO datetime" }, 400);
  }

  const limit = Math.min(
    Math.max(Number(limitParam ?? 50), 1),
    200
  );

  const whereParts = [eq(clickEvents.linkId, link.id)];

  if (from) whereParts.push(gte(clickEvents.clickedAt, from));
  if (to) whereParts.push(lte(clickEvents.clickedAt, to));

  const events = await db
    .select()
    .from(clickEvents)
    .where(and(...whereParts))
    .orderBy(desc(clickEvents.clickedAt))
    .limit(limit);

  return c.json({
    code: link.code,
    events,
  });
});