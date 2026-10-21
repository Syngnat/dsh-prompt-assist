# Fast route authorization

Fast (request-level Priority, `service_tier: "priority"`) is authorized per **route**, not per model
name and not per provider alone. This document defines the unit, the states, the evidence, and how
to reproduce the truth table.

## The unit is the route

A route is the tuple

    (provider, model, api, origin)

- **provider** — the exact route ID the Host resolves (for example `openai`, `cpa`, `magpie`). Matching is
  case-sensitive; `CPA` and `cpa` are different routes.
- **model** — the complete catalog ID, namespace included (`cpa/gpt-6.1-sol`). The ID is never rewritten on
  the wire: a gateway that needs the namespace must receive it.
- **api** — the wire shape the adapter will use. Only `openai-responses`, `openai-completions` and
  `openai-codex-responses` can carry the field.
- **origin** — who asked. Base requests are the default target; auxiliary purposes (enhancement,
  suggestions) and anonymous calls are handled by their own switches.

Two consequences follow, and both are deliberate:

1. **The family comes from the final segment.** `cpa/gpt-6.1-sol` is OpenAI-family, `cpa/glm-5.3-flash`
   is not, and `grok-4.7/claude-sonnet` is not. A leading family token before a slash is a namespace,
   not a model.
2. **Recognition is not authorization.** A recognized model means "this route could use Priority",
   never "this route may use it".

## One grammar, one resolver

`model-id.js` owns the ID grammar and the family table; `fast-route.js` owns the authorization resolver.
Bridge injection, Host status, the assistant runtime and the Client control all call
`resolveFastRoute`, so a visible switch always agrees with what the bridge would do.

The resolver returns a frozen record:

    { state, visible, eligible, route: { provider, model, family, api } | null,
      grant: { provider, model, family } | null,
      evidence: { priority: "verified" | "declared" | "unknown" | "rejected" } | null }

## States

| state | visible | eligible | meaning | what changes it |
| --- | --- | --- | --- | --- |
| `ready` | yes | **yes** | a Priority family, an API that can carry the field, and a grant covers it | revoke the grant, or evidence `rejected` |
| `needs-verification` | yes | no | recognized route, no grant covers it yet | grant the provider, the family, or the exact model |
| `grant-missing` | yes | no | a grant exists, but the provider's own Priority support was never confirmed | confirm support, or record `verified` evidence |
| `rejected` | yes | no | the upstream ignored or refused `service_tier` | new evidence after an upstream change |
| `api-incompatible` | no | no | the route's API shape cannot carry the field (for example Anthropic Messages) | a supported OpenAI API |
| `not-candidate` | no | no | not an OpenAI-family or Grok 4+ route | a Priority-family model |

Only the last two hide the control, and only because there is nothing to decide. Every state a user
can act on stays visible and explains itself; no route is ever silently accelerated.

## Grants

A grant names the narrowest scope that covers the route:

    { provider: "magpie", model: "cpa/gpt-6.1-sol" }   // one route
    { provider: "magpie", family: "openai" }            // every OpenAI route on that provider
    { provider: "magpie" }                              // every Priority route on that provider (legacy)

Precedence is exact model, then family, then provider-wide. A strict `["openai", "cpa"]` list is the legacy
spelling of provider-wide grants, so existing installations keep their `ready` routes without a migration.

A provider-wide grant is coarse on purpose — it is what the provider authorization panel writes
today — but it stays bounded by the family check: authorizing a gateway never accelerates the other
models it serves, because those routes never reach `ready`.

## Evidence

- `verified` — the upstream acknowledged Priority (an echoed `service_tier`, or a request whose
  metadata reported the priority tier).
- `declared` — a profile-issued grant. Grants are never forced into verification.
- `unknown` — no observation either way.
- `rejected` — the upstream ignored the field, or answered with an error that proves it does not
  support it. A rejected route stays visible and refuses to inject until new evidence arrives.

## Reproduce the truth table

    pnpm run fast:truth-table      # markdown table, one row per case
    pnpm test                      # the row-by-row and grid assertions

`tests/fixtures/fast-route-truth-table.js` holds the cases: 31 named rows plus a
family × grant-scope × evidence grid. `tests/fast-route-truth-table.test.js` asserts each row and
independently recomputes the grid, so a rule change cannot quietly pass by editing the fixture.
`tests/fast-route-gateway-bridge.test.js` is the reverse integration: with a gateway grant in place,
requests for that gateway's non-Priority models must reach the adapter with no `service_tier` at all,
and the namespaced ID must arrive unchanged.
