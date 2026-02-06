DROP TABLE IF EXISTS geo_locations;
CREATE TABLE geo_locations (
  start_ip INTEGER NOT NULL,
  end_ip INTEGER NOT NULL,
  country_code TEXT,
  city_name TEXT,
  latitude REAL,
  longitude REAL
);
CREATE INDEX idx_geo_locations_ip ON geo_locations (start_ip, end_ip);
