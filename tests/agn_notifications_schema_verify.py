"""Run: python tests/agn_notifications_schema_verify.py (Python standard library only)."""
import sqlite3
from pathlib import Path
p=Path(__file__).resolve().parent.parent
c=sqlite3.connect(':memory:')
c.execute('CREATE TABLE users(id TEXT PRIMARY KEY,role TEXT)')
c.execute('CREATE TABLE attendance_records(id TEXT PRIMARY KEY,user_id TEXT)')
c.execute('CREATE TABLE holidays(id TEXT PRIMARY KEY,date TEXT,end_date TEXT)')
c.execute("INSERT INTO users VALUES ('office-staff','super_admin')")
c.execute("INSERT INTO attendance_records VALUES ('attendance-1','office-staff')")
c.execute("INSERT INTO holidays VALUES ('holiday-1','2026-10-20','2026-10-20')")
c.executescript((p/'migrations/0004_campus_ambassadors.sql').read_text())
c.executescript((p/'migrations/0005_ambassador_notifications.sql').read_text())
c.executescript((p/'migrations/0005_ambassador_notifications.sql').read_text())
for table in ['amb_notification_preferences','amb_notifications','amb_push_subscriptions','amb_notification_deliveries']:
 assert c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?",(table,)).fetchone()
assert c.execute("SELECT id FROM users").fetchone()[0]=='office-staff'
assert c.execute("SELECT id FROM attendance_records").fetchone()[0]=='attendance-1'
assert c.execute("SELECT end_date FROM holidays").fetchone()[0]=='2026-10-20'
assert c.execute("SELECT enabled FROM amb_module_settings WHERE id='default'").fetchone()[0]==0
c.execute("INSERT INTO amb_notification_preferences(owner_type,owner_id) VALUES('ambassador','amb-id')")
assert c.execute("SELECT daily_reminder,push_enabled FROM amb_notification_preferences").fetchone()==(0,0)
print('PASS: 0005 additive/idempotent; existing office records preserved; push/reminders off by default')
