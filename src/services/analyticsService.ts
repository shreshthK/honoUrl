import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../db/client";
import { clickEvents } from "../db/schema";
import { hashIp } from "../lib/hash";

export const getClickCount = async (linkId: string) => {
  const countRow = await db
    .select({ count: sql<number>`count(*)` })
    .from(clickEvents)
    .where(eq(clickEvents.linkId, linkId));

  return Number(countRow[0]?.count ?? 0);
};

export const listClickEvents = async (params: {
  linkId: string;
  from?: Date | null;
  to?: Date | null;
  limit: number;
}) => {
  const whereParts = [eq(clickEvents.linkId, params.linkId)];

  if (params.from) {
    whereParts.push(gte(clickEvents.clickedAt, params.from));
  }
  if (params.to) {
    whereParts.push(lte(clickEvents.clickedAt, params.to));
  }

  return db
    .select()
    .from(clickEvents)
    .where(and(...whereParts))
    .orderBy(desc(clickEvents.clickedAt))
    .limit(params.limit);
};

export const recordClickEvent = async (params: {
  linkId: string;
  userAgent: string | null;
  referer: string | null;
  ip: string | null;
}) => {
  await db.insert(clickEvents).values({
    linkId: params.linkId,
    userAgent: params.userAgent,
    referer: params.referer,
    ipHash: hashIp(params.ip),
  });
};
