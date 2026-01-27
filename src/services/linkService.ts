import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { links } from "../db/schema";
import { generateCode } from "../lib/slug";

const MAX_RETRIES = 5;

export const createShortLink = async (params: {
  url: string;
  expiresAt?: string;
  baseUrl: string;
}) => {
  const expiresAt = params.expiresAt
    ? new Date(params.expiresAt)
    : null;

  let created = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const code = generateCode();

    try {
      const inserted = await db
        .insert(links)
        .values({
          code,
          originalUrl: params.url,
          expiresAt,
        })
        .returning();

      created = inserted[0];
      break;
    } catch (err) {
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
    return null;
  }

  const shortUrl = `${params.baseUrl}/${created.code}`;

  return {
    code: created.code,
    shortUrl,
    originalUrl: created.originalUrl,
    expiresAt: created.expiresAt
      ? created.expiresAt.toISOString()
      : null,
  };
};

export const findLinkByCode = async (code: string) => {
  const found = await db
    .select()
    .from(links)
    .where(eq(links.code, code))
    .limit(1);

  return found[0] ?? null;
};
