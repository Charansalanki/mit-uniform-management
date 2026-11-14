import React, { useEffect, useState, Fragment } from 'react';
import {
  LayoutDashboard,
  Shirt,
  CalendarDays,
  Users,
  Settings,
  GraduationCap,
  ShieldCheck,
  Bell,
  Menu,
  X,
  CheckCircle2,
  ArrowUpRight,
  CreditCard,
  Store,
  FileSpreadsheet,
  ShieldAlert,
  History,
  ChevronDown,
  ChevronRight,
  Power,
  type LucideIcon
} from 'lucide-react';
import { StudentRegistration, DistributionSchedule, AdminSummary, PaymentStats } from './types';
import { api, calculateSummary } from './api';
import { parseCampaignYears } from './mockData';
import { AdminDashboard } from './components/AdminDashboard';
import { RegistrationsTable } from './components/RegistrationsTable';
import { ScheduleManager } from './components/ScheduleManager';
import { SizeProductionReport } from './components/SizeProductionReport';
import { AdminSettings } from './components/AdminSettings';
import AdminAccountSettings from './components/admin/AdminAccountSettings';
import AdminApplicationController from './components/admin/AdminApplicationController';
import { AdminPaymentController, PaymentControllerTab } from './components/AdminPaymentController';
import { AdminVendorManagement } from './components/AdminVendorManagement';
import { MIT_SEAL_LOGO_BASE64 } from './utils/mitLogoBase64';
import { useRealtimeSystemSync } from './hooks/useRealtimeSystemSync';

export interface AdminProfile {
  id?: string | number;
  username?: string;
  name?: string;
  email?: string;
  role?: string;
  [key: string]: unknown;
}

export interface AppProps {
  adminProfile?: AdminProfile;
  onLogout?: () => void;
}

export default function App({ adminProfile, onLogout }: AppProps = {}) {
  const [page, setPage] = useState<string>('Dashboard');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [paymentTab, setPaymentTab] = useState<PaymentControllerTab>('VENDOR_MANAGEMENT');
  const [paymentExpanded, setPaymentExpanded] = useState<boolean>(true);
  const [paymentStats, setPaymentStats] = useState<PaymentStats | null>(null);

  // Core Data
  const [campaign, setCampaign] = useState<string>('Uniform Distribution 2027');
  const [registrations, setRegistrations] = useState<StudentRegistration[]>([]);
  const [schedules, setSchedules] = useState<DistributionSchedule[]>([]);
  const [summary, setSummary] = useState<AdminSummary>({ registered: 0, collected: 0, pending: 0, departments: 0 });
  const [toast, setToast] = useState<{ message: string; type?: 'info' | 'success' | 'error' } | null>(null);

  const { currentYear, academicYear } = parseCampaignYears(campaign);

  const showToast = (message: string, type: 'info' | 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3800);
  };

  // Initial Data Load
  const loadData = async () => {
    try {
      const [campName, regs, schs, sum, payConfig] = await Promise.all([
        api.getCampaignName().catch(() => 'Uniform Distribution 2027'),
        api.getRegistrations().catch(() => []),
        api.getSchedules().catch(() => []),
        api.getSummary().catch(() => ({ registered: 0, collected: 0, pending: 0, departments: 0 })),
        api.getAdminPaymentConfig().catch(() => null)
      ]);
      setCampaign(campName);
      setRegistrations(regs);
      setSchedules(schs);
      setSummary(sum || calculateSummary(regs));
      if (payConfig?.stats) {
        setPaymentStats(payConfig.stats);
      } else {
        setPaymentStats({
          totalSubmissions: 0,
          verifiedPayments: 0,
          pendingVerification: 0,
          rejectedPayments: 0,
          flaggedMismatches: 0,
          totalVerifiedCollection: 0,
          activePaymentMethods: 0,
          pendingByMethod: {}
        });
      }
    } catch {
      // safe fallback
    }
  };

  // Real-time synchronization: when database changes or sync state increments, auto-reload
  useRealtimeSystemSync({
    onSyncInvalidate: () => {
      loadData();
    }
  });

  useEffect(() => {
    loadData();
  }, []);

  // Auto-refresh when tab gains focus or on page switch
  useEffect(() => {
    const handleFocus = () => loadData();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  useEffect(() => {
    loadData();
  }, [page]);

  // Update summary whenever registrations change
  const syncSummary = (newRegs: StudentRegistration[]) => {
    setRegistrations(newRegs);
    setSummary(calculateSummary(newRegs));
  };

  // Actions
  const handleAddRegistration = async (
    data: Omit<StudentRegistration, 'id' | 'submitted_at' | 'edit_deadline' | 'collected_at' | 'collected_by'>
  ): Promise<StudentRegistration> => {
    const saved = await api.addRegistration(data);
    const updated = [saved, ...registrations];
    syncSummary(updated);
    showToast(`Added registration for ${saved.fullName} (${saved.usn})`);
    return saved;
  };

  const handleUpdateRegistration = async (id: string, updates: Partial<StudentRegistration>) => {
    const updated = await api.updateRegistration(id, updates);
    const list = registrations.map(r => (r.id === id ? updated : r));
    syncSummary(list);
    showToast(`Updated student ${updated.usn}`);
  };

  const handleToggleCollected = async (id: string, collected: boolean) => {
    const updated = await api.toggleCollection(id, collected, 'MIT Operations Desk');
    const list = registrations.map(r => (r.id === id ? updated : r));
    syncSummary(list);
    showToast(
      collected
        ? `Uniform marked as collected for ${updated.fullName} (${updated.usn})`
        : `Uniform collection undone for ${updated.usn}`,
      'info'
    );
  };

  const handleDeleteRegistration = async (id: string) => {
    await api.deleteRegistration(id);
    const list = registrations.filter(r => r.id !== id);
    syncSummary(list);
    showToast('Registration deleted', 'info');
  };

  const handleSaveSchedule = async (
    schedule: Omit<DistributionSchedule, 'id' | 'updated_at'> & { id?: string }
  ) => {
    const saved = await api.saveSchedule(schedule);
    const existing = schedules.some(s => s.id === saved.id);
    const list = existing ? schedules.map(s => (s.id === saved.id ? saved : s)) : [...schedules, saved];
    setSchedules(list);
    showToast(`Distribution schedule ${saved.department} Year ${saved.semester} saved!`);
  };

  const handleDeleteSchedule = async (id: string) => {
    await api.deleteSchedule(id);
    setSchedules(schedules.filter(s => s.id !== id));
    showToast('Schedule slot removed', 'info');
  };

  const handleUpdateCampaign = async (name: string) => {
    await api.setCampaignName(name);
    setCampaign(name);
    showToast('Campaign title updated');
  };

  const handleResetData = () => {
    api.resetAllData();
    setRegistrations([]);
    setSummary({ registered: 0, collected: 0, pending: 0, departments: 0 });
    setPaymentStats({
      totalSubmissions: 0,
      verifiedPayments: 0,
      pendingVerification: 0,
      rejectedPayments: 0,
      flaggedMismatches: 0,
      totalVerifiedCollection: 0,
      activePaymentMethods: 0,
      pendingByMethod: {}
    });
    loadData();
    showToast('All records cleared successfully', 'info');
  };

  const handleImportData = (newRegs: StudentRegistration[], newSchs: DistributionSchedule[]) => {
    localStorage.setItem('mit_uniform_registrations_v1', JSON.stringify(newRegs));
    localStorage.setItem('mit_uniform_schedules_v1', JSON.stringify(newSchs));
    setRegistrations(newRegs);
    setSchedules(newSchs);
    setSummary(calculateSummary(newRegs));
    showToast(`Imported ${newRegs.length} students & ${newSchs.length} schedules!`);
  };

  interface NavItem {
    name: string;
    icon: LucideIcon;
    badge?: number;
  }

  const navItems: NavItem[] = [
    { name: 'Dashboard', icon: LayoutDashboard },
    { name: 'Registrations', icon: Users, badge: summary.registered },
    { name: 'Size & Production', icon: Shirt },
    { name: 'Distribution Schedule', icon: CalendarDays },
    { name: 'PAYMENT CONTROLLER', icon: CreditCard },
    { name: 'Application Controller', icon: Power },
    { name: 'Settings', icon: Settings }
  ];

  const paymentSubItems: Array<{
    id: PaymentControllerTab;
    label: string;
    icon: LucideIcon;
    badge?: number;
  }> = [
      {
        id: 'VENDOR_MANAGEMENT',
        label: 'Vendor Management & Allocations',
        icon: Store
      },
      {
        id: 'VERIFICATION',
        label: 'Bank Verification',
        icon: CheckCircle2,
        badge: paymentStats?.pendingVerification || undefined
      },
      {
        id: 'RECONCILIATION',
        label: 'Bank CSV Reconciliation',
        icon: FileSpreadsheet
      },
      {
        id: 'AUDIT',
        label: 'Security Audit Logs',
        icon: ShieldAlert
      },
      {
        id: 'VENDOR_TRANSACTIONS',
        label: 'Vendor Transaction History',
        icon: History
      }
    ];

  return (
    <div className={`app ${sidebarOpen ? 'sidebar-open' : ''}`}>
      {/* Toast Notification */}
      {toast && (
        <div className={`toast-notification ${toast.type || 'success'}`}>
          <CheckCircle2 size={16} />
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)}><X size={14} /></button>
        </div>
      )}

      {/* Sidebar Overlay on mobile */}
      {sidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'active' : ''}`}>
        <div className="brand">
          <div className="crest">
            <img
              alt="MIT Mysore Logo"
              src="/mit-logo.png"
              onError={(e) => {
                const target = e.currentTarget;
                if (!target.src.includes('logo.png')) {
                  target.src = '/logo.png';
                } else if (!target.src.startsWith('data:')) {
                  target.src = MIT_SEAL_LOGO_BASE64;
                }
              }}
              className="mit-admin-crest-img"
            />
          </div>
          <div>
            <b>MIT MYSORE</b>
            <small>ADMIN PANEL</small>
          </div>
        </div>

        <div className="workspace">
          ADMIN CONTROL PANEL <span>▾</span>
        </div>

        <nav>
          {navItems.map(({ name, icon: Icon, badge }) => (
            <React.Fragment key={name}>
              {name === 'PAYMENT CONTROLLER' ? (
                <>
                  <button
                    className={`navitem ${(page === 'PAYMENT CONTROLLER' || page === 'VENDOR MANAGEMENT') ? 'active' : ''}`}
                    onClick={() => {
                      setPage('PAYMENT CONTROLLER');
                      setPaymentExpanded(true);
                      setSidebarOpen(false);
                    }}
                    style={{ position: 'relative' }}
                  >
                    <Icon size={17} style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.2px' }}>{name}</span>
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                      {paymentStats?.pendingVerification !== undefined && paymentStats.pendingVerification > 0 && (
                        <em style={{ margin: 0 }}>{paymentStats.pendingVerification}</em>
                      )}
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          setPaymentExpanded(!paymentExpanded);
                        }}
                        style={{
                          padding: '2px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          color: (page === 'PAYMENT CONTROLLER' || page === 'VENDOR MANAGEMENT') ? '#93c5fd' : '#64748b'
                        }}
                        title={paymentExpanded ? 'Collapse Sub-menu' : 'Expand Sub-menu'}
                      >
                        {paymentExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </span>
                    </div>
                  </button>

                  {paymentExpanded && (
                    <div
                      style={{
                        paddingLeft: '6px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                        margin: '2px 0 6px 6px',
                        borderLeft: '2px solid rgba(59, 130, 246, 0.4)',
                        boxSizing: 'border-box'
                      }}
                    >
                      {paymentSubItems.map((sub) => {
                        const SubIcon = sub.icon;
                        const isSubActive = (page === 'PAYMENT CONTROLLER' || page === 'VENDOR MANAGEMENT') && paymentTab === sub.id;
                        return (
                          <button
                            key={sub.id}
                            type="button"
                            className={`navitem-sub ${isSubActive ? 'active' : ''}`}
                            title={sub.label}
                            onClick={() => {
                              setPage('PAYMENT CONTROLLER');
                              setPaymentTab(sub.id);
                              setSidebarOpen(false);
                            }}
                          >
                            <SubIcon size={14} style={{ flexShrink: 0, color: isSubActive ? '#60a5fa' : '#64748b' }} />
                            <span>{sub.label}</span>
                            {sub.badge !== undefined && sub.badge > 0 && (
                              <em>{sub.badge}</em>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <button
                  className={`navitem ${page === name ? 'active' : ''}`}
                  onClick={() => {
                    setPage(name);
                    setSidebarOpen(false);
                  }}
                >
                  <Icon size={17} />
                  <span>{name}</span>
                  {badge !== undefined && <em>{badge}</em>}
                </button>
              )}
            </React.Fragment>
          ))}
        </nav>

        <div className="sidebottom">
          <div className="helpbox">
            <div className="helpicon">✦</div>
            <b>Uniform Office</b>
            <p>Maharaja Institute of Technology Mysore, Belagola, Srirangapatna.</p>
          </div>

          <div className="profile">
            <div className="flex items-center gap-2">
              <div className="avatar" title={`Admin: ${adminProfile?.username || 'MIT'}`}>
                {(adminProfile?.username || 'MIT').slice(0, 2).toUpperCase()}
              </div>
              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="px-2.5 py-1 text-xs font-bold text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg cursor-pointer transition"
                  title="Sign Out of Admin Console"
                >
                  Logout
                </button>
              )}
            </div>
            <div className="profile-text">
              <b>MIT Administrator</b>
              <small>Uniform Coordination Desk</small>
            </div>
            <ShieldCheck size={16} className="profile-badge" />
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main">
        {/* Top Header */}
        <header>
          <div className="header-left">
            <button
              className="mobilemenu"
              aria-label="Toggle navigation menu"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <Menu size={20} />
            </button>
            <div className="crumb">
              MIT Mysore <span>/</span> <b>Admin Panel</b> <span>/</span> <b>{page}</b>
              {(page === 'PAYMENT CONTROLLER' || page === 'VENDOR MANAGEMENT') && (
                <>
                  <span>/</span>{' '}
                  <b style={{ color: '#2563eb' }}>
                    {paymentSubItems.find((s) => s.id === (page === 'VENDOR MANAGEMENT' ? 'VENDOR_MANAGEMENT' : paymentTab))?.label || paymentTab}
                  </b>
                </>
              )}
            </div>
          </div>

          <div className="headeractions">
            <div className="admin-status-badge">
              <ShieldCheck size={14} /> Admin Access Active
            </div>

            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="student-portal-link"
              title="Open Student Registration Portal"
            >
              <ArrowUpRight size={14} /> Student Portal
            </a>

            <div className="live">
              <i /> Campus Operations Live
            </div>

            <button
              className="iconbtn"
              aria-label="Notifications"
              onClick={() => showToast(`Status: ${registrations.length} students enrolled in ${campaign}.`, 'info')}
            >
              <Bell size={18} />
              <i />
            </button>

            <div className="flex items-center gap-2">
              <div className="avatar" title={`Admin: ${adminProfile?.username || 'MIT'}`}>
                {(adminProfile?.username || 'MIT').slice(0, 2).toUpperCase()}
              </div>
              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="px-2.5 py-1 text-xs font-bold text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg cursor-pointer transition"
                  title="Sign Out of Admin Console"
                >
                  Logout
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Dynamic Page Views */}
        <div className="content">
          {page === 'Dashboard' && (
            <AdminDashboard
              summary={summary}
              campaign={campaign}
              registrations={registrations}
              schedules={schedules}
              onNavigate={setPage}
              onRefresh={loadData}
              onToggleCollected={handleToggleCollected}
            />
          )}

          {page === 'Registrations' && (
            <RegistrationsTable
              campaign={campaign}
              registrations={registrations}
              onAdd={handleAddRegistration}
              onUpdate={handleUpdateRegistration}
              onToggleCollected={handleToggleCollected}
              onDelete={handleDeleteRegistration}
              onRefresh={loadData}
            />
          )}

          {page === 'Size & Production' && (
            <SizeProductionReport
              registrations={registrations}
              onToggleCollected={handleToggleCollected}
            />
          )}

          {page === 'Distribution Schedule' && (
            <ScheduleManager
              schedules={schedules}
              onSaveSchedule={handleSaveSchedule}
              onDeleteSchedule={handleDeleteSchedule}
              onRefresh={loadData}
            />
          )}


          {(page === 'PAYMENT CONTROLLER' || page === 'VENDOR MANAGEMENT') && (
            <AdminPaymentController
              activeTab={page === 'VENDOR MANAGEMENT' ? 'VENDOR_MANAGEMENT' : paymentTab}
              onTabChange={(tab) => setPaymentTab(tab)}
              onStatsLoaded={(stats) => setPaymentStats(stats)}
            />
          )}

          {page === 'Application Controller' && (
            <div className="space-y-6">
              <AdminApplicationController />
            </div>
          )}

          {page === 'Settings' && (
            <div className="space-y-6">
              <AdminApplicationController />
              <AdminAccountSettings
                adminProfile={adminProfile}
                onLogout={onLogout}
              />
              <AdminSettings
                campaign={campaign}
                onUpdateCampaign={handleUpdateCampaign}
                registrations={registrations}
                schedules={schedules}
                onResetData={handleResetData}
                onImportData={handleImportData}
              />
            </div>
          )}

          {/* Footer */}
          <footer>
            <div>
              © {currentYear} Maharaja Institute of Technology Mysore · Uniform Administration Portal
            </div>
            <span>
              Academic Operations ({academicYear}) · Campus Management System
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}
