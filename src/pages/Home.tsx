import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Library, Users, FileText, Building, Box, Linkedin, Instagram, Facebook, Youtube, Share2, BookOpen } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useAppearance } from '../contexts/AppearanceContext';
import { EditableText } from '../components/EditableText';

interface SpotlightConfig {
  enabled: boolean;
  name: string;
  role: string;
  bio: string;
  linkedInUrl?: string;
  imageUrl: string;
}

const BACKGROUND_IMAGES = [
    "/home-pharmacy.jpg",
    "/home-street-view.jpg",
    "/home-old-main.png",
    "/home-industrial.jpg"
];

export function Home() {
    const { settings } = useAppearance();
    const backgroundImagesList = settings.backgroundImages && settings.backgroundImages.length > 0
        ? settings.backgroundImages
        : BACKGROUND_IMAGES;

    const [currentSlide, setCurrentSlide] = useState(0);
    const [spotlight, setSpotlight] = useState<SpotlightConfig | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [copied, setCopied] = useState(false);
    const navigate = useNavigate();
    
    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(settings.contentBlocks?.qrValue || 'https://sahs-archives.web.app');
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy: ', err);
        }
    };

    useEffect(() => {
        document.title = "Home | SAHS Digital Archive";
        const timer = setInterval(() => {
            setCurrentSlide((prev) => (prev + 1) % backgroundImagesList.length);
        }, 15000); // 15 seconds for a calmer, less distracting transition

        const fetchSpotlight = async () => {
            try {
                const snap = await getDoc(doc(db, 'site_settings', 'intern_spotlight'));
                if (snap.exists()) {
                    setSpotlight(snap.data() as SpotlightConfig);
                }
            } catch (e) {
                console.error("Failed to load spotlight configuration", e);
            }
        };
        fetchSpotlight();

        return () => clearInterval(timer);
    }, []);

    return (
        <div className="w-full h-full flex flex-col font-sans">
            {/* Hero Section */}
            <div className="relative w-full min-h-screen flex flex-col justify-center items-center text-center p-8 overflow-hidden">
                 {backgroundImagesList.map((img, index) => (
                    <div
                        key={index}
                        className={`absolute inset-0 z-0 bg-cover bg-center transition-opacity duration-1000 ease-in-out ${index === currentSlide ? 'opacity-100' : 'opacity-0'
                            }`}
                        style={{ backgroundImage: `url("${img}")` }}
                    />
                ))}
                {/* Theme-colored overlay to improve text readability while keeping slides visible */}
                <div className="absolute inset-0 z-0 bg-charcoal opacity-60 backdrop-blur-[1.5px]"></div>
 
                {/* Hero Content */}
                <div className="relative z-10 max-w-5xl mx-auto text-cream">
                    <EditableText
                        textKey="heroTitle"
                        defaultText={settings.heroTitle}
                        multiline={true}
                        containerType="h1"
                        className="text-6xl md:text-8xl font-serif font-bold tracking-tight mb-6 text-white drop-shadow-md whitespace-pre-line"
                    />
                    <EditableText
                        textKey="heroSubtitle"
                        defaultText={settings.heroSubtitle}
                        containerType="p"
                        className="text-2xl md:text-3xl font-serif italic text-beige mb-12 drop-shadow"
                    />

                    <EditableText
                        textKey="homeIntro"
                        defaultText="Explore our digital archive of historical documents, photographs, and stories that chronicle the heritage of the Senoia area."
                        multiline={true}
                        containerType="p"
                        className="text-lg md:text-xl text-cream/90 max-w-3xl mx-auto leading-relaxed mb-16 font-medium"
                    />

                    <div className="max-w-2xl mx-auto mb-12">
                        <form 
                            onSubmit={(e) => {
                                e.preventDefault();
                                if (searchQuery.trim()) {
                                    navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
                                }
                            }}
                            className="relative group"
                        >
                            <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-tan transition-colors group-focus-within:text-charcoal" size={28} />
                            <input 
                                type="text"
                                placeholder="Search the archives..."
                                className="w-full bg-cream/95 backdrop-blur-sm pl-16 pr-32 py-6 rounded-2xl border-4 border-transparent focus:border-tan outline-none transition-all font-sans text-charcoal text-2xl shadow-2xl placeholder:text-charcoal/40"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            <button 
                                type="submit"
                                className="absolute right-4 top-1/2 -translate-y-1/2 bg-tan text-white px-6 py-3 rounded-xl font-bold hover:bg-tan-dark transition-colors shadow-lg"
                            >
                                Search
                            </button>
                        </form>
                    </div>

                    <div className="flex flex-col sm:flex-row flex-wrap gap-6 justify-center items-center mt-8">
                        <Link
                            to="/archive?type=Document"
                            className="flex items-center gap-3 bg-cream/20 backdrop-blur-md text-white border border-white/30 px-8 py-4 rounded-xl font-bold text-lg hover:bg-white hover:text-charcoal transition-all shadow-lg"
                        >
                            <Library size={24} />
                            Browse Documents
                        </Link>
                        <Link
                            to="/archive?type=Historic Figure"
                            className="flex items-center gap-3 bg-cream/20 backdrop-blur-md text-white border border-white/30 px-8 py-4 rounded-xl font-bold text-lg hover:bg-white hover:text-charcoal transition-all shadow-lg"
                        >
                            <Users size={24} />
                            View Figures
                        </Link>
                        <Link
                            to="/archive?type=Historic Organization"
                            className="flex items-center gap-3 bg-cream/20 backdrop-blur-md text-white border border-white/30 px-8 py-4 rounded-xl font-bold text-lg hover:bg-white hover:text-charcoal transition-all shadow-lg"
                        >
                            <Building size={24} />
                            View Orgs
                        </Link>
                        <Link
                            to="/archive?type=Artifact"
                            className="flex items-center gap-3 bg-cream/20 backdrop-blur-md text-white border border-white/30 px-8 py-4 rounded-xl font-bold text-lg hover:bg-white hover:text-charcoal transition-all shadow-lg"
                        >
                            <Box size={24} />
                            View Artifacts
                        </Link>
                        {settings.featureToggles?.enableLibrary !== false && (
                            <Link
                                to="/library"
                                className="flex items-center gap-3 bg-cream/20 backdrop-blur-md text-white border border-white/30 px-8 py-4 rounded-xl font-bold text-lg hover:bg-white hover:text-charcoal transition-all shadow-lg"
                            >
                                <BookOpen size={24} />
                                Book Library
                            </Link>
                        )}
                    </div>
                </div>
            </div>

            {/* Explore Section */}
            <div className="bg-cream py-24 px-8 border-t border-tan-light/50">
                <div className="max-w-6xl mx-auto text-center">
                    <EditableText
                        textKey="exploreTitle"
                        defaultText="Explore Our Archives"
                        containerType="h2"
                        className="text-4xl md:text-5xl font-serif font-bold text-charcoal mb-4"
                    />
                    <EditableText
                        textKey="exploreSubtitle"
                        defaultText="Discover the stories, people, and events that shaped our community"
                        containerType="p"
                        className="text-xl md:text-2xl text-charcoal-light font-medium mb-16 max-w-3xl mx-auto leading-relaxed"
                    />

                    <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-12 text-left">
                        <div className="bg-white p-8 rounded-2xl border border-tan-light shadow-sm hover:shadow-md transition-shadow md:col-span-2 lg:col-span-2">
                            <div className="w-12 h-12 bg-tan-light/30 text-tan rounded-xl flex items-center justify-center mb-6">
                                <FileText size={28} />
                            </div>
                            <EditableText
                                textKey="exploreDocTitle"
                                defaultText="Historical Documents"
                                containerType="h3"
                                className="text-2xl font-serif font-bold text-charcoal mb-4"
                            />
                            <EditableText
                                textKey="exploreDocDesc"
                                defaultText="Dive into primary sources including letters, ledgers, meeting minutes, and local government records. These documents offer a firsthand look at the daily life, governance, and development of Senoia throughout the decades."
                                multiline={true}
                                containerType="p"
                                className="text-charcoal-light leading-relaxed"
                            />
                        </div>

                        <div className="bg-white p-8 rounded-2xl border border-tan-light shadow-sm hover:shadow-md transition-shadow md:col-span-2 lg:col-span-2">
                            <div className="w-12 h-12 bg-tan-light/30 text-tan rounded-xl flex items-center justify-center mb-6">
                                <Users size={28} />
                            </div>
                            <EditableText
                                textKey="exploreFigTitle"
                                defaultText="Historic Figures"
                                containerType="h3"
                                className="text-2xl font-serif font-bold text-charcoal mb-4"
                            />
                            <EditableText
                                textKey="exploreFigDesc"
                                defaultText="Read about the individuals who have left a lasting impact on our community. Discover the history behind the names of local landmarks and the pioneers who built Senoia."
                                multiline={true}
                                containerType="p"
                                className="text-charcoal-light leading-relaxed"
                            />
                        </div>

                        <div className="bg-white p-8 rounded-2xl border border-tan-light shadow-sm hover:shadow-md transition-shadow md:col-span-2 lg:col-span-2">
                            <div className="w-12 h-12 bg-tan-light/30 text-tan rounded-xl flex items-center justify-center mb-6">
                                <Building size={28} />
                            </div>
                            <EditableText
                                textKey="exploreOrgTitle"
                                defaultText="Historic Organizations"
                                containerType="h3"
                                className="text-2xl font-serif font-bold text-charcoal mb-4"
                            />
                            <EditableText
                                textKey="exploreOrgDesc"
                                defaultText="Explore the history of local businesses, churches, schools, and civic groups that have served as the foundation of our community's social and economic life."
                                multiline={true}
                                containerType="p"
                                className="text-charcoal-light leading-relaxed"
                            />
                        </div>

                        <div className="bg-white p-8 rounded-2xl border border-tan-light shadow-sm hover:shadow-md transition-shadow md:col-span-2 lg:col-span-2 lg:col-start-2">
                            <div className="w-12 h-12 bg-tan-light/30 text-tan rounded-xl flex items-center justify-center mb-6">
                                <Box size={28} />
                            </div>
                            <EditableText
                                textKey="exploreArtTitle"
                                defaultText="Artifact Collection"
                                containerType="h3"
                                className="text-2xl font-serif font-bold text-charcoal mb-4"
                            />
                            <EditableText
                                textKey="exploreArtDesc"
                                defaultText="Our collection of physical artifacts captures the material history of Senoia. From textiles and furniture to ceramics and historical memorabilia."
                                multiline={true}
                                containerType="p"
                                className="text-charcoal-light leading-relaxed"
                            />
                        </div>

                        <div className="bg-white p-8 rounded-2xl border border-tan-light shadow-sm hover:shadow-md transition-shadow md:col-span-2 md:col-start-2 lg:col-span-2 lg:col-start-4">
                            <div className="w-12 h-12 bg-tan-light/30 text-tan rounded-xl flex items-center justify-center mb-6">
                                <Search size={28} />
                            </div>
                            <EditableText
                                textKey="exploreSearchTitle"
                                defaultText="Search the Archive"
                                containerType="h3"
                                className="text-2xl font-serif font-bold text-charcoal mb-4"
                            />
                            <EditableText
                                textKey="exploreSearchDesc"
                                defaultText="Looking for something specific? Use our advanced search tool to query the archive by keyword, date, location, or subject tags. Use filters and categories to narrow down your search results."
                                multiline={true}
                                containerType="p"
                                className="text-charcoal-light leading-relaxed"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Spotlight Banner */}
            {spotlight?.enabled && (
                <div className="relative bg-charcoal text-cream overflow-hidden border-t-4 border-tan">
                    {/* Background styling for banner feel */}
                    <div className="absolute inset-0 z-0 opacity-[0.03] bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]" />
                    <div className="absolute inset-0 bg-gradient-to-r from-charcoal via-charcoal/90 to-charcoal-light/10 z-0"></div>
                    
                    <div className="max-w-7xl mx-auto px-6 py-12 md:px-8 md:py-20 relative z-10 flex flex-col md:flex-row items-center gap-8 md:gap-12 lg:gap-20">
                        {/* Image Side */}
                        {spotlight.imageUrl && (
                            <div className="w-full md:w-auto flex justify-center md:justify-end shrink-0">
                                <div className="relative group">
                                    <div className="absolute inset-0 bg-tan/30 rounded-full blur-2xl transform scale-110 group-hover:scale-125 transition-transform duration-700" />
                                    <div className="w-48 h-48 sm:w-64 sm:h-64 lg:w-80 lg:h-80 rounded-full border-[6px] border-tan/20 overflow-hidden relative z-10 shadow-2xl mx-auto transition-transform duration-500 group-hover:scale-[1.02]">
                                        <img 
                                            src={spotlight.imageUrl} 
                                            alt={spotlight.name} 
                                            className="w-full h-full object-cover"
                                        />
                                    </div>
                                    <div className="absolute -bottom-2 -right-4 bg-tan text-white font-bold text-xs uppercase tracking-widest px-5 py-2 rounded-full shadow-xl z-20 transform rotate-[-5deg] group-hover:rotate-0 transition-transform">
                                        Featured
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        {/* Text Side */}
                        <div className={`w-full ${spotlight.imageUrl ? 'md:flex-1 text-center md:text-left' : 'text-center'}`}>
                            <div className={`inline-flex items-center gap-3 text-tan text-xs font-black uppercase tracking-[0.25em] mb-6 ${!spotlight.imageUrl && 'mx-auto'}`}>
                                <span className="w-12 h-px bg-tan/50"></span>
                                Spotlight
                                <span className="w-12 h-px bg-tan/50"></span>
                            </div>
                            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-bold text-white mb-3 leading-tight tracking-tight drop-shadow-md">
                                {spotlight.name}
                            </h2>
                            <h3 className="text-lg lg:text-xl text-cream/70 font-medium font-serif italic mb-6 lg:mb-10 pb-6 lg:pb-8 border-b border-tan/20 max-w-2xl md:mx-0 mx-auto">
                                {spotlight.role}
                            </h3>
                            <p className="text-base sm:text-lg lg:text-xl text-cream/90 leading-relaxed font-sans whitespace-pre-line border-l-0 md:border-l-4 border-tan pl-0 md:pl-6 italic mb-8">
                                "{spotlight.bio}"
                            </p>
                            {spotlight.linkedInUrl && (
                                <div>
                                    <a 
                                        href={spotlight.linkedInUrl} 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        className="inline-flex items-center gap-2 bg-tan hover:bg-white text-white hover:text-tan px-6 py-3 rounded-full font-bold transition-all shadow-sm group border border-transparent hover:border-tan"
                                    >
                                        <Linkedin size={20} className="transition-colors" />
                                        Connect on LinkedIn
                                    </a>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Share & Connect Section */}
            <div className="bg-white py-24 px-8 border-t border-tan-light/50 overflow-hidden relative">
                {/* Decorative Elements */}
                <div className="absolute top-0 right-0 w-96 h-96 bg-tan/5 rounded-full blur-3xl -mr-48 -mt-48 pointer-events-none"></div>
                <div className="absolute bottom-0 left-0 w-96 h-96 bg-beige/10 rounded-full blur-3xl -ml-48 -mb-48 pointer-events-none"></div>

                <div className="max-w-6xl mx-auto flex flex-col items-center gap-16 relative z-10 text-center">
                    <div className="w-full">
                        <div className="inline-flex items-center gap-2 text-tan font-black uppercase tracking-[0.25em] mb-4">
                            <Share2 size={18} />
                            Share the Archive
                        </div>
                        <EditableText
                            textKey="homeShareTitle"
                            defaultText="Help Us Spread the&#10;History of Senoia"
                            multiline={true}
                            containerType="h2"
                            className="text-4xl md:text-5xl font-serif font-bold text-charcoal mb-6 leading-tight"
                        />
                        <EditableText
                            textKey="homeShareDesc"
                            defaultText="Our mission is to preserve and share the rich heritage of our community. Share this archive with friends and family, or follow us on social media for daily historical insights."
                            multiline={true}
                            containerType="p"
                            className="text-xl text-charcoal-light leading-relaxed mb-10 max-w-2xl mx-auto"
                        />

                        <div className="flex flex-wrap justify-center gap-6">
                            {settings.instagramUrl && (
                                <a 
                                    href={settings.instagramUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="group flex items-center gap-3 bg-white border border-tan-light px-6 py-4 rounded-2xl text-charcoal hover:bg-tan hover:text-white hover:border-tan transition-all shadow-sm hover:shadow-md"
                                >
                                    <Instagram size={24} className="text-tan group-hover:text-white transition-colors" />
                                    <span className="font-bold">Instagram</span>
                                </a>
                            )}
                            {settings.facebookUrl && (
                                <a 
                                    href={settings.facebookUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="group flex items-center gap-3 bg-white border border-tan-light px-6 py-4 rounded-2xl text-charcoal hover:bg-tan hover:text-white hover:border-tan transition-all shadow-sm hover:shadow-md"
                                >
                                    <Facebook size={24} className="text-tan group-hover:text-white transition-colors" />
                                    <span className="font-bold">Facebook</span>
                                </a>
                            )}
                            {settings.youtubeUrl && (
                                <a 
                                    href={settings.youtubeUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="group flex items-center gap-3 bg-white border border-tan-light px-6 py-4 rounded-2xl text-charcoal hover:bg-tan hover:text-white hover:border-tan transition-all shadow-sm hover:shadow-md"
                                >
                                    <Youtube size={24} className="text-tan group-hover:text-white transition-colors" />
                                    <span className="font-bold">YouTube</span>
                                </a>
                            )}
                        </div>
                    </div>

                    <div className="w-full md:w-auto shrink-0 flex justify-center mt-4">
                        <div className="bg-cream/30 p-8 rounded-[3rem] border-2 border-tan/20 relative group max-w-sm">
                            <div className="absolute inset-0 bg-tan/5 rounded-[3rem] blur-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            <div className="bg-white p-8 rounded-[2rem] shadow-xl relative z-10 flex flex-col items-center">
                                <div className="mb-6 p-4 bg-tan/5 rounded-2xl border border-tan/10">
                                    <QRCodeSVG 
                                        value={settings.contentBlocks?.qrValue || "https://sahs-archives.web.app"} 
                                        size={200}
                                        level="H"
                                        includeMargin={false}
                                    />
                                </div>
                                <div className="text-center w-full">
                                    <EditableText
                                        textKey="qrTitle"
                                        defaultText="SAHS Website"
                                        containerType="h3"
                                        className="text-lg font-serif font-bold text-charcoal mb-1"
                                    />
                                    <EditableText
                                        textKey="qrSubtitle"
                                        defaultText="Scan to Visit Archive"
                                        containerType="p"
                                        className="text-xs font-bold text-charcoal/40 uppercase tracking-widest mb-2"
                                    />
                                    <div className="mt-1 mb-6">
                                        <EditableText
                                            textKey="qrValue"
                                            defaultText="https://sahs-archives.web.app"
                                            containerType="span"
                                            className="text-[11px] text-tan hover:underline break-all font-mono font-medium block"
                                        />
                                    </div>
                                    
                                    <button 
                                        onClick={copyLink}
                                        className={`w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl font-bold text-base transition-all active:scale-95 shadow-sm hover:shadow-md ${copied ? 'bg-green-600 text-white' : 'bg-tan text-white hover:bg-tan-dark'}`}
                                    >
                                        <Share2 size={18} />
                                        {copied ? 'Link Copied!' : 'Copy Link to Clipboard'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer / Copyright Notice */}
            <footer className="bg-charcoal text-cream py-16 px-8 text-center text-sm border-t-4 border-tan">
                <div className="max-w-4xl mx-auto flex flex-col items-center">
                    <div className="flex items-center gap-8 mb-10">
                        {settings.instagramUrl && (
                            <a href={settings.instagramUrl} target="_blank" rel="noopener noreferrer" className="text-cream opacity-40 hover:opacity-100 hover:text-tan transition-all">
                                <Instagram size={24} />
                            </a>
                        )}
                        {settings.facebookUrl && (
                            <a href={settings.facebookUrl} target="_blank" rel="noopener noreferrer" className="text-cream opacity-40 hover:opacity-100 hover:text-tan transition-all">
                                <Facebook size={24} />
                            </a>
                        )}
                        {settings.youtubeUrl && (
                            <a href={settings.youtubeUrl} target="_blank" rel="noopener noreferrer" className="text-cream opacity-40 hover:opacity-100 hover:text-tan transition-all">
                                <Youtube size={24} />
                            </a>
                        )}
                    </div>
                    <EditableText
                        textKey="footerCopyrightTitle"
                        defaultText="Copyright & Usage Notice"
                        containerType="h4"
                        className="text-cream font-bold mb-6 tracking-widest uppercase text-xs"
                    />
                    <EditableText
                        textKey="footerCopyrightDesc"
                        defaultText="All information, documents, photographs, and materials provided on this website are the exclusive property of the Senoia Area Historical Society. All rights are reserved. The materials are made available for personal, educational, and non-commercial research purposes only. Any reproduction, distribution, modification, public display, or commercial use of any photographs, scans, documents, or other content found on this website is strictly prohibited without the express written permission of the Senoia Area Historical Society."
                        multiline={true}
                        containerType="p"
                        className="mb-8 leading-loose max-w-3xl opacity-70"
                    />
                    <div className="w-12 h-px bg-tan-light opacity-20 mb-8"></div>
                    <EditableText
                        textKey="footerAiTitle"
                        defaultText="Authenticity & AI Disclaimer"
                        containerType="h4"
                        className="text-cream font-bold mb-6 tracking-widest uppercase text-xs"
                    />
                    <EditableText
                        textKey="footerAiDesc"
                        defaultText={"The Senoia Area Historical Society is committed to preserving history. No artificial intelligence (AI) is used to generate, transcribe, alter, or enhance the historical documents, photographs, and metadata within this archive. All historical materials are manually curated, researched, and transcribed by our dedicated curators and volunteers to ensure complete authenticity.\n\nWhile AI tools were utilized to assist our development team in coding and building the software infrastructure of this website, AI is strictly prohibited from altering the historical records themselves."}
                        multiline={true}
                        containerType="p"
                        className="mb-8 leading-loose max-w-3xl opacity-70"
                    />
                    <div className="w-12 h-px bg-tan-light opacity-20 mb-8"></div>
                    <p className="text-cream opacity-50 font-medium tracking-wide">
                        © 2026 Senoia Area Historical Society. All rights reserved.
                    </p>
                </div>
            </footer>
        </div>
    );
}
