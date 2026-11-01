// Regression checks for Boss v7.1 navigation simplification.
// Tests use Node built-ins; no npm installation or database is required.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const sidebar = source('src/components/layout/Sidebar.tsx');
const mobile = source('src/components/layout/MobileNav.tsx');
const app = source('src/App.tsx');
const requests = source('src/components/requests/RequestsApprovalsView.tsx');

test('desktop sidebar uses only the unified Requests & Approvals entry', () => {
  const items = sidebar.slice(sidebar.indexOf('const navItems = ['), sidebar.indexOf('];', sidebar.indexOf('const navItems = [')));
  assert.match(items, /id: 'requests' as NavTab/);
  assert.match(items, /label: 'Requests & Approvals'/);
  assert.doesNotMatch(items, /id: 'leaves' as NavTab/);
  assert.doesNotMatch(items, /id: 'remote' as NavTab/);
  assert.match(items, /id: 'crm' as NavTab/);
  assert.match(items, /id: 'commission_team' as NavTab/);
  assert.match(sidebar, /AGN_CONTACT\.whatsappUrl/);
});

test('mobile offers Requests in bottom navigation without duplicate Leave/Remote tiles', () => {
  const more = mobile.slice(mobile.indexOf('const moreItems = ['), mobile.indexOf('];', mobile.indexOf('const moreItems = [')));
  assert.doesNotMatch(more, /id: 'leaves' as NavTab/);
  assert.doesNotMatch(more, /id: 'remote' as NavTab/);
  assert.match(mobile, /handleSelect\('requests'\)/);
  assert.match(more, /id: 'history' as NavTab/);
});

test('all leave, remote and correction tabs and action callbacks remain intact', () => {
  for (const tab of ['leave', 'remote', 'corrections']) {
    assert.match(requests, new RegExp("setSubTab\\('" + tab + "'\\)"));
  }
  for (const label of ['Leave Requests', 'Remote Work', 'Attendance Corrections', 'Apply for Leave', 'Request Remote Date', 'Request Correction', 'Adjust Employee Attendance']) {
    assert.ok(requests.includes(label), 'Missing request action/tab: ' + label);
  }
  for (const action of ['onOpenLeaveModal', 'onOpenRemoteModal', 'onOpenCorrectionModal']) {
    assert.match(app, new RegExp(action + "=\\{\\(\\) => setShow"));
  }
  assert.match(app, /currentTab === 'requests'/);
  assert.match(app, /currentTab === 'leaves'/); // Backwards-compatible legacy view only; no nav link.
  assert.match(app, /currentTab === 'remote'/);
});

test('no database, worker or API behavior is changed by this package', () => {
  const files = ['src/components/layout/Sidebar.tsx', 'src/components/layout/MobileNav.tsx'];
  for (const name of files) {
    const body = source(name);
    assert.doesNotMatch(body, /\b(?:DB\.prepare|apiRequest|fetch\()\b/);
  }
});
