import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { AGN_CONTACT } from '../../config/agn-contact';
import {
  LayoutDashboard,
  Clock,
  CalendarCheck2,
  FileCheck2,
  Users,
  FileSpreadsheet,
  Settings,
  ShieldCheck,
  Palmtree,
  Laptop,
  GraduationCap,
  ContactRound,
  BriefcaseBusiness,
  Globe, Facebook, MessageCircle, Mail,
} from 'lucide-react';

export type NavTab =
  | 'dashboard'
  | 'attendance'
  | 'history'
  | 'requests'
  | 'leaves'
  | 'remote'
  | 'calendar'
  | 'employees'
  | 'reports'
  | 'settings'
  | 'audit'
  | 'ambassadors'
  | 'crm'
  | 'commission_team';

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  pendingApprovalsCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  pendingApprovalsCount = 0,
}) => {
  const { user } = useAuth();
  const isAdminOrManager = user?.role !== 'employee';
  const isSuperAdmin = user?.role === 'super_admin';
  const isAdmin = user?.role === 'super_admin' || user?.role === 'hr_admin';

  const navItems = [
    {
      id: 'dashboard' as NavTab,
      label: 'Dashboard',
      icon: LayoutDashboard,
      show: true,
    },
    {
      id: 'attendance' as NavTab,
      label: 'One-Tap Attendance',
      icon: Clock,
      show: !isSuperAdmin,
      badge: 'Live',
    },
    {
      id: 'history' as NavTab,
      label: 'Attendance History',
      icon: CalendarCheck2,
      show: true,
    },
    {
      id: 'requests' as NavTab,
      label: 'Approvals & Requests',
      icon: FileCheck2,
      show: true,
      badgeCount: isAdminOrManager ? pendingApprovalsCount : undefined,
    },
    {
      id: 'leaves' as NavTab,
      label: 'Leave Management',
      icon: Palmtree,
      show: true,
    },
    {
      id: 'remote' as NavTab,
      label: 'Remote Work',
      icon: Laptop,
      show: true,
    },
    {
      id: 'employees' as NavTab,
      label: 'Employees',
      icon: Users,
      show: isAdminOrManager,
    },
    {
      id: 'reports' as NavTab,
      label: 'Reports & Excel',
      icon: FileSpreadsheet,
      show: true,
    },
    {
      id: 'settings' as NavTab,
      label: 'Office Settings',
      icon: Settings,
      show: isSuperAdmin,
    },
    {
      id: 'ambassadors' as NavTab,
      label: 'Campus Ambassador Hub',
      icon: GraduationCap,
      show: isAdminOrManager,
    },
    {
      id: 'crm' as NavTab,
      label: 'Leads & Clients',
      icon: ContactRound,
      show: true,
    },
    {
      id: 'commission_team' as NavTab,
      label: 'Commission-Based Team',
      icon: BriefcaseBusiness,
      show: isAdminOrManager,
    },
    {
      id: 'audit' as NavTab,
      label: 'Audit History',
      icon: ShieldCheck,
      show: isAdmin,
    },
  ];

  return (
    <aside className="boss-chrome w-64 bg-slate-900 border-r border-slate-800 flex-shrink-0 hidden md:flex flex-col h-[calc(100vh-4rem)] sticky top-16 select-none">
      {/* Navigation list */}
      <div className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Navigation
        </div>

        {navItems
          .filter(item => item.show)
          .map(item => {
            const Icon = item.icon;
            const active = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition cursor-pointer ${
                  active
                    ? 'bg-teal-500/15 text-teal-400 font-semibold border border-teal-500/30 shadow-xs'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 ${
                      active ? 'text-teal-400' : 'text-slate-400'
                    }`}
                  />
                  <span>{item.label}</span>
                </div>

                {item.badge && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    {item.badge}
                  </span>
                )}

                {item.badgeCount !== undefined && item.badgeCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950">
                    {item.badgeCount}
                  </span>
                )}
              </button>
            );
          })}
      </div>

      {/* Workplace Policy Footer info */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-950/40 text-[11px] text-slate-400">
        <div className="flex items-center justify-between mb-1">
          <span className="text-slate-400 font-medium">Schedule:</span>
          <span className="text-slate-200 font-mono">11:00 AM - 7:00 PM</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-400 font-medium">GPS Radius:</span>
          <span className="text-teal-400 font-mono">300 metres</span>
        </div>
        <div className="mt-2 border-t border-slate-700 pt-2">
          <a className="flex items-center gap-1 text-teal-300 hover:text-white underline underline-offset-2" href={AGN_CONTACT.whatsappUrl} target="_blank" rel="noopener noreferrer" aria-label={`AGN WhatsApp ${AGN_CONTACT.whatsappDisplay}`}><MessageCircle size={13}/> {AGN_CONTACT.whatsappDisplay}</a>
          <div className="mt-2 flex gap-4">
            <a href={AGN_CONTACT.website} target="_blank" rel="noopener noreferrer" title="Official AGN website" aria-label="Official AGN website" className="text-slate-300 hover:text-white"><Globe size={15}/></a>
            <a href={AGN_CONTACT.facebook} target="_blank" rel="noopener noreferrer" title="AGN Facebook" aria-label="AGN Facebook" className="text-slate-300 hover:text-white"><Facebook size={15}/></a>
            <a href={`mailto:${AGN_CONTACT.email}`} title={AGN_CONTACT.email} aria-label={`Email ${AGN_CONTACT.email}`} className="text-slate-300 hover:text-white"><Mail size={15}/></a>
          </div>
        </div>
      </div>
    </aside>
  );
};
