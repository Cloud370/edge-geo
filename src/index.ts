
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
	const initialData = JSON.stringify(data);
	
	return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Edge Geo - IP Geolocation</title>
    <style>
        :root {
            --primary: #2563eb;
            --primary-hover: #1d4ed8;
            --bg: #f8fafc;
            --card-bg: #ffffff;
            --text: #0f172a;
            --text-secondary: #64748b;
            --border: #e2e8f0;
            --code-bg: #1e293b;
            --code-text: #e2e8f0;
        }
        @media (prefers-color-scheme: dark) {
            :root {
                --bg: #0f172a;
                --card-bg: #1e293b;
                --text: #f8fafc;
                --text-secondary: #94a3b8;
                --border: #334155;
            }
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: var(--bg);
            color: var(--text);
            margin: 0;
            padding: 20px;
            line-height: 1.5;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 2rem;
        }
        .title {
            font-size: 1.5rem;
            font-weight: 700;
            color: var(--primary);
        }
        .lang-switch {
            display: flex;
            gap: 0.5rem;
        }
        .lang-btn {
            background: none;
            border: 1px solid var(--border);
            color: var(--text-secondary);
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.875rem;
        }
        .lang-btn.active {
            background: var(--primary);
            color: white;
            border-color: var(--primary);
        }
        
        .card {
            background: var(--card-bg);
            border-radius: 12px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            padding: 2rem;
            margin-bottom: 2rem;
        }
        
        .tabs {
            display: flex;
            border-bottom: 1px solid var(--border);
            margin-bottom: 1.5rem;
        }
        .tab {
            padding: 0.75rem 1.5rem;
            cursor: pointer;
            border-bottom: 2px solid transparent;
            color: var(--text-secondary);
            font-weight: 500;
        }
        .tab.active {
            color: var(--primary);
            border-bottom-color: var(--primary);
        }
        
        .input-group {
            margin-bottom: 1.5rem;
        }
        input, textarea {
            width: 100%;
            padding: 0.75rem;
            border: 1px solid var(--border);
            border-radius: 6px;
            background: var(--bg);
            color: var(--text);
            font-size: 1rem;
            box-sizing: border-box;
            transition: border-color 0.2s;
        }
        input:focus, textarea:focus {
            outline: none;
            border-color: var(--primary);
        }
        textarea {
            min-height: 120px;
            font-family: monospace;
        }
        
        button.action-btn {
            background: var(--primary);
            color: white;
            border: none;
            padding: 0.75rem 1.5rem;
            border-radius: 6px;
            font-size: 1rem;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.2s;
            width: 100%;
        }
        button.action-btn:hover {
            background: var(--primary-hover);
        }
        
        .result-item {
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 1rem;
            margin-bottom: 1rem;
        }
        .result-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.5rem;
        }
        .ip-tag {
            background: var(--bg);
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
            font-family: monospace;
            font-weight: 600;
        }
        .location-text {
            color: var(--text-secondary);
        }
        
        pre {
            background: var(--code-bg);
            color: var(--code-text);
            padding: 1rem;
            border-radius: 6px;
            overflow-x: auto;
            font-size: 0.875rem;
            margin: 0;
        }
        
        .hidden { display: none; }
        
        .api-docs {
            margin-top: 3rem;
            border-top: 1px solid var(--border);
            padding-top: 2rem;
        }
        .endpoint {
            margin-bottom: 1.5rem;
        }
        code {
            background: var(--bg);
            padding: 0.2rem 0.4rem;
            border-radius: 4px;
            font-family: monospace;
            font-size: 0.9em;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="title">Edge Geo</div>
            <div class="lang-switch">
                <button class="lang-btn active" onclick="setLang('zh')" id="btn-zh">中文</button>
                <button class="lang-btn" onclick="setLang('en')" id="btn-en">English</button>
            </div>
        </div>

        <div class="card">
            <div class="tabs">
                <div class="tab active" onclick="switchTab('single')" data-i18n="tab_single">单次查询</div>
                <div class="tab" onclick="switchTab('batch')" data-i18n="tab_batch">批量查询</div>
            </div>

            <!-- Single Query Panel -->
            <div id="panel-single">
                <form id="single-form" onsubmit="handleSingleSubmit(event)">
                    <div class="input-group">
                        <input type="text" id="single-input" placeholder="输入 IP 地址..." value="${searchIp}" autocomplete="off">
                    </div>
                    <button type="submit" class="action-btn" data-i18n="btn_query">查询</button>
                </form>
                
                <div id="single-result" class="result-area" style="margin-top: 1.5rem;">
                    <!-- Initial result rendered by server -->
                    ${data.ip ? `
                    <div class="result-item">
                        <div class="result-header">
                            <span class="ip-tag">${data.ip}</span>
                            <span class="location-text">
                                ${[data.city_name, data.region_name, data.country_code].filter(Boolean).join(', ') || 'Unknown Location'}
                            </span>
                        </div>
                        <pre>${jsonStr}</pre>
                    </div>
                    ` : ''}
                </div>
            </div>

            <!-- Batch Query Panel -->
            <div id="panel-batch" class="hidden">
                <div class="input-group">
                    <textarea id="batch-input" placeholder="输入多个 IP 地址，每行一个...&#10;8.8.8.8&#10;1.1.1.1"></textarea>
                </div>
                <button onclick="handleBatchSubmit()" class="action-btn" data-i18n="btn_batch_query">批量查询</button>
                <div id="batch-result" style="margin-top: 1.5rem;"></div>
            </div>
        </div>

        <div class="api-docs">
            <h2 data-i18n="api_docs">API 文档</h2>
            
            <div class="endpoint">
                <h3 data-i18n="api_single">单 IP 查询</h3>
                <p><code>GET /?ip=8.8.8.8</code> <span data-i18n="or">或</span> <code>/8.8.8.8</code></p>
            </div>

            <div class="endpoint">
                <h3 data-i18n="api_batch">批量查询</h3>
                <p><code>POST /</code></p>
                <p data-i18n="api_batch_desc">Body: JSON 字符串数组</p>
                <pre>["8.8.8.8", "1.1.1.1"]</pre>
            </div>
        </div>
    </div>

    <script>
        const i18n = {
            zh: {
                tab_single: '单次查询',
                tab_batch: '批量查询',
                btn_query: '查询',
                btn_batch_query: '批量查询',
                api_docs: 'API 文档',
                api_single: '单 IP 查询',
                api_batch: '批量查询',
                api_batch_desc: 'Body: JSON 字符串数组',
                or: '或',
                placeholder_single: '输入 IP 地址...',
                placeholder_batch: '输入多个 IP 地址，每行一个...'
            },
            en: {
                tab_single: 'Single Lookup',
                tab_batch: 'Batch Lookup',
                btn_query: 'Lookup',
                btn_batch_query: 'Batch Lookup',
                api_docs: 'API Documentation',
                api_single: 'Single IP Lookup',
                api_batch: 'Batch Lookup',
                api_batch_desc: 'Body: JSON Array of IPs',
                or: 'or',
                placeholder_single: 'Enter IP address...',
                placeholder_batch: 'Enter multiple IPs, one per line...'
            }
        };

        let currentLang = 'zh';

        function setLang(lang) {
            currentLang = lang;
            document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
            
            // Update buttons
            document.querySelectorAll('.lang-btn').forEach(btn => btn.classList.remove('active'));
            document.getElementById('btn-' + lang).classList.add('active');

            // Update text content
            document.querySelectorAll('[data-i18n]').forEach(el => {
                const key = el.getAttribute('data-i18n');
                if (i18n[lang][key]) el.textContent = i18n[lang][key];
            });

            // Update placeholders
            document.getElementById('single-input').placeholder = i18n[lang].placeholder_single;
            document.getElementById('batch-input').placeholder = i18n[lang].placeholder_batch;
        }

        function switchTab(tab) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab[onclick="switchTab(\\'' + tab + '\\')"]').forEach(t => t.classList.add('active'));
            
            if (tab === 'single') {
                document.getElementById('panel-single').classList.remove('hidden');
                document.getElementById('panel-batch').classList.add('hidden');
            } else {
                document.getElementById('panel-single').classList.add('hidden');
                document.getElementById('panel-batch').classList.remove('hidden');
            }
        }

        function handleSingleSubmit(e) {
            e.preventDefault();
            const ip = document.getElementById('single-input').value.trim();
            if (ip) window.location.href = '/' + ip;
        }

        async function handleBatchSubmit() {
            const input = document.getElementById('batch-input').value;
            const ips = input.split(/[\\n,]+/).map(i => i.trim()).filter(Boolean);
            
            if (ips.length === 0) return;
            
            const btn = document.querySelector('#panel-batch .action-btn');
            const originalText = btn.textContent;
            btn.textContent = 'Loading...';
            btn.disabled = true;

            try {
                const res = await fetch('/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(ips)
                });
                const data = await res.json();
                renderBatchResults(data);
            } catch (e) {
                alert('Error fetching data');
            } finally {
                btn.textContent = originalText;
                btn.disabled = false;
            }
        }

        function renderBatchResults(data) {
            const container = document.getElementById('batch-result');
            container.innerHTML = data.map(item => \`
                <div class="result-item">
                    <div class="result-header">
                        <span class="ip-tag">\${item.ip}</span>
                        <span class="location-text">
                            \${[item.city_name, item.region_name, item.country_code].filter(Boolean).join(', ') || 'Unknown'}
                        </span>
                    </div>
                    <pre>\${JSON.stringify(item, null, 2)}</pre>
                </div>
            \`).join('');
        }

        // Initialize based on URL or browser (defaulting to zh for now as per prompt implied preference)
    </script>
</body>
</html>`;
}

// Database lookup function (Single)
async function lookupIp(db: D1Database, ip: string): Promise<any> {
    const ipInt = ipToInt(ip);
    if (ipInt === null) return { ip, error: 'Invalid IP format' };

    const stmt = db.prepare(`
        SELECT country_code, city_name, region_code, region_name, postal_code, timezone, latitude, longitude
        FROM geo_locations
        WHERE start_ip <= ? AND end_ip >= ?
        ORDER BY start_ip DESC
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

export function calculateBatchChunkSize(maxBoundParams = 100, paramsPerIp = 1): number {
    return Math.max(1, Math.floor(maxBoundParams / paramsPerIp));
}

// Database lookup function (Batch)
async function lookupBatch(db: D1Database, ips: string[]): Promise<any[]> {
    const validIps: Array<{ idx: number; ip: string; ipInt: number }> = [];
    const results: any[] = new Array(ips.length);

    for (let idx = 0; idx < ips.length; idx++) {
        const ip = ips[idx];
        const ipInt = ipToInt(ip);
        if (ipInt === null) results[idx] = { ip, error: 'Invalid IP format' };
        else validIps.push({ idx, ip, ipInt });
    }
    
    if (validIps.length === 0) {
        return results.filter(Boolean);
    }

    // Process in chunks to respect SQL parameter limits
    const CHUNK_SIZE = calculateBatchChunkSize();

    for (let i = 0; i < validIps.length; i += CHUNK_SIZE) {
        const chunk = validIps.slice(i, i + CHUNK_SIZE);
        
        const placeholders = chunk.map(({ idx }) => `(${idx}, ?)`).join(", ");
        const params = chunk.map(({ ipInt }) => ipInt);

        const query = `
            WITH inputs(idx, ip_int) AS (VALUES ${placeholders}),
            best AS (
                SELECT
                    i.idx,
                    i.ip_int,
                    (
                        SELECT rowid
                        FROM geo_locations g
                        WHERE g.start_ip <= i.ip_int AND g.end_ip >= i.ip_int
                        ORDER BY g.start_ip DESC
                        LIMIT 1
                    ) AS geo_rowid
                FROM inputs i
            )
            SELECT
                b.idx as idx,
                g.country_code, g.city_name, g.region_code, g.region_name,
                g.postal_code, g.timezone, g.latitude, g.longitude
            FROM best b
            LEFT JOIN geo_locations g ON g.rowid = b.geo_rowid
        `;

        try {
            const { results: chunkResults } = await db.prepare(query).bind(...params).all();
            
            chunkResults.forEach((row: any) => {
                const idx = Number(row.idx);
                const ip = ips[idx];
                if (!row.country_code && !row.city_name) {
                    results[idx] = { ip, error: 'IP not found in database' };
                } else {
                    const { idx: _idx, ...rest } = row;
                    results[idx] = { ip, ...rest };
                }
            });
        } catch (e) {
            console.error('Batch query error:', e);
            // Fallback to error for this chunk
            chunk.forEach(({ idx, ip }) => {
                results[idx] = { ip, error: 'Internal database error' };
            });
        }
    }
    
    return results.filter(Boolean);
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

// Helper: CORS Headers
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Max-Age': '86400',
};

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

		const url = new URL(request.url);
		const userAgent = request.headers.get('User-Agent');
		const isBrowserRequest = isBrowser(userAgent);
        
        // Handle POST / (Batch)
        if (request.method === 'POST' && url.pathname === '/') {
            try {
                const body: any = await request.json();
                let ips: string[] = [];
                
                if (Array.isArray(body)) {
                    ips = body.map(String).map(s => s.trim());
                } else if (body && Array.isArray(body.ips)) {
                    ips = body.ips.map(String).map((s: string) => s.trim());
                } else {
                    return new Response('Invalid JSON body', { status: 400, headers: corsHeaders });
                }
                
                // Limit batch size to prevent abuse and timeout
                if (ips.length > 10000) {
                    return new Response('Batch limit exceeded (max 10000)', { status: 400, headers: corsHeaders });
                }

                // Optimization: Use SQL CTE for batch lookup
                // This reduces DB round-trips from N to N/100
                const results = await lookupBatch(env.DB, ips);
                
                return Response.json(cleanJson(results), { headers: corsHeaders });
            } catch (e) {
                return new Response('Error processing request', { status: 500, headers: corsHeaders });
            }
        }

        // Handle GET
        if (request.method === 'GET') {
            let targetIp = '';
            
            // Priority:
            // 1. Path param: /1.2.3.4
            // 2. Query param: ?ip=1.2.3.4 (or ?q=1.2.3.4)
            // 3. Header: CF-Connecting-IP

            const pathParts = url.pathname.split('/').filter(Boolean);
            const queryIp = url.searchParams.get('ip') || url.searchParams.get('q');

            if (pathParts.length === 1 && ipToInt(pathParts[0]) !== null) {
                targetIp = pathParts[0];
            } else if (queryIp && ipToInt(queryIp) !== null) {
                targetIp = queryIp;
            } else if (pathParts.length === 0) {
                // Root path -> Use connecting IP
                const connIp = request.headers.get('CF-Connecting-IP');
                targetIp = (connIp && ipToInt(connIp) !== null) ? connIp : '127.0.0.1';
            } else {
                return new Response('Not Found', { status: 404, headers: corsHeaders });
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
                    headers: { 
                        'Cache-Control': 'public, max-age=3600',
                        ...corsHeaders 
                    }
                })));
            }

            // Response format
            if (isBrowserRequest) {
                return new Response(getHtml(data, targetIp), {
                    headers: { 
                        'Content-Type': 'text/html;charset=UTF-8',
                        ...corsHeaders
                    }
                });
            } else {
                return Response.json(data, { headers: corsHeaders });
            }
        }

		return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
	},
};
