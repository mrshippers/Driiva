/**
 * Firestore getDoc with retry for cold-cache resilience.
 *
 * When persistentLocalCache is enabled and the IndexedDB cache is empty on
 * first load, getDoc() can throw FirestoreError code "unavailable" because the
 * SDK hasn't established a network connection yet. This wrapper retries with
 * exponential backoff so the auth flow doesn't break on first visit.
 */

import {
  getDoc,
  type DocumentReference,
  type DocumentSnapshot,
  FirestoreError,
} from "firebase/firestore";

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 500;

export async function getDocWithRetry<T>(
  ref: DocumentReference<T>,
  maxRetries = DEFAULT_MAX_RETRIES,
  baseDelayMs = DEFAULT_BASE_DELAY_MS,
): Promise<DocumentSnapshot<T>> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await getDoc(ref);
    } catch (err) {
      lastError = err;
      const isRetryable =
        err instanceof FirestoreError && err.code === "unavailable";

      if (!isRetryable || attempt === maxRetries) break;

      await new Promise((r) =>
        setTimeout(r, baseDelayMs * Math.pow(2, attempt)),
      );
    }
  }

  throw lastError;
}
