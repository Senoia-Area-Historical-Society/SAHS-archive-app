import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Play, Pause, Mic, Search, Calendar, ArrowRight, Info, Sparkles, MessageSquare, Edit2, Plus, Lock, Upload } from 'lucide-react';
import { db, storage } from '../lib/firebase';
import { collection, getDocs, query, where, addDoc, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import type { ArchiveItem } from '../types/database';
import { useAuth } from '../contexts/AuthContext';
import { useAppearance } from '../contexts/AppearanceContext';
import { EditableText } from '../components/EditableText';

// Premium Curated Mock Stories for a spectacular initial experience
const MOCK_STORIES: ArchiveItem[] = [
    {
        id: 'mock-story-1',
        item_type: 'Oral History',
        title: 'Living Through the Senoia Boom',
        description: 'Mildred Sibley (Age 94) shares her rich memories of growing up in Senoia during the 1930s, witnessing the agricultural changes, and seeing Main Street transform over nearly a century.',
        narrator_id: 'mildred-sibley',
        interviewer: 'Jane Nolan',
        interview_date: '2026-04-12',
        audio_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', // Premium copyright-free playable stream
        youtube_video_id: 'dQw4w9WgXcQ', // Playable placeholder video
        transcript: 'Mildred Sibley: I remember when Main Street was just dirt. In the summers, the dust would rise up so high you could barely see the storefronts across the way. We used to walk down to the depot just to watch the steam trains roll in from Atlanta.\nJane Nolan: That must have been quite a sight. How did the town feel back then?\nMildred Sibley: Oh, it was a quiet place, but warm. Everyone knew their neighbors, and on Saturdays, families from all around the county would ride in to buy supplies. We had everything we needed right here.',
        file_urls: ['https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=400'], // Unsplash elegant portrait
        tags: ['Depot', '1930s', 'Main Street', 'Agriculture'],
        created_at: new Date().toISOString()
    },
    {
        id: 'mock-story-2',
        item_type: 'Oral History',
        title: 'Tales of a Fourth-Generation Farmer',
        description: "Robert 'Bobby' Carter (Age 86) recounts the challenges and triumphs of farming cotton and peaches in Coweta County, the impact of the old railroad line, and the changes in land ownership.",
        narrator_id: 'bobby-carter',
        interviewer: 'Mark Henderson',
        interview_date: '2026-05-05',
        audio_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
        transcript: "Robert 'Bobby' Carter: Farming was in our blood. My great-grandfather came here in the late 1800s, and we worked the same clay ever since. When the boll weevil hit, it nearly wiped us out, but we adapted.\nMark Henderson: What role did the railroad play in your farming operations?\nRobert 'Bobby' Carter: It was our lifeline. Before the highways, we loaded the train cars right behind the station. You'd see mounds of watermelons and crates of peaches stacked ten feet high, all heading north.",
        file_urls: ['https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=400'],
        tags: ['Railroad', 'Farming', 'Coweta County', 'Cotton'],
        created_at: new Date().toISOString()
    },
    {
        id: 'mock-story-3',
        item_type: 'Oral History',
        title: 'Main Street Memories: The Merchant\'s Life',
        description: 'Sarah Jenkins (Age 79) details running the historic dry goods store on Main Street, serving local families, and surviving the economic shifts of the mid-20th century.',
        narrator_id: 'sarah-jenkins',
        interviewer: 'Jane Nolan',
        interview_date: '2026-03-20',
        audio_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
        transcript: "Sarah Jenkins: My parents opened the shop in 1948. We sold fabrics, hardware, schoolbooks, and the best peppermint candies in Georgia. You didn't just sell goods; you listened to people's lives.\nJane Nolan: What changes stand out most to you today?\nSarah Jenkins: The preservation. It makes me so happy to see the old brick buildings being cared for today. The shopfront looks almost exactly as it did when I was a girl, even if the signs have changed.",
        file_urls: ['https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=400'],
        tags: ['Main Street', 'Commerce', '1950s', 'Community'],
        created_at: new Date().toISOString()
    }
];

export function SenoiaStories() {
    const { isSAHSUser, realIsAdmin } = useAuth();
    const { settings, isAppearanceEditMode, updateContentBlock } = useAppearance();
    const storiesLogoUrl = settings.contentBlocks?.storiesLogoUrl || '';
    const [logoUploading, setLogoUploading] = useState(false);

    if (settings.featureToggles?.enableOralHistories === false) {
        return (
            <div className="flex-1 p-8 font-sans text-center flex flex-col justify-center items-center min-h-[400px]">
                <h1 className="text-3xl font-serif font-bold text-charcoal mb-4">Module Disabled</h1>
                <p className="text-charcoal/60 max-w-md">The Oral Histories module is not active for this archive site.</p>
            </div>
        );
    }

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setLogoUploading(true);
        try {
            const storageRef = ref(storage, `site_assets/stories_logo_${Date.now()}`);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);
            await updateContentBlock('storiesLogoUrl', url);
        } catch (err) {
            console.error('Failed to upload Senoia Stories logo:', err);
            alert('Upload failed. Please try again.');
        } finally {
            setLogoUploading(false);
        }
    };
    const [dbStories, setDbStories] = useState<ArchiveItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [playingStoryId, setPlayingStoryId] = useState<string | null>(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Fetch Oral Histories from Firestore with a real-time listener
    useEffect(() => {
        const q = query(
            collection(db, 'archive_items'),
            where('item_type', '==', 'Oral History')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetched = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data()
            } as ArchiveItem));

            // Sort by creation date, newest first
            fetched.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            setDbStories(fetched);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching oral histories:", error);
            setLoading(false);
        });

        // Clean up listener when the component unmounts
        return () => unsubscribe();
    }, []);

    // Auto-seed mock stories to Firestore if database is empty and curator is logged in
    useEffect(() => {
        const seedMockStories = async () => {
            if (isSAHSUser && dbStories.length === 0 && !loading) {
                try {
                    for (const story of MOCK_STORIES) {
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        const { id, ...storyData } = story;
                        await addDoc(collection(db, 'archive_items'), {
                            ...storyData,
                            created_at: new Date().toISOString(),
                            uploaded_by_email: 'admin@senoiahistory.com',
                            uploaded_by_name: 'SAHS Curator'
                        });
                    }
                    
                    // Refetch
                    const q = query(
                        collection(db, 'archive_items'),
                        where('item_type', '==', 'Oral History')
                    );
                    const snapshot = await getDocs(q);
                    const fetched = snapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    } as ArchiveItem));
                    fetched.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                    setDbStories(fetched);
                } catch (err) {
                    console.error("Failed to seed mock stories to Firestore:", err);
                }
            }
        };

        seedMockStories();
    }, [isSAHSUser, dbStories.length, loading]);


    const hasPublicInterviews = useMemo(() => {
        return dbStories.some(story => !story.is_private);
    }, [dbStories]);

    // Only show mock stories when Firestore has no oral histories at all.
    // Per-title deduplication caused deleted stories to re-appear as their mock twin.
    // Private stories are filtered out for public users.
    const allStories = useMemo(() => {
        if (isSAHSUser) {
            return dbStories.length > 0 ? dbStories : MOCK_STORIES;
        }
        return dbStories.filter(story => !story.is_private);
    }, [dbStories, isSAHSUser]);


    // Handle Inline Playback
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const onTimeUpdate = () => setCurrentTime(audio.currentTime);
        const onLoadedMetadata = () => setDuration(audio.duration);
        const onPlay = () => setIsPlaying(true);
        const onPause = () => setIsPlaying(false);
        const onEnded = () => {
            setPlayingStoryId(null);
            setIsPlaying(false);
            setCurrentTime(0);
        };

        audio.addEventListener('timeupdate', onTimeUpdate);
        audio.addEventListener('loadedmetadata', onLoadedMetadata);
        audio.addEventListener('play', onPlay);
        audio.addEventListener('pause', onPause);
        audio.addEventListener('ended', onEnded);

        return () => {
            audio.removeEventListener('timeupdate', onTimeUpdate);
            audio.removeEventListener('loadedmetadata', onLoadedMetadata);
            audio.removeEventListener('play', onPlay);
            audio.removeEventListener('pause', onPause);
            audio.removeEventListener('ended', onEnded);
        };
    }, [playingStoryId]);

    const handlePlayStory = (story: ArchiveItem) => {
        if (!story.audio_url) return;

        if (playingStoryId === story.id) {
            if (audioRef.current?.paused) {
                audioRef.current.play().catch(err => console.error("Error playing audio", err));
            } else {
                audioRef.current?.pause();
                // We keep playingStoryId set to show progress paused, or we can toggle playing class
            }
            // Trigger state change to force rerender
            setCurrentTime(audioRef.current?.currentTime || 0);
        } else {
            setPlayingStoryId(story.id);
            setCurrentTime(0);
            setDuration(0);
            
            setTimeout(() => {
                if (audioRef.current) {
                    audioRef.current.play().catch(err => console.error("Error playing audio", err));
                }
            }, 50);
        }
    };

    // Filter Stories based on Search Query
    const filteredStories = useMemo(() => {
        if (!searchQuery.trim()) return allStories;
        const lowerQuery = searchQuery.toLowerCase();
        return allStories.filter(story => 
            story.title.toLowerCase().includes(lowerQuery) ||
            story.description.toLowerCase().includes(lowerQuery) ||
            story.interviewer?.toLowerCase().includes(lowerQuery) ||
            story.transcript?.toLowerCase().includes(lowerQuery) ||
            story.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
        );
    }, [allStories, searchQuery]);

    // Currently playing story object
    const playingStory = useMemo(() => {
        return allStories.find(s => s.id === playingStoryId);
    }, [allStories, playingStoryId]);

    const formatTime = (seconds: number) => {
        if (isNaN(seconds)) return "0:00";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    return (
        <div className="space-y-12 pb-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* Audio Ref */}
            {playingStory?.audio_url && (
                <audio ref={audioRef} src={playingStory.audio_url} preload="metadata" />
            )}

            {/* Bespoke Premium Dark-Mode Hero Header */}
            <div className="relative rounded-3xl overflow-hidden bg-charcoal text-cream shadow-2xl border border-white/10 p-6 sm:p-10 lg:p-16 flex flex-col lg:flex-row items-center gap-10 lg:gap-12">
                {/* Glowing backdrop meshes */}
                <div className="absolute -top-32 -left-32 w-96 h-96 bg-tan/20 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-amber-700/10 rounded-full blur-3xl pointer-events-none" />

                {/* Hero Left Content */}
                <div className="flex-1 space-y-6 relative z-10 text-center lg:text-left">
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-tan/10 rounded-full border border-tan/30 text-tan text-xs font-bold uppercase tracking-widest font-sans">
                        <Sparkles size={14} className="animate-spin" style={{ animationDuration: '3s' }} /> Featured Community Project
                    </div>
                    
                    <h1 className="text-4xl sm:text-5xl lg:text-7xl font-serif font-bold leading-tight tracking-tight text-white">
                        <EditableText
                            textKey="storiesTitle"
                            defaultText="Senoia Stories"
                            containerType="span"
                            className=""
                        />
                    </h1>
                    
                    <EditableText
                        textKey="storiesDesc"
                        defaultText="A collection of oral history interviews dedicated to preserving the voices, memories, and personal histories that shaped the Senoia Area community over the decades."
                        multiline={true}
                        containerType="p"
                        className="text-base sm:text-lg text-cream font-sans max-w-xl leading-relaxed opacity-70"
                    />

                    {allStories.length > 0 && (
                        <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 sm:gap-6 pt-4 text-sm font-sans text-cream opacity-50">
                            <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2 rounded-full">
                                <Mic size={16} className="text-tan" />
                                <span>{allStories.length} Voices Recorded</span>
                            </div>
                            <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2 rounded-full">
                                <MessageSquare size={16} className="text-tan" />
                                <span>Full Searchable Transcripts</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Hero Right Content: Logo */}
                <div className="w-full lg:w-auto shrink-0 relative z-10 flex flex-col justify-center lg:justify-end items-center gap-3 animate-in fade-in duration-1000">
                    <div className="relative group bg-white rounded-3xl p-5 border border-white/20 shadow-2xl flex items-center justify-center overflow-hidden">
                        <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                        <img 
                            src={storiesLogoUrl || "/senoia_stories_logo.png"} 
                            alt="Senoia Stories Logo" 
                            className="h-32 sm:h-40 lg:h-44 w-auto object-contain opacity-95 transition-all duration-300 transform group-hover:scale-105"
                        />
                    </div>
                    {realIsAdmin && isAppearanceEditMode && (
                        <label className="cursor-pointer flex items-center gap-2 text-xs font-bold text-tan border border-tan/30 bg-tan/10 hover:bg-tan/20 px-3 py-1.5 rounded-full transition-all">
                            {logoUploading ? 'Uploading...' : <><Upload size={12} /> Change Logo</>}
                            <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={logoUploading} />
                        </label>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center items-center py-20">
                    <div className="w-12 h-12 border-4 border-tan/20 border-t-tan rounded-full animate-spin"></div>
                </div>
            ) : !isSAHSUser && !hasPublicInterviews ? (
                <div className="relative overflow-hidden bg-white/40 backdrop-blur-md rounded-3xl border border-tan-light/30 p-12 text-center max-w-2xl mx-auto shadow-2xl space-y-6 animate-in fade-in zoom-in duration-700">
                    <div className="absolute -top-12 -left-12 w-48 h-48 bg-tan/10 rounded-full blur-2xl pointer-events-none" />
                    <div className="absolute -bottom-12 -right-12 w-48 h-48 bg-amber-700/5 rounded-full blur-2xl pointer-events-none" />
                    
                    <div className="w-20 h-20 bg-tan/10 text-tan rounded-full flex items-center justify-center mx-auto shadow-inner relative z-10 animate-pulse" style={{ animationDuration: '4s' }}>
                        <Mic size={36} />
                    </div>
                    
                    <div className="space-y-3 relative z-10">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-tan/10 text-tan text-xs font-bold uppercase tracking-widest rounded-full font-sans border border-tan/20">
                            Oral Histories
                        </span>
                        <h2 className="text-3xl sm:text-4xl font-serif font-bold text-charcoal">
                            Coming Soon
                        </h2>
                        <p className="text-base text-charcoal/70 font-sans max-w-md mx-auto leading-relaxed">
                            We are currently gathering, transcribing, and preserving the voices, memories, and personal histories of the residents who built and shaped the {settings.museumShortName || 'Senoia Area'} community over the decades. 
                        </p>
                        <p className="text-sm text-tan font-sans font-medium italic pt-2">
                            Check back soon to listen to our first published interviews.
                        </p>
                    </div>
                </div>
            ) : (
                <>
                    {/* Search and Filters Section */}
                    <div className="bg-white rounded-2xl border border-tan-light/40 p-6 shadow-xl flex flex-col lg:flex-row items-center justify-between gap-6">
                        <div className="space-y-1 text-center lg:text-left">
                            <h2 className="text-2xl font-serif font-bold text-charcoal">Browse the Histories</h2>
                            <p className="text-sm text-charcoal/60 font-sans">Search names, keywords, dates, or stories instantly.</p>
                        </div>

                        <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto shrink-0">
                            {/* Instant Search Bar */}
                            <div className="relative w-full sm:w-[280px] md:w-[320px]">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-charcoal/40" size={18} />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search Mildred, cotton, depot..."
                                    className="w-full bg-cream/30 border border-tan-light/50 pl-10 pr-4 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-tan/20 focus:border-tan/30 transition-all font-sans text-sm text-charcoal"
                                />
                            </div>

                            {isSAHSUser && (
                                <Link 
                                    to="/add-item?type=Oral History" 
                                    className="bg-tan hover:bg-charcoal text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-md hover:scale-[1.02] active:scale-[0.98] w-full sm:w-auto justify-center shrink-0"
                                >
                                    <Plus size={14} /> Add Interview
                                </Link>
                            )}
                        </div>
                    </div>

                    {/* List of Oral Histories */}
                    {filteredStories.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {filteredStories.map(story => {
                                const isCurrentPlaying = playingStoryId === story.id;
                                const isCurrentPlayingActive = isCurrentPlaying && isPlaying;
                                const portrait = story.file_urls && story.file_urls.length > 0 ? story.file_urls[0] : null;

                                return (
                                    <div 
                                        key={story.id} 
                                        className={`group relative bg-white rounded-3xl border transition-all duration-500 overflow-hidden flex flex-col h-full shadow-lg hover:shadow-2xl hover:-translate-y-1 ${
                                            isCurrentPlaying ? 'border-tan ring-1 ring-tan/30' : 'border-tan-light/40'
                                        }`}
                                    >
                                        {/* Portrait & Gradient Cover */}
                                        <div className="h-48 w-full relative bg-tan-light/20 overflow-hidden shrink-0">
                                            {portrait ? (
                                                <img 
                                                    src={portrait} 
                                                    alt={story.title} 
                                                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-tan/5 text-tan">
                                                    <Mic size={40} className="text-tan-light" />
                                                </div>
                                            )}

                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
                                            
                                            {/* Play Button Overlay on Portrait */}
                                            {story.audio_url && (
                                                <button 
                                                    onClick={() => handlePlayStory(story)}
                                                    className="absolute bottom-4 right-4 w-12 h-12 rounded-full bg-tan text-white flex items-center justify-center shadow-xl transition-all hover:bg-tan-light hover:scale-110 active:scale-95 z-20"
                                                    title={isCurrentPlayingActive ? "Pause Interview" : "Play Interview"}
                                                >
                                                    {isCurrentPlayingActive ? (
                                                        <Pause size={20} fill="currentColor" />
                                                    ) : (
                                                        <Play size={20} className="ml-0.5" fill="currentColor" />
                                                    )}
                                                </button>
                                            )}

                                            {/* Badges Container */}
                                            <div className="absolute top-4 left-4 flex gap-2 z-10">
                                                <div className="inline-flex items-center gap-1 px-2.5 py-1 bg-white/20 backdrop-blur-md text-white border border-white/20 rounded-full text-[10px] font-black uppercase tracking-wider font-sans">
                                                    <Mic size={10} /> Oral History
                                                </div>
                                                {story.is_private && isSAHSUser && (
                                                    <div className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-500 text-white rounded-full text-[10px] font-black uppercase tracking-wider font-sans shadow-sm">
                                                        <Lock size={10} /> Private
                                                    </div>
                                                )}
                                            </div>

                                            {/* Curator Edit Button Overlay */}
                                            {isSAHSUser && !story.id.startsWith('mock-') && (
                                                <Link 
                                                    to={`/edit-item/${story.id}`}
                                                    className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/20 backdrop-blur-md text-white border border-white/20 flex items-center justify-center shadow-lg transition-all hover:bg-tan hover:text-white hover:scale-105 active:scale-95 z-20"
                                                    title="Edit Oral History Record"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <Edit2 size={14} />
                                                </Link>
                                            )}
                                        </div>

                                        {/* Story Content Body */}
                                        <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                                            <div className="space-y-2">
                                                <h3 className="text-xl font-serif font-bold text-charcoal leading-snug group-hover:text-tan transition-colors">
                                                    <Link to={story.id.startsWith('mock-') ? '#' : `/items/${story.id}`}>
                                                        {story.title}
                                                    </Link>
                                                </h3>
                                                <p className="text-xs font-sans text-charcoal/50 flex flex-wrap items-center gap-x-4 gap-y-1">
                                                    {story.interviewer && (
                                                        <span>Interviewer: <span className="font-semibold text-charcoal">{story.interviewer}</span></span>
                                                    )}
                                                    {story.interview_date && (
                                                        <span className="flex items-center gap-1"><Calendar size={12} /> {new Date(story.interview_date).toLocaleDateString()}</span>
                                                    )}
                                                </p>
                                                <p className="text-sm text-charcoal/70 font-sans leading-relaxed line-clamp-3">
                                                    {story.description}
                                                </p>
                                            </div>

                                            {/* Inline Audio Playing Progress bar */}
                                            {isCurrentPlaying && story.audio_url && (
                                                <div className="bg-charcoal/5 rounded-xl p-3 border border-tan/10 animate-in slide-in-from-bottom-2 fade-in duration-300 space-y-2">
                                                    <div className="flex items-center justify-between text-[10px] font-mono text-charcoal/50">
                                                        <span>{formatTime(currentTime)}</span>
                                                        <div className="flex items-end gap-[2px] h-3">
                                                            {Array.from({ length: 12 }).map((_, idx) => {
                                                                const heights = [8, 12, 10, 6, 12, 8, 10, 6, 8, 12, 10, 6];
                                                                const h = heights[idx % heights.length];
                                                                return (
                                                                    <span 
                                                                        key={idx}
                                                                        className={`w-[2px] bg-tan rounded-full transition-all duration-300 ${isPlaying ? 'animate-wave' : ''}`}
                                                                        style={{
                                                                            height: isPlaying ? `${h}px` : '3px',
                                                                            animationDelay: `${idx * 0.08}s`
                                                                        }}
                                                                    />
                                                                );
                                                            })}
                                                        </div>
                                                        <span>{formatTime(duration)}</span>
                                                    </div>
                                                    
                                                    <div className="w-full bg-charcoal/10 h-1 rounded-full overflow-hidden">
                                                        <div 
                                                            className="bg-tan h-full transition-all duration-300"
                                                            style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            )}

                                            {/* Bottom Action Footer */}
                                            <div className="pt-4 border-t border-tan-light/10 flex items-center justify-between">
                                                <div className="flex gap-1.5 overflow-hidden max-w-[65%] shrink-0">
                                                    {story.tags.slice(0, 2).map((tag, idx) => (
                                                        <span key={idx} className="px-2 py-0.5 bg-cream text-charcoal/60 rounded text-[9px] font-bold uppercase tracking-wider font-sans truncate">
                                                            #{tag}
                                                        </span>
                                                    ))}
                                                </div>

                                                {story.id.startsWith('mock-') ? (
                                                    <span className="text-xs font-sans text-charcoal/30 flex items-center gap-1 select-none">
                                                        Mock Experience
                                                    </span>
                                                ) : (
                                                    <Link 
                                                        to={`/items/${story.id}`}
                                                        className="text-xs font-bold text-tan hover:text-charcoal flex items-center gap-1 group/btn font-sans"
                                                    >
                                                        Full Record <ArrowRight size={14} className="transition-transform group-hover/btn:translate-x-1" />
                                                    </Link>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="text-center py-20 bg-white rounded-3xl border border-tan-light/40 shadow-xl max-w-xl mx-auto space-y-4">
                            <Info className="text-tan mx-auto" size={48} />
                            <h3 className="text-2xl font-serif font-bold text-charcoal">No Stories Found</h3>
                            <p className="text-sm text-charcoal/60 font-sans max-w-sm mx-auto">
                                We couldn't find any oral histories matching your search terms. Try searching another keyword or speaker name.
                            </p>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
