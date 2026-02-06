# Edge Geo

[中文](README.md) | **English**

An IP Geolocation service running on Cloudflare Workers and D1, powered by MaxMind GeoLite2 data.

## Features

- **Serverless**: Runs on Cloudflare Workers edge network.
- **Fast**: Uses D1 (SQLite) for efficient IP range lookups.
- **Automated Updates**: GitHub Actions workflow automatically fetches and updates the database weekly.
- **Dual Interface**:
  - **JSON API**: For programmatic access (Single & Batch).
  - **Web UI**: Simple HTML interface for human use.

## API Usage

### 1. Single IP Lookup

**GET** `/?ip=<ip_address>` or `/<ip_address>`

```bash
curl "https://your-worker.workers.dev/?ip=8.8.8.8"
# OR
curl "https://your-worker.workers.dev/8.8.8.8"
```

**Response:**
```json
{
  "ip": "8.8.8.8",
  "country_code": "US",
  "city_name": "",
  "region_code": "VA",
  "region_name": "Virginia",
  "postal_code": "20149",
  "timezone": "America/New_York",
  "latitude": 39.03,
  "longitude": -77.5
}
```

### 2. Self Lookup

**GET** `/` (without parameters)

Returns the location of the connecting client.

### 3. Batch Lookup

**POST** `/`

**Body:** JSON Array of IP strings.

```bash
curl -X POST "https://your-worker.workers.dev/" \
  -H "Content-Type: application/json" \
  -d '["8.8.8.8", "1.1.1.1"]'
```

**Response:**
```json
[
  {
    "ip": "8.8.8.8",
    "country_code": "US",
    "city_name": "",
    "region_code": "VA",
    "region_name": "Virginia",
    "postal_code": "20149",
    "timezone": "America/New_York",
    "latitude": 39.03,
    "longitude": -77.5
  },
  {
    "ip": "1.1.1.1",
    "country_code": "AU",
    "city_name": "",
    "region_code": "NSW",
    "region_name": "New South Wales",
    "postal_code": "2835",
    "timezone": "Australia/Sydney",
    "latitude": -33.494,
    "longitude": 143.2104
  }
]
```

## Development

### Prerequisites

- Node.js & npm
- Cloudflare Wrangler CLI (`npm i -g wrangler`)

### Local Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Initialize Local Database**
   ```bash
   npx wrangler d1 create edge-geo-db # If creating new
   npx wrangler d1 execute edge-geo-db --local --file=migrations/0000_schema.sql
   ```

3. **Import Data Locally** (Optional, for testing)
   ```bash
   # Download and process GeoIP data (this will generate SQL files in data/)
   npx tsx scripts/process-geoip.ts
   
   # Import to local D1
   npx tsx scripts/local-import.ts
   ```

4. **Run Dev Server**
   ```bash
   npm run dev
   ```

## Deployment

1. **Configure Wrangler**
   Update `wrangler.toml` with your D1 `database_id`.

2. **Deploy**
   ```bash
   npm run deploy
   ```

3. **Automated Updates**
   Set up the following Secrets in your GitHub Repository:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`

   The workflow `.github/workflows/update-db.yml` will run weekly to keep the database fresh.

## License

This product includes GeoLite2 data created by MaxMind, available from [https://www.maxmind.com](https://www.maxmind.com).
