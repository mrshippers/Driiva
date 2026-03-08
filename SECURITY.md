# Security Policy

## Secrets management

**All secrets go in GitHub Secrets (CI/CD) or Firebase environment config. Never hardcode credentials in source files.**

Pre-commit hooks will reject any commit that contains the following patterns:

- AWS access key IDs and secret keys
- Google API keys (`AIzaSy…`)
- Firebase environment variable assignments (`FIREBASE_*=…`)
- Any other patterns registered with `git secrets --list`

### Where secrets live

| Secret | Location |
|--------|----------|
| Firebase service account | GitHub Actions secret `FIREBASE_SERVICE_ACCOUNT` |
| Anthropic API key | Firebase secret via `firebase functions:secrets:set ANTHROPIC_API_KEY` |
| Stripe keys | GitHub Actions secret / Firebase secret |
| Sentry DSN | GitHub Actions secret `SENTRY_DSN` / Vite env var (public DSN only) |
| `ENCRYPTION_KEY` | Firebase secret via `firebase functions:secrets:set ENCRYPTION_KEY` |
| Damoov API credentials | Firebase secret |
| Root Platform credentials | Firebase secret |

### Setting up secrets locally

Copy `.env.example` (if present) to `.env.local` and fill in values. **Never commit `.env*` files** — they are listed in `.gitignore`.

For Cloud Functions, use the Firebase CLI:

```bash
firebase functions:secrets:set SECRET_NAME
```

For GitHub Actions, add secrets at **Settings → Secrets and variables → Actions**.

## Pre-commit hooks

Two layers of protection are active in this repository:

### 1. git-secrets

Installed via `git secrets --install`. Scans every commit for known secret patterns.

To view registered patterns:

```bash
git secrets --list
```

To add a new pattern:

```bash
git secrets --add 'PATTERN_REGEX'
```

### 2. detect-secrets

Installed via `.pre-commit-config.yaml`. Uses heuristic detection to catch additional credential types not covered by explicit regex patterns. Baseline stored in `.secrets.baseline`.

To update the baseline after a confirmed false positive:

```bash
detect-secrets scan --update .secrets.baseline
```

To run hooks manually on all files:

```bash
pre-commit run --all-files
```

## GitHub secret scanning

GitHub's built-in secret scanning is enabled on this repository (**Settings → Code security → Secret scanning**). Any secret pattern pushed to the repository will trigger an alert to repository administrators.

## Reporting a vulnerability

If you discover a security vulnerability, please **do not open a public issue**. Instead, email the team privately so we can coordinate a fix before disclosure.
