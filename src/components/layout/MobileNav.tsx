import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { NavTab } from './Sidebar';
import {
  LayoutDashboard,
  Clock,
  FileCheck2,
  CalendarDays,
  Menu,
  X,
  Users,
  FileSpreadsheet,
  Settings,
  ShieldCheck,
  Palmtree,
  Laptop,
  GraduationCap,
} from 'lucide-react';

interface MobileNavProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  pendingApprovalsCount?: number;
}

export const MobileNav: React.FC<MobileNavProps> = ({
  currentTab,
  onSelectTab,
  pendingApprovalsCount = 0,
}) => {
  const { user } = useAuth();
  const [showDrawer, setShowDrawer] = useState(false);
  const isAdminOrManager = user?.role !== 'employee';
  const isSuperAdmin = user?.role === 'super_admin';
  const isAdmin = user?.role === 'super_admin' || user?.role === 'hr_admin';

  const handleSelect = (tab: NavTab) => {
    onSelectTab(tab);
    setShowDrawer(false);
  };

  const moreItems = [
    { id: 'history' as NavTab, label: 'Attendance History', icon: Clock },
    { id: 'leaves' as NavTab, label: 'Leave Management', icon: Palmtree },
    { id: 'remote' as NavTab, label: 'Remote Work Requests', icon: Laptop },
    { id: 'reports' as NavTab, label: 'Reports & Excel Export', icon: FileSpreadsheet },
    ...(isAdminOrManager
      ? [{ id: 'employees' as NavTab, label: 'Employee Directory', icon: Users }]
      : []),
    ...(isAdminOrManager
      ? [{ id: 'ambassadors' as NavTab, label: 'Campus Ambassador Hub', icon: GraduationCap }]
      : []),
    ...(isSuperAdmin
      ? [{ id: 'settings' as NavTab, label: 'Office Settings', icon: Settings }]
      : []),
    ...(isAdmin
      ? [{ id: 'audit' as NavTab, label: 'Audit History', icon: ShieldCheck }]
      : []),
  ];

  return (
    <>
      {/* Bottom Floating/Fixed Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 px-2 py-1.5 flex items-center justify-around shadow-2xl safe-area-bottom">
        <button
          onClick={() => handleSelect('dashboard')}
          className={`flex flex-col items-center justify-center p-2 rounded-xl text-[10px] font-medium transition cursor-pointer ${
            currentTab === 'dashboard'
              ? 'text-teal-400 font-bold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <LayoutDashboard className="w-5 h-5 mb-0.5" />
          <span>Home</span>
        </button>

        <button
          onClick={() => handleSelect('attendance')}
          className={`flex flex-col items-center justify-center p-2 rounded-xl text-[10px] font-medium transition cursor-pointer relative ${
            currentTab === 'attendance'
              ? 'text-teal-400 font-bold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <div className="relative">
            <Clock className="w-5 h-5 mb-0.5" />
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <span>Punch</span>
        </button>

        <button
          onClick={() => handleSelect('requests')}
          className={`flex flex-col items-center justify-center p-2 rounded-xl text-[10px] font-medium transition cursor-pointer relative ${
            currentTab === 'requests'
              ? 'text-teal-400 font-bold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <div className="relative">
            <FileCheck2 className="w-5 h-5 mb-0.5" />
            {isAdminOrManager && pendingApprovalsCount > 0 && (
              <span className="absolute -top-1 -right-2 px-1 rounded-full bg-amber-500 text-slate-950 text-[9px] font-bold">
                {pendingApprovalsCount}
              </span>
            )}
          </div>
          <span>Requests</span>
        </button>

        <button
          onClick={() => handleSelect('calendar')}
          className={`flex flex-col items-center justify-center p-2 rounded-xl text-[10px] font-medium transition cursor-pointer ${
            currentTab === 'calendar'
              ? 'text-teal-400 font-bold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <CalendarDays className="w-5 h-5 mb-0.5" />
          <span>Calendar</span>
        </button>

        <button
          onClick={() => setShowDrawer(true)}
          className={`flex flex-col items-center justify-center p-2 rounded-xl text-[10px] font-medium transition cursor-pointer ${
            showDrawer ? 'text-teal-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Menu className="w-5 h-5 mb-0.5" />
          <span>More</span>
        </button>
      </nav>

      {/* Mobile Drawer */}
      {showDrawer && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-slate-950/70 backdrop-blur-xs md:hidden animate-in fade-in duration-150">
          <div
            className="w-full bg-slate-900 border-t border-slate-800 rounded-t-3xl p-6 shadow-2xl space-y-4 max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-teal-500 text-slate-950 font-black flex items-center justify-center text-sm">
                  B
                </div>
                <h3 className="text-sm font-bold text-white">More Modules</h3>
              </div>
              <button
                onClick={() => setShowDrawer(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {moreItems.map(item => {
                const Icon = item.icon;
                const active = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelect(item.id)}
                    className={`flex items-center gap-2.5 p-3 rounded-2xl text-left text-xs font-semibold transition cursor-pointer ${
                      active
                        ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
                        : 'bg-slate-800/80 text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-4 h-4 text-teal-400 flex-shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="pt-2 text-center">
              <button
                onClick={() => setShowDrawer(false)}
                className="w-full py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 cursor-pointer"
              >
                Close Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
