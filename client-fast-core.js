import { isOpenAIModel } from './policy.js';

export function createFast(require) {
    let React;
    let h;
    const NS = 'local-openai-fast';
    const quietCommandNames = Object.freeze(['openai-fast', 'openai-fast-ui-health']);
    function HiddenFastCommand() { return null; }
    const hydratingBindings = new WeakMap();
    function hasFastState(value) {
      return Boolean(value && typeof value === 'object' && !Array.isArray(value)
        && typeof value.enabled === 'boolean' && Array.isArray(value.providers)
        && value.providers.every(provider => typeof provider === 'string'));
    }
    function derivePresentation(fastState, selected, fallback) {
      const selection = selected ?? fallback;
      const family = isOpenAIModel(selection?.model);
      const ready = hasFastState(fastState);
      const eligible = Boolean(family && ready && fastState.providers.includes(selection.provider));
      return {
        visible: family,
        enabled: eligible && fastState.enabled === true,
        eligible,
        reason: !selection ? 'no-selection' : !family ? 'unsupported-model'
          : !ready ? 'loading' : !eligible ? 'unsupported-provider' : 'ready',
      };
    }
    /** Mark a binding ready only after a successful, usable projection read. */
    function hydrateSession(readyBindings, binding, sessionId, refresh, isReady = () => true) {
      if (readyBindings.has(binding)) {
        if (isReady()) return Promise.resolve(true);
        readyBindings.delete(binding);
      }
      if (hydratingBindings.has(binding)) return hydratingBindings.get(binding);
      let read;
      try { read = Promise.resolve(refresh(sessionId)); }
      catch (error) { read = Promise.reject(error); }
      const operation = read.then(() => {
        hydratingBindings.delete(binding);
       const ready = isReady() === true;
        if (ready) readyBindings.add(binding);
        return ready;
      }, error => {
        hydratingBindings.delete(binding);
        readyBindings.delete(binding);
        throw error;
      });
      hydratingBindings.set(binding, operation);
      void operation.catch(() => {});
      return operation;
    }
    /** Bounded, component-owned retries; successful RPC alone is not readiness. */
    function createHydrationRetry({attempt, isReady, onSettled = () => {}, setTimer = setTimeout, clearTimer = clearTimeout, delays = [250, 1000]}) {
      let operation, resolve, timer = null, disposed = false, finished = false;
      const finish = (ready, publish = true) => {
        if (finished) return;
        finished = true;
        if (publish && !disposed) { try { onSettled(ready); } catch {} }
        resolve?.(ready);
      };
      async function run(index) {
        try { await attempt(); } catch {}
        if (disposed || finished) return;
        let ready = false;
        try { ready = isReady() === true; } catch {}
        if (ready) { finish(true); return; }
        if (index >= delays.length) { finish(false); return; }
        try { timer = setTimer(() => { timer = null; void run(index + 1); }, delays[index]); }
        catch { finish(false); }
      }
      return {
        start() {
          if (operation) return operation;
          if (disposed) return operation = Promise.resolve(false);
          operation = new Promise(done => { resolve = done; });
          void run(0);
          return operation;
        },
        dispose() {
          disposed = true;
          if (timer !== null) clearTimer(timer);
          timer = null;
          finish(false, false);
        },
      };
    }
    /** Immediate local feedback; serialize saves and coalesce rapid clicks. */
    function createToggleController({ initial, send, publish, onError }) {
      let confirmed = initial;
      let desired = initial;
      let running = false;
      let operation = Promise.resolve();
      let last;
      function notify() {
        if (last?.enabled === desired && last.pending === running) return;
        last = { enabled: desired, pending: running };
        publish(last);
      }
      async function drain() {
        try {
          while (desired !== confirmed) {
            const sent = desired;
            try { await send(sent); }
            catch (error) {
              desired = confirmed;
              onError(error);
              break;
            }
            confirmed = sent;
          }
        } finally {
          running = false;
          notify();
        }
      }
      return {
        toggle() {
          desired = !desired;
          if (running) { notify(); return operation; }
          running = true;
          notify();
          operation = drain();
          return operation;
        },
        sync(value) {
          if (running) return;
          confirmed = desired = value;
          notify();
        },
      };
    }
    const dictionaries = {
      zh: {
        label: 'Fast',
        off: 'Fast 已关闭。开启后，后续本会话及继承设置的 OpenAI 子智能体请求使用 Priority 优先处理；需要服务商支持，可能额外计费。',
        on: 'Fast 已开启。后续本会话及继承设置的 OpenAI 子智能体请求使用 Priority 优先处理，可能额外计费；点击关闭。',
        saving: '正在保存 Fast 设置…', error: 'Fast 设置未保存，请重试。',
        loading: 'Fast 状态尚未确认，开关暂不可用；这不会更改已保存的 Fast 设置。',
        loadError: 'Fast 状态同步失败。请刷新页面，或检查 Host 与 Client 插件版本是否一致。',
        unsupportedProvider: '此供应商未在 Priority 允许名单中，Fast 不会开启。可在“提示词辅助 → Priority 供应商授权”中自助授权（该供应商必须确实提供 OpenAI 系列模型）。供应商 ID',
        access: '当前会话没有执行 Fast 开关命令的权限。',
      },
      en: {
        label: 'Fast',
        off: 'Fast is off. Enable Priority for this session and inheriting OpenAI subagents; provider support is required and additional charges may apply.',
        on: 'Fast is on for this session and inheriting OpenAI subagents; additional charges may apply. Click to turn off.',
        saving: 'Saving Fast preference…', error: 'Could not change Fast. Try again.',
        loading: 'Fast status is not confirmed yet; the control is temporarily unavailable. Existing Host settings are unchanged.',
        loadError: 'Fast state could not be loaded. Refresh or check that Host and Client plugin versions match.',
        unsupportedProvider: 'This provider is not authorized for Priority, so Fast stays off. Authorize it under “Prompt assist → Priority provider authorization”; the provider must actually offer OpenAI-family models. Provider ID',
        access: 'This session cannot execute Fast toggle commands.',
      },
    };
    const css = `
      .local-openai-fast{display:inline-flex;align-items:center;position:relative;flex:none}
      .local-openai-fast__button{display:inline-flex;align-items:center;justify-content:center;gap:4px;height:28px;padding:0 7px;border:1px solid transparent;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:20px;white-space:nowrap;cursor:pointer}
      .local-openai-fast__button:hover:not(:disabled):not([aria-disabled=true]){background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l1)}
      .local-openai-fast__button[aria-checked=true]{color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-brand-primary)}
      .local-openai-fast__button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
      .local-openai-fast__button:disabled,.local-openai-fast__button[aria-disabled=true]{opacity:.5;cursor:not-allowed}
      .local-openai-fast__button svg{display:block;flex:none}
      .local-openai-fast__error{position:absolute;bottom:34px;right:0;max-width:240px;width:max-content;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px;z-index:20}
      .local-openai-fast__notice{position:absolute;bottom:34px;right:0;max-width:280px;width:max-content;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px;z-index:20}
    `;

    function useDefaultSelection(remote) {
      const [selection, setSelection] = React.useState(null);
      React.useEffect(() => {
        let active = true;
        remote.session.modelCatalog().then(result => {
          if (active && result.ok) setSelection(result.value.default);
        }).catch(() => {});
        return () => { active = false; };
      }, [remote]);
      return selection;
    }

    function FastToggle(props) {
      const fastState = React.useSyncExternalStore(props.fastSource.subscribe, props.fastSource.getSnapshot, props.fastSource.getSnapshot);
      const modelState = React.useSyncExternalStore(props.modelSource.subscribe, props.modelSource.getSnapshot, props.modelSource.getSnapshot);
      const selected = modelState?.next ?? null;
      const defaultSelection = useDefaultSelection(props.remote);
      const sessionState = React.useSyncExternalStore(props.sessionSource.subscribe, props.sessionSource.getSnapshot, props.sessionSource.getSnapshot);
      const unavailable = Boolean(sessionState?.subagent) || sessionState?.removed === true;
      const allowed = props.useAccess('commands/execute');
      const { visible, enabled, eligible, reason } = derivePresentation(fastState, selected, defaultSelection);
       const ready = hasFastState(fastState);
       const [loadFailed, setLoadFailed] = React.useState(false);
       React.useEffect(() => {
         setLoadFailed(false);
         const retry = createHydrationRetry({
           attempt: props.ensureHydrated,
           isReady: () => hasFastState(props.fastSource.getSnapshot()),
           onSettled: value => setLoadFailed(!value),
         });
         void retry.start();
         return () => retry.dispose();
       }, [props.hydrationKey, props.sessionId, ready]);
      const [interaction, setInteraction] = React.useState({ enabled: null, pending: false });
      const [error, setError] = React.useState('');
      const [notice, setNotice] = React.useState('');
      const alive = React.useRef(true);
      React.useEffect(() => {
        alive.current = true;
        return () => { alive.current = false; };
      }, []);
      const controller = React.useMemo(() => createToggleController({
        initial: enabled,
        send: async next => {
          const result = await props.remote.commands.execute(props.sessionId,
            `/openai-fast ${next ? 'on' : 'off'}`, []);
          if (!result.ok) throw new Error(result.error.message);
          if (result.value?.result.kind !== 'success') {
            throw new Error(result.value?.result.text ?? props.t('error'));
          }
        },
        publish: value => { if (alive.current) setInteraction(value); },
        onError: failure => {
          if (alive.current) setError(failure instanceof Error ? failure.message : props.t('error'));
          props.refresh().catch(() => {});
        },
      }), [props.remote, props.sessionId]);
      React.useEffect(() => controller.sync(enabled), [controller, enabled]);
      const checked = eligible && (interaction.enabled ?? enabled);
      const provider = (selected ?? defaultSelection)?.provider ?? '';
      const blocked = reason === 'loading' ? props.t(loadFailed ? 'loadError' : 'loading')
        : reason === 'unsupported-provider' ? props.t('unsupportedProvider') + ': ' + provider
        : !allowed ? props.t('access') : null;
      // A disabled <button> is not hoverable and shows no title in Chromium, so the control stays
      // focusable and clickable: a blocked click explains itself and never sends a command.
      React.useEffect(() => { if (!blocked) setNotice(''); }, [blocked]);
      if (!visible || unavailable) return null;
      function toggle() {
        if (!eligible || !allowed) { if (blocked) setNotice(blocked); return; }
        setError('');
        setNotice('');
        controller.toggle().catch(() => {});
      }
      return h('span', { className: 'local-openai-fast', title: blocked ?? props.t(checked ? 'on' : 'off') },
        h('style', null, css),
        h('button', {
          type: 'button', role: 'switch', className: 'local-openai-fast__button',
          'aria-label': props.t('label'), 'aria-checked': checked,
          'aria-busy': interaction.pending || (reason === 'loading' && !loadFailed), 'aria-disabled': !allowed || !eligible,
          onClick: toggle,
        }, h('svg', { viewBox: '0 0 20 20', width: 14, height: 14, fill: 'none', 'aria-hidden': true },
          h('path', { d: 'M11.5 2 4 11h5l-.5 7L16 8h-5l.5-6Z',
            stroke: 'currentColor', strokeWidth: 1.5, strokeLinejoin: 'round',
            fill: checked ? 'currentColor' : 'none' })), props.t('label')),
        notice ? h('span', { role: 'status', className: 'local-openai-fast__notice' }, notice) : null,
        error ? h('span', { role: 'alert', className: 'local-openai-fast__error' }, error) : null);
    }

    return {
      derivePresentation, hydrateSession, createHydrationRetry, createToggleController, quietCommandNames, HiddenFastCommand,
      inject: ['slots', 'locale', 'sessions', 'remote', 'remote.commands', 'remote.session'],
      apply(ctx) {
        React = require('react');
        h = React.createElement;
        ctx.effect(() => ctx.locale.register(NS, dictionaries));
        ctx.slots.inject('conversation.chat.commandview', () => quietCommandNames.map(key =>
          ctx.slots.register({ name: 'conversation.chat.commandview', key }, HiddenFastCommand)));
       const readyBindings = new WeakSet();
        ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
          name: 'conversation.input.right', id: 'local-openai-fast', order: 1020,
          label: 'OpenAI Fast', locale: NS,
          inject(sessionId) {
            const binding = ctx.sessions.binding(sessionId);
            if (!binding) throw new Error('OpenAI Fast: no retained session binding');
            const observe = source => ({
              subscribe: listener => source.subscribe(listener),
              getSnapshot: () => source.getSnapshot(),
            });
            const refresh = () => ctx.sessions.refreshProjections(sessionId);
            const fastSource = observe(binding.session.projections.faceOf('local.openaiFast'));
            return {
              remote: ctx.remote, refresh, hydrationKey: binding,
              ensureHydrated: () => hydrateSession(readyBindings, binding, sessionId, refresh, () => hasFastState(fastSource.getSnapshot())),
              fastSource,
              modelSource: observe(binding.session.projections.faceOf('modelSelection')),
              sessionSource: observe(binding.session),
            };
          },
        }, FastToggle));
      },
    };
}
