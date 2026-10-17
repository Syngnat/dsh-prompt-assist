export function createFast(require) {
    let React;
    let h;
    const NS = 'local-openai-fast';
    const quietCommandNames = Object.freeze(['openai-fast', 'openai-fast-ui-health']);
    function HiddenFastCommand() { return null; }
    function derivePresentation(fastState, selected, fallback) {
      const selection = selected ?? fallback;
      const providers = fastState && Array.isArray(fastState.providers) ? fastState.providers : [];
      return {
        enabled: fastState?.enabled === true,
        visible: Boolean(selection && providers.includes(selection.provider)
          && /^(?:gpt-|chatgpt-|codex(?:-|$)|o[1-9](?:-|$))/i.test(selection.model ?? '')),
      };
    }
    function hydrateSession(readyBindings, binding, sessionId, refresh) {
      if (readyBindings.has(binding)) return;
      readyBindings.add(binding);
      refresh(sessionId).catch(() => {});
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
      },
      en: {
        label: 'Fast',
        off: 'Fast is off. Enable Priority for this session and inheriting OpenAI subagents; provider support is required and additional charges may apply.',
        on: 'Fast is on for this session and inheriting OpenAI subagents; additional charges may apply. Click to turn off.',
        saving: 'Saving Fast preference…', error: 'Could not change Fast. Try again.',
      },
    };
    const css = `
      .local-openai-fast{display:inline-flex;align-items:center;position:relative;flex:none}
      .local-openai-fast__button{display:inline-flex;align-items:center;justify-content:center;gap:4px;height:28px;padding:0 7px;border:1px solid transparent;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:20px;white-space:nowrap;cursor:pointer}
      .local-openai-fast__button:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l1)}
      .local-openai-fast__button[aria-checked=true]{color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-brand-primary)}
      .local-openai-fast__button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
      .local-openai-fast__button:disabled{opacity:.5;cursor:default}
      .local-openai-fast__button svg{display:block;flex:none}
      .local-openai-fast__error{position:absolute;bottom:34px;right:0;max-width:240px;width:max-content;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px;z-index:20}
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
      const { visible, enabled } = derivePresentation(fastState, selected, defaultSelection);
      const [interaction, setInteraction] = React.useState({ enabled: null, pending: false });
      const [error, setError] = React.useState('');
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
      const checked = interaction.enabled ?? enabled;
      if (!visible || unavailable) return null;
      function toggle() {
        setError('');
        controller.toggle().catch(() => {});
      }
      return h('span', { className: 'local-openai-fast' },
        h('style', null, css),
        h('button', {
          type: 'button', role: 'switch', className: 'local-openai-fast__button',
          'aria-label': props.t('label'), 'aria-checked': checked,
          'aria-busy': interaction.pending, disabled: !allowed,
          title: props.t(interaction.pending ? 'saving' : checked ? 'on' : 'off'), onClick: toggle,
        }, h('svg', { viewBox: '0 0 20 20', width: 14, height: 14, fill: 'none', 'aria-hidden': true },
          h('path', { d: 'M11.5 2 4 11h5l-.5 7L16 8h-5l.5-6Z',
            stroke: 'currentColor', strokeWidth: 1.5, strokeLinejoin: 'round',
            fill: checked ? 'currentColor' : 'none' })), props.t('label')),
        error ? h('span', { role: 'alert', className: 'local-openai-fast__error' }, error) : null);
    }

    return {
      derivePresentation, hydrateSession, createToggleController, quietCommandNames, HiddenFastCommand,
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
          label: 'OpenAI Fast 1.2.7', locale: NS,
          inject(sessionId) {
            const binding = ctx.sessions.binding(sessionId);
            if (!binding) throw new Error('OpenAI Fast: no retained session binding');
            const observe = source => ({
              subscribe: listener => source.subscribe(listener),
              getSnapshot: () => source.getSnapshot(),
            });
            const refresh = () => ctx.sessions.refreshProjections(sessionId);
            hydrateSession(readyBindings, binding, sessionId, refresh);
            return {
              remote: ctx.remote, refresh,
              fastSource: observe(binding.session.projections.faceOf('local.openaiFast')),
              modelSource: observe(binding.session.projections.faceOf('modelSelection')),
              sessionSource: observe(binding.session),
            };
          },
        }, FastToggle));
      },
    };
}
