// The sync core for Node tests: public/sync.js is a classic script with a UMD wrapper, so Node loads it with require.
// With SYNC_ERA=1 in the environment every engine is made in the mode of docs/OWNER-ERA-PLAN.md (stage 2): a writer with the era of its store at the
// moment it is made (a new screen reads both together) and the rules (deps.ownerModel), with runners made for it by the test page of
// tests/lib/erapage.mjs; a deletion that names no reach is confirmed as «all», as a user of a signed-in device confirms it. `syncerasim.mjs` runs the
// randomized simulation that way. The scenarios that pin main's own answers (an old engine that goes on after its own erase, lazy loads, «reload» for
// a kept change) are not meant to pass under it.
import { createRequire } from 'node:module';
import * as ownerModel from '../../public/owner/model.js';
import { eraPage } from './erapage.mjs';
export function loadCore(){ const C=createRequire(import.meta.url)('../../public/sync.js'); if(!process.env.SYNC_ERA) return C;
  return {...C, makeSync:deps=>{ const e=eraPage(C, {...deps, era:ownerModel.eraOf((deps.db.get && deps.db.get('sync','epoch'))||null), ownerModel});
    const purge=e.purgeLocal, version=e.versionLocal; e.purgeLocal=(id,o={})=>purge(id,{reach:'all', ...o}); e.versionLocal=op=>version(op && op.op==='delete'? {reach:'all', ...op} : op); return e; }}; }
