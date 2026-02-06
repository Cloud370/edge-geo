
import fs from 'fs';
import path from 'path';
import { createWriteStream } from 'fs';
import { Reader } from 'mmdb-lib';
import axios from 'axios';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const BATCH_SIZE = 500; // Reduced from 2500 to 500 to ensure <1MB per statement safety
const MAX_FILE_SIZE = 25 * 1024 * 1024; // Reduce file size to 25MB to be safe for upload chunks
const OUTPUT_DIR = path.join(__dirname, '../data');
const DOWNLOAD_URL = 'https://github.com/P3TERX/GeoLite.mmdb/releases/latest/download/GeoLite2-City.mmdb';
const MMDB_PATH = path.join(__dirname, '../tmp/GeoLite2-City.mmdb');

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
         
         // Use WriteStream for better performance (avoids open/close on every write)
         // Increase highWaterMark to 1MB to reduce buffer flushing overhead
         const stream = fs.createWriteStream(filePath, { flags: 'w', highWaterMark: 1024 * 1024 });
         
         return {
             path: filePath,
             write: (str: string) => {
                 const canWrite = stream.write(str);
                 currentBytes += Buffer.byteLength(str);
                 // In a complex app we might handle backpressure (!canWrite), 
                 // but for this batch script it's likely fine or OS buffers will handle it.
             },
             close: () => {
                 // No explicit transaction commit needed as we removed BEGIN
                 stream.end();
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

    if (fileIndex === 1) {
        // Recreate table to ensure correct column order
        currentWriter.write(`
DROP TABLE IF EXISTS geo_locations;
CREATE TABLE geo_locations (
  start_ip INTEGER NOT NULL,
  end_ip INTEGER NOT NULL,
  country_code TEXT,
  city_name TEXT,
  region_code TEXT,
  region_name TEXT,
  postal_code TEXT,
  timezone TEXT,
  latitude REAL,
  longitude REAL
);
CREATE INDEX idx_geo_locations_ip ON geo_locations (start_ip, end_ip);
`); 
    }
    
    let batch: string[] = [];
    let count = 0;

    // 3. Walk the tree
    // Access private members for iteration
    const r = reader as any;
    const walker = r.walker;
    const nodeCount = reader.metadata.nodeCount;
    const nodeByteSize = reader.metadata.nodeByteSize;

    console.log('Node Count:', nodeCount);
    console.log('IPv4 Start Node:', r.ipv4StartNodeNumber);
    
    // Helper to get data
    function getData(ptr: number) {
        return r.resolveDataPointer(ptr);
    }

    // Optimization: Pre-compile constants
    const IPv4_START = 281470681743360n; // ::ffff:0:0
    const IPv4_END = 281474976710655n;   // ::ffff:255.255.255.255

    // State for merging
    let lastRecord: { 
        end_ip: number, 
        country: string, 
        city: string, 
        region_code: string,
        region_name: string,
        postal_code: string,
        timezone: string,
        lat: number, 
        lon: number, 
        start_ip: number 
    } | null = null;

    function flushLastRecord() {
        if (lastRecord) {
             const { start_ip, end_ip, country, city, region_code, region_name, postal_code, timezone, lat, lon } = lastRecord;
             
             // Escape single quotes - optimized to check first
             const safe = (s: string) => s.includes("'") ? s.replace(/'/g, "''") : s;
             
             // Schema order: start_ip, end_ip, country_code, city_name, region_code, region_name, postal_code, timezone, latitude, longitude
             batch.push(`(${start_ip}, ${end_ip}, '${safe(country)}', '${safe(city)}', '${safe(region_code)}', '${safe(region_name)}', '${safe(postal_code)}', '${safe(timezone)}', ${lat}, ${lon})`);
             count++;
             
             if (batch.length >= BATCH_SIZE) {
                 // Optimization: Pre-allocate buffer or just join strings?
                 // Node.js string concatenation is quite fast.
                 // But we can check if we can reduce file I/O overhead.
                 // Currently we write every BATCH_SIZE (500 rows).
                 
                 const sql = `INSERT INTO geo_locations VALUES\n${batch.join(',\n')};\n`;
                 
                 // Write asynchronously to avoid blocking CPU? 
                 // No, process-geoip is a build script, synchronous/stream is fine.
                 // The bottleneck is "mmdb walking" logic + "string generation".
                 
                 if (currentBytes + Buffer.byteLength(sql) > MAX_FILE_SIZE) {
                     currentWriter.close(); 
                     fileIndex++;
                     currentBytes = 0;
                     currentWriter = getWriter();
                     console.log(`Rotating to file ${fileIndex}...`);
                 }
                 currentWriter.write(sql);
                 batch = [];
                 
                 // Logging less frequently
                 if (count % 100000 === 0) console.log(`Processed ${count} records...`);
             }
             lastRecord = null;
        }
    }

    // Iterative Walker
    async function walk(startNode: number, startDepth: number, startIp: bigint) {
        const stack: { node: number; depth: number; ip: bigint }[] = [];
        stack.push({ node: startNode, depth: startDepth, ip: startIp });

        let processedCount = 0;

        while (stack.length > 0) {
            const { node, depth, ip } = stack.pop()!;

            // Yield to event loop every 10000 nodes to allow I/O flushing
            if (++processedCount % 10000 === 0) {
                await new Promise(resolve => setImmediate(resolve));
            }

            // Check if we are at a data node (leaf)
            if (node >= nodeCount) {
                try {
                    // Resolve data
                    const data: any = getData(node);
                    
                    // Check if it has City/Country data
                    if (data && (data.country || data.city)) {
                        // IPv4 Filter Logic
                        if (ip >= IPv4_START && ip <= IPv4_END) {
                            // It is IPv4
                            const startBig = ip - IPv4_START;
                            const startInt = Number(startBig);
                            
                            // Calculate End
                            // Host bits = 128 - depth
                            const hostBits = 128 - depth;
                            const size = Math.pow(2, hostBits);
                            const endInt = startInt + size - 1;
                            
                            // Sanity check
                            if (startInt >= 0 && endInt <= 4294967295) {
                                const country = data.country?.iso_code || '';
                                const city = data.city?.names?.en || '';
                                const region_code = data.subdivisions?.[0]?.iso_code || '';
                                const region_name = data.subdivisions?.[0]?.names?.en || '';
                                const postal_code = data.postal?.code || '';
                                const timezone = data.location?.time_zone || '';
                                
                                // Optimization: Math.round is faster than toFixed() string conversion
                                const lat = data.location?.latitude ? Math.round(data.location.latitude * 10000) / 10000 : 0;
                                const lon = data.location?.longitude ? Math.round(data.location.longitude * 10000) / 10000 : 0;
                                
                                if (country || city) {
                                    // Merge logic
                                    if (lastRecord && 
                                        lastRecord.end_ip + 1 === startInt && 
                                        lastRecord.country === country && 
                                        lastRecord.city === city &&
                                        lastRecord.region_code === region_code &&
                                        lastRecord.region_name === region_name &&
                                        lastRecord.postal_code === postal_code &&
                                        lastRecord.timezone === timezone &&
                                        lastRecord.lat === lat &&
                                        lastRecord.lon === lon) {
                                        // Extend previous record
                                        lastRecord.end_ip = endInt;
                                    } else {
                                        // Flush old and start new
                                        await flushLastRecord();
                                        lastRecord = { 
                                            start_ip: startInt, 
                                            end_ip: endInt, 
                                            country, 
                                            city, 
                                            region_code,
                                            region_name,
                                            postal_code,
                                            timezone,
                                            lat, 
                                            lon 
                                        };
                                    }
                                }
                            }
                        }
                    }
                } catch (e: any) {
                    // Suppress common decoding errors for empty/invalid nodes during full traversal
                    if (e.message && (e.message.includes('Invalid Extended Type') || e.message.includes('Unknown type'))) {
                        continue;
                    }
                    console.error(`Error processing node ${node}:`, e);
                }
                continue;
            }

            // Branch
            const offset = node * nodeByteSize;
            
            const left = walker.left(offset);
            const right = walker.right(offset);
            
            // Push Right first so Left is popped first (DFS order preserved)
            const bitVal = 1n << BigInt(127 - depth);
            stack.push({ node: right, depth: depth + 1, ip: ip | bitVal });
            stack.push({ node: left, depth: depth + 1, ip });
        }
    }

    console.log('Walking tree...');
    if (r.ipv4StartNodeNumber) {
        console.log('Starting from IPv4 root...');
        await walk(r.ipv4StartNodeNumber, 96, IPv4_START);
    } else {
        await walk(0, 0, 0n);
    }
    
    // Flush final record
    await flushLastRecord();
    
    if (batch.length > 0) {
        const sql = `INSERT INTO geo_locations VALUES\n${batch.join(',\n')};\n`;
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
    
    console.log(`Done! Processed ${count} IPv4 records into ${fileIndex} files in ${OUTPUT_DIR}`);
}

processMMDB().catch(console.error);
