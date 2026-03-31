-- Resource Testing Seed Data
-- This seed creates data patterns that will populate resource outputs meaningfully
-- Run after test-seed.sql to build on existing structures

-- ============================================================================
-- PERFORMANCE RESOURCE: Create enough queries to populate pg_stat_statements
-- ============================================================================
-- Run various queries so pg_stat_statements has data
SELECT COUNT(*) FROM test_products WHERE price > 50;
SELECT * FROM test_orders WHERE status = 'pending' LIMIT 5;
SELECT p.name, SUM(o.quantity) FROM test_products p 
  JOIN test_orders o ON p.id = o.product_id GROUP BY p.name;
SELECT * FROM test_measurements WHERE temperature > 25 ORDER BY measured_at DESC LIMIT 10;
SELECT COUNT(*), AVG(humidity) FROM test_measurements GROUP BY sensor_id;

-- ============================================================================
-- STATS RESOURCE: Create stale statistics by modifying data
-- ============================================================================
-- Bulk insert to create stale stats (>10% modification threshold)
INSERT INTO test_measurements (sensor_id, temperature, humidity, pressure, measured_at)
SELECT 
  (random() * 5 + 1)::int,
  20 + random() * 15,
  40 + random() * 40,
  1000 + random() * 50,
  NOW() - (random() * 7) * interval '1 day'
FROM generate_series(1, 200);

-- Delete some rows to create dead tuples
DELETE FROM test_measurements WHERE id % 5 = 0 AND id > 400;

-- ============================================================================
-- VACUUM RESOURCE: Create dead tuples
-- ============================================================================
-- Update rows to create dead tuples (vacuum will show these)
UPDATE test_products SET description = description || ' (updated)' WHERE id <= 5;
UPDATE test_orders SET status = 'processed' WHERE status = 'pending' AND id <= 5;

-- ============================================================================
-- INDEXES RESOURCE: Create some potentially unused/redundant indexes
-- ============================================================================
-- Create a duplicate-ish index that might be considered redundant
CREATE INDEX IF NOT EXISTS idx_orders_status_dup ON test_orders(status, order_date);
-- Create index that won't be used (for unused index detection)
CREATE INDEX IF NOT EXISTS idx_products_desc_unused ON test_products(description text_pattern_ops);

-- ============================================================================
-- HEALTH RESOURCE: Generate some buffer hits by querying data
-- ============================================================================
-- Access tables to generate cache hits
SELECT * FROM test_products ORDER BY id;
SELECT * FROM test_orders ORDER BY id;
SELECT * FROM test_articles;
SELECT COUNT(*) FROM test_measurements;

-- ============================================================================
-- ACTIVITY RESOURCE: The current connection will be visible
-- ============================================================================
-- Just running this script creates activity

-- ============================================================================
-- LOCKS RESOURCE: Create a table that could have lock contention
-- ============================================================================
CREATE TABLE IF NOT EXISTS test_lock_target (
  id SERIAL PRIMARY KEY,
  counter INT DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO test_lock_target (counter) VALUES (0) ON CONFLICT DO NOTHING;

-- ============================================================================
-- CRON RESOURCE: Schedule a test job (if pg_cron is installed)
-- ============================================================================
DO $$
BEGIN
  -- Only create if pg_cron is installed
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Schedule a simple maintenance job
    PERFORM cron.schedule(
      'resource_test_job',
      '0 3 * * *',  -- Run at 3am daily
      'SELECT 1'
    );
    RAISE NOTICE 'Created test cron job';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available or job exists: %', SQLERRM;
END $$;

-- ============================================================================
-- VECTOR RESOURCE: Ensure HNSW index exists (should already from test-seed)
-- ============================================================================
-- Add more vector data for variety
INSERT INTO test_embeddings (content, embedding)
SELECT 
  'Resource test document ' || i,
  ('[' || array_to_string(
    ARRAY(SELECT (random() * 2 - 1)::float4 FROM generate_series(1, 384)), 
    ','
  ) || ']')::vector
FROM generate_series(51, 75) i
ON CONFLICT DO NOTHING;

-- ============================================================================
-- POSTGIS RESOURCE: Ensure spatial data and indexes exist
-- ============================================================================
-- Add more locations to increase row counts
INSERT INTO test_locations (name, location) 
SELECT 
  'City ' || i,
  ST_SetSRID(ST_MakePoint(-180 + random() * 360, -90 + random() * 180), 4326)
FROM generate_series(6, 25) i
ON CONFLICT DO NOTHING;

-- ============================================================================
-- PARTMAN RESOURCE: Create a partman-managed table
-- ============================================================================
DO $$
BEGIN
  -- Only if pg_partman is installed
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_partman') THEN
    -- Check if already configured
    IF NOT EXISTS (SELECT 1 FROM public.part_config WHERE parent_table = 'public.test_logs') THEN
      -- First create the template and initial partition
      PERFORM public.create_parent(
        p_parent_table := 'public.test_logs',
        p_control := 'created_at',
        p_interval := '1 day',
        p_premake := 7,
        p_start_partition := (NOW() - INTERVAL '14 days')::text
      );
      RAISE NOTICE 'Created partman config for test_logs';
    END IF;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_partman setup skipped: %', SQLERRM;
END $$;

-- Insert log data
INSERT INTO test_logs (log_level, message, created_at)
SELECT 
  (ARRAY['INFO', 'WARN', 'ERROR', 'DEBUG'])[(random() * 4)::int + 1],
  'Log message ' || i,
  NOW() - (random() * 14) * interval '1 day'
FROM generate_series(1, 50) i
ON CONFLICT DO NOTHING;

-- ============================================================================
-- KCACHE RESOURCE: Generate some CPU/IO activity for pg_stat_kcache
-- ============================================================================
-- Heavy computation query (will show up in kcache if installed)
SELECT COUNT(*), AVG(m1.temperature * m2.humidity)
FROM test_measurements m1
CROSS JOIN (SELECT * FROM test_measurements LIMIT 50) m2;

-- ============================================================================
-- CRYPTO RESOURCE: Create some UUID columns and password-like columns
-- ============================================================================
ALTER TABLE test_users ADD COLUMN IF NOT EXISTS user_uuid UUID DEFAULT gen_random_uuid();
ALTER TABLE test_users ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Update with bcrypt-style hashes (simulated)
UPDATE test_users SET password_hash = '$2a$10$' || encode(gen_random_bytes(22), 'base64')
WHERE password_hash IS NULL;

-- ============================================================================
-- EXTENSIONS RESOURCE: Extensions should already be installed
-- ============================================================================
-- No action needed - extensions.ts queries pg_extension

-- ============================================================================
-- REPLICATION RESOURCE: Create a logical replication slot (if superuser)
-- ============================================================================
DO $$
BEGIN
  -- Only create if we have permissions and slot doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_replication_slots WHERE slot_name = 'test_resource_slot') THEN
    PERFORM pg_create_logical_replication_slot('test_resource_slot', 'pgoutput');
    RAISE NOTICE 'Created test replication slot';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Replication slot not created: %', SQLERRM;
END $$;

-- ============================================================================
-- SETTINGS RESOURCE: Nothing needed - queries pg_settings
-- ============================================================================

-- ============================================================================
-- POOL RESOURCE: Nothing needed - queries connection pool state
-- ============================================================================

-- ============================================================================
-- Run ANALYZE to update statistics before testing
-- ============================================================================
ANALYZE test_products;
ANALYZE test_orders;
ANALYZE test_measurements;
ANALYZE test_embeddings;
ANALYZE test_locations;
ANALYZE test_users;
ANALYZE test_categories;

-- Completion message
DO $$ BEGIN RAISE NOTICE 'Resource test seed completed successfully'; END $$;
