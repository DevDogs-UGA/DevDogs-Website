CREATE SCHEMA "uga";

GRANT CREATE, USAGE ON SCHEMA "uga" TO "postgres";

GRANT USAGE ON SCHEMA "uga" TO PUBLIC;

COMMENT ON SCHEMA "uga" IS 'UGA reference data as the catalog API reads it: views over the registrar tables, readable by every role because the data is already public, and the scrape run log, which is not. The catalog Worker reads as the catalog_reader role, which holds nothing else. Not exposed through PostgREST.';
