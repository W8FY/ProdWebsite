import { readFileSync } from 'node:fs';
import { extname, isAbsolute } from 'node:path';
import { Shop, Fault } from './store.mjs';
import { readMemberWorkbook } from './excel-members.mjs';

process.umask(0o077);
let shop;
try {
  const args = process.argv.slice(2), file = args.shift();
  let dryRun = false, allowEmpty = false, exportedAt;
  while (args.length) {
    const option = args.shift();
    if (option === '--dry-run') dryRun = true;
    else if (option === '--allow-empty') allowEmpty = true;
    else if (option === '--exported-at') exportedAt = args.shift();
    else throw new Fault(400, 'Unknown import option.');
  }
  if (!file) throw new Fault(400, 'Usage: node import-members.mjs <members.xlsx|members.json> [--dry-run] [--exported-at <ISO timestamp>] [--allow-empty]');
  const now = Date.now();
  let snapshot, summary;
  if (extname(file).toLowerCase() === '.xlsx') {
    const result = await readMemberWorkbook(file, now);
    summary = result.summary;
    if (!dryRun && !exportedAt) throw new Fault(400, 'Excel imports require --exported-at with the actual export time and timezone. Do not use the import time.');
    snapshot = { members: result.members, generated_at: exportedAt };
    if (!dryRun && !snapshot.members.length && !allowEmpty) throw new Fault(400, 'No eligible rows. Review with --dry-run; use --allow-empty only to deliberately revoke all members.');
  } else if (extname(file).toLowerCase() === '.json') {
    snapshot = JSON.parse(readFileSync(file, 'utf8'));
  } else throw new Fault(400, 'Use an .xlsx membership export or .json snapshot.');
  const generatedAt = snapshot.generated_at ? Date.parse(snapshot.generated_at) : dryRun ? now : NaN;
  if (!Number.isSafeInteger(generatedAt) || generatedAt > now + 300000) throw new Fault(400, 'Export timestamp is invalid or in the future. Use the actual export time.');
  if (snapshot.generated_at && !/(Z|[+-]\d{2}:\d{2})$/.test(snapshot.generated_at)) throw new Fault(400, 'Export timestamp must include its timezone.');
  if (!dryRun && (!process.env.SWAP_DB || !isAbsolute(process.env.SWAP_DB))) throw new Fault(400, 'Set SWAP_DB to an absolute private database path outside the website.');
  shop = new Shop(dryRun ? ':memory:' : process.env.SWAP_DB);
  shop.importMembers(snapshot.members, generatedAt);
  console.log(dryRun ? 'Dry run passed; no membership records were saved.' : 'Private membership snapshot replaced successfully.');
  if (summary) console.log(JSON.stringify(summary));
} catch (error) {
  // Parser errors may contain cell contents; do not log them or member data.
  console.error(error instanceof Fault ? error.message : 'Import failed. Check the private file, format and database permissions.');
  process.exitCode = 1;
} finally { shop?.db.close(); }
