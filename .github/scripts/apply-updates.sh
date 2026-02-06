#!/bin/bash
set -e

# Loop through all SQL files in data directory
for file in data/*.sql; do
  echo "Applying $file..."
  # Use --batch-size if needed, but default is usually fine.
  # Adding retries could be good, but let's keep it simple first.
  npx wrangler d1 execute edge-geo-db --file="$file" --remote
done

echo "Verifying import..."
npx wrangler d1 execute edge-geo-db --command "SELECT COUNT(*) as total FROM geo_locations;" --remote
