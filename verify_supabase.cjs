const fs = require('fs');
const path = require('path');

const base = 'C:/Users/frank/Documents/DigitallyDefined-Backend/supabase/functions';
let total = 0, ok = 0, fail = 0;
let errors = [];

function walk(dir) {
  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    const fp = path.join(dir, entry);
    const st = fs.statSync(fp);
    if (st.isDirectory()) { walk(fp); continue; }
    if (!entry.endsWith('.ts')) return;
    total++;
    try {
      const content = fs.readFileSync(fp, 'utf-8');
      const rel = path.relative(base, fp);

      // Check no process.env references
      if (/process\.env\./.test(content)) {
        errors.push(rel + ': still has process.env');
        fail++;
        continue;
      }

      // Check brace/paren balance
      let d = { '{': 0, '}': 0, '(': 0, ')': 0, '[': 0, ']': 0 };
      let inStr = false;
      for (let i = 0; i < content.length; i++) {
        const ch = content[i];
        if (inStr) { if (ch === '"' || ch === "'" || ch === '`') inStr = false; continue; }
        if (ch === '"' || ch === "'" || ch === '`') { inStr = true; continue; }
        if (d.hasOwnProperty(ch)) d[ch]++;
      }

      if (d['{'] !== d['}'] || d['('] !== d[')'] || d['['] !== d[']']) {
        errors.push(rel + ': unbalanced braces ()[]{} (' + JSON.stringify(d) + ')');
        fail++;
        continue;
      }

      ok++;
    } catch(e) {
      errors.push(path.relative(base, fp) + ': ' + e.message);
      fail++;
    }
  }
}

walk(base);
console.log(total + ' files checked:', ok + ' OK', fail + ' FAIL');
if (fail > 0) errors.forEach(e => console.log('  FAIL:', e));
else console.log('All ' + total + ' files passed structural validation.');
