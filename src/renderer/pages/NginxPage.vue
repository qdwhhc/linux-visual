<template>
  <section class="panel placeholder-panel page-section nginx-page">
    <div class="section-line page-hero-line">
      <div>
        <h3>Nginx 配置编辑</h3>
      </div>
      <div class="service-actions">
        <el-button
          v-for="action in activeHeaderActions"
          :key="action.key"
          :type="action.type || 'default'"
          plain
          :disabled="action.disabled"
          @click="action.handler"
        >
          {{ action.label }}
        </el-button>
      </div>
    </div>

    <div v-if="!isSSHSession" class="docker-help-box">
      当前连接方式不支持读取和编辑 Nginx 配置文件，请切换为 SSH 会话后再使用。
    </div>

    <div v-else class="nginx-layout" :class="{ 'nginx-layout--menu-collapsed': nginxMenuCollapsed }">
      <aside class="nginx-sidebar" :class="{ 'nginx-sidebar--collapsed': nginxMenuCollapsed }">
        <div class="nginx-sidebar-head">
          <strong>Nginx</strong>
          <button class="nginx-sidebar-toggle" type="button" :title="nginxMenuCollapsed ? '展开 Nginx 菜单' : '折叠 Nginx 菜单'" @click.stop="nginxMenuCollapsed = !nginxMenuCollapsed">
            <el-icon class="nginx-sidebar-toggle-icon">
              <Expand v-if="nginxMenuCollapsed" />
              <Fold v-else />
            </el-icon>
          </button>
        </div>

        <nav class="nginx-menu">
          <div v-for="item in menuItems" :key="item.key" class="nginx-menu-group">
            <button
              type="button"
              class="nginx-menu-item"
              :class="{ 'nginx-menu-item--active': activeMenu === item.key }"
              :title="nginxMenuCollapsed ? item.label : ''"
              @click="handleMenuChange(item.key)"
            >
              <el-icon class="nginx-menu-icon">
                <component :is="item.icon" />
              </el-icon>
              <strong v-show="!nginxMenuCollapsed">{{ item.label }}</strong>
            </button>
          </div>
        </nav>
      </aside>

      <main class="nginx-content" :class="{ 'nginx-content--source': activeMenu === 'source', 'nginx-content--compose': activeMenu === 'compose', 'nginx-content--ssl': activeMenu === 'ssl' }">
        <div v-if="menuContentLoading" class="nginx-content-loading-mask">
          <div class="nginx-content-loading-card">
            <span class="nginx-content-loading-spinner"></span>
            <strong>{{ menuContentLoadingText }}</strong>
          </div>
        </div>
        <section class="nginx-content-body">
          <article v-show="activeMenu === 'source'" class="nginx-card nginx-source-card">
            <div class="nginx-source-workbench">
              <div class="nginx-source-tree-pane">
                <div class="nginx-source-tree-head">
                  <strong>配置文件</strong>
                  <button type="button" :disabled="sourceTreeLoading || !props.connected || !props.isSSHSession" @click="refreshSourceTree({ notify: true })">刷新</button>
                </div>
                <form class="nginx-source-pathbar" @submit.prevent="openSourceDirectoryFromInput">
                  <RemotePathPicker v-model="sourceTreeRootPath" :connected="props.connected && props.isSSHSession" :session-id="props.sessionId" select-type="directory" placeholder="选择配置目录，例如 /etc/nginx" @confirm="openSourceDirectoryFromInput" />
                </form>
                <div class="nginx-source-tree-body" @contextmenu.prevent="openSourceTreePanelMenu">
                  <span v-if="sourceTreeLoading" class="nginx-source-tree-empty">正在读取配置树...</span>
                  <span v-else-if="sourceTreeError" class="nginx-source-tree-error">{{ sourceTreeError }}</span>
                  <template v-else-if="sourceTreeVisibleRows.length">
                    <button
                      v-for="row in sourceTreeVisibleRows"
                      :key="row.id"
                      type="button"
                      class="nginx-source-tree-row"
                      :class="{ 'nginx-source-tree-row--dir': row.type === 'directory', 'nginx-source-tree-row--file': row.type === 'file', 'nginx-source-tree-row--active': row.type === 'file' && isSameNginxPath(row.path, props.selectedNginxSiteEditor?.path || '') }"
                      :style="{ paddingLeft: `${10 + row.depth * 16}px` }"
                      :title="row.path"
                      :disabled="row.disabled"
                      @click="handleSourceTreeRowClick(row)"
                      @contextmenu.prevent.stop="openSourceTreeRowMenu($event, row)"
                    >
                      <span v-if="row.type === 'directory' && row.sourceKind !== 'main-file'" class="file-icon solid-folder-icon nginx-source-tree-folder"></span>
                      <el-icon v-else class="file-icon nginx-source-tree-file">
                        <Document />
                      </el-icon>
                      <span class="nginx-source-tree-name">{{ row.name }}</span>
                      <small v-if="row.type === 'file' && isSameNginxPath(row.path, props.selectedNginxSiteEditor?.path || '') && isSourceDirty">未保存</small>
                      <el-icon v-if="isSourceTreeExpandable(row)" class="nginx-source-tree-toggle">
                        <ArrowDown v-if="row.expanded" />
                        <ArrowRight v-else />
                      </el-icon>
                      <span v-else class="nginx-source-tree-toggle nginx-source-tree-toggle--empty"></span>
                    </button>
                  </template>
                  <span v-else class="nginx-source-tree-empty">当前目录为空，或尚未选择配置目录。</span>
                  <div v-if="sourceTreeContextMenu.visible" class="nginx-source-tree-context-menu" :style="buildSourceTreeContextMenuStyle()" @pointerdown.stop @contextmenu.prevent>
                    <button type="button" @click="createSourceTreeFileFromMenu">新建文件</button>
                    <button type="button" @click="createSourceTreeDirectoryFromMenu">新建文件夹</button>
                    <template v-if="sourceTreeContextMenu.node?.path">
                      <span></span>
                      <button type="button" @click="copySourceTreeNodePathFromMenu">复制路径</button>
                    </template>
                    <template v-if="sourceTreeContextMenu.node && !['main-file', 'source-root'].includes(sourceTreeContextMenu.node.sourceKind)">
                      <span></span>
                      <button type="button" @click="renameSourceTreeNodeFromMenu">重命名</button>
                      <button type="button" class="nginx-source-tree-context-danger" @click="deleteSourceTreeNodeFromMenu">删除</button>
                    </template>
                  </div>
                </div>
              </div>
              <div class="nginx-source-editor-pane">
                <div class="nginx-source-titlebar">
                  <strong>{{ currentSiteFilePath }}</strong>
                  <span>{{ sourceDirtyLabel }} · {{ sourceLineCount }} 行</span>
                </div>
                <div :ref="setSourceMonacoRef" class="nginx-source-monaco editor-monaco"></div>
              </div>
            </div>

          </article>

          <template v-if="activeMenu === 'topology'">
            <article class="nginx-card nginx-topology-card">
              <div class="nginx-topology-mode-switch">
                <button type="button" :class="{ 'nginx-topology-mode-switch--active': topologyMode === 'traffic' }" @click="topologyMode = 'traffic'">流量视图</button>
                <button type="button" :class="{ 'nginx-topology-mode-switch--active': topologyMode === 'files' }" @click="topologyMode = 'files'">文件视图</button>
              </div>
              <div ref="topologyCanvasRef" class="nginx-topology-canvas" :class="{ 'nginx-topology-canvas--connecting': topologyConnectionDraft }" @pointerdown="handleTopologyCanvasPointerDown" @pointermove="handleTopologyCanvasPointerMove" @wheel="handleTopologyCanvasWheel">
                <div class="nginx-topology-graph-space" :style="buildTopologyGraphSpaceStyle()">
                  <div ref="topologyGraphSurfaceRef" class="nginx-topology-graph-surface" :style="buildTopologyGraphSurfaceStyle()">
                    <svg class="nginx-topology-lines" :width="topologyCanvasSize.width" :height="topologyCanvasSize.height" aria-hidden="true">
                      <path
                        v-for="edge in topologyGraphEdges"
                        :key="edge.id"
                        class="nginx-topology-line"
                        :class="[`nginx-topology-line--${edge.kind}`, { 'nginx-topology-line--selected': selectedTopologyEdgeId === edge.id, 'nginx-topology-line--port-active': isTopologyEdgeConnectedToSelectedPort(edge) }]"
                        :style="buildTopologyEdgeStyle(edge)"
                        :d="buildTopologyEdgePath(edge)"
                        @pointerdown.stop="selectTopologyEdge(edge)"
                      />
                      <path v-if="topologyConnectionDraft" class="nginx-topology-line nginx-topology-line--draft" :d="topologyDraftPath" />
                      <circle v-if="topologyConnectionDraft" class="nginx-topology-draft-port" :cx="topologyPointer.x" :cy="topologyPointer.y" r="8" />
                    </svg>

                    <div
                      v-for="node in topologyGraphNodes"
                      :key="node.id"
                      class="nginx-topology-node"
                      :class="[`nginx-topology-node--${node.type}`, { 'nginx-topology-node--active': node.site?.path === selectedNginxSitePath }]"
                      :style="buildTopologyNodeStyle(node)"
                      @pointerdown="startTopologyNodeDrag($event, node)"
                      @pointerup="handleTopologyNodePointerUp($event, node)"
                      @click="handleTopologyNodeClick(node)"
                      @contextmenu.prevent="openTopologyNodeMenu($event, node)"
                    >
                      <div class="nginx-topology-node-head">
                        <span class="nginx-topology-node-icon" :class="`nginx-topology-node-icon--${getTopologyNodeIconType(node)}`" aria-hidden="true"></span>
                        <div>
                          <strong>{{ node.title }}</strong>
                          <small>{{ node.badge }}</small>
                        </div>
                      </div>
                      <div class="nginx-topology-port-rows">
                        <button
                          v-for="port in buildTopologyNodePortRows(node)"
                          :key="port.key"
                          type="button"
                          class="nginx-topology-port-row"
                          :class="[`nginx-topology-port-row--${port.side}`, { 'nginx-topology-port-row--connected': isTopologyPortConnected(node, port), 'nginx-topology-port-row--selected': isTopologyPortSelected(node, port) }]"
                          :style="buildTopologyPortRowStyle(port)"
                          :data-topology-port-key="getTopologyPortSelectionKey(node, port)"
                          :aria-label="port.side === 'in' ? '连接输入' : '拖出连接'"
                          @pointerdown.stop="startTopologyPortDrag($event, node, port)"
                          @pointerup.stop="finishTopologyConnectionAtPort(node, port)"
                          @click.stop="selectTopologyPort(node, port)"
                        >
                          <i v-if="port.side === 'in'"></i>
                          <span>{{ port.label }}</span>
                          <em>{{ port.hint }}</em>
                          <i v-if="port.side === 'out'"></i>
                        </button>
                      </div>
                    </div>
                    <span
                      v-for="endpoint in topologyEdgeEndpoints"
                      :key="endpoint.id"
                      class="nginx-topology-edge-endpoint"
                      :class="{ 'nginx-topology-edge-endpoint--active': endpoint.active }"
                      :style="buildTopologyEndpointStyle(endpoint)"
                    ></span>
                  </div>
                </div>
              </div>
              <div class="nginx-topology-zoom-tools" aria-label="拓扑缩放控制">
                <button type="button" aria-label="放大拓扑" @click="adjustTopologyZoom(TOPOLOGY_ZOOM_STEP)">+</button>
                <button type="button" aria-label="缩小拓扑" @click="adjustTopologyZoom(-TOPOLOGY_ZOOM_STEP)">-</button>
                <span>{{ topologyZoomLabel }}</span>
              </div>
              <div v-if="topologyContextMenu.visible" class="nginx-topology-context-menu" :style="buildTopologyContextMenuStyle()" @pointerdown.stop>
                <button type="button" @click="addTopologyNodeFromMenu">添加节点</button>
                <button type="button" :disabled="!topologyContextMenu.node?.site?.path" @click="editTopologyNodeSource(topologyContextMenu.node)">源码编辑</button>
                <button type="button" @click="editTopologyNodeVisual(topologyContextMenu.node)">视图编辑</button>
                <button type="button" :disabled="topologyContextMenu.node?.id === 'main'" @click="deleteTopologyNodeFromMenu">删除节点</button>
              </div>
            </article>
          </template>

          <template v-else-if="activeMenu === 'compose'">
            <article class="nginx-card nginx-compose-card">
              <NginxComposeCanvas
                :refs="composeCanvasRefs"
                :canvas="composeCanvasView"
                :edges="composeCanvasEdges"
                :nodes="composeCanvasNodes"
                :node-actions="composeCanvasNodeActions"
                :include-files="composeCanvasIncludeFiles"
                :zoom="composeCanvasZoom"
              />
            </article>
          </template>

          <template v-else-if="activeMenu === 'system'">
            <article class="nginx-card nginx-ssl-table-card">
              <div class="nginx-card-head">
                <strong>系统设置</strong>
                <span>设置 Nginx 根目录、主配置入口和扫描路径，保存后用于源码视图与配置编排。</span>
              </div>

              <div class="nginx-form-grid">
                <label class="nginx-field nginx-field--wide">
                  <span>Nginx 根目录</span>
                  <RemotePathPicker v-model="systemForm.nginxHome" :connected="connected && isSSHSession" :session-id="sessionId" select-type="directory" placeholder="例如 /etc/nginx" />
                </label>
                <label class="nginx-field nginx-field--wide">
                  <span>主配置文件</span>
                  <input v-model.trim="systemForm.mainConfigPath" placeholder="例如 /etc/nginx/nginx.conf" />
                </label>
                <label class="nginx-field nginx-field--wide">
                  <span>备份目录 <em>保存配置前的备份文件会放到这里</em></span>
                  <RemotePathPicker v-model="systemForm.backupDir" :connected="connected && isSSHSession" :session-id="sessionId" select-type="directory" placeholder="例如 /www/backup/nginx" />
                </label>
                <div class="nginx-settings-summary nginx-field--wide">
                  <div>
                    <strong>{{ systemScanSummary.fileCount }}</strong>
                    <span>配置文件</span>
                  </div>
                  <div>
                    <strong>{{ systemScanSummary.serverCount }}</strong>
                    <span>server</span>
                  </div>
                  <div>
                    <strong>{{ systemScanSummary.httpsCount }}</strong>
                    <span>HTTPS</span>
                  </div>
                  <div>
                    <strong>{{ mainConfigStatusLabel }}</strong>
                    <span>主配置</span>
                  </div>
                </div>
                <label class="nginx-field nginx-field--wide">
                  <span>扫描路径 <em>可留空；每行一个绝对路径，支持 *.conf 通配</em></span>
                  <textarea v-model="systemForm.scanPaths" rows="8" placeholder="例如：/etc/nginx/conf.d/*.conf&#10;/opt/nginx/conf/*.conf&#10;/data/apps/nginx/vhosts/*"></textarea>
                </label>
                <div v-if="nginxTopologyError" class="nginx-settings-warning nginx-field--wide">{{ nginxTopologyError }}</div>
              </div>
            </article>
          </template>

          <template v-else-if="activeMenu === 'ssl'">
            <article class="nginx-card">
              <div class="nginx-card-head nginx-card-head--row">
                <div>
                  <strong>证书管理</strong>
                  <span>统一查看当前 Nginx 引用证书、手动添加证书和申请后的目标证书。</span>
                </div>
                <button type="button" class="nginx-ssl-add-button" :disabled="!props.connected || !props.isSSHSession" @click="openSslCertificateDrawer">添加证书</button>
              </div>

              <div class="nginx-ssl-summary">
                <div>
                  <strong>{{ sslOverview.totalCount }}</strong>
                  <span>全部证书</span>
                </div>
                <div>
                  <strong>{{ sslOverview.normalCount }}</strong>
                  <span>正常证书</span>
                </div>
                <div>
                  <strong>{{ sslOverview.warningCount }}</strong>
                  <span>即将过期</span>
                </div>
                <div>
                  <strong>{{ sslOverview.expiredCount }}</strong>
                  <span>已过期/异常</span>
                </div>
              </div>
            </article>

            <article class="nginx-card nginx-ssl-list-card">
              <div class="nginx-card-head nginx-card-head--row">
                <div>
                  <strong>证书列表</strong>
                  <span>表格展示当前 Nginx 引用证书和手动添加的证书，状态来自服务器 openssl。</span>
                </div>
                <div class="nginx-ssl-table-tools">
                  <button type="button" :disabled="!props.connected || !props.isSSHSession || sslStatusLoading" @click="refreshSslCertificateStatuses({ notify: true })">{{ sslStatusLoading ? '读取中...' : '刷新状态' }}</button>
                  <button type="button" :disabled="!props.connected || !props.isSSHSession" @click="props.runNginxAction?.('test')">语法校验</button>
                  <button type="button" class="nginx-ssl-actions-primary" :disabled="!props.connected || !props.isSSHSession" @click="props.runNginxAction?.('reload')">重载 Nginx</button>
                </div>
              </div>

              <div v-if="sslStatusError" class="nginx-settings-warning">{{ sslStatusError }}</div>
              <div v-if="sslCertificateRows.length" class="nginx-ssl-table-wrap">
                <el-table border height="100%" :data="pagedSslCertificateRows" :show-overflow-tooltip="tableTooltipOptions" row-key="id" class="manage-table nginx-ssl-el-table" empty-text="暂无证书数据">
                  <el-table-column prop="title" label="名称" min-width="150" />
                  <el-table-column prop="domainText" label="域名" min-width="150" />
                  <el-table-column label="状态" min-width="150">
                    <template #default="{ row }">
                      <span class="nginx-ssl-status-text" :class="`nginx-ssl-status-text--${row.status.status}`">{{ row.status.statusText }}</span>
                    </template>
                  </el-table-column>
                  <el-table-column prop="certPath" label="证书路径" min-width="150" />
                  <el-table-column prop="keyPath" label="私钥路径" min-width="150" />
                  <el-table-column label="到期时间" min-width="150">
                    <template #default="{ row }">{{ formatSslExpiresAt(row.status) }}</template>
                  </el-table-column>
                  <el-table-column prop="sourceText" label="来源" min-width="150" />
                  <el-table-column label="操作" width="110" align="left" fixed="right">
                    <template #default="{ row }">
                      <div class="dropdown-actions" @click.stop>
                        <el-dropdown trigger="click" @command="handleSslRowMenuCommand(row, $event)">
                          <button class="table-action-more-link" type="button">更多</button>
                          <template #dropdown>
                            <el-dropdown-menu>
                              <el-dropdown-item command="detail">查看详情</el-dropdown-item>
                              <el-dropdown-item command="refresh" :disabled="!props.connected || !props.isSSHSession">刷新状态</el-dropdown-item>
                              <el-dropdown-item command="renew-dry-run" :disabled="!props.connected || !props.isSSHSession || !canRenewSslRow(row)">试运行续签</el-dropdown-item>
                              <el-dropdown-item command="renew" :disabled="!props.connected || !props.isSSHSession || !canRenewSslRow(row)">续签</el-dropdown-item>
                              <el-dropdown-item command="sync" :disabled="!props.connected || !props.isSSHSession || !row.targetDir">同步到目录</el-dropdown-item>
                              <el-dropdown-item command="source" :disabled="!row.filePath">打开配置</el-dropdown-item>
                              <el-dropdown-item v-if="row.recordId" command="remove">删除记录</el-dropdown-item>
                            </el-dropdown-menu>
                          </template>
                        </el-dropdown>
                      </div>
                    </template>
                  </el-table-column>
                </el-table>
              </div>
              <div v-if="sslCertificateRows.length" class="nginx-ssl-pagination">
                <span>共 {{ sslCertificateRows.length }} 条</span>
                <select v-model.number="sslCertificatePageSize">
                  <option v-for="size in sslCertificatePageSizes" :key="size" :value="size">{{ size }} 条/页</option>
                </select>
                <button type="button" :disabled="sslCertificatePage <= 1" @click="sslCertificatePage -= 1">上一页</button>
                <button
                  v-for="page in visibleSslCertificatePages"
                  :key="page"
                  type="button"
                  :class="{ 'nginx-ssl-pagination-page--active': page === sslCertificatePage }"
                  @click="sslCertificatePage = page"
                >
                  {{ page }}
                </button>
                <button type="button" :disabled="sslCertificatePage >= sslCertificatePageCount" @click="sslCertificatePage += 1">下一页</button>
                <label>
                  跳至
                  <input v-model.number="sslCertificatePageInput" type="number" min="1" :max="sslCertificatePageCount" @keydown.enter="jumpSslCertificatePage" />
                  页
                </label>
              </div>
              <div v-else class="nginx-empty-box">还没有证书记录。可以从 Nginx HTTPS 配置中扫描，也可以点击“添加证书”手动添加或申请 SSL。</div>

              <div v-if="sslActionOutput" class="nginx-ssl-output">
                <strong>最近执行输出</strong>
                <pre>{{ sslActionOutput }}</pre>
              </div>
            </article>
          </template>

          <template v-else-if="activeMenu === 'source'"></template>

          <template v-else>
            <div class="nginx-empty-box">请选择左侧菜单。</div>
          </template>
        </section>
      </main>
    </div>

    <el-dialog v-model="sourceTreePathDialog.visible" :title="sourceTreePathDialog.title" width="460px" class="nginx-source-path-dialog" @closed="cancelSourceTreePathDialog">
      <div class="nginx-source-path-dialog-body">
        <span>{{ sourceTreePathDialog.message }}</span>
        <input
          v-model.trim="sourceTreePathDialog.value"
          :placeholder="sourceTreePathDialog.placeholder"
          @keydown.enter.prevent="submitSourceTreePathDialog"
        />
        <small v-if="sourceTreePathDialog.baseDir">当前目录：{{ sourceTreePathDialog.baseDir }}</small>
      </div>
      <template #footer>
        <div class="nginx-source-path-dialog-actions">
          <button type="button" @click="cancelSourceTreePathDialog">取消</button>
          <button type="button" class="nginx-source-path-dialog-primary" :disabled="!canSubmitSourceTreePathDialog" @click="submitSourceTreePathDialog">确定</button>
        </div>
      </template>
    </el-dialog>

    <el-drawer v-model="sslDrawerVisible" direction="rtl" size="520px" title="添加 SSL 证书" class="nginx-ssl-drawer">
      <div class="nginx-drawer-content nginx-ssl-drawer-content">
        <div class="nginx-ssl-mode-tabs">
          <button type="button" :class="{ 'nginx-ssl-mode-tab--active': sslAddForm.mode === 'manual' }" @click="sslAddForm.mode = 'manual'">手动添加路径</button>
          <button type="button" :class="{ 'nginx-ssl-mode-tab--active': sslAddForm.mode === 'request' }" @click="sslAddForm.mode = 'request'">申请 SSL</button>
        </div>

        <div v-if="sslAddForm.mode === 'manual'" class="nginx-form-grid nginx-form-grid--single">
          <label class="nginx-field">
            <span>证书名称</span>
            <input v-model.trim="sslAddForm.name" placeholder="例如 example.com 生产证书" />
          </label>
          <label class="nginx-field">
            <span>域名备注 <em>可选，多个域名用空格或逗号分隔</em></span>
            <textarea v-model.trim="sslAddForm.domains" rows="3" placeholder="example.com www.example.com"></textarea>
          </label>
          <label class="nginx-field">
            <span>证书路径</span>
            <RemotePathPicker v-model="sslAddForm.certPath" :connected="connected && isSSHSession" :session-id="sessionId" select-type="file" placeholder="例如 /www/ssl/example.com/fullchain.pem" />
          </label>
          <label class="nginx-field">
            <span>私钥路径</span>
            <RemotePathPicker v-model="sslAddForm.keyPath" :connected="connected && isSSHSession" :session-id="sessionId" select-type="file" placeholder="例如 /www/ssl/example.com/privkey.pem" />
          </label>
          <label class="nginx-field">
            <span>同步目标目录 <em>可选，用于后续同步</em></span>
            <RemotePathPicker v-model="sslAddForm.targetDir" :connected="connected && isSSHSession" :session-id="sessionId" select-type="directory" placeholder="例如 /www/ssl/example.com" />
          </label>
        </div>

        <div v-else class="nginx-form-grid nginx-form-grid--single">
          <label class="nginx-field">
            <span>申请域名 <em>多个域名可用空格、逗号或换行分隔</em></span>
            <textarea v-model.trim="sslAddForm.domains" rows="3" placeholder="example.com www.example.com"></textarea>
          </label>
          <label class="nginx-field">
            <span>申请后同步目录 <em>可选，不填则使用 certbot 默认目录</em></span>
            <RemotePathPicker v-model="sslAddForm.targetDir" :connected="connected && isSSHSession" :session-id="sessionId" select-type="directory" placeholder="例如 /www/ssl/example.com" />
          </label>
          <label class="nginx-field nginx-field--wide">
            <span>命令预览</span>
            <textarea :value="sslDrawerCommandPreview" rows="5" readonly></textarea>
          </label>
        </div>

        <div class="nginx-ssl-drawer-actions">
          <button type="button" :disabled="sslRequestRunning" @click="closeSslCertificateDrawer">取消</button>
          <button type="button" class="nginx-ssl-actions-primary" :disabled="!canSubmitSslAddForm || sslRequestRunning" @click="submitSslCertificateDrawer">{{ sslAddForm.mode === 'request' ? (sslRequestRunning ? '申请中...' : '申请并添加') : '添加证书' }}</button>
        </div>
      </div>
    </el-drawer>

    <el-drawer v-model="sslDetailDrawerVisible" direction="rtl" size="560px" title="证书详情" class="nginx-ssl-drawer">
      <div v-if="activeSslDetailRow" class="nginx-drawer-content nginx-ssl-detail-content">
        <div class="nginx-drawer-headline">
          <span class="nginx-topology-node-icon nginx-topology-node-icon--server" aria-hidden="true"></span>
          <div>
            <strong>{{ activeSslDetailRow.title }}</strong>
            <span>{{ activeSslDetailRow.domainText || '未识别域名' }}</span>
          </div>
        </div>
        <div class="nginx-drawer-grid nginx-ssl-detail-grid">
          <label>状态</label>
          <span>{{ activeSslDetailRow.status.statusText }}</span>
          <label>证书路径</label>
          <span>{{ activeSslDetailRow.certPath || '-' }}</span>
          <label>私钥路径</label>
          <span>{{ activeSslDetailRow.keyPath || '-' }}</span>
          <label>私钥检查</label>
          <span>{{ activeSslDetailRow.status.keyExists === false ? '私钥文件不存在' : activeSslDetailRow.status.keyExists === true ? '私钥文件存在' : '未检查' }}</span>
          <label>到期时间</label>
          <span>{{ formatSslExpiresAt(activeSslDetailRow.status) }}</span>
          <label>签发者</label>
          <span>{{ activeSslDetailRow.status.issuer || '-' }}</span>
          <label>SAN</label>
          <span>{{ formatSslSan(activeSslDetailRow.status) }}</span>
          <label>来源</label>
          <span>{{ activeSslDetailRow.sourceText }}</span>
          <label>引用位置</label>
          <span>{{ activeSslDetailRow.referenceText || '-' }}</span>
          <label>同步目录</label>
          <span>{{ activeSslDetailRow.targetDir || '-' }}</span>
        </div>
        <div class="nginx-inline-actions">
          <el-button plain size="small" :disabled="!activeSslDetailRow.filePath" @click="openSslReferenceSource(activeSslDetailRow)">打开配置</el-button>
          <el-button plain size="small" :disabled="!props.connected || !props.isSSHSession" @click="refreshSslCertificateStatuses({ notify: true })">刷新状态</el-button>
        </div>
      </div>
    </el-drawer>

    <el-drawer v-model="topologyDrawerVisible" direction="rtl" size="380px" :title="topologyDrawerTitle" class="nginx-topology-drawer">
      <div v-if="activeTopologyNode" class="nginx-drawer-content">
        <div class="nginx-drawer-headline">
          <span class="nginx-topology-node-icon" :class="`nginx-topology-node-icon--${getTopologyNodeIconType(activeTopologyNode)}`" aria-hidden="true"></span>
          <div>
            <strong>{{ activeTopologyNode.title }}</strong>
            <span>{{ activeTopologyNode.badge }}</span>
          </div>
        </div>
        <div class="nginx-drawer-grid">
          <label>类型</label>
          <span>{{ activeTopologyNode.badge || '-' }}</span>
          <label>路径/规则</label>
          <span>{{ activeTopologyNode.subtitle || activeTopologyNode.group?.include || '-' }}</span>
          <label>节点 ID</label>
          <span>{{ activeTopologyNode.id }}</span>
          <label>Server 数量</label>
          <span>{{ activeTopologyNode.servers?.length || activeTopologyNode.site?.serverCount || 0 }}</span>
        </div>
        <div v-if="activeTopologyNode.servers?.length" class="nginx-drawer-section">
          <strong>Server 摘要</strong>
          <div v-for="server in activeTopologyNode.servers" :key="server.id" class="nginx-drawer-server">
            <span>{{ server.title }}</span>
            <small>{{ server.listens?.join(', ') || 'listen 未设置' }}</small>
          </div>
        </div>
        <div class="nginx-inline-actions">
          <el-button plain size="small" :disabled="!activeTopologyNode.site?.path" @click="editTopologyNodeSource(activeTopologyNode)">源码编辑</el-button>
          <el-button plain size="small" @click="editTopologyNodeVisual(activeTopologyNode)">视图编辑</el-button>
        </div>
      </div>
    </el-drawer>

    <el-drawer v-model="sourceHistoryDrawerVisible" direction="rtl" size="420px" title="历史记录" class="nginx-source-history-drawer">
      <div class="nginx-source-history">
        <div class="nginx-source-history-head">
          <strong>编辑历史</strong>
          <span>自动写入过的文件会记录在这里。</span>
        </div>
        <div v-if="sourceHistoryItems.length" class="nginx-source-history-list">
          <div
            v-for="site in sourceHistoryItems"
            :key="site.path"
            class="nginx-source-history-item"
            :class="{ 'nginx-source-history-item--active': isSameNginxPath(site.path, selectedNginxSitePath) }"
            @click="openSourceHistorySite(site)"
          >
            <div>
              <strong>{{ site.label || site.name || formatPathBasename(site.path) }}</strong>
              <span>{{ site.path }}</span>
              <small v-if="site.editedAt">{{ formatSourceHistoryTime(site.editedAt) }}</small>
            </div>
            <button type="button" class="nginx-source-history-remove" title="从历史记录删除" @click.stop="removeSourceHistoryItem(site.path)">×</button>
          </div>
        </div>
        <div v-else class="nginx-empty-box">还没有编辑历史。源码编辑器自动写入文件后会记录在这里。</div>
      </div>
    </el-drawer>
  </section>
</template>

<script setup>
  import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { ArrowDown, ArrowRight, Connection, Document, Expand, Fold, Grid, Setting, Tickets } from '@element-plus/icons-vue'
  import RemotePathPicker from '../components/common/RemotePathPicker.vue'
  import NginxComposeCanvas from '../components/nginx/NginxComposeCanvas.vue'
  import { parseLocationBlock, parseServerBlock } from '../composables/useNginxManager.js'
  import { NGINX_COMPOSE_FIELD_SCHEMA, getNginxComposeCatalogEntriesForContext, getNginxComposeFieldSchema, getNginxComposeFieldsForContext, getNginxComposeGroupInfo } from '../nginxDirectiveCatalog.js'

  const props = defineProps([
    'connected',
    'sessionId',
    'isSSHSession',
    'loadNginxSites',
    'selectNginxSite',
    'updateSelectedNginxCode',
    'parseSelectedNginxCode',
    'saveSelectedNginxSite',
    'saveAndRunNginxAction',
    'runNginxAction',
    'openSelectedNginxSiteInEditor',
    'sslDomain',
    'nginxSites',
    'selectedNginxSitePath',
    'selectedNginxSiteEditor',
    'tableTooltipOptions'
  ])

  const emit = defineEmits(['update:sslDomain'])

  const menuItems = [
    { key: 'system', label: '系统设置', icon: Setting, description: '目录与读取路径', detail: '维护主配置、备份目录和可选扫描路径。' },
    { key: 'ssl', label: '证书管理', icon: Tickets, description: '证书申请与续签', detail: '维护域名申请、证书目录、续签方式以及当前 HTTPS server 的证书引用。' },
    { key: 'source', label: '源码视图', icon: Document, description: '直接编辑配置源码', detail: '把源码入口单独保留，用于处理表单未覆盖的高级配置。' },
    { key: 'compose', label: '配置编排', icon: Connection || Grid, description: '节点表单编辑', detail: '把 nginx.conf、http、server、location 等配置块做成可连接的表单节点。' }
  ]

  const fieldLabelMap = {
    user: '运行用户',
    worker_processes: '工作进程数',
    worker_rlimit_nofile: '打开文件限制',
    pid: 'PID 文件路径',
    load_module: '加载模块',
    env: '环境变量',
    daemon: '后台运行',
    include: '包含配置',
    error_log: '错误日志',
    worker_connections: '连接数上限',
    multi_accept: '批量接收连接',
    use: '事件模型',
    accept_mutex: '连接互斥锁',
    default_type: '默认类型',
    types_hash_max_size: '类型哈希大小',
    sendfile: '高效传输',
    tcp_nopush: 'TCP_NOPUSH',
    tcp_nodelay: 'TCP_NODELAY',
    keepalive_timeout: '长连接超时',
    client_body_timeout: '请求体超时',
    client_header_timeout: '请求头超时',
    send_timeout: '发送超时',
    client_max_body_size: '请求体大小限制',
    server_tokens: '版本暴露',
    log_format: '日志格式',
    gzip: 'Gzip 压缩',
    gzip_comp_level: 'Gzip 级别',
    gzip_types: 'Gzip 类型',
    access_log: '访问日志',
    charset: '字符集',
    add_header: '响应头',
    rewrite: '重写规则',
    set: '变量设置',
    server_name: '服务名',
    root: '网站目录',
    index: '默认首页',
    ssl_certificate: '证书路径',
    ssl_certificate_key: '私钥路径',
    return: '跳转规则',
    modifier: '匹配类型',
    path: '访问路径',
    mode: '处理模式',
    pathDirective: '目录策略',
    alias: '别名目录',
    try_files: '兜底规则',
    proxy_pass: '代理地址',
    proxy_set_header: '代理请求头',
    proxy_redirect: '代理重定向',
    proxy_read_timeout: '代理读取超时',
    proxy_connect_timeout: '代理连接超时',
    proxy_send_timeout: '代理发送超时',
    fastcgi_pass: 'FastCGI 地址',
    fastcgi_param: 'FastCGI 参数',
    expires: '缓存过期',
    auth_basic: '基础认证',
    auth_basic_user_file: '认证文件',
    allow: '允许访问',
    deny: '拒绝访问',
    raw: '原始配置'
  }

  const switchOptions = [{ value: '', label: '未设置' }, { value: 'on', label: 'on' }, { value: 'off', label: 'off' }]

  const mainFieldSchema = [
    { key: 'load_module', type: 'textarea', rows: 3, wide: true },
    { key: 'user', type: 'input' },
    { key: 'worker_processes', type: 'input' },
    { key: 'worker_rlimit_nofile', type: 'input' },
    { key: 'pid', type: 'input' },
    { key: 'error_log', type: 'textarea', rows: 3, wide: true },
    { key: 'env', type: 'textarea', rows: 3, wide: true },
    { key: 'daemon', type: 'select', options: switchOptions },
    { key: 'include', type: 'textarea', rows: 3, wide: true },
    { key: 'raw', type: 'textarea', rows: 4, wide: true }
  ]

  const eventsFieldSchema = [
    { key: 'worker_connections', type: 'input' },
    { key: 'multi_accept', type: 'input' },
    { key: 'use', type: 'input' },
    { key: 'accept_mutex', type: 'select', options: switchOptions },
    { key: 'raw', type: 'textarea', rows: 4, wide: true }
  ]

  const httpTemplateFieldSchema = [
    { key: 'include', type: 'textarea', rows: 3, wide: true },
    { key: 'default_type', type: 'input' },
    { key: 'types_hash_max_size', type: 'input' },
    { key: 'sendfile', type: 'select', options: switchOptions },
    { key: 'tcp_nopush', type: 'select', options: switchOptions },
    { key: 'tcp_nodelay', type: 'select', options: switchOptions },
    { key: 'keepalive_timeout', type: 'input' },
    { key: 'client_max_body_size', type: 'input' },
    { key: 'client_body_timeout', type: 'input' },
    { key: 'client_header_timeout', type: 'input' },
    { key: 'send_timeout', type: 'input' },
    { key: 'server_tokens', type: 'select', options: switchOptions },
    { key: 'gzip', type: 'select', options: switchOptions },
    { key: 'gzip_comp_level', type: 'input' },
    { key: 'gzip_types', type: 'textarea', rows: 3, wide: true },
    { key: 'log_format', type: 'textarea', rows: 4, wide: true },
    { key: 'access_log', type: 'textarea', rows: 3, wide: true },
    { key: 'error_log', type: 'textarea', rows: 3, wide: true },
    { key: 'raw', type: 'textarea', rows: 5, wide: true }
  ]

  const templateServerFieldSchema = [
    { key: 'server_name', type: 'textarea', rows: 3, wide: true },
    { key: 'root', type: 'input' },
    { key: 'index', type: 'textarea', rows: 3, wide: true },
    { key: 'charset', type: 'input' },
    { key: 'include', type: 'textarea', rows: 3, wide: true },
    { key: 'add_header', type: 'textarea', rows: 3, wide: true },
    { key: 'rewrite', type: 'textarea', rows: 3, wide: true },
    { key: 'set', type: 'textarea', rows: 3, wide: true },
    { key: 'access_log', type: 'textarea', rows: 3, wide: true },
    { key: 'error_log', type: 'textarea', rows: 3, wide: true },
    { key: 'ssl_certificate', type: 'input' },
    { key: 'ssl_certificate_key', type: 'input' },
    { key: 'return', type: 'input', wide: true },
    { key: 'client_max_body_size', type: 'input' },
    { key: 'raw', type: 'textarea', rows: 5, wide: true }
  ]

  const templateLocationFieldSchema = [
    { key: 'modifier', type: 'select', options: [{ value: '', label: 'prefix' }, { value: '=', label: '=' }, { value: '^~', label: '^~' }, { value: '~', label: '~' }, { value: '~*', label: '~*' }] },
    { key: 'path', type: 'input' },
    { key: 'mode', type: 'select', options: [{ value: 'proxy', label: 'proxy' }, { value: 'static', label: 'static' }, { value: 'redirect', label: 'redirect' }, { value: 'custom', label: 'custom' }] },
    { key: 'pathDirective', type: 'select', options: [{ value: 'root', label: 'root' }, { value: 'alias', label: 'alias' }] },
    { key: 'root', type: 'input' },
    { key: 'alias', type: 'input' },
    { key: 'index', type: 'textarea', rows: 3, wide: true },
    { key: 'try_files', type: 'input' },
    { key: 'proxy_pass', type: 'input', wide: true },
    { key: 'proxy_set_header', type: 'textarea', rows: 4, wide: true },
    { key: 'proxy_redirect', type: 'input' },
    { key: 'proxy_read_timeout', type: 'input' },
    { key: 'proxy_connect_timeout', type: 'input' },
    { key: 'proxy_send_timeout', type: 'input' },
    { key: 'fastcgi_pass', type: 'input', wide: true },
    { key: 'fastcgi_param', type: 'textarea', rows: 4, wide: true },
    { key: 'expires', type: 'input' },
    { key: 'auth_basic', type: 'input' },
    { key: 'auth_basic_user_file', type: 'input' },
    { key: 'allow', type: 'textarea', rows: 3, wide: true },
    { key: 'deny', type: 'textarea', rows: 3, wide: true },
    { key: 'add_header', type: 'textarea', rows: 3, wide: true },
    { key: 'rewrite', type: 'textarea', rows: 3, wide: true },
    { key: 'return', type: 'input', wide: true },
    { key: 'include', type: 'textarea', rows: 3, wide: true },
    { key: 'raw', type: 'textarea', rows: 5, wide: true }
  ]

  const activeMenu = ref('system')
  const nginxMenuCollapsed = ref(false)
  const menuContentLoading = ref(false)
  const menuContentLoadingText = computed(() => {
    if (activeMenu.value === 'compose' && composeRefreshLoading.value) return '正在重新读取 Nginx 配置...'
    if (activeMenu.value === 'compose') return '正在加载配置编排...'
    if (activeMenu.value === 'topology') return '正在加载拓扑视图...'
    if (activeMenu.value === 'ssl') return '正在加载证书信息...'
    if (activeMenu.value === 'source') return '正在加载源码视图...'
    return '正在加载...'
  })
  const activeProtocol = ref('http')
  const activeServerId = ref('')
  const activeTemplateServerId = ref('')
  const activeTemplateLocationId = ref('')
  const sourceMonacoRef = ref(null)
  const sourcePathInput = ref('')
  const sourceTreeRootPath = ref('/etc/nginx')
  const sourceTreeNodes = ref([])
  const sourceTreeLoading = ref(false)
  const sourceTreeError = ref('')
  const sourceAutoSaveState = ref('idle')
  const sourceTreeContextMenu = reactive({ visible: false, x: 0, y: 0, node: null })
  const sourceTreePathDialog = reactive({ visible: false, title: '', message: '', placeholder: '', value: '', baseDir: '', resolver: null })
  const sourceTreePathDialogTargetPath = computed(() => resolveSourceTreeInputPath(sourceTreePathDialog.value, sourceTreePathDialog.baseDir))
  const canSubmitSourceTreePathDialog = computed(() => !!String(sourceTreePathDialog.value || '').trim() && sourceTreePathDialogTargetPath.value.startsWith('/') && sourceTreePathDialogTargetPath.value !== '/')
  const topologyCanvasRef = ref(null)
  const topologyGraphSurfaceRef = ref(null)
  const composeCanvasRef = ref(null)
  const composeSurfaceRef = ref(null)

  function setComposeCanvasRef(element) {
    composeCanvasRef.value = element || null
  }

  function setComposeSurfaceRef(element) {
    composeSurfaceRef.value = element || null
  }

  const composeCanvasRefs = {
    setCanvasRef: setComposeCanvasRef,
    setSurfaceRef: setComposeSurfaceRef
  }

  const composeCanvasView = computed(() => ({
    dragState: composeDragState.value,
    spacePressed: composeSpacePressed.value,
    panActive: !!composePanState.value,
    handlePointerDownCapture: handleComposeCanvasPointerDownCapture,
    handlePointerDown: handleComposeCanvasPointerDown,
    handlePointerMove: handleComposeCanvasPointerMove,
    openMenu: openComposeCanvasMenu,
    handleWheel: handleComposeCanvasWheel,
    handleDragOver: handleComposeFavoriteDragOver,
    handleDrop: handleComposeFavoriteDrop,
    spaceStyle: buildComposeSpaceStyle(),
    surfaceStyle: buildComposeSurfaceStyle()
  }))

  const composeCanvasEdges = computed(() => ({
    canvasSize: composeCanvasSize.value,
    items: composeVisibleEdges.value,
    selectedId: selectedComposeEdgeId.value,
    connectionDraft: composeConnectionDraft.value,
    draftPath: composeDraftPath.value,
    select: selectComposeEdge,
    buildPath: buildComposeEdgePath,
    buildStyle: buildComposeEdgeStyle,
    isConnectedToSelectedPort: isComposeEdgeConnectedToSelectedPort
  }))

  const composeCanvasNodes = computed(() => ({
    items: composeRenderNodes.value,
    raisedId: raisedComposeNodeId.value,
    buildStyle: buildComposeNodeStyle,
    isDraft: isComposeDraftVisualNode,
    isDetached: isComposeDetachedVisualNode,
    getStateLabel: getComposeNodeStateLabel
  }))

  const composeCanvasNodeActions = {
    startDrag: startComposeNodeDrag,
    openMenu: openComposeNodeMenu,
    isExternalPreview: isComposeExternalPreviewNode,
    getPreviewHint: getComposeNodePreviewHint,
    openFieldDrawer: openComposeFieldDrawer,
    startResize: startComposeNodeResize,
    canOpenSourceDrawer: canOpenComposeSourceDrawer,
    getTopPorts: getComposeTopPorts,
    getTopPortsBySide: getComposeTopPortsBySide,
    isPortConnected: isComposePortConnected,
    isPortSelected: isComposePortSelected,
    buildPortRowStyle: buildComposePortRowStyle,
    getPortDisplayLabel: getComposePortDisplayLabel,
    startPortDrag: startComposePortDrag,
    finishPortConnection: finishComposePortConnection,
    selectPort: selectComposePort,
    openPortMenu: openComposePortMenu
  }

  const composeCanvasFields = {
    getVisibleItems: getVisibleComposeItems,
    getSummaryRows: buildComposeNodeSummaryRows
  }

  const composeCanvasIncludeFiles = {
    isIncludeNode: isComposeIncludeNode,
    refreshNode: refreshComposeIncludeNode,
    getFiles: getComposeIncludeFiles,
    getFilePort: getComposeIncludeFilePort
  }

  const composeCanvasContextMenu = computed(() => ({
    state: composeContextMenu,
    submenu: composeContextSubmenu,
    style: buildComposeContextMenuStyle(),
    toggleNodeTypeSubmenu: toggleComposeNodeTypeSubmenu,
    addNode: addComposeNodeFromMenu,
    favoriteNode: favoriteComposeNodeFromMenu,
    deleteNode: deleteComposeNodeFromMenu,
    closeSubmenu: closeComposeContextSubmenu
  }))

  const composeCanvasDrawer = computed(() => ({
    state: composeFieldDrawer,
    getNodeTitle: getComposeFieldDrawerNodeTitle,
    close: closeComposeFieldDrawer,
    save: saveComposeFieldDrawer
  }))

  const composeCanvasZoom = computed(() => ({
    label: composeZoomLabel.value,
    step: COMPOSE_ZOOM_STEP,
    adjust: adjustComposeZoom
  }))

  const siteTemplateForm = ref(createTemplateForm())
  const activeServerDraft = ref({})
  const activeLocationDraft = ref({})
  const serverMetaList = ref([])
  const locationMetaMatrix = ref([])
  const expandedServerIds = ref([])
  const expandedServerLocationGroupIds = ref([])
  const expandedLocationIds = ref([])
  const nginxTopology = ref(null)
  const nginxTopologyLoading = ref(false)
  const nginxTopologyError = ref('')
  const composeRefreshLoading = ref(false)
  const sslStatusLoading = ref(false)
  const sslStatusError = ref('')
  const sslCertificateStatuses = ref([])
  const sslManagedCertificates = ref([])
  const sslCertificatePage = ref(1)
  const sslCertificatePageSize = ref(10)
  const sslCertificatePageInput = ref(1)
  const sslCertificatePageSizes = [10, 20, 50]
  const sslDrawerVisible = ref(false)
  const sslDetailDrawerVisible = ref(false)
  const activeSslDetailRow = ref(null)
  const sslRequestRunning = ref(false)
  const sslActionOutput = ref('')
  const sslAddForm = reactive(createEmptySslAddForm())
  const topologyNodePositions = reactive({})
  const topologyEdgeColors = reactive({})
  const topologyCustomNodes = ref([])
  const topologyCustomEdges = ref([])
  const topologySuppressedNodeIds = ref([])
  const topologySuppressedEdgeIds = ref([])
  const selectedTopologyEdgeId = ref('')
  const selectedTopologyPortKey = ref('')
  const activeTopologyNodeId = ref('')
  const topologyDrawerVisible = ref(false)
  const sourceHistoryDrawerVisible = ref(false)
  const sourceHistoryRecords = ref([])
  const topologyContextMenu = reactive({ visible: false, x: 0, y: 0, node: null })
  const topologyConnectionDraft = ref(null)
  const topologyPointer = ref({ x: 0, y: 0 })
  const topologyMode = ref('traffic')
  const topologyZoom = ref(1)
  const topologyDragState = ref(null)
  const topologyDragMoved = ref(false)
  const COMPOSE_DEFAULT_ENABLED_FIELDS = new Set(['main.worker_processes', 'events.worker_connections', 'http.sendfile', 'include.context', 'listen', 'server_name', 'root', 'ssl_certificate', 'path', 'proxy_pass', 'try_files'])
  const COMPOSE_ON_OFF_OPTIONS = ['on', 'off']
  const COMPOSE_FIELD_SCHEMA = {
    'main.user': { form: 'input', description: '指定 Nginx worker 进程运行用户和用户组。' },
    'main.worker_processes': { form: 'combobox', description: 'worker 进程数量，通常用 auto 按 CPU 自动匹配，也可以填写数字。', suggestions: ['auto', '1', '2', '4'] },
    'main.worker_cpu_affinity': { form: 'input', description: '绑定 worker 到指定 CPU 核心，适合高并发调优。' },
    'main.worker_rlimit_nofile': { form: 'input', description: '提高 worker 可打开文件数上限。' },
    'main.error_log': { form: 'textarea', rows: 2, description: '全局错误日志路径和日志级别，可按实际路径自定义。' },
    'main.pid': { form: 'input', description: 'master 进程 PID 文件位置。' },
    'main.load_module': { form: 'textarea', rows: 3, description: '加载动态模块，可多行填写多个模块路径。' },
    'main.env': { form: 'textarea', rows: 3, description: '向 worker 进程传递环境变量，可多行填写。' },
    'main.daemon': { form: 'select', description: '是否以守护进程方式运行。', options: COMPOSE_ON_OFF_OPTIONS },
    'main.master_process': { form: 'select', description: '是否启用 master/worker 进程模型。', options: COMPOSE_ON_OFF_OPTIONS },
    'main.include': { form: 'textarea', rows: 3, description: '在 main 上下文加载额外配置或模块配置文件。' },
    'events.worker_connections': { form: 'input', description: '单个 worker 最大连接数。' },
    'events.use': { form: 'select', description: '指定事件模型，如 epoll、kqueue。', options: ['', 'epoll', 'kqueue', 'eventport', 'select', 'poll'] },
    'events.multi_accept': { form: 'select', description: '一次事件通知中尽可能多地接收新连接。', options: COMPOSE_ON_OFF_OPTIONS },
    'events.accept_mutex': { form: 'select', description: '控制多 worker 接收连接的互斥锁。', options: COMPOSE_ON_OFF_OPTIONS },
    'events.accept_mutex_delay': { form: 'combobox', description: 'accept_mutex 启用时的等待时间。', suggestions: ['500ms', '100ms', '1s'] },
    'events.worker_aio_requests': { form: 'input', description: '异步 I/O 请求数量上限。' },
    'http.include': { form: 'textarea', rows: 3, description: '引入其他 HTTP 配置文件，当前由 include 节点表达。' },
    'http.default_type': { form: 'combobox', description: '未匹配 MIME 类型时使用的默认 Content-Type，可填写自定义 MIME。', suggestions: ['application/octet-stream', 'text/plain', 'application/json', 'text/html', 'text/css', 'application/javascript'] },
    'http.log_format': { form: 'textarea', rows: 4, description: '定义访问日志格式，通常内容较长，适合多行编辑。' },
    'http.access_log': { form: 'textarea', rows: 2, description: 'HTTP 访问日志路径和格式，可自定义路径、格式和缓冲参数。' },
    'http.error_log': { form: 'textarea', rows: 2, description: 'HTTP 上下文错误日志路径和级别，可自定义路径。' },
    'http.sendfile': { form: 'select', description: '启用高效文件发送，静态文件场景常用。', options: COMPOSE_ON_OFF_OPTIONS },
    'http.tcp_nopush': { form: 'select', description: '配合 sendfile 优化包发送，常用于静态文件。', options: COMPOSE_ON_OFF_OPTIONS },
    'http.tcp_nodelay': { form: 'select', description: '降低小包延迟，常用于长连接。', options: COMPOSE_ON_OFF_OPTIONS },
    'http.keepalive_timeout': { form: 'combobox', description: '客户端 keep-alive 连接保持时间。', suggestions: ['65', '30', '75s'] },
    'http.keepalive_requests': { form: 'input', description: '单个 keep-alive 连接最多处理请求数。' },
    'http.types_hash_max_size': { form: 'input', description: 'MIME types 哈希表大小。' },
    'http.server_tokens': { form: 'select', description: '是否在响应头暴露 Nginx 版本。', options: COMPOSE_ON_OFF_OPTIONS },
    'http.client_max_body_size': { form: 'combobox', description: '客户端请求体最大大小，上传接口常需要设置。', suggestions: ['1m', '10m', '50m', '100m'] },
    'http.client_body_timeout': { form: 'combobox', description: '读取客户端请求体超时时间。', suggestions: ['60s', '30s', '120s'] },
    'http.client_header_timeout': { form: 'combobox', description: '读取客户端请求头超时时间。', suggestions: ['60s', '30s', '120s'] },
    'http.send_timeout': { form: 'combobox', description: '向客户端发送响应的超时时间。', suggestions: ['60s', '30s', '120s'] },
    'http.reset_timedout_connection': { form: 'select', description: '超时后直接重置连接，减少资源占用。', options: COMPOSE_ON_OFF_OPTIONS },
    'http.gzip': { form: 'select', description: '是否启用 gzip 压缩。', options: COMPOSE_ON_OFF_OPTIONS },
    'http.gzip_types': { form: 'textarea', rows: 3, description: '指定 gzip 压缩的 MIME 类型，通常包含多个类型。' },
    'http.gzip_min_length': { form: 'combobox', description: '响应体超过该大小才启用 gzip。', suggestions: ['1k', '1024', '4k'] },
    'http.proxy_connect_timeout': { form: 'combobox', description: '连接上游代理服务的超时时间。', suggestions: ['60s', '30s', '5s'] },
    'http.proxy_send_timeout': { form: 'combobox', description: '向上游发送请求的超时时间。', suggestions: ['60s', '30s', '120s'] },
    'http.proxy_read_timeout': { form: 'combobox', description: '等待上游响应的超时时间。', suggestions: ['60s', '30s', '120s'] },
    'http.proxy_buffering': { form: 'select', description: '是否缓冲上游响应。', options: COMPOSE_ON_OFF_OPTIONS },
    'http.proxy_buffers': { form: 'combobox', description: '上游响应缓冲区数量和大小。', suggestions: ['8 16k', '16 16k', '32 32k'] },
    'http.proxy_set_header': { form: 'textarea', rows: 4, description: '转发请求时设置或覆盖请求头，可多行填写。' },
    'http.ssl_protocols': { form: 'textarea', rows: 2, description: '允许的 TLS/SSL 协议版本，可写多个协议名。' },
    'http.ssl_prefer_server_ciphers': { form: 'select', description: '是否优先使用服务端配置的 TLS 加密套件顺序。', options: COMPOSE_ON_OFF_OPTIONS },
    'http.ssl_ciphers': { form: 'textarea', rows: 3, description: '允许的 TLS 加密套件，内容通常较长。' },
    'http.ssl_session_cache': { form: 'combobox', description: 'SSL 会话缓存配置。', suggestions: ['shared:SSL:10m', 'shared:SSL:50m', 'off', 'none'] },
    'http.ssl_session_timeout': { form: 'combobox', description: 'SSL 会话复用超时时间。', suggestions: ['10m', '5m', '1h'] },
    'http.resolver': { form: 'input', description: 'DNS 解析器地址，变量 proxy_pass 场景常用。' },
    'http.map_hash_bucket_size': { form: 'input', description: 'map 指令哈希桶大小。' },
    'http.server_names_hash_bucket_size': { form: 'input', description: 'server_name 哈希桶大小。' },
    listen: { form: 'textarea', rows: 2, description: '监听端口和协议，可多行填写多个 listen。' },
    server_name: { form: 'input', description: '虚拟主机域名，多个域名用空格分隔。' },
    root: { form: 'input', description: '站点根目录或 location 根目录。' },
    index: { form: 'combobox', description: '默认索引文件列表，可按项目自定义。', suggestions: ['index.html index.htm', 'index.php index.html index.htm'] },
    charset: { form: 'combobox', description: '响应字符集，可填写自定义字符集。', suggestions: ['utf-8', 'off', 'gbk', 'gb2312', 'iso-8859-1'] },
    client_max_body_size: { form: 'combobox', description: '当前 server/location 的请求体大小限制。', suggestions: ['1m', '10m', '50m', '100m'] },
    access_log: { form: 'textarea', rows: 2, description: '当前 server/location 的访问日志配置，可自定义路径和格式。' },
    error_log: { form: 'textarea', rows: 2, description: '当前 server/location 的错误日志配置，可自定义路径和等级。' },
    ssl_certificate: { form: 'input', description: 'SSL 证书 fullchain 路径。' },
    ssl_certificate_key: { form: 'input', description: 'SSL 证书私钥路径。' },
    add_header: { form: 'textarea', rows: 3, description: '添加响应头，可多行填写多个 add_header。' },
    rewrite: { form: 'textarea', rows: 3, description: 'URL 重写规则，可多行填写。' },
    set: { form: 'textarea', rows: 3, description: '设置 Nginx 变量，可多行填写。' },
    return: { form: 'combobox', description: '直接返回状态码、重定向或文本。', suggestions: ['301 https://$host$request_uri', '404', '200 ok'] },
    path: { form: 'input', description: 'location 匹配路径。' },
    alias: { form: 'input', description: 'location 别名目录，路径会替换匹配前缀。' },
    proxy_pass: { form: 'input', description: '反向代理目标地址。' },
    proxy_set_header: { form: 'textarea', rows: 4, description: 'location 内代理请求头设置，可多行填写。' },
    proxy_connect_timeout: { form: 'combobox', description: 'location 内连接上游代理服务的超时时间。', suggestions: ['60s', '30s', '5s'] },
    proxy_send_timeout: { form: 'combobox', description: 'location 内向上游发送请求的超时时间。', suggestions: ['60s', '30s', '120s'] },
    proxy_read_timeout: { form: 'combobox', description: 'location 内等待上游响应的超时时间。', suggestions: ['60s', '30s', '120s'] },
    fastcgi_pass: { form: 'input', description: 'FastCGI 上游地址，常用于 PHP。' },
    fastcgi_param: { form: 'textarea', rows: 4, description: 'FastCGI 参数，可多行填写。' },
    allow: { form: 'textarea', rows: 3, description: '允许访问的 IP 或网段，可多行填写。' },
    deny: { form: 'textarea', rows: 3, description: '拒绝访问的 IP 或网段，可多行填写。' },
    try_files: { form: 'combobox', description: '按顺序尝试文件或 URI。', suggestions: ['$uri $uri/ =404', '$uri $uri/ /index.html'] },
    pattern: { form: 'input', description: 'include 匹配表达式或文件路径。' },
    'include.context': { form: 'select', description: 'include 所属上下文。', options: ['main', 'http', 'server', 'location', 'stream'] }
  }
  const COMPOSE_FIELD_DESCRIPTIONS = Object.fromEntries(Object.entries(NGINX_COMPOSE_FIELD_SCHEMA).map(([key, schema]) => [key, schema.description || '']))
  const COMPOSE_BEGINNER_FIELD_DESCRIPTIONS = {
    'main.user': '指定 Nginx worker 进程用哪个系统用户运行。一般保持 www-data、nginx 或 nobody；如果填错，可能导致网站文件没有权限读取。',
    'main.worker_processes': 'Nginx 开几个工作进程处理请求。新手通常填 auto，让 Nginx 按 CPU 自动决定。',
    'main.worker_cpu_affinity': '把 worker 绑定到指定 CPU 核心，属于性能调优项；不清楚 CPU 亲和性时建议留空。',
    'main.worker_rlimit_nofile': '提高每个 worker 能同时打开的文件数量。高并发或连接很多时可能需要调大。',
    'main.error_log': '全局错误日志位置。Nginx 启动失败、配置错误、运行异常时，通常先看这个日志。',
    'main.pid': '保存 Nginx 主进程 PID 的文件路径。系统 reload/stop 时会用到，一般不用改。',
    'main.load_module': '加载额外的 Nginx 动态模块。只有你安装了第三方模块时才需要填写模块 .so 路径。',
    'main.env': '把系统环境变量传给 Nginx worker。只有配置里依赖环境变量时才需要。',
    'main.daemon': '控制 Nginx 是否在后台运行。普通服务器保持 on；调试容器时有时会设为 off。',
    'main.master_process': '控制是否启用 master 管理 worker 的模式。生产环境通常保持 on。',
    'events.worker_connections': '每个 worker 最多同时处理多少连接。并发不够时通常会先看这里和系统文件句柄限制。',
    'events.use': '指定底层事件模型。Linux 通常用 epoll；不知道时留空让 Nginx 自动选择。',
    'events.multi_accept': '打开后，一个事件通知里 worker 会尽量多接收新连接。高并发场景可能有用。',
    'events.accept_mutex': '多个 worker 抢新连接时是否加锁。新手一般保持默认，不需要主动配置。',
    'events.accept_mutex_delay': 'accept_mutex 开启时，worker 等待抢锁的时间。只有调优连接分配时才需要改。',
    'events.worker_aio_requests': '异步 IO 请求数量上限。只有使用 AIO 读写文件时才有意义。',
    'http.include': '在 http 块里引入其他配置文件。通常用于加载 conf.d/*.conf 里的站点配置。',
    'http.default_type': '当 Nginx 不知道文件类型时，用这个作为默认 Content-Type。静态文件站点一般保持 application/octet-stream。',
    'http.log_format': '定义访问日志每一行记录哪些内容。比如客户端 IP、请求地址、状态码、耗时等。',
    'http.access_log': 'HTTP 访问日志配置。用户每次访问网站，一般都会在这里记录一行。',
    'http.error_log': 'HTTP 层错误日志配置。排查 502、权限、上游异常时很常用。',
    'http.sendfile': '让 Nginx 更高效地发送静态文件。做网站静态资源时通常开启。',
    'http.tcp_nopush': '配合 sendfile 优化大文件/静态文件发送。新手可以按模板保留。',
    'http.tcp_nodelay': '减少小响应的等待延迟。接口、长连接场景通常开启。',
    'http.keepalive_timeout': '浏览器访问后连接保持多久不立刻断开。太短会频繁重连，太长会占连接。',
    'http.keepalive_requests': '同一个 keep-alive 连接最多处理多少个请求。一般不用改。',
    'http.types_hash_max_size': 'MIME 类型表的内部哈希大小。出现 types_hash 相关警告时再调整。',
    'http.server_tokens': '是否在响应头/错误页暴露 Nginx 版本号。为了安全，通常建议 off。',
    'http.client_max_body_size': '允许客户端上传的最大体积。上传文件报 413 时通常要调大这个。',
    'http.client_body_timeout': '等待客户端上传请求体的超时时间。上传慢或网络差时可能触发。',
    'http.client_header_timeout': '等待客户端发完请求头的超时时间。一般不用改。',
    'http.send_timeout': 'Nginx 向客户端发送响应时的超时时间。客户端下载很慢时可能触发。',
    'http.reset_timedout_connection': '连接超时后直接断开并释放资源。高并发下可减少无效连接占用。',
    'http.gzip': '是否开启 gzip 压缩。开启后文本、CSS、JS 通常更小，网页加载更快。',
    'http.gzip_types': '指定哪些响应类型允许 gzip 压缩。一般会包含 text/css、application/javascript、application/json。',
    'http.gzip_min_length': '响应内容超过多大才压缩。太小的内容压缩收益不大。',
    'http.proxy_connect_timeout': 'Nginx 连接后端服务的超时时间。后端地址不通或端口不通时会受这个影响。',
    'http.proxy_send_timeout': 'Nginx 把请求发送给后端服务的超时时间。请求体很大时可能需要调大。',
    'http.proxy_read_timeout': 'Nginx 等后端服务返回结果的最长时间。接口执行很久、WebSocket 常需要调大。',
    'http.proxy_buffering': '是否先把后端响应缓存在 Nginx 再发给客户端。普通接口可开，流式输出常关闭。',
    'http.proxy_buffers': '代理响应缓冲区大小。后端响应头或内容较大时可能需要调整。',
    'http.proxy_set_header': '转发到后端时附带请求头。常用于把真实 IP、域名、协议传给后端。',
    'http.ssl_protocols': '允许哪些 TLS 协议版本。新手通常用 TLSv1.2 TLSv1.3，不建议启用老版本。',
    'http.ssl_ciphers': 'TLS 加密套件列表。不了解密码套件时建议使用系统/模板推荐值。',
    'http.ssl_session_cache': '缓存 TLS 会话信息，减少重复握手开销。HTTPS 站点常用 shared:SSL:10m。',
    'http.ssl_session_timeout': 'TLS 会话缓存多久有效。一般 10m 左右即可。',
    'http.resolver': 'Nginx 用来解析域名的 DNS 服务器。proxy_pass 里用了变量或动态域名时常需要。',
    'http.map_hash_bucket_size': 'map 变量映射表的内部哈希大小。出现 map_hash 相关警告时再调整。',
    'http.server_names_hash_bucket_size': '域名匹配表的内部哈希大小。域名很多或很长时可能需要调大。',
    'include.context': '这个 include 节点属于哪个配置块。比如 http 表示把文件引入到 http { } 里面。',
    pattern: 'include 要加载的文件路径或通配符。比如 /etc/nginx/conf.d/*.conf 表示加载该目录所有 .conf 文件。',
    listen: '这个站点监听哪个端口和协议。常见：80 表示 HTTP，443 ssl http2 表示 HTTPS。',
    server_name: '这个 server 负责哪些域名。多个域名用空格分开；没有域名时可用 _ 作为兜底。',
    root: '网站文件所在目录。访问 /a.png 时，Nginx 会到这个目录下找对应文件。',
    index: '访问目录时默认打开哪些首页文件，比如 index.html 或 index.php。',
    charset: '告诉浏览器页面使用什么字符集。中文网站常用 utf-8，乱码时可以检查这里。',
    client_max_body_size: '当前站点或路由允许上传的最大体积。上传文件报 413 时优先改这里。',
    access_log: '当前站点或路由的访问日志。想看谁访问了什么 URL、状态码是多少，就看它。',
    error_log: '当前站点或路由的错误日志。排查 404、权限、502、证书等问题很常用。',
    ssl_certificate: 'HTTPS 证书文件路径，通常是 fullchain.pem。配合 ssl_certificate_key 使用。',
    ssl_certificate_key: 'HTTPS 证书私钥路径。这个文件要保护好，权限不要过宽。',
    ssl_protocols: '当前站点允许的 TLS 协议版本。新手建议 TLSv1.2 TLSv1.3。',
    ssl_ciphers: '当前站点允许的 TLS 加密算法。不了解时不要随意改，避免老设备或安全性出问题。',
    ssl_prefer_server_ciphers: 'HTTPS 握手时是否优先使用服务器配置的加密套件顺序。一般可保持 on。',
    ssl_session_cache: '当前站点的 TLS 会话缓存配置，可减少重复 HTTPS 握手开销。',
    ssl_session_timeout: '当前站点 TLS 会话缓存有效时间。一般 10m 左右即可。',
    add_header: '给响应添加 HTTP 头。常用于安全头、跨域 CORS、缓存控制等。',
    rewrite: '按规则改写 URL。常用于旧地址跳新地址，但规则写错可能导致循环跳转。',
    set: '设置一个 Nginx 变量，后续指令可以引用它。变量名通常以 $ 开头。',
    return: '直接返回状态码、文本或重定向。比如 301 跳转 HTTPS，或 404 拒绝访问。',
    modifier: 'location 的匹配方式。= 是精确匹配，^~ 是优先前缀，~ 和 ~* 是正则。',
    path: 'location 匹配的访问路径。比如 /api/ 表示处理所有以 /api/ 开头的请求。',
    alias: '把某个 URL 路径映射到另一个真实目录。和 root 不同，alias 会替换掉匹配路径前缀。',
    try_files: '按顺序尝试文件是否存在。常用于静态站点和前端路由，比如找不到文件就交给 /index.html。',
    proxy_pass: '把请求转发到后端服务地址。比如 http://127.0.0.1:3000 表示反向代理到本机 3000 端口。',
    proxy_set_header: '转发请求时改写/添加请求头。常见是 Host、X-Real-IP、X-Forwarded-For。',
    proxy_redirect: '修改后端返回的重定向地址。后端 Location 地址不对时才需要。',
    proxy_connect_timeout: '当前路由连接后端服务的超时时间。后端连不上会受这个控制。',
    proxy_send_timeout: '当前路由把请求发送给后端的超时时间。上传到后端慢时可能需要调大。',
    proxy_read_timeout: '当前路由等待后端响应的时间。后端接口很慢或 WebSocket 场景常要调大。',
    proxy_buffer_size: '读取后端响应头的缓冲区大小。响应头过大报错时可调整。',
    proxy_buffers: '读取后端响应内容的缓冲区数量和大小。大响应或下载场景可能需要调整。',
    proxy_cache: '启用哪个代理缓存区域。想让 Nginx 缓存后端响应时使用。',
    proxy_cache_key: '定义缓存用什么作为 key。key 不合理会导致缓存错乱或命中率低。',
    proxy_cache_valid: '指定哪些状态码缓存多久。比如 200 10m 表示成功响应缓存 10 分钟。',
    proxy_cache_bypass: '满足条件时跳过缓存，直接请求后端。常用于登录用户或刷新请求。',
    fastcgi_pass: '把请求交给 FastCGI 服务，最常见是 PHP-FPM。PHP 网站通常需要它。',
    fastcgi_index: 'FastCGI 默认首页文件，PHP 项目常见为 index.php。',
    fastcgi_param: '传给 FastCGI/PHP 的参数。SCRIPT_FILENAME 写错会导致 PHP 文件无法执行。',
    fastcgi_connect_timeout: '连接 FastCGI 服务的超时时间。PHP-FPM 不通时会受它影响。',
    fastcgi_send_timeout: '向 FastCGI 服务发送请求的超时时间。',
    fastcgi_read_timeout: '等待 FastCGI/PHP 返回结果的时间。PHP 脚本执行很久时可能要调大。',
    allow: '允许哪些 IP 或网段访问。通常和 deny 配合做简单白名单。',
    deny: '拒绝哪些 IP 或网段访问。比如 deny all 表示全部拒绝。',
    auth_basic: '开启浏览器弹窗式用户名密码认证。适合给临时后台或测试站加简单保护。',
    auth_basic_user_file: 'Basic Auth 的账号密码文件路径，通常用 htpasswd 生成。',
    expires: '控制浏览器缓存多久。静态资源可设长一点，HTML 通常不要太长。',
    autoindex: '访问目录但没有首页文件时，是否显示文件列表。公网目录一般不建议开启。',
    internal: '把 location 标记为只能被 Nginx 内部跳转访问，用户不能直接访问。',
    error_page: '指定错误码要显示哪个页面或跳到哪里。比如 404 /404.html。',
    upstream: '定义一组后端服务器，proxy_pass 可以指向它来做负载均衡。',
    server: '在 upstream 里表示一个后端服务器；在 stream/mail 中也可能表示服务块。',
    weight: 'upstream 后端权重。数字越大，分到的请求越多。',
    max_fails: '后端在一段时间内失败几次后，暂时认为不可用。',
    fail_timeout: '配合 max_fails 使用，表示统计失败和暂停后端的时间窗口。',
    backup: '把 upstream 后端标记为备用。主后端不可用时才会请求它。',
    down: '把 upstream 后端临时下线，不再转发请求给它。',
    ip_hash: '按客户端 IP 分配后端，让同一个用户尽量落到同一台后端。',
    least_conn: '把请求优先发给当前连接数最少的后端。',
    hash: '按指定 key 做固定分配。常用于让同类请求落到同一后端。',
    keepalive: 'upstream 到后端的空闲长连接数量。可减少频繁建连开销。'
  }
  const COMPOSE_NODE_BASE_Z_INDEX = 3
  const composeNodes = ref(createDefaultComposeNodes())
  const composeEdges = ref([])
  const composeDeletedSourceBlocks = ref([])
  const composeGeneratedSourceKey = ref('')
  const selectedComposeEdgeId = ref('')
  const selectedComposePortKey = ref('')
  const raisedComposeNodeId = ref('')
  const composeConnectionDraft = ref(null)
  const composePointer = ref({ x: 0, y: 0 })
  const composeZoom = ref(0.55)
  const composeDragState = ref(null)
  const reportedNginxErrorKeys = new Set()

  function reportNginxError(scope = '', payload = {}) {
    const entry = {
      time: new Date().toISOString(),
      scope: String(scope || ''),
      payload: payload || {}
    }
    const error = new Error(payload?.message || `Nginx 操作失败：${entry.scope}`)
    if (payload?.stack) error.stack = String(payload.stack)
    const details = { scope: entry.scope, path: String(payload?.path || '') }
    const fingerprint = `${entry.scope}:${details.path}:${error.message}`
    if (reportedNginxErrorKeys.has(fingerprint)) return entry
    reportedNginxErrorKeys.add(fingerprint)
    window.setTimeout(() => reportedNginxErrorKeys.delete(fingerprint), 30000)
    if (window.reportApplicationError) window.reportApplicationError('nginx', error, details)
    else console.error('[nginx]', error, details)
    return entry
  }

  const composeRenderNodes = computed(() => {
    const activeNodeId = composeDragState.value?.nodeId
    if (!activeNodeId) return composeNodes.value
    const activeNode = composeNodes.value.find(node => node.id === activeNodeId)
    if (!activeNode) return composeNodes.value
    return [...composeNodes.value.filter(node => node.id !== activeNodeId), activeNode]
  })
  const composeNodeById = computed(() => new Map(composeNodes.value.map(node => [node.id, node])))
  const composeIncludeFilesByNodeId = computed(() => {
    const map = new Map()
    composeNodes.value.forEach(node => {
      if (isComposeIncludeNode(node)) map.set(node.id, buildComposeIncludeFiles(node))
    })
    return map
  })
  const composePortsByNodeId = computed(() => new Map(composeNodes.value.map(node => [node.id, buildComposePorts(node)])))
  const composeIncomingEdgeByPortKey = computed(() => {
    const map = new Map()
    composeEdges.value.forEach(edge => map.set(`${edge.toNodeId}:${edge.toPortId}`, edge))
    return map
  })
  const composeOutgoingEdgeByPortKey = computed(() => {
    const map = new Map()
    composeEdges.value.forEach(edge => map.set(`${edge.fromNodeId}:${edge.fromPortId}`, edge))
    return map
  })
  const composeContextMenu = reactive({ visible: false, x: 0, y: 0, node: null, port: null })
  const composeContextSubmenu = reactive({ visible: false, x: 0, y: 0, items: [] })
  const composeFieldPicker = reactive({ nodeId: '', sectionKey: '', query: '', collapsedGroups: {} })
  const composeFieldDrawer = reactive({ visible: false, nodeId: '', blockLabel: '', path: 'nginx.conf', code: '', error: '' })
  const composeSuggestPicker = reactive({ fieldId: '' })
  const composeDraftSnapshot = ref(null)
  const composeBaselineGraph = ref(null)
  const composeSuppressedEdges = ref([])
  const composePreviewFileCache = ref(new Map())
  const composeLastNodeSaveSummary = ref(null)
  const composeUndoStack = ref([])
  const composeRedoStack = ref([])
  const composeNodeTemplates = ref([])
  const composeFavoritesDrawerVisible = ref(false)
  const composeFavoriteDragTemplateKey = ref('')
  const composeSpacePressed = ref(false)
  const composePanState = ref(null)
  const composeIgnoredSnapshotKey = ref('')
  const composeUseSavedDraft = ref(false)
  const systemForm = reactive({
    nginxHome: '/etc/nginx',
    mainConfigPath: '/etc/nginx/nginx.conf',
    scanPaths: createDefaultScanPaths('/etc/nginx'),
    backupDir: '/www/backup/nginx',
    sslDir: '/etc/letsencrypt/live',
    renewMode: 'certbot',
    sslNote: ''
  })
  let sourceMonacoSession = null
  let sourceMonacoInitPromise = null
  let sourceAutoSaveTimer = 0
  let sourcePendingAutoSave = null
  let createSourceMonacoSessionFactory = null
  let selectingSitePending = false
  let composeMenuPreparing = false
  let latestMenuLoadingToken = null
  let suppressNextComposeAutoGenerate = false
  let composeDragAnimationFrame = 0
  let composePendingPointer = null
  const TOPOLOGY_NODE_WIDTH = 238
  const TOPOLOGY_NODE_HEADER_HEIGHT = 50
  const TOPOLOGY_PORT_ROW_HEIGHT = 30
  const TOPOLOGY_NODE_FOOTER_GAP = 12
  const TOPOLOGY_PORT_RADIUS = 7
  const TOPOLOGY_PORT_HIT_RADIUS = 17
  const TOPOLOGY_PORT_INSET = 12
  const TOPOLOGY_DRAFT_PORT_RADIUS = 8
  const TOPOLOGY_ZOOM_MIN = 0.55
  const TOPOLOGY_ZOOM_MAX = 1.8
  const TOPOLOGY_ZOOM_STEP = 0.1
  const COMPOSE_ZOOM_MIN = 0.55
  const COMPOSE_ZOOM_MAX = 1.8
  const COMPOSE_ZOOM_STEP = 0.1
  const COMPOSE_PORT_HIT_RADIUS = 22
  const COMPOSE_PORT_ROW_TOP = 64
  const COMPOSE_PORT_ROW_CENTER = 16
  const COMPOSE_TOP_PORT_ROW_HEIGHT = 32
  const COMPOSE_TOP_PORT_AREA_GAP = 49
  const COMPOSE_READONLY_TREE_PADDING_TOP = 2
  const COMPOSE_READONLY_GROUP_HEADER_HEIGHT = 18
  const COMPOSE_READONLY_GROUP_HEADER_GAP = 5
  const COMPOSE_READONLY_ROW_HEIGHT = 30
  const COMPOSE_READONLY_ROW_GAP = 4
  const COMPOSE_READONLY_GROUP_GAP = 8
  const COMPOSE_SUMMARY_ROW_HEIGHT = 36
  const COMPOSE_SUMMARY_VERTICAL_GAP = 6
  const COMPOSE_SUMMARY_VERTICAL_PADDING = 6
  const COMPOSE_INCLUDE_FILE_HEADER_HEIGHT = 28
  const COMPOSE_INCLUDE_FILE_ROW_HEIGHT = 40
  const COMPOSE_PORT_DOT_CENTER_INSET = 22
  const COMPOSE_NODE_BOTTOM_PADDING = 28
  const COMPOSE_NODE_HEIGHT_SAFETY_PADDING = 24
  const COMPOSE_NODE_MIN_HEIGHT = 150
  const COMPOSE_EDGE_COLORS = ['#0f766e', '#2563eb', '#d97706', '#7c3aed', '#059669', '#475569', '#be123c', '#0891b2']
  const COMPOSE_CONTEXT_MENU_WIDTH = 184
  const COMPOSE_CONTEXT_MENU_BASE_HEIGHT = 92
  const COMPOSE_CONTEXT_MENU_EXPANDED_HEIGHT = 174
  const TOPOLOGY_EDGE_COLORS = ['#22c55e', '#38bdf8', '#f97316', '#a855f7', '#eab308', '#14b8a6', '#ef4444', '#6366f1']
  const TOPOLOGY_LAYOUT_STORAGE_PREFIX = 'linux-visual:nginx-topology-layout:'
  const COMPOSE_DRAFT_STORAGE_KEY = 'linux-visual:nginx-compose-draft'
  const COMPOSE_NODE_TEMPLATE_STORAGE_KEY = 'linux-visual:nginx-compose-node-templates'
  const OLD_TOPOLOGY_LAYOUT_STORAGE_PREFIX = 'wh-ssh:nginx-topology-layout:'
  const OLD_COMPOSE_DRAFT_STORAGE_KEY = 'wh-ssh:nginx-compose-draft'
  const COMPOSE_DRAFT_VERSION = 4
  const NGINX_SYSTEM_SETTINGS_STORAGE_KEY = 'linux-visual:nginx-system-settings'
  const SOURCE_HISTORY_STORAGE_KEY = 'linux-visual:nginx-source-history'
  const SSL_CERTIFICATES_STORAGE_KEY = 'linux-visual:nginx-ssl-certificates'
  const OLD_NGINX_SYSTEM_SETTINGS_STORAGE_KEY = 'wh-ssh:nginx-system-settings'
  const OLD_SOURCE_HISTORY_STORAGE_KEY = 'wh-ssh:nginx-source-history'
  const OLD_SSL_CERTIFICATES_STORAGE_KEY = 'wh-ssh:nginx-ssl-certificates'
  restoreSystemSettings()
  restoreSourceHistory()
  restoreManagedSslCertificates()
  sourceTreeRootPath.value = normalizeNginxPath(systemForm.nginxHome || '/etc/nginx')
  let previousSystemNginxHome = systemForm.nginxHome

  const sslDomainModel = computed({
    get: () => props.sslDomain,
    set: value => emit('update:sslDomain', value)
  })

  const activeMenuMeta = computed(() => menuItems.find(item => item.key === activeMenu.value) || menuItems[0])
  const activeMenuDetail = computed(() => activeMenuMeta.value.detail)
  const visualServers = computed(() => props.selectedNginxSiteEditor?.visualModel?.servers || [])
  const totalLocationCount = computed(() => visualServers.value.reduce((total, server) => total + (Array.isArray(server?.locations) ? server.locations.length : 0), 0))
  const httpServers = computed(() => visualServers.value.filter(server => !isHttpsServer(server)))
  const httpsServers = computed(() => visualServers.value.filter(server => isHttpsServer(server)))
  const sslDomainList = computed(() => parseSslDomainList(sslDomainModel.value))
  const sslServerReferences = computed(() => buildSslServerReferences())
  const sslCertificateStatusByPath = computed(() => new Map(sslCertificateStatuses.value.map(item => [normalizeNginxPath(item.certPath), item])))
  const sslCertificateTargets = computed(() => mergeSslCertificateTargets([...sslServerReferences.value, ...sslManagedCertificates.value]))
  const sslCertificateRows = computed(() => buildSslCertificateRows())
  const pagedSslCertificateRows = computed(() => {
    const start = (sslCertificatePage.value - 1) * sslCertificatePageSize.value
    return sslCertificateRows.value.slice(start, start + sslCertificatePageSize.value)
  })
  const sslCertificatePageCount = computed(() => Math.max(1, Math.ceil(sslCertificateRows.value.length / sslCertificatePageSize.value)))
  const visibleSslCertificatePages = computed(() => {
    const total = sslCertificatePageCount.value
    const current = sslCertificatePage.value
    const start = Math.max(1, Math.min(current - 2, total - 4))
    const end = Math.min(total, start + 4)
    return Array.from({ length: end - start + 1 }, (_, index) => start + index)
  })
  const sslOverview = computed(() => {
    const statuses = sslCertificateRows.value.map(item => item.status)
    return {
      totalCount: sslCertificateRows.value.length,
      normalCount: statuses.filter(item => item.status === 'normal').length,
      warningCount: statuses.filter(item => item.status === 'warning').length,
      expiredCount: statuses.filter(item => ['expired', 'missing', 'error', 'unknown'].includes(item.status)).length
    }
  })
  const sslCommandPreview = computed(() => {
    const domains = sslDomainList.value
    const certbot = domains.length ? `certbot --nginx ${domains.map(domain => `-d ${domain}`).join(' ')}` : 'certbot --nginx -d example.com'
    return [
      `申请证书：${certbot}`,
      '试运行续签：certbot renew --dry-run',
      '续签：certbot renew',
      '语法校验：nginx -t',
      '重载：systemctl reload nginx || nginx -s reload'
    ].join('\n')
  })
  const sslDrawerCommandPreview = computed(() => {
    const domains = parseSslDomainList(sslAddForm.domains)
    const certbot = domains.length ? `certbot --nginx ${domains.map(domain => `-d ${domain}`).join(' ')}` : 'certbot --nginx -d example.com'
    const targetDir = normalizeNginxPath(sslAddForm.targetDir || '')
    return [
      `申请证书：${certbot}`,
      targetDir ? `申请成功后同步到：${targetDir}` : '申请成功后保留在 certbot 默认目录：/etc/letsencrypt/live/<域名>/',
      '同步文件：fullchain.pem、privkey.pem',
      '建议后续执行：nginx -t && systemctl reload nginx'
    ].join('\n')
  })
  const canSubmitSslAddForm = computed(() => {
    if (sslAddForm.mode === 'request') return parseSslDomainList(sslAddForm.domains).length > 0
    return !!normalizeNginxPath(sslAddForm.certPath || '') && !!normalizeNginxPath(sslAddForm.keyPath || '')
  })
  const currentServers = computed(() => (activeProtocol.value === 'https' ? httpsServers.value : httpServers.value))
  const activeServer = computed(() => currentServers.value.find(server => server.id === activeServerId.value) || currentServers.value[0] || null)
  const siteMenuItems = computed(() => (Array.isArray(props.nginxSites) ? props.nginxSites : []).map(site => ({
    ...site,
    label: formatSiteMenuLabel(site)
  })))
  const currentSiteMenuLabel = computed(() => {
    const current = siteMenuItems.value.find(site => site.path === props.selectedNginxSitePath)
    return current?.label || props.selectedNginxSiteEditor?.name || '未选择文件'
  })
  const currentSiteFilePath = computed(() => String(props.selectedNginxSiteEditor?.path || '').trim() || currentSiteMenuLabel.value)
  const sourceTreeVisibleRows = computed(() => flattenSourceTreeRows(sourceTreeNodes.value))
  const sourceLineCount = computed(() => String(props.selectedNginxSiteEditor?.code || '').split(/\r?\n/).length)
  const isSourceDirty = computed(() => String(props.selectedNginxSiteEditor?.code || '') !== String(props.selectedNginxSiteEditor?.originalCode || ''))
  const sourceDirtyLabel = computed(() => {
    if (sourceAutoSaveState.value === 'saving') return '自动保存中'
    if (sourceAutoSaveState.value === 'error') return '自动保存失败'
    return isSourceDirty.value ? '等待自动保存' : '已自动保存'
  })
  const scannedSourceItems = computed(() => mergeNginxSiteLists(siteMenuItems.value, topologyFileSites.value).filter(site => site?.path))
  const sourceHistoryItems = computed(() => sourceHistoryRecords.value.map(item => ({
    path: item.path,
    name: item.name || formatPathBasename(item.path),
    label: item.label || item.name || formatPathBasename(item.path),
    modified: item.modified || '',
    editedAt: item.editedAt || '',
    size: Number(item.size || 0)
  })).filter(site => site?.path))
  const systemScanSummary = computed(() => {
    const files = scannedSourceItems.value
    const serverCount = files.reduce((total, site) => total + Number(site.serverCount || 0), 0)
    const httpsCount = httpsServers.value.length
    return { fileCount: files.length, serverCount, httpsCount }
  })
  const mainConfigStatusLabel = computed(() => {
    const mainPath = detectedNginxConf.value
    if (!mainPath) return '未设置'
    if (siteMenuItems.value.some(site => isSameNginxPath(site.path, mainPath))) return '已发现'
    return props.selectedNginxSiteEditor?.path && isSameNginxPath(props.selectedNginxSiteEditor.path, mainPath) ? '已打开' : '待扫描'
  })
  const hasRealTopology = computed(() => !!nginxTopology.value?.ok && Array.isArray(nginxTopology.value.files) && nginxTopology.value.files.length > 0)
  const topologyStatusText = computed(() => {
    if (nginxTopologyLoading.value) return '正在解析 nginx -T 输出，生成真实 include 拓扑...'
    if (hasRealTopology.value) return '已按 nginx -T 的真实 include / server 关系生成拓扑，点击文件节点进入源码编辑。'
    if (nginxTopologyError.value) return `nginx -T 解析不可用，已回退到常见目录扫描：${nginxTopologyError.value}`
    return '从 Nginx 根目录推导主配置和分支配置，点击配置文件节点进入源码编辑。'
  })
  const activeHeaderActions = computed(() => buildActiveHeaderActions())
  const nginxRootPath = computed(() => normalizeNginxPath(systemForm.nginxHome || '/etc/nginx'))
  const detectedNginxConf = computed(() => normalizeNginxPath(systemForm.mainConfigPath || joinNginxPath(nginxRootPath.value, 'nginx.conf')))
  const detectedConfDDir = computed(() => joinNginxPath(nginxRootPath.value, 'conf.d'))
  const detectedRootConfDir = computed(() => nginxRootPath.value)
  const detectedSitesAvailableDir = computed(() => joinNginxPath(nginxRootPath.value, 'sites-available'))
  const detectedSitesEnabledDir = computed(() => joinNginxPath(nginxRootPath.value, 'sites-enabled'))
  const detectedVhostDir = computed(() => joinNginxPath(nginxRootPath.value, 'vhost'))
  const detectedVhostsDir = computed(() => joinNginxPath(nginxRootPath.value, 'vhosts'))
  const detectedVhostDDir = computed(() => joinNginxPath(nginxRootPath.value, 'vhost.d'))
  const detectedServersDir = computed(() => joinNginxPath(nginxRootPath.value, 'servers'))
  const detectedStreamDDir = computed(() => joinNginxPath(nginxRootPath.value, 'stream.d'))
  const detectedHttpDDir = computed(() => joinNginxPath(nginxRootPath.value, 'http.d'))
  const panelVhostDir = computed(() => '/www/server/panel/vhost/nginx')
  const nginxScanPaths = computed(() => parseScanPaths(systemForm.scanPaths).join('\n'))
  const topologyFileSites = computed(() => hasRealTopology.value ? nginxTopology.value.files.map(createTopologySiteFromFile) : [])
  const topologySiteByPath = computed(() => new Map(topologyFileSites.value.map(site => [normalizeNginxPath(site.path), site])))
  const mainConfigSite = computed(() => {
    if (hasRealTopology.value) return topologyFileSites.value.find(site => isSameNginxPath(site.path, detectedNginxConf.value)) || topologyFileSites.value.find(site => site.name === 'nginx.conf') || topologyFileSites.value[0] || null
    return siteMenuItems.value.find(site => isSameNginxPath(site.path, detectedNginxConf.value) || site.name === 'nginx.conf') || null
  })
  const topologyGroups = computed(() => {
    if (hasRealTopology.value) return buildRealTopologyGroups()
    const groups = [
      createTopologyGroup('root-conf', '根目录配置', `${detectedRootConfDir.value}/*.conf`, detectedRootConfDir.value, { directOnly: true }),
      createTopologyGroup('conf-d', 'conf.d 分支', `${detectedConfDDir.value}/*.conf`, detectedConfDDir.value),
      createTopologyGroup('sites-available', 'sites-available 分支', `${detectedSitesAvailableDir.value}/*`, detectedSitesAvailableDir.value),
      createTopologyGroup('sites-enabled', 'sites-enabled 分支', `${detectedSitesEnabledDir.value}/*`, detectedSitesEnabledDir.value),
      createTopologyGroup('vhost', 'vhost 分支', `${detectedVhostDir.value}/*`, detectedVhostDir.value),
      createTopologyGroup('vhosts', 'vhosts 分支', `${detectedVhostsDir.value}/*`, detectedVhostsDir.value),
      createTopologyGroup('vhost-d', 'vhost.d 分支', `${detectedVhostDDir.value}/*`, detectedVhostDDir.value),
      createTopologyGroup('servers', 'servers 分支', `${detectedServersDir.value}/*`, detectedServersDir.value),
      createTopologyGroup('stream-d', 'stream.d 四层代理', `${detectedStreamDDir.value}/*.conf`, detectedStreamDDir.value),
      createTopologyGroup('http-d', 'http.d 分支', `${detectedHttpDDir.value}/*.conf`, detectedHttpDDir.value),
      createTopologyGroup('panel-vhost', '面板站点配置', `${panelVhostDir.value}/*.conf`, panelVhostDir.value)
    ]
    const used = new Set(groups.flatMap(group => group.files.map(site => site.path)))
    const others = siteMenuItems.value.filter(site => site?.path && !used.has(site.path) && !isSameNginxPath(site.path, detectedNginxConf.value))
    if (others.length) groups.push({ key: 'other', label: '其他已发现配置', include: 'nginx -T / 常见路径扫描结果', files: others })
    return groups
  })
  const topologyGraphNodes = computed(() => buildTopologyGraphNodes())
  const topologyGraphEdges = computed(() => buildTopologyGraphEdges())
  const topologyTrafficGraph = computed(() => buildTrafficTopologyGraph())
  const topologyEdgeEndpoints = computed(() => buildTopologyEdgeEndpoints())
  const activeTopologyNode = computed(() => getTopologyNodeById(activeTopologyNodeId.value))
  const topologyDrawerTitle = computed(() => activeTopologyNode.value ? '节点信息' : '拓扑信息')
  const topologyCanvasSize = computed(() => ({
    width: Math.max(1180, ...topologyGraphNodes.value.map(node => getTopologyNodePosition(node).x + TOPOLOGY_NODE_WIDTH + 220)),
    height: Math.max(540, ...topologyGraphNodes.value.map(node => getTopologyNodePosition(node).y + getTopologyNodeHeight(node) + 160))
  }))
  const composeCanvasSize = computed(() => ({
    width: Math.max(1600, ...composeNodes.value.map(node => (node.x || 0) + getComposeNodeWidth(node) + 240)),
    height: Math.max(1100, ...composeNodes.value.map(node => (node.y || 0) + getComposeNodeHeight(node) + 180))
  }))
  const topologyZoomLabel = computed(() => `${Math.round(topologyZoom.value * 100)}%`)
  const topologyConnectedPorts = computed(() => {
    const ports = new Set()
    topologyGraphEdges.value.forEach(edge => {
      ports.add(`${edge.from}:out`)
      ports.add(`${edge.to}:in`)
      ports.add(`${edge.from}:out:${edge.id}`)
      ports.add(`${edge.to}:in:${edge.id}`)
    })
    return ports
  })
  const topologyDraftPath = computed(() => {
    if (!topologyConnectionDraft.value) return ''
    return topologyConnectionDraft.value.direction === 'in'
      ? buildBezierPath(topologyPointer.value, topologyConnectionDraft.value.anchorPoint)
      : buildBezierPath(topologyConnectionDraft.value.anchorPoint, topologyPointer.value)
  })
  const composeDraftPath = computed(() => {
    if (!composeConnectionDraft.value) return ''
    return composeConnectionDraft.value.side === 'left'
      ? buildComposeBezierPath(composePointer.value, composeConnectionDraft.value.anchorPoint)
      : buildComposeBezierPath(composeConnectionDraft.value.anchorPoint, composePointer.value)
  })
  const composeZoomLabel = computed(() => `${Math.round(composeZoom.value * 100)}%`)
  const composeVisibleEdges = computed(() => {
    const hiddenEdgeId = composeConnectionDraft.value?.rewireEdgeId
    return composeEdges.value.filter(edge => edge.id !== hiddenEdgeId && isComposeEdgeVisible(edge))
  })
  const activeTemplateServer = computed(() => (siteTemplateForm.value?.servers || []).find(server => server.id === activeTemplateServerId.value) || siteTemplateForm.value?.servers?.[0] || null)
  const activeTemplateServerIndex = computed(() => (siteTemplateForm.value?.servers || []).findIndex(server => server.id === activeTemplateServerId.value))
  const activeTemplateServerTitle = computed(() => {
    const index = (siteTemplateForm.value?.servers || []).findIndex(server => server.id === activeTemplateServerId.value)
    return index > -1 ? `server ${index + 1}` : 'server 1'
  })
  const activeTemplateLocation = computed(() => (activeTemplateServer.value?.locations || []).find(location => location.id === activeTemplateLocationId.value) || activeTemplateServer.value?.locations?.[0] || null)
  const activeTemplateLocationTitle = computed(() => {
    const index = (activeTemplateServer.value?.locations || []).findIndex(location => location.id === activeTemplateLocationId.value)
    return index > -1 ? `location ${index + 1}` : 'location 1'
  })
  const activeServerMeta = computed(() => {
    const index = activeTemplateServerIndex.value
    return index > -1 ? serverMetaList.value[index] || null : null
  })
  const activeLocationMeta = computed(() => {
    const serverIndex = activeTemplateServerIndex.value
    const locationIndex = (activeTemplateServer.value?.locations || []).findIndex(location => location.id === activeTemplateLocationId.value)
    if (serverIndex < 0 || locationIndex < 0) return null
    return locationMetaMatrix.value[serverIndex]?.[locationIndex] || null
  })
  const isActiveServerMetaDirty = computed(() => !!(activeServerMeta.value && (activeServerMeta.value.draftTitle !== activeServerMeta.value.title || activeServerMeta.value.draftDescription !== activeServerMeta.value.description)))
  const isActiveLocationMetaDirty = computed(() => !!(activeLocationMeta.value && (activeLocationMeta.value.draftTitle !== activeLocationMeta.value.title || activeLocationMeta.value.draftDescription !== activeLocationMeta.value.description)))
  const isActiveServerFormDirty = computed(() => JSON.stringify(normalizeDraftValue(activeServerDraft.value)) !== JSON.stringify(normalizeDraftValue(pickServerDraftSource(activeTemplateServer.value))))
  const isActiveLocationFormDirty = computed(() => JSON.stringify(normalizeDraftValue(activeLocationDraft.value)) !== JSON.stringify(normalizeDraftValue(pickLocationDraftSource(activeTemplateLocation.value))))
  const isActiveServerDirty = computed(() => isActiveServerMetaDirty.value || isActiveServerFormDirty.value)
  const isActiveLocationDirty = computed(() => isActiveLocationMetaDirty.value || isActiveLocationFormDirty.value)

  watch(() => activeMenu.value, async value => {
    if (['source', 'ssl', 'compose'].includes(value)) ensureSelectedSite()
    if (value === 'ssl') await ensureSslCertificateData()
  }, { immediate: true })

  watch(sslServerReferences, () => {
    if (activeMenu.value === 'ssl') refreshSslCertificateStatuses()
  }, { deep: true })

  watch(() => props.selectedNginxSiteEditor?.path, (value, oldValue) => {
    if (oldValue && value !== oldValue && sourcePendingAutoSave) void flushPendingSourceAutoSave()
    sourceAutoSaveState.value = 'idle'
    sourcePathInput.value = String(value || '')
  }, { immediate: true })

  watch([() => sslCertificateRows.value.length, sslCertificatePageSize], () => {
    const maxPage = Math.max(1, Math.ceil(sslCertificateRows.value.length / sslCertificatePageSize.value))
    if (sslCertificatePage.value > maxPage) sslCertificatePage.value = maxPage
    sslCertificatePageInput.value = sslCertificatePage.value
  })

  watch(sslCertificatePage, value => {
    sslCertificatePageInput.value = value
  })

  watch(() => systemForm.nginxHome, value => {
    const previousRoot = normalizeNginxPath(previousSystemNginxHome || '/etc/nginx')
    const previousDefaultMain = joinNginxPath(previousRoot, 'nginx.conf')
    const previousDefaultScanPaths = createDefaultScanPaths(previousRoot)
    const nextRoot = normalizeNginxPath(value || '/etc/nginx')
    if (!systemForm.mainConfigPath || isSameNginxPath(systemForm.mainConfigPath, previousDefaultMain)) {
      systemForm.mainConfigPath = joinNginxPath(nextRoot, 'nginx.conf')
    }
    if (!String(systemForm.scanPaths || '').trim() || normalizeScanPathsText(systemForm.scanPaths) === normalizeScanPathsText(previousDefaultScanPaths)) {
      systemForm.scanPaths = createDefaultScanPaths(nextRoot)
    }
    if (!sourceTreeRootPath.value || isSameNginxPath(sourceTreeRootPath.value, previousRoot)) {
      sourceTreeRootPath.value = nextRoot
      sourceTreeNodes.value = []
    }
    previousSystemNginxHome = value
  })

  watch(() => [props.selectedNginxSiteEditor?.path, props.selectedNginxSiteEditor?.code, props.selectedNginxSiteEditor?.visualModel], () => {
    rebuildTemplateForm()
  }, { immediate: true, deep: true })

  watch([currentServers, () => activeProtocol.value], () => {
    const list = currentServers.value
    if (!list.length) {
      if (activeProtocol.value === 'http' && httpsServers.value.length) {
        activeProtocol.value = 'https'
        return
      }
      if (activeProtocol.value === 'https' && httpServers.value.length) {
        activeProtocol.value = 'http'
        return
      }
      activeServerId.value = ''
      return
    }
    if (!list.some(server => server.id === activeServerId.value)) activeServerId.value = list[0].id
  }, { immediate: true, deep: true })

  watch(() => siteTemplateForm.value.servers, value => {
    const list = Array.isArray(value) ? value : []
    if (!list.length) {
      activeTemplateServerId.value = ''
      return
    }
    if (!list.some(server => server.id === activeTemplateServerId.value)) activeTemplateServerId.value = list[0].id
  }, { immediate: true, deep: true })

  watch(() => activeTemplateServer.value?.locations, value => {
    const list = Array.isArray(value) ? value : []
    if (!list.length) {
      activeTemplateLocationId.value = ''
      return
    }
    if (!list.some(location => location.id === activeTemplateLocationId.value)) activeTemplateLocationId.value = list[0].id
  }, { immediate: true, deep: true })

  watch(() => activeTemplateServer.value, value => {
    activeServerDraft.value = pickServerDraftSource(value)
  }, { immediate: true, deep: true })

  watch(() => activeTemplateLocation.value, value => {
    activeLocationDraft.value = pickLocationDraftSource(value)
  }, { immediate: true, deep: true })

  watch(() => activeMenu.value, async value => {
    if (value !== 'source') return
    await ensureSourceTree()
    await nextTick()
    await ensureSourceMonaco()
    syncSourceMonacoContent(false)
    requestSourceMonacoLayout()
  })

  watch(() => activeMenu.value, async value => {
    if (value !== 'compose') return
    if (suppressNextComposeAutoGenerate) {
      suppressNextComposeAutoGenerate = false
      return
    }
    if (composeMenuPreparing || composeUseSavedDraft.value) return
    await nextTick()
    await autoGenerateComposeFromNginxConf({ force: true })
  })

  watch(() => [props.selectedNginxSiteEditor?.path, props.selectedNginxSiteEditor?.code, props.selectedNginxSiteEditor?.saving], async () => {
    if (activeMenu.value !== 'source') return
    await nextTick()
    await ensureSourceMonaco()
    syncSourceMonacoContent(false)
  })

  watch(() => [props.selectedNginxSiteEditor?.path, props.selectedNginxSiteEditor?.code], async () => {
    if (activeMenu.value !== 'compose' || composeUseSavedDraft.value) return
    await nextTick()
    await autoGenerateComposeFromNginxConf()
  })

  watch(() => [nginxRootPath.value, topologyMode.value], () => {
    restoreTopologyLayout()
  }, { immediate: true })

  onBeforeUnmount(() => {
    void flushPendingSourceAutoSave()
    disposeSourceMonaco()
    stopTopologyWindowTracking()
    stopComposeWindowTracking()
    stopComposePanTracking()
    window.removeEventListener('keydown', handleTopologyKeydown)
    window.removeEventListener('keydown', handleComposeHistoryKeydown)
    window.removeEventListener('keyup', handleComposeKeyup)
    window.removeEventListener('dragover', handleComposeFavoriteWindowDragOver)
    window.removeEventListener('drop', handleComposeFavoriteWindowDrop)
    window.removeEventListener('pointerdown', closeTopologyContextMenu)
    window.removeEventListener('pointerdown', closeComposeContextMenu)
    window.removeEventListener('pointerdown', closeSourceTreeContextMenu)
  })

  onMounted(() => {
    window.addEventListener('keydown', handleTopologyKeydown)
    window.addEventListener('keydown', handleComposeHistoryKeydown)
    window.addEventListener('keyup', handleComposeKeyup)
    window.addEventListener('dragover', handleComposeFavoriteWindowDragOver)
    window.addEventListener('drop', handleComposeFavoriteWindowDrop)
    window.addEventListener('pointerdown', closeTopologyContextMenu)
    window.addEventListener('pointerdown', closeComposeContextMenu)
    window.addEventListener('pointerdown', closeSourceTreeContextMenu)
    restoreComposeNodeTemplates()
    restoreComposeDraft()
    void restoreNginxPersistentStateFromDatabase()
    void loadManagedSslCertificates()
  })

  async function handleMenuChange(menuKey) {
    const nextMenu = String(menuKey || '').trim()
    if (!nextMenu) return
    activeMenu.value = nextMenu
    const loadingToken = Symbol(nextMenu)
    latestMenuLoadingToken = loadingToken
    menuContentLoading.value = true
    try {
      await nextTick()
      if (nextMenu === 'compose') {
        await openComposeMenuWithSnapshotCheck()
      } else if (nextMenu === 'topology') {
        if (!nginxTopology.value && !nginxTopologyLoading.value) await loadNginxTopology()
      } else if (nextMenu === 'ssl') {
        await ensureSslCertificateData()
        await refreshSslCertificateStatuses()
      } else if (nextMenu === 'source') {
        ensureSelectedSite()
      }
    } finally {
      if (latestMenuLoadingToken === loadingToken) menuContentLoading.value = false
    }
  }

  async function openComposeMenuWithSnapshotCheck() {
    if (composeMenuPreparing) {
      activeMenu.value = 'compose'
      return
    }
    composeMenuPreparing = true
    activeMenu.value = 'compose'
    try {
      const latestSnapshot = await refreshComposeConfigSnapshot()
      const hasSavedDraft = composeUseSavedDraft.value || hasStoredComposeDraft()
      if (latestSnapshot || !hasSavedDraft) {
        await rebuildComposeFromLatestConfig(latestSnapshot)
      } else if (hasSavedDraft) {
        composeUseSavedDraft.value = true
      }
      suppressNextComposeAutoGenerate = true
    } catch (error) {
      reportNginxError('compose-open:failed', { message: error?.message || String(error || '') })
    } finally {
      composeMenuPreparing = false
    }
  }

  async function refreshComposeConfigSnapshot() {
    await loadNginxTopology()
    return buildComposeConfigSnapshot(nginxTopology.value)
  }

  function buildComposeConfigSnapshot(topology = null) {
    const files = Array.isArray(topology?.files) ? topology.files : []
    if (!topology?.ok || !files.length) return null
    const payload = {
      nginxHome: normalizeNginxPath(systemForm.nginxHome || nginxRootPath.value || ''),
      mainConfigPath: normalizeNginxPath(systemForm.mainConfigPath || detectedNginxConf.value || ''),
      files: files.map(file => ({
        path: normalizeNginxPath(file.path || ''),
        hash: String(file.contentHash || ''),
        size: Number(file.size || 0),
        serverCount: Number(file.serverCount || 0),
        includes: (file.includes || []).map(item => ({
          pattern: normalizeNginxPath(item.pattern || ''),
          matched: (item.matched || []).map(target => normalizeNginxPath(target)).sort()
        })).sort((a, b) => a.pattern.localeCompare(b.pattern))
      })).filter(file => file.path).sort((a, b) => a.path.localeCompare(b.path))
    }
    return { ...payload, key: hashComposeSourceCode(JSON.stringify(payload)) }
  }

  function hasStoredComposeDraft() {
    return composeNodes.value.length > 0 && !(composeNodes.value.length === 1 && composeNodes.value[0]?.id === 'compose-main' && !composeEdges.value.length && !composeGeneratedSourceKey.value && !composeDraftSnapshot.value)
  }

  async function rebuildComposeFromLatestConfig(snapshot = null) {
    const savedNodes = composeNodes.value.map(cloneComposePlainObject)
    const savedEdges = composeEdges.value.map(cloneComposePlainObject)
    const baselineGraph = cloneComposePlainObject(composeBaselineGraph.value || null)
    composeUseSavedDraft.value = false
    composeIgnoredSnapshotKey.value = ''
    clearComposePreviewFileCache()
    const latest = await buildLatestComposeGraphFromNginxConf({ forceReload: true })
    if (!latest) return
    const hasSavedGraph = savedNodes.length > 0 && (composeBaselineGraph.value || hasStoredComposeDraft())
    const nextGraph = hasSavedGraph
      ? mergeComposeGraphWithSavedState(latest.graph, { nodes: savedNodes, edges: savedEdges }, baselineGraph)
      : latest.graph
    const normalizedGraph = normalizeComposeGraphIntegrity(completeComposeGraphRealEdges(nextGraph))
    if (shouldKeepCurrentComposeGraph(normalizedGraph)) {
      composeUseSavedDraft.value = true
      return
    }
    composeNodes.value = normalizedGraph.nodes
    composeEdges.value = normalizedGraph.edges
    composeDeletedSourceBlocks.value = []
    selectedComposeEdgeId.value = ''
    selectedComposePortKey.value = ''
    raisedComposeNodeId.value = ''
    composeGeneratedSourceKey.value = latest.sourceKey
    composeBaselineGraph.value = cloneComposePlainObject(latest.graph)
    composeDraftSnapshot.value = snapshot || buildComposeConfigSnapshot(nginxTopology.value)
    composeUseSavedDraft.value = true
    saveComposeDraft()
    closeComposeContextMenu()
    closeComposeFieldPicker()
  }

  async function refreshComposeReadonlyView() {
    if (!props.connected || !props.isSSHSession || composeRefreshLoading.value) return
    composeRefreshLoading.value = true
    menuContentLoading.value = true
    try {
      composeUseSavedDraft.value = false
      composeIgnoredSnapshotKey.value = ''
      clearComposePreviewFileCache()
      nginxTopology.value = null
      nginxTopologyError.value = ''
      const latestSnapshot = await refreshComposeConfigSnapshot()
      const latest = await buildLatestComposeGraphFromNginxConf({ forceReload: true })
      if (!latest) throw new Error('未读取到主配置文件内容')
      const normalizedGraph = normalizeComposeGraphIntegrity(completeComposeGraphRealEdges(latest.graph))
      composeNodes.value = normalizedGraph.nodes
      composeEdges.value = normalizedGraph.edges
      composeDeletedSourceBlocks.value = []
      composeSuppressedEdges.value = []
      selectedComposeEdgeId.value = ''
      selectedComposePortKey.value = ''
      raisedComposeNodeId.value = ''
      composeGeneratedSourceKey.value = latest.sourceKey
      composeBaselineGraph.value = cloneComposePlainObject(latest.graph)
      composeDraftSnapshot.value = latestSnapshot || buildComposeConfigSnapshot(nginxTopology.value)
      composeUseSavedDraft.value = true
      saveComposeDraft()
      closeComposeContextMenu()
      closeComposeFieldPicker()
      ElMessage.success(`已重新加载配置编排：${composeNodes.value.length} 个节点，${composeEdges.value.length} 条关系`)
    } catch (error) {
      reportNginxError('compose-refresh:failed', { message: error?.message || String(error || '') })
      ElMessage.error(`刷新配置编排失败：${error?.message || error}`)
    } finally {
      composeRefreshLoading.value = false
      menuContentLoading.value = false
    }
  }

  function buildActiveHeaderActions() {
    if (activeMenu.value === 'compose') {
      return [
        { key: 'compose-refresh', label: composeRefreshLoading.value ? '刷新中...' : '刷新', type: 'primary', disabled: !props.connected || !props.isSSHSession || composeRefreshLoading.value, handler: refreshComposeReadonlyView },
        { key: 'compose-undo', label: '撤销 Ctrl+Z', disabled: !canUndoCompose(), handler: undoComposeChange },
        { key: 'compose-redo', label: '重做 Ctrl+Y', disabled: !canRedoCompose(), handler: redoComposeChange },
        { key: 'compose-reset', label: '复位编排', disabled: false, handler: resetComposeDraft }
      ]
    }
    if (activeMenu.value === 'source') {
      return [
        { key: 'reload', label: '重载nginx', type: 'primary', disabled: !props.connected || !props.isSSHSession, handler: () => props.runNginxAction?.('reload') },
        { key: 'test', label: '语法校验', disabled: !props.connected || !props.isSSHSession, handler: () => props.runNginxAction?.('test') },
        { key: 'history', label: '历史记录', disabled: !props.connected || !props.isSSHSession, handler: openSourceHistoryDrawer }
      ]
    }
    if (activeMenu.value === 'system') {
      return [
        { key: 'save-system', label: '保存设置', disabled: false, handler: () => saveSystemSettings({ notify: true }) },
        { key: 'scan', label: '按当前设置扫描', type: 'primary', disabled: !props.connected || !props.isSSHSession, handler: () => refreshNginxSites({ notify: true }) }
      ]
    }
    if (activeMenu.value === 'ssl') {
      return [
        { key: 'refresh-ssl', label: sslStatusLoading.value ? '读取中...' : '刷新证书状态', type: 'primary', disabled: !props.connected || !props.isSSHSession || sslStatusLoading.value, handler: () => refreshSslCertificateStatuses({ notify: true }) },
        { key: 'test', label: '语法校验', disabled: !props.connected || !props.isSSHSession, handler: () => props.runNginxAction?.('test') },
        { key: 'reload', label: '重载 Nginx', disabled: !props.connected || !props.isSSHSession, handler: () => props.runNginxAction?.('reload') }
      ]
    }
    return []
  }

  function normalizeSystemSettingsPayload(source = {}) {
    const nginxHome = normalizeNginxPath(source.nginxHome || '/etc/nginx')
    return {
      nginxHome,
      mainConfigPath: normalizeNginxPath(source.mainConfigPath || joinNginxPath(nginxHome, 'nginx.conf')),
      scanPaths: normalizeScanPathsText(resolveSystemScanPaths(source, nginxHome)),
      backupDir: normalizeNginxPath(source.backupDir || '/www/backup/nginx'),
      sslDir: normalizeNginxPath(source.sslDir || '/etc/letsencrypt/live'),
      renewMode: source.renewMode === 'manual' ? 'manual' : 'certbot',
      sslNote: String(source.sslNote || '')
    }
  }

  function buildNginxSafeSaveOptions() {
    return {
      backupDir: systemForm.backupDir || '/www/backup/nginx',
      mainConfigPath: systemForm.mainConfigPath || detectedNginxConf.value || ''
    }
  }

  function createEmptySslAddForm() {
    return {
      mode: 'manual',
      name: '',
      domains: '',
      certPath: '',
      keyPath: '',
      targetDir: ''
    }
  }

  function getMigratedLocalStorageItem(key, oldKey = '') {
    const storage = window.localStorage
    const currentValue = storage?.getItem(key)
    if (currentValue || !oldKey) return currentValue
    const oldValue = storage?.getItem(oldKey)
    if (oldValue) storage?.setItem(key, oldValue)
    return oldValue
  }

  function removeMigratedLocalStorageItem(key, oldKey = '') {
    window.localStorage?.removeItem(key)
    if (oldKey) window.localStorage?.removeItem(oldKey)
  }

  function persistAppStorageItem(key, value) {
    if (!window.whSSH?.setAppStorageItem) return
    window.whSSH.setAppStorageItem({ key, value }).catch(error => {
      reportNginxError('storage-save:failed', { path: key, message: error?.message || String(error || '') })
    })
  }

  function deleteAppStorageItem(key) {
    if (!window.whSSH?.deleteAppStorageItem) return
    window.whSSH.deleteAppStorageItem(key).catch(error => {
      reportNginxError('storage-delete:failed', { path: key, message: error?.message || String(error || '') })
    })
  }

  function getComposeDraftStorageMeta() {
    const nginxHome = normalizeNginxPath(systemForm.nginxHome || nginxRootPath.value || 'default')
    const mainConfigPath = normalizeNginxPath(systemForm.mainConfigPath || detectedNginxConf.value || joinNginxPath(nginxHome, 'nginx.conf'))
    const sourcePath = normalizeNginxPath(props.selectedNginxSiteEditor?.path || props.selectedNginxSitePath || mainConfigPath)
    return {
      draftKey: [nginxHome, mainConfigPath, sourcePath].map(item => encodeURIComponent(item || 'default')).join(':'),
      nginxHome,
      mainConfigPath,
      sourcePath
    }
  }

  function persistComposeDraftItem(value) {
    if (!window.whSSH?.setNginxComposeDraft) return
    const serializedValue = cloneComposePlainObject(value)
    window.whSSH.setNginxComposeDraft({ ...getComposeDraftStorageMeta(), value: serializedValue }).catch(error => {
      reportNginxError('compose-draft-save:failed', { message: error?.message || String(error || '') })
    })
  }

  function deleteComposeDraftItem() {
    if (!window.whSSH?.deleteNginxComposeDraft) return
    window.whSSH.deleteNginxComposeDraft(getComposeDraftStorageMeta()).catch(error => {
      reportNginxError('compose-draft-delete:failed', { message: error?.message || String(error || '') })
    })
  }

  function getComposeDraftLocalStorageKey() {
    return `${COMPOSE_DRAFT_STORAGE_KEY}:${getComposeDraftStorageMeta().draftKey}`
  }

  async function restoreNginxPersistentStateFromDatabase() {
    if (!window.whSSH?.getAppStorageItem) return
    try {
      const [systemSettings, sourceHistory, legacyComposeDraft] = await Promise.all([
        window.whSSH.getAppStorageItem(NGINX_SYSTEM_SETTINGS_STORAGE_KEY),
        window.whSSH.getAppStorageItem(SOURCE_HISTORY_STORAGE_KEY),
        window.whSSH.getAppStorageItem(COMPOSE_DRAFT_STORAGE_KEY)
      ])
      if (systemSettings) Object.assign(systemForm, normalizeSystemSettingsPayload(systemSettings))
      else persistAppStorageItem(NGINX_SYSTEM_SETTINGS_STORAGE_KEY, { version: 1, ...normalizeSystemSettingsPayload(systemForm) })
      if (sourceHistory) sourceHistoryRecords.value = normalizeSourceHistoryItems(sourceHistory.items || sourceHistory)
      else if (sourceHistoryRecords.value.length) persistAppStorageItem(SOURCE_HISTORY_STORAGE_KEY, { version: 1, items: sourceHistoryRecords.value })
      const structuredComposeDraft = await window.whSSH.getNginxComposeDraft?.(getComposeDraftStorageMeta())
      const composeDraft = structuredComposeDraft || legacyComposeDraft
      if (composeDraft) {
        applyComposeDraftPayload(composeDraft)
        if (!structuredComposeDraft) persistComposeDraftItem(composeDraft)
      }
      else if (hasStoredComposeDraft()) saveComposeDraft()
    } catch (error) {
      reportNginxError('storage-restore:failed', { message: error?.message || String(error || '') })
    }
  }

  function restoreManagedSslCertificates() {
    try {
      const raw = getMigratedLocalStorageItem(SSL_CERTIFICATES_STORAGE_KEY, OLD_SSL_CERTIFICATES_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      const items = Array.isArray(parsed) ? parsed : parsed?.items
      sslManagedCertificates.value = normalizeManagedSslCertificates(items)
    } catch (error) {
      removeMigratedLocalStorageItem(SSL_CERTIFICATES_STORAGE_KEY, OLD_SSL_CERTIFICATES_STORAGE_KEY)
    }
  }

  async function loadManagedSslCertificates() {
    if (!window.whSSH?.listNginxSslCertificates) return
    const result = await window.whSSH.listNginxSslCertificates()
    const remoteItems = normalizeManagedSslCertificates(result?.items || [])
    if (remoteItems.length) {
      sslManagedCertificates.value = remoteItems
      return
    }
    if (sslManagedCertificates.value.length) await saveManagedSslCertificates()
  }

  async function saveManagedSslCertificates() {
    if (window.whSSH?.saveNginxSslCertificates) {
      const result = await window.whSSH.saveNginxSslCertificates({ items: sslManagedCertificates.value })
      sslManagedCertificates.value = normalizeManagedSslCertificates(result?.items || sslManagedCertificates.value)
      window.localStorage?.removeItem(SSL_CERTIFICATES_STORAGE_KEY)
      return
    }
    window.localStorage?.setItem(SSL_CERTIFICATES_STORAGE_KEY, JSON.stringify({ version: 1, items: sslManagedCertificates.value }))
  }

  function normalizeManagedSslCertificates(items = []) {
    return (Array.isArray(items) ? items : [])
      .map(item => normalizeManagedSslCertificate(item))
      .filter(item => item.certPath || item.keyPath || item.certbotDomain)
  }

  function normalizeManagedSslCertificate(item = {}) {
    const domains = Array.isArray(item.domains) ? item.domains : parseSslDomainList(item.domains || item.domainText || '')
    const source = item.source === 'certbot' ? 'certbot' : 'manual'
    const certbotDomain = String(item.certbotDomain || domains[0] || '').trim()
    return {
      id: String(item.id || `ssl-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`),
      source,
      name: String(item.name || '').trim(),
      domains,
      certbotDomain,
      certPath: normalizeSslPath(item.certPath || ''),
      keyPath: normalizeSslPath(item.keyPath || ''),
      targetDir: normalizeNginxPath(item.targetDir || '')
    }
  }

  function restoreSystemSettings() {
    try {
      const raw = getMigratedLocalStorageItem(NGINX_SYSTEM_SETTINGS_STORAGE_KEY, OLD_NGINX_SYSTEM_SETTINGS_STORAGE_KEY)
      if (!raw) return
      Object.assign(systemForm, normalizeSystemSettingsPayload(JSON.parse(raw)))
    } catch (error) {
      removeMigratedLocalStorageItem(NGINX_SYSTEM_SETTINGS_STORAGE_KEY, OLD_NGINX_SYSTEM_SETTINGS_STORAGE_KEY)
    }
  }

  function saveSystemSettings(options = {}) {
    const payload = normalizeSystemSettingsPayload(systemForm)
    Object.assign(systemForm, payload)
    window.localStorage?.setItem(NGINX_SYSTEM_SETTINGS_STORAGE_KEY, JSON.stringify({ version: 1, ...payload }))
    persistAppStorageItem(NGINX_SYSTEM_SETTINGS_STORAGE_KEY, { version: 1, ...payload })
    if (options.notify) ElMessage.success('Nginx 系统设置已保存')
  }

  function restoreSourceHistory() {
    try {
      const raw = getMigratedLocalStorageItem(SOURCE_HISTORY_STORAGE_KEY, OLD_SOURCE_HISTORY_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      const items = Array.isArray(parsed) ? parsed : parsed?.items
      sourceHistoryRecords.value = normalizeSourceHistoryItems(items)
    } catch (error) {
      removeMigratedLocalStorageItem(SOURCE_HISTORY_STORAGE_KEY, OLD_SOURCE_HISTORY_STORAGE_KEY)
    }
  }

  function saveSourceHistory() {
    const payload = { version: 1, items: sourceHistoryRecords.value }
    window.localStorage?.setItem(SOURCE_HISTORY_STORAGE_KEY, JSON.stringify(payload))
    persistAppStorageItem(SOURCE_HISTORY_STORAGE_KEY, payload)
  }

  function normalizeSourceHistoryItems(items = []) {
    const seen = new Set()
    return (Array.isArray(items) ? items : [])
      .map(item => typeof item === 'string' ? { path: item } : item)
      .map(item => ({
        path: normalizeNginxPath(item?.path || ''),
        name: String(item?.name || '').trim(),
        label: String(item?.label || '').trim(),
        modified: String(item?.modified || '').trim(),
        editedAt: String(item?.editedAt || '').trim(),
        size: Number(item?.size || 0)
      }))
      .filter(item => item.path && item.path.startsWith('/') && item.editedAt)
      .filter(item => {
        if (seen.has(item.path)) return false
        seen.add(item.path)
        return true
      })
      .slice(0, 80)
  }

  function addSourceEditHistoryRecord(path = '', content = '') {
    const normalizedPath = normalizeNginxPath(path || '')
    if (!normalizedPath || !normalizedPath.startsWith('/')) return
    const editedAt = new Date().toISOString()
    const name = formatPathBasename(normalizedPath)
    sourceHistoryRecords.value = normalizeSourceHistoryItems([
      { path: normalizedPath, name, label: name, modified: editedAt, editedAt, size: String(content || '').length },
      ...sourceHistoryRecords.value.filter(item => !isSameNginxPath(item.path, normalizedPath))
    ])
    saveSourceHistory()
  }

  function formatSourceHistoryTime(value = '') {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return `编辑于 ${date.toLocaleString()}`
  }

  function scheduleSourceAutoSave(path = '', content = '') {
    const normalizedPath = normalizeNginxPath(path || '')
    if (!normalizedPath || !normalizedPath.startsWith('/') || !props.connected || !props.isSSHSession) return
    sourceAutoSaveState.value = 'idle'
    sourcePendingAutoSave = { path: normalizedPath, content: String(content || '') }
    if (sourceAutoSaveTimer) window.clearTimeout(sourceAutoSaveTimer)
    sourceAutoSaveTimer = window.setTimeout(() => {
      sourceAutoSaveTimer = 0
      void flushPendingSourceAutoSave()
    }, 700)
  }

  async function flushPendingSourceAutoSave() {
    if (sourceAutoSaveTimer) {
      window.clearTimeout(sourceAutoSaveTimer)
      sourceAutoSaveTimer = 0
    }
    const payload = sourcePendingAutoSave
    sourcePendingAutoSave = null
    if (!payload?.path) return true
    return writeSourceFileAutomatically(payload.path, payload.content)
  }

  async function writeSourceFileAutomatically(path = '', content = '') {
    const normalizedPath = normalizeNginxPath(path || '')
    if (!normalizedPath || !window.whSSH?.writeTextFile) return false
    if (isSameNginxPath(props.selectedNginxSiteEditor?.path || '', normalizedPath)) sourceAutoSaveState.value = 'saving'
    try {
      await window.whSSH.writeTextFile({ sessionId: props.sessionId, path: normalizedPath, content: String(content || ''), encoding: 'utf8' })
      if (isSameNginxPath(props.selectedNginxSiteEditor?.path || '', normalizedPath)) {
        props.selectedNginxSiteEditor.originalCode = String(content || '')
        sourceAutoSaveState.value = 'idle'
      }
      addSourceEditHistoryRecord(normalizedPath, content)
      return true
    } catch (error) {
      if (isSameNginxPath(props.selectedNginxSiteEditor?.path || '', normalizedPath)) sourceAutoSaveState.value = 'error'
      ElMessage.error(error?.message || '自动写入文件失败')
      return false
    }
  }

  function removeSourceHistoryItem(path = '') {
    const normalized = normalizeNginxPath(path)
    sourceHistoryRecords.value = sourceHistoryRecords.value.filter(item => !isSameNginxPath(item.path, normalized))
    saveSourceHistory()
  }

  function createDefaultScanPaths(nginxHome = '/etc/nginx') {
    const root = normalizeNginxPath(nginxHome || '/etc/nginx')
    return [
      `${root}/*.conf`,
      `${root}/conf.d/*.conf`,
      `${root}/sites-enabled/*`,
      `${root}/vhost/*`,
      `${root}/vhosts/*`,
      `${root}/vhost.d/*`,
      `${root}/servers/*`,
      `${root}/stream.d/*.conf`,
      `${root}/http.d/*.conf`,
      '/www/server/panel/vhost/nginx/*.conf'
    ].join('\n')
  }

  function resolveSystemScanPaths(source = {}, nginxHome = '/etc/nginx') {
    if (Object.prototype.hasOwnProperty.call(source, 'scanPaths')) return source.scanPaths
    const paths = parseScanPaths(createDefaultScanPaths(nginxHome))
    if (source.customScanPaths) paths.push(...parseScanPaths(source.customScanPaths))
    return paths.join('\n')
  }

  function normalizeScanPathsText(value = '') {
    return parseScanPaths(value).join('\n')
  }

  function parseScanPaths(value = '') {
    return String(value || '')
      .split(/\r?\n/)
      .map(item => normalizeNginxPath(item))
      .filter(item => item && item.startsWith('/'))
      .filter((item, index, list) => list.indexOf(item) === index)
  }

  function mergeNginxSiteLists(...lists) {
    const map = new Map()
    lists.flat().filter(Boolean).forEach(site => {
      const key = normalizeNginxPath(site.path || '')
      if (!key) return
      map.set(key, { ...(map.get(key) || {}), ...site, path: key, label: formatSiteMenuLabel(site) })
    })
    return [...map.values()].sort((a, b) => String(a.path || '').localeCompare(String(b.path || '')))
  }

  function buildComposeDirectiveLabels(context = '', baseLabels = [], excludedLabels = []) {
    const excluded = new Set(excludedLabels)
    const catalogLabels = getNginxComposeFieldsForContext(context)
      .map(entry => entry.composeLabel || entry.name)
      .filter(label => label && !label.includes('.') && !excluded.has(label))
    return Array.from(new Set([...baseLabels, ...catalogLabels]))
  }

  function createDefaultComposeNodes() {
    return [
      createComposeNode('main', { id: 'compose-main', x: 28, y: 28 })
    ]
  }

  function createComposeNode(type = 'include', options = {}) {
    const id = options.id || `compose-${type}-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`
    const templates = {
      main: {
        badge: '主节点',
        title: 'nginx.conf',
        items: [
          composeSection('main 全局配置', { key: 'main' }),
          composeField('main.user', 'www-data'),
          composeField('main.worker_processes', 'auto'),
          composeField('main.worker_cpu_affinity', ''),
          composeField('main.worker_rlimit_nofile', ''),
          composeField('main.error_log', '/var/log/nginx/error.log warn'),
          composeField('main.pid', '/run/nginx.pid'),
          composeField('main.load_module', ''),
          composeField('main.env', ''),
          composeField('main.daemon', ''),
          composeField('main.master_process', ''),
          composePort('include', '连接 main context include', 'right', { context: 'main' }),
          composeSection('events { ... }', { key: 'events', collapsed: true }),
          composeField('events.worker_connections', '1024'),
          composeField('events.use', ''),
          composeField('events.multi_accept', 'off'),
          composeField('events.accept_mutex', ''),
          composeField('events.accept_mutex_delay', ''),
          composeField('events.worker_aio_requests', ''),
          composeSection('http { ... }', { key: 'http' }),
          composeField('http.default_type', 'application/octet-stream'),
          composeField('http.log_format', ''),
          composeField('http.access_log', '/var/log/nginx/access.log'),
          composeField('http.error_log', ''),
          composeField('http.sendfile', 'on'),
          composeField('http.tcp_nopush', 'on'),
          composeField('http.tcp_nodelay', 'on'),
          composeField('http.keepalive_timeout', '65'),
          composeField('http.keepalive_requests', ''),
          composeField('http.types_hash_max_size', '2048'),
          composeField('http.server_tokens', ''),
          composeField('http.client_max_body_size', ''),
          composeField('http.client_body_timeout', ''),
          composeField('http.client_header_timeout', ''),
          composeField('http.send_timeout', ''),
          composeField('http.reset_timedout_connection', ''),
          composeField('http.gzip', ''),
          composeField('http.gzip_types', ''),
          composeField('http.gzip_min_length', ''),
          composeField('http.proxy_connect_timeout', ''),
          composeField('http.proxy_send_timeout', ''),
          composeField('http.proxy_read_timeout', ''),
          composeField('http.proxy_buffering', ''),
          composeField('http.proxy_buffers', ''),
          composeField('http.proxy_set_header', ''),
          composeField('http.ssl_protocols', ''),
          composeField('http.ssl_ciphers', ''),
          composeField('http.ssl_session_cache', ''),
          composeField('http.ssl_session_timeout', ''),
          composeField('http.resolver', ''),
          composeField('http.map_hash_bucket_size', ''),
          composeField('http.server_names_hash_bucket_size', ''),
          composePort('include', '连接 http context include', 'right', { context: 'http' }),
          composePort('server', '新建/连接 http server 节点', 'right', { context: 'http' })
        ]
      },
      include: {
        badge: options.context ? `include @ ${options.context}` : 'include 节点',
        title: options.title || 'include pattern',
        items: [
          composePort('source', '来自上级 include 端点', 'left'),
          composeField('include.context', options.context || ''),
          composeField('pattern', options.pattern || '/etc/nginx/conf.d/*.conf')
        ]
      },
      server: {
        badge: 'server 节点',
        title: options.title || 'server',
        items: [
          composePort('source', '来自 http.server', 'left'),
          composeSection('server 基础配置', { key: 'server' }),
          composeField('listen', '443 ssl http2'),
          composeField('server_name', 'example.com www.example.com'),
          composeField('root', '/www/example'),
          composeField('index', ''),
          composeField('charset', ''),
          composeField('client_max_body_size', ''),
          composeSection('server 日志配置', { key: 'serverLog', collapsed: true }),
          composeField('access_log', ''),
          composeField('error_log', ''),
          composeSection('server SSL 配置', { key: 'serverSsl', collapsed: true }),
          composeField('ssl_certificate', '/etc/letsencrypt/live/example.com/fullchain.pem'),
          composeField('ssl_certificate_key', ''),
          composeSection('server 扩展指令', { key: 'serverExtra', collapsed: true }),
          composeField('add_header', ''),
          composeField('rewrite', ''),
          composeField('set', ''),
          composeField('return', ''),
          composePort('location', '新建/连接 location 节点'),
          composePort('include', '连接 server 内 include')
        ]
      },
      location: {
        badge: 'location 节点',
        title: options.title || 'location /',
        items: [
          composePort('source', '来自 server.location', 'left'),
          composeSection('location 匹配配置', { key: 'location' }),
          composeField('path', '/'),
          composeField('root', ''),
          composeField('alias', ''),
          composeField('index', ''),
          composeField('try_files', ''),
          composeSection('location 代理配置', { key: 'locationProxy', collapsed: true }),
          composeField('proxy_pass', 'http://127.0.0.1:3000'),
          composeField('proxy_set_header', ''),
          composeField('proxy_connect_timeout', ''),
          composeField('proxy_send_timeout', ''),
          composeField('proxy_read_timeout', ''),
          composeSection('location FastCGI 配置', { key: 'locationFastcgi', collapsed: true }),
          composeField('fastcgi_pass', ''),
          composeField('fastcgi_param', ''),
          composeSection('location 访问控制', { key: 'locationAccess', collapsed: true }),
          composeField('allow', ''),
          composeField('deny', ''),
          composeSection('location 扩展指令', { key: 'locationExtra', collapsed: true }),
          composeField('add_header', ''),
          composeField('rewrite', ''),
          composeField('return', ''),
          composePort('include', '连接 location 内 include')
        ]
      },
      file: {
        badge: '配置文件节点',
        title: options.title || 'site.conf',
        items: [
          composePort('source', '来自 include.file', 'left'),
          composeField('path', options.path || '/etc/nginx/conf.d/site.conf'),
          composePort('server', '连接文件内 server')
        ]
      }
    }
    const template = templates[type] || templates.include
    const node = {
      id,
      type,
      badge: template.badge,
      title: options.title || template.title,
      context: options.context || '',
      x: Number(options.x ?? 80),
      y: Number(options.y ?? 80),
      width: normalizeComposeSizeValue(options.width),
      height: normalizeComposeSizeValue(options.height),
      zIndex: normalizeComposeNodeZIndex(options.zIndex),
      items: template.items
    }
    normalizeComposeNodeFields(node)
    return node
  }

  function composeField(label, value = '', options = {}) {
    const metadata = getComposeFieldMetadata(label)
    return { id: `field:${label}:${Math.random().toString(16).slice(2)}`, type: 'field', label, value, ...metadata, ...options }
  }

  function composePort(label, hint = '', side = 'right', extra = {}) {
    return { id: `port:${label}:${Math.random().toString(16).slice(2)}`, type: 'port', label, hint, side, ...extra }
  }

  function composeSection(label, options = {}) {
    return { id: `section:${label}:${Math.random().toString(16).slice(2)}`, type: 'section', label, key: options.key || label, collapsed: !!options.collapsed }
  }

  function toggleComposeSection(section) {
    if (!section || section.type !== 'section') return
    section.collapsed = !section.collapsed
  }

  function getVisibleComposeItems(node) {
    return (node?.items || []).filter(item => item?.type === 'port')
  }

  function normalizeComposeNodeFields(node) {
    if (node) node.zIndex = normalizeComposeNodeZIndex(node.zIndex)
    const hasSections = (node?.items || []).some(item => item.type === 'section')
    for (const item of node?.items || []) {
      if (item?.type !== 'field' || typeof item.enabled === 'boolean') continue
      item.enabled = !hasSections || COMPOSE_DEFAULT_ENABLED_FIELDS.has(item.label)
    }
    for (const item of node?.items || []) {
      if (item?.type !== 'field') continue
      Object.assign(item, { ...item, ...getComposeFieldMetadata(item.label) })
    }
  }

  function getComposeSectionFields(node, section) {
    const fields = []
    let insideSection = false
    for (const item of node?.items || []) {
      if (item.type === 'section') {
        insideSection = item.key === section?.key
        continue
      }
      if (insideSection && item.type === 'field' && !isComposeIncludeDirectiveField(item)) fields.push(item)
    }
    return fields
  }

  function isComposeIncludeDirectiveField(item) {
    return item?.type === 'field' && ['main.include', 'events.include', 'http.include', 'server.include', 'location.include', 'stream.include'].includes(item.label)
  }

  function getComposeHiddenSectionFields(node, section) {
    return getComposeSectionFields(node, section).filter(item => item.enabled === false)
  }

  function getComposeHiddenFieldGroups(node) {
    const groups = new Map()
    ;(node?.items || []).forEach(item => {
      if (item?.type !== 'section') return
      addComposeHiddenFieldGroup(groups, item, getComposeHiddenSectionFields(node, item))
    })
    const existingLabels = new Set((node?.items || []).filter(item => item?.type === 'field').map(item => item.label))
    getComposeNodeCatalogContexts(node).flatMap(context => getNginxComposeCatalogEntriesForContext(context)).forEach(entry => {
      const label = entry.composeLabel || entry.id || entry.name
      if (!label || existingLabels.has(label)) return
      const section = getComposeSectionByKey(node, entry.sectionKey) || createComposeVirtualSection(entry.sectionKey)
      addComposeHiddenFieldGroup(groups, section, [createComposeCatalogFieldCandidate(entry)])
    })
    return Array.from(groups.values()).filter(group => group.fields.length)
  }

  function addComposeHiddenFieldGroup(groups, section, fields = []) {
    if (!section?.key || !fields.length) return
    const groupInfo = getNginxComposeGroupInfo(section.key)
    const current = groups.get(section.key) || { section: { ...section, label: section.label || groupInfo.label }, fields: [] }
    current.description = groupInfo.description || current.description || ''
    current.fields.push(...fields)
    groups.set(section.key, current)
  }

  function getComposeNodeCatalogContexts(node) {
    if (node?.type === 'main') return ['main', 'events', 'http']
    if (node?.type === 'server') return ['server']
    if (node?.type === 'location') return ['location']
    if (node?.type === 'include') return ['include']
    return []
  }

  function getComposeSectionByKey(node, key = '') {
    return (node?.items || []).find(item => item?.type === 'section' && item.key === key) || null
  }

  function createComposeVirtualSection(key = '') {
    const groupInfo = getNginxComposeGroupInfo(key)
    return { id: `catalog-section:${key}`, type: 'section', key, label: groupInfo.label || key, collapsed: false, virtual: true }
  }

  function createComposeCatalogFieldCandidate(entry) {
    const schema = getNginxComposeFieldSchema(entry.composeLabel || entry.id || entry.name, entry.contexts?.[0] || '')
    return {
      id: `catalog-field:${entry.id}`,
      type: 'field',
      label: schema.composeLabel || entry.composeLabel || entry.name,
      kind: entry.kind || 'directive',
      enabled: false,
      catalogOnly: true,
      value: schema.defaultValue || '',
      ...getComposeFieldMetadata(schema.composeLabel || entry.composeLabel || entry.name, entry.contexts?.[0] || '')
    }
  }

  function getComposeFilteredHiddenFieldGroups(node) {
    const query = normalizeComposeSearchText(composeFieldPicker.query)
    return getComposeHiddenFieldGroups(node)
      .map(group => ({
        ...group,
        collapsed: !query && isComposeFieldPickerGroupCollapsed(group.section),
        fields: query ? group.fields.filter(field => isComposeFieldMatched(field, group.section, query)) : group.fields
      }))
      .filter(group => group.fields.length)
  }

  function normalizeComposeSearchText(value = '') {
    return String(value || '').trim().toLowerCase()
  }

  function isComposeFieldMatched(field, section, query = '') {
    const text = [field?.label, getComposeFieldDisplayLabel(field), getComposeFieldDescription(field), section?.label]
      .map(item => String(item || '').toLowerCase())
      .join(' ')
    return text.includes(query)
  }

  function getComposeHiddenNodeFieldCount(node) {
    return getComposeHiddenFieldGroups(node).reduce((total, group) => total + group.fields.length, 0)
  }

  function getComposeSectionEnabledFieldCount(node, section) {
    return getComposeSectionFields(node, section).filter(item => item.enabled !== false).length
  }

  function toggleComposeFieldPicker(node, section) {
    if (!node?.id || !section?.key || !getComposeHiddenSectionFields(node, section).length) return
    if (isComposeFieldPickerOpen(node, section)) {
      closeComposeFieldPicker()
      return
    }
    composeFieldPicker.nodeId = node.id
    composeFieldPicker.sectionKey = section.key
    composeFieldPicker.query = ''
    composeFieldPicker.collapsedGroups = {}
  }

  function toggleComposeNodeFieldPicker(node) {
    if (!node?.id || !getComposeHiddenNodeFieldCount(node)) return
    if (isComposeNodeFieldPickerOpen(node)) {
      closeComposeFieldPicker()
      return
    }
    composeFieldPicker.nodeId = node.id
    composeFieldPicker.sectionKey = '__node__'
    composeFieldPicker.query = ''
    composeFieldPicker.collapsedGroups = {}
  }

  function isComposeFieldPickerOpen(node, section) {
    return composeFieldPicker.nodeId === node?.id && composeFieldPicker.sectionKey === section?.key
  }

  function isComposeNodeFieldPickerOpen(node) {
    return composeFieldPicker.nodeId === node?.id && composeFieldPicker.sectionKey === '__node__'
  }

  function closeComposeFieldPicker() {
    composeFieldPicker.nodeId = ''
    composeFieldPicker.sectionKey = ''
    composeFieldPicker.query = ''
    composeFieldPicker.collapsedGroups = {}
    closeComposeSuggestions()
  }

  function getComposeNodeDrawerFieldCount(node) {
    return canOpenComposeSourceDrawer(node) ? 1 : 0
  }

  function canOpenComposeSourceDrawer(node) {
    return ['main', 'server', 'location', 'include'].includes(String(node?.type || ''))
  }

  function openComposeFieldDrawer(node) {
    if (!node?.id || !canOpenComposeSourceDrawer(node)) return
    closeComposeFieldPicker()
    closeComposeContextMenu()
    const editableBlock = buildComposeEditableBlock(node)
    composeFieldDrawer.visible = true
    composeFieldDrawer.nodeId = node.id
    composeFieldDrawer.blockLabel = editableBlock.label
    composeFieldDrawer.path = editableBlock.path
    composeFieldDrawer.code = editableBlock.code
    composeFieldDrawer.error = ''
  }

  function closeComposeFieldDrawer() {
    composeFieldDrawer.visible = false
    composeFieldDrawer.nodeId = ''
    composeFieldDrawer.blockLabel = ''
    composeFieldDrawer.path = 'nginx.conf'
    composeFieldDrawer.code = ''
    composeFieldDrawer.error = ''
    closeComposeSuggestions()
  }

  function getComposeFieldDrawerNode() {
    return composeNodes.value.find(node => node.id === composeFieldDrawer.nodeId) || null
  }

  function getComposeFieldDrawerNodeTitle() {
    const node = getComposeFieldDrawerNode()
    return node ? `${node.badge || node.type} · ${node.title || node.id}` : '未选择节点'
  }

  function buildComposeEditableBlock(node) {
    const path = buildComposeEditableBlockPath(node)
    if (node?.type === 'main') {
      const sourcePath = getComposeNodeFilePath(node) || getSelectedComposeSourcePath() || detectedNginxConf.value
      return {
        label: 'nginx.conf',
        path: sourcePath || path,
        code: buildComposeSourceCodeFromActiveGraph({ sourcePath, mainConfig: true })
      }
    }
    if (node?.type === 'server') {
      return {
        label: 'server { ... }',
        path,
        code: renderComposeServerBlockFromNode(node, getComposeServerChildLocationNodes(node), { nodes: composeNodes.value, edges: composeEdges.value })
      }
    }
    if (node?.type === 'location') {
      return {
        label: 'location { ... }',
        path,
        code: renderComposeLocationBlockFromNode(node, '', { nodes: composeNodes.value, edges: composeEdges.value }).join('\n')
      }
    }
    if (node?.type === 'include') {
      const pattern = getComposeFieldValue(node, 'pattern') || node.title || '/etc/nginx/conf.d/*.conf'
      return {
        label: 'include ...;',
        path,
        code: renderComposeDirectiveLines('include', pattern).join('\n') || `include ${pattern};`
      }
    }
    return { label: '配置块', path, code: '' }
  }

  function buildComposeEditableBlockPath(node) {
    const basePath = normalizeNginxPath(node?.filePath || props.selectedNginxSiteEditor?.path || systemForm.mainConfigPath || 'nginx.conf') || 'nginx.conf'
    if (node?.type === 'main') return basePath
    const suffix = node?.type === 'location' ? '.location.conf' : node?.type === 'include' ? '.include.conf' : '.server.conf'
    return `${basePath}${suffix}`
  }

  function getComposeServerChildLocationNodes(serverNode) {
    return composeNodes.value
      .filter(node => {
        if (node?.type !== 'location') return false
        if (node.parentServerNodeId) return node.parentServerNodeId === serverNode.id
        const parentEdge = getComposeParentEdgeInGraph(node)
        return parentEdge?.fromNodeId === serverNode.id
      })
      .sort(compareComposeDocumentNodes)
  }

  function markComposeNodeEditedFromSource(node, parentServerNode = null) {
    if (!node) return
    node.draft = false
    node.persistedToFile = false
    node.sourceStartLine = 0
    if (node.type === 'location') {
      node.parentServerNodeId = parentServerNode?.id || node.parentServerNodeId || ''
      node.parentNodeId = parentServerNode?.id || node.parentNodeId || ''
      node.parentServerStartLine = 0
    }
  }

  function buildComposeNodeSummaryRows(node) {
    const summaryLabels = node?.type === 'main'
      ? ['main.worker_processes', 'events.worker_connections', 'http.sendfile', 'http.keepalive_timeout', 'http.access_log', 'main.error_log']
      : node?.type === 'server'
        ? ['listen', 'server_name', 'root', 'ssl_certificate', 'raw']
        : node?.type === 'location'
          ? ['path', 'mode', 'proxy_pass', 'root', 'try_files', 'return', 'raw']
          : node?.type === 'include'
            ? ['pattern']
            : []
    return summaryLabels
      .map(label => ({ key: label, label: getComposeSummaryFieldLabel(label), value: summarizeComposeNodeFieldValue(node, label) }))
      .filter(item => item.value)
  }

  function getComposeSummaryFieldLabel(label = '') {
    const friendlyLabels = {
      'main.worker_processes': '工作进程',
      'main.error_log': '错误日志',
      'events.worker_connections': '连接上限',
      'http.sendfile': 'sendfile',
      'http.keepalive_timeout': '长连接',
      'http.access_log': '访问日志',
      listen: '监听',
      server_name: '域名',
      root: '根目录',
      ssl_certificate: '证书',
      raw: '扩展指令',
      path: '路径',
      mode: '模式',
      proxy_pass: '代理',
      try_files: 'try_files',
      return: '返回',
      pattern: '匹配规则'
    }
    const normalizedLabel = String(label || '')
    return friendlyLabels[normalizedLabel] || fieldLabelMap[normalizedLabel] || getComposeFieldDisplayLabel({ label: normalizedLabel })
  }

  function summarizeComposeNodeFieldValue(node, label = '') {
    const value = getComposeFieldValue(node, label)
    if (!value) return ''
    const lines = String(value).split(/\r?\n/).map(item => item.trim()).filter(Boolean)
    if (!lines.length) return ''
    const preview = lines.slice(0, 2).join(' / ')
    return lines.length > 2 ? `${preview} 等 ${lines.length} 项` : preview
  }

  function buildComposeFieldDrawerGroups(node) {
    const contexts = getComposeNodeCatalogContexts(node)
    if (!node || !contexts.length) return []
    const groups = new Map()
    const existingFields = getComposeExistingFieldsByLabel(node)
    const seenLabels = new Set()

    contexts.flatMap(context => getNginxComposeCatalogEntriesForContext(context)).forEach(entry => {
      const label = entry.composeLabel || entry.id || entry.name
      if (!label || seenLabels.has(label)) return
      seenLabels.add(label)
      const existing = existingFields.get(label)
      const section = resolveComposeDrawerSection(node, existing?.section, entry.sectionKey || entry.groupKey || contexts[0])
      addComposeDrawerFieldGroup(groups, section, createComposeDrawerField(node, entry, existing?.field, section, contexts[0]))
    })

    existingFields.forEach(({ field, section }) => {
      if (!field?.label || seenLabels.has(field.label)) return
      const drawerSection = resolveComposeDrawerSection(node, section, field.sectionKey || field.groupKey || contexts[0])
      addComposeDrawerFieldGroup(groups, drawerSection, createComposeDrawerField(node, null, field, drawerSection, contexts[0]))
    })

    return Array.from(groups.values()).filter(group => group.fields.length)
  }

  function getComposeExistingFieldsByLabel(node) {
    const fields = new Map()
    let currentSection = null
    for (const item of node?.items || []) {
      if (item?.type === 'section') {
        currentSection = item
        continue
      }
      if (item?.type !== 'field' || !item.label) continue
      fields.set(item.label, { field: item, section: currentSection })
    }
    return fields
  }

  function resolveComposeDrawerSection(node, existingSection, fallbackKey = '') {
    if (existingSection?.key) return existingSection
    const realSection = getComposeSectionByKey(node, fallbackKey)
    if (realSection) return realSection
    return createComposeVirtualSection(fallbackKey || node?.type || 'default')
  }

  function addComposeDrawerFieldGroup(groups, section, field) {
    if (!section?.key || !field) return
    const groupInfo = getNginxComposeGroupInfo(section.key)
    const current = groups.get(section.key) || { section: { ...section, label: section.label || groupInfo.label }, description: groupInfo.description || '', fields: [] }
    current.fields.push(field)
    current.fields.sort(compareComposeDrawerFields)
    groups.set(section.key, current)
  }

  function compareComposeDrawerFields(a, b) {
    if (!!a?.enabled !== !!b?.enabled) return a?.enabled ? -1 : 1
    return String(getComposeFieldDisplayLabel(a)).localeCompare(String(getComposeFieldDisplayLabel(b)))
  }

  function createComposeDrawerField(node, entry, sourceField, section, context = '') {
    const label = sourceField?.label || entry?.composeLabel || entry?.id || entry?.name || ''
    const metadata = getComposeFieldMetadata(label, entry?.contexts?.[0] || context)
    const disabledKind = entry?.kind === 'block' || isComposeIncludeDirectiveField({ type: 'field', label })
    return {
      id: `drawer:${node.id}:${label}`,
      type: 'field',
      label,
      value: sourceField ? sourceField.value : (metadata.defaultValue || entry?.defaultValue || ''),
      enabled: sourceField ? sourceField.enabled !== false : false,
      kind: entry?.kind || sourceField?.kind || 'directive',
      sectionKey: section?.key || entry?.sectionKey || entry?.groupKey || context,
      drawerDisabled: disabledKind,
      catalogOnly: !sourceField,
      ...metadata
    }
  }

  async function saveComposeFieldDrawer() {
    const node = getComposeFieldDrawerNode()
    if (!node) {
      closeComposeFieldDrawer()
      return
    }
    const code = String(composeFieldDrawer.code || '').trim()
    if (!code) {
      composeFieldDrawer.error = '代码块不能为空。'
      return
    }
    try {
      pushComposeHistorySnapshot()
      if (node.type === 'main') applyComposeMainBlockCode(node, code)
      else if (node.type === 'server') applyComposeServerBlockCode(node, code)
      else if (node.type === 'location') applyComposeLocationBlockCode(node, code)
      else if (node.type === 'include') {
        await applyComposeIncludeBlockCode(node, code)
      } else {
        throw new Error('当前节点类型暂不支持源码块编辑。')
      }
      normalizeComposeNodeFields(node)
      saveComposeDraft()
      composeFieldDrawer.error = ''
      closeComposeFieldDrawer()
    } catch (error) {
      composeFieldDrawer.error = error?.message || '解析失败，请检查 Nginx 语法。'
      ElMessage.error(composeFieldDrawer.error)
    }
  }

  function applyComposeMainBlockCode(mainNode, code = '') {
    if (!/\bhttp\s*\{/.test(String(code || ''))) throw new Error('主节点代码至少需要包含 http { ... } 配置块。')
    applyMainComposeFields(mainNode, code)
    mainNode.title = formatPathBasename(getComposeNodeFilePath(mainNode)) || mainNode.title || 'nginx.conf'
    markComposeNodeEditedFromSource(mainNode)
  }

  function applyComposeServerBlockCode(serverNode, code = '') {
    const lines = String(code || '').split(/\r?\n/)
    if (!/^server\s*\{$/.test(String(lines[0] || '').trim())) throw new Error('server 节点代码必须以 server { 开头。')
    const parsedServer = parseServerBlock(lines)
    const hasLocationBlocks = lines.some((line, index) => index > 0 && /^\s*location\s+.+\{$/.test(String(line || '').trim()))
    applyServerComposeFields(serverNode, parsedServer)
    serverNode.title = parsedServer.serverNameText || serverNode.title || 'server'
    markComposeNodeEditedFromSource(serverNode)
    syncComposeServerLocationNodesFromParsed(serverNode, hasLocationBlocks && Array.isArray(parsedServer.locations) ? parsedServer.locations : [])
  }

  function applyComposeLocationBlockCode(locationNode, code = '') {
    const lines = String(code || '').split(/\r?\n/)
    if (!/^location\s+.+\{$/.test(String(lines[0] || '').trim())) throw new Error('location 节点代码必须以 location ... { 开头。')
    const parsedLocation = parseLocationBlock(lines)
    applyLocationComposeFields(locationNode, parsedLocation)
    locationNode.title = `location ${parsedLocation.matcher || '/'}`
    markComposeNodeEditedFromSource(locationNode)
  }

  async function applyComposeIncludeBlockCode(includeNode, code = '') {
    const patterns = String(code || '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const match = line.match(/^include\s+(.+?)\s*;?$/)
        if (!match) throw new Error('include 节点代码必须是 include /path/to/file.conf; 这种格式。')
        return normalizeDirectiveValue(match[1])
      })
      .filter(Boolean)
    if (!patterns.length) throw new Error('至少需要一条 include 指令。')
    const nextPattern = patterns.join('\n')
    setComposeFieldValue(includeNode, 'pattern', nextPattern)
    includeNode.title = patterns[0]
    markComposeNodeEditedFromSource(includeNode)
    await refreshComposeIncludeNode(includeNode)
  }

  function syncComposeServerLocationNodesFromParsed(serverNode, parsedLocations = []) {
    const currentLocations = getComposeServerChildLocationNodes(serverNode)
    parsedLocations.forEach((location, index) => {
      const existing = currentLocations[index]
      const locationNode = existing || createComposeNode('location', {
        id: `compose-location:drawer:${Date.now()}:${index}:${Math.random().toString(16).slice(2)}`,
        title: `location ${location.matcher || '/'}`,
        x: (serverNode.x || 80) + 430,
        y: (serverNode.y || 80) + index * 132
      })
      locationNode.filePath = serverNode.filePath
      locationNode.parentServerNodeId = serverNode.id
      locationNode.parentNodeId = serverNode.id
      applyLocationComposeFields(locationNode, location)
      locationNode.title = `location ${location.matcher || '/'}`
      markComposeNodeEditedFromSource(locationNode, serverNode)
      normalizeComposeNodeFields(locationNode)
      addOrUpdateComposeNode(locationNode)
      addComposeEdgeIfAllowed(serverNode, getComposeOutputPort(serverNode, 'location'), locationNode, getComposeInputPort(locationNode))
    })
    const removableLocationIds = currentLocations.slice(parsedLocations.length).map(node => node.id)
    if (removableLocationIds.length) removeComposeNodesByIds(removableLocationIds)
  }

  function removeComposeNodesByIds(nodeIds = []) {
    const removableIds = collectComposeNodeBranchIds(nodeIds)
    if (!removableIds.size) return
    composeNodes.value = composeNodes.value.filter(node => !removableIds.has(node.id))
    composeEdges.value = composeEdges.value.filter(edge => !removableIds.has(edge.fromNodeId) && !removableIds.has(edge.toNodeId))
  }

  function collectComposeNodeBranchIds(nodeIds = []) {
    const removableIds = new Set((Array.isArray(nodeIds) ? nodeIds : []).filter(Boolean))
    let changed = true
    while (changed) {
      changed = false
      composeEdges.value.forEach(edge => {
        if (!removableIds.has(edge.fromNodeId) || removableIds.has(edge.toNodeId)) return
        removableIds.add(edge.toNodeId)
        changed = true
      })
    }
    return removableIds
  }

  function ensureComposeNodeSection(node, section) {
    if (!node || !section?.key) return null
    const existing = getComposeSectionByKey(node, section.key)
    if (existing) return existing
    if (!node.items?.some(item => item?.type === 'section')) return null
    const created = composeSection(section.label || getNginxComposeGroupInfo(section.key).label || section.key, { key: section.key, collapsed: false })
    const firstPortIndex = node.items.findIndex(item => item?.type === 'port')
    node.items.splice(firstPortIndex >= 0 ? firstPortIndex : node.items.length, 0, created)
    return created
  }

  function toggleComposeFieldPickerGroup(section) {
    if (!section?.key) return
    composeFieldPicker.collapsedGroups[section.key] = !composeFieldPicker.collapsedGroups[section.key]
  }

  function isComposeFieldPickerGroupCollapsed(section) {
    return !!composeFieldPicker.collapsedGroups[section?.key]
  }

  function openComposeSuggestions(field) {
    if (!getComposeFieldSuggestions(field).length) return
    composeSuggestPicker.fieldId = field.id || ''
  }

  function closeComposeSuggestions() {
    composeSuggestPicker.fieldId = ''
  }

  function isComposeSuggestionsOpen(field) {
    return !!field?.id && composeSuggestPicker.fieldId === field.id && getComposeFieldSuggestions(field).length > 0
  }

  function getComposeFilteredSuggestions(field) {
    const suggestions = getComposeFieldSuggestions(field)
    const query = normalizeComposeSearchText(field?.value)
    if (!query) return suggestions
    return suggestions.filter(item => String(item || '').toLowerCase().includes(query))
  }

  function selectComposeSuggestion(field, suggestion = '') {
    if (!field) return
    field.value = suggestion
    closeComposeSuggestions()
  }

  function enableComposeField(node, field, section) {
    if (!field || field.type !== 'field') return
    if (isComposeBlockCatalogCandidate(field)) return
    const targetField = field.catalogOnly ? insertComposeCatalogField(node, field, section) : field
    if (!targetField) return
    targetField.enabled = true
    if (isComposeSelectField(targetField) && !targetField.value && getComposeFieldOptions(targetField).includes('off')) targetField.value = 'off'
    const realSection = getComposeSectionByKey(node, section?.key) || section
    if (realSection?.type === 'section') realSection.collapsed = false
    closeComposeFieldPicker()
  }

  function insertComposeCatalogField(node, candidate, section) {
    if (!node || !candidate?.label) return null
    const existing = (node.items || []).find(item => item?.type === 'field' && item.label === candidate.label)
    if (existing) return existing
    const field = composeField(candidate.label, candidate.value || '')
    Object.assign(field, getComposeFieldMetadata(candidate.label, getComposeNodeCatalogContexts(node)[0] || ''), { enabled: true })
    const realSection = getComposeSectionByKey(node, section?.key)
    const insertIndex = getComposeFieldInsertIndex(node, realSection)
    node.items.splice(insertIndex, 0, field)
    return field
  }

  function getComposeFieldInsertIndex(node, section) {
    if (!section) {
      const portIndex = (node?.items || []).findIndex(item => item?.type === 'port')
      return portIndex >= 0 ? portIndex : (node?.items || []).length
    }
    const sectionIndex = node.items.findIndex(item => item === section)
    if (sectionIndex < 0) return node.items.length
    let insertIndex = sectionIndex + 1
    while (insertIndex < node.items.length && node.items[insertIndex]?.type === 'field') insertIndex += 1
    return insertIndex
  }

  function isComposeBlockCatalogCandidate(field) {
    return field?.catalogOnly && field.kind === 'block'
  }

  function isComposeFieldInSection(node, field) {
    let insideSection = false
    for (const item of node?.items || []) {
      if (item.type === 'section') insideSection = true
      if (item === field) return insideSection
    }
    return false
  }

  function getComposeFieldDisplayLabel(field) {
    const label = String(field?.label || '')
    const dotIndex = label.indexOf('.')
    return dotIndex >= 0 ? label.slice(dotIndex + 1) : label
  }

  function getComposeFieldDescription(field) {
    return getComposeBeginnerFieldDescription(field?.label, field?.description)
  }

  function getComposeFieldMetadata(label = '', context = '') {
    const schema = getNginxComposeFieldSchema(label, context) || COMPOSE_FIELD_SCHEMA[label] || {}
    const form = schema.form || 'input'
    return {
      inputType: form === 'select' ? 'select' : form === 'textarea' ? 'textarea' : 'input',
      form,
      options: Array.isArray(schema.options) ? schema.options : undefined,
      suggestions: Array.isArray(schema.suggestions) ? schema.suggestions : undefined,
      rows: Number(schema.rows || 0) || undefined,
      description: getComposeBeginnerFieldDescription(label, schema.description || COMPOSE_FIELD_DESCRIPTIONS[label] || '')
    }
  }

  function getComposeBeginnerFieldDescription(label = '', fallback = '') {
    const normalizedLabel = String(label || '')
    const displayLabel = normalizedLabel.includes('.') ? normalizedLabel.slice(normalizedLabel.lastIndexOf('.') + 1) : normalizedLabel
    return COMPOSE_BEGINNER_FIELD_DESCRIPTIONS[normalizedLabel]
      || COMPOSE_BEGINNER_FIELD_DESCRIPTIONS[displayLabel]
      || buildComposeBeginnerDescription(displayLabel, fallback)
  }

  function buildComposeBeginnerDescription(label = '', fallback = '') {
    const name = String(label || '').replace(/_/g, ' ')
    if (!label) return fallback || '常用 Nginx 配置项。添加后会写入当前节点对应的配置块。'
    if (label.startsWith('ssl_')) return fallback || `${name} 是 HTTPS/证书相关配置。不了解 TLS 时建议使用模板或证书工具生成的推荐值。`
    if (label.startsWith('proxy_')) return fallback || `${name} 是反向代理相关配置。它会影响 Nginx 转发请求到后端服务的方式。`
    if (label.startsWith('fastcgi_')) return fallback || `${name} 是 FastCGI/PHP 相关配置。只有 PHP-FPM 或 FastCGI 项目通常才需要。`
    if (label.startsWith('uwsgi_')) return fallback || `${name} 是 uWSGI 应用相关配置。只有 Python/uWSGI 项目通常才需要。`
    if (label.startsWith('scgi_')) return fallback || `${name} 是 SCGI 应用相关配置。大多数普通网站不需要。`
    if (label.startsWith('gzip_')) return fallback || `${name} 是 gzip 压缩相关配置。它会影响文本、脚本、样式等响应是否压缩。`
    if (label.includes('timeout')) return fallback || `${name} 是超时时间配置。数值太小容易断开，太大会让异常连接占用资源更久。`
    if (label.includes('buffer')) return fallback || `${name} 是缓冲区配置。只有响应头/响应体较大或出现 buffer 报错时通常才需要调整。`
    if (label.includes('cache')) return fallback || `${name} 是缓存相关配置。启用前要确认哪些内容可以被缓存，避免把用户私有数据缓存出去。`
    if (label.includes('hash')) return fallback || `${name} 是内部哈希表大小配置。通常只有 Nginx 启动提示 hash 相关警告时才需要调整。`
    if (label.includes('log')) return fallback || `${name} 是日志相关配置。用于记录访问、错误或调试信息，排查问题时很有用。`
    return fallback || `${name} 是 Nginx 指令。添加后会写入当前配置块；不确定用途时建议先保持默认或查确认后再启用。`
  }

  function isComposeSelectField(field) {
    return field?.form === 'select' || field?.inputType === 'select'
  }

  function getComposeFieldOptions(field) {
    return Array.isArray(field?.options) && field.options.length ? field.options : COMPOSE_ON_OFF_OPTIONS
  }

  function isComposeTextareaField(field) {
    return field?.inputType === 'textarea' || field?.form === 'textarea'
  }

  function isComposeMultiSelectField(field) {
    return field?.form === 'multi-select' && getComposeFieldOptions(field).length > 0
  }

  function getComposeMultiSelectValues(field) {
    return String(field?.value || '').split(/\s+/).filter(Boolean)
  }

  function isComposeMultiSelectOptionActive(field, option = '') {
    return getComposeMultiSelectValues(field).includes(option)
  }

  function toggleComposeMultiSelectOption(field, option = '') {
    if (!field || !option) return
    const values = getComposeMultiSelectValues(field)
    const nextValues = values.includes(option)
      ? values.filter(item => item !== option)
      : [...values, option]
    field.value = getComposeFieldOptions(field).filter(item => nextValues.includes(item)).join(' ')
  }

  function isComposeComboboxField(field) {
    return ['combobox', 'suggest'].includes(field?.form) && getComposeFieldSuggestions(field).length > 0
  }

  function getComposeFieldRows(field) {
    return Math.max(2, Math.min(6, Number(field?.rows || 3)))
  }

  function getComposeFieldSuggestions(field) {
    return Array.isArray(field?.suggestions) ? field.suggestions.filter(Boolean) : []
  }

  function getComposeFieldDatalistId(field) {
    return `compose-suggestions-${String(field?.id || field?.label || '').replace(/[^a-zA-Z0-9_-]/g, '-')}`
  }

  function buildComposePorts(node) {
    return [...getComposeStaticPorts(node), ...getComposeIncludeFilePorts(node)]
  }

  function getComposePorts(node) {
    if (!node?.id) return []
    return composeNodeById.value.get(node.id) === node
      ? composePortsByNodeId.value.get(node.id) || buildComposePorts(node)
      : buildComposePorts(node)
  }

  function getComposeStaticPorts(node) {
    return (node?.items || []).filter(item => item.type === 'port')
  }

  function getComposeTopPorts(node) {
    return getComposeStaticPorts(node)
  }

  function getComposePortsBySide(node, side = 'right') {
    const targetSide = side === 'left' ? 'left' : 'right'
    return getComposePorts(node).filter(item => (item.side || 'right') === targetSide)
  }

  function getComposeTopPortsBySide(node, side = 'right') {
    const targetSide = side === 'left' ? 'left' : 'right'
    return getComposeTopPorts(node).filter(item => (item.side || 'right') === targetSide)
  }

  function isComposeIncludeNode(node) {
    return node?.type === 'include'
  }

  function getComposeIncludeFiles(node) {
    if (!node?.id || !isComposeIncludeNode(node)) return []
    return composeNodeById.value.get(node.id) === node
      ? composeIncludeFilesByNodeId.value.get(node.id) || buildComposeIncludeFiles(node)
      : buildComposeIncludeFiles(node)
  }

  function buildComposeIncludeFiles(node) {
    if (!isComposeIncludeNode(node)) return []
    const pattern = normalizeDirectiveValue(getComposeFieldValue(node, 'pattern'))
    const ownerPath = normalizeNginxPath(node.filePath || getSelectedComposeSourcePath())
    const resolvedPaths = pattern ? resolveComposeIncludeMatches(pattern, ownerPath) : []
    if (resolvedPaths.length) {
      return resolvedPaths.map((path, index) => normalizeComposeIncludeFile({ path, name: formatPathBasename(path), unresolved: false }, index)).filter(Boolean)
    }
    const storedFiles = Array.isArray(node.matchedFiles) ? node.matchedFiles : []
    if (storedFiles.length) return storedFiles.map((file, index) => normalizeComposeIncludeFile(file, index)).filter(Boolean)
    if (!pattern) return []
    const unresolvedPath = resolveComposeIncludePattern(pattern, ownerPath) || pattern
    return [normalizeComposeIncludeFile({ path: unresolvedPath, name: pattern, unresolved: !isConcreteComposeFilePattern(pattern) }, 0)].filter(Boolean)
  }

  function normalizeComposeIncludeFile(file, index = 0) {
    const path = normalizeNginxPath(typeof file === 'string' ? file : file?.path || '')
    const unresolved = !!(typeof file === 'object' && file?.unresolved)
    const name = String(typeof file === 'object' ? file?.name || '' : '').trim() || formatPathBasename(path) || (unresolved ? '未匹配到文件' : `配置文件 ${index + 1}`)
    const id = String(typeof file === 'object' ? file?.id || '' : '').trim() || `include-file:${makeTopologyIdPart(path || name)}:${index}`
    return { id, path, name, unresolved }
  }

  function markComposeNodePreviewSource(node, source = '') {
    if (!node) return
    node.previewSource = String(source || '').trim()
  }

  function markComposeNodePreviewScope(node, scopeKey = '') {
    if (!node) return
    node.previewScopeKey = String(scopeKey || '').trim()
  }

  function isComposeExternalPreviewNode(node = {}) {
    return String(node?.previewSource || '') === 'external-file'
  }

  function getComposeNodePreviewHint(node = {}) {
    if (!isComposeExternalPreviewNode(node)) return ''
    const path = normalizeNginxPath(node.filePath || '')
    if (node.type === 'include') return `预览链节点：当前通过远程读取 ${path || '目标文件'} 展开，只有保存到文件后才会真正落盘。`
    return `预览文件节点：当前内容来自 ${path || '外部配置文件'}，尚未自动接入主链。`
  }

  function getComposePreviewScopeKey(parentNode = null, filePath = '') {
    const parentKey = String(parentNode?.id || '').trim()
    const normalizedPath = normalizeNginxPath(filePath || '')
    if (!parentKey || !normalizedPath) return ''
    return `${parentKey}::${normalizedPath}`
  }

  function getComposeIncludeFilePorts(node) {
    return getComposeIncludeFiles(node).map(file => getComposeIncludeFilePort(node, file)).filter(Boolean)
  }

  function getComposeTopologyFileByPath(filePath = '') {
    const normalizedPath = normalizeNginxPath(filePath || '')
    if (!normalizedPath) return null
    return (Array.isArray(nginxTopology.value?.files) ? nginxTopology.value.files : []).find(file => isSameNginxPath(file?.path || '', normalizedPath)) || null
  }

  function hasComposeIncludeFileServerBlocks(filePath = '') {
    const topologyFile = getComposeTopologyFileByPath(filePath) || getComposeCachedPreviewFile(filePath)
    return !!(Array.isArray(topologyFile?.servers) && topologyFile.servers.length)
  }

  function getComposeCachedPreviewFile(filePath = '') {
    const normalizedPath = normalizeNginxPath(filePath || '')
    if (!normalizedPath) return null
    return composePreviewFileCache.value.get(normalizedPath) || null
  }

  function setComposeCachedPreviewFile(filePath = '', file = null) {
    const normalizedPath = normalizeNginxPath(filePath || file?.path || '')
    if (!normalizedPath) return null
    if (!file) {
      composePreviewFileCache.value.delete(normalizedPath)
      return null
    }
    const normalizedFile = {
      ...file,
      path: normalizedPath,
      previewSource: 'external-file',
      includes: Array.isArray(file.includes) ? file.includes : [],
      servers: Array.isArray(file.servers) ? file.servers : []
    }
    composePreviewFileCache.value.set(normalizedPath, normalizedFile)
    return normalizedFile
  }

  function clearComposePreviewFileCache() {
    composePreviewFileCache.value.clear()
  }

  function extractComposeBlockRecords(content = '', blockPattern = /.^/, targetDepth = 0) {
    const records = []
    const lines = String(content || '').split(/\r?\n/)
    let active = null
    let depth = 0
    lines.forEach((line, index) => {
      const sourceLine = String(line || '')
      const stripped = stripComposeInlineComment(sourceLine).trim()
      const braceDelta = countToken(sourceLine, '{') - countToken(sourceLine, '}')
      const depthBefore = depth
      if (!active && depthBefore === targetDepth && blockPattern.test(stripped)) {
        active = { startLine: index + 1, lines: [sourceLine], depth: braceDelta }
        if (active.depth <= 0) {
          records.push(active)
          active = null
        }
      } else if (active) {
        active.lines.push(sourceLine)
        active.depth += braceDelta
        if (active.depth <= 0) {
          records.push(active)
          active = null
        }
      }
      depth += braceDelta
    })
    return records
  }

  function getComposePreviewIncludeParentBlockRefByLine(code = '', lineNumber = 0) {
    if (!lineNumber) return null
    const lines = String(code || '').split(/\r?\n/)
    const stack = []
    for (let index = 0; index < Math.min(lineNumber - 1, lines.length); index += 1) {
      const rawLine = String(lines[index] || '')
      const stripped = stripComposeInlineComment(rawLine).trim()
      const locationMatch = stripped.match(/^location\s+(?:(=|~\*|~|\^~)\s+)?(.+?)\s*\{\s*$/)
      if (locationMatch) stack.push({ type: 'location', startLine: index + 1 })
      else if (/^server\s*\{\s*$/.test(stripped)) stack.push({ type: 'server', startLine: index + 1 })
      const closeCount = countToken(stripped, '}')
      for (let closeIndex = 0; closeIndex < closeCount; closeIndex += 1) stack.pop()
    }
    for (let index = stack.length - 1; index >= 0; index -= 1) {
      if (['location', 'server'].includes(stack[index]?.type)) return stack[index]
    }
    return null
  }

  function buildComposePreviewServersFromContent(content = '', filePath = '') {
    return extractComposeBlockRecords(content, /^server\s*\{\s*$/, 0).map((record, serverIndex) => {
      const parsedServer = parseServerBlock(record.lines)
      const locations = extractComposeBlockRecords(record.lines.join('\n'), /^location\s+.+\{\s*$/, 1).map((locationRecord, locationIndex) => {
        const parsedLocation = parseLocationBlock(locationRecord.lines)
        return {
          ...parsedLocation,
          startLine: record.startLine + locationRecord.startLine - 1,
          path: parsedLocation.matcher || '/',
          title: `location ${parsedLocation.matcher || '/'}`
        }
      })
      return {
        ...parsedServer,
        path: normalizeNginxPath(filePath || ''),
        title: parsedServer.serverNameText || `server ${serverIndex + 1}`,
        serverName: parsedServer.serverNameText || '',
        startLine: record.startLine,
        listen: parsedServer.listenText || '80',
        raw: String(parsedServer.customDirectives || '').trim(),
        locations
      }
    })
  }

  function buildComposePreviewIncludesFromContent(content = '', filePath = '') {
    return buildComposeIncludesFromSource(null, content, filePath).map(includeItem => {
      const parentBlock = getComposePreviewIncludeParentBlockRefByLine(content, Number(includeItem?.line || 0))
      return {
        ...includeItem,
        parentType: parentBlock?.type || '',
        parentStartLine: Number(parentBlock?.startLine || 0)
      }
    })
  }

  async function getComposePreviewFileByPath(filePath = '') {
    const normalizedPath = normalizeNginxPath(filePath || '')
    if (!normalizedPath) return null
    const topologyFile = getComposeTopologyFileByPath(normalizedPath)
    if (topologyFile) return topologyFile
    const cached = getComposeCachedPreviewFile(normalizedPath)
    if (cached) return cached
    if (!window.whSSH?.readTextFile || !props.sessionId) return null
    try {
      const content = await window.whSSH.readTextFile({ sessionId: props.sessionId, path: normalizedPath, encoding: 'utf8' })
      return setComposeCachedPreviewFile(normalizedPath, {
        path: normalizedPath,
        content,
        includes: buildComposePreviewIncludesFromContent(content, normalizedPath),
        servers: buildComposePreviewServersFromContent(content, normalizedPath)
      })
    } catch (error) {
      reportNginxError('compose-preview:read-file-failed', {
        path: normalizedPath,
        message: error?.message || String(error || '')
      })
      return null
    }
  }

  function getComposeIncludeFilePort(node, file) {
    if (!isComposeIncludeNode(node) || !file?.path || file.unresolved || !hasComposeIncludeFileServerBlocks(file.path)) return null
    return {
      id: `port:file:${makeTopologyIdPart(file.path)}`,
      type: 'port',
      label: 'server',
      hint: `连接 ${file.name || file.path} 内的 server`,
      side: 'right',
      placement: 'include-file',
      fileId: file.id,
      filePath: file.path
    }
  }

  async function refreshComposeIncludeNode(node) {
    if (!isComposeIncludeNode(node)) return
    await loadNginxTopology()
    clearComposePreviewFileCache()
    const pattern = normalizeDirectiveValue(getComposeFieldValue(node, 'pattern'))
    const ownerPath = normalizeNginxPath(node.filePath || getSelectedComposeSourcePath())
    node.title = pattern || node.title || 'include pattern'
    const resolvedPaths = pattern ? resolveComposeIncludeMatches(pattern, ownerPath) : []
    node.matchedFiles = resolvedPaths.length
      ? resolvedPaths.map((path, index) => normalizeComposeIncludeFile({ path, name: formatPathBasename(path), unresolved: false }, index)).filter(Boolean)
      : pattern ? [normalizeComposeIncludeFile({ path: resolveComposeIncludePattern(pattern, ownerPath) || pattern, name: pattern, unresolved: !isConcreteComposeFilePattern(pattern) }, 0)].filter(Boolean) : []
    await syncComposeIncludeMatchedNodes(node)
    saveComposeDraft()
  }

  async function syncComposeIncludeMatchedNodes(includeNode) {
    const files = getComposeIncludeFiles(includeNode).filter(file => file.path && !file.unresolved)
    const filePathSet = new Set(files.map(file => normalizeNginxPath(file.path)))
    composeEdges.value = composeEdges.value.filter(edge => {
      if (edge.fromNodeId !== includeNode.id || !String(edge.fromPortId || '').startsWith('port:file:')) return true
      const targetNode = getComposeNodeById(edge.toNodeId)
      return targetNode && filePathSet.has(normalizeNginxPath(targetNode.filePath || ''))
    })
    pruneComposeIncludeDetachedSourceNodes(includeNode, filePathSet)
    const visitedFiles = new Set()
    for (let index = 0; index < files.length; index += 1) {
      await syncComposeIncludeFileNodes(includeNode, files[index], index, { visitedFiles, depth: 0 })
    }
  }

  function pruneComposeIncludeDetachedSourceNodes(includeNode, activeFilePathSet = new Set()) {
    if (!includeNode?.id) return
    const removableNodeIds = new Set()
    let changed = true
    while (changed) {
      changed = false
      composeNodes.value.forEach(node => {
        if (!node?.id || removableNodeIds.has(node.id)) return
        if (!['include', 'server', 'location'].includes(node.type)) return
        if (Number(node.sourceStartLine || 0) <= 0 || getComposeParentEdge(node)) return
        const nodePath = normalizeNginxPath(node.filePath || '')
        const directChild = String(node.parentNodeId || '') === includeNode.id
        const nestedChild = removableNodeIds.has(String(node.parentNodeId || '')) || removableNodeIds.has(String(node.parentServerNodeId || ''))
        if (!directChild && !nestedChild) return
        if (nodePath && activeFilePathSet.has(nodePath)) return
        removableNodeIds.add(node.id)
        changed = true
      })
    }
    if (!removableNodeIds.size) return
    composeNodes.value = composeNodes.value.filter(node => !removableNodeIds.has(node.id))
    composeEdges.value = composeEdges.value.filter(edge => !removableNodeIds.has(edge.fromNodeId) && !removableNodeIds.has(edge.toNodeId))
  }

  async function syncComposeIncludeFileNodes(includeNode, includeFile, fileIndex = 0, options = {}) {
    const filePath = normalizeNginxPath(includeFile?.path || '')
    const topologyFile = await getComposePreviewFileByPath(filePath)
    if (!topologyFile) return
    const visitedFiles = options.visitedFiles instanceof Set ? options.visitedFiles : new Set()
    const depth = Number(options.depth || 0)
    const visitedBefore = visitedFiles.has(filePath)
    if (!visitedBefore) visitedFiles.add(filePath)
    const filePort = getComposeIncludeFilePort(includeNode, includeFile)
    const previewScopeKey = topologyFile?.previewSource === 'external-file' ? getComposePreviewScopeKey(includeNode, filePath) : ''
    ;(Array.isArray(topologyFile.servers) ? topologyFile.servers : []).forEach((server, serverIndex) => {
      const sourceStartLine = Number(server.startLine || 0)
      const serverNode = findComposeNodeBySource('server', filePath, sourceStartLine, { previewScopeKey }) || createComposeNode('server', {
        id: previewScopeKey
          ? `compose-server-preview:${makeTopologyIdPart(previewScopeKey)}:${sourceStartLine || serverIndex}`
          : `compose-server:${makeTopologyIdPart(filePath)}:${sourceStartLine || serverIndex}`,
        title: server.title || server.serverName || `server ${serverIndex + 1}`,
        x: (includeNode.x || 80) + getComposeNodeWidth(includeNode) + 70,
        y: (includeNode.y || 80) + fileIndex * 118 + serverIndex * 180
      })
      serverNode.filePath = filePath
      serverNode.sourceStartLine = sourceStartLine
      serverNode.parentNodeId = includeNode.id
      markComposeNodePreviewSource(serverNode, topologyFile?.previewSource || '')
      markComposeNodePreviewScope(serverNode, previewScopeKey)
      applyServerComposeFields(serverNode, server)
      addOrUpdateComposeNode(serverNode)
      addComposeEdgeIfAllowed(includeNode, filePort, serverNode, getComposeInputPort(serverNode))
      ;(Array.isArray(server.locations) ? server.locations : []).forEach((location, locationIndex) => {
        const locationStartLine = Number(location.startLine || 0)
        const locationNode = findComposeNodeBySource('location', filePath, locationStartLine, { previewScopeKey }) || createComposeNode('location', {
          id: previewScopeKey
            ? `compose-location-preview:${makeTopologyIdPart(previewScopeKey)}:${sourceStartLine || serverIndex}:${locationStartLine || locationIndex}`
            : `compose-location:${makeTopologyIdPart(filePath)}:${sourceStartLine || serverIndex}:${locationStartLine || locationIndex}`,
          title: `location ${location.matcher || location.path || '/'}`,
          x: (serverNode.x || 80) + 430,
          y: (serverNode.y || 80) + locationIndex * 132
        })
        locationNode.filePath = filePath
        locationNode.sourceStartLine = locationStartLine
        locationNode.parentServerStartLine = sourceStartLine
        locationNode.parentServerNodeId = serverNode.id
        locationNode.parentNodeId = serverNode.id
        markComposeNodePreviewSource(locationNode, topologyFile?.previewSource || '')
        markComposeNodePreviewScope(locationNode, previewScopeKey)
        applyLocationComposeFields(locationNode, location)
        addOrUpdateComposeNode(locationNode)
        addComposeEdgeIfAllowed(serverNode, getComposeOutputPort(serverNode, 'location'), locationNode, getComposeInputPort(locationNode))
      })
    })
    if (visitedBefore) return
    const includeItems = Array.isArray(topologyFile.includes) ? topologyFile.includes : []
    for (let index = 0; index < includeItems.length; index += 1) {
      await syncComposeNestedIncludeNode(includeNode, topologyFile, includeItems[index], index, { visitedFiles, depth })
    }
  }

  async function syncComposeNestedIncludeNode(rootIncludeNode, ownerFile, includeItem, includeIndex = 0, options = {}) {
    const pattern = normalizeDirectiveValue(includeItem?.pattern)
    if (!pattern) return
    const ownerPath = normalizeNginxPath(ownerFile?.path || rootIncludeNode?.filePath || '')
    const filePath = normalizeNginxPath(ownerFile?.path || '')
    if (!ownerPath || !filePath) return
    const depth = Number(options.depth || 0)
    const sourceLine = Number(includeItem?.line || 0)
    const parentType = String(includeItem?.parentType || '').trim()
    const parentStartLine = Number(includeItem?.parentStartLine || 0)
    const previewScopeKey = ownerFile?.previewSource === 'external-file' ? getComposePreviewScopeKey(rootIncludeNode, filePath) : ''
    let parentNode = rootIncludeNode
    if (parentType && parentStartLine) {
      parentNode = findComposeNodeBySource(parentType, filePath, parentStartLine, { previewScopeKey }) || parentNode
    }
    const context = String(includeItem?.context || '').trim() || getComposePortContextFromNode(parentNode) || 'http'
    const includeNode = findComposeNodeBySource('include', filePath, sourceLine, { previewScopeKey }) || createComposeNode('include', {
      id: previewScopeKey
        ? `compose-include-preview:${makeTopologyIdPart(previewScopeKey)}:${sourceLine || includeIndex}:${makeTopologyIdPart(pattern)}`
        : `compose-include:${makeTopologyIdPart(filePath)}:${sourceLine || includeIndex}:${makeTopologyIdPart(pattern)}`,
      title: pattern,
      context,
      x: (parentNode?.x || rootIncludeNode?.x || 80) + getComposeNodeWidth(parentNode || rootIncludeNode) + 70,
      y: (parentNode?.y || rootIncludeNode?.y || 80) + includeIndex * 160 + depth * 28
    })
    includeNode.filePath = filePath
    includeNode.sourceStartLine = sourceLine
    includeNode.parentNodeId = parentNode?.id || rootIncludeNode?.id || ''
    includeNode.context = context
    markComposeNodePreviewSource(includeNode, ownerFile?.previewSource || '')
    markComposeNodePreviewScope(includeNode, previewScopeKey)
    setComposeFieldValue(includeNode, 'include.context', context)
    setComposeFieldValue(includeNode, 'pattern', pattern)

    const matchedPaths = Array.isArray(includeItem?.matched) ? includeItem.matched.map(normalizeNginxPath).filter(Boolean) : []
    const resolvedMatchedPaths = uniqueComposePaths([...matchedPaths, ...resolveComposeIncludeMatches(pattern, ownerPath)])
    const downstreamPaths = resolvedMatchedPaths.length ? resolvedMatchedPaths : [resolveComposeIncludePattern(pattern, ownerPath) || pattern]
    includeNode.matchedFiles = downstreamPaths.map((matchedPath, fileIndex) => {
      const resolved = resolvedMatchedPaths.some(path => isSameNginxPath(path, matchedPath))
      return normalizeComposeIncludeFile({
        id: `include-file:${makeTopologyIdPart(matchedPath)}:${fileIndex}`,
        path: normalizeNginxPath(matchedPath),
        name: resolved ? formatPathBasename(matchedPath) : pattern,
        unresolved: !resolved
      }, fileIndex)
    }).filter(Boolean)

    addOrUpdateComposeNode(includeNode)
    const parentPort = getComposeOutputPort(parentNode, 'include', context)
    const inputPort = getComposeInputPort(includeNode)
    if (parentPort && inputPort) addComposeEdgeIfAllowed(parentNode, parentPort, includeNode, inputPort)

    for (let fileIndex = 0; fileIndex < downstreamPaths.length; fileIndex += 1) {
      const matchedPath = downstreamPaths[fileIndex]
      const resolved = resolvedMatchedPaths.some(path => isSameNginxPath(path, matchedPath))
      if (!resolved) continue
      await syncComposeIncludeFileNodes(includeNode, { path: matchedPath }, fileIndex, {
        visitedFiles: options.visitedFiles,
        depth: depth + 1
      })
    }
  }

  function findComposeNodeBySource(type = '', filePath = '', sourceStartLine = 0, options = {}) {
    const normalizedPath = normalizeNginxPath(filePath || '')
    const previewScopeKey = String(options.previewScopeKey || '').trim()
    return composeNodes.value.find(node => {
      if (node?.type !== type) return false
      if (!isSameNginxPath(node.filePath || '', normalizedPath)) return false
      if (Number(node.sourceStartLine || 0) !== Number(sourceStartLine || 0)) return false
      if (!previewScopeKey) return !String(node.previewScopeKey || '').trim()
      return String(node.previewScopeKey || '').trim() === previewScopeKey
    }) || null
  }

  function addOrUpdateComposeNode(node) {
    if (!node?.id) return null
    const index = composeNodes.value.findIndex(item => item.id === node.id)
    if (index >= 0) {
      composeNodes.value[index] = node
      return node
    }
    composeNodes.value.push(node)
    return node
  }

  function addComposeEdgeIfAllowed(fromNode, fromPort, toNode, toPort) {
    if (!canConnectComposePorts(fromNode, fromPort, toNode, toPort)) return
    const id = `compose-edge:${fromNode.id}:${fromPort.id}->${toNode.id}:${toPort.id}`
    const nextEdge = { id, fromNodeId: fromNode.id, fromPortId: fromPort.id, toNodeId: toNode.id, toPortId: toPort.id }
    if (isComposeEdgeSuppressed(nextEdge)) return
    composeEdges.value = composeEdges.value.filter(edge => edge.id === id || !(edge.toNodeId === toNode.id && edge.toPortId === toPort.id))
    if (!composeEdges.value.some(edge => edge.id === id)) composeEdges.value.push(nextEdge)
    hydrateComposeNodesAfterConnect(fromNode, fromPort, toNode, toPort)
  }

  function getComposePortDisplayLabel(node, port) {
    const label = String(port?.label || '')
    if (!label) return ''
    if ((port?.side || 'right') === 'left') return label
    const context = port?.context || getComposePortContextFromNode(node)
    return context ? `${context}.${label}` : label
  }

  function isComposeDraftVisualNode(node = {}) {
    return !!node?.id && node.type !== 'main' && node.persistedToFile !== true && (node.draft === true || Number(node.sourceStartLine || 0) <= 0)
  }

  function isComposeDetachedVisualNode(node = {}) {
    return !!node?.id && node.type !== 'main' && !isComposeNodeActiveForApply(node)
  }

  function getComposeNodeStateLabel(node = {}) {
    return ''
  }

  function getComposeNodeFilePath(node = {}) {
    if (node?.type === 'main') return normalizeNginxPath(node.filePath || mainConfigSite.value?.path || detectedNginxConf.value || '')
    return normalizeNginxPath(node?.filePath || '')
  }

  function canSaveComposeNodeToFile(node = {}) {
    return !!node?.id
      && !!getComposeNodeFilePath(node)
      && !!props.connected
      && !!props.isSSHSession
      && !!window.whSSH?.writeTextFile
      && !props.selectedNginxSiteEditor?.saving
  }

  function hasComposeFileChangesToSave() {
    if (!props.connected || !props.isSSHSession || !window.whSSH?.writeTextFile || props.selectedNginxSiteEditor?.saving) return false
    if (composeDeletedSourceBlocks.value.length > 0) return true
    return composeNodes.value.some(node => canSaveComposeNodeToFile(node) && isComposeNodeDirty(node))
  }

  function isComposeNodeDirty(node = {}) {
    if (!node?.id) return false
    if ((node.draft === true || Number(node.sourceStartLine || 0) <= 0) && node.persistedToFile !== true) return true
    const baselineNodes = Array.isArray(composeBaselineGraph.value?.nodes) ? composeBaselineGraph.value.nodes : []
    const baselineEdges = Array.isArray(composeBaselineGraph.value?.edges) ? composeBaselineGraph.value.edges : []
    const baselineNode = findComposeNodeByStableKeys(baselineNodes, getComposeNodeStableKeys(node))
    if (!baselineNode) return true
    return JSON.stringify(buildComposeNodeSaveSignature(node, composeNodes.value, composeEdges.value)) !== JSON.stringify(buildComposeNodeSaveSignature(baselineNode, baselineNodes, baselineEdges))
  }

  function buildComposeNodeSaveSignature(node, nodes = [], edges = [], visited = new Set()) {
    if (!node?.id) return null
    const cycleKey = `${node.id}:${getComposeNodeStableKey(node)}`
    if (visited.has(cycleKey)) return { cycle: cycleKey }
    visited.add(cycleKey)
    const parentEdge = getComposeParentEdgeInGraph(node, edges)
    const parentNode = parentEdge ? (nodes.find(item => item.id === parentEdge.fromNodeId) || null) : null
    const children = getComposeChildEdgesInGraph(node, edges)
      .map(edge => {
        const childNode = nodes.find(item => item.id === edge.toNodeId) || null
        if (!childNode) return null
        return {
          edge: getComposeEdgeStableKey(edge, nodes),
          node: buildComposeNodeSaveSignature(childNode, nodes, edges, visited)
        }
      })
      .filter(Boolean)
      .sort((left, right) => String(left.edge || '').localeCompare(String(right.edge || '')))
    visited.delete(cycleKey)
    return {
      type: String(node.type || ''),
      stableKeys: getComposeNodeStableKeys(node),
      filePath: getComposeNodeFilePath(node),
      parentKey: getComposeNodeStableKey(parentNode),
      title: String(node.title || ''),
      context: String(node.context || ''),
      fields: (node.items || [])
        .filter(item => item?.type === 'field')
        .map(item => ({ label: String(item.label || ''), enabled: item.enabled !== false, value: String(item.value || '').trim() }))
        .sort((left, right) => String(left.label || '').localeCompare(String(right.label || ''))),
      children
    }
  }

  function getComposePortContextFromNode(node) {
    if (!node?.type) return ''
    if (node.type === 'main') return 'main'
    if (node.type === 'include') return node.context || 'include'
    if (['http', 'server', 'location', 'stream'].includes(node.type)) return node.type
    return ''
  }

  function buildComposeNodeStyle(node) {
    const isActiveDragNode = composeDragState.value?.nodeId === node.id
    return {
      width: `${getComposeNodeWidth(node)}px`,
      height: `${getComposeNodeHeight(node)}px`,
      transform: `translate(${node.x || 0}px, ${node.y || 0}px)`,
      zIndex: isActiveDragNode ? getNextComposeNodeZIndex() : getComposeNodeZIndex(node)
    }
  }

  function buildComposeSpaceStyle() {
    return {
      width: `${composeCanvasSize.value.width * composeZoom.value}px`,
      height: `${composeCanvasSize.value.height * composeZoom.value}px`
    }
  }

  function buildComposeSurfaceStyle() {
    return {
      width: `${composeCanvasSize.value.width}px`,
      height: `${composeCanvasSize.value.height}px`,
      transform: `scale(${composeZoom.value})`
    }
  }

  function getComposePortKey(node, port) {
    return `${node?.id || ''}:${port?.id || ''}`
  }

  function getComposeNodeWidth(node) {
    const customWidth = Number(node?.width)
    return Number.isFinite(customWidth) && customWidth > 0
      ? Math.max(getComposeNodeMinWidth(node), customWidth)
      : getComposeNodeMinWidth(node)
  }

  function estimateComposeNodeHeight(node) {
    return getComposeNodeContentTop(node) + getComposeTopPortAreaHeight(node) + getComposeReadonlyTreeHeight(node) + getComposeIncludeFileListHeight(node) + COMPOSE_NODE_BOTTOM_PADDING + COMPOSE_NODE_HEIGHT_SAFETY_PADDING
  }

  function getComposeNodeHeight(node) {
    const customHeight = Number(node?.height)
    return Number.isFinite(customHeight) && customHeight > 0
      ? Math.max(getComposeNodeMinHeight(node), customHeight)
      : getComposeNodeMinHeight(node)
  }

  function getComposeNodeMinWidth(node) {
    if (node?.type === 'include') return 360
    if (node?.type === 'server') return 390
    return 360
  }

  function getComposeNodeMinHeight(node) {
    return Math.max(COMPOSE_NODE_MIN_HEIGHT, estimateComposeNodeHeight(node))
  }

  function normalizeComposeSizeValue(value) {
    const size = Number(value)
    return Number.isFinite(size) && size > 0 ? size : undefined
  }

  function normalizeComposeNodeZIndex(value) {
    const zIndex = Number(value)
    return Number.isFinite(zIndex) && zIndex >= COMPOSE_NODE_BASE_Z_INDEX ? zIndex : COMPOSE_NODE_BASE_Z_INDEX
  }

  function getComposeNodeZIndex(node) {
    return normalizeComposeNodeZIndex(node?.zIndex)
  }

  function getNextComposeNodeZIndex() {
    return Math.max(COMPOSE_NODE_BASE_Z_INDEX, ...composeNodes.value.map(getComposeNodeZIndex)) + 1
  }

  function bringComposeNodeToFront(nodeId) {
    const node = composeNodes.value.find(item => item.id === nodeId)
    if (node) node.zIndex = getNextComposeNodeZIndex()
  }

  function lowerComposeNodeLayer(nodeId) {
    const node = composeNodes.value.find(item => item.id === nodeId)
    if (node) node.zIndex = COMPOSE_NODE_BASE_Z_INDEX
    if (raisedComposeNodeId.value === nodeId) raisedComposeNodeId.value = ''
  }

  function raiseComposeNodeLayer(nodeId) {
    if (!nodeId) return
    if (raisedComposeNodeId.value && raisedComposeNodeId.value !== nodeId) {
      lowerComposeNodeLayer(raisedComposeNodeId.value)
    }
    bringComposeNodeToFront(nodeId)
    raisedComposeNodeId.value = nodeId
  }

  function toggleComposeNodeLayer(nodeId) {
    if (!nodeId) return
    if (raisedComposeNodeId.value === nodeId) {
      lowerComposeNodeLayer(nodeId)
      return
    }
    raiseComposeNodeLayer(nodeId)
  }

  function getComposeNodeContentTop(node) {
    return COMPOSE_PORT_ROW_TOP
  }

  function getComposePortPoint(node, port) {
    if (port?.placement === 'include-file') {
      const files = getComposeIncludeFiles(node)
      const fileIndex = Math.max(0, files.findIndex(file => file.id === port.fileId || isSameNginxPath(file.path, port.filePath)))
      const includeTop = getComposeNodeContentTop(node) + getComposeTopPortAreaHeight(node) + getComposeReadonlyTreeHeight(node) + 15
      const y = (node.y || 0) + includeTop + 8 + COMPOSE_INCLUDE_FILE_HEADER_HEIGHT + 6 + fileIndex * COMPOSE_INCLUDE_FILE_ROW_HEIGHT + COMPOSE_INCLUDE_FILE_ROW_HEIGHT / 2
      return { x: (node.x || 0) + getComposeNodeWidth(node) - COMPOSE_PORT_DOT_CENTER_INSET, y }
    }
    const portSide = port?.side || 'right'
    const itemOffset = portSide === 'left'
      ? getComposeSourcePortOffset(node, port)
      : getComposeReadonlyPortOffset(node, port)
    const y = (node.y || 0) + getComposeNodeContentTop(node) + itemOffset
    const x = (node.x || 0) + (port.side === 'left' ? COMPOSE_PORT_DOT_CENTER_INSET : getComposeNodeWidth(node) - COMPOSE_PORT_DOT_CENTER_INSET)
    return { x, y }
  }

  function getComposeTopPortAreaHeight(node) {
    return getComposeTopPortsBySide(node, 'left').length ? COMPOSE_TOP_PORT_AREA_GAP : 0
  }

  function getComposeSourcePortOffset(node, port) {
    const ports = getComposeTopPortsBySide(node, 'left')
    const index = Math.max(0, ports.findIndex(item => item.id === port?.id))
    return index * COMPOSE_TOP_PORT_ROW_HEIGHT + COMPOSE_PORT_ROW_CENTER
  }

  function getComposeReadonlyPortOffset(node, port) {
    let offset = getComposeTopPortAreaHeight(node) + COMPOSE_READONLY_TREE_PADDING_TOP
    for (const group of buildComposeReadonlyLayoutGroups(node)) {
      offset += COMPOSE_READONLY_GROUP_HEADER_HEIGHT + COMPOSE_READONLY_GROUP_HEADER_GAP
      for (let index = 0; index < group.rows.length; index += 1) {
        const row = group.rows[index]
        if (row.type === 'port' && row.port?.id === port?.id) return offset + COMPOSE_READONLY_ROW_HEIGHT / 2
        offset += COMPOSE_READONLY_ROW_HEIGHT
        if (index < group.rows.length - 1) offset += COMPOSE_READONLY_ROW_GAP
      }
      offset += COMPOSE_READONLY_GROUP_GAP
    }
    return getComposeTopPortAreaHeight(node) + COMPOSE_PORT_ROW_CENTER
  }

  function getComposeVisibleItemsHeight(node) {
    return getVisibleComposeItems(node).reduce((height, item) => {
      const pickerHeight = item?.type === 'section' && isComposeFieldPickerOpen(node, item)
        ? getComposeFieldPickerHeight(node, item)
        : 0
      return height + getComposeItemRowSpan(item, node) + pickerHeight
    }, 0)
  }

  function getComposeVisibleItemOffset(node, targetItem) {
    let offset = 0
    for (const item of getVisibleComposeItems(node)) {
      if (item?.id === targetItem?.id) break
      offset += getComposeItemRowSpan(item, node)
      if (item?.type === 'section' && isComposeFieldPickerOpen(node, item)) {
        offset += getComposeFieldPickerHeight(node, item)
      }
    }
    return offset
  }

  function getComposeIncludeFileListHeight(node) {
    if (!isComposeIncludeNode(node)) return 0
    const rows = Math.max(1, getComposeIncludeFiles(node).length)
    return COMPOSE_INCLUDE_FILE_HEADER_HEIGHT + rows * COMPOSE_INCLUDE_FILE_ROW_HEIGHT + 34
  }

  function getComposeReadonlyTreeHeight(node = {}) {
    const groups = buildComposeReadonlyLayoutGroups(node)
    if (!groups.length) return 0
    return COMPOSE_READONLY_TREE_PADDING_TOP
      + groups.reduce((height, group, index) => {
        const rowsHeight = group.rows.length * COMPOSE_READONLY_ROW_HEIGHT + Math.max(0, group.rows.length - 1) * COMPOSE_READONLY_ROW_GAP
        return height + COMPOSE_READONLY_GROUP_HEADER_HEIGHT + COMPOSE_READONLY_GROUP_HEADER_GAP + rowsHeight + (index < groups.length - 1 ? COMPOSE_READONLY_GROUP_GAP : 0)
      }, 0)
      + 4
  }

  function buildComposeReadonlyLayoutGroups(node = {}) {
    const groups = []
    let activeGroup = null
    ;(Array.isArray(node?.items) ? node.items : []).forEach(item => {
      if (item?.type === 'section') {
        activeGroup = { key: item.key || item.id || item.label, rows: [] }
        groups.push(activeGroup)
        return
      }
      if (item?.type === 'port') {
        if ((item.side || 'right') === 'left') return
        if (!activeGroup) {
          activeGroup = { key: 'default', rows: [] }
          groups.push(activeGroup)
        }
        activeGroup.rows.push({ type: 'port', port: item })
        return
      }
      if (item?.type !== 'field' || item.enabled === false || !String(item.value || '').trim()) return
      if (!activeGroup) {
        activeGroup = { key: 'default', rows: [] }
        groups.push(activeGroup)
      }
      activeGroup.rows.push({ type: 'field', field: item })
    })
    return groups.filter(group => group.rows.length)
  }

  function getComposeSummaryRowsHeight(node) {
    const rowCount = buildComposeNodeSummaryRows(node).length
    if (!rowCount) return 0
    return COMPOSE_SUMMARY_VERTICAL_PADDING + rowCount * COMPOSE_SUMMARY_ROW_HEIGHT + Math.max(0, rowCount - 1) * COMPOSE_SUMMARY_VERTICAL_GAP
  }

  function getComposeItemRowSpan(item, node = null) {
    if (item?.type === 'section') return 42
    if (item?.type === 'port') return COMPOSE_TOP_PORT_ROW_HEIGHT
    if (item?.type === 'field' && isComposeMultiSelectField(item)) return 66
    if (item?.type === 'field' && node?.type === 'include') return isComposeTextareaField(item) ? 96 : 58
    if (item?.type === 'field') return isComposeTextareaField(item) ? 86 : 39
    return 0
  }

  function getComposeFieldPickerHeight(node, section) {
    const rows = Math.min(getComposeHiddenSectionFields(node, section).length, 6)
    return rows ? rows * 52 + 12 : 0
  }

  function isComposePortVisible(node, port) {
    if (!node || !port) return false
    return getComposePorts(node).some(item => item.id === port.id)
  }

  function isComposeEdgeVisible(edge) {
    const fromNode = getComposeNodeById(edge.fromNodeId)
    const toNode = getComposeNodeById(edge.toNodeId)
    const fromPort = getComposePortById(fromNode, edge.fromPortId)
    const toPort = getComposePortById(toNode, edge.toPortId)
    return isComposePortVisible(fromNode, fromPort) && isComposePortVisible(toNode, toPort)
  }

  function getComposeNodeById(nodeId = '') {
    return composeNodeById.value.get(nodeId) || null
  }

  function getComposePortById(node, portId = '') {
    return getComposePorts(node).find(item => item.id === portId) || null
  }

  function buildComposeEdgePath(edge) {
    const fromNode = getComposeNodeById(edge.fromNodeId)
    const toNode = getComposeNodeById(edge.toNodeId)
    const fromPort = getComposePortById(fromNode, edge.fromPortId)
    const toPort = getComposePortById(toNode, edge.toPortId)
    if (!fromNode || !toNode || !fromPort || !toPort) return ''
    return buildComposeBezierPath(getComposePortPoint(fromNode, fromPort), getComposePortPoint(toNode, toPort))
  }

  function buildComposeBezierPath(from, to) {
    const distance = Math.hypot(to.x - from.x, to.y - from.y)
    const control = Math.max(30, distance * 0.25)
    return `M ${from.x} ${from.y} C ${from.x + control} ${from.y}, ${to.x - control} ${to.y}, ${to.x} ${to.y}`
  }

  function buildComposeEdgeStyle(edge) {
    return { '--nginx-compose-edge-color': getComposeEdgeColor(edge) }
  }

  function getComposeEdgeColor(edge) {
    const index = Math.abs(hashTopologyText(edge?.id || `${edge?.fromNodeId || ''}:${edge?.fromPortId || ''}->${edge?.toNodeId || ''}:${edge?.toPortId || ''}`)) % COMPOSE_EDGE_COLORS.length
    return COMPOSE_EDGE_COLORS[index]
  }

  function getComposeCanvasPoint(event) {
    const zoom = composeZoom.value || 1
    const surfaceRect = composeSurfaceRef.value?.getBoundingClientRect()
    if (surfaceRect) {
      return {
        x: (event.clientX - surfaceRect.left) / zoom,
        y: (event.clientY - surfaceRect.top) / zoom
      }
    }
    const rect = composeCanvasRef.value?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: (event.clientX - rect.left + composeCanvasRef.value.scrollLeft) / zoom,
      y: (event.clientY - rect.top + composeCanvasRef.value.scrollTop) / zoom
    }
  }

  function startComposePortDrag(event, node, port) {
    if (event.button !== 0) return
    event.preventDefault()
    selectComposePort(node, port)
    const portSide = port.side || 'right'
    if (portSide === 'left') {
      const incoming = getIncomingComposeEdge(node, port)
      const fromNode = incoming ? getComposeNodeById(incoming.fromNodeId) : null
      const fromPort = incoming ? getComposePortById(fromNode, incoming.fromPortId) : null
      if (incoming && fromNode && fromPort) {
        composeConnectionDraft.value = {
          nodeId: incoming.fromNodeId,
          portId: incoming.fromPortId,
          side: 'right',
          anchorPoint: getComposePortPoint(fromNode, fromPort),
          rewireEdgeId: incoming.id,
          originalToNodeId: incoming.toNodeId,
          originalToPortId: incoming.toPortId
        }
      } else {
        composeConnectionDraft.value = {
          nodeId: node.id,
          portId: port.id,
          side: portSide,
          anchorPoint: getComposePortPoint(node, port)
        }
      }
    } else {
      composeConnectionDraft.value = {
        nodeId: node.id,
        portId: port.id,
        side: portSide,
        anchorPoint: getComposePortPoint(node, port)
      }
    }
    composePointer.value = getComposeCanvasPoint(event)
    startComposeConnectionPointerUpCapture()
    startComposeWindowTracking()
  }

  function finishComposePortConnection(event, node, port) {
    event?.preventDefault?.()
    event?.stopPropagation?.()
    const draft = composeConnectionDraft.value
    if (!draft || draft.nodeId === node.id || (draft.side || 'right') === (port.side || 'right')) {
      cancelComposeConnection()
      return
    }
    const from = draft.side === 'left'
      ? { nodeId: node.id, portId: port.id }
      : { nodeId: draft.nodeId, portId: draft.portId }
    const to = draft.side === 'left'
      ? { nodeId: draft.nodeId, portId: draft.portId }
      : { nodeId: node.id, portId: port.id }
    const fromNode = getComposeNodeById(from.nodeId)
    const toNode = getComposeNodeById(to.nodeId)
    const fromPort = getComposePortById(fromNode, from.portId)
    const toPort = getComposePortById(toNode, to.portId)
    if (!canConnectComposePorts(fromNode, fromPort, toNode, toPort)) {
      cancelComposeConnection()
      return
    }
    const id = `compose-edge:${from.nodeId}:${from.portId}->${to.nodeId}:${to.portId}`
    if (draft.rewireEdgeId && id === draft.rewireEdgeId) {
      cancelComposeConnection()
      return
    }
    pushComposeHistorySnapshot()
    const nextEdge = { id, fromNodeId: from.nodeId, fromPortId: from.portId, toNodeId: to.nodeId, toPortId: to.portId }
    composeEdges.value = composeEdges.value.filter(edge => edge.id === id || !(edge.toNodeId === to.nodeId && edge.toPortId === to.portId))
    if (!composeEdges.value.some(edge => edge.id === id)) {
      composeEdges.value.push(nextEdge)
    }
    unsuppressComposeEdge(nextEdge)
    hydrateComposeNodesAfterConnect(fromNode, fromPort, toNode, toPort)
    if (draft.rewireEdgeId) deleteComposeEdge(draft.rewireEdgeId, { history: false })
    saveComposeDraft()
    clearComposeConnectionState()
  }

  function canConnectComposePorts(fromNode, fromPort, toNode, toPort) {
    if (!fromNode || !fromPort || !toNode || !toPort || fromNode.id === toNode.id) return false
    if ((fromPort.side || 'right') !== 'right' || (toPort.side || 'right') !== 'left') return false
    const fromLabel = String(fromPort.label || '')
    const toLabel = String(toPort.label || '')
    if (toLabel !== 'source') return false
    if (fromLabel === 'include') return toNode.type === 'include'
    if (fromLabel === 'file') return false
    if (fromLabel === 'server') return (fromNode.type === 'main' || fromNode.type === 'file' || (fromNode.type === 'include' && fromPort.placement === 'include-file')) && toNode.type === 'server'
    if (fromLabel === 'location') return fromNode.type === 'server' && toNode.type === 'location'
    return false
  }

  function hydrateComposeNodesAfterConnect(fromNode, fromPort, toNode, toPort) {
    if (!fromNode || !toNode) return
    const sourcePath = getComposePortSourcePath(fromNode, fromPort) || getSelectedComposeSourcePath()
    if (toNode.type === 'include' && fromPort?.label === 'include') {
      const context = fromPort.context || getComposeIncludeContext(fromNode, fromPort)
      toNode.filePath = normalizeNginxPath(sourcePath)
      toNode.context = context
      toNode.parentNodeId = fromNode.id
      setComposeFieldValue(toNode, 'include.context', context)
      return
    }
    if (toNode.type === 'file' && fromPort?.label === 'file') {
      const pattern = normalizeDirectiveValue(getComposeFieldValue(fromNode, 'pattern'))
      if (isConcreteComposeFilePattern(pattern) && isDefaultComposeFilePath(getComposeFieldValue(toNode, 'path'))) {
        setComposeFieldValue(toNode, 'path', pattern)
      }
      toNode.filePath = normalizeNginxPath(getComposeFieldValue(toNode, 'path') || pattern || sourcePath)
      return
    }
    if (toNode.type === 'server' && fromPort?.label === 'server') {
      toNode.filePath = normalizeNginxPath(sourcePath)
      toNode.parentNodeId = fromNode.id
      return
    }
    if (toNode.type === 'location' && fromPort?.label === 'location') {
      toNode.filePath = normalizeNginxPath(sourcePath)
      toNode.parentServerStartLine = Number(fromNode.sourceStartLine || 0)
      toNode.parentServerNodeId = fromNode.id
      toNode.parentNodeId = fromNode.id
    }
  }

  function getComposeNodeSourcePath(node) {
    if (node?.type === 'file') return normalizeNginxPath(getComposeFieldValue(node, 'path') || node.filePath || '')
    return normalizeNginxPath(node?.filePath || '')
  }

  function getComposePortSourcePath(node, port) {
    if (port?.placement === 'include-file') return normalizeNginxPath(port.filePath || '')
    return getComposeNodeSourcePath(node)
  }

  function isConcreteComposeFilePattern(pattern = '') {
    const text = normalizeDirectiveValue(pattern).trim()
    return !!text && !/[*?[\]{}]/.test(text)
  }

  function isDefaultComposeFilePath(path = '') {
    const text = normalizeNginxPath(path || '')
    return !text || text === '/etc/nginx/conf.d/site.conf'
  }

  function cancelComposeConnection() {
    clearComposeConnectionState()
  }

  function dropComposeConnectionDraft() {
    const draft = composeConnectionDraft.value
    if (draft?.rewireEdgeId) deleteComposeEdge(draft.rewireEdgeId)
    clearComposeConnectionState()
  }

  function startComposeConnectionPointerUpCapture() {
    window.removeEventListener('pointerup', handleComposeConnectionPointerUpCapture, true)
    window.removeEventListener('pointercancel', handleComposeConnectionPointerCancel, true)
    window.removeEventListener('blur', cancelComposeConnection)
    window.addEventListener('pointerup', handleComposeConnectionPointerUpCapture, true)
    window.addEventListener('pointercancel', handleComposeConnectionPointerCancel, true)
    window.addEventListener('blur', cancelComposeConnection)
  }

  function stopComposeConnectionPointerUpCapture() {
    window.removeEventListener('pointerup', handleComposeConnectionPointerUpCapture, true)
    window.removeEventListener('pointercancel', handleComposeConnectionPointerCancel, true)
    window.removeEventListener('blur', cancelComposeConnection)
  }

  function handleComposeConnectionPointerUpCapture(event) {
    if (!composeConnectionDraft.value) return
    event.preventDefault()
    event.stopPropagation()
    finishComposeConnectionAtEvent(event)
  }

  function handleComposeConnectionPointerCancel() {
    cancelComposeConnection()
  }

  function finishComposeConnectionAtEvent(event) {
    if (composeDragAnimationFrame) {
      cancelAnimationFrame(composeDragAnimationFrame)
      composeDragAnimationFrame = 0
    }
    composePendingPointer = null
    composePointer.value = getComposeCanvasPoint(event)
    const hit = findComposeIntersectingPort(composePointer.value)
    if (hit) finishComposePortConnection(event, hit.node, hit.port)
    else dropComposeConnectionDraft()
  }

  function clearComposeConnectionState() {
    composeConnectionDraft.value = null
    composePendingPointer = null
    if (composeDragAnimationFrame) {
      cancelAnimationFrame(composeDragAnimationFrame)
      composeDragAnimationFrame = 0
    }
    stopComposeConnectionPointerUpCapture()
    stopComposeWindowTracking()
  }

  function findComposeIntersectingPort(point) {
    const draft = composeConnectionDraft.value
    if (!draft) return null
    const targetSide = draft.side === 'left' ? 'right' : 'left'
    for (const node of composeNodes.value) {
      if (!node?.id || node.id === draft.nodeId) continue
      const ports = getComposePortsBySide(node, targetSide)
      for (const port of ports) {
        const portPoint = getComposePortPoint(node, port)
        const distance = Math.hypot(point.x - portPoint.x, point.y - portPoint.y)
        if (distance <= COMPOSE_PORT_HIT_RADIUS && canConnectComposeDraftToPort(draft, node, port)) return { node, port }
      }
    }
    return null
  }

  function canConnectComposeDraftToPort(draft, node, port) {
    if (!draft || !node || !port || draft.nodeId === node.id || (draft.side || 'right') === (port.side || 'right')) return false
    const fromNode = draft.side === 'left' ? node : getComposeNodeById(draft.nodeId)
    const fromPort = draft.side === 'left' ? port : getComposePortById(fromNode, draft.portId)
    const toNode = draft.side === 'left' ? getComposeNodeById(draft.nodeId) : node
    const toPort = draft.side === 'left' ? getComposePortById(toNode, draft.portId) : port
    return canConnectComposePorts(fromNode, fromPort, toNode, toPort)
  }

  function handleComposeCanvasPointerMove(event) {
    if (!composeConnectionDraft.value) return
    if (event.buttons === 0) {
      finishComposeConnectionAtEvent(event)
      return
    }
    composePointer.value = getComposeCanvasPoint(event)
  }

  function handleComposeCanvasPointerDownCapture(event) {
    if (!composeSpacePressed.value || event.button !== 0 || !composeCanvasRef.value) return
    event.preventDefault()
    event.stopPropagation()
    composePanState.value = {
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: composeCanvasRef.value.scrollLeft,
      scrollTop: composeCanvasRef.value.scrollTop
    }
    window.addEventListener('pointermove', handleComposePanPointerMove)
    window.addEventListener('pointerup', handleComposePanPointerUp)
  }

  function handleComposePanPointerMove(event) {
    const state = composePanState.value
    if (!state || !composeCanvasRef.value) return
    event.preventDefault()
    composeCanvasRef.value.scrollLeft = state.scrollLeft - (event.clientX - state.startX)
    composeCanvasRef.value.scrollTop = state.scrollTop - (event.clientY - state.startY)
  }

  function handleComposePanPointerUp() {
    stopComposePanTracking()
  }

  function stopComposePanTracking() {
    window.removeEventListener('pointermove', handleComposePanPointerMove)
    window.removeEventListener('pointerup', handleComposePanPointerUp)
    composePanState.value = null
  }

  function handleComposeCanvasPointerDown(event) {
    if (event.button !== 0 || composeConnectionDraft.value) return
    if (event.target?.closest?.('.nginx-compose-node, .nginx-compose-line, .nginx-compose-context-menu, .nginx-compose-zoom-tools')) return
    selectedComposeEdgeId.value = ''
    selectedComposePortKey.value = ''
    closeComposeFieldPicker()
    closeComposeSuggestions()
  }

  function handleComposeCanvasWheel(event) {
    if (!event.ctrlKey) return
    event.preventDefault()
    adjustComposeZoom(event.deltaY < 0 ? COMPOSE_ZOOM_STEP : -COMPOSE_ZOOM_STEP)
  }

  function adjustComposeZoom(delta) {
    composeZoom.value = Math.min(COMPOSE_ZOOM_MAX, Math.max(COMPOSE_ZOOM_MIN, Number((composeZoom.value + delta).toFixed(2))))
  }

  function selectComposeEdge(edge) {
    selectedComposeEdgeId.value = ''
    selectedComposePortKey.value = ''
  }

  function selectComposePort(node, port) {
    selectedComposePortKey.value = getComposePortKey(node, port)
    selectedComposeEdgeId.value = ''
  }

  function isComposePortSelected(node, port) {
    return selectedComposePortKey.value === getComposePortKey(node, port)
  }

  function getComposePortEdge(node, port) {
    if (!node?.id || !port?.id) return null
    const portSide = port.side || 'right'
    const key = `${node.id}:${port.id}`
    return portSide === 'left'
      ? composeIncomingEdgeByPortKey.value.get(key) || null
      : composeOutgoingEdgeByPortKey.value.get(key) || null
  }

  function isComposePortConnected(node, port) {
    return !!getComposePortEdge(node, port)
  }

  function buildComposePortRowStyle(node, port) {
    const edge = getComposePortEdge(node, port)
    return edge ? { '--nginx-compose-edge-color': getComposeEdgeColor(edge) } : {}
  }

  function deleteSelectedComposeEdge() {
    const edgeId = selectedComposeEdgeId.value
    if (!edgeId) return
    deleteComposeEdge(edgeId)
    selectedComposeEdgeId.value = ''
  }

  function deleteComposeEdge(edgeId = '', options = {}) {
    const edge = composeEdges.value.find(item => item.id === edgeId)
    if (edge && options.history !== false) pushComposeHistorySnapshot()
    composeEdges.value = composeEdges.value.filter(edge => edge.id !== edgeId)
    if (!edge) return
    suppressComposeEdge(edge, composeNodes.value)
    saveComposeDraft()
  }

  function buildComposeHistorySnapshot() {
    return cloneComposePlainObject({
      nodes: composeNodes.value,
      edges: composeEdges.value,
      deletedSourceBlocks: composeDeletedSourceBlocks.value,
      suppressedEdges: composeSuppressedEdges.value,
      generatedSourceKey: composeGeneratedSourceKey.value,
      sourceSnapshot: composeDraftSnapshot.value,
      baselineGraph: composeBaselineGraph.value,
      ignoredSnapshotKey: composeIgnoredSnapshotKey.value,
      useSavedDraft: composeUseSavedDraft.value,
      zoom: composeZoom.value
    })
  }

  function pushComposeHistorySnapshot() {
    composeUndoStack.value.push(buildComposeHistorySnapshot())
    if (composeUndoStack.value.length > 80) composeUndoStack.value.shift()
    composeRedoStack.value = []
  }

  function restoreComposeHistorySnapshot(snapshot = null) {
    if (!snapshot) return
    composeNodes.value = Array.isArray(snapshot.nodes) ? snapshot.nodes : []
    composeNodes.value.forEach(node => normalizeComposeNodeFields(node))
    composeEdges.value = Array.isArray(snapshot.edges) ? snapshot.edges : []
    composeDeletedSourceBlocks.value = Array.isArray(snapshot.deletedSourceBlocks) ? snapshot.deletedSourceBlocks : []
    composeSuppressedEdges.value = Array.isArray(snapshot.suppressedEdges) ? snapshot.suppressedEdges : []
    composeGeneratedSourceKey.value = String(snapshot.generatedSourceKey || '')
    composeDraftSnapshot.value = snapshot.sourceSnapshot || null
    composeBaselineGraph.value = snapshot.baselineGraph || null
    composeIgnoredSnapshotKey.value = String(snapshot.ignoredSnapshotKey || '')
    composeUseSavedDraft.value = !!snapshot.useSavedDraft
    composeZoom.value = Math.min(COMPOSE_ZOOM_MAX, Math.max(COMPOSE_ZOOM_MIN, Number(snapshot.zoom) || 1))
    selectedComposeEdgeId.value = ''
    selectedComposePortKey.value = ''
    raisedComposeNodeId.value = ''
    closeComposeContextMenu()
    closeComposeFieldPicker()
    saveComposeDraft()
  }

  function canUndoCompose() {
    return composeUndoStack.value.length > 0
  }

  function canRedoCompose() {
    return composeRedoStack.value.length > 0
  }

  function undoComposeChange() {
    if (!canUndoCompose()) return
    clearComposePreviewFileCache()
    composeRedoStack.value.push(buildComposeHistorySnapshot())
    restoreComposeHistorySnapshot(composeUndoStack.value.pop())
  }

  function redoComposeChange() {
    if (!canRedoCompose()) return
    clearComposePreviewFileCache()
    composeUndoStack.value.push(buildComposeHistorySnapshot())
    restoreComposeHistorySnapshot(composeRedoStack.value.pop())
  }

  function handleComposeHistoryKeydown(event) {
    if (activeMenu.value !== 'compose' || event.defaultPrevented) return
    const target = event.target
    if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return
    const key = String(event.key || '').toLowerCase()
    if (key === ' ' || event.code === 'Space') {
      event.preventDefault()
      composeSpacePressed.value = true
      return
    }
    if (key === 'escape') {
      closeComposeFavoritesDrawer()
      return
    }
    if ((event.ctrlKey || event.metaKey) && key === 'z' && !event.shiftKey) {
      event.preventDefault()
      undoComposeChange()
      return
    }
    if ((event.ctrlKey || event.metaKey) && (key === 'y' || (key === 'z' && event.shiftKey))) {
      event.preventDefault()
      redoComposeChange()
    }
  }

  function handleComposeKeyup(event) {
    if (String(event.key || '').toLowerCase() !== ' ' && event.code !== 'Space') return
    composeSpacePressed.value = false
    if (composePanState.value) stopComposePanTracking()
  }

  function suppressComposeEdge(edge = {}, nodes = composeNodes.value) {
    const key = getComposeEdgeStableKey(edge, nodes)
    if (!key || composeSuppressedEdges.value.some(item => item.key === key)) return
    const nodeMap = new Map(nodes.map(node => [node.id, node]))
    composeSuppressedEdges.value.push({ key, toNodeKey: getComposeNodeStableKey(nodeMap.get(edge.toNodeId)) })
  }

  function unsuppressComposeEdge(edge = {}, nodes = composeNodes.value) {
    const key = getComposeEdgeStableKey(edge, nodes)
    const nodeMap = new Map(nodes.map(node => [node.id, node]))
    const toNodeKey = getComposeNodeStableKey(nodeMap.get(edge.toNodeId))
    if (!key && !toNodeKey) return
    composeSuppressedEdges.value = composeSuppressedEdges.value.filter(item => {
      if (key) return item.key !== key
      return item.toNodeKey !== toNodeKey
    })
  }

  function isComposeEdgeSuppressed(edge = {}, nodes = composeNodes.value) {
    const key = getComposeEdgeStableKey(edge, nodes)
    return !!key && composeSuppressedEdges.value.some(item => item.key === key)
  }

  function getIncomingComposeEdge(node, port) {
    return composeIncomingEdgeByPortKey.value.get(`${node?.id || ''}:${port?.id || ''}`) || null
  }

  function isComposeEdgeConnectedToSelectedPort(edge) {
    const portKey = selectedComposePortKey.value
    if (!portKey) return false
    return portKey === `${edge.fromNodeId}:${edge.fromPortId}` || portKey === `${edge.toNodeId}:${edge.toPortId}`
  }

  function startComposeNodeDrag(event, node) {
    if (event.button !== 0 || event.target?.closest?.('input, button, textarea, select')) return
    event.preventDefault()
    composeDragState.value = {
      mode: 'move',
      nodeId: node.id,
      startX: event.clientX,
      startY: event.clientY,
      originX: node.x || 0,
      originY: node.y || 0,
      moved: false
    }
    startComposeWindowTracking()
  }

  function startComposeNodeResize(event, node) {
    if (event.button !== 0) return
    event.preventDefault()
    selectedComposePortKey.value = ''
    selectedComposeEdgeId.value = ''
    composeDragState.value = {
      mode: 'resize',
      nodeId: node.id,
      startX: event.clientX,
      startY: event.clientY,
      originWidth: getComposeNodeWidth(node),
      originHeight: getComposeNodeHeight(node),
      moved: false
    }
    startComposeWindowTracking()
  }

  function startComposeWindowTracking() {
    window.addEventListener('pointermove', handleComposeWindowPointerMove)
    window.addEventListener('pointerup', handleComposeWindowPointerUp)
  }

  function stopComposeWindowTracking() {
    window.removeEventListener('pointermove', handleComposeWindowPointerMove)
    window.removeEventListener('pointerup', handleComposeWindowPointerUp)
    if (composeDragAnimationFrame) cancelAnimationFrame(composeDragAnimationFrame)
    composeDragAnimationFrame = 0
    composePendingPointer = null
  }

  function handleComposeWindowPointerMove(event) {
    if (composeConnectionDraft.value && event.buttons === 0) {
      finishComposeConnectionAtEvent(event)
      return
    }
    composePendingPointer = { clientX: event.clientX, clientY: event.clientY }
    if (composeDragAnimationFrame) return
    composeDragAnimationFrame = requestAnimationFrame(flushComposePointerMove)
  }

  function flushComposePointerMove() {
    composeDragAnimationFrame = 0
    const pointer = composePendingPointer
    composePendingPointer = null
    if (!pointer) return
    const state = composeDragState.value
    if (state) {
      if (Math.abs(pointer.clientX - state.startX) > 3 || Math.abs(pointer.clientY - state.startY) > 3) {
        state.moved = true
      }
      const node = composeNodes.value.find(item => item.id === state.nodeId)
      if (node) {
        const zoom = composeZoom.value || 1
        if (state.mode === 'resize') {
          node.width = Math.max(getComposeNodeMinWidth(node), state.originWidth + (pointer.clientX - state.startX) / zoom)
          node.height = Math.max(getComposeNodeMinHeight(node), state.originHeight + (pointer.clientY - state.startY) / zoom)
        } else {
          node.x = Math.max(0, state.originX + (pointer.clientX - state.startX) / zoom)
          node.y = Math.max(0, state.originY + (pointer.clientY - state.startY) / zoom)
        }
      }
    }
    if (composeConnectionDraft.value) composePointer.value = getComposeCanvasPoint(pointer)
  }

  function handleComposeWindowPointerUp(event) {
    const state = composeDragState.value
    if (composeDragAnimationFrame) {
      cancelAnimationFrame(composeDragAnimationFrame)
      composeDragAnimationFrame = 0
      flushComposePointerMove()
    }
    if (state?.nodeId) {
      if (state.moved) raiseComposeNodeLayer(state.nodeId)
      else toggleComposeNodeLayer(state.nodeId)
    }
    composeDragState.value = null
    if (composeConnectionDraft.value) {
      finishComposeConnectionAtEvent(event)
      return
    }
    stopComposeWindowTracking()
  }

  function openComposeNodeMenu(event, node) {
    closeComposeContextSubmenu()
    const point = getSafeComposeContextMenuPoint(event.clientX, event.clientY)
    composeContextMenu.visible = true
    composeContextMenu.x = point.x
    composeContextMenu.y = point.y
    composeContextMenu.node = node
    composeContextMenu.port = null
  }

  function openComposeCanvasMenu(event) {
    if (event.target?.closest?.('.nginx-compose-node, .nginx-compose-line, .nginx-compose-context-menu, .nginx-compose-zoom-tools')) return
    closeComposeContextSubmenu()
    const point = getSafeComposeContextMenuPoint(event.clientX, event.clientY)
    composeContextMenu.visible = true
    composeContextMenu.x = point.x
    composeContextMenu.y = point.y
    composeContextMenu.node = null
    composeContextMenu.port = null
  }

  function openComposePortMenu(event, node, port) {
    closeComposeContextSubmenu()
    const point = getSafeComposeContextMenuPoint(event.clientX, event.clientY)
    composeContextMenu.visible = true
    composeContextMenu.x = point.x
    composeContextMenu.y = point.y
    composeContextMenu.node = node
    composeContextMenu.port = port
  }

  function closeComposeContextMenu() {
    composeContextMenu.visible = false
    closeComposeContextSubmenu()
    closeComposeSuggestions()
  }

  function closeComposeContextSubmenu() {
    composeContextSubmenu.visible = false
    composeContextSubmenu.items = []
  }

  function buildComposeContextMenuStyle() {
    return { left: `${composeContextMenu.x}px`, top: `${composeContextMenu.y}px` }
  }

  function getSafeComposeContextMenuPoint(x = 0, y = 0, expanded = false) {
    const margin = 8
    const width = COMPOSE_CONTEXT_MENU_WIDTH
    const height = expanded ? COMPOSE_CONTEXT_MENU_EXPANDED_HEIGHT : COMPOSE_CONTEXT_MENU_BASE_HEIGHT
    return {
      x: Math.max(margin, Math.min(Number(x) || 0, window.innerWidth - width - margin)),
      y: Math.max(margin, Math.min(Number(y) || 0, window.innerHeight - height - margin))
    }
  }

  function clampComposeContextMenuPosition(expanded = composeContextSubmenu.visible) {
    const point = getSafeComposeContextMenuPoint(composeContextMenu.x, composeContextMenu.y, expanded)
    composeContextMenu.x = point.x
    composeContextMenu.y = point.y
  }

  function toggleComposeNodeTypeSubmenu() {
    if (composeContextSubmenu.visible) {
      closeComposeContextSubmenu()
      clampComposeContextMenuPosition(false)
      return
    }
    composeContextSubmenu.items = buildComposeNodeTypeMenuItems()
    composeContextSubmenu.visible = true
    clampComposeContextMenuPosition(true)
  }

  function buildComposeNodeTypeMenuItems() {
    const recommendedType = getComposeNodeTypeFromPort(composeContextMenu.port?.label)
    return [
      { type: 'include', label: 'include 节点' },
      { type: 'server', label: 'server 节点' },
      { type: 'location', label: 'location 节点' }
    ].map(item => ({ ...item, recommended: !!composeContextMenu.port && item.type === recommendedType }))
  }

  function addComposeNodeFromMenu(type) {
    const sourceNode = composeContextMenu.node
    const sourcePort = composeContextMenu.port
    const targetType = type || getComposeNodeTypeFromPort(composeContextMenu.port?.label)
    pushComposeHistorySnapshot()
    const anchorPoint = sourceNode && sourcePort ? getComposePortPoint(sourceNode, sourcePort) : null
    const canvasPoint = !sourceNode ? getComposeCanvasPoint({ clientX: composeContextMenu.x, clientY: composeContextMenu.y }) : null
    const node = createComposeNode(targetType, {
      x: Math.max(0, canvasPoint ? canvasPoint.x : (sourceNode?.x || 60) + getComposeNodeWidth(sourceNode) + 70),
      y: Math.max(0, canvasPoint ? canvasPoint.y : anchorPoint ? anchorPoint.y - 42 : sourceNode?.y || 60),
      context: targetType === 'include' ? getComposeIncludeContext(sourceNode, composeContextMenu.port) : undefined
    })
    hydrateNewComposeNodeSource(node, sourceNode)
    composeNodes.value.push(node)
    raiseComposeNodeLayer(node.id)
    connectNewComposeNodeFromMenu(sourceNode, sourcePort, node)
    saveComposeDraft()
    closeComposeContextMenu()
  }

  function hydrateNewComposeNodeSource(node, sourceNode = null) {
    if (!node || !['server', 'location', 'include', 'file'].includes(node.type)) return
    const selectedPath = getSelectedComposeSourcePath()
    node.filePath = normalizeNginxPath(getComposeNodeSourcePath(sourceNode) || selectedPath || '')
    if (node.type === 'file') {
      const pattern = normalizeDirectiveValue(getComposeFieldValue(sourceNode, 'pattern'))
      if (isConcreteComposeFilePattern(pattern)) setComposeFieldValue(node, 'path', pattern)
      node.filePath = normalizeNginxPath(getComposeFieldValue(node, 'path') || selectedPath || '')
    }
    if (node.type === 'include') {
      const context = getComposeIncludeContext(sourceNode, composeContextMenu.port)
      node.context = context
      setComposeFieldValue(node, 'include.context', context)
    }
    if (node.type === 'location' && sourceNode?.type === 'server') {
      node.parentServerStartLine = Number(sourceNode.sourceStartLine || 0)
      node.parentServerNodeId = sourceNode.id
    }
  }

  function connectNewComposeNodeFromMenu(sourceNode, sourcePort, targetNode) {
    if (!sourceNode || !sourcePort || !targetNode || (sourcePort.side || 'right') !== 'right') return
    const targetPort = getComposeInputPort(targetNode)
    if (!canConnectComposePorts(sourceNode, sourcePort, targetNode, targetPort)) return
    const id = `compose-edge:${sourceNode.id}:${sourcePort.id}->${targetNode.id}:${targetPort.id}`
    if (composeEdges.value.some(edge => edge.id === id)) return
    const nextEdge = { id, fromNodeId: sourceNode.id, fromPortId: sourcePort.id, toNodeId: targetNode.id, toPortId: targetPort.id }
    composeEdges.value = composeEdges.value.filter(edge => !(edge.toNodeId === targetNode.id && edge.toPortId === targetPort.id))
    composeEdges.value.push(nextEdge)
    unsuppressComposeEdge(nextEdge)
    hydrateComposeNodesAfterConnect(sourceNode, sourcePort, targetNode, targetPort)
    saveComposeDraft()
  }

  function getComposeIncludeContext(node, port) {
    if (port?.context) return port.context
    if (['main', 'http', 'server', 'location', 'stream'].includes(node?.type)) return node.type
    return ''
  }

  async function deleteComposeNodeFromMenu() {
    const node = composeContextMenu.node
    if (!node || node.type === 'main') return
    closeComposeContextMenu()
    const confirmed = await ElMessageBox.confirm(`确认删除节点“${node.title || getComposeNodeTypeLabel(node.type)}”？`, '删除当前节点', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    }).then(() => true).catch(() => false)
    if (!confirmed) return
    pushComposeHistorySnapshot()
    const descendantNodeIds = collectComposeDescendantNodeIds(node.id, composeEdges.value)
    composeNodes.value
      .filter(item => descendantNodeIds.has(item.id))
      .forEach(item => recordComposeDeletedSourceBlock(item, { nodes: composeNodes.value, edges: composeEdges.value }))
    composeNodes.value = composeNodes.value.filter(item => !descendantNodeIds.has(item.id))
    composeEdges.value = composeEdges.value.filter(edge => !descendantNodeIds.has(edge.fromNodeId) && !descendantNodeIds.has(edge.toNodeId))
    selectedComposeEdgeId.value = ''
    selectedComposePortKey.value = ''
    if (raisedComposeNodeId.value === node.id) raisedComposeNodeId.value = ''
    saveComposeDraft()
  }

  function favoriteComposeNodeFromMenu() {
    const node = composeContextMenu.node
    if (!node || node.type === 'main') return
    const template = buildComposeNodeTemplate(node)
    const templates = composeNodeTemplates.value.filter(item => item.templateKey !== template.templateKey)
    templates.unshift(template)
    composeNodeTemplates.value = templates.slice(0, 60)
    saveComposeNodeTemplates()
    closeComposeContextMenu()
    ElMessage.success('已收藏为节点模板')
  }

  function openComposeFavoritesDrawer() {
    composeFavoritesDrawerVisible.value = true
  }

  function closeComposeFavoritesDrawer() {
    composeFavoritesDrawerVisible.value = false
    composeFavoriteDragTemplateKey.value = ''
  }

  function startComposeFavoriteDrag(event, template) {
    composeFavoriteDragTemplateKey.value = template.templateKey
    event.dataTransfer?.setData('application/x-nginx-compose-template', template.templateKey)
    event.dataTransfer?.setData('text/plain', template.title || template.templateKey)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
  }

  function finishComposeFavoriteDrag(event) {
    const templateKey = composeFavoriteDragTemplateKey.value
    composeFavoriteDragTemplateKey.value = ''
    if (!templateKey || !composeCanvasRef.value) return
    if (isPointerInsideComposeFavoritesDrawerBody(event)) return
    const rect = composeCanvasRef.value.getBoundingClientRect()
    const x = Number(event.clientX || 0)
    const y = Number(event.clientY || 0)
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return
    const template = composeNodeTemplates.value.find(item => item.templateKey === templateKey)
    if (!template) return
    addComposeNodeFromTemplate(template, getComposeCanvasPoint(event), { openDrawer: false })
  }

  function handleComposeFavoriteWindowDragOver(event) {
    if (!composeFavoriteDragTemplateKey.value) return
    event.preventDefault()
  }

  function handleComposeFavoriteWindowDrop(event) {
    const templateKey = composeFavoriteDragTemplateKey.value
    if (!templateKey || !composeCanvasRef.value) return
    event.preventDefault()
    if (isPointerInsideComposeFavoritesDrawerBody(event)) {
      composeFavoriteDragTemplateKey.value = ''
      return
    }
    const rect = composeCanvasRef.value.getBoundingClientRect()
    const x = Number(event.clientX || 0)
    const y = Number(event.clientY || 0)
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      composeFavoriteDragTemplateKey.value = ''
      return
    }
    const template = composeNodeTemplates.value.find(item => item.templateKey === templateKey)
    composeFavoriteDragTemplateKey.value = ''
    if (!template) return
    addComposeNodeFromTemplate(template, getComposeCanvasPoint(event), { openDrawer: false })
  }

  function handleComposeFavoriteDragOver(event) {
    if (!Array.from(event.dataTransfer?.types || []).includes('application/x-nginx-compose-template')) return
    event.dataTransfer.dropEffect = 'copy'
  }

  function handleComposeFavoriteDrop(event) {
    const templateKey = event.dataTransfer?.getData('application/x-nginx-compose-template') || composeFavoriteDragTemplateKey.value || ''
    composeFavoriteDragTemplateKey.value = ''
    if (isPointerInsideComposeFavoritesDrawerBody(event)) return
    const template = composeNodeTemplates.value.find(item => item.templateKey === templateKey)
    if (!template) return
    addComposeNodeFromTemplate(template, getComposeCanvasPoint(event), { openDrawer: false })
  }

  function getComposeCanvasCenterPoint() {
    const rect = composeCanvasRef.value?.getBoundingClientRect()
    return rect
      ? getComposeCanvasPoint({ clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 })
      : { x: 80, y: 80 }
  }

  function addComposeFavoriteToCanvas(template, options = {}) {
    const node = addComposeNodeFromTemplate(template, getComposeCanvasCenterPoint(), options)
    if (node && options.closeDrawer !== false) composeFavoritesDrawerVisible.value = false
    return node
  }

  async function handleComposeFavoriteCommand(command, template) {
    if (command === 'detail') {
      await ElMessageBox.alert(buildComposeTemplateDetail(template), '模板配置详情', {
        confirmButtonText: '确定',
        dangerouslyUseHTMLString: true,
        customClass: 'nginx-compose-template-detail-dialog'
      })
      return
    }
    if (command === 'add') {
      addComposeFavoriteToCanvas(template, { openDrawer: false })
      return
    }
    if (command === 'rename') {
      const { value } = await ElMessageBox.prompt('请输入新的收藏名称', '重命名收藏', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputValue: template.title || ''
      }).catch(() => ({}))
      const title = String(value || '').trim()
      if (!title) return
      template.title = title
      if (template.node) template.node.title = title
      saveComposeNodeTemplates()
      return
    }
    if (command === 'remove') {
      const confirmed = await ElMessageBox.confirm(`确认删除收藏模板“${template.title || getComposeNodeTypeLabel(template.type)}”？`, '删除收藏模板', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(() => true).catch(() => false)
      if (!confirmed) return
      composeNodeTemplates.value = composeNodeTemplates.value.filter(item => item.templateKey !== template.templateKey)
      saveComposeNodeTemplates()
      return
    }
  }

  function addComposeNodeFromTemplate(template, point = { x: 80, y: 80 }, options = {}) {
    if (!template?.node) return null
    pushComposeHistorySnapshot()
    const sourceNode = cloneComposePlainObject(template.node)
    const node = createComposeNode(sourceNode.type || template.type || 'include', {
      title: template.title || sourceNode.title,
      x: Math.max(0, Number(point.x || 0)),
      y: Math.max(0, Number(point.y || 0)),
      context: sourceNode.context
    })
    Object.assign(node, sourceNode, {
      id: node.id,
      x: Math.max(0, Number(point.x || 0)),
      y: Math.max(0, Number(point.y || 0)),
      width: Math.max(getComposeNodeMinWidth(node), Number(sourceNode.width || 0) || getComposeNodeMinWidth(node)),
      height: Math.max(getComposeNodeMinHeight(node), Number(sourceNode.height || 0) || getComposeNodeMinHeight(node)),
      filePath: getSelectedComposeSourcePath(),
      sourceStartLine: 0,
      parentNodeId: '',
      parentServerNodeId: '',
      parentServerStartLine: 0,
      draft: true
    })
    normalizeComposeNodeFields(node)
    composeNodes.value.push(node)
    raiseComposeNodeLayer(node.id)
    saveComposeDraft()
    if (options.openDrawer) openComposeFieldDrawer(node)
    return node
  }

  function buildComposeTemplateDetail(template = {}) {
    const rows = [
      ['名称', template.title || '-'],
      ['类型', getComposeNodeTypeLabel(template.type)]
    ]
    ;(template.node?.items || [])
      .filter(item => item?.type === 'field' && String(item.value || '').trim())
      .slice(0, 20)
      .forEach(item => rows.push([getComposeFieldDisplayLabel(item), String(item.value || '').trim()]))
    return `<table class="nginx-compose-template-detail-table"><tbody>${rows.map(([name, detail]) => `<tr><th>${escapeComposeTemplateDetailHtml(name)}</th><td>${escapeComposeTemplateDetailHtml(detail)}</td></tr>`).join('')}</tbody></table>`
  }

  function escapeComposeTemplateDetailHtml(value = '') {
    return String(value || '-')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function isPointerInsideComposeFavoritesDrawerBody(event) {
    const body = document.querySelector('.nginx-compose-favorites-drawer .el-drawer__body')
    const rect = body?.getBoundingClientRect?.()
    if (!rect) return false
    const x = Number(event?.clientX || 0)
    const y = Number(event?.clientY || 0)
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
  }

  function getComposeNodeTypeLabel(type = '') {
    const map = { include: 'include', server: 'server', location: 'location', file: 'file', main: 'main' }
    return map[type] || type || 'node'
  }

  function formatComposeTemplateDate(value) {
    const date = new Date(Number(value || 0))
    return Number.isNaN(date.getTime()) ? '刚刚' : date.toLocaleString()
  }

  function buildComposeNodeTemplate(node = {}) {
    const templateNode = cloneComposePlainObject(node)
    delete templateNode.id
    delete templateNode.x
    delete templateNode.y
    delete templateNode.zIndex
    delete templateNode.filePath
    delete templateNode.sourceStartLine
    delete templateNode.parentNodeId
    delete templateNode.parentServerNodeId
    delete templateNode.parentServerStartLine
    delete templateNode.matchedFiles
    templateNode.draft = true
    const payloadKey = hashComposeSourceCode(JSON.stringify({ type: templateNode.type, title: templateNode.title, items: templateNode.items }))
    return {
      templateKey: `${templateNode.type}:${payloadKey}`,
      type: templateNode.type,
      title: templateNode.title || `${templateNode.type} 模板`,
      createdAt: Date.now(),
      node: templateNode
    }
  }

  function saveComposeNodeTemplates() {
    window.localStorage?.setItem(COMPOSE_NODE_TEMPLATE_STORAGE_KEY, JSON.stringify({ version: 1, items: composeNodeTemplates.value }))
  }

  function restoreComposeNodeTemplates() {
    try {
      const raw = window.localStorage?.getItem(COMPOSE_NODE_TEMPLATE_STORAGE_KEY)
      if (!raw) return
      const payload = JSON.parse(raw)
      composeNodeTemplates.value = Array.isArray(payload?.items) ? payload.items : []
    } catch {
      composeNodeTemplates.value = []
    }
  }

  function collectComposeAncestorTraceNodeIds(node, nodes = composeNodes.value, edges = composeEdges.value) {
    const ancestorIds = new Set()
    const queue = [node?.id].filter(Boolean)
    while (queue.length) {
      const currentId = queue.shift()
      if (!currentId || ancestorIds.has(currentId)) continue
      ancestorIds.add(currentId)
      ;(Array.isArray(edges) ? edges : []).forEach(edge => {
        if (edge.toNodeId === currentId && edge.fromNodeId && !ancestorIds.has(edge.fromNodeId)) queue.push(edge.fromNodeId)
      })
    }
    return Array.from(ancestorIds)
  }

  function recordComposeDeletedSourceBlock(node, options = {}) {
    if (!['server', 'location', 'include'].includes(node?.type)) return
    const filePath = normalizeNginxPath(node.filePath || '')
    const sourceStartLine = Number(node.sourceStartLine || 0)
    if (!filePath || !sourceStartLine) return
    const id = `${node.type}:${filePath}:${sourceStartLine}`
    if (composeDeletedSourceBlocks.value.some(item => item.id === id)) return
    const ancestorNodeIds = collectComposeAncestorTraceNodeIds(node, options.nodes, options.edges)
    composeDeletedSourceBlocks.value.push({
      id,
      type: node.type,
      filePath,
      sourceStartLine,
      parentServerStartLine: Number(node.parentServerStartLine || 0),
      parentNodeId: node.parentNodeId || getComposeParentEdge(node)?.fromNodeId || '',
      context: getComposeFieldValue(node, 'include.context') || node.context || '',
      ancestorNodeIds
    })
  }

  function getComposeNodeTypeFromPort(label = '') {
    const key = String(label || '').trim().toLowerCase()
    if (['server', 'location', 'include'].includes(key)) return key
    return 'include'
  }

  function getComposeMainNode() {
    return composeNodes.value.find(node => node?.type === 'main') || null
  }

  function isSelectedMainNginxConf() {
    const path = normalizeNginxPath(props.selectedNginxSiteEditor?.path || '')
    return !!path && (isSameNginxPath(path, detectedNginxConf.value) || formatPathBasename(path) === 'nginx.conf')
  }

  function getSelectedComposeSourcePath() {
    return normalizeNginxPath(props.selectedNginxSiteEditor?.path || '')
  }

  function getComposeMainConfigPath() {
    return normalizeNginxPath(mainConfigSite.value?.path || detectedNginxConf.value || '')
  }

  function getComposeNodesForSource(sourcePath = '', type = '') {
    const normalizedSourcePath = normalizeNginxPath(sourcePath || '')
    if (!normalizedSourcePath) return []
    return composeNodes.value.filter(node => {
      if (type && node?.type !== type) return false
      return isSameNginxPath(getComposeNodeFilePath(node), normalizedSourcePath)
    })
  }

  function getComposeNodesForSelectedSource(type = '') {
    return getComposeNodesForSource(getSelectedComposeSourcePath(), type)
  }

  function getActiveComposeNodesForSource(sourcePath = '', type = '', options = {}) {
    const nodes = Array.isArray(options.nodes) ? options.nodes : composeNodes.value
    const edges = Array.isArray(options.edges) ? options.edges : composeEdges.value
    const normalizedSourcePath = normalizeNginxPath(sourcePath || '')
    if (!normalizedSourcePath) return []
    return nodes.filter(node => {
      if (type && node?.type !== type) return false
      if (!isSameNginxPath(getComposeNodeFilePath(node), normalizedSourcePath)) return false
      return isComposeNodeActiveForApply(node, { nodes, edges })
    })
  }

  function getActiveComposeNodesForSelectedSource(type = '') {
    return getActiveComposeNodesForSource(getSelectedComposeSourcePath(), type)
  }

  function isComposeNodeActiveForApply(node, options = {}) {
    if (!node) return false
    if (node.type === 'main') return true
    if (['server', 'location', 'include'].includes(node.type)) return !!getComposeParentEdgeInGraph(node, Array.isArray(options.edges) ? options.edges : composeEdges.value)
    return false
  }

  function getComposeParentEdgeInGraph(node, edges = composeEdges.value) {
    const incomingEdges = (Array.isArray(edges) ? edges : []).filter(edge => edge.toNodeId === node?.id)
    if (!incomingEdges.length) return null
    const preferredParentIds = [String(node?.parentServerNodeId || ''), String(node?.parentNodeId || '')].filter(Boolean)
    return incomingEdges.find(edge => preferredParentIds.includes(String(edge.fromNodeId || ''))) || incomingEdges[0] || null
  }

  function getComposeParentEdge(node) {
    return getComposeParentEdgeInGraph(node, composeEdges.value)
  }

  function getComposeChildEdgesInGraph(node, edges = composeEdges.value) {
    if (!node?.id) return []
    return (Array.isArray(edges) ? edges : []).filter(edge => edge.fromNodeId === node.id)
  }

  function getDisconnectedComposeSourceBlocksForSelectedSource() {
    return getComposeNodesForSelectedSource()
      .filter(node => ['server', 'location', 'include'].includes(node?.type))
      .filter(node => Number(node.sourceStartLine || 0) > 0 && !isComposeNodeActiveForApply(node))
      .map(node => ({
        id: `disconnected:${node.type}:${node.filePath}:${node.sourceStartLine}`,
        type: node.type,
        filePath: normalizeNginxPath(node.filePath || ''),
        sourceStartLine: Number(node.sourceStartLine || 0),
        parentServerStartLine: Number(node.parentServerStartLine || 0),
        parentNodeId: node.parentNodeId || '',
        context: getComposeFieldValue(node, 'include.context') || node.context || ''
      }))
  }

  function canApplyComposeToSelectedSource() {
    if (!props.connected || !props.isSSHSession) return false
    const code = String(props.selectedNginxSiteEditor?.code || '').trim()
    if (!code || !getSelectedComposeSourcePath() || props.selectedNginxSiteEditor?.saving) return false
    if (isSelectedMainNginxConf()) return !!getComposeMainNode()
    return !!getComposeNodesForSelectedSource('server').length || !!getComposeNodesForSelectedSource('location').length || !!getComposeNodesForSelectedSource('include').length || !!getComposeDeletedBlocksForSelectedSource().length || !!getDisconnectedComposeSourceBlocksForSelectedSource().length
  }

  function collectComposeDescendantNodeIds(rootNodeId = '', edges = composeEdges.value) {
    const nodeIds = new Set()
    const queue = [String(rootNodeId || '')].filter(Boolean)
    while (queue.length) {
      const currentId = queue.shift()
      if (!currentId || nodeIds.has(currentId)) continue
      nodeIds.add(currentId)
      ;(Array.isArray(edges) ? edges : []).forEach(edge => {
        if (edge.fromNodeId === currentId && edge.toNodeId && !nodeIds.has(edge.toNodeId)) queue.push(edge.toNodeId)
      })
    }
    return nodeIds
  }

  function collectComposeAncestorNodeIdsInSameFile(rootNode = null, nodes = composeNodes.value, edges = composeEdges.value) {
    const nodeIds = new Set()
    const rootFilePath = getComposeNodeFilePath(rootNode)
    const queue = [rootNode?.id].filter(Boolean)
    while (queue.length) {
      const currentId = queue.shift()
      if (!currentId || nodeIds.has(currentId)) continue
      nodeIds.add(currentId)
      const currentNode = nodes.find(node => node.id === currentId) || null
      ;(Array.isArray(edges) ? edges : []).forEach(edge => {
        if (edge.toNodeId !== currentId || !edge.fromNodeId || nodeIds.has(edge.fromNodeId)) return
        const parentNode = nodes.find(node => node.id === edge.fromNodeId) || null
        if (!currentNode || !parentNode) return
        if (!isSameNginxPath(getComposeNodeFilePath(currentNode), getComposeNodeFilePath(parentNode))) return
        if (rootFilePath && !isSameNginxPath(getComposeNodeFilePath(parentNode), rootFilePath)) return
        queue.push(edge.fromNodeId)
      })
    }
    return nodeIds
  }

  function collectComposeRelatedNodeIdsForSave(rootNode, nodes = composeNodes.value, edges = composeEdges.value) {
    const relatedIds = collectComposeDescendantNodeIds(rootNode?.id, edges)
    collectComposeAncestorNodeIdsInSameFile(rootNode, nodes, edges).forEach(id => relatedIds.add(id))
    return relatedIds
  }

  function getComposeDeletedBlocksForNodeSave(rootNode, relatedIds = new Set()) {
    const rootNodeId = String(rootNode?.id || '')
    if (!rootNodeId) return []
    return composeDeletedSourceBlocks.value.filter(item => {
      const ancestorNodeIds = Array.isArray(item?.ancestorNodeIds) ? item.ancestorNodeIds.map(value => String(value || '')) : []
      if (ancestorNodeIds.includes(rootNodeId)) return true
      if (String(item?.parentNodeId || '') && relatedIds.has(String(item.parentNodeId || ''))) return true
      return false
    })
  }

  function buildComposeSaveTargets(rootNode, nodes = composeNodes.value, edges = composeEdges.value) {
    const relatedIds = collectComposeRelatedNodeIdsForSave(rootNode, nodes, edges)
    const relatedDeletedBlocks = getComposeDeletedBlocksForNodeSave(rootNode, relatedIds)
    const targets = new Map()
    const mainConfigPath = getComposeMainConfigPath()
    const rootFilePath = getComposeNodeFilePath(rootNode)
    const affectedFilePaths = new Set([
      ...nodes.filter(node => relatedIds.has(node.id)).map(node => getComposeNodeFilePath(node)).filter(Boolean),
      ...relatedDeletedBlocks.map(item => normalizeNginxPath(item.filePath || '')).filter(Boolean)
    ])
    nodes.forEach(node => {
      const filePath = getComposeNodeFilePath(node)
      if (!filePath) return
      if (!affectedFilePaths.has(filePath) && !(rootFilePath && isSameNginxPath(filePath, rootFilePath))) return
      const active = isComposeNodeActiveForApply(node, { nodes, edges })
      const related = relatedIds.has(node.id)
      const keepMainNodeForCurrentFile = node.type === 'main' && !!rootFilePath && isSameNginxPath(filePath, rootFilePath)
      const realSourceNode = Number(node.sourceStartLine || 0) > 0
      const preserveFileStructureNode = realSourceNode && active && !isComposeExternalPreviewNode(node)
      if (!active && !related && !keepMainNodeForCurrentFile) return
      if (!related && !preserveFileStructureNode && !keepMainNodeForCurrentFile) return
      if (!targets.has(filePath)) targets.set(filePath, { path: filePath, mainConfig: !!mainConfigPath && isSameNginxPath(filePath, mainConfigPath), forcedTopLevelIncludeIds: new Set(), nodes: [] })
      const target = targets.get(filePath)
      target.nodes.push(node)
      if (node.type === 'include' && (related || realSourceNode) && !getComposeParentEdgeInGraph(node, edges)) target.forcedTopLevelIncludeIds.add(node.id)
    })
    relatedDeletedBlocks.forEach(item => {
      const filePath = normalizeNginxPath(item.filePath || '')
      if (!filePath || targets.has(filePath)) return
      targets.set(filePath, { path: filePath, mainConfig: !!mainConfigPath && isSameNginxPath(filePath, mainConfigPath), forcedTopLevelIncludeIds: new Set(), nodes: [] })
    })
    return {
      relatedIds,
      relatedDeletedBlocks,
      targets: Array.from(targets.values()).sort((left, right) => String(left.path || '').localeCompare(String(right.path || '')))
    }
  }

  function mergeComposeSavePlansForNodes(nodesToSave = []) {
    const relatedIds = new Set()
    const relatedDeletedMap = new Map()
    const targetMap = new Map()
    ;(Array.isArray(nodesToSave) ? nodesToSave : []).forEach(node => {
      if (!canSaveComposeNodeToFile(node)) return
      const plan = buildComposeSaveTargets(node, composeNodes.value, composeEdges.value)
      plan.relatedIds.forEach(id => relatedIds.add(id))
      plan.relatedDeletedBlocks.forEach(item => {
        if (item?.id) relatedDeletedMap.set(item.id, item)
      })
      plan.targets.forEach(target => {
        const path = normalizeNginxPath(target?.path || '')
        if (!path) return
        const current = targetMap.get(path) || { path, mainConfig: target.mainConfig === true, forcedTopLevelIncludeIds: new Set(), nodes: [], nodeIds: new Set() }
        current.mainConfig = current.mainConfig || target.mainConfig === true
        ;(target.forcedTopLevelIncludeIds instanceof Set ? Array.from(target.forcedTopLevelIncludeIds) : target.forcedTopLevelIncludeIds || []).forEach(id => current.forcedTopLevelIncludeIds.add(id))
        ;(Array.isArray(target.nodes) ? target.nodes : []).forEach(targetNode => {
          if (!targetNode?.id || current.nodeIds.has(targetNode.id)) return
          current.nodeIds.add(targetNode.id)
          current.nodes.push(targetNode)
        })
        targetMap.set(path, current)
      })
    })
    return {
      relatedIds,
      relatedDeletedBlocks: Array.from(relatedDeletedMap.values()),
      targets: Array.from(targetMap.values()).map(target => {
        const { nodeIds, ...rest } = target
        return rest
      }).sort((left, right) => String(left.path || '').localeCompare(String(right.path || '')))
    }
  }

  function buildComposeSourceCodeForTarget(target, options = {}) {
    const nodes = Array.isArray(options.nodes) ? options.nodes : composeNodes.value
    const edges = Array.isArray(options.edges) ? options.edges : composeEdges.value
    const sourcePath = normalizeNginxPath(target?.path || '')
    if (!sourcePath) return ''
    const sourceNodes = Array.isArray(target?.nodes) ? target.nodes : []
    const serverNodes = sourceNodes.filter(node => node?.type === 'server').sort(compareComposeDocumentNodes)
    const locationNodes = sourceNodes.filter(node => node?.type === 'location').sort(compareComposeDocumentNodes)
    const includeNodes = sourceNodes.filter(node => node?.type === 'include').sort(compareComposeDocumentNodes)
    const mainNode = nodes.find(node => node?.type === 'main') || null
    if (target?.mainConfig) {
      if (!mainNode) return ''
      return buildMainComposeSourceFromGraph(mainNode, sourcePath, serverNodes, locationNodes, { nodes, edges, forcedTopLevelIncludeIds: target.forcedTopLevelIncludeIds })
    }
    return buildFileComposeSourceFromGraph(sourcePath, serverNodes, locationNodes, includeNodes, { nodes, edges, forcedTopLevelIncludeIds: target.forcedTopLevelIncludeIds })
  }

  function markComposeNodesPersisted(relatedIds = new Set()) {
    composeNodes.value.forEach(node => {
      if (!relatedIds.has(node.id)) return
      node.draft = false
      node.persistedToFile = true
    })
  }

  function refreshComposeBaselineFromCurrentGraph() {
    composeBaselineGraph.value = cloneComposePlainObject({
      nodes: composeNodes.value.map(cloneComposePlainObject),
      edges: composeEdges.value.map(cloneComposePlainObject)
    })
  }

  function updateComposeLastNodeSaveSummary(payload = {}) {
    const targetPaths = Array.isArray(payload.targetPaths) ? payload.targetPaths.filter(Boolean) : []
    composeLastNodeSaveSummary.value = {
      nodeId: String(payload.nodeId || ''),
      nodeType: String(payload.nodeType || ''),
      targetCount: targetPaths.length,
      targetPaths,
      emptiedCount: Number(payload.emptiedCount || 0),
      relatedDeletedCount: Number(payload.relatedDeletedCount || 0),
      externalPreviewNodeCount: Number(payload.externalPreviewNodeCount || 0),
      message: String(payload.message || ''),
      savedAt: new Date().toISOString()
    }
  }

  async function saveComposeNodeToFile(node) {
    if (!canSaveComposeNodeToFile(node)) return
    const filePath = getComposeNodeFilePath(node)
    const { relatedIds, relatedDeletedBlocks, targets } = buildComposeSaveTargets(node, composeNodes.value, composeEdges.value)
    const writableTargets = targets.filter(target => !!target.path)
    if (!writableTargets.length) {
      await ElMessageBox.alert('当前节点没有可写入的真实配置文件。', '无法保存到文件', { type: 'warning', confirmButtonText: '确定' })
      return
    }
    const confirmed = await ElMessageBox.confirm(`确认把节点“${node.title || getComposeNodeTypeLabel(node.type)}”及其子链保存到真实文件吗？\n\n这次只会写入配置文件，不会重载或重启 Nginx，也不会自动接入主链。`, '保存到文件', {
      type: 'warning',
      confirmButtonText: '保存到文件',
      cancelButtonText: '取消'
    }).catch(() => false)
    if (!confirmed) return
    try {
      const emptiedTargets = []
      for (const target of writableTargets) {
        const nextCode = buildComposeSourceCodeForTarget(target, { nodes: composeNodes.value, edges: composeEdges.value })
        if (!String(nextCode || '').trim()) emptiedTargets.push(target.path)
        await window.whSSH.writeTextFile({
          sessionId: props.sessionId,
          path: target.path,
          content: nextCode,
          encoding: 'utf8'
        })
        if (isSameNginxPath(props.selectedNginxSiteEditor?.path, target.path)) {
          props.selectedNginxSiteEditor.code = nextCode
          props.selectedNginxSiteEditor.originalCode = nextCode
          props.selectedNginxSiteEditor.parseMessage = '已按节点编排写回当前源码文件'
          props.parseSelectedNginxCode?.()
        }
      }
      markComposeNodesPersisted(relatedIds)
      if (relatedDeletedBlocks.length) {
        const deletedIds = new Set(relatedDeletedBlocks.map(item => item.id))
        composeDeletedSourceBlocks.value = composeDeletedSourceBlocks.value.filter(item => !deletedIds.has(item.id))
      }
      refreshComposeBaselineFromCurrentGraph()
      saveComposeDraft()
      await loadNginxTopology()
      composeDraftSnapshot.value = buildComposeConfigSnapshot(nginxTopology.value)
      if (activeMenu.value === 'compose') {
        await rebuildComposeFromLatestConfig(composeDraftSnapshot.value)
      }
      const emptyMessage = emptiedTargets.length ? `；其中 ${emptiedTargets.length} 个文件已清空` : ''
      const successMessage = `已写入 ${writableTargets.length} 个配置文件${emptyMessage}，未执行 Nginx 重载`
      updateComposeLastNodeSaveSummary({
        nodeId: node.id,
        nodeType: node.type || '',
        targetPaths: writableTargets.map(item => item.path),
        emptiedCount: emptiedTargets.length,
        relatedDeletedCount: relatedDeletedBlocks.length,
        externalPreviewNodeCount: composeNodes.value.filter(item => relatedIds.has(item.id) && isComposeExternalPreviewNode(item)).length,
        message: successMessage
      })
      ElMessage.success(successMessage)
    } catch (error) {
      reportNginxError('compose-node-save:failed', { path: filePath, message: error?.message || String(error || '') })
      await ElMessageBox.alert(`节点保存到文件失败：${error?.message || error}`, '保存失败', { type: 'error', confirmButtonText: '确定' })
    }
  }

  async function saveComposeFileChangesOnly() {
    if (!hasComposeFileChangesToSave()) return
    const dirtyNodes = composeNodes.value.filter(node => canSaveComposeNodeToFile(node) && isComposeNodeDirty(node))
    const candidateNodes = dirtyNodes.length ? dirtyNodes : composeNodes.value.filter(node => canSaveComposeNodeToFile(node))
    const { relatedIds, relatedDeletedBlocks, targets } = mergeComposeSavePlansForNodes(candidateNodes)
    const writableTargets = targets.filter(target => !!target.path)
    if (!writableTargets.length) {
      await ElMessageBox.alert('当前编排没有可写入的真实配置文件。', '无法保存文件修改', { type: 'warning', confirmButtonText: '确定' })
      return
    }
    const confirmed = await ElMessageBox.confirm(`确认仅保存当前配置编排的文件修改吗？\n\n将写入 ${writableTargets.length} 个配置文件，不会重载或重启 Nginx。`, '仅保存文件修改', {
      type: 'warning',
      confirmButtonText: '保存文件',
      cancelButtonText: '取消'
    }).catch(() => false)
    if (!confirmed) return
    try {
      const emptiedTargets = []
      for (const target of writableTargets) {
        const nextCode = buildComposeSourceCodeForTarget(target, { nodes: composeNodes.value, edges: composeEdges.value })
        if (!String(nextCode || '').trim()) emptiedTargets.push(target.path)
        await window.whSSH.writeTextFile({
          sessionId: props.sessionId,
          path: target.path,
          content: nextCode,
          encoding: 'utf8'
        })
        if (isSameNginxPath(props.selectedNginxSiteEditor?.path, target.path)) {
          props.selectedNginxSiteEditor.code = nextCode
          props.selectedNginxSiteEditor.originalCode = nextCode
          props.selectedNginxSiteEditor.parseMessage = '已按配置编排写回当前源码文件'
          props.parseSelectedNginxCode?.()
        }
      }
      markComposeNodesPersisted(relatedIds)
      if (relatedDeletedBlocks.length) {
        const deletedIds = new Set(relatedDeletedBlocks.map(item => item.id))
        composeDeletedSourceBlocks.value = composeDeletedSourceBlocks.value.filter(item => !deletedIds.has(item.id))
      }
      refreshComposeBaselineFromCurrentGraph()
      saveComposeDraft()
      await loadNginxTopology()
      composeDraftSnapshot.value = buildComposeConfigSnapshot(nginxTopology.value)
      const emptyMessage = emptiedTargets.length ? `；其中 ${emptiedTargets.length} 个文件已清空` : ''
      const successMessage = `已写入 ${writableTargets.length} 个配置文件${emptyMessage}，未执行 Nginx 重载`
      updateComposeLastNodeSaveSummary({
        nodeId: 'compose-bulk-save',
        nodeType: 'bulk',
        targetPaths: writableTargets.map(item => item.path),
        emptiedCount: emptiedTargets.length,
        relatedDeletedCount: relatedDeletedBlocks.length,
        externalPreviewNodeCount: composeNodes.value.filter(item => relatedIds.has(item.id) && isComposeExternalPreviewNode(item)).length,
        message: successMessage
      })
      ElMessage.success(successMessage)
    } catch (error) {
      reportNginxError('compose-bulk-save:failed', { message: error?.message || String(error || '') })
      await ElMessageBox.alert(`仅保存文件修改失败：${error?.message || error}`, '保存失败', { type: 'error', confirmButtonText: '确定' })
    }
  }

  function getComposeDeletedBlocksForSelectedSource() {
    const sourcePath = getSelectedComposeSourcePath()
    if (!sourcePath) return []
    return composeDeletedSourceBlocks.value.filter(item => isSameNginxPath(item.filePath || '', sourcePath))
  }

  async function importComposeFromNginxConf() {
    const mainSite = mainConfigSite.value || siteMenuItems.value.find(site => site.name === 'nginx.conf') || null
    if (mainSite?.path && !isSameNginxPath(props.selectedNginxSiteEditor?.path, mainSite.path)) {
      await Promise.resolve(props.selectNginxSite?.(mainSite, { forceReload: true }))
      await nextTick()
    }
    clearComposePreviewFileCache()
    if (!nginxTopology.value && !nginxTopologyLoading.value) await loadNginxTopology()
    const sourcePath = normalizeNginxPath(props.selectedNginxSiteEditor?.path || mainSite?.path || detectedNginxConf.value)
    const sourceCode = String(props.selectedNginxSiteEditor?.code || '')
    if (!sourceCode.trim()) return
    const graph = buildComposeGraphFromNginxConfig(sourceCode, sourcePath)
    composeNodes.value = graph.nodes
    composeEdges.value = graph.edges
    composeDeletedSourceBlocks.value = []
    composeSuppressedEdges.value = []
    composeGeneratedSourceKey.value = `${sourcePath}:${sourceCode.length}:${hashComposeSourceCode(sourceCode)}`
    composeDraftSnapshot.value = buildComposeConfigSnapshot(nginxTopology.value)
    composeBaselineGraph.value = cloneComposePlainObject(graph)
    composeIgnoredSnapshotKey.value = ''
    composeUseSavedDraft.value = false
    selectedComposeEdgeId.value = ''
    selectedComposePortKey.value = ''
    raisedComposeNodeId.value = ''
    closeComposeContextMenu()
    closeComposeFieldPicker()
  }

  async function autoGenerateComposeFromNginxConf(options = {}) {
    const force = !!options.force
    if (!force && composeUseSavedDraft.value) return
    clearComposePreviewFileCache()
    const latest = await buildLatestComposeGraphFromNginxConf({ forceReload: force })
    if (!latest || (!force && composeGeneratedSourceKey.value === latest.sourceKey)) return
    const normalizedGraph = normalizeComposeGraphIntegrity(completeComposeGraphRealEdges(latest.graph))
    if (shouldKeepCurrentComposeGraph(normalizedGraph)) return
    composeNodes.value = normalizedGraph.nodes
    composeEdges.value = normalizedGraph.edges
    composeDeletedSourceBlocks.value = []
    composeSuppressedEdges.value = []
    selectedComposeEdgeId.value = ''
    selectedComposePortKey.value = ''
    raisedComposeNodeId.value = ''
    composeGeneratedSourceKey.value = latest.sourceKey
    composeBaselineGraph.value = cloneComposePlainObject(latest.graph)
    closeComposeContextMenu()
    closeComposeFieldPicker()
  }

  async function buildLatestComposeGraphFromNginxConf(options = {}) {
    await ensureComposeMainConfigLoaded({ forceReload: !!options.forceReload })
    const sourcePath = normalizeNginxPath(props.selectedNginxSiteEditor?.path || mainConfigSite.value?.path || '')
    const sourceCode = String(props.selectedNginxSiteEditor?.code || '')
    if (!sourcePath || !sourceCode.trim() || !isSameNginxPath(sourcePath, mainConfigSite.value?.path || detectedNginxConf.value)) return null
    if (!nginxTopology.value && !nginxTopologyLoading.value) await loadNginxTopology()
    const graph = buildComposeGraphFromNginxConfig(sourceCode, sourcePath)
    return { graph, sourcePath, sourceCode, sourceKey: `${sourcePath}:${sourceCode.length}:${hashComposeSourceCode(sourceCode)}` }
  }

  function mergeComposeGraphWithSavedState(newGraph = {}, savedGraph = {}, baselineGraph = null) {
    const savedNodes = Array.isArray(savedGraph.nodes) ? savedGraph.nodes : []
    const baselineNodes = Array.isArray(baselineGraph?.nodes) ? baselineGraph.nodes : []
    const newNodes = Array.isArray(newGraph.nodes) ? newGraph.nodes : []
    const newEdges = Array.isArray(newGraph.edges) ? newGraph.edges : []
    const savedNodeCandidates = buildComposeNodeStableCandidateMap(savedNodes)
    const baselineNodeCandidates = buildComposeNodeStableCandidateMap(baselineNodes)
    const usedSavedNodes = new Set()
    const usedBaselineNodes = new Set()

    const mergedNodes = newNodes.map(newNode => {
      const savedNode = takeComposeNodeStableCandidate(newNode, savedNodeCandidates, usedSavedNodes) || takeComposeNodeById(newNode, savedNodes, usedSavedNodes)
      const baselineNode = takeComposeNodeStableCandidate(newNode, baselineNodeCandidates, usedBaselineNodes) || takeComposeNodeById(newNode, baselineNodes, usedBaselineNodes)
      return mergeComposeNodeWithSavedState(newNode, savedNode, baselineNode)
    })

    const mergedEdges = mergeComposeRealEdgesWithMergedNodes({ nodes: mergedNodes, newNodes, newEdges })
    return normalizeComposeGraphIntegrity(completeComposeGraphRealEdges({ nodes: mergedNodes, edges: mergedEdges }))
  }

  function shouldKeepCurrentComposeGraph(nextGraph = {}) {
    const nextNodes = Array.isArray(nextGraph.nodes) ? nextGraph.nodes : []
    const nextEdges = Array.isArray(nextGraph.edges) ? nextGraph.edges : []
    return composeEdges.value.length > 0 && nextNodes.length <= composeNodes.value.length && nextEdges.length === 0
  }

  function isComposeDraftNode(node = {}) {
    if (!node?.id || node.type === 'main') return false
    if (node.persistedToFile === true) return false
    if (node.draft === true) return true
    if (/^compose-(include|server|location|file)-\d+-/.test(String(node.id || ''))) return true
    if (['server', 'location', 'include'].includes(node.type) && Number(node.sourceStartLine || 0) > 0) return false
    return !node.parentNodeId && !node.parentServerNodeId
  }

  function completeComposeGraphRealEdges(graph = {}) {
    const nodes = Array.isArray(graph.nodes) ? graph.nodes : []
    const edges = Array.isArray(graph.edges) ? [...graph.edges] : []
    const edgeIds = new Set(edges.map(edge => edge?.id).filter(Boolean))
    const nodeById = new Map(nodes.map(node => [node.id, node]))

    const addEdge = (fromNode, fromPort, toNode, toPort) => {
      if (!fromNode || !fromPort || !toNode || !toPort || !canConnectComposePorts(fromNode, fromPort, toNode, toPort)) return
      const id = `compose-edge:${fromNode.id}:${fromPort.id}->${toNode.id}:${toPort.id}`
      const edge = { id, fromNodeId: fromNode.id, fromPortId: fromPort.id, toNodeId: toNode.id, toPortId: toPort.id }
      if (isComposeEdgeSuppressed(edge, nodes)) return
      if (edgeIds.has(id)) return
      edgeIds.add(id)
      edges.push(edge)
    }

    nodes.forEach(node => {
      if (node?.type === 'include') {
        const parentNode = nodeById.get(node.parentNodeId)
        const context = getComposeFieldValue(node, 'include.context') || node.context || getComposePortContextFromNode(parentNode)
        addEdge(parentNode, getComposeOutputPort(parentNode, 'include', context), node, getComposeInputPort(node))
      }
      if (node?.type === 'server') {
        const parentNode = nodeById.get(node.parentNodeId)
        addEdge(parentNode, getComposeServerOutputPortForFile(parentNode, node.filePath), node, getComposeInputPort(node))
      }
      if (node?.type === 'location') {
        const parentNode = nodeById.get(node.parentServerNodeId || node.parentNodeId)
        addEdge(parentNode, getComposeOutputPort(parentNode, 'location'), node, getComposeInputPort(node))
      }
    })

    return normalizeComposePreferredParentRefs({ nodes, edges })
  }

  function normalizeComposePreferredParentRefs(graph = {}) {
    const nodes = Array.isArray(graph.nodes) ? graph.nodes : []
    const edges = Array.isArray(graph.edges) ? graph.edges : []
    const incomingEdgesByNodeId = new Map()
    edges.forEach(edge => {
      if (!edge?.toNodeId) return
      if (!incomingEdgesByNodeId.has(edge.toNodeId)) incomingEdgesByNodeId.set(edge.toNodeId, [])
      incomingEdgesByNodeId.get(edge.toNodeId).push(edge)
    })
    const sortEdges = (left, right) => String(left?.id || '').localeCompare(String(right?.id || ''))
    nodes.forEach(node => {
      if (!node?.id || !['include', 'server', 'location'].includes(node.type)) return
      const incomingEdges = (incomingEdgesByNodeId.get(node.id) || []).slice().sort(sortEdges)
      if (!incomingEdges.length) return
      if (node.type === 'location') {
        const preferredParentIds = [String(node.parentServerNodeId || ''), String(node.parentNodeId || '')].filter(Boolean)
        const preferredEdge = incomingEdges.find(edge => preferredParentIds.includes(String(edge.fromNodeId || ''))) || incomingEdges[0]
        node.parentServerNodeId = String(preferredEdge?.fromNodeId || '')
        node.parentNodeId = String(preferredEdge?.fromNodeId || '')
        return
      }
      const preferredParentIds = [String(node.parentNodeId || '')].filter(Boolean)
      const preferredEdge = incomingEdges.find(edge => preferredParentIds.includes(String(edge.fromNodeId || ''))) || incomingEdges[0]
      node.parentNodeId = String(preferredEdge?.fromNodeId || '')
    })
    return { nodes, edges }
  }

  function normalizeComposeGraphIntegrity(graph = {}) {
    const sourceNodes = Array.isArray(graph.nodes) ? graph.nodes : []
    const sourceEdges = Array.isArray(graph.edges) ? graph.edges : []
    const nodes = []
    const nodeIdMap = new Map()
    const mainNodes = sourceNodes.filter(node => node?.type === 'main')
    const preferredMain = mainNodes.find(node => isSameNginxPath(node.filePath || '', mainConfigSite.value?.path || detectedNginxConf.value)) || mainNodes.find(node => node?.id === 'compose-main') || mainNodes[0] || null

    sourceNodes.forEach(node => {
      if (!node?.id) return
      if (node.type === 'main' && preferredMain && node !== preferredMain) {
        nodeIdMap.set(node.id, preferredMain.id)
        return
      }
      if (nodeIdMap.has(node.id)) return
      nodeIdMap.set(node.id, node.id)
      nodes.push(node)
    })

    const nodeIds = new Set(nodes.map(node => node.id))
    const nodesById = new Map(nodes.map(node => [node.id, node]))
    const sourceNodesById = new Map(sourceNodes.map(node => [node?.id, node]))
    const edgeIds = new Set()
    const edges = []
    sourceEdges.forEach(edge => {
      const fromNodeId = nodeIdMap.get(edge?.fromNodeId) || edge?.fromNodeId
      const toNodeId = nodeIdMap.get(edge?.toNodeId) || edge?.toNodeId
      if (!fromNodeId || !toNodeId || fromNodeId === toNodeId || !nodeIds.has(fromNodeId) || !nodeIds.has(toNodeId)) return
      const normalizedEdge = { ...edge, fromNodeId, toNodeId }
      const fromNode = nodesById.get(fromNodeId)
      const toNode = nodesById.get(toNodeId)
      const fromPort = getComposePortById(fromNode, normalizedEdge.fromPortId) || findComposePortByStableKey(fromNode, getComposePortStableKey(getComposePortById(sourceNodesById.get(edge?.fromNodeId), edge?.fromPortId)))
      const toPort = getComposePortById(toNode, normalizedEdge.toPortId) || findComposePortByStableKey(toNode, getComposePortStableKey(getComposePortById(sourceNodesById.get(edge?.toNodeId), edge?.toPortId)))
      if (!fromPort || !toPort || !canConnectComposePorts(fromNode, fromPort, toNode, toPort)) return
      normalizedEdge.fromPortId = fromPort.id
      normalizedEdge.toPortId = toPort.id
      normalizedEdge.id = `compose-edge:${fromNodeId}:${fromPort.id}->${toNodeId}:${toPort.id}`
      if (edgeIds.has(normalizedEdge.id)) return
      edgeIds.add(normalizedEdge.id)
      edges.push(normalizedEdge)
    })
    return { nodes, edges }
  }

  function buildComposeNodeStableMap(nodes = []) {
    const map = new Map()
    nodes.forEach(node => {
      getComposeNodeStableKeys(node).forEach(key => {
        if (key && !map.has(key)) map.set(key, node)
      })
    })
    return map
  }

  function buildComposeNodeStableCandidateMap(nodes = []) {
    const map = new Map()
    nodes.forEach((node, index) => {
      getComposeNodeStableKeys(node).forEach(key => {
        if (!key) return
        if (!map.has(key)) map.set(key, [])
        map.get(key).push({ node, index })
      })
    })
    return map
  }

  function takeComposeNodeStableCandidate(targetNode, candidateMap = new Map(), usedNodes = new Set()) {
    for (const key of getComposeNodeStableKeys(targetNode)) {
      const candidates = candidateMap.get(key) || []
      const candidate = candidates.find(item => item?.node && !usedNodes.has(item.node))
      if (candidate?.node) {
        usedNodes.add(candidate.node)
        return candidate.node
      }
    }
    return null
  }

  function takeComposeNodeById(targetNode, nodes = [], usedNodes = new Set()) {
    if (!targetNode?.id) return null
    const node = nodes.find(item => item?.id === targetNode.id && !usedNodes.has(item)) || null
    if (node) usedNodes.add(node)
    return node
  }

  function getComposeNodeStableKeys(node = {}) {
    const keys = []
    const primaryKey = getComposeNodeStableKey(node)
    if (primaryKey) keys.push(primaryKey)
    const semanticKey = getComposeNodeSemanticStableKey(node)
    if (semanticKey && !keys.includes(semanticKey)) keys.push(semanticKey)
    return keys
  }

  function getComposeNodeStableKey(node = {}) {
    const type = String(node?.type || '')
    const filePath = normalizeNginxPath(node?.filePath || '')
    const previewScopeKey = String(node?.previewScopeKey || '').trim()
    if (type === 'main') return `main:${filePath || detectedNginxConf.value}`
    if (previewScopeKey && type === 'include') return `include-preview:${previewScopeKey}:${filePath}:${Number(node.sourceStartLine || 0) || getComposeFieldValue(node, 'pattern') || node.title || ''}`
    if (previewScopeKey && type === 'server') return `server-preview:${previewScopeKey}:${filePath}:${Number(node.sourceStartLine || 0) || getComposeFieldValue(node, 'server_name') || node.title || ''}`
    if (previewScopeKey && type === 'location') return `location-preview:${previewScopeKey}:${filePath}:${Number(node.sourceStartLine || 0) || getComposeFieldValue(node, 'path') || node.title || ''}`
    if (type === 'include' && Number(node.sourceStartLine || 0) > 0) return `include:${filePath}:${Number(node.sourceStartLine || 0)}`
    if (type === 'include') return `include:${filePath}:${getComposeFieldValue(node, 'include.context') || node.context || ''}:${getComposeFieldValue(node, 'pattern') || node.title || ''}`
    if (type === 'file') return `file:${normalizeNginxPath(getComposeFieldValue(node, 'path') || filePath)}`
    if (type === 'server' && Number(node.sourceStartLine || 0) > 0) return `server:${filePath}:${Number(node.sourceStartLine || 0)}`
    if (type === 'server') {
      const serverName = getComposeFieldValue(node, 'server_name') || node.title || ''
      const listen = getComposeFieldValue(node, 'listen') || ''
      return `server:${filePath}:${serverName}:${listen}`
    }
    if (type === 'location' && Number(node.sourceStartLine || 0) > 0) return `location:${filePath}:${Number(node.parentServerStartLine || 0)}:${Number(node.sourceStartLine || 0)}`
    if (type === 'location') {
      const path = getComposeFieldValue(node, 'path') || node.title || ''
      const parent = Number(node.parentServerStartLine || 0) || getComposeFieldValue(node, 'server_name') || node.parentServerNodeId || ''
      return `location:${filePath}:${parent}:${path}`
    }
    return type && node?.id ? `${type}:${node.id}` : ''
  }

  function getComposeNodeSemanticStableKey(node = {}) {
    const type = String(node?.type || '')
    const filePath = normalizeNginxPath(node?.filePath || '')
    const previewScopeKey = String(node?.previewScopeKey || '').trim()
    if (previewScopeKey && type === 'include') return `include-preview:${previewScopeKey}:${filePath}:${getComposeFieldValue(node, 'pattern') || node.title || ''}`
    if (previewScopeKey && type === 'server') return `server-preview:${previewScopeKey}:${filePath}:${getComposeFieldValue(node, 'server_name') || node.title || ''}:${getComposeFieldValue(node, 'listen') || ''}`
    if (previewScopeKey && type === 'location') return `location-preview:${previewScopeKey}:${filePath}:${getComposeFieldValue(node, 'path') || node.title || ''}`
    if (type === 'include') return `include:${filePath}:${getComposeFieldValue(node, 'include.context') || node.context || ''}:${getComposeFieldValue(node, 'pattern') || node.title || ''}`
    if (type === 'server') {
      const serverName = getComposeFieldValue(node, 'server_name') || node.title || ''
      const listen = getComposeFieldValue(node, 'listen') || ''
      return `server:${filePath}:${serverName}:${listen}`
    }
    if (type === 'location') {
      const path = getComposeFieldValue(node, 'path') || node.title || ''
      const parent = Number(node.parentServerStartLine || 0) || getComposeFieldValue(node, 'server_name') || node.parentServerNodeId || ''
      return `location:${filePath}:${parent}:${path}`
    }
    return ''
  }

  function mergeComposeNodeWithSavedState(newNode, savedNode = null, baselineNode = null) {
    if (!savedNode) return newNode
    const merged = { ...newNode }
    ;['x', 'y', 'width', 'height', 'zIndex'].forEach(key => {
      if (savedNode[key] !== undefined && savedNode[key] !== null && savedNode[key] !== '') merged[key] = savedNode[key]
    })
    merged.items = mergeComposeNodeItemsWithSavedState(newNode.items || [], savedNode.items || [], baselineNode?.items || [])
    if (Array.isArray(savedNode.matchedFiles) && !Array.isArray(newNode.matchedFiles)) merged.matchedFiles = savedNode.matchedFiles
    normalizeComposeNodeFields(merged)
    return merged
  }

  function mergeComposeNodeItemsWithSavedState(newItems = [], savedItems = [], baselineItems = []) {
    const savedFields = new Map(savedItems.filter(item => item?.type === 'field').map(item => [item.label, item]))
    return newItems.map(item => {
      if (item?.type === 'section') {
        const savedSection = savedItems.find(saved => saved?.type === 'section' && saved.key === item.key)
        return savedSection ? { ...item, collapsed: !!savedSection.collapsed } : item
      }
      if (item?.type !== 'field') return item
      const savedField = savedFields.get(item.label)
      if (!savedField) return item
      const hasRealValue = String(item.value || '').trim() !== ''
      return hasRealValue ? item : { ...item, enabled: savedField.enabled }
    })
  }

  function mergeComposeRealEdgesWithMergedNodes({ nodes = [], newNodes = [], newEdges = [] } = {}) {
    const mergedByKey = new Map()
    newEdges.forEach(edge => {
      const key = getComposeEdgeStableKey(edge, newNodes)
      if (!key || mergedByKey.has(key) || isComposeEdgeSuppressed(edge, newNodes)) return
      const remapped = remapComposeEdgeToNodes(edge, newNodes, nodes)
      if (remapped) mergedByKey.set(key, remapped)
    })
    return Array.from(mergedByKey.values())
  }

  function getComposeEdgeStableKey(edge = {}, nodes = []) {
    const nodeMap = new Map(nodes.map(node => [node.id, node]))
    const fromNode = nodeMap.get(edge.fromNodeId)
    const toNode = nodeMap.get(edge.toNodeId)
    if (!fromNode || !toNode) return ''
    const fromPort = getComposePortById(fromNode, edge.fromPortId)
    const toPort = getComposePortById(toNode, edge.toPortId)
    return `${getComposeNodeStableKey(fromNode)}:${getComposePortStableKey(fromPort)}->${getComposeNodeStableKey(toNode)}:${getComposePortStableKey(toPort)}`
  }

  function remapComposeEdgeToNodes(edge = {}, sourceNodes = [], targetNodes = []) {
    const sourceNodeMap = new Map(sourceNodes.map(node => [node.id, node]))
    const sourceFromNode = sourceNodeMap.get(edge.fromNodeId)
    const sourceToNode = sourceNodeMap.get(edge.toNodeId)
    if (!sourceFromNode || !sourceToNode) return null
    const targetFromNode = findComposeNodeByStableKeys(targetNodes, getComposeNodeStableKeys(sourceFromNode))
    const targetToNode = findComposeNodeByStableKeys(targetNodes, getComposeNodeStableKeys(sourceToNode))
    if (!targetFromNode || !targetToNode) return null
    const sourceFromPort = getComposePortById(sourceFromNode, edge.fromPortId)
    const sourceToPort = getComposePortById(sourceToNode, edge.toPortId)
    const targetFromPort = findComposePortByStableKey(targetFromNode, getComposePortStableKey(sourceFromPort))
    const targetToPort = findComposePortByStableKey(targetToNode, getComposePortStableKey(sourceToPort))
    if (!targetFromPort || !targetToPort || !canConnectComposePorts(targetFromNode, targetFromPort, targetToNode, targetToPort)) return null
    return {
      id: `compose-edge:${targetFromNode.id}:${targetFromPort.id}->${targetToNode.id}:${targetToPort.id}`,
      fromNodeId: targetFromNode.id,
      fromPortId: targetFromPort.id,
      toNodeId: targetToNode.id,
      toPortId: targetToPort.id
    }
  }

  function findComposeNodeByStableKey(nodes = [], key = '') {
    return nodes.find(node => getComposeNodeStableKey(node) === key) || null
  }

  function findComposeNodeByStableKeys(nodes = [], keys = []) {
    const candidates = Array.isArray(keys) ? keys.filter(Boolean) : [keys].filter(Boolean)
    if (!candidates.length) return null
    return nodes.find(node => getComposeNodeStableKeys(node).some(key => candidates.includes(key))) || null
  }

  function getComposePortStableKey(port = null) {
    if (!port) return ''
    if (port.placement === 'include-file') return [port.label || '', port.context || '', port.placement || '', normalizeNginxPath(port.filePath || '')].join(':')
    return [port.label || '', port.context || '', port.placement || '', normalizeNginxPath(port.filePath || ''), port.fileId || ''].join(':')
  }

  function findComposePortByStableKey(node, key = '') {
    return getComposePorts(node).find(item => item?.type === 'port' && getComposePortStableKey(item) === key) || null
  }

  function cloneComposePlainObject(value) {
    if (value == null) return value
    try {
      return JSON.parse(JSON.stringify(value))
    } catch {
      return value
    }
  }

  async function ensureComposeMainConfigLoaded(options = {}) {
    if (!nginxTopology.value && !nginxTopologyLoading.value) await loadNginxTopology()
    const mainSite = mainConfigSite.value || siteMenuItems.value.find(site => site.name === 'nginx.conf' || isSameNginxPath(site.path, detectedNginxConf.value)) || null
    if (!mainSite?.path) return
    if (!options.forceReload && isSameNginxPath(props.selectedNginxSiteEditor?.path, mainSite.path)) return
    await Promise.resolve(props.selectNginxSite?.(mainSite, { forceReload: true }))
    await nextTick()
  }

  function hashComposeSourceCode(code = '') {
    let hash = 0
    for (let index = 0; index < code.length; index += 1) hash = ((hash << 5) - hash + code.charCodeAt(index)) | 0
    return String(hash)
  }

  function buildComposeGraphFromNginxConfig(sourceCode = '', sourcePath = '') {
    const nodes = []
    const edges = []
    const nodeMap = new Map()
    const edgeIds = new Set()
    const files = Array.isArray(nginxTopology.value?.files) ? nginxTopology.value.files : []
    const fileMap = new Map(files.map(file => [normalizeNginxPath(file.path || ''), file]))
    const rootPath = normalizeNginxPath(sourcePath || mainConfigSite.value?.path || detectedNginxConf.value)
    const rootFile = fileMap.get(rootPath) || files.find(file => String(file.name || '') === 'nginx.conf') || null
    const rootFilePath = normalizeNginxPath(rootFile?.path || rootPath)
    const mainNode = createComposeNode('main', { id: 'compose-main', title: formatPathBasename(rootFilePath) || 'nginx.conf', x: 28, y: 28 })
    mainNode.filePath = rootFilePath
    applyMainComposeFields(mainNode, sourceCode)
    addNode(mainNode)

    const visitedFiles = new Set()
    if (rootFile) {
      visitComposeFile(rootFile, mainNode, 0, 0)
    } else {
      buildComposeIncludesFromSource(mainNode, sourceCode, rootFilePath).forEach((includeItem, index) => addComposeIncludeBranch(mainNode, includeItem, index, 0))
    }

    return { nodes, edges }

    function addNode(node) {
      if (!node?.id) return null
      if (nodeMap.has(node.id)) {
        const existingNode = nodeMap.get(node.id)
        if (!existingNode) return null
        Object.assign(existingNode, node)
        normalizeComposeNodeFields(existingNode)
        return existingNode
      }
      normalizeComposeNodeFields(node)
      nodeMap.set(node.id, node)
      nodes.push(node)
      return node
    }

    function addEdge(fromNode, fromPort, toNode, toPort) {
      if (!fromNode || !fromPort || !toNode || !toPort || fromNode.id === toNode.id) return
      if (!canConnectComposePorts(fromNode, fromPort, toNode, toPort)) return
      const id = `compose-edge:${fromNode.id}:${fromPort.id}->${toNode.id}:${toPort.id}`
      const edge = { id, fromNodeId: fromNode.id, fromPortId: fromPort.id, toNodeId: toNode.id, toPortId: toPort.id }
      if (isComposeEdgeSuppressed(edge, nodes)) return
      if (edgeIds.has(id)) return
      edgeIds.add(id)
      edges.push(edge)
    }

    function visitComposeFile(file, parentNode, depth = 0, siblingIndex = 0) {
      const filePath = normalizeNginxPath(file?.path || '')
      if (!filePath) return
      if (visitedFiles.has(filePath)) {
        addComposeFileServers(parentNode, file, depth, siblingIndex)
        return
      }
      visitedFiles.add(filePath)
      addComposeFileServers(parentNode, file, depth, siblingIndex)
      addMissingComposeSourceIncludes(file, parentNode)
      const includes = Array.isArray(file?.includes) ? file.includes : []
      includes.forEach((includeItem, index) => addComposeIncludeBranch(parentNode, includeItem, index, depth, file))
    }

    function addMissingComposeSourceIncludes(file, parentNode) {
      const filePath = normalizeNginxPath(file?.path || rootFilePath)
      const fileCode = String(file?.content || (isSameNginxPath(filePath, rootFilePath) ? sourceCode : '') || '')
      if (!fileCode) return
      const known = new Set((Array.isArray(file?.includes) ? file.includes : []).map(item => `${item.line || ''}:${item.pattern || ''}`))
      buildComposeIncludesFromSource(parentNode, fileCode, filePath)
        .filter(item => !known.has(`${item.line || ''}:${item.pattern || ''}`))
        .forEach((includeItem, index) => addComposeIncludeBranch(parentNode, includeItem, index, 0, file))
    }

    function resolveComposeIncludeParentNode(includeItem, ownerFile, fallbackParentNode) {
      const ownerPath = normalizeNginxPath(ownerFile?.path || rootFilePath)
      const lineNumber = Number(includeItem?.line || 0)
      const sourceParentType = String(includeItem?.parentType || '').trim()
      const sourceParentStartLine = Number(includeItem?.parentStartLine || 0)
      if (ownerPath && sourceParentType && sourceParentStartLine) {
        const parentNode = findComposeNodeBySource(sourceParentType, ownerPath, sourceParentStartLine)
        if (parentNode) return parentNode
      }
      if (!ownerPath || !lineNumber) return fallbackParentNode
      const ownerCode = String(ownerFile?.content || (isSameNginxPath(ownerPath, rootFilePath) ? sourceCode : '') || '')
      if (!ownerCode) return fallbackParentNode
      const blockRef = getComposeIncludeParentBlockRefByLine(ownerCode, lineNumber)
      if (!blockRef) return fallbackParentNode
      const parentNode = findComposeNodeBySource(blockRef.type, ownerPath, blockRef.startLine)
      return parentNode || fallbackParentNode
    }

    function getComposeIncludeParentBlockRefByLine(code = '', lineNumber = 0) {
      if (!lineNumber) return null
      const lines = String(code || '').split(/\r?\n/)
      const stack = []
      for (let index = 0; index < Math.min(lineNumber - 1, lines.length); index += 1) {
        const rawLine = String(lines[index] || '')
        const stripped = stripComposeInlineComment(rawLine).trim()
        const locationMatch = stripped.match(/^location\s+(?:(=|~\*|~|\^~)\s+)?(.+?)\s*\{\s*$/)
        if (locationMatch) stack.push({ type: 'location', startLine: index + 1 })
        else if (/^server\s*\{\s*$/.test(stripped)) stack.push({ type: 'server', startLine: index + 1 })
        const closeCount = countToken(stripped, '}')
        for (let closeIndex = 0; closeIndex < closeCount; closeIndex += 1) stack.pop()
      }
      for (let index = stack.length - 1; index >= 0; index -= 1) {
        if (['location', 'server'].includes(stack[index]?.type)) return stack[index]
      }
      return null
    }

    function addComposeIncludeBranch(parentNode, includeItem, includeIndex = 0, depth = 0, ownerFile = null) {
      const pattern = String(includeItem?.pattern || '').trim()
      if (!pattern) return
      const ownerPath = normalizeNginxPath(ownerFile?.path || rootFilePath)
      const actualParentNode = resolveComposeIncludeParentNode(includeItem, ownerFile, parentNode)
      const ownerCode = String(ownerFile?.content || (isSameNginxPath(ownerPath, rootFilePath) ? sourceCode : '') || '')
      const context = includeItem?.context || (ownerCode ? getComposeIncludeContextByLine(ownerCode, includeItem?.line) : '') || getComposePortContextFromNode(actualParentNode) || 'http'
      const includeNode = createComposeNode('include', {
        id: `compose-include:${makeTopologyIdPart(ownerFile?.path || rootFilePath)}:${includeItem?.line || includeIndex}:${makeTopologyIdPart(pattern)}`,
        title: pattern,
        context,
        x: 410 + depth * 360,
        y: 72 + includeIndex * 210
      })
      includeNode.filePath = normalizeNginxPath(ownerFile?.path || rootFilePath)
      includeNode.sourceStartLine = Number(includeItem?.line || 0)
      includeNode.parentNodeId = actualParentNode?.id || ''
      setComposeFieldValue(includeNode, 'include.context', context)
      setComposeFieldValue(includeNode, 'pattern', pattern)
      const persistedIncludeNode = addNode(includeNode) || includeNode
      addEdge(actualParentNode, getComposeOutputPort(actualParentNode, 'include', context), persistedIncludeNode, getComposeInputPort(persistedIncludeNode))

      const matchedPaths = (Array.isArray(includeItem?.matched) ? includeItem.matched.map(normalizeNginxPath).filter(Boolean) : [])
      const resolvedMatchedPaths = uniqueComposePaths([...matchedPaths, ...resolveComposeIncludeMatches(pattern, ownerPath)])
      const downstreamPaths = resolvedMatchedPaths.length ? resolvedMatchedPaths : [resolveComposeIncludePattern(pattern, ownerPath) || pattern]
      persistedIncludeNode.matchedFiles = downstreamPaths.map((matchedPath, fileIndex) => {
        const resolved = resolvedMatchedPaths.some(path => isSameNginxPath(path, matchedPath))
        return {
          id: `include-file:${makeTopologyIdPart(matchedPath)}:${fileIndex}`,
          path: normalizeNginxPath(matchedPath),
          name: resolved ? formatPathBasename(matchedPath) : pattern,
          unresolved: !resolved
        }
      })
      downstreamPaths.forEach((matchedPath, fileIndex) => {
        const resolved = resolvedMatchedPaths.some(path => isSameNginxPath(path, matchedPath))
        const matchedFile = fileMap.get(matchedPath) || { path: matchedPath, name: resolved ? formatPathBasename(matchedPath) : pattern, includes: [], unresolved: !resolved }
        if (resolved) visitComposeFile(matchedFile, persistedIncludeNode, depth + 1, fileIndex)
      })
    }

    function addComposeFileServers(fileSourceNode, file, depth = 0, fileIndex = 0) {
      const servers = Array.isArray(file?.servers) ? file.servers : []
      servers.forEach((server, serverIndex) => {
        const serverX = fileSourceNode?.type === 'include'
          ? (fileSourceNode.x || 80) + getComposeNodeWidth(fileSourceNode) + 70
          : 760 + depth * 360
        const serverNode = createComposeNode('server', {
          id: `compose-server:${makeTopologyIdPart(file?.path || fileSourceNode?.id)}:${server.startLine || serverIndex}`,
          title: server.title || server.serverName || `server ${serverIndex + 1}`,
          x: serverX,
          y: (fileSourceNode?.y || 80) + fileIndex * 118 + serverIndex * 180
        })
        serverNode.filePath = normalizeNginxPath(file?.path || '')
        serverNode.sourceStartLine = Number(server.startLine || 0)
        serverNode.parentNodeId = fileSourceNode?.id || ''
        applyServerComposeFields(serverNode, server)
        const persistedServerNode = addNode(serverNode) || serverNode
        addEdge(fileSourceNode, getComposeServerOutputPortForFile(fileSourceNode, file?.path), persistedServerNode, getComposeInputPort(persistedServerNode))
        ;(Array.isArray(server.locations) ? server.locations : []).forEach((location, locationIndex) => {
          const locationNode = createComposeNode('location', {
            id: `compose-location:${makeTopologyIdPart(file?.path || fileSourceNode?.id)}:${server.startLine || serverIndex}:${location.startLine || locationIndex}`,
            title: `location ${location.matcher || location.path || '/'}`,
            x: serverX + 430,
            y: (persistedServerNode.y || 80) + locationIndex * 132
          })
          locationNode.filePath = persistedServerNode.filePath
          locationNode.sourceStartLine = Number(location.startLine || 0)
          locationNode.parentServerStartLine = Number(server.startLine || 0)
          locationNode.parentServerNodeId = persistedServerNode.id
          locationNode.parentNodeId = persistedServerNode.id
          applyLocationComposeFields(locationNode, location)
          const persistedLocationNode = addNode(locationNode) || locationNode
          addEdge(persistedServerNode, getComposeOutputPort(persistedServerNode, 'location'), persistedLocationNode, getComposeInputPort(persistedLocationNode))
        })
      })
    }
  }

  function applyMainComposeFields(node, code = '') {
    const httpBlock = extractTopLevelHttpBlock(code)
    const eventsBlock = extractNamedTopLevelBlock(code, 'events')
    const httpBody = httpBlock.found ? unwrapBlockContent(httpBlock.block) : ''
    const { outsideDirectives } = extractServerBlocks(httpBody)
    clearComposeDirectiveFields(node, 'main')
    clearComposeDirectiveFields(node, 'events')
    clearComposeDirectiveFields(node, 'http')
    applyComposeParsedContext(node, parseComposeContextContent(removeNamedTopLevelBlock(httpBlock.before, 'events')), 'main')
    applyComposeParsedContext(node, parseComposeContextContent(unwrapBlockContent(eventsBlock)), 'events')
    applyComposeParsedContext(node, parseComposeContextContent(outsideDirectives), 'http')
  }

  function applyComposeDirectiveFields(node, directives = {}, context = '') {
    Object.entries(directives).forEach(([key, value]) => {
      if (key === 'include') return
      setComposeFieldValue(node, context ? `${context}.${key}` : key, value)
    })
  }

  function applyComposeParsedContext(node, parsed = {}, context = '') {
    applyComposeDirectiveFields(node, parsed?.directives || {}, context)
    if (String(parsed?.raw || '').trim()) {
      setComposeFieldValue(node, context ? `${context}.raw` : 'raw', parsed.raw)
    }
  }

  function applyServerComposeFields(node, server = {}) {
    clearComposeDirectiveFields(node)
    setComposeFieldValue(node, 'listen', Array.isArray(server.listens) ? server.listens.join('\n') : server.listen || server.listenText || '')
    setComposeFieldValue(node, 'server_name', server.serverName || server.server_name || server.serverNameText || '')
    ;['root', 'index', 'charset', 'client_max_body_size', 'access_log', 'error_log', 'ssl_certificate_key', 'add_header', 'rewrite', 'set', 'return'].forEach(label => {
      setComposeFieldValue(node, label, Array.isArray(server[label]) ? server[label].join('\n') : server[label] || '')
    })
    setComposeFieldValue(node, 'ssl_certificate', Array.isArray(server.sslCertificates) ? server.sslCertificates[0] || '' : server.ssl_certificate || '')
    setComposeFieldValue(node, 'raw', server.raw || server.customDirectives || '')
  }

  function applyLocationComposeFields(node, location = {}) {
    clearComposeDirectiveFields(node)
    const modifier = String(location.modifier || '').trim()
    const pathDirective = String(location.pathDirective || '').trim() === 'alias' ? 'alias' : 'root'
    const mode = String(location.mode || '').trim() || inferComposeLocationMode(location)
    setComposeFieldValue(node, 'modifier', modifier)
    setComposeFieldValue(node, 'mode', mode)
    setComposeFieldValue(node, 'pathDirective', pathDirective)
    setComposeFieldValue(node, 'path', location.matcher || location.path || '/')
    setComposeFieldValue(node, 'proxy_pass', location.proxyPass || location.proxy_pass || '')
    ;['root', 'alias', 'index', 'try_files', 'proxy_set_header', 'proxy_redirect', 'proxy_connect_timeout', 'proxy_send_timeout', 'proxy_read_timeout', 'fastcgi_pass', 'fastcgi_param', 'expires', 'auth_basic', 'auth_basic_user_file', 'allow', 'deny', 'add_header', 'rewrite', 'return'].forEach(label => {
      setComposeFieldValue(node, label, Array.isArray(location[label]) ? location[label].join('\n') : location[label] || '')
    })
    if (!getComposeFieldValue(node, 'root')) setComposeFieldValue(node, 'root', location.alias || location.root || '')
    setComposeFieldValue(node, 'try_files', location.tryFiles || location.try_files || '')
    setComposeFieldValue(node, 'raw', location.raw || location.customDirectives || '')
  }

  function inferComposeLocationMode(location = {}) {
    if (location.proxyPass || location.proxy_pass) return 'proxy'
    if (location.returnRule || location.return) return 'redirect'
    if (location.root || location.alias || location.tryFiles || location.try_files) return 'static'
    return 'custom'
  }

  function setComposeFieldValue(node, label = '', value = '') {
    const text = String(value || '').trim()
    if (!label || !text) return
    let field = (node?.items || []).find(item => item.type === 'field' && item.label === label)
    if (!field) field = insertComposeField(node, label)
    field.value = text
    field.enabled = true
    expandComposeSectionForField(node, field)
  }

  function clearComposeDirectiveFields(node, context = '') {
    for (const item of node?.items || []) {
      if (item?.type !== 'field') continue
      const label = String(item.label || '')
      if (!label) continue
      if (context) {
        if (!label.startsWith(`${context}.`)) continue
      } else if (label.includes('.')) {
        continue
      }
      item.value = ''
      item.enabled = COMPOSE_DEFAULT_ENABLED_FIELDS.has(label)
    }
  }

  function expandComposeSectionForField(node, field) {
    if (!node || !field) return
    let activeSection = null
    for (const item of node.items || []) {
      if (item.type === 'section') activeSection = item
      if (item === field && activeSection) {
        activeSection.collapsed = false
        return
      }
    }
  }

  function insertComposeField(node, label = '') {
    const field = composeField(label, '', { enabled: true })
    const sectionKey = label.includes('.') ? label.split('.')[0] : ''
    const items = node?.items || []
    if (sectionKey) {
      const sectionIndex = items.findIndex(item => item.type === 'section' && item.key === sectionKey)
      if (sectionIndex >= 0) {
        let insertIndex = sectionIndex + 1
        while (insertIndex < items.length && items[insertIndex].type !== 'section') insertIndex += 1
        items.splice(insertIndex, 0, field)
        return field
      }
    }
    const firstPortIndex = items.findIndex(item => item.type === 'port')
    items.splice(firstPortIndex >= 0 ? firstPortIndex : items.length, 0, field)
    return field
  }

  function parseComposeContextContent(text = '') {
    const directives = {}
    const rawLines = []
    const lines = String(text || '').split(/\r?\n/)
    let blockDepth = 0
    for (const line of lines) {
      const sourceLine = String(line || '')
      const trimmed = sourceLine.trim()
      const normalized = normalizeDirectiveValue(stripComposeInlineComment(trimmed))
      const openCount = countToken(sourceLine, '{')
      const closeCount = countToken(sourceLine, '}')
      if (blockDepth > 0) {
        rawLines.push(sourceLine)
        blockDepth += openCount - closeCount
        continue
      }
      if (!trimmed) continue
      if (trimmed.startsWith('#')) {
        rawLines.push(sourceLine)
        continue
      }
      if (openCount > 0 || closeCount > 0) {
        rawLines.push(sourceLine)
        blockDepth += openCount - closeCount
        continue
      }
      if (!normalized) continue
      const match = normalized.match(/^([A-Za-z_]+)\s+(.+)$/)
      if (!match) {
        rawLines.push(sourceLine)
        continue
      }
      const [, key, value] = match
      directives[key] = directives[key] ? `${directives[key]}\n${value}` : value
    }
    return {
      directives,
      raw: rawLines.join('\n').trim()
    }
  }

  function stripComposeInlineComment(line = '') {
    const text = String(line || '')
    let quote = ''
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index]
      if ((char === '"' || char === "'") && text[index - 1] !== '\\') {
        quote = quote === char ? '' : quote || char
        continue
      }
      if (char === '#' && !quote) return text.slice(0, index).trimEnd()
    }
    return text
  }

  function removeNamedTopLevelBlock(content = '', blockName = '') {
    const lines = String(content || '').split(/\r?\n/)
    const output = []
    let skipping = false
    let depth = 0
    for (const line of lines) {
      const trimmed = line.trim()
      if (!skipping && new RegExp(`^${blockName}\\s*\\{`).test(trimmed)) {
        skipping = true
        depth = countToken(line, '{') - countToken(line, '}')
        if (depth <= 0) skipping = false
        continue
      }
      if (skipping) {
        depth += countToken(line, '{') - countToken(line, '}')
        if (depth <= 0) skipping = false
        continue
      }
      output.push(line)
    }
    return output.join('\n').trim()
  }

  function buildComposeIncludesFromSource(parentNode, code = '', filePath = '') {
    const includes = []
    String(code || '').split(/\r?\n/).forEach((line, index) => {
      const trimmed = normalizeDirectiveValue(stripComposeInlineComment(line).trim())
      const match = trimmed.match(/^include\s+(.+)$/)
      if (!match) return
      includes.push({ pattern: match[1], line: index + 1, matched: resolveComposeIncludeMatches(match[1], filePath), context: getComposeIncludeContextByLine(code, index + 1), filePath })
    })
    return includes
  }

  function resolveComposeIncludeMatches(pattern = '', ownerFilePath = '') {
    const normalizedPattern = resolveComposeIncludePattern(pattern, ownerFilePath)
    if (!normalizedPattern) return []
    const candidates = new Map()
    ;(Array.isArray(nginxTopology.value?.files) ? nginxTopology.value.files : []).forEach(file => {
      const path = normalizeNginxPath(file?.path || '')
      if (path) candidates.set(path, path)
    })
    siteMenuItems.value.forEach(site => {
      const path = normalizeNginxPath(site?.path || '')
      if (path) candidates.set(path, path)
    })
    const ownerPath = normalizeNginxPath(ownerFilePath || '')
    return Array.from(candidates.keys())
      .filter(path => path && !isSameNginxPath(path, ownerPath) && matchComposeIncludePattern(path, normalizedPattern))
      .sort((a, b) => a.localeCompare(b))
  }

  function uniqueComposePaths(paths = []) {
    const output = []
    const seen = new Set()
    paths.map(normalizeNginxPath).filter(Boolean).forEach(path => {
      const key = path.toLowerCase()
      if (seen.has(key)) return
      seen.add(key)
      output.push(path)
    })
    return output
  }

  function resolveComposeIncludePattern(pattern = '', ownerFilePath = '') {
    const text = normalizeDirectiveValue(pattern).replace(/^['"]|['"]$/g, '')
    if (!text) return ''
    if (text.startsWith('/')) return normalizeNginxPath(text)
    const ownerDir = getComposePathDirname(ownerFilePath || detectedNginxConf.value)
    return normalizeNginxPath(`${ownerDir}/${text}`)
  }

  function getComposePathDirname(filePath = '') {
    const parts = normalizeNginxPath(filePath || '').split('/').filter(Boolean)
    if (parts.length <= 1) return '/'
    return `/${parts.slice(0, -1).join('/')}`
  }

  function matchComposeIncludePattern(filePath = '', pattern = '') {
    const file = normalizeNginxPath(filePath)
    const target = normalizeNginxPath(pattern)
    if (!target.includes('*')) return isSameNginxPath(file, target)
    const regexText = `^${target.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`
    return new RegExp(regexText).test(file)
  }

  function getComposeIncludeContextByLine(code = '', lineNumber = 0) {
    if (!lineNumber) return ''
    const lines = String(code || '').split(/\r?\n/)
    const stack = []
    for (let index = 0; index < Math.min(lineNumber, lines.length); index += 1) {
      const trimmed = lines[index].trim()
      const blockMatch = trimmed.match(/^(events|http|server|location|stream)\b.*\{/)
      if (blockMatch) stack.push(blockMatch[1])
      if (index + 1 === lineNumber) break
      const closeCount = countToken(trimmed, '}')
      for (let closeIndex = 0; closeIndex < closeCount; closeIndex += 1) stack.pop()
    }
    return stack[stack.length - 1] || 'main'
  }

  function getComposeInputPort(node) {
    return getComposePortsBySide(node, 'left')[0] || null
  }

  function getComposeOutputPort(node, label = '', context = '') {
    const ports = getComposePortsBySide(node, 'right')
    return ports.find(port => port.label === label && (!context || port.context === context)) || ports.find(port => port.label === label) || ports[0] || null
  }

  function getComposeServerOutputPortForFile(node, filePath = '') {
    if (node?.type === 'include') {
      const file = getComposeIncludeFiles(node).find(item => isSameNginxPath(item.path, filePath))
      return file ? getComposeIncludeFilePort(node, file) : null
    }
    return getComposeOutputPort(node, 'server')
  }

  async function applyComposeToSelectedSource() {
    try {
      if (!props.connected || !props.isSSHSession) {
        await ElMessageBox.alert('当前连接不是 SSH，不能保存并应用配置编排。', '无法保存并应用', { type: 'warning', confirmButtonText: '确定' })
        return
      }
      if (!canApplyComposeToSelectedSource()) {
        await ElMessageBox.alert('当前编排没有可应用到源码的改动。', '无需保存', { type: 'info', confirmButtonText: '确定' })
        return
      }
      const buildResult = isSelectedMainNginxConf() ? buildComposeMainNodeSourceCode() : buildComposeCurrentFileNodesSourceCode()
      if (!buildResult.changed) {
        await ElMessageBox.alert('当前编排没有生成新的源码变更。', '无需保存', { type: 'info', confirmButtonText: '确定' })
        return
      }
      const nextCode = buildResult.content
      saveComposeDraft()
      await nextTick()
      const saved = await props.saveSelectedNginxSite?.({ ...buildNginxSafeSaveOptions(), content: nextCode })
      if (!saved) {
        await ElMessageBox.alert('Nginx 配置保存失败，请查看页面提示信息。', '保存失败', { type: 'error', confirmButtonText: '确定' })
        return
      }
      await props.parseSelectedNginxCode?.()
      await syncComposeDraftFromAppliedSource()
      await ElMessageBox.alert('配置编排已保存并应用到当前源码。', '保存成功', { type: 'success', confirmButtonText: '确定' })
    } catch (error) {
      reportNginxError('compose-apply:failed', {
        path: getSelectedComposeSourcePath(),
        message: error?.message || String(error || ''),
        stack: String(error?.stack || '')
      })
      await ElMessageBox.alert(`配置编排保存并应用失败：${error?.message || error}`, '保存失败', { type: 'error', confirmButtonText: '确定' })
    }
  }

  async function syncComposeDraftFromAppliedSource() {
    const sourcePath = getSelectedComposeSourcePath()
    const sourceCode = String(props.selectedNginxSiteEditor?.code || '')
    if (!sourcePath || !sourceCode.trim()) return
    const previousNodes = composeNodes.value.map(cloneComposePlainObject)
    const previousEdges = composeEdges.value.map(cloneComposePlainObject)
    const previousSuppressedEdges = composeSuppressedEdges.value.map(cloneComposePlainObject)
    const previousBaselineGraph = cloneComposePlainObject(composeBaselineGraph.value || null)
    nginxTopology.value = null
    await loadNginxTopology()
    const graph = buildComposeGraphFromNginxConfig(sourceCode, sourcePath)
    composeSuppressedEdges.value = previousSuppressedEdges
    const normalizedGraph = mergeComposeGraphWithSavedState(graph, { nodes: previousNodes, edges: previousEdges }, previousBaselineGraph)
    normalizeDetachedComposeDraftNodes(normalizedGraph.nodes)
    normalizedGraph.nodes.forEach(node => restoreComposeAppliedNodeLayout(node, previousNodes))
    composeNodes.value = normalizedGraph.nodes
    composeEdges.value = normalizedGraph.edges
    composeDeletedSourceBlocks.value = []
    composeSuppressedEdges.value = previousSuppressedEdges
    composeGeneratedSourceKey.value = `${sourcePath}:${sourceCode.length}:${hashComposeSourceCode(sourceCode)}`
    composeBaselineGraph.value = cloneComposePlainObject(normalizedGraph)
    composeDraftSnapshot.value = buildComposeConfigSnapshot(nginxTopology.value)
    composeIgnoredSnapshotKey.value = ''
    composeUseSavedDraft.value = true
    selectedComposeEdgeId.value = ''
    selectedComposePortKey.value = ''
    raisedComposeNodeId.value = ''
    const detachedDraftNodes = composeNodes.value.filter(node => isComposeDraftNode(node) && !getComposeParentEdge(node))
    if (detachedDraftNodes[0]?.id) {
      raiseComposeNodeLayer(detachedDraftNodes[0].id)
      await nextTick()
      focusComposeNodeInView(detachedDraftNodes[0])
    }
    saveComposeDraft()
  }

  function normalizeDetachedComposeDraftNodes(nodes = []) {
    nodes.forEach(node => {
      if (!node || !isComposeDraftNode(node) || getComposeParentEdge(node)) return
      if (!['include', 'server', 'location'].includes(node.type)) return
      if (!Number(node.sourceStartLine || 0) && !Number(node.parentServerStartLine || 0) && !String(node.parentNodeId || '').trim()) return
      node.draft = true
      node.sourceStartLine = 0
      node.parentNodeId = ''
      node.parentServerNodeId = ''
      node.parentServerStartLine = 0
    })
  }

  function focusComposeNodeInView(node) {
    if (!node?.id || !composeCanvasRef.value) return
    const canvas = composeCanvasRef.value
    const zoom = Number(composeZoom.value || 1) || 1
    const width = getComposeNodeWidth(node) * zoom
    const height = getComposeNodeHeight(node) * zoom
    const targetLeft = Math.max(0, (Number(node.x || 0) * zoom) - Math.max(0, canvas.clientWidth / 2 - width / 2))
    const targetTop = Math.max(0, (Number(node.y || 0) * zoom) - Math.max(0, canvas.clientHeight / 2 - height / 2))
    canvas.scrollLeft = targetLeft
    canvas.scrollTop = targetTop
  }

  function restoreComposeAppliedNodeLayout(node, previousNodes = []) {
    const previous = previousNodes.find(item => item?.id === node?.id) || findComposeNodeByStableKey(previousNodes, getComposeNodeStableKey(node))
    if (!previous) return
    ;['x', 'y', 'width', 'height', 'zIndex'].forEach(key => {
      const value = Number(previous[key])
      if (Number.isFinite(value) && value > 0) node[key] = value
    })
  }

  function buildComposeMainNodeSourceCode() {
    const currentCode = String(props.selectedNginxSiteEditor?.code || '')
    if (!currentCode.trim() || !isSelectedMainNginxConf()) return { changed: false, content: currentCode }
    const nextCode = buildComposeSourceCodeFromActiveGraph({ sourcePath: getSelectedComposeSourcePath(), mainConfig: true })
    return { changed: nextCode !== currentCode, content: nextCode }
  }

  function buildComposeCurrentFileNodesSourceCode() {
    const currentCode = String(props.selectedNginxSiteEditor?.code || '')
    const sourcePath = getSelectedComposeSourcePath()
    if (!currentCode.trim() || !sourcePath) return { changed: false, content: currentCode }
    const nextCode = buildComposeSourceCodeFromActiveGraph({ sourcePath, mainConfig: false })
    return { changed: nextCode !== currentCode, content: nextCode }
  }

  function buildComposeSourceCodeFromActiveGraph(options = {}) {
    const sourcePath = normalizeNginxPath(options.sourcePath || getSelectedComposeSourcePath())
    if (!sourcePath) return ''
    const mainConfig = options.mainConfig === true
    const nodes = Array.isArray(options.nodes) ? options.nodes : composeNodes.value
    const edges = Array.isArray(options.edges) ? options.edges : composeEdges.value
    const mainNode = nodes.find(node => node?.type === 'main') || null
    const activeServers = getActiveComposeNodesForSource(sourcePath, 'server', { nodes, edges }).sort(compareComposeDocumentNodes)
    const activeLocations = getActiveComposeNodesForSource(sourcePath, 'location', { nodes, edges }).sort(compareComposeDocumentNodes)
    const activeIncludes = getActiveComposeNodesForSource(sourcePath, 'include', { nodes, edges }).sort(compareComposeDocumentNodes)
    if (mainConfig) {
      if (!mainNode) return ''
      return buildMainComposeSourceFromGraph(mainNode, sourcePath, activeServers, activeLocations, { nodes, edges })
    }
    return buildFileComposeSourceFromGraph(sourcePath, activeServers, activeLocations, activeIncludes, { nodes, edges })
  }

  function buildMainComposeSourceFromGraph(mainNode, sourcePath = '', serverNodes = [], locationNodes = [], options = {}) {
    const mainLines = renderComposeDirectiveMap(getComposeContextDirectiveValues(mainNode, 'main'))
    mainLines.push(...renderComposeContextRawDirectives(mainNode, 'main'))
    const mainIncludeValue = resolveComposeContextIncludeDirectiveValue(mainNode, sourcePath, 'main', options)
    if (mainIncludeValue) mainLines.push(...renderComposeDirectiveLines('include', mainIncludeValue))

    const eventsLines = renderComposeDirectiveMap(getComposeContextDirectiveValues(mainNode, 'events'), '    ')
    eventsLines.push(...renderComposeContextRawDirectives(mainNode, 'events', '    '))
    const eventsIncludeValue = resolveComposeContextIncludeDirectiveValue(mainNode, sourcePath, 'events', options)
    if (eventsIncludeValue) eventsLines.push(...renderComposeDirectiveLines('include', eventsIncludeValue, '    '))

    const httpLines = renderComposeDirectiveMap(getComposeContextDirectiveValues(mainNode, 'http'), '    ')
    httpLines.push(...renderComposeContextRawDirectives(mainNode, 'http', '    '))
    const httpIncludeValue = resolveComposeContextIncludeDirectiveValue(mainNode, sourcePath, 'http', options)
    if (httpIncludeValue) httpLines.push(...renderComposeDirectiveLines('include', httpIncludeValue, '    '))
    buildComposeServerBlocksForDocument(serverNodes, locationNodes, options).forEach(block => {
      httpLines.push(...indentBlock(block, '    ').split(/\r?\n/))
    })

    const parts = []
    if (mainLines.length) parts.push(mainLines.join('\n'))
    if (eventsLines.length) parts.push(`events {\n${eventsLines.join('\n')}\n}`)
    parts.push(httpLines.length ? `http {\n${httpLines.join('\n')}\n}` : 'http {\n}')
    return `${parts.join('\n\n').trim()}\n`
  }

  function buildFileComposeSourceFromGraph(sourcePath = '', serverNodes = [], locationNodes = [], includeNodes = [], options = {}) {
    const topLevelIncludeNodes = includeNodes.filter(node => isComposeTopLevelSourceNode(node, sourcePath, options))
    const parts = []
    if (topLevelIncludeNodes.length) {
      const patterns = topLevelIncludeNodes
        .map(node => normalizeDirectiveValue(getComposeFieldValue(node, 'pattern')))
        .filter(Boolean)
      if (patterns.length) parts.push(renderComposeDirectiveLines('include', patterns.join('\n')).join('\n'))
    }
    const serverBlocks = buildComposeServerBlocksForDocument(serverNodes, locationNodes, options)
    if (serverBlocks.length) parts.push(serverBlocks.join('\n\n'))
    return parts.length ? `${parts.join('\n\n').trim()}\n` : ''
  }

  function buildComposeServerBlocksForDocument(serverNodes = [], locationNodes = [], options = {}) {
    return serverNodes.map(serverNode => {
      const childLocations = locationNodes
        .filter(node => {
          if (node.parentServerNodeId) return node.parentServerNodeId === serverNode.id
          const parentEdge = getComposeParentEdgeInGraph(node, options.edges)
          return parentEdge?.fromNodeId === serverNode.id
        })
        .sort(compareComposeDocumentNodes)
      return renderComposeServerBlockFromNode(serverNode, childLocations, options)
    })
  }

  function isComposeTopLevelSourceNode(node = {}, sourcePath = '', options = {}) {
    if (node?.type !== 'include' || !isSameNginxPath(node.filePath || '', sourcePath)) return false
    const forcedTopLevelIncludeIds = options.forcedTopLevelIncludeIds instanceof Set ? options.forcedTopLevelIncludeIds : new Set(options.forcedTopLevelIncludeIds || [])
    if (forcedTopLevelIncludeIds.has(node.id)) return true
    const parentNode = getComposeParentNodeForInclude(node, options.nodes, options.edges)
    const fallbackNodes = Array.isArray(options.nodes) ? options.nodes : composeNodes.value
    const fallbackParentNode = fallbackNodes.find(item => item.id === node.parentNodeId) || null
    const actualParentNode = parentNode || fallbackParentNode
    return !!actualParentNode && !['server', 'location'].includes(actualParentNode.type)
  }

  function renderComposeDirectiveMap(values = new Map(), indent = '') {
    const output = []
    appendPendingComposeDirectives(output, values, new Set(), indent)
    return output
  }

  function renderComposeNodeRawDirectives(node, indent = '') {
    return splitDirectiveMultiline(getComposeFieldValue(node, 'raw')).map(line => `${indent}${line};`)
  }

  function renderComposeContextRawDirectives(node, context = '', indent = '') {
    return splitDirectiveMultiline(getComposeFieldValue(node, `${context}.raw`)).map(line => `${indent}${line};`)
  }

  function resolveComposeContextIncludeDirectiveValue(node, sourcePath = '', context = '', options = {}) {
    const includePatterns = getComposeIncludePatternsForSource(sourcePath, context, options)
    if (Array.isArray(includePatterns)) return includePatterns.join('\n')
    return getComposeFieldValue(node, `${context}.include`)
  }

  function resolveComposeParentIncludeDirectiveValue(node, context = '', options = {}) {
    const includePatterns = getComposeIncludePatternsForParentNode(node, context, options)
    if (Array.isArray(includePatterns)) return includePatterns.join('\n')
    return getComposeFieldValue(node, 'include') || getComposeFieldValue(node, `${context}.include`)
  }

  function compareComposeDocumentNodes(left, right) {
    const leftLine = Number(left?.sourceStartLine || 0)
    const rightLine = Number(right?.sourceStartLine || 0)
    if (leftLine && rightLine && leftLine !== rightLine) return leftLine - rightLine
    const leftY = Number(left?.y || 0)
    const rightY = Number(right?.y || 0)
    if (leftY !== rightY) return leftY - rightY
    const leftX = Number(left?.x || 0)
    const rightX = Number(right?.x || 0)
    if (leftX !== rightX) return leftX - rightX
    return String(left?.id || '').localeCompare(String(right?.id || ''))
  }

  function renderComposeServerBlockFromNode(serverNode, locationNodes = [], options = {}) {
    const lines = ['server {']
    const values = getComposeNodeDirectiveValues(serverNode, ['raw', 'include'])
    const includeValue = resolveComposeParentIncludeDirectiveValue(serverNode, 'server', options)
    if (includeValue) values.set('include', includeValue)
    appendPendingComposeDirectives(lines, values, new Set(), '    ')
    lines.push(...renderComposeNodeRawDirectives(serverNode, '    '))
    const children = locationNodes.length ? locationNodes : []
    children.forEach(locationNode => lines.push(...renderComposeLocationBlockFromNode(locationNode, '    ', options)))
    lines.push('}')
    return lines.join('\n')
  }

  function renderComposeLocationBlockFromNode(locationNode, indent = '    ', options = {}) {
    const path = getComposeFieldValue(locationNode, 'path') || '/'
    const modifier = getComposeFieldValue(locationNode, 'modifier')
    const lines = [`${indent}location ${modifier ? `${modifier} ` : ''}${path} {`]
    const values = getComposeNodeDirectiveValues(locationNode, ['modifier', 'path', 'mode', 'pathDirective', 'raw', 'include'])
    const locationMode = getComposeFieldValue(locationNode, 'mode') || 'custom'
    const pathDirective = getComposeFieldValue(locationNode, 'pathDirective') === 'alias' ? 'alias' : 'root'
    if (pathDirective === 'alias') values.set('root', '')
    else values.set('alias', '')
    if (locationMode === 'redirect') {
      values.set('proxy_pass', '')
      values.set('root', '')
      values.set('alias', '')
      values.set('try_files', '')
      values.set('fastcgi_pass', '')
    } else if (locationMode === 'proxy') {
      values.set('return', '')
      values.set('root', '')
      values.set('alias', '')
      values.set('try_files', '')
      values.set('fastcgi_pass', '')
    } else if (locationMode === 'static') {
      values.set('proxy_pass', '')
      values.set('return', '')
      values.set('fastcgi_pass', '')
    }
    const includeValue = resolveComposeParentIncludeDirectiveValue(locationNode, 'location', options)
    if (includeValue) values.set('include', includeValue)
    appendPendingComposeDirectives(lines, values, new Set(), `${indent}    `)
    lines.push(...renderComposeNodeRawDirectives(locationNode, `${indent}    `))
    lines.push(`${indent}}`)
    return lines
  }

  function getComposeContextDirectiveValues(node, context = '') {
    const values = new Map()
    for (const item of node?.items || []) {
      if (item?.type !== 'field') continue
      const label = String(item.label || '')
      if (!label.startsWith(`${context}.`)) continue
      const key = label.slice(context.length + 1)
      if (!key || key === 'raw' || key === 'include') continue
      values.set(key, item.enabled !== false ? String(item.value || '').trim() : '')
    }
    return values
  }

  function getComposeIncludePatternsForSource(sourcePath = '', context = '', options = {}) {
    const normalizedSourcePath = normalizeNginxPath(sourcePath || '')
    const nodes = Array.isArray(options.nodes) ? options.nodes : composeNodes.value
    const edges = Array.isArray(options.edges) ? options.edges : composeEdges.value
    const candidateNodes = nodes.filter(node => {
      if (node?.type !== 'include') return false
      if (!isSameNginxPath(node.filePath || '', normalizedSourcePath)) return false
      const nodeContext = getComposeFieldValue(node, 'include.context') || node.context || ''
      return !context || nodeContext === context
    })
    const includeNodes = candidateNodes.filter(node => isComposeNodeActiveForApply(node, { nodes, edges }))
    if (!includeNodes.length) return candidateNodes.some(node => Number(node.sourceStartLine || 0) > 0) || hasDeletedComposeIncludeForSource(sourcePath, context) ? [] : null
    return includeNodes
      .map(node => normalizeDirectiveValue(getComposeFieldValue(node, 'pattern')))
      .filter(Boolean)
  }

  function getComposeIncludePatternsForParentNode(parentNode, context = '', options = {}) {
    if (!parentNode?.id) return null
    const nodes = Array.isArray(options.nodes) ? options.nodes : composeNodes.value
    const edges = Array.isArray(options.edges) ? options.edges : composeEdges.value
    const includeNodes = edges
      .filter(edge => edge.fromNodeId === parentNode.id)
      .map(edge => nodes.find(node => node.id === edge.toNodeId && node.type === 'include'))
      .filter(Boolean)
      .filter(node => {
        const nodeContext = getComposeFieldValue(node, 'include.context') || node.context || ''
        return !context || nodeContext === context
      })
    if (!includeNodes.length) {
      const hasDisconnectedSourceInclude = nodes.some(node => {
        if (node?.type !== 'include' || node.parentNodeId !== parentNode.id || !Number(node.sourceStartLine || 0)) return false
        const nodeContext = getComposeFieldValue(node, 'include.context') || node.context || ''
        return !context || nodeContext === context
      })
      return hasDisconnectedSourceInclude || hasDeletedComposeIncludeForParent(parentNode, context) ? [] : null
    }
    const patterns = includeNodes
      .map(node => normalizeDirectiveValue(getComposeFieldValue(node, 'pattern')))
      .filter(Boolean)
    return patterns
  }

  function getComposeTopLevelIncludePatternsForSource(sourcePath = '') {
    const normalizedSourcePath = normalizeNginxPath(sourcePath || '')
    const candidateNodes = composeNodes.value.filter(node => {
      if (node?.type !== 'include') return false
      if (!isSameNginxPath(node.filePath || '', normalizedSourcePath)) return false
      const parentNode = getComposeParentNodeForInclude(node)
      const lastParentNode = parentNode || composeNodes.value.find(item => item.id === node.parentNodeId) || null
      return lastParentNode && !['server', 'location'].includes(lastParentNode.type)
    })
    const includeNodes = candidateNodes.filter(node => isComposeNodeActiveForApply(node))
    if (!includeNodes.length) {
      const shouldClear = candidateNodes.some(node => Number(node.sourceStartLine || 0) > 0) || hasDeletedTopLevelComposeInclude(sourcePath)
      return shouldClear ? [] : null
    }
    const patterns = includeNodes
      .map(node => normalizeDirectiveValue(getComposeFieldValue(node, 'pattern')))
      .filter(Boolean)
    return patterns
  }

  function getComposeParentNodeForInclude(includeNode, nodes = composeNodes.value, edges = composeEdges.value) {
    const edge = getComposeParentEdgeInGraph(includeNode, edges)
    return edge ? (Array.isArray(nodes) ? nodes : composeNodes.value).find(node => node.id === edge.fromNodeId) || null : null
  }

  function hasDeletedComposeIncludeForSource(sourcePath = '', context = '') {
    const normalizedPath = normalizeNginxPath(sourcePath || '')
    return composeDeletedSourceBlocks.value.some(item => item?.type === 'include' && isSameNginxPath(item.filePath || '', normalizedPath) && (!context || item.context === context))
  }

  function hasDeletedComposeIncludeForParent(parentNode, context = '') {
    if (!parentNode?.id) return false
    return composeDeletedSourceBlocks.value.some(item => item?.type === 'include' && item.parentNodeId === parentNode.id && (!context || item.context === context))
  }

  function hasDeletedTopLevelComposeInclude(sourcePath = '') {
    const normalizedPath = normalizeNginxPath(sourcePath || '')
    return composeDeletedSourceBlocks.value.some(item => {
      if (item?.type !== 'include' || !isSameNginxPath(item.filePath || '', normalizedPath)) return false
      const parentNode = composeNodes.value.find(node => node.id === item.parentNodeId) || null
      return !parentNode || !['server', 'location'].includes(parentNode.type)
    })
  }

  function getComposeNodeDirectiveValues(node, excludedLabels = []) {
    const values = new Map()
    const excluded = new Set((Array.isArray(excludedLabels) ? excludedLabels : []).map(label => String(label || '')))
    ;(node?.items || []).forEach(item => {
      if (item?.type !== 'field') return
      const label = String(item.label || '').trim()
      if (!label || excluded.has(label)) return
      values.set(label, item.enabled !== false ? String(item.value || '').trim() : '')
    })
    return values
  }

  function getComposeFieldValue(node, label = '') {
    const field = (node?.items || []).find(item => item.type === 'field' && item.label === label)
    return field?.enabled === false ? '' : String(field?.value || '').trim()
  }

  function appendPendingComposeDirectives(output = [], pending = new Map(), consumed = new Set(), indent = '') {
    pending.forEach((value, key) => {
      if (consumed.has(key) || !value) return
      consumed.add(key)
      renderComposeDirectiveLines(key, value, indent).forEach(item => output.push(item))
    })
  }

  function renderComposeDirectiveLines(key = '', value = '', indent = '') {
    return String(value || '')
      .split(/\r?\n/)
      .map(item => normalizeDirectiveValue(item))
      .filter(Boolean)
      .map(item => `${indent}${key} ${item};`)
  }

  function saveComposeDraft() {
    const payload = {
      version: COMPOSE_DRAFT_VERSION,
      zoom: composeZoom.value,
      nodes: composeNodes.value,
      edges: composeEdges.value,
      deletedSourceBlocks: composeDeletedSourceBlocks.value,
      suppressedEdges: composeSuppressedEdges.value,
      generatedSourceKey: composeGeneratedSourceKey.value,
      sourceSnapshot: composeDraftSnapshot.value,
      baselineGraph: composeBaselineGraph.value,
      ignoredSnapshotKey: composeIgnoredSnapshotKey.value,
      useSavedDraft: composeUseSavedDraft.value
    }
    const serializedPayload = cloneComposePlainObject(payload)
    window.localStorage?.setItem(getComposeDraftLocalStorageKey(), JSON.stringify(serializedPayload))
    persistComposeDraftItem(serializedPayload)
  }

  function restoreComposeDraft() {
    const raw = window.localStorage?.getItem(getComposeDraftLocalStorageKey()) || getMigratedLocalStorageItem(COMPOSE_DRAFT_STORAGE_KEY, OLD_COMPOSE_DRAFT_STORAGE_KEY)
    if (!raw) return
    try {
      const payload = JSON.parse(raw)
      if (!applyComposeDraftPayload(payload)) {
        window.localStorage?.removeItem(getComposeDraftLocalStorageKey())
        removeMigratedLocalStorageItem(COMPOSE_DRAFT_STORAGE_KEY, OLD_COMPOSE_DRAFT_STORAGE_KEY)
      }
    } catch {
      composeNodes.value = createDefaultComposeNodes()
      composeEdges.value = []
      composeDeletedSourceBlocks.value = []
      composeSuppressedEdges.value = []
      composeGeneratedSourceKey.value = ''
      composeDraftSnapshot.value = null
      composeBaselineGraph.value = null
      composeIgnoredSnapshotKey.value = ''
      composeUseSavedDraft.value = false
      raisedComposeNodeId.value = ''
    }
  }

  function applyComposeDraftPayload(payload = {}) {
    if (Number(payload?.version || 0) !== COMPOSE_DRAFT_VERSION) return false
    const nextSuppressedEdges = Array.isArray(payload?.suppressedEdges) ? payload.suppressedEdges : []
    composeSuppressedEdges.value = nextSuppressedEdges
    const nextNodes = Array.isArray(payload?.nodes) ? payload.nodes.map(node => {
      normalizeComposeNodeFields(node)
      return node
    }) : composeNodes.value
    const nextEdges = Array.isArray(payload?.edges) ? payload.edges : composeEdges.value
    const normalizedGraph = normalizeComposeGraphIntegrity(completeComposeGraphRealEdges({ nodes: nextNodes, edges: nextEdges }))
    if (shouldKeepCurrentComposeGraph(normalizedGraph)) return true
    if (payload?.zoom) composeZoom.value = Math.min(COMPOSE_ZOOM_MAX, Math.max(COMPOSE_ZOOM_MIN, Number(payload.zoom) || 1))
    if (Array.isArray(payload?.nodes)) composeNodes.value = nextNodes
    if (Array.isArray(payload?.edges)) composeEdges.value = nextEdges
    if (Array.isArray(payload?.deletedSourceBlocks)) composeDeletedSourceBlocks.value = payload.deletedSourceBlocks
    composeSuppressedEdges.value = nextSuppressedEdges
    composeGeneratedSourceKey.value = String(payload?.generatedSourceKey || '')
    composeDraftSnapshot.value = payload?.sourceSnapshot || null
    composeBaselineGraph.value = payload?.baselineGraph || null
    composeIgnoredSnapshotKey.value = String(payload?.ignoredSnapshotKey || '')
    composeUseSavedDraft.value = Array.isArray(payload?.nodes) && payload.nodes.length > 0
    composeNodes.value = normalizedGraph.nodes
    composeEdges.value = normalizedGraph.edges
    raisedComposeNodeId.value = ''
    return true
  }

  async function resetComposeDraft() {
    try {
      await ElMessageBox.confirm('确认复位当前配置编排？未保存的节点、连线和布局修改会被清除。', '复位配置编排', {
        type: 'warning',
        confirmButtonText: '复位编排',
        cancelButtonText: '取消'
      })
    } catch (error) {
      if (error !== 'cancel') ElMessage.error(`复位配置编排失败：${error?.message || error}`)
      return
    }
    pushComposeHistorySnapshot()
    window.localStorage?.removeItem(getComposeDraftLocalStorageKey())
    removeMigratedLocalStorageItem(COMPOSE_DRAFT_STORAGE_KEY, OLD_COMPOSE_DRAFT_STORAGE_KEY)
    deleteComposeDraftItem()
    composeGeneratedSourceKey.value = ''
    composeDraftSnapshot.value = null
    composeBaselineGraph.value = null
    composeIgnoredSnapshotKey.value = ''
    composeUseSavedDraft.value = false
    composeNodes.value = createDefaultComposeNodes()
    composeEdges.value = []
    composeDeletedSourceBlocks.value = []
    composeSuppressedEdges.value = []
    selectedComposeEdgeId.value = ''
    selectedComposePortKey.value = ''
    raisedComposeNodeId.value = ''
    composeZoom.value = 0.55
    closeComposeContextMenu()
    closeComposeFieldPicker()
    closeComposeFieldDrawer()
    if (activeMenu.value === 'compose') void rebuildComposeFromLatestConfig()
  }

  function buildNginxScanOptions() {
    return {
      nginxHome: nginxRootPath.value,
      mainConfigPath: detectedNginxConf.value,
      scanPaths: nginxScanPaths.value.split(/\r?\n/).filter(Boolean)
    }
  }

  async function refreshNginxSites(options = {}) {
    saveSystemSettings()
    const scanOptions = buildNginxScanOptions()
    await Promise.all([
      props.loadNginxSites?.(scanOptions),
      loadNginxTopology()
    ])
    if (options.notify) ElMessage.success('已按当前设置扫描 Nginx 配置')
  }

  async function ensureSslCertificateData() {
    if (!props.connected || !props.isSSHSession) return
    await loadManagedSslCertificates()
    await refreshNginxSites()
    await nextTick()
    await refreshSslCertificateStatuses()
  }

  async function refreshSslCertificateStatuses(options = {}) {
    if (!props.connected || !props.isSSHSession || !window.whSSH?.getNginxSslStatus) return
    const { notify = false } = options
    const certificates = sslCertificateTargets.value
    if (!certificates.length) {
      sslCertificateStatuses.value = []
      sslStatusError.value = ''
      if (notify) ElMessage.success('证书状态已刷新')
      return
    }
    sslStatusLoading.value = true
    sslStatusError.value = ''
    try {
      const result = await window.whSSH.getNginxSslStatus({ sessionId: props.sessionId, certificates })
      sslCertificateStatuses.value = Array.isArray(result?.certificates) ? result.certificates : []
      if (notify) ElMessage.success('证书状态已刷新')
    } catch (error) {
      sslStatusError.value = `读取证书状态失败：${error.message || error}`
    } finally {
      sslStatusLoading.value = false
    }
  }

  async function runSslAction(action = '') {
    if (action === 'certbot' && !sslDomainList.value.length) return
    await Promise.resolve(props.runNginxAction?.(action))
    await refreshSslCertificateStatuses()
  }

  function openSslCertificateDrawer() {
    resetSslAddForm()
    sslDrawerVisible.value = true
  }

  function openSslDetailDrawer(row = {}) {
    activeSslDetailRow.value = row
    sslDetailDrawerVisible.value = true
  }

  async function handleSslRowMenuCommand(row = {}, command = '') {
    if (command === 'detail') {
      openSslDetailDrawer(row)
      return
    }
    if (command === 'refresh') {
      await refreshSslCertificateStatuses()
      return
    }
    if (command === 'renew-dry-run' || command === 'renew') {
      await runSslRowAction(row, command)
      return
    }
    if (command === 'sync') {
      await syncSslCertificateToTarget(row)
      return
    }
    if (command === 'source') {
      openSslReferenceSource(row)
      return
    }
    if (command === 'remove') removeManualSslCertificate(row.recordId)
  }

  function closeSslCertificateDrawer() {
    if (sslRequestRunning.value) return
    sslDrawerVisible.value = false
  }

  function resetSslAddForm() {
    Object.assign(sslAddForm, createEmptySslAddForm())
    sslAddForm.targetDir = ''
  }

  async function submitSslCertificateDrawer() {
    if (!canSubmitSslAddForm.value || sslRequestRunning.value) return
    if (sslAddForm.mode === 'request') {
      await requestSslCertificateFromDrawer()
      return
    }
    const record = normalizeManagedSslCertificate({
      source: 'manual',
      name: sslAddForm.name,
      domains: sslAddForm.domains,
      certPath: sslAddForm.certPath,
      keyPath: sslAddForm.keyPath,
      targetDir: sslAddForm.targetDir
    })
    sslManagedCertificates.value = [record, ...sslManagedCertificates.value.filter(item => item.certPath !== record.certPath)]
    await saveManagedSslCertificates()
    sslDrawerVisible.value = false
    await refreshSslCertificateStatuses()
  }

  async function requestSslCertificateFromDrawer() {
    if (!window.whSSH?.nginxAction) return
    const domains = parseSslDomainList(sslAddForm.domains)
    if (!domains.length) return
    sslRequestRunning.value = true
    sslActionOutput.value = ''
    try {
      const result = await window.whSSH.nginxAction({
        sessionId: props.sessionId,
        action: 'certbot',
        domain: domains.join(' '),
        targetDir: normalizeNginxPath(sslAddForm.targetDir || '')
      })
      sslActionOutput.value = formatCommandResultOutput(result)
      if (result?.code) throw new Error(sslActionOutput.value || 'certbot 执行失败')
      const firstDomain = domains[0]
      const targetDir = normalizeNginxPath(sslAddForm.targetDir || '')
      const record = normalizeManagedSslCertificate({
        source: 'certbot',
        name: sslAddForm.name || firstDomain,
        domains,
        certbotDomain: firstDomain,
        targetDir,
        certPath: result?.certPath || buildSslCertPath(firstDomain, targetDir, 'fullchain.pem'),
        keyPath: result?.keyPath || buildSslCertPath(firstDomain, targetDir, 'privkey.pem')
      })
      sslManagedCertificates.value = [record, ...sslManagedCertificates.value.filter(item => item.certPath !== record.certPath)]
      await saveManagedSslCertificates()
      sslDomainModel.value = domains.join(' ')
      sslDrawerVisible.value = false
      await refreshSslCertificateStatuses()
    } catch (error) {
      sslActionOutput.value = `申请证书失败：${error.message || error}`
    } finally {
      sslRequestRunning.value = false
    }
  }

  async function runSslRowAction(row = {}, action = '') {
    if (!window.whSSH?.nginxAction || !action) return
    if (action === 'renew' && !window.confirm('确定要执行 certbot renew 吗？建议先试运行续签。')) return
    sslActionOutput.value = ''
    try {
      const result = await window.whSSH.nginxAction({
        sessionId: props.sessionId,
        action,
        domain: row.certbotDomain || row.domainText || '',
        targetDir: row.targetDir || ''
      })
      sslActionOutput.value = formatCommandResultOutput(result)
      if (action === 'renew' && row.targetDir) await syncSslCertificateToTarget(row, { silent: true })
      await refreshSslCertificateStatuses()
    } catch (error) {
      sslActionOutput.value = `证书操作失败：${error.message || error}`
    }
  }

  async function syncSslCertificateToTarget(row = {}, options = {}) {
    if (!window.whSSH?.nginxAction || !row.targetDir) return
    try {
      const result = await window.whSSH.nginxAction({
        sessionId: props.sessionId,
        action: 'sync-certificate',
        certbotDomain: row.certbotDomain || '',
        certPath: row.certPath || '',
        keyPath: row.keyPath || '',
        targetDir: row.targetDir
      })
      if (!options.silent) sslActionOutput.value = formatCommandResultOutput(result)
      await refreshSslCertificateStatuses()
    } catch (error) {
      sslActionOutput.value = `同步证书失败：${error.message || error}`
    }
  }

  async function removeManualSslCertificate(recordId = '') {
    sslManagedCertificates.value = sslManagedCertificates.value.filter(item => item.id !== recordId)
    await saveManagedSslCertificates()
  }

  function canRenewSslRow(row = {}) {
    return row.source === 'certbot' || !!row.certbotDomain || String(row.certPath || '').includes('/etc/letsencrypt/live/')
  }

  function formatCommandResultOutput(result = {}) {
    return [result.stdout, result.stderr].filter(Boolean).join('\n').trim() || '命令已执行完成'
  }

  function buildSslCertPath(domain = '', targetDir = '', fileName = '') {
    const dir = normalizeNginxPath(targetDir || (domain ? `/etc/letsencrypt/live/${domain}` : ''))
    return dir && fileName ? joinNginxPath(dir, fileName) : ''
  }

  function mergeSslCertificateTargets(items = []) {
    const seen = new Set()
    return items
      .map(item => ({ certPath: normalizeSslPath(item?.certPath || ''), keyPath: normalizeSslPath(item?.keyPath || '') }))
      .filter(item => item.certPath && item.certPath.startsWith('/'))
      .filter(item => {
        if (seen.has(item.certPath)) return false
        seen.add(item.certPath)
        return true
      })
  }

  function buildSslCertificateRows() {
    const map = new Map()
    const ensureRow = item => {
      const certPath = normalizeSslPath(item.certPath || '')
      const keyPath = normalizeSslPath(item.keyPath || '')
      const dedupeKey = certPath || keyPath || item.id
      if (!dedupeKey) return null
      if (!map.has(dedupeKey)) {
        const status = getSslReferenceStatus({ certPath, keyPath })
        map.set(dedupeKey, {
          id: `ssl:${dedupeKey}`,
          title: item.title || item.name || formatPathBasename(certPath) || '未命名证书',
          domainSet: new Set(),
          sourceSet: new Set(),
          referenceSet: new Set(),
          source: item.source || '',
          sourceText: '',
          certbotDomain: item.certbotDomain || '',
          certPath,
          keyPath,
          targetDir: item.targetDir || '',
          filePath: item.filePath || '',
          startLine: item.startLine || 0,
          recordId: item.recordId || '',
          status,
          domainText: '',
          referenceText: ''
        })
      }
      return map.get(dedupeKey)
    }

    sslServerReferences.value.forEach(item => {
      const row = ensureRow({ ...item, source: 'nginx' })
      if (!row) return
      row.sourceSet.add('Nginx 引用')
      if (item.serverName) parseSslDomainList(item.serverName).forEach(domain => row.domainSet.add(domain))
      const reference = item.filePath ? `${formatPathBasename(item.filePath)}${item.startLine ? `:${item.startLine}` : ''}` : ''
      if (reference) row.referenceSet.add(reference)
      if (!row.filePath && item.filePath) row.filePath = item.filePath
      if (!row.startLine && item.startLine) row.startLine = item.startLine
    })
    sslManagedCertificates.value.forEach(item => {
      const row = ensureRow({ ...item, title: item.name || item.domains[0], recordId: item.id })
      if (!row) return
      row.source = item.source || row.source
      row.sourceSet.add(item.source === 'certbot' ? 'Certbot 申请' : '手动添加')
      ;(item.domains || []).forEach(domain => row.domainSet.add(domain))
      if (item.targetDir) row.referenceSet.add(item.targetDir)
      if (item.certbotDomain && !row.certbotDomain) row.certbotDomain = item.certbotDomain
      if (item.targetDir && !row.targetDir) row.targetDir = item.targetDir
      if (item.id && !row.recordId) row.recordId = item.id
    })

    return [...map.values()].map(row => {
      const sanText = formatSslSan(row.status)
      row.domainText = [...row.domainSet].join(', ') || (sanText === '-' ? '' : sanText)
      row.sourceText = [...row.sourceSet].join(' / ') || '-'
      row.referenceText = [...row.referenceSet].join(' / ')
      return row
    }).sort((left, right) => String(left.status.status || '').localeCompare(String(right.status.status || '')) || String(left.title || '').localeCompare(String(right.title || '')))
  }

  function jumpSslCertificatePage() {
    const nextPage = Math.min(sslCertificatePageCount.value, Math.max(1, Number(sslCertificatePageInput.value) || 1))
    sslCertificatePage.value = nextPage
    sslCertificatePageInput.value = nextPage
  }

  function buildSslServerReferences() {
    const map = new Map()
    const add = item => {
      if (!item?.id) return
      const key = `${item.filePath || ''}:${item.startLine || ''}:${item.serverName || ''}:${item.certPath || ''}`
      map.set(key, item)
    }

    visualServers.value.filter(server => isHttpsServer(server) || server?.sslCertificate || server?.sslCertificateKey).forEach(server => {
      const filePath = normalizeNginxPath(props.selectedNginxSiteEditor?.path || props.selectedNginxSitePath || '')
      add({
        id: `visual:${filePath}:${server.id}`,
        title: buildServerTitle(server),
        serverName: String(server.serverNameText || '').trim(),
        listenText: String(server.listenText || '').trim(),
        certPath: normalizeSslPath(server.sslCertificate || ''),
        keyPath: normalizeSslPath(server.sslCertificateKey || ''),
        filePath,
        startLine: 0
      })
    })

    ;(Array.isArray(nginxTopology.value?.serverNodes) ? nginxTopology.value.serverNodes : []).filter(server => isTopologyHttpsServer(server)).forEach(server => {
      const certPath = normalizeSslPath((server.sslCertificates || [])[0] || '')
      add({
        id: `topology:${server.file}:${server.startLine}:${server.serverName}`,
        title: server.title || String(server.serverName || '').split(/\s+/)[0] || '未命名 server',
        serverName: String(server.serverName || '').trim(),
        listenText: (server.listens || []).join('\n'),
        certPath,
        keyPath: normalizeSslPath((server.sslCertificateKeys || [])[0] || ''),
        filePath: normalizeNginxPath(server.file || ''),
        startLine: server.startLine || 0
      })
    })
    return [...map.values()].sort((a, b) => String(a.filePath || '').localeCompare(String(b.filePath || '')) || String(a.title || '').localeCompare(String(b.title || '')))
  }

  function isTopologyHttpsServer(server = {}) {
    const listens = (Array.isArray(server.listens) ? server.listens : []).join('\n').toLowerCase()
    return listens.includes('443') || listens.includes('ssl') || (server.sslCertificates || []).length > 0
  }

  function normalizeSslPath(value = '') {
    const text = String(value || '').trim().replace(/^['"]|['"]$/g, '')
    return text ? normalizeNginxPath(text) : ''
  }

  function getSslReferenceStatus(item = {}) {
    if (!item.certPath) return { status: 'unknown', statusText: '未配置证书', issuer: '', san: [], keyExists: null, daysRemaining: null, expiresAt: '' }
    if (!item.certPath.startsWith('/')) return { status: 'unknown', statusText: '非绝对路径', issuer: '', san: [], keyExists: null, daysRemaining: null, expiresAt: '' }
    return sslCertificateStatusByPath.value.get(normalizeNginxPath(item.certPath)) || { status: sslStatusLoading.value ? 'loading' : 'unknown', statusText: sslStatusLoading.value ? '读取中' : '待刷新', issuer: '', san: [], keyExists: null, daysRemaining: null, expiresAt: '' }
  }

  function parseSslDomainList(value = '') {
    return String(value || '').split(/[\s,;]+/).map(item => item.trim()).filter(Boolean).filter((item, index, list) => list.indexOf(item) === index)
  }

  function formatSslExpiresAt(status = {}) {
    if (!status.expiresAt) return status.error || '-'
    const date = new Date(status.expiresAt)
    const dateText = Number.isNaN(date.getTime()) ? status.expiresAt : date.toLocaleString()
    return typeof status.daysRemaining === 'number' ? `${dateText}（剩余 ${status.daysRemaining} 天）` : dateText
  }

  function formatSslSan(status = {}) {
    return Array.isArray(status.san) && status.san.length ? status.san.join(', ') : '-'
  }

  function openSslReferenceSource(item = {}) {
    if (!item.filePath) return
    openSourceHistorySite({ path: item.filePath, name: formatPathBasename(item.filePath), label: formatPathBasename(item.filePath) })
  }

  async function loadNginxTopology() {
    if (!props.connected || !props.isSSHSession || !window.whSSH?.getNginxTopology) return
    nginxTopologyLoading.value = true
    try {
      const result = await window.whSSH.getNginxTopology({ sessionId: props.sessionId, ...buildNginxScanOptions() })
      if (result?.ok) {
        nginxTopology.value = result
        nginxTopologyError.value = ''
      } else {
        nginxTopology.value = null
        nginxTopologyError.value = String(result?.error || '未获取到真实拓扑')
        reportNginxError('topology-load:failed', { message: nginxTopologyError.value })
      }
    } catch (error) {
      nginxTopology.value = null
      nginxTopologyError.value = String(error.message || '真实拓扑读取失败')
      reportNginxError('topology-load:failed', { message: nginxTopologyError.value })
    } finally {
      nginxTopologyLoading.value = false
    }
  }

  function ensureSelectedSite() {
    if (props.selectedNginxSiteEditor?.path) {
      if (activeMenu.value === 'topology' && !nginxTopology.value && !nginxTopologyLoading.value && !nginxTopologyError.value) loadNginxTopology()
      return
    }
    const firstSite = Array.isArray(props.nginxSites) ? props.nginxSites[0] : null
    if (firstSite) {
      props.selectNginxSite(firstSite)
      return
    }
    if (!props.connected || !props.isSSHSession || selectingSitePending) return
    selectingSitePending = true
    Promise.resolve(refreshNginxSites()).finally(() => {
      selectingSitePending = false
    })
  }

  function selectWorkingSite(site) {
    if (!site) return
    sourcePathInput.value = String(site.path || '')
    props.selectNginxSite(site)
  }

  function openSourceHistoryDrawer() {
    sourceHistoryDrawerVisible.value = true
  }

  async function openSourceHistorySite(site) {
    if (!site?.path) return
    sourcePathInput.value = String(site.path || '')
    await Promise.resolve(props.selectNginxSite?.(site, { forceReload: true }))
    activeMenu.value = 'source'
    sourceHistoryDrawerVisible.value = false
  }

  async function openSourceDirectoryFromInput() {
    const rawPath = String(sourceTreeRootPath.value || '').trim()
    if (!rawPath || !props.connected || !props.isSSHSession) return
    sourceTreeRootPath.value = normalizeNginxPath(rawPath.startsWith('/') ? rawPath : joinNginxPath('/', rawPath))
    await refreshSourceTree()
  }

  async function ensureSourceTree() {
    if (sourceTreeNodes.value.length || sourceTreeLoading.value || !props.connected || !props.isSSHSession) return
    await refreshSourceTree()
  }

  async function refreshSourceTree(options = {}) {
    if (!props.connected || !props.isSSHSession) return
    const { notify = false } = options
    sourceTreeLoading.value = true
    sourceTreeError.value = ''
    try {
      const rootPath = normalizeNginxPath(sourceTreeRootPath.value || nginxRootPath.value || '/')
      sourceTreeRootPath.value = rootPath
      const rootNode = createSourceTreeDirectoryNode(rootPath, {
        label: formatSourceTreePathLabel(rootPath),
        sourceKind: 'source-root',
        expanded: true
      })
      sourceTreeNodes.value = [rootNode]
      await loadSourceTreeDirectory(rootNode)
      if (notify) ElMessage.success('配置树已刷新')
    } catch (error) {
      sourceTreeError.value = error?.message || '配置树初始化失败'
      sourceTreeNodes.value = []
    } finally {
      sourceTreeLoading.value = false
    }
  }

  function createSourceTreeFileNode(filePath = '', options = {}) {
    const path = normalizeNginxPath(filePath)
    return {
      id: `source-file:${path}`,
      type: 'file',
      sourceKind: options.sourceKind || '',
      sourcePattern: options.sourcePattern || '',
      sourcePatterns: normalizeSourceTreePatterns(options.sourcePatterns || options.sourcePattern),
      name: options.label || formatPathBasename(path),
      path,
      expanded: options.expanded === true,
      loading: options.loading === true,
      loaded: options.loaded === true,
      error: options.error || '',
      children: Array.isArray(options.children) ? options.children : [],
      depth: 0
    }
  }

  function createSourceTreeDirectoryNode(dirPath = '', options = {}) {
    const path = normalizeNginxPath(dirPath)
    return {
      id: `source-dir:${path}`,
      type: 'directory',
      sourceKind: options.sourceKind || '',
      sourcePattern: options.sourcePattern || '',
      sourcePatterns: normalizeSourceTreePatterns(options.sourcePatterns || options.sourcePattern),
      name: options.label || formatPathBasename(path) || path,
      path,
      expanded: options.expanded === true,
      loading: options.loading === true,
      loaded: !!options.loaded,
      error: '',
      children: Array.isArray(options.children) ? options.children : []
    }
  }

  function dedupeSourceTreeNodes(nodes = []) {
    const map = new Map()
    ;(Array.isArray(nodes) ? nodes : []).filter(Boolean).forEach(node => {
      const key = `${node.type}:${normalizeNginxPath(node.path || '')}`
      if (!map.has(key)) {
        map.set(key, node)
        return
      }
      const existing = map.get(key)
      if (node.type === 'directory') {
        existing.children = dedupeSourceTreeNodes([...(existing.children || []), ...(node.children || [])]).sort(compareSourceTreeNodes)
        existing.loaded = existing.loaded || node.loaded
        existing.sourcePattern = existing.sourcePattern || node.sourcePattern || ''
        existing.sourcePatterns = normalizeSourceTreePatterns([...(existing.sourcePatterns || []), ...(node.sourcePatterns || []), existing.sourcePattern, node.sourcePattern])
      }
    })
    return Array.from(map.values())
  }

  function normalizeSourceTreePatterns(value = []) {
    const list = Array.isArray(value) ? value : [value]
    return list
      .map(item => normalizeNginxPath(item || ''))
      .filter(Boolean)
      .filter((item, index, source) => source.indexOf(item) === index)
  }

  function formatSourceTreePathLabel(path = '') {
    const normalizedPath = normalizeNginxPath(path)
    if (!normalizedPath || normalizedPath === '/') return normalizedPath || '/'
    return normalizedPath
  }

  function getNginxPathDirname(filePath = '') {
    const path = normalizeNginxPath(filePath)
    if (!path || path === '/') return '/'
    const parts = path.split('/').filter(Boolean)
    if (parts.length <= 1) return '/'
    return `/${parts.slice(0, -1).join('/')}`
  }

  function flattenSourceTreeRows(nodes = [], depth = 0) {
    const rows = []
    ;(Array.isArray(nodes) ? nodes : []).forEach(node => {
      rows.push({ ...node, depth })
      if (isSourceTreeExpandable(node) && node.expanded) rows.push(...flattenSourceTreeRows(node.children || [], depth + 1))
    })
    return rows
  }

  function isSourceTreeExpandable(node = {}) {
    return node?.type === 'directory' || (Array.isArray(node?.children) && node.children.length > 0)
  }

  async function handleSourceTreeRowClick(row) {
    if (!row) return
    closeSourceTreeContextMenu()
    if (row.type === 'directory') {
      await toggleSourceTreeDirectory(row.path)
      return
    }
    if (row.type === 'file') {
      await openSourceFilePath(row.path)
      if (isSourceTreeExpandable(row)) {
        const node = findSourceTreeNodeByPath(row.path, sourceTreeNodes.value)
        if (node) node.expanded = !node.expanded
      }
    }
  }

  function openSourceTreePanelMenu(event) {
    if (!props.connected || !props.isSSHSession) return
    openSourceTreeContextMenu(event, null)
  }

  function openSourceTreeRowMenu(event, row) {
    if (!props.connected || !props.isSSHSession || row?.disabled) return
    openSourceTreeContextMenu(event, row || null)
  }

  function openSourceTreeContextMenu(event, node = null) {
    const point = getSafeSourceTreeContextMenuPoint(event?.clientX || 0, event?.clientY || 0, node)
    sourceTreeContextMenu.visible = true
    sourceTreeContextMenu.x = point.x
    sourceTreeContextMenu.y = point.y
    sourceTreeContextMenu.node = node
  }

  function closeSourceTreeContextMenu() {
    sourceTreeContextMenu.visible = false
    sourceTreeContextMenu.node = null
  }

  function buildSourceTreeContextMenuStyle() {
    return { left: `${sourceTreeContextMenu.x}px`, top: `${sourceTreeContextMenu.y}px` }
  }

  function getSafeSourceTreeContextMenuPoint(x = 0, y = 0, node = null) {
    const width = 180
    const height = node ? (!['main-file', 'source-root'].includes(node.sourceKind) ? 210 : 132) : 92
    const margin = 8
    return {
      x: Math.max(margin, Math.min(Number(x || 0), window.innerWidth - width - margin)),
      y: Math.max(margin, Math.min(Number(y || 0), window.innerHeight - height - margin))
    }
  }

  async function copySourceTreeNodePathFromMenu() {
    const path = normalizeNginxPath(sourceTreeContextMenu.node?.path || '')
    closeSourceTreeContextMenu()
    if (!path) return
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(path)
      else copyTextWithFallback(path)
      ElMessage.success(`已复制路径：${path}`)
    } catch (error) {
      try {
        copyTextWithFallback(path)
        ElMessage.success(`已复制路径：${path}`)
      } catch {
        ElMessage.error('复制路径失败')
      }
    }
  }

  function copyTextWithFallback(text = '') {
    const textarea = document.createElement('textarea')
    textarea.value = String(text || '')
    textarea.setAttribute('readonly', 'readonly')
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    const copied = document.execCommand('copy')
    document.body.removeChild(textarea)
    if (!copied) throw new Error('copy failed')
  }

  function getSourceTreeActionBaseDir(node = sourceTreeContextMenu.node) {
    if (node?.type === 'directory') return normalizeNginxPath(node.path || '')
    if (node?.path) return getNginxPathDirname(node.path)
    return normalizeNginxPath(sourceTreeRootPath.value || '/')
  }

  function resolveSourceTreeInputPath(value = '', baseDir = '') {
    const input = String(value || '').trim()
    if (!input) return ''
    const path = input.startsWith('/') ? input : joinNginxPath(baseDir || nginxRootPath.value, input)
    return normalizeNginxPath(path)
  }

  async function promptSourceTreePath(title = '', message = '', inputValue = '', baseDir = '', placeholder = '') {
    sourceTreePathDialog.title = title
    sourceTreePathDialog.message = message
    sourceTreePathDialog.placeholder = placeholder || (baseDir ? `${baseDir}/example.conf 或相对路径` : '/etc/nginx/example.conf')
    sourceTreePathDialog.value = inputValue || ''
    sourceTreePathDialog.baseDir = baseDir || ''
    sourceTreePathDialog.visible = true
    return new Promise(resolve => {
      sourceTreePathDialog.resolver = resolve
    })
  }

  function submitSourceTreePathDialog() {
    if (!canSubmitSourceTreePathDialog.value) return
    finishSourceTreePathDialog(sourceTreePathDialogTargetPath.value)
  }

  function cancelSourceTreePathDialog() {
    finishSourceTreePathDialog('')
  }

  function finishSourceTreePathDialog(value = '') {
    const resolver = sourceTreePathDialog.resolver
    sourceTreePathDialog.resolver = null
    sourceTreePathDialog.visible = false
    if (resolver) resolver(value)
  }

  async function createSourceTreeFileFromMenu() {
    const node = sourceTreeContextMenu.node
    const baseDir = getSourceTreeActionBaseDir(node)
    closeSourceTreeContextMenu()
    try {
      const targetPath = await promptSourceTreePath('新建配置文件', '请输入新文件路径，支持绝对路径或相对当前目录路径。', '', baseDir, '请输入文件名称，或带有路径的文件名称')
      if (!targetPath) return
      await assertSourceTreePathNotExists(targetPath)
      await window.whSSH.writeTextFile({ sessionId: props.sessionId, path: targetPath, content: '', encoding: 'utf8' })
      ElMessage.success(`已新建文件：${targetPath}`)
      await refreshSourceTreeAfterMutation(targetPath)
      await openSourceFilePath(targetPath)
    } catch (error) {
      if (error === 'cancel' || error?.action === 'cancel') return
      ElMessage.error(error?.message || '新建文件失败')
    }
  }

  async function createSourceTreeDirectoryFromMenu() {
    const node = sourceTreeContextMenu.node
    const baseDir = getSourceTreeActionBaseDir(node)
    closeSourceTreeContextMenu()
    try {
      const targetPath = await promptSourceTreePath('新建文件夹', '请输入新文件夹路径，支持绝对路径或相对当前目录路径。', '', baseDir, '请输入文件夹名称，或带有路径的文件夹名称')
      if (!targetPath) return
      await window.whSSH.makeDir({ sessionId: props.sessionId, path: targetPath })
      ElMessage.success(`已新建文件夹：${targetPath}`)
      await refreshSourceTreeAfterMutation(targetPath)
    } catch (error) {
      if (error === 'cancel' || error?.action === 'cancel') return
      ElMessage.error(error?.message || '新建文件夹失败')
    }
  }

  async function renameSourceTreeNodeFromMenu() {
    const node = sourceTreeContextMenu.node
    if (!node?.path || ['main-file', 'source-root'].includes(node.sourceKind)) return
    const oldPath = normalizeNginxPath(node.path)
    const baseDir = getNginxPathDirname(oldPath)
    closeSourceTreeContextMenu()
    try {
      const newPath = await promptSourceTreePath('重命名', '请输入新的路径或名称。', oldPath, baseDir)
      if (!newPath || isSameNginxPath(newPath, oldPath)) return
      await assertSourceTreePathNotExists(newPath)
      await window.whSSH.renameFile({ sessionId: props.sessionId, oldPath, newPath })
      ElMessage.success(`已重命名为：${newPath}`)
      await refreshSourceTreeAfterRename(oldPath, newPath, node.type)
    } catch (error) {
      if (error === 'cancel' || error?.action === 'cancel') return
      ElMessage.error(error?.message || '重命名失败')
    }
  }

  async function deleteSourceTreeNodeFromMenu() {
    const node = sourceTreeContextMenu.node
    if (!node?.path || ['main-file', 'source-root'].includes(node.sourceKind)) return
    const targetPath = normalizeNginxPath(node.path)
    closeSourceTreeContextMenu()
    try {
      await ElMessageBox.confirm(`确定删除${node.type === 'directory' ? '文件夹' : '文件'}：${targetPath}？`, '删除配置文件项', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      })
      await window.whSSH.deleteFile({ sessionId: props.sessionId, path: targetPath, type: node.type === 'directory' ? 'd' : '-' })
      ElMessage.success(`已删除：${targetPath}`)
      await refreshSourceTreeAfterDelete(targetPath, node.type)
    } catch (error) {
      if (error === 'cancel' || error?.action === 'cancel') return
      ElMessage.error(error?.message || '删除失败')
    }
  }

  async function assertSourceTreePathNotExists(targetPath = '') {
    const parentPath = getNginxPathDirname(targetPath)
    const name = formatPathBasename(targetPath)
    const list = await window.whSSH.listFiles({ sessionId: props.sessionId, path: parentPath })
    const exists = (Array.isArray(list) ? list : []).some(item => String(item?.name || '').trim() === name || isSameNginxPath(item?.path || '', targetPath))
    if (exists) throw new Error(`路径已存在：${targetPath}`)
  }

  async function refreshSourceTreeAfterMutation(targetPath = '') {
    const parentPath = getNginxPathDirname(targetPath)
    await refreshSourceTreeDirectory(parentPath)
  }

  async function refreshSourceTreeAfterRename(oldPath = '', newPath = '', type = 'file') {
    const oldParent = getNginxPathDirname(oldPath)
    const newParent = getNginxPathDirname(newPath)
    if (isSameNginxPath(oldParent, newParent)) await refreshSourceTreeDirectory(oldParent)
    else await refreshSourceTree()
    if (type !== 'directory' && isSameNginxPath(props.selectedNginxSiteEditor?.path || '', oldPath)) await openSourceFilePath(newPath)
  }

  async function refreshSourceTreeAfterDelete(targetPath = '', type = 'file') {
    await refreshSourceTreeDirectory(getNginxPathDirname(targetPath))
    const selectedPath = normalizeNginxPath(props.selectedNginxSiteEditor?.path || '')
    if (isSameNginxPath(selectedPath, targetPath) || (type === 'directory' && isPathUnderDir(selectedPath, targetPath))) {
      const nextFile = findFirstSourceTreeFile(sourceTreeNodes.value, targetPath)
      if (nextFile?.path) await openSourceFilePath(nextFile.path)
    }
  }

  async function refreshSourceTreeDirectory(dirPath = '') {
    const node = findSourceTreeNodeByPath(dirPath, sourceTreeNodes.value)
    if (!node || node.type !== 'directory') {
      await refreshSourceTree()
      return
    }
    node.loaded = false
    node.children = []
    if (node.expanded) await loadSourceTreeDirectory(node)
  }

  async function toggleSourceTreeDirectory(dirPath = '') {
    const node = findSourceTreeNodeByPath(dirPath, sourceTreeNodes.value)
    if (!node || node.type !== 'directory') return
    if (node.expanded) {
      node.expanded = false
      return
    }
    node.expanded = true
    if (!node.loaded) await loadSourceTreeDirectory(node)
  }

  async function loadSourceTreeDirectory(node) {
    if (!node?.path || node.loading || !props.connected || !props.isSSHSession) return
    node.loading = true
    node.error = ''
    try {
      const list = await window.whSSH.listFiles({ sessionId: props.sessionId, path: node.path })
      node.children = (Array.isArray(list) ? list : [])
        .map(item => normalizeSourceTreeRemoteItem(item, node.path, node))
        .filter(Boolean)
        .sort(compareSourceTreeNodes)
      node.loaded = true
    } catch (error) {
      node.error = error?.message || '目录读取失败'
      node.children = [createSourceTreeErrorNode(node.path, node.error)]
      node.loaded = true
    } finally {
      node.loading = false
    }
  }

  function normalizeSourceTreeRemoteItem(item = {}, ownerPath = '', ownerNode = {}) {
    const rawName = String(item.name || '').trim()
    if (!rawName || rawName === '.' || rawName === '..') return null
    const path = normalizeNginxPath(item.path || joinNginxPath(ownerPath, rawName))
    const type = isRemoteDirectoryItem(item) ? 'directory' : 'file'
    return type === 'directory' ? createSourceTreeDirectoryNode(path) : createSourceTreeFileNode(path)
  }

  function createSourceTreeErrorNode(ownerPath = '', message = '') {
    return {
      id: `source-error:${ownerPath}`,
      type: 'file',
      name: message || '目录读取失败',
      path: ownerPath,
      disabled: true
    }
  }

  function isRemoteDirectoryItem(item = {}) {
    return item.type === 'd' || item.type === 'directory' || item.isDirectory === true
  }

  function compareSourceTreeNodes(left, right) {
    if (left.sourceKind === 'main-file' && right.sourceKind !== 'main-file') return -1
    if (right.sourceKind === 'main-file' && left.sourceKind !== 'main-file') return 1
    if (left.type !== right.type) return left.type === 'directory' ? -1 : 1
    return String(left.name || '').localeCompare(String(right.name || ''))
  }

  function findSourceTreeNodeByPath(path = '', nodes = []) {
    const normalizedPath = normalizeNginxPath(path)
    for (const node of Array.isArray(nodes) ? nodes : []) {
      if (isSameNginxPath(node.path, normalizedPath)) return node
      const child = findSourceTreeNodeByPath(normalizedPath, node.children || [])
      if (child) return child
    }
    return null
  }

  function findFirstSourceTreeFile(nodes = [], ignoredPath = '') {
    const normalizedIgnoredPath = normalizeNginxPath(ignoredPath)
    for (const node of Array.isArray(nodes) ? nodes : []) {
      if (!node || node.disabled) continue
      if (node.type === 'file' && node.path && !isSameNginxPath(node.path, normalizedIgnoredPath) && !isPathUnderDir(node.path, normalizedIgnoredPath)) return node
      const child = findFirstSourceTreeFile(node.children || [], normalizedIgnoredPath)
      if (child) return child
    }
    return null
  }

  async function openSourceFilePath(path = '') {
    const normalizedPath = normalizeNginxPath(path)
    if (!normalizedPath || !props.connected || !props.isSSHSession) return
    if (isSameNginxPath(normalizedPath, props.selectedNginxSiteEditor?.path || '')) return
    await flushPendingSourceAutoSave()
    if (isSourceDirty.value) {
      try {
        await ElMessageBox.confirm('当前源码尚未保存，切换文件会丢失未保存修改。继续切换吗？', '切换配置文件', {
          confirmButtonText: '继续切换',
          cancelButtonText: '取消',
          type: 'warning'
        })
      } catch {
        return
      }
    }
    const existingSite = siteMenuItems.value.find(site => isSameNginxPath(site.path, normalizedPath))
    const site = existingSite || {
      path: normalizedPath,
      name: formatPathBasename(normalizedPath),
      label: formatPathBasename(normalizedPath),
      size: 0,
      modified: ''
    }
    sourcePathInput.value = normalizedPath
    await Promise.resolve(props.selectNginxSite?.(site, { forceReload: true }))
  }

  function openTopologySite(site) {
    if (!site?.path) return
    props.selectNginxSite(site)
    activeMenu.value = 'source'
  }

  function buildTrafficTopologyGraph() {
    const graph = { nodes: [], edges: [] }
    const nodeMap = new Map()
    const edgeIds = new Set()
    const upstreamMap = new Map((nginxTopology.value?.upstreamNodes || []).map(item => [item.name, item]))
    const servers = Array.isArray(nginxTopology.value?.serverNodes) ? nginxTopology.value.serverNodes : []
    let rowIndex = 0

    function addNode(node) {
      if (!nodeMap.has(node.id)) {
        nodeMap.set(node.id, node)
        graph.nodes.push(node)
      }
      return nodeMap.get(node.id)
    }

    function addEdge(from, to, kind = 'traffic') {
      if (!from || !to || from === to) return
      const id = `${from}->${to}`
      if (edgeIds.has(id)) return
      edgeIds.add(id)
      graph.edges.push({ id, from, to, kind })
    }

    servers.forEach((server, serverIndex) => {
      const locations = Array.isArray(server.locations) && server.locations.length ? server.locations : [{ id: 'default', matcher: '/', title: '/', proxyPass: server.proxyPass, root: server.root }]
      const domains = normalizeTrafficDomains(server.serverName)
      const listens = normalizeTrafficListens(server.listens)
      locations.forEach((location, locationIndex) => {
        const y = 64 + rowIndex * 116
        rowIndex += 1
        const domainId = `domain:${makeTopologyIdPart(domains[0] || 'default')}`
        const listenId = `listen:${makeTopologyIdPart(listens[0] || 'default')}`
        const serverId = `traffic-server:${makeTopologyIdPart(server.file || 'unknown')}:${server.startLine || serverIndex}`
        const locationId = `traffic-location:${makeTopologyIdPart(server.file || 'unknown')}:${server.startLine || serverIndex}:${location.startLine || locationIndex}`
        const target = buildTrafficTarget(location, server, upstreamMap)
        const targetId = target ? `traffic-target:${makeTopologyIdPart(target.kind)}:${makeTopologyIdPart(target.value)}` : `traffic-target:empty:${serverIndex}:${locationIndex}`

        addNode({ id: domainId, type: 'domain', badge: '域名', title: domains[0] || '未设置域名', subtitle: server.serverName || '-', defaultX: 42, defaultY: y, server })
        addNode({ id: listenId, type: 'listen', badge: '监听', title: listens[0] || 'listen 未设置', subtitle: (server.listens || []).join(' · '), defaultX: 300, defaultY: y, server })
        addNode({ id: serverId, type: 'server', badge: 'server', title: server.title || `server ${serverIndex + 1}`, subtitle: `${formatPathBasename(server.file || '')}:${server.startLine || '-'}`, server, defaultX: 558, defaultY: y })
        addNode({ id: locationId, type: 'location', badge: 'location', title: location.matcher || '/', subtitle: describeTrafficLocation(location), server, location, defaultX: 816, defaultY: y })
        addNode({ id: targetId, type: target?.type || 'target', badge: target?.badge || '目标', title: target?.title || '未设置转发目标', subtitle: target?.value || 'location 未发现 proxy_pass/root/alias', target, upstream: target?.upstream, defaultX: 1074, defaultY: y })

        addEdge(domainId, listenId, 'traffic')
        addEdge(listenId, serverId, 'traffic')
        addEdge(serverId, locationId, 'traffic')
        addEdge(locationId, targetId, target?.kind || 'traffic')

        ;(server.sslCertificates || []).slice(0, 1).forEach((cert, certIndex) => {
          const sslId = `ssl:${makeTopologyIdPart(cert)}`
          addNode({ id: sslId, type: 'ssl', badge: 'SSL', title: formatPathBasename(cert), subtitle: cert, server, defaultX: 816, defaultY: y + 58 + certIndex * 86 })
          addEdge(serverId, sslId, 'ssl')
        })
      })
    })

    topologyCustomNodes.value.forEach(node => {
      if (!nodeMap.has(node.id)) graph.nodes.push(node)
    })
    topologyCustomEdges.value.forEach(edge => {
      if (!edgeIds.has(edge.id)) graph.edges.push({ ...edge, kind: 'custom' })
    })
    return graph
  }

  function normalizeTrafficDomains(value = '') {
    const domains = String(value || '').split(/\s+/).map(item => item.trim()).filter(item => item && item !== '_')
    return domains.length ? domains : ['未设置域名']
  }

  function normalizeTrafficListens(listens = []) {
    const list = (Array.isArray(listens) ? listens : []).map(item => String(item || '').trim()).filter(Boolean)
    return list.length ? list : ['listen 未设置']
  }

  function buildTrafficTarget(location = {}, server = {}, upstreamMap = new Map()) {
    const proxyPass = location.proxyPass || server.proxyPass || ''
    const root = location.alias || location.root || server.root || ''
    if (proxyPass) {
      const upstreamName = extractNginxUpstreamName(proxyPass)
      const upstream = upstreamName ? upstreamMap.get(upstreamName) : null
      return {
        kind: upstream ? 'upstream' : 'proxy',
        type: upstream ? 'upstream' : 'backend',
        badge: upstream ? 'upstream' : '反代',
        title: upstream ? upstream.name : proxyPass,
        value: proxyPass,
        upstream
      }
    }
    if (root) return { kind: 'root', type: 'root', badge: location.alias ? 'alias' : 'root', title: formatPathBasename(root) || root, value: root }
    if (location.returns?.length) return { kind: 'return', type: 'return', badge: 'return', title: location.returns[0], value: location.returns.join(' | ') }
    if (location.tryFiles) return { kind: 'try-files', type: 'route', badge: 'try_files', title: location.tryFiles, value: location.tryFiles }
    return null
  }

  function extractNginxUpstreamName(proxyPass = '') {
    const match = String(proxyPass || '').match(/^https?:\/\/([^/:$]+)(?::\d+)?(?:\/.*)?$/i)
    return match?.[1] || ''
  }

  function describeTrafficLocation(location = {}) {
    if (location.proxyPass) return `proxy_pass ${location.proxyPass}`
    if (location.alias) return `alias ${location.alias}`
    if (location.root) return `root ${location.root}`
    if (location.tryFiles) return `try_files ${location.tryFiles}`
    if (location.returns?.length) return `return ${location.returns[0]}`
    return '未识别到转发或静态资源目标'
  }

  function makeTopologyIdPart(value = '') {
    return encodeURIComponent(String(value || '').trim() || 'empty')
  }

  function buildTopologyGraphNodes() {
    if (topologyMode.value === 'traffic' && hasRealTopology.value) return applyTopologyNodeVisibility(topologyTrafficGraph.value.nodes)
    const nodes = []
    const mainSite = mainConfigSite.value
    nodes.push({
      id: 'main',
      type: 'main',
      badge: '主配置',
      title: mainSite?.name || 'nginx.conf',
      subtitle: mainSite?.path || detectedNginxConf.value,
      site: mainSite,
      defaultX: 42,
      defaultY: Math.max(72, Math.round(topologyGroups.value.length * 82))
    })

    const seenFiles = new Set()
    topologyGroups.value.forEach((group, groupIndex) => {
      const groupY = 64 + groupIndex * 168
      const groupNodeId = `group:${group.key}`
      nodes.push({
        id: groupNodeId,
        type: 'include',
        badge: 'include',
        title: group.label,
        subtitle: `${group.include} · ${group.files.length} 个配置文件`,
        group,
        defaultX: 340,
        defaultY: groupY
      })

      if (!group.files.length) {
        nodes.push({
          id: `empty:${group.key}`,
          type: 'empty',
          badge: '空分支',
          title: '暂无配置文件',
          subtitle: group.include,
          empty: true,
          defaultX: 700,
          defaultY: groupY
        })
        return
      }

      group.files.forEach((site, fileIndex) => {
        const nodeId = `file:${normalizeNginxPath(site.path)}`
        if (seenFiles.has(nodeId)) return
        seenFiles.add(nodeId)
        nodes.push({
          id: nodeId,
          type: 'file',
          badge: '配置文件',
          title: site.label || site.name || formatPathBasename(site.path),
          subtitle: `${site.serverCount ? `${site.serverCount} 个 server · ` : ''}${site.path}`,
          site,
          servers: site.servers || [],
          defaultX: 700 + Math.floor(fileIndex / 4) * 280,
          defaultY: groupY + (fileIndex % 4) * 126
        })
      })
    })
    topologyCustomNodes.value.forEach(node => {
      if (!nodes.some(item => item.id === node.id)) nodes.push(node)
    })
    return applyTopologyNodeVisibility(nodes)
  }

  function buildTopologyGraphEdges() {
    if (topologyMode.value === 'traffic' && hasRealTopology.value) return applyTopologyEdgeVisibility(topologyTrafficGraph.value.edges)
    const nodeIds = new Set(topologyGraphNodes.value.map(node => node.id))
    const edges = []
    topologyGroups.value.forEach(group => {
      const groupNodeId = `group:${group.key}`
      if (nodeIds.has(groupNodeId)) edges.push({ id: `main->${groupNodeId}`, from: 'main', to: groupNodeId, kind: 'include' })
      if (!group.files.length) {
        const emptyNodeId = `empty:${group.key}`
        if (nodeIds.has(emptyNodeId)) edges.push({ id: `${groupNodeId}->${emptyNodeId}`, from: groupNodeId, to: emptyNodeId, kind: 'missing' })
        return
      }
      group.files.forEach(site => {
        const fileNodeId = `file:${normalizeNginxPath(site.path)}`
        if (nodeIds.has(fileNodeId)) edges.push({ id: `${groupNodeId}->${fileNodeId}`, from: groupNodeId, to: fileNodeId, kind: 'file' })
      })
    })
    topologyCustomEdges.value.forEach(edge => {
      if (nodeIds.has(edge.from) && nodeIds.has(edge.to)) edges.push({ ...edge, kind: 'custom' })
    })
    return applyTopologyEdgeVisibility(edges)
  }

  function applyTopologyNodeVisibility(nodes = []) {
    const hiddenNodes = new Set(topologySuppressedNodeIds.value)
    return hiddenNodes.size ? nodes.filter(node => !hiddenNodes.has(node.id)) : nodes
  }

  function applyTopologyEdgeVisibility(edges = []) {
    const nodeIds = new Set(topologyGraphNodes.value.map(node => node.id))
    const hidden = new Set(topologySuppressedEdgeIds.value)
    if (topologyConnectionDraft.value?.rewireEdgeId) hidden.add(topologyConnectionDraft.value.rewireEdgeId)
    return edges.filter(edge => nodeIds.has(edge.from) && nodeIds.has(edge.to) && !hidden.has(edge.id))
  }

  function getTopologyNodePosition(node) {
    if (!topologyNodePositions[node.id]) {
      topologyNodePositions[node.id] = { x: node.defaultX || 0, y: node.defaultY || 0 }
    }
    return topologyNodePositions[node.id]
  }

  function buildTopologyNodeStyle(node) {
    const position = getTopologyNodePosition(node)
    return {
      width: `${TOPOLOGY_NODE_WIDTH}px`,
      height: `${getTopologyNodeHeight(node)}px`,
      transform: `translate(${position.x}px, ${position.y}px)`
    }
  }

  function getTopologyNodeHeight(node) {
    return TOPOLOGY_NODE_HEADER_HEIGHT + buildTopologyNodePortRows(node).length * TOPOLOGY_PORT_ROW_HEIGHT + TOPOLOGY_NODE_FOOTER_GAP
  }

  function buildTopologyNodePortRows(node) {
    if (!node?.id) return []
    const rows = []
    const incoming = topologyGraphEdges.value.filter(edge => edge.to === node.id)
    const outgoing = topologyGraphEdges.value.filter(edge => edge.from === node.id)

    incoming.forEach(edge => rows.push(createTopologyPortRow(node, edge, 'in')))
    outgoing.forEach(edge => rows.push(createTopologyPortRow(node, edge, 'out')))
    if (!incoming.length && node.type !== 'main') rows.push(createTopologyPortRow(node, null, 'in'))
    if (!outgoing.length) rows.push(createTopologyPortRow(node, null, 'out'))
    return rows
  }

  function createTopologyPortRow(node, edge, side = 'out') {
    const otherNodeId = side === 'in' ? edge?.from : edge?.to
    const otherNode = otherNodeId ? getTopologyNodeById(otherNodeId) : null
    const emptyLabel = side === 'in' ? '等待上游' : '新连接'
    const emptyHint = side === 'in' ? '可拖动到右侧端点接入' : '拖动到左侧端点连接'
    return {
      key: `${side}:${edge?.id || 'new'}`,
      side,
      edgeId: edge?.id || '',
      connected: !!edge,
      color: edge ? getTopologyEdgeColor(edge) : '',
      label: edge ? (otherNode?.title || otherNodeId || '未命名节点') : emptyLabel,
      hint: edge ? getTopologyEdgeKindLabel(edge.kind) : emptyHint
    }
  }

  function buildTopologyPortRowStyle(port) {
    return port?.color ? { '--nginx-topology-edge-color': port.color } : {}
  }

  function getTopologyEdgeKindLabel(kind = '') {
    const labels = {
      include: 'include',
      file: '配置文件',
      missing: '缺失分支',
      traffic: '流量链路',
      proxy: 'proxy_pass',
      upstream: 'upstream',
      root: 'root',
      ssl: 'SSL',
      return: 'return',
      'try-files': 'try_files',
      custom: '手动连接'
    }
    return labels[kind] || kind || '连接'
  }

  function buildTopologyGraphSpaceStyle() {
    return {
      width: `${topologyCanvasSize.value.width * topologyZoom.value}px`,
      height: `${topologyCanvasSize.value.height * topologyZoom.value}px`
    }
  }

  function buildTopologyGraphSurfaceStyle() {
    return {
      width: `${topologyCanvasSize.value.width}px`,
      height: `${topologyCanvasSize.value.height}px`,
      transform: `scale(${topologyZoom.value})`
    }
  }

  function getTopologyNodeById(nodeId = '') {
    return topologyGraphNodes.value.find(node => node.id === nodeId) || null
  }

  function getTopologyPortPoint(node, portOrSide = 'out', edge = null) {
    const livePoint = getTopologyLivePortPoint(node, portOrSide)
    if (livePoint) return livePoint
    const position = getTopologyNodePosition(node)
    const portCenterOffset = TOPOLOGY_PORT_INSET + TOPOLOGY_PORT_RADIUS
    const port = normalizeTopologyPortInput(portOrSide)
    const portKey = port.edgeId ? `${port.side}:${port.edgeId}` : edge?.id ? `${port.side}:${edge.id}` : port.key
    const rows = buildTopologyNodePortRows(node)
    let rowIndex = rows.findIndex(row => row.key === portKey)
    if (rowIndex < 0) rowIndex = Math.max(0, rows.findIndex(row => row.side === port.side))
    return {
      x: position.x + (port.side === 'out' ? TOPOLOGY_NODE_WIDTH - portCenterOffset : portCenterOffset),
      y: position.y + TOPOLOGY_NODE_HEADER_HEIGHT + rowIndex * TOPOLOGY_PORT_ROW_HEIGHT + TOPOLOGY_PORT_ROW_HEIGHT / 2
    }
  }

  function getTopologyLivePortPoint(node, portOrSide = 'out') {
    const surface = topologyGraphSurfaceRef.value
    if (!surface || typeof surface.querySelector !== 'function') return null
    const portKey = getTopologyPortSelectionKey(node, portOrSide)
    if (!portKey) return null
    const portElement = surface.querySelector(`[data-topology-port-key="${escapeTopologyPortSelector(portKey)}"]`)
    if (!portElement?.getBoundingClientRect) return null
    const surfaceRect = surface.getBoundingClientRect()
    const portRect = portElement.getBoundingClientRect()
    const zoom = Number(topologyZoom.value || 1) || 1
    const side = normalizeTopologyPortInput(portOrSide).side
    return {
      x: side === 'out'
        ? (portRect.right - surfaceRect.left) / zoom
        : (portRect.left - surfaceRect.left) / zoom,
      y: ((portRect.top + (portRect.height / 2)) - surfaceRect.top) / zoom
    }
  }

  function escapeTopologyPortSelector(value = '') {
    return String(value || '')
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
  }

  function normalizeTopologyPortInput(portOrSide = 'out') {
    if (portOrSide && typeof portOrSide === 'object') {
      const side = portOrSide.side === 'in' ? 'in' : 'out'
      return { ...portOrSide, side, key: portOrSide.key || `${side}:${portOrSide.edgeId || 'new'}` }
    }
    const side = portOrSide === 'in' ? 'in' : 'out'
    return { side, key: `${side}:new`, edgeId: '' }
  }

  function buildTopologyEdgePath(edge) {
    const fromNode = getTopologyNodeById(edge.from)
    const toNode = getTopologyNodeById(edge.to)
    if (!fromNode || !toNode) return ''
    return buildBezierPath(getTopologyPortPoint(fromNode, { side: 'out', edgeId: edge.id }, edge), getTopologyPortPoint(toNode, { side: 'in', edgeId: edge.id }, edge))
  }

  function buildTopologyEdgeEndpoints() {
    return topologyGraphEdges.value.flatMap(edge => {
      const fromNode = getTopologyNodeById(edge.from)
      const toNode = getTopologyNodeById(edge.to)
      if (!fromNode || !toNode) return []
      const color = getTopologyEdgeColor(edge)
      const active = selectedTopologyEdgeId.value === edge.id || isTopologyEdgeConnectedToSelectedPort(edge)
      return [
        { id: `${edge.id}:from`, edgeId: edge.id, color, active, point: getTopologyPortPoint(fromNode, { side: 'out', edgeId: edge.id }, edge) },
        { id: `${edge.id}:to`, edgeId: edge.id, color, active, point: getTopologyPortPoint(toNode, { side: 'in', edgeId: edge.id }, edge) }
      ]
    })
  }

  function buildTopologyEndpointStyle(endpoint) {
    const size = endpoint.active ? 18 : 14
    return {
      '--nginx-topology-edge-color': endpoint.color,
      width: `${size}px`,
      height: `${size}px`,
      transform: `translate(${endpoint.point.x - size / 2}px, ${endpoint.point.y - size / 2}px)`
    }
  }

  function buildTopologyEdgeStyle(edge) {
    return { '--nginx-topology-edge-color': getTopologyEdgeColor(edge) }
  }

  function getTopologyEdgeColor(edge) {
    if (edge.kind === 'missing') return '#94a3b8'
    const key = edge.id || `${edge.from || ''}->${edge.to || ''}`
    if (!topologyEdgeColors[key]) topologyEdgeColors[key] = createRandomTopologyEdgeColor()
    return topologyEdgeColors[key]
  }

  function hashTopologyText(value = '') {
    return String(value || '').split('').reduce((hash, char) => ((hash << 5) - hash) + char.charCodeAt(0), 0)
  }

  function createRandomTopologyEdgeColor() {
    const hue = Math.floor(Math.random() * 360)
    const saturation = 62 + Math.floor(Math.random() * 18)
    const lightness = 42 + Math.floor(Math.random() * 14)
    return `hsl(${hue} ${saturation}% ${lightness}%)`
  }

  function selectTopologyEdge(edge) {
    selectedTopologyEdgeId.value = edge?.id || ''
    selectedTopologyPortKey.value = ''
  }

  function clearTopologySelection() {
    selectedTopologyEdgeId.value = ''
    selectedTopologyPortKey.value = ''
  }

  function getTopologyPortSelectionKey(node, portOrSide = 'out') {
    if (!node?.id) return ''
    const port = normalizeTopologyPortInput(portOrSide)
    return port.edgeId ? `${node.id}:${port.side}:${port.edgeId}` : `${node.id}:${port.side}`
  }

  function selectTopologyPort(node, portOrSide = 'out') {
    selectedTopologyPortKey.value = getTopologyPortSelectionKey(node, portOrSide)
    selectedTopologyEdgeId.value = ''
  }

  function isTopologyPortSelected(node, portOrSide = 'out') {
    return selectedTopologyPortKey.value === getTopologyPortSelectionKey(node, portOrSide)
  }

  function isTopologyEdgeConnectedToSelectedPort(edge) {
    const portKey = selectedTopologyPortKey.value
    if (!portKey) return false
    return portKey === `${edge.from}:out` || portKey === `${edge.to}:in` || portKey === `${edge.from}:out:${edge.id}` || portKey === `${edge.to}:in:${edge.id}`
  }

  function deleteSelectedTopologyEdge() {
    const edgeId = selectedTopologyEdgeId.value
    if (!edgeId) return
    deleteTopologyEdge(edgeId)
    clearTopologySelection()
  }

  function deleteTopologyEdge(edgeId = '') {
    if (!edgeId) return
    topologyCustomEdges.value = topologyCustomEdges.value.filter(edge => edge.id !== edgeId)
    if (!topologySuppressedEdgeIds.value.includes(edgeId)) topologySuppressedEdgeIds.value.push(edgeId)
  }

  function handleTopologyKeydown(event) {
    if (activeMenu.value !== 'topology' || !selectedTopologyEdgeId.value) return
    const key = String(event.key || '').toLowerCase()
    if (key === 'delete' || key === 'backspace' || (event.ctrlKey && key === 'd')) {
      event.preventDefault()
      deleteSelectedTopologyEdge()
    }
  }

  function isTopologyPortConnected(node, portOrSide = 'out') {
    return topologyConnectedPorts.value.has(getTopologyPortSelectionKey(node, portOrSide))
  }

  function getIncomingTopologyEdge(nodeId = '', portOrSide = 'in') {
    const port = normalizeTopologyPortInput(portOrSide)
    if (port.edgeId) return topologyGraphEdges.value.find(edge => edge.id === port.edgeId && edge.to === nodeId) || null
    return topologyGraphEdges.value.find(edge => edge.to === nodeId) || null
  }

  function buildBezierPath(from, to) {
    const dx = (to.x - from.x) * 0.45
    return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`
  }

  function getTopologyCanvasPoint(event) {
    const zoom = topologyZoom.value || 1
    const surfaceRect = topologyGraphSurfaceRef.value?.getBoundingClientRect()
    if (surfaceRect) {
      return {
        x: (event.clientX - surfaceRect.left) / zoom,
        y: (event.clientY - surfaceRect.top) / zoom
      }
    }
    const rect = topologyCanvasRef.value?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: (event.clientX - rect.left + topologyCanvasRef.value.scrollLeft) / zoom,
      y: (event.clientY - rect.top + topologyCanvasRef.value.scrollTop) / zoom
    }
  }

  function handleTopologyCanvasPointerMove(event) {
    if (!topologyConnectionDraft.value) return
    topologyPointer.value = getTopologyCanvasPoint(event)
  }

  function handleTopologyCanvasPointerDown(event) {
    if (event.button !== 0 || topologyConnectionDraft.value) return
    if (event.target?.closest?.('.nginx-topology-node, .nginx-topology-line, .nginx-topology-port, .nginx-topology-zoom-tools, .nginx-topology-context-menu')) return
    clearTopologySelection()
  }

  function handleTopologyCanvasWheel(event) {
    if (!event.ctrlKey) return
    event.preventDefault()
    adjustTopologyZoom(event.deltaY < 0 ? TOPOLOGY_ZOOM_STEP : -TOPOLOGY_ZOOM_STEP)
  }

  function adjustTopologyZoom(delta) {
    const nextZoom = Math.min(TOPOLOGY_ZOOM_MAX, Math.max(TOPOLOGY_ZOOM_MIN, Number((topologyZoom.value + delta).toFixed(2))))
    topologyZoom.value = nextZoom
  }

  function getTopologyLayoutStorageKey() {
    return `${TOPOLOGY_LAYOUT_STORAGE_PREFIX}${topologyMode.value}:${encodeURIComponent(nginxRootPath.value || 'default')}`
  }

  function getOldTopologyLayoutStorageKey() {
    return `${OLD_TOPOLOGY_LAYOUT_STORAGE_PREFIX}${topologyMode.value}:${encodeURIComponent(nginxRootPath.value || 'default')}`
  }

  function saveTopologyLayout() {
    const payload = {
      version: 1,
      zoom: topologyZoom.value,
      positions: { ...topologyNodePositions },
      edgeColors: { ...topologyEdgeColors },
      customNodes: topologyCustomNodes.value,
      customEdges: topologyCustomEdges.value,
      suppressedNodeIds: topologySuppressedNodeIds.value,
      suppressedEdgeIds: topologySuppressedEdgeIds.value
    }
    window.localStorage?.setItem(getTopologyLayoutStorageKey(), JSON.stringify(payload))
  }

  function restoreTopologyLayout() {
    clearTopologyLayoutState()
    const raw = getMigratedLocalStorageItem(getTopologyLayoutStorageKey(), getOldTopologyLayoutStorageKey())
    if (!raw) return
    try {
      const payload = JSON.parse(raw)
      Object.assign(topologyNodePositions, payload?.positions || {})
      Object.assign(topologyEdgeColors, payload?.edgeColors || {})
      topologyCustomNodes.value = Array.isArray(payload?.customNodes) ? payload.customNodes : []
      topologyCustomEdges.value = Array.isArray(payload?.customEdges) ? payload.customEdges : []
      topologySuppressedNodeIds.value = Array.isArray(payload?.suppressedNodeIds) ? payload.suppressedNodeIds : []
      topologySuppressedEdgeIds.value = Array.isArray(payload?.suppressedEdgeIds) ? payload.suppressedEdgeIds : []
      topologyZoom.value = Math.min(TOPOLOGY_ZOOM_MAX, Math.max(TOPOLOGY_ZOOM_MIN, Number(payload?.zoom) || 1))
    } catch {
      clearTopologyLayoutState()
    }
  }

  function resetTopologyLayout() {
    removeMigratedLocalStorageItem(getTopologyLayoutStorageKey(), getOldTopologyLayoutStorageKey())
    clearTopologyLayoutState()
    topologyDrawerVisible.value = false
    activeTopologyNodeId.value = ''
    closeTopologyContextMenu()
  }

  function clearTopologyLayoutState() {
    Object.keys(topologyNodePositions).forEach(key => delete topologyNodePositions[key])
    Object.keys(topologyEdgeColors).forEach(key => delete topologyEdgeColors[key])
    topologyCustomNodes.value = []
    topologyCustomEdges.value = []
    topologySuppressedNodeIds.value = []
    topologySuppressedEdgeIds.value = []
    topologyZoom.value = 1
  }

  function startTopologyNodeDrag(event, node) {
    if (event.button !== 0 || event.target?.closest?.('.nginx-topology-port, .nginx-topology-port-row')) return
    event.preventDefault()
    const position = getTopologyNodePosition(node)
    topologyDragState.value = {
      nodeId: node.id,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y
    }
    topologyDragMoved.value = false
    startTopologyWindowTracking()
  }

  function startTopologyPortDrag(event, node, portOrSide = 'out') {
    if (event.button !== 0) return
    event.preventDefault()
    const port = normalizeTopologyPortInput(portOrSide)
    selectTopologyPort(node, port)
    if (port.side === 'in' && isTopologyPortConnected(node, port)) {
      const incoming = getIncomingTopologyEdge(node.id, port)
      if (incoming) {
        const fromNode = getTopologyNodeById(incoming.from)
        const anchorPoint = fromNode ? getTopologyPortPoint(fromNode, { side: 'out', edgeId: incoming.id }, incoming) : getTopologyPortPoint(node, port, incoming)
        const removedEdge = incoming.kind === 'custom' ? topologyCustomEdges.value.find(edge => edge.id === incoming.id) : null
        topologyConnectionDraft.value = { from: incoming.from, direction: 'out', anchorPoint, rewireEdgeId: incoming.id, removedEdge, originalTo: incoming.to }
      }
    } else {
      topologyConnectionDraft.value = {
        from: node.id,
        direction: port.side === 'in' ? 'in' : 'out',
        anchorPoint: getTopologyPortPoint(node, port)
      }
    }
    if (!topologyConnectionDraft.value) return
    topologyPointer.value = getTopologyCanvasPoint(event)
    startTopologyWindowTracking()
  }

  function finishTopologyConnectionAtPort(node, portOrSide = 'in') {
    const draft = topologyConnectionDraft.value
    const port = normalizeTopologyPortInput(portOrSide)
    if (!draft || !node?.id || draft.from === node.id || !isTopologyConnectionTargetAllowed(draft, port.side)) {
      cancelTopologyConnection(true)
      return
    }
    const from = draft.direction === 'in' ? node.id : draft.from
    const to = draft.direction === 'in' ? draft.from : node.id
    if (from === to) {
      cancelTopologyConnection(true)
      return
    }
    if (draft.rewireEdgeId && from === draft.from && to === draft.originalTo) {
      cancelTopologyConnection(false)
      return
    }
    const id = `custom:${from}->${to}`
    topologySuppressedEdgeIds.value = topologySuppressedEdgeIds.value.filter(edgeId => edgeId !== id)
    if (!topologyCustomEdges.value.some(edge => edge.id === id)) {
      topologyCustomEdges.value.push({ id, from, to })
    }
    if (draft.rewireEdgeId && !topologySuppressedEdgeIds.value.includes(draft.rewireEdgeId)) {
      if (draft.removedEdge) topologyCustomEdges.value = topologyCustomEdges.value.filter(edge => edge.id !== draft.rewireEdgeId)
      topologySuppressedEdgeIds.value.push(draft.rewireEdgeId)
    }
    topologyConnectionDraft.value = null
    stopTopologyWindowTracking()
  }

  function isTopologyConnectionTargetAllowed(draft, targetSide = '') {
    return (draft.direction === 'out' && targetSide === 'in') || (draft.direction === 'in' && targetSide === 'out')
  }

  function findTopologyIntersectingPort(point) {
    const draft = topologyConnectionDraft.value
    if (!draft) return null
    const targetSide = draft.direction === 'out' ? 'in' : 'out'
    for (const node of topologyGraphNodes.value) {
      if (!node?.id || node.id === draft.from) continue
      if (targetSide === 'in' && node.type === 'main') continue
      const ports = buildTopologyNodePortRows(node).filter(port => port.side === targetSide)
      for (const port of ports) {
        const portPoint = getTopologyPortPoint(node, port)
        const distance = Math.hypot(point.x - portPoint.x, point.y - portPoint.y)
        if (distance <= TOPOLOGY_PORT_HIT_RADIUS + TOPOLOGY_DRAFT_PORT_RADIUS) return { node, port }
      }
    }
    return null
  }

  function cancelTopologyConnection(restoreRemoved = false) {
    const draft = topologyConnectionDraft.value
    if (restoreRemoved && draft?.removedEdge && !topologyCustomEdges.value.some(edge => edge.id === draft.removedEdge.id)) {
      topologyCustomEdges.value.push(draft.removedEdge)
    }
    topologyConnectionDraft.value = null
    stopTopologyWindowTracking()
  }

  function dropTopologyConnectionDraft() {
    const draft = topologyConnectionDraft.value
    if (draft?.rewireEdgeId) {
      deleteTopologyEdge(draft.rewireEdgeId)
      topologyConnectionDraft.value = null
      stopTopologyWindowTracking()
      return
    }
    cancelTopologyConnection(true)
  }

  function handleTopologyNodePointerUp(event, node) {
    if (!topologyConnectionDraft.value) return
    event.stopPropagation()
    topologyPointer.value = getTopologyCanvasPoint(event)
    const hit = findTopologyIntersectingPort(topologyPointer.value)
    if (hit) finishTopologyConnectionAtPort(hit.node, hit.port)
    else dropTopologyConnectionDraft()
  }

  function handleTopologyNodeClick(node) {
    if (topologyDragMoved.value) {
      topologyDragMoved.value = false
      return
    }
    openTopologyNodeDrawer(node)
  }

  function openTopologyNodeDrawer(node) {
    if (!node?.id) return
    activeTopologyNodeId.value = node.id
    topologyDrawerVisible.value = true
  }

  function getTopologyNodeIconType(node) {
    if (['file', 'backend', 'upstream', 'root', 'ssl', 'return', 'route', 'target'].includes(node?.type) || node?.site?.path) return 'file'
    return 'folder'
  }

  function openTopologyNodeMenu(event, node) {
    activeTopologyNodeId.value = node?.id || ''
    topologyContextMenu.visible = true
    topologyContextMenu.x = event.clientX
    topologyContextMenu.y = event.clientY
    topologyContextMenu.node = node || null
  }

  function closeTopologyContextMenu() {
    topologyContextMenu.visible = false
  }

  function buildTopologyContextMenuStyle() {
    return {
      left: `${topologyContextMenu.x}px`,
      top: `${topologyContextMenu.y}px`
    }
  }

  function addTopologyNodeFromMenu() {
    const sourceNode = topologyContextMenu.node
    const position = sourceNode ? getTopologyNodePosition(sourceNode) : getTopologyCanvasPoint({ clientX: topologyContextMenu.x, clientY: topologyContextMenu.y })
    const id = `custom-node:${Date.now()}`
    topologyCustomNodes.value.push({
      id,
      type: 'custom',
      badge: '自定义节点',
      title: `新节点 ${topologyCustomNodes.value.length + 1}`,
      subtitle: '当前拓扑视图中的临时节点',
      defaultX: Math.max(0, position.x + 300),
      defaultY: Math.max(0, position.y)
    })
    topologyNodePositions[id] = { x: Math.max(0, position.x + 300), y: Math.max(0, position.y) }
    activeTopologyNodeId.value = id
    topologyDrawerVisible.value = true
    closeTopologyContextMenu()
  }

  function editTopologyNodeSource(node) {
    if (node?.site?.path) openTopologySite(node.site)
    closeTopologyContextMenu()
  }

  function editTopologyNodeVisual(node) {
    openTopologyNodeDrawer(node)
    closeTopologyContextMenu()
  }

  function deleteTopologyNodeFromMenu() {
    const node = topologyContextMenu.node
    if (!node?.id || node.id === 'main') return
    if (node.id.startsWith('custom-node:')) {
      topologyCustomNodes.value = topologyCustomNodes.value.filter(item => item.id !== node.id)
    } else if (!topologySuppressedNodeIds.value.includes(node.id)) {
      topologySuppressedNodeIds.value.push(node.id)
    }
    topologyCustomEdges.value = topologyCustomEdges.value.filter(edge => edge.from !== node.id && edge.to !== node.id)
    topologySuppressedEdgeIds.value = Array.from(new Set([
      ...topologySuppressedEdgeIds.value,
      ...topologyGraphEdges.value.filter(edge => edge.from === node.id || edge.to === node.id).map(edge => edge.id)
    ]))
    if (activeTopologyNodeId.value === node.id) {
      activeTopologyNodeId.value = ''
      topologyDrawerVisible.value = false
    }
    closeTopologyContextMenu()
  }

  function startTopologyWindowTracking() {
    window.addEventListener('pointermove', handleTopologyWindowPointerMove)
    window.addEventListener('pointerup', handleTopologyWindowPointerUp)
  }

  function stopTopologyWindowTracking() {
    window.removeEventListener('pointermove', handleTopologyWindowPointerMove)
    window.removeEventListener('pointerup', handleTopologyWindowPointerUp)
  }

  function handleTopologyWindowPointerMove(event) {
    if (topologyDragState.value) {
      const state = topologyDragState.value
      const zoom = topologyZoom.value || 1
      const nextX = Math.max(0, state.originX + (event.clientX - state.startX) / zoom)
      const nextY = Math.max(0, state.originY + (event.clientY - state.startY) / zoom)
      topologyNodePositions[state.nodeId] = { x: nextX, y: nextY }
      if (Math.abs(event.clientX - state.startX) > 3 || Math.abs(event.clientY - state.startY) > 3) topologyDragMoved.value = true
    }
    if (topologyConnectionDraft.value) topologyPointer.value = getTopologyCanvasPoint(event)
  }

  function handleTopologyWindowPointerUp(event) {
    topologyDragState.value = null
    if (topologyConnectionDraft.value) {
      topologyPointer.value = getTopologyCanvasPoint(event)
      const hit = findTopologyIntersectingPort(topologyPointer.value)
      if (hit) finishTopologyConnectionAtPort(hit.node, hit.port)
      else dropTopologyConnectionDraft()
    }
    stopTopologyWindowTracking()
  }

  function formatSiteMenuLabel(site) {
    const name = String(site?.name || '').trim()
    const path = String(site?.path || '').trim()
    if (name === 'nginx.conf') return 'nginx.conf'
    if (name) return name.replace(/\.conf$/i, '')
    if (path) {
      const last = path.split('/').filter(Boolean).pop() || path
      return last.replace(/\.conf$/i, '')
    }
    return '未命名文件'
  }

  function normalizeNginxPath(value = '') {
    const normalized = String(value || '').trim().replace(/\\/g, '/').replace(/\/+/g, '/')
    if (!normalized || normalized === '/') return normalized || '/etc/nginx'
    return normalized.replace(/\/+$/, '')
  }

  function joinNginxPath(base = '', child = '') {
    return `${normalizeNginxPath(base)}/${String(child || '').replace(/^\/+/, '')}`
  }

  function isSameNginxPath(left = '', right = '') {
    return normalizeNginxPath(left) === normalizeNginxPath(right)
  }

  function isPathUnderDir(filePath = '', dirPath = '') {
    const file = normalizeNginxPath(filePath)
    const dir = normalizeNginxPath(dirPath)
    return file.startsWith(`${dir}/`)
  }

  function createTopologyGroup(key = '', label = '', include = '', dir = '', options = {}) {
    const mainPath = detectedNginxConf.value
    const files = siteMenuItems.value
      .filter(site => site?.path && !isSameNginxPath(site.path, mainPath) && isPathInTopologyDir(site.path, dir, options.directOnly === true))
      .sort((a, b) => String(a.path || '').localeCompare(String(b.path || '')))
    return { key, label, include, files }
  }

  function buildRealTopologyGroups() {
    const files = Array.isArray(nginxTopology.value?.files) ? nginxTopology.value.files : []
    const groups = []
    const used = new Set()

    files.forEach(file => {
      const includes = Array.isArray(file.includes) ? file.includes : []
      includes.forEach(includeItem => {
        const matchedFiles = (Array.isArray(includeItem.matched) ? includeItem.matched : [])
          .map(item => topologySiteByPath.value.get(normalizeNginxPath(item)))
          .filter(Boolean)
        matchedFiles.forEach(site => used.add(normalizeNginxPath(site.path)))
        groups.push({
          key: `${file.path}:${includeItem.line}:${includeItem.pattern}`,
          label: `${file.name || formatPathBasename(file.path)} include`,
          include: includeItem.pattern,
          files: matchedFiles
        })
      })
    })

    const ungrouped = topologyFileSites.value.filter(site => {
      if (mainConfigSite.value && isSameNginxPath(site.path, mainConfigSite.value.path)) return false
      return !used.has(normalizeNginxPath(site.path))
    })
    if (ungrouped.length) {
      groups.push({ key: 'nginx-loaded', label: 'nginx -T 已加载配置', include: '配置已被 Nginx 加载，但未匹配到上级 include', files: ungrouped })
    }

    return groups.length ? groups : [{ key: 'nginx-loaded-empty', label: 'nginx -T 已加载配置', include: '未发现 include 分支', files: [] }]
  }

  function createTopologySiteFromFile(file = {}) {
    const filePath = normalizeNginxPath(file.path || '')
    const existing = siteMenuItems.value.find(site => isSameNginxPath(site.path, filePath))
    return {
      ...(existing || {}),
      path: filePath,
      name: file.name || formatPathBasename(filePath),
      label: existing?.label || formatSiteMenuLabel({ name: file.name, path: filePath }),
      serverCount: Number(file.serverCount || 0),
      servers: Array.isArray(file.servers) ? file.servers : []
    }
  }

  function formatPathBasename(filePath = '') {
    return String(filePath || '').split('/').filter(Boolean).pop() || String(filePath || '') || '未命名文件'
  }

  function isPathInTopologyDir(filePath = '', dirPath = '', directOnly = false) {
    if (!isPathUnderDir(filePath, dirPath)) return false
    if (!directOnly) return true
    const file = normalizeNginxPath(filePath)
    const dir = normalizeNginxPath(dirPath)
    return !file.slice(dir.length + 1).includes('/')
  }

  function getFieldLabel(key = '') {
    return fieldLabelMap[String(key || '').trim()] || String(key || '').trim()
  }

  function isRemotePathField(key = '') {
    return [
      'pid',
      'root',
      'alias',
      'ssl_certificate',
      'ssl_certificate_key',
      'auth_basic_user_file'
    ].includes(String(key || '').trim())
  }

  function getRemotePathSelectType(key = '') {
    const fieldKey = String(key || '').trim()
    if (['root', 'alias'].includes(fieldKey)) return 'directory'
    if (['pid', 'ssl_certificate', 'ssl_certificate_key', 'auth_basic_user_file'].includes(fieldKey)) return 'file'
    return 'both'
  }

  function pickServerDraftSource(server = null) {
    if (!server) return {}
    return {
      listens: cloneListenList(server.listens),
      server_name: String(server.server_name || ''),
      root: String(server.root || ''),
      index: String(server.index || ''),
      charset: String(server.charset || ''),
      include: String(server.include || ''),
      add_header: String(server.add_header || ''),
      rewrite: String(server.rewrite || ''),
      set: String(server.set || ''),
      access_log: String(server.access_log || ''),
      error_log: String(server.error_log || ''),
      ssl_certificate: String(server.ssl_certificate || ''),
      ssl_certificate_key: String(server.ssl_certificate_key || ''),
      return: String(server.return || ''),
      client_max_body_size: String(server.client_max_body_size || ''),
      raw: String(server.raw || '')
    }
  }

  function pickLocationDraftSource(location = null) {
    if (!location) return {}
    return {
      modifier: String(location.modifier || ''),
      path: String(location.path || ''),
      mode: String(location.mode || ''),
      pathDirective: String(location.pathDirective || ''),
      root: String(location.root || ''),
      alias: String(location.alias || ''),
      index: String(location.index || ''),
      try_files: String(location.try_files || ''),
      proxy_pass: String(location.proxy_pass || ''),
      proxy_set_header: String(location.proxy_set_header || ''),
      proxy_redirect: String(location.proxy_redirect || ''),
      proxy_read_timeout: String(location.proxy_read_timeout || ''),
      proxy_connect_timeout: String(location.proxy_connect_timeout || ''),
      proxy_send_timeout: String(location.proxy_send_timeout || ''),
      fastcgi_pass: String(location.fastcgi_pass || ''),
      fastcgi_param: String(location.fastcgi_param || ''),
      expires: String(location.expires || ''),
      auth_basic: String(location.auth_basic || ''),
      auth_basic_user_file: String(location.auth_basic_user_file || ''),
      allow: String(location.allow || ''),
      deny: String(location.deny || ''),
      add_header: String(location.add_header || ''),
      rewrite: String(location.rewrite || ''),
      return: String(location.return || ''),
      include: String(location.include || ''),
      raw: String(location.raw || '')
    }
  }

  function normalizeDraftValue(value = {}) {
    return JSON.parse(JSON.stringify(value || {}))
  }

  function createMetaState(title = '', description = '') {
    return {
      title,
      description,
      draftTitle: title,
      draftDescription: description
    }
  }

  function getServerMetaByIndex(index, server = {}) {
    if (typeof index !== 'number' || index < 0) return createMetaState('server', '')
    if (!serverMetaList.value[index]) {
      const defaultTitle = `server ${index + 1}`
      const defaultDescription = buildTemplateServerTabLabel(server)
      serverMetaList.value[index] = createMetaState(defaultTitle, defaultDescription)
    }
    return serverMetaList.value[index]
  }

  function getLocationMetaByIndex(serverIndex, locationIndex, location = {}) {
    if (typeof serverIndex !== 'number' || serverIndex < 0 || typeof locationIndex !== 'number' || locationIndex < 0) return createMetaState('location', '')
    if (!locationMetaMatrix.value[serverIndex]) locationMetaMatrix.value[serverIndex] = []
    if (!locationMetaMatrix.value[serverIndex][locationIndex]) {
      const defaultTitle = `location ${locationIndex + 1}`
      const defaultDescription = buildTemplateLocationTabLabel(location)
      locationMetaMatrix.value[serverIndex][locationIndex] = createMetaState(defaultTitle, defaultDescription)
    }
    return locationMetaMatrix.value[serverIndex][locationIndex]
  }

  function syncMetaState() {
    const servers = siteTemplateForm.value?.servers || []
    serverMetaList.value = servers.map((server, serverIndex) => {
      const existing = serverMetaList.value[serverIndex]
      if (existing) return existing
      return createMetaState(`server ${serverIndex + 1}`, buildTemplateServerTabLabel(server))
    })
    locationMetaMatrix.value = servers.map((server, serverIndex) => {
      const existingList = locationMetaMatrix.value[serverIndex] || []
      return (server.locations || []).map((location, locationIndex) => {
        const existing = existingList[locationIndex]
        if (existing) return existing
        return createMetaState(`location ${locationIndex + 1}`, buildTemplateLocationTabLabel(location))
      })
    })
  }

  function saveActiveServerMeta() {
    if (!activeServerMeta.value) return
    activeServerMeta.value.title = activeServerMeta.value.draftTitle || activeServerMeta.value.title
    activeServerMeta.value.description = activeServerMeta.value.draftDescription || activeServerMeta.value.description
  }

  function saveActiveServerSection() {
    if (!activeTemplateServer.value) return
    Object.assign(activeTemplateServer.value, normalizeDraftValue(activeServerDraft.value))
    saveActiveServerMeta()
    syncMetaState()
    syncTemplateFormToCode()
  }

  function saveActiveLocationMeta() {
    if (!activeLocationMeta.value) return
    activeLocationMeta.value.title = activeLocationMeta.value.draftTitle || activeLocationMeta.value.title
    activeLocationMeta.value.description = activeLocationMeta.value.draftDescription || activeLocationMeta.value.description
  }

  function saveActiveLocationSection() {
    if (!activeTemplateLocation.value) return
    Object.assign(activeTemplateLocation.value, normalizeDraftValue(activeLocationDraft.value))
    saveActiveLocationMeta()
    syncMetaState()
    syncTemplateFormToCode()
  }

  function addListenToActiveServerDraft() {
    if (!Array.isArray(activeServerDraft.value.listens)) activeServerDraft.value.listens = []
    activeServerDraft.value.listens.push(createListenItem())
  }

  function removeListenFromActiveServerDraft(index) {
    if (!Array.isArray(activeServerDraft.value.listens)) {
      activeServerDraft.value.listens = [createListenItem()]
      return
    }
    if (activeServerDraft.value.listens.length <= 1) {
      activeServerDraft.value.listens.splice(0, activeServerDraft.value.listens.length, createListenItem())
      return
    }
    activeServerDraft.value.listens.splice(index, 1)
  }

  function buildTemplateServerTabLabel(server = {}) {
    const name = String(server?.server_name || '').trim()
    if (name) return name.split(/\s+/)[0]
    const listen = renderListenDirective(server?.listens?.[0] || null)
    return listen || '未命名'
  }

  function buildTemplateLocationTabLabel(location = {}) {
    const path = String(location?.path || '').trim()
    if (path) return path
    const mode = String(location?.mode || '').trim()
    return mode || '未命名'
  }

  function resetExpandedState() {
    const serverIds = (siteTemplateForm.value?.servers || []).map(server => server.id)
    const locationIds = (siteTemplateForm.value?.servers || []).flatMap(server => (server.locations || []).map(location => location.id))
    expandedServerIds.value = serverIds.slice()
    expandedServerLocationGroupIds.value = serverIds.slice()
    expandedLocationIds.value = locationIds.slice()
  }

  function isServerExpanded(serverId) {
    return expandedServerIds.value.includes(serverId)
  }

  function toggleServerExpanded(serverId) {
    expandedServerIds.value = toggleExpandedItem(expandedServerIds.value, serverId)
  }

  function isServerLocationsExpanded(serverId) {
    return expandedServerLocationGroupIds.value.includes(serverId)
  }

  function toggleServerLocationsExpanded(serverId) {
    expandedServerLocationGroupIds.value = toggleExpandedItem(expandedServerLocationGroupIds.value, serverId)
  }

  function isLocationExpanded(locationId) {
    return expandedLocationIds.value.includes(locationId)
  }

  function toggleLocationExpanded(locationId) {
    expandedLocationIds.value = toggleExpandedItem(expandedLocationIds.value, locationId)
  }

  function toggleExpandedItem(list = [], id = '') {
    if (!id) return Array.isArray(list) ? list.slice() : []
    const next = Array.isArray(list) ? list.slice() : []
    const index = next.indexOf(id)
    if (index > -1) next.splice(index, 1)
    else next.push(id)
    return next
  }

  function createTemplateLocation(overrides = {}) {
    return {
      id: `loc-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      modifier: '',
      path: '/',
      mode: 'static',
      pathDirective: 'root',
      root: '',
      alias: '',
      index: '',
      try_files: '',
      proxy_pass: '',
      proxy_set_header: '',
      proxy_redirect: '',
      proxy_read_timeout: '',
      proxy_connect_timeout: '',
      proxy_send_timeout: '',
      fastcgi_pass: '',
      fastcgi_param: '',
      expires: '',
      auth_basic: '',
      auth_basic_user_file: '',
      allow: '',
      deny: '',
      add_header: '',
      rewrite: '',
      return: '',
      include: '',
      raw: '',
      ...overrides
    }
  }

  function createListenItem(overrides = {}) {
    return {
      id: `listen-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      host: '',
      port: '80',
      ssl: false,
      http2: false,
      default_server: false,
      proxy_protocol: false,
      reuseport: false,
      ipv6only: '',
      extra: '',
      ...overrides
    }
  }

  function cloneListenList(list = []) {
    const source = Array.isArray(list) && list.length ? list : [createListenItem()]
    return source.map(item => createListenItem({
      ...item,
      id: item?.id || `listen-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      host: String(item?.host || ''),
      port: String(item?.port || ''),
      ssl: item?.ssl === true,
      http2: item?.http2 === true,
      default_server: item?.default_server === true,
      proxy_protocol: item?.proxy_protocol === true,
      reuseport: item?.reuseport === true,
      ipv6only: String(item?.ipv6only || ''),
      extra: String(item?.extra || '')
    }))
  }

  function createTemplateServer(overrides = {}) {
    return {
      id: `srv-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      listens: [createListenItem()],
      server_name: '',
      root: '',
      index: 'index.html index.htm',
      charset: '',
      include: '',
      add_header: '',
      rewrite: '',
      set: '',
      access_log: '',
      error_log: '',
      ssl_certificate: '',
      ssl_certificate_key: '',
      return: '',
      client_max_body_size: '',
      raw: '',
      locations: [createTemplateLocation()],
      ...overrides
    }
  }

  function createTemplateForm() {
    return {
      main: {
        user: '',
        worker_processes: 'auto',
        pid: '',
        load_module: '',
        worker_rlimit_nofile: '',
        env: '',
        daemon: '',
        include: '',
        error_log: '',
        raw: ''
      },
      events: {
        worker_connections: '1024',
        multi_accept: '',
        use: '',
        accept_mutex: '',
        raw: ''
      },
      http: {
        include: '',
        default_type: 'application/octet-stream',
        types_hash_max_size: '',
        sendfile: 'on',
        tcp_nopush: '',
        tcp_nodelay: '',
        keepalive_timeout: '65',
        client_max_body_size: '',
        client_body_timeout: '',
        client_header_timeout: '',
        send_timeout: '',
        server_tokens: '',
        gzip: '',
        gzip_comp_level: '',
        gzip_types: '',
        log_format: '',
        access_log: '',
        error_log: '',
        raw: ''
      },
      servers: [createTemplateServer()]
    }
  }

  function normalizeDirectiveValue(value = '') {
    return String(value || '').trim().replace(/;$/, '').trim()
  }

  function splitDirectiveMultiline(value = '') {
    return String(value || '')
      .split(/\r?\n/)
      .map(item => normalizeDirectiveValue(item))
      .filter(Boolean)
  }

  function splitListenTokens(value = '') {
    return String(value || '').trim().split(/\s+/).filter(Boolean)
  }

  function parseListenEndpoint(token = '') {
    const value = String(token || '').trim()
    if (!value) return { host: '', port: '80' }
    if (/^unix:/i.test(value)) return { host: value, port: '' }
    const ipv6Match = value.match(/^(\[[^\]]+\])(?::(\d+))?$/)
    if (ipv6Match) return { host: ipv6Match[1], port: ipv6Match[2] || '' }
    const hostPortMatch = value.match(/^(.+):(\d+)$/)
    if (hostPortMatch) return { host: hostPortMatch[1], port: hostPortMatch[2] }
    if (/^\d+$/.test(value)) return { host: '', port: value }
    return { host: value, port: '' }
  }

  function parseListenLine(line = '') {
    const tokens = splitListenTokens(normalizeDirectiveValue(line))
    const endpoint = parseListenEndpoint(tokens.shift() || '80')
    const listenItem = createListenItem(endpoint)
    const extra = []
    tokens.forEach(token => {
      if (token === 'ssl') listenItem.ssl = true
      else if (token === 'http2') listenItem.http2 = true
      else if (token === 'default_server') listenItem.default_server = true
      else if (token === 'proxy_protocol') listenItem.proxy_protocol = true
      else if (token === 'reuseport') listenItem.reuseport = true
      else if (/^ipv6only=(on|off)$/i.test(token)) listenItem.ipv6only = token.split('=')[1].toLowerCase()
      else extra.push(token)
    })
    listenItem.extra = extra.join(' ')
    return listenItem
  }

  function parseListenText(value = '') {
    const lines = splitDirectiveMultiline(value)
    return lines.length ? lines.map(parseListenLine) : [createListenItem()]
  }

  function renderListenDirective(item = {}) {
    if (!item) return ''
    const host = String(item.host || '').trim()
    const port = String(item.port || '').trim()
    const endpoint = host && port ? `${host}:${port}` : host || port || '80'
    const tokens = [endpoint]
    if (item.ssl) tokens.push('ssl')
    if (item.http2) tokens.push('http2')
    if (item.default_server) tokens.push('default_server')
    if (item.proxy_protocol) tokens.push('proxy_protocol')
    if (item.reuseport) tokens.push('reuseport')
    if (String(item.ipv6only || '').trim()) tokens.push(`ipv6only=${String(item.ipv6only).trim()}`)
    if (String(item.extra || '').trim()) tokens.push(String(item.extra).trim())
    return tokens.filter(Boolean).join(' ')
  }

  function countToken(text = '', token = '') {
    if (!text || !token) return 0
    return String(text).split(token).length - 1
  }

  function indentBlock(text = '', indent = '    ') {
    return String(text || '').split(/\r?\n/).map(line => `${indent}${line}`).join('\n')
  }

  function dedentBlock(text = '') {
    const lines = String(text || '').split(/\r?\n/)
    const indents = lines
      .filter(line => line.trim())
      .map(line => (line.match(/^\s*/)?.[0] || '').length)
    const minIndent = indents.length ? Math.min(...indents) : 0
    if (!minIndent) return lines.join('\n')
    return lines
      .map(line => {
        if (!line.trim()) return ''
        return line.slice(Math.min(minIndent, line.length))
      })
      .join('\n')
  }

  function extractTopLevelHttpBlock(content = '') {
    const lines = String(content || '').split(/\r?\n/)
    const beforeLines = []
    const afterLines = []
    const blockLines = []
    let found = false
    let closed = false
    let depth = 0
    for (const line of lines) {
      const trimmed = line.trim()
      if (!found) {
        if (/^http\s*\{/.test(trimmed)) {
          found = true
          blockLines.push(line)
          depth = countToken(line, '{') - countToken(line, '}')
          if (depth <= 0) closed = true
        } else {
          beforeLines.push(line)
        }
        continue
      }
      if (!closed) {
        blockLines.push(line)
        depth += countToken(line, '{') - countToken(line, '}')
        if (depth <= 0) closed = true
        continue
      }
      afterLines.push(line)
    }
    return {
      found,
      before: beforeLines.join('\n').trim(),
      block: blockLines.join('\n').trim(),
      after: afterLines.join('\n').trim()
    }
  }

  function extractNamedTopLevelBlock(content = '', blockName = '') {
    const lines = String(content || '').split(/\r?\n/)
    const blockLines = []
    let found = false
    let depth = 0
    for (const line of lines) {
      const trimmed = line.trim()
      if (!found) {
        if (new RegExp(`^${blockName}\\s*\\{`).test(trimmed)) {
          found = true
          blockLines.push(line)
          depth = countToken(line, '{') - countToken(line, '}')
          if (depth <= 0) break
        }
        continue
      }
      blockLines.push(line)
      depth += countToken(line, '{') - countToken(line, '}')
      if (depth <= 0) break
    }
    return found ? blockLines.join('\n').trim() : ''
  }

  function unwrapBlockContent(blockText = '') {
    const lines = String(blockText || '').split(/\r?\n/)
    if (lines.length < 2) return ''
    return lines.slice(1, -1).join('\n').trim()
  }

  function extractServerBlocks(content = '') {
    const lines = String(content || '').split(/\r?\n/)
    const outsideLines = []
    const blocks = []
    let activeBlock = null
    for (const line of lines) {
      const trimmed = line.trim()
      if (!activeBlock) {
        if (/^server\s*\{/.test(trimmed)) {
          activeBlock = { lines: [line], depth: countToken(line, '{') - countToken(line, '}') }
          if (activeBlock.depth <= 0) {
            blocks.push(activeBlock.lines)
            activeBlock = null
          }
        } else {
          outsideLines.push(line)
        }
        continue
      }
      activeBlock.lines.push(line)
      activeBlock.depth += countToken(line, '{') - countToken(line, '}')
      if (activeBlock.depth <= 0) {
        blocks.push(activeBlock.lines)
        activeBlock = null
      }
    }
    return {
      outsideDirectives: outsideLines.join('\n').trim(),
      blocks
    }
  }

  function collectDirectivesBySchema(text = '', schema = []) {
    const lines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean)
    const result = {}
    const used = new Set()
    for (const field of schema) {
      const directive = field.key
      const matched = lines.filter(line => new RegExp(`^${directive}\\s+`, 'i').test(line))
      matched.forEach(line => used.add(line))
      if (field.type === 'textarea') {
        result[field.key] = matched.map(line => normalizeDirectiveValue(line.replace(new RegExp(`^${directive}\\s+`, 'i'), ''))).join('\n')
      } else {
        result[field.key] = matched.length ? normalizeDirectiveValue(matched[0].replace(new RegExp(`^${directive}\\s+`, 'i'), '')) : ''
      }
    }
    result.raw = lines.filter(line => !used.has(line)).join('\n').trim()
    return result
  }

  function buildServerFormFromVisual(server = {}) {
    const extraFields = collectDirectivesBySchema(server?.customDirectives || '', templateServerFieldSchema)
    return createTemplateServer({
      ...extraFields,
      listens: parseListenText(server?.listenText || ''),
      server_name: String(server?.serverNameText || '').trim(),
      root: String(server?.root || extraFields.root || '').trim(),
      index: String(server?.index || extraFields.index || '').trim(),
      charset: String(server?.charset || extraFields.charset || '').trim(),
      include: String(server?.include || extraFields.include || '').trim(),
      add_header: String(server?.add_header || extraFields.add_header || '').trim(),
      rewrite: String(server?.rewrite || extraFields.rewrite || '').trim(),
      set: String(server?.set || extraFields.set || '').trim(),
      access_log: String(server?.accessLog || server?.access_log || extraFields.access_log || '').trim(),
      error_log: String(server?.errorLog || server?.error_log || extraFields.error_log || '').trim(),
      ssl_certificate: String(server?.sslCertificate || server?.ssl_certificate || extraFields.ssl_certificate || '').trim(),
      ssl_certificate_key: String(server?.sslCertificateKey || server?.ssl_certificate_key || extraFields.ssl_certificate_key || '').trim(),
      return: String(server?.returnRule || server?.return || extraFields.return || '').trim(),
      client_max_body_size: String(server?.client_max_body_size || extraFields.client_max_body_size || '').trim(),
      raw: String(server?.raw || extraFields.raw || '').trim(),
      locations: (Array.isArray(server?.locations) && server.locations.length ? server.locations : [createTemplateLocation()]).map(buildLocationFormFromVisual)
    })
  }

  function buildLocationFormFromVisual(location = {}) {
    const pathDirective = String(location?.pathDirective || '').trim() === 'alias' ? 'alias' : 'root'
    const extraFields = collectDirectivesBySchema(location?.customDirectives || '', templateLocationFieldSchema)
    return createTemplateLocation({
      ...extraFields,
      modifier: String(location?.modifier || '').trim(),
      path: String(location?.matcher || '/').trim() || '/',
      mode: String(location?.mode || 'custom').trim() || 'custom',
      pathDirective,
      root: pathDirective === 'root' ? String(location?.root || extraFields.root || '').trim() : '',
      alias: pathDirective === 'alias' ? String(location?.alias || location?.root || extraFields.alias || '').trim() : '',
      index: String(location?.index || extraFields.index || '').trim(),
      try_files: String(location?.tryFiles || location?.try_files || extraFields.try_files || '').trim(),
      proxy_pass: String(location?.proxyPass || location?.proxy_pass || extraFields.proxy_pass || '').trim(),
      proxy_set_header: String(location?.proxy_set_header || extraFields.proxy_set_header || '').trim(),
      proxy_redirect: String(location?.proxy_redirect || extraFields.proxy_redirect || '').trim(),
      proxy_read_timeout: String(location?.proxy_read_timeout || extraFields.proxy_read_timeout || '').trim(),
      proxy_connect_timeout: String(location?.proxy_connect_timeout || extraFields.proxy_connect_timeout || '').trim(),
      proxy_send_timeout: String(location?.proxy_send_timeout || extraFields.proxy_send_timeout || '').trim(),
      fastcgi_pass: String(location?.fastcgi_pass || extraFields.fastcgi_pass || '').trim(),
      fastcgi_param: String(location?.fastcgi_param || extraFields.fastcgi_param || '').trim(),
      expires: String(location?.expires || extraFields.expires || '').trim(),
      auth_basic: String(location?.auth_basic || extraFields.auth_basic || '').trim(),
      auth_basic_user_file: String(location?.auth_basic_user_file || extraFields.auth_basic_user_file || '').trim(),
      allow: String(location?.allow || extraFields.allow || '').trim(),
      deny: String(location?.deny || extraFields.deny || '').trim(),
      add_header: String(location?.add_header || extraFields.add_header || '').trim(),
      rewrite: String(location?.rewrite || extraFields.rewrite || '').trim(),
      return: String(location?.returnRule || location?.return || extraFields.return || '').trim(),
      include: String(location?.include || extraFields.include || '').trim(),
      raw: String(location?.raw || extraFields.raw || '').trim()
    })
  }

  function rebuildTemplateForm() {
    const path = String(props.selectedNginxSiteEditor?.path || '')
    const code = String(props.selectedNginxSiteEditor?.code || '')
    const form = createTemplateForm()
    const visualServersList = Array.isArray(props.selectedNginxSiteEditor?.visualModel?.servers) && props.selectedNginxSiteEditor.visualModel.servers.length
      ? props.selectedNginxSiteEditor.visualModel.servers
      : [createTemplateServer()]
    form.servers = visualServersList.map(buildServerFormFromVisual)
    if (isMainConfigPath(path)) {
      const httpBlock = extractTopLevelHttpBlock(code)
      const eventsBlock = extractNamedTopLevelBlock(code, 'events')
      form.main = { ...form.main, ...collectDirectivesBySchema(httpBlock.before, mainFieldSchema) }
      form.events = { ...form.events, ...collectDirectivesBySchema(unwrapBlockContent(eventsBlock), eventsFieldSchema) }
      const httpBody = httpBlock.found ? unwrapBlockContent(httpBlock.block) : ''
      const { outsideDirectives } = extractServerBlocks(httpBody)
      form.http = { ...form.http, ...collectDirectivesBySchema(outsideDirectives, httpTemplateFieldSchema) }
    }
    siteTemplateForm.value = form
    syncMetaState()
    resetExpandedState()
  }

  function isMainConfigPath(path = '') {
    return String(path || '').endsWith('/nginx.conf')
  }

  function renderDirectiveLine(key = '', value = '') {
    const normalized = normalizeDirectiveValue(value)
    return normalized ? `${key} ${normalized};` : ''
  }

  function renderDirectiveMultiline(key = '', value = '') {
    return splitDirectiveMultiline(value).map(item => `${key} ${item};`).join('\n')
  }

  function renderFieldDirective(field = {}, source = {}, disabledResolver = null) {
    if (!field?.key || field.key === 'raw') return ''
    if (typeof disabledResolver === 'function' && disabledResolver(field.key, source)) return ''
    const value = source?.[field.key]
    return field.type === 'textarea' ? renderDirectiveMultiline(field.key, value) : renderDirectiveLine(field.key, value)
  }

  function pushRenderedField(lines = [], field = {}, source = {}, indent = '    ', disabledResolver = null) {
    const rendered = renderFieldDirective(field, source, disabledResolver)
    if (!rendered) return
    rendered.split(/\r?\n/).filter(Boolean).forEach(line => lines.push(`${indent}${line}`))
  }

  function serverHasSslListen(server = {}) {
    return (Array.isArray(server?.listens) ? server.listens : []).some(item => item?.ssl === true || /(^|\s)ssl($|\s)/.test(String(item?.extra || '')))
  }

  function isServerFieldDisabled(key = '', server = {}) {
    if (['ssl_certificate', 'ssl_certificate_key'].includes(key)) return !serverHasSslListen(server)
    return false
  }

  function hasLocationValue(location = {}, key = '') {
    return normalizeDirectiveValue(location?.[key]).length > 0
  }

  function isLocationFieldDisabled(key = '', location = {}) {
    const hasReturn = hasLocationValue(location, 'return')
    const hasProxy = hasLocationValue(location, 'proxy_pass')
    if (hasReturn && ['proxy_pass', 'root', 'alias', 'try_files'].includes(key)) return true
    if (hasProxy && ['root', 'alias', 'try_files'].includes(key)) return true
    if (key === 'root' && String(location?.pathDirective || '') === 'alias') return true
    if (key === 'alias' && String(location?.pathDirective || '') !== 'alias') return true
    return false
  }

  function renderLocationBlock(location = {}) {
    const modifier = String(location?.modifier || '').trim()
    const path = String(location?.path || '/').trim() || '/'
    const lines = [`    location ${modifier ? `${modifier} ` : ''}${path} {`]
    templateLocationFieldSchema
      .filter(field => !['modifier', 'path', 'mode', 'pathDirective'].includes(field.key))
      .forEach(field => pushRenderedField(lines, field, location, '        ', isLocationFieldDisabled))
    if (String(location?.raw || '').trim()) lines.push(indentBlock(String(location.raw).trim(), '        '))
    lines.push('    }')
    return lines.join('\n')
  }

  function renderServerBlock(server = {}) {
    const lines = ['server {']
    const listenText = (Array.isArray(server?.listens) ? server.listens : []).map(renderListenDirective).filter(Boolean)
    if (listenText.length) listenText.forEach(item => lines.push(`    listen ${item};`))
    else lines.push('    listen 80;')
    templateServerFieldSchema.forEach(field => pushRenderedField(lines, field, server, '    ', isServerFieldDisabled))
    if (String(server?.raw || '').trim()) lines.push(indentBlock(String(server.raw).trim(), '    '))
    const locations = Array.isArray(server?.locations) && server.locations.length ? server.locations : [createTemplateLocation()]
    locations.forEach(location => lines.push(renderLocationBlock(location)))
    lines.push('}')
    return lines.join('\n')
  }

  function syncTemplateFormToCode() {
    const path = String(props.selectedNginxSiteEditor?.path || '')
    const form = siteTemplateForm.value
    const serverBlocks = (Array.isArray(form?.servers) && form.servers.length ? form.servers : [createTemplateServer()]).map(renderServerBlock).join('\n\n')
    let code = `${serverBlocks}\n`
    if (isMainConfigPath(path)) {
      const mainLines = []
      mainFieldSchema.forEach(field => {
        if (field.key === 'raw') return
        const value = form.main[field.key]
        const line = field.type === 'textarea' ? renderDirectiveMultiline(field.key, value) : renderDirectiveLine(field.key, value)
        if (line) mainLines.push(line)
      })
      if (String(form.main.raw || '').trim()) mainLines.push(String(form.main.raw).trim())
      const eventsLines = []
      eventsFieldSchema.forEach(field => {
        if (field.key === 'raw') return
        const line = renderDirectiveLine(field.key, form.events[field.key])
        if (line) eventsLines.push(line)
      })
      if (String(form.events.raw || '').trim()) eventsLines.push(String(form.events.raw).trim())
      const httpLines = []
      httpTemplateFieldSchema.forEach(field => {
        if (field.key === 'raw') return
        const value = form.http[field.key]
        const line = field.type === 'textarea' ? renderDirectiveMultiline(field.key, value) : renderDirectiveLine(field.key, value)
        if (line) httpLines.push(line)
      })
      if (String(form.http.raw || '').trim()) httpLines.push(String(form.http.raw).trim())
      if (serverBlocks.trim()) httpLines.push(serverBlocks.trim())
      const parts = []
      if (mainLines.length) parts.push(mainLines.join('\n'))
      if (eventsLines.length) parts.push(`events {\n${indentBlock(eventsLines.join('\n'), '    ')}\n}`)
      parts.push(`http {\n${indentBlock(httpLines.join('\n\n'), '    ')}\n}`)
      code = `${parts.join('\n\n').trim()}\n`
    }
    props.updateSelectedNginxCode(code)
  }

  function addTemplateServer() {
    siteTemplateForm.value.servers.push(createTemplateServer())
    syncMetaState()
    resetExpandedState()
    syncTemplateFormToCode()
  }

  function removeTemplateServer(serverId) {
    const list = siteTemplateForm.value.servers
    if (!Array.isArray(list) || !list.length) return
    if (list.length === 1) {
      list.splice(0, 1, createTemplateServer())
    } else {
      const index = list.findIndex(server => server.id === serverId)
      if (index > -1) list.splice(index, 1)
    }
    syncMetaState()
    resetExpandedState()
    syncTemplateFormToCode()
  }

  function addTemplateLocation(serverId) {
    const server = siteTemplateForm.value.servers.find(item => item.id === serverId)
    if (!server) return
    server.locations.push(createTemplateLocation())
    syncMetaState()
    resetExpandedState()
    syncTemplateFormToCode()
  }

  function removeTemplateLocation(serverId, locationId) {
    const server = siteTemplateForm.value.servers.find(item => item.id === serverId)
    if (!server) return
    if (server.locations.length === 1) {
      server.locations.splice(0, 1, createTemplateLocation())
    } else {
      const index = server.locations.findIndex(item => item.id === locationId)
      if (index > -1) server.locations.splice(index, 1)
    }
    syncMetaState()
    resetExpandedState()
    syncTemplateFormToCode()
  }

  function isHttpsServer(server) {
    const listenLines = String(server?.listenText || '')
      .toLowerCase()
      .split(/\r?\n/)
      .map(item => item.trim())
      .filter(Boolean)
    return listenLines.some(item => item.includes('443') || item.includes('ssl'))
  }

  function switchProtocol(protocol) {
    activeProtocol.value = protocol === 'https' ? 'https' : 'http'
  }

  function buildServerTitle(server) {
    const name = String(server?.serverNameText || '').trim()
    if (name) return name.split(/\s+/)[0]
    return buildPrimaryListen(server) || '未命名 server'
  }

  function buildPrimaryListen(server) {
    return String(server?.listenText || '').trim().split(/\r?\n/).find(Boolean) || 'listen 未设置'
  }

  function buildLocationTitle(location) {
    const type = getLocationMatchType(location)
    const path = String(location?.matcher || '/').trim() || '/'
    const prefix = type === 'exact' ? '= ' : type === 'priority' ? '^~ ' : type === 'regex' ? '~ ' : type === 'regex_i' ? '~* ' : ''
    return `location ${prefix}${path}`
  }

  function buildLocationHint(location) {
    if (location?.mode === 'proxy') return location?.proxyPass ? `代理到 ${location.proxyPass}` : '反向代理'
    if (location?.mode === 'static') return location?.pathDirective === 'alias' ? '静态目录 alias' : '静态目录 root'
    if (location?.mode === 'redirect') return location?.returnRule || '跳转规则'
    return '高级自定义'
  }

  function getFieldType(key = '', value = '') {
    const textareaKeys = ['mainDirectives', 'httpDirectives', 'listenText', 'serverNameText', 'customDirectives']
    const selectOptions = getSelectOptions(key)
    if (selectOptions.length) return 'select'
    if (textareaKeys.includes(String(key || ''))) return 'textarea'
    if (String(value || '').includes('\n')) return 'textarea'
    return 'input'
  }

  function getFieldRows(key = '', value = '') {
    if (['mainDirectives', 'httpDirectives', 'customDirectives'].includes(String(key || ''))) return 6
    if (['listenText', 'serverNameText'].includes(String(key || ''))) return 3
    if (String(value || '').includes('\n')) return 4
    return 3
  }

  function getSelectOptions(key = '') {
    if (key === 'modifier') {
      return [
        { value: '', label: 'prefix' },
        { value: '=', label: '=' },
        { value: '^~', label: '^~' },
        { value: '~', label: '~' },
        { value: '~*', label: '~*' }
      ]
    }
    if (key === 'mode') {
      return [
        { value: 'proxy', label: 'proxy' },
        { value: 'static', label: 'static' },
        { value: 'redirect', label: 'redirect' },
        { value: 'custom', label: 'custom' }
      ]
    }
    if (key === 'pathDirective') {
      return [
        { value: 'root', label: 'root' },
        { value: 'alias', label: 'alias' }
      ]
    }
    return []
  }

  function buildFieldDescriptor(key = '', value = '', wide = false) {
    return {
      key,
      type: getFieldType(key, value),
      rows: getFieldRows(key, value),
      wide,
      options: getSelectOptions(key)
    }
  }

  function getTopLevelFields(model = {}) {
    return Object.keys(model || {})
      .filter(key => key !== 'servers')
      .map(key => buildFieldDescriptor(key, model[key], true))
  }

  function getServerFields(server = {}) {
    return Object.keys(server || {})
      .filter(key => key !== 'id' && key !== 'locations')
      .map(key => buildFieldDescriptor(key, server[key], ['listenText', 'serverNameText', 'customDirectives'].includes(key)))
  }

  function getLocationJsonFields(location = {}) {
    return Object.keys(location || {})
      .filter(key => key !== 'id')
      .map(key => buildFieldDescriptor(key, location[key], ['customDirectives', 'proxyPass', 'returnRule'].includes(key)))
  }

  function setSourceMonacoRef(element) {
    if (!element) {
      sourceMonacoRef.value = null
      disposeSourceMonaco()
      return
    }
    sourceMonacoRef.value = element || null
    if (activeMenu.value === 'source') {
      nextTick(async () => {
        await ensureSourceMonaco()
        syncSourceMonacoContent(false)
      })
    }
  }

  async function ensureSourceMonaco() {
    if (sourceMonacoSession || !sourceMonacoRef.value) return sourceMonacoSession
    if (sourceMonacoInitPromise) return sourceMonacoInitPromise
    sourceMonacoInitPromise = (async () => {
      if (!createSourceMonacoSessionFactory) {
        const monacoModule = await import('../monacoEditor')
        createSourceMonacoSessionFactory = monacoModule.createMonacoEditorSession
      }
      if (sourceMonacoSession || !sourceMonacoRef.value) return sourceMonacoSession
      const session = await createSourceMonacoSessionFactory(sourceMonacoRef.value, {
        readOnly: !props.selectedNginxSiteEditor?.path || props.selectedNginxSiteEditor?.saving,
        onChange: value => {
          if (value === props.selectedNginxSiteEditor?.code) return
          const path = normalizeNginxPath(props.selectedNginxSiteEditor?.path || '')
          props.updateSelectedNginxCode(value)
          scheduleSourceAutoSave(path, value)
        }
      })
      sourceMonacoSession = session
      sourceMonacoSession.editor.updateOptions({
        fontSize: 13,
        lineHeight: 21,
        wordWrap: 'on',
        minimap: { enabled: false },
        padding: { top: 12, bottom: 12 },
        fixedOverflowWidgets: true,
        bracketPairColorization: { enabled: true },
        guides: { bracketPairs: true, indentation: true }
      })
      syncSourceMonacoContent(true)
      requestSourceMonacoLayout()
      return sourceMonacoSession
    })()
    try {
      return await sourceMonacoInitPromise
    } finally {
      sourceMonacoInitPromise = null
    }
  }

  function syncSourceMonacoContent(force = false) {
    if (!sourceMonacoSession) return
    const nextValue = String(props.selectedNginxSiteEditor?.code || '')
    const nextPath = String(props.selectedNginxSiteEditor?.path || 'nginx.conf') || 'nginx.conf'
    const currentModel = sourceMonacoSession.editor.getModel()
    const currentValue = currentModel?.getValue?.() || ''
    const currentPath = currentModel?.uri?.path || ''
    sourceMonacoSession.setReadOnly(!props.selectedNginxSiteEditor?.path || props.selectedNginxSiteEditor?.saving)
    if (!force && currentValue === nextValue && currentPath.endsWith(nextPath)) return
    sourceMonacoSession.setFileContent(nextPath, nextValue)
    requestSourceMonacoLayout()
  }

  function requestSourceMonacoLayout() {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => sourceMonacoSession?.layout?.())
    })
  }

  function disposeSourceMonaco() {
    if (!sourceMonacoSession) return
    sourceMonacoSession.dispose()
    sourceMonacoSession = null
  }
</script>

<style scoped>
  .nginx-page {
    --nginx-radius: 4px;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    min-width: 0;
    gap: 14px;
    overflow-x: hidden;
    overflow-y: hidden;
  }

  .nginx-page .page-hero-line {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, max-content);
    align-items: center;
    gap: 10px;
    width: 100%;
    min-width: 0;
    flex: 0 0 auto;
    overflow: hidden;
  }

  .nginx-page .page-hero-line::after {
    pointer-events: none;
  }

  .nginx-page .page-hero-line > div:first-child {
    min-width: 0;
  }

  .nginx-page .page-hero-line h3 {
    margin: 0;
    white-space: nowrap;
  }

  .nginx-page .service-actions {
    position: relative;
    z-index: 1;
    justify-self: end;
    display: flex;
    flex-wrap: nowrap;
    justify-content: flex-start;
    align-items: center;
    gap: 8px;
    width: max-content;
    min-width: 0;
    max-width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 2px;
    scrollbar-width: thin;
  }

  .nginx-page .service-actions :deep(.el-button) {
    flex: 0 0 auto;
    margin-left: 0;
    white-space: nowrap;
  }

  @media (max-width: 980px) {
    .nginx-page .page-hero-line {
      grid-template-columns: minmax(0, 1fr);
      align-items: start;
      padding: 12px;
    }

    .nginx-page .service-actions {
      justify-self: stretch;
      width: 100%;
    }

    .nginx-page .service-actions :deep(.el-button) {
      min-width: 76px;
    }
  }

  .nginx-layout {
    width: 100%;
    min-width: 0;
    min-height: 0;
    flex: 1 1 auto;
    display: grid;
    grid-template-columns: 196px minmax(0, 1fr);
    gap: 12px;
    align-items: stretch;
    overflow: hidden;
  }

  .nginx-layout--menu-collapsed {
    grid-template-columns: 54px minmax(0, 1fr);
  }

  .nginx-sidebar,
  .nginx-content,
  .nginx-card,
  .nginx-subcard,
  .nginx-server-item,
  .nginx-location-card,
  .nginx-source-editor,
  .nginx-empty-box {
    border: 1px solid rgba(15, 23, 42, 0.08);
    border-radius: var(--nginx-radius);
  }

  .nginx-sidebar {
    min-height: 0;
    align-self: stretch;
    display: grid;
    grid-template-rows: auto auto 1fr;
    gap: 0;
    padding: 8px 0;
    background: #171717;
    border: 0;
    border-radius: 0;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .nginx-sidebar-head,
  .nginx-card-head,
  .nginx-content-head,
  .nginx-overview-item {
    display: grid;
    gap: 4px;
  }

  .nginx-sidebar-head strong,
  .nginx-menu-item strong,
  .nginx-side-stat strong {
    color: #f5f5f5;
  }

  .nginx-sidebar-head p,
  .nginx-menu-item span,
  .nginx-side-stat span {
    margin: 0;
    color: #9ca3af;
    font-size: 12px;
    line-height: 1.6;
  }

  .nginx-sidebar-head {
    grid-template-columns: minmax(0, 1fr) 24px;
    align-items: center;
    padding: 0 12px 8px 16px;
    border-bottom: 1px solid rgba(101, 212, 110, 0.35);
  }

  .nginx-sidebar--collapsed .nginx-sidebar-head {
    grid-template-columns: 1fr;
    justify-items: center;
    padding: 0 0 8px;
  }

  .nginx-sidebar-head strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 14px;
    font-weight: 600;
  }

  .nginx-sidebar--collapsed .nginx-sidebar-head strong {
    display: none;
  }

  .nginx-sidebar-toggle {
    width: 24px;
    height: 24px;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: #9ca3af;
    display: grid;
    place-items: center;
    cursor: pointer;
  }

  .nginx-sidebar-toggle:hover {
    color: #ffffff;
  }

  .nginx-sidebar-toggle-icon {
    font-size: 16px;
  }

  .nginx-sidebar-head::after {
    content: '';
    display: block;
    grid-column: 1 / -1;
    width: 44px;
    height: 1px;
    margin-top: 6px;
    background: #65d46e;
  }

  .nginx-sidebar--collapsed .nginx-sidebar-head::after {
    width: 24px;
  }

  .nginx-menu,
    .nginx-sidebar-foot,
    .nginx-content-body,
  .nginx-stack-list,
  .nginx-server-list,
  .nginx-location-list,
  .nginx-log-board,
  .nginx-file-overview {
    display: grid;
    gap: 12px;
  }

  .nginx-menu-item {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 30px;
    padding: 4px 16px 4px 18px;
    border: 0;
    border-left: 2px solid transparent;
    border-radius: 0;
    background: transparent;
    text-align: left;
    transition: border-color 0.18s ease, background 0.18s ease;
  }

  .nginx-sidebar--collapsed .nginx-menu {
    align-items: center;
    padding-top: 10px;
  }

  .nginx-sidebar--collapsed .nginx-menu-group {
    width: 100%;
    justify-items: center;
  }

  .nginx-sidebar--collapsed .nginx-menu-item {
    grid-template-columns: 1fr;
    justify-items: center;
    width: 40px;
    min-height: 38px;
    padding: 0;
    border-left: 0;
    border-radius: 8px;
  }

  .nginx-sidebar--collapsed .nginx-menu-item:hover,
  .nginx-sidebar--collapsed .nginx-menu-item--active {
    border-left-color: transparent;
    background: rgba(101, 212, 110, 0.14);
  }

  .nginx-sidebar--collapsed .nginx-menu-icon {
    font-size: 17px;
  }

  .nginx-menu-item:hover,
  .nginx-menu-item--active {
    border-left-color: #65d46e;
    background: rgba(255, 255, 255, 0.03);
  }

  .nginx-menu-item strong {
    font-size: 12px;
    font-weight: 600;
    line-height: 1.5;
  }

  .nginx-menu-icon {
    color: #9ca3af;
    font-size: 15px;
    line-height: 1;
    justify-self: center;
  }

  .nginx-menu-item:hover .nginx-menu-icon,
  .nginx-menu-item--active .nginx-menu-icon,
  .nginx-menu-item--active strong {
    color: #ffffff;
  }

  .nginx-menu {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 2px;
    padding-top: 6px;
    align-self: start;
  }

  .nginx-menu-group {
    display: grid;
    gap: 2px;
  }

  .nginx-submenu {
    display: grid;
    gap: 1px;
    padding: 0 0 4px 28px;
  }

  .nginx-submenu-item {
    min-height: 26px;
    padding: 3px 10px;
    border: 0;
    border-left: 1px solid rgba(255, 255, 255, 0.08);
    background: transparent;
    color: #bdbdbd;
    font-size: 12px;
    text-align: left;
  }

  .nginx-submenu-item:hover,
  .nginx-submenu-item--active {
    color: #ffffff;
    border-left-color: #65d46e;
    background: rgba(255, 255, 255, 0.03);
  }

  .nginx-side-stat {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 6px 16px;
    background: transparent;
    border: 0;
    border-radius: 0;
  }

  .nginx-content {
    min-height: 0;
    min-width: 0;
    position: relative;
    align-self: stretch;
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    gap: 0;
    padding: 0;
    background: transparent;
    border-left: 0;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .nginx-content-loading-mask {
    position: absolute;
    inset: 0;
    z-index: 30;
    display: grid;
    place-items: center;
    background: rgba(15, 23, 42, 0.42);
    backdrop-filter: blur(2px);
  }

  .nginx-content-loading-card {
    min-width: 180px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 14px 18px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 10px;
    background: rgba(15, 23, 42, 0.88);
    color: #f8fafc;
    box-shadow: 0 18px 44px rgba(0, 0, 0, 0.28);
  }

  .nginx-content-loading-card strong {
    font-size: 13px;
    font-weight: 600;
  }

  .nginx-content-loading-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.24);
    border-top-color: #65d46e;
    border-radius: 50%;
    animation: nginx-content-loading-spin 0.8s linear infinite;
  }

  @keyframes nginx-content-loading-spin {
    to { transform: rotate(360deg); }
  }

  .nginx-content--source {
    grid-template-rows: minmax(0, 1fr);
    gap: 0;
    overflow: hidden;
  }

  .nginx-content--topology {
    grid-template-rows: minmax(0, 1fr);
    overflow: hidden;
  }

  .nginx-content--compose {
    grid-template-rows: minmax(0, 1fr);
    gap: 0;
    padding: 0;
    overflow: hidden;
  }

  .nginx-content--ssl {
    grid-template-rows: minmax(0, 1fr);
    overflow: hidden;
  }

  .nginx-content--source .nginx-content-body,
  .nginx-content--topology .nginx-content-body,
  .nginx-content--compose .nginx-content-body {
    min-height: 0;
    min-width: 0;
    height: 100%;
    align-self: stretch;
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    align-content: stretch;
    overflow: hidden;
  }

  .nginx-content--ssl .nginx-content-body {
    min-height: 0;
    min-width: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow: hidden;
  }

  .nginx-content-head h4 {
    margin: 0;
    color: #f5f5f5;
    font-size: 15px;
    font-weight: 700;
  }

  .nginx-content-head p,
  .nginx-card-head span,
  .nginx-subcard span,
  .nginx-overview-item span,
  .nginx-muted,
  .nginx-empty-box,
  .nginx-server-item span,
  .nginx-overview-item strong {
    margin: 0;
    color: #a3a3a3;
    font-size: 12px;
    line-height: 1.7;
  }

  .nginx-content-head {
    padding: 0 18px 10px 0;
    border-bottom: 1px solid rgba(101, 212, 110, 0.35);
  }

  .nginx-path-card {
    padding-bottom: 8px;
  }

  .nginx-path-bar {
    padding: 8px 12px;
    border: 1px solid rgba(101, 212, 110, 0.18);
    border-radius: var(--nginx-radius);
    background: rgba(255, 255, 255, 0.03);
  }

  .nginx-path-bar strong {
    color: #f5f5f5;
    font-size: 16px;
    font-weight: 700;
    line-height: 1.4;
    word-break: break-all;
  }

  .nginx-section-bar {
    padding: 8px 12px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--nginx-radius);
    background: rgba(255, 255, 255, 0.03);
  }

  .nginx-card,
  .nginx-subcard,
  .nginx-location-card,
  .nginx-empty-box,
  .nginx-file-overview {
    min-width: 0;
    padding: 0 18px 18px 0;
    background: transparent;
    border: 0;
    border-radius: 0;
  }

  .nginx-card,
  .nginx-location-card {
    display: grid;
    gap: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .nginx-form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }

  .nginx-field {
    display: grid;
    gap: 6px;
  }

  .nginx-field--wide {
    grid-column: 1 / -1;
  }

  .nginx-field span {
    color: #e5e7eb;
    font-size: 12px;
    font-weight: 600;
    line-height: 1.6;
  }

  .nginx-field span em {
    margin-left: 6px;
    color: #8d8d93;
    font-size: 10px;
    font-style: normal;
    font-weight: 500;
  }

  .nginx-nested-title strong em {
    margin-left: 6px;
    color: #8d8d93;
    font-size: 10px;
    font-style: normal;
    font-weight: 600;
  }

  .nginx-listen-section {
    display: grid;
    gap: 10px;
  }

  .nginx-listen-list {
    display: grid;
    gap: 8px;
  }

  .nginx-listen-item {
    display: grid;
    gap: 10px;
    padding: 10px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--nginx-radius);
    background: rgba(255, 255, 255, 0.025);
  }

  .nginx-listen-main-row {
    display: grid;
    grid-template-columns: minmax(180px, 1.2fr) 92px 118px minmax(220px, 1.5fr) auto;
    align-items: end;
    gap: 8px;
  }

  .nginx-listen-flags-row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    padding-top: 2px;
  }

  .nginx-field--compact {
    gap: 4px;
  }

  .nginx-field--compact span {
    font-size: 11px;
  }

  .nginx-check-field {
    min-height: 30px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 0 4px 2px;
    color: #d4d4d8;
    font-size: 11px;
    white-space: nowrap;
  }

  .nginx-check-field input {
    width: 14px;
    height: 14px;
    accent-color: #65d46e;
  }

  .nginx-settings-summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }

  .nginx-settings-summary > div,
  .nginx-settings-warning {
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--nginx-radius);
    background: rgba(255, 255, 255, 0.03);
  }

  .nginx-settings-summary > div {
    display: grid;
    gap: 4px;
    padding: 12px;
  }

  .nginx-settings-summary strong {
    color: #f5f5f5;
    font-size: 20px;
    line-height: 1.2;
  }

  .nginx-settings-summary span {
    color: #a1a1aa;
    font-size: 11px;
  }

  .nginx-settings-warning {
    padding: 10px 12px;
    color: #fbbf24;
    font-size: 12px;
    line-height: 1.5;
  }

  .nginx-ssl-summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }

  .nginx-ssl-summary > div {
    display: grid;
    gap: 4px;
    padding: 12px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--nginx-radius);
    background: rgba(255, 255, 255, 0.03);
  }

  .nginx-ssl-summary strong {
    color: #f5f5f5;
    font-size: 20px;
    line-height: 1.2;
  }

  .nginx-ssl-summary span {
    color: #a1a1aa;
    font-size: 11px;
  }

  .nginx-ssl-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 14px;
  }

  .nginx-ssl-actions button,
  .nginx-ssl-ref-card .nginx-inline-actions button {
    min-height: 30px;
    padding: 6px 12px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: var(--nginx-radius);
    background: #202020;
    color: #d4d4d8;
    font-size: 12px;
    cursor: pointer;
  }

  .nginx-ssl-actions button:disabled,
  .nginx-ssl-ref-card .nginx-inline-actions button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .nginx-ssl-actions-primary {
    border-color: rgba(101, 212, 110, 0.45) !important;
    background: rgba(101, 212, 110, 0.12) !important;
    color: #86efac !important;
  }

  .nginx-ssl-actions-primary:hover:not(:disabled) {
    border-color: rgba(101, 212, 110, 0.72) !important;
    background: rgba(101, 212, 110, 0.2) !important;
    color: #bbf7d0 !important;
  }

  .nginx-ssl-ref-list {
    display: grid;
    gap: 12px;
  }

  .nginx-ssl-ref-card {
    display: grid;
    gap: 12px;
    padding: 12px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--nginx-radius);
    background: rgba(255, 255, 255, 0.025);
  }

  .nginx-ssl-ref-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .nginx-ssl-ref-head > div {
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  .nginx-ssl-ref-head strong {
    color: #f5f5f5;
    font-size: 14px;
  }

  .nginx-ssl-ref-head span {
    min-width: 0;
    color: #a1a1aa;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nginx-ssl-badge {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 4px 8px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #d4d4d8;
    font-size: 11px;
    font-style: normal;
    font-weight: 700;
    white-space: nowrap;
  }

  .nginx-ssl-badge--normal {
    border-color: rgba(34, 197, 94, 0.35);
    background: rgba(34, 197, 94, 0.12);
    color: #86efac;
  }

  .nginx-ssl-badge--warning,
  .nginx-ssl-badge--loading {
    border-color: rgba(251, 191, 36, 0.35);
    background: rgba(251, 191, 36, 0.12);
    color: #fbbf24;
  }

  .nginx-ssl-badge--expired,
  .nginx-ssl-badge--missing,
  .nginx-ssl-badge--error {
    border-color: rgba(248, 113, 113, 0.35);
    background: rgba(248, 113, 113, 0.12);
    color: #fca5a5;
  }

  .nginx-ssl-ref-grid {
    display: grid;
    grid-template-columns: 84px minmax(0, 1fr);
    gap: 8px 10px;
  }

  .nginx-ssl-ref-grid label {
    color: #8d8d93;
    font-size: 11px;
  }

  .nginx-ssl-ref-grid span {
    min-width: 0;
    color: #e5e7eb;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nginx-ssl-ref-grid span em {
    margin-left: 8px;
    color: #fca5a5;
    font-size: 11px;
    font-style: normal;
  }

  .nginx-ssl-add-button,
  .nginx-ssl-table-tools button,
  .nginx-ssl-more-button,
  .nginx-ssl-more-menu button,
  .nginx-ssl-drawer-actions button,
  .nginx-ssl-mode-tabs button {
    min-height: 30px;
    padding: 6px 12px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: var(--nginx-radius);
    background: #202020;
    color: #d4d4d8;
    font-size: 12px;
    cursor: pointer;
  }

  .nginx-ssl-add-button:disabled,
  .nginx-ssl-table-tools button:disabled,
  .nginx-ssl-more-button:disabled,
  .nginx-ssl-more-menu button:disabled,
  .nginx-ssl-drawer-actions button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .nginx-ssl-add-button:hover:not(:disabled),
  .nginx-ssl-table-tools button:hover:not(:disabled),
  .nginx-ssl-drawer-actions button:hover:not(:disabled),
  .nginx-ssl-mode-tabs button:hover:not(:disabled) {
    border-color: rgba(101, 212, 110, 0.45);
    background: rgba(101, 212, 110, 0.12);
    color: #86efac;
  }

  .nginx-ssl-table-tools {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .nginx-ssl-table-wrap {
    width: 100%;
    max-width: 100%;
    min-height: 0;
    min-width: 0;
    flex: 1 1 auto;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--nginx-radius);
  }

  .nginx-ssl-pagination {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    flex-wrap: nowrap;
    gap: 6px;
    flex: 0 0 auto;
    min-height: 44px;
    padding-top: 8px;
    color: #475569;
    font-size: 12px;
    overflow-x: auto;
    overflow-y: hidden;
    white-space: nowrap;
  }

  .nginx-ssl-pagination button,
  .nginx-ssl-pagination select,
  .nginx-ssl-pagination input {
    height: 28px;
    border: 1px solid #dbe3ea;
    border-radius: 0;
    background: #ffffff;
    color: #334155;
    font-size: 12px;
    outline: none;
  }

  .nginx-ssl-pagination button {
    min-width: 30px;
    padding: 0 8px;
    cursor: pointer;
  }

  .nginx-ssl-pagination button:disabled {
    cursor: not-allowed;
    opacity: 0.48;
  }

  .nginx-ssl-pagination select {
    padding: 0 8px;
  }

  .nginx-ssl-pagination label {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
  }

  .nginx-ssl-pagination input {
    width: 54px;
    padding: 0 6px;
  }

  .nginx-ssl-pagination .nginx-ssl-pagination-page--active {
    border-color: #16a34a;
    background: #16a34a;
    color: #ffffff;
    font-weight: 700;
  }

  .nginx-ssl-el-table {
    width: 100%;
    min-width: 0;
    height: 100%;
  }

  :deep(.nginx-ssl-el-table .el-table__inner-wrapper),
  :deep(.nginx-ssl-el-table .el-scrollbar),
  :deep(.nginx-ssl-el-table .el-scrollbar__wrap),
  :deep(.nginx-ssl-el-table .el-scrollbar__view) {
    min-width: 100%;
    height: 100%;
  }

  :deep(.nginx-ssl-el-table .el-table__empty-block) {
    min-height: 120px !important;
    max-height: 100% !important;
    height: 100% !important;
  }

  .nginx-ssl-status-text {
    font-size: 12px;
    font-weight: 700;
  }

  .nginx-ssl-status-text--normal {
    color: #16a34a;
  }

  .nginx-ssl-status-text--warning,
  .nginx-ssl-status-text--loading {
    color: #d97706;
  }

  .nginx-ssl-status-text--expired,
  .nginx-ssl-status-text--missing,
  .nginx-ssl-status-text--error {
    color: #dc2626;
  }

  .nginx-ssl-status-text--unknown {
    color: #64748b;
  }

  .nginx-ssl-table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
  }

  .nginx-ssl-table th,
  .nginx-ssl-table td {
    padding: 10px 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    text-align: left;
    vertical-align: top;
    font-size: 12px;
  }

  .nginx-ssl-table th {
    color: #a1a1aa;
    background: rgba(255, 255, 255, 0.035);
    font-weight: 700;
  }

  .nginx-ssl-table td span {
    display: block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nginx-ssl-table td span {
    color: #d4d4d8;
  }

  .nginx-ssl-table td small {
    display: block;
    margin-top: 4px;
    max-width: 100%;
    overflow: hidden;
    color: #a1a1aa;
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nginx-ssl-more-wrap {
    position: relative;
    display: inline-flex;
  }

  .nginx-ssl-more-button {
    min-width: 64px;
    white-space: nowrap;
  }

  .nginx-ssl-more-menu {
    position: fixed;
    z-index: 3000;
    display: grid;
    gap: 4px;
    width: 148px;
    padding: 6px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--nginx-radius);
    background: #171717;
    box-shadow: 0 16px 32px rgba(0, 0, 0, 0.32);
  }

  .nginx-ssl-more-menu button {
    width: 100%;
    min-height: 28px;
    padding: 5px 8px;
    text-align: left;
    white-space: nowrap;
  }

  .nginx-ssl-detail-content .nginx-drawer-grid span {
    white-space: normal;
    word-break: break-all;
  }

  .nginx-ssl-output {
    display: grid;
    gap: 8px;
    margin-top: 12px;
  }

  .nginx-ssl-output strong {
    color: #f5f5f5;
    font-size: 13px;
  }

  .nginx-ssl-output pre {
    max-height: 220px;
    margin: 0;
    padding: 12px;
    overflow: auto;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--nginx-radius);
    background: #111111;
    color: #d4d4d8;
    font-size: 12px;
    line-height: 1.5;
    white-space: pre-wrap;
  }

  .nginx-ssl-drawer-content {
    gap: 16px;
  }

  .nginx-ssl-mode-tabs {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .nginx-ssl-mode-tab--active {
    border-color: rgba(101, 212, 110, 0.45) !important;
    background: rgba(101, 212, 110, 0.12) !important;
    color: #86efac !important;
  }

  .nginx-form-grid--single {
    grid-template-columns: 1fr;
  }

  .nginx-ssl-drawer-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding-top: 4px;
  }

  .nginx-ssl-badge--unknown {
    border-color: rgba(148, 163, 184, 0.35);
    background: rgba(148, 163, 184, 0.12);
    color: #cbd5e1;
  }

  .nginx-field--disabled span,
  .nginx-field input:disabled,
  .nginx-field textarea:disabled,
  .nginx-field select:disabled {
    color: #71717a;
  }

  .nginx-field input:disabled,
  .nginx-field textarea:disabled,
  .nginx-field select:disabled {
    cursor: not-allowed;
    background: #1d1d1d;
    border-color: rgba(255, 255, 255, 0.06);
  }

  .nginx-meta-editor-bar {
    align-items: center;
    gap: 12px;
    padding: 8px 10px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--nginx-radius);
    background: rgba(255, 255, 255, 0.03);
  }

  .nginx-meta-editor-fields {
    min-width: 0;
    flex: 1 1 auto;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 10px;
  }

  .nginx-inline-field {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .nginx-inline-field span {
    color: #cfcfd4;
    font-size: 11px;
    font-weight: 600;
    flex: 0 0 auto;
    white-space: nowrap;
  }

  .nginx-inline-field input {
    flex: 1 1 auto;
    width: auto;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: var(--nginx-radius);
    background: #232323;
    color: #f5f5f5;
    font-size: 12px;
    min-height: 28px;
    padding: 4px 8px;
    outline: none;
  }

  .nginx-inline-field input:focus {
    border-color: rgba(101, 212, 110, 0.55);
    box-shadow: 0 0 0 2px rgba(101, 212, 110, 0.08);
    background: #252525;
  }

  .nginx-icon-button--dirty {
    border-color: rgba(101, 212, 110, 0.55) !important;
    background: rgba(101, 212, 110, 0.1) !important;
    color: #9ae6a3 !important;
  }

  .nginx-field input,
  .nginx-field textarea,
  .nginx-field select {
    width: 100%;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: var(--nginx-radius);
    background: #232323;
    color: #f5f5f5;
    font-size: 13px;
    min-height: 30px;
    padding: 5px 8px;
    outline: none;
  }

  .nginx-field textarea {
    min-height: 56px;
    padding-top: 5px;
    padding-bottom: 5px;
    line-height: 1.45;
  }

  .nginx-field input:focus,
  .nginx-field textarea:focus,
  .nginx-field select:focus,
  .nginx-source-editor:focus {
    border-color: rgba(101, 212, 110, 0.55);
    box-shadow: 0 0 0 2px rgba(101, 212, 110, 0.08);
    background: #252525;
  }

  .nginx-chip-row,
  .nginx-inline-actions,
  .nginx-protocol-bar,
  .nginx-toolbar-row,
  .nginx-card-head--row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .nginx-toolbar-row,
  .nginx-card-head--row {
    justify-content: space-between;
  }

  .nginx-card-head--clickable {
    cursor: pointer;
  }

  .nginx-card-head--clickable:hover {
    background: rgba(255, 255, 255, 0.02);
  }

  .nginx-chip,
  .nginx-protocol-btn {
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: var(--nginx-radius);
    background: #202020;
    color: #d4d4d8;
    font-size: 12px;
    padding: 8px 12px;
  }

  .nginx-chip--active,
  .nginx-protocol-btn--active {
    border-color: rgba(101, 212, 110, 0.55);
    background: rgba(101, 212, 110, 0.08);
    color: #86efac;
  }

  .nginx-server-tabs-wrap {
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .nginx-server-tabs-scroll {
    min-width: max-content;
    display: inline-flex;
    align-items: stretch;
    gap: 0;
  }

  .nginx-server-tab {
    min-width: 128px;
    display: grid;
    gap: 2px;
    padding: 8px 12px 7px;
    border: 0;
    border-right: 1px solid rgba(255, 255, 255, 0.06);
    border-bottom: 2px solid transparent;
    border-radius: 0;
    background: #1c1c1c;
    color: #d4d4d8;
    text-align: left;
  }

  .nginx-server-tab strong {
    color: #f5f5f5;
    font-size: 12px;
    font-weight: 600;
  }

  .nginx-server-tab span,
  .nginx-server-tab small {
    color: #8d8d93;
    font-size: 10px;
    line-height: 1.5;
  }

  .nginx-server-tab--active {
    border-bottom-color: rgba(101, 212, 110, 0.8);
    background: #232323;
  }

  .nginx-server-tab:hover {
    background: #212121;
  }

  .nginx-location-tabs-wrap {
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .nginx-location-tabs-scroll {
    min-width: max-content;
    display: inline-flex;
    align-items: stretch;
    gap: 0;
  }

  .nginx-location-tab {
    min-width: 136px;
    display: grid;
    gap: 2px;
    padding: 7px 11px 6px;
    border: 0;
    border-right: 1px solid rgba(255, 255, 255, 0.06);
    border-bottom: 2px solid transparent;
    border-radius: 0;
    background: rgba(0, 0, 0, 0.12);
    color: #d4d4d8;
    text-align: left;
  }

  .nginx-location-tab strong {
    color: #f5f5f5;
    font-size: 11px;
    font-weight: 600;
  }

  .nginx-location-tab span {
    color: #8d8d93;
    font-size: 10px;
    line-height: 1.5;
  }

  .nginx-location-tab--active {
    border-bottom-color: rgba(101, 212, 110, 0.8);
    background: rgba(255, 255, 255, 0.04);
  }

  .nginx-location-tab:hover {
    background: rgba(255, 255, 255, 0.03);
  }

  .nginx-server-list {
    grid-template-columns: 1fr;
  }

  .nginx-server-item {
    display: grid;
    gap: 4px;
    padding: 10px 12px;
    background: #202020;
    text-align: left;
  }

  .nginx-server-item strong,
  .nginx-card-head strong,
  .nginx-subcard strong,
  .nginx-overview-item strong {
    color: #f5f5f5;
    font-size: 14px;
    font-weight: 700;
  }

  .nginx-server-item:hover,
  .nginx-server-item--active {
    border-color: rgba(101, 212, 110, 0.48);
    background: #242424;
  }

  .nginx-location-card {
    background: transparent;
    padding-top: 4px;
  }

  .nginx-json-stack {
    display: grid;
    gap: 16px;
  }

  .nginx-level-block {
    padding: 14px 16px 16px;
    border: 1px solid rgba(101, 212, 110, 0.18);
    border-radius: var(--nginx-radius);
    background: rgba(255, 255, 255, 0.025);
  }

  .nginx-server-block-card {
    background: linear-gradient(180deg, rgba(101, 212, 110, 0.05), rgba(255, 255, 255, 0.025));
    box-shadow: inset 0 0 0 1px rgba(101, 212, 110, 0.06);
  }

  .nginx-level-block > .nginx-card-head:first-child {
    padding-bottom: 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .nginx-server-block-card > .nginx-card-head:first-child {
    margin: -14px -16px 12px;
    padding: 12px 16px 10px;
    background: rgba(101, 212, 110, 0.08);
    border-bottom: 1px solid rgba(101, 212, 110, 0.18);
  }

  .nginx-json-stack--nested {
    margin-left: 26px;
    padding: 10px 0 0 22px;
    border-left: 3px solid rgba(101, 212, 110, 0.28);
  }

  .nginx-location-group {
    padding: 10px 0 4px 0;
    background: linear-gradient(180deg, rgba(101, 212, 110, 0.03), rgba(0, 0, 0, 0.1));
    border-radius: 0 0 var(--nginx-radius) var(--nginx-radius);
  }

  .nginx-level-block--nested {
    padding: 12px 14px 14px;
    border: 1px solid rgba(101, 212, 110, 0.14);
    background: rgba(255, 255, 255, 0.035);
  }

  .nginx-location-child-card {
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.03);
  }

  .nginx-location-child-card > .nginx-card-head:first-child {
    margin: -12px -14px 12px;
    padding: 10px 14px 8px;
    background: rgba(255, 255, 255, 0.03);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .nginx-nested-head {
    margin-top: 4px;
    padding-top: 8px;
    border-top: 1px dashed rgba(101, 212, 110, 0.22);
  }

  .nginx-nested-title {
    display: grid;
    gap: 2px;
  }

  .nginx-level-title {
    display: grid;
    gap: 4px;
  }

  .nginx-collapse-head {
    min-width: 0;
    display: inline-flex;
    align-items: flex-start;
    gap: 10px;
    padding: 0;
    border: 0;
    background: transparent;
    text-align: left;
    color: inherit;
  }

  .nginx-collapse-head--nested {
    align-items: center;
  }

  .nginx-collapse-arrow {
    width: 12px;
    color: #c4c4c8;
    font-size: 12px;
    line-height: 1.3;
    flex: 0 0 12px;
    text-align: center;
  }

  .nginx-level-badge {
    display: inline-flex;
    align-items: center;
    width: fit-content;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
  }

  .nginx-level-badge--server {
    background: rgba(101, 212, 110, 0.12);
    color: #9ae6a3;
  }

  .nginx-nested-title span {
    color: #8f8f8f;
    font-size: 11px;
    line-height: 1.5;
  }

  .nginx-tip-box {
    padding: 10px 12px;
    border: 1px dashed rgba(101, 212, 110, 0.28);
    background: rgba(101, 212, 110, 0.04);
    color: #bef264;
    font-size: 12px;
    line-height: 1.7;
  }

  .nginx-simple-table {
    overflow: hidden;
  }

  .nginx-simple-row {
    display: grid;
    grid-template-columns: 2fr 1fr 1.2fr 1.2fr;
    gap: 12px;
    padding: 12px 14px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    color: #d4d4d8;
    font-size: 12px;
    line-height: 1.6;
  }

  .nginx-simple-row:first-child {
    border-top: 0;
  }

  .nginx-simple-row--head {
    background: #202020;
    color: #f5f5f5;
    font-weight: 700;
  }

  .nginx-compose-card {
    min-height: 0;
    height: 100%;
    overflow: hidden;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 12px;
  }

  .nginx-compose-save-summary {
    display: grid;
    gap: 8px;
    padding: 12px 14px;
    border: 1px solid rgba(2, 132, 199, 0.16);
    border-radius: var(--nginx-radius);
    background: linear-gradient(135deg, rgba(240, 249, 255, 0.9) 0%, rgba(248, 250, 252, 0.96) 100%);
  }

  .nginx-compose-save-summary > div:first-child {
    display: grid;
    gap: 4px;
  }

  .nginx-compose-save-summary strong {
    color: #0f172a;
    font-size: 13px;
  }

  .nginx-compose-save-summary span {
    color: #475569;
    font-size: 12px;
    line-height: 1.5;
  }

  .nginx-compose-save-summary-metrics,
  .nginx-compose-save-summary-paths {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .nginx-compose-save-summary-metrics em,
  .nginx-compose-save-summary-paths span {
    padding: 4px 8px;
    border-radius: 999px;
    background: #ffffff;
    color: #0369a1;
    font-size: 11px;
    font-style: normal;
    border: 1px solid rgba(2, 132, 199, 0.14);
  }

  .nginx-compose-save-summary-paths span {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nginx-compose-favorites {
    display: grid;
    gap: 14px;
  }

  .nginx-compose-favorites-drawer {
    background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  }

  .nginx-compose-favorites-drawer :deep(.el-drawer__body) {
    padding: 18px;
    overflow: auto;
    background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  }

  .nginx-compose-favorites-head {
    display: grid;
    gap: 4px;
    padding: 12px;
    border: 1px solid #e5e7eb;
    border-radius: var(--nginx-radius);
    background: #f8fafc;
  }

  .nginx-compose-favorites-head > div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-width: 0;
  }

  .nginx-compose-favorites-head button {
    padding: 4px 10px;
    border: 1px solid #dbe3ea;
    border-radius: 999px;
    background: #ffffff;
    color: #475569;
    font-size: 12px;
    cursor: pointer;
  }

  .nginx-compose-favorites-head button:hover {
    border-color: #94a3b8;
    background: #f1f5f9;
  }

  .nginx-compose-favorites-head strong,
  .nginx-compose-favorite-empty strong {
    color: #0f172a;
    font-size: 13px;
  }

  .nginx-compose-favorites-head span,
  .nginx-compose-favorite-empty span {
    color: #64748b;
    font-size: 12px;
    line-height: 1.5;
  }

  .nginx-compose-favorite-list {
    display: grid;
    gap: 10px;
  }

  .nginx-compose-favorite-card {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 10px;
    padding: 12px;
    border: 1px solid rgba(15, 23, 42, 0.1);
    border-radius: var(--nginx-radius);
    background: #ffffff;
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
    cursor: grab;
  }

  .nginx-compose-favorite-card:active {
    cursor: grabbing;
  }

  .nginx-compose-favorite-card div {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .nginx-compose-favorite-card strong {
    min-width: 0;
    overflow: hidden;
    color: #0f172a;
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nginx-compose-favorite-card span {
    color: #94a3b8;
    font-size: 11px;
  }

  .nginx-compose-favorite-card em {
    padding: 3px 8px;
    border-radius: 999px;
    background: #e0f2fe;
    color: #0369a1;
    font-size: 11px;
    font-style: normal;
  }

  .nginx-compose-favorite-more {
    width: 28px;
    height: 28px;
    border: 1px solid #e5e7eb;
    border-radius: 999px;
    background: #ffffff;
    color: #475569;
    cursor: pointer;
  }

  .nginx-compose-favorite-more:hover {
    background: #f1f5f9;
  }

  .nginx-compose-favorite-empty {
    display: grid;
    gap: 6px;
    padding: 24px 14px;
    border: 1px dashed #cbd5e1;
    border-radius: var(--nginx-radius);
    background: #f8fafc;
    text-align: center;
  }

  :global(.nginx-compose-template-detail-dialog) {
    width: min(560px, calc(100vw - 40px));
  }

  :global(.nginx-compose-template-detail-table) {
    width: 100%;
    border-collapse: collapse;
    overflow: hidden;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    font-size: 13px;
  }

  :global(.nginx-compose-template-detail-table tr + tr) {
    border-top: 1px solid #eef2f7;
  }

  :global(.nginx-compose-template-detail-table th),
  :global(.nginx-compose-template-detail-table td) {
    padding: 9px 11px;
    text-align: left;
    vertical-align: top;
  }

  :global(.nginx-compose-template-detail-table th) {
    width: 132px;
    background: #f8fafc;
    color: #475569;
    font-weight: 700;
    white-space: nowrap;
  }

  :global(.nginx-compose-template-detail-table td) {
    color: #0f172a;
    line-height: 1.45;
    word-break: break-word;
  }

  .nginx-content--compose .nginx-card {
    position: relative;
    display: grid;
    min-height: 0;
    height: 100%;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    padding: 0;
    border: 0;
    border-radius: 0;
    box-shadow: none;
    overflow: hidden;
  }

  .nginx-topology-card {
    position: relative;
    gap: 0;
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    min-height: 0;
    height: 100%;
    overflow: hidden;
  }

  .nginx-topology-mode-switch {
    position: absolute;
    left: 18px;
    top: 18px;
    z-index: 6;
    display: inline-flex;
    gap: 4px;
    padding: 5px;
    border: 1px solid #dbe3ea;
    border-radius: var(--nginx-radius);
    background: rgba(255, 255, 255, 0.92);
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.1);
    backdrop-filter: blur(8px);
  }

  .nginx-topology-mode-switch button {
    padding: 6px 10px;
    border: 0;
    border-radius: var(--nginx-radius);
    background: transparent;
    color: #64748b;
    font-size: 12px;
    cursor: pointer;
  }

  .nginx-topology-mode-switch button:hover {
    color: #16a34a;
  }

  .nginx-topology-mode-switch--active {
    background: #16a34a !important;
    color: #ffffff !important;
  }

  .nginx-topology-include,
  .nginx-topology-node,
  .nginx-topology-empty {
    border: 1px solid #e5e7eb;
    border-radius: var(--nginx-radius);
    background: #ffffff;
  }

  .nginx-topology-node span,
  .nginx-topology-node small,
  .nginx-topology-include span,
  .nginx-topology-include small {
    color: #64748b;
    font-size: 11px;
    line-height: 1.5;
  }

  .nginx-topology-node strong,
  .nginx-topology-include strong {
    min-width: 0;
    color: #111827;
    font-size: 12px;
    font-weight: 700;
    line-height: 1.5;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nginx-topology-canvas {
    display: grid;
    grid-template-columns: minmax(220px, 0.34fr) minmax(0, 1fr);
    gap: 18px;
    min-height: 420px;
    padding: 18px;
    border: 1px solid #e5e7eb;
    border-radius: var(--nginx-radius);
    background:
      linear-gradient(90deg, rgba(34, 197, 94, 0.05) 1px, transparent 1px),
      linear-gradient(180deg, rgba(34, 197, 94, 0.05) 1px, transparent 1px),
      #f8fafc;
    background-size: 28px 28px;
  }

  .nginx-topology-trunk {
    display: flex;
    align-items: center;
    position: relative;
  }

  .nginx-topology-trunk::after {
    content: '';
    position: absolute;
    left: calc(100% - 4px);
    right: -18px;
    top: 50%;
    height: 3px;
    background: linear-gradient(90deg, #22c55e, rgba(34, 197, 94, 0.25));
    border-radius: 999px;
  }

  .nginx-topology-branches {
    display: grid;
    gap: 14px;
  }

  .nginx-topology-branch {
    display: grid;
    grid-template-columns: 22px minmax(180px, 0.3fr) minmax(0, 1fr);
    gap: 12px;
    align-items: stretch;
  }

  .nginx-topology-branch-line {
    position: relative;
  }

  .nginx-topology-branch-line::before,
  .nginx-topology-branch-line::after {
    content: '';
    position: absolute;
    background: #22c55e;
    border-radius: 999px;
  }

  .nginx-topology-branch-line::before {
    left: 10px;
    top: 0;
    bottom: 0;
    width: 3px;
  }

  .nginx-topology-branch-line::after {
    left: 10px;
    right: -12px;
    top: 50%;
    height: 3px;
  }

  .nginx-topology-include {
    display: grid;
    gap: 4px;
    align-self: center;
    padding: 10px 12px;
    position: relative;
  }

  .nginx-topology-include::before,
  .nginx-topology-include::after,
  .nginx-topology-node::before,
  .nginx-topology-node::after {
    content: '';
    position: absolute;
    top: 50%;
    width: 10px;
    height: 10px;
    border: 2px solid #22c55e;
    border-radius: 50%;
    background: #ffffff;
    transform: translateY(-50%);
    z-index: 2;
  }

  .nginx-topology-include::before,
  .nginx-topology-node::before {
    left: -6px;
  }

  .nginx-topology-include::after,
  .nginx-topology-node::after {
    right: -6px;
  }

  .nginx-topology-files {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 10px;
    align-content: center;
    position: relative;
  }

  .nginx-topology-files::before {
    content: '';
    position: absolute;
    left: -12px;
    right: calc(100% - 6px);
    top: 50%;
    height: 3px;
    border-radius: 999px;
    background: #22c55e;
  }

  .nginx-topology-node {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr);
    align-items: center;
    gap: 6px;
    min-width: 0;
    padding: 14px 34px;
    text-align: left;
    cursor: pointer;
    position: relative;
    transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
  }

  .nginx-topology-node--file::before {
    box-shadow: -14px 0 0 -3px #22c55e;
  }

  .nginx-topology-node--main::before {
    display: none;
  }

  .nginx-topology-empty::before,
  .nginx-topology-empty::after {
    content: none;
  }

  .nginx-topology-node:hover:not(:disabled) {
    border-color: rgba(34, 197, 94, 0.65);
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
    transform: translateY(-1px);
  }

  .nginx-topology-node:disabled {
    cursor: not-allowed;
    opacity: 0.65;
  }

  .nginx-topology-node--main {
    width: 100%;
    border-color: rgba(34, 197, 94, 0.5);
    background: #ecfdf5;
  }

  .nginx-topology-node--file {
    background: #ffffff;
  }

  .nginx-topology-node--active {
    border-color: #22c55e;
    box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.12);
  }

  .nginx-topology-server-list {
    display: grid;
    gap: 4px;
    margin-top: 4px;
  }

  .nginx-topology-server-list em {
    min-width: 0;
    padding: 3px 6px;
    border-radius: var(--nginx-radius);
    background: #ecfdf5;
    color: #166534;
    font-size: 11px;
    font-style: normal;
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nginx-topology-canvas {
    position: relative;
    display: block;
    min-height: 0;
    height: 100%;
    overflow: auto;
    user-select: none;
  }

  .nginx-topology-canvas--connecting {
    cursor: crosshair;
  }

  .nginx-topology-graph-space {
    position: relative;
    min-width: 100%;
    min-height: 100%;
  }

  .nginx-topology-graph-surface {
    position: relative;
    transform-origin: 0 0;
  }

  .nginx-topology-lines {
    position: absolute;
    inset: 0;
    min-width: 1180px;
    pointer-events: auto;
    z-index: 1;
  }

  .nginx-topology-line {
    fill: none;
    stroke: var(--nginx-topology-edge-color, #22c55e);
    stroke-width: 3;
    stroke-linecap: round;
    pointer-events: stroke;
    cursor: pointer;
    filter: drop-shadow(0 2px 3px color-mix(in srgb, var(--nginx-topology-edge-color, #22c55e) 28%, transparent));
  }

  .nginx-topology-line--file {
    stroke: var(--nginx-topology-edge-color, #38bdf8);
  }

  .nginx-topology-line--missing {
    stroke: #94a3b8;
    stroke-dasharray: 7 7;
  }

  .nginx-topology-line--custom,
  .nginx-topology-line--draft {
    stroke: var(--nginx-topology-edge-color, #f97316);
    stroke-width: 3.5;
  }

  .nginx-topology-line--selected {
    stroke: #f97316;
    stroke-width: 5;
    filter: drop-shadow(0 0 9px rgba(249, 115, 22, 0.45));
  }

  .nginx-topology-line--port-active {
    stroke-width: 5;
    filter: drop-shadow(0 0 9px color-mix(in srgb, var(--nginx-topology-edge-color, #f97316) 42%, transparent));
  }

  .nginx-topology-line--draft {
    stroke-dasharray: 9 6;
  }

  .nginx-topology-draft-port {
    fill: #f97316;
    stroke: #ffffff;
    stroke-width: 3;
    filter: drop-shadow(0 2px 8px rgba(249, 115, 22, 0.35));
    pointer-events: none;
  }

  .nginx-topology-edge-endpoint {
    position: absolute;
    z-index: 5;
    box-sizing: border-box;
    border: 2px solid var(--nginx-topology-edge-color, #22c55e);
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.82);
    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.62), 0 4px 10px rgba(15, 23, 42, 0.16);
    pointer-events: none;
  }

  .nginx-topology-edge-endpoint--active {
    border-width: 3px;
    background: #ffffff;
    box-shadow: 0 0 0 5px color-mix(in srgb, var(--nginx-topology-edge-color, #f97316) 20%, transparent), 0 0 12px color-mix(in srgb, var(--nginx-topology-edge-color, #f97316) 48%, transparent);
  }

  .nginx-topology-node {
    position: absolute;
    z-index: 2;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 7px;
    box-sizing: border-box;
    min-height: 0;
    padding: 10px 12px 12px;
    overflow: visible;
    background: rgba(255, 255, 255, 0.74);
    backdrop-filter: blur(2px);
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
    cursor: grab;
    touch-action: none;
    transition: border-color 0.12s ease, box-shadow 0.12s ease, background 0.12s ease;
    will-change: transform;
  }

  .nginx-topology-node-head {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr);
    align-items: center;
    gap: 7px;
    min-width: 0;
  }

  .nginx-topology-node-head > div {
    display: grid;
    min-width: 0;
  }

  .nginx-topology-node-head small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nginx-topology-port-rows {
    display: grid;
    gap: 5px;
    min-width: 0;
  }

  .nginx-topology-port-row {
    position: relative;
    display: grid;
    align-items: center;
    gap: 6px;
    box-sizing: border-box;
    width: 100%;
    height: 25px;
    min-width: 0;
    padding: 0 8px;
    border: 1px solid rgba(148, 163, 184, 0.28);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.66);
    text-align: left;
    cursor: crosshair;
    transition: border-color 0.12s ease, background 0.12s ease, box-shadow 0.12s ease;
  }

  .nginx-topology-port-row--in {
    grid-template-columns: minmax(56px, 0.8fr) minmax(0, 1fr);
    padding-left: 22px;
  }

  .nginx-topology-port-row--out {
    grid-template-columns: minmax(56px, 0.8fr) minmax(0, 1fr);
    padding-right: 22px;
  }

  .nginx-topology-port-row span,
  .nginx-topology-port-row em {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nginx-topology-port-row span {
    color: #0f172a;
    font-size: 11px;
    font-weight: 700;
  }

  .nginx-topology-port-row em {
    color: #64748b;
    font-size: 10px;
    font-style: normal;
  }

  .nginx-topology-port-row i {
    position: absolute;
    top: 50%;
    box-sizing: border-box;
    width: 14px;
    height: 14px;
    border: 2px solid #22c55e;
    border-radius: 50%;
    background: #ffffff;
    transform: translateY(-50%);
    box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.12);
    transition: border-color 0.12s ease, background 0.12s ease, box-shadow 0.12s ease;
  }

  .nginx-topology-port-row--in i {
    left: 0;
  }

  .nginx-topology-port-row--out i {
    right: 0;
  }

  .nginx-topology-port-row:hover {
    border-color: rgba(249, 115, 22, 0.5);
    background: rgba(255, 247, 237, 0.86);
  }

  .nginx-topology-port-row:hover i,
  .nginx-topology-port-row--selected i {
    border-color: #f97316;
    box-shadow: 0 0 0 6px rgba(249, 115, 22, 0.14);
  }

  .nginx-topology-port-row--connected {
    border-color: color-mix(in srgb, var(--nginx-topology-edge-color, #22c55e) 34%, rgba(148, 163, 184, 0.28));
    background: rgba(255, 255, 255, 0.82);
  }

  .nginx-topology-port-row--connected i {
    border-color: #f97316;
    background: #f97316;
    box-shadow: 0 0 0 4px rgba(249, 115, 22, 0.14), inset 0 0 0 3px #ffffff;
  }

  .nginx-topology-port-row--selected {
    border-color: #f97316;
    background: #fff7ed;
    box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.12);
  }

  .nginx-topology-node:hover:not(:disabled) {
    transform: none;
  }

  .nginx-topology-node:active {
    cursor: grabbing;
  }

  .nginx-topology-node-icon {
    position: relative;
    display: inline-block;
    width: 18px;
    height: 15px;
    flex: 0 0 18px;
  }

  .nginx-topology-node-icon--folder {
    border: 1px solid #d97706;
    border-radius: 2px;
    background: linear-gradient(180deg, #fde68a 0%, #fbbf24 100%);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.55);
  }

  .nginx-topology-node-icon--folder::before {
    content: '';
    position: absolute;
    left: 1px;
    top: -5px;
    width: 8px;
    height: 5px;
    border: 1px solid #d97706;
    border-bottom: 0;
    border-radius: 2px 2px 0 0;
    background: #fcd34d;
  }

  .nginx-topology-node-icon--file {
    width: 15px;
    height: 18px;
    margin-left: 2px;
    border: 1px solid #3b82f6;
    border-radius: 2px;
    background: linear-gradient(135deg, #ffffff 0 72%, #bfdbfe 72% 100%);
    box-shadow: inset 0 0 0 2px rgba(219, 234, 254, 0.55);
  }

  .nginx-topology-node-icon--file::after {
    content: '';
    position: absolute;
    right: -1px;
    top: -1px;
    width: 5px;
    height: 5px;
    border-left: 1px solid #3b82f6;
    border-bottom: 1px solid #3b82f6;
    background: #dbeafe;
  }

  .nginx-topology-node::before,
  .nginx-topology-node::after,
  .nginx-topology-include::before,
  .nginx-topology-include::after,
  .nginx-topology-files::before,
  .nginx-topology-trunk::after,
  .nginx-topology-branch-line::before,
  .nginx-topology-branch-line::after {
    content: none;
  }

  .nginx-topology-node--main {
    border-color: rgba(34, 197, 94, 0.55);
    background: rgba(236, 253, 245, 0.76);
  }

  .nginx-topology-node--include {
    border-color: rgba(14, 165, 233, 0.35);
    background: rgba(240, 249, 255, 0.76);
  }

  .nginx-topology-node--file {
    border-color: #e5e7eb;
    background: rgba(255, 255, 255, 0.74);
  }

  .nginx-topology-node--empty {
    border-style: dashed;
    background: rgba(255, 255, 255, 0.66);
  }

  .nginx-topology-node--domain {
    border-color: rgba(59, 130, 246, 0.45);
    background: rgba(239, 246, 255, 0.76);
  }

  .nginx-topology-node--listen {
    border-color: rgba(249, 115, 22, 0.42);
    background: rgba(255, 247, 237, 0.76);
  }

  .nginx-topology-node--server {
    border-color: rgba(34, 197, 94, 0.45);
    background: rgba(240, 253, 244, 0.76);
  }

  .nginx-topology-node--location {
    border-color: rgba(168, 85, 247, 0.36);
    background: rgba(250, 245, 255, 0.76);
  }

  .nginx-topology-node--backend,
  .nginx-topology-node--upstream,
  .nginx-topology-node--root,
  .nginx-topology-node--ssl,
  .nginx-topology-node--return,
  .nginx-topology-node--route,
  .nginx-topology-node--target {
    border-color: rgba(15, 118, 110, 0.36);
    background: rgba(240, 253, 250, 0.76);
  }

  .nginx-topology-port {
    position: absolute;
    top: 50%;
    box-sizing: border-box;
    width: 34px;
    height: 34px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    transform: translateY(-50%);
    cursor: crosshair;
    z-index: 3;
  }

  .nginx-topology-port::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    box-sizing: border-box;
    width: 14px;
    height: 14px;
    border: 2px solid #22c55e;
    border-radius: 50%;
    background: #ffffff;
    transform: translate(-50%, -50%);
    transition: border-color 0.12s ease, background 0.12s ease, box-shadow 0.12s ease;
  }

  .nginx-topology-port:hover::after {
    border-color: #f97316;
    box-shadow: 0 0 0 7px rgba(249, 115, 22, 0.14);
  }

  .nginx-topology-port--selected::after {
    border-color: #f97316;
    background: #fff7ed;
    box-shadow: 0 0 0 8px rgba(249, 115, 22, 0.18), 0 0 12px rgba(249, 115, 22, 0.38);
  }

  .nginx-topology-port--connected::after {
    border-color: #f97316;
    background: #f97316;
    box-shadow: 0 0 0 5px rgba(249, 115, 22, 0.14), inset 0 0 0 3px #ffffff;
  }

  .nginx-topology-port--connected.nginx-topology-port--selected::after {
    box-shadow: 0 0 0 8px rgba(249, 115, 22, 0.2), 0 0 14px rgba(249, 115, 22, 0.42), inset 0 0 0 3px #ffffff;
  }

  .nginx-topology-port--in {
    left: 2px;
  }

  .nginx-topology-port--out {
    right: 2px;
  }

  .nginx-topology-zoom-tools {
    position: absolute;
    left: 29px;
    bottom: 42px;
    z-index: 4;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px;
    border: 1px solid #e5e7eb;
    border-radius: var(--nginx-radius);
    background: rgba(255, 255, 255, 0.92);
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.12);
    backdrop-filter: blur(8px);
  }

  .nginx-topology-zoom-tools button {
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid #d1d5db;
    border-radius: var(--nginx-radius);
    background: #ffffff;
    color: #0f172a;
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
  }

  .nginx-topology-zoom-tools button:hover {
    border-color: #22c55e;
    color: #16a34a;
  }

  .nginx-topology-zoom-tools span {
    min-width: 42px;
    color: #64748b;
    font-size: 12px;
    text-align: center;
  }

  .nginx-topology-context-menu {
    position: fixed;
    z-index: 3000;
    display: grid;
    min-width: 144px;
    padding: 6px;
    border: 1px solid #dbe3ea;
    border-radius: var(--nginx-radius);
    background: #ffffff;
    box-shadow: 0 18px 38px rgba(15, 23, 42, 0.18);
  }

  .nginx-topology-context-menu button {
    padding: 8px 10px;
    border: 0;
    border-radius: var(--nginx-radius);
    background: transparent;
    color: #0f172a;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }

  .nginx-topology-context-menu button:hover:not(:disabled) {
    background: #ecfdf5;
    color: #15803d;
  }

  .nginx-topology-context-menu button:disabled {
    color: #94a3b8;
    cursor: not-allowed;
  }

  .nginx-drawer-content {
    display: grid;
    gap: 16px;
  }

  .nginx-drawer-headline {
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr);
    align-items: center;
    gap: 10px;
    padding: 12px;
    border: 1px solid #e5e7eb;
    border-radius: var(--nginx-radius);
    background: #f8fafc;
  }

  .nginx-drawer-headline div {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .nginx-drawer-headline strong {
    min-width: 0;
    color: #0f172a;
    font-size: 14px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nginx-drawer-headline span {
    color: #64748b;
    font-size: 12px;
  }

  .nginx-drawer-grid {
    display: grid;
    grid-template-columns: 82px minmax(0, 1fr);
    gap: 10px;
    padding: 12px;
    border: 1px solid #e5e7eb;
    border-radius: var(--nginx-radius);
  }

  .nginx-drawer-grid label {
    color: #64748b;
    font-size: 12px;
  }

  .nginx-drawer-grid span {
    min-width: 0;
    color: #0f172a;
    font-size: 12px;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  .nginx-drawer-section {
    display: grid;
    gap: 8px;
  }

  .nginx-drawer-section > strong {
    color: #0f172a;
    font-size: 13px;
  }

  .nginx-drawer-server {
    display: grid;
    gap: 3px;
    padding: 10px;
    border: 1px solid #e5e7eb;
    border-radius: var(--nginx-radius);
    background: #ffffff;
  }

  .nginx-drawer-server span {
    color: #0f172a;
    font-size: 12px;
    font-weight: 700;
  }

  .nginx-drawer-server small {
    color: #64748b;
    font-size: 11px;
  }

  .nginx-topology-empty {
    padding: 12px;
    color: #94a3b8;
    font-size: 12px;
    line-height: 1.6;
    border-style: dashed;
    background: rgba(255, 255, 255, 0.72);
  }

  .nginx-file-overview {
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
    padding: 0;
  }

  .nginx-overview-item {
    padding: 10px 12px;
    background: #202020;
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .nginx-source-editor {
    min-height: 420px;
    width: 100%;
    resize: vertical;
    background: #202020;
    color: #f5f5f5;
    padding: 14px;
    font-size: 12px;
    line-height: 1.7;
    font-family: Consolas, 'Courier New', monospace;
    outline: none;
  }

  .nginx-source-toolbar {
    display: grid;
    gap: 10px;
  }

  .nginx-source-actions {
    justify-content: flex-start;
  }

  .nginx-source-card {
    display: grid;
    min-height: 0;
    height: 100%;
    align-self: stretch;
    gap: 10px;
    padding-top: 0;
    grid-template-rows: minmax(0, 1fr) auto;
    overflow: hidden;
  }

  .nginx-source-workbench {
    display: grid;
    grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
    min-height: 0;
    height: 100%;
    border: 1px solid rgba(101, 212, 110, 0.18);
    border-radius: var(--nginx-radius);
    overflow: hidden;
    background: #ffffff;
  }

  .nginx-source-tree-pane {
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    border-right: 1px solid rgba(15, 23, 42, 0.1);
    background: #ffffff;
  }

  .nginx-source-editor-pane {
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    background: #ffffff;
  }

  .nginx-source-tree-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 40px;
    padding: 8px 10px;
    border-bottom: 1px solid rgba(15, 23, 42, 0.08);
    background: #eef6f0;
  }

  .nginx-source-tree-head strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #14532d;
    font-size: 12px;
    font-weight: 700;
  }

  .nginx-source-tree-head button {
    height: 26px;
    padding: 0 9px;
    border: 1px solid rgba(22, 163, 74, 0.24);
    border-radius: var(--nginx-radius);
    background: #ffffff;
    color: #15803d;
    font-size: 11px;
    cursor: pointer;
  }

  .nginx-source-tree-head button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .nginx-source-tree-body {
    min-height: 0;
    overflow: auto;
    padding: 6px 0 10px;
    background: #ffffff;
  }

  .nginx-source-tree-row {
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr) auto 22px;
    align-items: center;
    gap: 6px;
    width: 100%;
    min-height: 30px;
    padding: 5px 8px 5px 10px;
    border: 0;
    border-left: 3px solid transparent;
    background: #ffffff;
    color: #334155;
    text-align: left;
    cursor: pointer;
  }

  .nginx-source-tree-row:hover {
    background: #ecfdf5;
    color: #14532d;
  }

  .nginx-source-tree-row:disabled {
    cursor: default;
    color: #b91c1c;
  }

  .nginx-source-tree-row--active {
    border-left-color: #16a34a;
    background: #dcfce7;
    color: #14532d;
  }

  .nginx-source-tree-toggle {
    color: #64748b;
    font-size: 13px;
    justify-self: center;
  }

  .nginx-source-tree-toggle svg {
    width: 13px;
    height: 13px;
  }

  .nginx-source-tree-toggle--empty {
    width: 22px;
    height: 1px;
  }

  .nginx-source-tree-folder {
    justify-self: center;
  }

  .nginx-source-tree-file {
    justify-self: center;
    color: #64748b;
  }

  .nginx-source-tree-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
  }

  .nginx-source-tree-row small {
    padding: 1px 5px;
    border: 1px solid rgba(249, 115, 22, 0.24);
    border-radius: 999px;
    background: #fff7ed;
    color: #c2410c;
    font-size: 10px;
    white-space: nowrap;
  }

  .nginx-source-tree-empty,
  .nginx-source-tree-error {
    display: block;
    padding: 18px 12px;
    color: #94a3b8;
    font-size: 12px;
    line-height: 1.6;
  }

  .nginx-source-tree-error {
    color: #b91c1c;
  }

  .nginx-source-tree-context-menu {
    position: fixed;
    z-index: 80;
    width: 180px;
    padding: 6px;
    border: 1px solid rgba(15, 23, 42, 0.12);
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 16px 36px rgba(15, 23, 42, 0.18);
  }

  .nginx-source-tree-context-menu button {
    display: block;
    width: 100%;
    min-height: 30px;
    padding: 6px 9px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: #334155;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }

  .nginx-source-tree-context-menu button:hover {
    background: #f1f5f9;
    color: #0f172a;
  }

  .nginx-source-tree-context-menu > span {
    display: block;
    height: 1px;
    margin: 5px 3px;
    background: #e5e7eb;
  }

  .nginx-source-tree-context-menu .nginx-source-tree-context-danger {
    color: #b91c1c;
  }

  .nginx-source-tree-context-menu .nginx-source-tree-context-danger:hover {
    background: #fef2f2;
    color: #991b1b;
  }

  .nginx-source-path-dialog-body {
    display: grid;
    gap: 10px;
  }

  .nginx-source-path-dialog-body span,
  .nginx-source-path-dialog-body small {
    color: #64748b;
    font-size: 12px;
    line-height: 1.5;
  }

  .nginx-source-path-dialog-body input {
    width: 100%;
    height: 34px;
    padding: 0 10px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    background: #ffffff;
    color: #111827;
    font-size: 12px;
    outline: none;
  }

  .nginx-source-path-dialog-body input:focus {
    border-color: #111111;
    box-shadow: none;
  }

  .nginx-source-path-dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .nginx-source-path-dialog-actions button {
    height: 32px;
    padding: 0 14px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    background: #ffffff;
    color: #334155;
    font-size: 12px;
    cursor: pointer;
  }

  .nginx-source-path-dialog-actions button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .nginx-source-path-dialog-actions .nginx-source-path-dialog-primary {
    border-color: #16a34a;
    background: #16a34a;
    color: #ffffff;
  }

  .nginx-source-tabs {
    min-width: 0;
    display: flex;
    align-items: stretch;
    gap: 0;
    overflow-x: auto;
    overflow-y: hidden;
    background: #171717;
    border-bottom: 1px solid rgba(101, 212, 110, 0.22);
  }

  .nginx-source-tab {
    min-width: 118px;
    max-width: 220px;
    padding: 8px 13px 7px;
    border: 0;
    border-right: 1px solid rgba(255, 255, 255, 0.08);
    border-bottom: 2px solid transparent;
    border-radius: 0;
    background: #202020;
    color: #cfcfd4;
    font-size: 12px;
    font-weight: 600;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nginx-source-tab:hover {
    background: #262626;
    color: #ffffff;
  }

  .nginx-source-tab--active {
    border-bottom-color: rgba(101, 212, 110, 0.85);
    background: #ffffff;
    color: #111827;
  }

  .nginx-source-pathbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    padding: 8px 10px;
    border-bottom: 1px solid rgba(15, 23, 42, 0.08);
    background: #f8fafc;
  }

  .nginx-source-pathbar input {
    min-width: 0;
    padding: 7px 10px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    background: #ffffff;
    color: #0f172a;
    font-size: 12px;
    outline: none;
  }

  .nginx-source-pathbar input:focus {
    border-color: #111111;
    box-shadow: none;
  }

  :deep(.nginx-source-pathbar .remote-path-picker-input) {
    font-size: 11px;
  }

  :deep(.nginx-source-pathbar .remote-path-picker-input::placeholder) {
    font-size: 11px;
  }

  .nginx-source-titlebar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 9px 12px;
    border-bottom: 1px solid rgba(15, 23, 42, 0.08);
    background: #f8fafc;
  }

  .nginx-source-titlebar strong {
    min-width: 0;
    color: #111827;
    font-size: 12px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nginx-source-titlebar span,
  .nginx-source-status span {
    color: #64748b;
    font-size: 11px;
    line-height: 1.5;
    white-space: nowrap;
  }

  .nginx-source-monaco {
    min-height: 0;
    width: 100%;
    height: 100%;
    display: block;
    overflow: hidden;
  }

  .nginx-source-history {
    min-height: 0;
    height: 100%;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 12px;
  }

  :deep(.nginx-source-history-drawer .el-drawer__body) {
    min-height: 0;
    overflow: hidden;
  }

  .nginx-source-history-head {
    display: grid;
    gap: 4px;
    padding-bottom: 10px;
    border-bottom: 1px solid #e5e7eb;
  }

  .nginx-source-history-head strong {
    color: #0f172a;
    font-size: 14px;
  }

  .nginx-source-history-head span {
    color: #64748b;
    font-size: 12px;
  }

  .nginx-source-history-list {
    min-height: 0;
    display: grid;
    align-content: start;
    gap: 8px;
    overflow-y: auto;
    padding-right: 4px;
  }

  .nginx-source-history-item {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 4px;
    width: 100%;
    padding: 10px 9px 10px 12px;
    border: 1px solid #e2e8f0;
    border-radius: 0;
    background: #ffffff;
    text-align: left;
    cursor: pointer;
  }

  .nginx-source-history-item > div {
    min-width: 0;
    display: grid;
    gap: 4px;
  }

  .nginx-source-history-item:hover {
    border-color: rgba(34, 197, 94, 0.42);
    background: #f0fdf4;
  }

  .nginx-source-history-item--active {
    border-color: rgba(22, 163, 74, 0.72);
    background: #ecfdf5;
  }

  .nginx-source-history-item strong {
    color: #0f172a;
    font-size: 13px;
  }

  .nginx-source-history-item span {
    min-width: 0;
    overflow: hidden;
    color: #64748b;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nginx-source-history-item small {
    color: #94a3b8;
    font-size: 11px;
    line-height: 1.4;
  }

  .nginx-source-history-remove {
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid transparent;
    border-radius: 0;
    background: transparent;
    color: #94a3b8;
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.14s ease, background 0.14s ease, color 0.14s ease, border-color 0.14s ease;
  }

  .nginx-source-history-item:hover .nginx-source-history-remove {
    opacity: 1;
  }

  .nginx-source-history-remove:hover {
    border-color: #fecaca;
    background: #fef2f2;
    color: #dc2626;
  }

  .nginx-source-status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 10px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--nginx-radius);
    background: rgba(255, 255, 255, 0.03);
  }

  .nginx-source-actions-bar {
    flex: 0 0 auto;
    padding-bottom: 2px;
  }

  .nginx-log-board {
    grid-template-columns: 1fr;
  }

  .nginx-empty-box {
    color: #a3a3a3;
    background: #202020;
    padding: 12px;
  }

  :deep(.el-button) {
    border-radius: var(--nginx-radius);
  }

  .nginx-page {
    background: #ffffff;
    color: #111827;
  }

  .nginx-page .page-hero-line h3,
  .nginx-card-head strong,
  .nginx-subcard strong,
  .nginx-overview-item strong,
  .nginx-path-bar strong,
  .nginx-server-item strong,
  .nginx-field span,
  .nginx-inline-field span,
  .nginx-nested-title strong,
  .nginx-content-head h4 {
    color: #111827;
  }

  .nginx-page .page-hero-line,
  .nginx-layout,
  .nginx-sidebar,
  .nginx-content,
  .nginx-card,
  .nginx-location-card,
  .nginx-empty-box,
  .nginx-file-overview,
  .nginx-level-block,
  .nginx-server-block-card,
  .nginx-location-child-card,
  .nginx-location-group,
  .nginx-source-tabs {
    background: #ffffff;
  }

  .nginx-sidebar {
    border: 1px solid #e5e7eb;
    border-radius: var(--nginx-radius);
  }

  .nginx-sidebar-head {
    border-bottom-color: #e5e7eb;
  }

  .nginx-sidebar-toggle {
    color: #475569;
  }

  .nginx-sidebar-toggle:hover {
    color: #0f172a;
    background: #f8fafc;
  }

  .nginx-sidebar-head strong,
  .nginx-menu-item strong,
  .nginx-side-stat strong {
    color: #111827;
  }

  .nginx-sidebar-head p,
  .nginx-menu-item span,
  .nginx-side-stat span,
  .nginx-content-head p,
  .nginx-card-head span,
  .nginx-subcard span,
  .nginx-overview-item span,
  .nginx-muted,
  .nginx-empty-box,
  .nginx-server-item span,
  .nginx-nested-title span,
  .nginx-server-tab span,
  .nginx-server-tab small,
  .nginx-location-tab span {
    color: #64748b;
  }

  .nginx-menu-item:hover,
  .nginx-menu-item--active,
  .nginx-submenu-item:hover,
  .nginx-submenu-item--active {
    background: #f8fafc;
    border-left-color: #22c55e;
  }

  .nginx-menu-item--active .nginx-menu-icon,
  .nginx-menu-item--active strong,
  .nginx-submenu-item:hover,
  .nginx-submenu-item--active {
    color: #0f172a;
  }

  .nginx-submenu-item {
    color: #475569;
    border-left-color: #e5e7eb;
  }

  .nginx-content {
    background: #ffffff;
    border-left-color: #e5e7eb;
  }

  .nginx-content-head,
  .nginx-card,
  .nginx-location-card,
  .nginx-server-tabs-wrap,
  .nginx-location-tabs-wrap,
  .nginx-level-block > .nginx-card-head:first-child,
  .nginx-server-block-card > .nginx-card-head:first-child,
  .nginx-location-child-card > .nginx-card-head:first-child,
  .nginx-source-tabs {
    border-bottom-color: #e5e7eb;
  }

  .nginx-path-bar,
  .nginx-section-bar,
  .nginx-meta-editor-bar,
  .nginx-listen-item,
  .nginx-level-block,
  .nginx-level-block--nested,
  .nginx-source-workbench,
  .nginx-source-status,
  .nginx-overview-item,
  .nginx-server-item,
  .nginx-empty-box {
    border-color: #e5e7eb;
    background: #f8fafc;
  }

  .nginx-server-block-card,
  .nginx-level-block--nested,
  .nginx-location-group {
    box-shadow: none;
    background: #ffffff;
  }

  .nginx-field input,
  .nginx-field textarea,
  .nginx-field select,
  .nginx-inline-field input {
    border-color: #d1d5db;
    background: #ffffff;
    color: #111827;
  }

  .nginx-field input:focus,
  .nginx-field textarea:focus,
  .nginx-field select:focus,
  .nginx-inline-field input:focus,
  .nginx-source-editor:focus {
    border-color: #111111;
    box-shadow: none;
    background: #ffffff;
  }

  .nginx-field input:disabled,
  .nginx-field textarea:disabled,
  .nginx-field select:disabled {
    background: #f1f5f9;
    border-color: #e5e7eb;
    color: #94a3b8;
  }

  .nginx-check-field {
    color: #334155;
  }

  .nginx-settings-summary > div,
  .nginx-ssl-summary > div,
  .nginx-ssl-ref-card,
  .nginx-settings-warning {
    border-color: #e5e7eb;
    background: #f8fafc;
  }

  .nginx-settings-summary strong,
  .nginx-ssl-summary strong,
  .nginx-ssl-ref-head strong {
    color: #111827;
  }

  .nginx-settings-summary span,
  .nginx-ssl-summary span,
  .nginx-ssl-ref-head span,
  .nginx-ssl-ref-grid label {
    color: #64748b;
  }

  .nginx-ssl-ref-grid span {
    color: #334155;
  }

  .nginx-ssl-actions button,
  .nginx-ssl-ref-card .nginx-inline-actions button,
  .nginx-ssl-add-button,
  .nginx-ssl-table-tools button,
  .nginx-ssl-more-button,
  .nginx-ssl-more-menu button,
  .nginx-ssl-drawer-actions button,
  .nginx-ssl-mode-tabs button {
    border-color: #d1d5db;
    background: #ffffff;
    color: #334155;
  }

  .nginx-ssl-actions-primary {
    border-color: rgba(34, 197, 94, 0.45) !important;
    background: #ecfdf5 !important;
    color: #166534 !important;
  }

  .nginx-ssl-add-button:hover:not(:disabled),
  .nginx-ssl-table-tools button:hover:not(:disabled),
  .nginx-ssl-drawer-actions button:hover:not(:disabled),
  .nginx-ssl-mode-tabs button:hover:not(:disabled) {
    border-color: rgba(34, 197, 94, 0.55);
    background: #f0fdf4;
    color: #15803d;
  }

  .nginx-ssl-actions-primary:hover:not(:disabled) {
    border-color: rgba(34, 197, 94, 0.7) !important;
    background: #dcfce7 !important;
    color: #166534 !important;
  }

  .nginx-ssl-table-wrap,
  .nginx-ssl-more-menu,
  .nginx-ssl-output pre {
    border-color: #e5e7eb;
    background: #ffffff;
  }

  .nginx-ssl-table th {
    color: #64748b;
    background: #f8fafc;
  }

  .nginx-ssl-table th,
  .nginx-ssl-table td {
    border-bottom-color: #e5e7eb;
  }

  .nginx-ssl-output strong {
    color: #111827;
  }

  .nginx-ssl-table td span,
  .nginx-ssl-output pre {
    color: #334155;
  }

  .nginx-ssl-mode-tab--active {
    border-color: rgba(34, 197, 94, 0.45) !important;
    background: #ecfdf5 !important;
    color: #166534 !important;
  }

  .nginx-settings-warning {
    color: #92400e;
  }

  .nginx-server-tab,
  .nginx-location-tab,
  .nginx-chip,
  .nginx-protocol-btn {
    background: #f8fafc;
    color: #334155;
    border-color: #e5e7eb;
  }

  .nginx-server-tab strong,
  .nginx-location-tab strong {
    color: #111827;
  }

  .nginx-server-tab--active,
  .nginx-location-tab--active,
  .nginx-chip--active,
  .nginx-protocol-btn--active {
    border-color: rgba(34, 197, 94, 0.45);
    background: #ecfdf5;
    color: #166534;
  }

  .nginx-source-tab {
    background: #f8fafc;
    color: #334155;
    border-right-color: #e5e7eb;
  }

  .nginx-source-tab:hover,
  .nginx-source-tab--active {
    background: #ffffff;
    color: #111827;
    border-bottom-color: #22c55e;
  }

  .nginx-source-editor,
  .nginx-simple-row--head {
    background: #f8fafc;
    color: #111827;
  }

  .nginx-simple-row {
    border-top-color: #e5e7eb;
    color: #334155;
  }

  .nginx-page .nginx-content-body {
    min-height: 0;
    align-content: start;
    gap: 0;
    padding: 0;
  }

  .nginx-page .nginx-content--compose {
    padding: 0;
  }

  .nginx-page .nginx-content--compose .nginx-content-body {
    gap: 0;
    padding: 0;
  }

  .nginx-page .nginx-content--ssl .nginx-content-body {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    align-content: stretch;
    gap: 0;
    padding: 0;
    min-height: 0;
    height: 100%;
    overflow: hidden;
  }

  .nginx-page .nginx-ssl-table-card {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr) auto;
    min-height: 0;
    overflow: hidden;
  }

  .nginx-page .nginx-content--compose .nginx-card {
    padding: 0;
    border: 0;
    border-radius: 0;
    box-shadow: none;
  }

  .nginx-page .nginx-card:not(.nginx-source-card),
  .nginx-page .nginx-location-card {
    padding: 16px;
    border: 1px solid #e5e7eb;
    border-radius: 0;
    background: #ffffff;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  }

  .nginx-page .nginx-card + .nginx-card {
    border-top: 0;
  }

  .nginx-page .nginx-content--compose .nginx-card {
    padding: 0;
    border: 0;
    border-radius: 0;
    box-shadow: none;
  }

  .nginx-page .nginx-card-head {
    padding: 0 0 10px;
    border-bottom: 1px solid #f1f5f9;
  }

  .nginx-page .nginx-card-head strong {
    font-size: 15px;
    line-height: 1.4;
  }

  .nginx-page .nginx-card-head span {
    max-width: 720px;
    line-height: 1.6;
  }

  .nginx-page .nginx-card-head--row > div:first-child {
    display: flex;
    align-items: baseline;
    gap: 12px;
    min-width: 0;
  }

  .nginx-page .nginx-card-head--row > div:first-child span {
    min-width: 0;
  }

  .nginx-page .nginx-content--ssl .nginx-card:first-child {
    flex: 0 0 auto;
  }

  .nginx-page .nginx-ssl-list-card {
    box-sizing: border-box;
    flex: 1 1 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
    max-height: 100%;
    height: auto;
    overflow: hidden;
  }

  .nginx-page .nginx-ssl-list-card > .nginx-card-head,
  .nginx-page .nginx-ssl-list-card > .nginx-settings-warning,
  .nginx-page .nginx-ssl-list-card > .nginx-ssl-pagination {
    flex: 0 0 auto;
  }

  .nginx-page .nginx-ssl-list-card .nginx-empty-box {
    min-height: 0;
    height: 100%;
  }

  :deep(.nginx-ssl-pagination .el-pagination) {
    --el-pagination-button-bg-color: #ffffff;
    --el-pagination-hover-color: #111111;
    --el-color-primary: #111111;
  }

  :deep(.nginx-ssl-el-table .el-table__fixed-right),
  :deep(.nginx-ssl-el-table .el-table__fixed-right-patch),
  :deep(.nginx-ssl-el-table .el-table-fixed-column--right),
  :deep(.nginx-ssl-el-table td.el-table-fixed-column--right),
  :deep(.nginx-ssl-el-table th.el-table-fixed-column--right),
  :deep(.nginx-ssl-el-table td.el-table-fixed-column--right .cell),
  :deep(.nginx-ssl-el-table th.el-table-fixed-column--right .cell),
  :deep(.nginx-ssl-el-table .el-table__body td:last-child),
  :deep(.nginx-ssl-el-table .el-table__header th:last-child),
  :deep(.nginx-ssl-el-table .el-table__body td:last-child .cell),
  :deep(.nginx-ssl-el-table .el-table__header th:last-child .cell),
  :deep(.nginx-ssl-el-table .el-table__body tr:hover > td.el-table-fixed-column--right),
  :deep(.nginx-ssl-el-table .el-table__body tr.current-row > td.el-table-fixed-column--right) {
    background: #ffffff !important;
    background-color: #ffffff !important;
  }

  .nginx-page .nginx-form-grid {
    gap: 14px;
  }

  .nginx-page .nginx-simple-table {
    border: 1px solid #e5e7eb;
    border-radius: var(--nginx-radius);
  }

  .nginx-page .nginx-simple-row--head {
    background: #f8fafc;
  }

  .nginx-page .nginx-source-card {
    padding: 0;
    border: 0;
    box-shadow: none;
  }

  .nginx-page .nginx-content--source .nginx-content-body {
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    align-content: stretch;
    overflow: hidden;
  }

  .nginx-page .nginx-content--topology .nginx-content-body {
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    align-content: stretch;
    overflow: hidden;
    padding-right: 18px;
  }

  .nginx-page .nginx-topology-card {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    min-height: 0;
    height: 100%;
    overflow: hidden;
  }

  .nginx-page .nginx-source-card {
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    min-height: 0;
    height: 100%;
    align-self: stretch;
    overflow: hidden;
  }

  .nginx-page .nginx-source-workbench {
    min-height: 0;
    height: 100%;
  }

  @media (max-width: 900px) {
    .nginx-layout {
      grid-template-columns: 1fr;
    }

    .nginx-source-workbench {
      grid-template-columns: 1fr;
      grid-template-rows: minmax(180px, 34%) minmax(0, 1fr);
    }

    .nginx-source-tree-pane {
      border-right: 0;
      border-bottom: 1px solid rgba(15, 23, 42, 0.1);
    }

    .nginx-topology-canvas,
    .nginx-topology-branch {
      grid-template-columns: 1fr;
    }

    .nginx-topology-trunk::after,
    .nginx-topology-branch-line {
      display: none;
    }

  }

  @media (max-width: 1080px) {
    .nginx-form-grid,
    .nginx-settings-summary,
    .nginx-ssl-summary,
    .nginx-ssl-ref-grid,
    .nginx-simple-row,
    .nginx-log-board,
    .nginx-file-overview,
    .nginx-listen-main-row {
      grid-template-columns: 1fr;
    }

    .nginx-source-titlebar,
    .nginx-source-status {
      align-items: flex-start;
      flex-direction: column;
    }

    .nginx-source-titlebar span,
    .nginx-source-status span {
      white-space: normal;
    }

  }
</style>
