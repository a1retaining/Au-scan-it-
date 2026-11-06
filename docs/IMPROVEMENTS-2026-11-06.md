# Stock learner reliability and measured learning

Work from `ff5c4755b3212445bbc779ad0c99121783f95f81` on a separate branch. Keep the current Node/Express dashboard and ASX-only paper-trading workflow.

1. Reproduce and repair paper equity, missing-price handling, stop gaps, entry-day exits, future entry bookkeeping, and risk sizing including fees.
2. Keep trade history in configurable storage. Replace complete files atomically, retain the previous valid revision, fail visibly on corruption, and serialize mutations across processes. Never replace unreadable history with an empty account.
3. Record original daily scan observations once per symbol, strategy version and observation date, including rejected signals. Evaluate only market bars after the observation. Show forward returns after explicit simulated costs, cohort sizes and chronological training/test comparisons. Results are observational, correlated and not proof of an edge. Never change rules automatically.
4. Surface valuation and storage status, learning progress, evaluation and backup export in the existing dashboard. Keep old routes compatible. Correct deployment instructions to launch the actual Node server; do not silently buy hosting or enable paid infrastructure.
5. Run deterministic regressions and local HTTP/browser checks, commit the reviewed changes and prepare a pull request if remote access permits. Preserve deployment and existing account data.

No trading-history sample or live deployment has been verified at the start. Learning must initially report insufficient evidence. Durable storage requires a host-mounted persistent directory; local backups alone cannot protect against a hosting disk reset.
