import React, { createContext, useContext, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import QRCode from 'qrcode';
import './styles.css';

// Reusable dynamic QR Code component with high-DPI rendering and 1-click download
function QRCodeCanvas({ text, size = 100, downloadName = 'qr_pass' }) {
  const [dataUrl, setDataUrl] = useState('');

  useEffect(() => {
    if (!text) return;
    QRCode.toDataURL(text, {
      width: size * 3, // crisp high DPI
      margin: 1,
      color: {
        dark: '#0a0b17',
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
    a.download = `${downloadName}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (!dataUrl) {
    return <div style={{ width: size, height: size, background: '#fff', borderRadius: '8px' }} />;
  }

  return (
    <div className="qr-code-box">
      <img src={dataUrl} alt="Verified QR Pass" style={{ width: size, height: size }} />
      <button type="button" className="qr-download-btn" onClick={handleDownload} title="Download high-resolution QR image">
        📥 Save QR
      </button>
    </div>
  );
}

// API Helper
const api = async (path, options = {}) => {
  const token = localStorage.getItem('abes-token');
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
  if (!response.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
};

const AuthContext = createContext();
const useAuth = () => useContext(AuthContext);

const navigate = path => {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new Event('popstate'));
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// Brand Component
function Brand() {
  return (
    <a className="brand" href="/" onClick={e => { e.preventDefault(); navigate('/'); }}>
      <i>A</i>ABES <b>PULSE</b>
    </a>
  );
}

// Header Component
function Header({ minimal = false }) {
  const { user, logout } = useAuth();
  return (
    <header className="top">
      <Brand />
      {!minimal && (
        <nav>
          <a href="/#events">Discover</a>
          <a href="/#spotlight">Campus life</a>
          {user ? (
            <>
              <a
                href={user.role === 'student' ? '/student' : '/organizer'}
                className="user-badge"
                onClick={e => {
                  e.preventDefault();
                  navigate(user.role === 'student' ? '/student' : '/organizer');
                }}
              >
                <span />
                {user.name.split(' ')[0]} ({user.role === 'student' ? 'Student' : 'Organizer'})
              </a>
              <a
                href={user.role === 'student' ? '/student' : '/organizer'}
                onClick={e => {
                  e.preventDefault();
                  navigate(user.role === 'student' ? '/student' : '/organizer');
                }}
              >
                My Portal
              </a>
              <button className="text-button" onClick={logout}>
                Sign out
              </button>
            </>
          ) : (
            <button className="nav-button" onClick={() => navigate('/login')}>
              Sign in <span>→</span>
            </button>
          )}
        </nav>
      )}
    </header>
  );
}

// Event Card
function EventCard({ event, saved, onSave }) {
  const isFull = event.isSoldOut || (event.capacity && (event.registeredCount || 0) >= event.capacity);
  const fillPct = event.capacity ? Math.min(100, Math.round(((event.registeredCount || 0) / event.capacity) * 100)) : 40;

  return (
    <article className="event-card">
      <div
        className="event-image"
        style={{
          backgroundImage: `linear-gradient(0deg, rgba(9,10,22,.65), rgba(9,10,22,.08)), url('${event.image}')`
        }}
      >
        <div className="event-tags-top">
          <small>{event.type || event.category?.toUpperCase()}</small>
          <button
            aria-label="Save event"
            className={`save-btn ${saved ? 'saved' : ''}`}
            onClick={() => onSave(event.id)}
          >
            {saved ? '♥' : '♡'}
          </button>
        </div>
      </div>
      <div className="event-body">
        <time>{event.date} · {event.time.split('–')[0]?.trim() || event.time}</time>
        <h3>{event.title}</h3>
        <p>{event.description}</p>
        
        <div className="event-capacity-bar">
          <div className="capacity-meter">
            <div
              className={`capacity-fill ${fillPct > 80 ? 'high' : ''} ${fillPct >= 100 ? 'full' : ''}`}
              style={{ width: `${fillPct}%` }}
            />
          </div>
          <div className="capacity-text">
            <span>{event.registeredCount || 0} registered</span>
            <span>{event.capacity ? `${event.capacity} seats` : 'Open'}</span>
          </div>
        </div>

        <div className="event-foot">
          <span className="venue-tag" title={event.venue}>⌖ {event.venue}</span>
          <button className="link-button" onClick={() => navigate(`/events/${event.id}`)}>
            {isFull ? 'Sold Out · Details →' : 'Details & Pass →'}
          </button>
        </div>
      </div>
    </article>
  );
}

// Home Page
function Home() {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [saved, setSaved] = useState([]);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');

  const fetchEvents = () => api('/events').then(setEvents).catch(console.error);

  useEffect(() => {
    fetchEvents();
    if (user) {
      api('/me/saved').then(setSaved).catch(() => {});
    }
  }, [user]);

  const toggleSave = async id => {
    if (!user) {
      navigate('/login');
      return;
    }
    const was = saved.includes(id);
    try {
      await api(`/me/saved/${id}`, { method: was ? 'DELETE' : 'PUT' });
      setSaved(items => (was ? items.filter(x => x !== id) : [...items, id]));
    } catch (error) {
      alert(error.message);
    }
  };

  const categories = [
    { key: 'all', label: 'All Events' },
    { key: 'tech', label: 'Tech & Hackathons' },
    { key: 'culture', label: 'Culture & Fests' },
    { key: 'career', label: 'Career & Pitch' },
    { key: 'robotics', label: 'Robotics & AI' },
    { key: 'sports', label: 'Sports & Fitness' },
    { key: 'gaming', label: 'E-Sports & Gaming' }
  ];

  const visible = events.filter(event => {
    const matchCategory = filter === 'all' || event.category === filter;
    const matchQuery = `${event.title} ${event.description} ${event.venue} ${event.type}`
      .toLowerCase()
      .includes(query.toLowerCase());
    return matchCategory && matchQuery;
  });

  return (
    <>
      <Header />
      <main>
        <section className="hero">
          <div>
            <p className="eyebrow">● ABES CAMPUS · ACADEMIC YEAR 2026–27</p>
            <h1>
              Find your <em>next</em>
              <br />
              campus moment.
            </h1>
            <p className="hero-copy">
              From all-night hackathons and startup pitch rings to cultural gala nights and morning 5K runs — ABES Pulse brings the pulse of campus life into one unified rhythm.
            </p>
            <div className="actions">
              <button className="primary" onClick={() => document.querySelector('#events').scrollIntoView({ behavior: 'smooth' })}>
                Explore events ↓
              </button>
              <button className="secondary-btn" onClick={() => navigate(user ? (user.role === 'student' ? '/student' : '/organizer') : '/login')}>
                {user ? 'Open my workspace ↗' : 'Join ABES Pulse ↗'}
              </button>
            </div>
            <div className="numbers">
              <div>
                <b>{events.length}+</b>
                <span>curated events</span>
              </div>
              <div>
                <b>14</b>
                <span>student societies</span>
              </div>
              <div>
                <b>100%</b>
                <span>verified entry</span>
              </div>
            </div>
          </div>
          <div
            className="feature"
            style={{
              backgroundImage:
                "linear-gradient(0deg,rgba(9,10,22,.88),rgba(9,10,22,0.1)),url('https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=85')"
            }}
          >
            <div className="live-badge">
              <span className="live-dot" />
              <small>FEATURED FESTIVAL</small>
            </div>
            <h2>Vibrance ’26 Gala</h2>
            <p>Dance Battles · Live Rock Band · Neon Courtyard · Food Village</p>
          </div>
        </section>

        <div className="ticker">
          LIVE AT ABES · CODESTORM 2026 BUILD SPRINT · VIBRANCE ’26 CULTURAL NIGHT · FOUNDER CATALYST SEED PITCH · ROBOWARS ARENA · SUNDAY 5K RUN · E-SPORTS SHOWDOWN · OPEN MIC NIGHT
        </div>

        <section id="events" className="discover">
          <p className="eyebrow purple">● DISCOVER WHAT’S HAPPENING</p>
          <div className="section-title">
            <h2>Curated for every ambition.</h2>
            <p>Every event is created and hosted by active student societies, labs, and clubs across ABES Engineering College.</p>
          </div>
          <div className="finder">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by event title, tech stack, club, or campus venue..."
            />
            <div>
              {categories.map(item => (
                <button
                  key={item.key}
                  className={filter === item.key ? 'active' : ''}
                  onClick={() => setFilter(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="event-grid">
            {visible.length ? (
              visible.map(event => (
                <EventCard
                  key={event.id}
                  event={event}
                  saved={saved.includes(event.id)}
                  onSave={toggleSave}
                />
              ))
            ) : (
              <p className="empty">No events match your current search filters. Try selecting 'All Events'.</p>
            )}
          </div>
        </section>

        <section id="spotlight" className="spotlight">
          <div>
            <p className="eyebrow">● CAMPUS COMMUNITY</p>
            <h2>Made for the moments you'll remember after graduation.</h2>
            <p>ABES Pulse gives you instant digital entry passes, live venue alerts, team match-making, and verifiable participation certificates.</p>
          </div>
          <button className="primary" onClick={() => navigate(user ? '/student' : '/register')}>
            {user ? 'View My Student Portal →' : 'Create Free Student Account →'}
          </button>
        </section>
      </main>
      <Footer />
    </>
  );
}

// Event Details Page
function EventPage({ id }) {
  const [event, setEvent] = useState(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    api(`/events/${id}`)
      .then(data => {
        setEvent(data);
      })
      .catch(() => navigate('/'));

    if (user && user.role === 'student') {
      api('/me/registrations')
        .then(regs => {
          setIsRegistered(regs.some(r => r.eventId === id));
        })
        .catch(() => {});
    }
  }, [id, user]);

  if (!event) {
    return (
      <div className="page">
        <Header minimal />
        <p style={{ padding: '40px', textAlign: 'center' }}>Loading event details…</p>
      </div>
    );
  }

  const fillPct = event.capacity ? Math.min(100, Math.round(((event.registeredCount || 0) / event.capacity) * 100)) : 40;

  return (
    <>
      <div className="page">
        <Header minimal />
        <button className="back" onClick={() => navigate('/')}>
          ← Back to all events
        </button>

        <section
          className="event-hero"
          style={{
            backgroundImage: `linear-gradient(90deg, rgba(7,8,18,.95), rgba(7,8,18,.25)), url('${event.image}')`
          }}
        >
          <div>
            <p className="eyebrow">{event.type || 'CAMPUS EVENT'}</p>
            <h1>{event.title}</h1>
            <p>{event.description}</p>
            <div className="quick">
              <span>📅 {event.date}</span>
              <span>⏰ {event.time}</span>
              <span>📍 {event.venue}</span>
              <span>👥 {event.teamSize || 'Solo or Teams'}</span>
            </div>
          </div>
        </section>

        <section className="detail-layout">
          <article>
            <p className="eyebrow">WHY YOU SHOULD BE THERE</p>
            <h2>More than an event. A career and campus milestone.</h2>
            <p className="long-copy">{event.purpose}</p>

            {event.announcements && event.announcements.length > 0 && (
              <div style={{ margin: '30px 0' }}>
                <p className="eyebrow">LATEST ORGANIZER ANNOUNCEMENTS</p>
                <div className="broadcast-list" style={{ marginTop: '12px' }}>
                  {event.announcements.map(ann => (
                    <div key={ann.id} className="broadcast-card">
                      <div className="broadcast-head">
                        <b>📢 {ann.organizer || 'Event Desk'}</b>
                        <time>{new Date(ann.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                      </div>
                      <p>{ann.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <h2>Perks & Deliverables</h2>
            <div className="perks">
              {event.perks?.map((perk, idx) => (
                <div key={idx}>
                  <span>✦</span>
                  <b>{perk}</b>
                  <p>Guaranteed to every registered attendee who checks in.</p>
                </div>
              ))}
            </div>

            {event.schedule && event.schedule.length > 0 && (
              <>
                <h2>Event Schedule & Milestones</h2>
                <div className="schedule-timeline">
                  {event.schedule.map((item, idx) => (
                    <div key={idx} className="timeline-item">
                      <div className="timeline-time">{item.time}</div>
                      <div className="timeline-content">
                        <b>{item.title}</b>
                        <small>📍 {item.location || event.venue}</small>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </article>

          <aside className="essentials">
            <h3>Event Essentials</h3>
            <p>
              <small>DATE</small>
              {event.date}
            </p>
            <p>
              <small>TIME</small>
              {event.time}
            </p>
            <p>
              <small>VENUE</small>
              {event.venue}
            </p>
            <p>
              <small>PRIZE POOL / REWARDS</small>
              {event.prizePool || 'Certificates & Goodies'}
            </p>
            <p>
              <small>ENTRY POLICY</small>
              {event.entry || 'Free with College ID'}
            </p>
            
            <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--line)' }}>
              <div className="capacity-meter">
                <div className={`capacity-fill ${fillPct > 80 ? 'high' : ''}`} style={{ width: `${fillPct}%` }} />
              </div>
              <div className="capacity-text">
                <span>{event.registeredCount || 0} seats booked</span>
                <span>{event.capacity ? `${event.capacity} cap` : 'Open'}</span>
              </div>
            </div>

            {isRegistered ? (
              <button
                className="primary full"
                style={{ background: 'var(--success)', color: '#090b17' }}
                onClick={() => navigate('/student')}
              >
                ✓ Registered · View Pass in Portal →
              </button>
            ) : event.isSoldOut ? (
              <button className="primary full" disabled>
                Registrations Closed (Capacity Full)
              </button>
            ) : (
              <button
                className="primary full"
                onClick={() => {
                  if (!user) navigate('/login');
                  else if (user.role === 'student') navigate(`/events/${event.id}/register`);
                  else alert('Please sign in with a student account to register for events.');
                }}
              >
                Register for this event →
              </button>
            )}
          </aside>
        </section>
      </div>
      <Footer />
    </>
  );
}

// Register Event Page
function RegisterEvent({ id }) {
  const [event, setEvent] = useState(null);
  const [message, setMessage] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [registeredData, setRegisteredData] = useState(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      navigate('/login');
    } else {
      api(`/events/${id}`).then(setEvent).catch(() => navigate('/'));
    }
  }, [id, user]);

  const submit = async e => {
    e.preventDefault();
    setMessage('');
    const form = new FormData(e.currentTarget);
    const body = {
      eventId: id,
      name: form.get('name'),
      rollNo: form.get('rollNo'),
      year: form.get('year'),
      branch: form.get('branch'),
      phone: form.get('phone'),
      teamName: form.get('teamName')
    };

    try {
      const reg = await api('/registrations', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      setIsSuccess(true);
      setRegisteredData(reg);
      setMessage('Registration Confirmed! Your digital entry pass is now ready in your Student Portal.');
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <main className="registration">
      <Header minimal />
      <section>
        <div className="registration-info">
          <p className="eyebrow">EVENT REGISTRATION</p>
          <h1>{event?.title || 'Save your spot.'}</h1>
          <p>Complete your registration details. Your verified digital pass will be instantly generated and linked to your ABES student ID.</p>
          <div className="check-list">
            <div><span>✓</span> Instant Digital Entry Pass & QR Code</div>
            <div><span>✓</span> Real-time Venue Updates & Mentor Alerts</div>
            <div><span>✓</span> Automated Certificate Verification</div>
          </div>
        </div>

        {isSuccess ? (
          <div className="auth-card" style={{ background: '#fbfaf7', color: '#121322' }}>
            <h2 style={{ color: '#121322' }}>You are all set! 🎉</h2>
            <p style={{ color: '#555668' }}>
              Your ticket code is <strong style={{ color: '#2a1a6b', fontFamily: 'monospace' }}>{registeredData?.ticketCode}</strong>.
            </p>
            <div style={{ margin: '16px 0', display: 'flex', gap: '16px', alignItems: 'center', padding: '16px', border: '1px dashed #7a7a92', borderRadius: '12px', background: '#ececf4' }}>
              <div style={{ flex: 1 }}>
                <b style={{ display: 'block', fontSize: '1rem', color: '#111' }}>{event?.title}</b>
                <small style={{ color: '#555', display: 'block', marginTop: '4px' }}>📍 {event?.venue}</small>
                <small style={{ color: '#555', display: 'block' }}>📅 {event?.date}</small>
                <small style={{ color: '#2a1a6b', fontWeight: 'bold', display: 'block', marginTop: '6px' }}>
                  Student: {registeredData?.name} ({registeredData?.rollNo})
                </small>
              </div>
              <div>
                <QRCodeCanvas
                  text={JSON.stringify({
                    app: 'ABES_PULSE_2026',
                    pass: 'EVENT_PASS',
                    ticket: registeredData?.ticketCode,
                    event: event?.title,
                    roll: registeredData?.rollNo
                  })}
                  size={95}
                  downloadName={`${registeredData?.ticketCode}_ticket`}
                />
              </div>
            </div>
            <button className="primary full" onClick={() => navigate('/student')}>
              Open Student Portal & View All Passes →
            </button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <h2>Let’s get your pass ready.</h2>
            <label>
              Full Name
              <input name="name" defaultValue={user?.name} required placeholder="e.g. Aarav Sharma" />
            </label>
            <label>
              University Roll Number
              <input name="rollNo" defaultValue={user?.rollNo || ''} required placeholder="e.g. 2300320100042" />
            </label>
            <label>
              Branch / Department
              <input name="branch" defaultValue={user?.branch || ''} required placeholder="e.g. Computer Science & Engineering" />
            </label>
            <label>
              Year of Study
              <select name="year" defaultValue={user?.year || '2nd year'} required>
                <option value="1st year">1st Year</option>
                <option value="2nd year">2nd Year</option>
                <option value="3rd year">3rd Year</option>
                <option value="4th year">4th Year</option>
              </select>
            </label>
            <label>
              Contact Phone (WhatsApp for alerts)
              <input name="phone" defaultValue={user?.phone || ''} required placeholder="+91 98765 43210" />
            </label>
            <label>
              Team Name / Squad (Optional)
              <input name="teamName" placeholder="e.g. ByteForce AI" />
            </label>
            <button className="primary full">Confirm Registration & Generate Pass →</button>
            {message && <p className="form-error">{message}</p>}
          </form>
        )}
      </section>
    </main>
  );
}

// Campus Student ID Card Pass Modal with Student's Unique QR
function StudentPassModal({ user, onClose }) {
  if (!user) return null;

  const qrPayload = JSON.stringify({
    app: 'ABES_PULSE_2026',
    passType: 'CAMPUS_STUDENT_ID',
    studentId: user.id,
    name: user.name,
    rollNo: user.rollNo || '2300320100042',
    branch: user.branch || 'Computer Science & Engineering',
    year: user.year || '3rd Year',
    email: user.email,
    verified: true,
    issuedBy: 'ABES Engineering College'
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="student-id-modal-card" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <div className="campus-id-header">
          <span style={{ fontSize: '1.8rem' }}>🎓</span>
          <div>
            <h3>ABES ENGINEERING COLLEGE</h3>
            <small>VERIFIED STUDENT IDENTITY · DIGITAL CAMPUS PASS</small>
          </div>
        </div>

        <div className="campus-id-body">
          <div>
            <div className="campus-id-avatar">
              {user.avatar ? (
                <img src={user.avatar} alt={user.name} style={{ width: '100%', height: '100%', borderRadius: '14px', objectFit: 'cover' }} />
              ) : (
                user.name.charAt(0)
              )}
            </div>
            <div className="campus-id-info">
              <b>{user.name}</b>
              <p>ROLL: {user.rollNo || '2300320100042'}</p>
              <p>DEPT: {user.branch || 'Computer Science'}</p>
              <p>YEAR: {user.year || '3rd Year'}</p>
              <p style={{ color: 'var(--lime)', marginTop: '6px', fontWeight: 'bold' }}>● STATUS: ACTIVE STUDENT</p>
            </div>
          </div>
          <div>
            <QRCodeCanvas
              text={qrPayload}
              size={110}
              downloadName={`${user.rollNo || 'student'}_campus_id_pass`}
            />
          </div>
        </div>

        <div className="campus-id-footer">
          <span style={{ font: '600 0.72rem monospace', color: '#8c8ea6' }}>
            PASS ID: {user.rollNo || 'ABES-2026-PASS'}
          </span>
          <button className="primary" onClick={() => window.print()} style={{ padding: '6px 14px', fontSize: '0.74rem' }}>
            🖨️ Print ID Pass
          </button>
        </div>
      </div>
    </div>
  );
}

// Digital Ticket Modal with Unique Event & Student QR Code
function TicketModal({ reg, onClose }) {
  if (!reg) return null;
  const event = reg.event || {};

  const handleCalendar = () => {
    const title = encodeURIComponent(event.title || 'ABES Campus Event');
    const details = encodeURIComponent(`Ticket Code: ${reg.ticketCode}\nVenue: ${event.venue}\nABES Pulse Event`);
    const location = encodeURIComponent(event.venue || 'ABES Engineering College');
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&location=${location}`;
    window.open(url, '_blank');
  };

  // Distinct dynamic QR payload for this registration, student, and event
  const qrPayload = JSON.stringify({
    app: 'ABES_PULSE_2026',
    passType: 'EVENT_ENTRY_PASS',
    ticketCode: reg.ticketCode,
    eventId: reg.eventId || event.id,
    eventTitle: event.title || 'ABES Event',
    studentName: reg.name,
    rollNo: reg.rollNo,
    branch: reg.branch,
    venue: event.venue,
    date: event.date,
    checkedIn: !!reg.checkedIn,
    secToken: `ABES-SEC-${reg.ticketCode}-${reg.rollNo}`
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ width: 'min(500px, 100%)', padding: '20px' }}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <div className="digital-ticket">
          <div className="ticket-header">
            <small>ABES PULSE · DIGITAL EVENT PASS</small>
            <h2>{event.title}</h2>
          </div>
          <div className="ticket-body">
            <div className="ticket-meta-grid">
              <div>
                <small>ATTENDEE</small>
                <b>{reg.name}</b>
              </div>
              <div>
                <small>ROLL NO</small>
                <b>{reg.rollNo}</b>
              </div>
              <div>
                <small>DATE & TIME</small>
                <b>{event.date}</b>
              </div>
              <div>
                <small>VENUE</small>
                <b>{event.venue}</b>
              </div>
              <div>
                <small>BRANCH</small>
                <b>{reg.branch}</b>
              </div>
              <div>
                <small>CHECK-IN STATUS</small>
                <b style={{ color: reg.checkedIn ? 'var(--lime)' : '#ffd43b' }}>
                  {reg.checkedIn ? '✓ Verified at Venue' : 'Pending Check-in'}
                </b>
              </div>
            </div>
            <div>
              <QRCodeCanvas
                text={qrPayload}
                size={105}
                downloadName={`${reg.ticketCode}_${reg.rollNo}_pass`}
              />
            </div>
          </div>
          <div className="ticket-footer">
            <span className="ticket-code">{reg.ticketCode}</span>
            <button className="pass-action-btn" onClick={handleCalendar}>
              📅 Add to Calendar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Certificate Modal with Verifiable Cryptographic QR Code
function CertificateModal({ reg, onClose }) {
  if (!reg) return null;
  const event = reg.event || {};

  const certQrPayload = JSON.stringify({
    app: 'ABES_PULSE_2026',
    type: 'VERIFIABLE_CERTIFICATE',
    certificateId: reg.certificateId || 'CERT-2026-ABES-9921',
    student: reg.name,
    rollNo: reg.rollNo,
    branch: reg.branch,
    event: event.title,
    issuedBy: 'ABES Engineering College',
    verificationUrl: `https://abes-pulse.edu/cert/${reg.certificateId || 'CERT-2026-ABES'}`
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card cert-modal-box" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <div className="cert-seal">✦</div>
        <h2>CERTIFICATE OF PARTICIPATION</h2>
        <p className="cert-for">This is proudly presented to</p>
        <div className="cert-student-name">{reg.name}</div>
        <p style={{ color: '#bbb' }}>Roll No: {reg.rollNo} · {reg.branch}</p>
        <p className="cert-for">for exceptional contribution and active participation in</p>
        <div className="cert-event-name">{event.title}</div>
        <p style={{ color: '#9fa0b5', fontSize: '0.82rem', maxWidth: '480px', margin: '14px auto' }}>
          Organized by ABES Engineering College Campus Societies under the ABES Pulse 2026 Initiative.
        </p>

        <div className="cert-qr-container">
          <QRCodeCanvas text={certQrPayload} size={75} downloadName={`${reg.certificateId || 'cert'}_qr`} />
          <div style={{ textAlign: 'left' }}>
            <small style={{ color: 'var(--lime)', fontWeight: 'bold', display: 'block' }}>✓ CRYPTOGRAPHICALLY VERIFIED</small>
            <span style={{ fontSize: '0.72rem', color: '#ccc', fontFamily: 'monospace' }}>
              ID: {reg.certificateId || 'CERT-2026-ABES-9921'}
            </span>
          </div>
        </div>

        <div className="cert-meta-bottom" style={{ marginTop: '16px' }}>
          <span>DATE: {event.date}</span>
          <span>SEAL: VERIFIED ON-CHAIN</span>
        </div>
        <div style={{ marginTop: '20px' }}>
          <button className="primary" onClick={() => window.print()}>
            🖨️ Print / Save as PDF
          </button>
        </div>
      </div>
    </div>
  );
}

// Student Portal Component
function StudentPortal() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState('registrations');
  const [events, setEvents] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [saved, setSaved] = useState([]);
  const [activeTicket, setActiveTicket] = useState(null);
  const [activeCert, setActiveCert] = useState(null);
  const [showStudentPass, setShowStudentPass] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');

  const loadData = () => {
    Promise.all([api('/events'), api('/me/registrations'), api('/me/saved')])
      .then(([a, b, c]) => {
        setEvents(a);
        setRegistrations(b);
        setSaved(c);
      })
      .catch(console.error);
  };

  useEffect(() => {
    if (!user || user.role !== 'student') {
      navigate('/login');
      return;
    }
    loadData();
  }, [user]);

  const cancelReg = async id => {
    if (!confirm('Are you sure you want to cancel this event registration? Your ticket will be released.')) return;
    try {
      await api(`/registrations/${id}`, { method: 'DELETE' });
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const updateProfile = async e => {
    e.preventDefault();
    setProfileMsg('');
    const form = new FormData(e.currentTarget);
    try {
      await api('/me/profile', {
        method: 'PUT',
        body: JSON.stringify(Object.fromEntries(form))
      });
      setProfileMsg('Profile updated successfully!');
      setTimeout(() => setProfileMsg(''), 3000);
    } catch (err) {
      setProfileMsg(err.message);
    }
  };

  const registeredEventIds = new Set(registrations.map(r => r.eventId));
  const announcementsList = events
    .filter(e => registeredEventIds.has(e.id) && e.announcements && e.announcements.length > 0)
    .flatMap(e => e.announcements.map(a => ({ ...a, eventTitle: e.title })));

  const savedEventsList = events.filter(item => saved.includes(item.id));

  return (
    <div className="portal">
      <Header minimal />
      
      <div className="portal-top-bar">
        <div>
          <p className="eyebrow">STUDENT PORTAL & TICKETING</p>
          <h1>
            Your campus,
            <br />
            <em>in one unified rhythm.</em>
          </h1>
        </div>
        <div className="portal-profile-pill">
          <div className="portal-profile-avatar">{user?.name?.charAt(0) || 'S'}</div>
          <div className="portal-profile-info">
            <b>{user?.name}</b>
            <small>{user?.rollNo || 'Roll No: 230032...'}</small>
          </div>
          <button onClick={logout}>Sign out</button>
        </div>
      </div>

      <div className="student-id-banner">
        <div className="student-id-details">
          <h3>🎓 {user?.name} · Verified Student ID</h3>
          <div className="student-id-meta">
            <span>Roll No: <b>{user?.rollNo || '2300320100042'}</b></span>
            <span>Branch: <b>{user?.branch || 'Computer Science'}</b></span>
            <span>Year: <b>{user?.year || '3rd Year'}</b></span>
            <span>Active Passes: <b>{registrations.length}</b></span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className="secondary-btn" onClick={() => setShowStudentPass(true)}>
            🎓 Campus ID Pass & QR
          </button>
          {registrations.length > 0 && (
            <button className="student-pass-btn" onClick={() => setActiveTicket(registrations[0])}>
              🎫 View Next Entry Pass
            </button>
          )}
        </div>
      </div>

      <div className="tabs">
        <button className={tab === 'registrations' ? 'active' : ''} onClick={() => setTab('registrations')}>
          My Passes & Tickets <span className="badge-count">{registrations.length}</span>
        </button>
        <button className={tab === 'broadcasts' ? 'active' : ''} onClick={() => setTab('broadcasts')}>
          Live Broadcasts <span className="badge-count">{announcementsList.length}</span>
        </button>
        <button className={tab === 'saved' ? 'active' : ''} onClick={() => setTab('saved')}>
          Saved Events <span className="badge-count">{savedEventsList.length}</span>
        </button>
        <button className={tab === 'certs' ? 'active' : ''} onClick={() => setTab('certs')}>
          Certificates <span className="badge-count">{registrations.filter(r => r.certificateIssued || r.checkedIn).length}</span>
        </button>
        <button className={tab === 'profile' ? 'active' : ''} onClick={() => setTab('profile')}>
          Profile Settings
        </button>
      </div>

      {tab === 'registrations' && (
        <section className="portal-box">
          <div className="portal-box-header">
            <h2>Active Registrations & Event Passes</h2>
            <button className="secondary-btn" onClick={() => navigate('/')}>
              + Discover More Events
            </button>
          </div>
          {registrations.length ? (
            <div className="reg-list">
              {registrations.map(reg => (
                <div className="reg-card" key={reg.id}>
                  <div className="reg-date-box">
                    <span>{reg.event?.date || 'Upcoming'}</span>
                  </div>
                  <div className="reg-info">
                    <b>{reg.event?.title || 'Campus Event'}</b>
                    <div className="reg-info-tags">
                      <small>📍 {reg.event?.venue}</small>
                      <small>⏰ {reg.event?.time}</small>
                      <span className={`status-pill ${reg.checkedIn ? 'checked-in' : 'confirmed'}`}>
                        {reg.checkedIn ? '✓ Checked-In' : 'Confirmed'}
                      </span>
                    </div>
                  </div>
                  <div className="reg-actions">
                    <button className="pass-action-btn" onClick={() => setActiveTicket(reg)}>
                      View Pass & QR →
                    </button>
                    <button className="cancel-action-btn" onClick={() => cancelReg(reg.id)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty">You have no active event registrations. Explore upcoming events on campus!</p>
          )}
        </section>
      )}

      {tab === 'broadcasts' && (
        <section className="portal-box">
          <div className="portal-box-header">
            <h2>Organizer Announcements & Broadcasts</h2>
          </div>
          {announcementsList.length ? (
            <div className="broadcast-list">
              {announcementsList.map((ann, idx) => (
                <div key={idx} className="broadcast-card">
                  <div className="broadcast-head">
                    <b>📢 {ann.eventTitle} · {ann.organizer || 'Event Desk'}</b>
                    <time>{new Date(ann.timestamp).toLocaleString()}</time>
                  </div>
                  <p>{ann.text}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty">No active broadcast updates for your registered events at this time.</p>
          )}
        </section>
      )}

      {tab === 'saved' && (
        <section className="portal-box">
          <div className="portal-box-header">
            <h2>Bookmarked Campus Events</h2>
          </div>
          {savedEventsList.length ? (
            <div className="event-grid">
              {savedEventsList.map(event => (
                <EventCard
                  key={event.id}
                  event={event}
                  saved={true}
                  onSave={async id => {
                    await api(`/me/saved/${id}`, { method: 'DELETE' });
                    setSaved(s => s.filter(x => x !== id));
                  }}
                />
              ))}
            </div>
          ) : (
            <p className="empty">You haven’t saved any events yet. Click the heart icon on any event to bookmark it.</p>
          )}
        </section>
      )}

      {tab === 'certs' && (
        <section className="portal-box">
          <div className="portal-box-header">
            <h2>Verifiable Digital Credentials & Certificates</h2>
          </div>
          {registrations.length ? (
            <div className="cert-grid">
              {registrations.map(reg => (
                <div key={reg.id} className="cert-preview-card">
                  <div>
                    <div className="cert-badge-row">
                      <span>VERIFIED CERTIFICATE</span>
                      <small style={{ color: '#888' }}>{reg.certificateId || 'CERT-2026-ABES'}</small>
                    </div>
                    <h3>{reg.event?.title}</h3>
                    <p>Awarded to {reg.name} for active attendance and project submissions.</p>
                  </div>
                  <button className="cert-view-btn" onClick={() => setActiveCert(reg)}>
                    View Official Certificate →
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty">Certificates are automatically generated once you register and check in to campus events.</p>
          )}
        </section>
      )}

      {tab === 'profile' && (
        <section className="portal-box" style={{ maxWidth: '600px' }}>
          <h2>Student Profile Settings</h2>
          <form onSubmit={updateProfile}>
            <label>
              Full Name
              <input name="name" defaultValue={user?.name} required />
            </label>
            <label>
              University Roll Number
              <input name="rollNo" defaultValue={user?.rollNo} required />
            </label>
            <label>
              Branch / Department
              <input name="branch" defaultValue={user?.branch} required />
            </label>
            <label>
              Year of Study
              <select name="year" defaultValue={user?.year || '2nd year'}>
                <option>1st year</option>
                <option>2nd year</option>
                <option>3rd year</option>
                <option>4th year</option>
              </select>
            </label>
            <label>
              Contact Phone
              <input name="phone" defaultValue={user?.phone} />
            </label>
            <button className="primary" style={{ marginTop: '16px' }}>
              Save Profile Changes
            </button>
            {profileMsg && <p className="success">{profileMsg}</p>}
          </form>
        </section>
      )}

      {activeTicket && <TicketModal reg={activeTicket} onClose={() => setActiveTicket(null)} />}
      {activeCert && <CertificateModal reg={activeCert} onClose={() => setActiveCert(null)} />}
      {showStudentPass && <StudentPassModal user={user} onClose={() => setShowStudentPass(false)} />}
    </div>
  );
}

// Edit Event Modal for Organizers
function EditEventModal({ event, onClose, onUpdated }) {
  if (!event) return null;
  const [busy, setBusy] = useState(false);

  const submit = async e => {
    e.preventDefault();
    setBusy(true);
    const form = new FormData(e.currentTarget);
    const body = Object.fromEntries(form);
    try {
      await api(`/events/${event.id}`, {
        method: 'PUT',
        body: JSON.stringify(body)
      });
      onUpdated();
      onClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ width: 'min(580px, 100%)' }}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h2>Edit Event Details</h2>
        <form onSubmit={submit}>
          <label>
            Event Title
            <input name="title" defaultValue={event.title} required />
          </label>
          <label>
            Date
            <input name="date" defaultValue={event.date} required />
          </label>
          <label>
            Time
            <input name="time" defaultValue={event.time} required />
          </label>
          <label>
            Venue
            <input name="venue" defaultValue={event.venue} required />
          </label>
          <label>
            Capacity Cap
            <input name="capacity" type="number" defaultValue={event.capacity || 150} required />
          </label>
          <label>
            Prize Pool / Rewards
            <input name="prizePool" defaultValue={event.prizePool} />
          </label>
          <label>
            Purpose & Details
            <textarea name="purpose" defaultValue={event.purpose} required />
          </label>
          <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
            <button className="primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save Changes'}
            </button>
            <button type="button" className="secondary-btn" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Organizer Portal Component
function OrganizerPortal() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState('events');
  const [dashboard, setDashboard] = useState({
    events: [],
    totalRegistrations: 0,
    checkedInCount: 0,
    capacityUtilization: 0,
    recentRegistrations: []
  });
  const [message, setMessage] = useState('');
  const [selectedEventId, setSelectedEventId] = useState('');
  const [rosterData, setRosterData] = useState({ event: null, attendees: [] });
  const [rosterSearch, setRosterSearch] = useState('');
  const [editingEvent, setEditingEvent] = useState(null);
  const [inspectTicket, setInspectTicket] = useState(null);
  const [broadcastText, setBroadcastText] = useState('');

  const reload = () => {
    api('/organizer/dashboard')
      .then(data => {
        setDashboard(data);
        if (!selectedEventId && data.events.length > 0) {
          setSelectedEventId(data.events[0].id);
        }
      })
      .catch(() => navigate('/login'));
  };

  useEffect(() => {
    if (!user || user.role !== 'organizer') {
      navigate('/login');
      return;
    }
    reload();
  }, [user]);

  useEffect(() => {
    if (selectedEventId) {
      api(`/organizer/events/${selectedEventId}/attendees`)
        .then(setRosterData)
        .catch(console.error);
    }
  }, [selectedEventId]);

  const submitNewEvent = async e => {
    e.preventDefault();
    setMessage('');
    const form = new FormData(e.currentTarget);
    const body = Object.fromEntries(form);

    try {
      const event = await api('/events', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      setMessage(`"${event.title}" is now published and live on the student discovery feed!`);
      e.currentTarget.reset();
      reload();
    } catch (error) {
      setMessage(error.message);
    }
  };

  const removeEvent = async id => {
    if (!confirm('Are you sure you want to delete this event? All associated registrations will be cleared.')) return;
    await api(`/events/${id}`, { method: 'DELETE' });
    reload();
  };

  const toggleStatus = async (id, current) => {
    const next = current === 'open' ? 'filling_fast' : current === 'filling_fast' ? 'closed' : 'open';
    await api(`/events/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: next })
    });
    reload();
  };

  const toggleCheckIn = async regId => {
    try {
      const res = await api(`/organizer/registrations/${regId}/checkin`, { method: 'POST' });
      if (res.success) {
        setRosterData(prev => ({
          ...prev,
          attendees: prev.attendees.map(a => (a.id === regId ? res.registration : a))
        }));
        reload();
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const sendBroadcast = async e => {
    e.preventDefault();
    if (!selectedEventId || !broadcastText.trim()) return;
    try {
      await api(`/events/${selectedEventId}/announcements`, {
        method: 'POST',
        body: JSON.stringify({ text: broadcastText })
      });
      alert('Broadcast announcement published to all registered students!');
      setBroadcastText('');
      reload();
    } catch (err) {
      alert(err.message);
    }
  };

  const exportCSV = () => {
    if (!rosterData.attendees.length) {
      alert('No attendees to export for this event.');
      return;
    }
    const headers = ['Name', 'Email', 'Roll Number', 'Branch', 'Year', 'Phone', 'Team Name', 'Ticket Code', 'Checked In', 'Registered At'];
    const rows = rosterData.attendees.map(a => [
      `"${a.name}"`,
      `"${a.email}"`,
      `"${a.rollNo}"`,
      `"${a.branch}"`,
      `"${a.year}"`,
      `"${a.phone}"`,
      `"${a.teamName || 'Solo'}"`,
      `"${a.ticketCode}"`,
      `"${a.checkedIn ? 'Yes' : 'No'}"`,
      `"${a.createdAt}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${rosterData.event?.title || 'Event'}_Attendees_ABES.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredAttendees = rosterData.attendees.filter(a =>
    `${a.name} ${a.rollNo} ${a.branch} ${a.ticketCode}`
      .toLowerCase()
      .includes(rosterSearch.toLowerCase())
  );

  return (
    <div className="portal">
      <Header minimal />
      <div className="portal-top-bar">
        <div>
          <p className="eyebrow">ORGANIZER WORKSPACE & EVENT OPS</p>
          <h1>
            Publish experiences.
            <br />
            <em>Lead campus culture.</em>
          </h1>
        </div>
        <div className="portal-profile-pill">
          <div className="portal-profile-avatar" style={{ background: 'var(--violet)', color: '#fff' }}>
            {user?.name?.charAt(0) || 'O'}
          </div>
          <div className="portal-profile-info">
            <b>{user?.name}</b>
            <small>{user?.department || 'Department Coordinator'}</small>
          </div>
          <button onClick={logout}>Sign out</button>
        </div>
      </div>

      <div className="stats">
        <div>
          <b>{dashboard.events.length}</b>
          <small>published listings</small>
        </div>
        <div>
          <b>{dashboard.totalRegistrations}</b>
          <small>student registrations</small>
        </div>
        <div>
          <b>{dashboard.checkedInCount}</b>
          <small>verified checked-in</small>
        </div>
        <div>
          <b>{dashboard.capacityUtilization}%</b>
          <small>campus capacity filled</small>
        </div>
      </div>

      <div className="tabs">
        <button className={tab === 'events' ? 'active' : ''} onClick={() => setTab('events')}>
          Published Events & Management <span className="badge-count">{dashboard.events.length}</span>
        </button>
        <button className={tab === 'publish' ? 'active' : ''} onClick={() => setTab('publish')}>
          + Publish New Event
        </button>
        <button className={tab === 'roster' ? 'active' : ''} onClick={() => setTab('roster')}>
          Attendee Roster & Door Check-In
        </button>
        <button className={tab === 'broadcast' ? 'active' : ''} onClick={() => setTab('broadcast')}>
          Broadcast Announcements
        </button>
      </div>

      {tab === 'events' && (
        <section className="portal-box">
          <div className="portal-box-header">
            <h2>Your Published Campus Events</h2>
            <button className="primary" onClick={() => setTab('publish')}>
              + Create New Event
            </button>
          </div>
          {dashboard.events.length ? (
            <div className="organizer-events-list">
              {dashboard.events.map(event => (
                <div key={event.id} className="org-event-item">
                  <div className="org-event-info">
                    <b>{event.title}</b>
                    <small>
                      📅 {event.date} · 📍 {event.venue} · 👥 {event.registeredCount || 0} / {event.capacity} registered
                    </small>
                  </div>
                  <div className="org-event-actions">
                    <span className={`status-pill ${event.status || 'open'}`}>
                      {event.status || 'open'}
                    </span>
                    <button
                      className="action-btn-sm roster-btn"
                      onClick={() => {
                        setSelectedEventId(event.id);
                        setTab('roster');
                      }}
                    >
                      Roster ({event.registeredCount || 0})
                    </button>
                    <button className="action-btn-sm" onClick={() => setEditingEvent(event)}>
                      Edit
                    </button>
                    <button className="action-btn-sm" onClick={() => toggleStatus(event.id, event.status)}>
                      Status
                    </button>
                    <button className="danger" onClick={() => removeEvent(event.id)}>
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty">No events published yet. Click "Publish New Event" to get started.</p>
          )}
        </section>
      )}

      {tab === 'publish' && (
        <section className="organizer-grid">
          <form className="portal-box publish-form" onSubmit={submitNewEvent}>
            <h2>Create & Publish Campus Event</h2>
            <label>
              Event Title
              <input name="title" required placeholder="e.g. CodeStorm 2026: 24H Hackathon" />
            </label>
            <label>
              Category & Track
              <select name="category">
                <option value="tech">Tech & Hackathons</option>
                <option value="culture">Culture & Fests</option>
                <option value="career">Career & Startup Pitch</option>
                <option value="robotics">Robotics & AI</option>
                <option value="sports">Sports & Athletics</option>
                <option value="gaming">E-Sports & LAN Gaming</option>
              </select>
            </label>
            <label>
              Date of Event
              <input name="date" required placeholder="e.g. 18–19 October 2026" />
            </label>
            <label>
              Time & Duration
              <input name="time" required placeholder="e.g. 10:00 AM – 6:00 PM" />
            </label>
            <label>
              ABES Campus Venue
              <select name="venue" required>
                <option value="Innovation & Incubation Hub, Block C">Innovation & Incubation Hub, Block C</option>
                <option value="Kalpana Chawla Central Auditorium">Kalpana Chawla Central Auditorium</option>
                <option value="Ramanujan Seminar Hall, Block B">Ramanujan Seminar Hall, Block B</option>
                <option value="Central Lawn & Amphitheatre">Central Lawn & Amphitheatre</option>
                <option value="Robotics & Mechatronics Arena, Block B">Robotics & Mechatronics Arena, Block B</option>
                <option value="Sports Complex Circuit & Ground">Sports Complex Circuit & Ground</option>
                <option value="Compute Lab 4, Block C">Compute Lab 4, Block C</option>
              </select>
            </label>
            <label>
              Capacity Limit (Max Attendees)
              <input name="capacity" type="number" defaultValue="150" required />
            </label>
            <label>
              Team Structure
              <input name="teamSize" defaultValue="Teams of 2–4 members" placeholder="e.g. Solo or Teams of 2–4" />
            </label>
            <label>
              Prize Pool / Rewards
              <input name="prizePool" defaultValue="₹50,000 Cash Pool + Cloud Credits" />
            </label>
            <label>
              Detailed Purpose & What Students Will Experience
              <textarea name="purpose" required placeholder="Describe what attendees will learn, build, or experience..." />
            </label>
            <label>
              Perks Included (Comma-separated)
              <input name="perks" defaultValue="Verified Certificate, Red Bull, Mentor Hours, Swag Kit" />
            </label>
            <button className="primary full">Publish Event to ABES Pulse →</button>
            {message && <p className="success">{message}</p>}
          </form>

          <aside className="portal-box">
            <h2>Organizer Guidelines</h2>
            <div className="check-list">
              <div><span>✓</span> Listings immediately sync with student portal discovery.</div>
              <div><span>✓</span> QR codes are automatically generated for each registered attendee.</div>
              <div><span>✓</span> Real-time check-in scanner available on event day.</div>
              <div><span>✓</span> Download instant CSV reports of student names and roll numbers.</div>
            </div>
          </aside>
        </section>
      )}

      {tab === 'roster' && (
        <section className="portal-box">
          <div className="portal-box-header">
            <div>
              <h2>Attendee Roster & Door Check-In</h2>
              <small style={{ color: '#a0a2b5' }}>Select an event to view attendees and toggle entry check-in.</small>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <select
                value={selectedEventId}
                onChange={e => setSelectedEventId(e.target.value)}
                style={{ padding: '8px 12px', width: 'auto', background: '#0e1022' }}
              >
                {dashboard.events.map(ev => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title} ({ev.registeredCount || 0})
                  </option>
                ))}
              </select>
              <button className="secondary-btn" onClick={exportCSV}>
                📥 Export CSV
              </button>
            </div>
          </div>

          <div className="roster-toolbar">
            <input
              className="roster-search"
              placeholder="Search by student name, roll no, branch, or ticket code..."
              value={rosterSearch}
              onChange={e => setRosterSearch(e.target.value)}
            />
          </div>

          <div className="attendee-table-wrap">
            <table className="attendee-table">
              <thead>
                <tr>
                  <th>Student Name</th>
                  <th>Roll Number</th>
                  <th>Branch & Year</th>
                  <th>Ticket Code</th>
                  <th>Team</th>
                  <th>Check-In Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredAttendees.length ? (
                  filteredAttendees.map(att => (
                    <tr key={att.id}>
                      <td>
                        <b>{att.name}</b>
                        <small style={{ display: 'block', color: '#888' }}>{att.email}</small>
                      </td>
                      <td>{att.rollNo}</td>
                      <td>{att.branch} · {att.year}</td>
                      <td>
                        <span style={{ fontFamily: 'monospace', color: 'var(--lime)' }}>{att.ticketCode}</span>
                      </td>
                      <td>{att.teamName || 'Solo'}</td>
                      <td>
                        <span className={`status-pill ${att.checkedIn ? 'checked-in' : 'confirmed'}`}>
                          {att.checkedIn ? 'Checked-In' : 'Registered'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <button
                            className="action-btn-sm"
                            style={{ padding: '6px 9px', whiteSpace: 'nowrap' }}
                            onClick={() => setInspectTicket({ ...att, event: rosterData.event })}
                            title="View & scan attendee's dynamic entry QR code"
                          >
                            🎫 QR Pass
                          </button>
                          <button
                            className={`checkin-btn ${att.checkedIn ? 'checked' : ''}`}
                            onClick={() => toggleCheckIn(att.id)}
                          >
                            {att.checkedIn ? '✓ Admitted' : 'Check In'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: '#999' }}>
                      No attendees found for this event search query.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'broadcast' && (
        <section className="portal-box" style={{ maxWidth: '650px' }}>
          <h2>Broadcast Announcement to Attendees</h2>
          <p style={{ color: '#a0a2b5', fontSize: '0.84rem' }}>
            Send instant alerts, room location updates, or schedule changes to all students registered for an event.
          </p>
          <form onSubmit={sendBroadcast}>
            <label>
              Target Event
              <select
                value={selectedEventId}
                onChange={e => setSelectedEventId(e.target.value)}
                required
              >
                {dashboard.events.map(ev => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title} ({ev.registeredCount || 0} attendees)
                  </option>
                ))}
              </select>
            </label>
            <label>
              Broadcast Message
              <textarea
                value={broadcastText}
                onChange={e => setBroadcastText(e.target.value)}
                required
                placeholder="e.g. Please report to Innovation Hub Desk 4 for hardware credentials at 10:30 AM."
              />
            </label>
            <button className="primary" style={{ marginTop: '16px' }}>
              📢 Send Broadcast to Attendees
            </button>
          </form>
        </section>
      )}

      {editingEvent && (
        <EditEventModal
          event={editingEvent}
          onClose={() => setEditingEvent(null)}
          onUpdated={reload}
        />
      )}

      {inspectTicket && (
        <TicketModal
          reg={inspectTicket}
          onClose={() => setInspectTicket(null)}
        />
      )}
    </div>
  );
}

// Google Account Selector / Modal for instant sign in
function GoogleAuthModal({ role, onClose, onAuthenticated }) {
  const [customEmail, setCustomEmail] = useState('');
  const [customName, setCustomName] = useState('');
  const [busy, setBusy] = useState(false);

  const sampleGoogleAccounts = [
    { name: 'Aarav Sharma (College Google)', email: 'aarav.sharma@abes.ac.in', picture: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80' },
    { name: 'Vaibhav Goyal (Faculty / Lead)', email: 'vaibhav.goyal@abes.ac.in', picture: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=120&q=80' },
    { name: 'Personal Google Account', email: 'student.abes2026@gmail.com', picture: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=120&q=80' }
  ];

  const handleSelectAccount = async acc => {
    setBusy(true);
    try {
      await onAuthenticated({
        email: acc.email,
        name: acc.name,
        picture: acc.picture,
        role
      });
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCustomSubmit = async e => {
    e.preventDefault();
    if (!customEmail) return;
    setBusy(true);
    try {
      await onAuthenticated({
        email: customEmail.trim(),
        name: customName.trim() || customEmail.split('@')[0],
        role
      });
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card google-account-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <svg className="google-icon" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
          </svg>
          <h2 style={{ margin: 0 }}>Sign in with Google</h2>
        </div>
        <p>Choose an account to continue to ABES Pulse as <b>{role === 'student' ? 'Student' : 'Organizer'}</b>.</p>

        <div className="google-accounts-list">
          {sampleGoogleAccounts.map((acc, idx) => (
            <div key={idx} className="google-acc-card" onClick={() => handleSelectAccount(acc)}>
              <div className="google-acc-avatar">
                {acc.name.charAt(0)}
              </div>
              <div className="google-acc-info">
                <b>{acc.name}</b>
                <small>{acc.email}</small>
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={handleCustomSubmit} style={{ borderTop: '1px solid var(--line)', paddingTop: '14px', marginTop: '10px' }}>
          <label style={{ margin: 0 }}>
            Or enter any Google / ABES Email:
            <input
              type="email"
              value={customEmail}
              onChange={e => setCustomEmail(e.target.value)}
              placeholder="e.g. yourname@abes.ac.in"
              required
            />
          </label>
          <label>
            Display Name (Optional):
            <input
              value={customName}
              onChange={e => setCustomName(e.target.value)}
              placeholder="e.g. Aarav Sharma"
            />
          </label>
          <button className="primary full" disabled={busy} style={{ marginTop: '12px' }}>
            {busy ? 'Connecting to Google…' : 'Continue with this Google Account →'}
          </button>
        </form>
      </div>
    </div>
  );
}

// Authentication Page (Sign In & Sign Up)
function AuthPage({ register = false }) {
  const [role, setRole] = useState('student');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const { login } = useAuth();

  const handleGoogleSuccess = async googlePayload => {
    setBusy(true);
    setMessage('');
    try {
      const data = await api('/auth/google', {
        method: 'POST',
        body: JSON.stringify({
          ...googlePayload,
          role
        })
      });
      login(data);
      setShowGoogleModal(false);
      navigate(data.user.role === 'student' ? '/student' : '/organizer');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleBtnClick = () => {
    // If window.google with client ID is available
    if (window.google?.accounts?.id && import.meta.env?.VITE_GOOGLE_CLIENT_ID) {
      try {
        window.google.accounts.id.initialize({
          client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
          callback: response => {
            if (response.credential) {
              handleGoogleSuccess({ credential: response.credential });
            }
          }
        });
        window.google.accounts.id.prompt();
        return;
      } catch (e) {
        console.warn('Google One Tap init fallback', e);
      }
    }
    setShowGoogleModal(true);
  };

  const submit = async e => {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    const form = new FormData(e.currentTarget);
    const body = Object.fromEntries(form);

    try {
      const data = await api(`/auth/${register ? 'register' : 'login'}`, {
        method: 'POST',
        body: JSON.stringify(body)
      });
      login(data);
      navigate(data.user.role === 'student' ? '/student' : '/organizer');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const quickLogin = async demoRole => {
    setBusy(true);
    setMessage('');
    try {
      const payload =
        demoRole === 'student'
          ? { email: 'aarav.23cs102@abes.ac.in', password: 'Student#2026', role: 'student' }
          : { email: 'vaibhav.25b15410097@abes.ac.in', password: 'Vaibhav#2025', role: 'organizer' };

      const data = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      login(data);
      navigate(data.user.role === 'student' ? '/student' : '/organizer');
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth">
      <Brand />
      <section>
        <div className="auth-intro">
          <p className="eyebrow">CAMPUS ACCESS</p>
          <h1>{register ? 'Your next chapter starts here.' : 'Make your next move.'}</h1>
          <p>
            Discover the best of ABES campus life, manage your event passes, or publish experiences worth showing up for.
          </p>
        </div>

        <form onSubmit={submit} className="auth-card">
          <h2>{register ? 'Create an account.' : `${role === 'student' ? 'Student' : 'Organizer'} sign in.`}</h2>
          <p>
            {register
              ? 'Choose your role and get started with your ABES credentials.'
              : 'Choose your portal and sign in to continue.'}
          </p>

          {!register && (
            <div className="role-pills">
              <button
                type="button"
                className={role === 'student' ? 'active' : ''}
                onClick={() => setRole('student')}
              >
                Student Portal
                <small>Discover & Register</small>
              </button>
              <button
                type="button"
                className={role === 'organizer' ? 'active' : ''}
                onClick={() => setRole('organizer')}
              >
                Organizer Workspace
                <small>Publish & Manage</small>
              </button>
            </div>
          )}

          {register && (
            <div className="role-pills">
              <button
                type="button"
                className={role === 'student' ? 'active' : ''}
                onClick={() => setRole('student')}
              >
                I am a Student
                <small>Event passes & certificates</small>
              </button>
              <button
                type="button"
                className={role === 'organizer' ? 'active' : ''}
                onClick={() => setRole('organizer')}
              >
                I am an Organizer
                <small>Host & manage events</small>
              </button>
            </div>
          )}

          {/* Google Authentication Button */}
          <button
            type="button"
            className="google-btn"
            onClick={handleGoogleBtnClick}
            disabled={busy}
          >
            <svg className="google-icon" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            Continue with Google
          </button>

          <div className="auth-divider">
            <span>or continue with email</span>
          </div>

          {register && (
            <>
              <label>
                Full Name
                <input name="name" required placeholder="e.g. Aarav Sharma" />
              </label>
              {role === 'student' && (
                <>
                  <label>
                    Roll Number
                    <input name="rollNo" placeholder="e.g. 2300320100042" />
                  </label>
                  <label>
                    Branch
                    <input name="branch" placeholder="e.g. Computer Science & Engineering" />
                  </label>
                </>
              )}
            </>
          )}

          <input type="hidden" name="role" value={role} />
          <label>
            College Email
            <input
              name="email"
              type="email"
              required
              placeholder={role === 'student' ? 'student.23cs@abes.ac.in' : 'organizer@abes.ac.in'}
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              minLength="4"
              required
              placeholder="••••••••"
            />
          </label>

          <button className="primary full" disabled={busy}>
            {busy ? 'Please wait…' : register ? 'Create Account →' : `Sign in as ${role === 'student' ? 'Student' : 'Organizer'} →`}
          </button>

          {!register && (
            <div className="demo-login-box">
              <p>⚡ QUICK DEMO LOGINS</p>
              <div className="demo-buttons">
                <button type="button" onClick={() => quickLogin('student')}>
                  Student Demo (Aarav)
                </button>
                <button type="button" onClick={() => quickLogin('organizer')}>
                  Organizer Demo (Vaibhav)
                </button>
              </div>
            </div>
          )}

          {message && <p className="form-error">{message}</p>}

          <p className="switch">
            {register ? 'Already have an account?' : 'New to ABES Pulse?'}{' '}
            <button type="button" onClick={() => navigate(register ? '/login' : '/register')}>
              {register ? 'Sign in' : 'Create an account'}
            </button>
          </p>
        </form>
      </section>

      {showGoogleModal && (
        <GoogleAuthModal
          role={role}
          onClose={() => setShowGoogleModal(false)}
          onAuthenticated={handleGoogleSuccess}
        />
      )}
    </main>
  );
}

// Footer
function Footer() {
  return <footer>ABES Engineering College · ABES Pulse · Campus experiences, made easy.</footer>;
}

// Main App Router
function App() {
  const [location, setLocation] = useState(window.location.pathname);
  const [session, setSession] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('abes-user'));
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const update = () => setLocation(window.location.pathname);
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);

  const login = data => {
    localStorage.setItem('abes-token', data.token);
    localStorage.setItem('abes-user', JSON.stringify(data.user));
    setSession(data.user);
  };

  const logout = () => {
    localStorage.removeItem('abes-token');
    localStorage.removeItem('abes-user');
    setSession(null);
    navigate('/');
  };

  let content;
  if (location === '/') {
    content = <Home />;
  } else if (location === '/login') {
    content = <AuthPage />;
  } else if (location === '/register') {
    content = <AuthPage register />;
  } else if (location === '/student') {
    content = <StudentPortal />;
  } else if (location === '/organizer') {
    content = <OrganizerPortal />;
  } else if (location.match(/^\/events\/([^/]+)\/register$/)) {
    content = <RegisterEvent id={location.split('/')[2]} />;
  } else if (location.match(/^\/events\/([^/]+)$/)) {
    content = <EventPage id={location.split('/')[2]} />;
  } else {
    content = <Home />;
  }

  return (
    <AuthContext.Provider value={{ user: session, login, logout }}>
      {content}
    </AuthContext.Provider>
  );
}

createRoot(document.getElementById('root')).render(<App />);

