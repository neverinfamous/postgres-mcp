/**
 * postgres-mcp - PostgreSQL Zod Schemas
 *
 * Re-exports all input validation schemas from modular files.
 */

// Core tool schemas (queries, tables, indexes, transactions)
export {
  ReadQuerySchemaBase,
  ReadQuerySchema,
  WriteQuerySchemaBase,
  WriteQuerySchema,
  ListTablesSchemaBase,
  ListTablesSchema,
  DescribeTableSchemaBase,
  DescribeTableSchema,
  CreateTableSchemaBase,
  CreateTableSchema,
  DropTableSchemaBase,
  DropTableSchema,
  GetIndexesSchemaBase,
  GetIndexesSchema,
  CreateIndexSchemaBase,
  CreateIndexSchema,
  BeginTransactionSchemaBase,
  BeginTransactionSchema,
  TransactionIdSchema,
  TransactionIdSchemaBase,
  SavepointSchema,
  SavepointSchemaBase,
  ExecuteInTransactionSchema,
  TransactionExecuteSchema,
  TransactionExecuteSchemaBase,
  // Transaction output schemas
  TransactionBeginOutputSchema,
  TransactionResultOutputSchema,
  SavepointResultOutputSchema,
  TransactionExecuteOutputSchema,
} from "./core.js";

// JSONB operation schemas
export {
  // Base schemas for MCP visibility (Split Schema pattern)
  JsonbExtractSchemaBase,
  JsonbSetSchemaBase,
  JsonbContainsSchemaBase,
  JsonbPathQuerySchemaBase,
  JsonbInsertSchemaBase,
  JsonbDeleteSchemaBase,
  JsonbTypeofSchemaBase,
  JsonbKeysSchemaBase,
  JsonbStripNullsSchemaBase,
  JsonbAggSchemaBase,
  JsonbNormalizeSchemaBase,
  JsonbStatsSchemaBase,
  JsonbIndexSuggestSchemaBase,
  JsonbSecurityScanSchemaBase,
  // Full schemas (with preprocess - for handler parsing)
  JsonbExtractSchema,
  JsonbSetSchema,
  JsonbContainsSchema,
  JsonbPathQuerySchema,
  JsonbInsertSchema,
  JsonbDeleteSchema,
  JsonbTypeofSchema,
  JsonbKeysSchema,
  JsonbStripNullsSchema,
  JsonbAggSchema,
  JsonbNormalizeSchema,
  JsonbStatsSchema,
  JsonbIndexSuggestSchema,
  JsonbSecurityScanSchema,
  // Preprocess function for handlers
  preprocessJsonbParams,
  // Path normalization functions (for handler use)
  normalizePathToArray,
  normalizePathForInsert,
  normalizePathToString,
  parseJsonbValue,
  stringPathToArray,
  arrayPathToString,
  // JSONB output schemas
  JsonbExtractOutputSchema,
  JsonbSetOutputSchema,
  JsonbInsertOutputSchema,
  JsonbDeleteOutputSchema,
  JsonbContainsOutputSchema,
  JsonbPathQueryOutputSchema,
  JsonbAggOutputSchema,
  JsonbObjectOutputSchema,
  JsonbArrayOutputSchema,
  JsonbKeysOutputSchema,
  JsonbStripNullsOutputSchema,
  JsonbTypeofOutputSchema,
  JsonbValidatePathOutputSchema,
  JsonbMergeOutputSchema,
  JsonbNormalizeOutputSchema,
  JsonbDiffOutputSchema,
  JsonbIndexSuggestOutputSchema,
  JsonbSecurityScanOutputSchema,
  JsonbStatsOutputSchema,
} from "./jsonb.js";

// Text search schemas
export {
  TextSearchSchema,
  TextSearchSchemaBase,
  TrigramSimilaritySchema,
  TrigramSimilaritySchemaBase,
  RegexpMatchSchema,
  RegexpMatchSchemaBase,
  preprocessTextParams,
  // Text output schemas
  TextRowsOutputSchema,
  FtsIndexOutputSchema,
  TextNormalizeOutputSchema,
  TextSentimentOutputSchema,
  TextToVectorOutputSchema,
  TextToQueryOutputSchema,
  TextSearchConfigOutputSchema,
} from "./text-search.js";

// Performance and explain schemas
export {
  ExplainSchema,
  ExplainSchemaBase,
  preprocessExplainParams,
  IndexStatsSchemaBase,
  IndexStatsSchema,
  TableStatsSchemaBase,
  TableStatsSchema,
  // Output schemas
  ExplainOutputSchema,
  IndexStatsOutputSchema,
  TableStatsOutputSchema,
  StatStatementsOutputSchema,
  StatActivityOutputSchema,
  LocksOutputSchema,
  BloatCheckOutputSchema,
  CacheHitRatioOutputSchema,
  SeqScanTablesOutputSchema,
  IndexRecommendationsOutputSchema,
  QueryPlanCompareOutputSchema,
  PerformanceBaselineOutputSchema,
  ConnectionPoolOptimizeOutputSchema,
  PartitionStrategySuggestOutputSchema,
  UnusedIndexesOutputSchema,
  DuplicateIndexesOutputSchema,
  VacuumStatsOutputSchema,
  QueryPlanStatsOutputSchema,
} from "./performance.js";

// Admin operation schemas
export {
  VacuumSchema,
  VacuumSchemaBase,
  VacuumOutputSchema,
  AnalyzeSchema,
  AnalyzeSchemaBase,
  AnalyzeOutputSchema,
  ReindexSchema,
  ReindexSchemaBase,
  ReindexOutputSchema,
  ClusterOutputSchema,
  TerminateBackendSchema,
  TerminateBackendSchemaBase,
  CancelBackendSchema,
  CancelBackendSchemaBase,
  BackendOutputSchema,
  ConfigOutputSchema,
} from "./admin.js";

// Monitoring schemas
export {
  DatabaseSizeSchemaBase,
  DatabaseSizeSchema,
  TableSizesSchemaBase,
  TableSizesSchema,
  ShowSettingsSchemaBase,
  ShowSettingsSchema,
  // Output schemas
  DatabaseSizeOutputSchema,
  TableSizesOutputSchema,
  ConnectionStatsOutputSchema,
  ReplicationStatusOutputSchema,
  ServerVersionOutputSchema,
  ShowSettingsOutputSchema,
  UptimeOutputSchema,
  RecoveryStatusOutputSchema,
  CapacityPlanningOutputSchema,
  ResourceUsageAnalyzeOutputSchema,
  AlertThresholdOutputSchema,
} from "./monitoring.js";

// Backup and export schemas
export {
  CopyExportSchema,
  CopyExportSchemaBase,
  DumpSchemaSchema,
  // Output schemas
  DumpTableOutputSchema,
  DumpSchemaOutputSchema,
  CopyExportOutputSchema,
  CopyImportOutputSchema,
  CreateBackupPlanOutputSchema,
  RestoreCommandOutputSchema,
  PhysicalBackupOutputSchema,
  RestoreValidateOutputSchema,
  BackupScheduleOptimizeOutputSchema,
} from "./backup.js";

// Schema management schemas
export {
  CreateSchemaSchema,
  DropSchemaSchema,
  // Sequence schemas - Split Schema pattern for MCP visibility
  CreateSequenceSchemaBase,
  CreateSequenceSchema,
  DropSequenceSchemaBase,
  DropSequenceSchema,
  // View schemas - Split Schema pattern for MCP visibility
  CreateViewSchemaBase,
  CreateViewSchema,
  DropViewSchemaBase,
  DropViewSchema,
  // List functions schemas - Split Schema pattern for MCP visibility
  ListFunctionsSchemaBase,
  ListFunctionsSchema,
  // Output schemas
  ListSchemasOutputSchema,
  CreateSchemaOutputSchema,
  DropSchemaOutputSchema,
  ListSequencesOutputSchema,
  CreateSequenceOutputSchema,
  DropSequenceOutputSchema,
  ListViewsOutputSchema,
  CreateViewOutputSchema,
  DropViewOutputSchema,
  ListFunctionsOutputSchema,
  ListTriggersOutputSchema,
  ListConstraintsOutputSchema,
} from "./schema-mgmt.js";

// pgvector schemas
export {
  // Base schemas for MCP visibility (Split Schema pattern)
  VectorSearchSchemaBase,
  VectorCreateIndexSchemaBase,
  // Transformed schemas for handler validation
  VectorSearchSchema,
  VectorCreateIndexSchema,
  // Utilities
  FiniteNumberArray,
  // Output schemas
  VectorCreateExtensionOutputSchema,
  VectorAddColumnOutputSchema,
  VectorInsertOutputSchema,
  VectorSearchOutputSchema,
  VectorCreateIndexOutputSchema,
  VectorDistanceOutputSchema,
  VectorNormalizeOutputSchema,
  VectorAggregateOutputSchema,
  VectorClusterOutputSchema,
  VectorIndexOptimizeOutputSchema,
  HybridSearchOutputSchema,
  VectorPerformanceOutputSchema,
  VectorDimensionReduceOutputSchema,
  VectorEmbedOutputSchema,
  VectorValidateOutputSchema,
} from "./vector.js";

// PostGIS schemas
export {
  // Base schemas for MCP visibility
  GeometryColumnSchemaBase,
  GeometryDistanceSchemaBase,
  PointInPolygonSchemaBase,
  SpatialIndexSchemaBase,
  BufferSchemaBase,
  IntersectionSchemaBase,
  BoundingBoxSchemaBase,
  GeocodeSchemaBase,
  GeoTransformSchemaBase,
  GeoClusterSchemaBase,
  GeometryBufferSchemaBase,
  GeometryIntersectionSchemaBase,
  GeometryTransformSchemaBase,
  // Transformed schemas for handler validation
  GeometryColumnSchema,
  GeometryDistanceSchema,
  PointInPolygonSchema,
  SpatialIndexSchema,
  BufferSchema,
  IntersectionSchema,
  BoundingBoxSchema,
  GeocodeSchema,
  GeoTransformSchema,
  GeoClusterSchema,
  GeometryBufferSchema,
  GeometryIntersectionSchema,
  GeometryTransformSchema,
  // Utility functions
  preprocessPostgisParams,
  preprocessPoint,
  convertToMeters,
  // Output schemas
  PostgisCreateExtensionOutputSchema,
  GeometryColumnOutputSchema,
  PointInPolygonOutputSchema,
  DistanceOutputSchema,
  BufferOutputSchema,
  IntersectionOutputSchema,
  BoundingBoxOutputSchema,
  SpatialIndexOutputSchema,
  GeocodeOutputSchema,
  GeoTransformOutputSchema,
  GeoIndexOptimizeOutputSchema,
  GeoClusterOutputSchema,
  GeometryBufferOutputSchema,
  GeometryIntersectionOutputSchema,
  GeometryTransformOutputSchema,
} from "./postgis.js";

// Partitioning schemas
export {
  // Base schemas for MCP visibility
  CreatePartitionedTableSchemaBase,
  CreatePartitionSchemaBase,
  AttachPartitionSchemaBase,
  DetachPartitionSchemaBase,
  ListPartitionsSchemaBase,
  PartitionInfoSchemaBase,
  // Transformed schemas for handler validation
  CreatePartitionedTableSchema,
  CreatePartitionSchema,
  AttachPartitionSchema,
  DetachPartitionSchema,
  ListPartitionsSchema,
  PartitionInfoSchema,
  // Output schemas
  ListPartitionsOutputSchema,
  CreatePartitionedTableOutputSchema,
  CreatePartitionOutputSchema,
  AttachPartitionOutputSchema,
  DetachPartitionOutputSchema,
  PartitionInfoOutputSchema,
} from "./partitioning.js";

// pg_cron schemas
export {
  CronScheduleSchema,
  CronScheduleSchemaBase,
  CronScheduleInDatabaseSchema,
  CronScheduleInDatabaseSchemaBase,
  CronUnscheduleSchemaBase,
  CronUnscheduleSchema,
  CronAlterJobSchemaBase,
  CronAlterJobSchema,
  CronJobRunDetailsSchemaBase,
  CronJobRunDetailsSchema,
  CronCleanupHistorySchema,
  CronCleanupHistorySchemaBase,
  // Output schemas
  CronCreateExtensionOutputSchema,
  CronScheduleOutputSchema,
  CronScheduleInDatabaseOutputSchema,
  CronUnscheduleOutputSchema,
  CronAlterJobOutputSchema,
  CronListJobsOutputSchema,
  CronJobRunDetailsOutputSchema,
  CronCleanupHistoryOutputSchema,
} from "./cron.js";

// pg_partman schemas
export {
  PartmanCreateParentSchema,
  PartmanRunMaintenanceSchema,
  PartmanShowPartitionsSchema,
  PartmanCheckDefaultSchema,
  PartmanPartitionDataSchema,
  PartmanRetentionSchema,
  PartmanUndoPartitionSchema,
  PartmanUpdateConfigSchema,
  // Output schemas
  PartmanCreateExtensionOutputSchema,
  PartmanCreateParentOutputSchema,
  PartmanRunMaintenanceOutputSchema,
  PartmanShowPartitionsOutputSchema,
  PartmanShowConfigOutputSchema,
  PartmanCheckDefaultOutputSchema,
  PartmanPartitionDataOutputSchema,
  PartmanSetRetentionOutputSchema,
  PartmanUndoPartitionOutputSchema,
  PartmanAnalyzeHealthOutputSchema,
} from "./partman.js";

// Extension schemas (kcache, citext, ltree, pgcrypto)
export {
  // pg_stat_kcache
  KcacheQueryStatsSchemaBase,
  KcacheQueryStatsSchema,
  KcacheTopConsumersSchema,
  KcacheTopCpuSchemaBase,
  KcacheTopIoSchemaBase,
  KcacheDatabaseStatsSchemaBase,
  KcacheDatabaseStatsSchema,
  KcacheResourceAnalysisSchemaBase,
  KcacheResourceAnalysisSchema,
  // Kcache output schemas
  KcacheCreateExtensionOutputSchema,
  KcacheQueryStatsOutputSchema,
  KcacheTopCpuOutputSchema,
  KcacheTopIoOutputSchema,
  KcacheDatabaseStatsOutputSchema,
  KcacheResourceAnalysisOutputSchema,
  KcacheResetOutputSchema,
  // citext
  CitextConvertColumnSchema,
  CitextConvertColumnSchemaBase,
  CitextListColumnsSchemaBase,
  CitextListColumnsSchema,
  CitextAnalyzeCandidatesSchema,
  CitextAnalyzeCandidatesSchemaBase,
  CitextSchemaAdvisorSchema,
  CitextSchemaAdvisorSchemaBase,
  // Citext output schemas
  CitextCreateExtensionOutputSchema,
  CitextConvertColumnOutputSchema,
  CitextListColumnsOutputSchema,
  CitextAnalyzeCandidatesOutputSchema,
  CitextCompareOutputSchema,
  CitextSchemaAdvisorOutputSchema,
  // ltree
  LtreeQuerySchema,
  LtreeQuerySchemaBase,
  LtreeSubpathSchema,
  LtreeSubpathSchemaBase,
  LtreeLcaSchema,
  LtreeMatchSchema,
  LtreeMatchSchemaBase,
  LtreeListColumnsSchemaBase,
  LtreeListColumnsSchema,
  LtreeConvertColumnSchema,
  LtreeConvertColumnSchemaBase,
  LtreeIndexSchema,
  LtreeIndexSchemaBase,
  // Ltree output schemas
  LtreeCreateExtensionOutputSchema,
  LtreeQueryOutputSchema,
  LtreeSubpathOutputSchema,
  LtreeLcaOutputSchema,
  LtreeMatchOutputSchema,
  LtreeListColumnsOutputSchema,
  LtreeConvertColumnOutputSchema,
  LtreeCreateIndexOutputSchema,
  // pgcrypto — Base schemas for MCP visibility (Split Schema pattern)
  PgcryptoHashSchemaBase,
  PgcryptoHmacSchemaBase,
  PgcryptoRandomBytesSchemaBase,
  PgcryptoGenSaltSchemaBase,
  // pgcrypto — Full schemas for handler validation
  PgcryptoHashSchema,
  PgcryptoHmacSchema,
  PgcryptoEncryptSchema,
  PgcryptoEncryptSchemaBase,
  PgcryptoDecryptSchema,
  PgcryptoDecryptSchemaBase,
  PgcryptoRandomBytesSchema,
  PgcryptoGenSaltSchema,
  PgcryptoCryptSchema,
  // Pgcrypto output schemas
  PgcryptoCreateExtensionOutputSchema,
  PgcryptoHashOutputSchema,
  PgcryptoHmacOutputSchema,
  PgcryptoEncryptOutputSchema,
  PgcryptoDecryptOutputSchema,
  PgcryptoGenRandomUuidOutputSchema,
  PgcryptoGenRandomBytesOutputSchema,
  PgcryptoGenSaltOutputSchema,
  PgcryptoCryptOutputSchema,
} from "./extensions.js";

// Stats schemas
export {
  // Base schemas for MCP visibility
  StatsDescriptiveSchemaBase,
  StatsPercentilesSchemaBase,
  StatsCorrelationSchemaBase,
  StatsRegressionSchemaBase,
  StatsTimeSeriesSchemaBase,
  StatsDistributionSchemaBase,
  StatsHypothesisSchemaBase,
  StatsSamplingSchemaBase,
  // Preprocessed schemas for handler validation
  StatsDescriptiveSchema,
  StatsPercentilesSchema,
  StatsCorrelationSchema,
  StatsRegressionSchema,
  StatsTimeSeriesSchema,
  StatsDistributionSchema,
  StatsHypothesisSchema,
  StatsSamplingSchema,
  // Output schemas for MCP structured content
  DescriptiveOutputSchema,
  PercentilesOutputSchema,
  CorrelationOutputSchema,
  RegressionOutputSchema,
  TimeSeriesOutputSchema,
  DistributionOutputSchema,
  HypothesisOutputSchema,
  SamplingOutputSchema,
} from "./stats.js";

// Introspection schemas (agent-optimized database analysis)
export {
  // Input schemas
  DependencyGraphSchemaBase,
  DependencyGraphSchema,
  TopologicalSortSchemaBase,
  TopologicalSortSchema,
  CascadeSimulatorSchemaBase,
  CascadeSimulatorSchema,
  SchemaSnapshotSchemaBase,
  SchemaSnapshotSchema,
  ConstraintAnalysisSchemaBase,
  ConstraintAnalysisSchema,
  MigrationRisksSchemaBase,
  MigrationRisksSchema,
  MigrationInitSchemaBase,
  MigrationInitSchema,
  MigrationRecordSchemaBase,
  MigrationRecordSchema,
  MigrationRollbackSchemaBase,
  MigrationRollbackSchema,
  MigrationHistorySchemaBase,
  MigrationHistorySchema,
  MigrationStatusSchemaBase,
  MigrationStatusSchema,
  // Output schemas
  DependencyGraphOutputSchema,
  TopologicalSortOutputSchema,
  CascadeSimulatorOutputSchema,
  SchemaSnapshotOutputSchema,
  ConstraintAnalysisOutputSchema,
  MigrationRisksOutputSchema,
  MigrationInitOutputSchema,
  MigrationRecordOutputSchema,
  MigrationRollbackOutputSchema,
  MigrationHistoryOutputSchema,
  MigrationStatusOutputSchema,
} from "./introspection.js";
