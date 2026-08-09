const fs = require('fs');
const path = require('path');

const packagesDir = path.resolve(__dirname, '../packages');
const folders = fs.readdirSync(packagesDir);

const ignoreFolders = [
    'benchmark',
    'example'
]; 

let hasError = false;

console.log('Verifying package.json configurations...\n');

folders.forEach(folder => {
  if (ignoreFolders.includes(folder)) return;

  const pkgPath = path.join(packagesDir, folder, 'package.json');
  if (!fs.existsSync(pkgPath)) return;

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  if (pkg.private) {
    console.log(`Skipping private package: packages/${folder}`);
    return;
  }

  const requiredFields = ['name', 'version', 'main', 'types'];
  requiredFields.forEach(field => {
    if (!pkg[field]) {
      console.error(`Missing "${field}" in packages/${folder}/package.json`);
      hasError = true;
    }
  });
});

if (hasError) {
  process.exit(1);
} else {
  console.log('\nAll public packages are correctly configured!');
}