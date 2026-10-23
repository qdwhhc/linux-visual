const terminalCommandSecondaryKeywords = new Set(['addr', 'cp', 'deactivate', 'disable', 'enable', 'exec', 'freeze', 'images', 'install', 'list-units', 'logs', 'manage.py', 'ps', 'pull', 'remove', 'restart', 'rm', 'rmi', 'run', 'search', 'show', 'source', 'start', 'status', 'stop', 'update', 'upgrade'])

export const terminalCommandScopes = [
  { value: 'all', label: '全部' },
  { value: 'linux', label: 'Linux' },
  { value: 'mysql', label: 'MySQL' },
  { value: 'python', label: 'Python' },
  { value: 'nginx', label: 'Nginx' },
  { value: 'docker', label: 'Docker' },
  { value: 'nodejs', label: 'Node.js' },
  { value: 'redis', label: 'Redis' }
]

const terminalCommandDangerPatterns = [
  /rm\s+-rf/i,
  /shutdown/i,
  /poweroff/i,
  /halt/i,
  /reboot/i,
  /drop\s+database/i,
  /drop\s+table/i,
  /drop\s+user/i,
  /truncate\s+table/i,
  /flushall/i,
  /flushdb/i,
  /kill\s+\d+/i,
  /fsck/i,
  /docker\s+system\s+prune/i,
  /container\s+prune/i,
  /image\s+prune/i,
  /volume\s+prune/i
]

const terminalCommandInterruptPatterns = [
  /systemctl\s+(stop|restart|reload)/i,
  /pm2\s+(stop|restart|reload|delete)/i,
  /docker\s+(stop|restart|rm)/i,
  /docker\s+compose\s+(down|restart|stop)/i,
  /kill\s+/i,
  /reload/i,
  /restart/i,
  /stop\s+/i,
  /start\s+replica/i,
  /stop\s+replica/i,
  /change\s+replication\s+source/i
]

const terminalCommandWritePatterns = [
  /\btouch\b/i,
  /\bmkdir\b/i,
  /\brmdir\b/i,
  /\bcp\b/i,
  /\bmv\b/i,
  /\brm\b/i,
  /create\s+/i,
  /alter\s+/i,
  /insert\s+/i,
  /update\s+/i,
  /delete\s+from/i,
  /replace\s+into/i,
  /grant\s+/i,
  /revoke\s+/i,
  /flush\s+privileges/i,
  /set\s+global/i,
  /set\s+session/i,
  /install/i,
  /uninstall/i,
  /build/i,
  /push\s+/i,
  /load\s+/i,
  /save\s+/i,
  /rename\s+/i,
  /user(add|mod|del)/i,
  /passwd/i,
  /systemctl\s+(enable|disable|edit|mask|unmask)/i,
  /chmod/i,
  /chown/i,
  /certbot/i,
  /tcpdump\s+-i\s+.+\s+-w\s+/i
]

function inferTerminalCommandRisks(title, description, children) {
  const source = [
    title,
    description,
    ...children.flatMap(item => [item.command, item.title, item.description, item.example, ...(item.keywords || [])])
  ].join(' ')

  const risks = []

  if (terminalCommandDangerPatterns.some(pattern => pattern.test(source))) {
    risks.push('危险')
  }

  if (terminalCommandInterruptPatterns.some(pattern => pattern.test(source))) {
    risks.push('会中断服务')
  }

  if (terminalCommandWritePatterns.some(pattern => pattern.test(source))) {
    risks.push('写操作')
  }

  if (!risks.length) {
    risks.push('只读')
  }

  return risks
}

function createTerminalCommandCategory(id, scope, title, description, children) {
  const normalizedChildren = children.map((item, index) => ({
    id: `${id}-${index + 1}`,
    type: 'command',
    parentId: id,
    scope,
    ...item
  }))

  return {
    type: 'category',
    id,
    scope,
    title,
    description,
    risks: inferTerminalCommandRisks(title, description, normalizedChildren),
    children: normalizedChildren
  }
}

function createTerminalCommandItem(command, title, description, example, keywords = []) {
  return { command, title, description, example, keywords }
}

function getTerminalCommandPartType(token, index) {
  if (index === 0) return 'primary'
  if (index === 1 && terminalCommandSecondaryKeywords.has(token)) return 'primary'
  if (token.startsWith('-')) return 'option'
  return 'argument'
}

function fuzzyMatchTerminalCommand(text, keyword) {
  const source = normalizeTerminalCommandSearch(text)
  if (!source || !keyword) return false
  if (source.includes(keyword)) return true

  let index = 0
  for (const char of source) {
    if (char === keyword[index]) index += 1
    if (index >= keyword.length) return true
  }
  return false
}

export const terminalCommandReferences = [
  createTerminalCommandCategory('terminal-basic', 'linux', '基础终端', '终端最基础的控制与交互操作。', [
    createTerminalCommandItem('clear', '清空当前终端内容', '清屏但不会结束当前会话。', 'clear'),
    createTerminalCommandItem('exit', '退出当前终端会话', '关闭当前 shell 或结束当前终端连接。', 'exit'),
    createTerminalCommandItem('history', '查看历史命令', '列出当前用户执行过的命令历史。', 'history'),
    createTerminalCommandItem('!数字', '重跑指定历史命令', '按历史编号重新执行某一条命令。', '!25'),
    createTerminalCommandItem('Ctrl+C', '终止前台程序', '强制中断当前正在执行的前台任务。', 'Ctrl + C'),
    createTerminalCommandItem('Ctrl+Z', '挂起前台程序', '把当前任务挂起到后台暂停状态。', 'Ctrl + Z'),
    createTerminalCommandItem('jobs', '查看后台任务', '列出当前 shell 的后台任务列表。', 'jobs'),
    createTerminalCommandItem('fg', '恢复后台任务到前台', '把选中的后台任务切回前台继续执行。', 'fg'),
    createTerminalCommandItem('bg', '让挂起任务在后台继续', '将暂停状态的任务切换到后台继续运行。', 'bg'),
    createTerminalCommandItem('Tab', '自动补全命令或路径', '补全命令名、目录名和文件名，减少输入错误。', '/etc/ng<Tab>\nsystem<Tab>')
  ]),
  createTerminalCommandCategory('path-directory', 'linux', '目录路径', '围绕目录定位、跳转与目录结构操作。', [
    createTerminalCommandItem('pwd', '查看当前位置', '输出当前所在目录，确认你现在操作的是哪个路径。', 'pwd'),
    createTerminalCommandItem('ls', '列出目录内容', '查看目录中的普通文件和子目录。', 'ls'),
    createTerminalCommandItem('ls -l', '按长格式列目录', '显示权限、所有者、时间和大小等详细信息。', 'ls -l'),
    createTerminalCommandItem('ls -a', '显示隐藏文件', '把以点开头的隐藏文件也一起列出来。', 'ls -a'),
    createTerminalCommandItem('ls -lh', '显示人类可读大小', '把文件大小换成 KB、MB、GB 等更易读单位。', 'ls -lh'),
    createTerminalCommandItem('cd /path/to/dir', '进入指定目录', '切换到目标目录开始后续操作。', 'cd /var/log'),
    createTerminalCommandItem('cd ..', '返回上级目录', '从当前目录回到父级目录。', 'cd ..'),
    createTerminalCommandItem('cd -', '回到上一次目录', '在当前目录和上一次访问目录之间快速切换。', 'cd -'),
    createTerminalCommandItem('cd ~', '回到用户家目录', '跳转到当前用户的 home 目录。', 'cd ~'),
    createTerminalCommandItem('cd /', '回到根目录', '跳转到 Linux 的根目录 `/`。', 'cd /'),
    createTerminalCommandItem('mkdir', '创建单层目录', '在当前位置创建一个新目录。', 'mkdir backup'),
    createTerminalCommandItem('mkdir -p', '递归创建目录', '父目录不存在时一并创建。', 'mkdir -p a/b/c'),
    createTerminalCommandItem('rmdir', '删除空目录', '只删除不包含文件的空目录。', 'rmdir empty-dir')
  ]),
  createTerminalCommandCategory('file-management', 'linux', '文件管理', '围绕文件和目录的增删改移。', [
    createTerminalCommandItem('touch', '创建空文件', '创建新文件，若文件已存在则只刷新修改时间。', 'touch app.log'),
    createTerminalCommandItem('rm', '删除文件', '删除单个文件或多个指定文件。', 'rm app.log'),
    createTerminalCommandItem('rm -rf', '强制递归删除目录', '危险命令，常用于整目录删除，执行前务必确认路径。', 'rm -rf old-release'),
    createTerminalCommandItem('cp', '复制文件', '把文件复制到新位置或作为备份副本。', 'cp nginx.conf nginx.conf.bak'),
    createTerminalCommandItem('cp -r', '复制目录', '递归复制整个目录及其内容。', 'cp -r dist /www/wwwroot/site'),
    createTerminalCommandItem('mv', '移动或重命名文件', '既可改名，也可把文件或目录移动到新路径。', 'mv old.log old.log.bak\nmv app.conf /etc/nginx/conf.d/'),
    createTerminalCommandItem('ln -s', '创建软链接', '建立符号链接，常用于发布目录切换。', 'ln -s /www/wwwroot/site current')
  ]),
  createTerminalCommandCategory('file-viewing', 'linux', '文件查看', '围绕文件读取、分页浏览、编辑与统计。', [
    createTerminalCommandItem('cat', '查看完整文件内容', '适合查看较短文件的全部内容。', 'cat /etc/os-release'),
    createTerminalCommandItem('tac', '倒序查看文件内容', '从文件最后一行开始反向输出。', 'tac access.log'),
    createTerminalCommandItem('more', '分页查看文件', '适合在简单终端里逐页浏览文本。', 'more app.log'),
    createTerminalCommandItem('less', '可滚动分页查看文件', '支持上下翻页和搜索，更适合大文件。', 'less error.log'),
    createTerminalCommandItem('head', '查看文件开头', '默认查看前 10 行内容。', 'head nginx.conf'),
    createTerminalCommandItem('head -n', '查看文件前 N 行', '按指定行数读取文件开头内容。', 'head -n 20 nginx.conf'),
    createTerminalCommandItem('tail', '查看文件结尾', '默认查看最后 10 行内容。', 'tail error.log'),
    createTerminalCommandItem('tail -n', '查看文件最后 N 行', '按指定行数读取文件尾部内容。', 'tail -n 20 error.log'),
    createTerminalCommandItem('tail -f', '实时跟踪日志', '持续输出文件新增内容，常用于排查服务运行日志。', 'tail -f app.log'),
    createTerminalCommandItem('vim', '使用 Vim 编辑文件', '适合服务器端高级文本编辑。', 'vim /etc/nginx/nginx.conf'),
    createTerminalCommandItem('nano', '使用 Nano 编辑文件', '比 Vim 更易上手的终端编辑器。', 'nano .env'),
    createTerminalCommandItem('wc -l', '统计文件行数', '快速查看日志、数据文件的总行数。', 'wc -l access.log'),
    createTerminalCommandItem('wc -w', '统计文件单词数', '统计文本中的单词数量。', 'wc -w article.txt')
  ]),
  createTerminalCommandCategory('permission-user', 'linux', '权限用户', '围绕账户身份、权限与用户组管理。', [
    createTerminalCommandItem('who', '查看当前在线用户', '显示当前登录到系统的用户列表。', 'who'),
    createTerminalCommandItem('whoami', '查看当前用户名', '输出当前 shell 实际使用的用户身份。', 'whoami'),
    createTerminalCommandItem('id', '查看 UID 与用户组', '显示 UID、GID 以及所属组信息。', 'id'),
    createTerminalCommandItem('useradd', '创建系统用户', '添加新的 Linux 用户账户。', 'useradd deploy'),
    createTerminalCommandItem('userdel', '删除系统用户', '删除指定 Linux 用户账户。', 'userdel deploy'),
    createTerminalCommandItem('passwd', '修改用户密码', '为指定用户设置或重置密码。', 'passwd root'),
    createTerminalCommandItem('groupadd', '创建用户组', '新建一个系统用户组。', 'groupadd devops'),
    createTerminalCommandItem('su', '切换到其他用户', '切换成指定普通用户的 shell 环境。', 'su www-data'),
    createTerminalCommandItem('su - root', '切换到 root 环境', '以 root 的完整登录环境执行命令。', 'su - root'),
    createTerminalCommandItem('sudo', '临时使用管理员权限', '对单条命令临时提权执行。', 'sudo systemctl restart nginx'),
    createTerminalCommandItem('chmod', '修改文件权限', '按数字或符号方式修改权限位。', 'chmod 755 deploy.sh'),
    createTerminalCommandItem('chmod +x', '添加执行权限', '让脚本文件可直接执行。', 'chmod +x backup.sh'),
    createTerminalCommandItem('chown', '修改所属用户和组', '调整文件或目录的 owner 与 group。', 'chown www-data:www-data /www/wwwroot/site')
  ]),
  createTerminalCommandCategory('search-locate', 'linux', '搜索查找', '围绕内容检索、文件定位和命令定位。', [
    createTerminalCommandItem('find', '按条件查找文件', '可按名称、时间、类型等条件递归查找文件。', "find /var/log -name '*.log'\nfind /www -type f -mtime -1"),
    createTerminalCommandItem('grep', '搜索单个文件中的文本', '在指定文件里查找关键字或模式。', "grep 'listen' nginx.conf"),
    createTerminalCommandItem('grep -r', '递归搜索目录中的文本', '在目录内逐个文件递归查找关键字。', "grep -r 'server_name' /etc/nginx"),
    createTerminalCommandItem('which', '查找命令执行路径', '返回命令实际使用的可执行文件位置。', 'which nginx'),
    createTerminalCommandItem('whereis', '查找命令相关文件', '返回命令的二进制、源码或帮助路径。', 'whereis php'),
    createTerminalCommandItem('locate', '快速查找文件位置', '基于系统索引快速匹配文件名路径。', 'locate php.ini')
  ]),
  createTerminalCommandCategory('archive-compress', 'linux', '压缩解压', '围绕常见压缩包格式的打包与解包。', [
    createTerminalCommandItem('tar -zcvf', '打包为 tar.gz', '把文件或目录打成 gzip 压缩包。', 'tar -zcvf site.tar.gz /www/wwwroot/site'),
    createTerminalCommandItem('tar -zxvf', '解压 tar.gz', '解开 gzip 格式的 tar 包。', 'tar -zxvf site.tar.gz'),
    createTerminalCommandItem('tar -jcvf', '打包为 tar.bz2', '把文件或目录打成 bzip2 压缩包。', 'tar -jcvf log.tar.bz2 /var/log'),
    createTerminalCommandItem('tar -jxvf', '解压 tar.bz2', '解开 bzip2 格式的 tar 包。', 'tar -jxvf log.tar.bz2'),
    createTerminalCommandItem('zip', '创建 zip 压缩包', '把文件或目录压成 zip。', 'zip backup.zip .env'),
    createTerminalCommandItem('unzip', '解压 zip 文件', '在当前目录解开 zip 压缩包。', 'unzip backup.zip'),
    createTerminalCommandItem('unzip -d', '解压到指定目录', '把 zip 文件解压到目标目录。', 'unzip -d /tmp backup.zip')
  ]),
  createTerminalCommandCategory('system-status', 'linux', '系统状态', '围绕机器版本、容量和资源消耗查看。', [
    createTerminalCommandItem('uname -r', '查看内核版本', '输出系统当前使用的 Linux 内核版本。', 'uname -r'),
    createTerminalCommandItem('uname -a', '查看完整系统信息', '输出内核、架构和主机等完整信息。', 'uname -a'),
    createTerminalCommandItem('hostname', '查看主机名', '输出当前服务器主机名。', 'hostname'),
    createTerminalCommandItem('date', '查看当前时间', '显示当前系统日期和时间。', 'date'),
    createTerminalCommandItem('timedatectl', '查看时区与时间设置', '检查系统时间、NTP 和时区状态。', 'timedatectl'),
    createTerminalCommandItem('df -h', '查看磁盘使用率', '按人类可读格式显示各挂载点容量。', 'df -h'),
    createTerminalCommandItem('du -sh', '查看目录总大小', '统计目录占用空间总量。', 'du -sh /www\ndu -sh /var/log/*'),
    createTerminalCommandItem('free -h', '查看内存使用情况', '查看内存、缓存与 swap 使用状态。', 'free -h'),
    createTerminalCommandItem('top', '动态查看进程资源', '实时查看 CPU、内存和进程占用。', 'top'),
    createTerminalCommandItem('htop', '增强版资源监控', '更友好的交互式系统资源监控工具。', 'htop'),
    createTerminalCommandItem('uptime', '查看系统运行时长', '显示开机时长、在线用户数和负载。', 'uptime'),
    createTerminalCommandItem('vmstat', '查看系统状态统计', '观察进程、内存、交换区和 IO 指标。', 'vmstat'),
    createTerminalCommandItem('iostat', '查看磁盘 IO 统计', '用于分析磁盘设备的吞吐与利用率。', 'iostat')
  ]),
  createTerminalCommandCategory('process-management', 'linux', '进程管理', '围绕进程查看、定位与结束。', [
    createTerminalCommandItem('ps', '查看当前 shell 相关进程', '列出当前终端会话相关的进程。', 'ps'),
    createTerminalCommandItem('ps aux', '查看全部进程', '显示系统中所有用户的全部进程信息。', 'ps aux'),
    createTerminalCommandItem('pstree', '树状查看进程关系', '按父子层级查看进程关系结构。', 'pstree'),
    createTerminalCommandItem('kill', '结束指定 PID 进程', '向进程发送默认终止信号。', 'kill 1234'),
    createTerminalCommandItem('kill -9', '强制结束指定 PID', '向进程发送 SIGKILL 强制终止。', 'kill -9 1234'),
    createTerminalCommandItem('pkill', '按名称结束进程', '按进程名称批量匹配并结束进程。', 'pkill nginx')
  ]),
  createTerminalCommandCategory('service-management', 'linux', '服务管理', '围绕 systemd 服务的启停和状态查看。', [
    createTerminalCommandItem('systemctl start', '启动服务', '立即启动指定 systemd 服务。', 'systemctl start nginx'),
    createTerminalCommandItem('systemctl stop', '停止服务', '立即停止指定 systemd 服务。', 'systemctl stop nginx'),
    createTerminalCommandItem('systemctl restart', '重启服务', '重新加载并重启服务进程。', 'systemctl restart nginx'),
    createTerminalCommandItem('systemctl reload', '平滑重载服务', '不中断主进程，重新加载配置。', 'systemctl reload nginx'),
    createTerminalCommandItem('systemctl status', '查看服务状态', '查看服务是否运行及最近日志摘要。', 'systemctl status nginx'),
    createTerminalCommandItem('systemctl enable', '设置开机自启', '让服务在系统启动时自动启动。', 'systemctl enable docker'),
    createTerminalCommandItem('systemctl disable', '关闭开机自启', '取消服务的开机自动启动。', 'systemctl disable firewalld'),
    createTerminalCommandItem('systemctl list-units --type=service', '查看运行中的服务', '列出当前系统加载的服务单元。', 'systemctl list-units --type=service'),
    createTerminalCommandItem('journalctl -u 服务名 -n 100', '查看服务最近日志', '快速检查指定 systemd 服务最近输出的日志。', 'journalctl -u nginx -n 100'),
    createTerminalCommandItem('journalctl -fu 服务名', '实时跟踪服务日志', '持续观察服务运行时产生的新日志。', 'journalctl -fu nginx')
  ]),
  createTerminalCommandCategory('network-commands', 'linux', '网络命令', '围绕网络地址、连通性、下载和远程连接。', [
    createTerminalCommandItem('ip addr', '查看本机网络地址', '显示网卡、IP 地址和链路状态。', 'ip addr'),
    createTerminalCommandItem('hostname -i', '查看本机 IP', '直接输出本机解析得到的 IP 地址。', 'hostname -i'),
    createTerminalCommandItem('ping', '测试网络连通性', '检查与目标主机是否可达以及延迟情况。', 'ping 8.8.8.8'),
    createTerminalCommandItem('curl', '请求网页或接口', '适合快速测试 HTTP/HTTPS 接口返回。', 'curl https://example.com'),
    createTerminalCommandItem('curl -I', '只查看响应头', '常用于检查状态码、重定向和响应头。', 'curl -I https://example.com'),
    createTerminalCommandItem('wget', '下载远程文件', '从 URL 下载文件到本地服务器。', 'wget https://example.com/file.tar.gz'),
    createTerminalCommandItem('scp', '上传文件到服务器', '把本地文件通过 SSH 安全复制到远程机器。', 'scp local.txt root@1.2.3.4:/tmp/'),
    createTerminalCommandItem('scp', '下载服务器文件', '把远程文件复制回本地机器。', 'scp root@1.2.3.4:/tmp/app.log ./'),
    createTerminalCommandItem('ssh', 'SSH 远程登录', '直接登录到远程 Linux 服务器。', 'ssh root@1.2.3.4'),
    createTerminalCommandItem('netstat -ntlp', '查看监听端口', '查看 TCP 监听端口和对应进程。', 'netstat -ntlp'),
    createTerminalCommandItem('ss -ntlp', '查看监听端口', '更现代的监听端口查看方式。', 'ss -ntlp')
  ]),
  createTerminalCommandCategory('linux-shell-script', 'linux', 'Shell 与脚本处理', '围绕环境变量、后台运行、重定向和批量执行。', [
    createTerminalCommandItem('env', '查看当前环境变量', '快速查看当前 shell 注入了哪些环境变量。', 'env'),
    createTerminalCommandItem('export 变量=值', '设置环境变量', '为当前 shell 或子进程注入新的环境变量。', 'export NODE_ENV=production'),
    createTerminalCommandItem('source 文件名', '重新加载配置文件', '让当前 shell 立即应用修改后的配置。', 'source ~/.bashrc'),
    createTerminalCommandItem('alias 别名="命令"', '创建命令别名', '给常用长命令设置短别名。', 'alias ll="ls -lah"'),
    createTerminalCommandItem('nohup 命令 > app.log 2>&1 &', '后台常驻运行命令', '断开 SSH 后仍然让进程继续运行。', 'nohup python3 app.py > app.log 2>&1 &'),
    createTerminalCommandItem('tee 文件名', '边输出边写入文件', '把命令输出同时显示在屏幕并保存到文件。', 'ls -lah | tee list.txt'),
    createTerminalCommandItem('xargs', '把标准输入转成参数', '常用于批量文件处理或配合 find 执行。', 'find . -name "*.log" | xargs rm -f'),
    createTerminalCommandItem('rsync -avz 源 目标', '增量同步目录', '同步大量文件时比 scp 更适合重复执行。', 'rsync -avz ./dist/ root@1.2.3.4:/www/site/')
  ]),
  createTerminalCommandCategory('linux-log-debug', 'linux', '日志诊断', '围绕系统日志、内核日志和打开文件排查。', [
    createTerminalCommandItem('journalctl -xe', '查看最近系统错误', '排查服务启动失败或系统异常时很常用。', 'journalctl -xe'),
    createTerminalCommandItem('journalctl --since "1 hour ago"', '查看最近一小时日志', '按时间窗口筛选 systemd 日志。', 'journalctl --since "1 hour ago"'),
    createTerminalCommandItem('dmesg -T', '查看内核日志', '排查磁盘、驱动、OOM 等底层异常。', 'dmesg -T'),
    createTerminalCommandItem('last', '查看最近登录记录', '检查最近哪些用户登录过这台机器。', 'last'),
    createTerminalCommandItem('lastlog', '查看用户最后登录时间', '核对系统用户是否长期未登录。', 'lastlog'),
    createTerminalCommandItem('lsof -i :端口', '查看端口被谁占用', '排查端口冲突和服务监听进程。', 'lsof -i :8080'),
    createTerminalCommandItem('lsof 文件路径', '查看文件被哪个进程占用', '删除日志或热更新文件前常用。', 'lsof /var/log/nginx/access.log'),
    createTerminalCommandItem('strace -p PID', '跟踪进程系统调用', '定位卡住、阻塞或权限报错时很有帮助。', 'strace -p 1234')
  ]),
  createTerminalCommandCategory('linux-disk-advanced', 'linux', '磁盘与文件系统进阶', '围绕挂载点、inode、分区和容量清理。', [
    createTerminalCommandItem('lsblk', '查看块设备树', '按树状结构查看磁盘、分区和挂载关系。', 'lsblk'),
    createTerminalCommandItem('df -ih', '查看 inode 使用率', '排查磁盘空间够但 inode 耗尽的问题。', 'df -ih'),
    createTerminalCommandItem('du -ah --max-depth=1', '查看目录明细占用', '快速找出当前目录下最占空间的内容。', 'du -ah --max-depth=1 /var | sort -hr | head'),
    createTerminalCommandItem('mount | grep 路径', '查看挂载信息', '确认某个目录来自哪个挂载点。', 'mount | grep /data'),
    createTerminalCommandItem('parted -l', '查看磁盘分区表', '比 fdisk 更方便查看 GPT 分区结构。', 'parted -l'),
    createTerminalCommandItem('fsck /dev/sdXN', '检查文件系统', '磁盘异常或重启后修复文件系统时使用。', 'fsck /dev/sdb1')
  ]),
  createTerminalCommandCategory('linux-text-processing', 'linux', '文本处理与筛选', '围绕 sed、awk、sort、cut、tr 等日常高频文本操作。', [
    createTerminalCommandItem('sed -n "1,20p" 文件', '按行号打印指定范围', '读取配置文件或日志片段时非常常用。', 'sed -n "1,20p" /etc/nginx/nginx.conf'),
    createTerminalCommandItem('sed -i "s/旧/新/g" 文件', '就地替换文本', '批量修改配置值或路径时使用。', 'sed -i "s/127.0.0.1/0.0.0.0/g" .env'),
    createTerminalCommandItem('awk "{print $1}" 文件', '按列提取字段', '从日志或表格文本中抽取指定列。', 'awk "{print $1}" access.log'),
    createTerminalCommandItem('awk -F":" "{print $1}" 文件', '按自定义分隔符取字段', '处理 passwd、env 等按特定分隔符组织的文本。', 'awk -F":" "{print $1}" /etc/passwd'),
    createTerminalCommandItem('sort 文件', '按行排序', '对文件内容按字典序排序输出。', 'sort users.txt'),
    createTerminalCommandItem('sort -nr 文件', '按数字倒序排序', '统计值排序或查看 TOP 列表时很方便。', 'sort -nr ports.txt'),
    createTerminalCommandItem('uniq -c', '统计重复行次数', '通常配合 sort 后查看重复值分布。', 'sort ips.txt | uniq -c | sort -nr'),
    createTerminalCommandItem('cut -d":" -f1 文件', '按分隔符截取字段', '从结构化文本中取出某几个字段。', 'cut -d":" -f1 /etc/passwd'),
    createTerminalCommandItem('tr -d "\r" < 文件', '删除指定字符', '处理 Windows 换行或批量清洗字符。', 'tr -d "\r" < script.sh > script-fixed.sh'),
    createTerminalCommandItem('paste 文件1 文件2', '并排合并文本列', '对比两份列表或做列拼接时使用。', 'paste names.txt ids.txt')
  ]),
  createTerminalCommandCategory('linux-systemd-unit', 'linux', 'systemd Unit 与开机自启', '围绕 unit 文件、daemon reload、覆盖配置和启动链排查。', [
    createTerminalCommandItem('systemctl cat 服务名', '查看服务最终 unit 配置', '包括原始配置和 drop-in 覆盖内容。', 'systemctl cat nginx'),
    createTerminalCommandItem('systemctl edit 服务名', '为服务创建覆盖配置', '不改原 unit 文件，使用 override 方式定制参数。', 'systemctl edit nginx'),
    createTerminalCommandItem('systemctl daemon-reload', '重新加载 unit 文件', '修改 unit 文件后让 systemd 重新读取配置。', 'systemctl daemon-reload'),
    createTerminalCommandItem('systemctl is-enabled 服务名', '检查是否开机自启', '快速确认服务是否已加入开机启动。', 'systemctl is-enabled nginx'),
    createTerminalCommandItem('systemctl list-dependencies 服务名', '查看服务依赖链', '排查某个服务为什么会随系统启动或失败。', 'systemctl list-dependencies nginx'),
    createTerminalCommandItem('journalctl -u 服务名 --since today', '查看服务当天日志', '聚焦某个服务今天的启动和异常记录。', 'journalctl -u nginx --since today'),
    createTerminalCommandItem('systemd-analyze blame', '查看开机耗时最多的服务', '定位系统启动慢时哪几个 unit 最耗时。', 'systemd-analyze blame'),
    createTerminalCommandItem('systemd-analyze critical-chain', '查看关键启动链', '分析阻塞开机流程的关键服务依赖。', 'systemd-analyze critical-chain')
  ]),
  createTerminalCommandCategory('linux-network-debug', 'linux', '网络链路与端口排障', '围绕路由、DNS、连通性、监听和连接追踪。', [
    createTerminalCommandItem('ip route', '查看路由表', '确认默认网关和目标网段走向。', 'ip route'),
    createTerminalCommandItem('ip neigh', '查看 ARP / 邻居表', '排查同网段通信、ARP 缓存和邻居状态。', 'ip neigh'),
    createTerminalCommandItem('ss -tunlp', '查看全部 TCP/UDP 监听', '比 netstat 更现代，适合排查端口占用和监听状态。', 'ss -tunlp'),
    createTerminalCommandItem('ss -antp | grep :端口', '查看指定端口连接状态', '确认谁在连、连接数多少、是否有 TIME_WAIT 堆积。', 'ss -antp | grep :3306'),
    createTerminalCommandItem('dig 域名', '查询 DNS 解析结果', '排查域名解析是否正确、生效是否及时。', 'dig example.com'),
    createTerminalCommandItem('nslookup 域名', '用系统工具查询域名', '快速确认基础 DNS 解析结果。', 'nslookup example.com'),
    createTerminalCommandItem('traceroute 目标地址', '追踪网络路径', '定位到目标主机途中在哪一跳开始异常。', 'traceroute 8.8.8.8'),
    createTerminalCommandItem('mtr 目标地址', '持续追踪链路质量', '同时观察丢包和延迟抖动，排查网络不稳定。', 'mtr 8.8.8.8'),
    createTerminalCommandItem('curl -v URL', '详细查看 HTTP 握手过程', '排查 TLS、重定向、代理和响应头问题。', 'curl -v https://example.com')
  ]),
  createTerminalCommandCategory('linux-tcpdump-capture', 'linux', '抓包与流量观察', '围绕 tcpdump 抓包、端口过滤和保存 pcap 文件。', [
    createTerminalCommandItem('tcpdump -i any', '监听所有网卡流量', '快速观察主机当前经过的网络报文。', 'tcpdump -i any'),
    createTerminalCommandItem('tcpdump -i any port 80', '抓指定端口流量', '聚焦某个 HTTP/HTTPS/数据库端口的通信。', 'tcpdump -i any port 80'),
    createTerminalCommandItem('tcpdump -i any host IP', '抓指定主机往来流量', '排查与某个后端或客户端之间的通信情况。', 'tcpdump -i any host 10.0.0.8'),
    createTerminalCommandItem('tcpdump -i any -nn', '关闭域名和端口反查', '减少解析开销，更适合线上排障。', 'tcpdump -i any -nn port 443'),
    createTerminalCommandItem('tcpdump -i any -A port 80', '按 ASCII 查看 HTTP 内容', '临时观察明文 HTTP 请求头和响应内容。', 'tcpdump -i any -A port 80'),
    createTerminalCommandItem('tcpdump -i any -w 文件.pcap', '保存抓包到文件', '把抓到的流量交给 Wireshark 二次分析。', 'tcpdump -i any -w /tmp/debug.pcap port 443'),
    createTerminalCommandItem('tcpdump -r 文件.pcap', '回放读取 pcap 文件', '在服务器上直接查看之前保存的抓包内容。', 'tcpdump -r /tmp/debug.pcap')
  ]),
  createTerminalCommandCategory('nginx-commands', 'nginx', 'Nginx', '围绕 Nginx 配置检查、重载和状态查看。', [
    createTerminalCommandItem('nginx -t', '检查配置是否正确', '在重载前先校验 Nginx 配置语法。', 'nginx -t'),
    createTerminalCommandItem('nginx -T', '输出完整配置', '包含 include 进来的站点配置，适合排查最终生效配置。', 'nginx -T'),
    createTerminalCommandItem('nginx -V', '查看编译参数与模块', '输出 Nginx 版本和编译时启用的模块参数。', 'nginx -V'),
    createTerminalCommandItem('nginx -s reload', '平滑重载配置', '不停止服务进程，重新加载最新配置。', 'nginx -s reload'),
    createTerminalCommandItem('systemctl status nginx', '查看 Nginx 服务状态', '查看 Nginx 是否运行以及最近状态信息。', 'systemctl status nginx'),
    createTerminalCommandItem('systemctl restart nginx', '重启 Nginx 服务', '在配置变化或异常后重启 Nginx。', 'systemctl restart nginx'),
    createTerminalCommandItem('tail -f /var/log/nginx/error.log', '实时查看错误日志', '持续跟踪 Nginx 错误日志，便于排查配置或请求问题。', 'tail -f /var/log/nginx/error.log'),
    createTerminalCommandItem('tail -f /var/log/nginx/access.log', '实时查看访问日志', '持续观察请求访问情况和响应状态码。', 'tail -f /var/log/nginx/access.log')
  ]),
  createTerminalCommandCategory('nginx-site-config', 'nginx', 'Nginx 站点与配置文件', '围绕站点目录、软链接和 server_name 检查。', [
    createTerminalCommandItem('ls -lah /etc/nginx', '查看 Nginx 配置目录', '快速确认主配置、站点目录和模块目录。', 'ls -lah /etc/nginx'),
    createTerminalCommandItem('ls -lah /etc/nginx/conf.d', '查看 conf.d 站点文件', '检查当前启用的站点配置文件列表。', 'ls -lah /etc/nginx/conf.d'),
    createTerminalCommandItem('grep -R "server_name" /etc/nginx', '搜索域名配置', '快速确认某个域名写在哪个站点配置里。', 'grep -R "server_name example.com" /etc/nginx'),
    createTerminalCommandItem('grep -R "listen" /etc/nginx', '搜索监听端口', '检查站点在监听哪些端口。', 'grep -R "listen" /etc/nginx'),
    createTerminalCommandItem('ln -s 可用配置 已启用配置', '启用站点软链接', '适用于 sites-available / sites-enabled 结构的发行版。', 'ln -s /etc/nginx/sites-available/app.conf /etc/nginx/sites-enabled/app.conf'),
    createTerminalCommandItem('unlink 已启用配置', '移除启用软链接', '临时下线某个站点时很常用。', 'unlink /etc/nginx/sites-enabled/app.conf')
  ]),
  createTerminalCommandCategory('nginx-ssl-proxy', 'nginx', 'Nginx SSL 与反向代理', '围绕证书申请、证书查看和 upstream 代理检查。', [
    createTerminalCommandItem('certbot --nginx -d 域名', '通过 Nginx 申请 SSL', '自动申请证书并修改 Nginx HTTPS 配置。', 'certbot --nginx -d example.com -d www.example.com'),
    createTerminalCommandItem('certbot renew --dry-run', '模拟续签证书', '提前验证自动续签流程是否可用。', 'certbot renew --dry-run'),
    createTerminalCommandItem('openssl x509 -in 证书.pem -noout -dates', '查看证书有效期', '确认 SSL 证书开始和结束时间。', 'openssl x509 -in /etc/letsencrypt/live/example.com/fullchain.pem -noout -dates'),
    createTerminalCommandItem('grep -R "proxy_pass" /etc/nginx', '搜索反向代理目标', '排查 upstream 或后端地址配错的问题。', 'grep -R "proxy_pass" /etc/nginx'),
    createTerminalCommandItem('grep -R "upstream" /etc/nginx', '搜索 upstream 配置', '查看负载均衡组的定义和引用关系。', 'grep -R "upstream" /etc/nginx'),
    createTerminalCommandItem('curl -I https://域名', '检查 HTTPS 响应头', '验证站点证书、跳转和状态码是否正常。', 'curl -I https://example.com')
  ]),
  createTerminalCommandCategory('nginx-runtime', 'nginx', 'Nginx 运行时排障', '围绕请求测试、连接状态和日志过滤。', [
    createTerminalCommandItem('curl -H "Host: 域名" http://127.0.0.1', '本机模拟域名请求', '在服务器内验证 Nginx 本机转发是否正常。', 'curl -H "Host: example.com" http://127.0.0.1'),
    createTerminalCommandItem('ss -ntlp | grep nginx', '查看 Nginx 监听状态', '确认 Nginx 进程是否绑定了正确端口。', 'ss -ntlp | grep nginx'),
    createTerminalCommandItem('ps aux | grep nginx', '查看 Nginx 进程树', '观察 master / worker 是否都已正常启动。', 'ps aux | grep nginx'),
    createTerminalCommandItem('grep "500" /var/log/nginx/access.log', '筛选 500 错误请求', '快速找出最近返回 500 的访问记录。', 'grep " 500 " /var/log/nginx/access.log | tail -n 50'),
    createTerminalCommandItem('grep -i "error" /var/log/nginx/error.log', '筛选错误日志关键字', '按关键字快速聚焦异常。', 'grep -i "error" /var/log/nginx/error.log | tail -n 50')
  ]),
  createTerminalCommandCategory('firewall-control', 'linux', '防火墙', '围绕 firewalld 的启停、端口规则与来源控制。', [
    createTerminalCommandItem('systemctl start firewalld', '启动防火墙服务', '启动 firewalld 进程并使规则管理可用。', 'systemctl start firewalld'),
    createTerminalCommandItem('systemctl stop firewalld', '停止防火墙服务', '关闭 firewalld 服务。', 'systemctl stop firewalld'),
    createTerminalCommandItem('firewall-cmd --list-ports', '查看已放行端口', '读取当前 firewalld 已开放的端口列表。', 'firewall-cmd --list-ports'),
    createTerminalCommandItem('firewall-cmd --add-port', '放行端口', '永久添加指定端口和协议到防火墙规则。', 'firewall-cmd --add-port=80/tcp --permanent'),
    createTerminalCommandItem('firewall-cmd --remove-port', '关闭端口', '永久移除指定端口规则。', 'firewall-cmd --remove-port=80/tcp --permanent'),
    createTerminalCommandItem('firewall-cmd --reload', '重载防火墙规则', '让永久规则重新加载并生效。', 'firewall-cmd --reload'),
    createTerminalCommandItem('firewall-cmd --zone=public --add-source=IP --permanent', '放行指定来源 IP', '为某个来源 IP 或网段加入允许访问规则。', 'firewall-cmd --zone=public --add-source=1.2.3.4 --permanent')
  ]),
  createTerminalCommandCategory('package-install', 'linux', '软件安装', '按主流发行版区分包管理命令。', [
    createTerminalCommandItem('yum install', '安装软件包', '在 CentOS / RHEL 系列系统安装指定软件。', 'yum install nginx -y'),
    createTerminalCommandItem('yum remove', '卸载软件包', '在 CentOS / RHEL 系列系统卸载指定软件。', 'yum remove nginx -y'),
    createTerminalCommandItem('yum update', '更新系统软件', '更新已安装的软件包到最新版本。', 'yum update'),
    createTerminalCommandItem('yum search', '搜索软件包', '搜索仓库中可安装的软件。', 'yum search docker'),
    createTerminalCommandItem('apt update', '更新软件索引', '刷新 Ubuntu / Debian 的包索引缓存。', 'apt update'),
    createTerminalCommandItem('apt install', '安装软件包', '在 Ubuntu / Debian 安装指定软件。', 'apt install nginx -y'),
    createTerminalCommandItem('apt remove', '卸载软件包', '在 Ubuntu / Debian 卸载指定软件。', 'apt remove nginx'),
    createTerminalCommandItem('apt upgrade', '升级已安装软件', '把已安装软件升级到新版本。', 'apt upgrade')
  ]),
  createTerminalCommandCategory('disk-mount', 'linux', '磁盘挂载', '围绕磁盘分区信息和挂载操作。', [
    createTerminalCommandItem('fdisk -l', '查看磁盘与分区', '列出服务器上的磁盘和分区信息。', 'fdisk -l'),
    createTerminalCommandItem('mount', '挂载磁盘', '把指定设备挂载到目录上使用。', 'mount /dev/sdb1 /data'),
    createTerminalCommandItem('umount', '卸载磁盘', '卸载已挂载的目录或设备。', 'umount /data'),
    createTerminalCommandItem('blkid', '查看磁盘 UUID', '读取磁盘设备的 UUID 和文件系统类型。', 'blkid')
  ]),
  createTerminalCommandCategory('cron-jobs', 'linux', '定时任务', '围绕 crontab 的编辑、查看与删除。', [
    createTerminalCommandItem('crontab -e', '编辑定时任务', '打开当前用户的 crontab 配置进行编辑。', 'crontab -e'),
    createTerminalCommandItem('crontab -l', '查看定时任务', '列出当前用户所有定时任务。', 'crontab -l'),
    createTerminalCommandItem('crontab -r', '删除定时任务', '删除当前用户的全部 crontab 任务。', 'crontab -r')
  ]),
  createTerminalCommandCategory('docker-commands', 'docker', 'Docker', '围绕 Docker 版本、镜像、容器与日志操作。', [
    createTerminalCommandItem('docker -v', '查看 Docker 版本', '确认 Docker 客户端版本。', 'docker -v'),
    createTerminalCommandItem('docker images', '查看本地镜像', '列出当前机器上的全部本地镜像。', 'docker images'),
    createTerminalCommandItem('docker ps', '查看运行中的容器', '只显示当前运行状态的容器。', 'docker ps'),
    createTerminalCommandItem('docker ps -a', '查看全部容器', '包含已停止容器在内的完整列表。', 'docker ps -a'),
    createTerminalCommandItem('docker pull', '拉取镜像', '从仓库下载指定镜像到本地。', 'docker pull nginx'),
    createTerminalCommandItem('docker run', '创建并运行容器', '基于镜像启动一个新容器。', 'docker run -d --name web nginx'),
    createTerminalCommandItem('docker start', '启动已存在容器', '启动已经创建但当前停止的容器。', 'docker start web'),
    createTerminalCommandItem('docker stop', '停止运行中的容器', '优雅停止指定容器。', 'docker stop web'),
    createTerminalCommandItem('docker restart', '重启容器', '停止后立即重新启动容器。', 'docker restart web'),
    createTerminalCommandItem('docker rm', '删除容器', '删除已停止的容器实例。', 'docker rm web'),
    createTerminalCommandItem('docker rmi', '删除镜像', '从本地移除不再使用的镜像。', 'docker rmi nginx'),
    createTerminalCommandItem('docker exec -it', '进入容器执行命令', '进入运行中的容器内部调试或运维。', 'docker exec -it web bash'),
    createTerminalCommandItem('docker logs', '查看容器日志', '输出容器标准输出和标准错误日志。', 'docker logs web'),
    createTerminalCommandItem('docker logs -f', '实时跟踪容器日志', '持续查看容器新产生的日志。', 'docker logs -f web'),
    createTerminalCommandItem('docker cp', '复制文件到容器', '把宿主机文件复制进容器。', 'docker cp ./app.conf web:/etc/nginx/conf.d/app.conf'),
    createTerminalCommandItem('docker cp', '从容器复制文件', '把容器里的文件复制到宿主机。', 'docker cp web:/var/log/nginx/access.log ./access.log')
  ]),
  createTerminalCommandCategory('docker-build-image', 'docker', 'Docker 构建与镜像管理', '围绕镜像构建、打标签、推送和历史层查看。', [
    createTerminalCommandItem('docker build -t 镜像名:标签 .', '构建镜像', '使用当前目录 Dockerfile 生成镜像。', 'docker build -t my-app:latest .'),
    createTerminalCommandItem('docker tag 源镜像 目标镜像', '重打镜像标签', '为同一个镜像增加新的仓库或版本标签。', 'docker tag my-app:latest registry.example.com/my-app:v1'),
    createTerminalCommandItem('docker push 仓库镜像:标签', '推送镜像到仓库', '把本地镜像上传到私有或公有镜像仓库。', 'docker push registry.example.com/my-app:v1'),
    createTerminalCommandItem('docker image inspect 镜像名', '查看镜像详情', '检查镜像元数据、入口命令和环境变量。', 'docker image inspect nginx:latest'),
    createTerminalCommandItem('docker history 镜像名', '查看镜像分层历史', '了解镜像每一层是如何生成的。', 'docker history nginx:latest'),
    createTerminalCommandItem('docker save -o 文件.tar 镜像名', '导出镜像为 tar 包', '离线迁移镜像时很常用。', 'docker save -o my-app.tar my-app:latest'),
    createTerminalCommandItem('docker load -i 文件.tar', '从 tar 包导入镜像', '把离线镜像包重新导入当前主机。', 'docker load -i my-app.tar')
  ]),
  createTerminalCommandCategory('docker-inspect-runtime', 'docker', 'Docker 运行态排查', '围绕 inspect、资源占用、进入容器和环境变量检查。', [
    createTerminalCommandItem('docker inspect 容器名', '查看容器完整详情', '检查挂载、网络、环境变量和启动参数。', 'docker inspect web'),
    createTerminalCommandItem('docker exec -it 容器名 sh', '进入轻量容器 shell', '适合 Alpine 等不带 bash 的容器。', 'docker exec -it redis sh'),
    createTerminalCommandItem('docker top 容器名', '查看容器内部进程', '快速了解容器当前运行了哪些进程。', 'docker top web'),
    createTerminalCommandItem('docker stats', '查看容器资源占用', '实时观察 CPU、内存、网络和磁盘 IO。', 'docker stats'),
    createTerminalCommandItem('docker port 容器名', '查看容器端口映射', '确认容器对外暴露了哪些端口。', 'docker port web'),
    createTerminalCommandItem('docker diff 容器名', '查看容器文件变更', '知道运行后哪些文件被新增、修改或删除。', 'docker diff web')
  ]),
  createTerminalCommandCategory('docker-network-volume', 'docker', 'Docker 网络与卷', '围绕 network、volume 和数据持久化排查。', [
    createTerminalCommandItem('docker network ls', '查看 Docker 网络', '列出当前主机上所有 Docker 网络。', 'docker network ls'),
    createTerminalCommandItem('docker network inspect 网络名', '查看网络详情', '检查网段、网关和已连接容器。', 'docker network inspect bridge'),
    createTerminalCommandItem('docker network connect 网络名 容器名', '把容器接入额外网络', '让容器加入新的互通网络。', 'docker network connect backend-net web'),
    createTerminalCommandItem('docker volume ls', '查看卷列表', '列出当前所有命名卷。', 'docker volume ls'),
    createTerminalCommandItem('docker volume inspect 卷名', '查看卷详情', '检查卷在宿主机上的实际挂载位置。', 'docker volume inspect pgdata'),
    createTerminalCommandItem('docker run -v 卷名:容器路径 镜像', '挂载命名卷启动容器', '让容器数据持久化到命名卷。', 'docker run -d -v pgdata:/var/lib/postgresql/data postgres')
  ]),
  createTerminalCommandCategory('docker-compose', 'docker', 'Docker Compose', '围绕 compose 编排的启动、重建、日志和下线。', [
    createTerminalCommandItem('docker compose up -d', '后台启动编排', '按 compose 文件拉起整组服务。', 'docker compose up -d'),
    createTerminalCommandItem('docker compose down', '停止并移除编排', '关闭当前 compose 管理的所有服务。', 'docker compose down'),
    createTerminalCommandItem('docker compose ps', '查看 compose 服务状态', '快速查看每个服务是否已正常启动。', 'docker compose ps'),
    createTerminalCommandItem('docker compose logs -f', '实时查看编排日志', '同时跟踪多服务的运行输出。', 'docker compose logs -f'),
    createTerminalCommandItem('docker compose up -d --build', '重建后重新启动', '代码或 Dockerfile 变化后重新构建并拉起。', 'docker compose up -d --build'),
    createTerminalCommandItem('docker compose exec 服务名 sh', '进入 compose 服务容器', '在编排环境下进入某个服务容器调试。', 'docker compose exec web sh')
  ]),
  createTerminalCommandCategory('docker-cleanup', 'docker', 'Docker 清理与回收', '围绕无用资源清理和磁盘空间回收。', [
    createTerminalCommandItem('docker system df', '查看 Docker 占用空间', '统计镜像、容器、卷和缓存占用。', 'docker system df'),
    createTerminalCommandItem('docker container prune', '清理已停止容器', '删除所有退出状态的容器。', 'docker container prune'),
    createTerminalCommandItem('docker image prune -a', '清理无用镜像', '删除没有被容器使用的镜像。', 'docker image prune -a'),
    createTerminalCommandItem('docker volume prune', '清理未使用卷', '删除当前没有挂载到任何容器的卷。', 'docker volume prune'),
    createTerminalCommandItem('docker system prune -a', '一键清理无用资源', '批量删除无用容器、镜像、网络和构建缓存。', 'docker system prune -a')
  ]),
  createTerminalCommandCategory('nodejs-runtime', 'nodejs', 'Node.js 运行时与版本', '围绕 Node.js 版本、npx 和常见运行方式。', [
    createTerminalCommandItem('node --version', '查看 Node.js 版本', '确认服务器当前安装的 Node.js 版本。', 'node --version'),
    createTerminalCommandItem('npm --version', '查看 npm 版本', '确认当前 npm 版本，便于排查依赖安装问题。', 'npm --version'),
    createTerminalCommandItem('npx --version', '查看 npx 版本', '确认临时命令执行器是否可用。', 'npx --version'),
    createTerminalCommandItem('node app.js', '直接运行 Node.js 脚本', '最直接地启动一个 Node 应用入口文件。', 'node app.js'),
    createTerminalCommandItem('node --inspect app.js', '以调试模式启动', '开放 Node Inspector 端口，便于远程调试。', 'node --inspect app.js'),
    createTerminalCommandItem('npx serve -s dist', '快速启动静态构建目录', '临时把前端构建产物跑起来做验证。', 'npx serve -s dist')
  ]),
  createTerminalCommandCategory('nodejs-deps', 'nodejs', 'Node.js 依赖与包管理', '围绕依赖安装、锁文件、全局包和缓存清理。', [
    createTerminalCommandItem('npm install', '安装项目依赖', '根据 package.json 安装当前项目依赖。', 'npm install'),
    createTerminalCommandItem('npm ci', '按锁文件干净安装', '严格按照 lock 文件重新安装依赖，适合 CI 和生产机。', 'npm ci'),
    createTerminalCommandItem('npm install 包名', '安装单个依赖', '为当前项目增加一个新的依赖。', 'npm install axios'),
    createTerminalCommandItem('npm install -D 包名', '安装开发依赖', '把包写入 devDependencies。', 'npm install -D vite'),
    createTerminalCommandItem('npm uninstall 包名', '卸载依赖', '从项目中移除指定依赖。', 'npm uninstall axios'),
    createTerminalCommandItem('npm update', '更新项目依赖', '按 semver 范围把依赖更新到允许的新版本。', 'npm update'),
    createTerminalCommandItem('npm outdated', '查看过期依赖', '快速检查哪些依赖有新版本可升级。', 'npm outdated'),
    createTerminalCommandItem('npm ls --depth=0', '查看顶层依赖', '只列出当前项目直接安装的包。', 'npm ls --depth=0'),
    createTerminalCommandItem('npm cache clean --force', '清理 npm 缓存', '依赖安装异常或缓存损坏时使用。', 'npm cache clean --force'),
    createTerminalCommandItem('npm install -g pm2', '全局安装 PM2', '在服务器上安装 PM2 进程管理器。', 'npm install -g pm2')
  ]),
  createTerminalCommandCategory('nodejs-script-build', 'nodejs', 'Node.js 脚本、构建与发布', '围绕 package.json scripts、构建产物和环境变量启动。', [
    createTerminalCommandItem('npm run dev', '启动开发模式', '运行项目定义的开发脚本。', 'npm run dev'),
    createTerminalCommandItem('npm run build', '构建生产包', '执行项目生产构建命令。', 'npm run build'),
    createTerminalCommandItem('npm run start', '执行启动脚本', '运行 package.json 中定义的 start 脚本。', 'npm run start'),
    createTerminalCommandItem('npm run lint', '执行代码检查', '运行项目中配置的 lint 脚本。', 'npm run lint'),
    createTerminalCommandItem('npm test', '运行测试', '执行项目中定义的测试脚本。', 'npm test'),
    createTerminalCommandItem('NODE_ENV=production node app.js', '以生产环境变量启动', '手动指定运行环境变量再启动服务。', 'NODE_ENV=production node app.js'),
    createTerminalCommandItem('npm pack', '打包当前模块', '生成一个可发布或离线安装的 tgz 包。', 'npm pack')
  ]),
  createTerminalCommandCategory('pm2-lifecycle', 'nodejs', 'PM2 生命周期管理', '围绕应用启动、停止、重启、删除和自启。', [
    createTerminalCommandItem('pm2 start app.js --name my-app', '用 PM2 启动应用', '将 Node.js 应用交给 PM2 守护运行。', 'pm2 start app.js --name my-app'),
    createTerminalCommandItem('pm2 list', '查看 PM2 进程列表', '查看当前由 PM2 托管的全部应用状态。', 'pm2 list'),
    createTerminalCommandItem('pm2 restart my-app', '重启应用', '重启指定 PM2 应用进程。', 'pm2 restart my-app'),
    createTerminalCommandItem('pm2 reload my-app', '平滑重载应用', '尽量不中断服务地重新加载 Node 应用。', 'pm2 reload my-app'),
    createTerminalCommandItem('pm2 stop my-app', '停止应用', '停止指定 PM2 应用进程。', 'pm2 stop my-app'),
    createTerminalCommandItem('pm2 delete my-app', '移除 PM2 应用', '从 PM2 进程列表中删除指定应用。', 'pm2 delete my-app'),
    createTerminalCommandItem('pm2 startup', '生成开机自启配置', '让 PM2 托管应用支持服务器重启后自动恢复。', 'pm2 startup'),
    createTerminalCommandItem('pm2 save', '保存当前 PM2 进程', '把当前 PM2 进程列表保存为重启恢复配置。', 'pm2 save')
  ]),
  createTerminalCommandCategory('pm2-debug', 'nodejs', 'PM2 日志与排障', '围绕日志、监控、详情检查和生态配置。', [
    createTerminalCommandItem('pm2 logs my-app', '查看应用日志', '读取 PM2 管理应用的实时输出日志。', 'pm2 logs my-app'),
    createTerminalCommandItem('pm2 logs my-app --lines 200', '查看最近若干行日志', '排查启动异常时读取更多历史日志。', 'pm2 logs my-app --lines 200'),
    createTerminalCommandItem('pm2 monit', '查看实时监控', '打开 PM2 的终端监控面板查看 CPU、内存和日志。', 'pm2 monit'),
    createTerminalCommandItem('pm2 show my-app', '查看应用详细信息', '检查脚本路径、环境变量、重启次数等。', 'pm2 show my-app'),
    createTerminalCommandItem('pm2 describe my-app', '查看应用描述信息', '和 show 类似，便于快速确认运行参数。', 'pm2 describe my-app'),
    createTerminalCommandItem('pm2 env 0', '查看某个进程的环境变量', '检查 PM2 进程实际注入了哪些环境变量。', 'pm2 env 0'),
    createTerminalCommandItem('pm2 start ecosystem.config.js', '按生态配置启动', '使用 ecosystem 文件统一管理多应用配置。', 'pm2 start ecosystem.config.js'),
    createTerminalCommandItem('pm2 reload ecosystem.config.js --env production', '按环境平滑重载', '用 ecosystem 配置切换到生产环境并重载。', 'pm2 reload ecosystem.config.js --env production')
  ]),
  createTerminalCommandCategory('python-basic', 'python', 'Python 基础', '围绕 Python 解释器、脚本执行与模块运行。', [
    createTerminalCommandItem('python3 --version', '查看 Python 版本', '确认服务器当前安装的 Python 3 版本。', 'python3 --version'),
    createTerminalCommandItem('python3', '进入 Python 交互模式', '直接进入 Python REPL 做临时验证。', 'python3'),
    createTerminalCommandItem('python3 script.py', '执行 Python 脚本', '用 Python 3 运行指定脚本文件。', 'python3 app.py'),
    createTerminalCommandItem('python3 -m 模块名', '按模块方式运行', '以模块方式运行包内入口，适合包化项目。', 'python3 -m http.server 8000'),
    createTerminalCommandItem('python3 -m pdb script.py', '调试 Python 脚本', '直接用标准库 pdb 调试脚本。', 'python3 -m pdb app.py'),
    createTerminalCommandItem('python3 -m compileall .', '预编译当前目录', '提前编译 pyc，排查语法问题时也常用。', 'python3 -m compileall .')
  ]),
  createTerminalCommandCategory('python-env', 'python', 'Python 环境与依赖', '围绕虚拟环境、pip、requirements 与常见依赖操作。', [
    createTerminalCommandItem('python3 -m venv venv', '创建虚拟环境', '为项目创建独立的 Python 虚拟环境。', 'python3 -m venv venv'),
    createTerminalCommandItem('source venv/bin/activate', '激活虚拟环境', '进入虚拟环境后再安装依赖或运行项目。', 'source venv/bin/activate'),
    createTerminalCommandItem('deactivate', '退出虚拟环境', '离开当前激活的 Python 虚拟环境。', 'deactivate'),
    createTerminalCommandItem('pip3 install 包名', '安装单个依赖', '通过 pip 安装指定 Python 包。', 'pip3 install requests'),
    createTerminalCommandItem('pip3 install -r requirements.txt', '按依赖文件安装', '根据 requirements 文件安装项目依赖。', 'pip3 install -r requirements.txt'),
    createTerminalCommandItem('pip3 uninstall 包名', '卸载依赖', '移除指定 Python 包。', 'pip3 uninstall requests'),
    createTerminalCommandItem('pip3 list', '查看已安装依赖', '列出当前环境中已经安装的 Python 包。', 'pip3 list'),
    createTerminalCommandItem('pip3 show 包名', '查看依赖详情', '查看版本、安装位置和依赖关系。', 'pip3 show django'),
    createTerminalCommandItem('pip3 freeze', '导出当前依赖锁定列表', '输出当前环境完整依赖版本。', 'pip3 freeze > requirements.txt'),
    createTerminalCommandItem('pip3 install --upgrade 包名', '升级指定依赖', '把某个 Python 包升级到较新版本。', 'pip3 install --upgrade pip'),
    createTerminalCommandItem('python3 -m pip install --upgrade pip', '升级 pip 本体', '更新 pip 自身，适合首次装环境后执行。', 'python3 -m pip install --upgrade pip')
  ]),
  createTerminalCommandCategory('python-web', 'python', 'Python Web / 框架常用', '围绕 Flask、Django、FastAPI 等项目的常见启动与管理命令。', [
    createTerminalCommandItem('python3 -m http.server 8000', '快速启动静态文件服务', '在当前目录快速开启一个测试用 HTTP 服务。', 'python3 -m http.server 8000'),
    createTerminalCommandItem('flask run --host=0.0.0.0 --port=5000', '启动 Flask 项目', '把 Flask 开发服务暴露给局域网或服务器调试。', 'flask run --host=0.0.0.0 --port=5000'),
    createTerminalCommandItem('django-admin startproject 项目名', '创建 Django 项目', '生成新的 Django 项目骨架。', 'django-admin startproject mysite'),
    createTerminalCommandItem('python3 manage.py runserver 0.0.0.0:8000', '启动 Django 服务', '启动 Django 开发服务器并监听外部地址。', 'python3 manage.py runserver 0.0.0.0:8000'),
    createTerminalCommandItem('python3 manage.py makemigrations', '生成 Django 迁移文件', '根据模型变更生成迁移。', 'python3 manage.py makemigrations'),
    createTerminalCommandItem('python3 manage.py migrate', '执行 Django 数据库迁移', '把迁移应用到数据库。', 'python3 manage.py migrate'),
    createTerminalCommandItem('python3 manage.py createsuperuser', '创建 Django 超级管理员', '为后台管理系统创建管理员账号。', 'python3 manage.py createsuperuser'),
    createTerminalCommandItem('python3 manage.py shell', '进入 Django shell', '在带项目上下文的 shell 里直接操作模型。', 'python3 manage.py shell'),
    createTerminalCommandItem('uvicorn main:app --host 0.0.0.0 --port 8000 --reload', '启动 FastAPI 项目', '使用 uvicorn 启动 FastAPI 开发服务。', 'uvicorn main:app --host 0.0.0.0 --port 8000 --reload'),
    createTerminalCommandItem('gunicorn main:app -w 4 -b 0.0.0.0:8000', '以 Gunicorn 启动生产服务', '常用于 Linux 上部署 Python WSGI/ASGI 项目。', 'gunicorn main:app -w 4 -b 0.0.0.0:8000')
  ]),
  createTerminalCommandCategory('python-test-quality', 'python', 'Python 测试与代码质量', '围绕 pytest、unittest、格式化和静态检查。', [
    createTerminalCommandItem('pytest', '运行全部 pytest 测试', '执行项目里基于 pytest 的所有测试。', 'pytest'),
    createTerminalCommandItem('pytest -k 关键词', '按关键词筛选测试', '只运行和某段名称相关的测试。', 'pytest -k login'),
    createTerminalCommandItem('pytest -q', '静默模式运行测试', '输出更简洁，便于快速观察通过/失败。', 'pytest -q'),
    createTerminalCommandItem('python3 -m unittest', '运行 unittest 测试', '适用于没有引入 pytest 的传统项目。', 'python3 -m unittest'),
    createTerminalCommandItem('coverage run -m pytest', '统计测试覆盖率', '运行测试并收集代码覆盖率数据。', 'coverage run -m pytest'),
    createTerminalCommandItem('coverage html', '生成覆盖率 HTML 报告', '把覆盖率结果输出为可打开的网页报告。', 'coverage html'),
    createTerminalCommandItem('black .', '统一格式化 Python 代码', '按 black 规范格式化整个项目。', 'black .'),
    createTerminalCommandItem('isort .', '统一 import 排序', '整理 Python 文件里的 import 顺序。', 'isort .'),
    createTerminalCommandItem('flake8 .', '执行代码风格检查', '检查潜在语法、风格和未使用变量问题。', 'flake8 .'),
    createTerminalCommandItem('mypy .', '执行类型检查', '对带类型注解的 Python 项目做静态类型校验。', 'mypy .')
  ]),
  createTerminalCommandCategory('python-package-release', 'python', 'Python 打包与发布', '围绕 wheel、sdist、构建产物和上传仓库。', [
    createTerminalCommandItem('python3 -m build', '构建源码包和 wheel', '生成发布到 PyPI 所需的打包产物。', 'python3 -m build'),
    createTerminalCommandItem('python3 setup.py sdist bdist_wheel', '旧式方式构建发布包', '兼容仍使用 setup.py 的项目。', 'python3 setup.py sdist bdist_wheel'),
    createTerminalCommandItem('twine check dist/*', '检查发布包元数据', '发布前校验包的元数据是否合法。', 'twine check dist/*'),
    createTerminalCommandItem('twine upload dist/*', '上传包到仓库', '把本地构建的发行包推送到 PyPI 或私有仓库。', 'twine upload dist/*'),
    createTerminalCommandItem('pip3 wheel -r requirements.txt', '预构建依赖 wheel', '提前下载并构建依赖 wheel 包。', 'pip3 wheel -r requirements.txt')
  ]),
  createTerminalCommandCategory('python-jobs-migrate', 'python', 'Python 任务与迁移', '围绕 Celery、Alembic 和常见后台任务。', [
    createTerminalCommandItem('celery -A app worker -l info', '启动 Celery Worker', '启动处理异步任务的后台进程。', 'celery -A app worker -l info'),
    createTerminalCommandItem('celery -A app beat -l info', '启动 Celery Beat', '运行定时任务调度器。', 'celery -A app beat -l info'),
    createTerminalCommandItem('celery -A app inspect active', '查看正在执行的任务', '排查 Celery 队列堵塞或任务堆积。', 'celery -A app inspect active'),
    createTerminalCommandItem('alembic revision --autogenerate -m "message"', '自动生成 Alembic 迁移', '根据模型变更生成数据库迁移脚本。', 'alembic revision --autogenerate -m "add user table"'),
    createTerminalCommandItem('alembic upgrade head', '执行 Alembic 迁移', '把数据库升级到最新版本。', 'alembic upgrade head'),
    createTerminalCommandItem('alembic downgrade -1', '回退一版 Alembic 迁移', '出现问题时回滚最近一次数据库迁移。', 'alembic downgrade -1')
  ]),
  createTerminalCommandCategory('mysql-access', 'mysql', 'MySQL 连接与状态', '围绕数据库登录、版本、服务状态和基础连接检测。', [
    createTerminalCommandItem('mysql --version', '查看 MySQL 客户端版本', '确认当前安装的 MySQL 命令行客户端版本。', 'mysql --version'),
    createTerminalCommandItem('mariadb --version', '查看 MariaDB 客户端版本', '确认当前安装的 MariaDB 命令行客户端版本。', 'mariadb --version'),
    createTerminalCommandItem('mysql -u root -p', '本机登录 MySQL', '使用用户名和密码登录本机数据库。', 'mysql -u root -p'),
    createTerminalCommandItem('mysql -h 127.0.0.1 -P 3306 -u root -p', '远程参数方式登录', '显式指定主机和端口，便于排查连接参数。', 'mysql -h 127.0.0.1 -P 3306 -u root -p'),
    createTerminalCommandItem('mysqladmin ping', '检查 MySQL 是否存活', '快速检测数据库服务是否可响应。', 'mysqladmin ping'),
    createTerminalCommandItem('mysqladmin version', '查看服务端版本摘要', '返回客户端、服务端和 socket 等基础信息。', 'mysqladmin version'),
    createTerminalCommandItem('SHOW VARIABLES LIKE "version%";', '查看版本相关变量', '在 SQL 层确认服务端版本、编译信息等。', 'SHOW VARIABLES LIKE "version%";'),
    createTerminalCommandItem('status', '查看当前会话状态', '在 mysql 交互界面里查看连接、字符集、当前库等信息。', 'status'),
    createTerminalCommandItem('systemctl status mysqld', '查看 MySQL 服务状态', '查看 MySQL 服务是否正常运行。', 'systemctl status mysqld'),
    createTerminalCommandItem('systemctl status mariadb', '查看 MariaDB 服务状态', '查看 MariaDB 服务是否正常运行。', 'systemctl status mariadb'),
    createTerminalCommandItem('systemctl restart mysqld', '重启 MySQL 服务', '在配置变更或异常后重启 MySQL。', 'systemctl restart mysqld'),
    createTerminalCommandItem('systemctl restart mariadb', '重启 MariaDB 服务', '在配置变更或异常后重启 MariaDB。', 'systemctl restart mariadb')
  ]),
  createTerminalCommandCategory('mysql-security', 'mysql', 'MySQL 用户、密码与授权', '围绕 root 密码重置、用户创建和权限分配。', [
    createTerminalCommandItem('mysql_secure_installation', '执行安全初始化', '快速设置 root 密码并清理匿名用户、测试库等。', 'mysql_secure_installation'),
    createTerminalCommandItem('ALTER USER "root"@"localhost" IDENTIFIED BY "新密码";', '重设 root 密码', 'MySQL 8+ 和多数 MariaDB 版本通用的密码重置写法。', 'ALTER USER "root"@"localhost" IDENTIFIED BY "NewPassword!123";'),
    createTerminalCommandItem('SET PASSWORD FOR "root"@"localhost" = PASSWORD("新密码");', '旧版方式设置密码', '兼容部分老版本 MySQL/MariaDB 的密码设置方式。', 'SET PASSWORD FOR "root"@"localhost" = PASSWORD("NewPassword!123");'),
    createTerminalCommandItem('CREATE USER "app"@"%" IDENTIFIED BY "密码";', '创建数据库用户', '新增一个可以远程登录的数据库账号。', 'CREATE USER "app"@"%" IDENTIFIED BY "StrongPass!123";'),
    createTerminalCommandItem('ALTER USER "app"@"%" IDENTIFIED BY "新密码";', '修改指定用户密码', '重置业务用户密码。', 'ALTER USER "app"@"%" IDENTIFIED BY "NewPass!123";'),
    createTerminalCommandItem('DROP USER "app"@"%";', '删除数据库用户', '移除不再需要的数据库账号。', 'DROP USER "app"@"%";'),
    createTerminalCommandItem('RENAME USER "old"@"%" TO "new"@"%";', '重命名数据库用户', '修改数据库用户名称及登录主体。', 'RENAME USER "old_app"@"%" TO "new_app"@"%";'),
    createTerminalCommandItem('GRANT ALL PRIVILEGES ON 库.* TO "app"@"%";', '授予整库权限', '让指定用户管理某个数据库。', 'GRANT ALL PRIVILEGES ON my_app.* TO "app"@"%";'),
    createTerminalCommandItem('GRANT SELECT,INSERT,UPDATE,DELETE ON 库.* TO "app"@"%";', '授予增删改查权限', '给业务用户分配常见 DML 权限。', 'GRANT SELECT,INSERT,UPDATE,DELETE ON my_app.* TO "app"@"%";'),
    createTerminalCommandItem('REVOKE 权限 ON 库.* FROM "app"@"%";', '回收权限', '移除用户不再需要的数据库权限。', 'REVOKE DELETE ON my_app.* FROM "app"@"%";'),
    createTerminalCommandItem('SHOW GRANTS FOR "app"@"%";', '查看用户权限', '核对某个用户当前拥有的授权。', 'SHOW GRANTS FOR "app"@"%";'),
    createTerminalCommandItem('FLUSH PRIVILEGES;', '刷新权限表', '手工修改权限表后让权限立即生效。', 'FLUSH PRIVILEGES;'),
    createTerminalCommandItem('mysqld_safe --skip-grant-tables --skip-networking &', '以跳过授权方式临时启动', '忘记 root 密码时常用于进入无权限校验模式重置密码。', 'mysqld_safe --skip-grant-tables --skip-networking &', ['重置密码', '忘记密码']),
    createTerminalCommandItem('mysql -u root', '无密码进入跳过授权模式', '配合 skip-grant-tables 模式进入数据库后执行密码修复。', 'mysql -u root', ['重置密码', '忘记密码'])
  ]),
  createTerminalCommandCategory('mysql-database', 'mysql', 'MySQL 数据库级操作', '围绕数据库创建、切换、删除和查看定义。', [
    createTerminalCommandItem('SHOW DATABASES;', '查看所有数据库', '列出当前数据库服务中的所有库。', 'SHOW DATABASES;'),
    createTerminalCommandItem('CREATE DATABASE 数据库名;', '创建数据库', '新建一个数据库实例。', 'CREATE DATABASE my_app CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;'),
    createTerminalCommandItem('ALTER DATABASE 数据库名 CHARACTER SET utf8mb4;', '修改数据库字符集', '统一数据库的默认字符集与排序规则。', 'ALTER DATABASE my_app CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;'),
    createTerminalCommandItem('DROP DATABASE 数据库名;', '删除数据库', '彻底删除某个数据库及其全部表。', 'DROP DATABASE my_app;'),
    createTerminalCommandItem('USE 数据库名;', '切换数据库', '进入指定数据库后再执行表查询或写入。', 'USE my_app;'),
    createTerminalCommandItem('SHOW CREATE DATABASE 数据库名;', '查看数据库创建语句', '查看数据库当前的字符集和排序规则定义。', 'SHOW CREATE DATABASE my_app;')
  ]),
  createTerminalCommandCategory('mysql-table', 'mysql', 'MySQL 表结构操作', '围绕表创建、修改、索引和删除。', [
    createTerminalCommandItem('SHOW TABLES;', '查看当前库里的表', '列出当前数据库中的全部表。', 'SHOW TABLES;'),
    createTerminalCommandItem('DESC 表名;', '查看表字段结构', '查看字段名、类型、是否为空和默认值。', 'DESC users;'),
    createTerminalCommandItem('SHOW CREATE TABLE 表名;', '查看建表 SQL', '完整输出当前表的创建语句。', 'SHOW CREATE TABLE users;'),
    createTerminalCommandItem('CREATE TABLE 表名 (...);', '创建数据表', '创建含主键、字段约束的新表。', 'CREATE TABLE users (id BIGINT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(50) NOT NULL, email VARCHAR(100) UNIQUE, created_at DATETIME NOT NULL);'),
    createTerminalCommandItem('ALTER TABLE 表名 ADD COLUMN 字段 类型;', '新增字段', '为现有表追加一个新字段。', 'ALTER TABLE users ADD COLUMN phone VARCHAR(20) NULL;'),
    createTerminalCommandItem('ALTER TABLE 表名 MODIFY COLUMN 字段 类型;', '修改字段类型', '调整字段长度、类型或空值规则。', 'ALTER TABLE users MODIFY COLUMN name VARCHAR(100) NOT NULL;'),
    createTerminalCommandItem('ALTER TABLE 表名 CHANGE COLUMN 旧字段 新字段 类型;', '重命名字段', '同时修改字段名称和定义。', 'ALTER TABLE users CHANGE COLUMN phone mobile VARCHAR(20) NULL;'),
    createTerminalCommandItem('ALTER TABLE 表名 DROP COLUMN 字段;', '删除字段', '从现有表中移除一个字段。', 'ALTER TABLE users DROP COLUMN mobile;'),
    createTerminalCommandItem('ALTER TABLE 表名 ADD INDEX 索引名(字段);', '新增普通索引', '为常用查询字段创建索引提升读取性能。', 'ALTER TABLE users ADD INDEX idx_email(email);'),
    createTerminalCommandItem('ALTER TABLE 表名 ADD UNIQUE 索引名(字段);', '新增唯一索引', '为字段建立唯一性约束。', 'ALTER TABLE users ADD UNIQUE uk_email(email);'),
    createTerminalCommandItem('RENAME TABLE 旧表 TO 新表;', '重命名表', '快速修改表名。', 'RENAME TABLE users TO app_users;'),
    createTerminalCommandItem('DROP TABLE 表名;', '删除表', '彻底删除指定数据表。', 'DROP TABLE app_users;'),
    createTerminalCommandItem('TRUNCATE TABLE 表名;', '清空表数据', '保留表结构但删除所有数据。', 'TRUNCATE TABLE logs;')
  ]),
  createTerminalCommandCategory('mysql-dml', 'mysql', 'MySQL 增删改', '围绕插入、更新、删除和批量导入。', [
    createTerminalCommandItem('INSERT INTO 表名 (...) VALUES (...);', '插入一条数据', '向指定表写入一条新记录。', "INSERT INTO users (name, email) VALUES ('Alice', 'alice@example.com');"),
    createTerminalCommandItem('INSERT INTO 表名 (...) VALUES (...), (...);', '批量插入多条数据', '一条 SQL 同时写入多条记录。', "INSERT INTO users (name, email) VALUES ('Alice', 'alice@example.com'), ('Bob', 'bob@example.com');"),
    createTerminalCommandItem('UPDATE 表名 SET 字段=值 WHERE 条件;', '更新符合条件的数据', '修改一批记录的字段值。', "UPDATE users SET status='active' WHERE id = 1;"),
    createTerminalCommandItem('DELETE FROM 表名 WHERE 条件;', '删除符合条件的数据', '删除满足条件的记录。', 'DELETE FROM users WHERE id = 1;'),
    createTerminalCommandItem('REPLACE INTO 表名 (...) VALUES (...);', '存在则替换，不存在则插入', '常用于带唯一键的数据覆盖式写入。', "REPLACE INTO settings (`key`, `value`) VALUES ('site_name', 'linux-visual');"),
    createTerminalCommandItem('LOAD DATA INFILE 文件 INTO TABLE 表名 ...;', '批量导入文本数据', '把 CSV 或分隔文本快速导入到表。', "LOAD DATA INFILE '/tmp/users.csv' INTO TABLE users FIELDS TERMINATED BY ',' IGNORE 1 LINES;"),
    createTerminalCommandItem('START TRANSACTION;', '开启事务', '把多条写操作包在一个事务里。', 'START TRANSACTION;'),
    createTerminalCommandItem('COMMIT;', '提交事务', '让当前事务中的写入正式生效。', 'COMMIT;'),
    createTerminalCommandItem('ROLLBACK;', '回滚事务', '撤销当前事务中尚未提交的改动。', 'ROLLBACK;')
  ]),
  createTerminalCommandCategory('mysql-query', 'mysql', 'MySQL 查询与联合查询', '围绕常见查询、统计、排序、分组和 join。', [
    createTerminalCommandItem('SELECT * FROM 表名 LIMIT 10;', '预览表数据', '快速查看表中前几条记录。', 'SELECT * FROM users LIMIT 10;'),
    createTerminalCommandItem('SELECT 字段 FROM 表名 WHERE 条件;', '按条件查询', '只取需要的字段并增加过滤条件。', "SELECT id, name FROM users WHERE status = 'active';"),
    createTerminalCommandItem('SELECT DISTINCT 字段 FROM 表名;', '去重查询', '返回字段去重后的结果。', 'SELECT DISTINCT status FROM users;'),
    createTerminalCommandItem('SELECT * FROM 表名 ORDER BY 字段 DESC;', '排序查询', '按时间、ID 或数值字段排序。', 'SELECT * FROM orders ORDER BY created_at DESC;'),
    createTerminalCommandItem('SELECT * FROM 表名 LIMIT 偏移,数量;', '分页查询', '常用于列表分页读取。', 'SELECT * FROM orders LIMIT 0, 20;'),
    createTerminalCommandItem('SELECT COUNT(*) FROM 表名 WHERE 条件;', '统计记录数', '统计满足条件的数据总数。', "SELECT COUNT(*) FROM users WHERE status = 'active';"),
    createTerminalCommandItem('SELECT SUM(字段) FROM 表名 WHERE 条件;', '求和统计', '统计金额、数量等数值汇总。', 'SELECT SUM(amount) FROM orders WHERE paid = 1;'),
    createTerminalCommandItem('SELECT 字段, COUNT(*) FROM 表名 GROUP BY 字段;', '分组统计', '按某个字段汇总记录数量。', 'SELECT status, COUNT(*) FROM orders GROUP BY status;'),
    createTerminalCommandItem('SELECT 字段, COUNT(*) FROM 表名 GROUP BY 字段 HAVING COUNT(*) > 1;', '分组后筛选', '对分组统计后的结果再做条件过滤。', 'SELECT email, COUNT(*) FROM users GROUP BY email HAVING COUNT(*) > 1;'),
    createTerminalCommandItem('SELECT * FROM 表名 WHERE 字段 LIKE "%关键词%";', '模糊查询', '匹配包含某段文本的数据。', 'SELECT * FROM users WHERE name LIKE "%ali%";'),
    createTerminalCommandItem('SELECT * FROM 表名 WHERE 字段 BETWEEN A AND B;', '范围查询', '查询时间段、金额区间等范围数据。', 'SELECT * FROM orders WHERE amount BETWEEN 100 AND 500;'),
    createTerminalCommandItem('SELECT * FROM 表名 WHERE 字段 IN (...);', '多值匹配查询', '按一组值批量筛选记录。', 'SELECT * FROM users WHERE id IN (1, 2, 3);'),
    createTerminalCommandItem('SELECT ... FROM A INNER JOIN B ON 条件;', '内连接联合查询', '查询两张表都能匹配上的数据。', 'SELECT u.name, o.id FROM users u INNER JOIN orders o ON u.id = o.user_id;'),
    createTerminalCommandItem('SELECT ... FROM A LEFT JOIN B ON 条件;', '左连接联合查询', '保留左表全部记录，右表匹配不到时返回空值。', 'SELECT u.name, o.id FROM users u LEFT JOIN orders o ON u.id = o.user_id;'),
    createTerminalCommandItem('SELECT ... FROM A RIGHT JOIN B ON 条件;', '右连接联合查询', '保留右表全部记录，左表匹配不到时返回空值。', 'SELECT u.name, o.id FROM users u RIGHT JOIN orders o ON u.id = o.user_id;'),
    createTerminalCommandItem('SELECT ... FROM A UNION ALL SELECT ... FROM B;', '结果集合并查询', '把两条查询结果直接拼接在一起。', 'SELECT name FROM admins UNION ALL SELECT name FROM users;')
  ]),
  createTerminalCommandCategory('mysql-backup', 'mysql', 'MySQL 备份、恢复与脚本执行', '围绕导入导出、只导结构和 SQL 脚本执行。', [
    createTerminalCommandItem('mysqldump -u root -p 数据库名 > 备份.sql', '导出整个数据库', '把单个数据库完整导出成 SQL 文件。', 'mysqldump -u root -p my_app > my_app.sql'),
    createTerminalCommandItem('mysqldump -u root -p 数据库名 表名 > 表备份.sql', '导出单张表', '只备份某一个表。', 'mysqldump -u root -p my_app users > users.sql'),
    createTerminalCommandItem('mysqldump -u root -p --no-data 数据库名 > schema.sql', '只导出表结构', '只保留建表语句，不导出数据。', 'mysqldump -u root -p --no-data my_app > schema.sql'),
    createTerminalCommandItem('mysqldump -u root -p --all-databases > all.sql', '导出全部数据库', '对整台数据库实例做全量 SQL 备份。', 'mysqldump -u root -p --all-databases > all.sql'),
    createTerminalCommandItem('mysql -u root -p 数据库名 < 备份.sql', '导入 SQL 备份', '把 SQL 文件重新导入数据库。', 'mysql -u root -p my_app < my_app.sql'),
    createTerminalCommandItem('source /path/to/file.sql', '在 mysql 控制台执行 SQL 文件', '进入 mysql 交互界面后直接执行外部 SQL 文件。', 'source /tmp/fix.sql'),
    createTerminalCommandItem('mysql -u root -p -e "SHOW DATABASES;"', '直接执行一条 SQL', '不进入交互界面，适合脚本化调用。', 'mysql -u root -p -e "SHOW DATABASES;"')
  ]),
  createTerminalCommandCategory('mysql-index-plan', 'mysql', 'MySQL 索引与执行计划', '围绕索引查看、执行计划和慢 SQL 优化分析。', [
    createTerminalCommandItem('SHOW INDEX FROM 表名;', '查看表索引', '检查某张表当前有哪些索引以及区分度。', 'SHOW INDEX FROM users;'),
    createTerminalCommandItem('ALTER TABLE 表名 ADD INDEX 索引名(字段);', '新增普通索引', '为高频过滤或排序字段建立索引。', 'ALTER TABLE orders ADD INDEX idx_created_at(created_at);'),
    createTerminalCommandItem('ALTER TABLE 表名 DROP INDEX 索引名;', '删除索引', '移除无用或错误建立的索引。', 'ALTER TABLE orders DROP INDEX idx_created_at;'),
    createTerminalCommandItem('EXPLAIN SELECT ...;', '查看 SQL 执行计划', '分析查询是否走索引、扫描了多少行。', 'EXPLAIN SELECT * FROM orders WHERE user_id = 1;'),
    createTerminalCommandItem('EXPLAIN ANALYZE SELECT ...;', '查看带实际执行耗时的计划', '在支持的版本里直接看到真实执行代价。', 'EXPLAIN ANALYZE SELECT * FROM orders WHERE user_id = 1;'),
    createTerminalCommandItem('SHOW STATUS LIKE "Handler_read%";', '查看读操作统计', '辅助判断是否存在大量全表扫描。', 'SHOW STATUS LIKE "Handler_read%";'),
    createTerminalCommandItem('ANALYZE TABLE 表名;', '更新表统计信息', '让优化器重新评估索引和数据分布。', 'ANALYZE TABLE orders;'),
    createTerminalCommandItem('OPTIMIZE TABLE 表名;', '优化表并回收空间', '适合大量删除或碎片较多的表。', 'OPTIMIZE TABLE logs;')
  ]),
  createTerminalCommandCategory('mysql-lock-transaction', 'mysql', 'MySQL 锁与事务隔离', '围绕事务隔离级别、行锁、死锁和长事务排查。', [
    createTerminalCommandItem('SELECT @@transaction_isolation;', '查看当前事务隔离级别', '确认当前会话使用的是哪种隔离级别。', 'SELECT @@transaction_isolation;'),
    createTerminalCommandItem('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;', '设置会话隔离级别', '只对当前连接生效，便于测试不同事务策略。', 'SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;'),
    createTerminalCommandItem('START TRANSACTION;', '开启事务', '手工控制一组 SQL 的提交与回滚。', 'START TRANSACTION;'),
    createTerminalCommandItem('SELECT * FROM 表名 WHERE id=1 FOR UPDATE;', '加排他锁读取', '在事务中锁住目标行，防止并发修改。', 'SELECT * FROM orders WHERE id=1 FOR UPDATE;'),
    createTerminalCommandItem('SELECT * FROM 表名 WHERE id=1 LOCK IN SHARE MODE;', '加共享锁读取', '读取并共享锁定目标行，兼容老版本语法。', 'SELECT * FROM orders WHERE id=1 LOCK IN SHARE MODE;'),
    createTerminalCommandItem('SHOW ENGINE INNODB STATUS\G', '查看 InnoDB 状态与死锁信息', '排查死锁、锁等待和事务堆积时最常用。', 'SHOW ENGINE INNODB STATUS\G'),
    createTerminalCommandItem('SELECT * FROM information_schema.innodb_trx\G', '查看当前 InnoDB 事务', '找出长事务、阻塞事务和未提交事务。', 'SELECT * FROM information_schema.innodb_trx\G'),
    createTerminalCommandItem('KILL 连接ID;', '结束阻塞连接', '杀掉长时间锁表或异常卡住的会话。', 'KILL 12345;')
  ]),
  createTerminalCommandCategory('mysql-process-slowlog', 'mysql', 'MySQL 会话与慢查询', '围绕 processlist、慢查询日志和运行中 SQL 观察。', [
    createTerminalCommandItem('SHOW PROCESSLIST;', '查看当前连接列表', '快速观察有哪些会话正在执行 SQL。', 'SHOW PROCESSLIST;'),
    createTerminalCommandItem('SHOW FULL PROCESSLIST;', '查看完整 SQL 文本', '显示更完整的 SQL 内容，便于排查阻塞。', 'SHOW FULL PROCESSLIST;'),
    createTerminalCommandItem('SHOW VARIABLES LIKE "slow_query_log";', '查看是否开启慢查询日志', '确认数据库有没有记录慢 SQL。', 'SHOW VARIABLES LIKE "slow_query_log";'),
    createTerminalCommandItem('SHOW VARIABLES LIKE "long_query_time";', '查看慢查询阈值', '确认超过多少秒的 SQL 会被记为慢查询。', 'SHOW VARIABLES LIKE "long_query_time";'),
    createTerminalCommandItem('SET GLOBAL slow_query_log = ON;', '开启慢查询日志', '临时打开慢查询记录开关。', 'SET GLOBAL slow_query_log = ON;'),
    createTerminalCommandItem('SET GLOBAL long_query_time = 1;', '设置慢查询阈值', '把超过 1 秒的 SQL 记录为慢查询。', 'SET GLOBAL long_query_time = 1;'),
    createTerminalCommandItem('mysqldumpslow 慢日志文件', '汇总慢查询日志', '按模板聚合最慢或最频繁的 SQL。', 'mysqldumpslow /var/log/mysql/slow.log'),
    createTerminalCommandItem('tail -f 慢日志文件', '实时跟踪慢查询日志', '观察新产生的慢 SQL 记录。', 'tail -f /var/log/mysql/slow.log')
  ]),
  createTerminalCommandCategory('mysql-replication', 'mysql', 'MySQL 主从与复制', '围绕主从状态、位点、延迟和复制链路修复。', [
    createTerminalCommandItem('SHOW MASTER STATUS;', '查看主库 binlog 位点', '获取当前主库文件名和位置。', 'SHOW MASTER STATUS;'),
    createTerminalCommandItem('SHOW BINARY LOGS;', '查看 binlog 列表', '确认主库当前有哪些二进制日志文件。', 'SHOW BINARY LOGS;'),
    createTerminalCommandItem('SHOW SLAVE STATUS\G', '查看从库复制状态', '在传统主从里检查 IO/SQL 线程和延迟。', 'SHOW SLAVE STATUS\G'),
    createTerminalCommandItem('SHOW REPLICA STATUS\G', '查看从库复制状态（新语法）', '在新版本 MySQL 里使用 replica 语义查看状态。', 'SHOW REPLICA STATUS\G'),
    createTerminalCommandItem('START REPLICA;', '启动复制', '重新开启从库复制线程。', 'START REPLICA;'),
    createTerminalCommandItem('STOP REPLICA;', '停止复制', '暂停从库复制，便于维护或修复。', 'STOP REPLICA;'),
    createTerminalCommandItem('CHANGE REPLICATION SOURCE TO SOURCE_HOST=..., SOURCE_USER=..., SOURCE_PASSWORD=..., SOURCE_LOG_FILE=..., SOURCE_LOG_POS=...;', '重配复制源', '重新指定主库连接信息和起始位点。', 'CHANGE REPLICATION SOURCE TO SOURCE_HOST="1.2.3.4", SOURCE_USER="repl", SOURCE_PASSWORD="secret", SOURCE_LOG_FILE="mysql-bin.000001", SOURCE_LOG_POS=157;'),
    createTerminalCommandItem('SHOW VARIABLES LIKE "server_id";', '查看当前实例 server_id', '确认主从实例的 server_id 是否唯一。', 'SHOW VARIABLES LIKE "server_id";')
  ]),
  createTerminalCommandCategory('mysql-config-engine', 'mysql', 'MySQL 配置与引擎诊断', '围绕配置文件、字符集、存储引擎和关键变量。', [
    createTerminalCommandItem('SHOW VARIABLES LIKE "character_set_%";', '查看字符集相关变量', '检查客户端、连接和库表默认字符集。', 'SHOW VARIABLES LIKE "character_set_%";'),
    createTerminalCommandItem('SHOW VARIABLES LIKE "collation_%";', '查看排序规则相关变量', '确认连接与服务器默认排序规则。', 'SHOW VARIABLES LIKE "collation_%";'),
    createTerminalCommandItem('SHOW VARIABLES LIKE "innodb_buffer_pool_size";', '查看 InnoDB 缓冲池大小', '检查核心内存参数配置是否合理。', 'SHOW VARIABLES LIKE "innodb_buffer_pool_size";'),
    createTerminalCommandItem('SHOW VARIABLES LIKE "max_connections";', '查看最大连接数', '判断连接池满载是否与参数过小有关。', 'SHOW VARIABLES LIKE "max_connections";'),
    createTerminalCommandItem('SHOW ENGINES;', '查看支持的存储引擎', '确认实例启用了哪些表引擎。', 'SHOW ENGINES;'),
    createTerminalCommandItem('SELECT table_schema, table_name, engine FROM information_schema.tables WHERE table_schema = "数据库名";', '查看库中各表使用的引擎', '检查业务表是否都在用期望的存储引擎。', 'SELECT table_schema, table_name, engine FROM information_schema.tables WHERE table_schema = "my_app";'),
    createTerminalCommandItem('SHOW VARIABLES LIKE "datadir";', '查看数据目录', '确认数据库实际数据文件存放位置。', 'SHOW VARIABLES LIKE "datadir";'),
    createTerminalCommandItem('grep -n "bind-address\|server-id\|log_bin" /etc/my.cnf /etc/mysql/my.cnf /etc/mysql/mysql.conf.d/mysqld.cnf', '搜索关键配置项', '快速定位主从、远程访问和 binlog 配置。', 'grep -n "bind-address\|server-id\|log_bin" /etc/my.cnf /etc/mysql/my.cnf /etc/mysql/mysql.conf.d/mysqld.cnf')
  ]),
  createTerminalCommandCategory('redis-commands', 'redis', 'Redis', '围绕 Redis 连接、键值读写、信息查看和服务管理。', [
    createTerminalCommandItem('redis-cli', '进入 Redis 命令行', '连接本机 Redis 并进入交互模式。', 'redis-cli'),
    createTerminalCommandItem('redis-cli -a 密码', '带密码连接 Redis', '使用认证密码连接受保护的 Redis 实例。', 'redis-cli -a your-password'),
    createTerminalCommandItem('redis-cli ping', '测试 Redis 连通性', '检查 Redis 服务是否正常响应。', 'redis-cli ping'),
    createTerminalCommandItem('redis-cli info', '查看 Redis 运行信息', '读取 Redis 的内存、连接和持久化状态。', 'redis-cli info'),
    createTerminalCommandItem('redis-cli keys *', '查看所有键', '列出当前库中的所有 key，数据量大时谨慎使用。', 'redis-cli keys *'),
    createTerminalCommandItem('redis-cli get', '读取字符串键值', '查看指定 key 当前保存的值。', 'redis-cli get site:name'),
    createTerminalCommandItem('redis-cli set', '写入字符串键值', '给指定 key 设置字符串值。', 'redis-cli set site:name linux-panel'),
    createTerminalCommandItem('redis-cli del', '删除键', '删除一个或多个指定 key。', 'redis-cli del site:name'),
    createTerminalCommandItem('redis-cli flushdb', '清空当前库', '删除当前数据库中的全部 key。', 'redis-cli flushdb'),
    createTerminalCommandItem('redis-cli flushall', '清空所有库', '删除 Redis 所有数据库中的全部 key。', 'redis-cli flushall'),
    createTerminalCommandItem('systemctl status redis', '查看 Redis 服务状态', '查看 Redis 服务是否正常运行。', 'systemctl status redis'),
    createTerminalCommandItem('systemctl restart redis', '重启 Redis 服务', '在配置变更或异常后重启 Redis。', 'systemctl restart redis')
  ]),
  createTerminalCommandCategory('redis-key-space', 'redis', 'Redis 键空间操作', '围绕扫描、过期时间、重命名和批量删除。', [
    createTerminalCommandItem('redis-cli scan 0', '渐进式扫描键', '比 KEYS * 更适合线上大数据量环境。', 'redis-cli scan 0'),
    createTerminalCommandItem('redis-cli ttl 键名', '查看键剩余过期时间', '确认某个 key 还会存活多久。', 'redis-cli ttl session:token:1'),
    createTerminalCommandItem('redis-cli expire 键名 秒数', '给键设置过期时间', '让指定 key 在一定秒数后自动删除。', 'redis-cli expire session:token:1 3600'),
    createTerminalCommandItem('redis-cli persist 键名', '移除键的过期时间', '让原本会过期的 key 变成永久保存。', 'redis-cli persist session:token:1'),
    createTerminalCommandItem('redis-cli rename 旧键 新键', '重命名键', '修改 key 名称而不改内容。', 'redis-cli rename old:key new:key'),
    createTerminalCommandItem('redis-cli exists 键名', '检查键是否存在', '快速判断某个 key 当前是否还在。', 'redis-cli exists user:1'),
    createTerminalCommandItem('redis-cli type 键名', '查看键的数据类型', '确认 key 是 string、hash、list 还是 set。', 'redis-cli type cart:1')
  ]),
  createTerminalCommandCategory('redis-structures', 'redis', 'Redis 常见数据结构', '围绕 string、hash、list、set、zset 的读写。', [
    createTerminalCommandItem('redis-cli hset 键 字段 值', '写入 Hash 字段', '给哈希对象设置一个字段值。', 'redis-cli hset user:1 name Alice'),
    createTerminalCommandItem('redis-cli hgetall 键', '读取整个 Hash', '一次性查看哈希中的全部字段和值。', 'redis-cli hgetall user:1'),
    createTerminalCommandItem('redis-cli lpush 键 值', '向 List 左侧入队', '常用于消息队列或最近记录列表。', 'redis-cli lpush tasks job1'),
    createTerminalCommandItem('redis-cli lrange 键 0 -1', '查看整个 List', '读取列表中的所有元素。', 'redis-cli lrange tasks 0 -1'),
    createTerminalCommandItem('redis-cli sadd 键 成员', '向 Set 添加成员', '利用集合自动去重的特性保存成员。', 'redis-cli sadd roles admin'),
    createTerminalCommandItem('redis-cli smembers 键', '查看 Set 全部成员', '读取集合中当前所有元素。', 'redis-cli smembers roles'),
    createTerminalCommandItem('redis-cli zadd 键 分数 成员', '向有序集合写入成员', '常用于排行榜、权重队列。', 'redis-cli zadd rank 100 alice'),
    createTerminalCommandItem('redis-cli zrange 键 0 -1 WITHSCORES', '查看有序集合及分数', '读取排行榜成员和对应分值。', 'redis-cli zrange rank 0 -1 WITHSCORES')
  ]),
  createTerminalCommandCategory('redis-admin', 'redis', 'Redis 监控、持久化与安全', '围绕慢查询、内存、持久化和认证配置检查。', [
    createTerminalCommandItem('redis-cli info memory', '查看内存使用信息', '重点检查内存占用、碎片率和峰值。', 'redis-cli info memory'),
    createTerminalCommandItem('redis-cli info persistence', '查看持久化状态', '确认 RDB / AOF 是否开启以及最近保存情况。', 'redis-cli info persistence'),
    createTerminalCommandItem('redis-cli config get requirepass', '查看是否设置访问密码', '快速检查 Redis 是否启用了 requirepass。', 'redis-cli config get requirepass'),
    createTerminalCommandItem('redis-cli config get appendonly', '查看 AOF 是否开启', '确认 appendonly 策略是否已启用。', 'redis-cli config get appendonly'),
    createTerminalCommandItem('redis-cli bgsave', '后台执行 RDB 快照', '触发一次后台持久化保存。', 'redis-cli bgsave'),
    createTerminalCommandItem('redis-cli slowlog get 10', '查看最近慢查询', '排查 Redis 执行耗时较高的命令。', 'redis-cli slowlog get 10'),
    createTerminalCommandItem('redis-cli monitor', '实时监控命令流', '观察当前实例实时收到的所有命令。', 'redis-cli monitor')
  ]),
  createTerminalCommandCategory('file-transfer', 'linux', '文件传输', '围绕终端内的本地上传下载辅助命令。', [
    createTerminalCommandItem('rz', '上传本地文件到服务器', '在支持 ZMODEM 的终端工具中选择本地文件上传。', 'rz'),
    createTerminalCommandItem('sz', '从服务器下载文件', '在支持 ZMODEM 的终端工具中把文件下载回本地。', 'sz backup.tar.gz')
  ]),
  createTerminalCommandCategory('advanced-processing', 'linux', '高级命令', '围绕文本处理、截取、比较与统计。', [
    createTerminalCommandItem('sort', '文本排序', '对文件内容按行排序输出。', 'sort users.txt'),
    createTerminalCommandItem('uniq', '去除重复行', '通常搭配排序后的文本做去重统计。', 'uniq users.txt'),
    createTerminalCommandItem('sed -n', '按范围输出文本', '按行号范围读取或筛选文本内容。', 'sed -n "1,20p" nginx.conf'),
    createTerminalCommandItem('awk', '按列处理文本', '适合按字段提取、统计和格式化输出。', 'awk "{print $1}" access.log'),
    createTerminalCommandItem('cut', '按分隔符截取字段', '从文本里截出指定列或字段。', 'cut -d":" -f1 /etc/passwd'),
    createTerminalCommandItem('diff', '比较两个文件差异', '逐行对比两个文件内容的不同。', 'diff a.txt b.txt')
  ]),
  createTerminalCommandCategory('shutdown-restart', 'linux', '关机重启', '围绕服务器重启和关机动作。', [
    createTerminalCommandItem('reboot', '重启服务器', '立即触发系统重启。', 'reboot'),
    createTerminalCommandItem('shutdown -r now', '立即重启服务器', '通过 shutdown 命令立刻重启系统。', 'shutdown -r now'),
    createTerminalCommandItem('shutdown -h now', '立即关机', '通过 shutdown 命令立刻关闭系统。', 'shutdown -h now'),
    createTerminalCommandItem('halt', '停止系统运行', '让系统停止运行，常用于关机流程。', 'halt'),
    createTerminalCommandItem('poweroff', '直接断电关机', '关闭系统并切断电源。', 'poweroff')
  ])
]

export function isTerminalCommandCategory(row) {
  return row?.type === 'category'
}

export function getTerminalCommandParts(command) {
  const tokens = String(command || '').trim().split(/\s+/).filter(Boolean)

  return tokens.map((token, index) => ({
    text: token,
    type: getTerminalCommandPartType(token, index)
  }))
}

export function normalizeTerminalCommandSearch(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '')
}

export function matchTerminalCommandKeyword(keyword, ...fields) {
  return fields.some(field => fuzzyMatchTerminalCommand(field, keyword))
}
