# Firestore Indexes for Driiva

This document describes the composite and single-field indexes in `firestore.indexes.json` and which queries require them.

---

## Deployment

Deploy **rules and indexes** together:

```bash
firebase deploy --only firestore
```

Deploy **indexes only** (no rules change):

```bash
firebase deploy --only firestore:indexes
```

Indexes can take several minutes to build. Check status in [Firebase Console → Firestore → Indexes](https://console.firebase.google.com/project/_/firestore/indexes).

---

## Composite Indexes

*Note: A composite on `trips` with only `(userId, startedAt)` and a COLLECTION_GROUP index on `trips` with only `startedAt` were removed — Firestore reports them as "not necessary, configure using single field index controls".*

| Collection      | Fields (order) | Used by |
|-----------------|----------------|--------|
| **trips**       | `userId` (asc), `status` (asc), `startedAt` (desc) | Trip history with status filter (e.g. `status === 'completed'`) |
| **trips**       | `userId` (asc), `status` (asc), `endedAt` (desc) | **Dashboard**: last N trips (e.g. last 3 completed) ordered by `endedAt` |
| **trips**       | `anomalies.flaggedForReview` (asc), `createdAt` (desc) | Admin/review queries for flagged trips |
| **driver_stats**| `overallScore` (desc), `totalTrips` (desc) | Leaderboard: top 100 drivers by score (if using `driver_stats` collection) |
| **users**       | `drivingProfile.totalTrips` (desc), `drivingProfile.currentScore` (desc) | **Leaderboard** (scheduled function): top drivers from `users` |
| **users**       | `drivingProfile.riskTier` (asc), `drivingProfile.currentScore` (desc) | Risk-tier dashboards |
| **policies**    | `userId` (asc), `status` (asc), `effectiveDate` (desc) | User’s policies by status and date |
| **policies**    | `status` (asc), `expirationDate` (asc) | Global policy expiry queries |
| **poolShares**  | `userId` (asc), `poolPeriod` (desc) | User’s pool share history |
| **poolShares**  | `poolPeriod` (asc), `status` (asc) | Pool period + status (scheduled jobs) |
| **poolShares**  | `poolPeriod` (asc), `weightedScore` (desc) | Pool rankings by period |
| **poolShares**  | `userId` (asc), `status` (asc) | User pool share by status |
| **tripSegments**| `userId` (asc), `classifiedAt` (desc) | Classifier output by user |
| **trips**       | `userId` (asc), `score` (desc), `startedAt` (desc) | Trips by score |
| **leaderboard**| `periodType` (asc), `period` (desc) | Precomputed leaderboard by period |
| **feedback**    | `timestamp` (desc) | Admin feedback view: recent feedback by date |

---

## Single-Field Indexes (fieldOverrides)

`fieldOverrides` define single-field index order (asc/desc) for use in queries and composite indexes:

- **trips**: `userId`, `status`, `startedAt` (desc), `endedAt` (desc)
- **poolShares**: `userId`
- **driver_stats**: `overallScore` (desc), `totalTrips` (desc)

---

## Queries That Fail Without These Indexes

1. **Dashboard – “Last 10 trips by end time”**  
   - Query: `trips` where `userId == x`, `status == 'completed'`, orderBy `endedAt` desc, limit 3 (or 10).  
   - **Without** composite index `(userId, status, endedAt desc)`: Firestore returns an error and asks you to create that index (or the query fails in production if the index was never created).

2. **Leaderboard – “Top 100 by overallScore”**  
   - If you use a **driver_stats** collection: query `driver_stats` orderBy `overallScore` desc, `totalTrips` desc, limit 100.  
   - **Without** composite index `(overallScore desc, totalTrips desc)`: the query fails.  
   - Current code uses **users** with `drivingProfile.totalTrips` and `drivingProfile.currentScore`; that uses the **users** composite index above.

3. **Trip history – “All trips for user, paginated by start time”**  
   - Query: `trips` where `userId == x`, orderBy `startedAt` desc, limit 20 (and optional `status` filter).  
   - **Without** composite index `(userId, startedAt desc)` or `(userId, status, startedAt desc)` when filtering by status: the query fails.

4. **Policies / pool shares**  
   - Same idea: any compound query (multiple `where` + `orderBy`) needs a matching composite index or Firestore will error and prompt for it.

---

## Summary

- **Dashboard** needs: `trips` → `(userId, status, endedAt desc)`.
- **Trip history** needs: `trips` → `(userId, startedAt desc)` and optionally `(userId, status, startedAt desc)`.
- **Leaderboard** needs: either `driver_stats` → `(overallScore desc, totalTrips desc)` or **users** → `(drivingProfile.totalTrips desc, drivingProfile.currentScore desc)` (already used by the scheduled leaderboard job).

Deploy with:

```bash
firebase deploy --only firestore
```

or indexes only:

```bash
firebase deploy --only firestore:indexes
```
