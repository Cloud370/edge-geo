
export interface Env {
	DB: D1Database;
}

// Helper: Convert IPv4 string to unsigned integer
function ipToInt(ip: string): number | null {
	const parts = ip.split('.');
	if (parts.length !== 4) return null;
	// Use >>> 0 to ensure unsigned 32-bit integer
	return parts.reduce((acc, part) => (acc * 256) + parseInt(part, 10), 0) >>> 0;
}

// Helper: Check if User-Agent is a browser
function isBrowser(userAgent: string | null): boolean {
	if (!userAgent) return false;
	const ua = userAgent.toLowerCase();
	// Basic check for common browser keywords
	return (ua.includes('mozilla') || ua.includes('chrome') || ua.includes('safari') || ua.includes('webkit')) && !ua.includes('curl') && !ua.includes('wget') && !ua.includes('python-requests');
}

// HTML Template
function getHtml(data: any, searchIp: string = '') {
	const jsonStr = JSON.stringify(data, null, 2);
	return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>IP Geolocation</title>
    <style>
        :root {
            --bg: #ffffff;
            --fg: #000000;
            --card-bg: #f5f5f5;
        }
        @media (prefers-color-scheme: dark) {
            :root {
                --bg: #111111;
                --fg: #ffffff;
                --card-bg: #222222;
            }
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background: var(--bg);
            color: var(--fg);
            margin: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            transition: background 0.3s, color 0.3s;
        }
        .container {
            width: 90%;
            max-width: 600px;
            text-align: center;
        }
        h1 { font-size: 2.5rem; font-weight: 700; margin-bottom: 2rem; }
        input {
            width: 100%;
            padding: 1rem;
            font-size: 1.2rem;
            border: 2px solid #333;
            border-radius: 8px;
            background: var(--card-bg);
            color: var(--fg);
            box-sizing: border-box;
            margin-bottom: 2rem;
        }
        .result-card {
            background: var(--card-bg);
            padding: 2rem;
            border-radius: 12px;
            text-align: left;
            position: relative;
        }
        .ip-display {
            font-size: 2rem;
            font-weight: bold;
            margin-bottom: 0.5rem;
        }
        .location-display {
            font-size: 1.5rem;
            opacity: 0.8;
            margin-bottom: 1rem;
        }
        pre {
            background: #000;
            color: #0f0;
            padding: 1rem;
            border-radius: 6px;
            overflow-x: auto;
            font-size: 0.9rem;
        }
        .actions {
            margin-top: 1rem;
            display: flex;
            gap: 1rem;
        }
        button {
            padding: 0.5rem 1rem;
            cursor: pointer;
            background: #333;
            color: #fff;
            border: none;
            border-radius: 4px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>IP Lookup</h1>
        <form action="/" method="GET" id="search-form">
            <input type="text" name="q" id="search-input" placeholder="Enter IP address..." value="${searchIp}" autocomplete="off">
        </form>
        <div class="result-card">
            <div class="ip-display">${data.ip || 'Unknown'}</div>
            <div class="location-display">
                ${[data.city_name, data.country_code].filter(Boolean).join(', ') || 'Location not found'}
            </div>
            <pre>${jsonStr}</pre>
            <div class="actions">
                <button onclick="navigator.clipboard.writeText('${data.ip}')">Copy IP</button>
                <button onclick="navigator.clipboard.writeText(JSON.stringify(${JSON.stringify(data)}))">Copy JSON</button>
            </div>
        </div>
    </div>
    <script>
        document.getElementById('search-form').addEventListener('submit', function(e) {
            e.preventDefault();
            const ip = document.getElementById('search-input').value.trim();
            if(ip) window.location.href = '/' + ip;
        });
    </script>
</body>
</html>`;
}

// Database lookup function
async function lookupIp(db: D1Database, ip: string): Promise<any> {
    const ipInt = ipToInt(ip);
    if (ipInt === null) return { ip, error: 'Invalid IP format' };

    // Query D1
    // Note: D1 local dev might behave slightly differently, but standard SQL applies.
    // We look for a range where start_ip <= ipInt <= end_ip
    const stmt = db.prepare(`
        SELECT country_code, city_name, latitude, longitude
        FROM geo_locations
        WHERE ? >= start_ip AND ? <= end_ip
        LIMIT 1
    `).bind(ipInt, ipInt);

    const result = await stmt.first();
    
    if (!result) {
        return { ip, error: 'IP not found in database' };
    }

    return {
        ip,
        ...result
    };
}

// Helper: Remove null values from object
function cleanJson(obj: any): any {
    if (Array.isArray(obj)) return obj.map(cleanJson);
    if (obj !== null && typeof obj === 'object') {
        return Object.fromEntries(
            Object.entries(obj)
                .filter(([_, v]) => v !== null)
                .map(([k, v]) => [k, cleanJson(v)])
        );
    }
    return obj;
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const userAgent = request.headers.get('User-Agent');
		const isBrowserRequest = isBrowser(userAgent);
        
        // Handle POST / (Batch)
        if (request.method === 'POST' && url.pathname === '/') {
            try {
                const body: any = await request.json();
                let ips: string[] = [];
                
                if (Array.isArray(body)) {
                    ips = body;
                } else if (body && Array.isArray(body.ips)) {
                    ips = body.ips;
                } else {
                    return new Response('Invalid JSON body', { status: 400 });
                }

                const results = await Promise.all(ips.map(ip => lookupIp(env.DB, ip)));
                return Response.json(cleanJson(results));
            } catch (e) {
                return new Response('Error processing request', { status: 500 });
            }
        }

        // Handle GET
        if (request.method === 'GET') {
            let targetIp = '';
            
            // Path: /<IP>
            const pathParts = url.pathname.split('/').filter(Boolean);
            if (pathParts.length === 1 && ipToInt(pathParts[0]) !== null) {
                targetIp = pathParts[0];
            } else if (pathParts.length === 0) {
                // Path: / -> Use connecting IP
                const connIp = request.headers.get('CF-Connecting-IP');
                targetIp = (connIp && ipToInt(connIp) !== null) ? connIp : '127.0.0.1';
            } else {
                return new Response('Not Found', { status: 404 });
            }

            // Lookup
            const cacheUrl = new URL(request.url);
            cacheUrl.pathname = `/api/v1/${targetIp}`; // Internal cache key
            const cacheKey = new Request(cacheUrl.toString(), request);
            const cache = caches.default;
            
            let data;
            const cachedResponse = await cache.match(cacheKey);
            if (cachedResponse) {
                data = await cachedResponse.json();
            } else {
                data = await lookupIp(env.DB, targetIp);
                data = cleanJson(data); // Clean nulls before caching
                
                // Cache for 1 hour
                ctx.waitUntil(cache.put(cacheKey, new Response(JSON.stringify(data), {
                    headers: { 'Cache-Control': 'public, max-age=3600' }
                })));
            }

            // Response format
            if (isBrowserRequest) {
                return new Response(getHtml(data, targetIp), {
                    headers: { 'Content-Type': 'text/html;charset=UTF-8' }
                });
            } else {
                return Response.json(data);
            }
        }

		return new Response('Method Not Allowed', { status: 405 });
	},
};
