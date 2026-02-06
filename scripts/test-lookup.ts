
import fs from 'fs';
import { Reader } from 'mmdb-lib';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MMDB_PATH = path.join(__dirname, '../tmp/GeoLite2-City.mmdb');

const buffer = fs.readFileSync(MMDB_PATH);
const reader = new Reader(buffer);

const ip = '8.8.8.8';
const res = reader.get(ip);
console.log(`Lookup ${ip}:`, JSON.stringify(res, null, 2));

const ip2 = '1.1.1.1';
const res2 = reader.get(ip2);
console.log(`Lookup ${ip2}:`, JSON.stringify(res2, null, 2));
