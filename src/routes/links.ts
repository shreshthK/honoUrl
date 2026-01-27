import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
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