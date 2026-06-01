import { Toaster } from '@/components/ui/toaster';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from '@/lib/PageNotFound';
import { AuthProvider } from '@/lib/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';

import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';

import AppLayout from '@/components/layout/AppLayout';
import Dashboard from '@/pages/Dashboard';
import Products from '@/pages/Products';
import Warehouses from '@/pages/Warehouses';
import Inventory from '@/pages/Inventory';
import Containers from '@/pages/Containers';
import Sales from '@/pages/Sales';
import Customers from '@/pages/Customers';
import Suppliers from '@/pages/Suppliers';
import Transfers from '@/pages/Transfers';
import Damages from '@/pages/Damages';
import Returns from '@/pages/Returns';
import Payments from '@/pages/Payments';
import Accounts from '@/pages/Accounts';
import Reports from '@/pages/Reports';
import ActivityLog from '@/pages/ActivityLog';
import Approvals from '@/pages/Approvals';
import StockAdjustments from '@/pages/StockAdjustments';

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <Routes>
            {/* Public auth routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Protected app routes */}
            <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/products" element={<Products />} />
                <Route path="/warehouses" element={<Warehouses />} />
                <Route path="/inventory" element={<Inventory />} />
                <Route path="/containers" element={<Containers />} />
                <Route path="/sales" element={<Sales />} />
                <Route path="/customers" element={<Customers />} />
                <Route path="/suppliers" element={<Suppliers />} />
                <Route path="/transfers" element={<Transfers />} />
                <Route path="/damages" element={<Damages />} />
                <Route path="/returns" element={<Returns />} />
                <Route path="/payments" element={<Payments />} />
                <Route path="/accounts" element={<Accounts />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/activity-log" element={<ActivityLog />} />
                <Route path="/approvals" element={<Approvals />} />
                <Route path="/stock-adjustments" element={<StockAdjustments />} />
              </Route>
            </Route>

            <Route path="*" element={<PageNotFound />} />
          </Routes>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;
