import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import { BrowseArchive } from './pages/BrowseArchive';
import { ItemDetail } from './pages/ItemDetail';
import { AddItem } from './pages/AddItem';
import { EditItem } from './pages/EditItem';
import { Collections } from './pages/Collections';
import { AddCollection } from './pages/AddCollection';
import { Login } from './pages/Login';
import { AuthProvider, useAuth } from './contexts/AuthContext';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isSAHSUser, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="flex justify-center items-center h-full text-charcoal/60 font-serif">Verifying curator access...</div>;
  }

  if (!isSAHSUser) {
    // Redirect to login page, but save the intended location
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={
              <div className="space-y-6">
                <h1 className="text-5xl font-serif font-bold tracking-tight">Digital Archive</h1>
                <p className="text-xl text-charcoal/80 max-w-2xl leading-relaxed">
                  Explore the rich history of the Senoia area through our collection of historical documents,
                  photographs, and curated profiles of historic figures.
                </p>
                <div className="flex gap-4 pt-4">
                  <a href="/archive" className="bg-tan text-white px-6 py-3 rounded-lg font-medium hover:bg-charcoal transition-colors">
                    Browse Archive
                  </a>
                  <a href="/archive" className="bg-white border border-tan-light text-charcoal px-6 py-3 rounded-lg font-medium hover:bg-tan-light/30 transition-colors">
                    Search Collections
                  </a>
                </div>
              </div>
            } />
            <Route path="archive" element={<BrowseArchive />} />
            <Route path="collections" element={<Collections />} />
            <Route path="items/:id" element={<ItemDetail />} />
            <Route path="figures/:id" element={<ItemDetail />} /> {/* Legacy detail redirect handled later */}
            <Route path="search" element={<div className="font-serif text-3xl font-bold">Search Archive</div>} />
            <Route path="login" element={<Login />} />

            {/* Protected Curator Routes */}
            <Route path="add-item" element={<ProtectedRoute><AddItem /></ProtectedRoute>} />
            <Route path="add-collection" element={<ProtectedRoute><AddCollection /></ProtectedRoute>} />
            <Route path="edit-item/:id" element={<ProtectedRoute><EditItem /></ProtectedRoute>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
