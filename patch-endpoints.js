import fs from "fs";
import path from "path";

const dir = "tests/e2e";
const files = fs.readdirSync(dir).filter(f => f.endsWith(".spec.ts"));

let patchedCount = 0;
for (const file of files) {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, "utf-8");
  let modified = false;

  // 1. Replace hardcoded postgres DB URLs
  if (content.includes("postgres://postgres:postgres@localhost:5432/postgres")) {
    content = content.replace(/"postgres:\/\/postgres:postgres@localhost:5432\/postgres"/g, "process.env.MCP_TEST_DB || \"postgres://postgres:postgres@localhost:5432/postgres\"");
    modified = true;
  }

  // 2. Replace http://localhost:3000
  if (content.includes("http://localhost:3000")) {
    // If it's inside double quotes: "http://localhost:3000..." -> `${process.env.MCP_TEST_URL || 'http://localhost:3000'}...`
    content = content.replace(/"http:\/\/localhost:3000([^"]*)"/g, "`\${process.env.MCP_TEST_URL || 'http://localhost:3000'}$1`");
    
    // If it's already inside backticks (e.g. `http://localhost:3000/sse`)
    content = content.replace(/`http:\/\/localhost:3000([^`]*)`/g, "`\${process.env.MCP_TEST_URL || 'http://localhost:3000'}$1`");

    // If it's single quotes
    content = content.replace(/'http:\/\/localhost:3000([^']*)'/g, "`\${process.env.MCP_TEST_URL || 'http://localhost:3000'}$1`");
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(filePath, content);
    console.log(`Patched ${file}`);
    patchedCount++;
  }
}
console.log(`Patched ${patchedCount} files.`);
