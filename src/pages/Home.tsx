import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, Library, Users, FileText, Building } from 'lucide-react';

const BACKGROUND_IMAGES = [
    // Placeholder images - Please replace with the links to the images you attached!
    "/Main Street 9.jpg",
    "/Sue Welden Williams with Main Street depot in background.jpg",
    "/Senoia Train Depot.jpg"
];

export function Home() {
    const [currentSlide, setCurrentSlide] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentSlide((prev) => (prev + 1) % BACKGROUND_IMAGES.length);
        }, 8000); // 8 seconds for a slow, non-distracting change
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="w-full h-full flex flex-col font-sans">
            {/* Hero Section */}
            <div className="relative w-full min-h-screen flex flex-col justify-center items-center text-center p-8 overflow-hidden">
                {BACKGROUND_IMAGES.map((img, index) => (
                    <div
                        key={index}
                        className={`absolute inset-0 z-0 bg-cover bg-center transition-opacity duration-1000 ease-in-out ${index === currentSlide ? 'opacity-100' : 'opacity-0'
                            }`}
                        style={{ backgroundImage: `url("${img}")` }}
                    />
                ))}
                {/* Dark overlay to make it less distracting and improve text readability */}
                <div className="absolute inset-0 z-0 bg-charcoal/80 backdrop-blur-[2px]"></div>

                {/* Hero Content */}
                <div className="relative z-10 max-w-5xl mx-auto text-cream">
                    <h1 className="text-6xl md:text-8xl font-serif font-bold tracking-tight mb-6 text-white drop-shadow-md">
                        Senoia Area<br />Historical Society
                    </h1>
                    <p className="text-2xl md:text-3xl font-serif italic text-beige mb-12 drop-shadow">
                        Preserving Our Past, Inspiring Our Future
                    </p>

                    <p className="text-lg md:text-xl text-cream/90 max-w-3xl mx-auto leading-relaxed mb-16 font-medium">
                        Explore our  digital archive of historical documents,
                        photographs, and stories that chronicle the heritage of the Senoia area.
                    </p>

                    <div className="flex flex-col sm:flex-row flex-wrap gap-6 justify-center items-center mt-8">
                        <Link
                            to="/archive?type=Document"
                            className="flex items-center gap-3 bg-cream text-charcoal px-8 py-4 rounded-xl font-bold text-lg hover:bg-white hover:scale-105 transition-all shadow-lg"
                        >
                            <Library size={24} />
                            Browse Documents
                        </Link>
                        <Link
                            to="/archive?type=Historic Figure"
                            className="flex items-center gap-3 bg-cream text-charcoal px-8 py-4 rounded-xl font-bold text-lg hover:bg-white hover:scale-105 transition-all shadow-lg"
                        >
                            <Users size={24} />
                            View Figures
                        </Link>
                        <Link
                            to="/archive?type=Historic Organization"
                            className="flex items-center gap-3 bg-cream text-charcoal px-8 py-4 rounded-xl font-bold text-lg hover:bg-white hover:scale-105 transition-all shadow-lg"
                        >
                            <Building size={24} />
                            View Orgs
                        </Link>
                        <Link
                            to="/search"
                            className="flex items-center gap-3 bg-tan text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-tan-dark hover:scale-105 transition-all shadow-lg"
                        >
                            <Search size={24} />
                            Search Archive
                        </Link>
                    </div>
                </div>
            </div>

            {/* Explore Section */}
            <div className="bg-cream py-24 px-8 border-t border-tan-light/50">
                <div className="max-w-6xl mx-auto text-center">
                    <h2 className="text-4xl md:text-5xl font-serif font-bold text-charcoal mb-4">Explore Our Archives</h2>
                    <p className="text-xl md:text-2xl text-charcoal-light font-medium mb-16 max-w-3xl mx-auto leading-relaxed">
                        Discover the stories, people, and events that shaped our community
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 text-left">
                        <div className="bg-white p-8 rounded-2xl border border-tan-light shadow-sm hover:shadow-md transition-shadow">
                            <div className="w-12 h-12 bg-tan-light/30 text-tan rounded-xl flex items-center justify-center mb-6">
                                <FileText size={28} />
                            </div>
                            <h3 className="text-2xl font-serif font-bold text-charcoal mb-4">Historical Documents</h3>
                            <p className="text-charcoal-light leading-relaxed">
                                Dive into primary sources including letters, ledgers, meeting minutes, and local government records. These documents offer a firsthand look at the daily life, governance, and development of Senoia throughout the decades.
                            </p>
                        </div>

                        <div className="bg-white p-8 rounded-2xl border border-tan-light shadow-sm hover:shadow-md transition-shadow">
                            <div className="w-12 h-12 bg-tan-light/30 text-tan rounded-xl flex items-center justify-center mb-6">
                                <Users size={28} />
                            </div>
                            <h3 className="text-2xl font-serif font-bold text-charcoal mb-4">Historic Figures</h3>
                            <p className="text-charcoal-light leading-relaxed">
                                Read about the individuals who have left a lasting impact on our community. Discover the history behind the names of local landmarks and the pioneers who built Senoia.
                            </p>
                        </div>

                        <div className="bg-white p-8 rounded-2xl border border-tan-light shadow-sm hover:shadow-md transition-shadow">
                            <div className="w-12 h-12 bg-tan-light/30 text-tan rounded-xl flex items-center justify-center mb-6">
                                <Building size={28} />
                            </div>
                            <h3 className="text-2xl font-serif font-bold text-charcoal mb-4">Historic Organizations</h3>
                            <p className="text-charcoal-light leading-relaxed">
                                Explore the history of local businesses, churches, schools, and civic groups that have served as the foundation of our community's social and economic life.
                            </p>
                        </div>

                        <div className="bg-white p-8 rounded-2xl border border-tan-light shadow-sm hover:shadow-md transition-shadow">
                            <div className="w-12 h-12 bg-tan-light/30 text-tan rounded-xl flex items-center justify-center mb-6">
                                <Search size={28} />
                            </div>
                            <h3 className="text-2xl font-serif font-bold text-charcoal mb-4">Search the Archive</h3>
                            <p className="text-charcoal-light leading-relaxed">
                                Looking for something specific? Use our advanced search tool to query the archive by keyword, date, location, or subject tags to quickly find historical records.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer / Copyright Notice */}
            <footer className="bg-charcoal text-cream/70 py-16 px-8 text-center text-sm border-t-4 border-tan">
                <div className="max-w-4xl mx-auto flex flex-col items-center">
                    <h4 className="text-cream font-bold mb-6 tracking-widest uppercase text-xs">Copyright & Usage Notice</h4>
                    <p className="mb-8 leading-loose max-w-3xl">
                        All information, documents, photographs, and materials provided on this website are the exclusive property of the Senoia Area Historical Society. All rights are reserved. The materials are made available for personal, educational, and non-commercial research purposes only. Any reproduction, distribution, modification, public display, or commercial use of any photographs, scans, documents, or other content found on this website is strictly prohibited without the express written permission of the Senoia Area Historical Society.
                    </p>
                    <div className="w-12 h-px bg-tan-light/20 mb-8"></div>
                    <p className="text-cream/50 font-medium tracking-wide">
                        © 2026 Senoia Area Historical Society. All rights reserved.
                    </p>
                </div>
            </footer>
        </div>
    );
}
