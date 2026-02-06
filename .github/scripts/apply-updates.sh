#!/bin/bash
set -e

# Loop through all SQL files in data directory
for file in data/*.sql; do
  echo "Applying $file..."
  
  # Retry loop
  MAX_RETRIES=3
  RETRY_DELAY=5
  count=0
  success=false
  
  while [ $count -lt $MAX_RETRIES ]; do
    if npx wrangler d1 execute edge-geo-db --file="$file" --remote; then
      success=true
      break
    else
      count=$((count + 1))
      echo "Command failed. Retrying in $RETRY_DELAY seconds... ($count/$MAX_RETRIES)"
      sleep $RETRY_DELAY
    fi
  done
  
  if [ "$success" = false ]; then
    echo "Failed to apply $file after $MAX_RETRIES attempts."
    exit 1
  fi
done

echo "Verifying import..."
npx wrangler d1 execute edge-geo-db --command "SELECT COUNT(*) as total FROM geo_locations;" --remote
