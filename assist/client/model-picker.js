import React from 'react';
import {createPortal} from 'react-dom';
import {noteFor} from './model-notes.js';

const h = React.createElement;
export const MODEL_SLOT = 'conversation.input.model';
/** The shipped picker registers at the default priority; -1 shadows it without touching its DOM. */
export const MODEL_PICKER_PRIORITY = -1;
const MARGIN = 12, GAP = 8;

/** Account and official providers come first, every other relative order preserved. */
export function orderModelProviders(groups) {
  const rank = id => (id === 'deepseek-account' ? 0 : id === 'deepseek-official' ? 1 : 2);
  return [...groups].sort((left, right) => rank(left.id) - rank(right.id));
}

/** Provider groups that actually carry models, in the host's display order. */
export function sectionsOf(snapshot) {
  const groups = Array.isArray(snapshot?.groups) ? snapshot.groups : [];
  return orderModelProviders(groups.filter(group => group && typeof group.id === 'string' && Array.isArray(group.models) && group.models.length > 0));
}
export function currentEntry(snapshot) {
  const current = snapshot?.current;
  if (!current || typeof current.provider !== 'string' || typeof current.model !== 'string') return null;
  for (const group of sectionsOf(snapshot)) {
    if (group.id !== current.provider) continue;
    for (const model of group.models) if (model && model.id === current.model) return {group, model};
  }
  return null;
}
export function effectiveEffort(entry, current) {
  const reasoning = entry?.model?.reasoning;
  if (!reasoning) return '';
  const id = current?.reasoningEffort !== undefined ? current.reasoningEffort : reasoning.defaultEffort;
  return typeof id === 'string' ? id : '';
}
/** Effort rows for the current model; a single advertised level offers no choice. */
export function effortRows(entry, current, providerDefaultLabel) {
  const reasoning = entry?.model?.reasoning;
  if (!reasoning) return [];
  const active = effectiveEffort(entry, current);
  const rows = [];
  if (reasoning.defaultEffort === undefined) {
    rows.push({id: 'effort:provider-default', effort: undefined, label: providerDefaultLabel, active: active === ''});
  }
  for (const effort of Array.isArray(reasoning.efforts) ? reasoning.efforts : []) {
    if (!effort || typeof effort.id !== 'string') continue;
    rows.push({id: 'effort:' + effort.id, effort: effort.id, label: typeof effort.name === 'string' && effort.name ? effort.name : effort.id, active: effort.id === active});
  }
  return rows.length > 1 ? rows : [];
}
/** The effort caption shown on the trigger: the active level, or the retained one. */
export function triggerEffortLabel(snapshot, entry, effortOptions) {
  const active = effortOptions.find(row => row.active);
  if (active) return active.label;
  if (entry) return '';
  return typeof snapshot?.retainedEffort === 'string' ? snapshot.retainedEffort : '';
}
export function busyState(snapshot) {
  return snapshot?.pending !== null && snapshot?.pending !== undefined;
}
export function loadingState(snapshot) {
  return snapshot?.status === 'loading' || snapshot?.status === 'idle';
}
/** Level one mirrors the reference design: the current model, then one cell per provider. */
export function levelOneRows(snapshot) {
  const entry = currentEntry(snapshot);
  const rows = [];
  if (entry) rows.push({kind: 'current', id: 'current', group: entry.group, model: entry.model});
  for (const group of sectionsOf(snapshot)) rows.push({kind: 'provider', id: 'provider:' + group.id, group});
  return rows;
}
export function modelsOf(group) {
  return Array.isArray(group?.models) ? group.models.filter(model => model && typeof model.id === 'string') : [];
}
/** Position the popup above the trigger, right-aligned and clamped to the viewport. */
export function menuGeometry(trigger, size, viewport) {
  const width = viewport.width, height = viewport.height;
  const left = Math.max(MARGIN, Math.min(trigger.right - size.width, width - size.width - MARGIN));
  const above = trigger.top - GAP - size.height;
  const top = above >= MARGIN ? above : Math.min(trigger.bottom + GAP, height - size.height - MARGIN);
  return {left: Math.round(left), top: Math.round(Math.max(MARGIN, top))};
}
/** The submenu opens beside the list, preferring the side with room. */
export function submenuGeometry(anchor, size, viewport) {
  const width = viewport.width, height = viewport.height;
  const left = anchor.right + GAP <= width - size.width - MARGIN
    ? anchor.right + GAP
    : Math.max(MARGIN, anchor.left - GAP - size.width);
  const top = Math.max(MARGIN, Math.min(anchor.top, height - size.height - MARGIN));
  return {left: Math.round(left), top: Math.round(top)};
}

function useAnchored(triggerRef, panelRef, open, measure) {
  const [position, setPosition] = React.useState(null);
  const last = React.useRef(null);
  React.useLayoutEffect(() => {
    if (!open) { last.current = null; setPosition(null); return; }
    const place = () => {
      const trigger = triggerRef.current, panel = panelRef.current;
      if (!trigger || !panel) return;
      const size = {width: panel.offsetWidth, height: panel.offsetHeight};
      if (!size.width || !size.height) return;
      const next = measure(trigger.getBoundingClientRect(), size, {width: globalThis.innerWidth, height: globalThis.innerHeight});
      // A new object on every observation would re-render forever; only real moves count.
      if (last.current && last.current.left === next.left && last.current.top === next.top) return;
      last.current = next;
      setPosition(next);
    };
    place();
    globalThis.addEventListener('resize', place);
    globalThis.addEventListener('scroll', place, true);
    const panel = panelRef.current;
    const observer = typeof globalThis.ResizeObserver === 'function' && panel ? new globalThis.ResizeObserver(place) : null;
    if (panel) observer?.observe(panel);
    return () => {
      observer?.disconnect();
      globalThis.removeEventListener('resize', place);
      globalThis.removeEventListener('scroll', place, true);
    };
  }, [open, measure]);
  return position;
}

/**
 * The composer model seat, rendered in place of the shipped picker.
 * Owner share (locked) and the injected directory face keep the host's semantics.
 */
export function ModelPicker({locked, available, directory, load, select, t, notesSource}) {
  const state = React.useSyncExternalStore(
    React.useCallback(listener => directory.subscribe(listener), [directory]),
    () => directory.getSnapshot(),
    () => directory.getSnapshot());
  // The injected notes source identity may change between renders; the subscription
  // pair must not, or the store would resubscribe on every update.
  const notesRef = React.useRef(notesSource);
  notesRef.current = notesSource;
  const subscribeNotes = React.useCallback(listener => notesRef.current.subscribe(listener), []);
  const readNotes = React.useCallback(() => notesRef.current.getSnapshot(), []);
  const notes = React.useSyncExternalStore(subscribeNotes, readNotes, readNotes);
  const [open, setOpen] = React.useState(false);
  const [submenu, setSubmenu] = React.useState(null);
  const [error, setError] = React.useState(null);
  const triggerRef = React.useRef(null), panelRef = React.useRef(null), submenuRef = React.useRef(null);
  const entry = currentEntry(state);
  const busy = busyState(state);
  const loading = loadingState(state) && sectionsOf(state).length === 0;
  const effortOptions = effortRows(entry, state?.current, t('picker.providerDefault'));
  const position = useAnchored(triggerRef, panelRef, open, menuGeometry);  const submenuPosition = useAnchored(panelRef, submenuRef, Boolean(submenu), submenuGeometry);

  React.useEffect(() => {
    if (!open) { setSubmenu(null); setError(null); return; }
    const onPointer = event => {
      if (triggerRef.current?.contains(event.target)) return;
      if (panelRef.current?.contains(event.target)) return;
      if (submenuRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onKey = event => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false); setSubmenu(null); triggerRef.current?.focus?.();
    };
    globalThis.document.addEventListener('pointerdown', onPointer, true);
    globalThis.document.addEventListener('keydown', onKey, true);
    return () => {
      globalThis.document.removeEventListener('pointerdown', onPointer, true);
      globalThis.document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  if (!available) return null;

  const show = () => {
    setOpen(true); setSubmenu(null); setError(null);
    try { const pending = load?.(); if (pending && typeof pending.catch === 'function') pending.catch(() => {}); } catch {}
  };
  const close = () => { setOpen(false); setSubmenu(null); triggerRef.current?.focus?.(); };
  const submit = selection => {
    // The menu stays open on failure so the reason is visible next to the rows.
    Promise.resolve()
      .then(() => select?.(selection))
      .then(result => {
        if (result && result.ok === false) { setError(result.error?.code ?? 'model-failed'); return; }
        close();
      })
      .catch(() => setError('model-failed'));
  };
  const pickModel = (group, model) => submit({provider: group.id, model: model.id});
  const pickEffort = row => {
    if (!entry) return;
    submit({provider: entry.group.id, model: entry.model.id, ...(row.effort === undefined ? {} : {reasoningEffort: row.effort})});
  };

  const modelOption = (group, model, selected) => {
    const note = noteFor(notes, group.id, model.id);
    const name = typeof model.name === 'string' && model.name ? model.name : model.id;
    return h('button', {
      key: group.id + '/' + model.id, type: 'button', role: 'menuitemradio', tabIndex: -1,
      'aria-checked': selected ? 'true' : 'false',
      className: 'lpa-model-option' + (selected ? ' lpa-model-option--current' : ''),
      disabled: busy,
      onClick: () => pickModel(group, model),
    },
    h('span', {className: 'lpa-model-copy'},
      h('span', {className: 'lpa-model-name'}, name),
      note ? h('span', {className: 'lpa-model-desc'}, note) : null),
    selected ? h('span', {className: 'lpa-model-check', 'aria-hidden': 'true'}, '✓') : null);
  };

  const providerCell = group => {
    const isOpen = submenu === group.id;
    return h('button', {
      key: group.id, type: 'button', role: 'menuitem', tabIndex: -1,
      className: 'lpa-model-cell' + (isOpen ? ' lpa-model-cell--open' : ''),
      'aria-haspopup': 'menu', 'aria-expanded': isOpen ? 'true' : 'false',
      onClick: () => setSubmenu(isOpen ? null : group.id),
      onMouseEnter: () => setSubmenu(group.id),
    },
    h('span', {className: 'lpa-model-cell-label'}, typeof group.name === 'string' && group.name ? group.name : group.id),
    h('span', {className: 'lpa-model-cell-chevron', 'aria-hidden': 'true'}, '›'));
  };

  const currentModel = entry ? entry.model : null;
  const triggerText = loading ? t('picker.loading') : currentModel ? (currentModel.name ?? currentModel.id) : t('picker.fallback');
  // A model that left the catalog keeps its effort caption, like the shipped picker.
  const effortLabel = triggerEffortLabel(state, entry, effortOptions);

  const list = h('div', {
    ref: panelRef, className: 'lpa-model-menu', role: 'menu', 'aria-label': t('picker.aria'),
    style: position ?? {left: 0, top: 0, visibility: 'hidden'},
    'aria-busy': loading || busy ? 'true' : 'false',
  },
  loading ? h('div', {className: 'lpa-model-status', role: 'status'}, t('picker.loading'))
    : sectionsOf(state).length === 0 ? h('div', {className: 'lpa-model-status'}, state?.status === 'error' ? t('picker.failed') : t('picker.empty'))
      : levelOneRows(state).map(row => row.kind === 'current'
        ? modelOption(row.group, row.model, true)
        : providerCell(row.group)),
  effortOptions.length ? h('div', {className: 'lpa-model-section'},
    h('div', {className: 'lpa-model-section-title'}, t('picker.effort')),
    effortOptions.map(row => h('button', {
      key: row.id, type: 'button', role: 'menuitemradio', tabIndex: -1,
      'aria-checked': row.active ? 'true' : 'false',
      className: 'lpa-model-option' + (row.active ? ' lpa-model-option--current' : ''),
      disabled: busy,
      onClick: () => pickEffort(row),
    },
    h('span', {className: 'lpa-model-copy'}, h('span', {className: 'lpa-model-name'}, row.label)),
    row.active ? h('span', {className: 'lpa-model-check', 'aria-hidden': 'true'}, '✓') : null))) : null,
  error ? h('div', {className: 'lpa-model-status lpa-model-status--error', role: 'alert'},
    error === 'session/writer-held' ? t('picker.sessionInUse') : t('picker.failed')) : null);

  const submenuPanel = submenu ? h('div', {
    ref: submenuRef, className: 'lpa-model-menu lpa-model-submenu', role: 'menu', 'aria-label': t('picker.aria'),
    style: submenuPosition ?? {left: 0, top: 0, visibility: 'hidden'},
  },
  (sectionsOf(state).find(group => group.id === submenu)?.models ?? []).map(model => modelOption(
    sectionsOf(state).find(group => group.id === submenu),
    model,
    Boolean(entry && entry.group.id === submenu && entry.model.id === model.id),
  ))) : null;

  return h('div', {className: 'lpa-model-root'},
    h('button', {
      ref: triggerRef, type: 'button', className: 'lpa-model-trigger',
      'aria-haspopup': 'menu', 'aria-expanded': open ? 'true' : 'false',
      'aria-label': t('picker.ariaCurrent', {model: triggerText}),
      title: effortLabel ? triggerText + ' · ' + effortLabel : triggerText,
      disabled: Boolean(locked),
      onClick: () => { if (open) close(); else show(); },
    },
    h('span', {className: 'lpa-model-trigger-icon', 'aria-hidden': 'true'}, '◈'),
    h('span', {className: 'lpa-model-trigger-label'}, triggerText),
    effortLabel ? h('span', {className: 'lpa-model-trigger-effort'}, effortLabel) : null,
    h('span', {className: 'lpa-model-chevron', 'aria-hidden': 'true'}, '▾')),
    open ? createPortal(h(React.Fragment, null, list, submenuPanel), globalThis.document.body) : null);
}
