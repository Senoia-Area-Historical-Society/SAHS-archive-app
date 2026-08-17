/**
 * Reading thrown values without `any`.
 *
 * `catch (err: any)` was how thirteen call sites reached `err.message` and
 * `err.code`. Removing the annotation is not free: `strict` turns on
 * `useUnknownInCatchVariables`, so a bare `catch (err)` types the binding as
 * `unknown` and every property read stops compiling. These two helpers are what
 * replaces those reads, rather than thirteen bespoke narrowings.
 *
 * Both check structurally rather than with `instanceof FirebaseError`. What gets
 * thrown here is genuinely mixed — Firebase SDK errors, DOM exceptions, plain
 * Errors from our own code — and a nominal check would quietly stop matching
 * whichever of those it was not written for. The old `any` reads were structural
 * too, so this preserves the behaviour that shipped rather than tightening it
 * silently.
 */

/**
 * The `message` of a thrown value, or `''` when it has none.
 *
 * Returns the empty string rather than a stock phrase so call sites keep using
 * their own fallback: `errorMessage(err) || 'Failed to save'` behaves exactly as
 * `err.message || 'Failed to save'` did, including when `message` is present but
 * empty.
 */
export function errorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === 'object' && err !== null && 'message' in err) {
        const message = (err as { message: unknown }).message;
        return typeof message === 'string' ? message : '';
    }
    return '';
}

/**
 * The `code` on a Firebase error — 'permission-denied', 'auth/popup-blocked'
 * and so on — or undefined for anything that has none.
 *
 * Worth keeping separate from the message: a rules rejection is the one failure
 * these pages can give a genuinely useful explanation for, and it is identified
 * by code rather than by wording.
 */
export function errorCode(err: unknown): string | undefined {
    if (typeof err === 'object' && err !== null && 'code' in err) {
        const code = (err as { code: unknown }).code;
        return typeof code === 'string' ? code : undefined;
    }
    return undefined;
}
