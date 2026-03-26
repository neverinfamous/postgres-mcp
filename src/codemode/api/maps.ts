/**
 * postgres-mcp - Code Mode API Data Maps
 *
 * Pure data declarations for method aliases, usage examples,
 * positional parameter mappings, and argument wrapping rules.
 */

/**
 * Method aliases for code mode API.
 * Maps alternate method names to their canonical method names.
 * Format: { groupName: { aliasName: canonicalName } }
 *
 * These aliases handle common naming misguesses where agents
 * might try the redundant prefix pattern (e.g., jsonbExtract vs extract).
 */
export const METHOD_ALIASES: Record<string, Record<string, string>> = {
  // JSONB: pg_jsonb_extract → extract, but agent might try jsonbExtract
  jsonb: {
    jsonbExtract: "extract",
    jsonbSet: "set",
    jsonbInsert: "insert",
    jsonbDelete: "delete",
    jsonbContains: "contains",
    jsonbPathQuery: "pathQuery",
    jsonbAgg: "agg",
    jsonbObject: "object",
    jsonbArray: "array",
    jsonbKeys: "keys",
    jsonbStripNulls: "stripNulls",
    jsonbTypeof: "typeof",
    jsonbValidatePath: "validatePath",
    jsonbMerge: "merge",
    jsonbNormalize: "normalize",
    jsonbDiff: "diff",
    jsonbIndexSuggest: "indexSuggest",
    jsonbSecurityScan: "securityScan",
    jsonbStats: "stats",
    jsonbPretty: "pretty",
    format: "pretty", // pg.jsonb.format() → pretty()
  },
  // Text: pg_text_search → textSearch, but also search
  text: {
    textSearch: "search",
    textRank: "rank",
    textHeadline: "headline",
    textNormalize: "normalize",
    textSentiment: "sentiment",
    textToVector: "toVector",
    textToQuery: "toQuery",
    textSearchConfig: "searchConfig",
    // Intuitive aliases for common methods
    similar: "trigramSimilarity", // pg.text.similar() → trigramSimilarity()
    trigram: "trigramSimilarity", // pg.text.trigram() → trigramSimilarity()
    similarity: "trigramSimilarity", // pg.text.similarity() → trigramSimilarity()
    fuzzy: "fuzzyMatch", // pg.text.fuzzy() → fuzzyMatch()
    like: "likeSearch", // pg.text.like() → likeSearch()
    regex: "regexpMatch", // pg.text.regex() → regexpMatch()
    regexp: "regexpMatch", // pg.text.regexp() → regexpMatch()
    unaccent: "normalize", // pg.text.unaccent() → normalize()
    highlight: "headline", // pg.text.highlight() → headline()
    patternMatch: "regexpMatch", // pg.text.patternMatch() → regexpMatch()
    configs: "searchConfig", // pg.text.configs() → searchConfig()
    searchConfigs: "searchConfig", // pg.text.searchConfigs() → searchConfig()
    createIndex: "createFtsIndex", // pg.text.createIndex() → createFtsIndex()
  },
  // Vector: pg_vector_search → search, but agent might try vectorSearch
  vector: {
    vectorSearch: "search",
    vectorAggregate: "aggregate",
    vectorCreateIndex: "createIndex",
    vectorCluster: "cluster",
    vectorIndexOptimize: "indexOptimize",
    vectorPerformance: "performance",
    vectorDimensionReduce: "dimensionReduce",
    vectorEmbed: "embed",
    vectorNormalize: "normalize",
    vectorQuantize: "quantize",
    vectorList: "list",
  },
  // PostGIS
  postgis: {
    // pg.postgis.indexOptimize() -> geoIndexOptimize (from pg_geo_index_optimize)
    indexOptimize: "geoIndexOptimize",
    // pg.postgis.addColumn() -> geometryColumn (from pg_geometry_column)
    addColumn: "geometryColumn",
  },
  // Performance: naming aliases for common queries
  performance: {
    // User education aliases - common names that map to actual method names
    cacheStats: "cacheHitRatio", // pg_cache_stats → cacheHitRatio()
    queryStats: "statStatements", // pg_query_stats → statStatements()
    // Activity-related aliases
    activity: "statActivity", // activity() → statActivity()

    // Index analysis aliases
    indexUsage: "indexStats", // indexUsage() → indexStats()
    // Vacuum alias
    vacuum: "vacuumStats", // vacuum() → vacuumStats()
    // Bloat alias
    bloatEstimate: "bloatCheck", // bloatEstimate() → bloatCheck()
    bloat: "bloatCheck", // bloat() → bloatCheck()
  },
  // Monitoring: intuitive aliases for common monitoring methods
  monitoring: {
    tables: "tableSizes", // tables() → tableSizes()
    connections: "connectionStats", // connections() → connectionStats()
    settings: "showSettings", // settings() → showSettings()
    config: "showSettings", // config() → showSettings()
    alerts: "alertThresholdSet", // alerts() → alertThresholdSet()
    thresholds: "alertThresholdSet", // thresholds() → alertThresholdSet()
  },
  // Transactions: shorter aliases
  transactions: {
    // pg.transactions.begin() -> transactionBegin (from pg_transaction_begin)
    begin: "transactionBegin",
    commit: "transactionCommit",
    rollback: "transactionRollback",
    savepoint: "transactionSavepoint",
    release: "transactionRelease",
    rollbackTo: "transactionRollbackTo",
    execute: "transactionExecute",
    status: "transactionStatus",
  },
  // Stats: pg_stats_descriptive → descriptive, but agent might try statsDescriptive
  stats: {
    statsDescriptive: "descriptive",
    statsPercentiles: "percentiles",
    statsCorrelation: "correlation",
    statsRegression: "regression",
    statsTimeSeries: "timeSeries",
    statsDistribution: "distribution",
    statsHypothesis: "hypothesis",
    statsSampling: "sampling",
    // Window function aliases
    statsRowNumber: "rowNumber",
    statsRank: "rank",
    statsLagLead: "lagLead",
    statsRunningTotal: "runningTotal",
    statsMovingAvg: "movingAvg",
    statsNtile: "ntile",
    // Advanced stats aliases
    statsOutliers: "outliers",
    statsTopN: "topN",
    statsDistinct: "distinct",
    statsFrequency: "frequency",
    statsSummary: "summary",
    // Intuitive aliases
    trend: "timeSeries",
    // Intuitive aliases
    percentile: "percentiles", // percentile() → percentiles()
    histogram: "distribution", // histogram() → distribution()
    movingAverage: "movingAvg", // movingAverage() → movingAvg()
    time_series: "timeSeries", // time_series() → timeSeries()
    cumulative: "runningTotal", // cumulative() → runningTotal()
    cumulativeSum: "runningTotal", // cumulativeSum() → runningTotal()
    lag: "lagLead", // lag() → lagLead() (use direction: 'lag')
    lead: "lagLead", // lead() → lagLead() (use direction: 'lead')
    top: "topN", // top() → topN()
    values: "distinct", // values() → distinct()
    freq: "frequency", // freq() → frequency()
    quartiles: "ntile", // quartiles() → ntile() (use buckets: 4)
  },
  // Cron: pg_cron_schedule → cronSchedule, but agent might try cronSchedule
  cron: {
    cronCreateExtension: "createExtension",
    cronSchedule: "schedule",
    cronScheduleInDatabase: "scheduleInDatabase",
    cronUnschedule: "unschedule",
    cronAlterJob: "alterJob",
    cronListJobs: "listJobs",
    cronJobRunDetails: "jobRunDetails",
    cronCleanupHistory: "cleanupHistory",
  },
  // Partman
  partman: {
    partmanCreateExtension: "createExtension",
    partmanCreateParent: "createParent",
    partmanRunMaintenance: "runMaintenance",
    partmanShowConfig: "showConfig",
    partmanShowPartitions: "showPartitions", // Missing alias - added
    partmanCheckDefault: "checkDefault",
    partmanPartitionData: "partitionData",
    partmanSetRetention: "setRetention",
    partmanUndoPartition: "undoPartition",
    partmanAnalyzePartitionHealth: "analyzePartitionHealth",
    // Intuitive short alias
    analyzeHealth: "analyzePartitionHealth", // pg.partman.analyzeHealth() → analyzePartitionHealth()
  },
  // Kcache
  kcache: {
    kcacheCreateExtension: "createExtension",
    kcacheQueryStats: "queryStats",
    kcacheReset: "reset",
    kcacheTopCpu: "topCpu",
    kcacheTopIo: "topIo",
    kcacheDatabaseStats: "databaseStats",
    kcacheResourceAnalysis: "resourceAnalysis",
  },
  // Citext
  citext: {
    citextCreateExtension: "createExtension",
    citextConvertColumn: "convertColumn",
    citextListColumns: "listColumns",
    citextAnalyzeCandidates: "analyzeCandidates",
    citextCompare: "compare",
    citextSchemaAdvisor: "schemaAdvisor",
  },
  // Ltree
  ltree: {
    ltreeCreateExtension: "createExtension",
    ltreeQuery: "query",
    ltreeSubpath: "subpath",
    ltreeLca: "lca",
    ltreeMatch: "match",
    ltreeListColumns: "listColumns",
    ltreeConvertColumn: "convertColumn",
    ltreeCreateIndex: "createIndex",
  },
  // Pgcrypto
  pgcrypto: {
    pgcryptoCreateExtension: "createExtension",
    pgcryptoHash: "hash",
    pgcryptoHmac: "hmac",
    pgcryptoEncrypt: "encrypt",
    pgcryptoDecrypt: "decrypt",
    pgcryptoGenRandomUuid: "genRandomUuid",
    pgcryptoGenRandomBytes: "genRandomBytes",
    pgcryptoGenSalt: "genSalt",
    pgcryptoCrypt: "crypt",
  },
  // Partitioning: shorter aliases
  partitioning: {
    create: "createPartition", // create() → createPartition()
    add: "createPartition", // add() → createPartition()
    list: "listPartitions", // list() → listPartitions()
    info: "partitionInfo", // info() → partitionInfo()
    attach: "attachPartition", // attach() → attachPartition()
    detach: "detachPartition", // detach() → detachPartition()
    remove: "detachPartition", // remove() → detachPartition()
  },
  // Backup: intuive aliases for audit backup methods
  backup: {
    listBackups: "auditListBackups",
    diffBackup: "auditDiffBackup",
    restoreBackup: "auditRestoreBackup",
  },
  // Introspection: shorthand aliases for common operations
  introspection: {
    deps: "dependencyGraph", // deps() → dependencyGraph()
    graph: "dependencyGraph", // graph() → dependencyGraph()
    sort: "topologicalSort", // sort() → topologicalSort()
    cascade: "cascadeSimulator", // cascade() → cascadeSimulator()
    snapshot: "schemaSnapshot", // snapshot() → schemaSnapshot()
    constraints: "constraintAnalysis", // constraints() → constraintAnalysis()
    risks: "migrationRisks", // risks() → migrationRisks()
  },
  // Migration: shorthand aliases for migration tracking
  migration: {
    initialize: "init", // initialize() → init()
    log: "record", // log() → record()
    run: "apply", // run() → apply()
    execute: "apply", // execute() → apply()
    undo: "rollback", // undo() → rollback()
    list: "history", // list() → history()
    dashboard: "status", // dashboard() → status()
  },
};

/**
 * Usage examples for each group's help() output.
 * Provides quick-reference examples for common operations.
 */
export const GROUP_EXAMPLES: Record<string, string[]> = {
  core: [
    'pg.core.readQuery("SELECT * FROM users LIMIT 10")',
    'pg.core.exists("users", "email=$1", ["test@example.com"])',
    'pg.core.createTable("orders", [{ name: "id", type: "SERIAL PRIMARY KEY" }])',
    'pg.core.batchInsert("products", [{ name: "A" }, { name: "B" }])',
  ],
  transactions: [
    "const { transactionId } = await pg.transactions.begin()",
    'await pg.transactions.savepoint({ transactionId, name: "sp1" })',
    'await pg.transactions.rollbackTo({ transactionId, name: "sp1" })',
    "await pg.transactions.commit({ transactionId })",
    'await pg.transactions.execute({ statements: [{ sql: "INSERT..." }, { sql: "UPDATE..." }] })',
  ],
  jsonb: [
    'pg.jsonb.extract({ table: "docs", column: "data", path: "user.name" })',
    'pg.jsonb.extract({ table: "docs", column: "data", path: "name", select: ["id"], limit: 10 })',
    'pg.jsonb.set({ table: "docs", column: "data", path: "status", value: "active", where: "id=1" })',
    'pg.jsonb.contains({ table: "docs", column: "data", value: { type: "admin" } })',
    "pg.jsonb.merge({ base: { a: 1 }, overlay: { b: 2 }, deep: true })",
    "pg.jsonb.diff({ doc1: { a: 1 }, doc2: { a: 2, b: 3 } })",
    'pg.jsonb.agg({ table: "docs", select: ["id"], orderBy: "id DESC", limit: 5 })',
  ],
  text: [
    'pg.text.search({ table: "articles", column: "content", query: "database" })',
    'pg.text.fuzzyMatch({ table: "users", column: "name", value: "john", maxDistance: 2 })',
    'pg.text.trigramSimilarity({ table: "products", column: "name", value: "widget" })',
  ],
  performance: [
    "pg.performance.explain({ sql: 'SELECT * FROM orders' })",
    "pg.performance.cacheHitRatio()",
    "pg.performance.indexStats({ table: 'orders' })",
    "pg.performance.bloatCheck()",
  ],
  admin: [
    "pg.admin.vacuum({ table: 'orders' })",
    "pg.admin.vacuum({ table: 'orders', full: true, analyze: true })",
    "pg.admin.analyze({ table: 'orders', columns: ['created_at', 'status'] })",
    "pg.admin.reindex({ target: 'table', name: 'orders', concurrently: true })",
    "pg.admin.cluster({ table: 'orders', index: 'idx_orders_date' })",
    "pg.admin.setConfig({ name: 'work_mem', value: '256MB' })",
    "pg.admin.cancelBackend({ pid: 12345 })",
  ],
  monitoring: [
    "pg.monitoring.databaseSize()",
    "pg.monitoring.tableSizes({ limit: 10 })",
    "pg.monitoring.connectionStats()",
    "pg.monitoring.showSettings({ pattern: 'work_mem' })",
    "pg.monitoring.capacityPlanning({ days: 30 })",
    "pg.monitoring.uptime()",
    "pg.monitoring.serverVersion()",
    "pg.monitoring.resourceUsageAnalyze()",
    "pg.monitoring.alertThresholdSet({ metric: 'connection_usage' })",
  ],
  backup: [
    "pg.backup.dumpTable({ table: 'users', includeData: true })",
    "pg.backup.copyExport({ table: 'orders', format: 'csv', limit: 100 })",
    "pg.backup.copyExport({ table: 'public.products' })", // schema.table format
    "pg.backup.copyImport({ table: 'orders', filePath: '/data/orders.csv', format: 'csv' })",
    "pg.backup.restoreCommand({ backupFile: 'backup.dump', database: 'mydb' })",
    "pg.backup.createBackupPlan({ frequency: 'daily', retention: 7 })",
    "pg.backup.physical({ targetDir: '/backups/base', format: 'tar', compress: 6 })",
    "pg.backup.restoreValidate({ backupFile: 'backup.dump', backupType: 'pg_dump' })",
    "pg.backup.scheduleOptimize()",
  ],
  schema: [
    "pg.schema.createView({ name: 'active_users', sql: 'SELECT * FROM users WHERE active' })",
    "pg.schema.listViews()",
    "pg.schema.createSequence({ name: 'order_seq' })",
  ],
  vector: [
    "pg.vector.search({ table: 'embeddings', column: 'vector', queryVector: [...], limit: 10 })",
    "pg.vector.createIndex({ table: 'embeddings', column: 'vector', method: 'ivfflat' })",
    "pg.vector.aggregate({ table: 'embeddings', column: 'vector', groupBy: 'category' })",
  ],
  postgis: [
    "pg.postgis.distance({ table: 'locations', column: 'geom', point: { lat: 40.7, lng: -74 } })",
    "pg.postgis.buffer({ table: 'areas', column: 'geom', distance: 1000 })",
    "pg.postgis.pointInPolygon({ table: 'zones', column: 'geom', point: { lat: 40.7, lng: -74 } })",
  ],
  partitioning: [
    "pg.partitioning.createPartitionedTable({ name: 'events', columns: [...], partitionBy: 'RANGE', partitionKey: 'created_at' })",
    "pg.partitioning.createPartition({ parent: 'events', name: 'events_2024_q1', forValues: \"FROM ('2024-01-01') TO ('2024-04-01')\" })",
    "pg.partitioning.listPartitions({ table: 'events' })",
  ],
  stats: [
    "pg.stats.descriptive({ table: 'orders', column: 'amount' })",
    "pg.stats.percentiles({ table: 'orders', column: 'amount', percentiles: [0.5, 0.95, 0.99] })",
    "pg.stats.timeSeries({ table: 'metrics', timeColumn: 'ts', valueColumn: 'value', interval: '1 hour' })",
    "pg.stats.rowNumber({ table: 'orders', orderBy: 'created_at' })",
    "pg.stats.rank({ table: 'sales', orderBy: 'revenue', rankType: 'dense_rank' })",
    "pg.stats.runningTotal({ table: 'orders', column: 'amount', orderBy: 'created_at' })",
    "pg.stats.movingAvg({ table: 'metrics', column: 'value', orderBy: 'ts', windowSize: 7 })",
    "pg.stats.outliers({ table: 'orders', column: 'amount', method: 'iqr' })",
    "pg.stats.topN({ table: 'products', column: 'price', n: 10 })",
    "pg.stats.frequency({ table: 'orders', column: 'status' })",
    "pg.stats.summary({ table: 'orders' })",
  ],
  cron: [
    "pg.cron.schedule({ name: 'cleanup', schedule: '0 3 * * *', command: \"DELETE FROM logs WHERE created_at < NOW() - INTERVAL '30 days'\" })",
    "pg.cron.listJobs()",
    "pg.cron.listJobs({ limit: 0 })", // Get all jobs
    "pg.cron.unschedule({ jobId: 1 })",
  ],
  partman: [
    "pg.partman.createParent({ table: 'events', column: 'created_at', interval: '1 month' })",
    "pg.partman.runMaintenance()",
    "pg.partman.showPartitions({ parentTable: 'events' })",
  ],
  kcache: [
    "pg.kcache.queryStats({ orderBy: 'cpu_time', limit: 10 })",
    "pg.kcache.topCpu({ limit: 5 })",
    "pg.kcache.topIo({ ioType: 'reads' })",
    "pg.kcache.resourceAnalysis()",
  ],
  citext: [
    "pg.citext.convertColumn({ table: 'users', column: 'email' })",
    "pg.citext.listColumns()",
    "pg.citext.analyzeCandidates({ table: 'users' })",
  ],
  ltree: [
    "pg.ltree.query({ table: 'categories', column: 'path', path: 'electronics', mode: 'descendants' })",
    "pg.ltree.match({ table: 'categories', column: 'path', pattern: '*.phones.*' })",
    "pg.ltree.subpath({ path: 'a.b.c.d', offset: 1, length: 2 })",
    "pg.ltree.lca({ paths: ['electronics.phones', 'electronics.accessories'] })",
  ],
  pgcrypto: [
    "pg.pgcrypto.hash({ data: 'password123', algorithm: 'sha256' })",
    "pg.pgcrypto.encrypt({ data: 'secret', password: 'mykey' })",
    "pg.pgcrypto.genRandomUuid()",
    "pg.pgcrypto.genSalt({ type: 'bf', iterations: 10 })",
    "pg.pgcrypto.crypt({ password: 'userpass', salt: storedHash })",
  ],
  introspection: [
    "pg.introspection.dependencyGraph()",
    "pg.introspection.dependencyGraph({ schema: 'public' })",
    "pg.introspection.topologicalSort({ direction: 'create' })",
    "pg.introspection.cascadeSimulator({ table: 'users' })",
    "pg.introspection.schemaSnapshot({ sections: ['tables', 'constraints'] })",
    "pg.introspection.constraintAnalysis({ checks: ['unindexed_fk', 'missing_pk'] })",
    "pg.introspection.migrationRisks({ statements: ['ALTER TABLE users DROP COLUMN email'] })",
  ],
  migration: [
    "pg.migration.init()",
    "pg.migration.record({ version: '1.0.0', migrationSql: 'ALTER TABLE...', rollbackSql: 'ALTER TABLE...' })",
    "pg.migration.apply({ version: '2.0.0', migrationSql: 'CREATE TABLE orders (...)', rollbackSql: 'DROP TABLE orders' })",
    "pg.migration.rollback({ version: '1.0.0', dryRun: true })",
    "pg.migration.history({ status: 'applied' })",
    "pg.migration.status()",
  ],
};

/**
 * Mapping of method names to their parameter names for positional argument support.
 * Single string = first positional arg maps to this key
 * Array = multiple positional args map to these keys in order
 *
 * Enables:
 * - `pg.core.readQuery("SELECT...")` → `{ sql: "SELECT..." }`
 * - `pg.core.exists("users", "id = 1")` → `{ table: "users", where: "id = 1" }`
 * - `pg.transactions.savepoint(txId, "sp1")` → `{ transactionId: txId, name: "sp1" }`
 */
export const POSITIONAL_PARAM_MAP: Record<string, string | string[]> = {
  // ============ CORE GROUP ============
  // Single param
  readQuery: "sql",
  writeQuery: "sql",
  describeTable: "table",
  dropTable: "table",
  listTables: "schema",
  count: ["table", "where"],
  truncate: "table",
  dropIndex: "name",
  listObjects: "schema",
  // Multi param
  exists: ["table", "where", "params"],
  objectDetails: ["name", "type"],
  createTable: ["name", "columns"],
  createIndex: ["table", "columns"], // Only required params; options object gets merged
  upsert: ["table", "data", "conflictColumns"],
  batchInsert: ["table", "rows"],

  // ============ SCHEMA GROUP ============
  createSchema: "name",
  dropSchema: "name",
  createSequence: "name",
  dropSequence: "name",
  dropView: "name",
  listSequences: "schema",
  listViews: "schema",
  listFunctions: "schema",
  listTriggers: "table",
  listConstraints: "table",
  createView: ["name", "sql"], // name first, then query (sql alias)

  // ============ JSONB GROUP ============
  // All table-based JSONB tools need [table, column, ...] pattern
  extract: ["table", "column", "path", "where"],
  set: ["table", "column", "path", "value", "where"],
  insert: ["table", "column", "path", "value", "where"],
  delete: ["table", "column", "path", "where"],
  contains: ["table", "column", "value", "where"],
  pathQuery: ["table", "column", "path", "vars", "where"],
  keys: ["table", "column", "where"],
  stripNulls: ["table", "column", "where"],
  typeof: ["table", "column", "path", "where"],
  stats: ["table", "column", "sampleSize"],
  indexSuggest: ["table", "column", "sampleSize"],
  securityScan: ["table", "column", "sampleSize"],
  normalize: ["table", "column", "mode", "where"],
  agg: ["table", "column"],
  // Non-table JSONB tools
  merge: ["base", "overlay"],
  diff: ["doc1", "doc2"],
  validatePath: "path",

  // ============ TRANSACTION GROUP ============
  transactionCommit: "transactionId",
  transactionRollback: "transactionId",
  transactionStatus: "transactionId",
  transactionSavepoint: ["transactionId", "name"],
  transactionRelease: ["transactionId", "name"],
  transactionRollbackTo: ["transactionId", "name"],
  // Note: transactionExecute uses ARRAY_WRAP_MAP, not positional mapping
  // Short aliases
  commit: "transactionId",
  rollback: "transactionId",
  status: "transactionId",
  savepoint: ["transactionId", "name"],
  release: ["transactionId", "name"],
  rollbackTo: ["transactionId", "name"],
  // Note: execute uses ARRAY_WRAP_MAP, not positional mapping

  // ============ PARTITIONING GROUP ============
  listPartitions: "table",
  createPartitionedTable: ["name", "columns", "partitionBy", "partitionKey"],
  createPartition: ["parent", "name", "forValues"],
  attachPartition: ["parent", "partition", "forValues"],
  detachPartition: ["parent", "partition"],
  partitionInfo: "table",

  // ============ STATS GROUP ============
  descriptive: ["table", "column"],
  percentiles: ["table", "column", "percentiles"],
  distribution: ["table", "column"],
  histogram: ["table", "column", "buckets"],
  correlation: ["table", "column1", "column2"],
  outliers: ["table", "column"],
  hypothesis: ["table", "column", "test", "hypothesizedMean"],
  sampling: ["table", "sampleSize"],
  regression: ["table", "xColumn", "yColumn"],
  timeSeries: ["table", "timeColumn", "valueColumn"], // timeColumn first is more intuitive
  // Stats prefixed aliases need mappings too
  statsTimeSeries: ["table", "timeColumn", "valueColumn"],
  statsDescriptive: ["table", "column"],
  statsPercentiles: ["table", "column", "percentiles"],
  statsDistribution: ["table", "column"],
  statsCorrelation: ["table", "column1", "column2"],
  statsHypothesis: ["table", "column", "test", "hypothesizedMean"],
  statsSampling: ["table", "sampleSize"],
  statsRegression: ["table", "xColumn", "yColumn"],
  statsTrend: ["table", "timeColumn", "valueColumn", "interval"],
  trend: ["table", "timeColumn", "valueColumn", "interval"],

  // Window function positional params
  rowNumber: ["table", "orderBy"],
  rank: ["table", "orderBy"],
  lagLead: ["table", "column", "orderBy", "direction"],
  runningTotal: ["table", "column", "orderBy"],
  movingAvg: ["table", "column", "orderBy", "windowSize"],
  ntile: ["table", "orderBy", "buckets"],

  // Advanced stats positional params
  topN: ["table", "column", "n"],
  distinct: ["table", "column"],
  frequency: ["table", "column"],
  summary: "table",

  // Insights
  appendInsight: "insight",

  // JSONB pretty
  pretty: "json",

  // ============ BACKUP GROUP ============
  copyExport: "table",
  copyImport: "table",
  dumpTable: "table",
  dumpSchema: "schema",
  restoreCommand: "backupFile",
  physical: "targetDir",
  restoreValidate: "backupFile",

  // ============ TEXT GROUP ============
  // New tools
  toVector: "text",
  toQuery: "text",
  textToVector: "text",
  textToQuery: "text",
  // Wrapper functions (soundex/metaphone call fuzzyMatch)
  soundex: ["table", "column", "value"],
  metaphone: ["table", "column", "value"],
};

/**
 * Methods where a single array arg should be wrapped in a specific key
 */
export const ARRAY_WRAP_MAP: Record<string, string> = {
  transactionExecute: "statements",
  execute: "statements",
  // JSONB builders - support both 'values' and 'elements'
  array: "values",
  jsonbArray: "values",
};

/**
 * Methods where a single object arg should be wrapped in a specific key
 * (instead of passed through directly).
 *
 * For pg_jsonb_object, the skipKeys array lists keys that indicate the user
 * has already provided the correct structure (e.g., { data: {...} }).
 */
export const OBJECT_WRAP_MAP: Record<
  string,
  { wrapKey: string; skipKeys: string[] }
> = {
  object: {
    wrapKey: "data",
    skipKeys: ["data", "object", "pairs"],
  }, // pg.jsonb.object({key: val}) → {data: {key: val}}
  jsonbObject: {
    wrapKey: "data",
    skipKeys: ["data", "object", "pairs"],
  }, // alias
};
