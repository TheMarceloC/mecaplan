BEGIN;
CREATE SCHEMA IF NOT EXISTS mecaplan;
REVOKE ALL ON SCHEMA mecaplan FROM PUBLIC;
SET LOCAL search_path TO mecaplan, pg_catalog;
CREATE TABLE IF NOT EXISTS users(id text PRIMARY KEY,name text NOT NULL,email text NOT NULL UNIQUE,password_hash text NOT NULL,global_role text NOT NULL CHECK(global_role IN ('user','superuser')),status text NOT NULL CHECK(status IN ('active','pending','disabled')),username text UNIQUE,is_instructor integer NOT NULL DEFAULT 0 CHECK(is_instructor IN (0,1)),must_change_password integer NOT NULL DEFAULT 0 CHECK(must_change_password IN (0,1)));
CREATE TABLE IF NOT EXISTS projects(id text PRIMARY KEY,payload text NOT NULL CHECK(jsonb_typeof(payload::jsonb)='object'));
CREATE TABLE IF NOT EXISTS sessions(id text PRIMARY KEY,user_id text NOT NULL,expires_at text NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS login_attempts(key text PRIMARY KEY,count integer NOT NULL,expires_at bigint NOT NULL);
CREATE TABLE IF NOT EXISTS password_resets(token_hash text PRIMARY KEY,user_id text NOT NULL,expires_at bigint NOT NULL);
CREATE TABLE IF NOT EXISTS evaluations(id text PRIMARY KEY,project_id text NOT NULL,author_id text NOT NULL,payload text NOT NULL);
CREATE INDEX IF NOT EXISTS evaluations_project ON evaluations(project_id);
CREATE TABLE IF NOT EXISTS evaluation_versions(id text PRIMARY KEY,evaluation_id text NOT NULL,project_id text NOT NULL,actor_id text NOT NULL,date text NOT NULL,payload text NOT NULL,sequence bigserial UNIQUE);
CREATE INDEX IF NOT EXISTS evaluation_versions_evaluation ON evaluation_versions(evaluation_id,sequence);
CREATE TABLE IF NOT EXISTS retained_projects(id text PRIMARY KEY,name text NOT NULL,deleted_at text NOT NULL,deleted_by text NOT NULL);
CREATE TABLE IF NOT EXISTS global_audit(id text PRIMARY KEY,actor_id text NOT NULL,action text NOT NULL,date text NOT NULL,payload text NOT NULL);
CREATE TABLE IF NOT EXISTS import_previews(id text PRIMARY KEY,project_id text NOT NULL,user_id text NOT NULL,expires_at bigint NOT NULL,base_hash text NOT NULL,file_hash text NOT NULL,payload text NOT NULL);
CREATE TABLE IF NOT EXISTS storage_connections(id text PRIMARY KEY,payload text NOT NULL);
CREATE TABLE IF NOT EXISTS oauth_states(id text PRIMARY KEY,user_id text NOT NULL,expires_at bigint NOT NULL,payload text NOT NULL);
CREATE TABLE IF NOT EXISTS storage_operations(id text PRIMARY KEY,project_id text NOT NULL,actor_id text NOT NULL,date text NOT NULL,payload text NOT NULL);
CREATE TABLE IF NOT EXISTS app_locks(name text PRIMARY KEY,owner text NOT NULL,expires_at bigint NOT NULL);
CREATE TABLE IF NOT EXISTS schema_migrations(version integer PRIMARY KEY,applied_at text NOT NULL);
INSERT INTO schema_migrations VALUES(2,to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) ON CONFLICT(version) DO NOTHING;
DO $$
DECLARE t text; role_name text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='mecaplan' LOOP
    EXECUTE format('ALTER TABLE mecaplan.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON TABLE mecaplan.%I FROM PUBLIC',t);
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
        EXECUTE format('REVOKE ALL ON TABLE mecaplan.%I FROM %I',t,role_name);
      END IF;
    END LOOP;
  END LOOP;
END $$;
COMMIT;
