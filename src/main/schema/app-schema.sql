PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL DEFAULT '',
  password_salt TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  last_login_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'local' REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS app_user_licenses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  identifier TEXT NOT NULL,
  project_code TEXT NOT NULL,
  product_code TEXT NOT NULL,
  device_id TEXT NOT NULL,
  authorization_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  max_devices INTEGER NOT NULL DEFAULT 1,
  active_devices INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER,
  activated_at INTEGER,
  updated_at INTEGER NOT NULL,
  last_verified_at INTEGER,
  raw_payload TEXT NOT NULL DEFAULT '{}',
  UNIQUE (user_id, project_code, product_code, device_id)
);

CREATE TABLE IF NOT EXISTS app_settings (
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES workspaces(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'app',
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, scope, key)
);

CREATE TABLE IF NOT EXISTS app_kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL DEFAULT 'local' REFERENCES users(id) ON DELETE SET DEFAULT,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT '',
  target_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ok',
  detail TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS server_accounts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  protocol TEXT NOT NULL DEFAULT 'ssh',
  host TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 22,
  username TEXT NOT NULL,
  auth_type TEXT NOT NULL DEFAULT 'password',
  encrypted_password TEXT NOT NULL DEFAULT '',
  private_key TEXT NOT NULL DEFAULT '',
  encrypted_passphrase TEXT NOT NULL DEFAULT '',
  remark TEXT NOT NULL DEFAULT '',
  last_connected_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (workspace_id, protocol, host, port, username)
);

CREATE TABLE IF NOT EXISTS server_sessions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES workspaces(id) ON DELETE CASCADE,
  server_account_id TEXT REFERENCES server_accounts(id) ON DELETE SET NULL,
  protocol TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  username TEXT NOT NULL,
  connected_at INTEGER NOT NULL,
  disconnected_at INTEGER,
  status TEXT NOT NULL DEFAULT 'connected'
);

CREATE TABLE IF NOT EXISTS server_overview_snapshots (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES workspaces(id) ON DELETE CASCADE,
  server_account_id TEXT REFERENCES server_accounts(id) ON DELETE CASCADE,
  hostname TEXT NOT NULL DEFAULT '',
  os_name TEXT NOT NULL DEFAULT '',
  kernel TEXT NOT NULL DEFAULT '',
  cpu_model TEXT NOT NULL DEFAULT '',
  cpu_cores INTEGER NOT NULL DEFAULT 0,
  memory_total INTEGER NOT NULL DEFAULT 0,
  disk_total INTEGER NOT NULL DEFAULT 0,
  ip_address TEXT NOT NULL DEFAULT '',
  raw_json TEXT NOT NULL DEFAULT '{}',
  collected_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS database_connections (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'mysql',
  host TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 3306,
  username TEXT NOT NULL,
  encrypted_password TEXT NOT NULL DEFAULT '',
  default_database TEXT NOT NULL DEFAULT '',
  charset TEXT NOT NULL DEFAULT 'utf8mb4',
  ssl_enabled INTEGER NOT NULL DEFAULT 0,
  options_json TEXT NOT NULL DEFAULT '{}',
  last_connected_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (workspace_id, type, host, port, username, default_database)
);

CREATE TABLE IF NOT EXISTS database_saved_queries (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES workspaces(id) ON DELETE CASCADE,
  connection_id TEXT REFERENCES database_connections(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  database_name TEXT NOT NULL DEFAULT '',
  sql_text TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS database_query_history (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES workspaces(id) ON DELETE CASCADE,
  connection_id TEXT REFERENCES database_connections(id) ON DELETE SET NULL,
  database_name TEXT NOT NULL DEFAULT '',
  sql_text TEXT NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  row_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ok',
  error_message TEXT NOT NULL DEFAULT '',
  executed_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS file_bookmarks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES workspaces(id) ON DELETE CASCADE,
  server_account_id TEXT REFERENCES server_accounts(id) ON DELETE CASCADE,
  side TEXT NOT NULL DEFAULT 'remote',
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (workspace_id, server_account_id, side, path)
);

CREATE TABLE IF NOT EXISTS file_preview_preferences (
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES workspaces(id) ON DELETE CASCADE,
  file_type TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, file_type)
);

CREATE TABLE IF NOT EXISTS remote_directory_access_cache (
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES workspaces(id) ON DELETE CASCADE,
  server_account_id TEXT NOT NULL REFERENCES server_accounts(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  readable INTEGER NOT NULL DEFAULT 0,
  writable INTEGER NOT NULL DEFAULT 0,
  executable INTEGER NOT NULL DEFAULT 0,
  checked_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, server_account_id, path)
);

CREATE TABLE IF NOT EXISTS file_transfer_history (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES workspaces(id) ON DELETE CASCADE,
  server_account_id TEXT REFERENCES server_accounts(id) ON DELETE SET NULL,
  direction TEXT NOT NULL,
  local_path TEXT NOT NULL DEFAULT '',
  remote_path TEXT NOT NULL DEFAULT '',
  size INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT NOT NULL DEFAULT '',
  started_at INTEGER NOT NULL,
  finished_at INTEGER
);

CREATE TABLE IF NOT EXISTS terminal_command_history (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES workspaces(id) ON DELETE CASCADE,
  server_account_id TEXT REFERENCES server_accounts(id) ON DELETE CASCADE,
  command TEXT NOT NULL,
  exit_code INTEGER,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  executed_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS terminal_command_snippets (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  command TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS service_snapshots (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES workspaces(id) ON DELETE CASCADE,
  server_account_id TEXT REFERENCES server_accounts(id) ON DELETE CASCADE,
  service_manager TEXT NOT NULL DEFAULT 'systemd',
  collected_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS service_units (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES service_snapshots(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  load_state TEXT NOT NULL DEFAULT '',
  active_state TEXT NOT NULL DEFAULT '',
  sub_state TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  raw_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS system_user_snapshots (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES workspaces(id) ON DELETE CASCADE,
  server_account_id TEXT REFERENCES server_accounts(id) ON DELETE CASCADE,
  collected_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS system_users (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES system_user_snapshots(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  uid INTEGER NOT NULL,
  gid INTEGER NOT NULL,
  home TEXT NOT NULL DEFAULT '',
  shell TEXT NOT NULL DEFAULT '',
  groups_text TEXT NOT NULL DEFAULT '',
  raw_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS port_scan_snapshots (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES workspaces(id) ON DELETE CASCADE,
  server_account_id TEXT REFERENCES server_accounts(id) ON DELETE CASCADE,
  collected_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS listening_ports (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES port_scan_snapshots(id) ON DELETE CASCADE,
  protocol TEXT NOT NULL,
  local_address TEXT NOT NULL DEFAULT '',
  port INTEGER NOT NULL,
  process_name TEXT NOT NULL DEFAULT '',
  pid INTEGER,
  raw_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS firewall_snapshots (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES workspaces(id) ON DELETE CASCADE,
  server_account_id TEXT REFERENCES server_accounts(id) ON DELETE CASCADE,
  firewall_type TEXT NOT NULL DEFAULT '',
  collected_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS firewall_rules (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES firewall_snapshots(id) ON DELETE CASCADE,
  rule_no INTEGER,
  direction TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT '',
  protocol TEXT NOT NULL DEFAULT '',
  port TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  target TEXT NOT NULL DEFAULT '',
  raw_text TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS nginx_instances (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES workspaces(id) ON DELETE CASCADE,
  server_account_id TEXT REFERENCES server_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Nginx',
  nginx_home TEXT NOT NULL DEFAULT '/etc/nginx',
  main_config_path TEXT NOT NULL DEFAULT '/etc/nginx/nginx.conf',
  backup_dir TEXT NOT NULL DEFAULT '/www/backup/nginx',
  ssl_dir TEXT NOT NULL DEFAULT '/etc/letsencrypt/live',
  scan_paths TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (workspace_id, server_account_id, main_config_path)
);

CREATE TABLE IF NOT EXISTS nginx_config_files (
  id TEXT PRIMARY KEY,
  nginx_instance_id TEXT NOT NULL REFERENCES nginx_instances(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  content_hash TEXT NOT NULL DEFAULT '',
  size INTEGER NOT NULL DEFAULT 0,
  server_count INTEGER NOT NULL DEFAULT 0,
  include_count INTEGER NOT NULL DEFAULT 0,
  last_scanned_at INTEGER,
  UNIQUE (nginx_instance_id, path)
);

CREATE TABLE IF NOT EXISTS nginx_config_versions (
  id TEXT PRIMARY KEY,
  nginx_config_file_id TEXT NOT NULL REFERENCES nginx_config_files(id) ON DELETE CASCADE,
  content_hash TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS nginx_config_includes (
  id TEXT PRIMARY KEY,
  nginx_config_file_id TEXT NOT NULL REFERENCES nginx_config_files(id) ON DELETE CASCADE,
  line INTEGER NOT NULL DEFAULT 0,
  pattern TEXT NOT NULL DEFAULT '',
  matched_paths TEXT NOT NULL DEFAULT '',
  raw_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS nginx_server_blocks (
  id TEXT PRIMARY KEY,
  nginx_config_file_id TEXT NOT NULL REFERENCES nginx_config_files(id) ON DELETE CASCADE,
  start_line INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL DEFAULT '',
  server_name TEXT NOT NULL DEFAULT '',
  listens TEXT NOT NULL DEFAULT '',
  root TEXT NOT NULL DEFAULT '',
  proxy_pass TEXT NOT NULL DEFAULT '',
  ssl_certificates TEXT NOT NULL DEFAULT '',
  ssl_certificate_keys TEXT NOT NULL DEFAULT '',
  raw_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS nginx_upstream_blocks (
  id TEXT PRIMARY KEY,
  nginx_config_file_id TEXT NOT NULL REFERENCES nginx_config_files(id) ON DELETE CASCADE,
  start_line INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL DEFAULT '',
  servers TEXT NOT NULL DEFAULT '',
  raw_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS nginx_source_history (
  id TEXT PRIMARY KEY,
  nginx_instance_id TEXT REFERENCES nginx_instances(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  opened_at INTEGER NOT NULL,
  UNIQUE (nginx_instance_id, path)
);

CREATE TABLE IF NOT EXISTS nginx_compose_drafts (
  draft_key TEXT PRIMARY KEY,
  nginx_home TEXT NOT NULL,
  main_config_path TEXT NOT NULL,
  source_path TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS nginx_compose_nodes (
  id TEXT PRIMARY KEY,
  draft_key TEXT NOT NULL REFERENCES nginx_compose_drafts(draft_key) ON DELETE CASCADE,
  node_type TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  file_path TEXT NOT NULL DEFAULT '',
  source_start_line INTEGER NOT NULL DEFAULT 0,
  x REAL NOT NULL DEFAULT 0,
  y REAL NOT NULL DEFAULT 0,
  width REAL,
  height REAL,
  z_index INTEGER NOT NULL DEFAULT 3,
  data_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS nginx_compose_edges (
  id TEXT PRIMARY KEY,
  draft_key TEXT NOT NULL REFERENCES nginx_compose_drafts(draft_key) ON DELETE CASCADE,
  from_node_id TEXT NOT NULL,
  from_port_id TEXT NOT NULL,
  to_node_id TEXT NOT NULL,
  to_port_id TEXT NOT NULL,
  data_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS nginx_ssl_certificates (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES workspaces(id) ON DELETE CASCADE,
  nginx_instance_id TEXT REFERENCES nginx_instances(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  domains TEXT NOT NULL DEFAULT '',
  cert_path TEXT NOT NULL DEFAULT '',
  key_path TEXT NOT NULL DEFAULT '',
  target_dir TEXT NOT NULL DEFAULT '',
  certbot_domain TEXT NOT NULL DEFAULT '',
  issuer TEXT NOT NULL DEFAULT '',
  expires_at TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'unknown',
  source TEXT NOT NULL DEFAULT 'manual',
  data_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS nginx_ssl_certificate_refs (
  id TEXT PRIMARY KEY,
  certificate_id TEXT NOT NULL REFERENCES nginx_ssl_certificates(id) ON DELETE CASCADE,
  config_file_path TEXT NOT NULL,
  server_name TEXT NOT NULL DEFAULT '',
  start_line INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pm2_snapshots (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES workspaces(id) ON DELETE CASCADE,
  server_account_id TEXT REFERENCES server_accounts(id) ON DELETE CASCADE,
  collected_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pm2_processes (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES pm2_snapshots(id) ON DELETE CASCADE,
  pm_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  namespace TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  script_path TEXT NOT NULL DEFAULT '',
  cwd TEXT NOT NULL DEFAULT '',
  restart_count INTEGER NOT NULL DEFAULT 0,
  cpu REAL NOT NULL DEFAULT 0,
  memory INTEGER NOT NULL DEFAULT 0,
  raw_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS pm2_process_details (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES workspaces(id) ON DELETE CASCADE,
  server_account_id TEXT REFERENCES server_accounts(id) ON DELETE CASCADE,
  pm_id INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL DEFAULT '',
  detail_json TEXT NOT NULL DEFAULT '{}',
  collected_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pm2_log_snapshots (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES workspaces(id) ON DELETE CASCADE,
  server_account_id TEXT REFERENCES server_accounts(id) ON DELETE CASCADE,
  pm_id INTEGER,
  name TEXT NOT NULL DEFAULT '',
  lines INTEGER NOT NULL DEFAULT 200,
  stdout TEXT NOT NULL DEFAULT '',
  stderr TEXT NOT NULL DEFAULT '',
  collected_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS docker_snapshots (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES workspaces(id) ON DELETE CASCADE,
  server_account_id TEXT REFERENCES server_accounts(id) ON DELETE CASCADE,
  collected_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS docker_containers (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES docker_snapshots(id) ON DELETE CASCADE,
  container_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  ports TEXT NOT NULL DEFAULT '',
  raw_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS docker_images (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES docker_snapshots(id) ON DELETE CASCADE,
  image_id TEXT NOT NULL,
  repository TEXT NOT NULL DEFAULT '',
  tag TEXT NOT NULL DEFAULT '',
  size TEXT NOT NULL DEFAULT '',
  raw_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS docker_container_processes (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES workspaces(id) ON DELETE CASCADE,
  server_account_id TEXT REFERENCES server_accounts(id) ON DELETE CASCADE,
  container_id TEXT NOT NULL,
  pid INTEGER,
  command TEXT NOT NULL DEFAULT '',
  args TEXT NOT NULL DEFAULT '',
  raw_json TEXT NOT NULL DEFAULT '{}',
  collected_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS docker_log_snapshots (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES workspaces(id) ON DELETE CASCADE,
  server_account_id TEXT REFERENCES server_accounts(id) ON DELETE CASCADE,
  container_id TEXT NOT NULL,
  lines INTEGER NOT NULL DEFAULT 200,
  content TEXT NOT NULL DEFAULT '',
  collected_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS object_storage_connections (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT '',
  endpoint TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  bucket TEXT NOT NULL DEFAULT '',
  access_key_id TEXT NOT NULL DEFAULT '',
  encrypted_secret_key TEXT NOT NULL DEFAULT '',
  options_json TEXT NOT NULL DEFAULT '{}',
  last_connected_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS object_storage_bookmarks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES workspaces(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL REFERENCES object_storage_connections(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  object_prefix TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (connection_id, object_prefix)
);

CREATE TABLE IF NOT EXISTS log_sources (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES workspaces(id) ON DELETE CASCADE,
  server_account_id TEXT REFERENCES server_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'file',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (workspace_id, server_account_id, path)
);

CREATE TABLE IF NOT EXISTS log_read_history (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES workspaces(id) ON DELETE CASCADE,
  server_account_id TEXT REFERENCES server_accounts(id) ON DELETE SET NULL,
  path TEXT NOT NULL,
  lines INTEGER NOT NULL DEFAULT 200,
  keyword TEXT NOT NULL DEFAULT '',
  read_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace_module ON audit_logs(workspace_id, module, created_at);
CREATE INDEX IF NOT EXISTS idx_server_accounts_workspace ON server_accounts(workspace_id, host, username);
CREATE INDEX IF NOT EXISTS idx_database_connections_workspace ON database_connections(workspace_id, type, host);
CREATE INDEX IF NOT EXISTS idx_database_query_history_connection ON database_query_history(connection_id, executed_at);
CREATE INDEX IF NOT EXISTS idx_file_bookmarks_workspace_side ON file_bookmarks(workspace_id, side, path);
CREATE INDEX IF NOT EXISTS idx_file_transfer_history_workspace ON file_transfer_history(workspace_id, started_at);
CREATE INDEX IF NOT EXISTS idx_terminal_command_history_server ON terminal_command_history(server_account_id, executed_at);
CREATE INDEX IF NOT EXISTS idx_service_units_snapshot_name ON service_units(snapshot_id, name);
CREATE INDEX IF NOT EXISTS idx_system_users_snapshot_username ON system_users(snapshot_id, username);
CREATE INDEX IF NOT EXISTS idx_listening_ports_snapshot_port ON listening_ports(snapshot_id, port);
CREATE INDEX IF NOT EXISTS idx_firewall_rules_snapshot_port ON firewall_rules(snapshot_id, port);
CREATE INDEX IF NOT EXISTS idx_nginx_instances_workspace ON nginx_instances(workspace_id, server_account_id);
CREATE INDEX IF NOT EXISTS idx_nginx_config_files_instance_path ON nginx_config_files(nginx_instance_id, path);
CREATE INDEX IF NOT EXISTS idx_nginx_config_includes_file ON nginx_config_includes(nginx_config_file_id, pattern);
CREATE INDEX IF NOT EXISTS idx_nginx_server_blocks_file ON nginx_server_blocks(nginx_config_file_id, server_name);
CREATE INDEX IF NOT EXISTS idx_nginx_upstream_blocks_file ON nginx_upstream_blocks(nginx_config_file_id, name);
CREATE INDEX IF NOT EXISTS idx_nginx_source_history_instance ON nginx_source_history(nginx_instance_id, opened_at);
CREATE INDEX IF NOT EXISTS idx_nginx_compose_nodes_draft ON nginx_compose_nodes(draft_key, node_type);
CREATE INDEX IF NOT EXISTS idx_nginx_compose_edges_draft ON nginx_compose_edges(draft_key, from_node_id, to_node_id);
CREATE INDEX IF NOT EXISTS idx_nginx_ssl_certificates_instance ON nginx_ssl_certificates(nginx_instance_id, status);
CREATE INDEX IF NOT EXISTS idx_pm2_processes_snapshot_name ON pm2_processes(snapshot_id, name);
CREATE INDEX IF NOT EXISTS idx_pm2_process_details_server ON pm2_process_details(server_account_id, collected_at);
CREATE INDEX IF NOT EXISTS idx_docker_containers_snapshot_name ON docker_containers(snapshot_id, name);
CREATE INDEX IF NOT EXISTS idx_docker_container_processes_container ON docker_container_processes(container_id, collected_at);
CREATE INDEX IF NOT EXISTS idx_object_storage_connections_workspace ON object_storage_connections(workspace_id, provider, bucket);
CREATE INDEX IF NOT EXISTS idx_log_sources_workspace_path ON log_sources(workspace_id, path);
CREATE INDEX IF NOT EXISTS idx_log_read_history_workspace ON log_read_history(workspace_id, read_at);

INSERT OR IGNORE INTO users (id, username, display_name, status, created_at, updated_at)
VALUES ('local', 'local', 'Local User', 'active', strftime('%s','now') * 1000, strftime('%s','now') * 1000);

INSERT OR IGNORE INTO workspaces (id, user_id, name, description, is_default, created_at, updated_at)
VALUES ('default', 'local', 'Default Workspace', 'Local default workspace', 1, strftime('%s','now') * 1000, strftime('%s','now') * 1000);

INSERT OR IGNORE INTO schema_migrations (version, name, applied_at)
VALUES (1, 'initial_structured_schema', strftime('%s','now') * 1000);
