import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import QRCode from 'qrcode';
import { Html5Qrcode } from 'html5-qrcode';
import './styles.css';

// ==========================================
// CLIENT-SIDE IMAGE COMPRESSOR FOR MOBILE PROOFS
// ==========================================
const compressImageToBase64 = file => {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = event => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 1200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width = Math.round((width * MAX_HEIGHT) / height);
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => resolve(event.target.result);
    };
    reader.onerror = reject;
  });
};

// ==========================================
// LIVE PHONE CAMERA QR SCANNER COMPONENT
// ==========================================
function CameraQrScanner({ onScanSuccess }) {
  const [scanning, setScanning] = useState(false);
  const [facingMode, setFacingMode] = useState('environment'); // 'environment' (back) or 'user' (front)
  const [cameraError, setCameraError] = useState('');
  const scannerRef = useRef(null);

  const startScanner = async (mode = facingMode) => {
    setCameraError('');
    try {
      if (scannerRef.current) {
        try { await scannerRef.current.stop(); } catch (e) {}
      }

      const html5QrCode = new Html5Qrcode('camera-reader');
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: mode },
        {
          fps: 12,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        (decodedText, decodedResult) => {
          onScanSuccess(decodedText);
        },
        () => {}
      );
      setScanning(true);
    } catch (err) {
      console.error('Camera Scanner Error:', err);
      setCameraError(err.message || 'Unable to access device camera. Please check camera permissions in your mobile browser.');
      setScanning(false);
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current && scanning) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (e) {
        console.error(e);
      }
    }
    setScanning(false);
  };

  const toggleCamera = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    if (scanning) {
      startScanner(nextMode);
    }
  };

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        try { scannerRef.current.stop(); } catch (e) {}
      }
    };
  }, []);

  return (
    <div className="camera-scanner-wrapper">
      <div className="camera-viewport-container">
        <div id="camera-reader" />
        {scanning && <div className="camera-scan-laser" />}
      </div>

      {cameraError && (
        <div className="domain-alert-banner warning" style={{ margin: '12px' }}>
          ⚠️ {cameraError}
        </div>
      )}

      <div className="camera-control-bar">
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {!scanning ? (
            <button className="btn-primary" onClick={() => startScanner(facingMode)} style={{ padding: '6px 14px', fontSize: '0.8rem' }}>
              📷 Start Live Phone Camera
            </button>
          ) : (
            <button className="btn-danger-outline" onClick={stopScanner} style={{ padding: '6px 14px', fontSize: '0.8rem' }}>
              ⏹️ Stop Camera
            </button>
          )}

          {scanning && (
            <button className="btn-secondary" onClick={toggleCamera} style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
              🔄 Switch Camera ({facingMode === 'environment' ? 'Back' : 'Front'})
            </button>
          )}
        </div>

        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: scanning ? 'var(--emerald)' : 'var(--text-muted)' }}>
          {scanning ? '🟢 Viewfinder Scanning...' : '⚪ Camera Standby'}
        </span>
      </div>
    </div>
  );
}

// ==========================================
// QR CODE COMPONENT WITH HIGH DPI & DOWNLOAD
// ==========================================
function QRCodeCanvas({ text, size = 110, downloadName = 'DS_Entry_Pass' }) {
  const [dataUrl, setDataUrl] = useState('');

  useEffect(() => {
    if (!text) return;
    QRCode.toDataURL(text, {
      width: size * 3,
      margin: 1,
      color: {
        dark: '#060813',
        light: '#ffffff'
      }
    })
      .then(setDataUrl)
      .catch(console.error);
  }, [text, size]);

  const handleDownload = e => {
    e.stopPropagation();
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${downloadName}_${text}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (!dataUrl) {
    return <div style={{ width: size, height: size, background: '#fff', borderRadius: '8px' }} />;
  }

  return (
    <div className="qr-box-container">
      <img src={dataUrl} alt="Verified DS QR Ticket" style={{ width: size, height: size }} />
      <button type="button" className="btn-qr-save" onClick={handleDownload} title="Save High-Res QR Ticket">
        📥 Save QR
      </button>
    </div>
  );
}

// ==========================================
// API HELPER & AUTH CONTEXT
// ==========================================
const api = async (path, options = {}) => {
  const token = localStorage.getItem('ds-nexus-token');
  const response = await fetch('/api' + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...options.headers,
    },
  });
  if (response.status === 204) return null;
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
};

const AuthContext = createContext();
const useAuth = () => useContext(AuthContext);

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('ds-nexus-token');
    if (!token) {
      setLoading(false);
      return;
    }
    api('/me/profile')
      .then(setUser)
      .catch(() => {
        localStorage.removeItem('ds-nexus-token');
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password, role) => {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, role }),
    });
    localStorage.setItem('ds-nexus-token', data.token);
    setUser(data.user);
    return data.user;
  };

  const microsoftLogin = async payload => {
    const data = await api('/auth/microsoft-login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    localStorage.setItem('ds-nexus-token', data.token);
    setUser(data.user);
    return data.user;
  };

  const sendOtp = async payload => {
    return await api('/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  };

  const verifyOtp = async (email, otp) => {
    const data = await api('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ email, otp }),
    });
    localStorage.setItem('ds-nexus-token', data.token);
    setUser(data.user);
    return data;
  };

  const logout = () => {
    localStorage.removeItem('ds-nexus-token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, microsoftLogin, sendOtp, verifyOtp, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

// ==========================================
// MAIN APPLICATION COMPONENT
// ==========================================
function App() {
  const { user, logout } = useAuth();

  // Navigation & View State (Persisted in localStorage)
  const [activePortal, setActivePortalState] = useState(() => {
    return localStorage.getItem('ds-nexus-active-portal') || 'public';
  });

  const setActivePortal = portal => {
    setActivePortalState(portal);
    localStorage.setItem('ds-nexus-active-portal', portal);
  };

  const [selectedSession, setSelectedSession] = useState('2026-27');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Data State
  const [sessions, setSessions] = useState([]);
  const [events, setEvents] = useState([]);
  const [allEvents, setAllEvents] = useState([]);
  const [savedIds, setSavedIds] = useState([]);
  const [myRegistrations, setMyRegistrations] = useState([]);
  const [committeeStats, setCommitteeStats] = useState(null);

  // Modals & Viewers
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authInitialRole, setAuthInitialRole] = useState('student');
  const [detailEvent, setDetailEvent] = useState(null);
  const [lightboxData, setLightboxData] = useState(null); // { photos: [], currentIndex: 0, title: '' }
  const [certificateView, setCertificateView] = useState(null);
  const [attendeeModalEvent, setAttendeeModalEvent] = useState(null);
  const [photoManagerEvent, setPhotoManagerEvent] = useState(null);
  const [eventFormOpen, setEventFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [announcementModalEvent, setAnnouncementModalEvent] = useState(null);
  const [securityModalOpen, setSecurityModalOpen] = useState(false);
  const [paymentModalEvent, setPaymentModalEvent] = useState(null);
  const [paymentProofViewerReg, setPaymentProofViewerReg] = useState(null);
  const [sessionManagerOpen, setSessionManagerOpen] = useState(false);

  // Load Sessions & Events
  const loadSessions = async () => {
    try {
      const data = await api('/sessions');
      setSessions(data);
    } catch (e) {
      console.error(e);
    }
  };

  const loadAllEvents = async () => {
    try {
      const data = await api('/events?session=all&category=all');
      setAllEvents(data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const loadEvents = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedSession) params.set('session', selectedSession);
      if (selectedCategory) params.set('category', selectedCategory);
      if (searchQuery) params.set('search', searchQuery);
      const data = await api('/events?' + params.toString());
      setEvents(data);
    } catch (e) {
      console.error(e);
    }
  };

  const loadStudentData = async () => {
    if (user && user.role === 'student') {
      try {
        const [regs, saved] = await Promise.all([
          api('/me/registrations'),
          api('/me/saved')
        ]);
        setMyRegistrations(regs);
        setSavedIds(saved);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const loadCommitteeData = async () => {
    if (user && user.role === 'committee') {
      try {
        const stats = await api('/committee/dashboard');
        setCommitteeStats(stats);
      } catch (e) {
        console.error(e);
      }
    }
  };

  useEffect(() => {
    loadSessions();
    loadAllEvents();
  }, []);

  useEffect(() => {
    loadEvents();
  }, [selectedSession, selectedCategory, searchQuery]);

  useEffect(() => {
    if (user) {
      if (user.role === 'student') {
        loadStudentData();
        if (activePortal === 'committee') setActivePortal('student');
      } else if (user.role === 'committee') {
        loadCommitteeData();
        if (activePortal === 'student') setActivePortal('committee');
      }
    } else {
      if (activePortal === 'student' || activePortal === 'committee') {
        setActivePortal('public');
      }
    }
  }, [user]);

  // Handle Event Registration (Free or Paid)
  const handleRegister = async eventTarget => {
    if (!user) {
      setAuthInitialRole('student');
      setAuthModalOpen(true);
      return;
    }
    if (user.role !== 'student') {
      alert('Only verified student accounts can register for workshops and events.');
      return;
    }

    const eventObj = typeof eventTarget === 'object' ? eventTarget : (events.find(e => e.id === eventTarget) || detailEvent);
    if (!eventObj) return;

    // If event is paid, open payment & screenshot gateway modal
    if (eventObj.isPaid && Number(eventObj.fee) > 0) {
      setPaymentModalEvent(eventObj);
      return;
    }

    try {
      await api('/registrations', {
        method: 'POST',
        body: JSON.stringify({ eventId: eventObj.id }),
      });
      alert('🎉 Registration Successful! Your QR Entry Pass is ready in the Student Portal.');
      loadEvents();
      loadStudentData();
      if (detailEvent) {
        const updated = await api(`/events/${eventObj.id}`);
        setDetailEvent(updated);
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleVerifyPaymentFromModal = async (regId, status) => {
    await api(`/committee/registrations/${regId}/verify-payment`, {
      method: 'POST',
      body: JSON.stringify({ status })
    });
    alert(`Payment ${status === 'verified' ? 'Approved & Marked Verified' : 'Marked Rejected'}.`);
    loadEvents();
    loadCommitteeData();
  };

  // Handle Bookmark Toggle
  const toggleSave = async eventId => {
    if (!user) {
      setAuthInitialRole('student');
      setAuthModalOpen(true);
      return;
    }
    const isSaved = savedIds.includes(eventId);
    try {
      if (isSaved) {
        await api(`/me/saved/${eventId}`, { method: 'DELETE' });
        setSavedIds(savedIds.filter(id => id !== eventId));
      } else {
        await api(`/me/saved/${eventId}`, { method: 'PUT' });
        setSavedIds([...savedIds, eventId]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Open Lightbox for an Event
  const openGallery = (event, initialIndex = 0) => {
    if (!event.photos || event.photos.length === 0) {
      alert('No gallery photographs currently attached to this event.');
      return;
    }
    setLightboxData({
      photos: event.photos,
      currentIndex: initialIndex,
      title: event.title,
      session: event.session,
    });
  };

  return (
    <div className="app-shell">
      {/* ==========================================
          ABES INSTITUTIONAL TOP RIBBON
          ========================================== */}
      <div className="top-institutional-ribbon">
        <div className="container ribbon-wrapper">
          <div className="ribbon-left">
            <span className="ribbon-badge">🏛️ ABES ENGINEERING COLLEGE</span>
            <span>AKTU Code: <strong>032</strong></span>
            <span className="ribbon-divider">|</span>
            <span className="ribbon-aicte">Approved by AICTE</span>
            <span className="ribbon-divider">|</span>
            <span style={{ color: '#ffd700', fontWeight: 700 }}>⭐ NAAC 'A' Grade</span>
          </div>
          <div className="ribbon-right">
            <span className="ribbon-campus-addr">📍 Campus-1, NH-09, Ghaziabad</span>
            <span>📧 datascience@abes.ac.in</span>
          </div>
        </div>
      </div>

      {/* ==========================================
          TOP NAVIGATION BAR (abes.ac.in THEME)
          ========================================== */}
      <header className="top-nav">
        <div className="container nav-wrapper">
          <div className="brand-logo" onClick={() => { setActivePortal('public'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
            <img
              src="/abes-logo.webp"
              alt="ABES Engineering College Official Logo"
              className="abes-official-header-logo"
            />
            <div className="logo-text">
              <div className="logo-title">
                ABES <span>ENGINEERING COLLEGE</span>
              </div>
              <div className="logo-subtitle">Dept of CSE (Data Science) · AKTU Code 032</div>
            </div>
          </div>

          <div className="nav-center">
            <div className="session-indicator" onClick={() => setSessionManagerOpen(true)} title="Active Academic Session">
              <span className="pulse-dot" />
              <span>Session: <strong>{selectedSession === 'all' ? 'All Archives' : selectedSession}</strong></span>
            </div>
          </div>

          <div className="nav-links desktop-only-nav">
            <button
              className={`nav-btn ${activePortal === 'public' ? 'active' : ''}`}
              onClick={() => setActivePortal('public')}
            >
              🏛️ Events & Archives
            </button>

            {user?.role === 'student' && (
              <button
                className={`nav-btn ${activePortal === 'student' ? 'active' : ''}`}
                onClick={() => setActivePortal('student')}
              >
                🎓 Student Portal
              </button>
            )}

            {user?.role === 'committee' && (
              <button
                className={`nav-btn ${activePortal === 'committee' ? 'active' : ''}`}
                onClick={() => setActivePortal('committee')}
              >
                ⚙️ Committee Portal
              </button>
            )}

            {user ? (
              <div className="user-menu-btn">
                <div className="user-avatar-pill">
                  {user.name?.charAt(0) || 'U'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                  <span style={{ fontSize: '0.8rem', lineHeight: '1.2' }}>{user.name}</span>
                  <span className={`role-tag ${user.role}`}>{user.role}</span>
                </div>
                <button className="btn-danger-outline" onClick={logout} title="Sign Out">
                  Exit
                </button>
              </div>
            ) : (
              <button
                className="btn-primary"
                onClick={() => {
                  setAuthInitialRole('student');
                  setAuthModalOpen(true);
                }}
              >
                🔐 Sign In / Microsoft
              </button>
            )}
          </div>

          {/* Mobile Navigation Hamburger Toggle */}
          <div className="mobile-nav-toggle-wrap">
            <button
              className="mobile-hamburger-btn"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle Navigation Menu"
            >
              {mobileMenuOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>
      </header>

      {/* ==========================================
          MOBILE NAVIGATION DRAWER OVERLAY
          ========================================== */}
      {mobileMenuOpen && (
        <div className="mobile-nav-drawer-overlay" onClick={() => setMobileMenuOpen(false)}>
          <div className="mobile-nav-drawer-card" onClick={e => e.stopPropagation()}>
            <div className="mobile-drawer-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <img src="/abes-logo.webp" alt="ABES Logo" style={{ height: '38px', width: 'auto', objectFit: 'contain' }} />
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-main)' }}>ABES CSE (Data Science)</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>AKTU Code: 032 · NAAC 'A'</div>
                </div>
              </div>
              <button className="btn-close-modal" onClick={() => setMobileMenuOpen(false)}>✕</button>
            </div>

            <div className="mobile-drawer-body">
              <div className="mobile-drawer-section-title">ACADEMIC PORTALS</div>
              <button
                className={`mobile-drawer-nav-item ${activePortal === 'public' ? 'active' : ''}`}
                onClick={() => { setActivePortal('public'); setMobileMenuOpen(false); }}
              >
                🏛️ Events, Workshops & Industrial Visits
              </button>

              {user?.role === 'student' && (
                <button
                  className={`mobile-drawer-nav-item ${activePortal === 'student' ? 'active' : ''}`}
                  onClick={() => {
                    setActivePortal('student');
                    setMobileMenuOpen(false);
                  }}
                >
                  🎓 Microsoft Student Portal
                </button>
              )}

              {user?.role === 'committee' && (
                <button
                  className={`mobile-drawer-nav-item ${activePortal === 'committee' ? 'active' : ''}`}
                  onClick={() => {
                    setActivePortal('committee');
                    setMobileMenuOpen(false);
                  }}
                >
                  ⚙️ Department Committee & HOD Portal
                </button>
              )}

              <div className="mobile-drawer-section-title" style={{ marginTop: '16px' }}>SESSION ARCHIVES</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                <button
                  className={`session-tab ${selectedSession === 'all' ? 'active' : ''}`}
                  onClick={() => { setSelectedSession('all'); setMobileMenuOpen(false); }}
                  style={{ fontSize: '0.78rem', padding: '6px 12px' }}
                >
                  📚 All Sessions ({allEvents.length})
                </button>
                {(sessions.length > 0 ? sessions : [{ id: '2026-27', label: '2026-27 (Current)', isCurrent: true }, { id: '2025-26', label: '2025-26' }, { id: '2024-25', label: '2024-25' }]).map(s => (
                  <button
                    key={s.id}
                    className={`session-tab ${selectedSession === s.id ? 'active current' : ''}`}
                    onClick={() => { setSelectedSession(s.id); setMobileMenuOpen(false); }}
                    style={{ fontSize: '0.78rem', padding: '6px 12px' }}
                  >
                    {s.isCurrent ? `🟢 ${s.id}` : `📁 ${s.id}`}
                  </button>
                ))}
              </div>

              <div style={{ height: '1px', background: 'var(--line)', margin: '18px 0 14px' }} />

              {user ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)' }}>
                    <div className="user-avatar-pill">{user.name?.charAt(0) || 'U'}</div>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{user.name}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{user.email}</div>
                    </div>
                  </div>
                  <button className="btn-danger-outline" onClick={() => { logout(); setMobileMenuOpen(false); }} style={{ width: '100%', padding: '10px' }}>
                    Sign Out Account
                  </button>
                </div>
              ) : (
                <button
                  className="btn-primary"
                  style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setAuthInitialRole('student');
                    setAuthModalOpen(true);
                  }}
                >
                  🔐 Sign In / Microsoft 365
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          PORTAL CONTENT SWITCHER
          ========================================== */}
      {activePortal === 'student' && user?.role === 'student' ? (
        <StudentPortalView
          user={user}
          registrations={myRegistrations}
          savedIds={savedIds}
          onViewCert={cert => setCertificateView(cert)}
          onViewDetail={ev => setDetailEvent(ev)}
          onOpenGallery={openGallery}
          onOpenPaymentUpload={reg => setPaymentProofViewerReg(reg)}
          onReload={loadStudentData}
        />
      ) : activePortal === 'committee' && user?.role === 'committee' ? (
        <CommitteePortalView
          user={user}
          stats={committeeStats}
          sessions={sessions}
          onOpenCreate={() => { setEditingEvent(null); setEventFormOpen(true); }}
          onEditEvent={ev => { setEditingEvent(ev); setEventFormOpen(true); }}
          onManageAttendees={ev => setAttendeeModalEvent(ev)}
          onManagePhotos={ev => setPhotoManagerEvent(ev)}
          onBroadcastAnnouncement={ev => setAnnouncementModalEvent(ev)}
          onViewDetail={ev => setDetailEvent(ev)}
          onOpenSecurity={() => setSecurityModalOpen(true)}
          onOpenSessionManager={() => setSessionManagerOpen(true)}
          onReload={() => { loadEvents(); loadCommitteeData(); }}
        />
      ) : (
        /* ==========================================
           PUBLIC DISCOVERY & ARCHIVE PORTAL
           ========================================== */
        <main className="container">
          {/* Hero Banner */}
          <section className="hero-section">
            <div className="hero-banner">
              <div className="hero-content">
                <div className="dept-pill">
                  🎓 CSE (DATA SCIENCE) · AKTU SYLLABUS & NAAC/NBA COMPLIANCE PORTAL
                </div>
                <h1 className="hero-title">
                  ABES EC Data Science Department <em>Academic Events, Workshops & Accreditation Gateway</em>
                </h1>
                <p className="hero-desc">
                  Official academic repository for B.Tech Computer Science & Engineering (Data Science) at ABES Engineering College Ghaziabad. Explore AKTU-aligned proceedings, expert technical talks, industrial field visits, presentation slide archives (PPTs), and verified student credentials.
                </p>

                <div className="telemetry-grid">
                  <div className="stat-item">
                    <div className="stat-val">{selectedSession === 'all' ? 'All Years' : selectedSession}<span>*</span></div>
                    <div className="stat-lbl">Active Session</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-val">032</div>
                    <div className="stat-lbl">AKTU Institute Code</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-val">{allEvents.length || events.length}<span>+</span></div>
                    <div className="stat-lbl">Department Archives</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-val">NAAC<span> A</span></div>
                    <div className="stat-lbl">Institutional Grade</div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Academic Session & Category Controls */}
          <section className="controls-bar">
            <div className="session-tabs-row">
              <div className="session-pills">
                <span className="session-archive-label">
                  SESSION ARCHIVE:
                </span>
                <button
                  className={`session-tab ${selectedSession === 'all' ? 'active' : ''}`}
                  onClick={() => setSelectedSession('all')}
                  title="View all events, talks, and industrial visits across all years"
                >
                  📚 All Sessions ({allEvents.length})
                </button>
                {(sessions.length > 0 ? sessions : [
                  { id: '2026-27', label: '2026-27 (Current)', isCurrent: true },
                  { id: '2025-26', label: '2025-26 (Past)', isCurrent: false },
                  { id: '2024-25', label: '2024-25 (Past)', isCurrent: false }
                ]).map(s => (
                  <button
                    key={s.id}
                    className={`session-tab ${selectedSession === s.id ? (s.isCurrent ? 'active current' : 'active') : ''}`}
                    onClick={() => setSelectedSession(s.id)}
                  >
                    {s.isCurrent ? `🟢 ${s.id} (Current)` : `📁 ${s.id} (Past)`}
                  </button>
                ))}
              </div>

              <div className="search-box">
                <span>🔍</span>
                <input
                  type="text"
                  placeholder="Search workshops, expert talks, industrial visits, topics..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="search-input"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 4px' }}>✕</button>
                )}
              </div>
            </div>

            {/* Category Filter Pills with Dynamic Counters */}
            <div className="categories-row">
              {[
                { 
                  id: 'all', 
                  label: 'All Activities', 
                  count: selectedSession === 'all' 
                    ? allEvents.length 
                    : allEvents.filter(e => e.session === selectedSession).length,
                  total: allEvents.length
                },
                { 
                  id: 'workshop', 
                  label: '🛠️ Hands-on Workshops', 
                  count: selectedSession === 'all' 
                    ? allEvents.filter(e => e.category === 'workshop').length 
                    : allEvents.filter(e => e.session === selectedSession && e.category === 'workshop').length,
                  total: allEvents.filter(e => e.category === 'workshop').length
                },
                { 
                  id: 'seminar', 
                  label: '💡 Expert Talks & Seminars', 
                  count: selectedSession === 'all' 
                    ? allEvents.filter(e => e.category === 'seminar').length 
                    : allEvents.filter(e => e.session === selectedSession && e.category === 'seminar').length,
                  total: allEvents.filter(e => e.category === 'seminar').length
                },
                { 
                  id: 'industry_visit', 
                  label: '🏭 Industrial Field Visits', 
                  count: selectedSession === 'all' 
                    ? allEvents.filter(e => e.category === 'industry_visit').length 
                    : allEvents.filter(e => e.session === selectedSession && e.category === 'industry_visit').length,
                  total: allEvents.filter(e => e.category === 'industry_visit').length
                },
                { 
                  id: 'event', 
                  label: '🏆 National Symposiums & Fests', 
                  count: selectedSession === 'all' 
                    ? allEvents.filter(e => e.category === 'event').length 
                    : allEvents.filter(e => e.session === selectedSession && e.category === 'event').length,
                  total: allEvents.filter(e => e.category === 'event').length
                },
                { 
                  id: 'guest_lecture', 
                  label: '👨‍🏫 Guest Lectures', 
                  count: selectedSession === 'all' 
                    ? allEvents.filter(e => e.category === 'guest_lecture').length 
                    : allEvents.filter(e => e.session === selectedSession && e.category === 'guest_lecture').length,
                  total: allEvents.filter(e => e.category === 'guest_lecture').length
                }
              ].map(cat => (
                <button
                  key={cat.id}
                  className={`category-pill ${selectedCategory === cat.id ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(cat.id)}
                >
                  <span>{cat.label}</span>
                  <span className="category-count-badge">
                    {selectedSession === 'all' ? cat.total : `${cat.count} / ${cat.total}`}
                  </span>
                </button>
              ))}
            </div>

            {/* Cross-Session Helper Notice for Instant Discovery */}
            {selectedCategory !== 'all' && selectedSession !== 'all' && (
              <div className="filter-cross-session-notice">
                <span>
                  📌 Showing <strong>{events.length}</strong> activity in Session <strong>{selectedSession}</strong>. (Total across all years: <strong>{allEvents.filter(e => e.category === selectedCategory).length}</strong>)
                </span>
                <button
                  className="btn-link-notice"
                  onClick={() => setSelectedSession('all')}
                >
                  View All Across All Academic Sessions →
                </button>
              </div>
            )}
          </section>

          {/* Event Cards Grid */}
          <section className="events-grid">
            {events.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '60px 20px', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--line)' }}>
                <p style={{ color: 'var(--text-main)', fontSize: '1.1rem', fontWeight: 700, marginBottom: '8px' }}>
                  No activities found in session '{selectedSession}' for category '{selectedCategory}'.
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: '20px' }}>
                  There are {allEvents.length} activities archived across all academic sessions.
                </p>
                <button
                  className="btn-primary"
                  onClick={() => { setSelectedSession('all'); setSelectedCategory('all'); setSearchQuery(''); }}
                >
                  📚 Show All Events & Archives ({allEvents.length})
                </button>
              </div>
            ) : (
              events.map(event => (
                <EventCard
                  key={event.id}
                  event={event}
                  isSaved={savedIds.includes(event.id)}
                  isRegistered={myRegistrations.some(r => r.eventId === event.id)}
                  onViewDetails={() => setDetailEvent(event)}
                  onOpenGallery={() => openGallery(event, 0)}
                  onRegister={() => handleRegister(event)}
                  onToggleSave={() => toggleSave(event.id)}
                />
              ))
            )}
          </section>

          {/* Department Faculty & Event Committee Board */}
          <section style={{ margin: '48px 0 60px', padding: '36px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--line)' }}>
            <div style={{ textAlign: 'center', maxWidth: '640px', margin: '0 auto 28px' }}>
              <span className="role-tag committee">ACADEMIC LEADERSHIP</span>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.6rem', fontWeight: 800, marginTop: '8px' }}>
                Department Event Committee & Conveners
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                Governing workshops, industrial field visits, expert seminars, and AKTU curriculum enrichment.
              </p>
            </div>

            <div className="faculty-grid">
              <div className="faculty-card">
                <img
                  src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80"
                  alt="Prof. (Dr.) Sanjay Singh"
                  className="faculty-avatar"
                />
                <h3 className="faculty-name">Prof. (Dr.) Sanjay Singh</h3>
                <div className="faculty-role">Head of Department (DS & AI)</div>
                <div className="faculty-email">hod.ds@abes.ac.in</div>
              </div>

              <div className="faculty-card">
                <img
                  src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80"
                  alt="Dr. Meenakshi Sharma"
                  className="faculty-avatar"
                />
                <h3 className="faculty-name">Dr. Meenakshi Sharma</h3>
                <div className="faculty-role">Associate Professor & Event Convener</div>
                <div className="faculty-email">committee.ds@abes.ac.in</div>
              </div>

              <div className="faculty-card">
                <img
                  src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80"
                  alt="Dr. Rohit Verma"
                  className="faculty-avatar"
                />
                <h3 className="faculty-name">Dr. Rohit Verma</h3>
                <div className="faculty-role">Industry Visit & Placement Coordinator</div>
                <div className="faculty-email">rohit.verma@abes.ac.in</div>
              </div>

              <div className="faculty-card">
                <img
                  src="https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=400&q=80"
                  alt="Dr. Priyanka Garg"
                  className="faculty-avatar"
                />
                <h3 className="faculty-name">Dr. Priyanka Garg</h3>
                <div className="faculty-role">Assistant Professor & Research Lead</div>
                <div className="faculty-email">priyanka.garg@abes.ac.in</div>
              </div>
            </div>
          </section>
        </main>
      )}

      {/* ==========================================
          OFFICIAL ABES ENGINEERING COLLEGE FOOTER
          ========================================== */}
      <footer className="abes-footer">
        <div className="container">
          <div className="abes-footer-grid">
            <div>
              <div className="abes-footer-brand-title" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <img src="/abes-logo.webp" alt="ABES Logo" style={{ height: '42px', width: 'auto', objectFit: 'contain' }} />
                <div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>ABES <span style={{ color: '#992728' }}>ENGINEERING COLLEGE</span></div>
                  <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>DEPARTMENT OF CSE (DATA SCIENCE)</div>
                </div>
              </div>
              <p className="abes-footer-desc">
                Approved by AICTE, New Delhi & Affiliated to Dr. A.P.J. Abdul Kalam Technical University (AKTU), Lucknow (College Code: 032). NAAC Accredited Institution.
              </p>
              <div className="abes-accreditation-badges">
                <span className="abes-accreditation-pill">AKTU Code: 032</span>
                <span className="abes-accreditation-pill">AICTE Approved</span>
                <span className="abes-accreditation-pill">NAAC 'A' Grade</span>
                <span className="abes-accreditation-pill">NBA Aligned</span>
              </div>
            </div>

            <div>
              <h4 className="abes-footer-col-title">Academic Portals</h4>
              <ul className="abes-footer-links">
                <li className="abes-footer-link" onClick={() => { setActivePortal('public'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>🏛️ Event Archives</li>
                <li className="abes-footer-link" onClick={() => { setAuthInitialRole('student'); setAuthModalOpen(true); }}>🎓 Microsoft Student Login</li>
                <li className="abes-footer-link" onClick={() => { setAuthInitialRole('committee'); setAuthModalOpen(true); }}>⚙️ Faculty Convener Portal</li>
                <li className="abes-footer-link" onClick={() => { setSelectedCategory('workshop'); window.scrollTo({ top: 450, behavior: 'smooth' }); }}>📚 Lecture Presentations (PPT)</li>
              </ul>
            </div>

            <div>
              <h4 className="abes-footer-col-title">Department Focus</h4>
              <ul className="abes-footer-links">
                <li className="abes-footer-link">🤖 Machine Learning & AI</li>
                <li className="abes-footer-link">📊 Big Data & Analytics</li>
                <li className="abes-footer-link">☁️ Cloud & Edge Computing</li>
                <li className="abes-footer-link">🔗 AKTU Curriculum Labs</li>
              </ul>
            </div>

            <div>
              <h4 className="abes-footer-col-title">Campus Contact</h4>
              <p style={{ fontSize: '0.82rem', color: '#cbd5e1', lineHeight: '1.6', marginBottom: '8px' }}>
                <strong>Campus - 1</strong><br />
                19th KM Stone, NH-09 (NH-24),<br />
                Ghaziabad, UP - 201009
              </p>
              <p style={{ fontSize: '0.78rem', color: '#ffd700' }}>
                📧 datascience@abes.ac.in<br />
                🌐 www.abes.ac.in
              </p>
            </div>
          </div>

          <div className="abes-footer-bottom">
            <div>
              © {new Date().getFullYear()} Department of Computer Science & Engineering (Data Science), ABES Engineering College, Ghaziabad. All rights reserved.
            </div>
            <div>
              Designed for Institutional Accreditation, NBA Criteria 4 & 5 Compliance, and NAAC Documentation.
            </div>
          </div>
        </div>
      </footer>

      {/* ==========================================
          MOBILE BOTTOM NAVIGATION BAR
          ========================================== */}
      <nav className="mobile-bottom-nav">
        <button
          type="button"
          className={`mobile-nav-item ${activePortal === 'public' ? 'active' : ''}`}
          onClick={() => setActivePortal('public')}
        >
          <span>🌐</span>
          Events
        </button>

        {user?.role === 'student' && (
          <button
            type="button"
            className={`mobile-nav-item ${activePortal === 'student' ? 'active' : ''}`}
            onClick={() => setActivePortal('student')}
          >
            <span>🎓</span>
            Student
          </button>
        )}

        {user?.role === 'committee' && (
          <button
            type="button"
            className={`mobile-nav-item ${activePortal === 'committee' ? 'active' : ''}`}
            onClick={() => setActivePortal('committee')}
          >
            <span>⚙️</span>
            Committee
          </button>
        )}

        <button
          type="button"
          className="mobile-nav-item"
          onClick={() => {
            if (user) {
              if (confirm(`Logged in as ${user.name}. Sign out?`)) logout();
            } else {
              setAuthModalOpen(true);
            }
          }}
        >
          <span>{user ? '👤' : '🔐'}</span>
          {user ? 'Exit' : 'Sign In'}
        </button>
      </nav>

      {/* ==========================================
          MODALS & OVERLAYS
          ========================================== */}
      
      {/* 1. Fullscreen Photo Lightbox Modal */}
      {lightboxData && (
        <LightboxModal
          data={lightboxData}
          onClose={() => setLightboxData(null)}
          onSelectIndex={idx => setLightboxData({ ...lightboxData, currentIndex: idx })}
        />
      )}

      {/* 2. Detailed Event & PPT Modal */}
      {detailEvent && (
        <EventDetailModal
          event={detailEvent}
          isRegistered={myRegistrations.some(r => r.eventId === detailEvent.id)}
          isSaved={savedIds.includes(detailEvent.id)}
          onClose={() => setDetailEvent(null)}
          onRegister={() => handleRegister(detailEvent)}
          onToggleSave={() => toggleSave(detailEvent.id)}
          onOpenGallery={openGallery}
        />
      )}

      {/* 3. Verified Certificate Viewer Modal */}
      {certificateView && (
        <CertificateModal
          certificate={certificateView}
          onClose={() => setCertificateView(null)}
        />
      )}

      {/* 4. Microsoft College Authentication Modal */}
      {authModalOpen && (
        <AuthModal
          initialRole={authInitialRole}
          onClose={() => setAuthModalOpen(false)}
        />
      )}

      {/* 5. Committee: Attendee & Check-In Modal */}
      {attendeeModalEvent && (
        <AttendeeManagementModal
          event={attendeeModalEvent}
          onClose={() => setAttendeeModalEvent(null)}
          onViewPaymentProof={reg => setPaymentProofViewerReg(reg)}
          onReload={() => { loadEvents(); loadCommitteeData(); }}
        />
      )}

      {/* 6. Committee: Photo Manager Modal */}
      {photoManagerEvent && (
        <PhotoManagerModal
          event={photoManagerEvent}
          onClose={() => setPhotoManagerEvent(null)}
          onReload={() => { loadEvents(); loadCommitteeData(); }}
        />
      )}

      {/* 7. Committee: Create / Edit Event Modal */}
      {eventFormOpen && (
        <EventFormModal
          editingEvent={editingEvent}
          sessions={sessions}
          onClose={() => { setEventFormOpen(false); setEditingEvent(null); }}
          onSaved={() => { loadEvents(); loadCommitteeData(); setEventFormOpen(false); setEditingEvent(null); }}
        />
      )}

      {/* 8. Committee: Broadcast Announcement Modal */}
      {announcementModalEvent && (
        <AnnouncementModal
          event={announcementModalEvent}
          onClose={() => setAnnouncementModalEvent(null)}
          onReload={() => { loadEvents(); loadCommitteeData(); }}
        />
      )}

      {/* 9. Committee: Security & Credentials Modal */}
      {securityModalOpen && user?.role === 'committee' && (
        <CommitteeSecurityModal
          user={user}
          onClose={() => setSecurityModalOpen(false)}
          onUpdated={updatedUser => {
            loadCommitteeData();
            window.location.reload();
          }}
        />
      )}

      {/* 10. Student Payment Registration & Screenshot Upload Modal */}
      {paymentModalEvent && (
        <PaymentRegistrationModal
          event={paymentModalEvent}
          onClose={() => setPaymentModalEvent(null)}
          onSuccess={res => {
            loadEvents();
            loadStudentData();
            setActivePortal('student');
          }}
        />
      )}

      {/* 11. Payment Proof Viewer Modal */}
      {paymentProofViewerReg && (
        <PaymentProofViewerModal
          registration={paymentProofViewerReg}
          isCommittee={user?.role === 'committee'}
          onClose={() => setPaymentProofViewerReg(null)}
          onVerify={handleVerifyPaymentFromModal}
        />
      )}

      {/* 12. Academic Session Management Modal */}
      {sessionManagerOpen && (
        <AcademicSessionManagerModal
          sessions={sessions}
          onClose={() => setSessionManagerOpen(false)}
          onReloadSessions={loadSessions}
          onReloadAll={() => { loadEvents(); if (user?.role === 'committee') loadCommitteeData(); }}
        />
      )}
    </div>
  );
}

// ==========================================
// EVENT CARD COMPONENT
// ==========================================
function EventCard({ event, isSaved, isRegistered, onViewDetails, onOpenGallery, onRegister, onToggleSave }) {
  const photoCount = (event.photos || []).length;
  const isPast = event.status === 'completed' || event.status === 'archived';

  return (
    <div className="event-card">
      <div className="event-card-media">
        <img src={event.coverPhoto} alt={event.title} loading="lazy" />
        
        <div className="media-badges">
          <span className={`session-badge ${event.session === '2026-27' ? 'current' : ''}`}>
            {event.session}
          </span>
          <span className={`category-tag ${event.category}`}>
            {event.categoryLabel || event.category}
          </span>
          {event.isPaid && (
            <span className="category-tag workshop" style={{ background: 'rgba(255, 170, 0, 0.2)', color: 'var(--amber)', borderColor: 'rgba(255, 170, 0, 0.5)', fontWeight: 700 }}>
              💰 ₹{event.fee || 250}
            </span>
          )}
        </div>

        <div className="media-bottom-info">
          {photoCount > 0 ? (
            <button
              className="photo-count-pill"
              onClick={e => { e.stopPropagation(); onOpenGallery(); }}
              title="Click to open Photo Gallery Lightbox"
            >
              📸 {photoCount} Photos
            </button>
          ) : <div />}

          {event.pptSlides?.url && (
            <span className="ppt-indicator-pill" title="Presentation Slides Available">
              📑 PPT Slides
            </span>
          )}
        </div>
      </div>

      <div className="event-card-body">
        <div className="academic-sub-tag">
          {event.academicSubject || 'KDS-Core Curriculum'}
        </div>
        <h3 className="event-card-title">{event.title}</h3>
        <p className="event-card-tagline">{event.tagline}</p>

        <div className="event-meta-list">
          <div className="event-meta-item">
            <span>📅</span>
            <span>{event.date} · {event.time}</span>
          </div>
          <div className="event-meta-item">
            <span>📍</span>
            <span>{event.venue}</span>
          </div>
        </div>

        {event.speaker && (
          <div className="event-speaker-pill">
            <img src={event.speaker.avatar} alt={event.speaker.name} className="speaker-thumb" />
            <div className="speaker-info-col">
              <span className="speaker-name">{event.speaker.name}</span>
              <span className="speaker-org">{event.speaker.role} · {event.speaker.organization}</span>
            </div>
          </div>
        )}

        <div className="event-card-actions">
          <button className="btn-card-primary" onClick={onViewDetails}>
            View Details & PPTs
          </button>
          
          {!isPast && (
            <button
              className="btn-card-secondary"
              onClick={onRegister}
              style={isRegistered ? { background: 'var(--emerald-dim)', color: 'var(--emerald)', borderColor: 'var(--emerald-border)' } : {}}
            >
              {isRegistered ? '✓ Pass Issued' : 'Register'}
            </button>
          )}

          <button
            className="btn-card-secondary"
            onClick={onToggleSave}
            title={isSaved ? 'Remove from Saved' : 'Save Session'}
          >
            {isSaved ? '★' : '☆'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// PHOTO LIGHTBOX MODAL
// ==========================================
function LightboxModal({ data, onClose, onSelectIndex }) {
  const { photos, currentIndex, title, session } = data;
  const currentPhoto = photos[currentIndex] || photos[0];

  const handlePrev = () => {
    onSelectIndex((currentIndex - 1 + photos.length) % photos.length);
  };

  const handleNext = () => {
    onSelectIndex((currentIndex + 1) % photos.length);
  };

  useEffect(() => {
    const handleKeyDown = e => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, photos]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="lightbox-content" onClick={e => e.stopPropagation()}>
        <div className="lightbox-header">
          <div className="lightbox-title-box">
            <h3 className="lightbox-title">📸 {title}</h3>
            <span className="lightbox-subtitle">
              Session {session} · Photo {currentIndex + 1} of {photos.length}
            </span>
          </div>
          <button className="btn-close-modal" onClick={onClose}>✕</button>
        </div>

        <div className="lightbox-main-view">
          <img src={currentPhoto.url} alt={currentPhoto.caption} className="lightbox-main-img" />
          
          {photos.length > 1 && (
            <>
              <button className="lightbox-nav-btn prev" onClick={handlePrev}>‹</button>
              <button className="lightbox-nav-btn next" onClick={handleNext}>›</button>
            </>
          )}
        </div>

        <div className="lightbox-meta-bar">
          <div className="photo-caption">{currentPhoto.caption}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <span className="photo-credit-tag">📷 {currentPhoto.photographer}</span>
            <a
              href={currentPhoto.url}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary"
              style={{ fontSize: '0.75rem', padding: '4px 10px' }}
            >
              📥 Full Res
            </a>
          </div>
        </div>

        {photos.length > 1 && (
          <div className="lightbox-thumb-strip">
            {photos.map((p, idx) => (
              <div
                key={p.id || idx}
                className={`thumb-item ${idx === currentIndex ? 'active' : ''}`}
                onClick={() => onSelectIndex(idx)}
              >
                <img src={p.url} alt={p.caption} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// EVENT DETAIL & PPT DOWNLOAD MODAL
// ==========================================
function EventDetailModal({ event, isRegistered, isSaved, onClose, onRegister, onToggleSave, onOpenGallery }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="event-detail-modal" onClick={e => e.stopPropagation()}>
        <div style={{ position: 'relative' }}>
          <img src={event.coverPhoto} alt={event.title} className="detail-banner-img" />
          <button
            className="btn-close-modal"
            onClick={onClose}
            style={{ position: 'absolute', top: '16px', right: '16px', zIndex: 10 }}
          >
            ✕
          </button>
        </div>

        <div className="detail-body">
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <span className="session-badge current">{event.session}</span>
            <span className={`category-tag ${event.category}`}>{event.categoryLabel || event.category}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', padding: '4px 10px', borderRadius: '99px', background: 'var(--bg-surface)', border: '1px solid var(--line)' }}>
              Subject: {event.academicSubject}
            </span>
          </div>

          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.65rem', fontWeight: 800, marginBottom: '8px' }}>
            {event.title}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '20px' }}>
            {event.tagline}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', background: 'var(--bg-card)', padding: '16px', borderRadius: 'var(--radius-md)', marginBottom: '24px' }}>
            <div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-dim)' }}>DATE & TIME</span>
              <p style={{ fontWeight: 600, fontSize: '0.85rem' }}>{event.date} · {event.time}</p>
            </div>
            <div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-dim)' }}>VENUE</span>
              <p style={{ fontWeight: 600, fontSize: '0.85rem' }}>{event.venue}</p>
            </div>
            <div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-dim)' }}>FACULTY CONVENER</span>
              <p style={{ fontWeight: 600, fontSize: '0.85rem' }}>{event.coordinator}</p>
            </div>
            <div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-dim)' }}>TARGET AUDIENCE</span>
              <p style={{ fontWeight: 600, fontSize: '0.85rem' }}>{event.targetAudience}</p>
            </div>
          </div>

          {/* Presentation Slides & PPTs Section */}
          {event.pptSlides && (
            <div>
              <h3 className="detail-section-title">📊 Presentation Slides & Academic Lecture Deck</h3>
              <div className="ppt-download-card">
                <div className="ppt-info-left">
                  <div className="ppt-icon-box">📑</div>
                  <div>
                    <div className="ppt-title-text">{event.pptSlides.title}</div>
                    <div className="ppt-meta-text">{event.pptSlides.fileSize} · Accredited for DS Department Curriculum</div>
                  </div>
                </div>
                <a
                  href={event.pptSlides.url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-primary"
                  style={{ fontSize: '0.8rem', padding: '8px 16px' }}
                >
                  📥 Download PPT / Slides
                </a>
              </div>
            </div>
          )}

          {/* Academic Objectives & Learning Outcomes */}
          <div className="academic-box">
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1rem', color: 'var(--cyan)', marginBottom: '8px' }}>
              🎯 Academic Objectives & Syllabus Competencies
            </h3>
            <ul className="bullet-list">
              {(event.academicObjectives || []).map((obj, i) => (
                <li key={i}>{obj}</li>
              ))}
            </ul>

            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1rem', color: 'var(--emerald)', margin: '18px 0 8px' }}>
              ✨ Key Takeaways & Deliverables
            </h3>
            <ul className="bullet-list">
              {(event.keyTakeaways || []).map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </div>

          {/* Speaker Profile */}
          {event.speaker && (
            <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: 'var(--radius-md)', marginBottom: '24px', display: 'flex', gap: '16px', alignItems: 'center' }}>
              <img src={event.speaker.avatar} alt={event.speaker.name} style={{ width: '60px', height: '60px', borderRadius: '50%', objectFit: 'cover' }} />
              <div>
                <h4 style={{ fontWeight: 700, fontSize: '1rem' }}>{event.speaker.name}</h4>
                <p style={{ color: 'var(--cyan)', fontSize: '0.82rem', fontFamily: 'var(--font-mono)' }}>
                  {event.speaker.role} · {event.speaker.organization}
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '4px' }}>
                  {event.speaker.bio}
                </p>
              </div>
            </div>
          )}

          {/* Multi-Photo Gallery Preview Grid */}
          {event.photos && event.photos.length > 0 && (
            <div style={{ marginBottom: '28px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 className="detail-section-title" style={{ margin: 0 }}>
                  📸 Event Photographic Archive ({event.photos.length} Photos)
                </h3>
                <button
                  className="btn-secondary"
                  onClick={() => onOpenGallery(event, 0)}
                  style={{ fontSize: '0.78rem', padding: '6px 14px' }}
                >
                  View Fullscreen Slideshow
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
                {event.photos.map((p, idx) => (
                  <div
                    key={p.id || idx}
                    onClick={() => onOpenGallery(event, idx)}
                    style={{ height: '90px', borderRadius: 'var(--radius-sm)', overflow: 'hidden', cursor: 'pointer', border: '1px solid var(--line)' }}
                  >
                    <img src={p.url} alt={p.caption} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Schedule */}
          {event.schedule && event.schedule.length > 0 && (
            <div style={{ marginBottom: '28px' }}>
              <h3 className="detail-section-title">⏱️ Session Timeline & Agenda</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {event.schedule.map((item, i) => (
                  <div key={i} style={{ display: 'flex', gap: '14px', padding: '10px 14px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', fontSize: '0.84rem' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--cyan)', fontWeight: 600, minWidth: '85px' }}>{item.time}</span>
                    <span style={{ fontWeight: 600 }}>{item.title}</span>
                    <span style={{ marginLeft: 'auto', color: 'var(--text-dim)' }}>📍 {item.location}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bottom Action Footer */}
          <div style={{ display: 'flex', gap: '12px', borderTop: '1px solid var(--line)', paddingTop: '20px' }}>
            <button
              className="btn-primary"
              onClick={onRegister}
              disabled={event.status === 'completed' || isRegistered}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              {isRegistered ? '✓ Entry Pass Active in Student Portal' : event.status === 'completed' ? 'Session Concluded (Archived)' : 'Register for Session'}
            </button>
            <button className="btn-secondary" onClick={onToggleSave}>
              {isSaved ? '★ Bookmarked' : '☆ Bookmark'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// STUDENT PORTAL VIEW
// ==========================================
function StudentPortalView({ user, registrations, savedIds, onViewCert, onViewDetail, onOpenGallery, onOpenPaymentUpload, onReload }) {
  const [subTab, setSubTab] = useState('passes'); // 'passes' | 'attended' | 'ppts' | 'saved'
  const [sessionFilter, setSessionFilter] = useState('all');
  const [pptSessionFilter, setPptSessionFilter] = useState('all');
  const [allEventsList, setAllEventsList] = useState([]);

  useEffect(() => {
    api('/events?session=all')
      .then(setAllEventsList)
      .catch(console.error);
  }, []);

  const attendedRegs = registrations.filter(r => r.checkedIn || r.certificateIssued);
  const activePasses = registrations.filter(r => !r.checkedIn && r.event?.status !== 'completed');

  const filteredAttended = sessionFilter === 'all'
    ? attendedRegs
    : attendedRegs.filter(r => r.event?.session === sessionFilter);

  const filteredPptEvents = pptSessionFilter === 'all'
    ? allEventsList.filter(e => e.pptSlides?.url)
    : allEventsList.filter(e => e.session === pptSessionFilter && e.pptSlides?.url);

  return (
    <main className="container portal-container">
      <div className="portal-header-card">
        <div className="portal-user-info">
          <div className="portal-avatar-large">
            {user.name?.charAt(0) || 'S'}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.45rem', fontWeight: 800 }}>
                {user.name}
              </h1>
              <span className="role-tag student">Microsoft @abes.ac.in</span>
            </div>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Roll No: <strong>{user.rollNo}</strong> · {user.branch} · {user.year} ({user.section || 'DS-A'})
            </p>
            <p style={{ fontSize: '0.76rem', color: 'var(--cyan)', marginTop: '2px' }}>
              Official College ID: {user.email}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ background: 'var(--bg-surface)', padding: '10px 18px', borderRadius: 'var(--radius-md)', border: '1px solid var(--line)', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', fontWeight: 800, color: 'var(--cyan)' }}>
              {activePasses.length}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>ACTIVE PASSES</div>
          </div>
          <div style={{ background: 'var(--bg-surface)', padding: '10px 18px', borderRadius: 'var(--radius-md)', border: '1px solid var(--line)', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', fontWeight: 800, color: 'var(--emerald)' }}>
              {registrations.filter(r => r.certificateIssued).length}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>CERTIFICATES</div>
          </div>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="portal-tabs-nav">
        <button className={`portal-tab-btn ${subTab === 'passes' ? 'active' : ''}`} onClick={() => setSubTab('passes')}>
          🎟️ Active QR Entry Passes ({activePasses.length})
        </button>
        <button className={`portal-tab-btn ${subTab === 'attended' ? 'active' : ''}`} onClick={() => setSubTab('attended')}>
          📜 Attended & Verified Certificates ({attendedRegs.length})
        </button>
        <button className={`portal-tab-btn ${subTab === 'ppts' ? 'active' : ''}`} onClick={() => setSubTab('ppts')}>
          📑 Academic PPTs & Notes Library ({filteredPptEvents.length})
        </button>
        <button className={`portal-tab-btn ${subTab === 'saved' ? 'active' : ''}`} onClick={() => setSubTab('saved')}>
          ⭐ Saved Bookmarks ({savedIds.length})
        </button>
      </div>

      {/* TAB 1: ACTIVE QR ENTRY PASSES */}
      {subTab === 'passes' && (
        <div>
          {activePasses.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)' }}>
              <p style={{ color: 'var(--text-muted)', marginBottom: '12px' }}>You have no upcoming event registrations.</p>
              <button className="btn-primary" onClick={() => window.location.reload()}>Browse Upcoming Sessions</button>
            </div>
          ) : (
            activePasses.map(reg => (
              <div key={reg.id} className="ticket-card">
                <QRCodeCanvas text={reg.ticketCode} size={110} downloadName={`Pass_${reg.rollNo}`} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span className="session-badge current">{reg.event?.session}</span>
                    <span className="category-tag workshop">{reg.event?.categoryLabel || 'Workshop'}</span>
                    
                    {reg.isPaid ? (
                      <span className={`payment-badge paid-${reg.paymentStatus || 'pending'}`}>
                        {reg.paymentStatus === 'verified' ? `✓ Paid ₹${reg.fee || 250} (Verified)` : reg.paymentStatus === 'rejected' ? '❌ Payment Rejected' : reg.paymentScreenshot ? '⏳ Verification Pending' : '⚠️ Payment Required'}
                      </span>
                    ) : (
                      <span className="payment-badge paid-free">Free Entry Pass</span>
                    )}
                  </div>

                  <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', fontWeight: 800, marginBottom: '6px' }}>
                    {reg.event?.title}
                  </h3>
                  <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
                    📅 {reg.event?.date} · {reg.event?.time} · 📍 {reg.event?.venue}
                  </p>
                  <div style={{ display: 'flex', gap: '16px', fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: 'var(--cyan)', flexWrap: 'wrap' }}>
                    <span>Pass ID: <strong>{reg.ticketCode}</strong></span>
                    <span>Student: <strong>{reg.name} ({reg.rollNo})</strong></span>
                    {reg.utrNumber && <span>UTR: <strong>{reg.utrNumber}</strong></span>}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button className="btn-secondary" onClick={() => onViewDetail(reg.event)}>
                    View Schedule
                  </button>
                  {reg.isPaid && (
                    <button
                      className="btn-card-primary"
                      onClick={() => onOpenPaymentUpload(reg)}
                      style={{ padding: '6px 12px', fontSize: '0.76rem', textAlign: 'center' }}
                    >
                      {reg.paymentScreenshot ? '🧾 View / Update Receipt' : '💳 Upload Payment Receipt'}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 2: ATTENDED & VERIFIED CERTIFICATES */}
      {subTab === 'attended' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '18px', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--text-muted)' }}>FILTER SESSION:</span>
            {['all', '2026-27', '2025-26', '2024-25'].map(sess => (
              <button
                key={sess}
                className={`session-tab ${sessionFilter === sess ? 'active current' : ''}`}
                onClick={() => setSessionFilter(sess)}
                style={{ padding: '4px 12px', fontSize: '0.76rem' }}
              >
                {sess === 'all' ? 'All Sessions' : `Session ${sess}`}
              </button>
            ))}
          </div>

          {filteredAttended.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)' }}>
              <p style={{ color: 'var(--text-muted)' }}>No attended sessions on record for this session filter.</p>
            </div>
          ) : (
            filteredAttended.map(reg => (
              <div key={reg.id} className="ticket-card" style={{ borderColor: reg.certificateIssued ? '#d97706' : 'var(--line)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                    <span className="session-badge">{reg.event?.session}</span>
                    <span className="category-tag seminar">{reg.event?.categoryLabel || 'Attended'}</span>
                    {reg.certificateIssued && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: '#b45309', padding: '2px 8px', border: '1px solid #d97706', borderRadius: '99px', background: '#fef3c7' }}>
                        ✓ Verified Certificate Issued
                      </span>
                    )}
                  </div>
                  <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', fontWeight: 800, marginBottom: '6px' }}>
                    {reg.event?.title}
                  </h3>
                  <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                    Conducted on {reg.event?.date} · Convener: {reg.event?.coordinator}
                  </p>
                  {reg.certificateId && (
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: '#b45309' }}>
                      Certificate ID: <strong>{reg.certificateId}</strong>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {reg.certificateIssued && (
                    <button
                      className="btn-primary"
                      onClick={() => onViewCert({ ...reg, user })}
                      style={{ background: 'linear-gradient(135deg, #d97706, #b45309)', color: '#ffffff' }}
                    >
                      🏆 View Certificate
                    </button>
                  )}
                  {reg.event?.pptSlides?.url && (
                    <a
                      href={reg.event.pptSlides.url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-secondary"
                      style={{ fontSize: '0.78rem', textAlign: 'center' }}
                    >
                      📑 Download PPT
                    </a>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 3: ACADEMIC PPTS & STUDY NOTES LIBRARY */}
      {subTab === 'ppts' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '18px', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--text-muted)' }}>SESSION REPOSITORY:</span>
            {['all', '2026-27', '2025-26', '2024-25'].map(sess => (
              <button
                key={sess}
                className={`session-tab ${pptSessionFilter === sess ? 'active current' : ''}`}
                onClick={() => setPptSessionFilter(sess)}
                style={{ padding: '4px 12px', fontSize: '0.76rem' }}
              >
                {sess === 'all' ? 'All Sessions' : `Session ${sess}`}
              </button>
            ))}
          </div>

          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Workshop / Seminar Title</th>
                  <th>Academic Subject</th>
                  <th>Presentation Deck</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPptEvents.map(e => (
                  <tr key={e.id}>
                    <td><span className={`session-badge ${e.session === '2026-27' ? 'current' : ''}`}>{e.session}</span></td>
                    <td><strong>{e.title}</strong></td>
                    <td>{e.academicSubject || 'Core DS'}</td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--amber)' }}>
                        📑 {e.pptSlides.title}
                      </span>
                    </td>
                    <td>
                      <a
                        href={e.pptSlides.url}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-card-primary"
                        style={{ padding: '6px 12px', display: 'inline-block' }}
                      >
                        📥 Download Slides
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: SAVED BOOKMARKS */}
      {subTab === 'saved' && (
        <div className="events-grid">
          {allEventsList.filter(e => savedIds.includes(e.id)).map(event => (
            <EventCard
              key={event.id}
              event={event}
              isSaved={true}
              isRegistered={registrations.some(r => r.eventId === event.id)}
              onViewDetails={() => onViewDetail(event)}
              onOpenGallery={() => onOpenGallery(event, 0)}
              onRegister={() => {}}
              onToggleSave={() => {}}
            />
          ))}
        </div>
      )}
    </main>
  );
}

// ==========================================
// DEPARTMENT COMMITTEE PORTAL VIEW
// ==========================================
function CommitteePortalView({ user, stats, sessions, onOpenCreate, onEditEvent, onManageAttendees, onManagePhotos, onBroadcastAnnouncement, onViewDetail, onOpenSecurity, onOpenSessionManager, onReload }) {
  const [selectedSessionFilter, setSelectedSessionFilter] = useState('all');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all');
  const [committeeSearch, setCommitteeSearch] = useState('');
  const [committeeEvents, setCommitteeEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [scannerMode, setScannerMode] = useState('camera'); // 'camera' | 'manual'
  const [ticketInput, setTicketInput] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [scanError, setScanError] = useState('');

  const loadCommitteeEvents = async () => {
    setLoadingEvents(true);
    try {
      const params = new URLSearchParams();
      if (selectedSessionFilter && selectedSessionFilter !== 'all') {
        params.set('session', selectedSessionFilter);
      }
      if (selectedCategoryFilter && selectedCategoryFilter !== 'all') {
        params.set('category', selectedCategoryFilter);
      }
      if (committeeSearch.trim()) {
        params.set('search', committeeSearch.trim());
      }
      const data = await api('/events?' + params.toString());
      setCommitteeEvents(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingEvents(false);
    }
  };

  useEffect(() => {
    loadCommitteeEvents();
  }, [selectedSessionFilter, selectedCategoryFilter, committeeSearch]);

  const handleExport = (format = 'csv') => {
    window.open(`/api/committee/export/${selectedSessionFilter}?format=${format}`, '_blank');
  };

  const handleCameraScannedCode = async decodedText => {
    if (!decodedText || !decodedText.trim()) return;
    const cleanCode = decodedText.trim();
    if (scanResult && scanResult.registration?.ticketCode === cleanCode) return; // avoid duplicate instant hits
    setScanError('');
    setScanResult(null);
    try {
      const res = await api('/committee/scan-qr', {
        method: 'POST',
        body: JSON.stringify({ ticketCode: cleanCode }),
      });
      setScanResult(res);
      loadCommitteeEvents();
      onReload();
    } catch (err) {
      setScanError(err.message);
    }
  };

  const handleFastScan = async e => {
    e.preventDefault();
    if (!ticketInput.trim()) return;
    setScanError('');
    setScanResult(null);
    try {
      const res = await api('/committee/scan-qr', {
        method: 'POST',
        body: JSON.stringify({ ticketCode: ticketInput.trim() }),
      });
      setScanResult(res);
      setTicketInput('');
      loadCommitteeEvents();
      onReload();
    } catch (err) {
      setScanError(err.message);
    }
  };

  const handleDelete = async (eventId, title) => {
    if (!confirm(`Are you sure you want to delete "${title}" and all its records?`)) return;
    try {
      await api(`/events/${eventId}`, { method: 'DELETE' });
      alert('Event deleted successfully.');
      loadCommitteeEvents();
      onReload();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <main className="container portal-container">
      {/* Committee Executive Header */}
      <div className="portal-header-card">
        <div className="portal-user-info">
          <div className="portal-avatar-large" style={{ background: 'linear-gradient(135deg, var(--emerald), var(--cyan))' }}>
            {user.name?.charAt(0) || 'C'}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.45rem', fontWeight: 800 }}>
                {user.name}
              </h1>
              <span className="role-tag committee">Department Committee</span>
            </div>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {user.designation || 'Head / Faculty Event Convener'} · {user.department}
            </p>
            <p style={{ fontSize: '0.76rem', color: 'var(--emerald)', marginTop: '2px' }}>
              Authorized Faculty Credentials: {user.email}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button className="btn-primary" onClick={onOpenCreate}>
            + Create New Event / Workshop
          </button>
          <button className="btn-secondary" onClick={onOpenSessionManager}>
            📅 Manage Academic Sessions
          </button>
          <button className="btn-secondary" onClick={onOpenSecurity}>
            🔑 Security & Password
          </button>
          <button className="btn-secondary" onClick={() => handleExport('csv')}>
            📥 Export {selectedSessionFilter === 'all' ? 'All Sessions' : `Session ${selectedSessionFilter}`} Report (CSV)
          </button>
        </div>
      </div>

      {/* Live QR Ticket Entry Scanner */}
      <div className="scanner-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--cyan)' }}>
              ⚡ Live On-Spot QR Ticket Pass Verification & Check-In
            </h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Point device camera at participant's QR pass or type Ticket Code (e.g., <code>DS-GEN-2026-9142</code>).
            </p>
          </div>
          
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className={`category-pill ${scannerMode === 'camera' ? 'active' : ''}`}
              onClick={() => setScannerMode('camera')}
              style={{ fontSize: '0.76rem', padding: '4px 12px' }}
            >
              📷 Live Phone Camera
            </button>
            <button
              type="button"
              className={`category-pill ${scannerMode === 'manual' ? 'active' : ''}`}
              onClick={() => setScannerMode('manual')}
              style={{ fontSize: '0.76rem', padding: '4px 12px' }}
            >
              ⌨️ Keypad / Code Input
            </button>
          </div>
        </div>

        {/* MODE 1: LIVE PHONE CAMERA SCANNER */}
        {scannerMode === 'camera' ? (
          <CameraQrScanner onScanSuccess={handleCameraScannedCode} />
        ) : (
          /* MODE 2: MANUAL TICKET INPUT */
          <form onSubmit={handleFastScan} className="scanner-input-row" style={{ marginTop: '14px' }}>
            <input
              type="text"
              placeholder="Scan or enter Ticket Pass ID (e.g. DS-GEN-2026-9142)..."
              value={ticketInput}
              onChange={e => setTicketInput(e.target.value)}
              className="form-input"
              style={{ flex: 1, fontFamily: 'var(--font-mono)' }}
            />
            <button type="submit" className="btn-primary">
              ✓ Verify & Check-In
            </button>
          </form>
        )}

        {scanResult && (
          <div className="scan-result-box" style={{ marginTop: '14px' }}>
            <span>🎉</span>
            <div>
              <strong>{scanResult.message}</strong>
              <div style={{ fontSize: '0.72rem', opacity: 0.9 }}>
                Ticket: {scanResult.registration?.ticketCode} · Timestamp: {new Date(scanResult.registration?.checkedInAt).toLocaleTimeString()}
              </div>
            </div>
          </div>
        )}

        {scanError && (
          <div className="domain-alert-banner warning" style={{ margin: '14px 0 0' }}>
            {scanError}
          </div>
        )}
      </div>

      {/* Telemetry Metric Cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '28px' }}>
          <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--line)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>TOTAL SESSIONS ON RECORD</div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.8rem', fontWeight: 800, color: 'var(--cyan)' }}>{stats.totalEvents}</div>
          </div>
          <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--line)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>STUDENT REGISTRATIONS</div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.8rem', fontWeight: 800, color: '#38bdf8' }}>{stats.totalRegistrations}</div>
          </div>
          <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--line)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>ATTENDEES CHECKED-IN</div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.8rem', fontWeight: 800, color: 'var(--emerald)' }}>{stats.totalCheckedIn}</div>
          </div>
          <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--line)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>VERIFIED CERTIFICATES ISSUED</div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.8rem', fontWeight: 800, color: '#ffd700' }}>{stats.totalCertificates}</div>
          </div>
          <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--line)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>GALLERY PHOTOS ARCHIVED</div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.8rem', fontWeight: 800, color: 'var(--violet)' }}>{stats.totalPhotos}</div>
          </div>
        </div>
      )}

      {/* Session Filter Bar & Search Controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
        <div className="session-tabs-row">
          <div className="session-pills">
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--text-muted)', marginRight: '6px' }}>
              MANAGE SESSION:
            </span>
            <button
              className={`session-tab ${selectedSessionFilter === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedSessionFilter('all')}
            >
              📚 All Sessions ({committeeEvents.length})
            </button>
            <button
              className={`session-tab ${selectedSessionFilter === '2026-27' ? 'active current' : ''}`}
              onClick={() => setSelectedSessionFilter('2026-27')}
            >
              🟢 2026-27 (Current)
            </button>
            <button
              className={`session-tab ${selectedSessionFilter === '2025-26' ? 'active' : ''}`}
              onClick={() => setSelectedSessionFilter('2025-26')}
            >
              📁 2025-26 (Past Session)
            </button>
            <button
              className={`session-tab ${selectedSessionFilter === '2024-25' ? 'active' : ''}`}
              onClick={() => setSelectedSessionFilter('2024-25')}
            >
              📁 2024-25 (Past Session)
            </button>
          </div>

          <div className="search-box">
            <span>🔍</span>
            <input
              type="text"
              placeholder="Filter by title, coordinator, speaker, subject..."
              value={committeeSearch}
              onChange={e => setCommitteeSearch(e.target.value)}
            />
            {committeeSearch && (
              <button onClick={() => setCommitteeSearch('')} style={{ background: 'none', color: 'var(--text-muted)' }}>
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Category Filters for Committee */}
        <div className="categories-row">
          {[
            { id: 'all', label: 'All Disciplines' },
            { id: 'workshop', label: '🛠️ Workshops' },
            { id: 'seminar', label: '🎙️ Seminars' },
            { id: 'industry_visit', label: '🏭 Industry Visits' },
            { id: 'guest_lecture', label: '👨‍🏫 Guest Lectures' },
            { id: 'event', label: '🏆 Symposiums & Fests' },
          ].map(cat => (
            <button
              key={cat.id}
              className={`category-pill ${selectedCategoryFilter === cat.id ? 'active' : ''}`}
              onClick={() => setSelectedCategoryFilter(cat.id)}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Event Management Table */}
      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Session</th>
              <th>Category</th>
              <th>Event Title</th>
              <th>Date & Venue</th>
              <th>Registrations</th>
              <th>Photos</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loadingEvents ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                  Loading session data...
                </td>
              </tr>
            ) : committeeEvents.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                  No events found in session <strong>{selectedSessionFilter}</strong>. Click "+ Create New Event" to add one.
                </td>
              </tr>
            ) : (
              committeeEvents.map(event => (
                <tr key={event.id}>
                  <td>
                    <span className={`session-badge ${event.session === '2026-27' ? 'current' : ''}`}>
                      {event.session}
                    </span>
                  </td>
                  <td>
                    <span className={`category-tag ${event.category}`}>
                      {event.categoryLabel || event.category}
                    </span>
                  </td>
                  <td>
                    <strong>{event.title}</strong>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Convener: {event.coordinator} · Subject: {event.academicSubject || 'KDS-Core'}
                    </div>
                  </td>
                  <td>
                    <div style={{ fontSize: '0.8rem' }}>{event.date}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{event.venue}</div>
                  </td>
                  <td>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--cyan)' }}>
                      {event.registeredCount || 0} / {event.capacity || 100}
                    </span>
                    <div style={{ fontSize: '0.7rem', color: 'var(--emerald)' }}>
                      {event.attendedCount || 0} Attended
                    </div>
                  </td>
                  <td>
                    <button
                      className="photo-count-pill"
                      onClick={() => onManagePhotos(event)}
                      title="Manage Event Photos"
                    >
                      📸 {event.photosCount || 0} Photos
                    </button>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <button
                        className="btn-card-primary"
                        onClick={() => onManageAttendees(event)}
                        style={{ padding: '4px 10px', fontSize: '0.74rem' }}
                      >
                        👥 Attendees
                      </button>
                      <button
                        className="btn-card-secondary"
                        onClick={() => onViewDetail(event)}
                        style={{ padding: '4px 8px', fontSize: '0.74rem' }}
                        title="View Full Detail & PPTs"
                      >
                        👁️ View
                      </button>
                      <button
                        className="btn-card-secondary"
                        onClick={() => onBroadcastAnnouncement(event)}
                        style={{ padding: '4px 8px', fontSize: '0.74rem' }}
                        title="Broadcast Announcement"
                      >
                        📢
                      </button>
                      <button
                        className="btn-card-secondary"
                        onClick={() => onEditEvent(event)}
                        style={{ padding: '4px 8px', fontSize: '0.74rem' }}
                        title="Edit Event & PPT Deck"
                      >
                        ✏️
                      </button>
                      <button
                        className="btn-danger-outline"
                        onClick={() => handleDelete(event.id, event.title)}
                        style={{ padding: '4px 8px', fontSize: '0.74rem' }}
                        title="Delete Event"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

// ==========================================
// VERIFIED CERTIFICATE MODAL
// ==========================================
function CertificateModal({ certificate, onClose }) {
  const { event, name, rollNo, branch, certificateId, issuedAt } = certificate;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="event-detail-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '850px' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px 24px 0' }}>
          <button className="btn-close-modal" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: '20px 36px 36px' }}>
          <div className="certificate-preview-card" id="printable-certificate">
            <div className="cert-corner-decor top-left" />
            <div className="cert-corner-decor top-right" />
            <div className="cert-corner-decor bottom-left" />
            <div className="cert-corner-decor bottom-right" />

            <div className="cert-header-seal" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <img src="/abes-logo.webp" alt="ABES Logo" style={{ height: '52px', width: 'auto', objectFit: 'contain' }} />
                <div>
                  <h2 className="cert-inst-title">ABES ENGINEERING COLLEGE, GHAZIABAD</h2>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                    Affiliated to Dr. A.P.J. Abdul Kalam Technical University (AKTU Code: 032) · Approved by AICTE · NAAC Accredited
                  </div>
                  <div className="cert-dept-tag">DEPARTMENT OF COMPUTER SCIENCE & ENGINEERING (DATA SCIENCE)</div>
                </div>
              </div>
              <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#b45309', fontWeight: 700, whiteSpace: 'nowrap' }}>
                SESSION: {event?.session || '2026-27'}
              </div>
            </div>

            <div style={{ textAlign: 'center', margin: '28px 0' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                CERTIFICATE OF PARTICIPATION & MASTERY
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginTop: '6px' }}>
                This is proudly presented to
              </p>
              <h1 className="cert-recipient-name">{name}</h1>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.84rem', color: '#003366', fontWeight: 600 }}>
                University Roll No: {rollNo} · {branch}
              </p>

              <p className="cert-body-text" style={{ maxWidth: '620px', margin: '18px auto 0' }}>
                For successful completion and active participation in the academic <strong>{event?.categoryLabel || 'Workshop'}</strong> on <strong>"{event?.title}"</strong> mapped under AKTU Curriculum Subject <em>{event?.academicSubject || 'KDS-Core'}</em>.
              </p>
            </div>

            <div className="cert-footer-row">
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.86rem' }}>Dr. Meenakshi Sharma</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Faculty Event Convener, CSE(DS)</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div className="cert-id-watermark">
                  VERIFIED CERTIFICATE ID: <strong>{certificateId}</strong>
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                  Digitally Authenticated by ABES CSE(DS) Academic Cell
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, fontSize: '0.86rem' }}>Prof. (Dr.) Sanjay Singh</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Head of Department, CSE(DS)</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
            <button className="btn-primary" onClick={handlePrint} style={{ background: 'linear-gradient(135deg, #d97706, #b45309)', color: '#ffffff' }}>
              🖨️ Print / Save Official PDF
            </button>
            <button className="btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// COMMITTEE: ATTENDEE & CHECK-IN MODAL
// ==========================================
function AttendeeManagementModal({ event, onClose, onReload, onViewPaymentProof }) {
  const [attendees, setAttendees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const loadAttendees = async () => {
    try {
      const data = await api(`/committee/events/${event.id}/attendees`);
      setAttendees(data.attendees || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAttendees();
  }, [event.id]);

  const toggleCheckIn = async regId => {
    try {
      await api(`/committee/registrations/${regId}/checkin`, { method: 'POST' });
      loadAttendees();
      onReload();
    } catch (e) {
      alert(e.message);
    }
  };

  const toggleCertificate = async regId => {
    try {
      await api(`/committee/registrations/${regId}/certificate`, { method: 'POST' });
      loadAttendees();
      onReload();
    } catch (e) {
      alert(e.message);
    }
  };

  const verifyPayment = async (regId, status) => {
    try {
      await api(`/committee/registrations/${regId}/verify-payment`, {
        method: 'POST',
        body: JSON.stringify({ status })
      });
      loadAttendees();
      onReload();
    } catch (e) {
      alert(e.message);
    }
  };

  const filtered = attendees.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.rollNo.toLowerCase().includes(search.toLowerCase()) ||
    a.ticketCode?.toLowerCase().includes(search.toLowerCase()) ||
    a.utrNumber?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="event-detail-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '1050px' }}>
        <div className="lightbox-header">
          <div>
            <h3 className="lightbox-title">👥 Attendee & QR Check-In Management</h3>
            <span className="lightbox-subtitle">{event.title} · Session {event.session}</span>
          </div>
          <button className="btn-close-modal" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <input
              type="text"
              placeholder="Search by student name, roll no, ticket, or UTR..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="form-input"
              style={{ width: '360px' }}
            />
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--cyan)' }}>
              Total Registrations: {attendees.length} | Checked In: {attendees.filter(a => a.checkedIn).length}
            </div>
          </div>

          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ticket Code</th>
                  <th>Student Name</th>
                  <th>Roll No & Branch</th>
                  <th>Payment Proof</th>
                  <th>Check-In Status</th>
                  <th>Digital Certificate</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(reg => (
                  <tr key={reg.id}>
                    <td><span style={{ fontFamily: 'var(--font-mono)', color: 'var(--cyan)' }}>{reg.ticketCode}</span></td>
                    <td>
                      <strong>{reg.name}</strong>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{reg.email}</div>
                    </td>
                    <td>{reg.rollNo} · {reg.branch}</td>
                    <td>
                      {reg.isPaid ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span className={`payment-badge paid-${reg.paymentStatus || 'pending'}`}>
                            {reg.paymentStatus === 'verified' ? `✓ Paid ₹${reg.fee || 250}` : reg.paymentStatus === 'rejected' ? '❌ Rejected' : '⏳ Verification Pending'}
                          </span>
                          {reg.utrNumber && (
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                              UTR: {reg.utrNumber}
                            </span>
                          )}
                          {reg.paymentScreenshot && (
                            <button
                              type="button"
                              className="payment-thumb-btn"
                              onClick={() => onViewPaymentProof(reg)}
                            >
                              🖼️ View Screenshot
                            </button>
                          )}
                          {reg.paymentStatus !== 'verified' && (
                            <button
                              type="button"
                              className="btn-card-primary"
                              onClick={() => verifyPayment(reg.id, 'verified')}
                              style={{ padding: '3px 8px', fontSize: '0.68rem', marginTop: '2px', background: 'var(--emerald)', color: '#000' }}
                            >
                              ✓ Approve
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="payment-badge paid-free">Free Entry</span>
                      )}
                    </td>
                    <td>
                      <button
                        className="btn-card-secondary"
                        onClick={() => toggleCheckIn(reg.id)}
                        style={reg.checkedIn ? { background: 'var(--emerald-dim)', color: 'var(--emerald)', borderColor: 'var(--emerald-border)' } : {}}
                      >
                        {reg.checkedIn ? '✓ Checked In' : 'Mark Present'}
                      </button>
                    </td>
                    <td>
                      <button
                        className="btn-card-secondary"
                        onClick={() => toggleCertificate(reg.id)}
                        style={reg.certificateIssued ? { background: 'rgba(255, 215, 0, 0.15)', color: '#ffd700', borderColor: '#ffd700' } : {}}
                      >
                        {reg.certificateIssued ? `✓ ${reg.certificateId || 'Issued'}` : 'Generate Certificate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// COMMITTEE: PHOTO GALLERY MANAGER MODAL
// ==========================================
function PhotoManagerModal({ event, onClose, onReload }) {
  const [photos, setPhotos] = useState(event.photos || []);
  const [newUrl, setNewUrl] = useState('');
  const [newCaption, setNewCaption] = useState('');
  const [newPhotographer, setNewPhotographer] = useState('DS Media Cell');

  const handleAddPhoto = async e => {
    e.preventDefault();
    if (!newUrl.trim()) return;
    try {
      const res = await api(`/events/${event.id}/photos`, {
        method: 'POST',
        body: JSON.stringify({
          url: newUrl.trim(),
          caption: newCaption.trim(),
          photographer: newPhotographer.trim(),
        }),
      });
      setPhotos(res.event.photos || []);
      setNewUrl('');
      setNewCaption('');
      onReload();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeletePhoto = async photoId => {
    if (!confirm('Remove this photo from gallery?')) return;
    try {
      const res = await api(`/events/${event.id}/photos/${photoId}`, { method: 'DELETE' });
      setPhotos(res.event.photos || []);
      onReload();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="event-detail-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '850px' }}>
        <div className="lightbox-header">
          <div>
            <h3 className="lightbox-title">📸 Manage Photographic Album</h3>
            <span className="lightbox-subtitle">{event.title}</span>
          </div>
          <button className="btn-close-modal" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: '24px' }}>
          {/* Add Photo Form */}
          <form onSubmit={handleAddPhoto} style={{ background: 'var(--bg-card)', padding: '18px', borderRadius: 'var(--radius-md)', marginBottom: '24px' }}>
            <h4 style={{ fontSize: '0.9rem', marginBottom: '12px', color: 'var(--cyan)' }}>+ Upload New Photo to Event Gallery</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <input
                type="url"
                placeholder="High-Resolution Image URL..."
                value={newUrl}
                onChange={e => setNewUrl(e.target.value)}
                required
                className="form-input"
              />
              <input
                type="text"
                placeholder="Caption (e.g., Keynote address by Dean Academics)..."
                value={newCaption}
                onChange={e => setNewCaption(e.target.value)}
                className="form-input"
              />
            </div>
            <button type="submit" className="btn-primary" style={{ fontSize: '0.8rem' }}>
              Add to Gallery
            </button>
          </form>

          {/* Current Photos Grid */}
          <h4 style={{ fontSize: '0.9rem', marginBottom: '12px' }}>Current Photos ({photos.length})</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '14px' }}>
            {photos.map(p => (
              <div key={p.id} style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--line)' }}>
                <img src={p.url} alt={p.caption} style={{ width: '100%', height: '120px', objectFit: 'cover' }} />
                <div style={{ padding: '8px' }}>
                  <p style={{ fontSize: '0.74rem', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.caption}
                  </p>
                  <button
                    className="btn-danger-outline"
                    onClick={() => handleDeletePhoto(p.id)}
                    style={{ marginTop: '6px', width: '100%', fontSize: '0.7rem', padding: '3px' }}
                  >
                    Delete Photo
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// COMMITTEE: CREATE / EDIT EVENT MODAL
// ==========================================
function EventFormModal({ editingEvent, sessions, onClose, onSaved }) {
  const [formData, setFormData] = useState({
    title: editingEvent?.title || '',
    category: editingEvent?.category || 'workshop',
    session: editingEvent?.session || '2026-27',
    date: editingEvent?.date || '',
    time: editingEvent?.time || '10:00 AM – 4:30 PM',
    venue: editingEvent?.venue || 'Nvidia AI Lab 402, Block D',
    capacity: editingEvent?.capacity || 120,
    tagline: editingEvent?.tagline || '',
    isPaid: editingEvent?.isPaid || false,
    fee: editingEvent?.fee !== undefined ? editingEvent.fee : 250,
    upiId: editingEvent?.upiId || 'abes.datascience@icici',
    paymentInstructions: editingEvent?.paymentInstructions || 'Scan the Department UPI QR Code and upload your payment transaction screenshot.',
    coordinator: editingEvent?.coordinator || 'Dr. Meenakshi Sharma (DS Dept)',
    academicSubject: editingEvent?.academicSubject || 'KDS-501: Data Science Core',
    targetAudience: editingEvent?.targetAudience || '2nd, 3rd & 4th Year DS Students',
    speakerName: editingEvent?.speaker?.name || '',
    speakerRole: editingEvent?.speaker?.role || '',
    speakerOrg: editingEvent?.speaker?.organization || '',
    pptTitle: editingEvent?.pptSlides?.title || '',
    pptUrl: editingEvent?.pptSlides?.url || '',
    coverPhoto: editingEvent?.coverPhoto || '',
    academicObjectives: editingEvent?.academicObjectives?.join('\n') || 'Understand core theoretical formulations.\nHands-on implementation and problem solving.\nReview real-world industrial case studies.',
    keyTakeaways: editingEvent?.keyTakeaways?.join('\n') || 'Department Verified Certificate\nLecture Slide Deck and Notes\nQ&A and Mentorship',
  });

  const handleSubmit = async e => {
    e.preventDefault();
    try {
      if (editingEvent) {
        await api(`/events/${editingEvent.id}`, {
          method: 'PUT',
          body: JSON.stringify(formData),
        });
        alert('Event updated successfully.');
      } else {
        await api('/events', {
          method: 'POST',
          body: JSON.stringify(formData),
        });
        alert('New Event created successfully.');
      }
      onSaved();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="event-detail-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '850px' }}>
        <div className="lightbox-header">
          <div>
            <h3 className="lightbox-title">
              {editingEvent ? '✏️ Edit Department Session' : '➕ Create New Event, Workshop or Visit'}
            </h3>
            <span className="lightbox-subtitle">Accredited Data Science Department Records</span>
          </div>
          <button className="btn-close-modal" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label>Event Title *</label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={e => setFormData({ ...formData, title: e.target.value })}
                className="form-input"
                placeholder="e.g. Deep Learning & LLM Fine-Tuning"
              />
            </div>

            <div className="form-group">
              <label>Academic Session *</label>
              <select
                value={formData.session}
                onChange={e => setFormData({ ...formData, session: e.target.value })}
                className="form-input"
              >
                <option value="2026-27">2026-27 (Current Session)</option>
                <option value="2025-26">2025-26 (Past Session)</option>
                <option value="2024-25">2024-25 (Past Session)</option>
              </select>
            </div>

            <div className="form-group">
              <label>Category *</label>
              <select
                value={formData.category}
                onChange={e => setFormData({ ...formData, category: e.target.value })}
                className="form-input"
              >
                <option value="workshop">Hands-on Workshop</option>
                <option value="seminar">Expert Seminar</option>
                <option value="industry_visit">Industry Visit</option>
                <option value="guest_lecture">Guest Lecture</option>
                <option value="event">Departmental Symposium / Fest</option>
              </select>
            </div>

            <div className="form-group">
              <label>Curriculum Subject Code</label>
              <input
                type="text"
                value={formData.academicSubject}
                onChange={e => setFormData({ ...formData, academicSubject: e.target.value })}
                className="form-input"
                placeholder="e.g. KDS-501: Machine Learning"
              />
            </div>

            <div className="form-group">
              <label>Date *</label>
              <input
                type="text"
                required
                value={formData.date}
                onChange={e => setFormData({ ...formData, date: e.target.value })}
                className="form-input"
                placeholder="e.g. 18–19 October 2026"
              />
            </div>

            <div className="form-group">
              <label>Time *</label>
              <input
                type="text"
                required
                value={formData.time}
                onChange={e => setFormData({ ...formData, time: e.target.value })}
                className="form-input"
                placeholder="e.g. 10:00 AM – 4:30 PM"
              />
            </div>

            <div className="form-group">
              <label>Venue *</label>
              <input
                type="text"
                required
                value={formData.venue}
                onChange={e => setFormData({ ...formData, venue: e.target.value })}
                className="form-input"
                placeholder="e.g. Nvidia AI Lab 402, Block D"
              />
            </div>

            <div className="form-group">
              <label>Seat Capacity</label>
              <input
                type="number"
                value={formData.capacity}
                onChange={e => setFormData({ ...formData, capacity: e.target.value })}
                className="form-input"
              />
            </div>
          </div>

          {/* Payment Gateway Configuration */}
          <div style={{ marginTop: '16px', padding: '16px', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <input
                type="checkbox"
                id="isPaidToggle"
                checked={formData.isPaid}
                onChange={e => setFormData({ ...formData, isPaid: e.target.checked })}
                style={{ width: '18px', height: '18px', accentColor: 'var(--amber)' }}
              />
              <label htmlFor="isPaidToggle" style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--amber)', cursor: 'pointer' }}>
                💰 Require Paid Registration (UPI Payment Gateway)
              </label>
            </div>

            {formData.isPaid && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label>Registration Fee (₹) *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formData.fee}
                    onChange={e => setFormData({ ...formData, fee: Number(e.target.value) })}
                    className="form-input"
                    placeholder="e.g. 250"
                  />
                </div>

                <div className="form-group">
                  <label>Department Official UPI ID *</label>
                  <input
                    type="text"
                    required
                    value={formData.upiId}
                    onChange={e => setFormData({ ...formData, upiId: e.target.value })}
                    className="form-input"
                    placeholder="e.g. abes.datascience@icici"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Speaker Info */}
          <h4 style={{ fontSize: '0.9rem', margin: '20px 0 10px', color: 'var(--cyan)' }}>
            🎙️ Guest Speaker / Visiting Practitioner Details
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
            <input
              type="text"
              placeholder="Speaker Name"
              value={formData.speakerName}
              onChange={e => setFormData({ ...formData, speakerName: e.target.value })}
              className="form-input"
            />
            <input
              type="text"
              placeholder="Speaker Designation"
              value={formData.speakerRole}
              onChange={e => setFormData({ ...formData, speakerRole: e.target.value })}
              className="form-input"
            />
            <input
              type="text"
              placeholder="Organization (e.g. Microsoft / IIT)"
              value={formData.speakerOrg}
              onChange={e => setFormData({ ...formData, speakerOrg: e.target.value })}
              className="form-input"
            />
          </div>

          {/* Presentation Slides Link */}
          <h4 style={{ fontSize: '0.9rem', margin: '20px 0 10px', color: 'var(--amber)' }}>
            📑 Presentation Slides (PPT) & Academic Material
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <input
              type="text"
              placeholder="PPT Deck Title (e.g., DeepLearning_Mastery.pptx)"
              value={formData.pptTitle}
              onChange={e => setFormData({ ...formData, pptTitle: e.target.value })}
              className="form-input"
            />
            <input
              type="url"
              placeholder="PPT / Drive Shareable URL"
              value={formData.pptUrl}
              onChange={e => setFormData({ ...formData, pptUrl: e.target.value })}
              className="form-input"
            />
          </div>

          {/* Objectives */}
          <div style={{ marginTop: '16px' }}>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Academic Objectives (1 per line)
            </label>
            <textarea
              rows={3}
              value={formData.academicObjectives}
              onChange={e => setFormData({ ...formData, academicObjectives: e.target.value })}
              className="form-input"
              style={{ width: '100%', marginTop: '4px' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              {editingEvent ? 'Save Changes' : 'Publish to Department Portal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// COMMITTEE: BROADCAST ANNOUNCEMENT MODAL
// ==========================================
function AnnouncementModal({ event, onClose, onReload }) {
  const [text, setText] = useState('');

  const handleSend = async e => {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      await api(`/events/${event.id}/announcements`, {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
      alert('Announcement broadcasted to registered students!');
      onReload();
      onClose();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="event-detail-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '560px' }}>
        <div className="lightbox-header">
          <div>
            <h3 className="lightbox-title">📢 Broadcast Announcement</h3>
            <span className="lightbox-subtitle">{event.title}</span>
          </div>
          <button className="btn-close-modal" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSend} style={{ padding: '24px' }}>
          <div className="form-group">
            <label>Announcement Message</label>
            <textarea
              rows={4}
              required
              placeholder="e.g. Please bring your laptops with PyTorch installed. Entry pass verification begins at 9:30 AM at Lab 402."
              value={text}
              onChange={e => setText(e.target.value)}
              className="form-input"
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary">Broadcast Alert</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// PAYMENT REGISTRATION & SCREENSHOT UPLOAD MODAL
// ==========================================
function PaymentRegistrationModal({ event, onClose, onSuccess }) {
  const [utrNumber, setUtrNumber] = useState('');
  const [screenshotBase64, setScreenshotBase64] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [error, setError] = useState('');

  const upiId = event.upiId || 'abes.datascience@icici';
  const feeAmount = event.fee || 250;
  const upiIntent = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=ABES%20Data%20Science%20Dept&am=${feeAmount}&cu=INR&tn=${encodeURIComponent('Reg_' + event.title.slice(0, 20))}`;

  const handleCopyUpi = () => {
    navigator.clipboard.writeText(upiId);
    setCopiedUpi(true);
    setTimeout(() => setCopiedUpi(false), 2000);
  };

  const handleFileChange = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const base64 = await compressImageToBase64(file);
      setScreenshotBase64(base64);
      setError('');
    } catch (err) {
      setError('Failed to process image file. Please choose another screenshot.');
    }
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (!screenshotBase64) {
      setError('Please upload your payment transaction screenshot/receipt.');
      return;
    }
    if (!utrNumber.trim()) {
      setError('Please enter the 12-digit UPI / Bank Transaction UTR reference number.');
      return;
    }

    setIsUploading(true);
    setError('');
    try {
      const res = await api('/registrations', {
        method: 'POST',
        body: JSON.stringify({
          eventId: event.id,
          paymentScreenshot: screenshotBase64,
          utrNumber: utrNumber.trim(),
        })
      });
      alert('🎉 Registration & Payment Proof Submitted! Your QR Pass is ready in the Student Portal pending committee verification.');
      onSuccess(res);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="event-detail-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px' }}>
        <div className="lightbox-header">
          <div>
            <h3 className="lightbox-title">💳 Event Registration & Payment Gateway</h3>
            <span className="lightbox-subtitle">{event.title}</span>
          </div>
          <button className="btn-close-modal" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="payment-gateway-modal">
          {error && <div className="domain-alert-banner warning">{error}</div>}

          {/* Payment Amount and UPI Details Card */}
          <div className="payment-card">
            <div className="payment-amount-hero">
              <div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  REGISTRATION FEE
                </span>
                <div className="payment-amount-val">₹{feeAmount}</div>
              </div>
              <span className="category-tag workshop">Secure Department UPI</span>
            </div>

            <div className="upi-details-grid">
              <div className="upi-qr-box">
                <QRCodeCanvas text={upiIntent} size={130} downloadName={`UPI_Pay_${event.id}`} />
                <div style={{ fontSize: '0.68rem', color: '#333', fontWeight: 600, marginTop: '4px' }}>
                  Scan in GPay / PhonePe / Paytm
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Official Department UPI ID:
                </div>
                <div className="upi-id-pill" onClick={handleCopyUpi} title="Click to copy UPI ID">
                  <span>{upiId}</span>
                  <span style={{ fontSize: '0.74rem' }}>{copiedUpi ? '✅ Copied' : '📋 Copy'}</span>
                </div>
                <p style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginTop: '8px' }}>
                  Account: <strong>ABES Data Science Department Fund</strong>
                </p>
                <p style={{ fontSize: '0.72rem', color: 'var(--amber)', marginTop: '4px' }}>
                  💡 {event.paymentInstructions || 'Pay via any UPI App and take a screenshot of the completed transaction.'}
                </p>
              </div>
            </div>
          </div>

          {/* UTR Input */}
          <div className="form-group">
            <label>UPI Transaction Ref / UTR Number (12 Digits) *</label>
            <input
              type="text"
              required
              placeholder="e.g. 428901239845 or UPI-10928374..."
              value={utrNumber}
              onChange={e => setUtrNumber(e.target.value)}
              className="form-input"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          </div>

          {/* Screenshot Upload Dropzone */}
          <div className="form-group">
            <label>Upload Payment Receipt / Transaction Screenshot *</label>
            {!screenshotBase64 ? (
              <label className="screenshot-upload-zone">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />
                <div style={{ fontSize: '2rem', marginBottom: '4px' }}>📱📸</div>
                <strong style={{ fontSize: '0.88rem', color: 'var(--cyan)' }}>
                  Tap to upload or take photo of payment receipt
                </strong>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Supports JPEG, PNG, or mobile camera capture (auto-compressed)
                </div>
              </label>
            ) : (
              <div className="screenshot-preview-wrapper">
                <img src={screenshotBase64} alt="Payment Receipt" className="screenshot-preview-img" />
                <button
                  type="button"
                  className="btn-remove-screenshot"
                  onClick={() => setScreenshotBase64(null)}
                  title="Remove image"
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={isUploading}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={isUploading || !screenshotBase64}
              style={{ background: 'linear-gradient(135deg, var(--emerald), var(--cyan))' }}
            >
              {isUploading ? 'Verifying & Submitting...' : '✓ Submit Payment & Confirm Pass'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// PAYMENT PROOF VIEWER & VERIFICATION MODAL
// ==========================================
function PaymentProofViewerModal({ registration, isCommittee = false, onClose, onVerify }) {
  const [verifying, setVerifying] = useState(false);

  const handleAction = async status => {
    setVerifying(true);
    try {
      await onVerify(registration.id, status);
      onClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="event-detail-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
        <div className="lightbox-header">
          <div>
            <h3 className="lightbox-title">🧾 Payment Proof & Receipt</h3>
            <span className="lightbox-subtitle">Student: {registration.name} ({registration.rollNo})</span>
          </div>
          <button className="btn-close-modal" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', background: 'var(--bg-card)', padding: '12px 16px', borderRadius: 'var(--radius-md)', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>TRANSACTION UTR REF</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--cyan)' }}>
                {registration.utrNumber || 'N/A'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>FEE AMOUNT</div>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, color: 'var(--amber)' }}>
                ₹{registration.paidAmount || registration.fee || 250}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>STATUS</div>
              <span className={`payment-badge paid-${registration.paymentStatus || 'pending'}`}>
                {registration.paymentStatus?.replace('_', ' ').toUpperCase() || 'PENDING'}
              </span>
            </div>
          </div>

          {registration.paymentScreenshot ? (
            <div style={{ textAlign: 'center', margin: '14px 0' }}>
              <img
                src={registration.paymentScreenshot}
                alt="Payment proof receipt"
                style={{ maxWidth: '100%', maxHeight: '380px', borderRadius: 'var(--radius-md)', border: '1px solid var(--line-strong)', objectFit: 'contain' }}
              />
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
              No screenshot uploaded yet.
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
            {isCommittee && (
              <>
                <button
                  type="button"
                  className="btn-danger-outline"
                  onClick={() => handleAction('rejected')}
                  disabled={verifying}
                >
                  ✕ Reject Payment
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => handleAction('verified')}
                  disabled={verifying}
                  style={{ background: 'linear-gradient(135deg, var(--emerald), #00c4d4)' }}
                >
                  ✓ Approve & Verify Payment
                </button>
              </>
            )}
            <button type="button" className="btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// COMMITTEE: SECURITY & CREDENTIALS MODAL
// ==========================================
function CommitteeSecurityModal({ user, onClose, onUpdated }) {
  const [formData, setFormData] = useState({
    newName: user.name || '',
    newDesignation: user.designation || 'Head of Department (Data Science)',
    newEmail: user.email || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (formData.newPassword && formData.newPassword !== formData.confirmPassword) {
      setError('New passwords do not match. Please verify.');
      return;
    }

    if (formData.newPassword && formData.newPassword.length < 6) {
      setError('New password must be at least 6 characters long.');
      return;
    }

    setLoading(true);
    try {
      const res = await api('/committee/change-credentials', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: formData.currentPassword,
          newEmail: formData.newEmail,
          newPassword: formData.newPassword || undefined,
          newName: formData.newName,
          newDesignation: formData.newDesignation
        })
      });
      setSuccess(res.message);
      onUpdated(res.user);
      setTimeout(() => {
        onClose();
      }, 1400);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="event-detail-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '580px' }}>
        <div className="lightbox-header">
          <div>
            <h3 className="lightbox-title">🔑 Committee Security & Credentials Manager</h3>
            <span className="lightbox-subtitle">Update Faculty Email ID & Password (Permanently Saved in Database)</span>
          </div>
          <button className="btn-close-modal" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
          {error && <div className="domain-alert-banner warning">{error}</div>}
          {success && <div className="domain-alert-banner valid">{success}</div>}

          <div className="form-group">
            <label>Coordinator / Faculty Full Name</label>
            <input
              type="text"
              required
              value={formData.newName}
              onChange={e => setFormData({ ...formData, newName: e.target.value })}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label>Academic Designation</label>
            <input
              type="text"
              required
              value={formData.newDesignation}
              onChange={e => setFormData({ ...formData, newDesignation: e.target.value })}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label>Official Committee Login Email ID</label>
            <input
              type="email"
              required
              value={formData.newEmail}
              onChange={e => setFormData({ ...formData, newEmail: e.target.value })}
              className="form-input"
            />
          </div>

          <div style={{ padding: '16px', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', margin: '18px 0', border: '1px solid var(--line)' }}>
            <h4 style={{ fontSize: '0.85rem', color: 'var(--amber)', marginBottom: '12px' }}>
              🔒 Change Password (Optional)
            </h4>
            
            <div className="form-group">
              <label>Current Password * (Required to authorize changes)</label>
              <input
                type="password"
                required
                placeholder="Enter current password..."
                value={formData.currentPassword}
                onChange={e => setFormData({ ...formData, currentPassword: e.target.value })}
                className="form-input"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div className="form-group">
                <label>New Password (Min 6 chars)</label>
                <input
                  type="password"
                  placeholder="New password..."
                  value={formData.newPassword}
                  onChange={e => setFormData({ ...formData, newPassword: e.target.value })}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>Confirm New Password</label>
                <input
                  type="password"
                  placeholder="Confirm new password..."
                  value={formData.confirmPassword}
                  onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
                  className="form-input"
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Updating...' : '💾 Save & Update Credentials'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// AUTHENTICATION MODAL (PURE 6-DIGIT OTP & COMMITTEE LOGIN)
// ==========================================
function AuthModal({ initialRole = 'student', onClose }) {
  const { login, sendOtp, verifyOtp } = useAuth();
  const [activeTab, setActiveTab] = useState(initialRole); // 'student' | 'committee'

  // Student Step State
  const [step, setStep] = useState('input'); // 'input' | 'otp'
  const [studentEmail, setStudentEmail] = useState('');
  const [studentName, setStudentName] = useState('');
  const [studentRoll, setStudentRoll] = useState('');
  const [otp, setOtp] = useState('');
  const [deliveredLive, setDeliveredLive] = useState(false);
  const [resendMsg, setResendMsg] = useState('');

  // Real-time Timers (5-minute expiry & 30-second resend cooldown)
  const [expirySeconds, setExpirySeconds] = useState(300);
  const [cooldownSeconds, setCooldownSeconds] = useState(30);

  // Committee Form State
  const [committeeEmail, setCommitteeEmail] = useState('');
  const [committeePassword, setCommitteePassword] = useState('');

  const [domainStatus, setDomainStatus] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  // Timer Tick Interval for Step 2
  useEffect(() => {
    let timer = null;
    if (step === 'otp') {
      timer = setInterval(() => {
        setExpirySeconds(prev => (prev > 0 ? prev - 1 : 0));
        setCooldownSeconds(prev => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [step]);

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Real-time Email Validation
  const handleEmailChange = val => {
    setStudentEmail(val);
    setError('');
    const clean = val.trim().toLowerCase();
    if (!clean.includes('@')) {
      setDomainStatus(null);
      return;
    }
    const domain = clean.split('@')[1];
    if (domain === 'abes.ac.in' || domain.endsWith('.abes.ac.in')) {
      setDomainStatus({ valid: true, isAbes: true, msg: '🎓 Verified ABES Microsoft College Email ID' });
    } else if (clean.includes('.') && domain.length > 2) {
      setDomainStatus({ valid: true, isAbes: false, msg: `📧 Email: ${clean}` });
    } else {
      setDomainStatus(null);
    }
  };

  // Step 1: Send 6-Digit OTP
  const handleSendOtp = async e => {
    if (e) e.preventDefault();
    setError('');
    setResendMsg('');
    const clean = studentEmail.trim().toLowerCase();
    if (!clean || !clean.includes('@') || !clean.includes('.')) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    try {
      const res = await sendOtp({
        email: clean,
        name: studentName.trim() || undefined,
        rollNo: studentRoll.trim() || undefined,
        branch: 'CSE (Data Science)',
        year: '2nd Year',
      });
      setDeliveredLive(!!res.deliveredLive);
      setExpirySeconds(res.expiresInSeconds || 300);
      setCooldownSeconds(res.cooldownSeconds || 30);
      setStep('otp');
    } catch (err) {
      setError(err.message || 'Failed to dispatch verification code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Resend 6-Digit OTP
  const handleResendOtp = async () => {
    if (cooldownSeconds > 0) return;
    setError('');
    setResendMsg('');
    setResending(true);
    try {
      const res = await sendOtp({
        email: studentEmail.trim().toLowerCase(),
        name: studentName.trim() || undefined,
        rollNo: studentRoll.trim() || undefined,
        branch: 'CSE (Data Science)',
        year: '2nd Year',
      });
      setDeliveredLive(!!res.deliveredLive);
      setExpirySeconds(res.expiresInSeconds || 300);
      setCooldownSeconds(res.cooldownSeconds || 30);
      setResendMsg('✅ New 6-digit verification OTP dispatched to your inbox!');
      setTimeout(() => setResendMsg(''), 5000);
    } catch (err) {
      setError(err.message || 'Failed to resend code.');
    } finally {
      setResending(false);
    }
  };

  // Step 2: Verify 6-Digit OTP
  const handleVerifyOtp = async e => {
    e.preventDefault();
    setError('');
    setResendMsg('');
    const cleanOtp = otp.trim();
    if (!cleanOtp) {
      setError('Please enter the 6-digit verification code sent to your email.');
      return;
    }
    if (cleanOtp.length !== 6) {
      setError('Verification code must be exactly 6 digits.');
      return;
    }

    setLoading(true);
    try {
      await verifyOtp(studentEmail.trim().toLowerCase(), cleanOtp);
      onClose();
    } catch (err) {
      setError(err.message || "OTP didn't match. Please check your code in your email and try again.");
    } finally {
      setLoading(false);
    }
  };

  // Committee Login Submit
  const handleCommitteeSubmit = async e => {
    e.preventDefault();
    setError('');
    if (!committeeEmail.trim() || !committeePassword) {
      setError('Please enter both faculty email and password.');
      return;
    }

    setLoading(true);
    try {
      await login(committeeEmail.trim().toLowerCase(), committeePassword, 'committee');
      onClose();
    } catch (err) {
      setError(err.message || 'Authentication failed. Please verify faculty credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="auth-modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
        <div className="auth-tabs-header">
          <button
            className={`auth-tab-switch ${activeTab === 'student' ? 'active' : ''}`}
            onClick={() => { setActiveTab('student'); setError(''); setResendMsg(''); }}
          >
            🎓 Student Portal (Email & OTP)
          </button>
          <button
            className={`auth-tab-switch ${activeTab === 'committee' ? 'active' : ''}`}
            onClick={() => { setActiveTab('committee'); setError(''); setResendMsg(''); }}
          >
            🏛️ Department Committee
          </button>
        </div>

        <div className="auth-body" style={{ padding: '24px' }}>
          {error && (
            <div className="domain-alert-banner warning">
              <span>❌</span>
              <div>{error}</div>
            </div>
          )}

          {resendMsg && (
            <div className="domain-alert-banner valid">
              <div>{resendMsg}</div>
            </div>
          )}

          {activeTab === 'student' ? (
            step === 'input' ? (
              <div>
                <div className="msft-badge-box" style={{ marginBottom: '18px' }}>
                  <svg className="msft-icon-svg" viewBox="0 0 23 23">
                    <path fill="#f35325" d="M1 1h10v10H1z" />
                    <path fill="#81bc06" d="M12 1h10v10H12z" />
                    <path fill="#05a6f0" d="M1 12h10v10H1z" />
                    <path fill="#ffba08" d="M12 12h10v10H12z" />
                  </svg>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.86rem' }}>
                      Automated Student Email Verification
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      A 6-digit OTP verification code will be dispatched to your email
                    </div>
                  </div>
                </div>

                {domainStatus && (
                  <div className={`domain-alert-banner ${domainStatus.isAbes ? 'valid' : 'info'}`}>
                    {domainStatus.msg}
                  </div>
                )}

                <form onSubmit={handleSendOtp}>
                  <div className="form-group">
                    <label>College / Student Email ID *</label>
                    <input
                      type="email"
                      required
                      placeholder="e.g. yourname.25ds101@abes.ac.in"
                      value={studentEmail}
                      onChange={e => handleEmailChange(e.target.value)}
                      className="form-input"
                      autoComplete="off"
                      autoFocus
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div className="form-group">
                      <label>Student Full Name (Optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. Vaibhav Goyal"
                        value={studentName}
                        onChange={e => setStudentName(e.target.value)}
                        className="form-input"
                        autoComplete="off"
                      />
                    </div>
                    <div className="form-group">
                      <label>University Roll No (Optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. 2500321540101"
                        value={studentRoll}
                        onChange={e => setStudentRoll(e.target.value)}
                        className="form-input"
                        autoComplete="off"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={loading}
                    style={{ width: '100%', justifyContent: 'center', marginTop: '14px', padding: '12px' }}
                  >
                    {loading ? '📨 Dispatching Email...' : '📨 Send Verification OTP'}
                  </button>
                </form>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <div style={{ fontSize: '0.86rem', fontWeight: 700 }}>
                    🔐 Enter 6-Digit OTP Code
                  </div>
                  <button
                    type="button"
                    onClick={() => { setStep('input'); setError(''); setResendMsg(''); }}
                    style={{ background: 'none', border: 'none', color: 'var(--cyan)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}
                  >
                    ← Change Email
                  </button>
                </div>

                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '16px' }}>
                  We've dispatched an official 6-digit OTP verification email to <strong>{studentEmail}</strong>. Please check your inbox or spam folder.
                </p>

                <form onSubmit={handleVerifyOtp}>
                  <div className="form-group" style={{ textAlign: 'center' }}>
                    <label style={{ justifyContent: 'center', marginBottom: '8px' }}>6-Digit Verification Code</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      required
                      placeholder="000000"
                      value={otp}
                      onChange={e => { setOtp(e.target.value.replace(/\D/g, '')); setError(''); }}
                      className="form-input otp-input-large"
                      autoComplete="one-time-code"
                      autoFocus
                    />
                    <div style={{
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      color: expirySeconds <= 60 ? '#dc2626' : 'var(--text-muted)',
                      marginTop: '8px'
                    }}>
                      {expirySeconds > 0
                        ? `⏱️ Code expires in ${formatTime(expirySeconds)}`
                        : '⚠️ Code has expired. Please request a new OTP.'}
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={loading || expirySeconds === 0}
                    style={{ width: '100%', justifyContent: 'center', marginTop: '16px', padding: '12px' }}
                  >
                    {loading ? 'Verifying Code...' : '🔐 Verify OTP & Access Portal'}
                  </button>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--line)' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Didn't receive email?</span>
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      disabled={resending || cooldownSeconds > 0}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: cooldownSeconds > 0 ? 'var(--text-muted)' : 'var(--cyan)',
                        cursor: cooldownSeconds > 0 ? 'not-allowed' : 'pointer',
                        fontSize: '0.8rem',
                        fontWeight: 600
                      }}
                    >
                      {resending
                        ? 'Sending...'
                        : cooldownSeconds > 0
                        ? `🔄 Resend Code (${cooldownSeconds}s)`
                        : '🔄 Resend OTP Code'}
                    </button>
                  </div>
                </form>
              </div>
            )
          ) : (
            <div>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
                Sign in with authorized Faculty or Department Committee credentials to access event lifecycle management and report exports.
              </p>

              <form onSubmit={handleCommitteeSubmit}>
                <div className="form-group">
                  <label>Faculty / Committee Email ID *</label>
                  <input
                    type="email"
                    required
                    value={committeeEmail}
                    onChange={e => setCommitteeEmail(e.target.value)}
                    className="form-input"
                    placeholder="e.g. hod.ds@abes.ac.in"
                    autoComplete="off"
                  />
                </div>

                <div className="form-group">
                  <label>Password *</label>
                  <input
                    type="password"
                    required
                    value={committeePassword}
                    onChange={e => setCommitteePassword(e.target.value)}
                    className="form-input"
                    placeholder="Enter committee password..."
                    autoComplete="new-password"
                  />
                </div>

                <button
                  type="submit"
                  className="btn-primary"
                  disabled={loading}
                  style={{ width: '100%', justifyContent: 'center', marginTop: '14px', padding: '12px', background: 'linear-gradient(135deg, var(--emerald), #00c4d4)' }}
                >
                  {loading ? 'Verifying...' : '⚙️ Enter Committee Portal'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// ACADEMIC SESSION MANAGEMENT MODAL
// ==========================================
function AcademicSessionManagerModal({ sessions, onClose, onReloadSessions, onReloadAll }) {
  const [newId, setNewId] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [isCurrent, setIsCurrent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [sessionSuccess, setSessionSuccess] = useState('');

  const handleCreateSession = async e => {
    e.preventDefault();
    if (!newId.trim()) {
      setSessionError('Please provide an Academic Session ID (e.g. 2027-28 or 2028-29).');
      return;
    }
    setSessionError('');
    setSessionSuccess('');
    setIsSubmitting(true);
    try {
      const res = await api('/sessions', {
        method: 'POST',
        body: JSON.stringify({
          id: newId.trim(),
          label: newLabel.trim() || newId.trim(),
          isCurrent,
          description: newDesc.trim()
        })
      });
      setSessionSuccess(res.message || `Academic session '${newId}' added successfully!`);
      setNewId('');
      setNewLabel('');
      setNewDesc('');
      setIsCurrent(false);
      await onReloadSessions();
      if (onReloadAll) onReloadAll();
    } catch (err) {
      setSessionError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetCurrent = async sessionId => {
    setSessionError('');
    setSessionSuccess('');
    try {
      const res = await api(`/sessions/${sessionId}/set-current`, {
        method: 'PATCH'
      });
      setSessionSuccess(res.message || `Session ${sessionId} set as Current Active.`);
      await onReloadSessions();
      if (onReloadAll) onReloadAll();
    } catch (err) {
      setSessionError(err.message);
    }
  };

  const handleDeleteSession = async sessionId => {
    if (!confirm(`Are you sure you want to remove academic session '${sessionId}'?`)) return;
    setSessionError('');
    setSessionSuccess('');
    try {
      const res = await api(`/sessions/${sessionId}`, {
        method: 'DELETE'
      });
      setSessionSuccess(res.message || `Academic session removed.`);
      await onReloadSessions();
      if (onReloadAll) onReloadAll();
    } catch (err) {
      setSessionError(err.message);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="event-detail-modal" style={{ maxWidth: '800px' }}>
        <div className="lightbox-header">
          <div className="lightbox-title-box">
            <h2 className="lightbox-title">📅 Academic Session & Batch Management</h2>
            <div className="lightbox-subtitle">Configure department academic cycles, active years, and archive terms</div>
          </div>
          <button className="btn-close-modal" onClick={onClose}>✕</button>
        </div>

        <div className="detail-body">
          {sessionError && (
            <div className="domain-alert-banner warning" style={{ marginBottom: '18px' }}>
              ⚠️ {sessionError}
            </div>
          )}

          {sessionSuccess && (
            <div className="domain-alert-banner valid" style={{ marginBottom: '18px' }}>
              ✓ {sessionSuccess}
            </div>
          )}

          {/* Form to Add New Academic Session */}
          <div className="academic-box" style={{ background: 'var(--bg-card)', border: '1px solid var(--cyan-border)', marginBottom: '28px' }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.05rem', fontWeight: 700, color: 'var(--cyan)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>➕</span> Add New Academic Session
            </h3>

            <form onSubmit={handleCreateSession}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                <div className="form-group">
                  <label>Academic Session ID *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. 2027-28, 2028-29, 2023-24"
                    value={newId}
                    onChange={e => setNewId(e.target.value)}
                    required
                  />
                  <small style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Unique identifier used across reports and certificates</small>
                </div>

                <div className="form-group">
                  <label>Display Label (Optional)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. 2027-28 (Upcoming) or 2023-24 (Past)"
                    value={newLabel}
                    onChange={e => setNewLabel(e.target.value)}
                  />
                  <small style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>User-friendly label shown in navigation bars</small>
                </div>
              </div>

              <div className="form-group" style={{ marginTop: '12px' }}>
                <label>Academic Description / Term Focus</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Deep Learning, Generative AI & Cloud Analytics Academic Year"
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--line)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={isCurrent}
                    onChange={e => setIsCurrent(e.target.checked)}
                    style={{ width: '18px', height: '18px', accentColor: 'var(--cyan)' }}
                  />
                  <span>Set as Current Active Session (2026-27 / Upcoming)</span>
                </label>

                <button type="submit" className="btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving Session...' : '+ Add Academic Session'}
                </button>
              </div>
            </form>
          </div>

          {/* Configured Academic Sessions Table */}
          <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.05rem', fontWeight: 700, marginBottom: '14px' }}>
            Configured Academic Sessions ({sessions.length})
          </h3>

          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Session ID</th>
                  <th>Display Label</th>
                  <th>Status</th>
                  <th>Description</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => (
                  <tr key={s.id}>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--cyan)' }}>
                        {s.id}
                      </span>
                    </td>
                    <td><strong>{s.label}</strong></td>
                    <td>
                      {s.isCurrent ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 10px', background: 'var(--emerald-dim)', color: 'var(--emerald)', border: '1px solid var(--emerald-border)', borderRadius: '99px', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 700 }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--emerald)' }}></span>
                          Current Active
                        </span>
                      ) : (
                        <span style={{ padding: '3px 8px', background: 'var(--bg-surface)', color: 'var(--text-muted)', border: '1px solid var(--line)', borderRadius: '99px', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                          📁 Past Archive
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)', maxWidth: '240px' }}>
                      {s.description || 'Standard Academic Batch'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        {!s.isCurrent && (
                          <button
                            type="button"
                            className="btn-card-secondary"
                            onClick={() => handleSetCurrent(s.id)}
                            title="Set as active year"
                            style={{ fontSize: '0.74rem', padding: '4px 8px' }}
                          >
                            🌟 Set Active
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn-danger-outline"
                          onClick={() => handleDeleteSession(s.id)}
                          title="Delete session"
                          style={{ padding: '4px 8px' }}
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Done & Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// MOUNT ROOT
// ==========================================
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
