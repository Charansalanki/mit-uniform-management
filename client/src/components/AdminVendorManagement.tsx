import React, { useState, useEffect, useCallback } from 'react';
import { DEPARTMENTS } from '../mockData';
import { getAuthToken, ensureAdminToken } from '../api';
import VendorPortalAccessCard from './admin/VendorPortalAccessCard';
import { API_BASE_URL } from '../utils/apiConfig';
import { useRealtimeSystemSync } from '../hooks/useRealtimeSystemSync';
import {
  Store,
  Building2,
  Users,
  CheckCircle2,
  AlertTriangle,
  Search,
  Plus,
  ArrowLeft,
  RefreshCw,
  QrCode,
  ShieldAlert,
  HelpCircle,
  X,
  CreditCard,
  Edit,
  Trash2,
  Upload,
  Download,
  Eye
} from 'lucide-react';

interface Props {
  apiBaseUrl?: string;
  authToken?: string;
}

interface VendorAllocation {
  allocationId: string;
  vendorId: string;
  educationLevel: string;
  course: string;
  department: string;
  academicYear: string;
  semester: string;
  section: string;
  gender?: string;
  uniformCategory?: string;
  academicPeriod?: string;
  allocationKey?: string;
  status: string;
}

interface ScannerSlot {
  qrImageUrl: string | null;
  isEnabled: boolean;
  updatedAt?: string | null;
}

interface VendorPaymentConfig {
  vendorId: string;
  beneficiaryName: string;
  upiId: string;
  paymentInstructions?: string;
  paymentAmount?: number | null;
  isActive?: boolean;
  googlePayQR?: ScannerSlot;
  phonePeQR?: ScannerSlot;
  paytmQR?: ScannerSlot;
}

interface VendorItem {
  _id?: string;
  id?: string;
  vendorId: string;
  vendorName: string;
  contactPerson: string;
  mobile: string;
  email: string;
  address: string;
  gstNumber?: string;
  notes?: string;
  status: 'ACTIVE' | 'INACTIVE';
  allocations: VendorAllocation[];
  assignedDepartments: string[];
  assignedYears: string[];
  assignedSections: string[];
  allocatedStudentsCount: number;
  paymentConfig?: VendorPaymentConfig | null;
  activeScannersCount: number;
}

interface AcademicGroupItem {
  educationLevel: string;
  course: string;
  department: string;
  academicYear: string;
  semester: string;
  section: string;
  gender?: string;
  key: string;
  ownedByVendorId?: string;
}

export function AdminVendorManagement({
  apiBaseUrl = API_BASE_URL,
  authToken = getAuthToken() || localStorage.getItem('mit_uniform_admin_token_v1') || localStorage.getItem('mit_admin_token') || localStorage.getItem('token') || ''
}: Props) {
  const [viewMode, setViewMode] = useState<'LIST' | 'CREATE' | 'DETAILS' | 'EDIT'>('LIST');
  const [stats, setStats] = useState({
    totalVendors: 0,
    activeVendors: 0,
    inactiveVendors: 0,
    totalAssignedDepartments: 0,
    totalAllocatedStudents: 0,
    unassignedAcademicGroups: 0,
    pendingVendorAllocations: 0
  });
  const [vendors, setVendors] = useState<VendorItem[]>([]);
  const [filters, setFilters] = useState({
    search: '',
    department: 'ALL',
    academicYear: 'ALL',
    status: 'ALL'
  });

  // Dynamic Catalog & Already-Assigned Active Groups (for Exclusive Filtering)
  const [catalog, setCatalog] = useState<any>(null);
  const [globallyAssignedGroups, setGloballyAssignedGroups] = useState<VendorAllocation[]>([]);

  // Create New Vendor Form State
  const [nextVendorId, setNextVendorId] = useState('MIT-VND-2026-001');
  const [vendorForm, setVendorForm] = useState({
    vendorName: '',
    contactPerson: '',
    mobile: '',
    email: '',
    address: '',
    gstNumber: '',
    status: 'ACTIVE',
    notes: '',
    beneficiaryName: '',
    upiId: '',
    paymentInstructions:
      'Scan the assigned vendor QR code below, complete the exact uniform payment, and submit your 12-digit UPI UTR along with the payment screenshot.',
    paymentAmount: ''
  });

  // 3 Individual Vendor Scanners State
  const [scanners, setScanners] = useState<{
    googlePay: { file: File | null; preview: string | null; isEnabled: boolean };
    phonePe: { file: File | null; preview: string | null; isEnabled: boolean };
    paytm: { file: File | null; preview: string | null; isEnabled: boolean };
  }>({
    googlePay: { file: null, preview: null, isEnabled: true },
    phonePe: { file: null, preview: null, isEnabled: true },
    paytm: { file: null, preview: null, isEnabled: true }
  });

  // Exclusive Group Builder State (Gender strictly Boys and Girls)
  const [builder, setBuilder] = useState<{
    department: string;
    academicYears: string[];
    genders: string[];
    semester: string;
  }>({
    department: 'ALL',
    academicYears: ['1st Year'],
    genders: ['Boys', 'Girls'],
    semester: 'ALL'
  });
  const [stagedAllocations, setStagedAllocations] = useState<AcademicGroupItem[]>([]);

  // Edit Existing Vendor Form & Allocation State
  const [editingVendorId, setEditingVendorId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    vendorName: '',
    contactPerson: '',
    mobile: '',
    email: '',
    address: '',
    gstNumber: '',
    status: 'ACTIVE',
    notes: '',
    beneficiaryName: '',
    upiId: '',
    paymentInstructions:
      'Scan the assigned vendor QR code below, complete the exact uniform payment, and submit your 12-digit UPI UTR along with the payment screenshot.',
    paymentAmount: ''
  });
  const [editScanners, setEditScanners] = useState<{
    googlePay: { file: File | null; preview: string | null; isEnabled: boolean; deleteCurrent?: boolean };
    phonePe: { file: File | null; preview: string | null; isEnabled: boolean; deleteCurrent?: boolean };
    paytm: { file: File | null; preview: string | null; isEnabled: boolean; deleteCurrent?: boolean };
  }>({
    googlePay: { file: null, preview: null, isEnabled: false },
    phonePe: { file: null, preview: null, isEnabled: false },
    paytm: { file: null, preview: null, isEnabled: false }
  });
  const [editExistingAllocations, setEditExistingAllocations] = useState<any[]>([]);
  const [editNewStagedAllocations, setEditNewStagedAllocations] = useState<AcademicGroupItem[]>([]);
  const [editReleasedAllocationIds, setEditReleasedAllocationIds] = useState<string[]>([]);

  // Selected Vendor Details & Reassignment Modal State
  const [activeVendorDetails, setActiveVendorDetails] = useState<any>(null);
  const [reassignModal, setReassignModal] = useState<{ allocation: VendorAllocation } | null>(null);
  const [reassignTargetVendorId, setReassignTargetVendorId] = useState('');
  const [reassignReason, setReassignReason] = useState('');

  // Scanner Modal States for Details View & Preview
  const [vendorPreviewQrModal, setVendorPreviewQrModal] = useState<{
    provider: string;
    qrImageUrl: string;
    vendorName: string;
    beneficiaryName: string;
    upiId: string;
  } | null>(null);

  const [vendorUploadQrModal, setVendorUploadQrModal] = useState<{
    vendorId: string;
    slotKey: 'googlePay' | 'phonePe' | 'paytm';
    providerTitle: string;
    mode: 'UPLOAD' | 'REPLACE';
  } | null>(null);

  const [modalQrFile, setModalQrFile] = useState<File | null>(null);
  const [modalQrPreview, setModalQrPreview] = useState<string | null>(null);

  const [banner, setBanner] = useState<{ type: 'error' | 'success' | ''; text: string }>({ type: '', text: '' });
  const [busy, setBusy] = useState(false);

  const authHeaders = useCallback(() => {
    const h: Record<string, string> = {};
    const t = getAuthToken() || localStorage.getItem('mit_uniform_admin_token_v1') || localStorage.getItem('mit_admin_token') || localStorage.getItem('token') || authToken;
    if (t) h['Authorization'] = `Bearer ${t}`;
    return h;
  }, [authToken]);

  const notify = (type: 'error' | 'success', text: string) => {
    setBanner({ type, text });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      setBanner((prev) => (prev.text === text ? { type: '', text: '' } : prev));
    }, 5000);
  };

  const handleToggleDetailsScanner = async (slotKey: 'googlePay' | 'phonePe' | 'paytm', currentActive: boolean) => {
    if (!activeVendorDetails) return;
    try {
      setBusy(true);
      await ensureAdminToken();
      const formData = new FormData();
      if (slotKey === 'googlePay') formData.append('googlePayEnabled', String(!currentActive));
      if (slotKey === 'phonePe') formData.append('phonePeEnabled', String(!currentActive));
      if (slotKey === 'paytm') formData.append('paytmEnabled', String(!currentActive));

      const res = await fetch(`${apiBaseUrl}/api/admin/vendors/${activeVendorDetails.vendor.vendorId}/scanners`, {
        method: 'PUT',
        headers: authHeaders(),
        body: formData
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        notify('error', data.message || 'Failed to update scanner status.');
        return;
      }
      notify('success', `Scanner status updated.`);
      await openVendorDetails(activeVendorDetails.vendor.vendorId);
      await loadDashboard();
    } catch {
      notify('error', 'Error updating scanner status.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteDetailsScanner = async (slotKey: 'googlePay' | 'phonePe' | 'paytm', providerTitle: string) => {
    if (!activeVendorDetails) return;
    if (!window.confirm(`Are you sure you want to delete the ${providerTitle} QR scanner for ${activeVendorDetails.vendor.vendorName}?`)) return;

    try {
      setBusy(true);
      await ensureAdminToken();
      const formData = new FormData();
      if (slotKey === 'googlePay') formData.append('deleteGooglePay', 'true');
      if (slotKey === 'phonePe') formData.append('deletePhonePe', 'true');
      if (slotKey === 'paytm') formData.append('deletePaytm', 'true');

      const res = await fetch(`${apiBaseUrl}/api/admin/vendors/${activeVendorDetails.vendor.vendorId}/scanners`, {
        method: 'PUT',
        headers: authHeaders(),
        body: formData
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        notify('error', data.message || 'Failed to delete scanner.');
        return;
      }
      notify('success', `${providerTitle} scanner removed.`);
      await openVendorDetails(activeVendorDetails.vendor.vendorId);
      await loadDashboard();
    } catch {
      notify('error', 'Error deleting scanner.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveModalQrScanner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorUploadQrModal || !modalQrFile || !activeVendorDetails) return;

    try {
      setBusy(true);
      await ensureAdminToken();
      const formData = new FormData();
      const { slotKey } = vendorUploadQrModal;
      if (slotKey === 'googlePay') {
        formData.append('googlePayQR', modalQrFile);
        formData.append('googlePayEnabled', 'true');
      } else if (slotKey === 'phonePe') {
        formData.append('phonePeQR', modalQrFile);
        formData.append('phonePeEnabled', 'true');
      } else if (slotKey === 'paytm') {
        formData.append('paytmQR', modalQrFile);
        formData.append('paytmEnabled', 'true');
      }

      const res = await fetch(`${apiBaseUrl}/api/admin/vendors/${activeVendorDetails.vendor.vendorId}/scanners`, {
        method: 'PUT',
        headers: authHeaders(),
        body: formData
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        notify('error', data.message || 'Failed to upload scanner.');
        return;
      }
      notify('success', `${vendorUploadQrModal.providerTitle} QR Scanner saved & synced to student portal.`);
      setVendorUploadQrModal(null);
      setModalQrFile(null);
      setModalQrPreview(null);
      await openVendorDetails(activeVendorDetails.vendor.vendorId);
      await loadDashboard();
    } catch {
      notify('error', 'Error saving QR scanner.');
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadQrImage = (url: string, filename: string) => {
    const fullUrl = url.startsWith('http') ? url : `${apiBaseUrl}${url}`;
    const a = document.createElement('a');
    a.href = fullUrl;
    a.download = filename;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Load Vendor Dashboard & Stats
  const loadDashboard = useCallback(async () => {
    try {
      await ensureAdminToken();
      const qs = new URLSearchParams(filters).toString();
      let res = await fetch(`${apiBaseUrl}/api/admin/vendors/dashboard?${qs}`, {
        headers: authHeaders()
      });
      if (res.status === 401) {
        await ensureAdminToken(true);
        res = await fetch(`${apiBaseUrl}/api/admin/vendors/dashboard?${qs}`, {
          headers: authHeaders()
        });
      }
      const data = await res.json();
      if (data.success) {
        setStats(data.stats);
        setVendors(data.vendors || []);
      }
    } catch (err) {
      console.error('Failed to load vendor dashboard:', err);
    }
  }, [apiBaseUrl, authHeaders, filters]);

  // Load Dynamic Catalog & Already-Assigned Active Combinations
  const loadAvailableGroups = useCallback(async (excludeVendorId = '') => {
    try {
      await ensureAdminToken();
      let [availRes, idRes] = await Promise.all([
        fetch(
          `${apiBaseUrl}/api/admin/vendors/available-groups?excludeVendorId=${excludeVendorId}&t=${Date.now()}`,
          { headers: authHeaders(), cache: 'no-store' }
        ),
        fetch(`${apiBaseUrl}/api/admin/vendors/next-id`, { headers: authHeaders() })
      ]);
      if (availRes.status === 401 || idRes.status === 401) {
        await ensureAdminToken(true);
        [availRes, idRes] = await Promise.all([
          fetch(
            `${apiBaseUrl}/api/admin/vendors/available-groups?excludeVendorId=${excludeVendorId}&t=${Date.now()}`,
            { headers: authHeaders(), cache: 'no-store' }
          ),
          fetch(`${apiBaseUrl}/api/admin/vendors/next-id`, { headers: authHeaders() })
        ]);
      }
      const availData = await availRes.json();
      const idData = await idRes.json();

      if (availData.success) {
        setCatalog(availData.catalog);
        setGloballyAssignedGroups(availData.assignedGroups || []);
      }
      if (idData.success && idData.nextVendorId) {
        setNextVendorId(idData.nextVendorId);
      }
    } catch (err) {
      console.error('Failed to load available academic groups:', err);
    }
  }, [apiBaseUrl, authHeaders]);

  useEffect(() => {
    ensureAdminToken().finally(() => {
      loadDashboard();
    });
  }, [loadDashboard]);

  // Check if a specific (educationLevel, course, department, academicYear, semester, section, gender) is ALREADY assigned to an active vendor
  const findExistingOwnerForGroup = (
    edu: string,
    course: string,
    dept: string,
    year: string,
    sem: string,
    sec: string,
    gender: string = 'Boys'
  ) => {
    return globallyAssignedGroups.find(
      (a) =>
        a.educationLevel === edu &&
        a.course === course &&
        a.department === dept &&
        a.academicYear === year &&
        a.section === sec &&
        (a.semester === 'ALL' || sem === 'ALL' || a.semester === sem) &&
        (!a.gender || a.gender.toUpperCase() === 'ALL' || a.gender.toUpperCase() === gender.toUpperCase())
    );
  };

  // Check if already added to the current vendor's staged list
  const isAlreadyStaged = (
    edu: string,
    course: string,
    dept: string,
    year: string,
    sem: string,
    sec: string,
    gender: string = 'Boys'
  ) => {
    return stagedAllocations.some(
      (s) =>
        s.educationLevel === edu &&
        s.course === course &&
        s.department === dept &&
        s.academicYear === year &&
        s.section === sec &&
        (s.semester === 'ALL' || sem === 'ALL' || s.semester === sem) &&
        (!s.gender || s.gender.toUpperCase() === 'ALL' || s.gender.toUpperCase() === gender.toUpperCase())
    );
  };

  // Helper: Derive Education Level & Course directly from department
  const getDeptMeta = (dept: string) => {
    const d = DEPARTMENTS.find((item) => item.code === dept);
    if (d && d.category === 'Postgraduate') {
      if (d.code === 'MCA') return { educationLevel: 'PG', course: 'MCA' };
      if (d.code === 'MBA') return { educationLevel: 'PG', course: 'MBA' };
      return { educationLevel: 'PG', course: 'M.Tech' };
    }
    return { educationLevel: 'UG', course: 'B.E.' };
  };

  // Compute Available (Unassigned) Combinations for Current Builder Selection
  const getAvailableCombinationsForSelection = () => {
    const defaultSections = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

    const available: AcademicGroupItem[] = [];
    const hiddenTaken: AcademicGroupItem[] = [];

    const deptsToProcess =
      !builder.department || builder.department === 'ALL'
        ? DEPARTMENTS.map((d) => d.code)
        : [builder.department];

    const gendersToProcess =
      builder.genders && builder.genders.length > 0
        ? builder.genders
        : ['Boys', 'Girls'];

    deptsToProcess.forEach((dept) => {
      const { educationLevel, course } = getDeptMeta(dept);
      const levelCfg = catalog?.[educationLevel] || catalog?.UG || { sections: defaultSections };
      const sections: string[] = levelCfg.sections || defaultSections;

      builder.academicYears.forEach((yr) => {
        // PG courses are 1st and 2nd year only
        if (educationLevel === 'PG' && (yr === '3rd Year' || yr === '4th Year')) return;

        sections.forEach((sec) => {
          gendersToProcess.forEach((gender) => {
            const owner = findExistingOwnerForGroup(
              educationLevel,
              course,
              dept,
              yr,
              builder.semester,
              sec,
              gender
            );
            const item: AcademicGroupItem = {
              educationLevel,
              course,
              department: dept,
              academicYear: yr,
              semester: builder.semester,
              section: sec,
              gender,
              key: `${educationLevel}__${course}__${dept}__${yr}__${builder.semester}__${sec}__${gender}`
            };
            const isCurrentVendorExisting =
              viewMode === 'EDIT' &&
              editExistingAllocations.some(
                (ea) =>
                  ea.department === dept &&
                  ea.academicYear === yr &&
                  ea.section === sec &&
                  (!ea.gender || ea.gender.toUpperCase() === 'ALL' || ea.gender.toUpperCase() === gender.toUpperCase()) &&
                  ea.status !== 'RELEASED'
              );
            const isCurrentVendorEditStaged =
              viewMode === 'EDIT' &&
              editNewStagedAllocations.some(
                (sa) =>
                  sa.department === dept &&
                  sa.academicYear === yr &&
                  sa.section === sec &&
                  (!sa.gender || sa.gender.toUpperCase() === 'ALL' || sa.gender.toUpperCase() === gender.toUpperCase())
              );
            const isCurrentVendorCreateStaged =
              viewMode === 'CREATE' &&
              isAlreadyStaged(educationLevel, course, dept, yr, builder.semester, sec, gender);

            if (owner) {
              hiddenTaken.push({ ...item, ownedByVendorId: owner.vendorId });
            } else if (isCurrentVendorExisting || isCurrentVendorEditStaged || isCurrentVendorCreateStaged) {
              // Already assigned or staged for this vendor
            } else {
              available.push(item);
            }
          });
        });
      });
    });

    return { available, hiddenTaken };
  };

  const handleStageGroup = (item: AcademicGroupItem) => {
    setStagedAllocations((prev) => [...prev, item]);
  };

  const handleStageAllAvailableInView = (availableList: AcademicGroupItem[]) => {
    setStagedAllocations((prev) => [...prev, ...availableList]);
  };

  const handleRemoveStagedGroup = (key: string) => {
    setStagedAllocations((prev) => prev.filter((item) => item.key !== key));
  };

  const handleScannerFileSelect = (slotKey: 'googlePay' | 'phonePe' | 'paytm', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      notify('error', 'Only PNG, JPG, and JPEG QR scanner images are allowed.');
      return;
    }
    setScanners((prev) => ({
      ...prev,
      [slotKey]: {
        ...prev[slotKey],
        file,
        preview: URL.createObjectURL(file),
        isEnabled: true
      }
    }));
  };

  const handleCreateVendorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBanner({ type: '', text: '' });

    if (stagedAllocations.length === 0) {
      notify('error', 'Please assign at least one available Department, Year & Section group to this vendor.');
      return;
    }

    if (!scanners.googlePay.file && !scanners.phonePe.file && !scanners.paytm.file) {
      notify('error', 'Please upload at least one UPI QR scanner (Google Pay, PhonePe, or Paytm) for this vendor.');
      return;
    }

    if (!vendorForm.paymentAmount || isNaN(Number(vendorForm.paymentAmount)) || Number(vendorForm.paymentAmount) <= 0) {
      notify('error', 'Please enter a valid Uniform Fee Amount (₹) for this vendor.');
      return;
    }

    try {
      setBusy(true);
      await ensureAdminToken();
      const formData = new FormData();
      Object.entries(vendorForm).forEach(([k, v]) => formData.append(k, v));
      formData.append('googlePayEnabled', String(scanners.googlePay.isEnabled));
      formData.append('phonePeEnabled', String(scanners.phonePe.isEnabled));
      formData.append('paytmEnabled', String(scanners.paytm.isEnabled));

      if (scanners.googlePay.file) formData.append('googlePayQR', scanners.googlePay.file);
      if (scanners.phonePe.file) formData.append('phonePeQR', scanners.phonePe.file);
      if (scanners.paytm.file) formData.append('paytmQR', scanners.paytm.file);

      formData.append('allocationsJson', JSON.stringify(stagedAllocations));

      const res = await fetch(`${apiBaseUrl}/api/admin/vendors`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        if (data.conflictDetected) {
          await loadAvailableGroups();
        }
        notify('error', data.message || 'Failed to create vendor.');
        return;
      }

      notify('success', 'Vendor Successfully Created');
      setStagedAllocations([]);
      await loadDashboard();
      await loadAvailableGroups();
      setViewMode('LIST');
    } catch (err) {
      notify('error', 'Network error while saving vendor.');
    } finally {
      setBusy(false);
    }
  };

  const handleStartEditVendor = async (vendorId: string) => {
    try {
      setBusy(true);
      setBanner({ type: '', text: '' });
      await loadAvailableGroups(vendorId);

      const res = await fetch(`${apiBaseUrl}/api/admin/vendors/${vendorId}/details`, {
        headers: authHeaders()
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        notify('error', data.message || 'Failed to load vendor details for editing.');
        return;
      }

      const v = data.vendor;
      const p = data.paymentConfig;

      setEditingVendorId(vendorId);
      setEditForm({
        vendorName: v.vendorName || '',
        contactPerson: v.contactPerson || '',
        mobile: v.mobile || '',
        email: v.email || '',
        address: v.address || '',
        gstNumber: v.gstNumber || '',
        status: v.status || 'ACTIVE',
        notes: v.notes || '',
        beneficiaryName: p?.beneficiaryName || '',
        upiId: p?.upiId || '',
        paymentInstructions:
          p?.paymentInstructions ||
          'Scan the assigned vendor QR code below, complete the exact uniform payment, and submit your 12-digit UPI UTR along with the payment screenshot.',
        paymentAmount:
          p?.paymentAmount !== null && p?.paymentAmount !== undefined ? String(p.paymentAmount) : ''
      });

      setEditScanners({
        googlePay: {
          file: null,
          preview: p?.googlePayQR?.qrImageUrl ? `${apiBaseUrl}${p.googlePayQR.qrImageUrl}` : null,
          isEnabled: Boolean(p?.googlePayQR?.isEnabled),
          deleteCurrent: false
        },
        phonePe: {
          file: null,
          preview: p?.phonePeQR?.qrImageUrl ? `${apiBaseUrl}${p.phonePeQR.qrImageUrl}` : null,
          isEnabled: Boolean(p?.phonePeQR?.isEnabled),
          deleteCurrent: false
        },
        paytm: {
          file: null,
          preview: p?.paytmQR?.qrImageUrl ? `${apiBaseUrl}${p.paytmQR.qrImageUrl}` : null,
          isEnabled: Boolean(p?.paytmQR?.isEnabled),
          deleteCurrent: false
        }
      });

      const heldAllocs = (data.allocations || []).filter(
        (a: any) => a.status !== 'RELEASED'
      );
      setEditExistingAllocations(heldAllocs);
      setEditReleasedAllocationIds([]);
      setEditNewStagedAllocations([]);
      setViewMode('EDIT');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      notify('error', 'Error loading vendor for editing.');
    } finally {
      setBusy(false);
    }
  };

  const handleEditScannerFileSelect = (
    slotKey: 'googlePay' | 'phonePe' | 'paytm',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      notify('error', 'Only PNG, JPG, and JPEG QR scanner images are allowed.');
      return;
    }
    setEditScanners((prev) => ({
      ...prev,
      [slotKey]: {
        ...prev[slotKey],
        file,
        preview: URL.createObjectURL(file),
        isEnabled: true,
        deleteCurrent: false
      }
    }));
  };

  const handleRemoveEditScanner = (slotKey: 'googlePay' | 'phonePe' | 'paytm') => {
    setEditScanners((prev) => ({
      ...prev,
      [slotKey]: {
        file: null,
        preview: null,
        isEnabled: false,
        deleteCurrent: true
      }
    }));
  };

  // Real-time synchronization: automatically invalidate caches and reload dashboard on changes
  useRealtimeSystemSync({
    apiBaseUrl,
    onSyncInvalidate: () => {
      loadDashboard();
      if (viewMode === 'EDIT' && editingVendorId) {
        loadAvailableGroups(editingVendorId);
      } else if (viewMode === 'CREATE') {
        loadAvailableGroups();
      }
    }
  });

  const handleReleaseExistingAllocation = async (allocationId: string, groupDesc: string) => {
    if (
      !window.confirm(
        `Are you sure you want to release the academic group "${groupDesc}" from this vendor? It will immediately become available for other vendors.`
      )
    ) {
      return;
    }
    try {
      setBusy(true);
      await ensureAdminToken();
      const res = await fetch(
        `${apiBaseUrl}/api/admin/vendors/allocations/${allocationId}/release`,
        {
          method: 'PATCH',
          headers: authHeaders()
        }
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        notify('error', data.message || 'Failed to release allocation.');
        return;
      }
      notify('success', `Academic group "${groupDesc}" released successfully.`);
      setEditExistingAllocations((prev) => prev.filter((a) => a.allocationId !== allocationId));
      setEditReleasedAllocationIds((prev) => [...prev, allocationId]);
      await loadAvailableGroups(editingVendorId || '');
      await loadDashboard();
    } catch {
      notify('error', 'Error releasing allocation.');
    } finally {
      setBusy(false);
    }
  };

  const handleStageGroupForEdit = (item: AcademicGroupItem) => {
    setEditNewStagedAllocations((prev) => {
      if (prev.some((p) => p.key === item.key)) return prev;
      return [...prev, item];
    });
    if (editForm.status === 'INACTIVE') {
      setEditForm((prev) => ({ ...prev, status: 'ACTIVE' }));
    }
    notify('success', `Added ${item.department} ${item.academicYear} Sec ${item.section} (${item.gender}) to staged list! Click "Save Changes" to finalize.`);
  };

  const handleRemoveStagedGroupForEdit = (key: string) => {
    setEditNewStagedAllocations((prev) => prev.filter((item) => item.key !== key));
  };

  const handleUpdateVendorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVendorId) return;

    if (
      !editForm.vendorName.trim() ||
      !editForm.contactPerson.trim() ||
      !editForm.mobile.trim() ||
      !editForm.email.trim() ||
      !editForm.address.trim()
    ) {
      notify('error', 'Please fill in all mandatory Vendor Basic Information fields.');
      return;
    }
    if (!editForm.beneficiaryName.trim() || !editForm.upiId.trim()) {
      notify('error', 'Beneficiary Account Name and Official UPI ID are required.');
      return;
    }
    if (!editForm.paymentAmount || isNaN(Number(editForm.paymentAmount)) || Number(editForm.paymentAmount) <= 0) {
      notify('error', 'Please enter a valid Uniform Fee Amount (₹) for this vendor.');
      return;
    }

    try {
      setBusy(true);
      await ensureAdminToken();
      const formData = new FormData();
      formData.append('vendorName', editForm.vendorName.trim());
      formData.append('contactPerson', editForm.contactPerson.trim());
      formData.append('mobile', editForm.mobile.trim());
      formData.append('email', editForm.email.trim());
      formData.append('address', editForm.address.trim());
      formData.append('gstNumber', editForm.gstNumber.trim());
      formData.append('status', editForm.status);
      formData.append('notes', editForm.notes.trim());
      formData.append('beneficiaryName', editForm.beneficiaryName.trim());
      formData.append('upiId', editForm.upiId.trim());
      formData.append('paymentInstructions', editForm.paymentInstructions);
      formData.append('paymentAmount', editForm.paymentAmount);

      formData.append('googlePayEnabled', String(editScanners.googlePay.isEnabled));
      formData.append('phonePeEnabled', String(editScanners.phonePe.isEnabled));
      formData.append('paytmEnabled', String(editScanners.paytm.isEnabled));

      if (editScanners.googlePay.deleteCurrent) formData.append('deleteGooglePay', 'true');
      if (editScanners.googlePay.file) formData.append('googlePayQR', editScanners.googlePay.file);

      if (editScanners.phonePe.deleteCurrent) formData.append('deletePhonePe', 'true');
      if (editScanners.phonePe.file) formData.append('phonePeQR', editScanners.phonePe.file);

      if (editScanners.paytm.deleteCurrent) formData.append('deletePaytm', 'true');
      if (editScanners.paytm.file) formData.append('paytmQR', editScanners.paytm.file);

      if (editNewStagedAllocations.length > 0) {
        formData.append('newAllocationsJson', JSON.stringify(editNewStagedAllocations));
      }
      if (editReleasedAllocationIds.length > 0) {
        formData.append('releasedAllocationIdsJson', JSON.stringify(editReleasedAllocationIds));
      }

      const res = await fetch(`${apiBaseUrl}/api/admin/vendors/${editingVendorId}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: formData
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        notify('error', data.message || 'Failed to update vendor.');
        return;
      }

      notify('success', `Vendor ${editForm.vendorName} (${editingVendorId}) updated successfully.`);
      await loadDashboard();
      await loadAvailableGroups();
      setViewMode('LIST');
    } catch (err) {
      notify('error', 'Network error while updating vendor.');
    } finally {
      setBusy(false);
    }
  };

  const openVendorDetails = async (vendorId: string) => {
    try {
      setBusy(true);
      await ensureAdminToken();
      let res = await fetch(`${apiBaseUrl}/api/admin/vendors/${vendorId}/details`, {
        headers: authHeaders()
      });
      if (res.status === 401) {
        await ensureAdminToken(true);
        res = await fetch(`${apiBaseUrl}/api/admin/vendors/${vendorId}/details`, {
          headers: authHeaders()
        });
      }
      const data = await res.json();
      if (data.success) {
        if (Array.isArray(data.allocations)) {
          data.allocations = data.allocations.filter((a: any) => !a.status || a.status === 'ACTIVE');
        }
        setActiveVendorDetails(data);
        setViewMode('DETAILS');
      }
    } catch (err) {
      notify('error', 'Failed to load vendor details.');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleVendorStatus = async (vendor: VendorItem) => {
    const nextStatus = vendor.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    if (
      !window.confirm(
        `Are you sure you want to mark ${vendor.vendorName} (${vendor.vendorId}) as ${nextStatus}?`
      )
    ) {
      return;
    }

    try {
      await ensureAdminToken();
      const res = await fetch(`${apiBaseUrl}/api/admin/vendors/${vendor.vendorId}/status`, {
        method: 'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        notify('error', data.message);
        return;
      }
      notify('success', data.message);
      loadDashboard();
    } catch (err) {
      notify('error', 'Failed to change vendor status.');
    }
  };

  const handleConfirmReassignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reassignModal || !reassignTargetVendorId || !reassignReason.trim()) return;

    try {
      setBusy(true);
      await ensureAdminToken();
      const res = await fetch(`${apiBaseUrl}/api/admin/vendors/reassign-group`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocationId: reassignModal.allocation.allocationId,
          targetVendorId: reassignTargetVendorId,
          reason: reassignReason,
          migrateUnpaidStudents: true
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        notify('error', data.message);
        return;
      }
      notify('success', data.message);
      setReassignModal(null);
      setReassignReason('');
      if (activeVendorDetails?.vendor?.vendorId) {
        openVendorDetails(activeVendorDetails.vendor.vendorId);
      }
      loadDashboard();
    } catch (err) {
      notify('error', 'Reassignment failed.');
    } finally {
      setBusy(false);
    }
  };

  const { available: availableGroupsInView, hiddenTaken: hiddenTakenInView } =
    getAvailableCombinationsForSelection();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* Top Header Bar */}
      <div
        style={{
          background: '#ffffff',
          padding: '20px 24px',
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px'
        }}
      >
        <div>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 800,
              color: '#2563eb',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Store size={14} /> MIT Mysore Uniform Management System • 8,000+ Students
          </span>
          <h1 style={{ fontSize: '22px', fontWeight: 900, color: '#0f172a', margin: '4px 0 2px 0' }}>
            VENDOR MANAGEMENT & EXCLUSIVE GROUP ALLOCATION
          </h1>
          <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
            Manage multi-vendor profiles, isolated QR payment scanners, and conflict-free academic group allocations
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {viewMode !== 'LIST' && (
            <button
              type="button"
              onClick={() => setViewMode('LIST')}
              style={{
                background: '#f1f5f9',
                color: '#1e293b',
                border: '1px solid #cbd5e1',
                padding: '9px 16px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <ArrowLeft size={14} /> Back to All Vendors
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              loadAvailableGroups();
              setViewMode('CREATE');
            }}
            style={{
              background: '#2563eb',
              color: '#ffffff',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 2px 6px rgba(37,99,235,0.3)'
            }}
          >
            <Plus size={16} /> + CREATE NEW VENDOR
          </button>
        </div>
      </div>

      {banner.text && (
        <div
          style={{
            padding: '12px 18px',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: banner.type === 'error' ? '#fef2f2' : '#ecfdf5',
            color: banner.type === 'error' ? '#991b1b' : '#065f46',
            border: `1px solid ${banner.type === 'error' ? '#fca5a5' : '#a7f3d0'}`
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {banner.type === 'error' ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
            <span>{banner.text}</span>
          </div>
          <button
            onClick={() => setBanner({ type: '', text: '' })}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 800, fontSize: '14px' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* 7 Mandatory Statistics Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '14px' }}>
        <div style={{ background: '#ffffff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Total Vendors</div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#0f172a', marginTop: '4px' }}>{stats.totalVendors}</div>
        </div>
        <div style={{ background: '#ffffff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #bbf7d0', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#16a34a', textTransform: 'uppercase' }}>Active Vendors</div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#16a34a', marginTop: '4px' }}>{stats.activeVendors}</div>
        </div>
        <div style={{ background: '#ffffff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Inactive Vendors</div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#64748b', marginTop: '4px' }}>{stats.inactiveVendors}</div>
        </div>
        <div style={{ background: '#ffffff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #bfdbfe', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase' }}>Assigned Depts</div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#2563eb', marginTop: '4px' }}>{stats.totalAssignedDepartments}</div>
        </div>
        <div style={{ background: '#ffffff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #c7d2fe', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#4f46e5', textTransform: 'uppercase' }}>Allocated Students</div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#4f46e5', marginTop: '4px' }}>{stats.totalAllocatedStudents}</div>
        </div>
        <div style={{ background: '#ffffff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #fed7aa', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#d97706', textTransform: 'uppercase' }}>Unassigned Groups</div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#d97706', marginTop: '4px' }}>{stats.unassignedAcademicGroups}</div>
        </div>
        <div style={{ background: '#ffffff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #ffedd5', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#ea580c', textTransform: 'uppercase' }}>Pending Allocations</div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#ea580c', marginTop: '4px' }}>{stats.pendingVendorAllocations}</div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* VIEW 1: VENDOR LIST & SEARCH / FILTER TABLE                           */}
      {/* ===================================================================== */}
      {viewMode === 'LIST' && (
        <div
          style={{
            background: '#ffffff',
            borderRadius: '14px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            overflow: 'hidden'
          }}
        >
          {/* Filters Bar */}
          <div
            style={{
              padding: '16px 20px',
              background: '#f8fafc',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px',
              alignItems: 'center'
            }}
          >
            <div style={{ position: 'relative', flex: '1 1 240px', minWidth: '220px' }}>
              <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Search Vendor Name, ID, Contact..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                style={{
                  width: '100%',
                  padding: '9px 12px 9px 36px',
                  fontSize: '13px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  outline: 'none',
                  background: '#ffffff'
                }}
              />
            </div>
            <select
              value={filters.department}
              onChange={(e) => setFilters({ ...filters, department: e.target.value })}
              style={{
                flex: '1 1 280px',
                padding: '10px 16px',
                fontSize: '13px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#1e293b',
                fontWeight: 600,
                outline: 'none'
              }}
            >
              <option value="ALL">All Departments</option>
              <optgroup label="Undergraduate Engineering (B.E.)">
                {DEPARTMENTS.filter((d) => d.category === 'Undergraduate (B.E.)').map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.code} – {d.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Postgraduate Programs">
                {DEPARTMENTS.filter((d) => d.category === 'Postgraduate').map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.code} – {d.name}
                  </option>
                ))}
              </optgroup>
            </select>
            <select
              value={filters.academicYear}
              onChange={(e) => setFilters({ ...filters, academicYear: e.target.value })}
              style={{
                padding: '9px 14px',
                fontSize: '13px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#1e293b',
                fontWeight: 600,
                outline: 'none'
              }}
            >
              <option value="ALL">All Academic Years</option>
              {['1st Year', '2nd Year', '3rd Year', '4th Year'].map((yr) => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </select>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              style={{
                padding: '9px 14px',
                fontSize: '13px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#1e293b',
                fontWeight: 600,
                outline: 'none'
              }}
            >
              <option value="ALL">All Vendor Statuses</option>
              <option value="ACTIVE">Active Vendors</option>
              <option value="INACTIVE">Inactive Vendors</option>
            </select>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Vendor Name / ID</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Assigned Departments</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Assigned Years</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Assigned Sections</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Allocated Students</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>QR Scanners</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {vendors.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8' }}>
                      No vendors configured yet. Click "+ CREATE NEW VENDOR" above to register your first uniform vendor.
                    </td>
                  </tr>
                ) : (
                  vendors.map((v) => (
                    <tr key={v.vendorId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '14px' }}>{v.vendorName}</div>
                        <div style={{ fontFamily: 'monospace', color: '#2563eb', fontWeight: 700, fontSize: '12px', marginTop: '2px' }}>{v.vendorId}</div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                          {v.contactPerson} • {v.mobile}
                        </div>
                        <div style={{ marginTop: '4px' }}>
                          <span style={{ display: 'inline-block', background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 800 }}>
                            Fee: {v.paymentConfig?.paymentAmount ? `₹${Number(v.paymentConfig.paymentAmount).toLocaleString('en-IN')}` : 'Not Configured'}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {v.assignedDepartments && v.assignedDepartments.length > 0 ? (
                            v.assignedDepartments.map((d) => (
                              <span
                                key={d}
                                style={{
                                  padding: '3px 8px',
                                  background: '#eff6ff',
                                  color: '#1d4ed8',
                                  border: '1px solid #bfdbfe',
                                  borderRadius: '6px',
                                  fontWeight: 700,
                                  fontSize: '11px'
                                }}
                              >
                                {d}
                              </span>
                            ))
                          ) : (
                            <span style={{ color: '#94a3b8', fontSize: '12px' }}>None</span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle', fontWeight: 600, color: '#334155' }}>
                        {v.assignedYears.join(', ') || '—'}
                      </td>
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        <span style={{ fontFamily: 'monospace', color: '#475569', fontWeight: 600 }}>
                          {v.allocations?.length || 0} exclusive group(s)
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle', fontWeight: 900, color: '#0f172a', fontSize: '15px' }}>
                        {v.allocatedStudentsCount}
                      </td>
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '4px 10px',
                            borderRadius: '20px',
                            fontWeight: 800,
                            fontSize: '11px',
                            background: v.activeScannersCount > 0 ? '#ecfdf5' : '#fffbeb',
                            color: v.activeScannersCount > 0 ? '#047857' : '#b45309',
                            border: `1px solid ${v.activeScannersCount > 0 ? '#a7f3d0' : '#fde68a'}`
                          }}
                        >
                          {v.activeScannersCount} / 3 Active
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        <span
                          style={{
                            padding: '4px 10px',
                            borderRadius: '20px',
                            fontWeight: 800,
                            fontSize: '11px',
                            background: v.status === 'ACTIVE' ? '#dcfce7' : '#f1f5f9',
                            color: v.status === 'ACTIVE' ? '#15803d' : '#64748b'
                          }}
                        >
                          {v.status}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          onClick={() => handleStartEditVendor(v.vendorId)}
                          style={{
                            background: '#0284c7',
                            color: '#ffffff',
                            border: 'none',
                            padding: '6px 14px',
                            borderRadius: '6px',
                            fontWeight: 700,
                            fontSize: '12px',
                            cursor: 'pointer',
                            marginRight: '8px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Edit size={12} /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => openVendorDetails(v.vendorId)}
                          style={{
                            background: '#2563eb',
                            color: '#ffffff',
                            border: 'none',
                            padding: '6px 14px',
                            borderRadius: '6px',
                            fontWeight: 700,
                            fontSize: '12px',
                            cursor: 'pointer',
                            marginRight: '8px'
                          }}
                        >
                          Manage / View
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleVendorStatus(v)}
                          style={{
                            background: '#ffffff',
                            color: '#334155',
                            border: '1px solid #cbd5e1',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            fontWeight: 600,
                            fontSize: '12px',
                            cursor: 'pointer'
                          }}
                        >
                          {v.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* VIEW 2: CREATE NEW VENDOR PAGE (INFO + 3 SCANNERS + EXCLUSIVE GROUPS) */}
      {/* ===================================================================== */}
      {viewMode === 'CREATE' && (
        <form onSubmit={handleCreateVendorSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
          {/* PART 2: VENDOR BASIC INFORMATION */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: '14px',
              border: '1px solid #e2e8f0',
              padding: '24px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              display: 'flex',
              flexDirection: 'column',
              gap: '18px'
            }}
          >
            <div
              style={{
                borderBottom: '1px solid #f1f5f9',
                paddingBottom: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                  1. VENDOR BASIC INFORMATION
                </h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                  Register official uniform vendor details and sequential Vendor ID
                </p>
              </div>
              <div
                style={{
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  padding: '6px 14px',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
              >
                <span style={{ color: '#64748b', marginRight: '6px' }}>Auto Vendor ID:</span>
                <strong style={{ fontFamily: 'monospace', color: '#1e40af' }}>{nextVendorId}</strong>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '16px'
              }}
            >
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Vendor / Company Name *
                </label>
                <input
                  type="text"
                  required
                  value={vendorForm.vendorName}
                  onChange={(e) => setVendorForm({ ...vendorForm, vendorName: e.target.value })}
                  placeholder="e.g., Royal Apparels Mysuru Pvt. Ltd."
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: '13px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    outline: 'none',
                    background: '#ffffff'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Owner / Contact Person *
                </label>
                <input
                  type="text"
                  required
                  value={vendorForm.contactPerson}
                  onChange={(e) => setVendorForm({ ...vendorForm, contactPerson: e.target.value })}
                  placeholder="Full Name"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: '13px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    outline: 'none',
                    background: '#ffffff'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Mobile Number *
                </label>
                <input
                  type="tel"
                  required
                  value={vendorForm.mobile}
                  onChange={(e) => setVendorForm({ ...vendorForm, mobile: e.target.value })}
                  placeholder="10-digit Mobile Number"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: '13px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    outline: 'none',
                    background: '#ffffff'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={vendorForm.email}
                  onChange={(e) => setVendorForm({ ...vendorForm, email: e.target.value })}
                  placeholder="vendor@example.com"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: '13px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    outline: 'none',
                    background: '#ffffff'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  GST Number (Optional)
                </label>
                <input
                  type="text"
                  value={vendorForm.gstNumber}
                  onChange={(e) => setVendorForm({ ...vendorForm, gstNumber: e.target.value })}
                  placeholder="29ABCDE1234F1Z5"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: '13px',
                    fontFamily: 'monospace',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    outline: 'none',
                    background: '#ffffff'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Vendor Status *
                </label>
                <select
                  value={vendorForm.status}
                  onChange={(e) => setVendorForm({ ...vendorForm, status: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: '13px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    fontWeight: 600,
                    outline: 'none'
                  }}
                >
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Business Address *
                </label>
                <input
                  type="text"
                  required
                  value={vendorForm.address}
                  onChange={(e) => setVendorForm({ ...vendorForm, address: e.target.value })}
                  placeholder="Complete Office / Workshop Address"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: '13px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    outline: 'none',
                    background: '#ffffff'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Additional Notes
                </label>
                <input
                  type="text"
                  value={vendorForm.notes}
                  onChange={(e) => setVendorForm({ ...vendorForm, notes: e.target.value })}
                  placeholder="Delivery terms or batch remarks"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: '13px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    outline: 'none',
                    background: '#ffffff'
                  }}
                />
              </div>
            </div>
          </div>

          {/* PART 3: VENDOR PAYMENT CONFIGURATION & 3 SEPARATE QR SCANNERS */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: '14px',
              border: '1px solid #e2e8f0',
              padding: '24px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              display: 'flex',
              flexDirection: 'column',
              gap: '18px'
            }}
          >
            <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '14px' }}>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                2. VENDOR PAYMENT CONFIGURATION
              </h2>
              <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                Upload isolated Google Pay, PhonePe, and Paytm QR scanners dedicated exclusively to this vendor's bank account.
              </p>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '16px'
              }}
            >
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Beneficiary / Account Holder Name *
                </label>
                <input
                  type="text"
                  required
                  value={vendorForm.beneficiaryName}
                  onChange={(e) =>
                    setVendorForm({ ...vendorForm, beneficiaryName: e.target.value })
                  }
                  placeholder="Official Bank Account Name"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: '13px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    outline: 'none',
                    background: '#ffffff'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Official Vendor UPI ID *
                </label>
                <input
                  type="text"
                  required
                  value={vendorForm.upiId}
                  onChange={(e) => setVendorForm({ ...vendorForm, upiId: e.target.value })}
                  placeholder="vendorname@okaxis / @ybl"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: '13px',
                    fontFamily: 'monospace',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    outline: 'none',
                    background: '#ffffff'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#0f172a', marginBottom: '6px' }}>
                  Uniform Fee Amount (₹) <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={vendorForm.paymentAmount}
                  onChange={(e) =>
                    setVendorForm({ ...vendorForm, paymentAmount: e.target.value })
                  }
                  placeholder="Enter final uniform fee amount (e.g. 1500)"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: '13px',
                    fontWeight: 750,
                    borderRadius: '8px',
                    border: '1.5px solid #cbd5e1',
                    outline: 'none',
                    background: '#ffffff'
                  }}
                />
                <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginTop: '4px' }}>
                  Required & Final: Students allocated to this vendor will be charged exactly this uniform fee amount.
                </span>
              </div>
            </div>

            {/* 3 Individual Vendor QR Upload Cards */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: '16px',
                marginTop: '10px'
              }}
            >
              {[
                { key: 'googlePay' as const, title: '1. Google Pay QR Scanner' },
                { key: 'phonePe' as const, title: '2. PhonePe QR Scanner' },
                { key: 'paytm' as const, title: '3. Paytm QR Scanner' }
              ].map((slot) => {
                const state = scanners[slot.key];
                return (
                  <div
                    key={slot.key}
                    style={{
                      padding: '16px',
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      background: '#f8fafc',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '14px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <QrCode size={15} style={{ color: '#2563eb' }} /> {slot.title}
                      </span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', color: '#334155' }}>
                        <input
                          type="checkbox"
                          checked={state.isEnabled}
                          onChange={(e) =>
                            setScanners((prev) => ({
                              ...prev,
                              [slot.key]: { ...prev[slot.key], isEnabled: e.target.checked }
                            }))
                          }
                        />
                        <span>{state.isEnabled ? 'Enabled' : 'Disabled'}</span>
                      </label>
                    </div>

                    <div
                      style={{
                        height: '180px',
                        background: '#ffffff',
                        borderRadius: '10px',
                        border: '1px solid #cbd5e1',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '10px',
                        overflow: 'hidden'
                      }}
                    >
                      {state.preview ? (
                        <img
                          src={state.preview}
                          alt={slot.title}
                          style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
                        />
                      ) : (
                        <div style={{ textAlign: 'center', color: '#94a3b8' }}>
                          <QrCode size={40} style={{ margin: '0 auto 6px auto', opacity: 0.35, display: 'block' }} />
                          <span style={{ fontSize: '12px', fontWeight: 600 }}>No QR Image Selected</span>
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                        {state.preview ? 'Replace QR Scanner Image:' : 'Upload QR Scanner Image:'}
                      </span>
                      <label
                        htmlFor={`add-scanner-file-${slot.key}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          padding: '9px 14px',
                          background: '#eff6ff',
                          border: '1.5px solid #3b82f6',
                          borderRadius: '8px',
                          color: '#1d4ed8',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          boxShadow: '0 1px 3px rgba(37, 99, 235, 0.1)',
                          transition: 'all 0.15s ease',
                          textAlign: 'center',
                          boxSizing: 'border-box'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#dbeafe')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = '#eff6ff')}
                      >
                        <Upload size={14} />
                        <span>
                          {state.file
                            ? `Selected: ${state.file.name.length > 20 ? state.file.name.slice(0, 18) + '...' : state.file.name}`
                            : state.preview
                            ? 'Choose New QR Image'
                            : 'Choose QR Image File'}
                        </span>
                      </label>
                      <input
                        id={`add-scanner-file-${slot.key}`}
                        type="file"
                        accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                        onChange={(e) => handleScannerFileSelect(slot.key, e)}
                        style={{ display: 'none' }}
                      />
                      {state.preview && (
                        <button
                          type="button"
                          onClick={() =>
                            setScanners((prev) => ({
                              ...prev,
                              [slot.key]: { file: null, preview: null, isEnabled: false }
                            }))
                          }
                          style={{
                            width: '100%',
                            padding: '6px 12px',
                            fontSize: '12px',
                            color: '#dc2626',
                            background: '#fef2f2',
                            borderRadius: '6px',
                            border: '1px solid #fecaca',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          Remove QR Image
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* PART 4 & 5: EXCLUSIVE DEPARTMENT, YEAR & SECTION ALLOCATION */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: '14px',
              border: '2px solid #2563eb',
              boxShadow: '0 4px 12px rgba(37,99,235,0.08)',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px'
            }}
          >
            <div
              style={{
                borderBottom: '1px solid #e2e8f0',
                paddingBottom: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
              }}
            >
              <div>
                <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#2563eb' }}>
                  Mandatory Exclusive Allocation Engine
                </span>
                <h2 style={{ margin: '4px 0 2px 0', fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                  3. SELECT DEPARTMENTS, YEARS & SECTIONS FOR THIS VENDOR
                </h2>
                <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                  Academic groups already assigned to another active vendor are automatically removed from the available selection list below.
                </p>
              </div>
              <button
                type="button"
                onClick={() => loadAvailableGroups()}
                style={{
                  padding: '8px 14px',
                  background: '#f1f5f9',
                  color: '#334155',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <RefreshCw size={13} /> Refresh Live Availability
              </button>
            </div>

            {/* Step-by-Step Academic Group Filter Controls */}
            <div
              style={{
                background: '#f8fafc',
                padding: '18px',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
              }}
            >
              {/* Department Dropdown Selector (Placed above Academic Year) */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>
                  Select Department
                </label>
                <select
                  value={builder.department}
                  onChange={(e) => setBuilder({ ...builder, department: e.target.value })}
                  style={{
                    width: '100%',
                    height: '42px',
                    padding: '10px 16px',
                    fontSize: '13px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#0f172a',
                    fontWeight: 600,
                    outline: 'none',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                  }}
                >
                  <option value="ALL">All Departments</option>
                  <optgroup label="Undergraduate Engineering (B.E.)">
                    {DEPARTMENTS.filter((d) => d.category === 'Undergraduate (B.E.)').map((d) => (
                      <option key={d.code} value={d.code}>
                        {d.code} – {d.name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Postgraduate Programs">
                    {DEPARTMENTS.filter((d) => d.category === 'Postgraduate').map((d) => (
                      <option key={d.code} value={d.code}>
                        {d.code} – {d.name}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {/* Select Academic Year(s) */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>
                  Select Academic Year(s)
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {['1st Year', '2nd Year', '3rd Year', '4th Year'].map((yr) => {
                    const active = builder.academicYears.includes(yr);
                    return (
                      <button
                        key={yr}
                        type="button"
                        onClick={() => {
                          const exists = builder.academicYears.includes(yr);
                          const nextYears = exists
                            ? builder.academicYears.filter((y) => y !== yr)
                            : [...builder.academicYears, yr];
                          if (nextYears.length > 0) {
                            setBuilder({ ...builder, academicYears: nextYears });
                          }
                        }}
                        style={{
                          padding: '9px 16px',
                          borderRadius: '8px',
                          fontSize: '13px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          border: active ? '1px solid #2563eb' : '1px solid #cbd5e1',
                          background: active ? '#2563eb' : '#ffffff',
                          color: active ? '#ffffff' : '#334155',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {yr}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Select Gender (ONLY Girls and Boys) */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>
                  Select Gender
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {['Boys', 'Girls'].map((g) => {
                    const active = builder.genders.includes(g);
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => {
                          const exists = builder.genders.includes(g);
                          const nextGenders = exists
                            ? builder.genders.filter((x) => x !== g)
                            : [...builder.genders, g];
                          if (nextGenders.length > 0) {
                            setBuilder({ ...builder, genders: nextGenders });
                          }
                        }}
                        style={{
                          padding: '9px 20px',
                          borderRadius: '8px',
                          fontSize: '13px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          border: active ? '1px solid #2563eb' : '1px solid #cbd5e1',
                          background: active ? '#2563eb' : '#ffffff',
                          color: active ? '#ffffff' : '#334155',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {g}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* AVAILABLE UNASSIGNED SECTIONS MATRIX */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', color: '#1e293b' }}>
                  Available Unassigned Academic Groups ({availableGroupsInView.length} Available)
                </h3>
                {availableGroupsInView.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleStageAllAvailableInView(availableGroupsInView)}
                    style={{
                      padding: '7px 14px',
                      background: '#eff6ff',
                      color: '#1d4ed8',
                      border: '1px solid #bfdbfe',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    + Select All {availableGroupsInView.length} Available Groups Shown
                  </button>
                )}
              </div>

              {availableGroupsInView.length === 0 ? (
                <div
                  style={{
                    padding: '16px 20px',
                    background: '#fffbeb',
                    border: '1px solid #fde68a',
                    borderRadius: '10px',
                    fontSize: '12px',
                    color: '#92400e',
                    fontWeight: 600
                  }}
                >
                  All sections for the selected Department(s), Year(s) and Gender are either already assigned to an active vendor or already added to your staged selection list below.
                </div>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                    gap: '10px',
                    maxHeight: '280px',
                    overflowY: 'auto',
                    padding: '4px'
                  }}
                >
                  {availableGroupsInView.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => handleStageGroup(item)}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '10px',
                        border: '1px solid #cbd5e1',
                        background: '#ffffff',
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>{item.department} – {item.academicYear}</span>
                          <span
                            style={{
                              padding: '1px 6px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: 800,
                              background: item.gender === 'Girls' ? '#fce7f3' : '#dbeafe',
                              color: item.gender === 'Girls' ? '#9d174d' : '#1e40af',
                              border: item.gender === 'Girls' ? '1px solid #fbcfe8' : '1px solid #bfdbfe'
                            }}
                          >
                            {item.gender}
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>
                          {item.course} • <strong>Section {item.section}</strong> ({item.semester})
                        </div>
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: '#2563eb' }}>+ Assign</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Transparency Notice: Groups Automatically Removed */}
              {hiddenTakenInView.length > 0 && (
                <div
                  style={{
                    padding: '12px 16px',
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    fontSize: '11px',
                    color: '#475569'
                  }}
                >
                  <strong>Automatically Excluded ({hiddenTakenInView.length} group(s) already assigned to other active vendors):</strong>{' '}
                  {hiddenTakenInView.map((h) => (
                    <span key={h.key} style={{ display: 'inline-block', marginRight: '8px', color: '#64748b', fontFamily: 'monospace' }}>
                      [{h.department} {h.academicYear} Sec {h.section} ({h.gender}) → {h.ownedByVendorId}]
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Staged Exclusive Allocations for This New Vendor */}
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', color: '#065f46' }}>
                  Selected Exclusive Groups for This Vendor ({stagedAllocations.length})
                </h4>
                {stagedAllocations.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setStagedAllocations([])}
                    style={{ background: 'none', border: 'none', fontSize: '12px', color: '#dc2626', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Clear All
                  </button>
                )}
              </div>

              {stagedAllocations.length === 0 ? (
                <div style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>
                  No academic groups selected yet. Click "+ Assign" on any available group above.
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {stagedAllocations.map((s) => (
                    <span
                      key={s.key}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        background: '#ecfdf5',
                        border: '1px solid #a7f3d0',
                        color: '#064e3b',
                        fontSize: '12px',
                        fontWeight: 700
                      }}
                    >
                      <span>
                        {s.course} • {s.department} • {s.academicYear} • Section {s.section}
                        <span
                          style={{
                            marginLeft: '6px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            background: s.gender === 'Girls' ? '#fce7f3' : '#e0e7ff',
                            color: s.gender === 'Girls' ? '#9d174d' : '#3730a3'
                          }}
                        >
                          {s.gender || 'Boys'}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveStagedGroup(s.key)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#dc2626',
                          fontWeight: 800,
                          cursor: 'pointer',
                          padding: 0,
                          marginLeft: '4px'
                        }}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div style={{ paddingTop: '16px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setViewMode('LIST')}
                style={{
                  padding: '10px 20px',
                  background: '#f1f5f9',
                  color: '#334155',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                style={{
                  padding: '10px 24px',
                  background: busy ? '#93c5fd' : '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  boxShadow: '0 2px 6px rgba(37,99,235,0.3)'
                }}
              >
                {busy ? 'Validating & Saving Vendor...' : 'Create & Save Vendor'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ===================================================================== */}
      {/* VIEW 3: VENDOR DETAILS, ASSIGNED STUDENTS, ORDERS & REASSIGNMENT      */}
      {/* ===================================================================== */}
      {viewMode === 'DETAILS' && activeVendorDetails && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
          <div
            style={{
              background: '#ffffff',
              padding: '24px',
              borderRadius: '14px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px'
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 800, color: '#2563eb' }}>
                {activeVendorDetails.vendor.vendorId}
              </span>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900, color: '#0f172a' }}>
                {activeVendorDetails.vendor.vendorName}
              </h2>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
                Contact: <strong>{activeVendorDetails.vendor.contactPerson}</strong> ({activeVendorDetails.vendor.mobile}) • Beneficiary:{' '}
                <strong>{activeVendorDetails.paymentConfig?.beneficiaryName || 'N/A'}</strong> (UPI:{' '}
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#2563eb' }}>{activeVendorDetails.paymentConfig?.upiId || 'N/A'}</span>) • Uniform Fee:{' '}
                <strong style={{ color: '#047857' }}>{activeVendorDetails.paymentConfig?.paymentAmount ? `₹${Number(activeVendorDetails.paymentConfig.paymentAmount).toLocaleString('en-IN')}` : 'Not Configured'}</strong>
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleStartEditVendor(activeVendorDetails.vendor.vendorId)}
              style={{
                background: '#0284c7',
                color: '#ffffff',
                border: 'none',
                padding: '9px 18px',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 2px 4px rgba(2,132,199,0.2)'
              }}
            >
              <Edit size={15} /> Edit This Vendor
            </button>
          </div>

          {/* ========================================================= */}
          {/* 1B. VENDOR PORTAL SECURE ACCESS & CREDENTIAL CONTROLS     */}
          {/* ========================================================= */}
          <VendorPortalAccessCard
            vendorId={activeVendorDetails.vendor.vendorId}
            apiBaseUrl={apiBaseUrl}
            authToken={authToken}
          />

          {/* ========================================================= */}
          {/* 2. DEDICATED UPI PAYMENT QR SCANNERS (3 SLOTS)             */}
          {/* ========================================================= */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: '14px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              padding: '22px',
              display: 'flex',
              flexDirection: 'column',
              gap: '18px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                  Dedicated Vendor UPI QR Scanners & Live Configuration
                </h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                  Only enabled scanners with uploaded QR images are routed to students assigned to this vendor.
                </p>
              </div>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  padding: '4px 12px',
                  borderRadius: '20px',
                  background: (activeVendorDetails.activeScannersCount || 0) > 0 ? '#ecfdf5' : '#fffbeb',
                  color: (activeVendorDetails.activeScannersCount || 0) > 0 ? '#047857' : '#b45309',
                  border: `1px solid ${(activeVendorDetails.activeScannersCount || 0) > 0 ? '#a7f3d0' : '#fde68a'}`
                }}
              >
                {activeVendorDetails.activeScannersCount || 0} / 3 Active Scanners
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
              {[
                { slotKey: 'googlePay' as const, title: 'Google Pay (GPay)', data: activeVendorDetails.paymentConfig?.googlePayQR, accent: '#2563eb' },
                { slotKey: 'phonePe' as const, title: 'PhonePe', data: activeVendorDetails.paymentConfig?.phonePeQR, accent: '#7c3aed' },
                { slotKey: 'paytm' as const, title: 'Paytm', data: activeVendorDetails.paymentConfig?.paytmQR, accent: '#0284c7' }
              ].map((slot) => {
                const qrUrl = slot.data?.qrImageUrl;
                const isEnabled = Boolean(slot.data?.isEnabled);
                const hasQr = Boolean(qrUrl);
                const isActive = hasQr && isEnabled;

                return (
                  <div
                    key={slot.slotKey}
                    style={{
                      background: '#ffffff',
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between'
                    }}
                  >
                    {/* Header */}
                    <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc' }}>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>{slot.title}</h4>
                        <small style={{ color: '#94a3b8', fontSize: '11px' }}>
                          Updated: {slot.data?.updatedAt ? new Date(slot.data.updatedAt).toLocaleDateString('en-IN') : 'Not uploaded'}
                        </small>
                      </div>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '3px 10px',
                          borderRadius: '12px',
                          background: isActive ? '#dcfce7' : '#f1f5f9',
                          color: isActive ? '#15803d' : '#64748b',
                          border: `1px solid ${isActive ? '#86efac' : '#cbd5e1'}`
                        }}
                      >
                        {isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    {/* QR Image Box */}
                    <div style={{ padding: '20px', background: '#fafafa', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '190px' }}>
                      {hasQr ? (
                        <img
                          src={qrUrl!.startsWith('http') ? qrUrl! : `${apiBaseUrl}${qrUrl}`}
                          alt={slot.title}
                          onError={(e) => {
                            const target = e.currentTarget;
                            if (qrUrl && !target.src.includes(':4000')) {
                              target.src = `http://localhost:4000${qrUrl}`;
                            }
                          }}
                          style={{ width: '150px', height: '180px', objectFit: 'contain', background: '#fff', padding: '6px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}
                        />
                      ) : (
                        <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                          <QrCode size={40} style={{ opacity: 0.3, margin: '0 auto 6px auto', display: 'block' }} />
                          No QR Scanner Image Uploaded
                        </div>
                      )}
                    </div>

                    {/* Action Controls */}
                    <div style={{ padding: '12px', borderTop: '1px solid #f1f5f9', background: '#ffffff', display: 'grid', gridTemplateColumns: hasQr ? '1fr 1fr' : '1fr', gap: '8px' }}>
                      {!hasQr ? (
                        <button
                          type="button"
                          onClick={() => {
                            setVendorUploadQrModal({
                              vendorId: activeVendorDetails.vendor.vendorId,
                              slotKey: slot.slotKey,
                              providerTitle: slot.title,
                              mode: 'UPLOAD'
                            });
                            setModalQrFile(null);
                            setModalQrPreview(null);
                          }}
                          style={{ padding: '8px', background: slot.accent, color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 700, fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                        >
                          <Upload size={13} /> Upload New Scanner
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setVendorUploadQrModal({
                                vendorId: activeVendorDetails.vendor.vendorId,
                                slotKey: slot.slotKey,
                                providerTitle: slot.title,
                                mode: 'REPLACE'
                              });
                              setModalQrFile(null);
                              setModalQrPreview(null);
                            }}
                            style={{ padding: '7px', background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 700, fontSize: '11px', cursor: 'pointer' }}
                          >
                            Replace Scanner
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setVendorPreviewQrModal({
                                provider: slot.title,
                                qrImageUrl: qrUrl!,
                                vendorName: activeVendorDetails.vendor.vendorName,
                                beneficiaryName: activeVendorDetails.paymentConfig?.beneficiaryName || 'N/A',
                                upiId: activeVendorDetails.paymentConfig?.upiId || 'N/A'
                              });
                            }}
                            style={{ padding: '7px', background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '6px', fontWeight: 700, fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                          >
                            <Eye size={12} /> Preview / Download
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleToggleDetailsScanner(slot.slotKey, isEnabled)}
                            style={{
                              padding: '7px',
                              background: isEnabled ? '#fff7ed' : '#ecfdf5',
                              color: isEnabled ? '#c2410c' : '#15803d',
                              border: `1px solid ${isEnabled ? '#fdba74' : '#86efac'}`,
                              borderRadius: '6px',
                              fontWeight: 700,
                              fontSize: '11px',
                              cursor: 'pointer'
                            }}
                          >
                            {isEnabled ? 'Disable Method' : 'Enable Method'}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleDeleteDetailsScanner(slot.slotKey, slot.title)}
                            style={{ padding: '7px', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fca5a5', borderRadius: '6px', fontWeight: 700, fontSize: '11px', cursor: 'pointer' }}
                          >
                            Delete Scanner
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Assigned Academic Groups with Reassignment Action */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: '14px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              overflow: 'hidden'
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
              <h3 style={{ margin: 0, fontWeight: 800, color: '#0f172a', fontSize: '14px' }}>
                Exclusively Assigned Academic Groups ({activeVendorDetails.allocations.length})
              </h3>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>Allocation ID</th>
                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>Level & Course</th>
                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>Department</th>
                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>Academic Year</th>
                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>Semester</th>
                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>Section</th>
                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>Gender</th>
                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>Status</th>
                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', textAlign: 'right' }}>Reassignment Action</th>
                  </tr>
                </thead>
                <tbody>
                  {activeVendorDetails.allocations.map((alloc: VendorAllocation) => (
                    <tr key={alloc.allocationId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 700, color: '#2563eb' }}>{alloc.allocationId}</td>
                      <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                        {alloc.educationLevel} • {alloc.course}
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 800, color: '#1d4ed8' }}>{alloc.department}</td>
                      <td style={{ padding: '12px 16px' }}>{alloc.academicYear}</td>
                      <td style={{ padding: '12px 16px' }}>{alloc.semester}</td>
                      <td style={{ padding: '12px 16px', fontWeight: 700 }}>Section {alloc.section}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 700,
                            background: alloc.gender === 'Girls' ? '#fce7f3' : alloc.gender === 'Boys' ? '#dbeafe' : '#f1f5f9',
                            color: alloc.gender === 'Girls' ? '#9d174d' : alloc.gender === 'Boys' ? '#1e40af' : '#475569',
                            border: `1px solid ${alloc.gender === 'Girls' ? '#fbcfe8' : alloc.gender === 'Boys' ? '#bfdbfe' : '#cbd5e1'}`
                          }}
                        >
                          {alloc.gender || 'All'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 700,
                            background: alloc.status === 'ACTIVE' ? '#ecfdf5' : '#f1f5f9',
                            color: alloc.status === 'ACTIVE' ? '#065f46' : '#64748b',
                            border: `1px solid ${alloc.status === 'ACTIVE' ? '#a7f3d0' : '#cbd5e1'}`
                          }}
                        >
                          {alloc.status}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        {alloc.status === 'ACTIVE' && (
                          <button
                            type="button"
                            onClick={() => {
                              setReassignModal({ allocation: alloc });
                              setReassignTargetVendorId('');
                            }}
                            style={{
                              padding: '6px 12px',
                              background: '#fffbeb',
                              color: '#92400e',
                              border: '1px solid #fde68a',
                              borderRadius: '6px',
                              fontWeight: 700,
                              fontSize: '12px',
                              cursor: 'pointer'
                            }}
                          >
                            Reassign to Another Vendor
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Assigned Students & Payment Records Table */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: '14px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              overflow: 'hidden'
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
              <h3 style={{ margin: 0, fontWeight: 800, color: '#0f172a', fontSize: '14px' }}>
                Auto-Assigned Students ({activeVendorDetails.assignedStudents.length}) & Payment Records ({activeVendorDetails.paymentRecords.length})
              </h3>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>USN</th>
                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>Student Name</th>
                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>Academic Group</th>
                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>Assignment Status</th>
                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>Assigned At</th>
                  </tr>
                </thead>
                <tbody>
                  {activeVendorDetails.assignedStudents.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '30px 20px', textAlign: 'center', color: '#94a3b8' }}>
                        No students have accessed or paid through this vendor yet.
                      </td>
                    </tr>
                  ) : (
                    activeVendorDetails.assignedStudents.map((stu: any) => (
                      <tr key={stu._id || stu.registrationId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 800, color: '#0f172a' }}>{stu.usn}</td>
                        <td style={{ padding: '12px 16px', fontWeight: 600 }}>{stu.studentName || 'Student'}</td>
                        <td style={{ padding: '12px 16px', color: '#475569' }}>
                          {stu.course} • {stu.department} • {stu.academicYear} • Sec {stu.section}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span
                            style={{
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 700,
                              background: stu.assignmentStatus === 'LOCKED_BY_PAYMENT' ? '#ecfdf5' : '#eff6ff',
                              color: stu.assignmentStatus === 'LOCKED_BY_PAYMENT' ? '#065f46' : '#1e40af',
                              border: `1px solid ${stu.assignmentStatus === 'LOCKED_BY_PAYMENT' ? '#a7f3d0' : '#bfdbfe'}`
                            }}
                          >
                            {stu.assignmentStatus}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', color: '#64748b', fontSize: '12px' }}>
                          {new Date(stu.assignedAt).toLocaleString('en-IN')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* VIEW 4: EDIT CREATED VENDOR (INFO + SCANNERS + MANAGE ALLOCATIONS)   */}
      {/* ===================================================================== */}
      {viewMode === 'EDIT' && editingVendorId && (
        <form onSubmit={handleUpdateVendorSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
          {/* Header Action Card */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: '14px',
              border: '1px solid #e2e8f0',
              padding: '20px 24px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px'
            }}
          >
            <div>
              <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#0284c7' }}>
                Vendor Profile Editor
              </span>
              <h2 style={{ margin: '4px 0 2px 0', fontSize: '18px', fontWeight: 900, color: '#0f172a' }}>
                Editing Vendor: <span style={{ fontFamily: 'monospace', color: '#2563eb' }}>{editingVendorId}</span>
              </h2>
              <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                Update master contact details, dedicated QR payment scanners, and manage academic group allocations.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setViewMode('LIST')}
                style={{
                  padding: '9px 18px',
                  background: '#f1f5f9',
                  color: '#334155',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                style={{
                  padding: '9px 22px',
                  background: busy ? '#93c5fd' : '#0284c7',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 6px rgba(2,132,199,0.3)'
                }}
              >
                {busy ? 'Saving Changes...' : 'Save Changes'}
              </button>
            </div>
          </div>

          {/* PART 1: VENDOR BASIC INFORMATION */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: '14px',
              border: '1px solid #e2e8f0',
              padding: '24px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              display: 'flex',
              flexDirection: 'column',
              gap: '18px'
            }}
          >
            <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '14px' }}>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                1. VENDOR BASIC INFORMATION
              </h2>
              <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                Modify vendor commercial entity name, primary contact person, phone, and operational status.
              </p>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '16px'
              }}
            >
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Vendor / Company Name *
                </label>
                <input
                  type="text"
                  required
                  value={editForm.vendorName}
                  onChange={(e) => setEditForm({ ...editForm, vendorName: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: '13px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    outline: 'none',
                    background: '#ffffff'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Owner / Contact Person *
                </label>
                <input
                  type="text"
                  required
                  value={editForm.contactPerson}
                  onChange={(e) => setEditForm({ ...editForm, contactPerson: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: '13px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    outline: 'none',
                    background: '#ffffff'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Mobile Number *
                </label>
                <input
                  type="tel"
                  required
                  value={editForm.mobile}
                  onChange={(e) => setEditForm({ ...editForm, mobile: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: '13px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    outline: 'none',
                    background: '#ffffff'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: '13px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    outline: 'none',
                    background: '#ffffff'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  GST Number (Optional)
                </label>
                <input
                  type="text"
                  value={editForm.gstNumber}
                  onChange={(e) => setEditForm({ ...editForm, gstNumber: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: '13px',
                    fontFamily: 'monospace',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    outline: 'none',
                    background: '#ffffff'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Vendor Status *
                </label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: '13px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    fontWeight: 600,
                    outline: 'none'
                  }}
                >
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Business Address *
                </label>
                <input
                  type="text"
                  required
                  value={editForm.address}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: '13px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    outline: 'none',
                    background: '#ffffff'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Additional Notes
                </label>
                <input
                  type="text"
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: '13px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    outline: 'none',
                    background: '#ffffff'
                  }}
                />
              </div>
            </div>
          </div>

          {/* PART 2: VENDOR PAYMENT CONFIGURATION & 3 QR SCANNERS */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: '14px',
              border: '1px solid #e2e8f0',
              padding: '24px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              display: 'flex',
              flexDirection: 'column',
              gap: '18px'
            }}
          >
            <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '14px' }}>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                2. VENDOR PAYMENT CONFIGURATION
              </h2>
              <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                Update beneficiary name, official UPI ID, custom fee override, and dedicated payment QR scanners.
              </p>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '16px'
              }}
            >
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Beneficiary / Account Holder Name *
                </label>
                <input
                  type="text"
                  required
                  value={editForm.beneficiaryName}
                  onChange={(e) => setEditForm({ ...editForm, beneficiaryName: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: '13px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    outline: 'none',
                    background: '#ffffff'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Official Vendor UPI ID *
                </label>
                <input
                  type="text"
                  required
                  value={editForm.upiId}
                  onChange={(e) => setEditForm({ ...editForm, upiId: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: '13px',
                    fontFamily: 'monospace',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    outline: 'none',
                    background: '#ffffff'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#0f172a', marginBottom: '6px' }}>
                  Uniform Fee Amount (₹) <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={editForm.paymentAmount}
                  onChange={(e) => setEditForm({ ...editForm, paymentAmount: e.target.value })}
                  placeholder="Enter final uniform fee amount (e.g. 1500)"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: '13px',
                    fontWeight: 750,
                    borderRadius: '8px',
                    border: '1.5px solid #cbd5e1',
                    outline: 'none',
                    background: '#ffffff'
                  }}
                />
                <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginTop: '4px' }}>
                  Required & Final: Students allocated to this vendor will be charged exactly this uniform fee amount.
                </span>
              </div>
            </div>

            {/* 3 QR Scanner Cards */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: '16px',
                marginTop: '10px'
              }}
            >
              {[
                { key: 'googlePay' as const, title: '1. Google Pay QR Scanner' },
                { key: 'phonePe' as const, title: '2. PhonePe QR Scanner' },
                { key: 'paytm' as const, title: '3. Paytm QR Scanner' }
              ].map((slot) => {
                const state = editScanners[slot.key];
                return (
                  <div
                    key={slot.key}
                    style={{
                      padding: '16px',
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      background: '#f8fafc',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '14px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <QrCode size={15} style={{ color: '#2563eb' }} /> {slot.title}
                      </span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', color: '#334155' }}>
                        <input
                          type="checkbox"
                          checked={state.isEnabled}
                          onChange={(e) =>
                            setEditScanners((prev) => ({
                              ...prev,
                              [slot.key]: { ...prev[slot.key], isEnabled: e.target.checked }
                            }))
                          }
                        />
                        <span>{state.isEnabled ? 'Enabled' : 'Disabled'}</span>
                      </label>
                    </div>

                    <div
                      style={{
                        height: '180px',
                        background: '#ffffff',
                        borderRadius: '10px',
                        border: '1px solid #cbd5e1',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '10px',
                        overflow: 'hidden'
                      }}
                    >
                      {state.preview ? (
                        <img
                          src={state.preview}
                          alt={slot.title}
                          style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
                        />
                      ) : (
                        <div style={{ textAlign: 'center', color: '#94a3b8' }}>
                          <QrCode size={40} style={{ margin: '0 auto 6px auto', opacity: 0.35, display: 'block' }} />
                          <span style={{ fontSize: '12px', fontWeight: 600 }}>No QR Image Configured</span>
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                        {state.preview ? 'Replace QR Scanner Image:' : 'Upload QR Scanner Image:'}
                      </span>
                      <label
                        htmlFor={`edit-scanner-file-${slot.key}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          padding: '9px 14px',
                          background: '#eff6ff',
                          border: '1.5px solid #3b82f6',
                          borderRadius: '8px',
                          color: '#1d4ed8',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          boxShadow: '0 1px 3px rgba(37, 99, 235, 0.1)',
                          transition: 'all 0.15s ease',
                          textAlign: 'center',
                          boxSizing: 'border-box'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#dbeafe')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = '#eff6ff')}
                      >
                        <Upload size={14} />
                        <span>
                          {state.file
                            ? `Selected: ${state.file.name.length > 20 ? state.file.name.slice(0, 18) + '...' : state.file.name}`
                            : state.preview
                            ? 'Choose New QR Image'
                            : 'Choose QR Image File'}
                        </span>
                      </label>
                      <input
                        id={`edit-scanner-file-${slot.key}`}
                        type="file"
                        accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                        onChange={(e) => handleEditScannerFileSelect(slot.key, e)}
                        style={{ display: 'none' }}
                      />
                      {state.preview && (
                        <button
                          type="button"
                          onClick={() => handleRemoveEditScanner(slot.key)}
                          style={{
                            width: '100%',
                            padding: '6px 12px',
                            fontSize: '12px',
                            color: '#dc2626',
                            background: '#fef2f2',
                            borderRadius: '6px',
                            border: '1px solid #fecaca',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          Remove QR Image
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* PART 3: MANAGE CURRENT & ADD NEW EXCLUSIVE ACADEMIC ALLOCATIONS */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: '14px',
              border: '2px solid #0284c7',
              boxShadow: '0 4px 12px rgba(2,132,199,0.08)',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px'
            }}
          >
            <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '14px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#0284c7' }}>
                Exclusive Group Allocations
              </span>
              <h2 style={{ margin: '4px 0 2px 0', fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                3. CURRENT ACADEMIC ALLOCATIONS & ADD NEW GROUPS
              </h2>
              <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                View existing academic groups held by this vendor, release groups no longer assigned, or allocate additional groups.
              </p>
            </div>

            {/* Inactive Vendor Warning with 1-Click Activate */}
            {editForm.status === 'INACTIVE' && (
              <div style={{
                background: '#fffbeb',
                border: '1.5px solid #f59e0b',
                borderRadius: '10px',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                flexWrap: 'wrap'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px' }}>⚠️</span>
                  <div>
                    <strong style={{ color: '#92400e', fontSize: '12.5px' }}>This vendor is currently INACTIVE</strong>
                    <p style={{ margin: '1px 0 0 0', fontSize: '11.5px', color: '#b45309' }}>
                      Allocations held by this vendor are paused. Switch to Active so students can be routed to this vendor.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditForm(prev => ({ ...prev, status: 'ACTIVE' }));
                    notify('success', 'Vendor status changed to Active.');
                  }}
                  style={{
                    padding: '6px 14px',
                    background: '#16a34a',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  ✓ Activate Vendor Now
                </button>
              </div>
            )}

            {/* Existing Allocations List */}
            <div>
              <h3 style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', color: '#0f172a', marginBottom: '10px' }}>
                Currently Held Groups ({editExistingAllocations.filter((a) => a.status !== 'RELEASED').length})
              </h3>
              {editExistingAllocations.filter((a) => a.status !== 'RELEASED').length === 0 ? (
                <div style={{ padding: '14px 16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', color: '#64748b' }}>
                  No academic groups currently assigned to this vendor.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' }}>
                  {editExistingAllocations.filter((a) => a.status !== 'RELEASED').map((alloc) => (
                    <div
                      key={alloc.allocationId}
                      style={{
                        padding: '12px 14px',
                        background: '#f8fafc',
                        borderRadius: '10px',
                        border: '1px solid #cbd5e1',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>{alloc.department} – {alloc.academicYear}</span>
                          <span
                            style={{
                              padding: '1px 6px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: 800,
                              background: alloc.gender === 'Girls' ? '#fce7f3' : alloc.gender === 'Boys' ? '#dbeafe' : '#f1f5f9',
                              color: alloc.gender === 'Girls' ? '#9d174d' : alloc.gender === 'Boys' ? '#1e40af' : '#475569',
                              border: `1px solid ${alloc.gender === 'Girls' ? '#fbcfe8' : alloc.gender === 'Boys' ? '#bfdbfe' : '#cbd5e1'}`
                            }}
                          >
                            {alloc.gender || 'All'}
                          </span>
                          <span
                            style={{
                              padding: '1px 6px',
                              borderRadius: '4px',
                              fontSize: '9px',
                              fontWeight: 800,
                              background: alloc.status === 'ACTIVE' && editForm.status === 'ACTIVE' ? '#dcfce7' : '#fef3c7',
                              color: alloc.status === 'ACTIVE' && editForm.status === 'ACTIVE' ? '#15803d' : '#92400e',
                              border: `1px solid ${alloc.status === 'ACTIVE' && editForm.status === 'ACTIVE' ? '#bbf7d0' : '#fde68a'}`
                            }}
                          >
                            {alloc.status === 'ACTIVE' && editForm.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>
                          {alloc.course} • <strong>Section {alloc.section}</strong> ({alloc.semester})
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                          {alloc.collectionRoom && (
                            <span style={{ fontSize: '10px', background: '#e0f2fe', color: '#0369a1', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                              📍 {alloc.collectionRoom}
                            </span>
                          )}
                          {alloc.distributionStatus && (
                            <span style={{ fontSize: '10px', background: '#dcfce7', color: '#15803d', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                              📦 {alloc.distributionStatus}
                            </span>
                          )}
                          {alloc.uniformAvailability && (
                            <span style={{ fontSize: '10px', background: '#fef3c7', color: '#b45309', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                              🏷️ {alloc.uniformAvailability}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '10px', fontFamily: 'monospace', color: '#64748b', marginTop: '2px' }}>
                          {alloc.allocationId}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          handleReleaseExistingAllocation(
                            alloc.allocationId,
                            `${alloc.course} ${alloc.department} ${alloc.academicYear} Sec ${alloc.section}`
                          )
                        }
                        title="Release this group to make it available for others"
                        style={{
                          padding: '6px 10px',
                          background: '#fef2f2',
                          color: '#dc2626',
                          border: '1px solid #fecaca',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <Trash2 size={12} /> Release
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add Additional Groups Section */}
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', color: '#0f172a' }}>
                Allocate Additional Groups to this Vendor
              </h3>

              <div
                style={{
                  background: '#f8fafc',
                  padding: '18px',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px'
                }}
              >
                {/* Department Dropdown Selector */}
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>
                    Select Department
                  </label>
                  <select
                    value={builder.department}
                    onChange={(e) => setBuilder({ ...builder, department: e.target.value })}
                    style={{
                      width: '100%',
                      height: '42px',
                      padding: '10px 16px',
                      fontSize: '13px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      color: '#0f172a',
                      fontWeight: 600,
                      outline: 'none'
                    }}
                  >
                    <option value="ALL">All Departments</option>
                    <optgroup label="Undergraduate Engineering (B.E.)">
                      {DEPARTMENTS.filter((d) => d.category === 'Undergraduate (B.E.)').map((d) => (
                        <option key={d.code} value={d.code}>
                          {d.code} – {d.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Postgraduate Programs">
                      {DEPARTMENTS.filter((d) => d.category === 'Postgraduate').map((d) => (
                        <option key={d.code} value={d.code}>
                          {d.code} – {d.name}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                {/* Academic Year Pills */}
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>
                    Select Academic Year(s)
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {['1st Year', '2nd Year', '3rd Year', '4th Year'].map((yr) => {
                      const active = builder.academicYears.includes(yr);
                      return (
                        <button
                          key={yr}
                          type="button"
                          onClick={() => {
                            const exists = builder.academicYears.includes(yr);
                            const nextYears = exists
                              ? builder.academicYears.filter((y) => y !== yr)
                              : [...builder.academicYears, yr];
                            if (nextYears.length > 0) {
                              setBuilder({ ...builder, academicYears: nextYears });
                            }
                          }}
                          style={{
                            padding: '9px 16px',
                            borderRadius: '8px',
                            fontSize: '13px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            border: active ? '1px solid #0284c7' : '1px solid #cbd5e1',
                            background: active ? '#0284c7' : '#ffffff',
                            color: active ? '#ffffff' : '#334155',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {yr}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Select Gender (ONLY Girls and Boys) */}
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>
                    Select Gender
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {['Boys', 'Girls'].map((g) => {
                      const active = builder.genders.includes(g);
                      return (
                        <button
                          key={g}
                          type="button"
                          onClick={() => {
                            const exists = builder.genders.includes(g);
                            const nextGenders = exists
                              ? builder.genders.filter((x) => x !== g)
                              : [...builder.genders, g];
                            if (nextGenders.length > 0) {
                              setBuilder({ ...builder, genders: nextGenders });
                            }
                          }}
                          style={{
                            padding: '9px 20px',
                            borderRadius: '8px',
                            fontSize: '13px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            border: active ? '1px solid #0284c7' : '1px solid #cbd5e1',
                            background: active ? '#0284c7' : '#ffffff',
                            color: active ? '#ffffff' : '#334155',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {g}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Available Section Cards to Add */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', color: '#475569' }}>
                    Available Unassigned Academic Groups ({availableGroupsInView.length} Available)
                  </span>
                </div>

                {availableGroupsInView.length === 0 ? (
                  <div style={{ padding: '12px 16px', background: '#fffbeb', borderRadius: '8px', border: '1px solid #fde68a', fontSize: '12px', color: '#92400e' }}>
                    No unassigned groups available under current department/year/gender selection.
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                      gap: '10px',
                      maxHeight: '220px',
                      overflowY: 'auto',
                      padding: '4px'
                    }}
                  >
                    {availableGroupsInView.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => handleStageGroupForEdit(item)}
                        style={{
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          background: '#ffffff',
                          textAlign: 'left',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>{item.department} – {item.academicYear}</span>
                            <span
                              style={{
                                padding: '1px 6px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                fontWeight: 800,
                                background: item.gender === 'Girls' ? '#fce7f3' : '#dbeafe',
                                color: item.gender === 'Girls' ? '#9d174d' : '#1e40af',
                                border: item.gender === 'Girls' ? '1px solid #fbcfe8' : '1px solid #bfdbfe'
                              }}
                            >
                              {item.gender}
                            </span>
                          </div>
                          <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>
                            {item.course} • <strong>Section {item.section}</strong>
                          </div>
                        </div>
                        <span style={{ fontSize: '12px', fontWeight: 800, color: '#0284c7' }}>+ Add</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Staged New Allocations for this vendor */}
              {editNewStagedAllocations.length > 0 && (
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#047857', textTransform: 'uppercase' }}>
                      New Groups Staged to Add ({editNewStagedAllocations.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditNewStagedAllocations([])}
                      style={{ background: 'none', border: 'none', fontSize: '11px', color: '#dc2626', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      Clear Staged
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {editNewStagedAllocations.map((grp) => (
                      <span
                        key={grp.key}
                        style={{
                          padding: '6px 10px',
                          background: '#ecfdf5',
                          border: '1px solid #a7f3d0',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 700,
                          color: '#065f46',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <span>
                          {grp.department} {grp.academicYear} Sec {grp.section}
                          <span
                            style={{
                              marginLeft: '6px',
                              padding: '1px 5px',
                              borderRadius: '4px',
                              fontSize: '9px',
                              background: grp.gender === 'Girls' ? '#fce7f3' : '#e0e7ff',
                              color: grp.gender === 'Girls' ? '#9d174d' : '#3730a3'
                            }}
                          >
                            {grp.gender || 'Boys'}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveStagedGroupForEdit(grp.key)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 900, padding: 0 }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div style={{ paddingTop: '16px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setViewMode('LIST')}
                style={{
                  padding: '10px 20px',
                  background: '#f1f5f9',
                  color: '#334155',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                style={{
                  padding: '10px 24px',
                  background: busy ? '#93c5fd' : '#0284c7',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  boxShadow: '0 2px 6px rgba(2,132,199,0.3)'
                }}
              >
                {busy ? 'Saving Changes...' : 'Save & Update Vendor'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* REASSIGN ACADEMIC GROUP MODAL */}
      {reassignModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'clamp(8px, 2vw, 20px)'
          }}
        >
          <form
            onSubmit={handleConfirmReassignment}
            style={{
              background: '#ffffff',
              borderRadius: '14px',
              maxWidth: '460px',
              width: '100%',
              maxHeight: '92vh',
              overflowY: 'auto',
              padding: 'clamp(14px, 3vw, 24px)',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontWeight: 800, color: '#0f172a', fontSize: '16px' }}>
                Reassign Academic Group
              </h3>
              <button
                type="button"
                onClick={() => setReassignModal(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}>
              <strong>Group:</strong> {reassignModal.allocation.course} •{' '}
              {reassignModal.allocation.department} • {reassignModal.allocation.academicYear} •
              Section {reassignModal.allocation.section}
            </div>
            <p style={{ margin: 0, fontSize: '11px', color: '#065f46', background: '#ecfdf5', padding: '10px 12px', borderRadius: '8px', border: '1px solid #a7f3d0', lineHeight: 1.5 }}>
              ✓ <strong>Historical Payment Protection:</strong> Students who have already submitted or completed payment under the current vendor will remain locked to their original payment vendor. Only unpaid students will migrate to the new vendor.
            </p>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Select Target Active Vendor *
              </label>
              <select
                required
                value={reassignTargetVendorId}
                onChange={(e) => setReassignTargetVendorId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  fontSize: '13px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  outline: 'none'
                }}
              >
                <option value="">-- Choose Active Vendor --</option>
                {vendors
                  .filter(
                    (v) =>
                      v.status === 'ACTIVE' &&
                      v.vendorId !== reassignModal.allocation.vendorId
                  )
                  .map((v) => (
                    <option key={v.vendorId} value={v.vendorId}>
                      {v.vendorName} ({v.vendorId})
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Reason for Reassignment (Audit Log) *
              </label>
              <input
                type="text"
                required
                value={reassignReason}
                onChange={(e) => setReassignReason(e.target.value)}
                placeholder="e.g., Capacity balancing for CSE 2nd Year"
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  fontSize: '13px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  outline: 'none'
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '8px' }}>
              <button
                type="button"
                onClick={() => setReassignModal(null)}
                style={{
                  padding: '9px 16px',
                  background: '#f1f5f9',
                  color: '#334155',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                style={{
                  padding: '9px 18px',
                  background: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Confirm Reassignment
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── MODAL: Large Live QR Preview & Download ── */}
      {vendorPreviewQrModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(15,23,42,0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'clamp(8px, 2vw, 16px)'
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              maxWidth: '420px',
              width: '100%',
              maxHeight: '92vh',
              overflowY: 'auto',
              padding: 'clamp(14px, 3vw, 24px)',
              textAlign: 'center',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                  {vendorPreviewQrModal.provider} QR Scanner
                </h3>
                <small style={{ color: '#64748b', fontSize: '11px' }}>
                  Vendor: {vendorPreviewQrModal.vendorName}
                </small>
              </div>
              <button
                type="button"
                onClick={() => setVendorPreviewQrModal(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <img
                src={vendorPreviewQrModal.qrImageUrl.startsWith('http') ? vendorPreviewQrModal.qrImageUrl : `${apiBaseUrl}${vendorPreviewQrModal.qrImageUrl}`}
                alt={vendorPreviewQrModal.provider}
                onError={(e) => {
                  const target = e.currentTarget;
                  if (vendorPreviewQrModal.qrImageUrl && !target.src.includes(':4000')) {
                    target.src = `http://localhost:4000${vendorPreviewQrModal.qrImageUrl}`;
                  }
                }}
                style={{ width: '220px', height: '220px', objectFit: 'contain', background: '#ffffff', padding: '8px', borderRadius: '10px', border: '1px solid #cbd5e1' }}
              />
              <div style={{ marginTop: '12px', textAlign: 'center', fontSize: '12px', color: '#334155' }}>
                <div>Beneficiary: <strong>{vendorPreviewQrModal.beneficiaryName}</strong></div>
                <div style={{ marginTop: '2px' }}>UPI ID: <strong style={{ fontFamily: 'monospace', color: '#2563eb' }}>{vendorPreviewQrModal.upiId}</strong></div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <button
                type="button"
                onClick={() => handleDownloadQrImage(vendorPreviewQrModal.qrImageUrl, `${vendorPreviewQrModal.vendorName}_${vendorPreviewQrModal.provider}_QR.png`)}
                style={{
                  padding: '10px',
                  background: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <Download size={14} /> Download QR
              </button>
              <button
                type="button"
                onClick={() => setVendorPreviewQrModal(null)}
                style={{
                  padding: '10px',
                  background: '#f1f5f9',
                  color: '#475569',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Upload / Replace Vendor Scanner ── */}
      {vendorUploadQrModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(15,23,42,0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'clamp(8px, 2vw, 16px)'
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              maxWidth: '440px',
              width: '100%',
              maxHeight: '92vh',
              overflowY: 'auto',
              padding: 'clamp(14px, 3vw, 24px)',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                  {vendorUploadQrModal.mode === 'REPLACE' ? 'Replace' : 'Upload'} {vendorUploadQrModal.providerTitle} Scanner
                </h3>
                <small style={{ color: '#64748b', fontSize: '11px' }}>
                  Vendor ID: {vendorUploadQrModal.vendorId}
                </small>
              </div>
              <button
                type="button"
                onClick={() => setVendorUploadQrModal(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveModalQrScanner} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label
                  htmlFor="vendor-modal-qr-upload"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '12px 16px',
                    background: '#eff6ff',
                    border: '1.5px dashed #3b82f6',
                    borderRadius: '10px',
                    color: '#1d4ed8',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 1px 3px rgba(37, 99, 235, 0.1)',
                    transition: 'all 0.15s ease',
                    boxSizing: 'border-box'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#dbeafe')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '#eff6ff')}
                >
                  <Upload size={16} />
                  <span>{modalQrFile ? `Selected: ${modalQrFile.name}` : 'Click to Browse & Upload QR Image'}</span>
                </label>
                <input
                  id="vendor-modal-qr-upload"
                  type="file"
                  accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                  required={!modalQrPreview}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
                      notify('error', 'Only PNG, JPG, and JPEG images are allowed.');
                      return;
                    }
                    setModalQrFile(file);
                    setModalQrPreview(URL.createObjectURL(file));
                  }}
                  style={{ display: 'none' }}
                />
              </div>

              {modalQrPreview && (
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>
                    Preview Before Saving
                  </span>
                  <img
                    src={modalQrPreview}
                    alt="New Scanner Preview"
                    style={{ width: '170px', height: '170px', objectFit: 'contain', background: '#fff', border: '1px solid #cbd5e1', padding: '6px', borderRadius: '8px' }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setVendorUploadQrModal(null)}
                  style={{ padding: '8px 16px', background: '#f1f5f9', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 700, color: '#475569', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!modalQrFile || busy}
                  style={{ padding: '8px 18px', background: '#2563eb', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 700, color: '#ffffff', cursor: 'pointer' }}
                >
                  {busy ? 'Saving...' : 'Save & Sync to Student Portal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
export default AdminVendorManagement;

