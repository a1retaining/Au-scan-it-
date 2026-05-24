import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const buildId = 'AU-ASX-INSTITUTIONAL-DESK-V23';
const dist = path.join(process.cwd(), 'frontend', 'dist');

function walk(dir) {
  const out = [];
  for (const item of readdirSync(dir)) {
    const full = path.join(dir, item);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const files = walk(dist).filter((f) => /\.(html|js|css)$/.test(f));
const found = files.some((f) => readFileSync(f, 'utf8').includes(buildId));
if (!found) {
  console.error(`Build verification failed: ${buildId} was not found in frontend/dist.`);
  process.exit(1);
}
console.log(`Build verification passed: ${buildId} found in frontend/dist.`);
