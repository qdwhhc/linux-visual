<template>
  <section class="panel placeholder-panel page-section table-page ports-page port-management-page panel-scroller">
    <div class="section-line page-hero-line">
      <div>
        <h3>端口管理</h3>
        <p>{{ isSSHSession ? '集中查看服务器暴露面：谁在监听端口、是否已放行、风险在哪里，以及下一步怎么处理。' : 'SFTP 连接不支持端口管理。' }}</p>
      </div>
      <div class="service-actions">
        <el-button plain :disabled="!connected || !isSSHSession" @click="portMoreInfoVisible = true">更多信息</el-button>
        <el-button :disabled="!connected || !isSSHSession || firewallLoading" @click="loadFirewallOverview({ notify: true })">
          {{ firewallLoading ? '刷新中...' : '刷新端口' }}
        </el-button>
      </div>
    </div>

    <div class="port-exposure-grid">
      <article v-for="item in exposureCards" :key="item.key" :class="['port-exposure-card', item.tone]">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
        <small>{{ item.hint }}</small>
      </article>
    </div>

    <div class="port-list-section">
      <div class="section-line compact-section-line">
        <div>
          <h3>当前监听端口</h3>
          <p>{{ firewallOverview.diagnostics?.listening?.note || '监听端口代表服务已经启动；放行会跳转到防火墙规则页创建对应规则。' }}</p>
        </div>
        <em :class="['status-pill', portRows.length ? 'warning' : 'inactive']">{{ portRows.length ? `${portRows.length} 个监听端口` : '未识别到监听端口' }}</em>
      </div>
      <div class="port-table-shell">
        <el-table border :data="pagedPortRows" height="100%" :show-overflow-tooltip="tableTooltipOptions" row-key="id" class="manage-table listening-table port-exposure-table" empty-text="没有检测到正在监听的端口">
          <el-table-column label="端口" width="100">
            <template #default="{ row }"><span class="port-inline-number">{{ row.port }}</span></template>
          </el-table-column>
          <el-table-column label="协议" width="90">
            <template #default="{ row }">{{ row.protocol.toUpperCase() }}</template>
          </el-table-column>
          <el-table-column min-width="180">
            <template #header>
              <div class="table-header-inline-actions">
                <span>监听地址</span>
                <button
                  class="visibility-toggle-btn"
                  type="button"
                  :title="listeningAddressVisible ? '隐藏监听地址' : '显示监听地址'"
                  :aria-label="listeningAddressVisible ? '隐藏监听地址' : '显示监听地址'"
                  @click.stop="toggleListeningAddressVisibility"
                >
                  <el-icon class="visibility-eye-icon">
                    <View v-if="listeningAddressVisible" />
                    <Hide v-else />
                  </el-icon>
                </button>
              </div>
            </template>
            <template #default="{ row }">
              <span class="masked-inline-value">{{ formatSensitiveIp(row.address, listeningAddressVisible) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="进程" min-width="150">
            <template #default="{ row }">{{ row.process || '-' }}</template>
          </el-table-column>
          <el-table-column label="防火墙状态" width="130">
            <template #default="{ row }">
              <em :class="['port-text-status', row.firewallStatusClass]">{{ row.firewallStatusLabel }}</em>
            </template>
          </el-table-column>
          <el-table-column label="风险" width="140">
            <template #default="{ row }">
              <em :class="['port-text-status', row.riskClass]">{{ row.riskLabel }}</em>
            </template>
          </el-table-column>
          <el-table-column label="建议" min-width="180">
            <template #default="{ row }">{{ row.riskHint }}</template>
          </el-table-column>
          <el-table-column label="操作" width="160" align="left" fixed="right">
            <template #default="{ row }">
              <div class="table-action-links" @click.stop>
                <button class="port-action-link port-action-link--detail" type="button" @click="openPortDetail(row)">详情</button>
                <button v-if="!row.firewallRules.length" class="port-action-link port-action-link--allow" type="button" :disabled="!canAllowPort" @click="allowPort(row)">放行端口</button>
                <button v-else :class="['port-action-link', row.firewallMatchType === 'exact' ? 'port-action-link--close' : 'port-action-link--override']" type="button" :disabled="!canCloseFirewallRule(row)" @click="closeFirstFirewallRule(row)">{{ row.firewallMatchType === 'exact' ? '关闭放行' : '覆盖规则' }}</button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <div class="database-pagination-bar port-pagination-bar">
        <span class="database-pagination-summary port-pagination-summary">共 {{ portRows.length }} 个端口</span>
        <div class="port-pagination-actions">
          <el-select v-model="portPageSize" class="port-page-size-select" size="small" @change="portPage = 1">
            <el-option :value="20" label="20" />
            <el-option :value="50" label="50" />
            <el-option :value="100" label="100" />
          </el-select>
          <el-pagination
            v-model:current-page="portPage"
            :total="portRows.length"
            :page-size="portPageSize"
            layout="prev, pager, next"
            small
            background
          />
        </div>
      </div>
    </div>

    <el-drawer v-model="portDetailVisible" title="端口详情" size="460px" class="port-detail-drawer" append-to-body>
      <template v-if="selectedPort">
        <div class="port-detail-hero">
          <div>
            <span>端口</span>
            <strong>{{ selectedPort.port }}/{{ selectedPort.protocol.toUpperCase() }}</strong>
          </div>
          <em :class="['status-pill', selectedPort.riskClass]">{{ selectedPort.riskLabel }}</em>
        </div>

        <div class="port-detail-section">
          <h4>监听信息</h4>
          <dl class="port-detail-kv">
            <div><dt>监听地址</dt><dd>{{ formatSensitiveIp(selectedPort.address, listeningAddressVisible) }}</dd></div>
            <div><dt>暴露范围</dt><dd>{{ selectedPort.exposure === 'public' ? '公网监听' : '本机监听' }}</dd></div>
            <div><dt>进程</dt><dd>{{ selectedPort.process || '-' }}</dd></div>
            <div><dt>原始信息</dt><dd>{{ selectedPort.raw || '-' }}</dd></div>
          </dl>
        </div>

        <div class="port-detail-section">
          <h4>防火墙关联</h4>
          <div v-if="selectedPort.firewallRules.length" class="port-related-list">
            <article v-for="rule in selectedPort.firewallRules" :key="rule.id">
              <strong>{{ firewallRulePrimaryLabel(rule) }}</strong>
              <span>{{ firewallRuleSecondaryLabel(rule) }}</span>
            </article>
          </div>
          <p v-else class="port-detail-empty">没有匹配到已放行的入站防火墙规则。</p>
        </div>

        <div class="port-detail-section">
          <h4>Docker 映射</h4>
          <div v-if="selectedPort.dockerMappings.length" class="port-related-list">
            <article v-for="item in selectedPort.dockerMappings" :key="`${item.name}-${item.ports}`">
              <strong>{{ item.name }}</strong>
              <span>{{ item.ports }}</span>
            </article>
          </div>
          <p v-else class="port-detail-empty">没有匹配到 Docker 宿主机端口映射。</p>
        </div>

        <div class="port-detail-section">
          <h4>建议操作</h4>
          <p class="port-detail-advice">{{ selectedPort.riskHint }}</p>
          <div class="port-detail-actions">
            <el-button v-if="!selectedPort.firewallRules.length" type="primary" :disabled="!canAllowPort" @click="allowPort(selectedPort)">放行端口</el-button>
            <el-button v-else type="warning" plain :disabled="!canCloseFirewallRule(selectedPort)" @click="closeFirstFirewallRule(selectedPort)">{{ selectedPort.firewallMatchType === 'exact' ? '关闭放行' : '覆盖规则' }}</el-button>
          </div>
        </div>
      </template>
    </el-drawer>

    <el-dialog v-model="portMoreInfoVisible" title="端口更多信息" width="720px" class="port-more-info-dialog" append-to-body>
      <div class="port-more-info-grid">
        <article class="firewall-diagnostic-card">
          <div class="firewall-diagnostic-head">
            <strong>Docker 端口映射</strong>
            <em :class="['status-pill', dockerPublishedPorts.length ? 'warning' : (firewallOverview.diagnostics?.docker?.detected ? 'neutral' : 'inactive')]">{{ dockerPublishedPorts.length ? `${dockerPublishedPorts.length} 条映射` : (firewallOverview.diagnostics?.docker?.detected ? '已检测' : '未检测') }}</em>
          </div>
          <p>{{ dockerPublishedPorts.length ? dockerPublishedPorts.map(item => `${item.name}: ${item.ports}`).join('；') : '没有读取到容器发布到宿主机的端口映射。' }}</p>
          <small>{{ firewallOverview.diagnostics?.docker?.note || 'Docker 映射端口不等于系统防火墙已放行。' }}</small>
        </article>
        <article class="firewall-diagnostic-card">
          <div class="firewall-diagnostic-head">
            <strong>云安全组</strong>
            <em class="status-pill inactive">需手动核对</em>
          </div>
          <p>云主机即使系统防火墙已放行，若安全组未开放，外网仍然无法访问。</p>
          <small>{{ firewallOverview.diagnostics?.cloudSecurityGroup?.note || '请到云平台控制台检查入站规则。' }}</small>
        </article>
      </div>
    </el-dialog>
  </section>
</template>

<script setup>
  import { Hide, View } from '@element-plus/icons-vue'
  import { computed, ref, watch } from 'vue'

  const props = defineProps([
    'connected',
    'isSSHSession',
    'firewallLoading',
    'loadFirewallOverview',
    'firewallOverview',
    'listeningPorts',
    'tableTooltipOptions',
    'listeningAddressVisible',
    'toggleListeningAddressVisibility',
    'formatSensitiveIp',
    'firewallForm',
    'firewallManageSupported',
    'openFirewallRuleFromPort',
    'firewallAllowedRules',
    'firewallRulePrimaryLabel',
    'firewallRuleSecondaryLabel',
    'firewallSourceLabel',
    'firewallRuleKindLabel',
    'firewallRuleScopeLabel',
    'handleFirewallMenuCommand',
    'canManageFirewallRule',
    'dockerPublishedPorts'
  ])

  const portDetailVisible = ref(false)
  const portMoreInfoVisible = ref(false)
  const selectedPortId = ref('')
  const portPage = ref(1)
  const portPageSize = ref(50)

  const sensitivePorts = {
    22: { label: 'SSH 公网暴露', hint: '建议限制来源 IP，避免 SSH 被持续扫描。', severe: false },
    2375: { label: 'Docker API 高危', hint: 'Docker API 不应公网开放，请立即关闭放行或限制来源。', severe: true },
    3306: { label: '数据库高危', hint: '数据库端口建议只允许内网或固定 IP 访问。', severe: true },
    5432: { label: '数据库高危', hint: 'PostgreSQL 端口建议只允许内网或固定 IP 访问。', severe: true },
    6379: { label: 'Redis 高危', hint: 'Redis 公网暴露风险很高，建议关闭放行或限制来源。', severe: true },
    9200: { label: '搜索服务风险', hint: 'Elasticsearch 端口建议限制来源，避免数据泄露。', severe: true },
    11211: { label: '缓存服务风险', hint: 'Memcached 不建议公网访问。', severe: true },
    27017: { label: '数据库高危', hint: 'MongoDB 端口建议只允许内网或固定 IP 访问。', severe: true }
  }

  const canAllowPort = computed(() => props.connected && props.isSSHSession && props.firewallManageSupported)

  const portRows = computed(() => (Array.isArray(props.listeningPorts) ? props.listeningPorts : []).map(port => {
    const firewallRules = findFirewallRulesForPort(port)
    const firewallMatchType = getFirewallMatchType(port, firewallRules)
    const dockerMappings = findDockerMappingsForPort(port)
    const risk = evaluatePortRisk(port, firewallRules)
    return {
      ...port,
      firewallRules,
      firewallMatchType,
      dockerMappings,
      firewallStatusLabel: buildFirewallStatusLabel(port, firewallRules, firewallMatchType),
      firewallStatusClass: buildFirewallStatusClass(port, firewallRules),
      riskLabel: risk.label,
      riskClass: risk.className,
      riskLevel: risk.level,
      riskHint: risk.hint
    }
  }))

  const selectedPort = computed(() => portRows.value.find(item => item.id === selectedPortId.value) || null)

  const pagedPortRows = computed(() => {
    const totalPages = Math.max(1, Math.ceil(portRows.value.length / portPageSize.value))
    const currentPage = Math.min(portPage.value, totalPages)
    const start = (currentPage - 1) * portPageSize.value
    return portRows.value.slice(start, start + portPageSize.value)
  })

  watch([() => portRows.value.length, portPageSize], () => {
    const totalPages = Math.max(1, Math.ceil(portRows.value.length / portPageSize.value))
    if (portPage.value > totalPages) portPage.value = totalPages
  })

  const exposureCards = computed(() => {
    const publicPorts = portRows.value.filter(item => item.exposure === 'public')
    const localPorts = portRows.value.filter(item => item.exposure !== 'public')
    const allowedPorts = portRows.value.filter(item => item.firewallRules.length)
    const riskyPorts = portRows.value.filter(item => ['high', 'critical'].includes(item.riskLevel))
    return [
      { key: 'public', label: '公网监听', value: publicPorts.length, hint: '绑定 0.0.0.0 或 :: 的端口', tone: publicPorts.length ? 'warning' : 'neutral' },
      { key: 'local', label: '本机监听', value: localPorts.length, hint: '通常只能本机访问', tone: 'neutral' },
      { key: 'allowed', label: '防火墙放行', value: allowedPorts.length, hint: '匹配到入站允许规则', tone: allowedPorts.length ? 'active' : 'neutral' },
      { key: 'risk', label: '高风险端口', value: riskyPorts.length, hint: '数据库、缓存、Docker API 等', tone: riskyPorts.length ? 'danger' : 'neutral' }
    ]
  })

  function normalizeProtocol(protocol) {
    return String(protocol || '').trim().toLowerCase().replace(/6$/, '')
  }

  function isInboundRule(rule = {}) {
    const direction = String(rule.direction || '').trim().toLowerCase()
    const chain = String(rule.chain || '').trim().toUpperCase()
    return direction !== 'outbound' && chain !== 'OUTPUT'
  }

  function portValueMatches(rulePort, targetPort) {
    const target = Number(targetPort)
    if (!Number.isInteger(target)) return false
    return String(rulePort || '').split(',').some(part => {
      const text = part.trim()
      if (!text) return false
      const range = text.match(/^(\d+)[-:](\d+)$/)
      if (range) return target >= Number(range[1]) && target <= Number(range[2])
      return Number(text) === target
    })
  }

  function getFirewallRuleMatchType(rule = {}, port = {}) {
    const protocol = normalizeProtocol(rule.protocol)
    if (protocol === 'all' && !String(rule.port || '').trim()) return 'all'
    const target = Number(port.port)
    if (!Number.isInteger(target)) return ''
    for (const part of String(rule.port || rule.target || '').split(',')) {
      const text = part.trim()
      if (!text) continue
      const range = text.match(/^(\d+)[-:](\d+)$/)
      if (range && target >= Number(range[1]) && target <= Number(range[2])) return 'range'
      if (Number(text) === target) return 'exact'
    }
    return ''
  }

  function getFirewallMatchType(port, rules) {
    const types = rules.map(rule => getFirewallRuleMatchType(rule, port)).filter(Boolean)
    if (types.includes('all')) return 'all'
    if (types.includes('range')) return 'range'
    if (types.includes('exact')) return 'exact'
    return ''
  }

  function findFirewallRulesForPort(port) {
    return (Array.isArray(props.firewallAllowedRules) ? props.firewallAllowedRules : []).filter(rule => {
      if (!isInboundRule(rule) || rule.action !== 'allow') return false
      const protocol = normalizeProtocol(rule.protocol)
      if (protocol === 'all' && !String(rule.port || '').trim()) return true
      if (protocol && protocol !== normalizeProtocol(port.protocol)) return false
      return !!getFirewallRuleMatchType(rule, port) || portValueMatches(rule.port || rule.target, port.port)
    }).sort((a, b) => {
      const order = { exact: 0, range: 1, all: 2 }
      return (order[getFirewallRuleMatchType(a, port)] ?? 9) - (order[getFirewallRuleMatchType(b, port)] ?? 9)
    })
  }

  function findDockerMappingsForPort(port) {
    const protocol = normalizeProtocol(port.protocol)
    const pattern = new RegExp(`(^|[\\s,])(?:[\\d.\\[\\]:]+:)?${port.port}->[^,]*${protocol}`, 'i')
    return (Array.isArray(props.dockerPublishedPorts) ? props.dockerPublishedPorts : []).filter(item => pattern.test(String(item.ports || '')))
  }

  function buildFirewallStatusLabel(port, rules, matchType) {
    if (rules.length) {
      if (matchType === 'all') return '全部协议放行'
      if (matchType === 'range') return '端口段放行'
      return '单端口放行'
    }
    return port.exposure === 'public' ? '未放行' : '本机监听'
  }

  function buildFirewallStatusClass(port, rules) {
    if (rules.length) return 'active'
    return port.exposure === 'public' ? 'warning' : 'neutral'
  }

  function evaluatePortRisk(port, rules) {
    const number = Number(port.port)
    const sensitive = sensitivePorts[number]
    if (port.exposure !== 'public') {
      return { level: 'low', label: '低风险', className: 'neutral', hint: '当前仅本机监听，通常不会直接暴露到外网。' }
    }
    if (sensitive) {
      return {
        level: sensitive.severe && rules.length ? 'critical' : 'high',
        label: sensitive.severe ? '高风险' : '需限源',
        className: sensitive.severe ? 'failed' : 'warning',
        hint: sensitive.hint
      }
    }
    if (['80', '443'].includes(String(port.port))) {
      return { level: 'normal', label: 'Web 服务', className: 'active', hint: '常见 Web 端口，仍建议确认云安全组和站点配置。' }
    }
    if (rules.length) {
      return { level: 'medium', label: '公网放行', className: 'warning', hint: '端口已监听且已放行，请确认它确实需要外网访问。' }
    }
    return { level: 'medium', label: '需核对', className: 'warning', hint: '端口公网监听但未匹配到防火墙放行，仍需核对云安全组。' }
  }

  function openPortDetail(row) {
    selectedPortId.value = row.id
    portDetailVisible.value = true
  }

  async function allowPort(row) {
    const protocol = normalizeProtocol(row.protocol) || 'tcp'
    props.openFirewallRuleFromPort?.({ ...row, protocol })
  }

  function canCloseFirewallRule(row) {
    const rule = getDirectPortFirewallRule(row)
    return !!rule && props.canManageFirewallRule(rule)
  }

  function closeFirstFirewallRule(row) {
    const rule = getDirectPortFirewallRule(row)
    if (!rule) return
    props.handleFirewallMenuCommand(rule, 'delete')
  }

  function getDirectPortFirewallRule(row) {
    return (row.firewallRules || []).find(rule => getFirewallRuleMatchType(rule, row) === 'exact') || null
  }
</script>
