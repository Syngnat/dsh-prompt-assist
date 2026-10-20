import React from 'react';
import {normalizeNoteText, noteKey} from './model-notes.js';
const h = React.createElement;

/** Profile-wide, display-only annotations shown under each model in the composer menu. */
export function ModelNotesCard({send, globalSource, t}) {
  const global = React.useSyncExternalStore(globalSource.subscribe, globalSource.getSnapshot, globalSource.getSnapshot);
  const notes = global.data?.notes ?? {};
  const revision = global.data?.notesRevision;
  const available = global.data?.notesAvailable === true;
  const editable = available && Number.isSafeInteger(revision);
  const [catalog, setCatalog] = React.useState({status: 'idle', models: []});
  const [error, setError] = React.useState(null);
  const [saving, setSaving] = React.useState('');
  const [drafts, setDrafts] = React.useState({});

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setCatalog({status: 'loading', models: []});
      try {
        const first = await send('catalog', '', {});
        const providers = (first?.providers ?? []).filter(provider => typeof provider?.id === 'string' && provider.id);
        const models = [];
        for (const provider of providers) {
          let page;
          try { page = await send('catalog', '', {provider: provider.id}); } catch { continue; }
          for (const model of page?.models ?? []) {
            if (typeof model?.id !== 'string' || !model.id) continue;
            models.push({provider: provider.id, providerName: provider.name ?? provider.id, id: model.id, name: model.name ?? model.id});
          }
        }
        if (!cancelled) setCatalog({status: 'ready', models});
      } catch (caught) {
        if (!cancelled) { setCatalog({status: 'error', models: []}); setError(caught); }
      }
    })();
    return () => { cancelled = true; };
  }, [send]);

  const commit = async (model, raw) => {
    const value = normalizeNoteText(raw);
    const key = noteKey(model.provider, model.id);
    if (!key) return;
    if ((notes[key] ?? '') === value) {
      setDrafts(old => { const next = {...old}; delete next[key]; return next; });
      return;
    }
    setSaving(key); setError(null);
    const attempt = async currentRevision => send('save-note', '', {
      provider: model.provider, model: model.id, text: value, expectedRevision: currentRevision,
    });
    try {
      await attempt(revision);
    } catch (caught) {
      // One retry against the freshly read revision; the Host still owns the CAS decision.
      if (caught?.code === 'stale-model-notes') {
        const fresh = globalSource.getSnapshot()?.data?.notesRevision;
        try { await attempt(fresh); } catch (next) { setError(next); }
      } else setError(caught);
    } finally {
      setSaving('');
      setDrafts(old => { const next = {...old}; delete next[key]; return next; });
    }
  };

  const rows = catalog.models.map(model => {
    const key = noteKey(model.provider, model.id);
    const saved = key ? (notes[key] ?? '') : '';
    const value = key && Object.hasOwn(drafts, key) ? drafts[key] : saved;
    const label = model.name === model.id ? key : `${model.name} · ${key}`;
    return h('div', {className: 'lpa-note-row', key},
      h('code', {title: label}, label),
      h('input', {
        type: 'text', value, maxLength: 120, disabled: !editable || saving === key,
        placeholder: t('modelNotePlaceholder'), 'aria-label': label,
        onChange: event => setDrafts(old => ({...old, [key]: event.target.value})),
        onBlur: event => { void commit(model, event.target.value); },
        onKeyDown: event => { if (event.key === 'Enter') { event.preventDefault(); void commit(model, event.currentTarget.value); } },
      }));
  });

  return h('section', {className: 'lpa-card', 'aria-label': t('modelNotesTitle')},
    h('header', {className: 'lpa-card-header'},
      h('h2', {className: 'lpa-card-title'}, t('modelNotesTitle')),
      h('p', {className: 'lpa-note'}, t('modelNotesHint'))),
    !available ? h('p', {className: 'lpa-note', role: 'status'}, t('modelNotesUnavailable')) : null,
    available && !Number.isSafeInteger(revision) ? h('p', {className: 'lpa-note', role: 'status'}, t('settings.hostUpgrade')) : null,
    catalog.status === 'loading' ? h('p', {className: 'lpa-note', role: 'status'}, t('modelNotesLoading')) : null,
    catalog.status === 'ready' && rows.length === 0 ? h('p', {className: 'lpa-note lpa-empty-state'}, t('modelNotesEmpty')) : null,
    rows.length ? h('div', {className: 'lpa-note-grid'}, rows) : null,
    error ? h('p', {className: 'lpa-error', role: 'alert'}, t('modelNotesError')) : null);
}
