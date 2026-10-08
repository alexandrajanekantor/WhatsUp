// Applies unapplied supabase/migrations/*.sql over a direct Postgres connection (needs a valid SUPABASE_DB_PW).
// Applied files are tracked in public.schema_migrations; 0001 is assumed applied if `profiles` already exists.
import { readdirSync, readFileSync } from "node:fs";
import { connect } from "./db.mjs";

const client = await connect();
await client.query("create table if not exists public.schema_migrations (name text primary key, applied_at timestamptz default now())");
const { rows: tracked } = await client.query("select count(*)::int as n from public.schema_migrations");
if (tracked[0].n === 0) {
  const { rows } = await client.query("select to_regclass('public.profiles') as t");
  if (rows[0].t) await client.query("insert into public.schema_migrations (name) values ('0001_init.sql')");
}
const { rows: done } = await client.query("select name from public.schema_migrations");
const applied = new Set(done.map((r) => r.name));

for (const f of readdirSync("supabase/migrations").sort()) {
  if (applied.has(f)) continue;
  console.log("applying", f);
  await client.query("begin");
  try {
    await client.query(readFileSync(`supabase/migrations/${f}`, "utf8"));
    await client.query("insert into public.schema_migrations (name) values ($1)", [f]);
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  }
}
await client.query("notify pgrst, 'reload schema'");
await client.end();
console.log("done");
