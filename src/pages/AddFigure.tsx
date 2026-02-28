import { useState, useRef } from 'react';
import { UserPlus, Image as ImageIcon, CheckCircle, AlertCircle } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, addDoc } from 'firebase/firestore';

export function AddFigure() {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        try {
            const formData = new FormData(e.target as HTMLFormElement);

            const figureData = {
                type: formData.get('type') as string,
                full_name: formData.get('fullName') as string,
                also_known_as: formData.get('knownAs') as string || "",
                life_dates: formData.get('dates') as string || "",
                biography: formData.get('biography') as string || "",
                portrait_url: "",
                created_at: new Date().toISOString()
            };

            await addDoc(collection(db, 'historic_figures'), figureData);

            setSuccess(true);
        } catch (err: any) {
            console.error("Error adding figure: ", err);
            setError(err.message || "Failed to add figure. Please check your Firebase configuration.");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (success) {
        return (
            <div className="max-w-2xl mx-auto h-full flex flex-col items-center justify-center animate-in fade-in zoom-in duration-500">
                <div className="w-16 h-16 bg-tan-light/50 text-tan rounded-full flex items-center justify-center mb-6">
                    <CheckCircle size={32} />
                </div>
                <h2 className="text-3xl font-serif font-bold text-charcoal mb-2">Figure Added</h2>
                <p className="text-charcoal/70 mb-8 text-center max-w-md">The historic figure profile has been successfully created.</p>
                <button
                    onClick={() => setSuccess(false)}
                    className="bg-tan text-white px-6 py-3 rounded-lg font-medium hover:bg-charcoal transition-colors"
                >
                    Add Another Figure
                </button>
            </div>
        )
    }

    return (
        <div className="max-w-4xl mx-auto h-full flex flex-col pb-12">
            <div className="mb-8 border-b border-tan-light/50 pb-6">
                <h1 className="text-4xl font-serif font-bold mb-3 text-charcoal tracking-tight flex items-center gap-3">
                    <UserPlus className="text-tan" size={32} />
                    Add New Figure
                </h1>
                <p className="text-charcoal/70 text-lg">Create a profile for a notable person, organization, or place.</p>
            </div>

            {error && (
                <div className="mb-8 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-start gap-3">
                    <AlertCircle className="shrink-0 mt-0.5" size={20} />
                    <p className="font-medium text-sm">{error}</p>
                </div>
            )}

            <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-tan-light/50 p-8 shadow-sm flex flex-col gap-8">

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                        <div>
                            <label htmlFor="type" className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">Type *</label>
                            <select required name="type" id="type" className="w-full bg-cream/50 border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 focus:border-tan/30 transition-all font-sans appearance-none">
                                <option value="Person">Person</option>
                                <option value="Organization">Organization</option>
                                <option value="Building">Building / Place</option>
                            </select>
                        </div>

                        <div>
                            <label htmlFor="fullName" className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">Full Name *</label>
                            <input required type="text" name="fullName" id="fullName" placeholder="Enter full name" className="w-full bg-cream/50 border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 focus:border-tan/30 transition-all font-sans" />
                        </div>

                        <div>
                            <label htmlFor="knownAs" className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">Also Known As</label>
                            <input type="text" name="knownAs" id="knownAs" placeholder="Alternative names or aliases" className="w-full bg-cream/50 border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 focus:border-tan/30 transition-all font-sans" />
                        </div>

                        <div>
                            <label htmlFor="dates" className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">Life Dates (or active years)</label>
                            <input type="text" name="dates" id="dates" placeholder="e.g. 1850 - 1920" className="w-full bg-cream/50 border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 focus:border-tan/30 transition-all font-sans" />
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">Portrait/Photo</label>
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className="border border-dashed border-tan-light bg-cream/50 rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-tan-light/10 transition-colors h-48"
                            >
                                <input
                                    type="file"
                                    name="portraitFile"
                                    ref={fileInputRef}
                                    className="hidden"
                                    accept="image/png, image/jpeg"
                                    onChange={(e) => setSelectedFileName(e.target.files?.[0]?.name || null)}
                                />
                                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-tan shadow-sm mb-3">
                                    <ImageIcon size={20} />
                                </div>
                                {selectedFileName ? (
                                    <p className="font-medium text-sm text-charcoal mb-1"><span className="text-tan">{selectedFileName}</span></p>
                                ) : (
                                    <>
                                        <p className="font-medium text-sm text-charcoal mb-1"><span className="text-tan hover:underline">Click to upload</span></p>
                                        <p className="text-xs text-charcoal/50">PNG, JPG up to 10MB</p>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="h-full flex flex-col">
                            <label htmlFor="biography" className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">Biography</label>
                            <textarea id="biography" name="biography" placeholder="Detailed history or story about this figure..." className="w-full flex-1 min-h-[120px] bg-cream/50 border border-tan-light/50 px-4 py-3 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 focus:border-tan/30 transition-all font-sans resize-none"></textarea>
                        </div>
                    </div>
                </div>

                <div className="pt-6 border-t border-tan-light/50 flex justify-end">
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="bg-tan text-white px-8 py-3 rounded-lg font-medium hover:bg-charcoal transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? 'Saving...' : 'Add Figure'}
                    </button>
                </div>

            </form>
        </div>
    );
}
