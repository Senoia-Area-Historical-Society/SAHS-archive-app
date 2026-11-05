import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { ArrowRight, CheckCircle2, Circle, PartyPopper, X } from 'lucide-react';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useAppearance } from '../contexts/AppearanceContext';
import { buildGuideTasks, guideCardMode, guideStorageKey, type GuideFacts } from '../lib/gettingStarted';

interface StoredGuide {
    dismissed?: boolean;
    seenIncomplete?: boolean;
}

// Storage can be unavailable (private windows, blocked site data). The card then
// simply forgets being closed, which is better than the home page failing.
function readStored(key: string): StoredGuide {
    try {
        return JSON.parse(localStorage.getItem(key) || '{}') as StoredGuide;
    } catch {
        return {};
    }
}

function writeStored(key: string, value: StoredGuide) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // See readStored.
    }
}

/** The staff checklist on the home page. Renders nothing for anyone else. */
export function GettingStarted() {
    const { user, isSAHSUser, isAdmin, isSetupComplete } = useAuth();
    const { settings } = useAppearance();
    const [searchParams, setSearchParams] = useSearchParams();
    const email = user?.email ?? null;
    const eligible = Boolean(email && isSAHSUser && isSetupComplete);

    const [facts, setFacts] = useState<GuideFacts | null>(null);
    const [setupStamp, setSetupStamp] = useState<string | null>(null);
    const [stored, setStored] = useState<StoredGuide>({});
    const [requested, setRequested] = useState(false);

    useEffect(() => {
        if (!eligible || !email) {
            setFacts(null);
            return;
        }
        let cancelled = false;
        const firstOf = (name: string) => getDocs(query(collection(db, name), limit(1)));

        Promise.all([
            // A curator joining an established archive still has their own first
            // item to add, so theirs is checked per person and an admin's is not.
            isAdmin
                ? firstOf('archive_items')
                : getDocs(query(collection(db, 'archive_items'), where('uploaded_by_email', '==', email), limit(1))),
            firstOf('collections'),
            firstOf('locations'),
            // Two is enough: at most one of them can be this user.
            isAdmin ? getDocs(query(collection(db, 'user_roles'), limit(2))) : null,
            getDoc(doc(db, 'site_settings', 'setup')),
        ]).then(([items, collections, locations, roles, setup]) => {
            if (cancelled) return;
            const stamp = (setup.data()?.completedAt as string | undefined) ?? null;
            setSetupStamp(stamp);
            setStored(readStored(guideStorageKey(email, stamp)));
            setFacts({
                hasItem: !items.empty,
                hasCollection: !collections.empty,
                hasLocation: !locations.empty,
                hasColleague: roles?.docs.some((d) => d.id.toLowerCase() !== email.toLowerCase()) ?? false,
            });
        }).catch((err) => {
            // No card rather than a card claiming nothing has been done.
            console.error('Could not load the Getting Started checklist:', err);
            if (!cancelled) setFacts(null);
        });

        return () => {
            cancelled = true;
        };
    }, [eligible, email, isAdmin]);

    // The sidebar's Getting Started link arrives as /?guide=open.
    useEffect(() => {
        if (searchParams.get('guide') !== 'open') return;
        setRequested(true);
        const next = new URLSearchParams(searchParams);
        next.delete('guide');
        setSearchParams(next, { replace: true });
    }, [searchParams, setSearchParams]);

    const tasks = useMemo(
        () => facts && buildGuideTasks(facts, {
            isAdmin,
            collectionsEnabled: settings.featureToggles?.enableCollections !== false,
        }),
        [facts, isAdmin, settings.featureToggles?.enableCollections],
    );

    const doneCount = tasks?.filter((t) => t.done).length ?? 0;
    const allDone = tasks !== null && doneCount === tasks.length;
    const mode = guideCardMode({
        allDone,
        dismissed: Boolean(stored.dismissed),
        seenIncomplete: Boolean(stored.seenIncomplete),
        requested,
    });

    const update = (change: StoredGuide) => {
        if (!email) return;
        const next = { ...stored, ...change };
        setStored(next);
        writeStored(guideStorageKey(email, setupStamp), next);
    };

    const shown = Boolean(tasks && email);

    useEffect(() => {
        if (!shown) return;
        // Remembered, so that finishing the last task can be acknowledged afterwards.
        if (mode === 'progress' && !stored.seenIncomplete) update({ seenIncomplete: true });
        // Reopening undoes the close for good: `requested` ends when the user leaves
        // this page, and each task's link takes them away from it.
        if (requested && stored.dismissed) update({ dismissed: false });
        // eslint-disable-next-line react-hooks/exhaustive-deps -- update only closes over what is listed
    }, [shown, mode, requested, stored.seenIncomplete, stored.dismissed]);

    if (!tasks || !email || mode === 'hidden') return null;

    const close = () => {
        setRequested(false);
        update({ dismissed: true });
    };

    if (mode === 'complete') {
        return (
            <section aria-label="Getting started" className="bg-white border-b border-tan-light/50 px-6 py-6 md:px-10">
                <div className="max-w-4xl mx-auto flex items-start gap-4">
                    <PartyPopper className="text-tan shrink-0 mt-1" size={28} aria-hidden="true" />
                    <div className="flex-1">
                        <h2 className="font-serif text-2xl font-bold text-charcoal">Your archive is off to a good start</h2>
                        <p className="text-charcoal/70 mt-1">
                            All the first steps are done. Getting Started stays in the sidebar under Workspace if you want it again.
                        </p>
                    </div>
                    <button
                        onClick={close}
                        className="bg-tan text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-tan-dark transition-colors shrink-0"
                    >
                        Done
                    </button>
                </div>
            </section>
        );
    }

    const nextTask = tasks.find((t) => !t.done);

    return (
        <section aria-labelledby="getting-started-title" className="bg-white border-b border-tan-light/50 px-6 py-8 md:px-10">
            <div className="max-w-4xl mx-auto">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 id="getting-started-title" className="font-serif text-2xl md:text-3xl font-bold text-charcoal">
                            Getting started
                        </h2>
                        <p className="text-charcoal/70 mt-1">
                            {isAdmin
                                ? `A few first steps to bring ${settings.museumName} to life.`
                                : `Welcome to ${settings.museumName}. Here is where to begin.`}
                        </p>
                    </div>
                    <button
                        onClick={close}
                        className="p-2 -mr-2 text-charcoal/50 hover:text-charcoal hover:bg-black/5 rounded-lg transition-colors"
                        aria-label="Close Getting Started. You can reopen it from the sidebar."
                        title="Close. You can reopen it from the sidebar."
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="flex items-center gap-3 mt-5">
                    <div
                        role="progressbar"
                        aria-label="First steps completed"
                        aria-valuemin={0}
                        aria-valuemax={tasks.length}
                        aria-valuenow={doneCount}
                        className="flex-1 h-2 bg-tan/15 rounded-full overflow-hidden"
                    >
                        <div className="h-full bg-tan transition-all" style={{ width: `${(doneCount / tasks.length) * 100}%` }} />
                    </div>
                    <span className="text-sm font-semibold text-charcoal/70 whitespace-nowrap">
                        {doneCount} of {tasks.length} done
                    </span>
                </div>

                <ul className="mt-5 divide-y divide-tan-light/40">
                    {tasks.map((task) => {
                        const isNext = task.id === nextTask?.id;
                        return (
                            <li key={task.id} className="flex flex-col sm:flex-row sm:items-center gap-3 py-4">
                                <div className="flex items-start gap-3 flex-1 min-w-0">
                                    {task.done ? (
                                        <CheckCircle2 className="text-emerald-600 shrink-0 mt-0.5" size={22} aria-hidden="true" />
                                    ) : (
                                        <Circle className="text-tan/50 shrink-0 mt-0.5" size={22} aria-hidden="true" />
                                    )}
                                    <div className="min-w-0">
                                        <h3 className={`font-semibold ${task.done ? 'text-charcoal/60' : 'text-charcoal'}`}>
                                            {task.title}
                                            {task.done && <span className="sr-only"> (done)</span>}
                                        </h3>
                                        <p className="text-sm text-charcoal/60">{task.description}</p>
                                    </div>
                                </div>
                                <Link
                                    to={task.to}
                                    className={
                                        isNext
                                            ? 'ml-9 sm:ml-0 inline-flex items-center justify-center gap-2 bg-tan text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-tan-dark transition-colors whitespace-nowrap self-start sm:self-auto'
                                            : 'ml-9 sm:ml-0 inline-flex items-center justify-center gap-2 border border-tan-light text-charcoal/80 px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-tan/5 transition-colors whitespace-nowrap self-start sm:self-auto'
                                    }
                                >
                                    {task.actionLabel}
                                    {isNext && <ArrowRight size={16} aria-hidden="true" />}
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </div>
        </section>
    );
}
