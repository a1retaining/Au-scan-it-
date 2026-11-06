# Storage, learning and deployment

The active application is `server.js` with `public/`. Older Python, React and duplicated root files remain in the repository for compatibility; they are not the Node dashboard runtime.

## Run and verify

Use Node 22 or 24 and npm. Run `npm ci`, `npm run check`, `npm test`, then `npm start`. The default port is 10000. `/health` and `/api/health` return JSON including the build version and storage status. There is no frontend compilation step for the current static dashboard.

For an existing Render Node service, use build command `npm ci --omit=dev && npm run check && npm test`, start command `npm start`, health path `/api/health`. The existing blueprint still includes the legacy Python service; no service was removed or provisioned as part of this change. Do not apply a blueprint cleanup over an existing installation without first reviewing its service ownership and retained data.

## Preserve the account before deployment

Download `/api/backup` from the **existing running service before replacing it**. This export includes trades, observations, settings and the strategy version. Keep a separate copy away from the hosting disk. A repository's empty `data/paper-trades.json` is not a backup of a running account.

Set `STOCK_DATA_DIR` to an absolute path on a host-provided persistent disk. Ensure the Node process can write there. Changing this setting does not migrate files: stop account writes and copy the existing `paper-trades.json` and `signal-observations.json` into the chosen directory, preserving exact bytes, before restarting. If the observation file does not exist yet, leave it absent. Do not replace existing data with the repository sample. Use one host-mounted local disk, not a network-synced archive, and keep one application instance per account. No persistent disk or paid hosting has been purchased or configured by these code changes. The health endpoint cannot prove the host's retention policy.

Mutations hold an exclusive `.lock` file, read the latest revision, validate it, retain a `.backup` of the previous valid revision, and atomically replace the primary file. Corruption blocks changes with a visible error. A lock left by a terminated process is not automatically stolen. A completed request does not imply an external backup exists. Downloads may contain private account information; store them privately.

### Recovery

1. Stop the Node process and confirm every other writer is stopped. Keep copies of the primary file, `.backup` and `.lock` before doing anything.
2. Validate the backup as JSON and inspect its trades/observations against your last external export. A `.backup` contains the **previous** revision and may omit the most recent transaction.
3. Preserve the unreadable primary under a new recovery filename. Copy the verified backup to the primary filename. Never modify an archived object or overwrite another computer's source snapshot.
4. After confirming no process owns the lock, preserve it under a recovery filename and remove the active `.lock` filename. Restart and check `/api/health`, account balances, trade IDs/counts and learning counts. Keep the preserved files until reconciliation is complete.

This is deliberate, explicit recovery; the application never silently resets a damaged account. A missing primary with an existing backup also requires recovery.

## What learning means here

A successful daily scan records the first observation for each symbol and Sydney date under this strategy version. It preserves original score components, indicators, eligibility, rules, prices and their dates. A later scan cannot replace the original observation with hindsight. Rejected signals are recorded too. Intraday scans are not mixed into this daily study.

**Update outcomes** measures 5-, 10- and 20-session forward returns, starting at the next available session's open after both the observation date and the source candle date. Today's potentially incomplete candle is excluded. No result is invented before enough later sessions exist. Completed outcomes are not overwritten on subsequent evaluations.

The diagnostic uses up to $1,000 including entry brokerage, whole shares, $9.50 per side and 10 basis points of adverse slippage per side, captured with the observation. It is an independent hypothetical entry for each signal, **not** a shared-capital portfolio and **not** a stop/target backtest. An unaffordable share or unavailable future data stays pending. The paper ledger is not modified by outcome evaluation.

The score-85 comparison is fixed in advance. Observations are split chronologically by date (earlier 60%, later 40%); training observations whose outcome reaches the later period are purged. At least 20 distinct completed observation dates plus 30 signals above and below score 85 in each period are needed to display a comparison. This is a minimum reporting gate, not statistical significance. Signals overlap and share market exposure. The study is selected by the scanned universe, ignores unobserved/delisted shares, and uses public unadjusted prices; corporate actions and missing data can distort returns. It has no independent broad-market benchmark. No strategy rules are changed automatically and no profitable edge is claimed.

## Account and historical simulation

Cash deducts committed share cost and entry fees. Equity adds market-valued open shares. Open P/L before and after estimated round-trip fees is shown separately. Missing prices use purchase cost **with an explicit incomplete-valuation label**. Quote dates are displayed, and public data can be delayed. Cash limits always use cash, not unrealised profits.

Backtest orders are created after the signal session closes and filled at a later session's open. Stops fill at the opening price when a gap passes the stop. If both stop and target are touched within one daily candle, the stop is assumed first. Both fees and configured slippage count towards sizing. The default minimum target-hold time remains one session; entry-day stops remain active. Starting capital is retained as the equity baseline. There is no survivorship correction or full corporate-action model. Market regime is assumed neutral in this simulation, which differs from live scan context. Empty or unavailable market data is reported explicitly.

Each symbol is liquidated at its own final available close during the chronological loop. This is an end-of-data simulation assumption, not evidence of an executable exit for a suspended or delisted share.

## Release boundary

Local tests and any CI checks verify application behaviour. They do not verify a live deployment, provider availability, historical profitability or persistence on the hosting platform. Merging into a branch watched by hosting may trigger deployment; preserve its current account and disk configuration first.
