import { useState, useEffect, useMemo } from 'react';
import { StudentRegistration, DistributionSchedule } from '../types';
import { Shield, Database, Save, RotateCcw, Download, Upload, AlertTriangle, Check, KeyRound } from 'lucide-react';
import { parseCampaignYears } from '../mockData';
import ClearStudentDataSection from './admin/ClearStudentDataSection';

interface Props {
  campaign: string;
  onUpdateCampaign: (name: string) => Promise<void>;
  registrations: StudentRegistration[];
  schedules: DistributionSchedule[];
  onResetData: () => void;
  onImportData: (regs: StudentRegistration[], schs: DistributionSchedule[]) => void;
}

export function AdminSettings({
  campaign,
  onUpdateCampaign,
  registrations,
  schedules,
  onResetData,
  onImportData
}: Props) {
  const [campaignName, setCampaignName] = useState(campaign);
  const [editWindow, setEditWindow] = useState('24');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [securityPin, setSecurityPin] = useState(localStorage.getItem('mit_admin_pin') || '1234');
  const [pinSaved, setPinSaved] = useState(false);

  useEffect(() => {
    setCampaignName(campaign);
  }, [campaign]);

  const { currentYear, academicYear } = useMemo(() => parseCampaignYears(campaignName), [campaignName]);

  const handleCampaignSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await onUpdateCampaign(campaignName);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handlePinSave = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('mit_admin_pin', securityPin);
    setPinSaved(true);
    setTimeout(() => setPinSaved(false), 3000);
  };

  const exportBackupJSON = () => {
    const backup = {
      campaign: campaignName,
      exportedAt: new Date().toISOString(),
      registrations,
      schedules
    };
    const jsonStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backup, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', jsonStr);
    dlAnchor.setAttribute('download', `MIT_Uniform_System_Backup_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const parsed = JSON.parse(evt.target?.result as string);
        if (Array.isArray(parsed.registrations) && Array.isArray(parsed.schedules)) {
          onImportData(parsed.registrations, parsed.schedules);
          alert(`Successfully imported ${parsed.registrations.length} registrations and ${parsed.schedules.length} schedules!`);
        } else {
          alert('Invalid backup JSON format. Must contain "registrations" and "schedules" arrays.');
        }
      } catch {
        alert('Could not parse JSON file.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="admin-settings-container">
      <div className="sectionhead">
        <div>
          <h2>System Settings & Campus Configuration</h2>
          <p>Campaign properties, administrative security PIN, and database backup controls</p>
        </div>
      </div>

      <div className="settings-grid">
        {/* Campaign Settings Panel */}
        <div className="panel settings-card">
          <div className="panelhead">
            <div>
              <h3><Database size={17} /> Campaign Configuration</h3>
              <p>Configure active academic uniform distribution drive</p>
            </div>
          </div>

          <form onSubmit={handleCampaignSave}>
            <div className="settings-form">
              <label>
                Active Campaign Title
                <input
                  type="text"
                  required
                  value={campaignName}
                  onChange={e => setCampaignName(e.target.value)}
                  placeholder="e.g. Uniform Distribution 2027"
                />
                <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.35rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <span>Derived Year: <b style={{ color: '#0284c7' }}>{currentYear}</b></span>
                  <span>Academic Cycle: <b style={{ color: '#0284c7' }}>{academicYear}</b></span>
                </div>
              </label>

              <label>
                Student Self-Edit Window (Hours after submission)
                <select value={editWindow} onChange={e => setEditWindow(e.target.value)}>
                  <option value="12">12 Hours</option>
                  <option value="24">24 Hours (Standard)</option>
                  <option value="48">48 Hours</option>
                  <option value="72">72 Hours</option>
                </select>
              </label>

              <div className="settings-save-row">
                <button type="submit" className="btn-primary">
                  <Save size={15} /> Save Campaign Settings
                </button>
                {saveSuccess && (
                  <span className="success-msg">
                    <Check size={14} /> Campaign settings saved successfully!
                  </span>
                )}
              </div>
            </div>
          </form>
        </div>

        {/* Security PIN Panel */}
        <div className="panel settings-card">
          <div className="panelhead">
            <div>
              <h3><KeyRound size={17} /> Admin Desk Passcode</h3>
              <p>Passcode used for rapid supervisor verification at distribution desk</p>
            </div>
          </div>

          <form onSubmit={handlePinSave}>
            <div className="settings-form">
              <label>
                4-Digit Admin Desk PIN
                <input
                  type="password"
                  maxLength={6}
                  value={securityPin}
                  onChange={e => setSecurityPin(e.target.value)}
                  placeholder="Default: 1234"
                />
              </label>
              <small className="muted">Used to authorize emergency size modifications or supervisor signoffs.</small>

              <div className="settings-save-row">
                <button type="submit" className="btn-primary">
                  <Shield size={15} /> Update Admin PIN
                </button>
                {pinSaved && (
                  <span className="success-msg">
                    <Check size={14} /> PIN updated successfully!
                  </span>
                )}
              </div>
            </div>
          </form>
        </div>

        {/* Data & Backup Management */}
        <div className="panel settings-card full-width">
          <div className="panelhead">
            <div>
              <h3><Download size={17} /> Data Backup, Migration & Demo Reset</h3>
              <p>Export all campus uniform data or load sample college records</p>
            </div>
          </div>

          <div className="backup-actions-grid">
            <div className="backup-action-box">
              <b>Export JSON Snapshot</b>
              <p>Download all current student registrations ({registrations.length}) and distribution schedules ({schedules.length}) into a secure JSON backup file.</p>
              <button className="btn-secondary" onClick={exportBackupJSON}>
                <Download size={15} /> Download Full System Backup
              </button>
            </div>

            <div className="backup-action-box">
              <b>Restore from Backup</b>
              <p>Upload a previously exported JSON backup file to restore student registrations and schedules.</p>
              <label className="btn-secondary file-upload-label">
                <Upload size={15} /> Import Backup JSON
                <input type="file" accept=".json" onChange={handleImportFile} style={{ display: 'none' }} />
              </label>
            </div>
          </div>
        </div>

        {/* ── Transactional & Protected Student Data Maintenance ── */}
        <div className="full-width">
          <ClearStudentDataSection
            onDataCleared={() => {
              onResetData();
            }}
          />
        </div>
      </div>
    </div>
  );
}
