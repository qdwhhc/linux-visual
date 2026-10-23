<template>
  <el-config-provider :locale="elementLocale">
  <main class="app-frame" :class="{ 'transfer-busy': transferState.active }">
    <header class="app-header" @dblclick="toggleWindowMaximize">
      <div class="header-brand">
        <img class="brand-badge brand-badge-image" :src="appBrandIcon" alt="linux-visual 图标" />
        <div class="brand-copy">
          <strong>linux-visual</strong>
          <button class="brand-activation-text-link" type="button" :disabled="!appActivationReady" @click.stop="openAppActivationPage">
            <span>授权状态 · {{ appActivated ? '查看授权信息' : '立即激活' }}</span>
            <el-icon><ArrowRight /></el-icon>
          </button>
        </div>
      </div>
      <div class="overview-strip">
        <article v-for="item in headerOverviewCards" :key="item.key" class="top-overview-card">
          <span class="top-overview-card-label">
            <span class="top-overview-card-label-text">{{ item.label }}</span>
            <em v-if="item.key === 'disk'" class="top-overview-card-desc top-overview-card-desc--ip">
              <span class="masked-inline-value">（内网 IP：{{ formatSensitiveIp(serverInfo.IP, headerIpVisible) }}</span>
              <button
                class="visibility-toggle-btn"
                type="button"
                :title="headerIpVisible ? '隐藏内网 IP' : '显示内网 IP'"
                :aria-label="headerIpVisible ? '隐藏内网 IP' : '显示内网 IP'"
                @click.stop="toggleHeaderIpVisible"
              >
                <el-icon class="visibility-eye-icon">
                  <View v-if="headerIpVisible" />
                  <Hide v-else />
                </el-icon>
              </button>
              <span>）</span>
            </em>
            <em v-else-if="item.desc" class="top-overview-card-desc">（{{ item.desc }}）</em>
          </span>
          <strong>{{ item.value }}</strong>
        </article>
      </div>
        <div class="header-right-zone">
           <div class="window-controls">
            <el-tooltip content="主机详情" placement="bottom">
              <button class="window-control-btn header-host-detail-icon" type="button" :disabled="!connected" title="主机详情" aria-label="主机详情" @click.stop="hostDetailVisible = true">
                <el-icon><Monitor /></el-icon>
              </button>
            </el-tooltip>
            <button class="window-control-btn" title="最小化" aria-label="最小化" @click.stop="minimizeWindow">
              <span class="window-control-icon window-control-icon--min"></span>
            </button>
            <button class="window-control-btn" :title="windowState.maximized ? '向下还原' : '最大化'" :aria-label="windowState.maximized ? '向下还原' : '最大化'" @click.stop="toggleWindowMaximize">
              <span class="window-control-icon" :class="windowState.maximized ? 'window-control-icon--restore' : 'window-control-icon--max'"></span>
            </button>
            <button class="window-control-btn window-control-btn--close" title="关闭" aria-label="关闭" @click.stop="closeWindow">
              <span class="window-control-icon window-control-icon--close"></span>
            </button>
          </div>
        </div>
    </header>

    <div class="main-layout">
      <aside class="sidebar">
        <div class="sidebar-head sidebar-server-card">
          <div class="sidebar-server-state" :class="{ online: connected }">
            <strong>{{ connected ? '服务器已连接' : '服务器未连接' }}</strong>
          </div>
          <div class="sidebar-server-actions">
            <button v-if="connected" class="sidebar-server-action danger" type="button" @click="disconnect">断开连接</button>
            <button v-else class="sidebar-server-action primary" type="button" @click="loginVisible = true">
              <span>登录服务器</span>
              <el-icon><ArrowRight /></el-icon>
            </button>
            <el-tooltip v-if="connected && isSSHSession" content="刷新概览" placement="top">
              <button class="sidebar-server-refresh" type="button" :disabled="overviewRefreshing" @click="loadOverview({ notify: true })">
                <el-icon :class="{ spinning: overviewRefreshing }"><Refresh /></el-icon>
              </button>
            </el-tooltip>
          </div>
        </div>
        <nav class="nav-list">
           <button v-for="item in localizedMenus" :key="item.key"
              :class="['nav-item', { active: activeMenu === item.key, disabled: !isMenuEnabled(item.key) }]"
              :disabled="!isMenuEnabled(item.key)" @click="selectMenu(item.key)">
            <span class="nav-icon">
              <component :is="item.icon" />
            </span>
            <span class="nav-label">{{ item.label }}</span>
          </button>
        </nav>
        <div class="sidebar-contact">
          <span>联系邮箱</span>
          <a href="mailto:qdwhhc@foxmail.com">qdwhhc@foxmail.com</a>
        </div>
      </aside>

      <section class="workspace">
        <div v-if="workspaceLoading" class="workspace-loading-mask" aria-live="polite">
          <div class="workspace-loading-card">
            <span class="workspace-loading-spinner"></span>
            <strong>{{ workspaceLoadingText }}</strong>
          </div>
        </div>
        <el-drawer v-model="loginVisible" title="登录服务器" direction="rtl" size="520px" class="login-drawer server-login-drawer">
          <section class="connect-panel connect-panel-scroller server-login-panel">
            <div class="server-dialog-grid">
              <label class="server-dialog-field">
                <span>登录协议：</span>
                <el-select v-model="form.protocol" @change="handleProtocolChange">
                  <el-option label="SSH" value="ssh" />
                  <el-option label="SFTP" value="sftp" />
                </el-select>
              </label>
              <label class="server-dialog-field">
                <span>连接名称：</span>
                <input v-model.trim="form.name" placeholder="例如 阿里云生产机" />
              </label>
              <label class="server-dialog-field">
                <span>服务器地址：</span>
                <input v-model.trim="form.host" placeholder="例如 121.40.1.1" />
              </label>
              <label class="server-dialog-field">
                <span>连接端口：</span>
                <input v-model.number="form.port" placeholder="22" />
              </label>
              <label class="server-dialog-field">
                <span>用户名：</span>
                <input v-model.trim="form.username" placeholder="例如 root" />
              </label>
              <label class="server-dialog-field">
                <span>认证方式：</span>
                <el-select v-model="form.authType" @change="handleAuthTypeChange">
                  <el-option label="密码登录" value="password" />
                  <el-option label="私钥登录" value="privateKey" />
                </el-select>
              </label>
              <label v-if="form.authType === 'password'" class="server-dialog-field full-span">
                <span>密码：</span>
                <input v-model="form.password" type="password" placeholder="保存时会用系统凭据加密" />
              </label>
              <label v-if="form.authType === 'privateKey'" class="server-dialog-field full-span server-dialog-field--top">
                <span>私钥内容：</span>
                <div class="text-file-field">
                  <div class="text-file-actions">
                    <el-button plain @click="pickKeyFile">选择本地文件</el-button>
                  </div>
                  <textarea v-model="form.privateKey" rows="8" placeholder="粘贴 PEM 私钥内容，例如 -----BEGIN OPENSSH PRIVATE KEY-----"></textarea>
                </div>
              </label>
              <label v-if="form.authType === 'privateKey'" class="server-dialog-field full-span">
                <span>私钥口令：</span>
                <input v-model="form.passphrase" type="password" placeholder="私钥如果有口令，请填写" />
              </label>
            </div>
            <div class="login-options">
              <el-checkbox v-model="rememberConnection">记住账号和密码</el-checkbox>
              <span>下次打开自动带出当前连接信息</span>
            </div>
            <div class="button-line">
              <el-button type="primary" :loading="connecting" @click="connect">
                {{ connecting ? '连接中...' : '连接服务器' }}
              </el-button>
              <el-button plain @click="saveConnection">加密保存连接</el-button>
              <el-button plain type="danger" :disabled="!form.id" @click="deleteSavedConnection">删除当前连接</el-button>
            </div>
            <p class="safe-tip">安全提示：密码、私钥和私钥口令都会通过 加密后再落盘。</p>
          </section>
          <input ref="keyFileInputRef" class="hidden-file-input" type="file" accept=".pem,.key,.ppk,.txt,.pub" @change="handleKeyFileSelected" />
        </el-drawer>

        <el-drawer v-model="hostDetailVisible" title="主机详情" direction="rtl" size="460px" class="host-detail-drawer" append-to-body>
          <template v-if="connected">
            <div class="host-detail-hero">
              <div class="host-detail-hero-main">
                <span class="host-detail-icon"><el-icon><Monitor /></el-icon></span>
                <div>
                  <span class="host-detail-status"><i></i>已连接</span>
                  <strong>{{ serverInfo.HOSTNAME || '正在读取主机信息' }}</strong>
                  <small>{{ serverInfo.SYSTEM || (isSSHSession ? '等待服务器返回系统信息' : 'SFTP 连接不提供系统概览') }}</small>
                </div>
              </div>
              <div class="host-detail-endpoint">
                <span>{{ isSSHSession ? 'SSH' : 'SFTP' }}</span>
                <code>{{ form.host || '-' }}:{{ form.port || 22 }}</code>
              </div>
            </div>
            <div class="host-detail-toolbar">
              <span>连接信息</span>
              <el-tooltip v-if="isSSHSession" content="刷新主机信息" placement="left">
                <button class="host-detail-refresh" type="button" :disabled="overviewRefreshing" @click="loadOverview({ notify: true })"><el-icon :class="{ spinning: overviewRefreshing }"><Refresh /></el-icon></button>
              </el-tooltip>
            </div>
            <dl class="host-detail-list">
              <div><dt>主机名</dt><dd>{{ serverInfo.HOSTNAME || '-' }}</dd></div>
              <div><dt>内网 IP</dt><dd class="host-detail-ip"><span>{{ formatSensitiveIp(serverInfo.IP, headerIpVisible) }}</span><button class="visibility-toggle-btn" type="button" :title="headerIpVisible ? '隐藏内网 IP' : '显示内网 IP'" :aria-label="headerIpVisible ? '隐藏内网 IP' : '显示内网 IP'" @click="toggleHeaderIpVisible"><el-icon class="visibility-eye-icon"><View v-if="headerIpVisible" /><Hide v-else /></el-icon></button></dd></div>
              <div class="host-detail-list-wide"><dt>操作系统</dt><dd>{{ serverInfo.SYSTEM || '-' }}</dd></div>
            </dl>
            <div class="host-detail-section-title">资源与运行</div>
            <dl class="host-detail-list host-detail-list--metrics">
              <div><dt>内存</dt><dd>{{ serverInfo.MEM || '-' }}</dd></div>
              <div><dt>系统负载</dt><dd>{{ serverInfo.LOAD || '-' }}</dd></div>
              <div><dt>根目录磁盘</dt><dd>{{ serverInfo.DISK || '-' }}</dd></div>
              <div><dt>运行时间</dt><dd>{{ serverInfo.UPTIME || '-' }}</dd></div>
            </dl>
          </template>
          <p v-else class="host-detail-empty">连接服务器后可查看主机信息。</p>
        </el-drawer>

        <ActivationPage
          v-if="activeMenu === 'activation'"
          :app-activation-ready="appActivationReady"
          :app-activated="appActivated"
          :app-activation-status-text="appActivationStatusText"
          :app-activation-expires-text="appActivationExpiresText"
          :app-activation-device-id="appActivationDeviceId"
          :app-activation-product-code="appActivationProductCode"
          :app-activation-purchase-url="appActivationPurchaseUrl"
          :app-activation-busy-action="appActivationBusyAction"
          :app-activation-error="appActivationError"
          :app-activation-form="appActivationForm"
          :submit-app-activation="submitAppActivation"
        />

        <AccountsPage
          v-if="activeMenu === 'accounts'"
          v-bind="accountsPageBindings"
          @update:account-keyword="accountKeyword = $event"
          @update:account-protocol-filter="accountProtocolFilter = $event"
        />

        <DatabasePage
          v-if="activeMenu === 'database'"
          v-bind="databasePageBindings"
          @update:database-login-visible="databaseLoginVisible = $event"
          @update:database-content-tab="databaseContentTab = $event"
          @update:database-data-tab="databaseDataTab = $event"
          @update:selected-database-result-row="selectedDatabaseResultRow = $event"
          @update:selected-database-schema-row="selectedDatabaseSchemaRow = $event"
          @update:selected-database-sql-row="selectedDatabaseSqlRow = $event"
        />

        <FilesPage
          v-if="activeMenu === 'files'"
          v-bind="filesPageBindings"
          @update:local-path-input="localPathInput = $event"
          @update:local-search-keyword="localSearchKeyword = $event"
          @update:local-shortcuts-collapsed="localShortcutsCollapsed = $event"
          @update:selected-local="selectedLocal = $event"
          @update:remote-path-input="remotePathInput = $event"
          @update:remote-search-keyword="remoteSearchKeyword = $event"
          @update:remote-shortcuts-collapsed="remoteShortcutsCollapsed = $event"
          @update:selected-remote="selectedRemote = $event"
        />

        <section v-show="activeMenu === 'terminal'" class="terminal-panel page-section">
          <div class="terminal-toolbar section-line">
            <div>
              <h3>命令终端</h3>
              <p>{{ isSSHSession ? '直接执行 Linux 命令；右侧可打开常用命令参考。' : 'SFTP 连接不支持命令终端。' }}</p>
            </div>
            <div class="service-actions">
              <el-button plain @click="terminalCommandDialogVisible = true">常用命令参考</el-button>
            </div>
          </div>
          <div class="terminal-box-wrap" tabindex="0" @mousedown="focusTerminal" @keydown="handleTerminalKeydown">
            <div ref="terminalRef" class="terminal-box"></div>
          </div>
        </section>

        <ServicesPage v-if="activeMenu === 'services'" v-bind="servicesPageBindings" />

        <SystemUsersPage
          v-if="activeMenu === 'system-users'"
          v-bind="systemUsersPageBindings"
          @update:system-user-keyword="systemUserKeyword = $event"
          @update:system-user-filter="systemUserFilter = $event"
        />

        <PortsPage v-if="activeMenu === 'ports'" v-bind="portsPageBindings" />

        <FirewallPage v-if="activeMenu === 'firewall'" v-bind="firewallPageBindings" />

        <NginxPage
          v-if="activeMenu === 'nginx'"
          v-bind="nginxPageBindings"
          @update:ssl-domain="sslDomain = $event"
        />

        <Pm2Page v-if="activeMenu === 'pm2'" v-bind="{ connected, sessionId, isSSHSession }" />

        <DockerPage
          v-if="activeMenu === 'docker'"
          v-bind="dockerPageBindings"
          @update:docker-use-sudo="dockerUseSudo = $event"
          @update:docker-log-lines="dockerLogLines = $event"
        />

        <ObjectStoragePage v-if="activeMenu === 'object-storage'" />

        <div v-if="browserPageMounted" v-show="activeMenu === 'browser'" class="browser-page-host">
          <BrowserPage />
        </div>

        <LogsPage
          v-if="activeMenu === 'logs'"
          v-bind="logsPageBindings"
          @update:log-lines="logLines = $event"
          @update:log-keyword="logKeyword = $event"
          @update:custom-log-path="customLogPath = $event"
          @update:application-log-keyword="applicationLogKeyword = $event"
        />

      </section>
    </div>
    <div v-if="transferState.active" class="transfer-loading" aria-live="polite">
      <div class="transfer-spinner"></div>
      <strong>{{ transferState.title }}</strong>
      <span>{{ transferProgressLabel }}</span>
    </div>
    <el-dialog v-model="dockerLogViewer.open" :title="`容器日志：${dockerLogViewer.name}`" width="820px">
      <pre class="docker-log-output">{{ dockerLogViewer.content }}</pre>
    </el-dialog>
    <el-dialog v-model="terminalCommandDialogVisible" title="常用命令参考" width="1160px">
      <div class="terminal-command-toolbar">
        <el-input v-model.trim="terminalCommandKeyword" clearable class="terminal-command-search" placeholder="搜索命令或用途说明，例如 nginx reload、重启服务、安装依赖" />
        <el-select v-model="terminalCommandScope" class="terminal-command-filter">
          <el-option v-for="item in terminalCommandScopes" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <span class="terminal-command-search-tip">支持模糊匹配命令、标题和用途说明</span>
      </div>
      <el-table border :data="visibleTerminalCommandRows" :show-overflow-tooltip="tableTooltipOptions" row-key="id" :row-class-name="getTerminalCommandRowClass" class="manage-table terminal-command-table" empty-text="暂无命令参考" @row-click="handleTerminalCommandRowClick">
        <el-table-column label="分类 / 命令标题" min-width="280">
          <template #default="{ row }">
            <div v-if="isTerminalCommandCategory(row)" class="terminal-command-group-cell">
              <el-icon class="terminal-command-folder-icon">
                <FolderOpened v-if="isTerminalCommandExpanded(row.id)" />
                <Folder v-else />
              </el-icon>
              <div class="terminal-command-group-meta">
                <div class="terminal-command-group-head">
                  <span class="terminal-command-title-tag terminal-command-title-tag--group">{{ row.title }}</span>
                  <span v-for="tag in row.risks || []" :key="`${row.id}-${tag}`" :class="['terminal-command-risk-tag', `terminal-command-risk-tag--${getTerminalCommandRiskClass(tag)}`]">{{ tag }}</span>
                </div>
              </div>
            </div>
            <div v-else class="table-title-cell terminal-command-item-cell">
              <button type="button" :class="['terminal-command-copy-tag', { 'is-copied': copiedTerminalCommandId === row.id }]" :data-copy-hint="copiedTerminalCommandId === row.id ? '已复制' : '点击复制'" :title="copiedTerminalCommandId === row.id ? '已复制' : `点击复制命令：${row.command}`" @click.stop="copyTerminalCommand(row)">
                <div class="terminal-command-inline">
                  <span v-for="(part, index) in getTerminalCommandParts(row.command)" :key="`${row.id}-${index}-${part.text}`" :class="['terminal-command-token', `terminal-command-token--${part.type}`]">{{ part.text }}</span>
                </div>
              </button>
              <span class="terminal-command-item-title">{{ row.title }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="说明" min-width="320">
          <template #default="{ row }">
            <span v-if="isTerminalCommandCategory(row)" class="terminal-command-group-desc">{{ row.description }}</span>
            <span v-else>{{ row.description }}</span>
          </template>
        </el-table-column>
        <el-table-column label="用法示例" min-width="420">
          <template #default="{ row }">
            <span v-if="isTerminalCommandCategory(row)" class="terminal-command-group-example">点击本行展开或收起该分类下的命令</span>
            <pre v-else class="terminal-command-example">{{ row.example }}</pre>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>
    <el-dialog v-model="dockerProcessViewer.open" :title="`容器进程：${dockerProcessViewer.name}`" width="900px">
      <el-table border :data="dockerProcessViewer.items" :show-overflow-tooltip="tableTooltipOptions" row-key="pid" class="manage-table" empty-text="没有读取到进程数据">
        <el-table-column label="PID" width="100">
          <template #default="{ row }">{{ row.pid }}</template>
        </el-table-column>
        <el-table-column label="命令" width="180">
          <template #default="{ row }">{{ row.command }}</template>
        </el-table-column>
        <el-table-column label="参数" min-width="420">
          <template #default="{ row }">{{ row.args || '-' }}</template>
        </el-table-column>
      </el-table>
    </el-dialog>
    <el-dialog v-model="logViewer.open" class="log-viewer-dialog" title="日志查看" width="min(960px, calc(100vw - 40px))" @closed="handleLogViewerClosed">
      <div class="log-viewer-head">
        <div class="log-viewer-file">
          <strong :title="logViewer.name">{{ logViewer.name }}</strong>
        </div>
        <div class="service-actions">
          <el-button plain :disabled="!selectedLogFile?.path" @click="readLog(selectedLogFile, { notify: true })">刷新内容</el-button>
          <el-button type="primary" :disabled="!selectedLogFile?.path" @click="toggleTail(selectedLogFile)">{{ tailing ? '停止跟随' : '实时跟随' }}</el-button>
        </div>
      </div>
      <pre class="log-output dialog-log-output">{{ logViewer.content }}</pre>
    </el-dialog>
    <el-dialog v-model="systemUserDialog.open" :title="systemUserDialog.mode === 'create' ? '新建系统账户' : `编辑系统账户：${systemUserDialog.originalName}`" width="720px">
      <div class="system-user-form">
        <label>
          用户名
          <input v-model.trim="systemUserDialog.form.username" :disabled="systemUserDialog.mode !== 'create'" placeholder="例如 deploy" />
        </label>
        <label>
          登录 Shell
          <el-select v-model="systemUserDialog.form.shell" class="dialog-select" filterable allow-create default-first-option>
            <el-option v-for="item in systemUsersOverview.shells" :key="item" :label="item" :value="item" />
          </el-select>
        </label>
        <label v-if="systemUserDialog.mode === 'create'">
          初始密码
          <input v-model="systemUserDialog.form.password" type="password" placeholder="可留空，稍后再设置" />
        </label>
        <label>
          附加用户组
          <input v-model.trim="systemUserDialog.form.groups" placeholder="多个用户组请用逗号分隔，例如 www-data,docker" />
        </label>
        <label v-if="systemUserDialog.mode === 'create'">
          家目录
          <input v-model.trim="systemUserDialog.form.home" placeholder="留空时默认使用 /home/用户名" />
        </label>
        <div class="system-user-options">
          <el-checkbox v-model="systemUserDialog.form.admin">加入 {{ systemUsersOverview.adminGroup || 'sudo' }} 管理组</el-checkbox>
          <el-checkbox v-if="systemUserDialog.mode === 'create'" v-model="systemUserDialog.form.createHome">自动创建家目录</el-checkbox>
          <el-checkbox v-else v-model="systemUserDialog.form.locked">锁定账户</el-checkbox>
        </div>
      </div>
      <template #footer>
        <el-button @click="systemUserDialog.open = false">取消</el-button>
        <el-button type="primary" @click="submitSystemUserDialog">{{ systemUserDialog.mode === 'create' ? '创建账户' : '保存变更' }}</el-button>
      </template>
    </el-dialog>
  </main>
  </el-config-provider>
</template>

<script setup>
  import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import zhCn from 'element-plus/es/locale/lang/zh-cn'
  import en from 'element-plus/es/locale/lang/en'
  import appBrandIcon from './assets/app-icon.png'
  import { useAppLanguage } from './language'
  import { useDatabaseBrowserManager } from './composables/useDatabaseBrowserManager'
  import { useAccountsManager } from './composables/useAccountsManager'
  import { useAppBridgeSupport } from './composables/useAppBridgeSupport'
  import { useDatabaseConnectionManager } from './composables/useDatabaseConnectionManager'
  import { useDatabaseMaintenanceManager } from './composables/useDatabaseMaintenanceManager'
  import { useDatabaseMutationManager } from './composables/useDatabaseMutationManager'
  import { useDatabaseSqlManager } from './composables/useDatabaseSqlManager'
  import { useDockerManager } from './composables/useDockerManager'
  import { useFilesBrowserManager } from './composables/useFilesBrowserManager'
  import { useFilesActionManager } from './composables/useFilesActionManager'
  import { useFilesEditorManager } from './composables/useFilesEditorManager'
  import { useFilesEntryManager } from './composables/useFilesEntryManager'
  import { useFilesClipboardManager } from './composables/useFilesClipboardManager'
  import { useFilesContextMenuManager } from './composables/useFilesContextMenuManager'
  import { useFilesRemoteAccessManager } from './composables/useFilesRemoteAccessManager'
  import { useFilesRemoteShortcutsManager } from './composables/useFilesRemoteShortcutsManager'
  import { useNativeContextMenuBridge } from './composables/useNativeContextMenuBridge'
  import { useFilesPreviewManager } from './composables/useFilesPreviewManager'
  import { useFilesSelectionManager } from './composables/useFilesSelectionManager'
  import { useFilesTransferManager } from './composables/useFilesTransferManager'
  import { useAppActivationManager } from './composables/useAppActivationManager'
  import { useLogsManager } from './composables/useLogsManager'
  import { useNginxManager } from './composables/useNginxManager'
  import { useServicesManager } from './composables/useServicesManager'
  import { useSystemUsersManager } from './composables/useSystemUsersManager'
  import { useWindowManager } from './composables/useWindowManager'
  import {
    getTerminalCommandParts,
    isTerminalCommandCategory,
    matchTerminalCommandKeyword,
    normalizeTerminalCommandSearch,
    terminalCommandScopes,
    terminalCommandReferences
  } from './terminalCommands'

  const AccountsPage = defineAsyncComponent(() => import('./pages/AccountsPage.vue'))
  const ActivationPage = defineAsyncComponent(() => import('./pages/ActivationPage.vue'))
  const BrowserPage = defineAsyncComponent(() => import('./pages/BrowserPage.vue'))
  const DatabasePage = defineAsyncComponent(() => import('./pages/DatabasePage.vue'))
  const DockerPage = defineAsyncComponent(() => import('./pages/DockerPage.vue'))
  const FirewallPage = defineAsyncComponent(() => import('./pages/FirewallPage.vue'))
  const FilesPage = defineAsyncComponent(() => import('./pages/FilesPage.vue'))
  const LogsPage = defineAsyncComponent(() => import('./pages/LogsPage.vue'))
  const NginxPage = defineAsyncComponent(() => import('./pages/NginxPage.vue'))
  const ObjectStoragePage = defineAsyncComponent(() => import('./pages/ObjectStoragePage.vue'))
  const Pm2Page = defineAsyncComponent(() => import('./pages/Pm2Page.vue'))
  const PortsPage = defineAsyncComponent(() => import('./pages/PortsPage.vue'))
  const ServicesPage = defineAsyncComponent(() => import('./pages/ServicesPage.vue'))
  const SystemUsersPage = defineAsyncComponent(() => import('./pages/SystemUsersPage.vue'))

  const menus = [
    { key: 'accounts', label: '连接账号', icon: 'User', desc: '管理已保存的服务器连接账号' },
    { key: 'terminal', label: '命令终端', icon: 'Monitor', desc: '直接执行 Linux 命令' },
    { key: 'files', label: '文件管理', icon: 'FolderOpened', desc: '本地与服务器双栏文件传输' },
    { key: 'object-storage', label: '对象存储', icon: 'Files', desc: '管理 COS / S3 兼容存储连接' },
    { key: 'browser', label: '浏览器', icon: 'Compass', desc: '页签、地址栏和书签栏浏览网页' },
    { key: 'system-users', label: '系统账户', icon: 'UserFilled', desc: '管理 Linux 系统用户和权限' },
    { key: 'services', label: '服务管理', icon: 'Operation', desc: '可视化管理常用服务' },
    { key: 'firewall', label: '防火墙', icon: 'Lock', desc: '管理 ufw 或 firewalld 防火墙规则' },
    { key: 'ports', label: '端口管理', icon: 'Connection', desc: '查看监听端口、Docker 映射与安全组影响' },
    { key: 'database', label: '数据库管理', icon: 'DataBoard', desc: '连接 MySQL / MariaDB 并执行 SQL' },
    { key: 'nginx', label: 'Nginx 管理', icon: 'SetUp', desc: '管理站点配置和 SSL 证书' },
    { key: 'pm2', label: 'pm2管理', icon: 'Grid', desc: '后续补充 pm2 进程与生态管理能力' },
    { key: 'docker', label: 'Docker 容器', icon: 'Box', desc: '可视化管理容器状态' },
    { key: 'logs', label: '日志中心', icon: 'Document', desc: '查看应用和系统日志' }
  ]
  const activationPageMeta = { key: 'activation', label: '应用授权', desc: '账号套餐与设备授权' }
  const { appLanguage, translate } = useAppLanguage()
  const elementLocale = computed(() => appLanguage.value === 'zh-CN' ? zhCn : en)
  const menuLabels = {
    '连接账号': 'Connections',
    '命令终端': 'Terminal',
    '文件管理': 'Files',
    '对象存储': 'Object Storage',
    '浏览器': 'Browser',
    '系统账户': 'System Users',
    '服务管理': 'Services',
    '防火墙': 'Firewall',
    '端口管理': 'Ports',
    '数据库管理': 'Databases',
    'Nginx 管理': 'Nginx',
    'pm2管理': 'PM2',
    'Docker 容器': 'Docker',
    '日志中心': 'Logs'
  }
  const localizedMenus = computed(() => menus.map(item => ({
    ...item,
    label: translate(item.label, menuLabels[item.label] || item.label)
  })))

  function isTerminalCommandExpanded(categoryId) {
    return expandedTerminalCommandIds.value.includes(categoryId)
  }

  function toggleTerminalCommandCategory(categoryId) {
    if (isTerminalCommandExpanded(categoryId)) {
      expandedTerminalCommandIds.value = expandedTerminalCommandIds.value.filter(item => item !== categoryId)
      return
    }
    expandedTerminalCommandIds.value = [...expandedTerminalCommandIds.value, categoryId]
  }

  function handleTerminalCommandRowClick(row) {
    if (!isTerminalCommandCategory(row) || terminalCommandKeyword.value.trim()) return
    toggleTerminalCommandCategory(row.id)
  }

  function getTerminalCommandRowClass({ row }) {
    return isTerminalCommandCategory(row) ? 'terminal-command-group-row' : 'terminal-command-item-row'
  }

  function getTerminalCommandRiskClass(tag) {
    if (tag === '危险') return 'danger'
    if (tag === '会中断服务') return 'interrupt'
    if (tag === '写操作') return 'write'
    return 'readonly'
  }

  const SSH_ONLY_MENUS = ['terminal', 'services', 'system-users', 'ports', 'firewall', 'logs', 'nginx', 'pm2', 'docker']
  const UNLICENSED_MENUS = ['accounts', 'terminal', 'services']
  const PORTS_PREFERENCES_STORAGE_KEY = 'linux-visual:ports-preferences'
  function createSystemUserForm(user = null, options = {}) {
    const adminGroup = options.adminGroup || 'sudo'
    const defaultShell = options.defaultShell || '/bin/bash'
    return {
      username: user?.name || '',
      password: '',
      shell: user?.shell || defaultShell,
      groups: user?.groups?.filter(item => item !== adminGroup).join(', ') || '',
      admin: !!user?.isAdmin,
      locked: !!user?.locked,
      createHome: true,
      home: user?.home || ''
    }
  }

  function createFirewallForm() {
    return { backend: 'auto', direction: 'inbound', port: '', protocol: 'tcp', action: 'allow', source: '', destination: '' }
  }

  function createDatabaseForm() {
    return {
      name: '',
      type: 'mysql',
      host: '127.0.0.1',
      port: 3306,
      username: 'root',
      password: '',
      database: '',
      useSshTunnel: false
    }
  }

  function createDatabasePreviewState(overrides = {}) {
    return {
      database: '',
      table: '',
      page: 1,
      pageSize: 50,
      total: 0,
      ...overrides
    }
  }

  function createDatabaseSchemaState(overrides = {}) {
    return {
      database: '',
      table: '',
      columns: [],
      rows: [],
      fieldMeta: [],
      identityKey: null,
      canMutateRows: false,
      total: 0,
      page: 1,
      pageSize: 50,
      durationMs: 0,
      message: '',
      ...overrides
    }
  }

  function createDatabaseRowDialogState(overrides = {}) {
    return {
      open: false,
      saving: false,
      mode: 'edit',
      database: '',
      table: '',
      row: null,
      identityKey: null,
      identityValues: {},
      identityLabel: '',
      fields: [],
      ...overrides
    }
  }

  function createDatabaseColumnDialogState(overrides = {}) {
    return {
      open: false,
      saving: false,
      mode: 'edit',
      readOnly: false,
      database: '',
      table: '',
      originalName: '',
      position: {
        mode: 'last',
        afterColumn: ''
      },
      form: {
        name: '',
        type: '',
        length: '',
        nullable: true,
        key: '',
        defaultInput: '无默认值',
        extra: '',
        comment: '',
        collation: '',
        autoIncrement: false,
        onUpdateCurrentTimestamp: false
      },
      ...overrides
    }
  }

  function createDatabaseSqlResultState(overrides = {}) {
    return {
      kind: 'idle',
      command: '',
      columns: [],
      rows: [],
      total: 0,
      page: 1,
      pageSize: 50,
      affectedRows: 0,
      insertId: 0,
      durationMs: 0,
      message: '',
      ...overrides
    }
  }

  let databaseSqlRecordSeed = 0

  function createDatabaseSqlRecord(sql = '', title = '') {
    databaseSqlRecordSeed += 1
    return {
      id: `sql-record-${databaseSqlRecordSeed}`,
      sql: String(sql || ''),
      title: String(title || '').trim()
    }
  }

  function createDatabaseResultState(overrides = {}) {
    return {
      kind: 'idle',
      command: '',
      columns: [],
      rows: [],
      rowCount: 0,
      total: 0,
      page: 1,
      pageSize: 50,
      affectedRows: 0,
      insertId: 0,
      durationMs: 0,
      activeDatabase: '',
      source: 'idle',
      message: '',
      ...overrides
    }
  }

  function createFirewallOverviewState() {
    return {
      backend: '',
      recommendedBackend: '',
      active: false,
      manageable: false,
      rules: [],
      diagnostics: {
        iptablesMode: 'unknown',
        firewallWarnings: [],
        firewallLayers: [],
        docker: { detected: false, publishedPorts: [], note: '' },
        listening: { items: [], note: '' },
        cloudSecurityGroup: { detected: false, note: '' }
      }
    }
  }

  function createDefaultForm(protocol = 'ssh') {
    return {
      id: '',
      name: '',
      protocol,
      host: '',
      port: 22,
      username: '',
      password: '',
      authType: 'password',
      privateKey: '',
      passphrase: ''
    }
  }

  function normalizeForm(value = {}) {
    const protocol = value.protocol === 'sftp' || value.protocol === 'ftp' ? 'sftp' : 'ssh'
    const base = createDefaultForm(protocol)
    return {
      ...base,
      ...value,
      protocol,
      authType: value.authType === 'privateKey' ? 'privateKey' : 'password',
      port: Number(value.port || base.port)
    }
  }

  function getFirewallPreferredStorageKey(profile = {}) {
    const protocol = String(profile.protocol || 'ssh').trim().toLowerCase()
    const host = String(profile.host || '').trim().toLowerCase()
    const port = Number(profile.port || 22)
    const username = String(profile.username || '').trim().toLowerCase()
    return host && username ? `linux-visual:firewall-preferred:${protocol}:${host}:${port}:${username}` : ''
  }

  async function readAppPreference(key) {
    const normalizedKey = String(key || '').trim()
    if (!normalizedKey) return null
    if (window.whSSH?.getAppStorageItem) {
      try {
        const stored = await window.whSSH.getAppStorageItem(normalizedKey)
        if (stored !== null && stored !== undefined) return stored
      } catch (error) {
        // SQLite 读取失败时回退到 localStorage，避免影响连接流程。
      }
    }
    try {
      const raw = window.localStorage?.getItem(normalizedKey)
      return raw ? JSON.parse(raw) : null
    } catch (error) {
      window.localStorage?.removeItem(normalizedKey)
      return null
    }
  }

  async function writeAppPreference(key, value) {
    const normalizedKey = String(key || '').trim()
    if (!normalizedKey) return
    if (window.whSSH?.setAppStorageItem) {
      try {
        await window.whSSH.setAppStorageItem({ key: normalizedKey, value })
      } catch (error) {
        // 继续写 localStorage 兜底。
      }
    }
    try {
      window.localStorage?.setItem(normalizedKey, JSON.stringify(value ?? null))
    } catch (error) {}
  }

  async function deleteAppPreference(key) {
    const normalizedKey = String(key || '').trim()
    if (!normalizedKey) return
    if (window.whSSH?.deleteAppStorageItem) {
      try {
        await window.whSSH.deleteAppStorageItem(normalizedKey)
      } catch (error) {
        // 继续删除 localStorage 兜底。
      }
    }
    try {
      window.localStorage?.removeItem(normalizedKey)
    } catch (error) {}
  }

  async function restoreFirewallPreferredBackend(profile = {}) {
    const key = getFirewallPreferredStorageKey(profile)
    firewallPreferredStorageKey.value = key
    firewallPreferredBackend.value = 'auto'
    firewallUserPreferredBackend.value = 'auto'
    firewallPreferredInitialized.value = false
    firewallForm.value.backend = 'auto'
    if (!key) return
    const payload = await readAppPreference(key)
    const backend = String(payload?.backend || 'auto').trim().toLowerCase()
    if (!backend || backend === 'auto') return
    firewallUserPreferredBackend.value = backend
    firewallPreferredBackend.value = backend
    firewallPreferredInitialized.value = true
    firewallForm.value.backend = backend
    void writeAppPreference(key, { version: 1, backend })
  }

  function persistFirewallPreferredBackend(backend) {
    const key = firewallPreferredStorageKey.value
    if (!key) return
    void writeAppPreference(key, { version: 1, backend: backend || 'auto' })
  }

  async function restorePortsPreferences() {
    const payload = await readAppPreference(PORTS_PREFERENCES_STORAGE_KEY)
    if (typeof payload?.listeningAddressVisible === 'boolean') {
      listeningAddressVisible.value = payload.listeningAddressVisible
      persistPortsPreferences()
    }
  }

  function persistPortsPreferences() {
    void writeAppPreference(PORTS_PREFERENCES_STORAGE_KEY, {
      version: 1,
      listeningAddressVisible: listeningAddressVisible.value
    })
  }

  const {
    appActivationReady,
    appActivated,
    appActivationStatusText,
    appActivationExpiresText,
    appActivationDeviceId,
    appActivationProductCode,
    appActivationPurchaseUrl,
    appActivationBusyAction,
    appActivationError,
    appActivationForm,
    initializeAppActivation,
    submitAppActivation
  } = useAppActivationManager()

  const activeMenu = ref('accounts')
  const browserPageMounted = ref(false)
  const workspaceLoading = ref(false)
  const workspaceLoadingText = ref('正在加载...')
  let workspaceLoadingRequest = 0
  const currentMenu = computed(() => activeMenu.value === activationPageMeta.key ? activationPageMeta : localizedMenus.value.find(item => item.key === activeMenu.value) || localizedMenus.value[0])
  const form = ref(createDefaultForm())
  const loginVisible = ref(false)
  const connected = ref(false)
  const connecting = ref(false)
  const rememberConnection = ref(true)
  const sessionId = ref('')
  const sessionProtocol = ref('ssh')
  const isSSHSession = computed(() => sessionProtocol.value === 'ssh')
  const isFTPSession = computed(() => sessionProtocol.value === 'sftp')
  const message = ref('')
  const messageToastType = text => {
    if (/(失败|错误|无法|不可用)/.test(text)) return 'error'
    if (/(请先|请填写|仅支持|暂不支持|已取消|未激活)/.test(text)) return 'warning'
    if (/^(正在|加载|读取|连接中)/.test(text)) return 'info'
    return 'success'
  }

  watch(message, value => {
    const text = String(value || '').trim()
    if (!text) return
    const type = messageToastType(text)
    ElMessage({
      message: text,
      type,
      duration: type === 'error' ? 2400 : 1600,
      grouping: true
    })
    nextTick(() => {
      if (message.value === value) message.value = ''
    })
  })
  const files = ref([])
  const localFiles = ref([])
  const localPath = ref('')
  const localPathInput = ref('')
  const localSearchKeyword = ref('')
  const localSearchActive = ref(false)
  const localRoots = ref([])
  const showHiddenLocal = ref(true)
  const selectedLocal = ref(null)
  const selectedLocals = ref([])
  const selectedRemote = ref(null)
  const selectedRemotes = ref([])
  const transferState = ref({ active: false, title: '', current: 0, total: 0 })
  const localTableRef = ref(null)
  const remoteTableRef = ref(null)
  const lastLocalIndex = ref(-1)
  const lastRemoteIndex = ref(-1)
  const remotePath = ref('/')
  const remotePathInput = ref('/')
  const remoteSearchKeyword = ref('')
  const remoteSearchActive = ref(false)
  const terminalRef = ref(null)
  const editorMonacoRef = ref(null)
  const databaseSqlMonacoRef = ref(null)
  const keyFileInputRef = ref(null)
  const terminalCommandDialogVisible = ref(false)
  const terminalCommandKeyword = ref('')
  const terminalCommandScope = ref('all')
  const expandedTerminalCommandIds = ref([])
  const copiedTerminalCommandId = ref('')
  const headerIpVisible = ref(false)
  const hostDetailVisible = ref(false)
  const databaseLoading = ref(false)
  const databaseDatabases = ref([])
  const databaseTables = ref([])
  const databaseTablesByDatabase = ref({})
  const databaseExpandedKeys = ref([])
  const databaseTreeLoadingKeys = ref([])
  const databaseActiveDatabase = ref('')
  const databaseSelectedTable = ref('')
  const databaseContentTab = ref('data')
  const databaseDataTab = ref('rows')
  const databasePreview = ref(createDatabasePreviewState())
  const databaseSchema = ref(createDatabaseSchemaState())
  const databaseRowDialog = ref(createDatabaseRowDialogState())
  const databaseColumnDialog = ref(createDatabaseColumnDialogState())
  const databaseSqlHistory = ref([createDatabaseSqlRecord('SHOW DATABASES;', 'SQL 记录 1')])
  const activeDatabaseSqlRecordId = ref(databaseSqlHistory.value[0].id)
  const databaseSql = computed({
    get() {
      const active = databaseSqlHistory.value.find(item => item.id === activeDatabaseSqlRecordId.value)
      return active ? active.sql : ''
    },
    set(value) {
      const text = String(value ?? '')
      const active = databaseSqlHistory.value.find(item => item.id === activeDatabaseSqlRecordId.value)
      if (active) {
        active.sql = text
        return
      }
      const record = appendDatabaseSqlHistory(text)
      activeDatabaseSqlRecordId.value = record.id
    }
  })
  const databaseSqlResult = ref(createDatabaseSqlResultState())
  const selectedDatabaseResultRow = ref(null)
  const selectedDatabaseSchemaRow = ref(null)
  const selectedDatabaseSqlRow = ref(null)
  const databaseResult = ref(createDatabaseResultState())
  const databaseTreeWidth = ref(300)
  const databaseTreeResizing = ref(false)
  const serverInfo = ref({})
  const overviewRefreshing = ref(false)

  function setLocalTableRef(element) {
    localTableRef.value = element || null
  }

  function setRemoteTableRef(element) {
    remoteTableRef.value = element || null
  }

  function setEditorMonacoRef(element) {
    editorMonacoRef.value = element || null
  }

  function setDatabaseSqlMonacoRef(element) {
    const nextElement = element || null
    if (databaseSqlMonacoElement && databaseSqlMonacoElement !== nextElement) {
      disposeDatabaseSqlMonaco()
    }
    databaseSqlMonacoElement = nextElement
    databaseSqlMonacoRef.value = element || null
  }
  const firewallOverview = ref(createFirewallOverviewState())
  const firewallLoading = ref(false)
  const firewallForm = ref(createFirewallForm())
  const firewallRuleDialogRequest = ref(0)
  const firewallPreferredBackend = ref('auto')
  const firewallPreferredInitialized = ref(false)
  const firewallUserPreferredBackend = ref('auto')
  const firewallPreferredStorageKey = ref('')
  const listeningAddressVisible = ref(true)
  const windowState = ref({ maximized: false, minimized: false })
  const leftPaneRatio = ref(50)
  const resizing = ref(false)
  const readShortcutPaneCollapsed = key => {
    try {
      return window.localStorage.getItem(key) === 'true'
    } catch {
      return false
    }
  }
  const persistShortcutPaneCollapsed = (key, value) => {
    try {
      window.localStorage.setItem(key, String(!!value))
    } catch {
      // 浏览器存储不可用时保留当前运行时状态。
    }
  }
  const localShortcutsCollapsed = ref(readShortcutPaneCollapsed('linux-visual:local-shortcuts-collapsed'))
  const remoteShortcutsCollapsed = ref(readShortcutPaneCollapsed('linux-visual:remote-shortcuts-collapsed'))
  watch(localShortcutsCollapsed, value => persistShortcutPaneCollapsed('linux-visual:local-shortcuts-collapsed', value))
  watch(remoteShortcutsCollapsed, value => persistShortcutPaneCollapsed('linux-visual:remote-shortcuts-collapsed', value))
  let terminal = null
  let terminalResizeObserver = null
  let stopTerminalData = null
  let stopTerminalClosed = null
  let stopTerminalPaste = null
  let stopTailData = null
  let stopTailClosed = null
  let stopLocalRefresh = null
  let stopWindowStateChanged = null
  let terminalCommandCopyTimer = null
  let editorMonacoSession = null
  let databaseSqlMonacoSession = null
  let databaseSqlMonacoElement = null
  let databaseSqlCompletionDisposable = null
  let createMonacoEditorSessionFactory = null
  let databaseBrowserApi = null
  let filesBrowserApi = null
  let filesSelectionApi = null

  const refreshDatabaseBrowserProxy = (...args) => databaseBrowserApi?.refreshDatabaseBrowser?.(...args)
  const resetDatabaseBrowserProxy = (...args) => databaseBrowserApi?.resetDatabaseBrowser?.(...args)
  const isRemoteShortcutActiveProxy = (...args) => filesBrowserApi?.isRemoteShortcutActive?.(...args) ?? false
  const setActiveFilePaneProxy = (...args) => filesSelectionApi?.setActiveFilePane?.(...args)
  const getLocalActionItemsProxy = (...args) => filesSelectionApi?.getLocalActionItems?.(...args) || []
  const getRemoteActionItemsProxy = (...args) => filesSelectionApi?.getRemoteActionItems?.(...args) || []

  const {
    ensureSshFeature,
    reportError,
    showPendingActionToast,
    ensureBridgeMethod
  } = useAppBridgeSupport({
    message,
    remotePath,
    sessionProtocol
  })

  const {
    syncWindowState,
    minimizeWindow,
    toggleWindowMaximize,
    closeWindow
  } = useWindowManager({ windowState })

  const {
    accountKeyword,
    accountProtocolFilter,
    savedConnections,
    managedConnections,
    openNewConnection,
    applyConnectionToLogin,
    editConnection,
    removeConnection,
    isManagedConnectionActive,
    toggleSavedConnection,
    loadConnections,
    cacheCurrentConnection,
    saveConnection,
    deleteSavedConnection
  } = useAccountsManager({
    createDefaultForm,
    normalizeForm,
    form,
    loginVisible,
    message,
    connecting,
    connected,
    sessionId,
    connect,
    disconnect
  })

  const {
    databaseLoginVisible,
    databaseForm,
    databaseSavedConnections,
    databaseLoginMode,
    databaseConnectionId,
    databaseConnected,
    databaseConnecting,
    databaseConnectionLabel,
    currentDatabaseEngine,
    openDatabaseLogin,
    loadDatabaseConnections,
    useSavedDatabaseConnection,
    handleDatabaseTypeChange,
    connectSavedDatabaseConnectionDirect,
    editSavedDatabaseConnection,
    startCreateDatabaseConnection,
    submitDatabaseLoginDialog,
    removeSavedDatabaseConnection,
    cacheCurrentDatabaseConnection,
    connectDatabase,
    disconnectDatabase
  } = useDatabaseConnectionManager({
    createDatabaseForm,
    createDatabasePreviewState,
    createDatabaseResultState,
    connected,
    isSSHSession,
    sessionId,
    message,
    reportError,
    ensureBridgeMethod,
    refreshDatabaseBrowser: refreshDatabaseBrowserProxy,
    resetDatabaseBrowser: resetDatabaseBrowserProxy,
    databaseActiveDatabase,
    databasePreview,
    databaseResult
  })

  const {
    databaseLayoutStyle,
    databaseSchemaPageRows,
    databaseResultSummary,
    databaseHasActiveTable,
    databaseCurrentIdentityKey,
    canMutateDatabaseRows,
    canEditDatabaseRows,
    currentDatabaseTableItem,
    canCreateDatabaseRows,
    canCreateDatabaseColumns,
    isDatabaseExpanded,
    isDatabaseTreeLoading,
    loadDatabaseTables,
    resetDatabaseBrowser,
    refreshDatabaseBrowser,
    toggleDatabaseTree,
    selectDatabaseTreeTable,
    loadDatabaseTablePreview,
    openDatabaseTreeTable,
    handleDatabasePageChange,
    handleDatabasePageSizeChange,
    reloadDatabasePreview,
    startDatabaseTreeResize,
    loadDatabaseTableSchema,
    switchDatabaseDataTab,
    ensureDatabaseTableSchemaLoaded
  } = useDatabaseBrowserManager({
    databaseConnected,
    databaseConnectionId,
    databaseLoading,
    databaseDatabases,
    databaseTables,
    databaseTablesByDatabase,
    databaseExpandedKeys,
    databaseTreeLoadingKeys,
    databaseActiveDatabase,
    databaseSelectedTable,
    databaseContentTab,
    databaseDataTab,
    databasePreview,
    databaseSchema,
    databaseResult,
    databaseSqlResult,
    databaseRowDialog,
    databaseColumnDialog,
    selectedDatabaseResultRow,
    selectedDatabaseSchemaRow,
    selectedDatabaseSqlRow,
    databaseSqlHistory,
    activeDatabaseSqlRecordId,
    databaseForm,
    databaseTreeWidth,
    databaseTreeResizing,
    databaseSql,
    message,
    createDatabasePreviewState,
    createDatabaseSchemaState,
    createDatabaseRowDialogState,
    createDatabaseColumnDialogState,
    createDatabaseSqlResultState,
    createDatabaseResultState,
    createDatabaseSqlRecord,
    reportError,
    ensureBridgeMethod,
    fetchDatabaseTableSchemaResult,
    applyDatabaseSchemaResult,
    escapeDatabaseIdentifier
  })

  databaseBrowserApi = {
    refreshDatabaseBrowser,
    resetDatabaseBrowser,
    ensureDatabaseTableSchemaLoaded
  }

  const {
    databaseSqlOverflowRecords,
    databaseSqlVisibleRecords,
    getDatabaseSqlRecordLabel,
    appendDatabaseSqlHistory,
    activateDatabaseSqlHistory,
    pushDatabaseSqlHistory,
    isActiveDatabaseSqlHistory,
    removeDatabaseSqlHistory,
    copyDatabaseCellValue,
    handleDatabaseSqlTableCellDblClick,
    fillDatabaseSqlExample,
    runDatabaseSql,
    handleDatabaseSqlResultPageChange,
    handleDatabaseSqlResultPageSizeChange
  } = useDatabaseSqlManager({
    databaseSqlHistory,
    activeDatabaseSqlRecordId,
    databaseSql,
    databaseActiveDatabase,
    databaseSelectedTable,
    databaseSqlResult,
    databasePreview,
    databaseSchema,
    databaseResult,
    databaseConnected,
    databaseConnectionId,
    databaseForm,
    databaseLoading,
    createDatabaseSqlRecord,
    createDatabaseSqlResultState,
    createDatabasePreviewState,
    createDatabaseSchemaState,
    createDatabaseResultState,
    ensureBridgeMethod,
    refreshDatabaseBrowser,
    escapeDatabaseIdentifier,
    message,
    reportError
  })

  const {
    showNativeContextMenu,
    bindNativeContextMenuAction,
    cleanupNativeContextMenuBridge
  } = useNativeContextMenuBridge({
    getContextActions: (...args) => getContextActions(...args),
    runContextAction: (...args) => runContextAction(...args)
  })

  const {
    closeDatabaseRowDialog,
    closeDatabaseColumnDialog,
    openCreateDatabaseColumnDialog,
    openDatabaseColumnDialog,
    openCreateDatabaseRowDialog,
    openDatabaseRowDialog,
    submitDatabaseRowDialog,
    submitDatabaseColumnDialog,
    saveDatabaseSchemaInlineColumn,
    deleteDatabaseSchemaColumn,
    deleteDatabasePreviewRow,
    databaseInlineEdit,
    queryDatabaseInlineEditSuggestions,
    getDatabaseInlineEditSuggestionItems,
    handleDatabaseInlineEditSuggestionSelect,
    handleDatabaseInlineEditFieldInput,
    getDatabaseInlineEditFieldCategory,
    getDatabaseInlineEditControlType,
    getDatabaseInlineEditInputType,
    getDatabaseInlineEditEditorValue,
    shouldUseDatabaseInlineSuggestions,
    getDatabaseInlineEditSelectOptions,
    getDatabaseInlineEditSelectValue,
    handleDatabaseInlineEditSelectChange,
    isDatabaseInlineEditRow,
    isDatabaseInlineEditFieldActive,
    getDatabaseInlineEditFieldValue,
    isDatabaseInlineEditFieldNull,
    setDatabaseInlineEditFieldNull,
    activateDatabaseInlineEditField,
    shouldUseDatabaseInlineTextarea,
    isDatabaseInlineEditFieldReadOnly,
    isDatabaseInlineEditFieldNullable,
    saveDatabaseInlineEdit,
    cancelDatabaseInlineEdit,
    handleDatabaseResultCellClick,
    handleDatabaseResultCellDblClick,
    showDatabaseResultContextMenu,
    showDatabaseSchemaContextMenu
  } = useDatabaseMutationManager({
    databaseConnectionId,
    databaseSchema,
    databasePreview,
    databaseRowDialog,
    databaseColumnDialog,
    databaseLoading,
    databaseResult,
    selectedDatabaseResultRow,
    selectedDatabaseSchemaRow,
    createDatabaseRowDialogState,
    createDatabaseColumnDialogState,
    createDatabaseResultState,
    ensureDatabaseTableSchemaLoaded,
    buildDatabaseRowDialogFields,
    buildDatabaseRowIdentityValues,
    buildDatabaseIdentityLabel,
    normalizeDatabaseComparableValue,
    normalizeDatabaseColumnDefaultPayload,
    formatDatabaseColumnDefaultInput,
    getDatabaseSchemaFieldMeta,
    ensureBridgeMethod,
    reloadDatabasePreview,
    loadDatabaseTableSchema,
    loadDatabaseTablePreview,
    reportError,
    message,
    showPendingActionToast,
    showNativeContextMenu
  })

  const {
    createDatabase,
    importDatabaseSqlToDatabase,
    exportDatabaseSqlFromDatabase,
    importDatabaseSqlToTable,
    exportDatabaseSqlFromTable,
    importDatabaseTablesToDatabase,
    exportDatabaseTablesFromDatabase,
    refreshDatabaseNode,
    refreshDatabaseTableNode,
    deleteDatabaseTreeItem,
    deleteDatabaseTableItem
  } = useDatabaseMaintenanceManager({
    databaseConnected,
    databaseConnectionId,
    databaseActiveDatabase,
    databaseSelectedTable,
    databaseForm,
    databasePreview,
    databaseSchema,
    databaseResult,
    databaseSqlResult,
    databaseExpandedKeys,
    databaseTreeLoadingKeys,
    databaseTablesByDatabase,
    databaseTables,
    databaseDataTab,
    databaseLoading,
    createDatabasePreviewState,
    createDatabaseSchemaState,
    createDatabaseSqlResultState,
    createDatabaseResultState,
    ensureBridgeMethod,
    refreshDatabaseBrowser,
    loadDatabaseTables,
    loadDatabaseTableSchema,
    loadDatabaseTablePreview,
    reportError,
    message,
    showPendingActionToast
  })

  const {
    remoteShortcuts,
    remoteShortcutProfile,
    normalizeRemoteShortcutPath,
    createRemoteShortcutProfile,
    loadRemoteShortcuts,
    getRemoteShortcutButtonClass,
    showRemoteShortcutContextMenu,
    onRemoteShortcutDragStart,
    onRemoteShortcutDragOver,
    onRemoteShortcutDrop,
    onRemoteShortcutDragEnd,
    addRemoteShortcut,
    renameRemoteShortcut,
    removeRemoteShortcut,
    resetRemoteShortcutState
  } = useFilesRemoteShortcutsManager({
    connected,
    sessionId,
    sessionProtocol,
    message,
    reportError,
    setActiveFilePane: setActiveFilePaneProxy,
    showNativeContextMenu: (...args) => showNativeContextMenu(...args),
    isRemoteShortcutActive: isRemoteShortcutActiveProxy
  })

  const {
    ensureRemoteWritable,
    loadPersistedRemoteDirectoryAccessCache,
    flushPersistRemoteDirectoryAccessCache,
    clearRemoteDirectoryAccessCache
  } = useFilesRemoteAccessManager({
    sessionId,
    sessionProtocol,
    remotePath,
    remoteShortcutProfile,
    reportError,
    normalizeRemoteShortcutPath
  })

  const {
    filePanelStyle,
    localPinnedRoots,
    localDriveRoots,
    localBreadcrumbs,
    remotePinnedRoots,
    remoteBreadcrumbs,
    localTableFiles,
    remoteTableFiles,
    fileSearchState,
    loadFiles,
    loadLocalFiles,
    loadLocalRoots,
    navigateLocalPath,
    navigateRemotePath,
    resetLocalPathInput,
    resetRemotePathInput,
    handleLocalSearchInput,
    handleRemoteSearchInput,
     clearLocalSearch,
     localGlobalSearch,
     remoteGlobalSearch,
    clearRemoteSearch,
    cancelLocalSearch,
    cancelRemoteSearch,
      scheduleGlobalSearch,
      runGlobalSearch,
      clearGlobalSearch,
     setGlobalSearchOpen,
     openLocalGlobalSearchResult,
     openRemoteGlobalSearchResult,
    getLocalItemDirectory,
    isLocalShortcutActive,
    isLocalBreadcrumbActive,
    openLocalShortcut,
    getRemoteItemDirectory,
    isRemoteShortcutActive,
    isRemoteBreadcrumbActive,
    openRemoteShortcut
  } = useFilesBrowserManager({
    files,
    localFiles,
    localPath,
    localPathInput,
    localSearchKeyword,
    localSearchActive,
    localRoots,
    showHiddenLocal,
    selectedLocal,
    selectedLocals,
    selectedRemote,
    selectedRemotes,
    lastLocalIndex,
    lastRemoteIndex,
    remotePath,
    remotePathInput,
    remoteSearchKeyword,
    remoteSearchActive,
    remoteShortcuts,
    leftPaneRatio,
    connected,
    sessionId,
    createParentRow,
    getLocalParent,
    getRemoteParentPath,
    normalizeLocalComparePath,
    reportError,
    logRemotePerf: (...args) => logRemotePerf(...args)
  })

  filesBrowserApi = {
    isRemoteShortcutActive
  }

  const {
    imagePreview,
    mediaPreview,
    imagePreviewTransformStyle,
    mediaPreviewStatusTitle,
    setMediaPreviewPlayerRef,
    normalizeImagePreviewRotation,
    resetImagePreviewTransform,
    closeImagePreview,
    closeMediaPreview,
    handleMediaPreviewShortcut,
    handleMediaPreviewCanPlay,
    handleMediaPreviewError,
    zoomImagePreview,
    rotateImagePreview,
    handleImagePreviewWheel,
    startImagePreviewDrag,
    openImagePreview,
    openRemoteMediaPreview
  } = useFilesPreviewManager({
    sessionId,
    message,
    isPreviewableVideoFile
  })

  const {
    editor,
    editorTabs,
    editorHasUnsavedChanges,
    EDITOR_ENCODING_OPTIONS,
    syncEditorIntoTabs,
    getFileBaseName,
    getEditorEncodingLabel,
    getEditorFileTypeLabel,
    openEditorFind,
    openEditorReplace,
    handleEditorEncodingCommand,
    copyEditorPath,
    activateEditorTab,
    closeEditor,
    closeEditorTab,
    openEditor,
    reloadEditorWithEncoding,
    saveEditor
  } = useFilesEditorManager({
    sessionId,
    message,
    getExt,
    ensureEditorMonaco: () => ensureEditorMonaco(),
    syncEditorMonacoContent: (content, filePath) => syncEditorMonacoContent(content, filePath),
    disposeEditorMonaco: () => disposeEditorMonaco(),
    setEditorMonacoReadOnly: value => editorMonacoSession?.setReadOnly(!!value),
    openEditorMonacoFind: () => editorMonacoSession?.openFind(),
    openEditorMonacoReplace: () => editorMonacoSession?.openReplace()
  })

  const {
    openFile,
    openRemoteFile,
    openLocalFile,
    openLocalInExplorer,
    goLocalParent,
    goParent
  } = useFilesEntryManager({
    localPath,
    selectedLocal,
    remotePath,
    loadFiles,
    loadLocalFiles,
    getLocalParent,
    reportError,
    openImagePreview,
    openRemoteMediaPreview,
    openEditor,
    isImageFile,
    isPreviewableRemoteMediaFile
  })

  const {
    createLocalFile,
    createLocalFolder,
    deleteLocalItem,
    deleteSelectedLocals,
    renameLocalItem,
    uploadSelectedLocal,
    downloadSelectedRemote,
    downloadSingleRemote,
    deleteSelectedRemotes,
    makeDir,
    createRemoteFile,
    uploadSelectedLocalTo,
    extractRemoteArchive,
    compressRemote,
    deleteFile,
    renameFile
  } = useFilesActionManager({
    sessionId,
    localPath,
    remotePath,
    selectedLocal,
    selectedLocals,
    selectedRemote,
    selectedRemotes,
    message,
    reportError,
    loadFiles,
    loadLocalFiles,
    ensureSshFeature,
    ensureRemoteWritable,
    formatRights,
    getLocalActionItems: getLocalActionItemsProxy,
    getRemoteActionItems: getRemoteActionItemsProxy,
    getRemoteParentPath,
    joinLocalPath,
    joinRemotePath
  })

  const {
    remoteClipboard,
    remoteClipboardCount,
    getRemotePasteTarget,
    copyRemoteEntry,
    pasteRemoteEntry,
    copyLocalSelection,
    pasteLocalSelection
  } = useFilesClipboardManager({
    sessionId,
    localPath,
    remotePath,
    selectedLocal,
    selectedLocals,
    selectedRemotes,
    transferState,
    message,
    reportError,
    loadFiles,
    loadLocalFiles,
    ensureBridgeMethod,
    ensureRemoteWritable,
    getLocalActionItems: getLocalActionItemsProxy,
    getRemoteActionItems: getRemoteActionItemsProxy
  })

  const {
    localDropActive,
    remoteDropActive,
    localDropTargetPath,
    remoteDropTargetPath,
    onDragEnd,
    onLocalDragStart,
    onRemoteDragStart,
    onLocalPanelDragEnter,
    onLocalPanelDragLeave,
    onLocalPanelDragOver,
    onLocalRowDragEnter,
    onLocalRowDragLeave,
    onLocalRowDragOver,
    onLocalPanelDrop,
    onRemotePanelDragEnter,
    onRemotePanelDragLeave,
    onRemotePanelDragOver,
    onRemoteRowDragEnter,
    onRemoteRowDragLeave,
    onRemoteRowDragOver,
    onRemotePanelDrop,
    onLocalRowDrop,
    onRemoteRowDrop
  } = useFilesTransferManager({
    connected,
    sessionId,
    localPath,
    remotePath,
    selectedLocals,
    selectedRemotes,
    transferState,
    message,
    reportError,
    loadFiles,
    loadLocalFiles,
    ensureRemoteWritable
  })

  const {
    activeFilePane,
    localSelectionSoft,
    remoteSelectionSoft,
    syncLocalSelection,
    syncRemoteSelection,
    isSelectedByPath,
    setActiveFilePane,
    getLocalActionItems,
    getRemoteActionItems,
    handleLocalPaneMouseDown,
    handleRemotePaneMouseDown,
    handleLocalRowClick,
    handleRemoteRowClick,
    showLocalContextMenu,
    showLocalDriveContextMenu,
    showLocalPanelContextMenu,
    showRemoteContextMenu,
    showRemotePanelContextMenu,
    localRowClassName,
    remoteRowClassName,
    handleFilesPaneShortcut
  } = useFilesSelectionManager({
    localPath,
    remotePath,
    lastLocalIndex,
    lastRemoteIndex,
    localTableRef,
    remoteTableRef,
    localTableFiles,
    remoteTableFiles,
    localDropTargetPath,
    remoteDropTargetPath,
    selectedLocal,
    selectedLocals,
    selectedRemote,
    selectedRemotes,
    mediaPreview,
    imagePreview,
    copyLocalSelection,
    pasteLocalSelection,
    copyRemoteEntry,
    pasteRemoteEntry,
    deleteLocalItem,
    deleteSelectedLocals,
    deleteFile,
    deleteSelectedRemotes,
    goLocalParent,
    handleMediaPreviewShortcut,
    showNativeContextMenu: (...args) => showNativeContextMenu(...args)
  })

  filesSelectionApi = {
    setActiveFilePane,
    getLocalActionItems,
    getRemoteActionItems
  }

  const {
    getFileContextActions,
    runFileContextAction
  } = useFilesContextMenuManager({
    localPath,
    remotePath,
    selectedLocals,
    selectedRemote,
    remoteClipboard,
    remoteClipboardCount,
    loadFiles,
    loadLocalFiles,
    loadLocalRoots,
    message,
    reportError,
    getRemoteActionItems,
    getRemotePasteTarget,
    openLocalFile,
    openFile,
    openEditor,
    openImagePreview,
    openRemoteMediaPreview,
    isImageFile,
    isPreviewableRemoteMediaFile,
    createLocalFile,
    createLocalFolder,
    createRemoteFile,
    pasteLocalSelection,
    deleteLocalItem,
    renameLocalItem,
    makeDir,
    pasteRemoteEntry,
    openRemoteShortcut,
    renameRemoteShortcut,
    removeRemoteShortcut,
    addRemoteShortcut,
    uploadSelectedLocalTo,
    copyRemoteEntry,
    downloadSelectedRemote,
    downloadSingleRemote,
    extractRemoteArchive,
    compressRemote,
    renameFile,
    deleteFile,
    deleteSelectedRemotes
  })

  const {
    logLines,
    logFiles,
    logFilesLoading,
    logKeyword,
    customLogPath,
    selectedLogFile,
    logViewer,
    tailing,
    tailId,
    tailPath,
    applicationLogs,
    applicationLogKeyword,
    applicationLogLoading,
    applicationLogInfo,
    serverLogContents,
    serverLogLoadingPaths,
    filteredLogFiles,
    filteredApplicationLogs,
    loadApplicationLogs,
    clearApplicationLogs,
    deleteApplicationLogEntry,
    loadLogFiles,
    selectLogFile,
    openLogFile,
    handleLogMenuCommand,
    deleteServerLog,
    openCustomLogPath,
    readLog,
    readServerLogInline,
    toggleTail,
    stopTail,
    handleLogViewerClosed
  } = useLogsManager({
    connected,
    sessionId,
    message,
    ensureSshFeature
  })

  const MAX_TAIL_CONTENT_CHARS = 1024 * 1024
  let pendingTailContent = ''
  let pendingTailFrame = 0

  function flushPendingTailContent() {
    pendingTailFrame = 0
    if (!pendingTailContent || !tailId.value || !tailPath.value || logViewer.value.path !== tailPath.value) {
      pendingTailContent = ''
      return
    }
    const content = `${logViewer.value.content || ''}${pendingTailContent}`
    pendingTailContent = ''
    logViewer.value = {
      ...logViewer.value,
      content: content.length > MAX_TAIL_CONTENT_CHARS ? content.slice(-MAX_TAIL_CONTENT_CHARS) : content
    }
  }

  function queueTailContent(data) {
    pendingTailContent += String(data || '')
    if (!pendingTailFrame) pendingTailFrame = window.requestAnimationFrame(flushPendingTailContent)
  }

  const {
    dockerContainers,
    dockerProcesses,
    dockerProcessViewer,
    dockerProcessLoading,
    dockerLoading,
    dockerLogViewer,
    dockerUseSudo,
    dockerLogLines,
    dockerStatusMessage,
    resetDockerState,
    dockerStatusClass,
    isDockerRunning,
    loadDockerContainers,
    loadDockerProcesses,
    readDockerLogs,
    runDockerAction,
    handleDockerMenuCommand
  } = useDockerManager({
    connected,
    sessionId,
    ensureSshFeature,
    message,
    reportError
  })

  const {
    systemUsersOverview,
    systemUserLoading,
    systemUserKeyword,
    systemUserFilter,
    systemUserDialog,
    filteredSystemUsers,
    resetSystemUsersState,
    loadSystemUsers,
    openCreateSystemUserDialog,
    openEditSystemUserDialog,
    submitSystemUserDialog,
    renameSystemUserAccount,
    changeSystemUserPassword,
    toggleSystemUserLock,
    removeSystemUser,
    handleSystemUserMenuCommand
  } = useSystemUsersManager({
    createSystemUserForm,
    connected,
    sessionId,
    ensureSshFeature,
    reportError,
    message,
    ensureBridgeMethod
  })

  const {
    nginxSites,
    sslDomain,
    selectedNginxSitePath,
    selectedNginxSiteEditor,
    resetNginxState,
    loadNginxSites,
    selectNginxSite,
    updateSelectedNginxCode,
    parseSelectedNginxCode,
    saveSelectedNginxSite,
    saveAndRunNginxAction,
    runNginxAction,
    openSelectedNginxSiteInEditor
  } = useNginxManager({
    connected,
    sessionId,
    ensureSshFeature,
    message,
    openEditor
  })

  const {
    services,
    serviceLoading,
    resetServicesState,
    serviceStatusLabel,
    serviceStatusHint,
    serviceStatusClass,
    loadServices,
    runServiceAction,
    handleServiceMenuCommand
  } = useServicesManager({
    connected,
    sessionId,
    ensureSshFeature,
    message
  })

  function logRemotePerf(stage, payload = {}) {
    console.info(`[remote-perf][renderer] ${stage}`, payload)
  }

  const filteredTerminalCommandReferences = computed(() => {
    const keyword = normalizeTerminalCommandSearch(terminalCommandKeyword.value)
    const scope = terminalCommandScope.value

    if (!keyword && scope === 'all') return terminalCommandReferences

    return terminalCommandReferences.flatMap(category => {
      if (!isTerminalCommandCategory(category)) return []

      if (scope !== 'all' && category.scope !== scope) return []

      if (!keyword) {
        return [{ ...category, children: [...category.children] }]
      }

      const categoryMatched = matchTerminalCommandKeyword(keyword, category.title, category.description)
      const matchedChildren = category.children.filter(item => matchTerminalCommandKeyword(keyword, item.command, item.title, item.description, item.example, ...(item.keywords || [])))

      if (categoryMatched) {
        return [{ ...category, children: [...category.children] }]
      }

      if (!matchedChildren.length) return []

      return [{ ...category, children: matchedChildren }]
    })
  })

  const visibleTerminalCommandRows = computed(() => filteredTerminalCommandReferences.value.flatMap(category => {
    if (!isTerminalCommandCategory(category)) return [category]

    const categoryRow = {
      type: category.type,
      id: category.id,
      scope: category.scope,
      title: category.title,
      description: category.description,
      risks: category.risks,
      childCount: category.children.length
    }

    const shouldExpand = terminalCommandKeyword.value.trim() || terminalCommandScope.value !== 'all' ? true : isTerminalCommandExpanded(category.id)
    return shouldExpand ? [categoryRow, ...category.children] : [categoryRow]
  }))
  const transferProgressLabel = computed(() => {
    if (!transferState.value.total) return '正在准备传输...'
    return `正在处理 ${transferState.value.current}/${transferState.value.total}`
  })
  const tableTooltipOptions = Object.freeze({ showAfter: 650, hideAfter: 0 })
  const databaseTableTooltipOptions = tableTooltipOptions
  const databaseSqlResultPageRows = computed(() => {
    const page = Math.max(1, Number(databaseSqlResult.value.page || 1))
    const pageSize = Math.max(1, Number(databaseSqlResult.value.pageSize || 50))
    const start = (page - 1) * pageSize
    return (databaseSqlResult.value.rows || []).slice(start, start + pageSize)
  })

  const databasePageBindings = computed(() => ({
    connected: connected.value,
    isSSHSession: isSSHSession.value,
    sessionId: sessionId.value,
    databaseLoginVisible: databaseLoginVisible.value,
    databaseForm: databaseForm.value,
    handleDatabaseTypeChange,
    databaseConnecting: databaseConnecting.value,
    databaseLoginMode: databaseLoginMode.value,
    submitDatabaseLoginDialog,
    databaseRowDialog: databaseRowDialog.value,
    closeDatabaseRowDialog,
    submitDatabaseRowDialog,
    databaseColumnDialog: databaseColumnDialog.value,
    queryDatabaseColumnTypeSuggestions,
    databaseTypeSupportsCollation,
    queryDatabaseColumnCollationSuggestions,
    queryDatabaseColumnDefaultValueSuggestions,
    databaseSchema: databaseSchema.value,
    databaseTypeSupportsAutoIncrement,
    databaseTypeSupportsOnUpdateCurrentTimestamp,
    closeDatabaseColumnDialog,
    submitDatabaseColumnDialog,
    databaseConnected: databaseConnected.value,
    databaseConnectionLabel: databaseConnectionLabel.value,
    databaseLoading: databaseLoading.value,
    refreshDatabaseBrowser,
    databasePreview: databasePreview.value,
    reloadDatabasePreview,
    openDatabaseLogin,
    disconnectDatabase,
    databaseLayoutStyle: databaseLayoutStyle.value,
    databaseDatabases: databaseDatabases.value,
    createDatabase,
    importDatabaseSqlToDatabase,
    databaseActiveDatabase: databaseActiveDatabase.value,
    toggleDatabaseTree,
    showNativeContextMenu,
    isDatabaseExpanded,
    isDatabaseTreeLoading,
    databaseTablesByDatabase: databaseTablesByDatabase.value,
    openDatabaseTreeTable,
    databaseContentTab: databaseContentTab.value,
    databaseResultSummary: databaseResultSummary.value,
    databaseDataTab: databaseDataTab.value,
    switchDatabaseDataTab,
    databaseResult: databaseResult.value,
    databaseInlineEdit: databaseInlineEdit.value,
    selectedDatabaseResultRow: selectedDatabaseResultRow.value,
    tableTooltipOptions,
    databaseResultRowClassName,
    showDatabaseResultContextMenu,
    handleDatabaseResultCellDblClick,
    queryDatabaseInlineEditSuggestions,
    getDatabaseInlineEditSuggestionItems,
    handleDatabaseInlineEditSuggestionSelect,
    handleDatabaseInlineEditFieldInput,
    getDatabaseInlineEditFieldCategory,
    getDatabaseInlineEditControlType,
    getDatabaseInlineEditInputType,
    getDatabaseInlineEditEditorValue,
    shouldUseDatabaseInlineSuggestions,
    getDatabaseInlineEditSelectOptions,
    getDatabaseInlineEditSelectValue,
    handleDatabaseInlineEditSelectChange,
    isDatabaseInlineEditRow,
    isDatabaseInlineEditFieldActive,
    getDatabaseInlineEditFieldValue,
    isDatabaseInlineEditFieldNull,
    setDatabaseInlineEditFieldNull,
    activateDatabaseInlineEditField,
    shouldUseDatabaseInlineTextarea,
    isDatabaseInlineEditFieldReadOnly,
    isDatabaseInlineEditFieldNullable,
    saveDatabaseInlineEdit,
    cancelDatabaseInlineEdit,
    handleDatabaseResultCellClick,
    databaseTableTooltipOptions,
    databaseSchemaPageRows: databaseSchemaPageRows.value,
    databaseSchemaRowClassName,
    selectedDatabaseSchemaRow: selectedDatabaseSchemaRow.value,
    showDatabaseSchemaContextMenu,
    databaseHasActiveTable: databaseHasActiveTable.value,
    canCreateDatabaseRows: canCreateDatabaseRows.value,
    openCreateDatabaseRowDialog,
    deleteDatabasePreviewRow,
    canCreateDatabaseColumns: canCreateDatabaseColumns.value,
    openCreateDatabaseColumnDialog,
    deleteDatabaseSchemaColumn,
    saveDatabaseSchemaInlineColumn,
    reloadDatabaseSchema: (options = {}) => {
      if (!databaseSchema.value.database || !databaseSchema.value.table) return Promise.resolve()
      return loadDatabaseTableSchema(databaseSchema.value.database, databaseSchema.value.table, options)
    },
    handleDatabasePageSizeChange,
    handleDatabasePageChange,
    databaseSqlResult: databaseSqlResult.value,
    databaseSqlResultPageRows: databaseSqlResultPageRows.value,
    databaseSqlResultRowClassName,
    handleDatabaseSqlTableCellDblClick,
    handleDatabaseSqlResultPageSizeChange,
    handleDatabaseSqlResultPageChange,
    databaseSqlOverflowRecords: databaseSqlOverflowRecords.value,
    isActiveDatabaseSqlHistory,
    getDatabaseSqlRecordLabel,
    activateDatabaseSqlHistory,
    removeDatabaseSqlHistory,
    databaseSqlVisibleRecords: databaseSqlVisibleRecords.value,
    appendDatabaseSqlHistory,
    runDatabaseSql,
    setDatabaseSqlMonacoRef,
    canAccessAppDatabase: import.meta.env.DEV,
    startCreateDatabaseConnection,
    databaseSavedConnections: databaseSavedConnections.value,
    connectSavedDatabaseConnectionDirect,
    editSavedDatabaseConnection,
    removeSavedDatabaseConnection,
    startDatabaseTreeResize
  }))
  const DATABASE_DEFAULT_NONE_LABEL = '无默认值'
  const DATABASE_DEFAULT_NULL_LABEL = 'NULL'
  const DATABASE_DEFAULT_EMPTY_STRING_LABEL = "'' (空字符串)"
  const databaseColumnTypeOptions = computed(() => {
    const base = currentDatabaseEngine.value === 'mariadb'
      ? ['varchar(255)', 'char(36)', 'text', 'longtext', 'int', 'bigint', 'tinyint(1)', 'decimal(10,2)', 'datetime', 'timestamp', 'date', 'json']
      : ['varchar(255)', 'char(36)', 'text', 'longtext', 'int', 'bigint', 'tinyint(1)', 'decimal(10,2)', 'datetime', 'timestamp', 'date', 'json']
    return buildDatabaseQuickSelectOptions(base)
  })
  const databaseColumnCollationOptions = computed(() => {
    const common = currentDatabaseEngine.value === 'mariadb'
      ? ['utf8mb4_general_ci', 'utf8mb4_unicode_ci', 'utf8mb4_bin', 'utf8mb3_general_ci', 'latin1_swedish_ci']
      : ['utf8mb4_0900_ai_ci', 'utf8mb4_general_ci', 'utf8mb4_unicode_ci', 'utf8mb4_bin', 'utf8mb3_general_ci', 'latin1_swedish_ci']
    const existing = (databaseSchema.value.fieldMeta || []).map(item => String(item.collation || '').trim()).filter(Boolean)
    return buildDatabaseQuickSelectOptions([...existing, ...common])
  })
  const databaseColumnDefaultValueOptions = computed(() => {
    const type = String(databaseColumnDialog.value.form.type || '').trim().toLowerCase()
    const options = [
      createDatabaseQuickSelectOption(DATABASE_DEFAULT_NONE_LABEL, DATABASE_DEFAULT_NONE_LABEL),
      createDatabaseQuickSelectOption(DATABASE_DEFAULT_NULL_LABEL, DATABASE_DEFAULT_NULL_LABEL)
    ]
    if (/\b(json)\b/.test(type)) options.push(createDatabaseQuickSelectOption('{}'), createDatabaseQuickSelectOption('[]'))
    if (/\b(timestamp|datetime)\b/.test(type)) options.push(createDatabaseQuickSelectOption('CURRENT_TIMESTAMP'))
    if (/\bdate\b/.test(type) && !/\b(datetime|timestamp)\b/.test(type)) options.push(createDatabaseQuickSelectOption('CURRENT_DATE'))
    if (/\b(time)\b/.test(type) && !/\b(datetime|timestamp)\b/.test(type)) options.push(createDatabaseQuickSelectOption('CURRENT_TIME'))
    if (/\b(decimal|numeric|float|double|real)\b/.test(type)) options.push(createDatabaseQuickSelectOption('0'), createDatabaseQuickSelectOption('0.00'))
    if (/\b(tinyint|smallint|mediumint|int|integer|bigint)\b/.test(type)) options.push(createDatabaseQuickSelectOption('0'), createDatabaseQuickSelectOption('1'))
    if (/\b(char|varchar|text|tinytext|mediumtext|longtext|enum|set)\b/.test(type)) {
      options.push(createDatabaseQuickSelectOption(DATABASE_DEFAULT_EMPTY_STRING_LABEL, DATABASE_DEFAULT_EMPTY_STRING_LABEL))
      options.push(createDatabaseQuickSelectOption('guest'))
      options.push(createDatabaseQuickSelectOption('unknown'))
    }
    const currentValue = String(databaseColumnDialog.value.form.defaultInput || '')
    if (currentValue) {
      options.unshift(createDatabaseQuickSelectOption(currentValue, currentValue))
    }
    return dedupeDatabaseQuickSelectOptions(options)
  })
  const selectedDatabaseSchemaFieldMeta = computed(() => {
    const name = String(selectedDatabaseSchemaRow.value?.Field || '').trim()
    if (!name) return null
    return (databaseSchema.value.fieldMeta || []).find(item => item.name === name) || null
  })

  function normalizeDatabaseFieldInputValue(value) {
    if (value === null || value === undefined) return ''
    return String(value)
  }

  function normalizeDatabaseComparableValue(value) {
    return value === null || value === undefined ? null : String(value)
  }

  function getDatabaseColumnDefaultMode(fieldMeta = null) {
    if (!fieldMeta) return 'none'
    if (fieldMeta.defaultValue === null || fieldMeta.defaultValue === undefined) return 'none'
    return 'value'
  }

  function formatDatabaseColumnDefaultInput(fieldMeta = null) {
    const mode = getDatabaseColumnDefaultMode(fieldMeta)
    if (mode === 'none') return DATABASE_DEFAULT_NONE_LABEL
    if (fieldMeta?.defaultValue === null) return DATABASE_DEFAULT_NULL_LABEL
    const value = fieldMeta?.defaultValue === '' ? DATABASE_DEFAULT_EMPTY_STRING_LABEL : String(fieldMeta?.defaultValue ?? '')
    return value || DATABASE_DEFAULT_NONE_LABEL
  }

  function normalizeDatabaseColumnDefaultPayload(inputValue = '') {
    const text = String(inputValue || '').trim()
    if (!text || text === DATABASE_DEFAULT_NONE_LABEL) {
      return { defaultMode: 'none', defaultValue: '' }
    }
    if (text === DATABASE_DEFAULT_NULL_LABEL) {
      return { defaultMode: 'null', defaultValue: '' }
    }
    if (text === DATABASE_DEFAULT_EMPTY_STRING_LABEL) {
      return { defaultMode: 'value', defaultValue: '' }
    }
    return { defaultMode: 'value', defaultValue: text }
  }

  function isDatabaseFieldMultiline(type = '', value = '') {
    const normalizedType = String(type || '').toLowerCase()
    const text = String(value || '')
    return /\b(text|json|longtext|mediumtext|tinytext)\b/.test(normalizedType) || text.includes('\n') || text.length > 120
  }

  function databaseTypeSupportsCollation(type = '') {
    return /\b(char|varchar|text|tinytext|mediumtext|longtext|enum|set|json)\b/i.test(String(type || ''))
  }

  function databaseTypeSupportsAutoIncrement(type = '') {
    return /\b(tinyint|smallint|mediumint|int|integer|bigint)\b/i.test(String(type || ''))
  }

  function databaseTypeSupportsOnUpdateCurrentTimestamp(type = '') {
    return /\b(timestamp|datetime)\b/i.test(String(type || ''))
  }

  function createDatabaseQuickSelectOption(value, label = '') {
    const text = String(value ?? '')
    return {
      value: text,
      label: label || (text === '' ? '空字符串' : text)
    }
  }

  function dedupeDatabaseQuickSelectOptions(options = []) {
    const seen = new Set()
    const list = []
    for (const item of options) {
      const value = String(item?.value ?? '')
      if (seen.has(value)) continue
      seen.add(value)
      list.push({ value, label: String(item?.label || (value === '' ? '空字符串' : value)) })
    }
    return list
  }

  function buildDatabaseQuickSelectOptions(values = []) {
    return dedupeDatabaseQuickSelectOptions((Array.isArray(values) ? values : []).map(value => createDatabaseQuickSelectOption(value)))
  }

  function createDatabaseAutocompleteSuggestions(queryString = '', options = []) {
    const keyword = String(queryString || '').trim().toLowerCase()
    const list = Array.isArray(options) ? options : []
    if (!keyword) return list.slice(0, 60)
    return list.filter(item => {
      const value = String(item?.value ?? '').toLowerCase()
      const label = String(item?.label || '').toLowerCase()
      return value.includes(keyword) || label.includes(keyword)
    }).slice(0, 60)
  }

  function queryDatabaseColumnTypeSuggestions(queryString, callback) {
    callback(createDatabaseAutocompleteSuggestions(queryString, databaseColumnTypeOptions.value))
  }

  function queryDatabaseColumnCollationSuggestions(queryString, callback) {
    callback(createDatabaseAutocompleteSuggestions(queryString, databaseColumnCollationOptions.value))
  }

  function queryDatabaseColumnDefaultValueSuggestions(queryString, callback) {
    callback(createDatabaseAutocompleteSuggestions(queryString, databaseColumnDefaultValueOptions.value))
  }


  function buildDatabaseIdentityLabel(identityKey, row = null) {
    if (!identityKey?.columns?.length) return '当前表未识别到主键或唯一键，暂不支持编辑或删除。'
    const values = identityKey.columns.map(column => {
      const value = row?.[column]
      if (value === null || value === undefined || value === '') return `${column}=NULL`
      return `${column}=${String(value)}`
    })
    const keyType = identityKey.kind === 'primary' ? '主键' : '唯一键'
    return `将按${keyType} ${identityKey.name}（${values.join('，')}）定位这一行。`
  }

  function buildDatabaseRowIdentityValues(identityKey, row = null) {
    const values = {}
    for (const column of identityKey?.columns || []) {
      values[column] = row?.[column] ?? null
    }
    return values
  }

  function buildDatabaseRowDialogFields(row, fieldMeta = [], identityKey = null) {
    const identityColumns = new Set(identityKey?.columns || [])
    return (Array.isArray(fieldMeta) ? fieldMeta : []).map(item => {
      const currentValue = row?.[item.name] ?? null
      const identity = identityColumns.has(item.name)
      const readOnly = identity || item.readOnly === true
      return {
        name: item.name,
        label: item.name,
        type: item.type || '',
        nullable: item.nullable === true,
        readOnly,
        identity,
        multiline: isDatabaseFieldMultiline(item.type, currentValue),
        originalValue: currentValue,
        useNull: currentValue === null,
        value: normalizeDatabaseFieldInputValue(currentValue)
      }
    })
  }

  function getDatabaseSchemaFieldMeta(row = null) {
    const name = String(row?.Field || '').trim()
    if (!name) return null
    return (databaseSchema.value.fieldMeta || []).find(item => item.name === name) || null
  }

  async function fetchDatabaseTableSchemaResult(databaseName, tableName) {
    ensureBridgeMethod('describeDatabaseTable')
    return window.whSSH.describeDatabaseTable({
      id: databaseConnectionId.value,
      database: databaseName,
      table: tableName
    })
  }

  function applyDatabaseSchemaResult(result, databaseName, tableName, options = {}) {
    databaseSchema.value = createDatabaseSchemaState({
      database: databaseName,
      table: tableName,
      columns: result.columns || [],
      rows: result.rows || [],
      fieldMeta: result.fieldMeta || [],
      identityKey: result.identityKey || null,
      canMutateRows: result.canMutateRows === true,
      total: (result.rows || []).length,
      page: options.keepPage ? databaseSchema.value.page || 1 : 1,
      pageSize: databaseSchema.value.pageSize || 50,
      durationMs: result.durationMs || 0,
      message: result.message || ''
    })
  }

  function maskIpText(value = '') {
    const normalized = String(value || '').trim()
    if (!normalized) return '-'

    let masked = normalized.replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, '**.**.**.**')
    masked = masked.replace(/\b(?:[a-fA-F0-9]{0,4}:){2,}[a-fA-F0-9]{0,4}\b/g, '****:****:****:****')

    if (masked !== normalized) return masked
    if (normalized.includes('.')) return '**.**.**.**'
    if (normalized.includes(':')) return '****:****:****:****'
    return '***'
  }

  function formatSensitiveIp(value = '', visible = false) {
    const normalized = String(value || '').trim()
    if (!normalized) return '-'
    return visible ? normalized : maskIpText(normalized)
  }

  function toggleHeaderIpVisible() {
    headerIpVisible.value = !headerIpVisible.value
  }

  function toggleListeningAddressVisibility() {
    listeningAddressVisible.value = !listeningAddressVisible.value
    persistPortsPreferences()
  }

  function escapeDatabaseIdentifier(value = '') {
    return '`' + String(value || '').replace(/`/g, '``') + '`'
  }

  function databaseResultRowClassName({ row }) {
    const classes = []
    if (row === selectedDatabaseResultRow.value) classes.push('selected-row')
    return classes.join(' ')
  }

  function databaseSchemaRowClassName({ row }) {
    return row === selectedDatabaseSchemaRow.value ? 'selected-row' : ''
  }

  function databaseSqlResultRowClassName({ row }) {
    return row === selectedDatabaseSqlRow.value ? 'selected-row' : ''
  }

  const accountsPageBindings = computed(() => ({
    accountKeyword: accountKeyword.value,
    accountProtocolFilter: accountProtocolFilter.value,
    managedConnections: managedConnections.value,
    tableTooltipOptions,
    formatTime,
    connecting: connecting.value,
    loadConnections,
    openNewConnection,
    isManagedConnectionActive,
    toggleSavedConnection,
    editConnection,
    applyConnectionToLogin,
    removeConnection
  }))

  const servicesPageBindings = computed(() => ({
    connected: connected.value,
    isSSHSession: isSSHSession.value,
    loadServices,
    serviceLoading: serviceLoading.value,
    services: services.value,
    tableTooltipOptions,
    serviceStatusClass,
    serviceStatusLabel,
    serviceStatusHint,
    handleServiceMenuCommand
  }))

  const systemUsersPageBindings = computed(() => ({
    connected: connected.value,
    isSSHSession: isSSHSession.value,
    systemUsersOverview: systemUsersOverview.value,
    systemUserLoading: systemUserLoading.value,
    loadSystemUsers,
    openCreateSystemUserDialog,
    systemUserKeyword: systemUserKeyword.value,
    systemUserFilter: systemUserFilter.value,
    filteredSystemUsers: filteredSystemUsers.value,
    tableTooltipOptions,
    handleSystemUserMenuCommand
  }))

  const firewallRules = computed(() => firewallOverview.value.rules || [])
  const firewallDiagnosticItems = computed(() => firewallOverview.value.diagnostics?.firewallLayers || [])
  const buildFirewallLayerRules = layers => layers.flatMap(layer => (Array.isArray(layer.rules) ? layer.rules : []).map(rule => ({
    ...rule,
    backend: rule.backend || layer.key,
    layerKey: layer.key,
    layerLabel: layer.label,
    layerActive: !!layer.active,
    layerDetected: !!layer.detected
  })))
  const getFirewallDedupeKey = rule => [
    firewallRuleDirection(rule),
    rule.target || '',
    rule.port || '',
    rule.protocol || '',
    rule.action || '',
    rule.source || '',
    rule.destination || rule.targetAddress || '',
    rule.family || '',
    rule.service || '',
    rule.scope || ''
  ].map(item => String(item).trim().toLowerCase()).join('|')
  const dedupeFirewallRules = rules => {
    const groups = new Map()
    for (const rule of Array.isArray(rules) ? rules : []) {
      const key = getFirewallDedupeKey(rule)
      const backend = String(rule.backend || rule.layerKey || '').trim()
      const current = groups.get(key)
      if (current) {
        current.duplicateRules.push(rule)
        current.duplicateCount = current.duplicateRules.length
        if (backend && !current.duplicateBackends.includes(backend)) current.duplicateBackends.push(backend)
        continue
      }
      groups.set(key, {
        ...rule,
        duplicateBackends: backend ? [backend] : [],
        duplicateRules: [rule],
        duplicateCount: 1
      })
    }
    return Array.from(groups.values())
  }
  const getFirewallLayerByKey = (key, options = {}) => {
    const normalized = String(key || '').trim().toLowerCase()
    const layers = Array.isArray(firewallDiagnosticItems.value) ? firewallDiagnosticItems.value : []
    return layers.find(layer => layer.key === normalized && layer.detected && (options.activeOnly !== true || layer.active)) || null
  }
  const effectiveFirewallLayers = computed(() => {
    const userPreferredLayer = getFirewallLayerByKey(firewallUserPreferredBackend.value, { activeOnly: true })
    if (userPreferredLayer) return [userPreferredLayer]
    const recommendedLayer = getFirewallLayerByKey(firewallOverview.value.recommendedBackend || firewallOverview.value.backend)
    return recommendedLayer ? [recommendedLayer] : []
  })
  const effectiveFirewallRules = computed(() => {
    const sourceRules = effectiveFirewallLayers.value.length ? buildFirewallLayerRules(effectiveFirewallLayers.value) : firewallRules.value
    return dedupeFirewallRules(sourceRules)
  })
  const firewallAllowedRules = computed(() => effectiveFirewallRules.value.filter(rule => rule.action === 'allow' && firewallRuleDirection(rule) !== 'outbound'))
  const inboundFirewallRules = computed(() => effectiveFirewallRules.value.filter(rule => firewallRuleDirection(rule) !== 'outbound'))
  const outboundFirewallRules = computed(() => effectiveFirewallRules.value.filter(rule => firewallRuleDirection(rule) === 'outbound'))
  const firewallManageSupported = computed(() => firewallOverview.value.manageable === true)
  const dockerPublishedPorts = computed(() => firewallOverview.value.diagnostics?.docker?.publishedPorts || [])
  const listeningPorts = computed(() => firewallOverview.value.diagnostics?.listening?.items || [])
  const firewallBackendLabel = computed(() => {
    if (firewallOverview.value.backend === 'ufw') return '后端：UFW'
    if (firewallOverview.value.backend === 'firewalld') return '后端：firewalld'
    if (firewallOverview.value.backend === 'iptables') return '后端：iptables'
    if (firewallOverview.value.backend === 'nftables') return '后端：nftables'
    if (firewallOverview.value.backend === 'none') return '未检测到防火墙'
    return '后端未读取'
  })

  const portsPageBindings = computed(() => ({
    connected: connected.value,
    isSSHSession: isSSHSession.value,
    firewallLoading: firewallLoading.value,
    loadFirewallOverview,
    firewallOverview: firewallOverview.value,
    listeningPorts: listeningPorts.value,
    tableTooltipOptions,
    listeningAddressVisible: listeningAddressVisible.value,
    toggleListeningAddressVisibility,
    formatSensitiveIp,
    firewallForm: firewallForm.value,
    firewallManageSupported: firewallManageSupported.value,
    openFirewallRuleFromPort,
    firewallAllowedRules: firewallAllowedRules.value,
    firewallRulePrimaryLabel,
    firewallRuleSecondaryLabel,
    firewallSourceLabel,
    firewallRuleKindLabel,
    firewallRuleScopeLabel,
    handleFirewallMenuCommand,
    canManageFirewallRule,
    dockerPublishedPorts: dockerPublishedPorts.value
  }))

  const firewallPageBindings = computed(() => ({
    connected: connected.value,
    isSSHSession: isSSHSession.value,
    firewallLoading: firewallLoading.value,
    loadFirewallOverview,
    firewallOverview: firewallOverview.value,
    firewallBackendLabel: firewallBackendLabel.value,
    firewallForm: firewallForm.value,
    firewallRuleDialogRequest: firewallRuleDialogRequest.value,
    firewallPreferredBackend: firewallPreferredBackend.value,
    firewallUserPreferredBackend: firewallUserPreferredBackend.value,
    firewallManageSupported: firewallManageSupported.value,
    createFirewallRule,
    updateFirewallRule,
    deleteFirewallRule: removeFirewallRule,
    setFirewallPreferredBackend,
    enableFirewallBackend,
    disableFirewallBackend,
    firewallDiagnosticItems: firewallDiagnosticItems.value,
    firewallRules: firewallRules.value,
    effectiveFirewallRules: effectiveFirewallRules.value,
    effectiveFirewallLayers: effectiveFirewallLayers.value,
    inboundFirewallRules: inboundFirewallRules.value,
    outboundFirewallRules: outboundFirewallRules.value,
    firewallAllowedRules: firewallAllowedRules.value,
    listeningPorts: listeningPorts.value,
    tableTooltipOptions,
    firewallRulePrimaryLabel,
    firewallRuleSecondaryLabel,
    firewallSourceLabel,
    firewallDestinationLabel,
    firewallPeerLabel,
    firewallDirectionLabel,
    firewallRuleKindLabel,
    firewallRuleScopeLabel,
    handleFirewallMenuCommand,
    canManageFirewallRule,
    canEditFirewallRule
  }))

  const nginxPageBindings = computed(() => ({
    connected: connected.value,
    sessionId: sessionId.value,
    isSSHSession: isSSHSession.value,
    loadNginxSites,
    selectNginxSite,
    updateSelectedNginxCode,
    parseSelectedNginxCode,
    saveSelectedNginxSite,
    saveAndRunNginxAction,
    runNginxAction,
    openSelectedNginxSiteInEditor,
    sslDomain: sslDomain.value,
    nginxSites: nginxSites.value,
    selectedNginxSitePath: selectedNginxSitePath.value,
    selectedNginxSiteEditor: selectedNginxSiteEditor.value,
    tableTooltipOptions,
    getRemoteParentPath,
    formatSize
  }))

  const dockerPageBindings = computed(() => ({
    connected: connected.value,
    isSSHSession: isSSHSession.value,
    dockerUseSudo: dockerUseSudo.value,
    dockerLogLines: dockerLogLines.value,
    loadDockerContainers,
    dockerLoading: dockerLoading.value,
    dockerStatusMessage: dockerStatusMessage.value,
    dockerContainers: dockerContainers.value,
    tableTooltipOptions,
    dockerStatusClass,
    handleDockerMenuCommand,
    isDockerRunning,
    dockerProcessLoading: dockerProcessLoading.value
  }))

  const logsPageBindings = computed(() => ({
    connected: connected.value,
    isSSHSession: isSSHSession.value,
    logLines: logLines.value,
    loadLogFiles,
    logFilesLoading: logFilesLoading.value,
    customLogPath: customLogPath.value,
    openCustomLogPath,
    logKeyword: logKeyword.value,
    filteredLogFiles: filteredLogFiles.value,
    tableTooltipOptions,
    selectLogFile,
    openLogFile,
    formatSize,
    handleLogMenuCommand,
    deleteServerLog,
    showNativeContextMenu,
    tailing: tailing.value,
    tailPath: tailPath.value,
    selectedLogFile: selectedLogFile.value,
    serverLogContents: serverLogContents.value,
    serverLogLoadingPaths: serverLogLoadingPaths.value,
    readServerLogInline,
    applicationLogs: applicationLogs.value,
    filteredApplicationLogs: filteredApplicationLogs.value,
    applicationLogKeyword: applicationLogKeyword.value,
    applicationLogLoading: applicationLogLoading.value,
    applicationLogInfo: applicationLogInfo.value,
    loadApplicationLogs,
    clearApplicationLogs,
    deleteApplicationLogEntry
  }))

  const localPathLabel = computed(() => {
    const base = localPath.value === '__pc__' ? '此电脑' : localPath.value
    return localSearchActive.value ? `${base} · 递归搜索：${localSearchKeyword.value}` : base
  })
  const remotePathLabel = computed(() => (remoteSearchActive.value ? `${remotePath.value} · 递归搜索：${remoteSearchKeyword.value}` : remotePath.value))
  const filesPageBindings = computed(() => ({
    filePanelStyle: filePanelStyle.value,
    localDropActive: localDropActive.value,
    handleLocalPaneMouseDown,
    onLocalPanelDragOver,
    onLocalPanelDragEnter,
    onLocalPanelDragLeave,
    onLocalPanelDrop,
    showLocalPanelContextMenu,
    openLocalInExplorer,
    localPathInput: localPathInput.value,
    navigateLocalPath,
    resetLocalPathInput,
    localSearchKeyword: localSearchKeyword.value,
    handleLocalSearchInput,
     clearLocalSearch,
     localGlobalSearch: localGlobalSearch,
     openLocalGlobalSearch: () => setGlobalSearchOpen('local', true),
     setLocalGlobalSearchOpen: value => setGlobalSearchOpen('local', value),
      scheduleGlobalSearch,
      runGlobalSearch,
      clearGlobalSearch,
     openLocalGlobalSearchResult,
    localSearchActive: localSearchActive.value,
    localBreadcrumbs: localBreadcrumbs.value,
    isLocalBreadcrumbActive,
    openLocalShortcut,
    localShortcutsCollapsed: localShortcutsCollapsed.value,
    localPath: localPath.value,
    loadLocalRoots,
    localPinnedRoots: localPinnedRoots.value,
    isLocalShortcutActive,
    localDriveRoots: localDriveRoots.value,
    setLocalTableRef,
    localTableFiles: localTableFiles.value,
    fileSearchState,
    cancelLocalSearch,
    localRowClassName,
    handleLocalRowClick,
    openLocalFile,
    showLocalContextMenu,
    showLocalDriveContextMenu,
    onLocalDragStart,
    onDragEnd,
    onLocalRowDragEnter,
    onLocalRowDragLeave,
    onLocalRowDragOver,
    onLocalRowDrop,
    getFileIconClass,
    isVideoFile,
    isImageFile,
    isAudioFile,
    isArchiveFile,
    isCodeFile,
    formatSize,
    formatTime,
    getLocalItemDirectory,
    startResize,
    remoteDropActive: remoteDropActive.value,
    handleRemotePaneMouseDown,
    onRemotePanelDragOver,
    onRemotePanelDragEnter,
    onRemotePanelDragLeave,
    onRemotePanelDrop,
    showRemotePanelContextMenu,
    remotePathInput: remotePathInput.value,
    navigateRemotePath,
    resetRemotePathInput,
    remoteSearchKeyword: remoteSearchKeyword.value,
    handleRemoteSearchInput,
     clearRemoteSearch,
     remoteGlobalSearch: remoteGlobalSearch,
     openRemoteGlobalSearch: () => setGlobalSearchOpen('remote', true),
     setRemoteGlobalSearchOpen: value => setGlobalSearchOpen('remote', value),
      scheduleGlobalSearch,
      runGlobalSearch,
      clearGlobalSearch,
     openRemoteGlobalSearchResult,
    remoteSearchActive: remoteSearchActive.value,
    remoteBreadcrumbs: remoteBreadcrumbs.value,
    isRemoteBreadcrumbActive,
    openRemoteShortcut,
    remoteShortcutsCollapsed: remoteShortcutsCollapsed.value,
    connected: connected.value,
    remotePinnedRoots: remotePinnedRoots.value,
    getRemoteShortcutButtonClass,
    showRemoteShortcutContextMenu,
    onRemoteShortcutDragStart,
    onRemoteShortcutDragOver,
    onRemoteShortcutDrop,
    onRemoteShortcutDragEnd,
    mediaPreview: mediaPreview.value,
    setRemoteTableRef,
    remoteTableFiles: remoteTableFiles.value,
    cancelRemoteSearch,
    remoteRowClassName,
    handleRemoteRowClick,
    openRemoteFile,
    showRemoteContextMenu,
    onRemoteDragStart,
    onRemoteRowDragEnter,
    onRemoteRowDragLeave,
    onRemoteRowDragOver,
     onRemoteRowDrop,
     formatTime,
    getRemoteItemDirectory,
    editor: editor.value,
    openEditorFind,
    openEditorReplace,
    handleEditorEncodingCommand,
    EDITOR_ENCODING_OPTIONS,
    reloadEditorWithEncoding,
    saveEditor,
    copyEditorPath,
    closeEditor,
    editorTabs: editorTabs.value,
    activateEditorTab,
    getFileBaseName,
    closeEditorTab,
    setEditorMonacoRef,
    editorHasUnsavedChanges: editorHasUnsavedChanges.value,
    getEditorFileTypeLabel,
    getEditorEncodingLabel,
    imagePreview: imagePreview.value,
    closeImagePreview,
    zoomImagePreview,
    rotateImagePreview,
    resetImagePreviewTransform,
    handleImagePreviewWheel,
    startImagePreviewDrag,
    imagePreviewTransformStyle: imagePreviewTransformStyle.value,
    normalizeImagePreviewRotation,
    closeMediaPreview,
    mediaPreviewStatusTitle: mediaPreviewStatusTitle.value,
    setMediaPreviewPlayerRef,
    handleMediaPreviewCanPlay,
    handleMediaPreviewError
  }))
  function getContextActions(menuType, row = null) {
    const fileItems = getFileContextActions(menuType, row)
    if (fileItems !== null) return fileItems
    if (menuType === 'server-log') {
      if (!row?.path) return []
      return [
        { key: 'view-server-log', label: '查看内容' },
        { key: 'tail-server-log', label: tailing.value && tailPath.value === row.path ? '停止跟随' : '实时跟随' },
        { type: 'separator' },
        { key: 'delete-server-log', label: '删除日志文件' }
      ]
    }
    if (menuType === 'database-root') {
      return [
        { key: 'create-database', label: '新建数据库' },
        { key: 'import-database-sql', label: '导入数据库' },
        { key: 'refresh-database-browser', label: '刷新数据库列表' }
      ]
    }
    if (menuType === 'database-db') {
      if (!row?.name) return []
      return [
        { key: 'create-database', label: '新建数据库' },
        { type: 'separator' },
        { key: 'expand-database-tree', label: isDatabaseExpanded(row.name) ? '折叠' : '展开' },
        { key: 'refresh-database-tree', label: '刷新' },
        { key: 'export-database-sql', label: `导出该数据库` },
        { key: 'export-database-tables', label: '导出该库数据表' },
        { key: 'import-database-table-sql', label: '导入数据表' },
        { key: 'delete-database-tree', label: '删除' }
      ]
    }
    if (menuType === 'database-table') {
      if (!row?.database || !row?.name) return []
      return [
        { key: 'open-database-table', label: '打开' },
        { key: 'refresh-database-table', label: '刷新' },
        { key: 'delete-database-table', label: '删除' },
        { key: 'export-database-table-sql', label: '导出数据表', enabled: row.type !== 'view' }
      ]
    }
    if (menuType === 'database-row') {
      return [
        { key: 'edit-database-row', label: '编辑当前行', enabled: canEditDatabaseRows.value },
        { key: 'delete-database-row', label: '删除当前行', enabled: canMutateDatabaseRows.value }
      ]
    }
    if (menuType === 'database-schema-row') {
      const fieldMeta = getDatabaseSchemaFieldMeta(row)
      return [
        { key: 'add-database-column-after', label: '在该字段后新增', enabled: canCreateDatabaseColumns.value },
        { key: 'edit-database-column', label: '编辑当前字段', enabled: !!fieldMeta && fieldMeta.schemaReadOnly !== true },
        { key: 'delete-database-column', label: '删除当前字段', enabled: !!fieldMeta }
      ]
    }
    return []
  }

  function joinRemotePath(dir, name) {
    const base = String(dir || '/').replace(/\/+$/, '') || '/'
    return base === '/' ? `/${name}` : `${base}/${name}`
  }

  function isMenuEnabled(key) {
    if (key === 'activation') return true
    if (key === 'logs') return true
    if (!appActivated.value) {
      if (!connected.value) return key === 'accounts'
      return UNLICENSED_MENUS.includes(key)
    }
    if (!connected.value) return key === 'accounts' || key === 'object-storage' || key === 'browser'
    return isSSHSession.value || !SSH_ONLY_MENUS.includes(key)
  }

  function focusTerminal() {
    nextTick(() => {
      if (terminal?.focus) terminal.focus()
      const helperTextarea = terminal?.textarea || terminalRef.value?.querySelector?.('.xterm-helper-textarea, .xterm-helpers textarea')
      if (helperTextarea) {
        try {
          helperTextarea.disabled = false
          helperTextarea.readOnly = false
          helperTextarea.value = ''
        } catch {}
      }
      if (helperTextarea?.focus) helperTextarea.focus({ preventScroll: true })
    })
  }

  function isTerminalCopyShortcut(event) {
    return !!event && !event.altKey && (event.ctrlKey || event.metaKey) && String(event.key || '').toLowerCase() === 'c'
  }

  function isTerminalPasteShortcut(event) {
    return !!event && !event.altKey && (event.ctrlKey || event.metaKey) && String(event.key || '').toLowerCase() === 'v'
  }

  function getTerminalDirectControlData(event) {
    if (!event || event.altKey || !(event.ctrlKey || event.metaKey)) return ''
    const key = String(event.key || '').toLowerCase()
    if (key === 'z') return '\x1a'
    if (key === 'y') return '\x19'
    return ''
  }

  async function readClipboardText() {
    if (window?.whSSH?.readClipboardText) return String(await window.whSSH.readClipboardText() || '')
    if (navigator?.clipboard?.readText) return String(await navigator.clipboard.readText() || '')
    return ''
  }

  async function writeClipboardText(text) {
    const value = String(text || '')
    if (window?.whSSH?.writeClipboardText) return window.whSSH.writeClipboardText(value)
    if (navigator?.clipboard?.writeText) return navigator.clipboard.writeText(value)
    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.setAttribute('readonly', 'readonly')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
    return true
  }

  function handleTerminalClipboardShortcut(event) {
    if (!event || (!isTerminalCopyShortcut(event) && !isTerminalPasteShortcut(event))) return false
    event.preventDefault()
    event.stopPropagation()

    if (isTerminalCopyShortcut(event)) {
      const selection = terminal?.getSelection?.() || ''
      if (selection) {
        writeClipboardText(selection).catch(error => {
          message.value = `复制终端内容失败：${error.message || error}`
        })
      } else if (sessionId.value && window?.whSSH?.sendInput) {
        window.whSSH.sendInput(sessionId.value, '\x03')
      }
      focusTerminal()
      return true
    }

    readClipboardText()
      .then(text => {
        if (text && sessionId.value && window?.whSSH?.sendInput) window.whSSH.sendInput(sessionId.value, text)
      })
      .catch(error => {
        message.value = `粘贴到终端失败：${error.message || error}`
      })
      .finally(() => focusTerminal())
    return true
  }

  function handleTerminalDirectControlShortcut(event) {
    const data = getTerminalDirectControlData(event)
    if (!data) return false
    event.preventDefault()
    event.stopPropagation()
    if (sessionId.value && window?.whSSH?.sendInput) window.whSSH.sendInput(sessionId.value, data)
    focusTerminal()
    return true
  }

  function mapTerminalKeydown(event) {
    const key = String(event?.key || '')
    if (!key) return ''
    if (event.altKey && !event.ctrlKey) return ''
    if ((event.ctrlKey || event.metaKey) && key.length === 1) {
      if (key.toLowerCase() === 'c' || key.toLowerCase() === 'v') return ''
      const upper = key.toUpperCase()
      const code = upper.charCodeAt(0)
      if (code >= 65 && code <= 90) return String.fromCharCode(code - 64)
    }
    if (key === 'Enter') return '\r'
    if (key === 'Backspace') return '\x7f'
    if (key === 'Tab') return '\t'
    if (key === 'Escape') return '\x1b'
    if (key === 'ArrowUp') return '\x1b[A'
    if (key === 'ArrowDown') return '\x1b[B'
    if (key === 'ArrowRight') return '\x1b[C'
    if (key === 'ArrowLeft') return '\x1b[D'
    if (key === 'Delete') return '\x1b[3~'
    if (key === 'Home') return '\x1b[H'
    if (key === 'End') return '\x1b[F'
    if (key === 'PageUp') return '\x1b[5~'
    if (key === 'PageDown') return '\x1b[6~'
    if (!event.ctrlKey && !event.metaKey && !event.altKey && key.length === 1) return key
    return ''
  }

  function handleTerminalKeydown(event) {
    if (handleTerminalClipboardShortcut(event)) return
    if (handleTerminalDirectControlShortcut(event)) return
    const helperTextarea = terminal?.textarea || terminalRef.value?.querySelector?.('.xterm-helper-textarea, .xterm-helpers textarea')
    if (helperTextarea && event.target === helperTextarea) return
    if (!sessionId.value || !window?.whSSH?.sendInput) return
    const data = mapTerminalKeydown(event)
    if (!data) return
    event.preventDefault()
    event.stopPropagation()
    window.whSSH.sendInput(sessionId.value, data)
    focusTerminal()
  }

  function getTerminalCellSize() {
    const internal = terminal?._core?._renderService?.dimensions?.css
    if (internal?.cell?.width && internal?.cell?.height) {
      return {
        width: internal.cell.width,
        height: internal.cell.height
      }
    }
    const measure = terminalRef.value?.querySelector?.('.xterm-char-measure-element')
    const rect = measure?.getBoundingClientRect?.()
    return {
      width: rect?.width || 8.4,
      height: rect?.height || 17
    }
  }

  function getTerminalFontSize() {
    const width = terminalRef.value?.getBoundingClientRect?.().width || 0
    if (width >= 3000) return 16
    if (width >= 1800) return 14
    return 12
  }

  function getTerminalViewportSize() {
    const hostRect = terminalRef.value?.getBoundingClientRect?.()
    if (!hostRect?.width || !hostRect?.height) {
      return { cols: 120, rows: 34 }
    }
    const cell = getTerminalCellSize()
    return {
      cols: Math.max(20, Math.floor((hostRect.width - 12) / cell.width)),
      rows: Math.max(8, Math.floor((hostRect.height - 12) / cell.height))
    }
  }

  function resizeTerminalToContainer() {
    if (!terminal || !terminalRef.value || activeMenu.value !== 'terminal') return

    const fontSize = getTerminalFontSize()
    if (terminal.options.fontSize !== fontSize) terminal.options.fontSize = fontSize

    const { cols, rows } = getTerminalViewportSize()

    if (terminal.cols !== cols || terminal.rows !== rows) {
      terminal.resize(cols, rows)
    }

    if (sessionId.value && window?.whSSH?.resizeTerminal) {
      window.whSSH.resizeTerminal(sessionId.value, cols, rows)
    }
  }

  function scheduleTerminalResize() {
    window.requestAnimationFrame(() => {
      resizeTerminalToContainer()
    })
  }

  function stabilizeTerminalLayout() {
    scheduleTerminalResize()
    window.setTimeout(() => {
      resizeTerminalToContainer()
      if (terminal?.refresh) terminal.refresh(0, Math.max(0, terminal.rows - 1))
    }, 60)
    window.setTimeout(() => {
      resizeTerminalToContainer()
      if (terminal?.refresh) terminal.refresh(0, Math.max(0, terminal.rows - 1))
    }, 180)
  }

  function handleTerminalWindowResize() {
    scheduleTerminalResize()
  }

  async function copyTerminalCommand(row) {
    const text = String(row?.command || '').trim()
    if (!text) return

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.setAttribute('readonly', 'readonly')
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      copiedTerminalCommandId.value = row.id || ''
      if (terminalCommandCopyTimer) {
        window.clearTimeout(terminalCommandCopyTimer)
      }
      terminalCommandCopyTimer = window.setTimeout(() => {
        copiedTerminalCommandId.value = ''
        terminalCommandCopyTimer = null
      }, 1600)
      message.value = '已复制'
    } catch (error) {
      copiedTerminalCommandId.value = ''
      message.value = `复制命令失败：${error.message || error}`
    }
  }

  function setupTerminalResizeObserver() {
    if (!terminalRef.value) return
    if (typeof window.ResizeObserver === 'function' && !terminalResizeObserver) {
      terminalResizeObserver = new window.ResizeObserver(() => {
        scheduleTerminalResize()
      })
      terminalResizeObserver.observe(terminalRef.value)
    }
  }

  async function selectMenu(key) {
    const enabled = isMenuEnabled(key)
    console.info('[menu] click', {
      key,
      enabled,
      connected: connected.value,
      sessionProtocol: sessionProtocol.value,
      activeMenu: activeMenu.value
    })
    if (!enabled) {
      if (!appActivated.value) message.value = '当前设备未激活，仅开放连接账号、命令终端和服务管理'
      else message.value = connected.value ? `${key} 当前连接协议不可用` : '请先连接服务器'
      return
    }
    if (key === 'browser') browserPageMounted.value = true
    activeMenu.value = key
    const loadingLabel = localizedMenus.value.find(item => item.key === key)?.label || key
    const showWorkspaceLoading = () => {
      const requestId = ++workspaceLoadingRequest
      workspaceLoadingText.value = `正在加载${loadingLabel}...`
      workspaceLoading.value = true
      return () => {
        if (workspaceLoadingRequest === requestId) workspaceLoading.value = false
      }
    }
    try {
      if (key === 'database') {
        if (databaseConnected.value && !databaseDatabases.value.length && !databaseLoading.value) {
          const finishWorkspaceLoading = showWorkspaceLoading()
          try {
            await refreshDatabaseBrowser()
          } finally {
            finishWorkspaceLoading()
          }
        }
        return
      }
      if (!connected.value || !isSSHSession.value) {
        if (key === 'terminal') {
          nextTick(async () => {
            try {
              await initTerminal()
              stabilizeTerminalLayout()
              focusTerminal()
            } catch (error) {
              console.error('[menu] terminal init failed', error)
              message.value = `终端初始化失败：${error.message || error}`
            }
          })
        }
        return
      }
      if (key === 'terminal') {
        nextTick(async () => {
          try {
            await initTerminal()
            stabilizeTerminalLayout()
            focusTerminal()
          } catch (error) {
            console.error('[menu] terminal init failed', error)
            message.value = `终端初始化失败：${error.message || error}`
          }
        })
        return
      }
      if (key === 'system-users' && !systemUserLoading.value && !systemUsersOverview.value.users.length) {
        const finishWorkspaceLoading = showWorkspaceLoading()
        try {
          await loadSystemUsers()
        } finally {
          finishWorkspaceLoading()
        }
        return
      }
      if ((key === 'ports' || key === 'firewall') && !firewallLoading.value && !firewallOverview.value.backend) {
        const finishWorkspaceLoading = showWorkspaceLoading()
        try {
          await loadFirewallOverview()
        } finally {
          finishWorkspaceLoading()
        }
        return
      }
      if (key === 'nginx' && !nginxSites.value.length) {
        const finishWorkspaceLoading = showWorkspaceLoading()
        try {
          await loadNginxSites()
        } finally {
          finishWorkspaceLoading()
        }
        return
      }
      if (key === 'docker' && !dockerContainers.value.length && !dockerLoading.value) {
        const finishWorkspaceLoading = showWorkspaceLoading()
        try {
          await loadDockerContainers()
        } finally {
          finishWorkspaceLoading()
        }
      }
    } catch (error) {
      console.error('[menu] load failed', { key, error })
      message.value = `${localizedMenus.value.find(item => item.key === key)?.label || key} 加载失败：${error.message || error}`
    }
  }

  function openAppActivationPage() {
    activeMenu.value = 'activation'
  }

  function handleProtocolChange(protocol) {
    const next = normalizeForm({ ...form.value, protocol })
    next.port = 22
    if (!next.username) {
      next.username = 'root'
    }
    form.value = next
  }

  function handleAuthTypeChange(authType) {
    form.value = normalizeForm({ ...form.value, authType })
  }

  async function connect() {
    if (!form.value.host || !form.value.username) {
      message.value = '请填写服务器地址和用户名'
      return
    }
    if (form.value.authType === 'password' && !String(form.value.password || '')) {
      message.value = '使用密码认证时，请填写密码；如果是从已保存连接带入，请重新输入密码'
      return
    }
    if (form.value.authType === 'privateKey' && !form.value.privateKey.trim()) {
      message.value = '使用私钥认证时，请填写私钥内容'
      return
    }
    connecting.value = true
    message.value = ''
    try {
      const connectionProfile = createRemoteShortcutProfile(form.value)
      clearRemoteDirectoryAccessCache()
      const result = await window.whSSH.connect({ ...form.value })
      sessionId.value = result.id
      sessionProtocol.value = result.protocol || form.value.protocol
      remoteShortcutProfile.value = { ...connectionProfile, protocol: sessionProtocol.value }
      await loadPersistedRemoteDirectoryAccessCache()
      connected.value = true
      activeMenu.value = 'terminal'
      loginVisible.value = false
      resetSystemUsersState()
      firewallOverview.value = createFirewallOverviewState()
      firewallForm.value = createFirewallForm()
      await restoreFirewallPreferredBackend({ ...form.value, protocol: sessionProtocol.value })
      if (rememberConnection.value) await cacheCurrentConnection()
      if (sessionProtocol.value === 'ssh') await initTerminal()
      if (localPath.value === '__pc__') await loadLocalRoots()
      else await loadLocalFiles(localPath.value)
      await loadRemoteShortcuts()
      await loadFiles(result.startPath || '/')
      if (sessionProtocol.value === 'ssh') {
        await loadOverview()
        await loadServices()
      } else {
        serverInfo.value = {}
        resetServicesState()
        resetNginxState()
        resetDockerState()
        logFiles.value = []
        customLogPath.value = ''
        selectedLogFile.value = null
        logViewer.value = { open: false, name: '', path: '', content: '' }
        resetSystemUsersState()
      }
      message.value = `${sessionProtocol.value.toUpperCase()} 连接成功`
    } catch (error) {
      message.value = `连接失败：${error.message}`
    } finally {
      connecting.value = false
    }
  }

  function pickKeyFile() {
    if (!keyFileInputRef.value) return
    keyFileInputRef.value.value = ''
    keyFileInputRef.value.click()
  }

  async function handleKeyFileSelected(event) {
    const file = event?.target?.files?.[0]
    if (!file) return
    try {
      const content = await file.text()
      form.value = {
        ...form.value,
        privateKey: content || ''
      }
      message.value = `已载入私钥文件：${file.name}`
    } catch (error) {
      await reportError(error)
    } finally {
      if (event?.target) event.target.value = ''
    }
  }

  function createParentRow(scope) {
    return { name: '...', type: 'd', size: 0, modifyTime: 0, path: '..', isParent: true, scope }
  }

  function getFileIconClass(row) {
    if (row.isParent || row.type === 'd') return 'file-icon folder-icon'
    if (isVideoFile(row.name)) return 'file-icon video-icon'
    if (isImageFile(row.name)) return 'file-icon image-icon'
    if (isAudioFile(row.name)) return 'file-icon audio-icon'
    if (isArchiveFile(row.name)) return 'file-icon archive-icon'
    if (isCodeFile(row.name)) return 'file-icon code-icon'
    return 'file-icon document-icon'
  }

  function getExt(name) {
    const index = String(name || '').lastIndexOf('.')
    return index > -1 ? String(name).slice(index + 1).toLowerCase() : ''
  }

  function isVideoFile(name) {
    return ['mp4', 'mov', 'avi', 'mkv', 'flv', 'wmv', 'webm', 'm4v'].includes(getExt(name))
  }

  function isPreviewableVideoFile(name) {
    return ['mp4', 'mov', 'webm', 'm4v'].includes(getExt(name))
  }

  function isImageFile(name) {
    return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(getExt(name))
  }

  function isAudioFile(name) {
    return ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'].includes(getExt(name))
  }

  function isPreviewableAudioFile(name) {
    return ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'].includes(getExt(name))
  }

  function isPreviewableRemoteMediaFile(name) {
    return isPreviewableVideoFile(name) || isPreviewableAudioFile(name)
  }

  function isArchiveFile(name) {
    return ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(getExt(name))
  }

  function isCodeFile(name) {
    return ['js', 'ts', 'vue', 'json', 'css', 'scss', 'html', 'md', 'xml', 'yml', 'yaml', 'conf', 'sh', 'php', 'py', 'java', 'go', 'sql', 'log', 'txt'].includes(getExt(name))
  }

  function isLocalRoot(value) {
    if (!value) return true
    return value === '/' || /^[A-Za-z]:\\?$/.test(value)
  }

  function normalizeLocalComparePath(value) {
    const text = String(value || '')
    const trimmed = text.replace(/[\\/]+$/, '')
    return (trimmed || text).toLowerCase()
  }

  function isLocalRootEntry(value) {
    const target = normalizeLocalComparePath(value)
    return localRoots.value.some(root => normalizeLocalComparePath(root.path) === target)
  }

  function getLocalParent(value) {
    if (!value) return value
    if (isLocalRoot(value) || isLocalRootEntry(value)) return '__pc__'
    const normalized = value.replace(/[\\/]+$/, '')
    const slashIndex = Math.max(normalized.lastIndexOf('\\'), normalized.lastIndexOf('/'))
    if (slashIndex <= 2) return normalized.slice(0, 3)
    return normalized.slice(0, slashIndex)
  }

  function getRemoteParentPath(value) {
    const normalized = String(value || '').replace(/\/+$/, '') || '/'
    if (normalized === '/') return '/'
    const parent = normalized.split('/').slice(0, -1).join('/')
    return parent ? `/${parent.replace(/^\/+/, '')}` : '/'
  }

  async function ensureEditorMonaco() {
    if (editorMonacoSession || !editorMonacoRef.value) return editorMonacoSession
    if (!createMonacoEditorSessionFactory) {
      const monacoModule = await import('./monacoEditor')
      createMonacoEditorSessionFactory = monacoModule.createMonacoEditorSession
    }
    editorMonacoSession = await createMonacoEditorSessionFactory(editorMonacoRef.value, {
      theme: 'whssh-dark',
      readOnly: editor.value.loading,
      onChange: value => {
        editor.value.content = value
        syncEditorIntoTabs()
      },
      onCursorChange: position => {
        editor.value.cursorLine = position?.lineNumber || 1
        editor.value.cursorColumn = position?.column || 1
        syncEditorIntoTabs()
      }
    })
    return editorMonacoSession
  }

  function syncEditorMonacoContent(content, filePath) {
    if (!editorMonacoSession) return
    editorMonacoSession.setFileContent(filePath, content)
    editorMonacoSession.setReadOnly(editor.value.loading)
    editorMonacoSession.focusStart()
  }

  function buildDatabaseSqlMonacoFilePath() {
    return `database-query-${activeDatabaseSqlRecordId.value || 'active'}.sql`
  }

  function buildDatabaseSqlCompletionItems(monaco, range) {
    const suggestions = []
    const pushItem = (label, detail, kind = monaco.languages.CompletionItemKind.Keyword) => {
      const text = String(label || '').trim()
      if (!text) return
      suggestions.push({
        label: text,
        kind,
        insertText: text,
        detail,
        range
      })
    }

    ;[
      'SELECT', 'FROM', 'WHERE', 'ORDER BY', 'GROUP BY', 'LIMIT', 'OFFSET', 'INSERT INTO', 'UPDATE', 'DELETE FROM',
      'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'COUNT(*)', 'DISTINCT', 'LIKE', 'IN', 'NOT IN', 'BETWEEN', 'IS NULL',
      'IS NOT NULL', 'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'SHOW DATABASES', 'SHOW TABLES', 'DESCRIBE'
    ].forEach(item => pushItem(item, 'SQL 关键字'))

    if (databaseActiveDatabase.value) {
      pushItem(databaseActiveDatabase.value, '当前数据库', monaco.languages.CompletionItemKind.Module)
    }

    const tables = databaseTablesByDatabase.value[databaseActiveDatabase.value] || []
    for (const item of tables) {
      const tableName = String(item?.name || '').trim()
      if (!tableName) continue
      pushItem(tableName, item?.type === 'view' ? '视图' : '数据表', monaco.languages.CompletionItemKind.Class)
    }

    const columns = [
      ...(databaseSchema.value.columns || []).map(item => item?.prop || item?.label || ''),
      ...(databaseResult.value.columns || []).map(item => item?.prop || item?.label || ''),
      ...(databaseSqlResult.value.columns || []).map(item => item?.prop || item?.label || '')
    ]
    for (const item of [...new Set(columns.map(value => String(value || '').trim()).filter(Boolean))]) {
      pushItem(item, '字段', monaco.languages.CompletionItemKind.Field)
    }

    return suggestions
  }

  async function ensureDatabaseSqlMonaco() {
    if (databaseSqlMonacoSession) {
      databaseSqlMonacoSession.editor?.layout?.()
      databaseSqlMonacoSession.setReadOnly(databaseLoading.value)
      return databaseSqlMonacoSession
    }
    if (!databaseSqlMonacoRef.value) return databaseSqlMonacoSession
    const monacoModule = await import('./monacoEditor')
    if (!createMonacoEditorSessionFactory) {
      createMonacoEditorSessionFactory = monacoModule.createMonacoEditorSession
    }
    const monaco = await monacoModule.ensureMonacoRuntime()
    if (!databaseSqlCompletionDisposable) {
      databaseSqlCompletionDisposable = monaco.languages.registerCompletionItemProvider('sql', {
        triggerCharacters: [' ', '.', '`'],
        provideCompletionItems(model, position) {
          const word = model.getWordUntilPosition(position)
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn
          }
          return { suggestions: buildDatabaseSqlCompletionItems(monaco, range) }
        }
      })
    }
    databaseSqlMonacoSession = await createMonacoEditorSessionFactory(databaseSqlMonacoRef.value, {
      onChange: value => {
        databaseSql.value = value
      }
    })
    databaseSqlMonacoSession.editor.updateOptions({
      lineNumbers: 'on',
      fontSize: 13,
      lineHeight: 20,
      wordWrap: 'on',
      quickSuggestions: true,
      suggestOnTriggerCharacters: true,
      minimap: { enabled: false },
      padding: { top: 10, bottom: 10 },
      fixedOverflowWidgets: true
    })
    syncDatabaseSqlMonacoContent(true)
    return databaseSqlMonacoSession
  }

  function syncDatabaseSqlMonacoContent(force = false) {
    if (!databaseSqlMonacoSession) return
    const nextValue = String(databaseSql.value || '')
    const nextFilePath = buildDatabaseSqlMonacoFilePath()
    const currentModel = databaseSqlMonacoSession.editor.getModel()
    const currentValue = currentModel?.getValue?.() || ''
    const currentPath = currentModel?.uri?.path || ''
    if (!force && currentValue === nextValue && currentPath.endsWith(nextFilePath)) {
      databaseSqlMonacoSession.setReadOnly(databaseLoading.value)
      return
    }
    databaseSqlMonacoSession.setFileContent(nextFilePath, nextValue)
    databaseSqlMonacoSession.setReadOnly(databaseLoading.value)
  }

  function disposeDatabaseSqlMonaco() {
    if (databaseSqlCompletionDisposable) {
      databaseSqlCompletionDisposable.dispose()
      databaseSqlCompletionDisposable = null
    }
    if (!databaseSqlMonacoSession) return
    databaseSqlMonacoSession.dispose()
    databaseSqlMonacoSession = null
    databaseSqlMonacoElement = null
  }

  function disposeEditorMonaco() {
    if (!editorMonacoSession) return
    editorMonacoSession.dispose()
    editorMonacoSession = null
  }

  watch(() => databaseContentTab.value, async tab => {
    if (tab !== 'sql') return
    await nextTick()
    await ensureDatabaseSqlMonaco()
    syncDatabaseSqlMonacoContent(true)
  })

  watch(() => activeDatabaseSqlRecordId.value, async () => {
    if (databaseContentTab.value !== 'sql') return
    await nextTick()
    await ensureDatabaseSqlMonaco()
    syncDatabaseSqlMonacoContent(true)
  })

  watch(() => databaseSql.value, () => {
    if (!databaseSqlMonacoSession) return
    syncDatabaseSqlMonacoContent(false)
  })

  watch(() => databaseLoading.value, value => {
    databaseSqlMonacoSession?.setReadOnly(!!value)
  })

  async function disconnect(showMessage = true) {
    if (!sessionId.value) return
    if (tailing.value) await stopTail()
    if (mediaPreview.value.open) await closeMediaPreview()
    if (imagePreview.value.open) closeImagePreview()
    flushPersistRemoteDirectoryAccessCache()
    clearRemoteDirectoryAccessCache()
    await window.whSSH.disconnect(sessionId.value)
    connected.value = false
    activeMenu.value = 'accounts'
    sessionId.value = ''
    sessionProtocol.value = 'ssh'
    remoteClipboard.value = null
    resetRemoteShortcutState()
    serverInfo.value = {}
    resetServicesState()
    resetSystemUsersState()
    firewallOverview.value = createFirewallOverviewState()
    firewallForm.value = createFirewallForm()
    firewallPreferredBackend.value = 'auto'
    firewallUserPreferredBackend.value = 'auto'
    firewallPreferredInitialized.value = false
    firewallPreferredStorageKey.value = ''
    resetNginxState()
    resetDockerState()
    logFiles.value = []
    customLogPath.value = ''
    selectedLogFile.value = null
    logViewer.value = { open: false, name: '', path: '', content: '' }
    if (showMessage) message.value = '连接已断开'
  }

  async function initTerminal() {
    if (!isSSHSession.value) return
    await nextTick()
    if (!terminalRef.value) return
    if (terminal) {
      setupTerminalResizeObserver()
      scheduleTerminalResize()
      focusTerminal()
      return
    }
    terminal = new window.Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      cursorWidth: 1,
      fontFamily: 'Consolas, Menlo, monospace',
       fontSize: 12,
      theme: {
        background: '#0d1117',
        foreground: '#d6deeb',
        cursor: '#ef4444',
        cursorAccent: '#ef4444'
      }
    })
    terminal.open(terminalRef.value)
    terminal.attachCustomKeyEventHandler(event => {
      if (event.type !== 'keydown') return true
      return !handleTerminalClipboardShortcut(event) && !handleTerminalDirectControlShortcut(event)
    })
    setupTerminalResizeObserver()
    stabilizeTerminalLayout()
    terminal.onKey(({ key, domEvent }) => {
      if (!sessionId.value || !key) return
      if (handleTerminalClipboardShortcut(domEvent)) return
      if (handleTerminalDirectControlShortcut(domEvent)) return
      console.info('[terminal][renderer][main-shell] onKey', {
        sessionId: sessionId.value,
        key,
        code: domEvent?.code || '',
        ctrl: !!domEvent?.ctrlKey,
        alt: !!domEvent?.altKey,
        meta: !!domEvent?.metaKey
      })
      window.whSSH.sendInput(sessionId.value, key)
    })
    const helperTextarea = terminal.textarea || terminalRef.value?.querySelector?.('.xterm-helper-textarea, .xterm-helpers textarea')
    if (helperTextarea?.addEventListener) {
      const handleTerminalPaste = event => {
        const text = String(event?.clipboardData?.getData?.('text') || '')
        if (!sessionId.value || !text) return
        console.info('[terminal][renderer][main-shell] paste', { sessionId: sessionId.value, length: text.length })
        window.whSSH.sendInput(sessionId.value, text)
      }
      helperTextarea.addEventListener('paste', handleTerminalPaste)
      stopTerminalPaste = () => {
        helperTextarea.removeEventListener('paste', handleTerminalPaste)
        stopTerminalPaste = null
      }
    }
    stopTerminalData = window.whSSH.onTerminalData(payload => {
      if (payload.id === sessionId.value && terminal) terminal.write(payload.data)
    })
    stopTerminalClosed = window.whSSH.onTerminalClosed(payload => {
      if (payload.id === sessionId.value) connected.value = false
    })
    focusTerminal()
  }

  function joinLocalPath(dir, name) {
    if (dir.endsWith('\\') || dir.endsWith('/')) return dir + name
    if (dir.includes('\\')) return `${dir}\\${name}`
    return `${dir}/${name}`
  }

  async function loadOverview(options = {}) {
    if (overviewRefreshing.value) return
    if (!connected.value) {
      if (options.notify) ElMessage.warning('请先连接服务器')
      return
    }
    if (!ensureSshFeature('服务器概览')) {
      if (options.notify) ElMessage.warning('当前连接协议不支持刷新概览')
      return
    }
    overviewRefreshing.value = true
    try {
      serverInfo.value = await window.whSSH.getOverview(sessionId.value)
      if (options.notify) ElMessage.success('服务器概览已刷新')
    } catch (error) {
      message.value = `服务器状态读取失败：${error.message}`
    } finally {
      overviewRefreshing.value = false
    }
  }

  async function loadFirewallOverview(options = {}) {
    if (!connected.value) return
    if (!ensureSshFeature('防火墙')) return
    const { notify = false } = options
    firewallLoading.value = true
    try {
      ensureBridgeMethod('getFirewallOverview')
      firewallOverview.value = await window.whSSH.getFirewallOverview(sessionId.value)
      ensureFirewallPreferredBackend()
      if (notify) message.value = '端口与防火墙信息已刷新'
    } catch (error) {
      await reportError(error)
    } finally {
      firewallLoading.value = false
    }
  }

  function selectBestFirewallBackend() {
    const layers = Array.isArray(firewallDiagnosticItems.value) ? firewallDiagnosticItems.value : []
    const recommended = getFirewallLayerByKey(firewallOverview.value.recommendedBackend || firewallOverview.value.backend, { activeOnly: true })
    if (recommended) return recommended.key
    return layers.find(item => ['ufw', 'firewalld'].includes(item.key) && item.active)?.key
      || 'auto'
  }

  function ensureFirewallPreferredBackend() {
    if (firewallPreferredInitialized.value) return
    firewallPreferredInitialized.value = true
    if (firewallPreferredBackend.value && firewallPreferredBackend.value !== 'auto') return
    const backend = selectBestFirewallBackend()
    if (backend && backend !== 'none') setFirewallPreferredBackend(backend, { persist: false })
  }

  function firewallRuleKindLabel(kind) {
    if (kind === 'numbered') return 'UFW 编号'
    if (kind === 'port') return '端口规则'
    if (kind === 'service') return '服务规则'
    if (kind === 'rich') return 'rich rule'
    if (kind === 'iptables') return 'iptables'
    if (kind === 'nftables') return 'nftables'
    return kind || '-'
  }

  function firewallServiceLabel(service) {
    const key = String(service || '').trim().toLowerCase()
    if (!key) return '未命名服务'
    const labels = {
      http: 'HTTP',
      https: 'HTTPS',
      ssh: 'SSH',
      sftp: 'SFTP',
      smtp: 'SMTP',
      dns: 'DNS',
      mysql: 'MySQL',
      postgresql: 'PostgreSQL',
      redis: 'Redis'
    }
    return labels[key] ? `${labels[key]} (${key})` : `服务 ${key}`
  }

  function firewallSourceLabel(source) {
    const text = String(source || '').trim().toLowerCase()
    return !text || text === 'any' ? '全部来源' : source
  }

  function firewallDestinationLabel(destination) {
    const text = String(destination || '').trim().toLowerCase()
    return !text || text === 'any' ? '全部目标' : destination
  }

  function firewallRuleDirection(rule = {}) {
    const direction = String(rule.direction || '').trim().toLowerCase()
    if (direction === 'inbound' || direction === 'outbound') return direction
    const chain = String(rule.chain || '').trim().toUpperCase()
    return chain === 'OUTPUT' ? 'outbound' : 'inbound'
  }

  function firewallDirectionLabel(rule = {}) {
    return firewallRuleDirection(rule) === 'outbound' ? '出站' : '入站'
  }

  function firewallPeerLabel(rule = {}) {
    return firewallRuleDirection(rule) === 'outbound'
      ? firewallDestinationLabel(rule.destination || rule.targetAddress)
      : firewallSourceLabel(rule.source)
  }

  function firewallRulePrimaryLabel(rule) {
    if (rule.kind === 'service') return firewallServiceLabel(rule.service || rule.raw)
    return rule.target || '-'
  }

  function firewallRuleSecondaryLabel(rule) {
    if (rule.kind === 'service') {
      return `firewalld 服务规则 · ${firewallRuleScopeLabel(rule.scope)}`
    }
    const sourceText = firewallSourceLabel(rule.source)
    const destinationText = firewallDestinationLabel(rule.destination || rule.targetAddress)
    const typeText = firewallRuleKindLabel(rule.kind)
    const scopeText = firewallRuleScopeLabel(rule.scope)
    const familyText = rule.family === 'ipv6' ? 'IPv6' : (rule.family === 'ipv4' ? 'IPv4' : '')
    const directionText = firewallDirectionLabel(rule)
    const peerText = firewallRuleDirection(rule) === 'outbound' ? destinationText : sourceText
    const pieces = [typeText, directionText, peerText]
    if (familyText) pieces.push(familyText)
    if (scopeText && scopeText !== '-') pieces.push(scopeText)
    return pieces.join(' · ')
  }

  function firewallRuleScopeLabel(scope) {
    if (!scope) return '当前'
    if (scope === 'runtime') return '运行态'
    if (scope === 'permanent') return '永久'
    if (scope === 'both') return '运行+永久'
    return '-'
  }

  function canManageFirewallRule(rule) {
    return ['ufw', 'firewalld', 'iptables', 'nftables'].includes(String(rule?.backend || ''))
  }

  function canEditFirewallRule(rule) {
    return canManageFirewallRule(rule) && rule?.kind !== 'service' && !(Array.isArray(rule?.duplicateRules) && rule.duplicateRules.length > 1)
  }

  function serializeFirewallRule(rule = {}) {
    return {
      id: rule.id || '',
      backend: rule.backend || '',
      kind: rule.kind || '',
      number: Number.isInteger(rule.number) ? rule.number : null,
      target: rule.target || '',
      port: rule.port || '',
      protocol: rule.protocol || '',
      direction: firewallRuleDirection(rule),
      action: rule.action || '',
      source: rule.source || '',
      destination: rule.destination || rule.targetAddress || '',
      raw: rule.raw || '',
      scope: rule.scope || '',
      service: rule.service || '',
      family: rule.family || '',
      chain: rule.chain || '',
      tableFamily: rule.tableFamily || '',
      table: rule.table || '',
      handle: Number.isFinite(Number(rule.handle)) ? Number(rule.handle) : null
    }
  }

  function openFirewallRuleFromPort(port = {}) {
    firewallForm.value = {
      ...createFirewallForm(),
      backend: firewallPreferredBackend.value || 'auto',
      direction: 'inbound',
      port: String(port.port || ''),
      protocol: String(port.protocol || 'tcp').toLowerCase(),
      action: 'allow',
      source: '',
      destination: ''
    }
    activeMenu.value = 'firewall'
    nextTick(() => {
      firewallRuleDialogRequest.value += 1
    })
  }

  function setFirewallPreferredBackend(backend, options = {}) {
    const value = String(backend || 'auto').trim().toLowerCase()
    firewallPreferredInitialized.value = true
    firewallPreferredBackend.value = value || 'auto'
    if (options.persist !== false) firewallUserPreferredBackend.value = firewallPreferredBackend.value === 'auto' ? 'auto' : firewallPreferredBackend.value
    else if (options.manual === false && firewallUserPreferredBackend.value === 'auto') firewallUserPreferredBackend.value = 'auto'
    firewallForm.value.backend = firewallPreferredBackend.value
    if (options.persist !== false) persistFirewallPreferredBackend(firewallPreferredBackend.value)
  }

  async function createFirewallRule(rulePayload = null, options = {}) {
    if (!ensureSshFeature('防火墙')) return
    try {
      ensureBridgeMethod('addFirewallRule')
      const ruleForm = rulePayload || firewallForm.value
      await window.whSSH.addFirewallRule({
        sessionId: sessionId.value,
        backend: ruleForm.backend || firewallPreferredBackend.value,
        direction: ruleForm.direction,
        port: ruleForm.port,
        protocol: ruleForm.protocol,
        action: ruleForm.action,
        source: ruleForm.direction === 'inbound' ? ruleForm.source : '',
        destination: ruleForm.direction === 'outbound' ? ruleForm.destination : ''
      })
      if (!options.silent) message.value = '防火墙规则已新增'
      if (options.reset !== false) {
        firewallForm.value = createFirewallForm()
        firewallForm.value.backend = firewallPreferredBackend.value || 'auto'
      }
      if (options.reload !== false) await loadFirewallOverview()
      return true
    } catch (error) {
      await reportError(error)
      return false
    }
  }

  async function updateFirewallRule(rule) {
    if (!ensureSshFeature('防火墙')) return
    try {
      ensureBridgeMethod('addFirewallRule')
      ensureBridgeMethod('deleteFirewallRule')
      await window.whSSH.addFirewallRule({
        sessionId: sessionId.value,
        backend: firewallForm.value.backend === 'auto' ? (rule.backend || firewallPreferredBackend.value || 'auto') : firewallForm.value.backend,
        direction: firewallForm.value.direction,
        port: firewallForm.value.port,
        protocol: firewallForm.value.protocol,
        action: firewallForm.value.action,
        source: firewallForm.value.direction === 'inbound' ? firewallForm.value.source : '',
        destination: firewallForm.value.direction === 'outbound' ? firewallForm.value.destination : ''
      })
      await window.whSSH.deleteFirewallRule({ sessionId: sessionId.value, rule: serializeFirewallRule(rule) })
      message.value = '防火墙规则已更新'
      firewallForm.value = createFirewallForm()
      firewallForm.value.backend = firewallPreferredBackend.value || 'auto'
      await loadFirewallOverview()
    } catch (error) {
      await reportError(error)
    }
  }

  async function enableFirewallBackend(backend) {
    if (!ensureSshFeature('防火墙')) return
    try {
      ensureBridgeMethod('enableFirewallBackend')
      await window.whSSH.enableFirewallBackend({ sessionId: sessionId.value, backend })
      message.value = '防火墙已启用'
      await loadFirewallOverview()
    } catch (error) {
      await reportError(error)
    }
  }

  async function disableFirewallBackend(backend) {
    if (!ensureSshFeature('防火墙')) return
    try {
      ensureBridgeMethod('disableFirewallBackend')
      await window.whSSH.disableFirewallBackend({ sessionId: sessionId.value, backend })
      if (firewallPreferredBackend.value === backend) setFirewallPreferredBackend('auto')
      message.value = '防火墙已停用'
      await loadFirewallOverview()
    } catch (error) {
      await reportError(error)
    }
  }

  async function removeFirewallRule(rule, options = {}) {
    try {
      ensureBridgeMethod('deleteFirewallRule')
      if (options.confirm !== false) {
        await ElMessageBox.confirm(`确认删除规则 ${rule.target}？`, '确认删除防火墙规则', {
          type: 'warning',
          confirmButtonText: '删除',
          cancelButtonText: '取消'
        })
      }
      await window.whSSH.deleteFirewallRule({ sessionId: sessionId.value, rule: serializeFirewallRule(rule) })
      if (!options.silent) message.value = '防火墙规则已删除'
      if (options.reload !== false) await loadFirewallOverview()
      return true
    } catch (error) {
      if (error !== 'cancel') await reportError(error)
      return false
    }
  }

  async function removeFirewallRuleGroup(rule) {
    const rules = Array.isArray(rule?.duplicateRules) && rule.duplicateRules.length > 1 ? rule.duplicateRules : [rule]
    try {
      await ElMessageBox.confirm(`确认删除这组重复规则（${rules.length} 条）？`, '确认删除防火墙规则', {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消'
      })
    } catch (error) {
      return false
    }
    let removed = 0
    for (const item of rules) {
      const ok = await removeFirewallRule(item, { confirm: false, silent: true, reload: false })
      if (ok === false) break
      removed += 1
    }
    if (removed) message.value = removed === rules.length ? '防火墙规则已删除' : `已删除 ${removed} 条防火墙规则`
    await loadFirewallOverview()
    return removed === rules.length
  }

  function handleFirewallMenuCommand(row, command) {
    if (command === 'edit') return
    if (command === 'delete') return Array.isArray(row?.duplicateRules) && row.duplicateRules.length > 1 ? removeFirewallRuleGroup(row) : removeFirewallRule(row)
  }

  function toggleShowHiddenLocal() {
    showHiddenLocal.value = !showHiddenLocal.value
    loadLocalFiles(localPath.value, showHiddenLocal.value)
  }

  async function runContextAction(action, menuType, row) {
    if (await runFileContextAction(action, menuType, row)) return
    if (menuType === 'server-log') {
      if (!row?.path) return
      if (action === 'view-server-log') return openLogFile(row)
      if (action === 'tail-server-log') return toggleTail(row)
      if (action === 'delete-server-log') return deleteServerLog(row)
      return
    }
    if (menuType === 'database-root') {
      if (action === 'create-database') return createDatabase()
      if (action === 'import-database-sql') return importDatabaseSqlToDatabase()
      if (action === 'refresh-database-browser') return refreshDatabaseBrowser(true, { notify: true })
      return
    }
    if (menuType === 'database-db') {
      if (!row?.name) return
      if (action === 'create-database') return createDatabase()
      if (action === 'expand-database-tree') return toggleDatabaseTree(row.name)
      if (action === 'refresh-database-tree') return refreshDatabaseNode(row.name)
      if (action === 'export-database-sql') return exportDatabaseSqlFromDatabase(row.name)
      if (action === 'export-database-tables') return exportDatabaseTablesFromDatabase(row.name)
      if (action === 'import-database-table-sql') return importDatabaseTablesToDatabase(row.name)
      if (action === 'delete-database-tree') return deleteDatabaseTreeItem(row.name)
      return
    }
    if (menuType === 'database-table') {
      if (!row?.database || !row?.name) return
      if (action === 'open-database-table') return openDatabaseTreeTable(row.database, row)
      if (action === 'refresh-database-table') return refreshDatabaseTableNode(row.database, row)
      if (action === 'delete-database-table') return deleteDatabaseTableItem(row.database, row)
      if (action === 'export-database-table-sql') return exportDatabaseSqlFromTable(row.database, row.name)
      return
    }
    if (menuType === 'database-row') {
      if (!row) return
      if (action === 'edit-database-row') return openDatabaseRowDialog(row)
      if (action === 'delete-database-row') return deleteDatabasePreviewRow(row)
      return
    }
    if (menuType === 'database-schema-row') {
      if (!row) return
      if (action === 'add-database-column-after') return openCreateDatabaseColumnDialog(row)
      if (action === 'edit-database-column') return openDatabaseColumnDialog(row)
      if (action === 'delete-database-column') return deleteDatabaseSchemaColumn(row)
      return
    }
  }

  function startResize(event) {
    resizing.value = true
    const panel = event.currentTarget.parentElement
    const rect = panel.getBoundingClientRect()
    const move = moveEvent => {
      if (!resizing.value) return
      const ratio = ((moveEvent.clientX - rect.left) / rect.width) * 100
      leftPaneRatio.value = Math.min(72, Math.max(28, ratio))
    }
    const stop = () => {
      resizing.value = false
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', stop)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', stop)
  }

  function formatSize(size) {
    const value = Number(size || 0)
    if (!Number.isFinite(value) || value <= 0) return '-'
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
    let formatted = value
    let unitIndex = 0
    while (formatted >= 1024 && unitIndex < units.length - 1) {
      formatted /= 1024
      unitIndex += 1
    }
    const digits = formatted >= 100 || unitIndex === 0 ? 0 : formatted >= 10 ? 1 : 2
    return `${formatted.toFixed(digits).replace(/\.0+$/, '')} ${units[unitIndex]}`
  }

  function formatTime(value) {
    if (!value) return '-'
    return new Date(value).toLocaleString()
  }

  function formatRights(rights) {
    if (!rights) return ''
    if (typeof rights === 'string') return rights
    if (typeof rights !== 'object') return String(rights)
    const formatPart = part => {
      if (typeof part === 'string') return part
      if (!part || typeof part !== 'object') return String(part || '')
      return `${part.read ? 'r' : '-'}${part.write ? 'w' : '-'}${part.execute ? 'x' : '-'}`
    }
    if ('user' in rights || 'group' in rights || 'other' in rights || 'world' in rights) {
      return [rights.user, rights.group, rights.other ?? rights.world].map(formatPart).join('')
    }
    return formatPart(rights)
  }

  function isTypingTarget(target) {
    return !!target?.closest?.('input, textarea, [contenteditable="true"], .el-input, .el-textarea, .xterm, .el-message-box, .el-dialog')
  }

  function handleFileShortcut(event) {
    if (editor.value.open) {
      const ctrlOrMeta = event.ctrlKey || event.metaKey
      const key = String(event.key || '').toLowerCase()
      if (ctrlOrMeta && key === 's') {
        event.preventDefault()
        void saveEditor()
      } else if (ctrlOrMeta && key === 'f') {
        event.preventDefault()
        openEditorFind()
      } else if (ctrlOrMeta && key === 'h') {
        event.preventDefault()
        openEditorReplace()
      }
      return
    }

    if (activeMenu.value !== 'files') return
    if (isTypingTarget(event.target)) return
    if (loginVisible.value) return
    handleFilesPaneShortcut(event)
  }

  onMounted(async () => {
    await initializeAppActivation()
    void restorePortsPreferences()
    void loadConnections()
    void loadDatabaseConnections()
    void loadLocalRoots()
    remoteShortcuts.value = []
    syncWindowState()
    window.addEventListener('keydown', handleFileShortcut)
    window.addEventListener('resize', handleTerminalWindowResize)
    bindNativeContextMenuAction()
    stopLocalRefresh = window.whSSH.onLocalRefresh(payload => {
      loadLocalFiles(payload.path || localPath.value)
    })
    stopWindowStateChanged = window.whSSH.onWindowStateChanged(payload => {
      windowState.value = payload
    })
    stopTailData = window.whSSH.onTailData(payload => {
      if (payload.id !== tailId.value) return
      if (!tailPath.value || logViewer.value.path !== tailPath.value) return
      queueTailContent(payload.data)
    })
    stopTailClosed = window.whSSH.onTailClosed(payload => {
      if (payload.id !== tailId.value) return
      tailing.value = false
      tailId.value = ''
      tailPath.value = ''
    })
  })

  onBeforeUnmount(() => {
    flushPersistRemoteDirectoryAccessCache()
    disposeDatabaseSqlMonaco()
    disposeEditorMonaco()
    window.removeEventListener('keydown', handleFileShortcut)
    window.removeEventListener('resize', handleTerminalWindowResize)
    terminalResizeObserver && terminalResizeObserver.disconnect()
    if (terminalCommandCopyTimer) window.clearTimeout(terminalCommandCopyTimer)
    if (pendingTailFrame) window.cancelAnimationFrame(pendingTailFrame)
    pendingTailFrame = 0
    pendingTailContent = ''
    cleanupNativeContextMenuBridge()
    stopLocalRefresh && stopLocalRefresh()
    stopWindowStateChanged && stopWindowStateChanged()
    stopTerminalData && stopTerminalData()
    stopTerminalClosed && stopTerminalClosed()
    stopTerminalPaste && stopTerminalPaste()
    stopTailData && stopTailData()
    stopTailClosed && stopTailClosed()
    if (tailId.value) window.whSSH.stopTail(tailId.value)
    if (databaseConnectionId.value && typeof window.whSSH?.disconnectDatabase === 'function') {
      window.whSSH.disconnectDatabase(databaseConnectionId.value)
    }
  })
</script>
