import fs from "fs";
import path from "path";

const filesToSerialize = [
  "auth.spec.ts",
  "stateless.spec.ts",
  "oauth-discovery.spec.ts",
  "session-advanced.spec.ts",
  "oauth-scopes.spec.ts",
  "rate-limiting.spec.ts"
];

for (const file of filesToSerialize) {
  const filePath = path.join("tests/e2e", file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, "utf-8");
    // Replace test.describe(...) with test.describe.serial(...)
    content = content.replace(/test\.describe\("/g, 'test.describe.serial("');
    fs.writeFileSync(filePath, content);
    console.log(`Patched ${file} for serial execution`);
  }
}
