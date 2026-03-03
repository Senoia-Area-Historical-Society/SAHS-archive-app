import { BrowserRouter, Routes, Route, Navigate, useLocation, Outlet } from 'react-router-dom';
import Layout from './components/Layout';
import { BrowseArchive } from './pages/BrowseArchive';
import { ItemDetail } from './pages/ItemDetail';
import { AddItem } from './pages/AddItem';
import { EditItem } from './pages/EditItem';
import { Collections } from './pages/Collections';
import { AddCollection } from './pages/AddCollection';
import { Login } from './pages/Login';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Home } from './pages/Home';
import { SearchArchive } from './pages/SearchArchive';

function PageWrapper() {
  return (
    <div className="flex-1 p-8 md:p-12 max-w-7xl mx-auto w-full">
      <Outlet />
    </div>
  );
}

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
            <Route index element={<Home />} />

            <Route element={<PageWrapper />}>
              <Route path="archive" element={<BrowseArchive />} />
              <Route path="collections" element={<Collections />} />
              <Route path="items/:id" element={<ItemDetail />} />
              <Route path="figures/:id" element={<ItemDetail />} /> {/* Legacy detail redirect handled later */}
              <Route path="search" element={<SearchArchive />} />
              <Route path="login" element={<Login />} />

              {/* Protected Curator Routes */}
              <Route path="add-item" element={<ProtectedRoute><AddItem /></ProtectedRoute>} />
              <Route path="add-collection" element={<ProtectedRoute><AddCollection /></ProtectedRoute>} />
              <Route path="edit-item/:id" element={<ProtectedRoute><EditItem /></ProtectedRoute>} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
