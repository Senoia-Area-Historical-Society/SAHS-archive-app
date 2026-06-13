import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Check, ExternalLink, MessageSquare, Clock, User, ShieldAlert } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';

interface NotificationItem {
    id: string;
    type: string;
    itemId: string;
    itemTitle: string;
    authorName: string;
    authorEmail: string;
    commentText: string;
    createdAt: string;
    readBy: string[];
    parentId?: string | null;
}

export function Notifications() {
    const { user, isSAHSUser } = useAuth();
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        document.title = "Moderation Notifications | SAHS Digital Archive";
    }, []);

    // Subscribe to notifications collection in real-time
    useEffect(() => {
        if (!isSAHSUser) {
            setLoading(false);
            return;
        }

        const q = query(
            collection(db, 'notifications'),
            orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetched = snapshot.docs.map(docSnap => ({
                id: docSnap.id,
                ...docSnap.data()
            } as NotificationItem));
            setNotifications(fetched);
            setLoading(false);
        }, (error) => {
            console.error("Error subscribing to notifications:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [isSAHSUser]);

    const userEmail = user?.email?.toLowerCase() || '';

    // Split into read and unread for the current user
    const { unreadNotifications, readNotifications } = useMemo(() => {
        const unread: NotificationItem[] = [];
        const read: NotificationItem[] = [];

        notifications.forEach(notif => {
            const isRead = notif.readBy && notif.readBy.map(e => e.toLowerCase()).includes(userEmail);
            if (isRead) {
                read.push(notif);
            } else {
                unread.push(notif);
            }
        });

        return { unreadNotifications: unread, readNotifications: read };
    }, [notifications, userEmail]);

    const handleMarkAsRead = async (notificationId: string) => {
        if (!userEmail) return;
        try {
            const notifRef = doc(db, 'notifications', notificationId);
            await updateDoc(notifRef, {
                readBy: arrayUnion(userEmail)
            });
        } catch (err) {
            console.error("Failed to mark notification as read:", err);
        }
    };

    const handleMarkAllAsRead = async () => {
        if (!userEmail || unreadNotifications.length === 0) return;
        try {
            const promises = unreadNotifications.map(notif => {
                const notifRef = doc(db, 'notifications', notif.id);
                return updateDoc(notifRef, {
                    readBy: arrayUnion(userEmail)
                });
            });
            await Promise.all(promises);
        } catch (err) {
            console.error("Failed to mark all as read:", err);
        }
    };

    const formatTimestamp = (isoString: string) => {
        try {
            const date = new Date(isoString);
            if (isNaN(date.getTime())) return 'Some time ago';
            
            // Format options
            return date.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch {
            return 'Recently';
        }
    };

    if (!isSAHSUser) {
        return (
            <div className="max-w-md mx-auto py-16 px-6 text-center space-y-6">
                <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                    <ShieldAlert size={32} />
                </div>
                <h1 className="text-3xl font-serif font-bold text-charcoal">Access Denied</h1>
                <p className="text-charcoal/70 font-sans">
                    You must be a Senoia Area Historical Society curator or administrator to moderate comments.
                </p>
                <Link
                    to="/"
                    className="inline-block px-6 py-2.5 bg-tan hover:bg-charcoal text-white rounded-xl text-sm font-bold transition-all shadow-md"
                >
                    Return Home
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-10 pb-20 max-w-5xl mx-auto px-4 sm:px-6">
            {/* Header Section */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
                <div className="space-y-2">
                    <h1 className="text-4xl font-serif font-bold text-charcoal tracking-tight flex items-center gap-3">
                        <Bell className="text-tan" size={36} /> Moderation Notifications
                    </h1>
                    <p className="text-charcoal/60 font-sans">
                        Review and moderate comments posted by society members and volunteers on archival records.
                    </p>
                </div>

                {unreadNotifications.length > 0 && (
                    <button
                        onClick={handleMarkAllAsRead}
                        className="bg-white hover:bg-cream/40 text-charcoal border border-tan-light/50 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-sm hover:scale-[1.02] active:scale-[0.98] shrink-0"
                    >
                        <Check size={14} className="text-green-600" /> Mark All as Read
                    </button>
                )}
            </div>

            {loading ? (
                <div className="flex justify-center items-center py-20">
                    <div className="w-10 h-10 border-4 border-tan/20 border-t-tan rounded-full animate-spin"></div>
                </div>
            ) : notifications.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-3xl border border-tan-light/40 shadow-md max-w-xl mx-auto space-y-4">
                    <div className="w-16 h-16 bg-cream text-charcoal/40 rounded-full flex items-center justify-center mx-auto shadow-inner">
                        <Bell size={28} />
                    </div>
                    <h3 className="text-2xl font-serif font-bold text-charcoal">All Quiet Here</h3>
                    <p className="text-sm text-charcoal/60 font-sans max-w-sm mx-auto">
                        No comment notifications have been generated yet. When users post comments, they will appear here.
                    </p>
                </div>
            ) : (
                <div className="space-y-8">
                    {/* Unread Feed */}
                    {unreadNotifications.length > 0 && (
                        <div className="space-y-4">
                            <h2 className="text-xs font-black uppercase tracking-widest text-tan font-sans flex items-center gap-2">
                                New ({unreadNotifications.length})
                                <span className="h-2 w-2 rounded-full bg-tan animate-pulse" />
                            </h2>
                            <div className="grid gap-4">
                                {unreadNotifications.map((notif) => (
                                    <div
                                        key={notif.id}
                                        className="relative bg-white rounded-2xl border-2 border-tan/30 p-5 shadow-md hover:shadow-lg transition-all flex flex-col md:flex-row md:items-start justify-between gap-4"
                                    >
                                        <div className="space-y-3 flex-1">
                                            {/* Top info row */}
                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-sans text-charcoal/50">
                                                <span className="flex items-center gap-1 font-medium text-charcoal/80 bg-cream/70 px-2 py-0.5 rounded">
                                                    <User size={12} /> {notif.authorName}
                                                </span>
                                                <span className="truncate">({notif.authorEmail})</span>
                                                <span className="flex items-center gap-1"><Clock size={12} /> {formatTimestamp(notif.createdAt)}</span>
                                            </div>

                                            {/* Comment content */}
                                            <div className="bg-cream/20 border border-tan-light/20 p-3.5 rounded-xl flex items-start gap-3">
                                                <MessageSquare size={16} className="text-tan shrink-0 mt-1" />
                                                <p className="text-charcoal text-sm leading-relaxed whitespace-pre-line font-sans italic">
                                                    "{notif.commentText}"
                                                </p>
                                            </div>

                                            {/* Item Link */}
                                            <div className="text-xs font-sans">
                                                <span className="text-charcoal/50">On item: </span>
                                                <Link
                                                    to={`/items/${notif.itemId}`}
                                                    className="text-tan hover:text-charcoal font-medium inline-flex items-center gap-1 underline underline-offset-2 hover:no-underline"
                                                >
                                                    {notif.itemTitle} <ExternalLink size={12} />
                                                </Link>
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex md:flex-col items-center justify-end gap-2 shrink-0 self-end md:self-start">
                                            <button
                                                onClick={() => handleMarkAsRead(notif.id)}
                                                className="bg-tan/10 text-tan hover:bg-tan hover:text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1 w-full justify-center"
                                                title="Mark as read"
                                            >
                                                <Check size={14} /> Mark Read
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Read Feed */}
                    {readNotifications.length > 0 && (
                        <div className="space-y-4">
                            <h2 className="text-xs font-black uppercase tracking-widest text-charcoal/40 font-sans">
                                Earlier ({readNotifications.length})
                            </h2>
                            <div className="grid gap-4">
                                {readNotifications.map((notif) => (
                                    <div
                                        key={notif.id}
                                        className="bg-white/60 opacity-75 rounded-2xl border border-tan-light/30 p-5 shadow-sm flex flex-col md:flex-row md:items-start justify-between gap-4"
                                    >
                                        <div className="space-y-3 flex-1">
                                            {/* Top info row */}
                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-sans text-charcoal/40">
                                                <span className="flex items-center gap-1 font-medium text-charcoal/70 bg-cream/30 px-2 py-0.5 rounded">
                                                    <User size={12} /> {notif.authorName}
                                                </span>
                                                <span className="truncate">({notif.authorEmail})</span>
                                                <span className="flex items-center gap-1"><Clock size={12} /> {formatTimestamp(notif.createdAt)}</span>
                                            </div>

                                            {/* Comment content */}
                                            <div className="bg-cream/10 border border-tan-light/10 p-3 rounded-xl flex items-start gap-3">
                                                <MessageSquare size={16} className="text-charcoal/30 shrink-0 mt-1" />
                                                <p className="text-charcoal/60 text-sm leading-relaxed whitespace-pre-line font-sans italic">
                                                    "{notif.commentText}"
                                                </p>
                                            </div>

                                            {/* Item Link */}
                                            <div className="text-xs font-sans">
                                                <span className="text-charcoal/45">On item: </span>
                                                <Link
                                                    to={`/items/${notif.itemId}`}
                                                    className="text-tan/75 hover:text-charcoal font-medium inline-flex items-center gap-1 underline underline-offset-2 hover:no-underline"
                                                >
                                                    {notif.itemTitle} <ExternalLink size={12} />
                                                </Link>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
