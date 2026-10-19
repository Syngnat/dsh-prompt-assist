# Profile-wide auxiliary model and QA settings

## User-facing scope

From v1.2.26, enhancement and suggestions each have one profile-wide set of `followSession`, `provider`, `model`, `reasoningEffort`, `fast` and `rounds`. Existing and future conversations use these values. The settings page does not require a selected conversation. The main conversation model and main Fast preference remain separate.

Only configuration is shared. QA content, draft text, file consent, generated previews and undo receipts remain owned by the calling conversation. Following the session is a global policy resolved anew against the calling conversation, not a reference to a conversation used when saving.

## Upgrade behavior

- Preserve the existing enabled flags and their storage schema without modification.
- Create an independent profile-hashed controls domain. New controls start with follow-session, no explicit model, Fast off and one QA round, with each feature marked unconfirmed.
- Do not pick a recent/current session, scan session logs or merge incompatible per-session model choices.
- Until a feature's controls are explicitly saved once, generation is closed even if its old global switch is on. Saving confirms that configuration for all conversations, but does not toggle its feature switch.
- Preserve historical session events for replay and rollback; they are not effective overrides. Older installed versions can still read the untouched flag domain.
- The retired session-save RPC/command refuses with `global-config-required`. It never silently turns an old session-local request into a profile-wide mutation.

## Snapshot and mutation contract

The existing authenticated snapshot stream carries:

```text
{
  scope: "profile",
  revision, enabled: {suggest, enhance},
  settingsRevision, settings: {suggest, enhance},
  configured: {suggest, enhance}
}
```

The flag and controls revisions are independent. UI consumers merge each complete revision component monotonically, reject conflicting content at the same revision, and cannot use incomplete legacy controls as authorization to generate. Settings and confirmation bits stay in the same controls component.

`set-enabled` retains flag revision semantics. `save-global` uses `{feature, config, expectedRevision}` where `expectedRevision` is the controls revision captured when editing began. A conflict does not overwrite the user's dirty draft or automatically retry with a newer revision. Configuration APIs are available without a conversation; generation still requires an admitted conversation.

The native Connection layer owns browser authentication and owner authorization. Root model-tool configuration explicitly states that it affects every conversation; subagents cannot mutate global controls. Fixed routes validate registered provider/model metadata, reasoning effort and Fast eligibility without generating. Follow-session saves do not need a current model; invocation-time resolution and Fast fallback remain authoritative.

## Synchronization and limits

Profile control changes invalidate affected feature jobs and caches across sessions. Browser synchronization changes invalidate previews and reset the automatic-suggestion QA baseline; old QA is not replayed. Unknown or disconnected configuration fails closed. An already started provider call may still incur charges after cancellation.

Writes serialize inside one Host; this is not a new cross-process synchronization protocol. Flags and controls are two independent commits, not a transaction spanning both domains. Save acknowledgements must not be confused with a later concurrent window's settings.

## Verification

Offline tests cover independent profiles, first-save confirmation, persistence/reopen, stale revisions, write failure/cancellation, session-log non-authority, existing/new conversations, separate feature models and QA counts, dynamic follow-session selection, late-result rejection and UI conflicts. The SDK contract script additionally exercises actual Cordis storage plugins and the JSON backend, without accessing a real profile or model provider. Browser and paid-model verification must be reported separately.
