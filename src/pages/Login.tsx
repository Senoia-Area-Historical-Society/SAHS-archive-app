import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LogIn, AlertCircle } from 'lucide-react';

export function Login() {
    const { loginWithGoogle } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Get the return URL from location state, or default to home
    const from = (location.state as any)?.from?.pathname || '/';

    const handleLogin = async () => {
        setError(null);
        setIsLoading(true);
        try {
            await loginWithGoogle();
            navigate(from, { replace: true });
        } catch (err: any) {
            console.error("Login error details:", err);
            setError(err.code ? `${err.message} (${err.code})` : err.message || "Failed to log in.");
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-md mx-auto h-full flex flex-col items-center justify-center animate-in fade-in zoom-in duration-500 py-12">
            <div className="w-16 h-16 bg-tan-light/50 text-tan rounded-full flex items-center justify-center mb-6">
                <LogIn size={32} />
            </div>

            <h1 className="text-3xl font-serif font-bold text-charcoal mb-2 text-center">Member & Curator Sign In</h1>

            <p className="text-charcoal/70 mb-8 text-center px-4">
                Sign in to access Member benefits, bookmark historical documents, or perform authorized Curator duties.
            </p>

            {error && (
                <div className="mb-8 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-start gap-3 w-full">
                    <AlertCircle className="shrink-0 mt-0.5" size={20} />
                    <p className="font-medium text-sm">{error}</p>
                </div>
            )}

            <button
                onClick={handleLogin}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-3 bg-white border-2 border-tan-light text-charcoal px-6 py-4 rounded-xl font-bold hover:bg-cream hover:border-tan transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google Logo" className="w-5 h-5" />
                {isLoading ? "Signing in..." : "Sign in with Google"}
            </button>

            <p className="text-xs text-charcoal/50 mt-6 text-center">
                Only active Members, authorized Curators, and Admins can sign in.
            </p>
        </div>
    );
}
