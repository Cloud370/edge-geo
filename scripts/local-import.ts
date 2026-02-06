import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_PATH = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/36a0ba9080c97145a485b182534d9b8124d885b500e6390474e5648cfa0a131d.sqlite';

async function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error('Database file not found:', DB_PATH);
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  console.log('Connected to database');

  // List all import files
  const dataDir = path.join(process.cwd(), 'data');
  const files = fs.readdirSync(dataDir)
    .filter(f => f.startsWith('import_') && f.endsWith('.sql'))
    .sort();

  console.log(`Found ${files.length} files to import`);

  // Create table if not exists (just in case, though schema should be there)
  // We assume schema is already applied or we can apply it. 
  // Let's clear the table first to avoid duplicates if we are re-running
  console.log('Clearing existing data...');
  db.exec('DELETE FROM geo_locations');

  for (const file of files) {
    console.log(`Importing ${file}...`);
    const filePath = path.join(dataDir, file);
    const sql = fs.readFileSync(filePath, 'utf-8');
    
    const startTime = Date.now();
    try {
        // better-sqlite3 handles transactions if the SQL file has them, 
        // but it's safer to wrap it here if the file doesn't have them, 
        // or just execute the big string.
        // Our generated files have BEGIN and COMMIT.
        db.exec(sql);
        console.log(`  -> Done in ${(Date.now() - startTime) / 1000}s`);
    } catch (err) {
        console.error(`  -> Error importing ${file}:`, err);
    }
  }

  // Verify count
  const count = db.prepare('SELECT COUNT(*) as c FROM geo_locations').get() as { c: number };
  console.log(`Total records: ${count.c}`);
}

main();
