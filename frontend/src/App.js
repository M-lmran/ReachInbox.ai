import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import ScheduledPage from "@/pages/ScheduledPage";
import SentPage from "@/pages/SentPage";
import ComposePage from "@/pages/ComposePage";
import SettingsPage from "@/pages/SettingsPage";
import QueueMonitorPage from "@/pages/QueueMonitorPage";
import { Loader2 } from "lucide-react";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/scheduled"
        element={
          <ProtectedRoute>
            <ScheduledPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/sent"
        element={
          <ProtectedRoute>
            <SentPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/compose"
        element={
          <ProtectedRoute>
            <ComposePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/queue"
        element={
          <ProtectedRoute>
            <QueueMonitorPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/settings"
        element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
        <Toaster position="top-right" richColors closeButton />
      </AuthProvider>
    </div>
  );
}

export default App;
