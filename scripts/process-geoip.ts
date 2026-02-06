
import fs from 'fs';
import path from 'path';
import { createWriteStream } from 'fs';
import { Reader } from 'mmdb-lib';
import axios from 'axios';
import { fileURLToPath } from 'url';

// Fix for ESM __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const BATCH_SIZE = 15000; 
const MAX_FILE_SIZE = 40 * 1024 * 1024; // 40MB per file (safe margin for 100MB limit)
const OUTPUT_DIR = path.join(__dirname, '../data');
const DOWNLOAD_URL = 'https://github.com/P3TERX/GeoLite.mmdb/releases/latest/download/GeoLite2-City.mmdb';
// Use CSV for import? D1 doesn't support direct CSV import via wrangler easily without conversion.
// However, we can generate a simplified CSV and use a custom bulk loader or just optimize SQL.
// Better: SQLite binary import is not supported remotely.
// Optimization:
// 1. Remove merging logic complexity if it's slow (it's fast enough).
// 2. Reduce file size: Use integers for lat/lon (multiply by 10000) or drop precision?
//    We already dropped to 4 decimal places.
// 3. MAIN ISSUE: `wrangler d1 execute` is slow for massive inserts.
//    Solution: We should output a pure SQLite dump that can be piped if local,
//    but for remote D1, we are limited by the HTTP API.
//    Actually, breaking into smaller chunks (e.g. 5MB) might help reliability, but total time is still high.
//    
//    Alternative: Use Cloudflare D1 HTTP API directly with massive batches?
//    Wrangler does this.
//
//    Let's switch to producing a CSV and a separate small script to upload it?
//    No, wrangler is the standard way.
//    
//    Maybe we can reduce the volume of data?
//    Do we really need ALL cities?
//    Maybe filtering is key.
//    
//    But the user wants "high performance import".
//    The fastest way for D1 is usually fewer transactions with more rows.
//    We are already doing 10,000 rows per INSERT.
//    Maybe 5,000 is safer/faster?
//    
//    Let's check if we can export to CSV and use `wrangler d1 execute` with a special command? No.
//    
//    Wait, D1 supports importing from a backup (sqlite file)?
//    Only for creating new databases or restoring.
//    
//    Let's stick to SQL but optimize the file structure.
//    
//    Actually, we can try to use `sqlite3` locally to create a .sqlite file,
//    then upload that?
//    Cloudflare D1 allows "importing" a sqlite database file.
//    `npx wrangler d1 execute DB --file=./dump.sql` is the way.
//    
//    If local import is slow, it's because `wrangler d1 execute --local` goes through the miniflare proxy.
//    Direct `sqlite3` on the .wrangler/state/v3/d1/DB/db.sqlite would be instant.
//    
//    For remote, `wrangler d1 execute` is the only way.
//    
//    Let's just ensure the SQL is as compact as possible.
//    We can remove the column names in INSERT if we are sure of the order.
//    INSERT INTO geo_locations VALUES ...
//    
//    Also, removing `latitude` and `longitude` if they are 0? No, schema requires them.
//    
//    Let's try to increase batch size to 20,000?
//    Limit is usually 100MB payload or similar.
//    
//    Let's just change the output format to be cleaner.
const MMDB_PATH = path.join(__dirname, '../tmp/GeoLite2-City.mmdb');

// Optimization: Use abbreviated INSERT syntax
// INSERT INTO geo_locations VALUES (...)
// requires columns in order: start_ip, end_ip, country_code, city_name, latitude, longitude

// Ensure output dir exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function downloadFile(url: string, dest: string) {
    console.log(`Downloading ${url} to ${dest}...`);
    const writer = createWriteStream(dest);
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream'
    });
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

async function processMMDB() {
    // 1. Download
    if (!fs.existsSync(MMDB_PATH)) {
        await downloadFile(DOWNLOAD_URL, MMDB_PATH);
        console.log('Download complete.');
    } else {
        console.log('Using existing MMDB file.');
    }

    // 2. Open MMDB
    console.log('Opening MMDB...');
    const buffer = fs.readFileSync(MMDB_PATH);
    const reader = new Reader(buffer);
    
    // Force init of ipv4StartNodeNumber if it's lazy
    reader.get('0.0.0.0');

    console.log(`Database: ${reader.metadata.databaseType} (Build: ${new Date(reader.metadata.binaryFormatMajorVersion * 1000)})`);
    
    // File rotation logic
    let fileIndex = 1;
    let currentBytes = 0;
    
    function getWriter() {
         const fileName = `import_${String(fileIndex).padStart(3, '0')}.sql`;
         const filePath = path.join(OUTPUT_DIR, fileName);
         // Start transaction
         fs.writeFileSync(filePath, 'BEGIN TRANSACTION;\n');
         
         return {
             path: filePath,
             write: (str: string) => {
                 fs.appendFileSync(filePath, str);
                 currentBytes += Buffer.byteLength(str);
             },
             close: () => {
                 fs.appendFileSync(filePath, 'COMMIT;\n');
             }
         };
     }

    // Clean old files
    fs.readdirSync(OUTPUT_DIR).forEach(f => {
        if (f.startsWith('import_') && f.endsWith('.sql')) {
            fs.unlinkSync(path.join(OUTPUT_DIR, f));
        }
    });

    let currentWriter = getWriter();
    // Only the first file deletes? No, we are replacing the whole DB logic in workflow.
    // If we run sequentially, we should probably DELETE in the first file.
    if (fileIndex === 1) {
        currentWriter.write('DELETE FROM geo_locations;\n'); 
    }
    
    let batch: string[] = [];
    let count = 0;

    // 3. Walk the tree
    // Access private members for iteration
    const r = reader as any;
    const walker = r.walker;
    const nodeCount = reader.metadata.nodeCount;
    const nodeByteSize = reader.metadata.nodeByteSize; // Need this for offset calculation

    console.log('Node Count:', nodeCount);
    console.log('IPv4 Start Node:', r.ipv4StartNodeNumber);
    
    // Helper to get data
    function getData(ptr: number) {
        return r.resolveDataPointer(ptr);
    }

    // State for merging
    let lastRecord: { end_ip: number, country: string, city: string, lat: number, lon: number, start_ip: number } | null = null;

    function flushLastRecord() {
        if (lastRecord) {
             const { start_ip, end_ip, country, city, lat, lon } = lastRecord;
             batch.push(`(${start_ip}, ${end_ip}, '${country}', '${city}', ${lat}, ${lon})`);
             count++;
             
             if (batch.length >= BATCH_SIZE) {
                 const sql = `INSERT INTO geo_locations VALUES\n${batch.join(',\n')};\n`;
                 if (currentBytes + Buffer.byteLength(sql) > MAX_FILE_SIZE) {
                     currentWriter.close(); // Close previous
                     fileIndex++;
                     currentBytes = 0;
                     currentWriter = getWriter();
                     console.log(`Rotating to file ${fileIndex}...`);
                 }
                 currentWriter.write(sql);
                 batch = [];
                 if (count % 50000 === 0) console.log(`Processed ${count} records...`);
             }
             lastRecord = null;
        }
    }

    // Recursive Walker
    // ip: bigint representing the start of the range
    // depth: current bit depth
    function walk(node: number, depth: number, ip: bigint) {
        // Check if we are at a data node (leaf)
        if (node >= nodeCount) {
            // nodeCount often points to "empty" data in some implementations, 
            // or explicitly no data. 
            // Let's try to skip if it seems to be the empty marker.
            // But we don't know for sure which one is empty without metadata.
            // However, catching the error is safe.
            
            try {
                // Resolve data
                const data: any = getData(node);
                
                // Check if it has City/Country data
                if (data && (data.country || data.city)) {
                    // IPv4 Filter Logic
                    const IPv4_START = 281470681743360n; // ::ffff:0:0
                    const IPv4_END = 281474976710655n;   // ::ffff:255.255.255.255
                    
                    if (ip >= IPv4_START && ip <= IPv4_END) {
                        // It is IPv4
                        const startBig = ip - IPv4_START;
                        const startInt = Number(startBig);
                        
                        // Calculate End
                        // Host bits = 128 - depth
                        const hostBits = 128 - depth;
                        // Max IPv4 host bits is 32. If we are somehow "above" /96 but covering IPv4 space...
                        // But usually we are deeper than /96 if we are in IPv4 mapped space.
                        
                        const size = Math.pow(2, hostBits);
                        const endInt = startInt + size - 1;
                        
                        // Sanity check
                        if (startInt >= 0 && endInt <= 4294967295) {
                            const country = data.country?.iso_code || '';
                            const city = (data.city?.names?.en || '').replace(/'/g, "''");
                            const lat = data.location?.latitude ? parseFloat(data.location.latitude.toFixed(4)) : 0;
                            const lon = data.location?.longitude ? parseFloat(data.location.longitude.toFixed(4)) : 0;
                            
                            if (country || city) {
                                // Merge logic
                                if (lastRecord && 
                                    lastRecord.end_ip + 1 === startInt && 
                                    lastRecord.country === country && 
                                    lastRecord.city === city &&
                                    lastRecord.lat === lat &&
                                    lastRecord.lon === lon) {
                                    // Extend previous record
                                    lastRecord.end_ip = endInt;
                                } else {
                                    // Flush old and start new
                                    flushLastRecord();
                                    lastRecord = { start_ip: startInt, end_ip: endInt, country, city, lat, lon };
                                }
                            }
                        }
                    }
                }
            } catch (e: any) {
                // Suppress common decoding errors for empty/invalid nodes during full traversal
                if (e.message && (e.message.includes('Invalid Extended Type') || e.message.includes('Unknown type'))) {
                    // These are expected when traversing "empty" or special nodes in some MMDB builds
                    return;
                }
                console.error(`Error processing node ${node}:`, e);
            }
            return;
        }

        // Branch
        // Use walker.left / walker.right
        // Note: walker functions take OFFSET (nodeIndex * nodeByteSize)
        const offset = node * nodeByteSize;
        
        const left = walker.left(offset);
        const right = walker.right(offset);
        
        // Left (0)
        walk(left, depth + 1, ip);
        
        // Right (1)
        const bitVal = 1n << BigInt(127 - depth);
        walk(right, depth + 1, ip | bitVal);
    }

    console.log('Walking tree...');
    if (r.ipv4StartNodeNumber) {
        console.log('Starting from IPv4 root...');
        const IPv4_START = 281470681743360n; // ::ffff:0:0
        walk(r.ipv4StartNodeNumber, 96, IPv4_START);
    } else {
        walk(0, 0, 0n);
    }
    
    // Flush final record
    flushLastRecord();
    
    if (batch.length > 0) {
        const sql = `INSERT INTO geo_locations VALUES\n${batch.join(',\n')};\n`;
         // Check size (though it's the last batch, maybe strict check isn't needed, but good for consistency)
         if (currentBytes + Buffer.byteLength(sql) > MAX_FILE_SIZE) {
              currentWriter.close();
              fileIndex++;
              currentBytes = 0;
              currentWriter = getWriter();
         }
         currentWriter.write(sql);
     }
     
     // Close final
     currentWriter.close();
    
    // writer.end(); // appendFileSync handles open/close
    console.log(`Done! Processed ${count} IPv4 records into ${fileIndex} files in ${OUTPUT_DIR}`);
}

processMMDB().catch(console.error);
