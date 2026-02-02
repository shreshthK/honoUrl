//not used anymore. Codes below has been moved to openapi.ts

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { links, clickEvents } from "../db/schema";
import { hashIp } from "../lib/hash";

export const redirectRouter = new Hono();

redirectRouter.get("/:code", async (c) => {
  const code = c.req.param("code");

  const found = await db
    .select()
    .from(links)
    .where(eq(links.code, code))
    .limit(1);

  const link = found[0];
  if (!link) {
    return c.text("not found", 404);
  }

  if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) {
    return c.text("expired", 410);
  }

  const userAgent = c.req.header("user-agent") ?? null;
  const referer = c.req.header("referer") ?? null;

  // best-effort IP capture
  const forwarded = c.req.header("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ??
    c.req.header("cf-connecting-ip") ??
    null;

  try {
    await db.insert(clickEvents).values({
      linkId: link.id,
      userAgent,
      referer,
      ipHash: hashIp(ip),
    });
  } catch {
    // ignore logging errors, still redirect
  }

  return c.redirect(link.originalUrl, 302);
});