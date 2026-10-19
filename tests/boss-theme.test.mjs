import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const css = read('src/theme/boss-theme.css');
const theme = read('src/theme/ThemeContext.tsx');
const html = read('index.html');
const entry = read('src/App.tsx');

test('theme stores only light or dark and does not depend on attendance data', () => {
  assert.match(theme, /'boss-ui-theme-v1'/);
  assert.match(theme, /window\.localStorage\.setItem/);
  assert.match(theme, /window\.addEventListener\('storage'/);
  assert.doesNotMatch(theme, /apiRequest|\/api\/|D1|fetch\(/);
  assert.match(entry, /<BossThemeProvider>/);
  assert.match(entry, /boss-employee/);
});
test('initial appearance is applied before the app script loads', () => {
  assert.ok(html.indexOf('data-boss-theme=') > -1);
  assert.ok(html.indexOf('boss-ui-theme-v1') < html.indexOf('src="/src/main.tsx"'));
  assert.match(html, /theme-color/);
});
test('both light and dark visual scopes cover employee, ambassador, and authentication screens', () => {
  for(const token of ['data-boss-theme="dark"','data-boss-theme="light"',
    '.boss-employee','.boss-ambassador','.boss-auth','.boss-chrome',
    'bg-white','bg-slate-900','border-slate-800','text-slate-700',
    'text-white','text-teal-300', 'boss-theme-toggle'])
    assert.ok(css.includes(token),`missing styling ${token}`);
});
test('theme toggles accessible on employee and ambassador screens', () => {
  for(const path of ['src/components/layout/Navbar.tsx',
    'src/components/auth/LoginView.tsx','src/components/auth/BootstrapView.tsx',
    'src/components/ambassadors/AmbassadorPortal.tsx'])
    assert.match(read(path),/<ThemeToggle/,`appearance toggle missing in ${path}`);
  assert.match(read('src/components/layout/ThemeToggle.tsx'), /aria-label/);
  assert.match(read('src/components/layout/ThemeToggle.tsx'), /aria-pressed/);
});
// Contrast math validates chosen neutral tokens and the main teal action against their backgrounds.
function lum(hex){const n=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255)
  .map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*n[0]+.7152*n[1]+.0722*n[2];}
function ratio(a,b){const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
test('neutral and accent text contrast meets WCAG AA normal-text ratio',()=>{
 for(const [fg,bg] of [
   ['#f8fafc','#142137'], ['#cbd5e1','#142137'],
   ['#0f172a','#ffffff'],['#64748b','#ffffff'],
   ['#0f766e','#ffffff'],['#f1f5f9','#0f172a'],
 ])assert.ok(ratio(fg,bg)>=4.5,`${fg} on ${bg} has ratio ${ratio(fg,bg).toFixed(2)}`);
});
