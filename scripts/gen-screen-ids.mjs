// 画面ID一覧（docs/SCREEN_IDS.md）を、src/screenIds.js の表から作る。使い方: node scripts/gen-screen-ids.mjs
import { writeFileSync } from 'node:fs';
import { screenIdsDoc } from '../src/screenIdsDoc.js';

writeFileSync(new URL('../docs/SCREEN_IDS.md', import.meta.url), screenIdsDoc());
console.log('docs/SCREEN_IDS.md を作りました');
