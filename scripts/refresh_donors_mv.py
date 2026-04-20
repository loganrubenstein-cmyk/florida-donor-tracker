import os, time
import psycopg2
from dotenv import load_dotenv

load_dotenv(".env.local")
conn = psycopg2.connect(os.getenv("SUPABASE_DB_URL"))
conn.autocommit = True
cur = conn.cursor()
cur.execute("SET statement_timeout='1800s'")

print("Refreshing donors_mv (concurrent)…", flush=True)
t0 = time.time()
cur.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY donors_mv")
print(f"refreshed in {time.time()-t0:.1f}s", flush=True)

cur.execute("SELECT COUNT(*) FROM donors_mv")
print(f"donors_mv rows: {cur.fetchone()[0]:,}")
cur.execute("SELECT SUM(total_combined)::numeric(20,2) FROM donors_mv")
mv = cur.fetchone()[0]
cur.execute("SELECT SUM(amount)::numeric(20,2) FROM contributions WHERE donor_slug IS NOT NULL")
co = cur.fetchone()[0]
print(f"donors_mv SUM:  ${mv:,}")
print(f"contrib SUM:    ${co:,}")
print(f"drift:          ${co-mv:,}")
