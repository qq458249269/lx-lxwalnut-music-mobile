const parser = require('@babel/parser');
const fs = require('fs');
const path = require('path');
const root = process.argv[2];
const fails = [];
let count = 0;
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === '.git') continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(ent.name)) {
      count++;
      const code = fs.readFileSync(p, 'utf8');
      try {
        parser.parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'], errorRecovery: true });
      } catch (e) {
        fails.push(p + ' -> ' + e.message.split('\n')[0]);
      }
    }
  }
}
walk(root);
console.log('checked=' + count + ' fails=' + fails.length);
for (const f of fails) console.log('FAIL ' + f);