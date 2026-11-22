-- Cơ sở dữ liệu bản tối giản v1 — 16 bảng, 7 nhóm.
-- Nguyên tắc: một con số chỉ lưu ở một nơi; số theo dự án, theo nguồn, theo tháng đều cộng ra khi đọc.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);

-- 1. DANH MỤC ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS funding_sources(
  id TEXT PRIMARY KEY, name TEXT NOT NULL, ord INTEGER NOT NULL DEFAULT 0,
  city_assigned INTEGER NOT NULL DEFAULT 1 CHECK(city_assigned IN (0,1)));   -- 0 = thành phố không giao kịch bản

CREATE TABLE IF NOT EXISTS projects(
  id TEXT PRIMARY KEY, name TEXT NOT NULL, short_name TEXT NOT NULL,
  owner TEXT NOT NULL DEFAULT '',                       -- chủ đầu tư / đầu mối, dùng làm đầu mối mặc định của đề xuất
  total_investment INTEGER CHECK(total_investment >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)));

-- Dòng vốn = một dự án × một nguồn vốn × một năm. Đây là đơn vị nhỏ nhất mang KHV và số giải ngân.
CREATE TABLE IF NOT EXISTS funding_lines(
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
  source_id TEXT NOT NULL REFERENCES funding_sources(id), year INTEGER NOT NULL,
  label TEXT NOT NULL, plan_amount INTEGER NOT NULL CHECK(plan_amount >= 0),   -- KHV năm, đồng
  ord INTEGER NOT NULL DEFAULT 0, source_ref TEXT NOT NULL DEFAULT '');

-- 2. KỲ BÁO CÁO ------------------------------------------------------------------------------
-- kind 'tuan' = tuần ISO (thứ Hai–thứ Sáu); kind 'moc_nen' = số lũy kế đầu kỳ theo dõi.
CREATE TABLE IF NOT EXISTS periods(
  id TEXT PRIMARY KEY, year INTEGER NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('tuan','moc_nen')),
  start_date TEXT NOT NULL, end_date TEXT NOT NULL, locked INTEGER NOT NULL DEFAULT 0 CHECK(locked IN (0,1)),
  CHECK(start_date <= end_date));

-- 3. GIẢI NGÂN — một bảng duy nhất ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS batches(
  id TEXT PRIMARY KEY, channel TEXT NOT NULL, file_name TEXT NOT NULL DEFAULT '',
  sha256 TEXT, actor TEXT NOT NULL, at TEXT NOT NULL, summary_json TEXT NOT NULL DEFAULT '{}');
CREATE UNIQUE INDEX IF NOT EXISTS batches_sha ON batches(sha256) WHERE sha256 IS NOT NULL;

CREATE TABLE IF NOT EXISTS disbursements(
  id INTEGER PRIMARY KEY,
  line_id TEXT NOT NULL REFERENCES funding_lines(id),
  period_id TEXT NOT NULL REFERENCES periods(id),
  amount INTEGER NOT NULL CHECK(amount >= 0),                                   -- đồng
  state TEXT NOT NULL DEFAULT 'cho_xac_nhan' CHECK(state IN ('cho_xac_nhan','da_xac_nhan')),
  channel TEXT NOT NULL,                                                        -- excel | csv | tay | chuyen
  source_ref TEXT NOT NULL DEFAULT '', batch_id TEXT REFERENCES batches(id), note TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL, created_at TEXT NOT NULL, confirmed_by TEXT, confirmed_at TEXT,
  UNIQUE(line_id, period_id));
CREATE INDEX IF NOT EXISTS disb_period ON disbursements(period_id);

CREATE TRIGGER IF NOT EXISTS disb_lock_i BEFORE INSERT ON disbursements
  WHEN (SELECT locked FROM periods WHERE id = NEW.period_id) = 1 BEGIN SELECT RAISE(ABORT, 'Kỳ đã khóa sổ'); END;
CREATE TRIGGER IF NOT EXISTS disb_lock_u BEFORE UPDATE ON disbursements
  WHEN (SELECT locked FROM periods WHERE id = OLD.period_id) = 1 BEGIN SELECT RAISE(ABORT, 'Kỳ đã khóa sổ'); END;
CREATE TRIGGER IF NOT EXISTS disb_lock_d BEFORE DELETE ON disbursements
  WHEN (SELECT locked FROM periods WHERE id = OLD.period_id) = 1 BEGIN SELECT RAISE(ABORT, 'Kỳ đã khóa sổ'); END;

-- 4. KỊCH BẢN — số lũy kế mục tiêu đến cuối mỗi tháng ---------------------------------------
CREATE TABLE IF NOT EXISTS scenario_sets(
  id TEXT PRIMARY KEY, level TEXT NOT NULL CHECK(level IN ('phuong','thanh_pho')),
  name TEXT NOT NULL, year INTEGER NOT NULL, basis TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '');

-- Kịch bản phường đặt theo dòng vốn (scope 'line'); kịch bản thành phố giao theo nguồn (scope 'source').
CREATE TABLE IF NOT EXISTS scenario_points(
  set_id TEXT NOT NULL REFERENCES scenario_sets(id), scope_kind TEXT NOT NULL CHECK(scope_kind IN ('line','source')),
  scope_id TEXT NOT NULL, month INTEGER NOT NULL CHECK(month BETWEEN 1 AND 12),
  amount INTEGER NOT NULL CHECK(amount >= 0), source_ref TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(set_id, scope_kind, scope_id, month));

CREATE TABLE IF NOT EXISTS scenario_changes(
  id INTEGER PRIMARY KEY, at TEXT NOT NULL, actor TEXT NOT NULL, set_id TEXT NOT NULL, scope_kind TEXT NOT NULL,
  scope_id TEXT NOT NULL, month INTEGER NOT NULL, before_amount INTEGER, after_amount INTEGER NOT NULL, reason TEXT NOT NULL);
CREATE TRIGGER IF NOT EXISTS sc_no_u BEFORE UPDATE ON scenario_changes BEGIN SELECT RAISE(ABORT, 'Lịch sử kịch bản không được sửa'); END;
CREATE TRIGGER IF NOT EXISTS sc_no_d BEFORE DELETE ON scenario_changes BEGIN SELECT RAISE(ABORT, 'Lịch sử kịch bản không được xóa'); END;

-- 5. VƯỚNG MẮC – GIẢI PHÁP: một danh sách việc, sinh từ đề xuất tự động hoặc nhập tay ---------
CREATE TABLE IF NOT EXISTS actions(
  id INTEGER PRIMARY KEY, project_id TEXT REFERENCES projects(id),
  suggestion_key TEXT UNIQUE,                                                   -- quy_tac:du_an:ky, trống nếu nhập tay
  rule_id TEXT, problem TEXT NOT NULL, solution TEXT NOT NULL, owner TEXT NOT NULL, due TEXT,
  status TEXT NOT NULL DEFAULT 'mo' CHECK(status IN ('mo','dang_xu_ly','xong','huy')),
  result TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);

-- 6. HỆ THỐNG --------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','kinhte','bql','lanhdao')),
  password_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)));
CREATE TABLE IF NOT EXISTS assignments(
  user_id INTEGER NOT NULL REFERENCES users(id), project_id TEXT NOT NULL REFERENCES projects(id),
  PRIMARY KEY(user_id, project_id));
CREATE TABLE IF NOT EXISTS sessions(
  token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), csrf TEXT NOT NULL, expires INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS audit_log(
  id INTEGER PRIMARY KEY, at TEXT NOT NULL, actor TEXT NOT NULL, entity TEXT NOT NULL, entity_id TEXT NOT NULL,
  action TEXT NOT NULL, before_json TEXT, after_json TEXT, reason TEXT NOT NULL DEFAULT '');
CREATE TRIGGER IF NOT EXISTS audit_no_u BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'Nhật ký không được sửa'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_d BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'Nhật ký không được xóa'); END;

-- 7. NGUỒN ĐỒNG BỘ TỰ ĐỘNG (Google Sheets…) — phần mềm định kỳ tự đi lấy số ----------------
CREATE TABLE IF NOT EXISTS sync_sources(
  id INTEGER PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('gsheets')), url TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  interval_min INTEGER NOT NULL DEFAULT 5 CHECK(interval_min BETWEEN 1 AND 1440),
  last_check_at TEXT, last_change_at TEXT, last_hash TEXT, skipped_hash TEXT,
  last_status TEXT NOT NULL DEFAULT 'chua_chay', last_message TEXT NOT NULL DEFAULT '',
  last_goi_json TEXT,                                                          -- gói đọc được lần cuối, để duyệt phần lệch
  created_by TEXT NOT NULL, created_at TEXT NOT NULL);
