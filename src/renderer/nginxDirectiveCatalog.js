const ON_OFF_OPTIONS = [
  { value: 'on', label: 'on', description: '启用该指令能力。' },
  { value: 'off', label: 'off', description: '关闭该指令能力。' }
]

const LOCATION_MODIFIER_OPTIONS = [
  { value: '', label: 'prefix', description: '普通前缀匹配。' },
  { value: '=', label: '=', description: '精确匹配 URI。' },
  { value: '^~', label: '^~', description: '优先前缀匹配，命中后不再检查正则。' },
  { value: '~', label: '~', description: '区分大小写正则匹配。' },
  { value: '~*', label: '~*', description: '不区分大小写正则匹配。' },
  { value: '@', label: '@', description: '命名 location，仅用于内部跳转。' }
]

const CONTEXT_GROUPS = {
  main: { label: 'Main 全局上下文', description: '最外层配置，影响 master/worker 进程和全局加载。' },
  events: { label: 'events 事件模型', description: '连接事件处理、worker 连接数和事件驱动模型。' },
  http: { label: 'http 全局配置', description: 'Web 服务全局配置，可被 server/location 继承。' },
  server: { label: 'server 虚拟主机', description: 'HTTP 虚拟主机监听、域名、日志、证书和跳转。' },
  location: { label: 'location 路由匹配', description: 'HTTP 路由匹配、静态文件、代理和访问控制。' },
  stream: { label: 'stream 四层代理', description: 'TCP/UDP 四层代理上下文。' },
  mail: { label: 'mail 邮件代理', description: 'POP3/IMAP/SMTP 邮件代理上下文。' },
  upstream: { label: 'upstream 上游集群', description: '负载均衡集群和上游连接池。' },
  include: { label: 'include 引入文件', description: '按上下文引入其他 Nginx 配置文件。' }
}

const SECTION_GROUPS = {
  main: { label: 'main 进程与全局', description: '进程基础、PID、日志、模块和全局性能。' },
  events: { label: 'events 事件处理', description: '事件模型、连接数和调试连接。' },
  http: { label: 'http 基础与性能', description: 'HTTP 基础、日志、客户端限制、缓存、SSL、代理和内置子块。' },
  server: { label: 'server 基础配置', description: '监听、域名、站点目录、错误页和跳转。' },
  serverLog: { label: 'server 日志配置', description: '虚拟主机访问日志和错误日志。' },
  serverSsl: { label: 'server SSL 配置', description: '证书、协议、会话和客户端证书校验。' },
  serverExtra: { label: 'server 扩展指令', description: '响应头、重写、变量、认证、代理和 FastCGI。' },
  location: { label: 'location 匹配与静态', description: '匹配规则、root/alias、索引、try_files 和静态目录。' },
  locationProxy: { label: 'location 代理配置', description: '反向代理、代理缓存、超时和请求头。' },
  locationFastcgi: { label: 'location FastCGI/uWSGI/SCGI', description: 'PHP、Python 等上游网关配置。' },
  locationAccess: { label: 'location 访问控制', description: 'IP 访问控制、认证、限流和内部访问。' },
  locationExtra: { label: 'location 扩展指令', description: '响应头、缓存、重写、错误页和 gzip。' },
  include: { label: 'include 配置文件', description: '配置引入路径和所属上下文。' },
  block: { label: '可嵌套子块', description: 'server、location、upstream、map、geo 等块级结构。' }
}

function optionValues(options) {
  return Array.isArray(options) ? options.map(option => option.value) : undefined
}

function makeDirective(context, name, groupKey, description, options = {}) {
  const form = options.form || guessForm(name, options)
  const formOptions = options.options || (form === 'select' ? ON_OFF_OPTIONS : undefined)
  return {
    id: options.id || `${context}.${name}`,
    name,
    label: options.label || name,
    composeLabel: options.composeLabel || (['main', 'events', 'http', 'include'].includes(context) ? `${context}.${name}` : name),
    kind: options.kind || 'directive',
    contexts: options.contexts || [context],
    sectionKey: options.sectionKey || groupKey,
    groupKey,
    groupLabel: SECTION_GROUPS[groupKey]?.label || CONTEXT_GROUPS[context]?.label || groupKey,
    groupDescription: SECTION_GROUPS[groupKey]?.description || CONTEXT_GROUPS[context]?.description || '',
    description: description || `${name} 指令，适用于 ${CONTEXT_GROUPS[context]?.label || context}。`,
    valueTypes: options.valueTypes || ['string'],
    repeatable: !!options.repeatable,
    defaultValue: options.defaultValue,
    examples: options.examples || [],
    form: {
      type: form,
      rows: options.rows,
      options: formOptions,
      suggestions: options.suggestions,
      placeholder: options.placeholder
    }
  }
}

function makeBlock(context, name, groupKey, description, options = {}) {
  return makeDirective(context, name, groupKey, description, {
    ...options,
    kind: 'block',
    form: options.form || 'block',
    valueTypes: options.valueTypes || ['object']
  })
}

function guessForm(name, options = {}) {
  if (options.valueTypes?.includes('boolean')) return 'select'
  if (/^(include|log_format|access_log|error_log|add_header|rewrite|set|fastcgi_param|uwsgi_param|scgi_param|gzip_types|ssl_protocols|ssl_ciphers|allow|deny)$/.test(name)) return 'textarea'
  return 'input'
}

function directives(context, groupKey, names, defaults = {}) {
  return names.map(item => {
    const config = typeof item === 'string' ? { name: item } : item
    return makeDirective(context, config.name, groupKey, config.description, { ...defaults, ...config })
  })
}

export const nginxDirectiveCatalog = [
  ...directives('main', 'main', [
    { name: 'user', description: '指定 worker 进程运行用户和用户组。' },
    { name: 'worker_processes', description: 'worker 进程数量，常用 auto 或数字。', form: 'combobox', suggestions: ['auto', '1', '2', '4'], valueTypes: ['string', 'number'] },
    { name: 'worker_rlimit_nofile', description: '提高 worker 可打开文件数上限。', valueTypes: ['number', 'string'] },
    { name: 'worker_rlimit_core', description: '设置 core 文件最大大小。' },
    { name: 'daemon', description: '是否以守护进程方式运行。', valueTypes: ['boolean'], options: ON_OFF_OPTIONS },
    { name: 'master_process', description: '是否启用 master/worker 进程模型。', valueTypes: ['boolean'], options: ON_OFF_OPTIONS },
    { name: 'env', description: '向 worker 进程传递环境变量。', form: 'textarea', rows: 3, repeatable: true },
    { name: 'pid', description: 'master 进程 PID 文件路径。' },
    { name: 'error_log', description: '全局错误日志路径和日志级别。', form: 'textarea', rows: 2, repeatable: true },
    { name: 'include', description: '在 main 上下文引入其他配置。', form: 'textarea', rows: 3, repeatable: true },
    { name: 'load_module', description: '加载 Nginx 动态模块。', form: 'textarea', rows: 3, repeatable: true },
    { name: 'worker_cpu_affinity', description: '绑定 worker 到指定 CPU 核心。' },
    { name: 'timer_resolution', description: '降低 worker 中 gettimeofday 调用频率。' },
    { name: 'worker_priority', description: '设置 worker 进程优先级。', valueTypes: ['number', 'string'] }
  ]),
  ...directives('events', 'events', [
    { name: 'accept_mutex', description: '控制多 worker 接收连接的互斥锁。', valueTypes: ['boolean'], options: ON_OFF_OPTIONS },
    { name: 'accept_mutex_delay', description: 'accept_mutex 启用时的等待时间。', form: 'combobox', suggestions: ['500ms', '100ms', '1s'] },
    { name: 'multi_accept', description: '一次事件通知中尽可能多地接收新连接。', valueTypes: ['boolean'], options: ON_OFF_OPTIONS },
    { name: 'worker_connections', description: '单个 worker 最大连接数。', valueTypes: ['number', 'string'] },
    { name: 'use', description: '指定事件模型。', form: 'select', options: ['', 'epoll', 'kqueue', 'eventport', 'select', 'poll'].map(value => ({ value, label: value || '未设置', description: value ? `${value} 事件模型。` : '由 Nginx 自动选择。' })) },
    { name: 'debug_connection', description: '为指定客户端地址启用调试日志。', form: 'textarea', rows: 2, repeatable: true },
    { name: 'worker_aio_requests', description: '异步 I/O 请求数量上限。', valueTypes: ['number', 'string'] }
  ]),
  ...directives('http', 'http', [
    'include', 'default_type', 'log_format', 'access_log', 'error_log',
    { name: 'sendfile', valueTypes: ['boolean'], options: ON_OFF_OPTIONS },
    { name: 'tcp_nopush', valueTypes: ['boolean'], options: ON_OFF_OPTIONS },
    { name: 'tcp_nodelay', valueTypes: ['boolean'], options: ON_OFF_OPTIONS },
    'keepalive_timeout', 'keepalive_requests', 'keepalive_disable', 'send_timeout',
    'client_max_body_size', 'client_body_buffer_size', 'client_body_temp_path', 'client_body_timeout', 'client_header_buffer_size', 'large_client_header_buffers', 'client_header_timeout',
    { name: 'reset_timedout_connection', valueTypes: ['boolean'], options: ON_OFF_OPTIONS },
    'types', 'charset', 'charset_types', 'source_charset', 'charset_map',
    { name: 'gzip', valueTypes: ['boolean'], options: ON_OFF_OPTIONS },
    'gzip_types', 'gzip_min_length', 'gzip_buffers', 'gzip_comp_level', 'gzip_vary', 'gzip_proxied', 'gzip_disable',
    'open_file_cache', 'open_file_cache_valid', 'open_file_cache_min_uses', 'open_file_cache_errors',
    'server_names_hash_bucket_size', 'server_names_hash_max_size', 'variables_hash_bucket_size', 'variables_hash_max_size', 'types_hash_bucket_size', 'types_hash_max_size', 'map_hash_bucket_size',
    'deny', 'allow', 'auth_basic', 'auth_basic_user_file', 'auth_request', 'auth_request_set',
    'rewrite', 'rewrite_log', 'set', 'if', 'break', 'return',
    'add_header', 'always_add_header', 'expires', 'etag', 'chunked_transfer_encoding',
    'root', 'index', 'autoindex', 'autoindex_exact_size', 'autoindex_localtime', 'autoindex_format', 'empty_gif', 'try_files', 'alias', 'disable_symlinks', 'create_full_put_path',
    'ssl_protocols', 'ssl_ciphers', 'ssl_prefer_server_ciphers', 'ssl_session_cache', 'ssl_session_timeout', 'ssl_session_tickets', 'ssl_session_ticket_key', 'ssl_certificate', 'ssl_certificate_key', 'ssl_dhparam', 'ssl_trusted_certificate', 'ssl_verify_client', 'ssl_verify_depth',
    'proxy_pass', 'proxy_set_header', 'proxy_pass_request_headers', 'proxy_pass_request_body', 'proxy_http_version', 'proxy_method', 'proxy_connect_timeout', 'proxy_send_timeout', 'proxy_read_timeout', 'proxy_buffer_size', 'proxy_buffers', 'proxy_busy_buffers_size', 'proxy_temp_path', 'proxy_cache', 'proxy_cache_path', 'proxy_cache_key', 'proxy_cache_valid', 'proxy_cache_bypass', 'proxy_cache_lock', 'proxy_cache_min_uses', 'proxy_next_upstream', 'proxy_next_upstream_timeout', 'proxy_next_upstream_tries', 'proxy_redirect', 'proxy_cookie_domain', 'proxy_cookie_path', 'proxy_store', 'proxy_store_access', 'proxy_bind', 'proxy_protocol',
    'fastcgi_pass', 'fastcgi_index', 'fastcgi_param', 'fastcgi_connect_timeout', 'fastcgi_send_timeout', 'fastcgi_read_timeout', 'fastcgi_buffer_size', 'fastcgi_buffers', 'fastcgi_busy_buffers_size', 'fastcgi_temp_path', 'fastcgi_cache', 'fastcgi_cache_path', 'fastcgi_cache_key', 'fastcgi_cache_valid', 'fastcgi_cache_bypass', 'fastcgi_cache_lock', 'fastcgi_intercept_errors',
    'uwsgi_pass', 'uwsgi_param', 'uwsgi_connect_timeout', 'scgi_pass', 'scgi_param',
    'limit_req_zone', 'limit_conn_zone'
  ], { repeatable: false }),
  makeBlock('main', 'stream', 'block', 'stream 四层 TCP/UDP 代理顶层块，需 Nginx 编译启用 stream 模块。', { composeLabel: 'main.stream' }),
  makeBlock('main', 'mail', 'block', 'mail 邮件代理顶层块，需 Nginx 编译启用 mail 模块。', { composeLabel: 'main.mail' }),
  makeBlock('http', 'server', 'block', 'HTTP 虚拟主机块。', { composeLabel: 'http.server' }),
  makeBlock('http', 'upstream', 'block', 'HTTP 上游负载均衡集群。', { composeLabel: 'http.upstream' }),
  makeBlock('http', 'map', 'block', '按变量值生成新变量映射。', { composeLabel: 'http.map' }),
  makeBlock('http', 'split_clients', 'block', '按比例拆分流量。', { composeLabel: 'http.split_clients' }),
  makeBlock('http', 'geo', 'block', '按 IP 网段生成变量。', { composeLabel: 'http.geo' }),
  ...directives('server', 'server', [
    { name: 'listen', description: '监听地址、端口和协议参数。', form: 'textarea', rows: 2, repeatable: true, valueTypes: ['string', 'number'] },
    'server_name', 'server_name_in_redirect', 'port_in_redirect', 'root', 'index', 'charset', 'client_max_body_size', 'error_page', 'return', 'rewrite', 'if'
  ]),
  ...directives('server', 'serverLog', ['access_log', 'error_log']),
  ...directives('server', 'serverSsl', ['ssl_protocols', 'ssl_ciphers', 'ssl_prefer_server_ciphers', 'ssl_session_cache', 'ssl_session_timeout', 'ssl_session_tickets', 'ssl_session_ticket_key', 'ssl_certificate', 'ssl_certificate_key', 'ssl_dhparam', 'ssl_trusted_certificate', 'ssl_verify_client', 'ssl_verify_depth']),
  ...directives('server', 'serverExtra', ['include', 'add_header', 'set', 'proxy_pass', 'proxy_set_header', 'proxy_read_timeout', 'fastcgi_pass', 'fastcgi_param', 'uwsgi_pass', 'uwsgi_param', 'scgi_pass', 'scgi_param', 'auth_basic', 'auth_basic_user_file', 'deny', 'allow']),
  makeBlock('server', 'location', 'block', 'HTTP 路由匹配块。', { composeLabel: 'server.location' }),
  ...directives('location', 'location', [
    { name: 'modifier', description: 'location 匹配类型。', form: 'select', options: LOCATION_MODIFIER_OPTIONS, composeLabel: 'modifier' },
    { name: 'path', description: 'location 匹配路径或命名 location。', composeLabel: 'path' },
    'root', 'alias', 'index', 'try_files', 'autoindex', 'internal'
  ]),
  ...directives('location', 'locationProxy', ['proxy_pass', 'proxy_set_header', 'proxy_redirect', 'proxy_read_timeout', 'proxy_connect_timeout', 'proxy_send_timeout', 'proxy_buffer_size', 'proxy_buffers', 'proxy_cache', 'proxy_cache_key', 'proxy_cache_valid', 'proxy_cache_bypass']),
  ...directives('location', 'locationFastcgi', ['fastcgi_pass', 'fastcgi_index', 'fastcgi_param', 'fastcgi_connect_timeout', 'fastcgi_send_timeout', 'fastcgi_read_timeout', 'fastcgi_buffer_size', 'fastcgi_buffers', 'fastcgi_cache', 'uwsgi_pass', 'uwsgi_param', 'uwsgi_connect_timeout', 'scgi_pass', 'scgi_param']),
  ...directives('location', 'locationAccess', ['auth_basic', 'auth_basic_user_file', 'deny', 'allow', 'limit_req', 'limit_conn', 'satisfy']),
  ...directives('location', 'locationExtra', ['add_header', 'expires', 'gzip', 'client_max_body_size', 'error_page', 'return', 'rewrite', 'if', 'break', 'include']),
  ...directives('stream', 'stream', ['include', 'default_type', 'access_log', 'error_log', 'tcp_nodelay', 'tcp_nopush', 'preread_buffer_size', 'preread_timeout', 'variables_hash_bucket_size', 'variables_hash_max_size', 'ssl_certificate', 'ssl_certificate_key', 'ssl_protocols', 'ssl_ciphers']),
  makeBlock('stream', 'upstream', 'block', 'stream 四层上游集群。', { composeLabel: 'stream.upstream' }),
  makeBlock('stream', 'server', 'block', 'stream 四层代理 server。', { composeLabel: 'stream.server' }),
  ...directives('mail', 'mail', ['auth_http', 'auth_http_header', 'auth_http_timeout', 'server_name', 'mail_ssl', 'ssl_certificate', 'ssl_certificate_key', 'ssl_ciphers']),
  makeBlock('mail', 'server', 'block', 'mail 邮件代理 server。', { composeLabel: 'mail.server' }),
  ...directives('upstream', 'upstream', ['server', 'weight', 'max_fails', 'fail_timeout', 'backup', 'down', 'ip_hash', 'least_conn', 'hash', 'random', 'keepalive', 'zone']),
  makeDirective('include', 'context', 'include', 'include 所属上下文。', { composeLabel: 'include.context', form: 'select', options: ['main', 'http', 'server', 'location', 'stream'].map(value => ({ value, label: value, description: `${value} 上下文。` })) }),
  makeDirective('include', 'pattern', 'include', 'include 匹配表达式或配置文件路径。', { composeLabel: 'pattern' })
]

const exactSchemaMap = new Map()
const contextNameSchemaMap = new Map()

for (const entry of nginxDirectiveCatalog) {
  exactSchemaMap.set(entry.composeLabel, entry)
  exactSchemaMap.set(entry.id, entry)
  for (const context of entry.contexts || []) contextNameSchemaMap.set(`${context}:${entry.name}`, entry)
}

export const NGINX_COMPOSE_FIELD_SCHEMA = Object.fromEntries(
  nginxDirectiveCatalog
    .filter(entry => entry.kind === 'directive')
    .map(entry => [entry.composeLabel, toLegacyFieldSchema(entry)])
)

export function getNginxComposeFieldSchema(label = '', context = '') {
  const exact = exactSchemaMap.get(label)
  const scoped = context ? contextNameSchemaMap.get(`${context}:${label}`) : null
  const byName = nginxDirectiveCatalog.find(entry => entry.kind === 'directive' && entry.name === label)
  return toLegacyFieldSchema(exact || scoped || byName || null)
}

export function getNginxComposeFieldsForContext(context = '') {
  return nginxDirectiveCatalog.filter(entry => entry.kind === 'directive' && (entry.contexts || []).includes(context))
}

export function getNginxComposeCatalogEntriesForContext(context = '') {
  return nginxDirectiveCatalog.filter(entry => (entry.contexts || []).includes(context))
}

export function getNginxComposeGroupInfo(groupKey = '') {
  return SECTION_GROUPS[groupKey] || CONTEXT_GROUPS[groupKey] || { label: groupKey, description: '' }
}

function toLegacyFieldSchema(entry) {
  if (!entry) return null
  return {
    form: entry.form?.type || 'input',
    rows: entry.form?.rows,
    options: optionValues(entry.form?.options),
    optionDescriptions: Array.isArray(entry.form?.options) ? entry.form.options : undefined,
    suggestions: entry.form?.suggestions,
    placeholder: entry.form?.placeholder,
    valueTypes: entry.valueTypes,
    repeatable: entry.repeatable,
    defaultValue: entry.defaultValue,
    description: entry.description,
    groupKey: entry.groupKey,
    groupLabel: entry.groupLabel,
    groupDescription: entry.groupDescription,
    sectionKey: entry.sectionKey,
    name: entry.name,
    composeLabel: entry.composeLabel
  }
}
