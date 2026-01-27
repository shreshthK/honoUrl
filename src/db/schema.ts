import { relations } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const links = pgTable(
  "links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    originalUrl: text("original_url").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => ({
    codeUnique: uniqueIndex("links_code_unique").on(table.code),
  })
);

export const clickEvents = pgTable(
  "click_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    linkId: uuid("link_id")
      .notNull()
      .references(() => links.id, { onDelete: "cascade" }),
    clickedAt: timestamp("clicked_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    userAgent: text("user_agent"),
    referer: text("referer"),
    ipHash: text("ip_hash"),
  },
  (table) => ({
    linkIdIdx: index("click_events_link_id_idx").on(table.linkId),
    linkIdClickedAtIdx: index("click_events_link_id_clicked_at_idx").on(
      table.linkId,
      table.clickedAt
    ),
  })
);

export const linksRelations = relations(links, ({ many }) => ({
  clickEvents: many(clickEvents),
}));

export const clickEventsRelations = relations(clickEvents, ({ one }) => ({
  link: one(links, {
    fields: [clickEvents.linkId],
    references: [links.id],
  }),
}));
