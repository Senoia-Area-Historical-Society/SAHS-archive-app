import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Outlet, Navigate, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import { AuthProvider, useAuth } from './contexts/AuthContext';

// Lazy loaded pages
const Home = lazy(() => import('./pages/Home').then(m => ({ default: m.Home })));
const BrowseArchive = lazy(() => import('./pages/BrowseArchive').then(m => ({ default: m.BrowseArchive })));
const ItemDetail = lazy(() => import('./pages/ItemDetail').then(m => ({ default: m.ItemDetail })));
const AddItem = lazy(() => import('./pages/AddItem').then(m => ({ default: m.AddItem })));
const EditItem = lazy(() => import('./pages/EditItem'));
const Collections = lazy(() => import('./pages/Collections').then(m => ({ default: m.Collections })));
const CollectionDetail = lazy(() => import('./pages/CollectionDetail').then(m => ({ default: m.CollectionDetail })));
const AddCollection = lazy(() => import('./pages/AddCollection').then(m => ({ default: m.AddCollection })));
const EditCollection = lazy(() => import('./pages/EditCollection').then(m => ({ default: m.EditCollection })));
const Login = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));
const SearchArchive = lazy(() => import('./pages/SearchArchive').then(m => ({ default: m.SearchArchive })));
const AdminSettings = lazy(() => import('./pages/AdminSettings').then(m => ({ default: m.AdminSettings })));
const ManageLocations = lazy(() => import('./pages/ManageLocations').then(m => ({ default: m.ManageLocations })));
const ManageRoomLocations = lazy(() => import('./pages/ManageRoomLocations').then(m => ({ default: m.ManageRoomLocations })));
const TaggingHub = lazy(() => import('./pages/TaggingHub').then(m => ({ default: m.TaggingHub })));
const LocationDetail = lazy(() => import('./pages/LocationDetail').then(m => ({ default: m.LocationDetail })));
const RoomDetail = lazy(() => import('./pages/RoomDetail').then(m => ({ default: m.RoomDetail })));
const InteractiveMap = lazy(() => import('./pages/InteractiveMap').then(m => ({ default: m.InteractiveMap })));
const AuditDashboard = lazy(() => import('./pages/AuditDashboard').then(m => ({ default: m.AuditDashboard })));
const BrowseMap = lazy(() => import('./pages/BrowseMap').then(m => ({ default: m.BrowseMap })));

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

function ProtectedRoute({ children }: { children: React.ReactNode }) {
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
                <Route path="figures/:id" element={<ItemDetail />} /> {/* Legacy detail redirect handled later */}
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
    </BrowserRouter>
  );
}

export default App;
