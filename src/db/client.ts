import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { links, clickEvents } from "./schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

const client = postgres(databaseUrl, {
  max: 1,
});

export const db = drizzle(client, {
  schema: { links, clickEvents },
});