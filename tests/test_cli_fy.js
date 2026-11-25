const { FinancialService } = require('../dist/main/services/financialService');
const { initDatabase, getDatabase } = require('../dist/main/db/index');
const path = require('path');
const os = require('os');
const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'curtissbooks', 'data', 'curtissbooks.db');
initDatabase(dbPath);

console.log('--- ALL CATEGORIES ---');
const all = FinancialService.getReusableCategories('', true);
console.log(`Total: ${all.length}`);
all.forEach(c => {
  console.log(`  ID: ${c.id} | Code: ${c.category_code} | Name: ${c.name} | Parent: ${c.parent_id} | is_parent: ${c.is_parent}`);
});

console.log('\n--- SEARCH TEST: "Class" ---');
const resClass = FinancialService.getReusableCategories('Class', true);
console.log(resClass.map(c => `${c.category_code}: ${c.name}`));

console.log('\n--- SEARCH TEST: "Fuel" ---');
const resFuel = FinancialService.getReusableCategories('Fuel', true);
console.log(resFuel.map(c => `${c.category_code}: ${c.name}`));

console.log('\n--- SEARCH TEST: "Rex" ---');
const resRex = FinancialService.getReusableCategories('Rex', true);
console.log(resRex.map(c => `${c.category_code}: ${c.name}`));
