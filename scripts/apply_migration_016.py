import os
import time
import psycopg2
from dotenv import load_dotenv

load_dotenv(".env.local")

sql = open("supabase/migrations/016_donors_materialized_view.sql").read()

print("Connecting…", flush=True)
conn = psycopg2.connect(os.getenv("SUPABASE_DB_URL"))
conn.autocommit = True
cur = conn.cursor()
cur.execute("SET statement_timeout='1800s'")

print("Applying migration 016…", flush=True)
t0 = time.time()
cur.execute(sql)
print(f"applied in {time.time()-t0:.1f}s", flush=True)

cur.execute("SELECT COUNT(*) FROM donors_mv")
print(f"donors_mv rows: {cur.fetchone()[0]:,}")
cur.execute("SELECT SUM(total_combined)::numeric(20,2) FROM donors_mv")
print(f"donors_mv SUM(total_combined): ${cur.fetchone()[0]:,}")
