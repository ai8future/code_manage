# Silent Process Death from unref'd Health Timer

**Date:** 2026-03-07

## Problem
The dev/production server would silently die after hours of running. The crash log (`.next/crash.log`) showed only health check entries — zero errors, zero shutdown messages. The process would vanish with no trace.

## Root Cause
In `lib/diagnostics.ts`, the health check interval timer was created with `.unref()`:
```js
if (healthTimer.unref) healthTimer.unref();
```

`unref()` tells Node.js not to count this timer as keeping the event loop alive. If the Next.js HTTP server socket closed for any reason (transient error, file descriptor issue, internal restart), the health timer was the only remaining scheduled work — but since it was unref'd, Node considered the event loop empty and exited silently with code 0.

No crash handler fired because:
- `uncaughtException` — no JS error occurred
- `unhandledRejection` — no rejected promise
- `SIGTERM`/`SIGINT` — no signal was sent
- There was no `beforeExit` or `exit` handler to catch the event loop drain

## Fix
1. Removed `healthTimer.unref()` so the timer keeps the process alive
2. Added `process.on('beforeExit')` handler to log event loop drain
3. Added `process.on('exit')` handler as a last-chance sync logger
