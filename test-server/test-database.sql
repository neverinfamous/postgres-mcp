-- Core test tables
CREATE TABLE test_products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  price DECIMAL(10,2),
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO test_products (name, description, price)
SELECT 'Product ' || i, 'Description for product ' || i, (random() * 100 + 10)::numeric(10,2)
FROM generate_series(1, 15) i;

CREATE TABLE test_orders (
  id SERIAL PRIMARY KEY,
  product_id INT REFERENCES test_products(id),
  quantity INT,
  total_price DECIMAL(10,2),
  order_date TIMESTAMP DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'pending'
);

INSERT INTO test_orders (product_id, quantity, total_price, status)
SELECT 
  (random() * 14 + 1)::int, 
  (random() * 10 + 1)::int, 
  (random() * 500 + 50)::numeric(10,2), 
  (ARRAY['pending', 'completed', 'shipped', 'cancelled'])[(random() * 4)::int + 1]
FROM generate_series(1, 20);

CREATE INDEX idx_orders_status ON test_orders(status);
CREATE INDEX idx_orders_date ON test_orders(order_date);

-- Test JSONB table
CREATE TABLE test_jsonb_docs (
  id SERIAL PRIMARY KEY,
  metadata JSONB NOT NULL,
  settings JSONB,
  tags JSONB DEFAULT '[]'::jsonb
);

INSERT INTO test_jsonb_docs (metadata, settings, tags) VALUES
  ('{"type": "article", "author": "Alice", "views": 100}', '{"theme": "dark", "notifications": true}', '["tech", "news"]'),
  ('{"type": "video", "author": "Bob", "duration": 3600}', '{"quality": "hd", "autoplay": false}', '["entertainment"]'),
  ('{"type": "article", "author": "Charlie", "views": 500, "nested": {"level1": {"level2": "deep"}}}', null, '["tech", "tutorial"]');

-- Test articles for full-text search
CREATE TABLE test_articles (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  search_vector TSVECTOR
);

INSERT INTO test_articles (title, body) VALUES
  ('PostgreSQL Full-Text Search Guide', 'PostgreSQL provides powerful full-text search capabilities with tsvector and tsquery.'),
  ('Database Performance Optimization', 'Optimizing database performance requires understanding query plans, indexes, and caching.'),
  ('Introduction to MCP Protocol', 'The Model Context Protocol enables AI assistants to interact with external systems.');

UPDATE test_articles SET search_vector = to_tsvector('english', title || ' ' || body);
CREATE INDEX idx_articles_fts ON test_articles USING GIN(search_vector);

-- Test schema and objects
CREATE SCHEMA IF NOT EXISTS test_schema;
CREATE SEQUENCE test_schema.order_seq START 1000;

CREATE VIEW test_order_summary AS
  SELECT p.name, SUM(o.quantity) as total_sold, SUM(o.total_price) as revenue
  FROM test_products p
  JOIN test_orders o ON p.id = o.product_id
  GROUP BY p.name;

CREATE OR REPLACE FUNCTION test_get_order_count()
RETURNS INTEGER AS $$
BEGIN
  RETURN (SELECT COUNT(*) FROM test_orders);
END;
$$ LANGUAGE plpgsql;

-- Measurements for stats tools
CREATE TABLE test_measurements (
  id SERIAL PRIMARY KEY,
  sensor_id INT,
  temperature DECIMAL(5,2),
  humidity DECIMAL(5,2),
  pressure DECIMAL(7,2),
  measured_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO test_measurements (sensor_id, temperature, humidity, pressure, measured_at)
SELECT 
  (random() * 5 + 1)::int,
  20 + random() * 15,
  40 + random() * 40,
  1000 + random() * 50,
  NOW() - (random() * 30) * interval '1 day'
FROM generate_series(1, 500);

-- Vector embeddings (with diverse random vectors for meaningful search/clustering tests)
CREATE TABLE test_embeddings (
  id SERIAL PRIMARY KEY,
  content TEXT,
  category VARCHAR(20),
  embedding vector(384)
);

-- Generate 50 embeddings with truly unique random vectors per row
-- Uses DO block to ensure random() is called fresh for each dimension of each row
DO $$
DECLARE
  i INT;
  j INT;
  vec_str TEXT;
  cat TEXT;
  categories TEXT[] := ARRAY['tech', 'science', 'business', 'sports', 'entertainment'];
BEGIN
  FOR i IN 1..50 LOOP
    -- Build a unique random vector for this row
    vec_str := '[';
    FOR j IN 1..384 LOOP
      IF j > 1 THEN vec_str := vec_str || ','; END IF;
      vec_str := vec_str || (random() * 2 - 1)::float4::text;
    END LOOP;
    vec_str := vec_str || ']';
    
    -- Assign category for groupBy testing
    cat := categories[1 + (i % 5)];
    
    INSERT INTO test_embeddings (content, category, embedding)
    VALUES ('Sample document ' || i, cat, vec_str::vector);
  END LOOP;
END $$;

CREATE INDEX ON test_embeddings USING hnsw (embedding vector_cosine_ops);

-- PostGIS locations
CREATE TABLE test_locations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100),
  location GEOMETRY(POINT, 4326)
);

INSERT INTO test_locations (name, location) VALUES
  ('New York', ST_SetSRID(ST_MakePoint(-74.006, 40.7128), 4326)),
  ('Los Angeles', ST_SetSRID(ST_MakePoint(-118.2437, 34.0522), 4326)),
  ('Chicago', ST_SetSRID(ST_MakePoint(-87.6298, 41.8781), 4326)),
  ('London', ST_SetSRID(ST_MakePoint(-0.1276, 51.5074), 4326)),
  ('Tokyo', ST_SetSRID(ST_MakePoint(139.6917, 35.6895), 4326));

CREATE INDEX idx_locations_geo ON test_locations USING GIST(location);

-- Citext users
CREATE TABLE test_users (
  id SERIAL PRIMARY KEY,
  username CITEXT NOT NULL UNIQUE,
  email CITEXT NOT NULL
);

INSERT INTO test_users (username, email) VALUES
  ('JohnDoe', 'John.Doe@Example.com'),
  ('JaneSmith', 'JANE.SMITH@example.COM'),
  ('BobJones', 'bob.jones@EXAMPLE.com');

-- Ltree categories
CREATE TABLE test_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100),
  path LTREE
);

CREATE INDEX idx_categories_path ON test_categories USING GIST(path);

INSERT INTO test_categories (name, path) VALUES
  ('Electronics', 'electronics'),
  ('Phones', 'electronics.phones'),
  ('Smartphones', 'electronics.phones.smartphones'),
  ('Accessories', 'electronics.accessories'),
  ('Clothing', 'clothing'),
  ('Shirts', 'clothing.shirts');

-- Secure data for pgcrypto  
CREATE TABLE test_secure_data (
  id SERIAL PRIMARY KEY,
  user_id INT,
  sensitive_data BYTEA,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Partitioned events table
CREATE TABLE test_events (
  id SERIAL,
  event_type VARCHAR(50),
  event_date DATE NOT NULL,
  payload JSONB
) PARTITION BY RANGE (event_date);

CREATE TABLE test_events_2024_q1 PARTITION OF test_events
  FOR VALUES FROM ('2024-01-01') TO ('2024-04-01');
CREATE TABLE test_events_2024_q2 PARTITION OF test_events
  FOR VALUES FROM ('2024-04-01') TO ('2024-07-01');
CREATE TABLE test_events_2024_q3 PARTITION OF test_events
  FOR VALUES FROM ('2024-07-01') TO ('2024-10-01');
CREATE TABLE test_events_2024_q4 PARTITION OF test_events
  FOR VALUES FROM ('2024-10-01') TO ('2025-01-01');

INSERT INTO test_events (event_type, event_date, payload)
SELECT 'click', '2024-01-01'::date + (random() * 365)::int, '{"page": "home"}'::jsonb
FROM generate_series(1, 100);

-- Logs for partman
CREATE TABLE test_logs (
  id SERIAL,
  log_level VARCHAR(10),
  message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Introspection test tables
-- Multi-table FK chain with varied ON DELETE behaviors for dependency/cascade testing
CREATE TABLE test_departments (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  budget DECIMAL(12,2)
);

CREATE TABLE test_employees (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  department_id INT REFERENCES test_departments(id) ON DELETE CASCADE,
  manager_id INT REFERENCES test_employees(id) ON DELETE SET NULL,
  hire_date DATE DEFAULT CURRENT_DATE
);

CREATE TABLE test_projects (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  lead_id INT REFERENCES test_employees(id) ON DELETE SET NULL,
  department_id INT REFERENCES test_departments(id) ON DELETE RESTRICT
);

CREATE TABLE test_assignments (
  id SERIAL PRIMARY KEY,
  employee_id INT NOT NULL REFERENCES test_employees(id) ON DELETE CASCADE,
  project_id INT NOT NULL REFERENCES test_projects(id) ON DELETE CASCADE,
  role VARCHAR(50),
  UNIQUE(employee_id, project_id)
);

-- Deliberately flawed table for pg_constraint_analysis to detect issues:
-- - No PRIMARY KEY
-- - FK on employee_id without a supporting index
CREATE TABLE test_audit_log (
  entry_id INT,
  employee_id INT REFERENCES test_employees(id),
  action VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Seed minimal data for row counts in dependency graph
INSERT INTO test_departments (name, budget) VALUES
  ('Engineering', 500000), ('Marketing', 200000), ('Sales', 300000);

INSERT INTO test_employees (name, department_id, manager_id) VALUES
  ('Alice', 1, NULL), ('Bob', 1, 1), ('Charlie', 2, NULL),
  ('Diana', 3, NULL), ('Eve', 1, 1);

INSERT INTO test_projects (name, lead_id, department_id) VALUES
  ('Project Alpha', 1, 1), ('Project Beta', 3, 2);

INSERT INTO test_assignments (employee_id, project_id, role) VALUES
  (1, 1, 'lead'), (2, 1, 'developer'), (3, 2, 'lead');

INSERT INTO test_audit_log (entry_id, employee_id, action) VALUES
  (1, 1, 'login'), (2, 2, 'update_profile'), (3, 1, 'logout');
