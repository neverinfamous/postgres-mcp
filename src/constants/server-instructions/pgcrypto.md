# pgcrypto Tools

Core: `createExtension()`, `hash()`, `hmac()`, `encrypt()`, `decrypt()`, `genRandomUuid()`, `genRandomBytes()`, `genSalt()`, `crypt()`

- `pg_pgcrypto_create_extension`: Enable pgcrypto extension (idempotent). Returns `{success, message}`
- `pg_pgcrypto_hash`: Hash data using digest algorithms. `algorithm`: 'md5', 'sha1', 'sha224', 'sha256', 'sha384', 'sha512'. `encoding`: 'hex' (default), 'base64'. Returns `{hash, algorithm, encoding, inputLength}`
- `pg_pgcrypto_hmac`: HMAC authentication. Same algorithms as hash. Returns `{hmac, algorithm, encoding}`. `key` param for secret
- `pg_pgcrypto_encrypt`: PGP symmetric encryption. `data` + `password`/`key` (aliases). Optional `options` for cipher config (e.g., 'cipher-algo=aes256'). Returns `{encryptedData, encoding: 'base64'}`
- `pg_pgcrypto_decrypt`: Decrypt PGP-encrypted data. `data`/`encryptedData` + `password`/`key` (aliases). Returns `{decrypted, verified}`. ⛔ Returns `{success: false, error: ...}` on wrong key/corrupt data
- `pg_pgcrypto_gen_random_uuid`: Generate UUID v4. Optional `count` (1-100, default 1). Returns `{uuid, uuids, count}` (`uuid` convenience property for single requests)
- `pg_pgcrypto_gen_random_bytes`: Generate random bytes. `length` (1-1024). `encoding`: 'hex' (default), 'base64'. Returns `{randomBytes, length, encoding}`
- `pg_pgcrypto_gen_salt`: Generate salt for crypt(). `type`: 'bf' (bcrypt, recommended), 'md5', 'xdes', 'des'. Optional `iterations` for bf (4-31) or xdes. Returns `{salt, type}`
- `pg_pgcrypto_crypt`: Hash password with salt. Use stored hash as salt for verification. Returns `{hash, algorithm}`. Verification: `crypt(password, storedHash).hash === storedHash`

**Password Workflow**: 1) `genSalt({type:'bf', iterations:10})` → 2) `crypt({password, salt})` → store hash → 3) Verify: `crypt({password, salt: storedHash})` and compare hashes

**Top-Level Aliases**: `pg.pgcryptoHash()`, `pg.pgcryptoEncrypt()`, `pg.pgcryptoDecrypt()`, `pg.pgcryptoGenRandomUuid()`, etc.

**Discovery**: `pg.pgcrypto.help()` returns `{methods, methodAliases, examples}` object
