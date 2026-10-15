# Review: W0 behavior completion counts

User explicitly asks table complete count to increment when additional behavior fields are complete. Previously registry/risk/lab/physical review gates also blocked green. Live read for requested worker confirms all nine behavior topics complete; only risk_category missing, and sleep6/high inconsistency needs review.

Now green means nine valid W0 behavior topics entered, including explicit zero/no. Other missing report data and consistency checks remain visible via missing/review/reportIncomplete, not deducted from behavior completion. No W0/legacy rules unchanged; duplicate W0 remains yellow. UI, capture note and reminder clearly name behavior completion. This does not certify complete Excel or healthy clinical results.

Verification: 52 unit/regression tests passed. Browser W0 filter/capture flow passed. Assessment-save browser test explicitly checks complete behavior changes live UI count to1, while patient labs/other fields are incomplete; same existing record update, no production writes. Read-only production analysis: selected worker total2 green1 yellow0 red1, reportIncomplete1. Desktop/mobile flow uses mocked API. git diff --check passed after removing trailing whitespace.

Review: Blocker none; Major none; Minor report-quality findings separate from entry completeness (UI note added); Nit none.
Deploy frontend only, Apps Script unchanged. Rollback02b2dd3. Before API169 targets/94 records/35 directory; backup in excluded deploy_behavior_20261015. Final production verification in finish artifact.
