/**
 * Internal Root Platform policy binding — shared between the callable function
 * and the Stripe payment trigger.
 *
 * Extracted here to avoid duplicating Root API logic across modules.
 */
export declare function acceptInsuranceQuoteInternal(userId: string, quoteId: string, stripeSubscriptionId?: string): Promise<{
    policyId: string;
    policyNumber: string;
}>;
//# sourceMappingURL=insuranceInternal.d.ts.map