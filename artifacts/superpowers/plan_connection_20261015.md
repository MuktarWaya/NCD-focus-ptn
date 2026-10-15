Connection hardening plan (authorized existing online maintenance).
Observed: intermittent timeout, 404 and doGet rejection; successful fresh POST reads. Root cause of individual failed requests not conclusively proven. Google ContentService redirects to one-time content URLs.
1. Give each POST a unique non-secret URL query and disable cache; preserve POST body and redirect handling.
2. Keep failed writes locked and never automatically resend mutations. Increase request allowance to 45 seconds.
3. Regression-test unique requests, no secret in URL, unchanged payload and ambiguous-write failure safety.
4. Run connection/browser tests, publish scoped frontend, verify live assets and read-only backend.
No backend/data migration or health-record test writes.
