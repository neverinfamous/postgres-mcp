#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Resets the postgres-mcp test database by cleaning up all accumulated test artifacts and re-seeding.

.DESCRIPTION
    This script performs a full cleanup of the postgres-mcp test database:
    1. Drops test schemas (test_schema, test_vector_schema)
    2. Drops temp_* tables
    3. Drops test_* tables
    4. Drops ai_test_* tables
    5. Drops other accumulated artifacts (partman_*, prompt_*, mcp_*, etc.)
    6. Re-seeds the database from test-database.sql

.PARAMETER SkipVerify
    Skip the verification step after reset.

.PARAMETER Verbose
    Show detailed output for each step.

.EXAMPLE
    .\reset-database.ps1

.EXAMPLE
    .\reset-database.ps1 -SkipVerify
#>

param(
    [switch]$SkipVerify,
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SqlFile = Join-Path $ScriptDir "test-database.sql"

# Colors for output
function Write-Step { param($Step, $Message) Write-Host "`n[$Step/10] " -ForegroundColor Cyan -NoNewline; Write-Host $Message -ForegroundColor White }
function Write-Success { param($Message) Write-Host "  ✓ " -ForegroundColor Green -NoNewline; Write-Host $Message }
function Write-Info { param($Message) Write-Host "  → " -ForegroundColor DarkGray -NoNewline; Write-Host $Message -ForegroundColor DarkGray }
function Write-Error { param($Message) Write-Host "  ✗ " -ForegroundColor Red -NoNewline; Write-Host $Message -ForegroundColor Red }

Write-Host "`n╔════════════════════════════════════════════════════════════╗" -ForegroundColor Magenta
Write-Host "║           PostgreSQL MCP Test Database Reset               ║" -ForegroundColor Magenta
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Magenta

# Verify prerequisites
if (-not (Test-Path $SqlFile)) {
    Write-Error "test-database.sql not found at: $SqlFile"
    exit 1
}

$DB_PASSWORD = $env:POSTGRES_PASSWORD
if ([string]::IsNullOrWhiteSpace($DB_PASSWORD)) { $DB_PASSWORD = "postgres" }

# Check Docker is running and container exists
$containerCheck = (docker container inspect -f '{{.State.Running}}' postgres-server 2>&1) -join ""
if ($containerCheck -notmatch "true") {
    Write-Error "postgres-server container is not running. Start it first."
    exit 1
}
Write-Host "`nContainer: " -NoNewline; Write-Host "postgres-server" -ForegroundColor Green -NoNewline; Write-Host " is running"

# ============================================================================
# Step 1: Drop test schemas
# ============================================================================
Write-Step "1" "Dropping test schemas..."

$sql1 = @"
DO `$`$
DECLARE r RECORD;
BEGIN
    -- Drop known test schemas
    DROP SCHEMA IF EXISTS test_schema CASCADE;
    DROP SCHEMA IF EXISTS test_vector_schema CASCADE;
    -- Drop stress test schemas (stress_schema_* prefix)
    FOR r IN SELECT nspname FROM pg_namespace WHERE nspname LIKE 'stress_schema_%'
    LOOP
        EXECUTE 'DROP SCHEMA IF EXISTS ' || quote_ident(r.nspname) || ' CASCADE';
    END LOOP;
END`$`$;
"@
$result = $sql1 | docker exec -i -e PGPASSWORD=$DB_PASSWORD postgres-server psql -U postgres -d postgres 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Success "Dropped test_schema and test_vector_schema"
} else {
    Write-Error "Failed to drop schemas: $result"
}

# ============================================================================
# Step 2: Drop test views
# ============================================================================
Write-Step "2" "Dropping test views..."

$sql2 = @"
DO `$`$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT schemaname, viewname FROM pg_views
             WHERE (viewname LIKE 'test_view_%' OR viewname LIKE 'stress_view_%') AND schemaname = 'public'
    LOOP
        EXECUTE 'DROP VIEW IF EXISTS ' || quote_ident(r.schemaname) || '.' || quote_ident(r.viewname) || ' CASCADE';
    END LOOP;
    -- Also drop the seeded view
    DROP VIEW IF EXISTS test_order_summary CASCADE;
END`$`$;
"@
$result = $sql2 | docker exec -i -e PGPASSWORD=$DB_PASSWORD postgres-server psql -U postgres -d postgres 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Success "Dropped test views"
} else {
    Write-Error "Failed to drop test views: $result"
}

# ============================================================================
# Step 3: Drop test functions, triggers, and sequences
# ============================================================================
Write-Step "3" "Dropping test functions, triggers, and sequences..."

$sql3a = @"
DO `$`$
DECLARE r RECORD;
BEGIN
    -- Drop test functions
    FOR r IN SELECT routine_schema, routine_name
             FROM information_schema.routines
             WHERE routine_name LIKE 'test_func_%' OR routine_name = 'test_get_order_count'
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || quote_ident(r.routine_schema) || '.' || quote_ident(r.routine_name) || ' CASCADE';
    END LOOP;
    -- Drop test triggers
    FOR r IN SELECT trigger_name, event_object_table
             FROM information_schema.triggers
             WHERE trigger_name LIKE 'test_trig_%' AND trigger_schema = 'public'
    LOOP
        EXECUTE 'DROP TRIGGER IF EXISTS ' || quote_ident(r.trigger_name) || ' ON ' || quote_ident(r.event_object_table) || ' CASCADE';
    END LOOP;
    -- Drop test sequences (not in test_schema, which was already dropped)
    FOR r IN SELECT schemaname, sequencename FROM pg_sequences
             WHERE sequencename LIKE 'test_seq_%' AND schemaname = 'public'
    LOOP
        EXECUTE 'DROP SEQUENCE IF EXISTS ' || quote_ident(r.schemaname) || '.' || quote_ident(r.sequencename) || ' CASCADE';
    END LOOP;
END`$`$;
"@
$result = $sql3a | docker exec -i -e PGPASSWORD=$DB_PASSWORD postgres-server psql -U postgres -d postgres 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Success "Dropped test functions, triggers, and sequences"
} else {
    Write-Error "Failed to drop test functions/triggers/sequences: $result"
}

# ============================================================================
# Step 4: Drop temp_* tables
# ============================================================================
Write-Step "4" "Dropping temp_* tables..."

$sql4 = @"
DO `$`$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT schemaname, tablename FROM pg_tables
             WHERE tablename LIKE 'temp_%' AND schemaname = 'public'
    LOOP
        EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.schemaname) || '.' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;
END`$`$;
"@
$result = $sql4 | docker exec -i -e PGPASSWORD=$DB_PASSWORD postgres-server psql -U postgres -d postgres 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Success "Dropped all temp_* tables"
} else {
    Write-Error "Failed to drop temp_* tables: $result"
}

# ============================================================================
# Step 5: Clean up pg_partman configurations
# ============================================================================
Write-Step "5" "Cleaning up pg_partman configurations..."

$sql5 = @"
DO `$`$
DECLARE r RECORD;
BEGIN
    -- Delete partman configs for test_* tables (prevents orphaned configs)
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'part_config' AND schemaname IN ('public', 'partman')) THEN
        -- Clean sub-partition configs first (FK to part_config)
        IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'part_config_sub' AND schemaname IN ('public', 'partman')) THEN
            DELETE FROM public.part_config_sub WHERE sub_parent LIKE 'public.test_%';
            DELETE FROM public.part_config_sub WHERE sub_parent LIKE 'public.temp_%';
        END IF;
        DELETE FROM public.part_config WHERE parent_table LIKE 'public.test_%';
        DELETE FROM public.part_config WHERE parent_table LIKE 'public.temp_%';
    END IF;

    -- Drop template tables created by partman for test tables
    FOR r IN SELECT schemaname, tablename FROM pg_tables
             WHERE tablename LIKE 'template_public_test_%' AND schemaname = 'public'
    LOOP
        EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.schemaname) || '.' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;
END`$`$;
"@
$result = $sql5 | docker exec -i -e PGPASSWORD=$DB_PASSWORD postgres-server psql -U postgres -d postgres 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Success "Cleaned up pg_partman configurations and template tables"
} else {
    Write-Info "pg_partman cleanup skipped (extension may not be installed)"
}

# ============================================================================
# Step 6: Drop test_* tables
# ============================================================================
Write-Step "6" "Dropping test_* tables..."

$sql6 = @"
DO `$`$
DECLARE r RECORD;
BEGIN
    -- First, detach all child partitions from test_* partitioned parents
    -- This prevents "cannot drop ... because other objects depend on it" errors
    FOR r IN
        SELECT inhrelid::regclass::text AS child, inhparent::regclass::text AS parent
        FROM pg_inherits
        WHERE inhparent::regclass::text LIKE 'public.test_%'
           OR inhparent::regclass::text LIKE 'test_%'
    LOOP
        BEGIN
            EXECUTE 'ALTER TABLE ' || r.parent || ' DETACH PARTITION ' || r.child;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END LOOP;

    -- Now drop all test_* tables (parents and former children)
    FOR r IN SELECT schemaname, tablename FROM pg_tables
             WHERE tablename LIKE 'test_%' AND schemaname = 'public'
    LOOP
        EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.schemaname) || '.' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;
END`$`$;
"@
$result = $sql6 | docker exec -i -e PGPASSWORD=$DB_PASSWORD postgres-server psql -U postgres -d postgres 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Success "Dropped all test_* tables"
} else {
    Write-Error "Failed to drop test_* tables: $result"
}

# ============================================================================
# Step 7: Drop ai_test_* tables
# ============================================================================
Write-Step "7" "Dropping ai_test_* tables..."

$sql7 = @"
DO `$`$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT schemaname, tablename FROM pg_tables
             WHERE tablename LIKE 'ai_test_%' AND schemaname = 'public'
    LOOP
        EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.schemaname) || '.' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;
END`$`$;
"@
$result = $sql7 | docker exec -i -e PGPASSWORD=$DB_PASSWORD postgres-server psql -U postgres -d postgres 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Success "Dropped all ai_test_* tables"
} else {
    Write-Error "Failed to drop ai_test_* tables: $result"
}

# ============================================================================
# Step 8: Drop other accumulated artifacts
# ============================================================================
Write-Step "8" "Dropping other accumulated artifacts..."
Write-Info "partman_*, prompt_*, mcp_*, orders_*, ltree_*, fts_*, spatial_places*, jsonb_*, notebook_*, empty_*, batch_*, etc."

$sql8 = @"
DO `$`$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT schemaname, tablename FROM pg_tables
             WHERE (
                 tablename LIKE 'partman_%'
                 OR tablename LIKE 'prompt_%'
                 OR tablename LIKE 'mcp_%'
                 OR tablename LIKE 'orders_%'
                 OR tablename LIKE 'ltree_%'
                 OR tablename LIKE 'fts_%'
                 OR tablename LIKE 'spatial_places%'
                 OR tablename LIKE 'jsonb_%'
                 OR tablename LIKE 'notebook_%'
                 OR tablename IN ('categories','documents','locations','vector_docs','txn_demo')
                 OR tablename LIKE 'empty_%'
                 OR tablename LIKE 'batch_%'
                 OR tablename LIKE 'stress_%'
                 OR tablename = '_mcp_schema_versions'
             )
             AND schemaname = 'public'
             AND tablename != 'spatial_ref_sys'
    LOOP
        EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.schemaname) || '.' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;
END`$`$;
"@
$result = $sql8 | docker exec -i -e PGPASSWORD=$DB_PASSWORD postgres-server psql -U postgres -d postgres 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Success "Dropped all accumulated artifact tables"
} else {
    Write-Error "Failed to drop artifact tables: $result"
}

# ============================================================================
# Step 9: Re-seed the database
# ============================================================================
Write-Step "9" "Re-seeding the database..."

# Copy SQL file to container
$copyResult = docker cp $SqlFile postgres-server:/tmp/test-database.sql 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to copy SQL file to container: $copyResult"
    exit 1
}

# Execute the SQL file
$seedResult = docker exec -e PGPASSWORD=$DB_PASSWORD postgres-server psql -U postgres -d postgres -f /tmp/test-database.sql 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Success "Database re-seeded from test-database.sql"
    if ($Verbose) {
        Write-Info "Last 5 lines of output:"
        $seedResult | Select-Object -Last 5 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
    }
} else {
    Write-Error "Failed to seed database: $seedResult"
    exit 1
}

# ============================================================================
# Step 10: Seed resource test data
# ============================================================================
Write-Step "10" "Seeding resource test data..."

$ResourceSqlFile = Join-Path $ScriptDir "test-resources.sql"
if (Test-Path $ResourceSqlFile) {
    $copyResult = docker cp $ResourceSqlFile postgres-server:/tmp/test-resources.sql 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to copy test-resources.sql to container: $copyResult"
        exit 1
    }

    $resourceResult = docker exec -e PGPASSWORD=$DB_PASSWORD postgres-server psql -U postgres -d postgres -f /tmp/test-resources.sql 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Resource test data seeded from test-resources.sql"
        if ($Verbose) {
            Write-Info "Last 5 lines of output:"
            $resourceResult | Select-Object -Last 5 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
        }
    } else {
        Write-Info "Resource test data seeding had warnings (non-fatal): $resourceResult"
    }
} else {
    Write-Info "test-resources.sql not found at: $ResourceSqlFile (skipped)"
}

# ============================================================================
# Verification
# ============================================================================
if (-not $SkipVerify) {
    Write-Host "`n────────────────────────────────────────────────────────────" -ForegroundColor DarkGray
    Write-Host "Verification" -ForegroundColor Yellow

    # Expected table counts (combined state after test-database.sql + test-resources.sql)
    # test-resources.sql adds: +20 locations, +25 embeddings, +50 logs, +200/-~60 measurements
    $expectedTables = @{
        "test_products" = 15
        "test_orders" = 20
        "test_jsonb_docs" = 3
        "test_articles" = 3
        "test_measurements" = -1       # ~640 (depends on random deletions); verified as >= 600
        "test_embeddings" = 75
        "test_locations" = 25
        "test_users" = 3
        "test_categories" = 6
        "test_events" = 100
        "test_secure_data" = 0
        "test_logs" = 50
        "test_departments" = 3
        "test_employees" = 5
        "test_projects" = 2
        "test_assignments" = 3
        "test_audit_log" = 3
        "test_lock_target" = 1
    }

    Write-Host "`n  Table verification:" -ForegroundColor Yellow

    $allPassed = $true
    foreach ($entry in $expectedTables.GetEnumerator()) {
        $tableName = $entry.Key
        $expectedCount = $entry.Value
        $countResult = docker exec -e PGPASSWORD=$DB_PASSWORD postgres-server psql -U postgres -d postgres -t -c "SELECT COUNT(*) FROM public.$tableName;" 2>&1
        $countStr = if ($countResult -is [array]) { $countResult -join "" } else { $countResult }
        $actualCount = [int]($countStr -replace '\s','')

        if ($expectedCount -eq -1) {
            # Approximate check (random deletes make exact count unpredictable)
            if ($actualCount -ge 600) {
                Write-Host "    [pass] " -ForegroundColor Green -NoNewline
                Write-Host "$tableName" -NoNewline
                Write-Host " ($actualCount rows, >=600 expected)" -ForegroundColor Gray
            } else {
                Write-Host "    [fail] " -ForegroundColor Red -NoNewline
                Write-Host "$tableName" -NoNewline
                Write-Host " (expected >=600, got $actualCount)" -ForegroundColor Red
                $allPassed = $false
            }
        } elseif ($actualCount -eq $expectedCount) {
            Write-Host "    [pass] " -ForegroundColor Green -NoNewline
            Write-Host "$tableName" -NoNewline
            Write-Host " ($actualCount rows)" -ForegroundColor Gray
        } else {
            Write-Host "    [fail] " -ForegroundColor Red -NoNewline
            Write-Host "$tableName" -NoNewline
            Write-Host " (expected $expectedCount, got $actualCount)" -ForegroundColor Red
            $allPassed = $false
        }
    }

    if ($allPassed) {
        Write-Host "`n  ✓ " -ForegroundColor Green -NoNewline
        Write-Host "All tables verified successfully"
    } else {
        Write-Host "`n  ⚠ " -ForegroundColor Yellow -NoNewline
        Write-Host "Some tables have unexpected row counts" -ForegroundColor Yellow
    }

    # Check for unexpected non-seed tables
    Write-Host "`n  Artifact check:" -ForegroundColor Yellow
    $allTablesResult = docker exec -e PGPASSWORD=$DB_PASSWORD postgres-server psql -U postgres -d postgres -t -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;" 2>&1
    $tableLines = if ($allTablesResult -is [array]) { $allTablesResult } else { $allTablesResult -split "`n" }
    $unexpectedTables = @()
    foreach ($line in $tableLines) {
        $name = $line.Trim()
        if (-not $name) { continue }
        # Allow pg_partman extension tables (part_config, part_config_sub) — these are not droppable
        # Allow partition children of test_events and test_logs (created by seed SQL)
        if (-not $expectedTables.ContainsKey($name) `
            -and $name -ne "spatial_ref_sys" `
            -and $name -notin @("part_config", "part_config_sub") `
            -and $name -notmatch '^test_events_\d{4}_q\d$' `
            -and $name -notmatch '^test_logs_' `
            -and $name -notmatch '^template_public_test_') {
            $unexpectedTables += $name
        }
    }

    if ($unexpectedTables.Count -gt 0) {
        Write-Host "    ⚠ Found $($unexpectedTables.Count) unexpected table(s) — possible stale test artifacts:" -ForegroundColor Yellow
        foreach ($ut in $unexpectedTables) {
            Write-Host "    [stale] " -ForegroundColor Yellow -NoNewline
            Write-Host $ut -ForegroundColor Gray
        }
    } else {
        Write-Host "    ✓ " -ForegroundColor Green -NoNewline
        Write-Host "No stale test artifacts found"
    }
}

Write-Host "`n╔════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║                    Reset Complete! ✓                       ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════════════════════╝`n" -ForegroundColor Green
