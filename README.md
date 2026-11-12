# Idle Economy Lab

Idle Economy Lab is a shared browser workspace for sketching and simulating incremental-game economies. It includes a React Flow canvas, no-code node settings, a runnable mining economy, deterministic decimal-based simulation steps, collaboration, analytics, run snapshots, and exports.

## Run locally

```sh
npm run install:ci
npm run db:generate
npm run dev
```

Run `npm test` for the deterministic simulation checks and `npm run build` for the production build.

## Shared storage and collaboration

The hosted version runs on the Sites Cloudflare Worker runtime with D1 storage. Game files, simulation snapshots, revision numbers, participant presence, and cursors are stored by the server. Clients poll file changes and presence, and revisions are checked before writes. A single active participant/tab is elected to send simulation ticks. The engine uses decimal arithmetic for balances and upgrade costs.

The deployment is public, so anyone with its URL can open and edit the shared files. It has no sign-in, per-file privacy, or access roles. Do not store confidential project data there.

## Simulation defaults

- One logical step is one simulation tick. Speed presets run 1, 10, 100, or 1,000 deterministic ticks per accepted server command.
- A command processes unlock checks, generator output, conversions, automation, and metrics in that order.
- Connections are type-checked. Manual actions and generators produce into resource pools; upgrades modify connected actions/generators; converters accept resource inputs and resource outputs; automation targets upgrades/prestige; resource, condition, unlock, multiplier, and limiter links control the matching mechanics.
- A converter consumes its configured amount from every connected input when all inputs can pay, then splits the resulting output across connected pools. It skips a cycle if an input is short or an output pool would exceed capacity.
- Manual action bonuses and generator bonuses apply through connected upgrades. Generator output can also be modified by connected multipliers. An upgrade or prestige node can use a connected resource as its cost currency; otherwise the engine uses the first Gold pool. Automation considers linked upgrades when present and follows its selected strategy.
- Upgrade costs support linear, exponential, and diminishing-return curves. Automation can buy the cheapest affordable upgrade, choose the best bonus for its cost, or prestige when the configured threshold is met. The ordinary settings use presets and never evaluate user-entered code.
- Resources store balances as decimal strings and enforce configured capacities.
- Prestige lets each resource and upgrade opt in or out of resets, can spend a connected currency, and stores its growing permanent multiplier without a JavaScript numeric limit.
- The canvas supports nested, resizable groups, collapse/expand with exposed boundary handles, optional grid snapping, drag-and-drop nodes, cross-file copy/paste, and typed links. Undo/redo stores up to 50 local graph edits and clears that history after another collaborator's change; simultaneous edits are preserved in a recovery file.
- Analytics record exact balances, gross production and consumption, net flow, upgrade levels, milestone estimates, and unlock/prestige markers. Saved runs retain graph settings, compare up to five runs for any resource, and export complete sampled data as CSV or JSON.
- The shared API validates graph size, references, numeric fields, and simulation controls before storing a file.
- Offline catch-up is applied on reconnect for a file left running, at one logical tick per elapsed second and within the selected 1/4/8/24-hour cap. Work is split into bounded server commands. Browser tabs and active collaborators elect one tick sender so the configured speed does not multiply with the number of open editors.

## Hosting boundaries

The published Site runs on Cloudflare Workers with D1. Collaboration uses revision-checked HTTP polling and presence records; it does not run ASP.NET Core, SignalR, PostgreSQL, Entity Framework Core, or Docker Compose. The simulation engine is a separate TypeScript module shared by browser and server code, with Decimal arithmetic for economy calculations. A continuously unattended background simulation is not available in this hosting runtime: offline catch-up occurs when a collaborator reopens the shared file. The deployment is intentionally public per the owner's request, so anyone with the URL can view and edit shared data.

Run `npm test` and `npm run build` before publishing changes. See the attached product requirements for the broader design brief and the platform-specific scope above for the deployed implementation boundary.
