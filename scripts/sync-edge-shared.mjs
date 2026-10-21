// Copies the pure business-logic modules from src/ into supabase/functions/_shared
// (rewriting imports for Deno) so the browser and the Edge Function share one source of truth.
// Run: npm run sync:edge
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'supabase/functions/_shared');
fs.mkdirSync(out, { recursive: true });

const files = {
  'src/types/index.ts': 'types.ts',
  'src/lib/text.ts': 'text.ts',
  'src/lib/format.ts': 'format.ts',
  'src/lib/smsParser.ts': 'smsParser.ts',
  'src/lib/smsReplies.ts': 'smsReplies.ts',
  'src/lib/priority.ts': 'priority.ts',
  'src/lib/hotspot.ts': 'hotspot.ts',
  'src/lib/workflow.ts': 'workflow.ts',
  'src/data/locations.ts': 'locations.ts',
  'src/data/diseases.ts': 'diseases.ts',
  'src/data/users.ts': 'users.ts',
  'src/data/config.ts': 'config.ts',
  'src/mock/seed.ts': 'seed.ts',
};

for (const [src, dest] of Object.entries(files)) {
  let code = fs.readFileSync(path.join(root, src), 'utf8');
  code = code
    .replace(/from '@\/types'/g, "from './types.ts'")
    .replace(/from '@\/(?:lib|data)\/(\w+)'/g, "from './$1.ts'")
    .replace(/from '\.\/text'/g, "from './text.ts'")
    .replace(/from '\.\/smsParser'/g, "from './smsParser.ts'")
    .replace(/import type \{ DbState \} from '\.\/db';/, '// deno-lint-ignore no-explicit-any\ntype DbState = any;');
  fs.writeFileSync(path.join(out, dest), `// GENERATED from ${src} by scripts/sync-edge-shared.mjs. Do not edit.\n${code}`);
}
console.log(`Synced ${Object.keys(files).length} files to supabase/functions/_shared`);
