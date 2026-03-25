# Data Protection Impact Assessment (DPIA)

## Telematics Data Processing

**Document owner:** DPO (dpo@driiva.co.uk)
**Last reviewed:** 2026-03-25
**Next review:** 2027-03-25
**Version:** 1.0
**Status:** Approved

---

## 1. Project Description

Driiva is a UK telematics-based insurance platform that records driving behaviour via smartphone GPS sensors, computes a safety score (0-100), and rewards safe drivers with a cash refund from a community insurance pool.

The core processing activity assessed in this DPIA is the collection and analysis of GPS telemetry data during driving trips to:

- Compute a deterministic driving safety score based on speed, braking, acceleration, cornering, and phone usage.
- Determine insurance pricing adjustments and refund eligibility.
- Classify trip segments (driving vs. stationary) using a machine learning classifier.
- Generate AI-powered driving insights and safety recommendations.
- Calculate community pool shares and leaderboard rankings.

This processing involves location tracking of individuals during driving, which constitutes large-scale systematic monitoring of a publicly accessible area. A DPIA is therefore required under UK GDPR Article 35(3)(c).

---

## 2. Data Controller

| Field | Detail |
|-------|--------|
| **Organisation** | Driiva Ltd |
| **Jurisdiction** | United Kingdom |
| **ICO registration** | Registered (reference on file) |
| **FCA status** | FCA sandbox-aligned |
| **DPO contact** | dpo@driiva.co.uk |

---

## 3. Processing Description

### 3.1 What Data Is Collected

| Data Category | Specific Fields | Sensitivity | Collection Trigger |
|--------------|----------------|-------------|-------------------|
| **GPS coordinates** | Latitude, longitude, heading, horizontal accuracy | High — reveals home, workplace, daily routines | During active trip recording |
| **Speed** | Speed in m/s (stored as m/s x 100 integer) | Medium | During active trip recording |
| **Acceleration and braking** | Longitudinal acceleration events (thresholds: -3.5 m/s^2 braking, 3.0 m/s^2 acceleration) | Low | Derived from GPS during processing |
| **Cornering** | Lateral acceleration events | Low | Derived from GPS during processing |
| **Device motion** | Accelerometer (ax, ay, az), gyroscope (gx, gy, gz) — optional | Medium | During active trip recording, if device supports |
| **Trip metadata** | Start/end time (ISO 8601), duration (seconds), distance (metres), start/end location | High — start/end locations reveal home and workplace | On trip start and completion |
| **Driving score** | Overall score (0-100), breakdown by category (speed 25%, braking 25%, acceleration 20%, cornering 20%, phone 10%) | Medium | Computed on trip completion |
| **Financial data** | Premium amount, refund amount, pool share — all in integer cents | High | On policy creation, trip completion, pool settlement |
| **Account data** | Name, email, Firebase Auth UID, vehicle details | Medium — PII | On registration |

### 3.2 Why Data Is Processed

| Purpose | Lawful Basis | Description |
|---------|-------------|-------------|
| **Insurance risk scoring** | Contractual necessity, legitimate interest | Compute driving safety score to determine insurance pricing and refund eligibility |
| **Driving safety analysis** | Contractual necessity | Identify specific driving events (harsh braking, speeding) to provide actionable feedback |
| **Community pool eligibility** | Contractual necessity | Calculate each driver's share of the refund pool based on their driving score |
| **Trip classification** | Legitimate interest | Distinguish driving segments from stops to ensure accurate scoring |
| **AI driving insights** | Consent (feature-flagged: `VITE_FEATURE_AI_INSIGHTS`) | Generate personalised driving improvement suggestions via Anthropic Claude |
| **Leaderboard** | Consent (feature-flagged: `VITE_FEATURE_LEADERBOARD`) | Anonymised community rankings to encourage safe driving |
| **Fraud detection** | Legitimate interest | Detect anomalous trip patterns that may indicate fraudulent claims |

### 3.3 Data Volume and Retention

| Data Type | Volume | Retention Period | Storage Location |
|-----------|--------|-----------------|-----------------|
| Raw GPS points (`tripPoints/{tripId}`) | Continuous during trips; typically 1 point per second | **90 days**, then automatically deleted | Cloud Firestore |
| Trip records (`trips/{tripId}`) | One per completed trip | **7 years** (insurance regulatory requirement) | Cloud Firestore, synced to Neon PostgreSQL |
| Trip segments (`tripSegments/{tripId}`) | One per completed trip | **90 days** (aligned with raw points) | Cloud Firestore |
| Driving scores and aggregates | One per trip; aggregated in user profile | **7 years** | Cloud Firestore, synced to Neon PostgreSQL |
| Financial records (`poolShares`) | One per settlement period per user | **7 years** (financial regulatory requirement) | Cloud Firestore, synced to Neon PostgreSQL |
| User accounts (`users/{userId}`) | One per registered user | Until account deletion or **7 years** after last activity | Cloud Firestore, synced to Neon PostgreSQL |

### 3.4 Data Recipients and Processors

| Recipient | Role | Data Shared | Purpose | Safeguards |
|-----------|------|-------------|---------|------------|
| **Google Cloud / Firebase** | Processor (hosting) | All data listed above | Infrastructure: authentication, database, cloud functions | Google Cloud DPA, ISO 27001, SOC 2, EU SCCs |
| **Damoov** | Processor | GPS telemetry, device motion | Telematics data collection SDK | Article 28 DPA in place |
| **Anthropic** | Processor | Anonymised trip data (scores, events, no raw GPS) | AI-powered driving insights | Data not used for model training; API DPA |
| **Neon (PostgreSQL)** | Processor (secondary storage) | Synced trip and user records (one-way from Firestore) | Structured queries, analytics | SOC 2 compliant, encrypted at rest |
| **Vercel** | Processor (hosting) | API requests, server-side processing | Express API server hosting | Vercel DPA, SOC 2 |
| **Sentry** | Processor | Error logs (PII scrubbed) | Error monitoring and alerting | Sentry DPA, PII scrubbing configured |
| **Stripe** | Processor (scaffolded, not live) | Payment data (when activated) | Premium collection, refund disbursement | PCI DSS Level 1, Stripe DPA |

---

## 4. Lawful Basis

### 4.1 Primary Basis: Contractual Necessity (Article 6(1)(b))

Telematics data processing is necessary for the performance of the insurance contract. Driiva's policy terms explicitly require telematics monitoring to determine pricing and refund eligibility. Without this processing, the telematics insurance product cannot function.

### 4.2 Supporting Basis: Consent (Article 6(1)(a))

Users provide explicit, informed consent during onboarding before any trip recording begins:

- Clear explanation of what data is collected and why.
- Separate consent for optional features (AI insights, leaderboard).
- Trip recording requires an affirmative action (pressing "Start Trip").
- Consent can be withdrawn at any time by stopping trip recording or deleting the account.

### 4.3 Supporting Basis: Legitimate Interest (Article 6(1)(f))

For fraud detection and trip classification, Driiva relies on legitimate interest. The balancing test:

- **Driiva's interest:** accurate insurance pricing, fraud prevention.
- **Data subject's interest:** fair premiums, protection from fraudulent co-policyholders inflating pool costs.
- **Balance:** processing is proportionate; data subjects expect telematics monitoring as part of a telematics insurance product.

---

## 5. Necessity and Proportionality

### 5.1 Necessity

GPS tracking during driving trips is **necessary** for telematics insurance pricing. There is no less intrusive alternative that achieves the same objective:

- Speed, braking, acceleration, and cornering can only be measured via real-time location and motion data.
- Insurance regulators and actuarial standards require objective driving behaviour data for usage-based pricing.
- Self-reported driving behaviour is unreliable and would undermine the product's purpose.

### 5.2 Data Minimisation

Driiva applies the following data minimisation measures:

| Measure | Implementation |
|---------|---------------|
| **Collection only during active trips** | GPS recording starts only when the user explicitly presses "Start Trip" and stops when they press "Stop Trip". There is no background or continuous location tracking. |
| **Minimum necessary fields** | Only GPS coordinates, speed, heading, accuracy, and optional device motion are collected. No audio, camera, contacts, or other device data. |
| **90-day raw data retention** | Raw GPS points (`tripPoints/{tripId}`) are automatically deleted after 90 days. Only aggregated scores and trip summaries are retained long-term. |
| **Anonymisation for AI** | Trip data sent to Anthropic for AI insights is anonymised: no raw GPS coordinates, user identity, or location names are shared. |
| **No continuous surveillance** | Driiva does not track users outside of actively recorded trips. There is no geofencing, no always-on monitoring, no passive data collection. |
| **Aggregation over time** | Leaderboard rankings use aggregated scores only, not individual trip details. |

### 5.3 Proportionality

The processing is proportionate to the objective:

- Users voluntarily choose a telematics insurance product and understand that driving monitoring is the core feature.
- The financial benefit (up to 15% premium refund) provides a tangible incentive.
- Users retain full control: they choose when to record trips and can delete their account and data at any time via GDPR data subject rights (`functions/src/http/gdpr.ts`).

---

## 6. Risk Identification

| # | Risk | Likelihood | Severity | Overall |
|---|------|-----------|----------|---------|
| R1 | **Re-identification from GPS data** — raw GPS coordinates can reveal home address, workplace, and daily patterns, enabling re-identification even from ostensibly anonymised data. | Medium | High | **High** |
| R2 | **Data breach exposing location history** — unauthorised access to `tripPoints` or `trips` collections would expose detailed movement history for affected users. | Medium | High | **High** |
| R3 | **Function creep** — telematics data collected for insurance scoring could be repurposed for surveillance, marketing, or sharing with third parties beyond the original purpose. | Low | High | **Medium** |
| R4 | **Inaccurate scoring affecting premiums** — GPS signal errors, device variability, or algorithm bugs could produce incorrect driving scores, leading to unfair premium adjustments. | Medium | Medium | **Medium** |
| R5 | **Third-party processor breach** — a breach at Damoov, Google Cloud, or Anthropic could expose Driiva user data through no fault of Driiva's own systems. | Low | High | **Medium** |

---

## 7. Mitigation Measures

### R1: Re-identification from GPS Data

| Mitigation | Detail |
|-----------|--------|
| **90-day raw data deletion** | Raw GPS points are automatically purged after 90 days, limiting the window of exposure. |
| **Aggregated scores only for long-term retention** | After 90 days, only trip-level summaries (distance, duration, score) remain — no point-level coordinates. |
| **Anonymisation for external processors** | Data shared with Anthropic contains no raw GPS coordinates. Trip segments sent to the classifier contain coordinates but are processed ephemerally. |
| **Access controls** | Firestore security rules restrict `tripPoints` access to the owning user and server-side functions only. |

### R2: Data Breach Exposing Location History

| Mitigation | Detail |
|-----------|--------|
| **Encryption at rest** | Firestore and Neon PostgreSQL both encrypt data at rest using AES-256-GCM. |
| **Encryption in transit** | All communications use TLS 1.3. |
| **Firebase Authentication** | All API routes require `verifyFirebaseToken()` — no unauthenticated access to user data. |
| **Firestore security rules** | Users can only read/write their own data. Admin operations require server-side credentials. |
| **Rate limiting** | API endpoints are rate-limited to prevent bulk data extraction. |
| **Sentry PII scrubbing** | Error monitoring is configured to strip PII before transmission. |
| **Incident response plan** | `docs/INCIDENT_RESPONSE.md` provides procedures for breach detection, containment, and notification. |

### R3: Function Creep

| Mitigation | Detail |
|-----------|--------|
| **Purpose limitation** | This DPIA explicitly defines permitted purposes. Any new purpose requires a DPIA update and, if material, fresh consent. |
| **Feature flags** | Optional processing (AI insights, leaderboard) is behind feature flags (`VITE_FEATURE_AI_INSIGHTS`, `VITE_FEATURE_LEADERBOARD`) and requires separate consent. |
| **Audit trail** | `createdBy`/`updatedBy` fields on all sensitive documents create accountability for data access and modification. |
| **Contractual restrictions** | Processor agreements (Article 28 DPAs) restrict processors to specified purposes only. |
| **Architecture hard stops** | `CLAUDE.md` documents architectural invariants that prevent unauthorised data flows. |

### R4: Inaccurate Scoring

| Mitigation | Detail |
|-----------|--------|
| **Deterministic scoring** | `computeDrivingScore()` in `functions/src/utils/helpers.ts` is deterministic — same inputs always produce the same score. |
| **Canonical shared library** | `shared/tripProcessor.ts` is the single source of truth for distance and duration calculations, imported by all consumers. No logic duplication. |
| **Disputed trip status** | Trips can be marked as `disputed`, allowing investigation without retroactively modifying completed scores. |
| **Transparency** | Score breakdowns (speed, braking, acceleration, cornering, phone) are shown to users, enabling them to verify and challenge results. |
| **Testing** | Scoring logic is covered by automated tests (`vitest`). |

### R5: Third-Party Processor Breach

| Mitigation | Detail |
|-----------|--------|
| **Article 28 DPAs** | Data Processing Agreements in place with all processors, requiring breach notification within contractual timeframes. |
| **Minimum data sharing** | Each processor receives only the data necessary for their function. Anthropic receives anonymised data. Sentry receives PII-scrubbed error logs. |
| **Processor due diligence** | All processors are assessed for security certifications (ISO 27001, SOC 2, PCI DSS as applicable). |
| **Incident response** | Third-party notifications are a documented detection channel in `docs/INCIDENT_RESPONSE.md`. |

---

## 8. Residual Risk Assessment

After applying the mitigations described in Section 7:

| # | Risk | Pre-Mitigation | Post-Mitigation | Rationale |
|---|------|---------------|-----------------|-----------|
| R1 | Re-identification from GPS data | High | **Low** | 90-day deletion, anonymisation for external sharing, and access controls significantly reduce exposure. |
| R2 | Data breach exposing location history | High | **Low** | Defence in depth (encryption, authentication, security rules, rate limiting, monitoring) reduces both likelihood and impact. |
| R3 | Function creep | Medium | **Low** | Purpose limitation, feature flags, audit trails, and contractual restrictions provide strong safeguards. |
| R4 | Inaccurate scoring | Medium | **Low** | Deterministic scoring, canonical shared library, testing, and dispute mechanism address accuracy concerns. |
| R5 | Third-party processor breach | Medium | **Low** | DPAs, minimum data sharing, and processor due diligence reduce both likelihood and impact. |

**Overall residual risk: LOW.** The processing may proceed without ICO consultation.

---

## 9. DPO Consultation

The Data Protection Officer has reviewed this DPIA and confirms:

- The processing is necessary and proportionate for the stated purposes.
- Appropriate lawful bases have been identified.
- Technical and organisational measures are adequate to mitigate identified risks.
- Residual risk is low after mitigations are applied.
- **ICO consultation under Article 36 is not required**, as residual risk does not remain high after mitigations.

| Field | Detail |
|-------|--------|
| **DPO name** | [DPO name] |
| **Date reviewed** | 2026-03-25 |
| **Outcome** | Approved — processing may proceed |
| **ICO consultation required** | No |

---

## 10. Review Schedule

This DPIA must be reviewed:

| Trigger | Action |
|---------|--------|
| **Annual review** | Full review of all sections, update risk assessments, verify mitigations are still effective. Next review: 2027-03-25. |
| **New data types collected** | Review if the new data changes the risk profile (e.g., phone pickup detection, camera-based features). |
| **New processors added** | Review data sharing, ensure Article 28 DPA is in place, update Section 3.4. |
| **Material changes to processing** | Review if changes affect necessity, proportionality, or risk (e.g., new scoring algorithm, real-time tracking, data sharing with insurers). |
| **Actual data breach** | Mandatory review within 5 business days of incident closure, per Incident Response Plan. |
| **Regulatory changes** | Review if UK GDPR amendments, ICO guidance, or FCA requirements affect this assessment. |

### Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-25 | DPO | Initial DPIA |
