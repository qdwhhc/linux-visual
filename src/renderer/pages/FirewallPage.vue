<template>
  <section class="panel placeholder-panel page-section table-page ports-page firewall-page panel-scroller">
    <div class="section-line page-hero-line">
      <div>
        <h3>防火墙</h3>
        <p>{{ isSSHSession ? '像轻量云防火墙一样管理服务器端口访问规则，可新增或删除端口策略。' : 'SFTP 连接不支持防火墙管理。' }}</p>
      </div>
      <div class="service-actions">
        <el-button plain :disabled="!connected || !isSSHSession" @click="firewallInfoDrawerVisible = true">更多信息</el-button>
        <el-button :disabled="!connected || !isSSHSession || firewallLoading" @click="loadFirewallOverview({ notify: true })">
          {{ firewallLoading ? '刷新中...' : '刷新规则' }}
        </el-button>
      </div>
    </div>
    <div v-if="firewallOverview.backend === 'none'" class="docker-help-box">当前服务器没有检测到可读取的系统防火墙规则；如果服务器部署在云平台，还需要同时检查安全组是否放行端口。</div>
    <div class="port-list-section firewall-rules-section">
      <div class="section-line compact-section-line">
        <div>
          <h3>防火墙规则</h3>
          <p>默认管理外部访问当前服务器的端口规则，和轻量云服务器防火墙体验一致。</p>
        </div>
        <em :class="['status-pill', displayedInboundFirewallRules.length ? 'warning' : 'inactive']">{{ displayedInboundFirewallRules.length ? `${displayedInboundFirewallRules.length} 条规则` : '暂无规则' }}</em>
      </div>
      <div class="security-rule-toolbar">
        <el-button class="firewall-add-rule-button" type="primary" :disabled="!connected || !isSSHSession || !firewallManageSupported" @click="openFirewallRuleDialog">添加规则</el-button>
        <el-button plain @click="openOutboundRulesDialog">出站规则</el-button>
        <el-button plain :disabled="!connected || !isSSHSession || !firewallManageSupported || !listeningAllowCandidates.length" @click="openOneClickAllowDialog">一键放通</el-button>
        <el-button plain @click="sortDialogVisible = true">排序</el-button>
        <el-button plain :disabled="!connected || !isSSHSession || !firewallManageSupported" @click="openImportRulesDialog">导入规则</el-button>
        <el-button plain :disabled="!displayedFirewallRules.length" @click="exportCurrentFirewallRules">导出规则</el-button>
      </div>
      <div class="port-table-shell firewall-rules-table-shell">
        <el-table border :data="pagedInboundFirewallRules" height="100%" :show-overflow-tooltip="tableTooltipOptions" row-key="id" class="manage-table firewall-scroll-table firewall-rules-table" empty-text="暂无防火墙规则">
          <el-table-column label="应用类型" width="120">
            <template #default="{ row }">{{ firewallRuleAppTypeLabel(row) }}</template>
          </el-table-column>
          <el-table-column label="来源" min-width="180">
            <template #default="{ row }">{{ firewallPeerLabel(row) }}</template>
          </el-table-column>
          <el-table-column label="协议" width="100">
            <template #default="{ row }">{{ row.protocol ? row.protocol.toUpperCase() : '-' }}</template>
          </el-table-column>
          <el-table-column label="端口" min-width="120">
            <template #default="{ row }">{{ firewallRulePrimaryLabel(row) }}</template>
          </el-table-column>
          <el-table-column label="规则信息" min-width="190">
            <template #default="{ row }">{{ firewallRuleSecondaryLabel(row) }}</template>
          </el-table-column>
          <el-table-column label="策略" width="100">
            <template #default="{ row }">
              <em :class="['port-text-status', row.action === 'allow' ? 'active' : 'failed']">{{ row.action === 'allow' ? '允许' : '拒绝' }}</em>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120" align="left">
            <template #default="{ row }">
              <div class="table-action-links" @click.stop>
                <button type="button" :disabled="!canEditFirewallRule(row)" @click="openEditFirewallRuleDialog(row)">编辑</button>
                <button type="button" :disabled="!canManageFirewallRule(row)" @click="handleFirewallMenuCommand(row, 'delete')">删除</button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <div class="database-pagination-bar port-pagination-bar firewall-rules-pagination">
        <span class="database-pagination-summary port-pagination-summary">共 {{ sortedInboundFirewallRules.length }} 条防火墙规则</span>
        <div class="port-pagination-actions">
          <el-select v-model="inboundRulePageSize" class="port-page-size-select" size="small" @change="inboundRulePage = 1">
            <el-option :value="10" label="10" />
            <el-option :value="20" label="20" />
            <el-option :value="50" label="50" />
          </el-select>
          <el-pagination
            v-model:current-page="inboundRulePage"
            :total="sortedInboundFirewallRules.length"
            :page-size="inboundRulePageSize"
            layout="prev, pager, next"
            prev-text="上一页"
            next-text="下一页"
            small
            background
          />
        </div>
      </div>
    </div>

    <el-dialog v-model="importRulesDialogVisible" title="导入规则" width="980px" class="security-rule-dialog firewall-import-dialog" append-to-body>
      <div class="firewall-import-notice">
        <span class="firewall-import-notice-icon">i</span>
        <div>
          <p>请按照您的需要选择对应的导入方式，您可以先<a href="#" @click.prevent="exportCurrentFirewallRules">导出当前规则</a>或<a href="#" @click.prevent="downloadImportTemplate">下载导入模板</a>。</p>
          <p>来源支持单个 IP、CIDR 段等，不填默认对所有 IPv4 地址（0.0.0.0/0）生效。</p>
        </div>
      </div>
      <div class="firewall-import-fields">
        <div class="firewall-import-field">
          <span>导入方式</span>
          <el-radio-group v-model="importRuleMode" class="firewall-import-radio-group">
            <el-radio value="overwrite">覆盖导入</el-radio>
            <el-radio value="append">追加导入</el-radio>
          </el-radio-group>
        </div>
        <div class="firewall-import-field">
          <span>选择文件</span>
          <div class="firewall-file-picker">
            <input ref="importFileInputRef" class="hidden-file-input" type="file" accept=".csv,text/csv" @change="handleImportFileSelected" />
            <input :value="importFileName" readonly placeholder="请上传 csv 格式文件" />
            <el-button plain @click="selectImportFile">选择文件</el-button>
          </div>
        </div>
        <div v-if="importFileName" class="firewall-import-field firewall-import-preview-line">
          <span>识别结果</span>
          <p>{{ parsedImportRules.valid.length }} 条可导入规则<span v-if="parsedImportRules.invalid.length">，{{ parsedImportRules.invalid.length }} 行无法识别</span></p>
        </div>
      </div>
      <template #footer>
        <el-button type="primary" :disabled="!parsedImportRules.valid.length" @click="submitImportRules">开始导入</el-button>
        <el-button @click="closeImportRulesDialog">取消</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="oneClickAllowDialogVisible" title="一键放通" width="820px" class="security-rule-dialog" append-to-body>
      <div class="security-rule-tip">
        <p>将为检测到的监听端口批量创建入站允许规则；已被现有允许规则覆盖的端口会自动跳过。</p>
        <p>批量放通可能扩大服务器暴露面，请确认这些服务确实需要外部访问。</p>
      </div>
      <el-table border :data="listeningAllowCandidates" max-height="300" :show-overflow-tooltip="tableTooltipOptions" row-key="key" class="manage-table" empty-text="没有需要放通的监听端口">
        <el-table-column label="端口" width="110">
          <template #default="{ row }">{{ row.port }}</template>
        </el-table-column>
        <el-table-column label="协议" width="90">
          <template #default="{ row }">{{ row.protocol.toUpperCase() }}</template>
        </el-table-column>
        <el-table-column label="监听地址" min-width="160">
          <template #default="{ row }">{{ row.address || '-' }}</template>
        </el-table-column>
        <el-table-column label="进程" min-width="160">
          <template #default="{ row }">{{ row.process || '-' }}</template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="oneClickAllowDialogVisible = false">取消</el-button>
        <el-button type="primary" :disabled="!listeningAllowCandidates.length" @click="submitOneClickAllow">一键放通 {{ listeningAllowCandidates.length }} 个端口</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="sortDialogVisible" title="规则排序" width="520px" class="security-rule-dialog" append-to-body>
      <div class="security-rule-form">
        <label>
          <span>排序字段</span>
          <el-select v-model="ruleSortField">
            <el-option label="端口" value="port" />
            <el-option label="协议" value="protocol" />
            <el-option label="策略" value="action" />
            <el-option label="后端" value="backend" />
            <el-option label="来源/目标" value="peer" />
          </el-select>
        </label>
        <label>
          <span>排序方向</span>
          <el-select v-model="ruleSortOrder">
            <el-option label="升序" value="asc" />
            <el-option label="降序" value="desc" />
          </el-select>
        </label>
      </div>
      <template #footer>
        <el-button @click="resetRuleSort">恢复默认</el-button>
        <el-button type="primary" @click="sortDialogVisible = false">完成</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="outboundRulesDialogVisible" title="出站规则" width="980px" class="security-rule-dialog firewall-outbound-dialog" append-to-body>
      <div class="firewall-dialog-toolbar">
        <div>
          <strong>出站规则</strong>
          <span>管理当前服务器主动访问外部地址的规则。</span>
        </div>
        <el-button class="firewall-add-rule-button" type="primary" :disabled="!connected || !isSSHSession || !firewallManageSupported" @click="openOutboundRuleDialog">添加规则</el-button>
      </div>
      <el-table border :data="pagedOutboundFirewallRules" max-height="360" :show-overflow-tooltip="tableTooltipOptions" row-key="id" class="manage-table firewall-scroll-table" empty-text="暂无出站规则">
        <el-table-column label="目标" min-width="180">
          <template #default="{ row }">{{ firewallPeerLabel(row) }}</template>
        </el-table-column>
        <el-table-column label="协议" width="100">
          <template #default="{ row }">{{ row.protocol ? row.protocol.toUpperCase() : '-' }}</template>
        </el-table-column>
        <el-table-column label="端口" min-width="120">
          <template #default="{ row }">{{ firewallRulePrimaryLabel(row) }}</template>
        </el-table-column>
        <el-table-column label="规则信息" min-width="190">
          <template #default="{ row }">{{ firewallRuleSecondaryLabel(row) }}</template>
        </el-table-column>
        <el-table-column label="策略" width="100">
          <template #default="{ row }">
            <em :class="['port-text-status', row.action === 'allow' ? 'active' : 'failed']">{{ row.action === 'allow' ? '允许' : '拒绝' }}</em>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" align="left" fixed="right">
          <template #default="{ row }">
            <div class="table-action-links" @click.stop>
              <button type="button" :disabled="!canEditFirewallRule(row)" @click="openEditFirewallRuleDialog(row)">编辑</button>
              <button type="button" :disabled="!canManageFirewallRule(row)" @click="handleFirewallMenuCommand(row, 'delete')">删除</button>
            </div>
          </template>
        </el-table-column>
      </el-table>
      <div class="database-pagination-bar port-pagination-bar firewall-dialog-pagination">
        <span class="database-pagination-summary port-pagination-summary">共 {{ sortedOutboundFirewallRules.length }} 条出站规则</span>
        <div class="port-pagination-actions">
          <el-select v-model="outboundRulePageSize" class="port-page-size-select" size="small" @change="outboundRulePage = 1">
            <el-option :value="10" label="10" />
            <el-option :value="20" label="20" />
            <el-option :value="50" label="50" />
          </el-select>
          <el-pagination
            v-model:current-page="outboundRulePage"
            :total="sortedOutboundFirewallRules.length"
            :page-size="outboundRulePageSize"
            layout="prev, pager, next"
            prev-text="上一页"
            next-text="下一页"
            small
            background
          />
        </div>
      </div>
    </el-dialog>

    <el-dialog v-model="firewallRuleDialogVisible" :title="firewallRuleDialogTitle" width="760px" class="security-rule-dialog" append-to-body>
      <div class="security-rule-tip">
        <p>添加防火墙规则会改变服务器访问范围，请确认来源、端口和策略后再保存。</p>
        <p>TCP / UDP 支持端口和端口段；PING / ALL 属于高级协议规则，保存前请确认来源范围。</p>
      </div>
      <div class="security-rule-form security-rule-form-wide">
        <label>
          <span>使用防火墙</span>
          <el-select v-model="firewallForm.backend">
            <el-option label="自动选择（推荐）" value="auto" />
            <el-option v-for="item in writableFirewallBackends" :key="item.key" :label="item.label" :value="item.key" />
          </el-select>
        </label>
        <label>
          <span>应用类型</span>
          <el-select v-model="firewallAppType" @change="applyFirewallAppType">
            <el-option
              v-for="item in firewallAppTypeOptions"
              :key="item.value"
              :label="firewallAppTypeOptionLabel(item)"
              :value="item.value"
              :disabled="!!getFirewallAppTypeDisabledReason(item.value)"
            />
          </el-select>
        </label>
        <label>
          <span>{{ peerPresetLabel }}</span>
          <el-select v-model="firewallAddressPreset" @change="applyFirewallAddressPreset">
            <el-option :label="customPeerPresetLabel" value="custom" />
            <el-option :label="allIpv4PresetLabel" value="ipv4" />
            <el-option :label="allIpv6PresetLabel" value="ipv6" />
          </el-select>
        </label>
        <label>
          <span>协议</span>
          <el-select v-model="firewallForm.protocol">
            <el-option label="TCP" value="tcp" />
            <el-option label="UDP" value="udp" />
            <el-option label="PING / ICMP" value="icmp" />
            <el-option label="PING / ICMPv6" value="icmpv6" />
            <el-option label="ALL" value="all" />
          </el-select>
        </label>
        <label>
          <span>端口</span>
          <input v-model.trim="firewallForm.port" :disabled="!firewallProtocolNeedsPort" :placeholder="firewallProtocolNeedsPort ? '如 80、443 或 8000-8100' : '当前协议不需要端口'" />
        </label>
        <label>
          <span>策略</span>
          <el-select v-model="firewallForm.action">
            <el-option label="允许" value="allow" />
            <el-option label="拒绝" value="deny" />
          </el-select>
        </label>
        <label class="security-rule-wide-field">
          <span>{{ peerInputLabel }}</span>
          <input v-model.trim="firewallPeerValue" :placeholder="peerInputPlaceholder" />
        </label>
      </div>
      <template #footer>
        <el-button @click="closeFirewallRuleDialog">取消</el-button>
        <el-button type="primary" :disabled="!connected || !isSSHSession || !firewallManageSupported || !canSubmitFirewallRule" @click="submitFirewallRule">确定</el-button>
      </template>
    </el-dialog>
    <el-drawer
      v-model="firewallInfoDrawerVisible"
      title="防火墙更多信息"
      :size="firewallInfoDrawerSize"
      :class="['firewall-info-drawer', { 'has-flow-lines': hasFirewallFlowLines }]"
      append-to-body
    >
      <div class="firewall-info-summary">
        <strong>{{ firewallBackendLabel }}</strong>
        <span>{{ firewallOverview.active ? '当前检测到防火墙运行中。' : '当前没有检测到运行中的主防火墙。' }}</span>
        <span>默认使用防火墙：{{ preferredFirewallLabel }}</span>
        <span>iptables 模式：{{ iptablesModeLabel }}</span>
      </div>
      <div v-if="firewallWarnings.length" class="firewall-info-note firewall-info-warning">
        <p v-for="warning in firewallWarnings" :key="warning">{{ warning }}</p>
      </div>
      <div ref="firewallDiagnosticFlowShellRef" class="firewall-diagnostic-flow-shell">
        <svg
          v-if="firewallCardFlowPaths.length"
          class="firewall-flow-overlay"
          :viewBox="`0 0 ${firewallCardFlowSvg.width} ${firewallCardFlowSvg.height}`"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <marker id="firewall-card-flow-arrow" markerWidth="8" markerHeight="8" refX="6.5" refY="4" orient="auto" markerUnits="strokeWidth">
              <path d="M 0 0 L 8 4 L 0 8 z" fill="currentColor" />
            </marker>
          </defs>
          <path
            v-for="path in firewallCardFlowPaths"
            :key="path.id"
            :d="path.d"
            class="firewall-card-flow-path"
            marker-end="url(#firewall-card-flow-arrow)"
          />
        </svg>
        <div class="firewall-diagnostic-list">
        <article class="firewall-diagnostic-card">
          <div class="firewall-diagnostic-head">
            <strong>当前生效规则</strong>
            <em :class="['status-pill', effectiveFirewallRules.length ? 'warning' : 'inactive']">{{ effectiveFirewallRules.length ? `${effectiveFirewallRules.length} 条规则` : '暂无规则' }}</em>
          </div>
          <p>显示已启用管理工具的规则；如果 UFW/firewalld 都未启用，则显示底层 tables 规则。</p>
          <small>未启用工具中的历史配置只在下方诊断卡片展示，不进入主表。</small>
        </article>
        <article
          v-for="item in firewallDiagnosticItems"
          :key="item.key"
          :ref="element => setFirewallCardRef(item.key, element)"
          :class="['firewall-diagnostic-card', 'selectable-firewall-card', { selected: selectedFirewallBackend === item.key, disabled: !item.detected }]"
          @click="selectFirewallBackend(item)"
        >
          <div class="firewall-diagnostic-head">
            <strong>{{ item.label }}</strong>
            <em :class="['status-pill', item.active ? 'active' : (item.detected ? 'neutral' : 'inactive')]">{{ item.active ? '启用中' : (item.detected ? '已检测' : '未检测') }}</em>
          </div>
          <p>{{ item.ruleCount ? `识别到 ${item.ruleCount} 条端口相关规则` : '没有识别到端口相关规则' }}</p>
          <small>{{ item.note }}</small>
        </article>
      </div>
      </div>
      <div class="firewall-info-note">
        这些信息用于排查当前服务器实际使用了哪种系统防火墙。日常添加端口规则时，只需要关注主页面的规则列表。
      </div>
      <template #footer>
        <div class="firewall-drawer-footer">
          <el-button plain :disabled="!canSetPreferredFirewall" @click="togglePreferredFirewall">{{ preferredFirewallButtonText }}</el-button>
          <el-button :type="selectedFirewallItem?.active && canToggleSelectedFirewall ? 'danger' : 'primary'" :disabled="!canToggleSelectedFirewall" @click="toggleSelectedFirewall">
            {{ firewallToggleButtonText }}
          </el-button>
        </div>
      </template>
    </el-drawer>
  </section>
</template>

<script setup>
  import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'

  const props = defineProps([
    'connected',
    'isSSHSession',
    'firewallLoading',
    'loadFirewallOverview',
    'firewallOverview',
    'firewallBackendLabel',
    'firewallForm',
    'firewallRuleDialogRequest',
    'firewallPreferredBackend',
    'firewallUserPreferredBackend',
    'firewallManageSupported',
    'createFirewallRule',
    'updateFirewallRule',
    'deleteFirewallRule',
    'setFirewallPreferredBackend',
    'enableFirewallBackend',
    'disableFirewallBackend',
    'firewallDiagnosticItems',
    'firewallRules',
    'effectiveFirewallRules',
    'effectiveFirewallLayers',
    'inboundFirewallRules',
    'outboundFirewallRules',
    'firewallAllowedRules',
    'listeningPorts',
    'tableTooltipOptions',
    'firewallRulePrimaryLabel',
    'firewallRuleSecondaryLabel',
    'firewallSourceLabel',
    'firewallDestinationLabel',
    'firewallPeerLabel',
    'firewallDirectionLabel',
    'firewallRuleKindLabel',
    'firewallRuleScopeLabel',
    'handleFirewallMenuCommand',
    'canManageFirewallRule',
    'canEditFirewallRule'
  ])

  const firewallRuleDialogVisible = ref(false)
  const firewallInfoDrawerVisible = ref(false)
  const firewallAppType = ref('custom')
  const firewallAddressPreset = ref('custom')
  const editingFirewallRule = ref(null)
  const selectedFirewallBackend = ref('all')
  const importRulesDialogVisible = ref(false)
  const importFileInputRef = ref(null)
  const importFileName = ref('')
  const importRuleMode = ref('overwrite')
  const importRulesText = ref('')
  const importRuleDirection = ref('inbound')
  const importRuleBackend = ref('auto')
  const oneClickAllowDialogVisible = ref(false)
  const sortDialogVisible = ref(false)
  const outboundRulesDialogVisible = ref(false)
  const ruleSortField = ref('port')
  const ruleSortOrder = ref('asc')
  const inboundRulePage = ref(1)
  const inboundRulePageSize = ref(20)
  const outboundRulePage = ref(1)
  const outboundRulePageSize = ref(10)
  const firewallDiagnosticFlowShellRef = ref(null)
  const firewallCardFlowPaths = ref([])
  const firewallCardFlowSvg = ref({ width: 0, height: 0 })

  const firewallAppTypeOptions = [
    { label: '自定义', value: 'custom' },
    { label: 'PING / ICMP', value: 'ping' },
    { label: 'PING / ICMPv6', value: 'ping6' },
    { label: 'ALL TCP (1-65535)', value: 'all-tcp' },
    { label: 'ALL UDP (1-65535)', value: 'all-udp' },
    { label: 'ALL 全部协议', value: 'all' },
    { label: 'SSH (22)', value: 'ssh' },
    { label: 'FTP 数据 (20)', value: 'ftp-data' },
    { label: 'FTP 控制 (21)', value: 'ftp-control' },
    { label: 'Telnet (23)', value: 'telnet' },
    { label: 'SMTP (25)', value: 'smtp' },
    { label: 'DNS TCP (53)', value: 'dns-tcp' },
    { label: 'DNS UDP (53)', value: 'dns' },
    { label: 'NTP (123/UDP)', value: 'ntp' },
    { label: 'SNMP (161/UDP)', value: 'snmp' },
    { label: 'Syslog (514/UDP)', value: 'syslog' },
    { label: 'HTTP (80)', value: 'http' },
    { label: 'HTTPS (443)', value: 'https' },
    { label: 'POP3 (110)', value: 'pop3' },
    { label: 'IMAP (143)', value: 'imap' },
    { label: 'LDAP (389)', value: 'ldap' },
    { label: 'SMB (445)', value: 'smb' },
    { label: 'SMTPS (465)', value: 'smtps' },
    { label: 'SMTP Submission (587)', value: 'submission' },
    { label: 'IMAPS (993)', value: 'imaps' },
    { label: 'POP3S (995)', value: 'pop3s' },
    { label: 'RDP (3389)', value: 'rdp' },
    { label: 'MySQL (3306)', value: 'mysql' },
    { label: 'PostgreSQL (5432)', value: 'postgresql' },
    { label: 'Redis (6379)', value: 'redis' },
    { label: 'Memcached (11211)', value: 'memcached' },
    { label: 'MongoDB (27017)', value: 'mongodb' },
    { label: 'Elasticsearch (9200)', value: 'elasticsearch' },
    { label: 'Kibana (5601)', value: 'kibana' },
    { label: 'ClickHouse HTTP (8123)', value: 'clickhouse-http' },
    { label: 'ClickHouse Native (9000)', value: 'clickhouse-native' },
    { label: 'Zookeeper (2181)', value: 'zookeeper' },
    { label: 'Kafka (9092)', value: 'kafka' },
    { label: 'MinIO API (9000)', value: 'minio-api' },
    { label: 'MinIO Console (9001)', value: 'minio-console' },
    { label: 'RabbitMQ (5672)', value: 'rabbitmq' },
    { label: 'MQTT (1883)', value: 'mqtt' },
    { label: 'Docker API (2375)', value: 'docker-api' },
    { label: 'Kubernetes API (6443)', value: 'kubernetes-api' },
    { label: 'Prometheus (9090)', value: 'prometheus' },
    { label: 'Grafana (3000)', value: 'grafana' },
    { label: 'Vite / Node Dev (5173)', value: 'vite' },
    { label: '宝塔面板 (8888)', value: 'bt-panel' },
    { label: '面板 HTTPS (8443)', value: 'panel-8443' },
    { label: 'Jenkins/Tomcat (8080)', value: 'web-8080' }
  ]

  const firewallAppPresets = {
    ping: { protocol: 'icmp', port: '' },
    ping6: { protocol: 'icmpv6', port: '' },
    'all-tcp': { protocol: 'tcp', port: '1-65535' },
    'all-udp': { protocol: 'udp', port: '1-65535' },
    all: { protocol: 'all', port: '' },
    'ftp-data': { protocol: 'tcp', port: '20' },
    'ftp-control': { protocol: 'tcp', port: '21' },
    ssh: { protocol: 'tcp', port: '22' },
    telnet: { protocol: 'tcp', port: '23' },
    smtp: { protocol: 'tcp', port: '25' },
    'dns-tcp': { protocol: 'tcp', port: '53' },
    dns: { protocol: 'udp', port: '53' },
    ntp: { protocol: 'udp', port: '123' },
    snmp: { protocol: 'udp', port: '161' },
    syslog: { protocol: 'udp', port: '514' },
    http: { protocol: 'tcp', port: '80' },
    https: { protocol: 'tcp', port: '443' },
    pop3: { protocol: 'tcp', port: '110' },
    imap: { protocol: 'tcp', port: '143' },
    ldap: { protocol: 'tcp', port: '389' },
    smb: { protocol: 'tcp', port: '445' },
    smtps: { protocol: 'tcp', port: '465' },
    submission: { protocol: 'tcp', port: '587' },
    imaps: { protocol: 'tcp', port: '993' },
    pop3s: { protocol: 'tcp', port: '995' },
    rdp: { protocol: 'tcp', port: '3389' },
    mysql: { protocol: 'tcp', port: '3306' },
    postgresql: { protocol: 'tcp', port: '5432' },
    redis: { protocol: 'tcp', port: '6379' },
    memcached: { protocol: 'tcp', port: '11211' },
    mongodb: { protocol: 'tcp', port: '27017' },
    elasticsearch: { protocol: 'tcp', port: '9200' },
    kibana: { protocol: 'tcp', port: '5601' },
    'clickhouse-http': { protocol: 'tcp', port: '8123' },
    'clickhouse-native': { protocol: 'tcp', port: '9000' },
    zookeeper: { protocol: 'tcp', port: '2181' },
    kafka: { protocol: 'tcp', port: '9092' },
    'minio-api': { protocol: 'tcp', port: '9000' },
    'minio-console': { protocol: 'tcp', port: '9001' },
    rabbitmq: { protocol: 'tcp', port: '5672' },
    mqtt: { protocol: 'tcp', port: '1883' },
    'docker-api': { protocol: 'tcp', port: '2375' },
    'kubernetes-api': { protocol: 'tcp', port: '6443' },
    prometheus: { protocol: 'tcp', port: '9090' },
    grafana: { protocol: 'tcp', port: '3000' },
    vite: { protocol: 'tcp', port: '5173' },
    'bt-panel': { protocol: 'tcp', port: '8888' },
    'panel-8443': { protocol: 'tcp', port: '8443' },
    'web-8080': { protocol: 'tcp', port: '8080' }
  }

  const firewallAppTypeLabels = {
    'icmp:': 'PING / ICMP',
    'icmpv6:': 'PING / ICMPv6',
    'all:': 'ALL 全部协议',
    'tcp:1-65535': 'ALL TCP',
    'udp:1-65535': 'ALL UDP',
    'tcp:20': 'FTP 数据',
    'tcp:21': 'FTP 控制',
    'tcp:22': 'SSH',
    'tcp:23': 'Telnet',
    'tcp:25': 'SMTP',
    'tcp:53': 'DNS TCP',
    'udp:53': 'DNS UDP',
    'udp:123': 'NTP',
    'udp:161': 'SNMP',
    'udp:514': 'Syslog',
    'tcp:80': 'HTTP',
    'tcp:110': 'POP3',
    'tcp:143': 'IMAP',
    'tcp:389': 'LDAP',
    'tcp:443': 'HTTPS',
    'tcp:445': 'SMB',
    'tcp:465': 'SMTPS',
    'tcp:587': 'SMTP Submission',
    'tcp:993': 'IMAPS',
    'tcp:995': 'POP3S',
    'tcp:3000': 'Grafana',
    'tcp:3306': 'MySQL',
    'tcp:3389': 'RDP',
    'tcp:5432': 'PostgreSQL',
    'tcp:5601': 'Kibana',
    'tcp:5672': 'RabbitMQ',
    'tcp:6379': 'Redis',
    'tcp:6443': 'Kubernetes API',
    'tcp:8080': 'Jenkins/Tomcat',
    'tcp:8123': 'ClickHouse HTTP',
    'tcp:8443': '面板 HTTPS',
    'tcp:8888': '宝塔面板',
    'tcp:9000': 'MinIO API / ClickHouse Native',
    'tcp:9001': 'MinIO Console',
    'tcp:9090': 'Prometheus / Kafka',
    'tcp:9200': 'Elasticsearch',
    'tcp:11211': 'Memcached',
    'tcp:27017': 'MongoDB'
  }

  const firewallProtocolNeedsPort = computed(() => ['tcp', 'udp'].includes(String(props.firewallForm.protocol || '').toLowerCase()))
  const canSubmitFirewallRule = computed(() => !firewallProtocolNeedsPort.value || !!String(props.firewallForm.port || '').trim())
  const firewallItems = computed(() => Array.isArray(props.firewallDiagnosticItems) ? props.firewallDiagnosticItems : [])
  const selectedFirewallItem = computed(() => firewallItems.value.find(item => item.key === selectedFirewallBackend.value) || null)
  const isWritableFirewallLayer = item => !!item?.detected && item.role !== 'compat-view' && ['ufw', 'firewalld', 'iptables', 'nftables'].includes(item.key)
  const selectedWritableBackend = computed(() => isWritableFirewallLayer(selectedFirewallItem.value) ? selectedFirewallItem.value.key : '')
  const writableFirewallBackends = computed(() => firewallItems.value.filter(isWritableFirewallLayer))
  const currentFirewallRuleBackend = computed(() => {
    const formBackend = String(props.firewallForm?.backend || 'auto').toLowerCase()
    if (formBackend && formBackend !== 'auto') return formBackend
    const preferredBackend = String(props.firewallPreferredBackend || 'auto').toLowerCase()
    if (preferredBackend && preferredBackend !== 'auto') return preferredBackend
    return String(props.firewallOverview?.recommendedBackend || props.firewallOverview?.backend || 'auto').toLowerCase()
  })
  const firewallWarnings = computed(() => Array.isArray(props.firewallOverview?.diagnostics?.firewallWarnings) ? props.firewallOverview.diagnostics.firewallWarnings : [])
  const firewallItemsByKey = computed(() => new Map(firewallItems.value.map(item => [item.key, item])))
  const iptablesModeLabel = computed(() => {
    const mode = String(props.firewallOverview?.diagnostics?.iptablesMode || 'unknown')
    if (mode === 'nf_tables') return 'nf_tables 兼容视图'
    if (mode === 'legacy') return 'legacy'
    if (mode === 'missing') return '未安装'
    return '未知'
  })
  const preferredFirewallLabel = computed(() => {
    const userKey = String(props.firewallUserPreferredBackend || 'auto')
    const currentKey = String(props.firewallPreferredBackend || 'auto')
    if (userKey === 'auto') {
      if (currentKey && currentKey !== 'auto') return `自动选择（${firewallItems.value.find(item => item.key === currentKey)?.label || currentKey}）`
      return '自动选择'
    }
    const item = firewallItems.value.find(layer => layer.key === userKey)
    const label = item?.label || userKey
    return item && !item.active ? `${label}（未启用，不生效）` : label
  })
  const selectedFirewallIsPreferred = computed(() => !!selectedFirewallItem.value && selectedFirewallItem.value.key === props.firewallUserPreferredBackend)
  const preferredFirewallButtonText = computed(() => {
    if (!selectedFirewallItem.value) return '设为默认管理'
    if (!selectedFirewallItem.value.active) return '启用后可设默认'
    return selectedFirewallIsPreferred.value
      ? '取消默认管理'
      : '设为默认管理'
  })
  const canSetPreferredFirewall = computed(() => isWritableFirewallLayer(selectedFirewallItem.value) && !!selectedFirewallItem.value.active)
  const firewallToggleSupported = computed(() => ['ufw', 'firewalld'].includes(selectedFirewallItem.value?.key))
  const canToggleSelectedFirewall = computed(() => {
    const item = selectedFirewallItem.value
    return !!item && item.detected && firewallToggleSupported.value
  })
  const firewallToggleButtonText = computed(() => {
    const item = selectedFirewallItem.value
    if (!item) return '启用'
    if (!firewallToggleSupported.value) return '底层接口不可启停'
    return item.active ? '停用' : '启用'
  })
  const displayedFirewallRules = computed(() => Array.isArray(props.effectiveFirewallRules) ? props.effectiveFirewallRules : [])
  const displayedInboundFirewallRules = computed(() => displayedFirewallRules.value.filter(rule => firewallRuleDirection(rule) !== 'outbound'))
  const displayedOutboundFirewallRules = computed(() => Array.isArray(props.outboundFirewallRules) ? props.outboundFirewallRules : displayedFirewallRules.value.filter(rule => firewallRuleDirection(rule) === 'outbound'))
  const sortedInboundFirewallRules = computed(() => sortFirewallRules(displayedInboundFirewallRules.value))
  const sortedOutboundFirewallRules = computed(() => sortFirewallRules(displayedOutboundFirewallRules.value))
  const pagedInboundFirewallRules = computed(() => {
    const totalPages = Math.max(1, Math.ceil(sortedInboundFirewallRules.value.length / inboundRulePageSize.value))
    const currentPage = Math.min(inboundRulePage.value, totalPages)
    const start = (currentPage - 1) * inboundRulePageSize.value
    return sortedInboundFirewallRules.value.slice(start, start + inboundRulePageSize.value)
  })
  const pagedOutboundFirewallRules = computed(() => {
    const totalPages = Math.max(1, Math.ceil(sortedOutboundFirewallRules.value.length / outboundRulePageSize.value))
    const currentPage = Math.min(outboundRulePage.value, totalPages)
    const start = (currentPage - 1) * outboundRulePageSize.value
    return sortedOutboundFirewallRules.value.slice(start, start + outboundRulePageSize.value)
  })
  const selectedRuleDirection = computed(() => String(props.firewallForm.direction || 'inbound').toLowerCase() === 'outbound' ? 'outbound' : 'inbound')
  const firewallRuleDialogTitle = computed(() => {
    const direction = selectedRuleDirection.value === 'outbound' ? '出站' : '入站'
    return editingFirewallRule.value ? `编辑${direction}规则` : `添加${direction}规则`
  })
  const peerPresetLabel = computed(() => selectedRuleDirection.value === 'outbound' ? '目标' : '来源')
  const customPeerPresetLabel = computed(() => selectedRuleDirection.value === 'outbound' ? '自定义目标' : '自定义来源')
  const allIpv4PresetLabel = computed(() => selectedRuleDirection.value === 'outbound' ? '全部 IPv4 目标' : '全部 IPv4 地址')
  const allIpv6PresetLabel = computed(() => selectedRuleDirection.value === 'outbound' ? '全部 IPv6 目标' : '全部 IPv6 地址')
  const peerInputLabel = computed(() => selectedRuleDirection.value === 'outbound' ? '目标地址' : '来源地址')
  const peerInputPlaceholder = computed(() => selectedRuleDirection.value === 'outbound' ? '输入目标 IP 地址或 CIDR 段，留空表示全部目标' : '输入来源 IP 地址或 CIDR 段，留空表示全部来源')
  const firewallPeerValue = computed({
    get() {
      return selectedRuleDirection.value === 'outbound' ? props.firewallForm.destination : props.firewallForm.source
    },
    set(value) {
      if (selectedRuleDirection.value === 'outbound') props.firewallForm.destination = value
      else props.firewallForm.source = value
    }
  })
  const parsedImportRules = computed(() => parseImportRules(importRulesText.value, importRuleDirection.value, importRuleBackend.value))
  const listeningAllowCandidates = computed(() => buildListeningAllowCandidates())
  const firewallFlowKeys = computed(() => buildFirewallFlowKeys())
  const hasFirewallFlowLines = computed(() => firewallFlowKeys.value.length > 1)
  const firewallInfoDrawerSize = computed(() => hasFirewallFlowLines.value ? '500px' : '420px')
  const firewallCardElements = new Map()
  let firewallCardFlowFrame = 0

  function firewallRuleDirection(rule = {}) {
    const direction = String(rule.direction || '').trim().toLowerCase()
    if (direction === 'inbound' || direction === 'outbound') return direction
    const chain = String(rule.chain || '').trim().toUpperCase()
    return chain === 'OUTPUT' ? 'outbound' : 'inbound'
  }

  function normalizeProtocol(protocol) {
    return String(protocol || '').trim().toLowerCase().replace(/6$/, '')
  }

  function normalizeAction(action) {
    const text = String(action || '').trim().toLowerCase()
    if (['deny', 'reject', 'block', '拒绝', '禁止', '阻止'].includes(text)) return 'deny'
    return 'allow'
  }

  function normalizePort(port) {
    return String(port || '').trim().replace(/:/g, '-')
  }

  function isValidPortInput(port) {
    const text = normalizePort(port)
    if (!text) return false
    return text.split(',').every(part => {
      const single = part.trim()
      const range = single.match(/^(\d{1,5})-(\d{1,5})$/)
      if (range) return Number(range[1]) >= 1 && Number(range[2]) <= 65535 && Number(range[1]) <= Number(range[2])
      const value = Number(single)
      return Number.isInteger(value) && value >= 1 && value <= 65535
    })
  }

  function getRuleSortValue(rule = {}) {
    if (ruleSortField.value === 'port') {
      const port = parseRuleTarget(rule).port || rule.port || rule.target || ''
      const firstPort = String(port).match(/\d+/)?.[0]
      return firstPort ? Number(firstPort) : 0
    }
    if (ruleSortField.value === 'peer') return firewallPeerLabel(rule)
    return String(rule[ruleSortField.value] || '').toLowerCase()
  }

  function sortFirewallRules(rules = []) {
    const direction = ruleSortOrder.value === 'desc' ? -1 : 1
    return [...rules].sort((a, b) => {
      const left = getRuleSortValue(a)
      const right = getRuleSortValue(b)
      if (typeof left === 'number' && typeof right === 'number') return (left - right) * direction
      return String(left).localeCompare(String(right), 'zh-Hans-CN', { numeric: true }) * direction
    })
  }

  function resetRuleSort() {
    ruleSortField.value = 'port'
    ruleSortOrder.value = 'asc'
  }

  function openImportRulesDialog() {
    importRuleBackend.value = props.firewallPreferredBackend || 'auto'
    importRuleDirection.value = 'inbound'
    importRuleMode.value = 'overwrite'
    importRulesText.value = ''
    importFileName.value = ''
    if (importFileInputRef.value) importFileInputRef.value.value = ''
    importRulesDialogVisible.value = true
  }

  function closeImportRulesDialog() {
    importRulesDialogVisible.value = false
    importRulesText.value = ''
    importFileName.value = ''
    if (importFileInputRef.value) importFileInputRef.value.value = ''
  }

  function selectImportFile() {
    importFileInputRef.value?.click()
  }

  function handleImportFileSelected(event) {
    const file = event.target?.files?.[0]
    if (!file) return
    importFileName.value = file.name
    const reader = new FileReader()
    reader.onload = () => {
      importRulesText.value = String(reader.result || '')
    }
    reader.onerror = () => {
      importRulesText.value = ''
      importFileName.value = ''
      ElMessage.error('读取 CSV 文件失败')
    }
    reader.readAsText(file, 'utf-8')
  }

  function downloadCsv(filename, rows) {
    const content = rows.map(row => row.map(value => {
      const text = String(value ?? '')
      return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
    }).join(',')).join('\n')
    const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = filename
    link.click()
    URL.revokeObjectURL(link.href)
  }

  function downloadImportTemplate() {
    downloadCsv('firewall-rules-template.csv', [
      ['方向', '协议', '端口', '策略', '来源', '目标', '后端'],
      ['入站', 'tcp', '80', '允许', '', '', 'auto'],
      ['入站', 'udp', '53', '允许', '192.168.1.0/24', '', 'auto'],
      ['出站', 'tcp', '443', '允许', '', '0.0.0.0/0', 'auto']
    ])
  }

  function exportCurrentFirewallRules() {
    const rows = [['方向', '协议', '端口', '策略', '来源', '目标', '后端']]
    for (const rule of displayedFirewallRules.value) {
      const target = parseRuleTarget(rule)
      rows.push([
        firewallRuleDirection(rule) === 'outbound' ? '出站' : '入站',
        target.protocol || rule.protocol || 'tcp',
        target.port || rule.port || '',
        rule.action === 'deny' ? '拒绝' : '允许',
        rule.source || '',
        rule.destination || rule.targetAddress || '',
        firewallRuleBackendLabel(rule) || 'auto'
      ])
    }
    downloadCsv('firewall-rules.csv', rows)
  }

  function openOneClickAllowDialog() {
    oneClickAllowDialogVisible.value = true
  }

  function openOutboundRulesDialog() {
    outboundRulesDialogVisible.value = true
  }

  function parseRuleTarget(rule = {}) {
    const target = String(rule.target || '').trim()
    const [targetPort = '', targetProtocol = ''] = target.split('/')
    const protocolOnly = !targetProtocol && ['all', 'icmp', 'icmpv6'].includes(target.toLowerCase()) ? target.toLowerCase() : ''
    const targetLooksLikePort = /^\d{1,5}([,:-]\d{1,5})*$/.test(targetPort)
    return {
      port: String(rule.port || (targetProtocol || targetLooksLikePort ? targetPort : '') || '').replace(/:/g, '-'),
      protocol: String(rule.protocol || targetProtocol || protocolOnly || 'tcp').toLowerCase()
    }
  }

  function firewallRuleAppTypeLabel(rule = {}) {
    if (rule.kind === 'service') {
      const service = String(rule.service || '').trim()
      return service ? service.toUpperCase() : '服务'
    }
    const target = parseRuleTarget(rule)
    const protocol = String(target.protocol || rule.protocol || '').toLowerCase()
    const port = String(target.port || rule.port || '').replace(/:/g, '-')
    return firewallAppTypeLabels[`${protocol}:${port}`] || '自定义'
  }

  function firewallRuleBackendLabel(rule = {}) {
    const rules = Array.isArray(rule.duplicateRules) && rule.duplicateRules.length ? rule.duplicateRules : [rule]
    const groups = new Map()
    for (const item of rules) {
      const backend = String(item.layerLabel || item.backend || '').trim()
      if (!backend) continue
      groups.set(backend, (groups.get(backend) || 0) + 1)
    }
    const labels = Array.from(groups.entries()).map(([backend, count]) => {
      const label = backend === 'ufw' ? 'UFW' : backend
      return count > 1 ? `${label}(${count})` : label
    })
    return labels.length ? labels.join(' / ') : '-'
  }

  function extractJsonValue(item = {}, keys = []) {
    for (const key of keys) {
      if (item[key] !== undefined && item[key] !== null) return item[key]
    }
    return ''
  }

  function normalizeImportDraft(draft = {}, fallbackDirection = 'inbound', fallbackBackend = 'auto', line = '') {
    const directionText = String(draft.direction || fallbackDirection || 'inbound').toLowerCase()
    const direction = ['outbound', '出站'].includes(directionText) ? 'outbound' : 'inbound'
    let protocol = String(draft.protocol || 'tcp').trim().toLowerCase()
    let port = normalizePort(draft.port)
    const target = String(draft.target || '').trim()
    if (target && !port) {
      const [targetPort = '', targetProtocol = ''] = target.split('/')
      if (targetProtocol) protocol = targetProtocol.toLowerCase()
      if (/^\d{1,5}([,:-]\d{1,5})*$/.test(targetPort)) port = normalizePort(targetPort)
      else if (['all', 'icmp', 'icmpv6'].includes(target.toLowerCase())) protocol = target.toLowerCase()
    }
    if (!['tcp', 'udp', 'icmp', 'icmpv6', 'all'].includes(protocol)) protocol = 'tcp'
    const action = normalizeAction(draft.action)
    const peer = String(direction === 'outbound' ? draft.destination : draft.source || '').trim()
    const rule = {
      backend: String(draft.backend || fallbackBackend || props.firewallPreferredBackend || 'auto').trim() || 'auto',
      direction,
      port: ['tcp', 'udp'].includes(protocol) ? port : '',
      protocol,
      action,
      source: direction === 'inbound' ? peer : '',
      destination: direction === 'outbound' ? peer : ''
    }
    const valid = !['tcp', 'udp'].includes(protocol) || isValidPortInput(port)
    return valid ? { valid: true, rule } : { valid: false, line }
  }

  function parseJsonImportRules(text, fallbackDirection, fallbackBackend) {
    try {
      const data = JSON.parse(text)
      const items = Array.isArray(data) ? data : [data]
      return items.map(item => normalizeImportDraft({
        backend: extractJsonValue(item, ['backend', '后端']),
        direction: extractJsonValue(item, ['direction', '方向']),
        protocol: extractJsonValue(item, ['protocol', '协议']),
        port: extractJsonValue(item, ['port', '端口']),
        target: extractJsonValue(item, ['target', '目标端口']),
        action: extractJsonValue(item, ['action', '策略']),
        source: extractJsonValue(item, ['source', '来源']),
        destination: extractJsonValue(item, ['destination', '目标'])
      }, fallbackDirection, fallbackBackend, JSON.stringify(item)))
    } catch (error) {
      return null
    }
  }

  function parseCsvLine(line = '') {
    const values = []
    let current = ''
    let quoted = false
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index]
      if (char === '"') {
        if (quoted && line[index + 1] === '"') {
          current += '"'
          index += 1
        } else {
          quoted = !quoted
        }
        continue
      }
      if (char === ',' && !quoted) {
        values.push(current.trim())
        current = ''
        continue
      }
      current += char
    }
    values.push(current.trim())
    return values
  }

  function normalizeCsvHeader(header = '') {
    const text = String(header || '').trim().toLowerCase()
    const map = {
      direction: 'direction',
      '方向': 'direction',
      protocol: 'protocol',
      '协议': 'protocol',
      port: 'port',
      '端口': 'port',
      action: 'action',
      '策略': 'action',
      source: 'source',
      from: 'source',
      '来源': 'source',
      destination: 'destination',
      to: 'destination',
      '目标': 'destination',
      backend: 'backend',
      '后端': 'backend'
    }
    return map[text] || ''
  }

  function parseCsvImportRules(text, fallbackDirection, fallbackBackend) {
    const lines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean)
    if (!lines.length) return []
    const firstLine = parseCsvLine(lines[0])
    const headers = firstLine.map(normalizeCsvHeader)
    if (!headers.some(Boolean)) return null
    return lines.slice(1).map(line => {
      const values = parseCsvLine(line)
      const draft = { direction: fallbackDirection, backend: fallbackBackend, action: 'allow', protocol: 'tcp', port: '', source: '', destination: '' }
      headers.forEach((key, index) => {
        if (key) draft[key] = values[index] || ''
      })
      return normalizeImportDraft(draft, fallbackDirection, fallbackBackend, line)
    })
  }

  function parseTextImportRule(line, fallbackDirection, fallbackBackend) {
    const tokens = String(line || '').replace(/[，;]/g, ',').split(/[\s,]+/).map(item => item.trim()).filter(Boolean)
    const draft = { direction: fallbackDirection, backend: fallbackBackend, action: 'allow', protocol: 'tcp', port: '', source: '', destination: '' }
    for (const token of tokens) {
      const [rawKey, rawValue] = token.includes('=') ? token.split('=') : ['', token]
      const key = rawKey.toLowerCase()
      const value = rawValue || ''
      const lower = value.toLowerCase()
      if (['inbound', '入站'].includes(lower)) {
        draft.direction = 'inbound'
        continue
      }
      if (['outbound', '出站'].includes(lower)) {
        draft.direction = 'outbound'
        continue
      }
      if (['allow', 'deny', 'reject', 'block', '允许', '拒绝', '放行', '禁止', '阻止'].includes(lower)) {
        draft.action = lower
        continue
      }
      if (['tcp', 'udp', 'icmp', 'icmpv6', 'all'].includes(lower)) {
        draft.protocol = lower
        continue
      }
      if (key === 'backend') {
        draft.backend = value
        continue
      }
      if (['source', 'from', 'src', '来源'].includes(key)) {
        draft.source = value
        continue
      }
      if (['destination', 'to', 'dst', '目标'].includes(key)) {
        draft.destination = value
        continue
      }
      const targetMatch = value.match(/^(\d{1,5}(?:[-:]\d{1,5})?(?:,\d{1,5}(?:[-:]\d{1,5})?)?)(?:\/(tcp|udp))?$/i)
      if (targetMatch) {
        draft.port = targetMatch[1]
        if (targetMatch[2]) draft.protocol = targetMatch[2].toLowerCase()
        continue
      }
      if (/^(any|all|\*|\d{1,3}(?:\.\d{1,3}){3}(?:\/\d{1,2})?|::\/0|[a-f0-9:]+(?:\/\d{1,3})?)$/i.test(value)) {
        if (draft.direction === 'outbound') draft.destination = ['any', 'all', '*'].includes(lower) ? '' : value
        else draft.source = ['any', 'all', '*'].includes(lower) ? '' : value
      }
    }
    return normalizeImportDraft(draft, fallbackDirection, fallbackBackend, line)
  }

  function parseImportRules(text, fallbackDirection, fallbackBackend) {
    const source = String(text || '').trim()
    if (!source) return { valid: [], invalid: [] }
    const parsedJson = source.startsWith('{') || source.startsWith('[') ? parseJsonImportRules(source, fallbackDirection, fallbackBackend) : null
    const parsedCsv = parsedJson ? null : parseCsvImportRules(source, fallbackDirection, fallbackBackend)
    const results = parsedJson || parsedCsv || source.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#')).map(line => parseTextImportRule(line, fallbackDirection, fallbackBackend))
    return {
      valid: results.filter(item => item.valid).map(item => item.rule),
      invalid: results.filter(item => !item.valid).map(item => item.line)
    }
  }

  function portValueMatches(rulePort, targetPort) {
    const target = Number(targetPort)
    if (!Number.isInteger(target)) return false
    return String(rulePort || '').split(',').some(part => {
      const text = normalizePort(part)
      const range = text.match(/^(\d+)-(\d+)$/)
      if (range) return target >= Number(range[1]) && target <= Number(range[2])
      return Number(text) === target
    })
  }

  function isPortAllowed(port = {}) {
    const protocol = normalizeProtocol(port.protocol)
    return (Array.isArray(props.firewallAllowedRules) ? props.firewallAllowedRules : []).some(rule => {
      if (firewallRuleDirection(rule) === 'outbound' || rule.action !== 'allow') return false
      const ruleProtocol = normalizeProtocol(rule.protocol)
      if (ruleProtocol === 'all' && !String(rule.port || '').trim()) return true
      if (ruleProtocol && ruleProtocol !== protocol) return false
      return portValueMatches(rule.port || rule.target, port.port)
    })
  }

  function buildListeningAllowCandidates() {
    const seen = new Set()
    return (Array.isArray(props.listeningPorts) ? props.listeningPorts : [])
      .filter(port => ['tcp', 'udp'].includes(normalizeProtocol(port.protocol)) && !isPortAllowed(port))
      .map(port => ({ ...port, protocol: normalizeProtocol(port.protocol) || 'tcp', key: `${normalizeProtocol(port.protocol)}-${port.port}` }))
      .filter(port => {
        if (seen.has(port.key)) return false
        seen.add(port.key)
        return true
      })
  }

  async function createFirewallRules(rules, successMessage) {
    const items = Array.isArray(rules) ? rules : []
    if (!items.length) return
    let created = 0
    for (const item of items) {
      const ok = await props.createFirewallRule?.(item, { silent: true, reset: false, reload: false })
      if (ok === false) break
      created += 1
    }
    await props.loadFirewallOverview?.()
    if (created) ElMessage.success(successMessage || `已新增 ${created} 条防火墙规则`)
    if (created < items.length) ElMessage.warning(`已新增 ${created} 条，剩余规则未完成`)
  }

  function openFirewallRuleDialog() {
    editingFirewallRule.value = null
    props.firewallForm.backend = props.firewallPreferredBackend || selectedWritableBackend.value || props.firewallForm.backend || 'auto'
    props.firewallForm.direction = 'inbound'
    props.firewallForm.source = ''
    props.firewallForm.destination = ''
    firewallAppType.value = 'custom'
    firewallAddressPreset.value = 'custom'
    firewallRuleDialogVisible.value = true
  }

  function openOutboundRuleDialog() {
    editingFirewallRule.value = null
    props.firewallForm.backend = props.firewallPreferredBackend || selectedWritableBackend.value || props.firewallForm.backend || 'auto'
    props.firewallForm.direction = 'outbound'
    props.firewallForm.source = ''
    props.firewallForm.destination = ''
    firewallAppType.value = 'custom'
    firewallAddressPreset.value = 'custom'
    firewallRuleDialogVisible.value = true
  }

  function closeFirewallRuleDialog() {
    firewallRuleDialogVisible.value = false
    editingFirewallRule.value = null
  }

  function openEditFirewallRuleDialog(rule) {
    if (!props.canEditFirewallRule(rule)) return
    const target = parseRuleTarget(rule)
    editingFirewallRule.value = rule
    props.firewallForm.backend = rule.backend || 'auto'
    props.firewallForm.direction = String(rule.direction || '').toLowerCase() === 'outbound' ? 'outbound' : 'inbound'
    props.firewallForm.port = target.port
    props.firewallForm.protocol = target.protocol
    props.firewallForm.action = rule.action || 'allow'
    props.firewallForm.source = !rule.source || rule.source === 'any' ? '' : rule.source
    props.firewallForm.destination = !rule.destination || rule.destination === 'any' ? '' : rule.destination
    firewallAppType.value = 'custom'
    firewallAddressPreset.value = firewallPeerValue.value === '::/0' ? 'ipv6' : 'custom'
    firewallRuleDialogVisible.value = true
  }

  watch(() => props.firewallRuleDialogRequest, value => {
    if (value) openFirewallRuleDialog()
  })

  watch(firewallItems, items => {
    if (items.some(item => item.key === selectedFirewallBackend.value && item.detected)) return
    const preferred = items.find(item => item.active && item.detected) || items.find(item => item.detected)
    selectedFirewallBackend.value = preferred?.key || ''
  }, { immediate: true })

  watch([firewallInfoDrawerVisible, firewallFlowKeys, firewallItems], async () => {
    await nextTick()
    scheduleFirewallCardFlowLayout()
  }, { deep: true })

  watch([() => sortedInboundFirewallRules.value.length, inboundRulePageSize], () => {
    const totalPages = Math.max(1, Math.ceil(sortedInboundFirewallRules.value.length / inboundRulePageSize.value))
    if (inboundRulePage.value > totalPages) inboundRulePage.value = totalPages
  })

  watch([() => sortedOutboundFirewallRules.value.length, outboundRulePageSize], () => {
    const totalPages = Math.max(1, Math.ceil(sortedOutboundFirewallRules.value.length / outboundRulePageSize.value))
    if (outboundRulePage.value > totalPages) outboundRulePage.value = totalPages
  })

  watch([currentFirewallRuleBackend, () => props.firewallForm.direction], () => {
    if (getFirewallAppTypeDisabledReason(firewallAppType.value)) firewallAppType.value = 'custom'
  })

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', scheduleFirewallCardFlowLayout)
  }

  onBeforeUnmount(() => {
    if (typeof window !== 'undefined') window.removeEventListener('resize', scheduleFirewallCardFlowLayout)
    if (firewallCardFlowFrame && typeof window !== 'undefined') window.cancelAnimationFrame(firewallCardFlowFrame)
  })

  function applyFirewallAppType(value) {
    const disabledReason = getFirewallAppTypeDisabledReason(value)
    if (disabledReason) {
      firewallAppType.value = 'custom'
      ElMessage.warning(disabledReason)
      return
    }
    const preset = firewallAppPresets[value]
    if (!preset) return
    props.firewallForm.protocol = preset.protocol
    props.firewallForm.port = preset.port
  }

  function applyFirewallAddressPreset(value) {
    if (value === 'custom') return
    firewallPeerValue.value = value === 'ipv6' ? '::/0' : ''
  }

  function getFirewallAppTypeDisabledReason(value) {
    if (!value || value === 'custom') return ''
    const preset = firewallAppPresets[value]
    if (!preset) return ''
    const backend = currentFirewallRuleBackend.value
    const direction = String(props.firewallForm?.direction || 'inbound').toLowerCase()
    if (backend === 'firewalld' && direction === 'outbound') return 'firewalld 暂不支持出站规则'
    if (backend === 'ufw' && ['icmp', 'icmpv6'].includes(String(preset.protocol || '').toLowerCase())) return 'UFW 普通规则不支持 PING'
    return ''
  }

  function firewallAppTypeOptionLabel(item) {
    const reason = getFirewallAppTypeDisabledReason(item.value)
    return reason ? `${item.label}（${reason}）` : item.label
  }

  async function submitImportRules() {
    const rules = parsedImportRules.value.valid
    if (importRuleMode.value === 'overwrite') {
      const removableRules = displayedFirewallRules.value.filter(rule => props.canManageFirewallRule(rule))
      if (removableRules.length) {
        try {
          await ElMessageBox.confirm(
            `覆盖导入会先删除当前 ${removableRules.length} 条可管理规则，再导入 CSV 中的规则。确认继续？`,
            '确认覆盖导入',
            { type: 'warning', confirmButtonText: '继续导入', cancelButtonText: '取消' }
          )
        } catch (error) {
          return
        }
        let removed = 0
        for (const rule of removableRules) {
          const ok = await props.deleteFirewallRule?.(rule, { confirm: false, silent: true, reload: false })
          if (ok === false) break
          removed += 1
        }
        if (removed < removableRules.length) {
          await props.loadFirewallOverview?.()
          ElMessage.warning(`已删除 ${removed} 条，覆盖导入未完成`)
          return
        }
      }
    }
    await createFirewallRules(rules, `已导入 ${rules.length} 条防火墙规则`)
    closeImportRulesDialog()
  }

  async function submitOneClickAllow() {
    const rules = listeningAllowCandidates.value.map(item => ({
      backend: props.firewallPreferredBackend || 'auto',
      direction: 'inbound',
      port: String(item.port || ''),
      protocol: normalizeProtocol(item.protocol) || 'tcp',
      action: 'allow',
      source: '',
      destination: ''
    }))
    await createFirewallRules(rules, `已一键放通 ${rules.length} 个监听端口`)
    oneClickAllowDialogVisible.value = false
  }

  async function submitFirewallRule() {
    const protocol = String(props.firewallForm.protocol || '').toLowerCase()
    const peer = String(firewallPeerValue.value || '').trim().toLowerCase()
    if (protocol === 'all' || (['tcp', 'udp'].includes(protocol) && String(props.firewallForm.port || '') === '1-65535')) {
      try {
        await ElMessageBox.confirm(
          peer && !['any', 'all', '*', '0.0.0.0/0', '::/0'].includes(peer)
            ? `这会放开选定${selectedRuleDirection.value === 'outbound' ? '目标' : '来源'}的全部端口或全部协议，请确认范围可信。`
            : `这会对全部${selectedRuleDirection.value === 'outbound' ? '目标' : '来源'}放开大量端口或全部协议，风险很高。确认继续？`,
          '确认添加高风险规则',
          { type: 'warning', confirmButtonText: '继续添加', cancelButtonText: '取消' }
        )
      } catch (error) {
        return
      }
    }
    if (editingFirewallRule.value) {
      await props.updateFirewallRule(editingFirewallRule.value)
    } else {
      await props.createFirewallRule()
    }
    closeFirewallRuleDialog()
  }

  function selectFirewallBackend(item) {
    if (!item?.detected) return
    selectedFirewallBackend.value = item.key
  }

  function buildFirewallFlowKeys() {
    const backend = String(props.firewallOverview?.backend || props.firewallOverview?.recommendedBackend || '').trim().toLowerCase()
    const iptablesMode = String(props.firewallOverview?.diagnostics?.iptablesMode || '').trim().toLowerCase()
    const nftDetected = !!firewallItemsByKey.value.get('nftables')?.detected
    const iptablesDetected = !!firewallItemsByKey.value.get('iptables')?.detected
    if (backend === 'ufw') {
      if (iptablesMode === 'nf_tables' && nftDetected) return ['ufw', 'iptables', 'nftables']
      if (iptablesDetected) return ['ufw', 'iptables']
      return ['ufw']
    }
    if (backend === 'firewalld') {
      if (nftDetected) return ['firewalld', 'nftables']
      if (iptablesDetected) return ['firewalld', 'iptables']
      return ['firewalld']
    }
    if (backend === 'nftables') return ['nftables']
    if (backend === 'iptables') {
      if (iptablesMode === 'nf_tables' && nftDetected) return ['iptables', 'nftables']
      return ['iptables']
    }
    const fallback = firewallItems.value.find(item => item.active && item.detected)
    return fallback ? [fallback.key] : []
  }

  function setFirewallCardRef(key, element) {
    if (element) firewallCardElements.set(key, element)
    else firewallCardElements.delete(key)
    scheduleFirewallCardFlowLayout()
  }

  function scheduleFirewallCardFlowLayout() {
    if (typeof window === 'undefined') return
    if (firewallCardFlowFrame) window.cancelAnimationFrame(firewallCardFlowFrame)
    firewallCardFlowFrame = window.requestAnimationFrame(() => {
      firewallCardFlowFrame = 0
      updateFirewallCardFlowLayout()
    })
  }

  function updateFirewallCardFlowLayout() {
    const shell = firewallDiagnosticFlowShellRef.value
    if (!shell || !firewallInfoDrawerVisible.value) {
      firewallCardFlowPaths.value = []
      return
    }
    const shellRect = shell.getBoundingClientRect()
    const width = Math.max(0, shell.clientWidth)
    const height = Math.max(0, shell.scrollHeight)
    firewallCardFlowSvg.value = { width, height }
    const keys = firewallFlowKeys.value
    if (keys.length < 2 || !width || !height) {
      firewallCardFlowPaths.value = []
      return
    }
    const anchorRects = keys
      .map(key => firewallCardElements.get(key)?.getBoundingClientRect())
      .filter(Boolean)
    if (anchorRects.length < 2) {
      firewallCardFlowPaths.value = []
      return
    }
    const sharedLaneX = Math.max(8, Math.min(...anchorRects.map(rect => rect.left - shellRect.left)) - 22)
    const paths = []
    for (let index = 0; index < keys.length - 1; index += 1) {
      const fromElement = firewallCardElements.get(keys[index])
      const toElement = firewallCardElements.get(keys[index + 1])
      if (!fromElement || !toElement) continue
      const fromRect = fromElement.getBoundingClientRect()
      const toRect = toElement.getBoundingClientRect()
      const startX = fromRect.left - shellRect.left + 8
      const startY = fromRect.top - shellRect.top + fromRect.height * 0.7
      const endX = toRect.left - shellRect.left + 8
      const endY = toRect.top - shellRect.top + toRect.height * 0.28
      paths.push({
        id: `${keys[index]}->${keys[index + 1]}`,
        d: [`M ${startX} ${startY}`, `H ${sharedLaneX}`, `V ${endY}`, `H ${Math.max(sharedLaneX, endX - 6)}`].join(' ')
      })
    }
    firewallCardFlowPaths.value = paths
  }

  function togglePreferredFirewall() {
    if (!canSetPreferredFirewall.value) return
    props.setFirewallPreferredBackend(selectedFirewallIsPreferred.value ? 'auto' : selectedFirewallItem.value.key)
  }

  async function toggleSelectedFirewall() {
    if (!canToggleSelectedFirewall.value) return
    const item = selectedFirewallItem.value
    const active = !!item.active
    try {
      await ElMessageBox.confirm(
        active
          ? `将尝试停用 ${item.label}。停用后服务器可能失去这层系统防火墙保护，请确认仍有云安全组或其他防护。`
          : `将尝试启用 ${item.label}。启用系统防火墙可能影响远程访问，请确认 SSH 端口已放行。`,
        active ? '确认停用防火墙' : '确认启用防火墙',
        { type: 'warning', confirmButtonText: active ? '停用' : '启用', cancelButtonText: '取消' }
      )
    } catch (error) {
      return
    }
    if (active) await props.disableFirewallBackend(item.key)
    else await props.enableFirewallBackend(item.key)
  }
</script>
