<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { CalendarDays, Check, CircleDot, Info, Save, X } from 'lucide-vue-next';
import type { Component, WeldRecord } from '../types';

const props = defineProps<{ component: Component | null; selectedCount: number; selectedLabel: string; weld: WeldRecord | null; saving: boolean; saveError: string; saveSuccess: string; disabled: boolean }>();
const emit = defineEmits<{ save: [date: string | null] }>();
const date = ref('');
const localError = ref('');
const showEmpty = ref(false);
const entries = computed(() => Object.entries(props.component?.properties ?? {}).filter(([, value]) => showEmpty.value || value !== ''));
const isWeld = computed(() => props.component?.kind.toLowerCase() === 'weld');
watch(() => [props.component?.id, props.weld?.welded_on] as const, () => { date.value = props.weld?.welded_on ?? ''; localError.value = ''; }, { immediate: true });
function save(value: string | null) {
  localError.value = '';
  if (value !== null) {
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) { localError.value = '请选择有效的焊接日期'; return; }
  }
  emit('save', value);
}
</script>

<template>
  <aside class="property-panel" data-testid="property-panel">
    <div class="panel-heading"><h2>构件属性</h2><span class="panel-caption">EP3D</span></div>
    <div v-if="!component" class="selection-empty">
      <Info :size="32" :stroke-width="1.4" />
      <strong>{{ selectedCount ? `已选择 ${selectedCount} 个构件` : '选择构件，查看属性' }}</strong>
      <p>{{ selectedCount ? selectedLabel : '在结构树或三维模型中单击构件。' }}</p>
      <span v-if="selectedCount" class="muted">已定位到所选范围</span>
    </div>
    <template v-else>
      <section class="component-identity">
        <span class="eyebrow">{{ isWeld ? '焊点' : '模型构件' }}</span>
        <h3>{{ component.name }}<span v-if="isWeld" class="mono"> #{{ component.weld_no }}</span></h3>
        <p class="mono">{{ component.line_no || '未标注管线' }}</p>
        <span class="subtle-tag">{{ component.geometry_ids.length }} 个几何片段</span>
      </section>
      <section v-if="isWeld" class="weld-editor" aria-label="焊接记录">
        <div class="section-title"><CalendarDays :size="15" /><h3>焊接记录</h3><span class="status-pill" :class="{ complete: weld?.welded_on }">{{ weld?.welded_on ? '已完成' : '未完成' }}</span></div>
        <template v-if="weld">
          <label for="weld-date">焊接日期</label>
          <input data-testid="weld-date" id="weld-date" v-model="date" type="date" :disabled="saving || disabled" />
          <div class="date-actions"><button data-testid="save-date" class="primary-button" :disabled="saving || disabled || !date || date === weld.welded_on" @click="save(date)"><Save :size="14" />{{ saving ? '保存中…' : '保存日期' }}</button><button data-testid="clear-date" class="secondary-button" :disabled="saving || disabled || !weld.welded_on" @click="save(null)"><X :size="13" />清空</button></div>
          <p v-if="localError || saveError" role="alert" class="inline-error">{{ localError || saveError }}</p>
          <p v-if="saveSuccess" role="status" class="inline-success"><Check :size="13" />{{ saveSuccess }}</p>
          <p class="editor-hint">填写日期后，焊点及相邻元件显示为已完成。</p>
          <dl class="weld-materials"><dt>元件 1</dt><dd>{{ weld.material_1 || '未关联' }}</dd><dt>元件 2</dt><dd>{{ weld.material_2 || '未关联' }}</dd></dl>
        </template>
        <p v-else class="inline-error">未读取到该焊点记录，请刷新重试。</p>
      </section>
      <section class="raw-properties">
        <div class="section-title"><CircleDot :size="14" /><h3>原始属性</h3><label class="empty-toggle"><input v-model="showEmpty" type="checkbox" />含空值</label></div>
        <dl class="property-list"><template v-for="[key, value] in entries" :key="key"><dt>{{ key }}</dt><dd>{{ value || '—' }}</dd></template></dl>
        <p v-if="!entries.length" class="muted">没有已填写的属性。</p>
      </section>
    </template>
  </aside>
</template>
