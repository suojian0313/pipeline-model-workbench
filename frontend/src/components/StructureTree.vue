<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { ChevronDown, ChevronRight, CircleDot, Folder, Layers } from 'lucide-vue-next';
import type { NavNode } from '../types';

const props = defineProps<{ nodes: NavNode[]; selectedNodeId: string | null; expandedIds: string[]; searchActive: boolean }>();
const emit = defineEmits<{ select: [node: NavNode]; toggle: [id: string] }>();
const element = ref<HTMLElement | null>(null);
const rows = computed(() => {
  const result: { node: NavNode; depth: number; expanded: boolean }[] = [];
  const expanded = new Set(props.expandedIds);
  const visit = (nodes: NavNode[], depth: number) => {
    for (const node of nodes) {
      const open = props.searchActive || expanded.has(node.id);
      result.push({ node, depth, expanded: open });
      if (open) visit(node.children, depth + 1);
    }
  };
  visit(props.nodes, 0);
  return result;
});
watch(() => [props.selectedNodeId, props.expandedIds] as const, async () => {
  await nextTick();
  element.value?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
});
</script>

<template>
  <div ref="element" class="structure-tree" role="tree" aria-label="模型结构">
    <div v-for="row in rows" :key="row.node.id" class="tree-row" :class="{ 'is-selected': row.node.id === selectedNodeId }" :style="{ paddingLeft: `${10 + row.depth * 16}px` }" role="treeitem" :aria-level="row.depth + 1" :aria-selected="row.node.id === selectedNodeId" :aria-expanded="row.node.children.length ? row.expanded : undefined" :data-node-id="row.node.id">
      <button v-if="row.node.children.length" class="tree-toggle" :aria-label="`${row.expanded ? '收起' : '展开'} ${row.node.label}`" @click="emit('toggle', row.node.id)"><ChevronDown v-if="row.expanded" :size="13" /><ChevronRight v-else :size="13" /></button>
      <span v-else class="tree-spacer" />
      <button class="tree-select" :title="row.node.label" @click="emit('select', row.node)">
        <CircleDot v-if="row.node.componentId && /焊|weld/i.test(row.node.label)" :size="14" class="weld-icon" />
        <Layers v-else-if="row.node.componentId" :size="14" />
        <Folder v-else :size="14" />
        <span>{{ row.node.label }}</span>
      </button>
    </div>
    <div v-if="!rows.length" class="empty-inline">没有匹配的构件</div>
  </div>
</template>
