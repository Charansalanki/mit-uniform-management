import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Compass,
  MapPin,
  ArrowLeft,
  CalendarDays,
  Layers,
  Sparkles,
  Info
} from 'lucide-react';
import locoromRoomsData from './locoromData.json';
import { api } from './api';
import { parseCampaignYears } from './mockData';
import { MIT_SEAL_LOGO_BASE64 } from './utils/mitLogoBase64';

export interface LocoromPhoto {
  name: string;
  url: string;
}

export interface LocoromSubfolder {
  name: string;
  info: string;
  thumbnail: string;
  photos: LocoromPhoto[];
}

export interface LocoromRoom {
  name: string;
  info: string;
  mainPhotos: LocoromPhoto[];
  subfolders: LocoromSubfolder[];
}

const ALL_ROOMS: LocoromRoom[] = locoromRoomsData as LocoromRoom[];

const ROOM_ALIASES: Record<string, { target: string; note: string }> = {
  '204': { target: '205', note: 'Room 204 is located in Silver Jubilee Block adjacent to Room 205 on the 2nd Floor.' },
  '201': { target: '205', note: 'Room 201 is in the 2nd Floor West Wing adjacent to Room 205.' },
  '202': { target: '205', note: 'Room 202 is in the 2nd Floor West Wing adjacent to Room 205.' },
  '203': { target: '205', note: 'Room 203 is in the 2nd Floor West Wing adjacent to Room 205.' },
  '101': { target: '114', note: 'Room 101/102 corridor is near Room 114 (Admission Section).' },
  '102': { target: '114', note: 'Room 101/102 corridor is near Room 114 (Admission Section).' },
  '115': { target: '114', note: 'Room 115 is along the Admission Section corridor next to Room 114.' },
  '116': { target: '117', note: 'Room 116 is adjacent to Room 117 along the South Corridor.' },
  '301': { target: '305', note: 'Room 301 is in the 3rd Floor corridor adjacent to Room 305.' },
  '302': { target: '305', note: 'Room 302 is in the 3rd Floor corridor adjacent to Room 305.' },
  '303': { target: '305', note: 'Room 303 is in the 3rd Floor corridor adjacent to Room 305.' },
  '304': { target: '305', note: 'Room 304 is in the 3rd Floor corridor adjacent to Room 305.' }
};

export default function NavigationPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRoomName, setSelectedRoomName] = useState<string>('114');
  const [aliasNotice, setAliasNotice] = useState<string | null>(null);
  const [campaign, setCampaign] = useState('Uniform Distribution 2027');

  // Carousel states for main room photos
  const [mainPhotoIndex, setMainPhotoIndex] = useState(0);
  const [mainZoom, setMainZoom] = useState(1);

  // Carousel states per subfolder by index
  const [subfolderPhotoIndices, setSubfolderPhotoIndices] = useState<Record<number, number>>({});
  const [subfolderZooms, setSubfolderZooms] = useState<Record<number, number>>({});

  const { currentYear, academicYear } = useMemo(() => parseCampaignYears(campaign), [campaign]);

  useEffect(() => {
    api.getCampaignName().then(setCampaign).catch(() => {});
  }, []);

  // Parse URL query parameter: ?room=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      const clean = roomParam.replace(/^Room\s*/i, '').trim().toLowerCase();

      // Check alias first (e.g. 204 -> 205)
      if (ROOM_ALIASES[clean]) {
        const alias = ROOM_ALIASES[clean];
        setSelectedRoomName(alias.target);
        setSearchTerm(alias.target);
        setAliasNotice(alias.note);
        return;
      }

      // Look for exact match
      const exact = ALL_ROOMS.find(r => r.name.toLowerCase() === clean);
      if (exact) {
        setSelectedRoomName(exact.name);
        setSearchTerm(exact.name);
        setAliasNotice(null);
        return;
      }

      // Look for partial match
      const partial = ALL_ROOMS.find(r => r.name.toLowerCase().includes(clean) || clean.includes(r.name.toLowerCase()));
      if (partial) {
        setSelectedRoomName(partial.name);
        setSearchTerm(partial.name);
        setAliasNotice(null);
        return;
      }

      setSearchTerm(clean);
    }
  }, []);

  // Reset indices whenever room changes
  useEffect(() => {
    setMainPhotoIndex(0);
    setMainZoom(1);
    setSubfolderPhotoIndices({});
    setSubfolderZooms({});
  }, [selectedRoomName]);

  // Filtered rooms
  const filteredRooms = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return ALL_ROOMS;

    const matched = ALL_ROOMS.filter(r => {
      const nameMatch = r.name.toLowerCase().includes(q);
      const infoMatch = r.info && r.info.toLowerCase().includes(q);
      const subMatch = r.subfolders.some(s => s.name.toLowerCase().includes(q) || (s.info && s.info.toLowerCase().includes(q)));
      return nameMatch || infoMatch || subMatch;
    });

    // If no direct matches, check if search term matches a known room alias
    if (matched.length === 0 && ROOM_ALIASES[q]) {
      const alias = ROOM_ALIASES[q];
      const targetRoom = ALL_ROOMS.find(r => r.name.toLowerCase() === alias.target.toLowerCase());
      if (targetRoom) {
        return [targetRoom];
      }
    }

    return matched;
  }, [searchTerm]);

  // Auto-sync selected room when user types search term
  useEffect(() => {
    const q = searchTerm.trim().toLowerCase();
    if (ROOM_ALIASES[q]) {
      const alias = ROOM_ALIASES[q];
      setSelectedRoomName(alias.target);
      setAliasNotice(alias.note);
      return;
    }

    if (filteredRooms.length > 0) {
      const isSelectedInList = filteredRooms.some(r => r.name === selectedRoomName);
      if (!isSelectedInList) {
        setSelectedRoomName(filteredRooms[0].name);
      }
      setAliasNotice(null);
    } else {
      setAliasNotice(null);
    }
  }, [filteredRooms, searchTerm]);

  // Active room data
  const currentRoom = useMemo(() => {
    if (filteredRooms.length === 0) return null;
    return ALL_ROOMS.find(r => r.name === selectedRoomName) || filteredRooms[0];
  }, [selectedRoomName, filteredRooms]);

  // Keyboard navigation (ArrowLeft and ArrowRight to navigate photos)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!currentRoom || !currentRoom.mainPhotos || currentRoom.mainPhotos.length === 0) return;
      if (e.key === 'ArrowLeft') {
        setMainPhotoIndex(i => (i - 1 + currentRoom.mainPhotos.length) % currentRoom.mainPhotos.length);
      } else if (e.key === 'ArrowRight') {
        setMainPhotoIndex(i => (i + 1) % currentRoom.mainPhotos.length);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentRoom]);

  return (
    <div className="portal-page" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
      {/* ── Top Navbar ── */}
      <nav className="portal-navbar">
        <div className="nav-brand">
          <div className="nav-logo">
            <img
              alt="MIT Mysore Logo"
              src="/logo.png"
              onError={(e) => {
                const target = e.currentTarget;
                if (!target.src.startsWith('data:')) {
                  target.src = MIT_SEAL_LOGO_BASE64;
                }
              }}
              className="mit-official-logo"
            />
          </div>
          <div className="nav-title">
            <b>MIT MYSORE</b>
            <small>Campus Indoor Navigation · Room Guide</small>
          </div>
        </div>
        <div className="nav-right">
          <span className="nav-badge">
            <CalendarDays size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
            {campaign}
          </span>
          <a
            href="/schedules.html"
            className="nav-sched-btn"
            title="Return to Uniform Distribution Schedules"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <ArrowLeft size={14} /> Schedules
          </a>
          <a
            href="/"
            className="nav-sched-btn"
            title="Return to Student Registration"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            Registration Portal
          </a>
        </div>
      </nav>

      {/* ── Hero Banner ── */}
      <div className="portal-hero" style={{ padding: '2.5rem 1.5rem 2rem' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.2)', padding: '4px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>
          <Sparkles size={14} /> MIT Mysore Campus Indoor Navigation (Locorom)
        </div>
        <h1>Campus Room & Counter Guide</h1>
        <p className="hero-sub" style={{ margin: 0, maxWidth: '720px' }}>
          Photographic walking paths, hall checkpoints, and classroom locations for student uniform collection.
        </p>
      </div>

      {/* ── Main Full-Width Navigation Workspace ── */}
      <div style={{ maxWidth: '1280px', width: '100%', margin: '-2.25rem auto 0', padding: '0 1.5rem 4rem', position: 'relative', zIndex: 2, flex: 1, boxSizing: 'border-box' }}>
        <div
          className="portal-form-card"
          style={{
            width: '100%',
            padding: '28px',
            borderRadius: '16px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
            background: '#ffffff',
            boxSizing: 'border-box'
          }}
        >
          {/* Header matching locorom repository */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '16px',
              paddingBottom: '18px',
              borderBottom: '1px solid #e2e8f0',
              marginBottom: '24px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '12px',
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '4px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                  flexShrink: 0
                }}
              >
                <img
                  src="https://raw.githubusercontent.com/aryamanm77/mitm-room/main/logo_locorom.png"
                  alt="Locorom Logo"
                  style={{ width: '50px', height: '50px', objectFit: 'contain' }}
                />
              </div>
              <div>
                <h2 style={{ fontSize: '26px', fontWeight: 800, margin: 0, color: '#1e293b', display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                  🔍 Room <span style={{ color: '#16a34a', fontSize: '18px' }}>[MITM]</span>
                </h2>
                <p style={{ margin: '3px 0 0 0', color: '#64748b', fontSize: '13px' }}>
                  Photographic Navigation & Location Guide · Database: <code>aryamanm77/mitm-room</code>
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#16a34a',
                  background: '#f0fdf4',
                  padding: '6px 14px',
                  borderRadius: '20px',
                  border: '1px solid #bbf7d0'
                }}
              >
                ✓ 62 Campus Rooms Mapped
              </span>
              <a
                href="/schedules.html"
                className="p-btn p-btn-secondary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', fontSize: '13px', textDecoration: 'none', fontWeight: 600 }}
              >
                <ArrowLeft size={14} /> Back to Schedules
              </a>
            </div>
          </div>

          {/* ── Two-Column Layout ── */}
          <div
            className="nav-two-col-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: '300px minmax(0, 1fr)',
              gap: '28px',
              alignItems: 'start'
            }}
          >
            {/* Left Column: Room Search and Radio Selection */}
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
              }}
            >
              {/* Search Room Input matching st.text_input("**Search Room**", "", placeholder="example., 415B") */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>
                  Search Room
                </label>
                <div style={{ position: 'relative' }}>
                  <Search
                    size={16}
                    style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}
                  />
                  <input
                    type="text"
                    placeholder="example: 415B, 114, 205..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px 10px 36px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13px',
                      outline: 'none',
                      background: '#ffffff',
                      boxSizing: 'border-box'
                    }}
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        fontSize: '13px'
                      }}
                      title="Clear search"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#64748b' }}>
                  Showing {filteredRooms.length} of {ALL_ROOMS.length} rooms
                </div>
              </div>

              {/* Radio Selector List matching st.radio("Select Room", filtered_rooms) */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  SELECT ROOM:
                </label>
                <div
                  style={{
                    maxHeight: '540px',
                    overflowY: 'auto',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    background: '#ffffff',
                    padding: '6px'
                  }}
                >
                  {filteredRooms.length === 0 ? (
                    <div style={{ padding: '28px 14px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                      No rooms found for "<strong>{searchTerm}</strong>".
                      <br />
                      <button
                        onClick={() => setSearchTerm('')}
                        style={{ marginTop: '10px', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
                      >
                        Reset Search
                      </button>
                    </div>
                  ) : (
                    filteredRooms.map(r => {
                      const isSelected = r.name === currentRoom?.name;
                      return (
                        <div
                          key={r.name}
                          onClick={() => {
                            setSelectedRoomName(r.name);
                            setAliasNotice(null);
                          }}
                          style={{
                            padding: '10px 12px',
                            borderRadius: '6px',
                            marginBottom: '4px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: isSelected ? '#eff6ff' : 'transparent',
                            border: isSelected ? '1px solid #bfdbfe' : '1px solid transparent',
                            transition: 'all 0.12s ease'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                            <input
                              type="radio"
                              name="page_room_selection"
                              checked={isSelected}
                              onChange={() => {
                                setSelectedRoomName(r.name);
                                setAliasNotice(null);
                              }}
                              style={{ cursor: 'pointer', accentColor: '#2563eb' }}
                            />
                            <span style={{ fontSize: '13px', fontWeight: isSelected ? 700 : 500, color: isSelected ? '#1d4ed8' : '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {r.name}
                            </span>
                          </div>
                          <span style={{ fontSize: '11px', color: '#94a3b8', flexShrink: 0, marginLeft: '6px' }}>
                            {r.mainPhotos.length > 0 ? `${r.mainPhotos.length} steps` : r.subfolders.length > 0 ? `${r.subfolders.length} pts` : ''}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: display_main_content(selected_room) */}
            <div style={{ background: '#ffffff', minWidth: 0 }}>
              {currentRoom ? (
                <div>
                  {/* Room Title matching st.header(f"Room: :red[{selected_room}]") */}
                  <div
                    style={{
                      borderBottom: '2px solid #f1f5f9',
                      paddingBottom: '14px',
                      marginBottom: '20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '10px'
                    }}
                  >
                    <div style={{ fontSize: '28px', fontWeight: 800, color: '#dc2626' }}>
                      Room: <span style={{ color: '#dc2626' }}>{currentRoom.name}</span>
                    </div>
                    <span style={{ fontSize: '12px', color: '#64748b', background: '#f1f5f9', padding: '5px 12px', borderRadius: '6px', fontWeight: 500 }}>
                      Use ← → keys on keyboard to navigate steps
                    </span>
                  </div>

                  {/* Smart Alias Notice */}
                  {aliasNotice && (
                    <div
                      style={{
                        background: '#eff6ff',
                        border: '1px solid #bfdbfe',
                        borderRadius: '10px',
                        padding: '12px 16px',
                        marginBottom: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        fontSize: '13px',
                        color: '#1d4ed8'
                      }}
                    >
                      <Info size={18} style={{ flexShrink: 0 }} />
                      <div>
                        <strong>Notice:</strong> {aliasNotice}
                      </div>
                    </div>
                  )}

                  {/* Main Area: From Point: */}
                  {currentRoom.mainPhotos && currentRoom.mainPhotos.length > 0 && (
                    <div style={{ marginBottom: '36px' }}>
                      <h4 style={{ color: '#16a34a', fontSize: '19px', fontWeight: 700, marginBottom: '14px' }}>
                        From Point:
                      </h4>

                      {/* Row with Thumbnail (first photo) and Location Info */}
                      <div
                        className="from-point-card"
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '260px minmax(0, 1fr)',
                          gap: '24px',
                          alignItems: 'center',
                          background: '#f8fafc',
                          padding: '20px 24px',
                          borderRadius: '12px',
                          border: '1px solid #e2e8f0',
                          marginBottom: '24px'
                        }}
                      >
                        <div style={{ width: '100%' }}>
                          <img
                            src={currentRoom.mainPhotos[0].url}
                            alt={`From point for ${currentRoom.name}`}
                            style={{ width: '100%', height: '160px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #cbd5e1', display: 'block' }}
                          />
                          <small style={{ display: 'block', textAlign: 'center', color: '#64748b', marginTop: '6px', fontSize: '11px', fontWeight: 600 }}>
                            Starting Perspective
                          </small>
                        </div>

                        <div style={{ minWidth: 0 }}>
                          <h5 style={{ color: '#0D92F4', fontSize: '16px', fontWeight: 700, margin: '0 0 8px 0' }}>
                            Location Info :
                          </h5>
                          <p style={{ fontSize: '14px', color: '#334155', lineHeight: 1.6, margin: 0, wordBreak: 'break-word' }}>
                            {currentRoom.info || 'Follow the sequence of corridor and staircase photos below to reach the classroom.'}
                          </p>
                        </div>
                      </div>

                      {/* Photos Carousel: Path through Photos */}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                          <div>
                            <h5 style={{ fontSize: '18px', fontWeight: 700, color: '#1e293b', margin: 0 }}>Photos</h5>
                            <small style={{ color: '#64748b', fontSize: '13px' }}>Path through Photos</small>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: '#475569', background: '#f1f5f9', padding: '4px 12px', borderRadius: '6px' }}>
                              Step {mainPhotoIndex + 1} of {currentRoom.mainPhotos.length}
                            </span>
                            <button
                              type="button"
                              onClick={() => setMainZoom(z => Math.max(1, z - 0.25))}
                              style={{ background: '#f1f5f9', border: 'none', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer' }}
                              title="Zoom Out"
                            >
                              <ZoomOut size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setMainZoom(z => Math.min(2.5, z + 0.25))}
                              style={{ background: '#f1f5f9', border: 'none', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer' }}
                              title="Zoom In"
                            >
                              <ZoomIn size={15} />
                            </button>
                            {mainZoom !== 1 && (
                              <button
                                type="button"
                                onClick={() => setMainZoom(1)}
                                style={{ background: '#f1f5f9', border: 'none', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer' }}
                                title="Reset Zoom"
                              >
                                <RotateCcw size={15} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Main Carousel Display Box */}
                        <div
                          style={{
                            position: 'relative',
                            height: '480px',
                            background: '#0f172a',
                            borderRadius: '12px',
                            overflow: 'hidden',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.18)'
                          }}
                        >
                          <img
                            src={currentRoom.mainPhotos[mainPhotoIndex].url}
                            alt={`Step ${mainPhotoIndex + 1} for ${currentRoom.name}`}
                            style={{
                              maxWidth: '100%',
                              maxHeight: '100%',
                              objectFit: 'contain',
                              transform: `scale(${mainZoom})`,
                              transition: 'transform 0.15s ease'
                            }}
                          />

                          {/* Navigation Left Button */}
                          <button
                            type="button"
                            onClick={() => setMainPhotoIndex((mainPhotoIndex - 1 + currentRoom.mainPhotos.length) % currentRoom.mainPhotos.length)}
                            style={{
                              position: 'absolute',
                              left: '16px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              background: 'rgba(0, 0, 0, 0.65)',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '50%',
                              width: '44px',
                              height: '44px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              transition: 'background 0.15s'
                            }}
                            title="Previous step"
                          >
                            <ChevronLeft size={24} />
                          </button>

                          {/* Navigation Right Button */}
                          <button
                            type="button"
                            onClick={() => setMainPhotoIndex((mainPhotoIndex + 1) % currentRoom.mainPhotos.length)}
                            style={{
                              position: 'absolute',
                              right: '16px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              background: 'rgba(0, 0, 0, 0.65)',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '50%',
                              width: '44px',
                              height: '44px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              transition: 'background 0.15s'
                            }}
                            title="Next step"
                          >
                            <ChevronRight size={24} />
                          </button>

                          {/* Step Badge */}
                          <div
                            style={{
                              position: 'absolute',
                              bottom: '16px',
                              left: '50%',
                              transform: 'translateX(-50%)',
                              background: 'rgba(0, 0, 0, 0.75)',
                              color: '#ffffff',
                              fontSize: '13px',
                              fontWeight: 600,
                              padding: '6px 18px',
                              borderRadius: '20px'
                            }}
                          >
                            Step {mainPhotoIndex + 1} / {currentRoom.mainPhotos.length} ({currentRoom.mainPhotos[mainPhotoIndex].name})
                          </div>
                        </div>

                        {/* Thumbnail Filmstrip */}
                        <div
                          style={{
                            display: 'flex',
                            gap: '10px',
                            overflowX: 'auto',
                            padding: '14px 0 6px 0'
                          }}
                        >
                          {currentRoom.mainPhotos.map((photo, pIdx) => {
                            const isActive = pIdx === mainPhotoIndex;
                            return (
                              <div
                                key={photo.name}
                                onClick={() => setMainPhotoIndex(pIdx)}
                                style={{
                                  width: '80px',
                                  height: '58px',
                                  flexShrink: 0,
                                  borderRadius: '8px',
                                  overflow: 'hidden',
                                  cursor: 'pointer',
                                  border: isActive ? '2px solid #2563eb' : '1px solid #cbd5e1',
                                  opacity: isActive ? 1 : 0.6,
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                <img
                                  src={photo.url}
                                  alt={photo.name}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '32px 0' }} />
                    </div>
                  )}

                  {/* Subfolders Section (Access Points) */}
                  {currentRoom.subfolders && currentRoom.subfolders.length > 0 && (
                    <div>
                      {currentRoom.subfolders.map((sub, sIdx) => {
                        const currentSubIndex = subfolderPhotoIndices[sIdx] || 0;
                        const currentSubZoom = subfolderZooms[sIdx] || 1;

                        return (
                          <div key={sub.name} style={{ marginBottom: '40px' }}>
                            <h4 style={{ color: '#16a34a', fontSize: '19px', fontWeight: 700, marginBottom: '14px' }}>
                              From Point: <span style={{ color: '#0f172a' }}>{sub.name}</span>
                            </h4>

                            {/* Subfolder Thumbnail & Info */}
                            <div
                              className="from-point-card"
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '260px minmax(0, 1fr)',
                                gap: '24px',
                                alignItems: 'center',
                                background: '#f8fafc',
                                padding: '20px 24px',
                                borderRadius: '12px',
                                border: '1px solid #e2e8f0',
                                marginBottom: '24px'
                              }}
                            >
                              <div style={{ width: '100%' }}>
                                {sub.thumbnail ? (
                                  <img
                                    src={sub.thumbnail}
                                    alt={`Thumbnail for ${sub.name}`}
                                    style={{ width: '100%', height: '160px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #cbd5e1', display: 'block' }}
                                  />
                                ) : sub.photos && sub.photos.length > 0 ? (
                                  <img
                                    src={sub.photos[0].url}
                                    alt={`Thumbnail for ${sub.name}`}
                                    style={{ width: '100%', height: '160px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #cbd5e1', display: 'block' }}
                                  />
                                ) : (
                                  <div
                                    style={{
                                      width: '100%',
                                      height: '160px',
                                      borderRadius: '8px',
                                      background: '#e2e8f0',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      color: '#64748b',
                                      fontSize: '12px'
                                    }}
                                  >
                                    Access Point View
                                  </div>
                                )}
                                <small style={{ display: 'block', textAlign: 'center', color: '#64748b', marginTop: '6px', fontSize: '11px', fontWeight: 600 }}>
                                  Access Point Thumbnail
                                </small>
                              </div>

                              <div style={{ minWidth: 0 }}>
                                <h5 style={{ color: '#0D92F4', fontSize: '16px', fontWeight: 700, margin: '0 0 8px 0' }}>
                                  Location Info :
                                </h5>
                                <p style={{ fontSize: '14px', color: '#334155', lineHeight: 1.6, margin: 0, wordBreak: 'break-word' }}>
                                  {sub.info || 'Proceed from this access point following the sequential photos below.'}
                                </p>
                              </div>
                            </div>

                            {/* Subfolder Media Carousel */}
                            {sub.photos && sub.photos.length > 0 ? (
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                                  <div>
                                    <h5 style={{ fontSize: '18px', fontWeight: 700, color: '#1e293b', margin: 0 }}>Photos</h5>
                                    <small style={{ color: '#64748b', fontSize: '13px' }}>Path through Photos</small>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#475569', background: '#f1f5f9', padding: '4px 12px', borderRadius: '6px' }}>
                                      Step {currentSubIndex + 1} of {sub.photos.length}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setSubfolderZooms(prev => ({
                                          ...prev,
                                          [sIdx]: Math.max(1, (prev[sIdx] || 1) - 0.25)
                                        }))
                                      }
                                      style={{ background: '#f1f5f9', border: 'none', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer' }}
                                      title="Zoom Out"
                                    >
                                      <ZoomOut size={15} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setSubfolderZooms(prev => ({
                                          ...prev,
                                          [sIdx]: Math.min(2.5, (prev[sIdx] || 1) + 0.25)
                                        }))
                                      }
                                      style={{ background: '#f1f5f9', border: 'none', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer' }}
                                      title="Zoom In"
                                    >
                                      <ZoomIn size={15} />
                                    </button>
                                  </div>
                                </div>

                                {/* Subfolder Display Box */}
                                <div
                                  style={{
                                    position: 'relative',
                                    height: '480px',
                                    background: '#0f172a',
                                    borderRadius: '12px',
                                    overflow: 'hidden',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    boxShadow: '0 4px 20px rgba(0,0,0,0.18)'
                                  }}
                                >
                                  <img
                                    src={sub.photos[currentSubIndex].url}
                                    alt={`Step ${currentSubIndex + 1} for ${sub.name}`}
                                    style={{
                                      maxWidth: '100%',
                                      maxHeight: '100%',
                                      objectFit: 'contain',
                                      transform: `scale(${currentSubZoom})`,
                                      transition: 'transform 0.15s ease'
                                    }}
                                  />

                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSubfolderPhotoIndices(prev => ({
                                        ...prev,
                                        [sIdx]: (currentSubIndex - 1 + sub.photos.length) % sub.photos.length
                                      }))
                                    }
                                    style={{
                                      position: 'absolute',
                                      left: '16px',
                                      top: '50%',
                                      transform: 'translateY(-50%)',
                                      background: 'rgba(0, 0, 0, 0.65)',
                                      color: '#ffffff',
                                      border: 'none',
                                      borderRadius: '50%',
                                      width: '44px',
                                      height: '44px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      cursor: 'pointer'
                                    }}
                                    title="Previous step"
                                  >
                                    <ChevronLeft size={24} />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSubfolderPhotoIndices(prev => ({
                                        ...prev,
                                        [sIdx]: (currentSubIndex + 1) % sub.photos.length
                                      }))
                                    }
                                    style={{
                                      position: 'absolute',
                                      right: '16px',
                                      top: '50%',
                                      transform: 'translateY(-50%)',
                                      background: 'rgba(0, 0, 0, 0.65)',
                                      color: '#ffffff',
                                      border: 'none',
                                      borderRadius: '50%',
                                      width: '44px',
                                      height: '44px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      cursor: 'pointer'
                                    }}
                                    title="Next step"
                                  >
                                    <ChevronRight size={24} />
                                  </button>

                                  <div
                                    style={{
                                      position: 'absolute',
                                      bottom: '16px',
                                      left: '50%',
                                      transform: 'translateX(-50%)',
                                      background: 'rgba(0, 0, 0, 0.75)',
                                      color: '#ffffff',
                                      fontSize: '13px',
                                      fontWeight: 600,
                                      padding: '6px 18px',
                                      borderRadius: '20px'
                                    }}
                                  >
                                    Step {currentSubIndex + 1} / {sub.photos.length} ({sub.photos[currentSubIndex].name})
                                  </div>
                                </div>

                                {/* Thumbnail Filmstrip */}
                                <div
                                  style={{
                                    display: 'flex',
                                    gap: '10px',
                                    overflowX: 'auto',
                                    padding: '14px 0 6px 0'
                                  }}
                                >
                                  {sub.photos.map((photo, pIdx) => {
                                    const isActive = pIdx === currentSubIndex;
                                    return (
                                      <div
                                        key={photo.name}
                                        onClick={() =>
                                          setSubfolderPhotoIndices(prev => ({
                                            ...prev,
                                            [sIdx]: pIdx
                                          }))
                                        }
                                        style={{
                                          width: '80px',
                                          height: '58px',
                                          flexShrink: 0,
                                          borderRadius: '8px',
                                          overflow: 'hidden',
                                          cursor: 'pointer',
                                          border: isActive ? '2px solid #2563eb' : '1px solid #cbd5e1',
                                          opacity: isActive ? 1 : 0.6,
                                          transition: 'all 0.15s ease'
                                        }}
                                      >
                                        <img
                                          src={photo.url}
                                          alt={photo.name}
                                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        />
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : (
                              <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px', color: '#64748b', fontSize: '13px' }}>
                                No photographic steps uploaded for access point "{sub.name}".
                              </div>
                            )}

                            <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '32px 0' }} />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* If neither mainPhotos nor subfolders */}
                  {(!currentRoom.mainPhotos || currentRoom.mainPhotos.length === 0) &&
                    (!currentRoom.subfolders || currentRoom.subfolders.length === 0) && (
                      <div
                        style={{
                          padding: '50px 20px',
                          textAlign: 'center',
                          background: '#f8fafc',
                          borderRadius: '12px',
                          border: '1px dashed #cbd5e1'
                        }}
                      >
                        <MapPin size={36} style={{ color: '#94a3b8', margin: '0 auto 10px auto' }} />
                        <h4 style={{ color: '#1e293b', marginBottom: '6px', fontSize: '18px' }}>Room {currentRoom.name}</h4>
                        <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>
                          {currentRoom.info || 'Photographic walking steps are currently being mapped for this room. Inquire at the main entrance desk.'}
                        </p>
                      </div>
                    )}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
                  <Search size={36} style={{ color: '#cbd5e1', margin: '0 auto 12px auto' }} />
                  <h4 style={{ color: '#1e293b', marginBottom: '6px' }}>No Room Found for "{searchTerm}"</h4>
                  <p style={{ color: '#64748b', fontSize: '13px', maxWidth: '420px', margin: '0 auto 16px auto' }}>
                    Try searching for common rooms like <strong>114</strong>, <strong>205</strong>, <strong>305</strong>, <strong>PE lab</strong>, or <strong>Auditorium</strong>.
                  </p>
                  <button
                    onClick={() => setSearchTerm('')}
                    className="p-btn p-btn-secondary"
                    style={{ padding: '8px 18px', fontSize: '13px' }}
                  >
                    Clear Search
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <footer className="portal-footer" style={{ marginTop: '2rem', borderRadius: '12px' }}>
          © {currentYear} Maharaja Institute of Technology Mysore · Uniform Distribution System & Campus Navigation
          <br />
          <span style={{ display: 'block', marginTop: '0.3rem' }}>
            Academic Year {academicYear} · Belagola, Srirangapatna
          </span>
        </footer>
      </div>
    </div>
  );
}
