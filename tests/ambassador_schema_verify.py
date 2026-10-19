"""Optional dependency-free, destructive-operation-free SQLite smoke test.

Runs against :memory: only; NEVER accesses production D1.
Use: python tests/ambassador_schema_verify.py
"""
from pathlib import Path
import sqlite3

root = Path(__file__).resolve().parents[1]
db = sqlite3.connect(':memory:')
db.execute('PRAGMA foreign_keys=ON')
for name in ('0001_initial.sql', '0002_account_security.sql', '0003_holiday_date_ranges.sql'):
    db.executescript((root / 'migrations' / name).read_text(encoding='utf-8'))
db.execute("INSERT INTO users(id,employee_id,name,role,joining_date,password_hash) VALUES('office','ADMIN','Admin','super_admin','2026-01-01','hash')")
db.execute("INSERT INTO attendance_records(id,user_id,attendance_date) VALUES('att','office','2026-10-19')")
db.execute("INSERT INTO holidays(id,name,date) VALUES('hol','Old holiday','2026-10-19')")
db.executescript((root / 'migrations/0004_campus_ambassadors.sql').read_text(encoding='utf-8'))
for table in ('users','attendance_records','holidays'):
    assert db.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0] == 1, table
assert db.execute('SELECT enabled FROM amb_module_settings').fetchone()[0] == 0
assert db.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name LIKE 'amb_%'").fetchone()[0] == 10
sql = (root / 'migrations/0004_campus_ambassadors.sql').read_text(encoding='utf-8').upper()
for banned in ('DROP TABLE USERS', 'DELETE FROM USERS', 'ALTER TABLE USERS', 'DROP TABLE ATTENDANCE_RECORDS'):
    assert banned not in sql, banned
print('PASS — existing office records preserved, 10 isolated tables, Hub initially disabled')
