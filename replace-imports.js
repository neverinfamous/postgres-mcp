import fs from "fs";
import path from "path";

const dir = "tests/e2e";
const files = fs.readdirSync(dir).filter(f => f.endsWith(".spec.ts"));

let count = 0;
for (const file of files) {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, "utf-8");
  if (content.includes('@playwright/test')) {
    // Standard replace
    content = content.replace(/import\s*\{\s*test\s*,\s*expect\s*\}\s*from\s*["']@playwright\/test["'];/g, 'import { test, expect } from "./fixtures.js";');
    
    // Some files might only import test
    content = content.replace(/import\s*\{\s*test\s*\}\s*from\s*["']@playwright\/test["'];/g, 'import { test } from "./fixtures.js";');
    
    fs.writeFileSync(filePath, content);
    count++;
  }
}
console.log(`Replaced imports in ${count} files.`);
