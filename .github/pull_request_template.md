## What does this PR do?
<!-- One sentence. Link to the issue/ticket if there is one. -->


## Why?
<!-- What problem does this solve or what value does it add? -->


## How to test
<!-- Steps for the reviewer to verify this works. -->
1.
2.
3.

---

## Review Checklist

### Correctness
- [ ] Code does what the PR description says
- [ ] Edge cases handled (null/undefined, empty arrays, missing fields)
- [ ] Error paths handled and don't silently fail
- [ ] Async/await correct — no unhandled rejections
- [ ] TypeScript types accurate — no `any` or unsafe casts
- [ ] Bug fixes include a test that catches the original bug
### Vite / React
- [ ] No server-only code imported in client bundles
- [ ] No waterfall data fetches that could be parallel
- [ ] Express API routes validate method, body, and query params
- [ ] `VITE_` prefix only on browser-safe env values
- [ ] React hooks follow rules-of-hooks (no conditional hooks)

### Firebase
- [ ] Correct Firestore collection paths and document refs
- [ ] Admin SDK server-side only — not in client bundles
- [ ] Client SDK initialised once, not per-component
- [ ] Cloud Functions handle cold starts (no assumed warm state)
- [ ] Firestore listeners cleaned up on unmount

### Stripe
- [ ] Webhooks verify signature before processing
- [ ] Idempotency keys used for create/update operations
- [ ] Payment flows handle all terminal states (succeeded, failed, cancelled, requires_action)
- [ ] Stripe IDs from config/env, not hardcoded

### Security ⚠️
- [ ] No secrets, API keys, or tokens committed
- [ ] Firestore rules updated if data access patterns changed
- [ ] Stripe secret key server-side only
- [ ] User input validated before Firestore writes
- [ ] Firebase Auth tokens verified server-side
- [ ] No PII or payment info in logs
### Performance ⚠️
- [ ] No unbounded Firestore queries — `limit()` or pagination used
- [ ] No N+1 patterns — batch reads, not loops
- [ ] Firestore writes batched where possible
- [ ] Static assets served from `public/` with appropriate caching
- [ ] Images optimised (appropriate format and sizing)
- [ ] `useEffect` dependencies correct — no infinite re-renders
- [ ] Bundle size impact considered for new dependencies

### Test Coverage ⚠️
- [ ] New functionality has tests (happy path + at least one failure case)
- [ ] Firestore interactions tested with emulator or mocked
- [ ] Stripe webhook handlers tested (signature verification + event types)
- [ ] API routes tested for valid input, invalid input, and auth failures
- [ ] No `.skip` or `.only` left from debugging

### Deployment
- [ ] Vercel env vars set for any new env vars
- [ ] Firebase security rules updated if Firestore schema changed
- [ ] Cloud Functions deploy cleanly (no missing deps in `functions/package.json`)
- [ ] New Stripe webhooks registered in Stripe dashboard
- [ ] Env vars documented in `.env.example`

---

**Screenshots / recordings** (if UI change):
<!-- Paste here -->