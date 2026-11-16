import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Compass,
  MapPin,
  ExternalLink,
  Layers,
  ArrowRight
} from 'lucide-react';
import locoromRoomsData from '../locoromData.json';

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

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialRoomName?: string;
}

export function LocoromRoomFinderModal({ isOpen, onClose, initialRoomName }: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRoomName, setSelectedRoomName] = useState<string>('114');

  // Carousel states for main room photos
  const [mainPhotoIndex, setMainPhotoIndex] = useState(0);
  const [mainZoom, setMainZoom] = useState(1);

  // Carousel states per subfolder by index
  const [subfolderPhotoIndices, setSubfolderPhotoIndices] = useState<Record<number, number>>({});
  const [subfolderZooms, setSubfolderZooms] = useState<Record<number, number>>({});

  // Reset or match initial room on open
  useEffect(() => {
    if (!isOpen) return;

    if (initialRoomName) {
      const clean = initialRoomName.replace(/^Room\s*/i, '').trim().toLowerCase();
      // Look for exact match
      const exact = ALL_ROOMS.find(r => r.name.toLowerCase() === clean);
      if (exact) {
        setSelectedRoomName(exact.name);
        setSearchTerm(exact.name);
        setMainPhotoIndex(0);
        return;
      }
      // Look for includes
      const partial = ALL_ROOMS.find(r => r.name.toLowerCase().includes(clean) || clean.includes(r.name.toLowerCase()));
      if (partial) {
        setSelectedRoomName(partial.name);
        setSearchTerm(partial.name);
        setMainPhotoIndex(0);
        return;
      }
    }

    if (!selectedRoomName && ALL_ROOMS.length > 0) {
      setSelectedRoomName(ALL_ROOMS[0].name);
    }
  }, [isOpen, initialRoomName]);

  // Reset photo index when room changes
  useEffect(() => {
    setMainPhotoIndex(0);
    setMainZoom(1);
    setSubfolderPhotoIndices({});
    setSubfolderZooms({});
  }, [selectedRoomName]);

  // Filtered rooms based on search term
  const filteredRooms = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return ALL_ROOMS;
    return ALL_ROOMS.filter(r => {
      const nameMatch = r.name.toLowerCase().includes(q);
      const infoMatch = r.info && r.info.toLowerCase().includes(q);
      const subMatch = r.subfolders.some(s => s.name.toLowerCase().includes(q) || (s.info && s.info.toLowerCase().includes(q)));
      return nameMatch || infoMatch || subMatch;
    });
  }, [searchTerm]);

  // Active room data
  const currentRoom = useMemo(() => {
    return ALL_ROOMS.find(r => r.name === selectedRoomName) || filteredRooms[0] || ALL_ROOMS[0];
  }, [selectedRoomName, filteredRooms]);

  // Keyboard navigation (ESC to close)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="locorom-modal-overlay" onClick={onClose}>
      <div
        className="locorom-modal-window"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '1100px',
          height: '92vh',
          maxHeight: '900px',
          display: 'flex',
          flexDirection: 'column',
          background: '#ffffff',
          borderRadius: '12px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden'
        }}
      >
        {/* ── Top Header matching locorom repository branding ── */}
        <div
          style={{
            padding: '12px 20px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#ffffff'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '8px',
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                flexShrink: 0
              }}
            >
              <img
                src="https://raw.githubusercontent.com/aryamanm77/mitm-room/main/logo_locorom.png"
                alt="Locorom Logo"
                style={{ width: '38px', height: '38px', objectFit: 'contain' }}
              />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                <span style={{ fontSize: '20px', fontWeight: 700, color: '#1e293b' }}>🔍 Room</span>
                <span style={{ fontSize: '15px', fontWeight: 700, color: '#16a34a' }}>[MITM]</span>
              </div>
              <small style={{ color: '#64748b', fontSize: '12px' }}>
                MIT Mysore Campus Indoor Navigation · Repository: <code>aryamanm77/mitm-room</code>
              </small>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: '#2563eb',
                background: '#eff6ff',
                padding: '4px 10px',
                borderRadius: '20px',
                border: '1px solid #bfdbfe'
              }}
            >
              ✓ 62 Campus Rooms Indexed
            </span>
            <button
              onClick={onClose}
              style={{
                background: '#f1f5f9',
                border: 'none',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#64748b'
              }}
              title="Close modal"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── Main Layout Body: Sidebar (search & radio rooms) + Detail Content ── */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Sidebar / Room Selector */}
          <div
            style={{
              width: '280px',
              borderRight: '1px solid #e2e8f0',
              background: '#f8fafc',
              display: 'flex',
              flexDirection: 'column',
              flexShrink: 0
            }}
          >
            {/* Search Input matching st.text_input("**Search Room**", "", placeholder="example., 415B") */}
            <div style={{ padding: '14px', borderBottom: '1px solid #e2e8f0' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Search Room
              </label>
              <div style={{ position: 'relative' }}>
                <Search
                  size={15}
                  style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}
                />
                <input
                  type="text"
                  placeholder="example., 415B, 114, 205"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px 8px 32px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    outline: 'none',
                    background: '#ffffff'
                  }}
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    style={{
                      position: 'absolute',
                      right: '8px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
              <div style={{ marginTop: '8px', fontSize: '11px', color: '#64748b' }}>
                {filteredRooms.length} room{filteredRooms.length === 1 ? '' : 's'} found
              </div>
            </div>

            {/* Radio / List Selector matching st.radio("Select Room", filtered_rooms) */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
              {filteredRooms.length === 0 ? (
                <div style={{ padding: '20px 10px', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
                  No rooms found matching "{searchTerm}".
                  <br />
                  <button
                    onClick={() => setSearchTerm('')}
                    style={{ marginTop: '8px', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Clear Search
                  </button>
                </div>
              ) : (
                filteredRooms.map(r => {
                  const isSelected = r.name === currentRoom?.name;
                  return (
                    <div
                      key={r.name}
                      onClick={() => setSelectedRoomName(r.name)}
                      style={{
                        padding: '9px 12px',
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="radio"
                          name="room_selection"
                          checked={isSelected}
                          onChange={() => setSelectedRoomName(r.name)}
                          style={{ cursor: 'pointer', accentColor: '#2563eb' }}
                        />
                        <span style={{ fontSize: '13px', fontWeight: isSelected ? 700 : 500, color: isSelected ? '#1d4ed8' : '#334155' }}>
                          {r.name}
                        </span>
                      </div>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                        {r.mainPhotos.length > 0 ? `${r.mainPhotos.length} photos` : r.subfolders.length > 0 ? `${r.subfolders.length} access pts` : ''}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Detail Area: display_main_content(selected_room) */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 30px', background: '#ffffff' }}>
            {currentRoom ? (
              <div>
                {/* Header: Room: :red[selected_room] */}
                <div style={{ borderBottom: '2px solid #f1f5f9', paddingBottom: '14px', marginBottom: '20px' }}>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: '#dc2626' }}>
                    Room: <span style={{ color: '#dc2626' }}>{currentRoom.name}</span>
                  </div>
                </div>

                {/* Main Photos Area (From Point:) */}
                {currentRoom.mainPhotos && currentRoom.mainPhotos.length > 0 && (
                  <div style={{ marginBottom: '32px' }}>
                    <h4 style={{ color: '#16a34a', fontSize: '17px', fontWeight: 700, marginBottom: '14px' }}>
                      From Point:
                    </h4>

                    {/* Row with Thumbnail (first photo) and Location Info */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '220px 1fr',
                        gap: '20px',
                        alignItems: 'start',
                        background: '#f8fafc',
                        padding: '16px',
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0',
                        marginBottom: '20px'
                      }}
                    >
                      <div>
                        <img
                          src={currentRoom.mainPhotos[0].url}
                          alt={`From point for ${currentRoom.name}`}
                          style={{ width: '100%', height: '140px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                        />
                        <small style={{ display: 'block', textAlign: 'center', color: '#64748b', marginTop: '4px', fontSize: '11px' }}>
                          Starting Point View
                        </small>
                      </div>

                      <div>
                        <h5 style={{ color: '#0D92F4', fontSize: '15px', fontWeight: 700, marginBottom: '6px' }}>
                          Location Info :
                        </h5>
                        <p style={{ fontSize: '14px', color: '#334155', lineHeight: 1.6, margin: 0 }}>
                          {currentRoom.info || 'Follow the photographic path instructions below to reach the classroom.'}
                        </p>
                      </div>
                    </div>

                    {/* Photos Carousel: "Path through Photos" */}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <div>
                          <h5 style={{ fontSize: '16px', fontWeight: 700, color: '#1e293b', margin: 0 }}>Photos</h5>
                          <small style={{ color: '#64748b', fontSize: '12px' }}>Path through Photos</small>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569', background: '#f1f5f9', padding: '3px 8px', borderRadius: '6px' }}>
                            Step {mainPhotoIndex + 1} of {currentRoom.mainPhotos.length}
                          </span>
                          <button
                            type="button"
                            onClick={() => setMainZoom(z => Math.max(1, z - 0.25))}
                            style={{ background: '#f1f5f9', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}
                            title="Zoom Out"
                          >
                            <ZoomOut size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setMainZoom(z => Math.min(2.5, z + 0.25))}
                            style={{ background: '#f1f5f9', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}
                            title="Zoom In"
                          >
                            <ZoomIn size={14} />
                          </button>
                          {mainZoom !== 1 && (
                            <button
                              type="button"
                              onClick={() => setMainZoom(1)}
                              style={{ background: '#f1f5f9', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}
                              title="Reset Zoom"
                            >
                              <RotateCcw size={14} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Main Carousel Display Box */}
                      <div
                        style={{
                          position: 'relative',
                          height: '420px',
                          background: '#0f172a',
                          borderRadius: '10px',
                          overflow: 'hidden',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 4px 15px rgba(0,0,0,0.15)'
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

                        {/* Navigation Previous Button */}
                        <button
                          type="button"
                          onClick={() => setMainPhotoIndex((mainPhotoIndex - 1 + currentRoom.mainPhotos.length) % currentRoom.mainPhotos.length)}
                          style={{
                            position: 'absolute',
                            left: '12px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'rgba(0, 0, 0, 0.55)',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '50%',
                            width: '36px',
                            height: '36px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer'
                          }}
                          title="Previous step"
                        >
                          <ChevronLeft size={20} />
                        </button>

                        {/* Navigation Next Button */}
                        <button
                          type="button"
                          onClick={() => setMainPhotoIndex((mainPhotoIndex + 1) % currentRoom.mainPhotos.length)}
                          style={{
                            position: 'absolute',
                            right: '12px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'rgba(0, 0, 0, 0.55)',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '50%',
                            width: '36px',
                            height: '36px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer'
                          }}
                          title="Next step"
                        >
                          <ChevronRight size={20} />
                        </button>

                        {/* Step Badge */}
                        <div
                          style={{
                            position: 'absolute',
                            bottom: '12px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            background: 'rgba(0, 0, 0, 0.65)',
                            color: '#ffffff',
                            fontSize: '12px',
                            fontWeight: 600,
                            padding: '4px 14px',
                            borderRadius: '20px',
                            letterSpacing: '0.5px'
                          }}
                        >
                          Step {mainPhotoIndex + 1} / {currentRoom.mainPhotos.length} ({currentRoom.mainPhotos[mainPhotoIndex].name})
                        </div>
                      </div>

                      {/* Thumbnail Strip */}
                      <div
                        style={{
                          display: 'flex',
                          gap: '8px',
                          overflowX: 'auto',
                          padding: '10px 0',
                          marginTop: '6px'
                        }}
                      >
                        {currentRoom.mainPhotos.map((photo, pIdx) => {
                          const isActive = pIdx === mainPhotoIndex;
                          return (
                            <div
                              key={photo.name}
                              onClick={() => setMainPhotoIndex(pIdx)}
                              style={{
                                width: '64px',
                                height: '48px',
                                flexShrink: 0,
                                borderRadius: '6px',
                                overflow: 'hidden',
                                cursor: 'pointer',
                                border: isActive ? '2px solid #2563eb' : '1px solid #cbd5e1',
                                opacity: isActive ? 1 : 0.65,
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

                    <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '24px 0' }} />
                  </div>
                )}

                {/* Subfolders Section (Access Points) */}
                {currentRoom.subfolders && currentRoom.subfolders.length > 0 && (
                  <div>
                    {currentRoom.subfolders.map((sub, sIdx) => {
                      const currentSubIndex = subfolderPhotoIndices[sIdx] || 0;
                      const currentSubZoom = subfolderZooms[sIdx] || 1;

                      return (
                        <div key={sub.name} style={{ marginBottom: '32px' }}>
                          <h4 style={{ color: '#16a34a', fontSize: '17px', fontWeight: 700, marginBottom: '14px' }}>
                            From Point: <span style={{ color: '#0f172a' }}>{sub.name}</span>
                          </h4>

                          {/* Subfolder Thumbnail & Info */}
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '220px 1fr',
                              gap: '20px',
                              alignItems: 'start',
                              background: '#f8fafc',
                              padding: '16px',
                              borderRadius: '10px',
                              border: '1px solid #e2e8f0',
                              marginBottom: '20px'
                            }}
                          >
                            <div>
                              {sub.thumbnail ? (
                                <img
                                  src={sub.thumbnail}
                                  alt={`Thumbnail for ${sub.name}`}
                                  style={{ width: '100%', height: '140px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                                />
                              ) : sub.photos && sub.photos.length > 0 ? (
                                <img
                                  src={sub.photos[0].url}
                                  alt={`Thumbnail for ${sub.name}`}
                                  style={{ width: '100%', height: '140px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                                />
                              ) : (
                                <div
                                  style={{
                                    width: '100%',
                                    height: '140px',
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
                              <small style={{ display: 'block', textAlign: 'center', color: '#64748b', marginTop: '4px', fontSize: '11px' }}>
                                Access Point Thumbnail
                              </small>
                            </div>

                            <div>
                              <h5 style={{ color: '#0D92F4', fontSize: '15px', fontWeight: 700, marginBottom: '6px' }}>
                                Location Info :
                              </h5>
                              <p style={{ fontSize: '14px', color: '#334155', lineHeight: 1.6, margin: 0 }}>
                                {sub.info || 'Proceed from this access point following the sequential photos below.'}
                              </p>
                            </div>
                          </div>

                          {/* Subfolder Media Carousel */}
                          {sub.photos && sub.photos.length > 0 ? (
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <div>
                                  <h5 style={{ fontSize: '16px', fontWeight: 700, color: '#1e293b', margin: 0 }}>Photos</h5>
                                  <small style={{ color: '#64748b', fontSize: '12px' }}>Path through Photos</small>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569', background: '#f1f5f9', padding: '3px 8px', borderRadius: '6px' }}>
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
                                    style={{ background: '#f1f5f9', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}
                                    title="Zoom Out"
                                  >
                                    <ZoomOut size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSubfolderZooms(prev => ({
                                        ...prev,
                                        [sIdx]: Math.min(2.5, (prev[sIdx] || 1) + 0.25)
                                      }))
                                    }
                                    style={{ background: '#f1f5f9', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}
                                    title="Zoom In"
                                  >
                                    <ZoomIn size={14} />
                                  </button>
                                </div>
                              </div>

                              {/* Subfolder Carousel Display Box */}
                              <div
                                style={{
                                  position: 'relative',
                                  height: '420px',
                                  background: '#0f172a',
                                  borderRadius: '10px',
                                  overflow: 'hidden',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  boxShadow: '0 4px 15px rgba(0,0,0,0.15)'
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
                                    left: '12px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    background: 'rgba(0, 0, 0, 0.55)',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '50%',
                                    width: '36px',
                                    height: '36px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer'
                                  }}
                                  title="Previous step"
                                >
                                  <ChevronLeft size={20} />
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
                                    right: '12px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    background: 'rgba(0, 0, 0, 0.55)',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '50%',
                                    width: '36px',
                                    height: '36px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer'
                                  }}
                                  title="Next step"
                                >
                                  <ChevronRight size={20} />
                                </button>

                                <div
                                  style={{
                                    position: 'absolute',
                                    bottom: '12px',
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    background: 'rgba(0, 0, 0, 0.65)',
                                    color: '#ffffff',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    padding: '4px 14px',
                                    borderRadius: '20px'
                                  }}
                                >
                                  Step {currentSubIndex + 1} / {sub.photos.length} ({sub.photos[currentSubIndex].name})
                                </div>
                              </div>

                              {/* Thumbnail Strip */}
                              <div
                                style={{
                                  display: 'flex',
                                  gap: '8px',
                                  overflowX: 'auto',
                                  padding: '10px 0',
                                  marginTop: '6px'
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
                                        width: '64px',
                                        height: '48px',
                                        flexShrink: 0,
                                        borderRadius: '6px',
                                        overflow: 'hidden',
                                        cursor: 'pointer',
                                        border: isActive ? '2px solid #2563eb' : '1px solid #cbd5e1',
                                        opacity: isActive ? 1 : 0.65,
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

                          <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '24px 0' }} />
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
                        padding: '40px 20px',
                        textAlign: 'center',
                        background: '#f8fafc',
                        borderRadius: '10px',
                        border: '1px dashed #cbd5e1'
                      }}
                    >
                      <MapPin size={32} style={{ color: '#94a3b8', margin: '0 auto 8px auto' }} />
                      <h4 style={{ color: '#1e293b', marginBottom: '6px' }}>Room {currentRoom.name}</h4>
                      <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>
                        {currentRoom.info || 'Photographic steps are currently being mapped for this room. Inquire at the main entrance desk.'}
                      </p>
                    </div>
                  )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
                Please select a room from the sidebar to view navigation photos.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

