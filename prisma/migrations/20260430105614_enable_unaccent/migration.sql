-- Enable the unaccent extension to allow accent-insensitive name search.
-- Idempotent: no-op if the extension is already installed.
CREATE EXTENSION IF NOT EXISTS unaccent;
