# dev server crashed: `npm run dev` missing `--webpack`

**Date:** 2026-06-10
**Severity:** High (dev server unusable out of the box)
**Fixed in:** 1.5.9

## Symptom

`npm run dev` failed immediately. Turbopack reported `Module not found: Can't resolve '@ai8future/chassis'` (and `config`, `work`, `kafkakit`, `lifecycle`, `registry`), followed by:

```
Error: An error occurred while loading instrumentation hook: Cannot find module '@ai8future/chassis'
```

## Root cause

The `@ai8future/*` chassis packages are:
1. **ESM-only** — their `package.json` `exports` define only an `import` condition, no `require`.
2. **Symlinked from outside the project root** via `file:../../chassis_suite/chassis-ts/packages/*`.

`next.config.mjs` accounts for this with a `webpack` resolver that unshifts the `import` condition onto `config.resolve.conditionNames`, plus `serverExternalPackages`. That resolver **only runs under webpack**.

Next.js 16 changed `next dev` to default to **Turbopack**, which ignored the webpack config and could not resolve the ESM-only external symlinks. The `build` script already used `next build --webpack`, but `dev` did not — so production builds worked while local dev was broken.

## Fix

Added `--webpack` to the dev script in `package.json`:

```diff
- "dev": "next dev -p 10467",
+ "dev": "next dev --webpack -p 10467",
```

Verified: `next dev --webpack -p 10467` boots ("Ready in ~1.9s"); `GET /` and `GET /api/projects` both return `200`.

## Note

The chassis health monitor (started in `instrumentation.ts`) polls `/healthz`, which this app does not expose, so dev logs show recurring `GET /healthz 404`. Harmless and unrelated to this fix.
