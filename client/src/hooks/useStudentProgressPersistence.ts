import { useState, useEffect, useCallback } from 'react';

const DRAFT_STORAGE_KEY = 'mit_uniform_active_draft_v2';
const LEGACY_DRAFT_KEY = 'mit_uniform_registration_draft_v1';
const MULTI_TOKENS_KEY = 'mit_uniform_multi_student_tokens_v2';
const LEGACY_RESUME_KEY = 'mit_uniform_browser_resume_token_v1';

export interface TrackingDataPayload {
  applicationId: string;
  registrationId: string;
  trackingPin?: string;
  currentStep: number;
  isRegistrationLocked: boolean;
  isPaymentLocked: boolean;
  studentProfile: {
    studentName: string;
    usn: string;
    email?: string;
    mobile?: string;
    educationLevel?: string;
    course?: string;
    department: string;
    academicYear: string;
    semester?: string | number;
    section: string;
    gender?: string;
  };
  uniformSelection: {
    shirtSize: string;
    trouserSize: string;
    blazerSize?: string;
    shoeSize?: string;
    packageType?: string;
    selectedOptions?: Record<string, any>;
    remarks?: string;
    garments?: Record<string, any>;
  };
  assignedVendor: {
    vendorId: string;
    vendorName: string;
    allocationId: string;
  };
  registeredAt: string;
  payment: {
    paymentStatus: string;
    hasSubmittedPayment: boolean;
    paymentMethod?: string | null;
    expectedAmount?: number | null;
    paidAmount?: number | null;
    utrNumber?: string | null;
    paymentScreenshot?: string | null;
    submittedAt?: string | null;
    verifiedAt?: string | null;
    rejectedAt?: string | null;
    verifiedByVendor?: string | null;
    rejectionReason?: string | null;
  };
}

export interface SavedDeviceStudent {
  applicationId: string;
  registrationId: string;
  trackingPin: string;
  studentName: string;
  usn: string;
  department: string;
  academicYear: string;
  section: string;
  shirtSize: string;
  trouserSize: string;
  expectedAmount: number;
  registrationStatus: string;
  paymentStatus: string;
  registeredAt: string;
}

export function useStudentProgressPersistence(apiBaseUrl: string = '') {
  const [restoringFromDb, setRestoringFromDb] = useState<boolean>(true);
  const [trackingRecord, setTrackingRecord] = useState<TrackingDataPayload | null>(null);
  const [savedDeviceStudents, setSavedDeviceStudents] = useState<SavedDeviceStudent[]>([]);

  const getStoredResumeTokens = (): string[] => {
    try {
      const raw = localStorage.getItem(MULTI_TOKENS_KEY);
      let parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed) || parsed.length === 0) {
        // Fallback check for legacy single-student key
        const legacy = localStorage.getItem(LEGACY_RESUME_KEY);
        if (legacy) {
          parsed = [legacy];
          localStorage.setItem(MULTI_TOKENS_KEY, JSON.stringify(parsed));
        }
      }
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  // Fetch all students registered on this browser from the database
  const refreshAllDeviceStudentsFromDb = useCallback(async (): Promise<SavedDeviceStudent[]> => {
    const tokens = getStoredResumeTokens();
    if (tokens.length === 0) {
      setRestoringFromDb(false);
      return [];
    }

    try {
      const res = await fetch(`${apiBaseUrl}/api/tracking/resume-multiple-sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeTokens: tokens })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const list: SavedDeviceStudent[] = data.students || [];
        setSavedDeviceStudents(list);
        return list;
      }
    } catch (err) {
      console.error('Error loading multi-student list from database:', err);
    } finally {
      setRestoringFromDb(false);
    }
    return [];
  }, [apiBaseUrl]);

  // Restore latest active session from DB on page load
  const restoreSubmittedSessionFromDb = useCallback(async (): Promise<TrackingDataPayload | null> => {
    const tokens = getStoredResumeTokens();
    const latestToken = tokens[0] || localStorage.getItem(LEGACY_RESUME_KEY);
    if (!latestToken) {
      setRestoringFromDb(false);
      return null;
    }

    try {
      const res = await fetch(`${apiBaseUrl}/api/tracking/resume-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ browserResumeToken: latestToken })
      });
      const data = await res.json();
      if (res.ok && data.success && data.restored) {
        setTrackingRecord(data.trackingData);
        return data.trackingData;
      }
    } catch (err) {
      console.error('Failed to restore session from database:', err);
    } finally {
      setRestoringFromDb(false);
    }
    return null;
  }, [apiBaseUrl]);

  useEffect(() => {
    refreshAllDeviceStudentsFromDb();
    restoreSubmittedSessionFromDb();
  }, [refreshAllDeviceStudentsFromDb, restoreSubmittedSessionFromDb]);

  // Append a newly registered student's token without overwriting previous students!
  const appendNewStudentSession = (browserResumeToken: string, trackingData?: TrackingDataPayload) => {
    if (browserResumeToken) {
      const existing = getStoredResumeTokens();
      if (!existing.includes(browserResumeToken)) {
        const updated = [browserResumeToken, ...existing];
        localStorage.setItem(MULTI_TOKENS_KEY, JSON.stringify(updated));
      }
      localStorage.setItem(LEGACY_RESUME_KEY, browserResumeToken);
    }
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    localStorage.removeItem(LEGACY_DRAFT_KEY);
    if (trackingData) {
      setTrackingRecord(trackingData);
    }
    refreshAllDeviceStudentsFromDb();
  };

  // Start a fresh registration for the next student ("Register Another Student")
  const startNewStudentRegistration = () => {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    localStorage.removeItem(LEGACY_DRAFT_KEY);
    setTrackingRecord(null);
  };

  // Fresh registration mode
  const loadLocalDraft = () => null;

  const saveLocalDraft = (_step: string, _formData: any) => {
    // No-op: Keep registration forms fresh without preserving broken drafts across restarts
  };

  const persistSubmittedCredentials = (browserResumeToken: string, trackingData: TrackingDataPayload) => {
    appendNewStudentSession(browserResumeToken, trackingData);
  };

  const clearSession = () => {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    localStorage.removeItem(LEGACY_DRAFT_KEY);
    setTrackingRecord(null);
  };

  return {
    restoringFromDb,
    trackingRecord,
    setTrackingRecord,
    activeTrackingRecord: trackingRecord,
    setActiveTrackingRecord: setTrackingRecord,
    savedDeviceStudents,
    appendNewStudentSession,
    startNewStudentRegistration,
    refreshAllDeviceStudentsFromDb,
    loadLocalDraft,
    saveLocalDraft,
    persistSubmittedCredentials,
    clearSession,
    refreshFromDatabase: restoreSubmittedSessionFromDb
  };
}
