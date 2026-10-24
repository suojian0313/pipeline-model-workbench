<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Bounds, Component, ViewerMetrics } from '../types';
import { PipelineViewer } from '../lib/PipelineViewer';
import { mergeComponentBounds } from '../lib/modelState';

const props = defineProps<{ apiBase: string; components: Component[]; selectedIds: string[]; completedGeometryIds: string[]; progressVisible: boolean }>();
const emit = defineEmits<{ select: [id: string | null]; ready: []; metrics: [metrics: ViewerMetrics]; error: [message: string] }>();
const host = ref<HTMLElement | null>(null);
const ready = ref(false);
const metrics = ref<ViewerMetrics>({ fps: null, frameMsP95: null, firstVisibleMs: null, initialLoadedMs: null,
  visibleFeatures: 0, selectedVisibleFeatures: 0, progressVisibleFeatures: 0 });
let controller: PipelineViewer | null = null;
const selectedGeometry = computed(() => {
  const ids = new Set(props.selectedIds);
  return new Set(props.components.filter(item => ids.has(item.id)).flatMap(item => item.geometry_ids));
});
const updateStyles = () => controller?.setStyles(selectedGeometry.value, new Set(props.completedGeometryIds), props.progressVisible);
const selectionBounds = computed(() => mergeComponentBounds(props.selectedIds, props.components));
watch(selectionBounds, bounds => controller?.setSelectionBounds(bounds));
watch([selectedGeometry, () => props.completedGeometryIds, () => props.progressVisible], updateStyles);
watch(() => props.apiBase, base => { ready.value = false; void controller?.load(base); });
onMounted(() => {
  if (!host.value) return;
  try {
    controller = new PipelineViewer(host.value, {
      select: id => emit('select', id), ready: () => { ready.value = true; emit('ready'); },
      metrics: value => { metrics.value = value; emit('metrics', value); }, error: value => emit('error', value),
    });
    updateStyles();
    controller.setSelectionBounds(selectionBounds.value);
    void controller.load(props.apiBase);
  } catch (error) { emit('error', error instanceof Error ? error.message : String(error)); }
});
onBeforeUnmount(() => controller?.destroy());
defineExpose({
  home: () => controller?.home(), focusBounds: (bounds: Bounds) => controller?.focusBounds(bounds),
  zoom: (factor: number) => controller?.zoom(factor), setView: (view: 'iso' | 'top' | 'front') => controller?.setView(view),
  orbit: (delta: number) => controller?.orbit(delta), pan: (dx: number, dy: number) => controller?.pan(dx, dy),
});
</script>

<template>
  <div ref="host" class="model-viewport" :data-ready="ready"
    :data-first-visible-ms="metrics.firstVisibleMs" :data-initial-loaded-ms="metrics.initialLoadedMs"
    :data-fps="metrics.fps" :data-frame-p95="metrics.frameMsP95"
    :data-selected-feature-count="metrics.selectedVisibleFeatures" :data-progress-feature-count="metrics.progressVisibleFeatures" />
</template>

<style scoped>
.model-viewport { position: absolute; inset: 0; overflow: hidden; }
</style>
