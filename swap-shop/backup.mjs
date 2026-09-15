import { DatabaseSync, backup } from 'node:sqlite';
process.umask(0o077);
const path = '/home/vwarc/swap-private/backups/shop-' + Date.now() + '.sqlite';
const db = new DatabaseSync('/home/vwarc/swap-private/shop.sqlite', { readOnly: true });
await backup(db, path);
db.close();
const check = new DatabaseSync(path, { readOnly: true });
if (check.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') {
  throw Error('Backup check failed');
}
check.close();
console.log('Backup verified: ' + path);
