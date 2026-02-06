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
