#!/usr/bin/env python3
"""
Debug script to test the database setup for the security test suite
"""

import asyncio
import os
import sys

# Fix Windows event loop compatibility with psycopg3
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

# Add the src directory to the path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from postgres_mcp.sql import SqlDriver, DbConnPool


async def debug_setup():
    """Debug the test setup process"""
    
    connection_url = os.environ.get(
        "DATABASE_URL", 
        "postgresql://postgres:postgres@host.docker.internal:5432/postgres"
    )
    
    print(f"Testing connection: {connection_url}")
    
    try:
        # Initialize connection pool
        db_pool = DbConnPool(connection_url)
        await db_pool.pool_connect()
        print("Connection pool initialized")
        
        # Create test tables
        sql_driver = SqlDriver(conn=db_pool)
        
        print("Creating test tables...")
        await sql_driver.execute_query("""
            DROP TABLE IF EXISTS test_users CASCADE;
            CREATE TABLE test_users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) NOT NULL,
                email VARCHAR(100),
                password_hash VARCHAR(255),
                is_admin BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """, force_readonly=False)
        print("test_users table created")
        
        # Insert test data
        await sql_driver.execute_query("""
            INSERT INTO test_users (username, email, password_hash, is_admin) VALUES
            ('admin', 'admin@test.com', 'hash123', TRUE),
            ('user1', 'user1@test.com', 'hash456', FALSE),
            ('user2', 'user2@test.com', 'hash789', FALSE),
            ('test_user', 'test@example.com', 'testhash', FALSE);
        """, force_readonly=False)
        print("Test data inserted")
        
        # Verify with readonly query
        result = await sql_driver.execute_query("SELECT COUNT(*) FROM test_users", force_readonly=True)
        if result and len(result) > 0:
            user_count = list(result[0].cells.values())[0]
            print(f"Verification successful: {user_count} users found")
        else:
            print("Verification failed: No results")
            
        # Test a simple injection query
        print("\nTesting simple query...")
        test_query = "SELECT * FROM test_users WHERE id = '1'"
        result = await sql_driver.execute_query(test_query, force_readonly=True)
        if result:
            print(f"Simple query successful: {len(result)} rows returned")
            for row in result:
                print(f"   Row: {dict(row.cells)}")
        else:
            print("Simple query failed")
            
        # Test an injection query
        print("\nTesting injection query...")
        injection_query = "SELECT * FROM test_users WHERE id = '1' UNION SELECT 999, 'hacker', 'hacker@evil.com', 'hash', TRUE, NOW()--'"
        try:
            result = await sql_driver.execute_query(injection_query, force_readonly=False)
            if result:
                print(f"Injection successful: {len(result)} rows returned")
                for row in result:
                    print(f"   Row: {dict(row.cells)}")
            else:
                print("Injection blocked: No results")
        except Exception as e:
            print(f"Injection blocked by error: {e}")
        
    except Exception as e:
        print(f"Setup failed: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(debug_setup())
