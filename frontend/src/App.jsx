import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import useAuthStore from './store/useAuthStore';
import useCompanyStore from './store/useCompanyStore';
import { setNavigateFn } from './services/api';

// Layout
import AppShell from './components/layout/AppShell';

// Pages
import LoginPage from './pages/auth/LoginPage';
import AdminDashboard from './pages/admin/AdminDashboard';
import EmployeeDashboard from './pages/employee/EmployeeDashboard';
import AttendancePage from './pages/attendance/AttendancePage';
import LeadPipeline from './pages/crm/LeadPipeline';
import QuoteBuilder from './pages/quotes/QuoteBuilder';
import TariffMatrix from './pages/pricing/TariffMatrix';
import PricingEngine from './pages/pricing/PricingEngine';
import VendorManagement from './pages/vendors/VendorManagement';
import FinancialLedger from './pages/finance/FinancialLedger';
import BookingManagement from './pages/bookings/BookingManagement';
import ItineraryBuilder from './pages/itinerary/ItineraryBuilder';
import AnalyticsDashboard from './pages/analytics/AnalyticsDashboard';
import WhatsappAutomation from './pages/whatsapp/WhatsappAutomation';
import ExcelExport from './pages/exports/ExcelExport';
import SettingsPage from './pages/settings/SettingsPage';
import ProfilePage from './pages/profile/ProfilePage';
import NotFoundPage from './pages/NotFoundPage';

// Protected Route Wrapper
const ProtectedRoute = ({ children, adminOnly = false }) => {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (adminOnly && user?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
};

// ── NavigateInjector ────────────────────────────────────────────────────
// Must be rendered inside <BrowserRouter> so useNavigate() is available.
// Registers the navigate function with api.js so the 401 interceptor can
// redirect to /login via React Router instead of a hard page reload.
function NavigateInjector() {
  const navigate = useNavigate();
  const { checkTokenExpiry, isAuthenticated } = useAuthStore();
  const { fetchCompany, fetched } = useCompanyStore();

  // Wire up React Router navigate to the Axios 401 interceptor
  useEffect(() => {
    setNavigateFn(navigate);
  }, [navigate]);

  // Check token expiry on mount and every 60 seconds
  useEffect(() => {
    checkTokenExpiry();
    const interval = setInterval(checkTokenExpiry, 60_000);
    return () => clearInterval(interval);
  }, [checkTokenExpiry]);

  // Fetch company settings (logo, name, etc.) when user is logged in
  useEffect(() => {
    if (isAuthenticated && !fetched) {
      fetchCompany();
    }
  }, [isAuthenticated, fetched, fetchCompany]);

  return null; // renders nothing — side-effects only
}

export default function App() {
  const { isAuthenticated, user } = useAuthStore();

  return (
    <BrowserRouter>
      {/* Inject navigate fn + token expiry watch — must be inside BrowserRouter */}
      <NavigateInjector />

      <Routes>
        {/* Public */}
        <Route path="/login" element={
          isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />
        } />

        {/* Protected App Shell */}
        <Route path="/" element={
          <ProtectedRoute><AppShell /></ProtectedRoute>
        }>
          {/* Default redirect */}
          <Route index element={<Navigate to="/dashboard" replace />} />

          {/* Dashboards — role-aware */}
          <Route path="dashboard" element={
            user?.role === 'admin'
              ? <AdminDashboard />
              : <EmployeeDashboard />
          } />
          <Route path="admin" element={
            <ProtectedRoute adminOnly><AdminDashboard /></ProtectedRoute>
          } />

          {/* HRMS */}
          <Route path="attendance"   element={<AttendancePage />} />
          <Route path="profile"      element={<ProfilePage />} />
          <Route path="profile/:id"  element={<ProfilePage />} />

          {/* CRM */}
          <Route path="leads"        element={<LeadPipeline />} />
          <Route path="quotes"       element={<QuoteBuilder />} />
          <Route path="bookings"     element={<BookingManagement />} />
          <Route path="itinerary"    element={<ItineraryBuilder />} />

          {/* Pricing */}
          <Route path="matrix"       element={<TariffMatrix />} />
          <Route path="pricing"      element={
            <ProtectedRoute adminOnly><PricingEngine /></ProtectedRoute>
          } />

          {/* Operations */}
          <Route path="vendors"      element={<VendorManagement />} />
          <Route path="finance"      element={
            <ProtectedRoute adminOnly><FinancialLedger /></ProtectedRoute>
          } />

          {/* Intelligence */}
          <Route path="analytics"    element={
            <ProtectedRoute adminOnly><AnalyticsDashboard /></ProtectedRoute>
          } />
          <Route path="whatsapp"     element={<WhatsappAutomation />} />
          <Route path="exports"      element={<ExcelExport />} />
          <Route path="settings"     element={
            <ProtectedRoute adminOnly><SettingsPage /></ProtectedRoute>
          } />
        </Route>

        {/* 404 — animated not-found page */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
