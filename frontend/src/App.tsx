import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/stores/auth-store';
import { AppProvider } from '@/stores/app-store';
import { AuthPage } from '@/components/auth/auth-page';
import { DashboardPage } from '@/components/dashboard/dashboard-page';
import { PhoneDetailPage } from '@/components/phone/phone-detail-page';
import { ApiKeysPage } from '@/components/dashboard/api-keys-page';
import { Toasts } from '@/components/ui/toasts';
import { Loader2 } from 'lucide-react';
import './index.css';

function AuthGate() {
  const { token, loading, needsRegistration } = useAuth();

  if (loading || needsRegistration === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!token) {
    return <AuthPage />;
  }

  return (
    <AppProvider>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/phone/:phoneId" element={<PhoneDetailPage />} />
        <Route path="/settings/api-keys" element={<ApiKeysPage />} />
      </Routes>
      <Toasts />
    </AppProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </BrowserRouter>
  );
}
