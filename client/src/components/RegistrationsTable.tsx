import { useState, useEffect, useCallback, useRef } from 'react';
import {
  StudentRegistration,
  ShirtSize,
  TrouserSize,
  Gender,
  PaginationInfo
} from '../types';
import { DEPARTMENTS, SEMESTERS, ALL_SECTIONS, formatAcademicYear } from '../mockData';
import { api } from '../api';
import {
  Search,
  Plus,
  Download,
  CheckCircle2,
  Clock3,
  Edit3,
  Trash2,
  Printer,
  X,
  FileSpreadsheet,
  Check,
  RefreshCw,
  Phone,
  ChevronLeft,
  ChevronRight,
  Loader2,
  PackageCheck,
  AlertCircle
} from 'lucide-react';
import AdminStudentRegistrationsTable from './admin/AdminStudentRegistrationsTable';
import TailorMeasurementReportModal from './shared/TailorMeasurementReportModal';

interface Props {
  campaign?: string;
  registrations: StudentRegistration[];
  onAdd: (data: any) => Promise<any>;
  onUpdate: (id: string, updates: Partial<StudentRegistration>) => Promise<void>;
  onToggleCollected: (id: string, collected: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onRefresh: () => void;
}

export function RegistrationsTable({
  campaign,
  onAdd,
  onUpdate,
  onToggleCollected,
  onDelete,
  onRefresh
}: Props) {
  // Search & Filter State
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [genderFilter, setGenderFilter] = useState<'all' | 'Male' | 'Female'>('all');
  const [semFilter, setSemFilter] = useState<number | ''>('');
  const [secFilter, setSecFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'collected' | 'pending'>('all');
  const [payFilter, setPayFilter] = useState<'all' | 'paid' | 'pending_verification' | 'not_paid'>('all');
  const [prodFilter, setProdFilter] = useState<string>('all');

  // Server Pagination State
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [sortBy, setSortBy] = useState('submitted_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Data & Query Status State
  const [items, setItems] = useState<StudentRegistration[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    pageSize: 25,
    total: 0,
    totalPages: 1,
    hasNext: false,
    hasPrev: false
  });
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Selected IDs for Bulk Actions
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Modals & Dialogs
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<StudentRegistration | null>(null);
  const [printSlipStudent, setPrintSlipStudent] = useState<StudentRegistration | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [selectedTailorStudent, setSelectedTailorStudent] = useState<any>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formGender, setFormGender] = useState<Gender>('Male');
  const [formUsn, setFormUsn] = useState('');
  const [formDept, setFormDept] = useState('CSE');
  const [formSem, setFormSem] = useState(1);
  const [formSec, setFormSec] = useState('A');
  const [formPhone, setFormPhone] = useState('');
  const [formShirt, setFormShirt] = useState<ShirtSize>('M');
  const [formTrouser, setFormTrouser] = useState<TrouserSize>('32');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [activeTab, setActiveTab] = useState<'table' | 'form' | 'lifecycle'>('table');
  const [formSuccess, setFormSuccess] = useState('');

  // ─── Debounce Search (250–350ms Amazon style) ──────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1); // Reset to page 1 on new search
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // ─── Fetch Server Paginated Data ──────────────────────────────
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await api.getPaginatedRegistrations({
        page,
        pageSize,
        search: debouncedSearch,
        department: deptFilter || undefined,
        gender: genderFilter !== 'all' ? genderFilter : undefined,
        semester: semFilter || undefined,
        section: secFilter || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        paymentStatus: payFilter !== 'all' ? payFilter : undefined,
        productionStatus: prodFilter !== 'all' ? prodFilter : undefined,
        sortBy,
        sortOrder
      });
      setItems(res.items);
      setPagination(res.pagination);
    } catch (err: any) {
      setLoadError(err.message || 'Failed to load student registrations.');
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, debouncedSearch, deptFilter, genderFilter, semFilter, secFilter, statusFilter, payFilter, prodFilter, sortBy, sortOrder]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    fetchData();
    onRefresh();
  };

  // ─── Bulk Selection ───────────────────────────────────────────
  const toggleSelectAll = () => {
    if (selectedIds.length === items.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(items.map(r => r.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const handleBulkCollect = async () => {
    for (const id of selectedIds) {
      await onToggleCollected(id, true);
    }
    setSelectedIds([]);
    handleRefresh();
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedIds.length} selected registration(s)?`)) return;
    for (const id of selectedIds) {
      await onDelete(id);
    }
    setSelectedIds([]);
    handleRefresh();
  };

  // ─── Status Workflow Updates ──────────────────────────────────
  const handleUpdateProductionStatus = async (studentId: string, newStatus: 'pending' | 'in_production' | 'ready') => {
    try {
      await api.updateStatus(studentId, { productionStatus: newStatus });
      handleRefresh();
    } catch (err: any) {
      alert(err.message || 'Could not update production status');
    }
  };

  // ─── Export to CSV ────────────────────────────────────────────
  const exportCSV = () => {
    const targetList = selectedIds.length > 0 ? items.filter(r => selectedIds.includes(r.id)) : items;
    if (targetList.length === 0) {
      alert('⚠️ No student records to export.');
      return;
    }

    const headers = [
      'Registration ID',
      'USN',
      'Full Name',
      'Gender',
      'Department',
      'Year',
      'Section',
      'Phone',
      'Shirt Size',
      'Trouser Size',
      'Production Status',
      'Distribution Status',
      'Collection Room',
      'Collected At',
      'Collected By',
      'Submission Date'
    ];

    const escapeCSV = (val: any) => {
      if (val === null || val === undefined) return '""';
      let s = String(val).replace(/"/g, '""');
      if (/^[=\+\-@\t\r]/.test(s)) {
        s = `'${s}`;
      }
      return `"${s}"`;
    };

    const rows = targetList.map(r => [
      r.id.toUpperCase().startsWith('#') ? r.id.toUpperCase() : `#${r.id.toUpperCase()}`,
      r.usn,
      r.fullName,
      r.gender || 'Male',
      r.department,
      formatAcademicYear(r.semester),
      r.section,
      r.phone,
      r.shirtSize,
      `${r.trouserSize}"`,
      r.productionStatus || 'pending',
      r.distributionStatus || (r.collected_at ? 'collected' : 'pending'),
      r.collectionRoom || 'N/A',
      r.collected_at ? new Date(r.collected_at).toLocaleString('en-IN') : 'N/A',
      r.collected_by || (r.collected_at ? 'Admin Desk' : 'N/A'),
      new Date(r.submitted_at).toLocaleDateString('en-IN')
    ]);

    const csvContent = [
      headers.map(escapeCSV).join(','),
      ...rows.map(e => e.map(escapeCSV).join(','))
    ].join('\r\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `MIT_Uniform_Registrations_Page_${pagination.page}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const openAdd = () => {
    setFormName('');
    setFormGender('Male');
    setFormUsn('');
    setFormDept('CSE');
    setFormSem(1);
    setFormSec('A');
    setFormPhone('');
    setFormShirt('M');
    setFormTrouser('32');
    setFormError('');
    setShowAddModal(true);
  };

  const openEdit = (s: StudentRegistration) => {
    setEditingStudent(s);
    setFormName(s.fullName);
    setFormGender(s.gender || 'Male');
    setFormUsn(s.usn);
    setFormDept(s.department);
    setFormSem(s.semester);
    setFormSec(s.section);
    setFormPhone(s.phone);
    setFormShirt(s.shirtSize);
    setFormTrouser(s.trouserSize);
    setFormError('');
  };

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setIsSubmitting(true);
    try {
      if (!/^[6-9]\d{9}$/.test(formPhone.trim())) {
        throw new Error('Please enter a valid 10-digit Indian phone number.');
      }
      await onAdd({
        fullName: formName.trim(),
        gender: formGender,
        usn: formUsn.trim().toUpperCase(),
        department: formDept,
        semester: formSem,
        section: formSec,
        phone: formPhone.trim(),
        shirtSize: formShirt,
        trouserSize: formTrouser
      });
      setShowAddModal(false);
      handleRefresh();
    } catch (err: any) {
      setFormError(err.message || 'Could not save student.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    setFormError('');
    setIsSubmitting(true);
    try {
      await onUpdate(editingStudent.id, {
        fullName: formName.trim(),
        gender: formGender,
        usn: formUsn.trim().toUpperCase(),
        department: formDept,
        semester: formSem,
        section: formSec,
        phone: formPhone.trim(),
        shirtSize: formShirt,
        trouserSize: formTrouser
      });
      setEditingStudent(null);
      handleRefresh();
    } catch (err: any) {
      setFormError(err.message || 'Could not update student.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitInlineAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    setIsSubmitting(true);
    try {
      if (!/^[6-9]\d{9}$/.test(formPhone.trim())) {
        throw new Error('Please enter a valid 10-digit Indian phone number.');
      }
      const saved = await onAdd({
        fullName: formName.trim(),
        gender: formGender,
        usn: formUsn.trim().toUpperCase(),
        department: formDept,
        semester: formSem,
        section: formSec,
        phone: formPhone.trim(),
        shirtSize: formShirt,
        trouserSize: formTrouser
      });
      setFormSuccess(`Student ${saved.fullName} (${saved.usn}) registered successfully!`);
      setFormName('');
      setFormUsn('');
      setFormPhone('');
      handleRefresh();
    } catch (err: any) {
      setFormError(err.message || 'Could not save student.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="admin-table-container">
      {/* Sub Tabs: Directory vs Registration Form vs Payment Tracking Status */}
      <div className="sub-nav-tabs">
        <button
          className={`sub-nav-tab ${activeTab === 'table' ? 'active' : ''}`}
          onClick={() => setActiveTab('table')}
        >
          <FileSpreadsheet size={15} /> All Registrations Directory ({pagination.total})
        </button>
        <button
          className={`sub-nav-tab ${activeTab === 'lifecycle' ? 'active' : ''}`}
          onClick={() => setActiveTab('lifecycle')}
        >
          <CheckCircle2 size={15} /> Payment & Tracking Status
        </button>
        <button
          className={`sub-nav-tab ${activeTab === 'form' ? 'active' : ''}`}
          onClick={() => {
            openAdd();
            setActiveTab('form');
          }}
        >
          <Plus size={15} /> Student Uniform Registration Form
        </button>
      </div>

      {activeTab === 'lifecycle' ? (
        <div style={{ marginTop: '0.75rem' }}>
          <AdminStudentRegistrationsTable />
        </div>
      ) : activeTab === 'form' ? (
        <div className="panel formpanel">
          <div className="panelhead">
            <div>
              <h3>Student Uniform Registration Form</h3>
              <p>Submit size measurements and academic details for uniform allocation</p>
            </div>
            <button className="textbtn" onClick={() => setActiveTab('table')}>
              View all registrations ({pagination.total}) →
            </button>
          </div>

          <form onSubmit={submitInlineAdd} className="formgrid">
            <label>
              Full Name (as per ID card)
              <input
                required
                type="text"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="e.g. Aarav Sharma"
              />
            </label>

            <label>
              Gender
              <select value={formGender} onChange={e => setFormGender(e.target.value as Gender)}>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </label>

            <label>
              University Seat Number (USN)
              <input
                required
                type="text"
                value={formUsn}
                onChange={e => setFormUsn(e.target.value)}
                placeholder="e.g. 4MH22CS001"
              />
            </label>

            <label>
              Department / Branch
              <select value={formDept} onChange={e => setFormDept(e.target.value)}>
                <optgroup label="Undergraduate Engineering (B.E.)">
                  {DEPARTMENTS.filter(d => d.category === 'Undergraduate (B.E.)').map(d => (
                    <option key={d.code} value={d.code}>{d.code} – {d.name}</option>
                  ))}
                </optgroup>
                <optgroup label="Postgraduate Programs">
                  {DEPARTMENTS.filter(d => d.category === 'Postgraduate').map(d => (
                    <option key={d.code} value={d.code}>{d.code} – {d.name}</option>
                  ))}
                </optgroup>
              </select>
            </label>

            <label>
              Mobile Number (10 digits)
              <input
                required
                type="tel"
                value={formPhone}
                onChange={e => setFormPhone(e.target.value)}
                placeholder="e.g. 9845123456"
              />
            </label>

            <label>
              Year
              <select value={formSem} onChange={e => setFormSem(Number(e.target.value))}>
                {SEMESTERS.map(s => (
                  <option key={s.number} value={s.number}>{s.label}</option>
                ))}
              </select>
            </label>

            <label>
              Section
              <select value={formSec} onChange={e => setFormSec(e.target.value)}>
                {ALL_SECTIONS.map(s => (
                  <option key={s} value={s}>Section {s}</option>
                ))}
              </select>
            </label>

            <label>
              Shirt Size
              <select value={formShirt} onChange={e => setFormShirt(e.target.value as ShirtSize)}>
                {['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'].map(sz => (
                  <option key={sz} value={sz}>{sz}</option>
                ))}
              </select>
            </label>

            <label>
              Trouser Size (Waist in Inches)
              <select value={formTrouser} onChange={e => setFormTrouser(e.target.value as TrouserSize)}>
                {['28', '30', '32', '34', '36', '38', '40', '42', '44'].map(sz => (
                  <option key={sz} value={sz}>{sz} inches</option>
                ))}
              </select>
            </label>

            {formError && <div className="modal-error full-width">{formError}</div>}
            {formSuccess && (
              <div className="notice full-width">
                <Check size={16} /> {formSuccess}
              </div>
            )}

            <div className="formfoot">
              <span>One registration per student USN. 2 shirts and 2 trousers are issued per student.</span>
              <button type="submit" className="primary" disabled={isSubmitting}>
                <Plus size={16} /> {isSubmitting ? 'Saving Registration...' : 'Submit Registration'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <>
          {/* Top Action Bar */}
          <div className="table-top-bar">
            <div className="search-box">
              <Search size={16} />
              <input
                type="text"
                placeholder="Amazon-Style Search: USN, Student Name, Reg ID, Mobile..."
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
              />
              {isLoading ? (
                <Loader2 size={16} className="table-spinner" style={{ color: 'var(--primary)' }} />
              ) : searchInput ? (
                <button className="clear-btn" onClick={() => setSearchInput('')}>
                  <X size={14} />
                </button>
              ) : null}
            </div>

            <div className="table-actions">
              <button className="btn-secondary" onClick={exportCSV} title="Export filtered records to CSV">
                <Download size={15} /> Export CSV
              </button>
              <button className="btn-secondary" onClick={() => window.print()} title="Print manifest list">
                <Printer size={15} /> Print Manifest
              </button>
              <button className="btn-secondary" onClick={handleRefresh} title="Reload registrations">
                <RefreshCw size={15} /> Refresh
              </button>
              <button className="btn-primary" onClick={() => setActiveTab('form')}>
                <Plus size={16} /> Register Student
              </button>
            </div>
          </div>

          {/* Filter Row */}
          <div className="filter-bar">
            <div className="filter-group">
              <label>Dept:</label>
              <select value={deptFilter} onChange={e => { setDeptFilter(e.target.value); setPage(1); }}>
                <option value="">All Departments</option>
                <optgroup label="Undergraduate Engineering (B.E.)">
                  {DEPARTMENTS.filter(d => d.category === 'Undergraduate (B.E.)').map(d => (
                    <option key={d.code} value={d.code}>{d.code} – {d.name}</option>
                  ))}
                </optgroup>
                <optgroup label="Postgraduate Programs">
                  {DEPARTMENTS.filter(d => d.category === 'Postgraduate').map(d => (
                    <option key={d.code} value={d.code}>{d.code} – {d.name}</option>
                  ))}
                </optgroup>
              </select>
            </div>

            <div className="filter-group">
              <label>Gender:</label>
              <select value={genderFilter} onChange={e => { setGenderFilter(e.target.value as any); setPage(1); }}>
                <option value="all">All Genders</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>

            <div className="filter-group">
              <label>Year:</label>
              <select value={semFilter} onChange={e => { setSemFilter(e.target.value ? Number(e.target.value) : ''); setPage(1); }}>
                <option value="">All Years</option>
                {SEMESTERS.map(s => (
                  <option key={s.number} value={s.number}>{s.label}</option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label>Sec:</label>
              <select value={secFilter} onChange={e => { setSecFilter(e.target.value); setPage(1); }}>
                <option value="">All Sections</option>
                {ALL_SECTIONS.map(sec => (
                  <option key={sec} value={sec}>Sec {sec}</option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label>Payment:</label>
              <select value={payFilter} onChange={e => { setPayFilter(e.target.value as any); setPage(1); }}>
                <option value="all">All Payments</option>
                <option value="paid">Paid (Verified)</option>
                <option value="pending_verification">Pending Verification</option>
                <option value="not_paid">Not Paid</option>
              </select>
            </div>

            <div className="filter-group">
              <label>Production:</label>
              <select value={prodFilter} onChange={e => { setProdFilter(e.target.value); setPage(1); }}>
                <option value="all">All Production</option>
                <option value="pending">Pending</option>
                <option value="in_production">In Production</option>
                <option value="ready">Ready for Pickup</option>
              </select>
            </div>

            <div className="filter-group">
              <label>Status:</label>
              <div className="status-tabs">
                <button
                  className={statusFilter === 'all' ? 'active' : ''}
                  onClick={() => { setStatusFilter('all'); setPage(1); }}
                >
                  All
                </button>
                <button
                  className={statusFilter === 'collected' ? 'active' : ''}
                  onClick={() => { setStatusFilter('collected'); setPage(1); }}
                >
                  Collected
                </button>
                <button
                  className={statusFilter === 'pending' ? 'active' : ''}
                  onClick={() => { setStatusFilter('pending'); setPage(1); }}
                >
                  Pending
                </button>
              </div>
            </div>

            {(deptFilter || semFilter || secFilter || statusFilter !== 'all' || prodFilter !== 'all' || searchInput) && (
              <button
                className="clear-filters-btn"
                onClick={() => {
                  setDeptFilter('');
                  setSemFilter('');
                  setSecFilter('');
                  setStatusFilter('all');
                  setProdFilter('all');
                  setSearchInput('');
                  setPage(1);
                }}
              >
                Reset Filters
              </button>
            )}
          </div>

          {/* Bulk Action Bar (when items selected) */}
          {selectedIds.length > 0 && (
            <div className="bulk-bar">
              <span>
                <b>{selectedIds.length}</b> student(s) selected
              </span>
              <div className="bulk-actions">
                <button className="btn-bulk-collect" onClick={handleBulkCollect}>
                  <CheckCircle2 size={14} /> Mark Selected as Collected
                </button>
                <button className="btn-bulk-csv" onClick={exportCSV}>
                  <FileSpreadsheet size={14} /> Export Selected
                </button>
                <button className="btn-bulk-delete" onClick={handleBulkDelete}>
                  <Trash2 size={14} /> Delete Selected
                </button>
                <button className="btn-bulk-cancel" onClick={() => setSelectedIds([])}>
                  Deselect All
                </button>
              </div>
            </div>
          )}

          {/* Main Table with Loading / Error States */}
          {loadError ? (
            <div className="table-error-state">
              <AlertCircle size={32} />
              <p>{loadError}</p>
              <button className="btn-primary" onClick={handleRefresh}>
                <RefreshCw size={14} /> Retry Query
              </button>
            </div>
          ) : isLoading ? (
            <div className="table-loading-overlay">
              <Loader2 size={24} className="table-spinner" />
              <span>Querying database with high-speed indexes...</span>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>
                      <input
                        type="checkbox"
                        checked={items.length > 0 && selectedIds.length === items.length}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th>USN & Reg ID</th>
                    <th>Student Name</th>
                    <th>Gender</th>
                    <th>Dept / Year</th>
                    <th>Phone</th>
                    <th>Sizes (Shirt / Trouser)</th>
                    <th style={{ background: '#ecfdf5', color: '#065f46' }}>Payment</th>
                    <th>Production & Room</th>
                    <th>Distribution</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="empty-table-msg">
                        No registrations found matching the specified filters.
                      </td>
                    </tr>
                  ) : (
                    items.map(s => {
                      const isCollected = Boolean(s.collected_at);
                      const isSelected = selectedIds.includes(s.id);
                      const isPaid = Boolean(s.paymentVerified || s.paymentStatus === 'Payment Verified' || s.paymentStatus === 'Payment Successful' || s.paymentStatus === 'CASH RECEIVED');
                      const prodStatus = s.productionStatus || 'pending';
                      return (
                        <tr key={s.id} className={`${isSelected ? 'selected-row' : ''} ${isCollected ? 'collected-row' : ''}`}>
                          <td>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectOne(s.id)}
                            />
                          </td>
                          <td>
                            <span className="usn-badge">{s.usn}</span>
                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                              #{s.id}
                            </div>
                          </td>
                          <td>
                            <div className="student-name-cell">
                              <b>{s.fullName}</b>
                              <small>Submitted: {new Date(s.submitted_at).toLocaleDateString('en-IN')}</small>
                            </div>
                          </td>
                          <td>
                            <span className={`gender-badge ${(s.gender || 'Male').toLowerCase()}`}>
                              {s.gender || 'Male'}
                            </span>
                          </td>
                          <td>
                            <div className="dept-tag-cell">
                              <span className={`dept-badge ${s.department.toLowerCase()}`}>{s.department}</span>
                              <span className="sem-sec">{formatAcademicYear(s.semester)} - {s.section}</span>
                            </div>
                          </td>
                          <td>
                            <div className="phone-cell">
                              <Phone size={13} /> {s.phone}
                            </div>
                          </td>
                          <td>
                            <div className="sizes-pill">
                              <span className="shirt-tag">Shirt: <b>{s.shirtSize}</b></span>
                              <span className="trouser-tag">Trs: <b>{s.trouserSize}"</b></span>
                              {(s as any).blazerSize ? (
                                <span className="blazer-tag" style={{ background: '#fdf2f8', color: '#9d174d', border: '1px solid #fbcfe8', padding: '1px 5px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>Coat: <b>{(s as any).blazerSize}</b></span>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              onClick={() => setSelectedTailorStudent(s)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                marginTop: '4px',
                                padding: '2px 8px',
                                fontSize: '10px',
                                fontWeight: 700,
                                background: '#eff6ff',
                                color: '#1d4ed8',
                                border: '1px solid #bfdbfe',
                                borderRadius: '4px',
                                cursor: 'pointer'
                              }}
                              title="View & print tailor measurements job card"
                            >
                              📐 Tailor Spec
                            </button>
                          </td>
                          <td>
                            {isPaid ? (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '3px 10px',
                                  borderRadius: '20px',
                                  fontSize: '11.5px',
                                  fontWeight: 800,
                                  background: '#dcfce7',
                                  color: '#15803d',
                                  border: '1px solid #86efac',
                                  letterSpacing: '0.03em'
                                }}
                                title="Payment Verified against official bank statement"
                              >
                                <CheckCircle2 size={13} /> {s.paymentStatus === 'CASH RECEIVED' ? 'Cash Received' : 'Paid'}
                              </span>
                            ) : s.paymentStatus === 'Payment Submitted' || s.paymentStatus === 'Under Verification' || s.paymentStatus === 'CASH PAYMENT PENDING' ? (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '3px 10px',
                                  borderRadius: '20px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  background: '#fef3c7',
                                  color: '#92400e',
                                  border: '1px solid #fde68a',
                                  whiteSpace: 'nowrap'
                                }}
                                title={s.paymentStatus === 'CASH PAYMENT PENDING' ? 'Cash Payment requested, awaiting counter collection' : 'Proof submitted, awaiting admin verification'}
                              >
                                <Clock3 size={12} /> {s.paymentStatus === 'CASH PAYMENT PENDING' ? 'Cash Pending' : 'Pending Verification'}
                              </span>
                            ) : s.paymentStatus === 'Payment Rejected' || s.paymentStatus === 'CASH PAYMENT REJECTED' ? (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '3px 10px',
                                  borderRadius: '20px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  background: '#fee2e2',
                                  color: '#991b1b',
                                  border: '1px solid #fca5a5',
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                <AlertCircle size={12} /> {s.paymentStatus === 'CASH PAYMENT REJECTED' ? 'Cash Rejected' : 'Rejected'}
                              </span>
                            ) : (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '3px 10px',
                                  borderRadius: '20px',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  background: '#f1f5f9',
                                  color: '#64748b',
                                  border: '1px solid #cbd5e1'
                                }}
                              >
                                Not Paid
                              </span>
                            )}
                          </td>
                          <td>
                            <select
                              className={`prod-status-badge ${prodStatus}`}
                              value={prodStatus}
                              onChange={e => handleUpdateProductionStatus(s.id, e.target.value as any)}
                            >
                              <option value="pending">Pending</option>
                              <option value="in_production">In Production</option>
                              <option value="ready">Ready</option>
                            </select>
                          </td>
                          <td>
                            {isCollected ? (
                              <div className="status-badge collected" title={`Collected at: ${new Date(s.collected_at!).toLocaleString('en-IN')}\nBy: ${s.collected_by || 'Admin Desk'}`}>
                                <CheckCircle2 size={13} />
                                <span>Collected</span>
                              </div>
                            ) : (
                              <div className="status-badge pending">
                                <Clock3 size={13} />
                                <span>Pending</span>
                              </div>
                            )}
                          </td>
                          <td>
                            <div className="action-buttons">
                              <button
                                className={`btn-action ${isCollected ? 'undo' : 'collect'}`}
                                title={isCollected ? 'Undo collection' : 'Mark as collected'}
                                onClick={async () => {
                                  await onToggleCollected(s.id, !isCollected);
                                  handleRefresh();
                                }}
                              >
                                {isCollected ? <X size={14} /> : <Check size={14} />}
                                <span>{isCollected ? 'Undo' : 'Collect'}</span>
                              </button>

                              <button
                                className="btn-action edit"
                                title="Edit student registration"
                                onClick={() => openEdit(s)}
                              >
                                <Edit3 size={14} />
                              </button>

                              <button
                                className="btn-action print"
                                title="View / Print distribution slip"
                                onClick={() => setPrintSlipStudent(s)}
                              >
                                <Printer size={14} />
                              </button>

                              <button
                                className="btn-action delete"
                                title="Delete student"
                                onClick={() => setConfirmDeleteId(s.id)}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Amazon-Style Scalable Server-Side Pagination Bar */}
          <div className="pagination-bar">
            <div className="page-size-selector">
              <span>Show</span>
              <select
                value={pageSize}
                onChange={e => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                <option value={25}>25 per page</option>
                <option value={50}>50 per page</option>
                <option value={100}>100 per page</option>
              </select>
              <span>
                | Showing <b>{pagination.total > 0 ? (page - 1) * pageSize + 1 : 0}</b> to{' '}
                <b>{Math.min(page * pageSize, pagination.total)}</b> of <b>{pagination.total}</b> students
              </span>
            </div>

            <div className="pagination-controls">
              <button
                className="pagination-btn"
                disabled={!pagination.hasPrev || isLoading}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                <ChevronLeft size={16} /> Prev
              </button>

              <span style={{ padding: '0 8px', fontWeight: 600 }}>
                Page {pagination.page} of {pagination.totalPages}
              </span>

              <button
                className="pagination-btn"
                disabled={!pagination.hasNext || isLoading}
                onClick={() => setPage(p => p + 1)}
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </>
      )}

      {/* Add Student Modal */}
      {showAddModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <h3>Add Student Registration</h3>
                <p>Register a student for the active uniform campaign</p>
              </div>
              <button className="close-btn" onClick={() => setShowAddModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={submitAdd}>
              <div className="modal-body formgrid">
                <label>
                  Full Name
                  <input
                    required
                    type="text"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    placeholder="e.g. Aarav Sharma"
                  />
                </label>

                <label>
                  Gender
                  <select value={formGender} onChange={e => setFormGender(e.target.value as Gender)}>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </label>

                <label>
                  USN / Student ID
                  <input
                    required
                    type="text"
                    value={formUsn}
                    onChange={e => setFormUsn(e.target.value)}
                    placeholder="e.g. 4MH22CS001"
                  />
                </label>

                <label>
                  Department
                  <select value={formDept} onChange={e => setFormDept(e.target.value)}>
                    <optgroup label="Undergraduate Engineering (B.E.)">
                      {DEPARTMENTS.filter(d => d.category === 'Undergraduate (B.E.)').map(d => (
                        <option key={d.code} value={d.code}>{d.code} – {d.name}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Postgraduate Programs">
                      {DEPARTMENTS.filter(d => d.category === 'Postgraduate').map(d => (
                        <option key={d.code} value={d.code}>{d.code} – {d.name}</option>
                      ))}
                    </optgroup>
                  </select>
                </label>

                <label>
                  Mobile Number (10 digits)
                  <input
                    required
                    type="tel"
                    value={formPhone}
                    onChange={e => setFormPhone(e.target.value)}
                    placeholder="e.g. 9845123456"
                  />
                </label>

                <label>
                  Year
                  <select value={formSem} onChange={e => setFormSem(Number(e.target.value))}>
                    {SEMESTERS.map(s => (
                      <option key={s.number} value={s.number}>{s.label}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Section
                  <select value={formSec} onChange={e => setFormSec(e.target.value)}>
                    {ALL_SECTIONS.map(s => (
                      <option key={s} value={s}>Section {s}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Shirt Size
                  <select value={formShirt} onChange={e => setFormShirt(e.target.value as ShirtSize)}>
                    {['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'].map(sz => (
                      <option key={sz} value={sz}>{sz}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Trouser Size
                  <select value={formTrouser} onChange={e => setFormTrouser(e.target.value as TrouserSize)}>
                    {['28', '30', '32', '34', '36', '38', '40', '42', '44'].map(sz => (
                      <option key={sz} value={sz}>{sz} inches</option>
                    ))}
                  </select>
                </label>
              </div>

              {formError && <div className="modal-error">{formError}</div>}

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : 'Save Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Student Modal */}
      {editingStudent && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <h3>Edit Registration: {editingStudent.usn}</h3>
                <p>Modify student size choices or academic section</p>
              </div>
              <button className="close-btn" onClick={() => setEditingStudent(null)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={submitEdit}>
              <div className="modal-body formgrid">
                <label>
                  Full Name
                  <input
                    required
                    type="text"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                  />
                </label>

                <label>
                  Gender
                  <select value={formGender} onChange={e => setFormGender(e.target.value as Gender)}>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </label>

                <label>
                  USN
                  <input
                    required
                    type="text"
                    value={formUsn}
                    onChange={e => setFormUsn(e.target.value)}
                  />
                </label>

                <label>
                  Department
                  <select value={formDept} onChange={e => setFormDept(e.target.value)}>
                    <optgroup label="Undergraduate Engineering (B.E.)">
                      {DEPARTMENTS.filter(d => d.category === 'Undergraduate (B.E.)').map(d => (
                        <option key={d.code} value={d.code}>{d.code} – {d.name}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Postgraduate Programs">
                      {DEPARTMENTS.filter(d => d.category === 'Postgraduate').map(d => (
                        <option key={d.code} value={d.code}>{d.code} – {d.name}</option>
                      ))}
                    </optgroup>
                  </select>
                </label>

                <label>
                  Mobile Number
                  <input
                    required
                    type="tel"
                    value={formPhone}
                    onChange={e => setFormPhone(e.target.value)}
                  />
                </label>

                <label>
                  Year
                  <select value={formSem} onChange={e => setFormSem(Number(e.target.value))}>
                    {SEMESTERS.map(s => (
                      <option key={s.number} value={s.number}>{s.label}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Section
                  <select value={formSec} onChange={e => setFormSec(e.target.value)}>
                    {ALL_SECTIONS.map(s => (
                      <option key={s} value={s}>Section {s}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Shirt Size
                  <select value={formShirt} onChange={e => setFormShirt(e.target.value as ShirtSize)}>
                    {['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'].map(sz => (
                      <option key={sz} value={sz}>{sz}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Trouser Size
                  <select value={formTrouser} onChange={e => setFormTrouser(e.target.value as TrouserSize)}>
                    {['28', '30', '32', '34', '36', '38', '40', '42', '44'].map(sz => (
                      <option key={sz} value={sz}>{sz}</option>
                    ))}
                  </select>
                </label>
              </div>

              {formError && <div className="modal-error">{formError}</div>}

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setEditingStudent(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : 'Update Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDeleteId && (
        <div className="modal-backdrop">
          <div className="modal-card modal-confirm">
            <div className="modal-header">
              <h3>Confirm Deletion</h3>
              <button className="close-btn" onClick={() => setConfirmDeleteId(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to delete this registration record? This action cannot be undone.</p>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setConfirmDeleteId(null)}>
                Cancel
              </button>
              <button
                className="btn-danger"
                onClick={async () => {
                  await onDelete(confirmDeleteId);
                  setConfirmDeleteId(null);
                  handleRefresh();
                }}
              >
                Delete Student
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Distribution Slip Modal */}
      {printSlipStudent && (
        <div className="modal-backdrop">
          <div className="modal-card modal-slip">
            <div className="modal-header no-print">
              <h3>Uniform Distribution Slip</h3>
              <div className="header-slip-actions">
                <button className="btn-primary" onClick={() => window.print()}>
                  <Printer size={15} /> Print Slip
                </button>
                <button className="close-btn" onClick={() => setPrintSlipStudent(null)}>
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="slip-printable-area">
              <div className="slip-header">
                <div className="slip-crest">
                  <img src="/mit-logo.png" alt="MIT Mysore Logo" className="slip-crest-img" />
                </div>
                <div>
                  <h4>MAHARAJA INSTITUTE OF TECHNOLOGY MYSORE</h4>
                  <small>Department of Uniform & Student Welfare Administration</small>
                  <p>Official Uniform Distribution Acknowledgement Slip</p>
                </div>
              </div>

              <div className="slip-meta-grid">
                <div><span>Token No:</span> <b>{printSlipStudent.id.toUpperCase()}</b></div>
                <div><span>Campaign:</span> <b>{campaign || 'Uniform Distribution 2027'}</b></div>
                <div><span>USN:</span> <b>{printSlipStudent.usn}</b></div>
                <div><span>Student Name:</span> <b>{printSlipStudent.fullName}</b></div>
                <div><span>Gender:</span> <b>{printSlipStudent.gender || 'Male'}</b></div>
                <div><span>Department:</span> <b>{printSlipStudent.department}</b></div>
                <div><span>Year & Sec:</span> <b>{formatAcademicYear(printSlipStudent.semester)} - Sec {printSlipStudent.section}</b></div>
                <div><span>Phone:</span> <b>{printSlipStudent.phone}</b></div>
                <div><span>Registration Date:</span> <b>{new Date(printSlipStudent.submitted_at).toLocaleDateString('en-IN')}</b></div>
              </div>

              <div className="slip-size-box">
                <div className="size-card">
                  <small>COLLEGE UNIFORM SHIRT</small>
                  <strong>Size: {printSlipStudent.shirtSize}</strong>
                  <span>Quantity: 2 Nos.</span>
                </div>
                <div className="size-card">
                  <small>COLLEGE UNIFORM TROUSER</small>
                  <strong>Size: {printSlipStudent.trouserSize}"</strong>
                  <span>Quantity: 2 Nos.</span>
                </div>
              </div>

              <div className="slip-status-box">
                <div>
                  <span>Production Status:</span>{' '}
                  <b style={{ textTransform: 'capitalize' }}>{printSlipStudent.productionStatus || 'Pending'}</b>
                </div>
                {printSlipStudent.collectionRoom && (
                  <div>
                    <span>Collection Location:</span>{' '}
                    <b>{printSlipStudent.collectionRoom}</b>
                  </div>
                )}
                <div>
                  <span>Distribution Status:</span>{' '}
                  <b>{printSlipStudent.collected_at ? 'COLLECTED & VERIFIED' : 'PENDING COLLECTION'}</b>
                </div>
                {printSlipStudent.collected_at && (
                  <div>
                    <span>Collected On:</span>{' '}
                    <b>{new Date(printSlipStudent.collected_at).toLocaleString('en-IN')} ({printSlipStudent.collected_by || 'Admin Desk'})</b>
                  </div>
                )}
              </div>

              <div className="slip-signatures">
                <div className="sig-block">
                  <div className="sig-line" />
                  <span>Student Signature</span>
                </div>
                <div className="sig-block">
                  <div className="sig-line" />
                  <span>Issuing Officer Signature & Seal</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedTailorStudent && (
        <TailorMeasurementReportModal
          studentRecord={{
            studentName: selectedTailorStudent.fullName,
            fullName: selectedTailorStudent.fullName,
            usn: selectedTailorStudent.usn,
            applicationId: selectedTailorStudent.registrationId || selectedTailorStudent.id,
            course: selectedTailorStudent.department === 'MBA' ? 'MBA' : selectedTailorStudent.department === 'MCA' ? 'MCA' : 'B.E.',
            gender: selectedTailorStudent.gender,
            shirtSize: selectedTailorStudent.shirtSize,
            trouserSize: selectedTailorStudent.trouserSize,
            blazerSize: selectedTailorStudent.blazerSize,
            uniform_measurements: selectedTailorStudent.uniform_measurements || selectedTailorStudent.uniformMeasurements
          }}
          onClose={() => setSelectedTailorStudent(null)}
        />
      )}
    </div>
  );
}
