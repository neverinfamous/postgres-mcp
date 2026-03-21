/**
 * postgres-mcp - Code Mode Top-Level Aliases
 *
 * Data-driven top-level alias definitions.
 * Each entry maps `pg.<bindingName>()` → `pg.<group>.<methodName>()`.
 * The loop in createSandboxBindings() iterates this array instead of
 * hundreds of manual if-checks.
 */

export const TOP_LEVEL_ALIASES: readonly {
  group: string;
  bindingName: string;
  methodName: string;
}[] = [
  // vector
  { group: "vector", bindingName: "hybridSearch", methodName: "hybridSearch" },
  // jsonb
  { group: "jsonb", bindingName: "jsonbExtract", methodName: "extract" },
  { group: "jsonb", bindingName: "jsonbSet", methodName: "set" },
  { group: "jsonb", bindingName: "jsonbInsert", methodName: "insert" },
  { group: "jsonb", bindingName: "jsonbDelete", methodName: "delete" },
  { group: "jsonb", bindingName: "jsonbContains", methodName: "contains" },
  { group: "jsonb", bindingName: "jsonbPathQuery", methodName: "pathQuery" },
  { group: "jsonb", bindingName: "jsonbAgg", methodName: "agg" },
  { group: "jsonb", bindingName: "jsonbObject", methodName: "object" },
  { group: "jsonb", bindingName: "jsonbArray", methodName: "array" },
  { group: "jsonb", bindingName: "jsonbKeys", methodName: "keys" },
  { group: "jsonb", bindingName: "jsonbStripNulls", methodName: "stripNulls" },
  { group: "jsonb", bindingName: "jsonbTypeof", methodName: "typeof" },
  {
    group: "jsonb",
    bindingName: "jsonbValidatePath",
    methodName: "validatePath",
  },
  { group: "jsonb", bindingName: "jsonbMerge", methodName: "merge" },
  { group: "jsonb", bindingName: "jsonbNormalize", methodName: "normalize" },
  { group: "jsonb", bindingName: "jsonbDiff", methodName: "diff" },
  {
    group: "jsonb",
    bindingName: "jsonbIndexSuggest",
    methodName: "indexSuggest",
  },
  {
    group: "jsonb",
    bindingName: "jsonbSecurityScan",
    methodName: "securityScan",
  },
  { group: "jsonb", bindingName: "jsonbStats", methodName: "stats" },
  { group: "jsonb", bindingName: "jsonbPretty", methodName: "pretty" },
  // text
  { group: "text", bindingName: "textSearch", methodName: "search" },
  { group: "text", bindingName: "textRank", methodName: "rank" },
  { group: "text", bindingName: "textHeadline", methodName: "headline" },
  { group: "text", bindingName: "textNormalize", methodName: "normalize" },
  { group: "text", bindingName: "textSentiment", methodName: "sentiment" },
  { group: "text", bindingName: "textToVector", methodName: "toVector" },
  { group: "text", bindingName: "textToQuery", methodName: "toQuery" },
  {
    group: "text",
    bindingName: "textSearchConfig",
    methodName: "searchConfig",
  },
  {
    group: "text",
    bindingName: "textTrigramSimilarity",
    methodName: "trigramSimilarity",
  },
  { group: "text", bindingName: "textFuzzyMatch", methodName: "fuzzyMatch" },
  { group: "text", bindingName: "textLikeSearch", methodName: "likeSearch" },
  {
    group: "text",
    bindingName: "textRegexpMatch",
    methodName: "regexpMatch",
  },
  {
    group: "text",
    bindingName: "textCreateFtsIndex",
    methodName: "createFtsIndex",
  },
  // citext
  {
    group: "citext",
    bindingName: "citextCreateExtension",
    methodName: "createExtension",
  },
  {
    group: "citext",
    bindingName: "citextConvertColumn",
    methodName: "convertColumn",
  },
  {
    group: "citext",
    bindingName: "citextListColumns",
    methodName: "listColumns",
  },
  {
    group: "citext",
    bindingName: "citextAnalyzeCandidates",
    methodName: "analyzeCandidates",
  },
  { group: "citext", bindingName: "citextCompare", methodName: "compare" },
  {
    group: "citext",
    bindingName: "citextSchemaAdvisor",
    methodName: "schemaAdvisor",
  },
  // ltree
  {
    group: "ltree",
    bindingName: "ltreeCreateExtension",
    methodName: "createExtension",
  },
  { group: "ltree", bindingName: "ltreeQuery", methodName: "query" },
  { group: "ltree", bindingName: "ltreeSubpath", methodName: "subpath" },
  { group: "ltree", bindingName: "ltreeLca", methodName: "lca" },
  { group: "ltree", bindingName: "ltreeMatch", methodName: "match" },
  {
    group: "ltree",
    bindingName: "ltreeListColumns",
    methodName: "listColumns",
  },
  {
    group: "ltree",
    bindingName: "ltreeConvertColumn",
    methodName: "convertColumn",
  },
  {
    group: "ltree",
    bindingName: "ltreeCreateIndex",
    methodName: "createIndex",
  },
  // pgcrypto
  {
    group: "pgcrypto",
    bindingName: "pgcryptoCreateExtension",
    methodName: "createExtension",
  },
  { group: "pgcrypto", bindingName: "pgcryptoHash", methodName: "hash" },
  { group: "pgcrypto", bindingName: "pgcryptoHmac", methodName: "hmac" },
  { group: "pgcrypto", bindingName: "pgcryptoEncrypt", methodName: "encrypt" },
  { group: "pgcrypto", bindingName: "pgcryptoDecrypt", methodName: "decrypt" },
  {
    group: "pgcrypto",
    bindingName: "pgcryptoGenRandomUuid",
    methodName: "genRandomUuid",
  },
  {
    group: "pgcrypto",
    bindingName: "pgcryptoGenRandomBytes",
    methodName: "genRandomBytes",
  },
  { group: "pgcrypto", bindingName: "pgcryptoGenSalt", methodName: "genSalt" },
  { group: "pgcrypto", bindingName: "pgcryptoCrypt", methodName: "crypt" },
  // core
  { group: "core", bindingName: "readQuery", methodName: "readQuery" },
  { group: "core", bindingName: "writeQuery", methodName: "writeQuery" },
  { group: "core", bindingName: "listTables", methodName: "listTables" },
  {
    group: "core",
    bindingName: "describeTable",
    methodName: "describeTable",
  },
  { group: "core", bindingName: "createTable", methodName: "createTable" },
  { group: "core", bindingName: "dropTable", methodName: "dropTable" },
  { group: "core", bindingName: "count", methodName: "count" },
  { group: "core", bindingName: "exists", methodName: "exists" },
  { group: "core", bindingName: "upsert", methodName: "upsert" },
  { group: "core", bindingName: "batchInsert", methodName: "batchInsert" },
  { group: "core", bindingName: "truncate", methodName: "truncate" },
  { group: "core", bindingName: "createIndex", methodName: "createIndex" },
  { group: "core", bindingName: "dropIndex", methodName: "dropIndex" },
  { group: "core", bindingName: "getIndexes", methodName: "getIndexes" },
  { group: "core", bindingName: "listObjects", methodName: "listObjects" },
  {
    group: "core",
    bindingName: "objectDetails",
    methodName: "objectDetails",
  },
  {
    group: "core",
    bindingName: "analyzeDbHealth",
    methodName: "analyzeDbHealth",
  },
  {
    group: "core",
    bindingName: "analyzeQueryIndexes",
    methodName: "analyzeQueryIndexes",
  },
  {
    group: "core",
    bindingName: "analyzeWorkloadIndexes",
    methodName: "analyzeWorkloadIndexes",
  },
  {
    group: "core",
    bindingName: "listExtensions",
    methodName: "listExtensions",
  },
  // transactions
  {
    group: "transactions",
    bindingName: "transactionBegin",
    methodName: "transactionBegin",
  },
  {
    group: "transactions",
    bindingName: "transactionCommit",
    methodName: "transactionCommit",
  },
  {
    group: "transactions",
    bindingName: "transactionRollback",
    methodName: "transactionRollback",
  },
  {
    group: "transactions",
    bindingName: "transactionSavepoint",
    methodName: "transactionSavepoint",
  },
  {
    group: "transactions",
    bindingName: "transactionRelease",
    methodName: "transactionRelease",
  },
  {
    group: "transactions",
    bindingName: "transactionRollbackTo",
    methodName: "transactionRollbackTo",
  },
  {
    group: "transactions",
    bindingName: "transactionExecute",
    methodName: "transactionExecute",
  },
  {
    group: "transactions",
    bindingName: "transactionStatus",
    methodName: "transactionStatus",
  },
  // performance
  {
    group: "performance",
    bindingName: "explain",
    methodName: "explain",
  },
  {
    group: "performance",
    bindingName: "explainAnalyze",
    methodName: "explainAnalyze",
  },
  {
    group: "performance",
    bindingName: "cacheHitRatio",
    methodName: "cacheHitRatio",
  },
  {
    group: "performance",
    bindingName: "indexStats",
    methodName: "indexStats",
  },
  {
    group: "performance",
    bindingName: "tableStats",
    methodName: "tableStats",
  },
  {
    group: "performance",
    bindingName: "indexRecommendations",
    methodName: "indexRecommendations",
  },
  {
    group: "performance",
    bindingName: "bloatCheck",
    methodName: "bloatCheck",
  },
  {
    group: "performance",
    bindingName: "vacuumStats",
    methodName: "vacuumStats",
  },
  {
    group: "performance",
    bindingName: "unusedIndexes",
    methodName: "unusedIndexes",
  },
  {
    group: "performance",
    bindingName: "duplicateIndexes",
    methodName: "duplicateIndexes",
  },
  {
    group: "performance",
    bindingName: "seqScanTables",
    methodName: "seqScanTables",
  },
  // admin
  { group: "admin", bindingName: "vacuum", methodName: "vacuum" },
  {
    group: "admin",
    bindingName: "vacuumAnalyze",
    methodName: "vacuumAnalyze",
  },
  { group: "admin", bindingName: "analyze", methodName: "analyze" },
  { group: "admin", bindingName: "reindex", methodName: "reindex" },
  { group: "admin", bindingName: "cluster", methodName: "cluster" },
  { group: "admin", bindingName: "setConfig", methodName: "setConfig" },
  { group: "admin", bindingName: "reloadConf", methodName: "reloadConf" },
  { group: "admin", bindingName: "resetStats", methodName: "resetStats" },
  {
    group: "admin",
    bindingName: "cancelBackend",
    methodName: "cancelBackend",
  },
  {
    group: "admin",
    bindingName: "terminateBackend",
    methodName: "terminateBackend",
  },
  // monitoring
  {
    group: "monitoring",
    bindingName: "databaseSize",
    methodName: "databaseSize",
  },
  {
    group: "monitoring",
    bindingName: "tableSizes",
    methodName: "tableSizes",
  },
  {
    group: "monitoring",
    bindingName: "connectionStats",
    methodName: "connectionStats",
  },
  {
    group: "monitoring",
    bindingName: "serverVersion",
    methodName: "serverVersion",
  },
  { group: "monitoring", bindingName: "uptime", methodName: "uptime" },
  {
    group: "monitoring",
    bindingName: "showSettings",
    methodName: "showSettings",
  },
  {
    group: "monitoring",
    bindingName: "recoveryStatus",
    methodName: "recoveryStatus",
  },
  {
    group: "monitoring",
    bindingName: "replicationStatus",
    methodName: "replicationStatus",
  },
  {
    group: "monitoring",
    bindingName: "capacityPlanning",
    methodName: "capacityPlanning",
  },
  {
    group: "monitoring",
    bindingName: "resourceUsageAnalyze",
    methodName: "resourceUsageAnalyze",
  },
  {
    group: "monitoring",
    bindingName: "alertThresholdSet",
    methodName: "alertThresholdSet",
  },
  // backup
  { group: "backup", bindingName: "dumpTable", methodName: "dumpTable" },
  { group: "backup", bindingName: "dumpSchema", methodName: "dumpSchema" },
  { group: "backup", bindingName: "copyExport", methodName: "copyExport" },
  { group: "backup", bindingName: "copyImport", methodName: "copyImport" },
  {
    group: "backup",
    bindingName: "createBackupPlan",
    methodName: "createBackupPlan",
  },
  {
    group: "backup",
    bindingName: "restoreCommand",
    methodName: "restoreCommand",
  },
  {
    group: "backup",
    bindingName: "restoreValidate",
    methodName: "restoreValidate",
  },
  { group: "backup", bindingName: "physical", methodName: "physical" },
  {
    group: "backup",
    bindingName: "backupPhysical",
    methodName: "physical",
  },
  {
    group: "backup",
    bindingName: "scheduleOptimize",
    methodName: "scheduleOptimize",
  },
  {
    group: "backup",
    bindingName: "backupScheduleOptimize",
    methodName: "scheduleOptimize",
  },
  // stats
  { group: "stats", bindingName: "descriptive", methodName: "descriptive" },
  { group: "stats", bindingName: "percentiles", methodName: "percentiles" },
  { group: "stats", bindingName: "correlation", methodName: "correlation" },
  { group: "stats", bindingName: "regression", methodName: "regression" },
  { group: "stats", bindingName: "timeSeries", methodName: "timeSeries" },
  {
    group: "stats",
    bindingName: "distribution",
    methodName: "distribution",
  },
  { group: "stats", bindingName: "hypothesis", methodName: "hypothesis" },
  { group: "stats", bindingName: "sampling", methodName: "sampling" },
  // postgis
  {
    group: "postgis",
    bindingName: "postgisCreateExtension",
    methodName: "createExtension",
  },
  { group: "postgis", bindingName: "postgisGeocode", methodName: "geocode" },
  {
    group: "postgis",
    bindingName: "postgisGeometryColumn",
    methodName: "geometryColumn",
  },
  {
    group: "postgis",
    bindingName: "postgisSpatialIndex",
    methodName: "spatialIndex",
  },
  {
    group: "postgis",
    bindingName: "postgisDistance",
    methodName: "distance",
  },
  {
    group: "postgis",
    bindingName: "postgisBoundingBox",
    methodName: "boundingBox",
  },
  {
    group: "postgis",
    bindingName: "postgisIntersection",
    methodName: "intersection",
  },
  {
    group: "postgis",
    bindingName: "postgisPointInPolygon",
    methodName: "pointInPolygon",
  },
  { group: "postgis", bindingName: "postgisBuffer", methodName: "buffer" },
  {
    group: "postgis",
    bindingName: "postgisGeoTransform",
    methodName: "geoTransform",
  },
  {
    group: "postgis",
    bindingName: "postgisGeoCluster",
    methodName: "geoCluster",
  },
  {
    group: "postgis",
    bindingName: "postgisGeometryBuffer",
    methodName: "geometryBuffer",
  },
  {
    group: "postgis",
    bindingName: "postgisGeometryTransform",
    methodName: "geometryTransform",
  },
  {
    group: "postgis",
    bindingName: "postgisGeometryIntersection",
    methodName: "geometryIntersection",
  },
  {
    group: "postgis",
    bindingName: "postgisGeoIndexOptimize",
    methodName: "geoIndexOptimize",
  },
  // cron
  {
    group: "cron",
    bindingName: "cronCreateExtension",
    methodName: "createExtension",
  },
  { group: "cron", bindingName: "cronSchedule", methodName: "schedule" },
  {
    group: "cron",
    bindingName: "cronScheduleInDatabase",
    methodName: "scheduleInDatabase",
  },
  { group: "cron", bindingName: "cronUnschedule", methodName: "unschedule" },
  { group: "cron", bindingName: "cronAlterJob", methodName: "alterJob" },
  { group: "cron", bindingName: "cronListJobs", methodName: "listJobs" },
  {
    group: "cron",
    bindingName: "cronJobRunDetails",
    methodName: "jobRunDetails",
  },
  {
    group: "cron",
    bindingName: "cronCleanupHistory",
    methodName: "cleanupHistory",
  },
];
