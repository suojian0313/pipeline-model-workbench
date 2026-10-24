<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Box, ChevronLeft, ChevronRight, CircleHelp, Crosshair, Home, Layers, LoaderCircle, Maximize, Minus, PanelLeftClose, PanelRightClose, Plus, RefreshCw, RotateCcw, RotateCw, Search, Settings2, X } from 'lucide-vue-next';
import ModelViewport from './components/ModelViewport.vue';
import PropertyPanel from './components/PropertyPanel.vue';
import StructureTree from './components/StructureTree.vue';
import { ApiClient } from './lib/api';
import { buildNavigation, collectComponentIds, filterNavigation, findNodePath, mergeComponentBounds } from './lib/modelState';
import type { Component, NavNode, Progress, RawTreeNode, Summary, ViewerMetrics, ViewportHandle, WeldRecord } from './types';

const apiBase = ref('/node-api');
const components = ref<Component[]>([]);
const rawTree = ref<RawTreeNode[]>([]);
const summary = ref<Summary | null>(null);
const welds = ref<WeldRecord[]>([]);
const progress = ref<Progress | null>(null);
const emptyGeometryIds: string[] = [];
const completedGeometryIds = computed(() => progress.value?.completed_geometry_ids ?? emptyGeometryIds);
const selectedIds = ref<string[]>([]);
const selectedNodeId = ref<string | null>(null);
const selectedLabel = ref('');
const expandedIds = ref<string[]>([]);
const search = ref('');
const tab = ref<'tree' | 'welds'>('tree');
const weldFilter = ref<'all' | 'complete' | 'pending'>('all');
const loading = ref(true);
const error = ref('');
const viewerError = ref('');
const saveError = ref('');
const saveSuccess = ref('');
const saving = ref(false);
const modelReady = ref(false);
const viewportKey = ref(0);
function retryModel() { viewerError.value = ''; modelReady.value = false; viewportKey.value += 1; }
const progressVisible = ref(true);
const leftOpen = ref(true);
const rightOpen = ref(true);
const helpVisible = ref(false);
const viewport = ref<ViewportHandle | null>(null);
const metrics = ref<ViewerMetrics>({ fps: null, frameMsP95: null, firstVisibleMs: null, initialLoadedMs: null, visibleFeatures: 0, selectedVisibleFeatures: 0, progressVisibleFeatures: 0 });
let revision = 0;
let controller: AbortController | null = null;
const navigation = computed(() => buildNavigation(rawTree.value, components.value));
const visibleNavigation = computed(() => filterNavigation(navigation.value, search.value));
const selectedComponent = computed(() => selectedIds.value.length === 1 ? components.value.find(item => item.id === selectedIds.value[0]) ?? null : null);
const selectedWeld = computed(() => {
  const component = selectedComponent.value;
  return component?.kind.toLowerCase() === 'weld' ? welds.value.find(item => item.line_no === component.line_no && item.weld_no === component.weld_no) ?? null : null;
});
const weldComponents = computed(() => {
  const needle = search.value.trim().toLowerCase();
  const byKey = new Map(welds.value.map(item => [`${item.line_no}\u0000${item.weld_no}`, item]));
  return components.value.filter(item => {
    if (item.kind.toLowerCase() !== 'weld') return false;
    const record = byKey.get(`${item.line_no}\u0000${item.weld_no}`);
    const completed = Boolean(record?.welded_on);
    return (weldFilter.value === 'all' || (weldFilter.value === 'complete' ? completed : !completed)) && (!needle || `${item.line_no} ${item.weld_no}`.toLowerCase().includes(needle));
  }).map(component => ({ component, record: byKey.get(`${component.line_no}\u0000${component.weld_no}`) }));
});
const percent = computed(() => (progress.value?.percentage ?? 0).toFixed(2));
const message = (cause: unknown) => cause instanceof Error ? cause.message : '请求失败，请检查服务后重试';
const aborted = (cause: unknown) => cause instanceof DOMException && cause.name === 'AbortError';

async function load(reset = false) {
  const current = ++revision;
  controller?.abort();
  controller = new AbortController();
  const client = new ApiClient(apiBase.value, controller.signal);
  loading.value = true;
  saving.value = false;
  error.value = '';
  saveError.value = '';
  saveSuccess.value = '';
  if (reset) {
    components.value = []; rawTree.value = []; summary.value = null; welds.value = []; progress.value = null;
    selectedIds.value = []; selectedNodeId.value = null; selectedLabel.value = ''; expandedIds.value = [];
  }
  try {
    const [nextSummary, tree, items, records, nextProgress] = await Promise.all([client.summary(), client.tree(), client.components(), client.welds(), client.progress()]);
    if (current !== revision) return;
    summary.value = nextSummary; rawTree.value = tree; components.value = items; welds.value = records; progress.value = nextProgress;
    if (!expandedIds.value.length) {
      const first = navigation.value[0];
      if (first) { const path = [first.id]; let node = first; while (node.children.length === 1 && node.children[0]) { node = node.children[0]; path.push(node.id); } expandedIds.value = path; }
    }
  } catch (cause) { if (current === revision && !aborted(cause)) error.value = `读取项目失败：${message(cause)}`; }
  finally { if (current === revision) loading.value = false; }
}

function focus(ids = selectedIds.value) {
  const bounds = mergeComponentBounds(ids, components.value);
  if (bounds) viewport.value?.focusBounds(bounds);
}
function selectNode(node: NavNode) {
  selectedIds.value = collectComponentIds(node);
  selectedNodeId.value = node.id;
  selectedLabel.value = node.label;
  focus();
}
function toggleNode(id: string) { expandedIds.value = expandedIds.value.includes(id) ? expandedIds.value.filter(item => item !== id) : [...expandedIds.value, id]; }
function selectComponent(component: Component, fromCanvas = false) {
  selectedIds.value = [component.id]; selectedNodeId.value = component.id; selectedLabel.value = component.name;
  const path = findNodePath(navigation.value, component.id);
  expandedIds.value = [...new Set([...expandedIds.value, ...path.slice(0, -1)])];
  if (fromCanvas) { search.value = ''; tab.value = 'tree'; }
  else focus();
  if (window.innerWidth < 1050) { leftOpen.value = false; rightOpen.value = true; }
}
function selectGeometry(id: string | null) {
  if (id === null) { selectedIds.value = []; selectedNodeId.value = null; selectedLabel.value = ''; return; }
  const component = components.value.find(item => item.geometry_ids.includes(id));
  if (component) selectComponent(component, true);
}
async function saveWeld(date: string | null) {
  const target = selectedComponent.value;
  if (!target || !selectedWeld.value || saving.value || loading.value) return;
  const current = revision;
  const client = new ApiClient(apiBase.value, controller?.signal);
  saving.value = true; saveError.value = ''; saveSuccess.value = '';
  let persisted = false;
  try {
    await client.saveWeld(target.line_no, target.weld_no, date);
    persisted = true;
    const [records, nextProgress] = await Promise.all([client.welds(), client.progress()]);
    if (current !== revision) return;
    welds.value = records; progress.value = nextProgress;
    if (selectedComponent.value?.id === target.id) saveSuccess.value = date ? '焊接日期已保存' : '焊接日期已清空';
  } catch (cause) {
    if (current !== revision || aborted(cause)) return;
    const text = persisted ? `日期已保存，但进度刷新失败：${message(cause)}。请刷新项目。` : `保存失败：${message(cause)}`;
    if (selectedComponent.value?.id === target.id) saveError.value = text;
    else error.value = `焊点 ${target.line_no} / ${target.weld_no}：${text}`;
  } finally { if (current === revision) saving.value = false; }
}
watch(apiBase, () => { modelReady.value = false; viewerError.value = ''; void load(true); });
watch(selectedNodeId, () => { saveError.value = ''; saveSuccess.value = ''; });
onMounted(() => { if (window.innerWidth < 1050) { leftOpen.value = false; rightOpen.value = false; } void load(); });
onBeforeUnmount(() => { ++revision; controller?.abort(); });
</script>

<template>
  <div class="workbench" :class="{ 'left-closed': !leftOpen, 'right-closed': !rightOpen }">
    <header class="topbar">
      <div class="brand-mark"><Box :size="23" :stroke-width="1.7" /></div><div class="project-title"><h1>动力站管道模型</h1><span>施工进度工作台</span></div>
      <div class="topbar-divider" /><span class="project-code">JINDAN / 0728</span>
      <div class="topbar-actions"><label class="backend-setting"><Settings2 :size="14" /><span>数据服务</span><select data-testid="backend-select" v-model="apiBase" aria-label="数据服务"><option value="/node-api">Node.js</option><option value="/python-api">Python</option></select></label><button class="topbar-button" :disabled="loading || saving" data-testid="refresh-data" title="从数据库重新读取" @click="load()"><RefreshCw :size="15" :class="{ spinning: loading }" /><span>刷新</span></button><button class="topbar-button icon-only" aria-label="操作帮助" :aria-expanded="helpVisible" @click="helpVisible = !helpVisible"><CircleHelp :size="17" /></button></div>
    </header>

    <div class="workspace-body">
      <aside class="navigation-panel" :class="{ 'panel-hidden': !leftOpen }">
        <div class="panel-heading"><h2>模型结构</h2><span class="count-label">{{ summary?.business_components.toLocaleString() ?? '—' }} 构件</span><button class="icon-button panel-close" aria-label="收起结构树" @click="leftOpen = false"><PanelLeftClose :size="16" /></button></div>
        <div class="nav-tabs"><button :class="{ active: tab === 'tree' }" @click="tab = 'tree'"><Layers :size="14" />结构树</button><button :class="{ active: tab === 'welds' }" @click="tab = 'welds'">焊点 <span>{{ summary?.model_welds ?? '—' }}</span></button></div>
        <label class="search-field"><Search :size="15" /><input data-testid="tree-search" v-model="search" :placeholder="tab === 'tree' ? '搜索管线、构件或编号' : '搜索管线或焊点编号'" aria-label="搜索构件" /><button v-if="search" class="icon-button" aria-label="清除搜索" @click="search = ''"><X :size="12" /></button></label>
        <StructureTree v-if="tab === 'tree'" :nodes="visibleNavigation" :selected-node-id="selectedNodeId" :expanded-ids="expandedIds" :search-active="Boolean(search.trim())" @select="selectNode" @toggle="toggleNode" />
        <template v-else><div class="weld-filter"><button v-for="item in ([['all', '全部'], ['pending', '未完成'], ['complete', '已完成']] as const)" :key="item[0]" :class="{ active: weldFilter === item[0] }" @click="weldFilter = item[0]">{{ item[1] }}</button></div><div class="weld-quick-list"><button v-for="item in weldComponents" :key="item.component.id" class="weld-quick-row" :class="{ 'is-selected': selectedNodeId === item.component.id }" @click="selectComponent(item.component)"><span class="weld-dot" :class="{ complete: item.record?.welded_on }" /><span><strong>焊点 {{ item.component.weld_no }}</strong><small>{{ item.component.line_no }}</small></span><span class="weld-date-small">{{ item.record?.welded_on ?? '未完成' }}</span></button><p v-if="!weldComponents.length" class="empty-inline">没有匹配的焊点</p></div></template>
        <div class="panel-footnote"><span class="connection-dot" :class="{ disconnected: error || loading }" />{{ loading ? '正在读取项目…' : error ? '项目读取异常' : '项目数据已连接' }}</div>
      </aside>

      <main class="model-stage" aria-label="三维模型工作区">
        <div class="viewport-toolbar"><div class="toolbar-group"><button class="icon-button" :aria-label="leftOpen ? '收起结构树' : '展开结构树'" :aria-pressed="leftOpen" @click="leftOpen = !leftOpen"><Layers :size="17" /></button><span class="toolbar-separator" /><button class="icon-button" data-testid="home-view" title="复位视角" aria-label="复位视角" @click="viewport?.home()"><Home :size="17" /></button><button class="icon-button" title="定位所选构件" aria-label="定位所选构件" :disabled="!selectedIds.length" @click="focus()"><Crosshair :size="17" /></button><span class="toolbar-separator" /><button class="icon-button" data-testid="zoom-in" aria-label="放大" @click="viewport?.zoom(0.75)"><Plus :size="17" /></button><button class="icon-button" data-testid="zoom-out" aria-label="缩小" @click="viewport?.zoom(1.3)"><Minus :size="17" /></button></div><div class="toolbar-group view-options"><button @click="viewport?.setView('iso')">轴测</button><button @click="viewport?.setView('top')">俯视</button><button @click="viewport?.setView('front')">正视</button></div><div class="toolbar-group toolbar-end"><label class="progress-toggle"><input data-testid="progress-toggle" v-model="progressVisible" type="checkbox" /><span>施工进度</span></label><span class="toolbar-separator" /><button class="icon-button" :aria-label="rightOpen ? '收起属性面板' : '展开属性面板'" :aria-pressed="rightOpen" @click="rightOpen = !rightOpen"><PanelRightClose :size="17" /></button></div></div>
        <div v-if="error" class="error-banner" role="alert"><span>{{ error }}</span><button :disabled="loading" @click="load()">重新读取</button></div>
        <div v-if="viewerError" class="error-banner viewer-error" role="alert"><span>模型加载失败：{{ viewerError }}</span><button @click="retryModel">重新加载</button></div>
        <ModelViewport :key="viewportKey" ref="viewport" :api-base="apiBase" :components="components" :selected-ids="selectedIds" :completed-geometry-ids="completedGeometryIds" :progress-visible="progressVisible" @select="selectGeometry" @ready="modelReady = true" @metrics="metrics = $event" @error="viewerError = $event" />
        <div v-if="!modelReady && !viewerError" class="model-loading" role="status"><LoaderCircle :size="22" class="spinning" /><strong>正在加载三维模型</strong><span>动力站 · 管道及焊接构件</span></div>
        <div class="canvas-caption"><span class="caption-kicker">动力站 / 管道系统</span><span>{{ selectedIds.length ? `已选择 ${selectedIds.length} 个构件` : '单击构件查看属性' }}</span></div>
        <div v-if="helpVisible" class="interaction-help"><button class="icon-button" aria-label="关闭操作帮助" @click="helpVisible = false"><X :size="14" /></button><strong>模型操作</strong><p>左键拖动旋转 · 右键拖动平移<br />滚轮缩放 · 单击选择构件</p><p>点击结构树分组可定位整条管线。<br />选中焊点，在右侧维护焊接日期。</p></div>
        <div class="camera-pad" aria-label="相机控制"><button aria-label="向左旋转" title="向左旋转" @click="viewport?.orbit(-0.18)"><RotateCcw :size="16" /></button><button aria-label="向左平移" title="向左平移" @click="viewport?.pan(-40, 0)"><ChevronLeft :size="16" /></button><button aria-label="完整模型" title="完整模型" @click="viewport?.home()"><Maximize :size="15" /></button><button aria-label="向右平移" title="向右平移" @click="viewport?.pan(40, 0)"><ChevronRight :size="16" /></button><button aria-label="向右旋转" title="向右旋转" @click="viewport?.orbit(0.18)"><RotateCw :size="16" /></button></div>
        <div class="color-legend"><span><i class="legend-selected" />选中</span><span><i class="legend-completed" />已完成及相邻元件</span><span><i class="legend-original" />原始外观</span></div>
      </main>

      <div class="property-slot" :class="{ 'panel-hidden': !rightOpen }"><PropertyPanel :component="selectedComponent" :selected-count="selectedIds.length" :selected-label="selectedLabel" :weld="selectedWeld" :saving="saving" :save-error="saveError" :save-success="saveSuccess" :disabled="loading || Boolean(error)" @save="saveWeld" /></div>
    </div>

    <footer class="statusbar"><div class="construction-progress"><span>焊接完成</span><strong class="mono" data-testid="completed-welds">{{ progress?.completed_welds ?? '—' }}<span> / {{ progress?.total_welds ?? '—' }}</span></strong><div class="progress-track"><i :style="{ width: `${Math.min(100, Math.max(0, progress?.percentage ?? 0))}%` }" /></div><strong class="mono" data-testid="progress-percentage">{{ progress ? `${percent}%` : '—' }}</strong></div><span v-if="progress?.missing_links.length" class="missing-links" :title="progress.missing_links.map(item => `${item.line_no} / ${item.weld_no} / 元件${item.side}`).join('\n')">{{ progress.missing_links.length }} 处相邻元件未关联</span><div class="render-metrics"><span>首次显示 <b class="mono">{{ metrics.firstVisibleMs === null ? '—' : `${(metrics.firstVisibleMs / 1000).toFixed(2)} s` }}</b></span><span title="仅统计交互时实际渲染帧">交互 <b class="mono">{{ metrics.fps === null ? '待操作' : `${metrics.fps.toFixed(0)} FPS` }}</b></span><span class="metric-p95">P95 <b class="mono">{{ metrics.frameMsP95 === null ? '—' : `${metrics.frameMsP95.toFixed(1)} ms` }}</b></span></div></footer>
  </div>
</template>
