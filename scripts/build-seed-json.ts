// Writes the demonstration dataset to supabase/.seed.json for the seed-demo function.
// Run: npx vite-node scripts/build-seed-json.ts
import fs from 'node:fs';
import { buildSeed } from '../src/mock/seed';

fs.writeFileSync('supabase/.seed.json', JSON.stringify(buildSeed(Date.now())));
console.log('Wrote supabase/.seed.json');
