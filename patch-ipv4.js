import fs from "fs";
import path from "path";

const dir = "tests/e2e";
const files = fs.readdirSync(dir).filter(f => f.endsWith(".spec.ts"));

for (const file of files) {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, "utf-8");
  if (content.includes("http://localhost:")) {
    content = content.replace(/http:\/\/localhost:/g, 'http://127.0.0.1:');
    fs.writeFileSync(filePath, content);
    console.log(`Patched localhost in ${file}`);
  }
}
