/**
 * What the staff Getting Started card shows. Everything here is decided from facts
 * about the archive rather than from what the user clicked, so a task ticks itself
 * off however the work was done, and an established archive never sees the card.
 */

export type GuideTaskId = 'branding' | 'item' | 'collection' | 'location' | 'colleague';

export interface GuideTask {
    id: GuideTaskId;
    title: string;
    description: string;
    actionLabel: string;
    to: string;
    done: boolean;
}

export interface GuideFacts {
    /** An admin: any item in the archive. A curator: one they added themselves. */
    hasItem: boolean;
    hasCollection: boolean;
    hasLocation: boolean;
    /** Someone other than this user holds a role. Only ever true for an admin's check. */
    hasColleague: boolean;
}

export interface GuideOptions {
    isAdmin: boolean;
    /** A museum that switched collections off must not be left with a task it can't do. */
    collectionsEnabled: boolean;
}

export function buildGuideTasks(facts: GuideFacts, { isAdmin, collectionsEnabled }: GuideOptions): GuideTask[] {
    const tasks: GuideTask[] = [];

    if (isAdmin) {
        tasks.push({
            id: 'branding',
            title: 'Make it yours',
            description: "Your museum's name and colors are set. You can change them or add a logo at any time.",
            actionLabel: 'Review',
            to: '/appearance',
            // App.tsx holds every signed-in user at /setup until setup is complete,
            // so anyone who can see this card has already done this.
            done: true,
        });
    }

    tasks.push({
        id: 'item',
        title: 'Add your first item',
        description: 'A photograph, document or object. Start with one you know well; you can keep it private until it is ready.',
        actionLabel: 'Add item',
        to: '/add-item',
        done: facts.hasItem,
    });

    if (collectionsEnabled) {
        tasks.push({
            id: 'collection',
            title: 'Create a collection',
            description: 'Group related items around a theme, family or event, so visitors can browse them together.',
            actionLabel: 'Create collection',
            to: '/add-collection',
            done: facts.hasCollection,
        });
    }

    tasks.push({
        id: 'location',
        title: 'Record where things are kept',
        description: "Add a room, shelf or box, so staff can find an item's physical home.",
        actionLabel: 'Add location',
        to: '/manage-locations',
        done: facts.hasLocation,
    });

    if (isAdmin) {
        tasks.push({
            id: 'colleague',
            title: 'Invite a colleague',
            description: 'Give a curator or another administrator access from Admin Settings.',
            actionLabel: 'Open Admin Settings',
            to: '/settings',
            done: facts.hasColleague,
        });
    }

    return tasks;
}

export type GuideCardMode = 'hidden' | 'progress' | 'complete';

export interface GuideCardState {
    allDone: boolean;
    /** The user closed the card. */
    dismissed: boolean;
    /** The user has seen unfinished tasks here, so finishing them deserves a word. */
    seenIncomplete: boolean;
    /** The user asked for the card from the sidebar. */
    requested: boolean;
}

export function guideCardMode({ allDone, dismissed, seenIncomplete, requested }: GuideCardState): GuideCardMode {
    if (requested) return allDone ? 'complete' : 'progress';
    if (dismissed) return 'hidden';
    if (!allDone) return 'progress';
    // All done and never seen unfinished is an archive that was already running
    // when this card arrived. Congratulating its staff would be noise.
    return seenIncomplete ? 'complete' : 'hidden';
}

/**
 * The setup timestamp is part of the key because erasing a demo archive
 * (`docker compose down -v`) leaves the browser's storage behind. Keyed on the
 * address alone, a card dismissed in one rehearsal would stay hidden in the next.
 */
export function guideStorageKey(email: string, setupCompletedAt: string | null | undefined): string {
    return `archive_getting_started_${setupCompletedAt || 'unknown'}_${email.toLowerCase()}`;
}
