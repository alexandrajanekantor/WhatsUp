// Applies supabase/migrations/*.sql over a direct Postgres connection (needs a valid SUPABASE_DB_PW).
import { readdirSync, readFileSync } from "node:fs";
import { connect } from "./db.mjs";

const client = await connect();
for (const f of readdirSync("supabase/migrations").sort()) {
  console.log("applying", f);
  await client.query(readFileSync(`supabase/migrations/${f}`, "utf8"));
}
await client.end();
console.log("done");
