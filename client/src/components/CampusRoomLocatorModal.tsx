import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  MapPin,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  X,
  Building,
  Navigation,
  Compass,
  Layers,
  Info
} from 'lucide-react';
import { MIT_SEAL_LOGO_BASE64 } from '../utils/mitLogoBase64';

export interface MitmRoom {
  id: string;
  short?: string;
  floor: 'B' | '1' | '2' | '3' | '4';
  type: 'ROOM' | 'LAB';
  x: number;
  y: number;
  w: number;
  h: number;
  wing: string;
  info: string;
}

export const MITM_ROOMS: MitmRoom[] = [
  // 1st Floor
  { id: "114", floor: "1", type: "ROOM", x: 145, y: 290, w: 75, h: 60, wing: "Admission Corridor", info: "(admission section) corridor (next to kings washroom) or next to (scholarship section)" },
  { id: "117", floor: "1", type: "ROOM", x: 230, y: 290, w: 75, h: 60, wing: "South Corridor", info: "Proceed straight past Room 114 along the Admission Section corridor." },
  { id: "118", floor: "1", type: "ROOM", x: 315, y: 290, w: 75, h: 60, wing: "South Corridor", info: "Located adjacent to Room 117 opposite the central courtyard quadrangle." },
  { id: "119", floor: "1", type: "ROOM", x: 400, y: 290, w: 75, h: 60, wing: "South-East Wing", info: "End of South Corridor before the East Wing Mechanical junction." },
  { id: "123 (Design Laboratory, Heat and Mass Transfer Laboratory)", short: "123 (Design & HMT Lab)", floor: "1", type: "LAB", x: 520, y: 270, w: 190, h: 80, wing: "East Mechanical Wing", info: "Turn right at the East Corridor junction; large double-door laboratory past Room 119." },
  { id: "126", floor: "1", type: "ROOM", x: 540, y: 75, w: 80, h: 60, wing: "North-East Wing", info: "Follow the East Wing corridor north past the HMT Laboratory." },
  { id: "127", floor: "1", type: "ROOM", x: 630, y: 75, w: 80, h: 60, wing: "North-East Corner", info: "Located at the far North-East corner adjacent to Room 126." },
  { id: "Auditorium", floor: "1", type: "LAB", x: 260, y: 70, w: 165, h: 70, wing: "Central North Block", info: "Enter through main foyer, cross central quadrangle to North Auditorium." },
  { id: "Fluid Mechanics and Machines Laboratory", short: "Fluid Mechanics Lab", floor: "1", type: "LAB", x: 60, y: 75, w: 185, h: 65, wing: "North-West Wing", info: "Take West corridor past West Stairwell to Fluid Mechanics wing." },
  { id: "Foundry and Forging Laboratory", short: "Foundry & Forging Lab", floor: "1", type: "LAB", x: 55, y: 165, w: 120, h: 85, wing: "West Workshop Block", info: "Located in West Workshop wing opposite central stairs." },
  { id: "Machine Shop", floor: "1", type: "LAB", x: 55, y: 270, w: 80, h: 80, wing: "South-West Workshop", info: "Turn left immediately after Admission Section towards West Workshop bay." },
  { id: "demo", floor: "1", type: "ROOM", x: 145, y: 290, w: 75, h: 60, wing: "Demo Route", info: "Demo test route for Room 114." },
  { id: "demo1", floor: "1", type: "ROOM", x: 145, y: 290, w: 75, h: 60, wing: "Demo1 Route", info: "Demo test route 1 for Room 114." },

  // 2nd Floor
  { id: "204", floor: "2", type: "ROOM", x: 45, y: 290, w: 70, h: 60, wing: "2F South-West", info: "Silver Jubilee Block / 2nd Floor West corridor, adjacent to Room 205." },
  { id: "205", floor: "2", type: "ROOM", x: 120, y: 290, w: 72, h: 60, wing: "2F South-West", info: "Ascend to 2nd Floor via West Stairs; classroom on South-West corridor." },
  { id: "206", floor: "2", type: "ROOM", x: 198, y: 290, w: 72, h: 60, wing: "2F South Corridor", info: "2nd Floor South Corridor next to Room 205." },
  { id: "208", floor: "2", type: "ROOM", x: 276, y: 290, w: 72, h: 60, wing: "2F South Corridor", info: "2nd Floor South Corridor opposite central atrium." },
  { id: "211 PE lab", floor: "2", type: "LAB", x: 354, y: 285, w: 115, h: 65, wing: "2F Power Electronics", info: "2nd Floor Central-South corridor; Power Electronics (PE) Laboratory." },
  { id: "212", floor: "2", type: "ROOM", x: 475, y: 290, w: 75, h: 60, wing: "2F South-East", info: "2nd Floor South-East corridor past 211 PE Lab." },
  { id: "213 DSP lab", floor: "2", type: "LAB", x: 556, y: 285, w: 120, h: 65, wing: "2F East Wing", info: "2nd Floor East corridor; Digital Signal Processing (DSP) Laboratory." },
  { id: "216", floor: "2", type: "ROOM", x: 682, y: 290, w: 68, h: 60, wing: "2F Far East", info: "Far East end of the 2nd Floor South corridor." },
  { id: "219", floor: "2", type: "ROOM", x: 635, y: 175, w: 78, h: 60, wing: "2F East Connector", info: "Midway along the 2nd Floor East Wing corridor." },
  { id: "223", floor: "2", type: "ROOM", x: 635, y: 75, w: 75, h: 60, wing: "2F North-East", info: "North-East corner of the 2nd Floor." },
  { id: "224", floor: "2", type: "ROOM", x: 550, y: 75, w: 75, h: 60, wing: "2F North Corridor", info: "2nd Floor North corridor adjacent to Room 223." },
  { id: "225", floor: "2", type: "ROOM", x: 465, y: 75, w: 75, h: 60, wing: "2F North Corridor", info: "2nd Floor North corridor near East stairwell." },
  { id: "229", floor: "2", type: "ROOM", x: 380, y: 75, w: 75, h: 60, wing: "2F North Central", info: "2nd Floor North-Central wing opposite lift lobby." },
  { id: "230", floor: "2", type: "ROOM", x: 295, y: 75, w: 75, h: 60, wing: "2F North Central", info: "Adjacent to Room 229 on 2nd Floor North corridor." },
  { id: "232", floor: "2", type: "ROOM", x: 210, y: 75, w: 75, h: 60, wing: "2F North-West", info: "2nd Floor North-West wing." },
  { id: "252", floor: "2", type: "ROOM", x: 125, y: 75, w: 75, h: 60, wing: "2F West Wing", info: "2nd Floor West wing near West Stairwell." },
  { id: "253", floor: "2", type: "ROOM", x: 45, y: 75, w: 70, h: 60, wing: "2F Far North-West", info: "End of the 2nd Floor North-West corridor." },

  // 3rd Floor
  { id: "305", floor: "3", type: "ROOM", x: 65, y: 290, w: 80, h: 60, wing: "3F South-West", info: "Take stairs/lift to 3rd Floor; South-West wing entrance." },
  { id: "309", floor: "3", type: "ROOM", x: 155, y: 290, w: 80, h: 60, wing: "3F South Corridor", info: "3rd Floor South Corridor next to Room 305." },
  { id: "313", floor: "3", type: "ROOM", x: 245, y: 290, w: 80, h: 60, wing: "3F South Corridor", info: "3rd Floor Central-South corridor." },
  { id: "315", floor: "3", type: "ROOM", x: 335, y: 290, w: 80, h: 60, wing: "3F South Corridor", info: "3rd Floor South Corridor opposite central quadrangle." },
  { id: "319", floor: "3", type: "ROOM", x: 425, y: 290, w: 80, h: 60, wing: "3F South-East", info: "3rd Floor South-East corridor." },
  { id: "320", floor: "3", type: "ROOM", x: 515, y: 290, w: 85, h: 60, wing: "3F East Wing", info: "3rd Floor East junction next to Room 319." },
  { id: "321", floor: "3", type: "ROOM", x: 610, y: 290, w: 95, h: 60, wing: "3F Far East", info: "3rd Floor South-East corner classroom." },
  { id: "321B", floor: "3", type: "LAB", x: 620, y: 175, w: 85, h: 60, wing: "3F East Annex", info: "3rd Floor East corridor annex adjacent to Room 321." },
  { id: "324", floor: "3", type: "ROOM", x: 580, y: 75, w: 115, h: 60, wing: "3F North-East", info: "3rd Floor North-East wing." },
  { id: "325", floor: "3", type: "ROOM", x: 450, y: 75, w: 115, h: 60, wing: "3F North Corridor", info: "3rd Floor North corridor adjacent to Room 324." },
  { id: "334", floor: "3", type: "ROOM", x: 315, y: 75, w: 120, h: 60, wing: "3F North Central", info: "3rd Floor North Central corridor near Central Lift." },
  { id: "352", floor: "3", type: "ROOM", x: 185, y: 75, w: 115, h: 60, wing: "3F North-West", info: "3rd Floor North-West wing." },
  { id: "353", floor: "3", type: "ROOM", x: 60, y: 75, w: 115, h: 60, wing: "3F West Corner", info: "3rd Floor North-West corner near West Staircase." },

  // 4th Floor
  { id: "401", floor: "4", type: "ROOM", x: 65, y: 290, w: 95, h: 60, wing: "4F South-West", info: "Take lift/stairs to 4th Floor; first room on South-West wing." },
  { id: "405,406,410", floor: "4", type: "LAB", x: 175, y: 285, w: 175, h: 65, wing: "4F South Combined Labs", info: "4th Floor South corridor combined computing & project laboratories." },
  { id: "414", floor: "4", type: "ROOM", x: 365, y: 290, w: 90, h: 60, wing: "4F South-East", info: "4th Floor South corridor past 405-410 lab complex." },
  { id: "415", floor: "4", type: "ROOM", x: 465, y: 290, w: 90, h: 60, wing: "4F South-East", info: "4th Floor South-East wing adjacent to Room 414." },
  { id: "416a", floor: "4", type: "ROOM", x: 565, y: 290, w: 70, h: 60, wing: "4F East Corner", info: "4th Floor East junction (Section A)." },
  { id: "416b", floor: "4", type: "ROOM", x: 642, y: 290, w: 70, h: 60, wing: "4F East Corner", info: "4th Floor East junction (Section B) next to 416a." },
  { id: "419", floor: "4", type: "ROOM", x: 580, y: 75, w: 120, h: 60, wing: "4F North-East", info: "4th Floor North-East wing." },
  { id: "420", floor: "4", type: "ROOM", x: 445, y: 75, w: 120, h: 60, wing: "4F North Corridor", info: "4th Floor North corridor next to Room 419." },
  { id: "422,423,424,425,426,427", short: "422-427 Lab Wing", floor: "4", type: "LAB", x: 75, y: 70, w: 350, h: 65, wing: "4F North Lab Complex", info: "4th Floor North-West continuous laboratory bay housing Rooms 422-427." },

  // Basement & M-Block
  { id: "B-003", floor: "B", type: "ROOM", x: 140, y: 290, w: 95, h: 60, wing: "Basement South", info: "Take central stairs down to Basement level (B); second door on left corridor." },
  { id: "B002", floor: "B", type: "ROOM", x: 250, y: 290, w: 95, h: 60, wing: "Basement South", info: "Take central stairs down to Basement level; adjacent to B-003." },
  { id: "CSBS lab class room", short: "CSBS Lab Classroom", floor: "B", type: "LAB", x: 375, y: 285, w: 165, h: 65, wing: "Basement East Wing", info: "Located in lower ground CSBS block opposite basement lift lobby." },
  { id: "M-003", floor: "B", type: "ROOM", x: 160, y: 75, w: 130, h: 60, wing: "M-Block North", info: "Walk across North lower corridor to M-Block lecture rooms." },
  { id: "M-005", floor: "B", type: "ROOM", x: 310, y: 75, w: 130, h: 60, wing: "M-Block North", info: "Adjacent to M-003 in lower North M-Block corridor." }
];

export const START_POINTS: Record<string, { label: string; x: number; y: number; floor: string }> = {
  MAIN_ENTRANCE: { label: "Main Entrance / Admission Section", x: 180, y: 395, floor: "1" },
  SCHOLARSHIP: { label: "Corridor next to Scholarship Section", x: 290, y: 395, floor: "1" },
  CENTRAL_STAIRS: { label: "Central Staircase / Lift Lobby", x: 465, y: 215, floor: "ALL" },
  WEST_STAIRS: { label: "West Wing Stairwell", x: 205, y: 215, floor: "ALL" }
};

export const FLOOR_NAMES: Record<string, string> = {
  "B": "Basement & M-Block",
  "1": "1st Floor (Ground Level)",
  "2": "2nd Floor",
  "3": "3rd Floor",
  "4": "4th Floor"
};

interface CampusRoomLocatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialRoomId?: string;
}

export function CampusRoomLocatorModal({
  isOpen,
  onClose,
  initialRoomId
}: CampusRoomLocatorModalProps) {
  const [selectedRoomId, setSelectedRoomId] = useState<string>(initialRoomId || '114');
  const [startKey, setStartKey] = useState<string>('MAIN_ENTRANCE');
  const [activeFloor, setActiveFloor] = useState<'B' | '1' | '2' | '3' | '4'>('1');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'LAB' | 'ROOM'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [photoStepIndex, setPhotoStepIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [isAutoWalking, setIsAutoWalking] = useState(false);

  // Sync initial room if passed
  useEffect(() => {
    if (initialRoomId) {
      const match = MITM_ROOMS.find(r => r.id.toLowerCase() === initialRoomId.toLowerCase() || (r.short && r.short.toLowerCase() === initialRoomId.toLowerCase()));
      if (match) {
        setSelectedRoomId(match.id);
        setActiveFloor(match.floor);
      }
    }
  }, [initialRoomId, isOpen]);

  // Current active room
  const activeRoom = useMemo(() => {
    return MITM_ROOMS.find(r => r.id === selectedRoomId) || MITM_ROOMS[0];
  }, [selectedRoomId]);

  // Filtered rooms for dropdown / search
  const filteredRooms = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return MITM_ROOMS.filter(r => {
      const matchesType = categoryFilter === 'ALL' || r.type === categoryFilter;
      const matchesSearch = !q || r.id.toLowerCase().includes(q) || r.info.toLowerCase().includes(q) || r.wing.toLowerCase().includes(q);
      return matchesType && matchesSearch;
    });
  }, [categoryFilter, searchQuery]);

  // Handle selecting a room
  const handleSelectRoom = (roomId: string) => {
    const room = MITM_ROOMS.find(r => r.id === roomId);
    if (!room) return;
    setSelectedRoomId(room.id);
    setActiveFloor(room.floor);
    setPhotoStepIndex(0);
    setIsAutoWalking(false);
  };

  // Photo Walkthrough Steps
  const photoSteps = useMemo(() => {
    return [
      { step: 1, title: 'Start at ' + START_POINTS[startKey].label, desc: 'Stand at the ' + START_POINTS[startKey].label.toLowerCase() + '.', sign: 'MITM MAIN FOYER', arrow: 'STRAIGHT' },
      { step: 2, title: 'Enter Main Corridor', desc: 'Walk past the corridor junctions towards academic wings.', sign: 'CORRIDOR JUNCTION', arrow: 'STRAIGHT' },
      { step: 3, title: `Approach ${activeRoom.wing}`, desc: `Continue along the corridor towards ${activeRoom.wing} (${FLOOR_NAMES[activeRoom.floor]}).`, sign: activeRoom.wing.toUpperCase(), arrow: 'LEFT_OR_RIGHT' },
      { step: 4, title: `Arrive at Room ${activeRoom.id}`, desc: activeRoom.info, sign: `ROOM ${activeRoom.short || activeRoom.id}`, arrow: 'ARRIVED' }
    ];
  }, [activeRoom, startKey]);

  // Auto-walk effect
  useEffect(() => {
    let timer: any;
    if (isAutoWalking) {
      timer = setInterval(() => {
        setPhotoStepIndex(prev => (prev + 1) % photoSteps.length);
      }, 1800);
    }
    return () => clearInterval(timer);
  }, [isAutoWalking, photoSteps.length]);

  if (!isOpen) return null;

  const currentStep = photoSteps[photoStepIndex] || photoSteps[0];
  const startCfg = START_POINTS[startKey];
  const floorRooms = MITM_ROOMS.filter(r => r.floor === activeFloor && !r.id.startsWith('demo'));

  return (
    <div className="locorom-modal-overlay">
      <div className="locorom-modal-window">
        {/* Topbar */}
        <header className="locorom-topbar">
          <div className="locorom-topbar-left">
            <Compass size={20} color="#ff4b4b" />
            <span>🔍 Room [MITM] — Indoor Navigation</span>
            <span className="locorom-running-badge">locorom.streamlit.app replica</span>
          </div>
          <div className="locorom-topbar-right">
            <button
              className="locorom-btn"
              onClick={() => {
                setSearchQuery('');
                setCategoryFilter('ALL');
                setStartKey('MAIN_ENTRANCE');
                handleSelectRoom('114');
                setZoom(1);
              }}
            >
              <RotateCcw size={13} /> Reset View
            </button>
            <button className="locorom-close-btn" onClick={onClose} title="Close Indoor Navigation">
              <X size={20} />
            </button>
          </div>
        </header>

        {/* Content Body */}
        <div className="locorom-app-wrapper">
          {/* Sidebar */}
          <aside className="locorom-sidebar">
            <div className="locorom-logo-card">
              <img
                alt="MITM Crest"
                src="/logo.png"
                onError={(e) => {
                  const target = e.currentTarget;
                  if (!target.src.startsWith('data:')) {
                    target.src = MIT_SEAL_LOGO_BASE64;
                  }
                }}
                className="locorom-crest-img"
              />
              <div className="locorom-logo-text">
                <h2>Maharaja Institute of Technology</h2>
                <p>Mysore • Campus Room Locator</p>
              </div>
            </div>

            <div className="locorom-field">
              <label className="locorom-label">From Point (Starting Location)</label>
              <select
                className="locorom-select"
                value={startKey}
                onChange={e => setStartKey(e.target.value)}
              >
                {Object.entries(START_POINTS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>

            <div className="locorom-field">
              <label className="locorom-label">Floor Plan Level</label>
              <div className="locorom-map-toolbar">
                {(['B', '1', '2', '3', '4'] as const).map(fl => (
                  <button
                    key={fl}
                    className={`locorom-btn ${activeFloor === fl ? 'active' : ''}`}
                    onClick={() => setActiveFloor(fl)}
                  >
                    {fl === 'B' ? 'Basement / M' : `${fl}${fl === '1' ? 'st' : fl === '2' ? 'nd' : fl === '3' ? 'rd' : 'th'} Floor`}
                  </button>
                ))}
              </div>
            </div>

            <div className="locorom-field">
              <label className="locorom-label">Quick Filter by Category</label>
              <div className="locorom-map-toolbar">
                <button
                  className={`locorom-btn filter-chip ${categoryFilter === 'ALL' ? 'active' : ''}`}
                  onClick={() => setCategoryFilter('ALL')}
                >
                  All (48)
                </button>
                <button
                  className={`locorom-btn filter-chip ${categoryFilter === 'LAB' ? 'active' : ''}`}
                  onClick={() => setCategoryFilter('LAB')}
                >
                  Labs
                </button>
                <button
                  className={`locorom-btn filter-chip ${categoryFilter === 'ROOM' ? 'active' : ''}`}
                  onClick={() => setCategoryFilter('ROOM')}
                >
                  Classrooms
                </button>
              </div>
            </div>

            <div className="locorom-field" style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.78rem', color: '#64748b', lineHeight: 1.5 }}>
                💡 <b>Navigation Tip:</b> Click directly on any room box on the map to calculate real-time walking path and photo guide.
              </div>
            </div>
          </aside>

          {/* Main Stage */}
          <main className="locorom-main">
            <div className="locorom-search-grid">
              <div className="locorom-field" style={{ flex: 1 }}>
                <label className="locorom-label">Search Room / Lab</label>
                <div style={{ position: 'relative' }}>
                  <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  <input
                    type="text"
                    className="locorom-input"
                    style={{ paddingLeft: '32px' }}
                    placeholder="Type room number (e.g. 204, 114) or lab name..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              <div className="locorom-field" style={{ minWidth: '220px' }}>
                <label className="locorom-label">Select Room Directly</label>
                <select
                  className="locorom-select"
                  value={selectedRoomId}
                  onChange={e => handleSelectRoom(e.target.value)}
                >
                  {filteredRooms.map(r => (
                    <option key={r.id} value={r.id}>{r.id} ({FLOOR_NAMES[r.floor]})</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Room Header Banner */}
            <div className="locorom-room-header-bar">
              <h2>Room: {activeRoom.id}</h2>
              <span className="locorom-floor-pill">
                {FLOOR_NAMES[activeRoom.floor]} • {activeRoom.wing}
              </span>
            </div>

            {/* Info Box */}
            <div className="locorom-info-box">
              <strong>From Point: <span>{startCfg.label}</span></strong>
              <div>
                Location Info: <span>{activeRoom.info}</span>
              </div>
            </div>

            {/* Workspace Grid: Map + Photo Walkthrough */}
            <div className="locorom-workspace-grid">
              {/* Floor Plan Panel */}
              <div className="locorom-panel-card">
                <div className="locorom-panel-header">
                  <span>MITM Floor Plan — {FLOOR_NAMES[activeFloor]}</span>
                  <div className="locorom-map-toolbar">
                    <button
                      className="locorom-btn"
                      onClick={() => setZoom(z => Math.min(2.4, z + 0.2))}
                      title="Zoom In"
                    >
                      <ZoomIn size={14} />
                    </button>
                    <button
                      className="locorom-btn"
                      onClick={() => setZoom(z => Math.max(0.7, z - 0.2))}
                      title="Zoom Out"
                    >
                      <ZoomOut size={14} />
                    </button>
                    <button
                      className="locorom-btn"
                      onClick={() => setZoom(1)}
                      title="Reset Zoom"
                    >
                      100%
                    </button>
                  </div>
                </div>

                <div className="locorom-map-viewport">
                  <svg
                    viewBox="0 0 760 440"
                    style={{
                      width: '100%',
                      height: '100%',
                      transform: `scale(${zoom})`,
                      transformOrigin: 'center center',
                      transition: 'transform 0.15s ease-out'
                    }}
                  >
                    {/* Building Outer Frame */}
                    <rect x="30" y="45" width="700" height="340" rx="12" fill="#e2e8f0" stroke="#64748b" strokeWidth="2.5" />
                    {/* Corridors */}
                    <rect x="45" y="140" width="670" height="26" fill="#f8fafc" />
                    <rect x="45" y="248" width="670" height="26" fill="#f8fafc" />
                    {/* Central Courtyard / Quadrangle */}
                    <rect x="235" y="172" width="200" height="70" rx="6" fill="#dcfce7" stroke="#86efac" strokeDasharray="4 3" />
                    <text x="335" y="211" textAnchor="middle" fontSize="11" fontWeight="700" fill="#166534">
                      MITM CENTRAL QUADRANGLE
                    </text>

                    {/* Rooms */}
                    {floorRooms.map(room => {
                      const isDest = room.id === activeRoom.id;
                      const label = room.short || room.id;
                      return (
                        <g
                          key={room.id}
                          className="locorom-room-node"
                          onClick={() => handleSelectRoom(room.id)}
                          style={{ cursor: 'pointer' }}
                        >
                          <rect
                            className={`locorom-room-box ${isDest ? 'selected-dest' : ''}`}
                            x={room.x}
                            y={room.y}
                            width={room.w}
                            height={room.h}
                            rx="6"
                            fill={isDest ? '#fee2e2' : room.type === 'LAB' ? '#f0f7ff' : '#ffffff'}
                            stroke={isDest ? '#ff4b4b' : '#94a3b8'}
                            strokeWidth={isDest ? 3 : 1.8}
                          />
                          <text
                            x={room.x + room.w / 2}
                            y={room.y + room.h / 2 + 4}
                            textAnchor="middle"
                            fontSize="11"
                            fontWeight="700"
                            fill={isDest ? '#991b1b' : '#1e293b'}
                            pointerEvents="none"
                          >
                            {label.length > 16 ? label.slice(0, 14) + '…' : label}
                          </text>
                        </g>
                      );
                    })}

                    {/* Start Point Pin (if on current floor or ALL) */}
                    {(startCfg.floor === activeFloor || startCfg.floor === 'ALL') && (
                      <g transform={`translate(${startCfg.x}, ${startCfg.y})`}>
                        <circle r="8" fill="#16a34a" stroke="#ffffff" strokeWidth="2.5" />
                        <rect x="-42" y="11" width="84" height="17" rx="4" fill="#16a34a" />
                        <text x="0" y="23" textAnchor="middle" fontSize="9" fontWeight="700" fill="#ffffff">
                          Start Point
                        </text>
                      </g>
                    )}

                    {/* Dynamic Walking Guide Route Line if room on same floor */}
                    {activeRoom.floor === activeFloor && (
                      <path
                        d={`M ${startCfg.x} ${startCfg.y} L ${startCfg.x} 260 L ${activeRoom.x + activeRoom.w / 2} 260 L ${activeRoom.x + activeRoom.w / 2} ${activeRoom.y + (activeRoom.y > 200 ? 0 : activeRoom.h)}`}
                        className="locorom-route-line"
                      />
                    )}
                  </svg>
                </div>

                <div className="locorom-map-legend">
                  <span><i className="legend-dot" style={{ background: '#16a34a' }}></i>From Point</span>
                  <span><i className="legend-dot" style={{ background: '#ff4b4b' }}></i>Selected Room</span>
                  <span><i className="legend-dot" style={{ background: '#3b82f6' }}></i>Stairs / Lift</span>
                </div>
              </div>

              {/* Photo Walkthrough Panel */}
              <div className="locorom-panel-card">
                <div className="locorom-panel-header">
                  <span>Photos • Path through Photos</span>
                  <span className="locorom-step-fraction">
                    {currentStep.step} / {photoSteps.length}
                  </span>
                </div>

                <div className="locorom-photo-stage">
                  <div className="locorom-photo-canvas-wrap">
                    <svg viewBox="0 0 480 270" style={{ width: '100%', height: '100%', display: 'block' }}>
                      <rect width="480" height="270" fill="#e2e8f0" />
                      <polygon points="0,0 480,0 350,75 130,75" fill="#f8fafc" stroke="#cbd5e1" />
                      <polygon points="0,270 480,270 350,195 130,195" fill="#94a3b8" stroke="#64748b" />
                      {/* Overhead Signboard */}
                      <rect x="135" y="22" width="210" height="34" rx="5" fill="#1e3a8a" stroke="#fbbf24" strokeWidth="2" />
                      <text x="240" y="44" textAnchor="middle" fontSize="11.5" fontWeight="700" fill="#ffffff">
                        {currentStep.sign}
                      </text>
                      {/* Perspective Direction Arrow */}
                      {currentStep.arrow === 'STRAIGHT' && (
                        <path d="M240 225 L240 155 M240 155 L222 173 M240 155 L258 173" stroke="#ff4b4b" strokeWidth="7" strokeLinecap="round" fill="none" />
                      )}
                      {currentStep.arrow === 'LEFT_OR_RIGHT' && (
                        <path d="M240 225 L240 165 L290 165 M290 165 L276 153 M290 165 L276 177" stroke="#ff4b4b" strokeWidth="7" strokeLinecap="round" fill="none" />
                      )}
                      {currentStep.arrow === 'ARRIVED' && (
                        <g transform="translate(240, 160)">
                          <circle r="22" fill="#ff4b4b" />
                          <path d="M -8 0 L -2 6 L 8 -5" stroke="#ffffff" strokeWidth="3" fill="none" strokeLinecap="round" />
                        </g>
                      )}
                    </svg>
                  </div>

                  <div className="locorom-photo-step-counter">
                    <button
                      className="locorom-btn"
                      onClick={() => setPhotoStepIndex((photoStepIndex - 1 + photoSteps.length) % photoSteps.length)}
                    >
                      <ChevronLeft size={14} /> Previous
                    </button>
                    <button
                      className="locorom-btn"
                      onClick={() => setIsAutoWalking(v => !v)}
                      style={{ color: isAutoWalking ? '#ff4b4b' : 'inherit' }}
                    >
                      {isAutoWalking ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Auto-Walk</>}
                    </button>
                    <button
                      className="locorom-btn"
                      onClick={() => setPhotoStepIndex((photoStepIndex + 1) % photoSteps.length)}
                    >
                      Next <ChevronRight size={14} />
                    </button>
                  </div>

                  <div className="locorom-step-caption">
                    <strong>Step {currentStep.step}: {currentStep.title}</strong> — {currentStep.desc}
                  </div>

                  <ul className="locorom-directions-list">
                    {photoSteps.map((s, idx) => (
                      <li
                        key={s.step}
                        className={`locorom-direction-step ${idx === photoStepIndex ? 'active' : ''}`}
                        onClick={() => setPhotoStepIndex(idx)}
                      >
                        <span className="locorom-step-badge">{s.step}</span>
                        <div>
                          <div style={{ fontWeight: 600 }}>{s.title}</div>
                          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{s.desc}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
