# Incident Response Plan

**Document owner:** DPO (dpo@driiva.co.uk)
**Last reviewed:** 2026-03-25
**Next review:** 2027-03-25
**Version:** 1.0

---

## 1. Purpose and Scope

This plan establishes Driiva's procedures for detecting, assessing, containing, reporting, and recovering from personal data breaches in compliance with UK GDPR Articles 33 and 34.

It applies to all Driiva systems, including:

- Client application (React SPA)
- Express API server (Vercel)
- Firebase Cloud Functions
- Cloud Firestore and Neon PostgreSQL databases
- Python trip classifier (FastAPI / Cloud Run)
- Third-party processors (Damoov, Anthropic, Google Cloud, Stripe)

All Driiva team members, contractors, and processors must follow this plan.

---

## 2. Definitions

| Term | Definition |
|------|------------|
| **Personal data breach** | A breach of security leading to the accidental or unlawful destruction, loss, alteration, unauthorised disclosure of, or access to, personal data. |
| **Confidentiality breach** | Unauthorised or accidental disclosure of, or access to, personal data (e.g., GPS telemetry exposed to unauthorised party). |
| **Availability breach** | Accidental or unauthorised loss of access to, or destruction of, personal data (e.g., Firestore data deleted or inaccessible). |
| **Integrity breach** | Unauthorised or accidental alteration of personal data (e.g., trip scores or financial records tampered with). |
| **Data subject** | An identified or identifiable natural person whose personal data is processed by Driiva (drivers, users). |
| **DPO** | Data Protection Officer. |
| **ICO** | Information Commissioner's Office (UK supervisory authority). |

---

## 3. Detection

Breaches may be identified through any of the following channels:

### 3.1 Automated Monitoring

- **Sentry error monitoring** — alerts on unexpected exceptions, elevated error rates, or anomalous patterns in the client, server, or Cloud Functions.
- **Cloud Function watchdog (`monitorTripHealth`)** — detects anomalies in trip processing (stalled pipelines, unexpected failure rates, data inconsistencies).
- **Unusual Firestore access patterns** — Firebase App Check violations, unexpected reads/writes detected through Firestore audit logs, security rule denials at abnormal volume.
- **Firebase Authentication alerts** — bulk failed sign-in attempts, credential stuffing patterns, anomalous account creation.

### 3.2 Human Reports

- **User reports** — submitted via the app, email (support@driiva.co.uk), or social media.
- **Internal discovery** — any team member who suspects a breach must report it immediately to the Engineering Lead and DPO.
- **Third-party notifications** — breach notifications from processors (Damoov, Google Cloud, Anthropic, Stripe) per their Article 28 obligations.

**All suspected breaches must be reported internally within 1 hour of discovery**, regardless of certainty. When in doubt, report.

---

## 4. Assessment

### 4.1 Assessment Team

The following individuals assess every suspected breach:

- **Engineering Lead** — determines technical scope and affected systems.
- **DPO** — determines data protection impact, ICO notification requirement, and data subject notification requirement.

Both must be contacted within 1 hour of detection. If either is unavailable, the Founder acts as backup.

### 4.2 Severity Classification

| Severity | Criteria | Response Time | Examples |
|----------|----------|---------------|----------|
| **Critical** | Active exfiltration, financial data exposed, large-scale PII breach (>1,000 subjects) | Immediate (all hands) | Database dump leaked, API keys compromised with confirmed misuse, payment data exposed |
| **High** | PII exposed to unauthorised party, GPS telemetry breach, scoring data tampered with | Within 1 hour | Trip location history accessible to other users, Firestore security rules misconfigured with confirmed access |
| **Medium** | Limited exposure, no confirmed misuse, small number of subjects affected | Within 4 hours | Single user's data exposed via API bug, test credentials used in production |
| **Low** | Near-miss, no actual data exposure confirmed, internal only | Within 24 hours | Security rule misconfiguration caught before exploitation, failed intrusion attempt |

### 4.3 Data Types to Assess

When evaluating a breach, determine which data types are affected:

- **GPS telemetry** — raw location points (`tripPoints/{tripId}`), trip routes, start/end locations. High sensitivity: reveals home address, workplace, daily patterns.
- **PII** — name, email, phone number, date of birth, driving licence details.
- **Financial records** — premium amounts, refund calculations, pool shares, payment details. All stored in integer cents.
- **Driving scores** — trip scores, score breakdowns, leaderboard rankings.
- **Device data** — accelerometer, gyroscope, device identifiers.
- **Authentication credentials** — Firebase Auth tokens, session data (never stored in plain text).

---

## 5. Containment

Immediate containment actions, executed by the Engineering Lead (or delegate):

### 5.1 Immediate Actions (within 1 hour of confirmed breach)

1. **Revoke compromised API keys** — rotate Firebase service account keys, Root Platform keys, Stripe keys, Anthropic keys, Damoov keys, and any other credentials that may be compromised.
2. **Rotate encryption keys** — if encryption keys are suspected compromised, rotate immediately and re-encrypt affected data.
3. **Isolate affected systems** — disable compromised Cloud Functions (`firebase functions:delete <function>`), block affected API endpoints, restrict Firestore security rules.
4. **Take Firestore export backup** — run `gcloud firestore export gs://driiva-backups/incident-<date>` to preserve current state for forensic analysis.
5. **Disable compromised accounts** — suspend any user accounts that are confirmed compromised via Firebase Admin SDK.
6. **Revoke active sessions** — force re-authentication for affected users by revoking Firebase refresh tokens.

### 5.2 Secondary Actions (within 4 hours)

7. **Preserve logs** — export Sentry logs, Cloud Function logs, Firestore audit logs, and Vercel deployment logs for the incident period. Do not delete any logs.
8. **Block attack vector** — deploy a hotfix to close the vulnerability, update Firestore security rules, or update Cloud Function code as needed.
9. **Notify processors** — inform Damoov, Google Cloud, Anthropic, or Stripe if their systems are involved, per Article 28 obligations.

---

## 6. ICO Notification

Under UK GDPR Article 33, the ICO must be notified **within 72 hours of becoming aware** of a personal data breach, unless the breach is unlikely to result in a risk to the rights and freedoms of data subjects.

### 6.1 Decision

The DPO determines whether ICO notification is required based on:

- Whether personal data was actually exposed (not just at risk)
- The sensitivity of the data (GPS telemetry and financial data are high sensitivity)
- The number of data subjects affected
- Whether the data was encrypted or otherwise protected
- The likelihood of harm to data subjects

**When in doubt, notify.** It is better to notify unnecessarily than to fail to notify when required.

### 6.2 Notification Template

The following information must be included in the ICO notification:

```
BREACH NOTIFICATION — ICO

Date and time of breach: [YYYY-MM-DD HH:MM UTC]
Date and time breach discovered: [YYYY-MM-DD HH:MM UTC]

Nature of the breach:
[ ] Confidentiality  [ ] Availability  [ ] Integrity
Description: [Free text description of what happened]

Categories of data subjects affected:
[ ] Driiva drivers/policyholders
[ ] Prospective users
[ ] Employees/contractors
Approximate number: [Number or best estimate]

Categories of personal data affected:
[ ] GPS telemetry / location data
[ ] Name, email, phone number
[ ] Date of birth / driving licence
[ ] Financial data (premiums, refunds, pool shares)
[ ] Driving scores and trip history
[ ] Device data (accelerometer, gyroscope)
[ ] Authentication credentials

DPO contact:
Name: [DPO name]
Email: dpo@driiva.co.uk
Phone: [DPO phone]

Likely consequences:
[Description of potential impact on data subjects]

Measures taken or proposed to address the breach:
[Description of containment, recovery, and prevention measures]

If notification is delayed beyond 72 hours, reason for delay:
[Explanation]
```

### 6.3 How to Report

- **Online:** ICO breach reporting portal — https://ico.org.uk/make-a-complaint/data-protection-complaints/data-protection-complaints/
- **Phone:** 0303 123 1113 (ICO helpline)

The DPO is responsible for submitting the notification and retaining a copy of all correspondence.

---

## 7. Data Subject Notification

Under UK GDPR Article 34, data subjects must be notified **without undue delay** when a breach is likely to result in a **high risk to their rights and freedoms**.

### 7.1 Decision

The DPO determines whether data subject notification is required. High risk is likely when:

- GPS location history is exposed (reveals home, workplace, daily routines)
- Financial data is exposed (enables fraud)
- Data is unencrypted and accessible
- A large number of subjects are affected

### 7.2 Notification Template

Notification must be in clear, plain language:

```
Subject: Important: Security Incident Affecting Your Driiva Account

Dear [Name],

We are writing to let you know about a security incident that may affect
your personal data held by Driiva.

WHAT HAPPENED
[Plain language description of the incident, when it occurred, and when
we discovered it.]

WHAT DATA WAS AFFECTED
[Specific types of data involved, e.g., "your trip location history
recorded between [dates]", "your name and email address".]

WHAT WE ARE DOING
[Steps taken to contain the breach, fix the vulnerability, and prevent
recurrence. E.g., "We have secured the affected system, rotated all
security credentials, and engaged an independent security review."]

WHAT YOU SHOULD DO
- Change your Driiva password immediately.
- If you used the same password elsewhere, change it on those
  services too.
- Monitor your email for suspicious activity.
- Be cautious of unsolicited communications claiming to be from Driiva.
- [Any additional steps specific to the breach.]

CONTACT US
If you have questions or concerns, contact our Data Protection Officer:
Email: dpo@driiva.co.uk

You also have the right to lodge a complaint with the Information
Commissioner's Office (ICO): https://ico.org.uk/make-a-complaint/

We sincerely apologise for this incident and are committed to protecting
your data.

The Driiva Team
```

### 7.3 Delivery

- **Primary:** email to the registered email address on the user's account.
- **Secondary:** in-app notification if the user has the app installed.
- **Fallback:** if individual notification is disproportionate (e.g., >10,000 users and email is not feasible), a public communication on the Driiva website and app.

---

## 8. Recovery

### 8.1 Restore

1. **Restore from backups** — if data was destroyed or corrupted, restore from the most recent clean Firestore export (`gcloud firestore import`).
2. **Verify data integrity** — compare restored data against Neon PostgreSQL sync records (one-way Firestore-to-Neon sync). Ensure trip scores and financial records are consistent.
3. **Re-deploy clean code** — deploy verified, patched versions of Cloud Functions (`firebase deploy --only functions`), server (`vercel --prod`), and client.

### 8.2 Re-enable Services

4. **Re-enable affected Cloud Functions** — deploy patched functions and verify via `monitorTripHealth`.
5. **Restore API access** — re-enable any endpoints or security rules that were restricted during containment.
6. **Issue new credentials** — distribute new API keys to team members and update environment variables in Vercel, Firebase, and Cloud Run.

### 8.3 Monitor

7. **Enhanced monitoring** — increase Sentry alert sensitivity and add targeted monitoring for the specific attack vector for at least 30 days.
8. **Watch for recurrence** — monitor Firestore audit logs, Cloud Function logs, and authentication patterns for signs that the vulnerability is being re-exploited.
9. **Verify user impact** — confirm that affected users can access their accounts and data normally.

---

## 9. Post-Incident Review

A post-incident review must be completed **within 5 business days** of incident closure.

### 9.1 Root Cause Analysis

Document the following:

- **Timeline** — from initial compromise to detection to containment to recovery, with timestamps.
- **Root cause** — the specific vulnerability, misconfiguration, or human error that enabled the breach.
- **Detection gap** — how long the breach existed before detection, and why existing monitoring did not catch it sooner.
- **Scope** — confirmed data subjects and data types affected (final numbers, not estimates).

### 9.2 Lessons Learned

- What worked well in the response?
- What could be improved?
- Were there communication gaps?
- Was the severity classification accurate?

### 9.3 Process Improvements

- Specific technical fixes to prevent recurrence (e.g., new Firestore security rules, additional monitoring).
- Process changes (e.g., updated access controls, new review procedures).
- Training needs identified.
- Updates to this Incident Response Plan.

### 9.4 Documentation

The post-incident report must be stored securely and retained for at least 7 years. A copy must be provided to the DPO. If the ICO was notified, a summary of the post-incident findings must be available for follow-up inquiries.

---

## 10. Roles and Responsibilities

| Role | Contact | Responsibilities |
|------|---------|------------------|
| **DPO** | dpo@driiva.co.uk | Assess data protection impact, decide on ICO/data subject notification, submit ICO reports, advise on legal obligations, maintain breach register. |
| **Engineering Lead** | [engineering lead contact] | Detect and investigate technical scope, execute containment, deploy fixes, restore services, lead root cause analysis. |
| **Legal** | [legal contact] | Advise on regulatory obligations, review ICO notifications, liaise with external counsel, assess liability. |
| **Founder** | [founder contact] | Approve external communications, escalation point, stakeholder management, resource allocation. Backup for DPO/Engineering Lead if unavailable. |

### Escalation Path

1. Whoever detects the breach notifies **Engineering Lead** and **DPO** within 1 hour.
2. Engineering Lead and DPO jointly assess severity.
3. For **High** or **Critical** severity: Founder and Legal are notified immediately.
4. DPO decides on ICO and data subject notifications.
5. Engineering Lead coordinates technical response.

---

## 11. Testing

### 11.1 Tabletop Exercises

Conduct a tabletop exercise **at least annually** simulating a realistic breach scenario. Scenarios should rotate across breach types:

- GPS telemetry data breach (confidentiality)
- Firestore data corruption (integrity)
- Cloud Function outage affecting trip processing (availability)
- Third-party processor breach (Damoov, Anthropic)

### 11.2 Review Triggers

This plan must be reviewed and updated:

- After any actual incident (within 5 business days of incident closure)
- After each tabletop exercise
- When significant changes are made to Driiva's architecture or data processing
- When new processors are onboarded
- At minimum annually

### 11.3 Contact Details

Verify and update all contact details in Section 10 **quarterly**. The DPO is responsible for maintaining current contact information.

---

## 12. Appendix

### A. Key External Contacts

| Organisation | Contact | Purpose |
|-------------|---------|---------|
| **ICO** | https://ico.org.uk/make-a-complaint/ / 0303 123 1113 | Breach reporting, guidance |
| **Financial Ombudsman Service (FOS)** | https://www.financial-ombudsman.org.uk/ / 0800 023 4567 | Financial complaints escalation |
| **Action Fraud** | https://www.actionfraud.police.uk/ / 0300 123 2040 | Report cybercrime |
| **NCSC** | https://www.ncsc.gov.uk/ / 03000 200 973 | Cyber security incident support |

### B. Key Internal References

| Document | Location | Purpose |
|----------|----------|---------|
| DPIA | `docs/DPIA.md` | Data Protection Impact Assessment for telematics processing |
| Privacy Policy | `client/src/pages/privacy.tsx` | User-facing privacy information |
| Terms of Service | `client/src/pages/terms.tsx` | User-facing terms |
| Trust Centre | `client/src/pages/trust.tsx` | User-facing trust and security information |
| GDPR Functions | `functions/src/http/gdpr.ts` | Data subject rights implementation |
| Firestore Types | `shared/firestore-types.ts` | Canonical data schema |
| RUNBOOK | `RUNBOOK.md` | Operational procedures |

### C. Breach Register

The DPO maintains a breach register recording all suspected and confirmed breaches, including:

- Date and time of breach and detection
- Nature and scope
- Data types and subjects affected
- Severity classification
- Actions taken
- ICO notification (yes/no, date, reference)
- Data subject notification (yes/no, date)
- Post-incident review reference

This register must be retained for at least 7 years and made available to the ICO on request.
