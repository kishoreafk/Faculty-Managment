import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import LeaveManagement from './pages/LeaveManagement';
import AdminApprovals from './pages/AdminApprovals';
import ProductRequests from './pages/ProductRequests';
import AdminProductReview from './pages/AdminProductReview';
import AdminLogs from './pages/AdminLogs';
import AdminUsers from './pages/AdminUsers';
import AdminUserDetail from './pages/AdminUserDetail';
import AdminCreateUser from './pages/AdminCreateUser';
import AdminPendingItems from './pages/AdminPendingItems';
import AdminLeaveReview from './pages/AdminLeaveReview';
import AdminLeaveLog from './pages/AdminLeaveLog';
import AdminProductLog from './pages/AdminProductLog';
import Vaultify from './pages/Vaultify';
import TimetableFiles from './pages/TimetableFiles';
import AdminTimetableAssignment from './pages/AdminTimetableAssignment';
import AdminLeaveBalance from './pages/AdminLeaveBalance';
import Layout from './components/Layout';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/dashboard" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
          <Route path="/leave" element={<ProtectedRoute><Layout><LeaveManagement /></Layout></ProtectedRoute>} />
          <Route path="/products" element={<ProtectedRoute><Layout><ProductRequests /></Layout></ProtectedRoute>} />
          <Route path="/admin/approvals" element={<AdminRoute><Layout><AdminApprovals /></Layout></AdminRoute>} />
          <Route path="/admin/product-reviews" element={<AdminRoute><Layout><AdminProductReview /></Layout></AdminRoute>} />
          <Route path="/admin/logs" element={<AdminRoute><Layout><AdminLogs /></Layout></AdminRoute>} />
          <Route path="/admin/users" element={<AdminRoute><Layout><AdminUsers /></Layout></AdminRoute>} />
          <Route path="/admin/users/create" element={<AdminRoute><Layout><AdminCreateUser /></Layout></AdminRoute>} />
          <Route path="/admin/users/:id" element={<AdminRoute><Layout><AdminUserDetail /></Layout></AdminRoute>} />
          <Route path="/admin/pending" element={<AdminRoute><Layout><AdminPendingItems /></Layout></AdminRoute>} />
          <Route path="/admin/leave-review" element={<AdminRoute><Layout><AdminLeaveReview /></Layout></AdminRoute>} />
          <Route path="/admin/leave-log" element={<AdminRoute><Layout><AdminLeaveLog /></Layout></AdminRoute>} />
          <Route path="/admin/product-log" element={<AdminRoute><Layout><AdminProductLog /></Layout></AdminRoute>} />
          <Route path="/vaultify" element={<ProtectedRoute><Layout><Vaultify /></Layout></ProtectedRoute>} />
          <Route path="/timetables" element={<ProtectedRoute><Layout><TimetableFiles /></Layout></ProtectedRoute>} />
          <Route path="/admin/timetables" element={<AdminRoute><Layout><AdminTimetableAssignment /></Layout></AdminRoute>} />
          <Route path="/admin/leave-balance" element={<AdminRoute><Layout><AdminLeaveBalance /></Layout></AdminRoute>} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" /></div>;
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading, user } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" /></div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role !== 'ADMIN' && user?.role !== 'SUPER_ADMIN') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export default App;
