# Edge Geo

[English](README_EN.md) | **中文**

基于 Cloudflare Workers 和 D1 的 IP 地理位置查询服务，数据源来自 MaxMind GeoLite2。

## 特性

- **Serverless**: 运行在 Cloudflare Workers 边缘网络上。
- **快速**: 使用 D1 (SQLite) 进行高效的 IP 范围查找。
- **自动更新**: GitHub Actions 工作流每周自动下载并更新数据库。
- **双重接口**:
  - **JSON API**: 供程序调用 (支持单 IP 和批量查询)。
  - **Web UI**: 简单的人性化查询页面。

## API 使用文档

### 1. 单个 IP 查询

**GET** `/?ip=<ip_address>` 或 `/<ip_address>`

```bash
curl "https://edge-geo.y8955.workers.dev/?ip=8.8.8.8"
# 或者
curl "https://edge-geo.y8955.workers.dev/8.8.8.8"
```

**返回结果:**
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

### 2. 查询自身 IP

**GET** `/` (不带任何参数)

返回发起请求客户端的地理位置信息。

### 3. 批量查询

**POST** `/`

**Body:** JSON 格式的 IP 字符串数组。

```bash
curl -X POST "https://edge-geo.y8955.workers.dev/" \
  -H "Content-Type: application/json" \
  -d '["8.8.8.8", "1.1.1.1"]'
```

**返回结果:**
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

## 开发指南

### 前置要求

- Node.js & npm
- Cloudflare Wrangler CLI (`npm i -g wrangler`)

### 本地环境搭建

1. **安装依赖**
   ```bash
   npm install
   ```

2. **初始化本地数据库**
   ```bash
   npx wrangler d1 create edge-geo-db # 如果是首次创建
   npx wrangler d1 execute edge-geo-db --local --file=migrations/0000_schema.sql
   ```

3. **本地导入数据** (可选，用于测试)
   ```bash
   # 下载并处理 GeoIP 数据 (这将生成 SQL 文件到 data/ 目录)
   npx tsx scripts/process-geoip.ts
   
   # 导入到本地 D1 数据库
   npx tsx scripts/local-import.ts
   ```

4. **启动开发服务器**
   ```bash
   npm run dev
   ```

## 部署指南

1. **配置 Wrangler**
   在 `wrangler.toml` 中更新您的 D1 `database_id`。

2. **部署**
   ```bash
   npm run deploy
   ```

3. **配置自动更新**
   在 GitHub 仓库的 Secrets 中设置以下变量：
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`

   `.github/workflows/update-db.yml` 工作流将每周运行一次，保持数据库为最新状态。

## 许可证

本产品包含由 MaxMind 创建的 GeoLite2 数据，可从 [https://www.maxmind.com](https://www.maxmind.com) 获取。
