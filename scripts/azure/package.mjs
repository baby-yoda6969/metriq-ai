// Manual release packager. Run builds first; secrets and local node_modules
// are never copied. Azure installs only pinned runtime dependencies on Linux.
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
const [target, destination] = process.argv.slice(2);
if (!['website', 'mobile'].includes(target) || !destination) throw new Error('Usage: node scripts/azure/package.mjs website|mobile /absolute/staging/path');
const root = process.cwd();
const source = target === 'website' ? join(root, 'website') : root;
const output = resolve(destination);
if (output.startsWith(root + '/')) throw new Error('Stage outside the repository to avoid copying release outputs into source.');
mkdirSync(output, { recursive: true, mode: 0o700 });
for (const directory of ['server', 'dist']) cpSync(join(source, directory), join(output, directory), { recursive: true, filter: path => !path.endsWith('.test.js') });
if (target === 'mobile') {
  mkdirSync(join(output, 'src/data'), { recursive: true });
  cpSync(join(root, 'src/data/demoProducts.js'), join(output, 'src/data/demoProducts.js'));
}
const lock = JSON.parse(readFileSync(join(source, 'package-lock.json'), 'utf8'));
const modules = target === 'website' ? ['express', 'cors', 'dotenv'] : ['express', 'cors', 'dotenv', 'sharp', 'pdf-parse'];
const dependencies = Object.fromEntries(modules.map(name => [name, lock.packages[`node_modules/${name}`].version]));
writeFileSync(join(output, 'package.json'), JSON.stringify({ name: `metriq-${target}-release`, version: '1.0.0', private: true, type: 'module', engines: { node: '22.x' }, scripts: { start: 'node server/index.js' }, dependencies }, null, 2));
const result = spawnSync('npm', ['install', '--package-lock-only', '--ignore-scripts', '--omit=dev'], { cwd: output, stdio: 'inherit' });
if (result.status) process.exit(result.status);
console.log(`Release staged: ${output}`);
