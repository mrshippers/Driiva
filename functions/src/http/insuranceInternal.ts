/**
 * Internal Root Platform policy binding — shared between the callable function
 * and the Stripe payment trigger.
 *
 * Extracted here to avoid duplicating Root API logic across modules.
 */

import * as admin from 'firebase-admin';
import { COLLECTION_NAMES, UserDocument, CoverageType } from '../types';

const db = admin.firestore();

interface RootConfig {
  apiKey: string;
  apiUrl: string;
  productModuleKey: string;
}

function getRootConfig(): RootConfig {
  const apiKey = process.env.ROOT_API_KEY;
  const productModuleKey = process.env.ROOT_PRODUCT_MODULE_KEY;
  if (!apiKey || !productModuleKey) {
    throw new Error('Root Platform is not configured (ROOT_API_KEY or ROOT_PRODUCT_MODULE_KEY missing)');
  }
  return {
    apiKey,
    apiUrl: process.env.ROOT_API_URL || 'https://api.rootplatform.com/v1/insurance',
    productModuleKey,
  };
}

async function rootApiFetch<T>(path: string, method: 'GET' | 'POST', body?: Record<string, unknown>): Promise<T> {
  const config = getRootConfig();
  const response = await fetch(`${config.apiUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${config.apiKey}:`).toString('base64')}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Root API ${method} ${path} failed (${response.status}): ${text}`);
  }
  return response.json() as Promise<T>;
}

export async function acceptInsuranceQuoteInternal(
  userId: string,
  quoteId: string,
  stripeSubscriptionId?: string,
): Promise<{ policyId: string; policyNumber: string }> {
  // Get stored quote coverageType
  const quoteDoc = await db.collection('quotes').doc(quoteId).get();
  const storedCoverage: CoverageType = quoteDoc.exists
    ? (quoteDoc.data()?.coverageType as CoverageType) || 'standard'
    : 'standard';

  // Get user
  const userDoc = await db.collection(COLLECTION_NAMES.USERS).doc(userId).get();
  if (!userDoc.exists) throw new Error(`User ${userId} not found`);
  const user = userDoc.data() as UserDocument;

  // Ensure Root policyholder
  let policyholderPackageId: string = (user as any).rootPolicyholderId;
  if (!policyholderPackageId) {
    const nameParts = (user.displayName || '').trim().split(/\s+/);
    const ph = await rootApiFetch<{ policyholder_id: string }>('/policyholders', 'POST', {
      first_name: nameParts[0] || 'Driver',
      last_name: nameParts.slice(1).join(' ') || 'Unknown',
      email: user.email || `${userId}@driiva.internal`,
      id: userId,
    });
    policyholderPackageId = ph.policyholder_id;
    await db.collection(COLLECTION_NAMES.USERS).doc(userId).update({
      rootPolicyholderId: policyholderPackageId,
    }).catch(() => {/* non-critical */});
  }

  // Create application
  const application = await rootApiFetch<{ application_id: string; policy_id: string | null; status: string }>(
    '/applications', 'POST', { quote_package_id: quoteId, policyholder_id: policyholderPackageId },
  );
  if (!application.policy_id) {
    throw new Error(`Root application status: ${application.status} — no policy_id returned`);
  }

  // Get full policy
  const rootPolicy = await rootApiFetch<{
    policy_id: string; policy_number: string; status: string;
    monthly_premium: number; start_date: string; end_date: string;
  }>(`/policies/${application.policy_id}`, 'GET');

  // Store in Firestore
  await db.collection(COLLECTION_NAMES.POLICIES).doc(rootPolicy.policy_id).set({
    policyId: rootPolicy.policy_id,
    userId,
    policyNumber: rootPolicy.policy_number || `DRV-${Date.now()}`,
    status: 'active',
    coverageType: storedCoverage,
    basePremiumCents: rootPolicy.monthly_premium,
    currentPremiumCents: rootPolicy.monthly_premium,
    discountPercentage: 0,
    effectiveDate: admin.firestore.Timestamp.fromDate(new Date(rootPolicy.start_date)),
    expirationDate: admin.firestore.Timestamp.fromDate(new Date(rootPolicy.end_date)),
    renewalDate: null,
    vehicle: null,
    billingCycle: 'monthly',
    stripeSubscriptionId: stripeSubscriptionId || null,
    rootPolicyId: rootPolicy.policy_id,
    rootApplicationId: application.application_id,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: userId,
    updatedBy: 'cloud-function',
  });

  // Update user activePolicy
  await db.collection(COLLECTION_NAMES.USERS).doc(userId).update({
    activePolicy: {
      policyId: rootPolicy.policy_id,
      policyNumber: rootPolicy.policy_number,
      status: 'active',
      startDate: rootPolicy.start_date,
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: 'cloud-function',
  });

  return { policyId: rootPolicy.policy_id, policyNumber: rootPolicy.policy_number };
}
