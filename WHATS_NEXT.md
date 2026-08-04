# What's Next — code_manage

## Where This Stands Today

code_manage is **mature for the scope it was designed for, and feature-frozen since roughly June 2026**. Version 1.5.11, 61 commits since 2026-01-24, 123 tests passing, `eslint .` clean, and zero `TODO`/`FIXME`/`HACK` markers anywhere in `app/`, `lib/`, `components/`, or `tests/`. The engineering quality is genuinely high: RFC 9457 Problem Details errors, `fs.realpath()`-backed path confinement in `lib/api/pathSecurity.ts`, no-shell subprocess discipline (`spawn`/`execFile` with array args in `lib/git.ts` and `app/api/search/route.ts`), chassis v11 version gating in `instrumentation.ts`, and bounded-concurrency scanning via `@ai8future/work`. But the last five commits are `docs:`, `chore(deps):`, and `fix(lint):` — the Next.js 16.1.6→16.2.9 bump, the `--webpack` dev fix, react-hooks cleanup, and a PRODUCT.md refresh. No new capability has shipped in about two months. Two of the nine sidebar destinations, `app/agents/page.tsx` and `app/config/page.tsx`, are still static marketing copy with no corresponding route under `app/api/` — `ls app/api/` returns only `actions`, `activity`, `file`, `health`, `projects`, `search`, `terminal`.

The more important truth is that **the portfolio has outgrown the product's assumptions**. The tree it scans now holds **44 `*_suite` directories and 203+ projects carrying a `VERSION` file**, but core code still reasons as if projects sit at the root. The clearest casualty is `app/api/search/route.ts:143`, which derives a result's owning project from `pathParts[0]` and only descends when that segment `startsWith('_')` — suite directories (`builder_suite`, `chassis_suite`, `windmill_suite`) do not start with an underscore, so the overwhelming majority of search hits are attributed to the *suite* rather than the project, and the generated `projectSlug` links to a detail page that does not exist. Adoption is real but narrow: one operator, one machine, port 10467, no auth — plus a second-order adoption path nobody planned for, where `infra_suite/proc_manage` ("Initial scaffold from code_manage foundation," per its CHANGELOG 0.1.0) and `builder_suite/demo_manage` both carry forked copies of this repo's `components/sidebar/*` and `components/layout/*`. And the engine everything depends on, `scanAllProjects()` in `lib/scanner.ts:566`, has **no test at all** — `tests/lib/scanner.test.ts` contains 5 tests, all of them exercising only `determineStatus`.

## Product Direction

### 1. Repair suite-awareness across search, then make search the daily driver

**Why it matters.** `app/api/search/route.ts:139-157` breaks for 203 of the roughly 260 discoverable projects. `projectName = pathParts[0]` yields `builder_suite` for a hit in `builder_suite/code_manage/lib/scanner.ts`, results group under suite headings instead of project headings, and every "jump to project" link 404s. This is the single highest-impact defect in the repo and it is invisible in tests because no test covers the route. Compounding it, the exclude list at `route.ts:40-54` omits `_studies`, `_proposals`, `_rcodegen`, `_bugs_open`, and `_bugs_fixed` — the exact folders this repo's own `AGENTS.md` declares to be agent scratch output, which means generated reports flood real code results.

**What it unlocks.** Search becomes trustworthy enough to be the primary entry point rather than a novelty, which is the single feature that justifies a portfolio dashboard at 200+ repos. It is also the prerequisite for VISION.md's **V45 (Cross-Corpus Search)**. Follow-ons are cheap once attribution is correct: scope-to-project, scope-to-suite, `--type` language filters, and a case-sensitivity toggle.

**Effort.** S for the attribution fix and scratch-folder excludes; M with filters and scoping.

### 2. Answer "what's uncommitted, unpushed, or drifting?" across 203 repos

**Why it matters.** `getGitInfo()` in `lib/scanner.ts:181-228` deliberately parses `.git/HEAD` and `.git/config` as text instead of spawning git — fast for mass scanning, but it means the dashboard knows a repo's *branch and remote* and nothing about its *state*. For an operator running ~10 parallel coding agents across a tree where every `AGENTS.md` mandates commit-and-push after each change, the most valuable question on the board is which repos have dirty trees, unpushed commits, or detached HEADs. Today that question is unanswerable without a shell loop. Relatedly, `getLastModified()` at `lib/scanner.ts:288` uses directory `mtime`, which a stray `.DS_Store` or a `.next/` write will bump — so "recently touched" is noise, and `app/api/projects/route.ts:78-82` discards it anyway by re-sorting starred-then-alphabetical.

**What it unlocks.** A genuine "needs attention" queue driven by real signal instead of directory timestamps, and a foundation for drift alerts. Last-commit date replaces `mtime` as the honest recency axis.

**Effort.** M. Requires a second, opt-in scan tier (`git status --porcelain` + `rev-list --count @{u}..`) with its own cache and concurrency budget, kept off the hot path.

### 3. Make `/agents` real — the console for the swarm

**Why it matters.** `app/agents/page.tsx` promises "Configure and monitor automated agents that run tasks across your codebases" and delivers a centered icon. Meanwhile the tree is *full* of agent exhaust that code_manage already knows how to read: `_rcodegen/` grades (parsed by `scanRcodegen()`, `lib/scanner.ts:366`), `_bugs_open`/`_bugs_fixed` (`scanBugs()`, `lib/scanner.ts:297`), `_proposals/`, `_studies/`, and `.omc/` state directories. The suite's own `builder_suite/VISION.md` calls this out explicitly as **V42: "code_manage's `/agents` placeholder becomes the console for the suite's automation... The operator sees the swarm, not just its droppings."**

**What it unlocks.** The dashboard stops being a passive catalog and becomes the place you watch parallel agent work from — which run touched which repo, what graded out, what regressed. It is the highest-leverage unbuilt page because the data is already on disk and already parsed.

**Effort.** L. Needs a filesystem convention for run records, a new `app/api/agents/` route, and UI. Ship it read-only first; do not add job *execution* until the read view proves useful.

### 4. Fleet consistency: chassis drift, version drift, convention compliance

**Why it matters.** `getChassisVersion()` at `lib/scanner.ts:266` already reads `VERSION.chassis` for every project on every scan — and that value is currently surfaced only on individual detail pages, never aggregated. This repo sits at chassis `11.1.7`; the workspace contains `_proposals/chassis-ts-fleet-upgrade-to-11-1-7.md` and `chassis_suite/chassis-docs/_proposals/v11-consumer-upgrade-prompt.md`, meaning fleet-wide chassis migration is an active, manual, recurring operator problem. code_manage collects exactly the data needed to answer "which repos are behind on chassis?" and then throws it away.

**What it unlocks.** A one-screen migration cockpit: chassis version histogram, laggards flagged, plus adjacent compliance checks that are pure filesystem reads (missing `AGENTS.md`, missing `VERSION`, missing `CHANGELOG.md`, no git remote, no `deploy/` config). This is the same attention-routing pattern the Code Health section already implements for sub-60 rcodegen scores — just applied to conventions instead of grades.

**Effort.** M. Mostly aggregation over data the scanner already returns, plus one dashboard section.

### 5. Scale the scan engine past 200 projects

**Why it matters.** `getCachedProjects()` in `lib/scan-cache.ts` holds a 10-second in-process cache, so a cold start or any 10-second gap triggers a **full traversal of 203+ projects**, each doing ten concurrent filesystem probes (`lib/scanner.ts:526-538`) at 3 workers. Worse, `app/api/activity/velocity/route.ts:46-86` shells out to `git log --numstat` for *every* git-bearing project — 3 workers, 15-second timeout each — on a 60-second cache. There is no `fs.watch` or `chokidar` anywhere in the repo, so nothing is incremental, and the cache is a module-level singleton that dies with the process. The cache is also all-or-nothing: `invalidateProjectCache()` nulls the entire result set after a single star toggle.

**What it unlocks.** A dashboard that stays responsive as the tree grows, and per-project invalidation instead of full-rescan. A watch-based or persisted-to-disk cache also makes cold starts instant, which matters for a tool you open and close all day.

**Effort.** M for a persisted cache plus per-project invalidation; L if adding a real filesystem watcher.

### 6. Extract the dashboard shell into a chassis package

**Why it matters.** Three sibling apps now ship near-identical copies of this repo's shell. `components/sidebar/Sidebar.tsx`, `SidebarContext.tsx`, `SidebarItem.tsx`, `SidebarWrapper.tsx` and `components/layout/PageHeader.tsx`, `SectionDivider.tsx`, `SkeletonCard.tsx` all appear in `builder_suite/demo_manage` and `infra_suite/proc_manage` — the latter's CHANGELOG states outright that it was scaffolded from code_manage. Fixes made here (the `useSyncExternalStore` hydration rewrite of `SidebarContext.tsx` in 1.5.11, for instance) do not propagate.

**What it unlocks.** One place to fix sidebar, header, skeleton, and toast behavior for every internal dashboard, alongside the `@ai8future/*` packages these apps already consume via the `file:` protocol. It also lowers the cost of the next dashboard to near zero.

**Effort.** M. The components are already prop-driven and self-contained; the work is packaging, Tailwind preset sharing, and three consumer migrations.

## Near-Term (next 1-2 releases)

- **Fix `app/api/search/route.ts:139-157` suite attribution.** Resolve the project by matching the hit path against the known project list from `getCachedProjects()` rather than guessing from `pathParts[0]`. This also fixes the dead `projectSlug` links and makes search results respect the same slug-collision prefixes `scanAllProjects()` assigns at `lib/scanner.ts:597-610`.
- **Add `_studies`, `_proposals`, `_rcodegen`, `_bugs_open`, `_bugs_fixed` to the ripgrep exclude list** at `app/api/search/route.ts:40-54`, ideally behind a "include agent output" toggle rather than a hard exclusion.
- **Write the first real tests for `scanAllProjects()`.** Point `CODE_BASE_PATH` at a temp fixture tree and assert suite tagging, status derivation, indicator gating, and — critically — the slug-collision branch at `lib/scanner.ts:597-610`, which currently leaves duplicate slugs intact when two *root-level* projects collide and neither carries a `suite`.
- **Replace directory `mtime` with last-commit date** as the recency signal in `getLastModified()` (`lib/scanner.ts:288`), and expose a sort control on `/api/projects` so `app/api/projects/route.ts:78-82` stops hard-coding starred-then-alphabetical.
- **Trim the `/api/projects` payload.** It currently returns every project with full `dependencies`, `scripts`, `bugs[]`, and `recentGrades[]` inline. Add field projection so list views fetch a summary and detail pages fetch the rest.

## Mid-Term

- **Build `/api/agents` and turn `app/agents/page.tsx` into a read-only run history** sourced from `_rcodegen/`, `_bugs_*`, and `.omc/` conventions.
- **Ship the git working-state tier** (dirty / ahead / behind / detached) as an opt-in second scan pass with its own cache, surfaced as a "needs attention" section beside Code Health.
- **Add the fleet consistency section** — chassis version histogram from the already-collected `VERSION.chassis`, plus convention compliance checks.
- **Give `app/config/page.tsx` a reason to exist** by making `.code-manage.json` editable through the UI. Note the invariant tension first: `app/api/projects/route.ts:42` applies `metadata.status || project.status`, which lets a config override silently contradict the "status is physical location" rule PRODUCT.md declares as non-negotiable. Decide whether overrides should be removed, or shown with a visible "overridden" badge and a one-click "move to match" action.
- **Persist the scan cache to disk and invalidate per-project** rather than nulling the whole `cached` object in `lib/scan-cache.ts:58`.
- **Extract the shared shell into `@ai8future/dashboard-ui`** and migrate demo_manage and proc_manage onto it.
- **Make the terminal stream.** `@xterm/xterm` and `@xterm/addon-fit` are already dependencies, but `app/api/terminal/route.ts` is request/response `execFile` with a 60s cap — so `npm test` or `npm run build` cannot be watched, only awaited. Streaming output (keeping the existing whitelist and no-shell posture) makes the terminal useful for the commands operators actually want to run.

## Long-Term / Frontier

- **Portfolio digest** — VISION.md **V46**: a weekly rollup joining code velocity, chassis drift, sub-60 grades, and open bug counts, delivered by email on a schedule. code_manage already computes every input.
- **Cross-corpus search** — VISION.md **V45**: extend search beyond code to launch profiles, audit outputs, proposals, and studies, so "which repos mention Kafka" and "where did we write about the event spine" are one query.
- **MCP server over the scanner** — VISION.md **V47** frames this suite-wide, but code_manage is the natural first exporter: expose `list_projects`, `search_code`, `project_detail`, and `code_health` as Model Context Protocol (MCP) tools so the agents working in this tree can query the portfolio directly instead of re-globbing the filesystem every session. Given ~10 parallel agents, this is plausibly the highest-value long-term item on the list.
- **Deeper tree support** — `scanLevel()` in `lib/scanner.ts:571` filters out `isSuiteDirectory(entry.name)` and only descends one level into suites, so nested suites and monorepo sub-packages are invisible. Configurable depth would make the model match reality.
- **Multi-root scanning** — `CODE_BASE_PATH` is a single Zod-validated path. Supporting several roots (a second drive, a cloned-repos directory, `github_code/`) would widen coverage without changing the filesystem-as-database philosophy.
- **Write actions from the dashboard** — trigger `rcodegen` runs or `ralph` loops per project. This is the biggest philosophical departure and should be gated on the read-only `/agents` view proving itself first.

## Risks & Open Questions

- **The stated invariant is already violated.** PRODUCT.md line 210 says "Never model a status change as a pure metadata write," yet `app/api/projects/route.ts:42` honors `metadata.status` over the directory-derived status, and `counts` are computed *after* the override — so sidebar badges can describe a reality the filesystem does not share. Resolve this before building `/config`, since `/config`'s whole purpose is editing those overrides.
- **The core engine is untested.** `scanAllProjects()`, `getCachedProjects()`, `scanBugs()`, and `scanRcodegen()` have zero coverage. 123 tests sounds healthy, but 29 of them are Zod schema assertions and the scanner file contributes 5, all on `determineStatus`. Any scanner refactor is currently unguarded.
- **Feature-frozen or finished?** Two months of docs-and-deps commits could mean the tool does everything its operator needs, or that it has quietly stopped being opened. Worth deciding deliberately — the roadmap above assumes the former, and directions 3, 4, and 6 are only worth their effort if the dashboard is genuinely in daily use.
- **Does `/agents` belong here at all?** `builder_suite/VISION.md` V42 says yes. But PRODUCT.md line 220 is emphatic that code_manage is "purely an *observer and light orchestrator*" and "must not absorb" rcodegen's or ralph's logic, and the project-level `CLAUDE.md` routes cross-codebase orchestration work to `windmill_suite/windmill_ops/AGENTS.md` first. A read-only agent console respects that boundary; a job scheduler does not. Read that rubric before building anything that runs jobs.
- **Fork divergence is compounding.** Every release that improves the shell here widens the gap with demo_manage and proc_manage. Extraction gets more expensive the longer it waits — but it also costs three migrations, and none of those repos asked for it.
- **Watch-based scanning on macOS at this tree size is not free.** 203 projects with `node_modules` and `.next` directories will exhaust naive `fs.watch` descriptor budgets. Any watcher needs aggressive ignore rules mirroring `IGNORED_FOLDERS` (`lib/scanner.ts:8-20`), and a persisted cache may deliver most of the benefit for a fraction of the risk.
- **Velocity is the scaling cliff, not the scanner.** A full `git log --numstat --since=90 days` sweep across ~200 repos at 3 workers is the slowest thing this app does, and it runs on a 60-second cache with no persistence. It will degrade first and most visibly.
