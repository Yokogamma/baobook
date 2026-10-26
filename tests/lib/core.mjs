// The sync core for Node tests: public/sync.js is a classic script with a UMD wrapper, so Node loads it with require.
import { createRequire } from 'node:module';
export function loadCore(){ return createRequire(import.meta.url)('../../public/sync.js'); }
