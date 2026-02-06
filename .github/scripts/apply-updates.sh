#!/bin/bash
set -e

# Loop through all SQL files in data directory
for file in data/*.sql; do
  echo "Applying $file..."
  npx wrangler d1 execute edge-geo-db --file="$file" --remote
done

echo "Verifying import..."
npx wrangler d1 execute edge-geo-db --command "SELECT COUNT(*) as total FROM geo_locations;" --remote
