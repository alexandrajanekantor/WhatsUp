// Shared helper: connect to the Supabase Postgres directly using SUPABASE_DB_PW from .env.
import { config } from "dotenv";
import pg from "pg";
config({ path: ".env" });

const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];

export async function connect() {
  const client = new pg.Client({
    host: process.env.SUPABASE_DB_HOST ?? "aws-0-us-east-1.pooler.supabase.com", // session pooler; the direct db.* host is IPv6-only
    port: 5432,
    user: `postgres.${ref}`,
    password: process.env.SUPABASE_DB_PW,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
  await client.connect();
  return client;
}
