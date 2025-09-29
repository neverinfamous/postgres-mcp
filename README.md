# PostgreSQL MCP Server

*Last Updated: September 29, 2025*

*Enterprise-grade PostgreSQL MCP server with enhanced security, comprehensive testing, and AI-native database operations*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Security](https://img.shields.io/badge/Security-Enhanced-green.svg)](SECURITY.md)
[![CodeQL](https://img.shields.io/badge/CodeQL-Passing-brightgreen.svg)](https://github.com/neverinfamous/postgres-mcp/security/code-scanning)

Transform PostgreSQL into a powerful, AI-ready database engine with **9 specialized tools** for advanced analytics, health monitoring, index optimization, and secure query execution.

---

## 🚀 **Quick Start**

### **Option 1: Docker (Recommended)**
```bash
# Pull and run instantly
docker pull neverinfamous/postgres-mcp:latest

docker run -i --rm \
  -e DATABASE_URI="postgresql://username:password@localhost:5432/dbname" \
  neverinfamous/postgres-mcp:latest \
  --access-mode=restricted
```

### **Option 2: Python Installation**
```bash
# Install from PyPI
pip install postgres-mcp

# Run the server
postgres-mcp --access-mode=restricted
```

### **Option 3: Test in 30 Seconds**
```bash
git clone https://github.com/neverinfamous/postgres-mcp.git
cd postgres-mcp
uv sync
uv run pytest -v
```

---

## 🛡️ **Security-First Design**

### **✅ Enhanced Security Features**

This PostgreSQL MCP server has been **comprehensively security-audited** and enhanced with enterprise-grade protections:

- **🔒 SQL Injection Prevention** - Parameter binding with automatic sanitization
- **🛡️ Comprehensive Security Testing** - 20+ test cases covering all attack vectors
- **⚙️ Dual Security Modes** - Restricted (production) and unrestricted (development)
- **🔍 Query Validation** - Advanced SQL parsing and validation in restricted mode
- **📊 Security Monitoring** - Built-in logging and audit capabilities
- **🚨 Zero Known Vulnerabilities** - All CodeQL security issues resolved

### **🔧 Security Fix Highlights**

**Critical SQL Injection Vulnerability Fixed** (September 2025):
- **Issue**: Direct SQL string execution without parameter binding
- **Impact**: Complete database compromise in unrestricted mode
- **Fix**: Added comprehensive parameter binding with backward compatibility
- **Testing**: 20+ security test cases validate protection against all attack vectors
- **Status**: ✅ **RESOLVED** - Zero security vulnerabilities remaining

### **🎯 Security Modes**

**Restricted Mode (Recommended for Production):**
- ✅ Read-only operations only
- ✅ Advanced SQL parsing and validation
- ✅ Query timeout protection
- ✅ Resource usage limits
- ✅ Comprehensive audit logging

**Unrestricted Mode (Development Only):**
- ⚠️ Full read/write access
- ✅ Parameter binding protection
- ✅ Security monitoring
- ⚠️ Use only in trusted environments

---

## 🏢 **Enterprise Features**

### **🔍 Database Health Monitoring**
- **Index Health** - Detect unused, duplicate, and bloated indexes
- **Connection Health** - Monitor connection utilization and limits
- **Vacuum Health** - Prevent transaction ID wraparound issues
- **Buffer Cache** - Analyze cache hit rates and performance
- **Replication Health** - Monitor lag and replication status
- **Constraint Validation** - Detect invalid constraints

### **⚡ Performance Optimization**
- **Intelligent Index Tuning** - AI-powered index recommendations
- **Query Plan Analysis** - EXPLAIN plans with hypothetical indexes
- **Workload Analysis** - Identify resource-intensive queries
- **Cost-Benefit Analysis** - Optimize performance vs. storage trade-offs

### **🧠 AI-Native Operations**
- **Schema Intelligence** - Context-aware SQL generation
- **Query Optimization** - Automated performance improvements
- **Predictive Analysis** - Simulate performance improvements
- **Natural Language Interface** - Human-friendly database interactions

---

## 📊 **MCP Tools**

The PostgreSQL MCP Server provides **9 specialized tools**:

| Tool | Description | Security Level |
|------|-------------|----------------|
| `list_schemas` | List all database schemas | 🟢 Safe |
| `list_objects` | List tables, views, sequences, extensions | 🟢 Safe |
| `get_object_details` | Detailed object information and schema | 🟢 Safe |
| `execute_sql` | **Secure SQL execution with parameter binding** | 🛡️ **Enhanced** |
| `explain_query` | Query execution plans and optimization | 🟢 Safe |
| `get_top_queries` | Performance analysis of slow queries | 🟢 Safe |
| `analyze_workload_indexes` | Workload-based index recommendations | 🟢 Safe |
| `analyze_query_indexes` | Query-specific index optimization | 🟢 Safe |
| `analyze_db_health` | Comprehensive database health checks | 🟢 Safe |

---

## 🎨 **Usage Examples**


### Configure Your AI Assistant

We provide full instructions for configuring Postgres MCP Pro with Claude Desktop.
Many MCP clients have similar configuration files, you can adapt these steps to work with the client of your choice.

#### Claude Desktop Configuration

You will need to edit the Claude Desktop configuration file to add Postgres MCP Pro.
The location of this file depends on your operating system:
- MacOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%/Claude/claude_desktop_config.json`

You can also use `Settings` menu item in Claude Desktop to locate the configuration file.

You will now edit the `mcpServers` section of the configuration file.

##### If you are using Docker

```json
{
  "mcpServers": {
    "postgres": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "DATABASE_URI",
        "crystaldba/postgres-mcp",
        "--access-mode=unrestricted"
      ],
      "env": {
        "DATABASE_URI": "postgresql://username:password@localhost:5432/dbname"
      }
    }
  }
}
```

The Postgres MCP Pro Docker image will automatically remap the hostname `localhost` to work from inside of the container.

- MacOS/Windows: Uses `host.docker.internal` automatically
- Linux: Uses `172.17.0.1` or the appropriate host address automatically


##### If you are using `pipx`

```json
{
  "mcpServers": {
    "postgres": {
      "command": "postgres-mcp",
      "args": [
        "--access-mode=unrestricted"
      ],
      "env": {
        "DATABASE_URI": "postgresql://username:password@localhost:5432/dbname"
      }
    }
  }
}
```


##### If you are using `uv`

```json
{
  "mcpServers": {
    "postgres": {
      "command": "uv",
      "args": [
        "run",
        "postgres-mcp",
        "--access-mode=unrestricted"
      ],
      "env": {
        "DATABASE_URI": "postgresql://username:password@localhost:5432/dbname"
      }
    }
  }
}
```


##### Connection URI

Replace `postgresql://...` with your [Postgres database connection URI](https://www.postgresql.org/docs/current/libpq-connect.html#LIBPQ-CONNSTRING-URIS).


##### Access Mode

Postgres MCP Pro supports multiple *access modes* to give you control over the operations that the AI agent can perform on the database:
- **Unrestricted Mode**: Allows full read/write access to modify data and schema. It is suitable for development environments.
- **Restricted Mode**: Limits operations to read-only transactions and imposes constraints on resource utilization (presently only execution time). It is suitable for production environments.

To use restricted mode, replace `--access-mode=unrestricted` with `--access-mode=restricted` in the configuration examples above.


#### Other MCP Clients

Many MCP clients have similar configuration files to Claude Desktop, and you can adapt the examples above to work with the client of your choice.

- If you are using Cursor, you can use navigate from the `Command Palette` to `Cursor Settings`, then open the `MCP` tab to access the configuration file.
- If you are using Windsurf, you can navigate to from the `Command Palette` to `Open Windsurf Settings Page` to access the configuration file.
- If you are using Goose run `goose configure`, then select `Add Extension`.

## SSE Transport

Postgres MCP Pro supports the [SSE transport](https://modelcontextprotocol.io/docs/concepts/transports#server-sent-events-sse), which allows multiple MCP clients to share one server, possibly a remote server.
To use the SSE transport, you need to start the server with the `--transport=sse` option.

For example, with Docker run:

```bash
docker run -p 8000:8000 \
  -e DATABASE_URI=postgresql://username:password@localhost:5432/dbname \
  crystaldba/postgres-mcp --access-mode=unrestricted --transport=sse
```

Then update your MCP client configuration to call the the MCP server.
For example, in Cursor's `mcp.json` or Cline's `cline_mcp_settings.json` you can put:

```json
{
    "mcpServers": {
        "postgres": {
            "type": "sse",
            "url": "http://localhost:8000/sse"
        }
    }
}
```

For Windsurf, the format in `mcp_config.json` is slightly different:

```json
{
    "mcpServers": {
        "postgres": {
            "type": "sse",
            "serverUrl": "http://localhost:8000/sse"
        }
    }
}
```

## Postgres Extension Installation (Optional)

To enable index tuning and comprehensive performance analysis you need to load the `pg_statements` and `hypopg` extensions on your database.

- The `pg_statements` extension allows Postgres MCP Pro to analyze query execution statistics.
For example, this allows it to understand which queries are running slow or consuming significant resources.
- The `hypopg` extension allows Postgres MCP Pro to simulate the behavior of the Postgres query planner after adding indexes.

### Installing extensions on AWS RDS, Azure SQL, or Google Cloud SQL

If your Postgres database is running on a cloud provider managed service, the `pg_statements` and `hypopg` extensions should already be available on the system.
In this case, you can just run `CREATE EXTENSION` commands using a role with sufficient privileges:

```sql
CREATE EXTENSION IF NOT EXISTS pg_statements;
CREATE EXTENSION IF NOT EXISTS hypopg;
```

### Installing extensions on self-managed Postgres

If you are managing your own Postgres installation, you may need to do additional work.
Before loading the `pg_statements` extension you must ensure that it is listed in the `shared_preload_libraries` in the Postgres configuration file.
The `hypopg` extension may also require additional system-level installation (e.g., via your package manager) because it does not always ship with Postgres.

## Usage Examples

### Get Database Health Overview

Ask:
> Check the health of my database and identify any issues.

### Analyze Slow Queries

Ask:
> What are the slowest queries in my database? And how can I speed them up?

### Get Recommendations On How To Speed Things Up

Ask:
> My app is slow. How can I make it faster?

### Generate Index Recommendations

Ask:
> Analyze my database workload and suggest indexes to improve performance.

### Optimize a Specific Query

Ask:
> Help me optimize this query: SELECT \* FROM orders JOIN customers ON orders.customer_id = customers.id WHERE orders.created_at > '2023-01-01';

## MCP Server API

The [MCP standard](https://modelcontextprotocol.io/) defines various types of endpoints: Tools, Resources, Prompts, and others.

Postgres MCP Pro provides functionality via [MCP tools](https://modelcontextprotocol.io/docs/concepts/tools) alone.
We chose this approach because the [MCP client ecosystem](https://modelcontextprotocol.io/clients) has widespread support for MCP tools.
This contrasts with the approach of other Postgres MCP servers, including the [Reference Postgres MCP Server](https://github.com/modelcontextprotocol/servers/tree/main/src/postgres), which use [MCP resources](https://modelcontextprotocol.io/docs/concepts/resources) to expose schema information.


Postgres MCP Pro Tools:

| Tool Name | Description |
|-----------|-------------|
| `list_schemas` | Lists all database schemas available in the PostgreSQL instance. |
| `list_objects` | Lists database objects (tables, views, sequences, extensions) within a specified schema. |
| `get_object_details` | Provides information about a specific database object, for example, a table's columns, constraints, and indexes. |
| `execute_sql` | Executes SQL statements on the database, with read-only limitations when connected in restricted mode. |
| `explain_query` | Gets the execution plan for a SQL query describing how PostgreSQL will process it and exposing the query planner's cost model. Can be invoked with hypothetical indexes to simulate the behavior after adding indexes. |
| `get_top_queries` | Reports the slowest SQL queries based on total execution time using `pg_stat_statements` data. |
| `analyze_workload_indexes` | Analyzes the database workload to identify resource-intensive queries, then recommends optimal indexes for them. |
| `analyze_query_indexes` | Analyzes a list of specific SQL queries (up to 10) and recommends optimal indexes for them. |
| `analyze_db_health` | Performs comprehensive health checks including: buffer cache hit rates, connection health, constraint validation, index health (duplicate/unused/invalid), sequence limits, and vacuum health. |


## Related Projects

**Postgres MCP Servers**
- [Query MCP](https://github.com/alexander-zuev/supabase-mcp-server). An MCP server for Supabase Postgres with a three-tier safety architecture and Supabase management API support.
- [PG-MCP](https://github.com/stuzero/pg-mcp-server). An MCP server for PostgreSQL with flexible connection options, explain plans, extension context, and more.
- [Reference PostgreSQL MCP Server](https://github.com/modelcontextprotocol/servers/tree/main/src/postgres). A simple MCP Server implementation exposing schema information as MCP resources and executing read-only queries.
- [Supabase Postgres MCP Server](https://github.com/supabase-community/supabase-mcp). This MCP Server provides Supabase management features and is actively maintained by the Supabase community.
- [Nile MCP Server](https://github.com/niledatabase/nile-mcp-server). An MCP server providing access to the management API for the Nile's multi-tenant Postgres service.
- [Neon MCP Server](https://github.com/neondatabase-labs/mcp-server-neon). An MCP server providing access to the management API for Neon's serverless Postgres service.
- [Wren MCP Server](https://github.com/Canner/wren-engine). Provides a semantic engine powering business intelligence for Postgres and other databases.

**DBA Tools (including commercial offerings)**
- [Aiven Database Optimizer](https://aiven.io/solutions/aiven-ai-database-optimizer). A tool that provides holistic database workload analysis, query optimizations, and other performance improvements.
- [dba.ai](https://www.dba.ai/). An AI-powered database administration assistant that integrates with GitHub to resolve code issues.
- [pgAnalyze](https://pganalyze.com/). A comprehensive monitoring and analytics platform for identifying performance bottlenecks, optimizing queries, and real-time alerting.
- [Postgres.ai](https://postgres.ai/). An interactive chat experience combining an extensive Postgres knowledge base and GPT-4.
- [Xata Agent](https://github.com/xataio/agent). An open-source AI agent that automatically monitors database health, diagnoses issues, and provides recommendations using LLM-powered reasoning and playbooks.

**Postgres Utilities**
- [Dexter](https://github.com/DexterDB/dexter). A tool for generating and testing hypothetical indexes on PostgreSQL.
- [PgHero](https://github.com/ankane/pghero). A performance dashboard for Postgres, with recommendations.
Postgres MCP Pro incorporates health checks from PgHero.
- [PgTune](https://github.com/le0pard/pgtune?tab=readme-ov-file). Heuristics for tuning Postgres configuration.

## Frequently Asked Questions

*How is Postgres MCP Pro different from other Postgres MCP servers?*
There are many MCP servers allow an AI agent to run queries against a Postgres database.
Postgres MCP Pro does that too, but also adds tools for understanding and improving the performance of your Postgres database.
For example, it implements a version of the [Anytime Algorithm of Database Tuning Advisor for Microsoft SQL Server](https://www.microsoft.com/en-us/research/wp-content/uploads/2020/06/Anytime-Algorithm-of-Database-Tuning-Advisor-for-Microsoft-SQL-Server.pdf), a modern industrial-strength algorithm for automatic index tuning.

| Postgres MCP Pro | Other Postgres MCP Servers |
|--------------|----------------------------|
| ✅ Deterministic database health checks | ❌ Unrepeatable LLM-generated health queries |
| ✅ Principled indexing search strategies | ❌ Gen-AI guesses at indexing improvements |
| ✅ Workload analysis to find top problems | ❌ Inconsistent problem analysis |
| ✅ Simulates performance improvements | ❌ Try it yourself and see if it works |

Postgres MCP Pro complements generative AI by adding deterministic tools and classical optimization algorithms
The combination is both reliable and flexible.


*Why are MCP tools needed when the LLM can reason, generate SQL, etc?*
LLMs are invaluable for tasks that involve ambiguity, reasoning, or natural language.
When compared to procedural code, however, they can be slow, expensive, non-deterministic, and sometimes produce unreliable results.
In the case of database tuning, we have well established algorithms, developed over decades, that are proven to work.
Postgres MCP Pro lets you combine the best of both worlds by pairing LLMs with classical optimization algorithms and other procedural tools.

*How do you test Postgres MCP Pro?*
Testing is critical to ensuring that Postgres MCP Pro is reliable and accurate.
We are building out a suite of AI-generated adversarial workloads designed to challenge Postgres MCP Pro and ensure it performs under a broad variety of scenarios.

*What Postgres versions are supported?*
Our testing presently focuses on Postgres 15, 16, and 17.
We plan to support Postgres versions 13 through 17.

*Who created this project?*
This project is created and maintained by [Crystal DBA](https://www.crystaldba.ai).

## Roadmap

*TBD*

You and your needs are a critical driver for what we build.
Tell us what you want to see by opening an [issue](https://github.com/crystaldba/postgres-mcp/issues) or a [pull request](https://github.com/crystaldba/postgres-mcp/pulls).
You can also contact us on [Discord](https://discord.gg/4BEHC7ZM).

## Technical Notes

This section includes a high-level overview technical considerations that influenced the design of Postgres MCP Pro.

### Index Tuning

Developers know that missing indexes are one of the most common causes of database performance issues.
Indexes provide access methods that allow Postgres to quickly locate data that is required to execute a query.
When tables are small, indexes make little difference, but as the size of the data grows, the difference in algorithmic complexity between a table scan and an index lookup becomes significant (typically *O*(*n*) vs *O*(*log* *n*), potentially more if joins on multiple tables are involved).

Generating suggested indexes in Postgres MCP Pro proceeds in several stages:

1. *Identify SQL queries in need of tuning*.
    If you know you are having a problem with a specific SQL query you can provide it.
    Postgres MCP Pro can also analyze the workload to identify index tuning targets.
    To do this, it relies on the `pg_stat_statements` extension, which records the runtime and resource consumption of each query.

    A query is a candidate for index tuning if it is a top resource consumer, either on a per-execution basis or in aggregate.
    At present, we use execution time as a proxy for cumulative resource consumption, but it may also make sense to look at specifics resources, e.g., the number of blocks accessed or the number of blocks read from disk.
    The `analyze_query_workload` tool focuses on slow queries, using the mean time per execution with thresholds for execution count and mean execution time.
    Agents may also call `get_top_queries`, which accepts a parameter for mean vs. total execution time, then pass these queries `analyze_query_indexes` to get index recommendations.

    Sophisticated index tuning systems use "workload compression" to produce a representative subset of queries that reflects the characteristics of the workload as a whole, reducing the problem for downstream algorithms.
    Postgres MCP Pro performs a limited form of workload compression by normalizing queries so that those generated from the same template appear as one.
    It weights each query equally, a simplification that works when the benefits to indexing are large.

2. *Generate candidate indexes*
    Once we have a list of SQL queries that we want to improve through indexing, we generate a list of indexes that we might want to add.
    To do this, we parse the SQL and identify any columns used in filters, joins, grouping, or sorting.

    To generate all possible indexes we need to consider combinations of these columns, because Postgres supports [multicolumn indexes](https://www.postgresql.org/docs/current/indexes-multicolumn.html).
    In the present implementation, we include only one permutation of each possible multicolumn index, which is selected at random.
    We make this simplification to reduce the search space because permutations often have equivalent performance.
    However, we hope to improve in this area.

3. *Search for the optimal index configuration*.
    Our objective is to find the combination of indexes that optimally balances the performance benefits against the costs of storing and maintaining those indexes.
    We estimate the performance improvement by using the "what if?" capabilities provided by the `hypopg` extension.
    This simulates how the Postgres query optimizer will execute a query after the addition of indexes, and reports changes based on the actual Postgres cost model.

    One challenge is that generating query plans generally requires knowledge of the specific parameter values used in the query.
    Query normalization, which is necessary to reduce the queries under consideration, removes parameter constants.
    Parameter values provided via bind variables are similarly not available to us.

    To address this problem, we produce realistic constants that we can provide as parameters by sampling from the table statistics.
    In version 16, Postgres added [generic explain plan functionality](https://www.postgresql.org/docs/current/sql-explain.html), but it has limitations, for example around `LIKE` clauses, which our implementation does not have.

    Search strategy is critical because evaluating all possible index combinations feasible only in simple situations.
    This is what most sets apart various indexing approaches.
    Adapting the approach of Microsoft's Anytime algorithm, we employ a greedy search strategy, i.e., find the best one-index solution, then find the best index to add to that to produce a two-index solution.
    Our search terminates when the time budget is exhausted or when a round of exploration fails to produce any gains above the minimum improvement threshold of 10%.

4. *Cost-benefit analysis*.
    When posed with two indexing alternatives, one which produces better performance and one which requires more space, how do we decide which to choose?
    Traditionally, index advisors ask for a storage budget and optimize performance with respect to that storage budget.
    We also take a storage budget, but perform a cost-benefit analysis throughout the optimization.

    We frame this as the problem of selecting a point along the [Pareto front](https://en.wikipedia.org/wiki/Pareto_front)—the set of choices for which improving one quality metric necessarily worsens another.
    In an ideal world, we might want to assess the cost of the storage and the benefit of improved performance in monetary terms.
    However, there is a simpler and more practical approach: to look at the changes in relative terms.
    Most people would agree that a 100x performance improvement is worth it, even if the storage cost is 2x.
    In our implementation, we use a configurable parameter to set this threshold.
    By default, we require the change in the log (base 10) of the performance improvement to be 2x the difference in the log of the space cost.
    This works out to allowing a maximum 10x increase in space for a 100x performance improvement.

Our implementation is most closely related to the [Anytime Algorithm](https://www.microsoft.com/en-us/research/wp-content/uploads/2020/06/Anytime-Algorithm-of-Database-Tuning-Advisor-for-Microsoft-SQL-Server.pdf) found in Microsoft SQL Server.
Compared to [Dexter](https://github.com/ankane/dexter/), an automatic indexing tool for Postgres, we search a larger space and use different heuristics.
This allows us to generate better solutions at the cost of longer runtime.

We also show the work done in each round of the search, including a comparison of the query plans before and after the addition of each index.
This give the LLM additional context that it can use when responding to the indexing recommendations.

### Experimental: Index Tuning by LLM

Postgres MCP Pro includes an experimental index tuning feature based on [Optimization by LLM](https://arxiv.org/abs/2309.03409).
Instead of using heuristics to explore possible index configurations, we provide the database schema and query plans to an LLM and ask it to propose index configurations.
We then use `hypopg` to predict performance with the proposed indexes, then feed those results back into the LLM to produce a new set of suggestions.
We repeat this process until multiple rounds of iteration produce no further improvements.

Index optimization by LLM is has advantages when the index search space is large, or when indexes with many columns need to be considered.
Like traditional search-based approaches, it relies on the accuracy of the `hypopg` performance predictions.

In order to perform index optimization by LLM, you must provide an OpenAI API key by setting the `OPENAI_API_KEY` environment variable.


### Database Health

Database health checks identify tuning opportunities and maintenance needs before they lead to critical issues.
In the present release, Postgres MCP Pro adapts the database health checks directly from [PgHero](https://github.com/ankane/pghero).
We are working to fully validate these checks and may extend them in the future.

- *Index Health*. Looks for unused indexes, duplicate indexes, and indexes that are bloated. Bloated indexes make inefficient use of database pages.
  Postgres autovacuum cleans up index entries pointing to dead tuples, and marks the entries as reusable. However, it does not compact the index pages and, eventually, index pages may contain few live tuple references.
- *Buffer Cache Hit Rate*. Measures the proportion of database reads that are served from the buffer cache instead of disk.
  A low buffer cache hit rate must be investigated as it is often not cost-optimal and leads to degraded application performance.
- *Connection Health*. Checks the number of connections to the database and reports on their utilization.
  The biggest risk is running out of connections, but a high number of idle or blocked connections can also indicate issues.
- *Vacuum Health*. Vacuum is important for many reasons.
  A critical one is preventing transaction id wraparound, which can cause the database to stop accepting writes.
  The Postgres multi-version concurrency control (MVCC) mechanism requires a unique transaction id for each transaction.
  However, because Postgres uses a 32-bit signed integer for transaction ids, it needs to reuse transaction ids after after a maximum of 2 billion transactions.
  To do this it "freezes" the transaction ids of historical transactions, setting them all to a special value that indicates distant past.
  When records first go to disk, they are written visibility for a range of transaction ids.
  Before re-using these transaction ids, Postgres must update any on-disk records, "freezing" them to remove the references to the transaction ids to be reused.
  This check looks for tables that require vacuuming to prevent transaction id wraparound.
- *Replication Health*. Checks replication health by monitoring lag between primary and replicas, verifying replication status, and tracking usage of replication slots.
- *Constraint Health*. During normal operation, Postgres rejects any transactions that would cause a constraint violation.
  However, invalid constraints may occur after loading data or in recovery scenarios. This check looks for any invalid constraints.
- *Sequence Health*. Looks for sequences that are at risk of exceeding their maximum value.


### Postgres Client Library

Postgres MCP Pro uses [psycopg3](https://www.psycopg.org/) to connect to Postgres using asynchronous I/O.
Under the hood, psycopg3 uses the [libpq](https://www.postgresql.org/docs/current/libpq.html) library to connect to Postgres, providing access to the full Postgres feature set and an underlying implementation fully supported by the Postgres community.

Some other Python-based MCP servers use [asyncpg](https://github.com/MagicStack/asyncpg), which may simplify installation by eliminating the `libpq` dependency.
Asyncpg is also probably [faster](https://fernandoarteaga.dev/blog/psycopg-vs-asyncpg/) than psycopg3, but we have not validated this ourselves.
[Older benchmarks](https://gistpreview.github.io/?0ed296e93523831ea0918d42dd1258c2) report a larger performance gap, suggesting that the newer psycopg3 has closed the gap as it matures.

Balancing these considerations, we selected `psycopg3` over `asyncpg`.
We remain open to revising this decision in the future.


### Connection Configuration

Like the [Reference PostgreSQL MCP Server](https://github.com/modelcontextprotocol/servers/tree/main/src/postgres), Postgres MCP Pro takes Postgres connection information at startup.
This is convenient for users who always connect to the same database but can be cumbersome when users switch databases.

An alternative approach, taken by [PG-MCP](https://github.com/stuzero/pg-mcp-server), is provide connection details via MCP tool calls at the time of use.
This is more convenient for users who switch databases, and allows a single MCP server to simultaneously support multiple end-users.

There must be a better approach than either of these.
Both have security weaknesses—few MCP clients store the MCP server configuration securely (an exception is Goose), and credentials provided via MCP tools are passed through the LLM and stored in the chat history.
Both also have usability issues in some scenarios.


### Schema Information

The purpose of the schema information tool is to provide the calling AI agent with the information it needs to generate correct and performant SQL.
For example, suppose a user asks, "How many flights took off from San Francisco and landed in Paris during the past year?"
The AI agent needs to find the table that stores the flights, the columns that store the origin and destinations, and perhaps a table that maps between airport codes and airport locations.


*Why provide schema information tools when LLMs are generally capable of generating the SQL to retrieve this information from Postgres directly?*

Our experience using Claude indicates that the calling LLM is very good at generating SQL to explore the Postgres schema by querying the [Postgres system catalog](https://www.postgresql.org/docs/current/catalogs.html) and the [information schema](https://www.postgresql.org/docs/current/information-schema.html) (an ANSI-standardized database metadata view).
However, we do not know whether other LLMs do so as reliably and capably.

*Would it be better to provide schema information using [MCP resources](https://modelcontextprotocol.io/docs/concepts/resources) rather than [MCP tools](https://modelcontextprotocol.io/docs/concepts/tools)?*

The [Reference PostgreSQL MCP Server](https://github.com/modelcontextprotocol/servers/tree/main/src/postgres) uses resources to expose schema information rather than tools.
Navigating resources is similar to navigating a file system, so this approach is natural in many ways.
However, resource support is less widespread than tool support in the MCP client ecosystem (see [example clients](https://modelcontextprotocol.io/clients)).
In addition, while the MCP standard says that resources can be accessed by either AI agents or end-user humans, some clients only support human navigation of the resource tree.


### Protected SQL Execution

AI amplifies longstanding challenges of protecting databases from a range of threats, ranging from simple mistakes to sophisticated attacks by malicious actors.
Whether the threat is accidental or malicious, a similar security framework applies, with aims that fall into three categories: confidentiality, integrity, and availability.
The familiar tension between convenience and safety is also evident and pronounced.

Postgres MCP Pro's protected SQL execution mode focuses on integrity.
In the context of MCP, we are most concerned with LLM-generated SQL causing damage—for example, unintended data modification or deletion, or other changes that might circumvent an organization's change management process.

The simplest way to provide integrity is to ensure that all SQL executed against the database is read-only.
One way to do this is by creating a database user with read-only access permissions.
While this is a good approach, many find this cumbersome in practice.
Postgres does not provide a way to place a connection or session into read-only mode, so Postgres MCP Pro uses a more complex approach to ensure read-only SQL execution on top of a read-write connection.

Postgres MCP Provides a read-only transaction mode that prevents data and schema modifications.
Like the [Reference PostgreSQL MCP Server](https://github.com/modelcontextprotocol/servers/tree/main/src/postgres), we use read-only transactions to provide protected SQL execution.

To make this mechanism robust, we need to ensure that the SQL does not somehow circumvent the read-only transaction mode, say by issuing a `COMMIT` or `ROLLBACK` statement and then beginning a new transaction.

For example, the LLM can circumvent the read-only transaction mode by issuing a `ROLLBACK` statement and then beginning a new transaction.
For example:
```sql
ROLLBACK; DROP TABLE users;
```

To prevent cases like this, we parse the SQL before execution using the [pglast](https://pglast.readthedocs.io/) library.
We reject any SQL that contains `commit` or `rollback` statements.
Helpfully, the popular Postgres stored procedure languages, including PL/pgSQL and PL/Python, do not allow for `COMMIT` or `ROLLBACK` statements.
If you have unsafe stored procedure languages enabled on your database, then our read-only protections could be circumvented.

At present, Postgres MCP Pro provides two levels of protection for the database, one at either extreme of the convenience/safety spectrum.
- "Unrestricted" provides maximum flexibility.
It is suitable for development environments where speed and flexibility are paramount, and where there is no need to protect valuable or sensitive data.
- "Restricted" provides a balance between flexibility and safety.
It is suitable for production environments where the database is exposed to untrusted users, and where it is important to protect valuable or sensitive data.

Unrestricted mode aligns with the approach of [Cursor's auto-run mode](https://docs.cursor.com/chat/tools#auto-run), where the AI agent operates with limited human oversight or approvals.
We expect auto-run to be deployed in development environments where the consequences of mistakes are low, where databases do not contain valuable or sensitive data, and where they can be recreated or restored from backups when needed.

We designed restricted mode to be conservative, erring on the side of safety even though it may be inconvenient.
Restricted mode is limited to read-only operations, and we limit query execution time to prevent long-running queries from impacting system performance.
We may add measures in the future to make sure that restricted mode is safe to use with production databases.


## Postgres MCP Pro Development

The instructions below are for developers who want to work on Postgres MCP Pro, or users who prefer to install Postgres MCP Pro from source.

### Local Development Setup

1. **Install uv**:

   ```bash
   curl -sSL https://astral.sh/uv/install.sh | sh
   ```

2. **Clone the repository**:

   ```bash
   git clone https://github.com/crystaldba/postgres-mcp.git
   cd postgres-mcp
   ```

3. **Install dependencies**:

   ```bash
   uv pip install -e .
   uv sync
   ```

4. **Run the server**:
   ```bash
   uv run postgres-mcp "postgres://user:password@localhost:5432/dbname"
   ```
