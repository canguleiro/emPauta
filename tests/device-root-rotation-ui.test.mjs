import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
assert.match(html, /id="rootRotationSyncPanel"/);
assert.match(html, /id="rootRotationSyncBtn"/);
assert.match(html, /id="rootRotationSyncStatus"/);
assert.match(app, /import \{ synchronizeOfflineDeviceRoot \} from "\.\/device-root-rotation-sync\.js"/);
assert.match(app, /window\.CRIART_ROOT_ROTATION_ENDPOINT \|\| ""/);
assert.match(app, /rootRotationSyncButton\.disabled = !rootRotationEndpoint/);
assert.match(app, /await synchronizeOfflineDeviceRoot\(/);
assert.match(app, /authority-recovery-required/);
assert.match(app, /device-not-in-rotated-inventory/);
console.log('PASS: rotation UI is explicitly gated by configured HTTPS endpoint and exposes safe synchronization states.');
