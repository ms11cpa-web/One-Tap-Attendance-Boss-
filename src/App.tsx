import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginView } from './components/auth/LoginView';
import { Navbar } from './components/layout/Navbar';
import { Sidebar, NavTab } from './components/layout/Sidebar';
import { MobileNav } from './components/layout/MobileNav';
import { OneTapAttendance } from './components/attendance/OneTapAttendance';
import { DashboardView } from './components/dashboard/DashboardView';
import { AttendanceHistoryView } from './components/attendance/AttendanceHistoryView';
import { RequestsApprovalsView } from './components/requests/RequestsApprovalsView';
import { CalendarView } from './components/calendar/CalendarView';
import { EmployeesView } from './components/employees/EmployeesView';
import { ReportsView } from './components/reports/ReportsView';
import { SettingsView } from './components/settings/SettingsView';
import { AuditLogsView } from './components/audit/AuditLogsView';
import { OfflineIndicator } from './components/pwa/OfflineIndicator';
import { ApplyLeaveModal } from './components/modals/ApplyLeaveModal';
import { ApplyRemoteModal } from './components/modals/ApplyRemoteModal';
import { ApplyCorrectionModal } from './components/modals/ApplyCorrectionModal';
import { apiRequest } from './api/client';
import { RefreshCw } from 'lucide-react';

const MainApp: React.FC = () => {
  const { user, loading } = useAuth();
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');

  // Global modals
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showRemoteModal, setShowRemoteModal] = useState(false);
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);

  // Pending count for sidebar badge
  const [pendingCount, setPendingCount] = useState(0);

  const fetchPendingCounts = async () => {
    if (user && user.role !== 'employee') {
      try {
        const res = await apiRequest<{ company?: { pendingApprovals?: { total: number } } }>('/api/dashboard/summary');
        if (res.company?.pendingApprovals) {
          setPendingCount(res.company.pendingApprovals.total);
        }
      } catch {
        // ignore
      }
    }
  };

  useEffect(() => {
    fetchPendingCounts();
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white">
        <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center font-black text-slate-950 text-3xl shadow-xl shadow-teal-500/20 mb-4 animate-bounce">
          B
        </div>
        <div className="flex items-center gap-2 text-teal-400 font-bold text-xs uppercase tracking-widest">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          <span>Starting Boss Workforce...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginView />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-800 antialiased selection:bg-teal-500 selection:text-white">
      {/* Top Navbar */}
      <Navbar />

      {/* Main Body */}
      <div className="flex-1 flex max-w-[1600px] w-full mx-auto">
        {/* Desktop Sidebar */}
        <Sidebar
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
          pendingApprovalsCount={pendingCount}
        />

        {/* Content Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-24 md:pb-8 max-w-full overflow-x-hidden">
          {currentTab === 'dashboard' && (
            <DashboardView
              onNavigateTab={setCurrentTab}
              onOpenLeaveModal={() => setShowLeaveModal(true)}
              onOpenRemoteModal={() => setShowRemoteModal(true)}
            />
          )}

          {currentTab === 'attendance' && (
            <OneTapAttendance
              onNavigateTab={setCurrentTab}
              onOpenLeaveModal={() => setShowLeaveModal(true)}
              onOpenRemoteModal={() => setShowRemoteModal(true)}
              onOpenCorrectionModal={() => setShowCorrectionModal(true)}
            />
          )}

          {currentTab === 'history' && <AttendanceHistoryView />}

          {currentTab === 'requests' && (
            <RequestsApprovalsView
              initialSubTab="leave"
              onOpenLeaveModal={() => setShowLeaveModal(true)}
              onOpenRemoteModal={() => setShowRemoteModal(true)}
              onOpenCorrectionModal={() => setShowCorrectionModal(true)}
            />
          )}

          {currentTab === 'leaves' && (
            <RequestsApprovalsView
              initialSubTab="leave"
              onOpenLeaveModal={() => setShowLeaveModal(true)}
            />
          )}

          {currentTab === 'remote' && (
            <RequestsApprovalsView
              initialSubTab="remote"
              onOpenRemoteModal={() => setShowRemoteModal(true)}
            />
          )}

          {currentTab === 'calendar' && <CalendarView />}

          {currentTab === 'employees' && <EmployeesView />}

          {currentTab === 'reports' && <ReportsView />}

          {currentTab === 'settings' && <SettingsView />}

          {currentTab === 'audit' && <AuditLogsView />}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileNav
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        pendingApprovalsCount={pendingCount}
      />

      {/* Offline Status Warning Banner */}
      <OfflineIndicator />

      {/* Global Modals */}
      <ApplyLeaveModal
        isOpen={showLeaveModal}
        onClose={() => setShowLeaveModal(false)}
        onSuccess={() => {
          fetchPendingCounts();
        }}
      />

      <ApplyRemoteModal
        isOpen={showRemoteModal}
        onClose={() => setShowRemoteModal(false)}
        onSuccess={() => {
          fetchPendingCounts();
        }}
      />

      <ApplyCorrectionModal
        isOpen={showCorrectionModal}
        onClose={() => setShowCorrectionModal(false)}
        onSuccess={() => {
          fetchPendingCounts();
        }}
      />
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
