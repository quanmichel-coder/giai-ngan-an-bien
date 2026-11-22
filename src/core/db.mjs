// Kết nối SQLite, giao dịch, nhật ký và dữ liệu nền (nguồn vốn, kỳ tuần, bộ kịch bản).
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { NAM, NGUON_VON, boPhuong, boThanhPho } from './hang-so.mjs';

export const PHIEN_BAN_CSDL = '1';

export function moCsdl(path = process.env.DB_PATH || resolve('data/giai-ngan.sqlite')) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  napNen(db);
  return db;
}

/** Chạy fn trong một giao dịch; lỗi thì hoàn tác toàn bộ. */
export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

export const bayGio = () => new Date().toISOString();

export function nhatKy(db, actor, entity, id, action, before, after, reason = '') {
  db.prepare('INSERT INTO audit_log(at,actor,entity,entity_id,action,before_json,after_json,reason) VALUES(?,?,?,?,?,?,?,?)')
    .run(bayGio(), actor, entity, String(id), action, before == null ? null : JSON.stringify(before),
      after == null ? null : JSON.stringify(after), reason);
}

/** Tuần ISO của năm, mỗi tuần thứ Hai–thứ Sáu. Mã dạng 2026-T41. */
export function cacTuan(nam) {
  const jan4 = new Date(Date.UTC(nam, 0, 4));
  const thu2 = new Date(jan4); thu2.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7));
  const out = [];
  for (let w = 1; w <= 53; w++) {
    const s = new Date(thu2); s.setUTCDate(thu2.getUTCDate() + (w - 1) * 7);
    const e = new Date(s); e.setUTCDate(s.getUTCDate() + 4);
    // Tuần 53 chỉ tồn tại khi thứ Năm của nó còn thuộc năm đang xét.
    const thu5 = new Date(s); thu5.setUTCDate(s.getUTCDate() + 3);
    if (thu5.getUTCFullYear() !== nam) break;
    out.push({ id: `${nam}-T${String(w).padStart(2, '0')}`, start: s.toISOString().slice(0, 10), end: e.toISOString().slice(0, 10) });
  }
  return out;
}

function napNen(db, nam = NAM) {
  const coSan = db.prepare("SELECT value FROM meta WHERE key='schema_version'").get();
  if (!coSan) db.prepare("INSERT INTO meta(key,value) VALUES('schema_version',?)").run(PHIEN_BAN_CSDL);
  const ns = db.prepare('INSERT OR IGNORE INTO funding_sources(id,name,ord,city_assigned) VALUES(?,?,?,?)');
  for (const n of NGUON_VON) ns.run(n.id, n.name, n.ord, n.city_assigned);
  const k = db.prepare("INSERT OR IGNORE INTO periods(id,year,kind,start_date,end_date) VALUES(?,?,'tuan',?,?)");
  for (const t of cacTuan(nam)) k.run(t.id, nam, t.start, t.end);
  const b = db.prepare('INSERT OR IGNORE INTO scenario_sets(id,level,name,year,note) VALUES(?,?,?,?,?)');
  b.run(boPhuong(nam), 'phuong', `Kế hoạch giải ngân của phường năm ${nam}`, nam,
    'Phường tự lập, điều chỉnh theo điều hành thực tế; là mốc hệ thống dùng để chấm cảnh báo.');
  b.run(boThanhPho(nam), 'thanh_pho', `Kịch bản giải ngân thành phố giao năm ${nam}`, nam,
    'Số thành phố giao theo nguồn; chỉ cập nhật khi có văn bản giao hoặc điều chỉnh.');
}

/** Mã kỳ mốc nền của năm (số lũy kế đầu kỳ theo dõi). */
export const kyMocNen = (nam = NAM) => `${nam}-NEN`;

export function damBaoKyMocNen(db, nam, ngay) {
  db.prepare("INSERT OR IGNORE INTO periods(id,year,kind,start_date,end_date) VALUES(?,?,'moc_nen',?,?)").run(kyMocNen(nam), nam, ngay, ngay);
  return kyMocNen(nam);
}
