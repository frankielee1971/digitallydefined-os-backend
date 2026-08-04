# DigitallyDefined Schema-Driven Agent Map

## Active Public Tools

| Tool | Deterministic layer | Agent action | Validated schema | Agent responsibility |
|---|---|---|---|---|
| Digital Superpower Quiz | Seven-answer scoring | `agent.roadmap` | `roadmap` | Personalize the faceless asset roadmap after the result is known |
| Niche Discovery | User supplies topic | `agent.niche` | `niche` | Suggest keywords, directional demand/competition, and validation guidance |
| Niche Profitability Scorecard | Weighted score and tier | `agent.scorecard` | `scorecard` | Explain strengths, risks, experiments, monetization paths, and next action |
| Retirement Gap Calculator | Financial formulas | `agent.retirement-guide` | `retirement-guide` | Explain assumptions and planning signals without changing the math |
| Freedom Number Calculator | Portfolio scenario math | `agent.asset-plan` | `asset-plan` | Identify assumptions, concentration risk, build order, and validation steps |
| 10x ROI Calculator | Lead and lease scenario math | `agent.asset-plan` | `asset-plan` | Interpret user-supplied assumptions without presenting them as forecasts |
| Public Planning Guide | None | `public.chat` | Conversational | Explain the tools and route the visitor to one useful next step |

## Internal Product-Building Tools

The five JSON Schema Draft 7 files in `schemas/` and `hermes/schemas/` should sit behind one internal Offer Architect rather than five unrelated prompt tools.

| Funnel stage | Existing schema | Recommended action |
|---|---|---|
| Lead capture | `lead_magnet_schema.json` | `agent.offer-architect` with `funnelStage: "lead_magnet"` |
| Primary product | `core_offer_schema.json` | `agent.offer-architect` with `funnelStage: "core_offer"` |
| Premium package | `authority_bundle_schema.json` | `agent.offer-architect` with `funnelStage: "authority_bundle"` |
| Community product | `community_schema.json` | `agent.offer-architect` with `funnelStage: "community"` |
| Subscription/SaaS | `recurring_revenue_schema.json` | `agent.offer-architect` with `funnelStage: "recurring_revenue"` |

The Offer Architect should:

1. Gather a niche, audience, problem, transformation, delivery preference, and price assumptions.
2. Select the matching funnel-stage schema.
3. Generate the structured `offer` object.
4. Validate required fields and field types.
5. Return a validation checklist and one next action.

## Backend-Only Agents

These should remain private and should not appear in website copy:

| Agent | Purpose |
|---|---|
| Brand Builder | Enforce visual and editorial brand rules |
| Quality Assurance | Review generated assets before publishing |
| Content Repurposer | Transform an approved source into channel-specific assets |
| Rank-and-Rent Builder | Build the operational plan after a niche passes validation |
| Community Agent | Prepare and moderate community content |
| Schema Generator | Create a new schema only when an existing funnel schema cannot represent the product |

## Important Architecture Rules

- Calculators and scorecards own their math. AI explains results but never changes them.
- Every structured agent output must pass `validateAgentOutput()` before reaching the UI.
- Public tools call Supabase `hermes` actions. The old Vercel Buzz registry is not the active runtime.
- Model/provider keys live only in Supabase secrets.
- Prompts must not claim live research unless evidence or a live data source is included.
- Financial and revenue outputs must identify assumptions and avoid guarantees.
