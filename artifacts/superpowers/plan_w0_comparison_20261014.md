# Plan: W0 comparison tables and assigned people

Goal: Extend approved W0 page with a compact worker comparison table per village for one screenshot, and expandable assigned target names with W0 status and missing/review topics.

1. Add individual members to pure aggregation and village comparison sections using existing status rules. Test multi-village worker and row totals.
2. Render compact tables with total/complete/partial/no result/needs attention, village subtotal. Capture mode shows these comparison tables only, preserving screenshot brevity; regular page keeps expandable workers and assigned names. No clinical values are shown.
3. Include target ID and profile link next to names to distinguish similar names; do not alter assignment automatically. Preserve filters and aggregate-only reminder text.
4. Test menu/filter/table totals/member scoping/profile navigation/capture/mobile and existing flows. Review and update existing online frontend under current authorization. Backend API unchanged.

Privacy: User explicitly requested names within their existing authenticated system. Names appear when opening assigned-member details; compact capture mode hides individual lists. No messages are sent.
Rollback: frontend commit 9fa1dad.
