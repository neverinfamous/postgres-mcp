-- ============================================================================
-- test-prompts.sql - Database seed for testing postgres-mcp prompts
-- ============================================================================
-- This seed creates tables and data to support testing all 19 prompts.
-- Prompts are documentation/guidance generators, so this seed primarily
-- ensures the referenced tools and queries will work when testing prompts.
-- ============================================================================

-- ============================================================================
-- SECTION 1: Core Tables (for pg_query_builder, pg_schema_design, pg_migration)
-- ============================================================================

-- Users table for authentication/query examples
CREATE TABLE IF NOT EXISTS prompt_users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash TEXT,
    display_name VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_login TIMESTAMPTZ
);

-- Orders table for join/CTE examples
CREATE TABLE IF NOT EXISTS prompt_orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES prompt_users(id),
    order_date TIMESTAMPTZ DEFAULT NOW(),
    total_amount DECIMAL(10,2),
    status VARCHAR(50) DEFAULT 'pending'
);

-- Order items for multi-table queries
CREATE TABLE IF NOT EXISTS prompt_order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES prompt_orders(id),
    product_name VARCHAR(255),
    quantity INTEGER,
    unit_price DECIMAL(10,2)
);

-- Seed core tables
INSERT INTO prompt_users (email, username, display_name) VALUES
    ('alice@example.com', 'alice', 'Alice Smith'),
    ('bob@example.com', 'bob', 'Bob Johnson'),
    ('carol@example.com', 'carol', 'Carol Williams')
ON CONFLICT (email) DO NOTHING;

INSERT INTO prompt_orders (user_id, total_amount, status)
SELECT u.id, (random() * 500 + 50)::decimal(10,2), 
       (ARRAY['pending', 'processing', 'shipped', 'delivered'])[floor(random()*4+1)::int]
FROM prompt_users u, generate_series(1, 5)
ON CONFLICT DO NOTHING;

INSERT INTO prompt_order_items (order_id, product_name, quantity, unit_price)
SELECT o.id, 'Product ' || gs, floor(random()*5+1)::int, (random()*100+10)::decimal(10,2)
FROM prompt_orders o, generate_series(1, 3) gs
ON CONFLICT DO NOTHING;

-- ============================================================================
-- SECTION 2: Performance Analysis Tables (for pg_performance_analysis, pg_index_tuning)
-- ============================================================================

-- Large table for performance testing
CREATE TABLE IF NOT EXISTS prompt_transactions (
    id SERIAL PRIMARY KEY,
    account_id INTEGER,
    transaction_type VARCHAR(20),
    amount DECIMAL(12,2),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create some indexes (some intentionally suboptimal)
CREATE INDEX IF NOT EXISTS idx_prompt_trans_account ON prompt_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_prompt_trans_type ON prompt_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_prompt_trans_created ON prompt_transactions(created_at);

-- Seed with enough data for meaningful stats
INSERT INTO prompt_transactions (account_id, transaction_type, amount, description, created_at)
SELECT 
    floor(random()*100+1)::int,
    (ARRAY['deposit', 'withdrawal', 'transfer', 'payment', 'refund'])[floor(random()*5+1)::int],
    (random()*10000)::decimal(12,2),
    'Transaction #' || gs,
    NOW() - (random() * INTERVAL '365 days')
FROM generate_series(1, 10000) gs
ON CONFLICT DO NOTHING;

-- ============================================================================
-- SECTION 3: Health Check Tables (for pg_database_health_check)
-- ============================================================================

-- Sessions table for connection monitoring examples
CREATE TABLE IF NOT EXISTS prompt_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id INTEGER,
    token TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO prompt_sessions (user_id, token, expires_at)
SELECT 
    floor(random()*3+1)::int,
    encode(gen_random_bytes(32), 'hex'),
    NOW() + (random() * INTERVAL '24 hours')
FROM generate_series(1, 50)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- SECTION 4: Backup Strategy Tables (for pg_backup_strategy)
-- ============================================================================

-- Audit log for backup tracking examples
CREATE TABLE IF NOT EXISTS prompt_audit_log (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(100),
    operation VARCHAR(20),
    old_data JSONB,
    new_data JSONB,
    changed_at TIMESTAMPTZ DEFAULT NOW(),
    changed_by VARCHAR(100)
);

INSERT INTO prompt_audit_log (table_name, operation, new_data, changed_by)
SELECT 
    'prompt_users',
    (ARRAY['INSERT', 'UPDATE', 'DELETE'])[floor(random()*3+1)::int],
    jsonb_build_object('id', gs, 'action', 'test'),
    'system'
FROM generate_series(1, 100) gs
ON CONFLICT DO NOTHING;

-- ============================================================================
-- SECTION 5: Extension Setup Test Tables
-- ============================================================================

-- pgvector test (for pg_setup_pgvector)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
        EXECUTE 'CREATE TABLE IF NOT EXISTS prompt_embeddings (
            id SERIAL PRIMARY KEY,
            content TEXT,
            embedding vector(384),
            created_at TIMESTAMPTZ DEFAULT NOW()
        )';
        RAISE NOTICE 'Created prompt_embeddings with vector column';
    ELSE
        CREATE TABLE IF NOT EXISTS prompt_embeddings (
            id SERIAL PRIMARY KEY,
            content TEXT,
            embedding_placeholder TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        RAISE NOTICE 'Created prompt_embeddings placeholder (vector extension not installed)';
    END IF;
END $$;

-- PostGIS test (for pg_setup_postgis)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
        EXECUTE 'CREATE TABLE IF NOT EXISTS prompt_locations (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255),
            description TEXT,
            location GEOGRAPHY(POINT, 4326),
            created_at TIMESTAMPTZ DEFAULT NOW()
        )';
        EXECUTE 'INSERT INTO prompt_locations (name, location) VALUES
            (''San Francisco'', ST_GeographyFromText(''POINT(-122.4194 37.7749)'')),
            (''New York'', ST_GeographyFromText(''POINT(-74.0060 40.7128)'')),
            (''London'', ST_GeographyFromText(''POINT(-0.1276 51.5074)''))
            ON CONFLICT DO NOTHING';
        RAISE NOTICE 'Created and seeded prompt_locations with geography column';
    ELSE
        CREATE TABLE IF NOT EXISTS prompt_locations (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255),
            description TEXT,
            latitude DECIMAL(10,6),
            longitude DECIMAL(10,6),
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        INSERT INTO prompt_locations (name, latitude, longitude) VALUES
            ('San Francisco', 37.7749, -122.4194),
            ('New York', 40.7128, -74.0060),
            ('London', 51.5074, -0.1276)
        ON CONFLICT DO NOTHING;
        RAISE NOTICE 'Created prompt_locations placeholder (PostGIS not installed)';
    END IF;
END $$;

-- ltree test (for pg_setup_ltree)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'ltree') THEN
        EXECUTE 'CREATE TABLE IF NOT EXISTS prompt_categories (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            path LTREE NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )';
        EXECUTE 'INSERT INTO prompt_categories (name, path) VALUES
            (''Electronics'', ''electronics''),
            (''Computers'', ''electronics.computers''),
            (''Laptops'', ''electronics.computers.laptops''),
            (''Desktops'', ''electronics.computers.desktops''),
            (''Phones'', ''electronics.phones''),
            (''Clothing'', ''clothing''),
            (''Men'', ''clothing.men''),
            (''Women'', ''clothing.women'')
            ON CONFLICT DO NOTHING';
        RAISE NOTICE 'Created and seeded prompt_categories with ltree column';
    ELSE
        CREATE TABLE IF NOT EXISTS prompt_categories (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            path_text VARCHAR(500) NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        INSERT INTO prompt_categories (name, path_text) VALUES
            ('Electronics', 'electronics'),
            ('Computers', 'electronics.computers'),
            ('Laptops', 'electronics.computers.laptops')
        ON CONFLICT DO NOTHING;
        RAISE NOTICE 'Created prompt_categories placeholder (ltree not installed)';
    END IF;
END $$;

-- citext test (for pg_setup_citext)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'citext') THEN
        EXECUTE 'CREATE TABLE IF NOT EXISTS prompt_accounts (
            id SERIAL PRIMARY KEY,
            email CITEXT UNIQUE NOT NULL,
            username CITEXT UNIQUE NOT NULL,
            display_name VARCHAR(255),
            created_at TIMESTAMPTZ DEFAULT NOW()
        )';
        EXECUTE 'INSERT INTO prompt_accounts (email, username, display_name) VALUES
            (''Admin@Example.COM'', ''AdminUser'', ''Administrator''),
            (''user@EXAMPLE.com'', ''RegularUser'', ''Regular User'')
            ON CONFLICT DO NOTHING';
        RAISE NOTICE 'Created and seeded prompt_accounts with citext columns';
    ELSE
        CREATE TABLE IF NOT EXISTS prompt_accounts (
            id SERIAL PRIMARY KEY,
            email VARCHAR(255) UNIQUE NOT NULL,
            username VARCHAR(100) UNIQUE NOT NULL,
            display_name VARCHAR(255),
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        INSERT INTO prompt_accounts (email, username, display_name) VALUES
            ('admin@example.com', 'adminuser', 'Administrator')
        ON CONFLICT DO NOTHING;
        RAISE NOTICE 'Created prompt_accounts placeholder (citext not installed)';
    END IF;
END $$;

-- pgcrypto test (for pg_setup_pgcrypto)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
        EXECUTE 'CREATE TABLE IF NOT EXISTS prompt_secure_users (
            id SERIAL PRIMARY KEY,
            email VARCHAR(255) UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )';
        EXECUTE 'INSERT INTO prompt_secure_users (email, password_hash) VALUES
            (''secure@example.com'', crypt(''password123'', gen_salt(''bf'', 10)))
            ON CONFLICT DO NOTHING';
        RAISE NOTICE 'Created and seeded prompt_secure_users with bcrypt password';
    ELSE
        CREATE TABLE IF NOT EXISTS prompt_secure_users (
            id SERIAL PRIMARY KEY,
            email VARCHAR(255) UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        INSERT INTO prompt_secure_users (email, password_hash) VALUES
            ('secure@example.com', 'placeholder_hash')
        ON CONFLICT DO NOTHING;
        RAISE NOTICE 'Created prompt_secure_users placeholder (pgcrypto not installed)';
    END IF;
END $$;

-- pg_cron job log (for pg_setup_pgcron)
CREATE TABLE IF NOT EXISTS prompt_job_log (
    id SERIAL PRIMARY KEY,
    job_name VARCHAR(100),
    status VARCHAR(20),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT
);

INSERT INTO prompt_job_log (job_name, status, started_at, completed_at)
SELECT 
    (ARRAY['nightly-vacuum', 'cleanup-logs', 'daily-report', 'backup-request'])[floor(random()*4+1)::int],
    (ARRAY['success', 'success', 'success', 'failed'])[floor(random()*4+1)::int],
    NOW() - (gs * INTERVAL '1 hour'),
    NOW() - (gs * INTERVAL '1 hour') + INTERVAL '5 minutes'
FROM generate_series(1, 48) gs
ON CONFLICT DO NOTHING;

-- ============================================================================
-- SECTION 6: Partitioned Tables (for pg_setup_partman)
-- ============================================================================

CREATE TABLE IF NOT EXISTS prompt_events (
    id BIGSERIAL,
    event_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_type VARCHAR(50),
    payload JSONB,
    PRIMARY KEY (id, event_time)
) PARTITION BY RANGE (event_time);

-- Create some child partitions manually
CREATE TABLE IF NOT EXISTS prompt_events_2025_12 PARTITION OF prompt_events
    FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');
CREATE TABLE IF NOT EXISTS prompt_events_2026_01 PARTITION OF prompt_events
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

-- Seed partitioned table
INSERT INTO prompt_events (event_type, payload, event_time)
SELECT 
    (ARRAY['click', 'view', 'purchase', 'signup', 'logout'])[floor(random()*5+1)::int],
    jsonb_build_object('source', 'test', 'id', gs),
    '2025-12-01'::timestamptz + (random() * INTERVAL '30 days')
FROM generate_series(1, 1000) gs
ON CONFLICT DO NOTHING;

-- ============================================================================
-- SECTION 7: Organization Chart (for pg_setup_ltree org_chart use case)
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'ltree') THEN
        EXECUTE 'CREATE TABLE IF NOT EXISTS prompt_employees (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            title VARCHAR(100),
            org_path LTREE NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )';
        EXECUTE 'INSERT INTO prompt_employees (name, title, org_path) VALUES
            (''Alice'', ''CEO'', ''ceo''),
            (''Bob'', ''CTO'', ''ceo.cto''),
            (''Carol'', ''CFO'', ''ceo.cfo''),
            (''Dave'', ''Engineering Manager'', ''ceo.cto.eng''),
            (''Eve'', ''Senior Developer'', ''ceo.cto.eng.dev1''),
            (''Frank'', ''Junior Developer'', ''ceo.cto.eng.dev2''),
            (''Grace'', ''Finance Manager'', ''ceo.cfo.finance'')
            ON CONFLICT DO NOTHING';
        RAISE NOTICE 'Created and seeded prompt_employees org chart';
    END IF;
END $$;

-- ============================================================================
-- SECTION 8: Reporting Tables (for pg_setup_pgcron reporting use case)
-- ============================================================================

CREATE TABLE IF NOT EXISTS prompt_daily_reports (
    id SERIAL PRIMARY KEY,
    report_date DATE UNIQUE,
    total_orders INTEGER,
    revenue DECIMAL(12,2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO prompt_daily_reports (report_date, total_orders, revenue)
SELECT 
    CURRENT_DATE - gs,
    floor(random()*100+20)::int,
    (random()*10000+1000)::decimal(12,2)
FROM generate_series(1, 30) gs
ON CONFLICT (report_date) DO NOTHING;

-- Weekly metrics materialized view placeholder
CREATE TABLE IF NOT EXISTS prompt_weekly_metrics (
    id SERIAL PRIMARY KEY,
    week_start DATE,
    total_orders INTEGER,
    total_revenue DECIMAL(12,2),
    avg_order_value DECIMAL(10,2)
);

-- ============================================================================
-- SECTION 9: Secrets Table (for pg_setup_pgcrypto encryption use case)
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
        EXECUTE 'CREATE TABLE IF NOT EXISTS prompt_secrets (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) UNIQUE NOT NULL,
            encrypted_value BYTEA NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )';
        EXECUTE 'INSERT INTO prompt_secrets (name, encrypted_value) VALUES
            (''api_key'', pgp_sym_encrypt(''sk-test-1234567890'', ''test-encryption-key'')),
            (''webhook_secret'', pgp_sym_encrypt(''whsec_abc123'', ''test-encryption-key''))
            ON CONFLICT DO NOTHING';
        RAISE NOTICE 'Created and seeded prompt_secrets with encrypted values';
    ELSE
        CREATE TABLE IF NOT EXISTS prompt_secrets (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) UNIQUE NOT NULL,
            encrypted_value_placeholder TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        INSERT INTO prompt_secrets (name, encrypted_value_placeholder) VALUES
            ('api_key', 'placeholder'),
            ('webhook_secret', 'placeholder')
        ON CONFLICT DO NOTHING;
        RAISE NOTICE 'Created prompt_secrets placeholder (pgcrypto not installed)';
    END IF;
END $$;

-- ============================================================================
-- SECTION 10: Run ANALYZE for accurate statistics
-- ============================================================================

ANALYZE prompt_users;
ANALYZE prompt_orders;
ANALYZE prompt_order_items;
ANALYZE prompt_transactions;
ANALYZE prompt_sessions;
ANALYZE prompt_audit_log;
ANALYZE prompt_job_log;
ANALYZE prompt_events;
ANALYZE prompt_daily_reports;

-- ============================================================================
-- Summary
-- ============================================================================

DO $$
DECLARE
    table_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO table_count 
    FROM information_schema.tables 
    WHERE table_name LIKE 'prompt_%' AND table_schema = 'public';
    
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'Prompt test seed completed successfully!';
    RAISE NOTICE 'Created % tables with prefix "prompt_"', table_count;
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'Ready to test all 19 prompts:';
    RAISE NOTICE '  - 2 no-argument prompts (pg_tool_index, pg_quick_schema)';
    RAISE NOTICE '  - 11 optional-argument prompts with defaults';
    RAISE NOTICE '  - 6 required-argument prompts';
    RAISE NOTICE '============================================================';
END $$;
