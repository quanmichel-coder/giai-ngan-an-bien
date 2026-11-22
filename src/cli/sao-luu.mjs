// Sao lưu cơ sở dữ liệu thành một tệp nguyên vẹn (VACUUM INTO), giữ 30 bản gần nhất.
//   DB_PATH=... node src/cli/sao-luu.mjs <thư-mục-sao-lưu>
import { mkdirSync, readdirSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { moCsdl } from '../core/db.mjs';

const thuMuc = process.argv[2] || 'data/sao-luu';
mkdirSync(thuMuc, { recursive: true });
const tep = join(thuMuc, `giai-ngan-${new Date().toISOString().slice(0, 10)}.sqlite`);
if (existsSync(tep)) { console.log('Hôm nay đã sao lưu:', tep); process.exit(0); }
const db = moCsdl();
db.prepare('VACUUM INTO ?').run(tep);
const ok = db.prepare('PRAGMA integrity_check').get();
console.log('Đã sao lưu:', tep, '· kiểm tra toàn vẹn:', Object.values(ok)[0]);
const cu = readdirSync(thuMuc).filter(f => /^giai-ngan-\d{4}-\d{2}-\d{2}\.sqlite$/.test(f)).sort();
for (const f of cu.slice(0, Math.max(0, cu.length - 30))) unlinkSync(join(thuMuc, f));
