/**
 * postgres-mcp - Extension Schemas Barrel
 *
 * Re-exports all extension schemas from modular files:
 * - pg_stat_kcache
 * - citext
 * - ltree
 * - pgcrypto
 */

// Shared utilities
export { normalizeOptionalParams } from "./shared.js";

// pg_stat_kcache schemas
export {
  KcacheQueryStatsSchemaBase,
  KcacheQueryStatsSchema,
  KcacheTopConsumersSchema,
  KcacheTopCpuSchemaBase,
  KcacheTopIoSchemaBase,
  KcacheDatabaseStatsSchemaBase,
  KcacheDatabaseStatsSchema,
  KcacheResourceAnalysisSchemaBase,
  KcacheResourceAnalysisSchema,
  KcacheCreateExtensionOutputSchema,
  KcacheQueryStatsOutputSchema,
  KcacheTopCpuOutputSchema,
  KcacheTopIoOutputSchema,
  KcacheDatabaseStatsOutputSchema,
  KcacheResourceAnalysisOutputSchema,
  KcacheResetOutputSchema,
} from "./kcache.js";

// citext schemas
export {
  preprocessCitextTableParams,
  CitextCompareSchemaBase,
  CitextCompareSchema,
  CitextConvertColumnSchemaBase,
  CitextConvertColumnSchema,
  CitextListColumnsSchemaBase,
  CitextListColumnsSchema,
  CitextAnalyzeCandidatesSchemaBase,
  CitextAnalyzeCandidatesSchema,
  CitextSchemaAdvisorSchemaBase,
  CitextSchemaAdvisorSchema,
  CitextCreateExtensionOutputSchema,
  CitextConvertColumnOutputSchema,
  CitextListColumnsOutputSchema,
  CitextAnalyzeCandidatesOutputSchema,
  CitextCompareOutputSchema,
  CitextSchemaAdvisorOutputSchema,
} from "./citext.js";

// ltree schemas
export {
  LtreeQuerySchemaBase,
  LtreeQuerySchema,
  LtreeSubpathSchemaBase,
  LtreeSubpathSchema,
  LtreeLcaSchemaBase,
  LtreeLcaSchema,
  LtreeMatchSchemaBase,
  LtreeMatchSchema,
  LtreeListColumnsSchemaBase,
  LtreeListColumnsSchema,
  LtreeConvertColumnSchemaBase,
  LtreeConvertColumnSchema,
  LtreeIndexSchemaBase,
  LtreeIndexSchema,
  LtreeCreateExtensionOutputSchema,
  LtreeQueryOutputSchema,
  LtreeSubpathOutputSchema,
  LtreeLcaOutputSchema,
  LtreeMatchOutputSchema,
  LtreeListColumnsOutputSchema,
  LtreeConvertColumnOutputSchema,
  LtreeCreateIndexOutputSchema,
} from "./ltree.js";

// pgcrypto schemas
export {
  PgcryptoHashSchemaBase,
  PgcryptoHashSchema,
  PgcryptoHmacSchemaBase,
  PgcryptoHmacSchema,
  PgcryptoEncryptSchemaBase,
  PgcryptoEncryptSchema,
  PgcryptoDecryptSchemaBase,
  PgcryptoDecryptSchema,
  PgcryptoRandomBytesSchemaBase,
  PgcryptoRandomBytesSchema,
  PgcryptoGenSaltSchemaBase,
  PgcryptoGenSaltSchema,
  PgcryptoCryptSchema,
  PgcryptoCreateExtensionOutputSchema,
  PgcryptoHashOutputSchema,
  PgcryptoHmacOutputSchema,
  PgcryptoEncryptOutputSchema,
  PgcryptoDecryptOutputSchema,
  PgcryptoGenRandomUuidOutputSchema,
  PgcryptoGenRandomBytesOutputSchema,
  PgcryptoGenSaltOutputSchema,
  PgcryptoCryptOutputSchema,
} from "./pgcrypto.js";
