import React, { Suspense } from 'react';
import type { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Outlet, Navigate, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import { AuthProvider, useAuth } from './contexts/AuthContext';

import { Home } from './pages/Home';
import { BrowseArchive } from './pages/BrowseArchive';
import { ItemDetail } from './pages/ItemDetail';
import { Collections } from './pages/Collections';
import { CollectionDetail } from './pages/CollectionDetail';
import { AddItem } from './pages/AddItem';
import EditItem from './pages/EditItem';
import { AddCollection } from './pages/AddCollection';
import { EditCollection } from './pages/EditCollection';
import { Login } from './pages/Login';
import { SearchArchive } from './pages/SearchArchive';
import { AdminSettings } from './pages/AdminSettings';
import { ManageLocations } from './pages/ManageLocations';
import { ManageRoomLocations } from './pages/ManageRoomLocations';
import { TaggingHub } from './pages/TaggingHub';
import { LocationDetail } from './pages/LocationDetail';
import { RoomDetail } from './pages/RoomDetail';
import { InteractiveMap } from './pages/InteractiveMap';
import { AuditDashboard } from './pages/AuditDashboard';
import { BrowseMap } from './pages/BrowseMap';



function PageWrapper() {
  return (
    <div className="flex-1 p-4 sm:p-6 md:p-8 lg:p-12 max-w-screen-2xl mx-auto w-full">
      <Outlet />
    </div>
  );
}

function LoadingFallback() {
    return (
        <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] gap-4">
            <div className="w-10 h-10 border-4 border-tan/20 border-t-tan rounded-full animate-spin"></div>
            <p className="font-serif italic text-charcoal/40">Loading gallery...</p>
        </div>
    );
}

class ErrorBoundary extends React.Component<{children: ReactNode}, {hasError: boolean, error: Error | null}> {
  constructor(props: {children: ReactNode}) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center bg-cream">
          <h1 className="text-3xl font-serif text-charcoal mb-4">Something went wrong.</h1>
          <p className="text-charcoal/60 mb-2 max-w-md">The application encountered an unexpected error.</p>
          <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-8 max-w-lg text-left overflow-auto font-mono text-xs">
            {this.state.error ? (this.state.error.message || this.state.error.toString()) : "Unknown Error"}
          </div>
          <button onClick={() => window.location.reload()} className="px-6 py-2 bg-tan text-white rounded-full font-bold hover:bg-charcoal transition-all">Refresh Page</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isSAHSUser, realIsAdmin, loading } = useAuth();
  const location = useLocation();
  
  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 border-4 border-tan/30 border-t-tan rounded-full animate-spin"></div>
        <p className="font-serif text-charcoal/60 text-lg">Verifying access...</p>
      </div>
    );
  }

  // Admins always have access to /settings to toggle simulation
  if (realIsAdmin && location.pathname === '/settings') {
    return <>{children}</>;
  }

  if (!user || !isSAHSUser) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <AuthProvider>
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              <Route path="/" element={<Layout />}>
                <Route index element={<Home />} />

                <Route element={<PageWrapper />}>
                  <Route path="archive" element={<BrowseArchive />} />
                  <Route path="collections" element={<Collections />} />
                  <Route path="collections/:id" element={<CollectionDetail />} />

                  {/* Authentication and Admin routes */}
                  <Route path="items/:id" element={<ItemDetail />} />
                  <Route path="figures/:id" element={<ItemDetail />} />
                  <Route path="search" element={<SearchArchive />} />
                  <Route path="map" element={<BrowseMap />} />
                  <Route path="login" element={<Login />} />

                  {/* Protected Curator Routes */}
                  <Route path="add-item" element={<ProtectedRoute><AddItem /></ProtectedRoute>} />
                  <Route path="add-collection" element={<ProtectedRoute><AddCollection /></ProtectedRoute>} />
                  <Route path="edit-item/:id" element={<ProtectedRoute><EditItem /></ProtectedRoute>} />
                  <Route path="edit-collection/:id" element={<ProtectedRoute><EditCollection /></ProtectedRoute>} />
                  <Route path="settings" element={<ProtectedRoute><AdminSettings /></ProtectedRoute>} />
                  <Route path="tagging" element={<ProtectedRoute><TaggingHub /></ProtectedRoute>} />
                  <Route path="manage-locations" element={<ProtectedRoute><ManageLocations /></ProtectedRoute>} />
                  <Route path="manage-locations/rooms/:roomId" element={<ProtectedRoute><ManageRoomLocations /></ProtectedRoute>} />
                  <Route path="rooms/:id" element={<ProtectedRoute><RoomDetail /></ProtectedRoute>} />
                  <Route path="locations/:id" element={<ProtectedRoute><LocationDetail /></ProtectedRoute>} />
                  <Route path="interactive-map" element={<ProtectedRoute><InteractiveMap /></ProtectedRoute>} />
                  <Route path="audit" element={<ProtectedRoute><AuditDashboard /></ProtectedRoute>} />
                </Route>
              </Route>
            </Routes>
          </Suspense>
        </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;
