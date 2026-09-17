import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const env = { ...process.env };
const studioJava = '/Applications/Android Studio.app/Contents/jbr/Contents/Home';
if (process.platform === 'darwin' && existsSync(`${studioJava}/bin/java`)) {
  env.JAVA_HOME = studioJava;
}
const windows = process.platform === 'win32';
const result = spawnSync(windows ? 'gradlew.bat' : 'sh',
  windows ? ['assembleDebug'] : ['./gradlew', 'assembleDebug'], {
    cwd: new URL('../android/', import.meta.url),
    env,
    stdio: 'inherit',
    shell: windows,
  });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
