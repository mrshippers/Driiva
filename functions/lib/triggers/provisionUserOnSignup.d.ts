/**
 * PROVISION USER ON SIGNUP
 * ========================
 * The unified user-provisioning path for M1 (see
 * .superpowers/sdd/m1-grounding.md §2/§8, rebuild_plan.md §M1 T1). A single
 * Firebase Auth `onCreate` trigger that writes the complete `users/{uid}`
 * doc for EVERY signup method, including Google - which the retired
 * `onUserCreate` (a Firestore-doc trigger, see git history) never fired for.
 *
 * LIVE as of the M1 T7 cutover: exported from `functions/src/index.ts` (the
 * deploy surface), replacing `onUserCreate` and the client's fire-and-forget
 * batch (`client/src/pages/signup.tsx`), which are both retired. `syncUserOnSignup`
 * (DEC-3) stays alongside this as the Neon analytics mirror. `provisionUser`
 * and `buildProvisionedUserDoc` are exported individually so the emulator
 * integration test (M1 T5) can drive them directly without the trigger
 * wrapper.
 */
import * as functions from 'firebase-functions';
/**
 * Async handler for the Auth `onCreate` event: writes `users/{uid}`,
 * `usernames/{localPart}`, the default `policies/{...}` doc, and registers
 * the user with Damoov. Fires for every signup method, including Google.
 * Skips all of the above (idempotency guard, above) when a policy already
 * exists for the uid, so a duplicate Auth-trigger delivery is a no-op.
 *
 * Matches the retired `onUserCreate`'s never-throw posture (it lived in
 * functions/src/triggers/users.ts, deleted at the M1 T7 cutover - see git
 * history): the whole body is wrapped in one try/catch that logs and does
 * not rethrow. This is an Auth `onCreate` trigger, not a Firestore-doc
 * trigger - it is not auto-retried by the platform, so a transient
 * Firestore blip must not fail loudly; it leaves the user un-provisioned
 * for a manual/scripted retry rather than surfacing an error to the signup
 * flow.
 */
export declare function provisionUser(user: functions.auth.UserRecord): Promise<void>;
/**
 * DORMANT - not exported from functions/src/index.ts, not part of the
 * deployed functions set. M1 T7 wires this in at cutover.
 */
export declare const provisionUserOnSignup: functions.CloudFunction<import("firebase-admin/auth").UserRecord>;
//# sourceMappingURL=provisionUserOnSignup.d.ts.map