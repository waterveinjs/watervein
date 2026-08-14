const fs = require('fs');
const path = require('path');

const packagesDir = path.resolve(__dirname, '../packages');
const folders = fs.readdirSync(packagesDir);

let hasError = false;

folders.forEach(folder => {
  const pkgPath = path.join(packagesDir, folder, 'package.json');
  if (!fs.existsSync(pkgPath)) return;

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  if (pkg.private) return;

  const checkFileExists = (filePath, key) => {
    if (!filePath) return;
    const resolved = path.resolve(packagesDir, folder, filePath);
    if (!fs.existsSync(resolved)) {
      console.error(`[${folder}] Field "${key}" points to missing file: ${filePath}`);
      hasError = true;
    }
  };

  checkFileExists(pkg.main, 'main');
  checkFileExists(pkg.module, 'module');
  checkFileExists(pkg.types, 'types');
});

if (hasError) process.exit(1);
console.log('All exported file paths are valid!');