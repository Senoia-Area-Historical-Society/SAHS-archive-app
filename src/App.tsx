import React, { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Outlet, Navigate, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AnalyticsTracker from './components/AnalyticsTracker';

// Lazy load pages for better initial bundle size
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
const SenoiaStories = lazy(() => import('./pages/SenoiaStories').then(m => ({ default: m.SenoiaStories })));
const MyResearch = lazy(() => import('./pages/MyResearch'));
const MyResearchMap = lazy(() => import('./pages/MyResearchMap').then(m => ({ default: m.MyResearchMap })));

function PageWrapper() {
  return (
    <div className="flex-1 p-4 sm:p-6 md:p-8 lg:p-12 max-w-screen-2xl mx-auto w-full">
      <Outlet />
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
      <div className="w-12 h-12 border-4 border-tan/30 border-t-tan rounded-full animate-spin"></div>
      <p className="font-serif text-charcoal/60 text-lg italic">Loading archive assets...</p>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isSAHSUser, realIsAdmin, loading } = useAuth();
  const location = useLocation();
  
  if (loading) {
    return <LoadingSpinner />;
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

function ResearchRoute({ children }: { children: React.ReactNode }) {
  const { user, hasResearchAccess, loading } = useAuth();
  
  if (loading) {
    return <LoadingSpinner />;
  }

  if (!user || !hasResearchAccess) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
}

function App() {
  useEffect(() => {
    // Disable right-click on all images to prevent downloading
    // Future iteration: check if user is a member/admin to bypass this
    const handleContextMenu = (e: MouseEvent) => {
      if (e.target instanceof HTMLImageElement) {
        e.preventDefault();
      }
    };

    document.addEventListener('contextmenu', handleContextMenu);
    
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  return (
    <BrowserRouter>
      <AnalyticsTracker />
      <AuthProvider>
        <Suspense fallback={<LoadingSpinner />}>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Home />} />

              <Route element={<PageWrapper />}>
                <Route path="archive" element={<BrowseArchive />} />
                <Route path="senoia-stories" element={<SenoiaStories />} />
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
                
                {/* Member Research Workspace Route */}
                <Route path="my-research" element={<ResearchRoute><MyResearch /></ResearchRoute>} />
                <Route path="my-research/map" element={<ResearchRoute><MyResearchMap /></ResearchRoute>} />
              </Route>
            </Route>
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
