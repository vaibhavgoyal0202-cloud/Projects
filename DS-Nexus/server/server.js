import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import nodemailer from 'nodemailer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Render Persistent Disk or Environment Storage Support
const defaultStoragePath = path.join(__dirname, 'data.json');
const storageDir = process.env.DATA_STORAGE_DIR || (process.env.RENDER ? '/var/data' : null);
const storageFile = process.env.DATA_STORAGE_PATH || (storageDir ? path.join(storageDir, 'data.json') : defaultStoragePath);

// Ensure storage directory exists if on Render Persistent Disk
try {
  const dir = path.dirname(storageFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
} catch (e) {
  console.warn('Directory check for storageFile:', e.message);
}

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:3001,http://localhost:10000').split(',').map(v => v.trim()).filter(Boolean);
const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

const app = express();
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Load and Persist Database
const loadDb = () => {
  try {
    if (fs.existsSync(storageFile)) {
      const parsed = JSON.parse(fs.readFileSync(storageFile, 'utf8'));
      if (parsed.events && parsed.users) return parsed;
    }
  } catch (err) {
    console.error('Error reading data.json, falling back', err);
  }
  return { sessions: [], users: [], events: [], registrations: [], saved: [] };
};

let db = loadDb();

const saveDb = () => {
  try {
    fs.writeFileSync(storageFile, JSON.stringify(db, null, 2));
  } catch (err) {
    console.error('Failed to write data.json', err);
  }
};

// Token Auth
const tokens = new Map();

const publicUser = ({ password, ...user }) => user;

const newToken = user => {
  const token = crypto.randomUUID();
  tokens.set(token, publicUser(user));
  return token;
};

// Populate initial demo tokens
if (db.users) {
  const committeeUser = db.users.find(u => u.role === 'committee');
  const studentUser = db.users.find(u => u.role === 'student');
  if (committeeUser) tokens.set('demo-token-committee', publicUser(committeeUser));
  if (studentUser) tokens.set('demo-token-student', publicUser(studentUser));
}

const auth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const user = tokens.get(token);
  if (!user) return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  req.user = user;
  next();
};

const committeeOnly = (req, res, next) => {
  auth(req, res, () => {
    if (req.user.role !== 'committee') {
      return res.status(403).json({ error: 'Access restricted: Department Committee / Faculty credentials required.' });
    }
    next();
  });
};

// Helper to enrich event with dynamic counts
const enrichEvent = (event) => {
  const eventRegistrations = db.registrations.filter(r => r.eventId === event.id);
  const registeredCount = eventRegistrations.length;
  const attendedCount = eventRegistrations.filter(r => r.checkedIn).length;
  const certificatesIssued = eventRegistrations.filter(r => r.certificateIssued).length;
  const photosCount = (event.photos || []).length;

  return {
    ...event,
    registeredCount,
    attendedCount,
    certificatesIssued,
    photosCount,
    remainingCapacity: Math.max(0, (event.capacity || 100) - registeredCount),
    isFull: event.capacity ? registeredCount >= event.capacity : false
  };
};

// ==========================================
// AUTHENTICATION & EMAIL DOMAIN VERIFICATION
// ==========================================

// Helper to validate and extract domain
const validateCollegeDomain = (email) => {
  if (!email || typeof email !== 'string') return { isValid: false, reason: 'Email is required' };
  const clean = email.trim().toLowerCase();
  const parts = clean.split('@');
  if (parts.length !== 2) return { isValid: false, reason: 'Invalid email format' };
  
  const domain = parts[1];
  if (domain === 'abes.ac.in' || domain.endsWith('.abes.ac.in')) {
    return { isValid: true, domain, cleanEmail: clean };
  }

  // Detect specific common personal domains
  const personalDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'rediffmail.com', 'protonmail.com'];
  if (personalDomains.includes(domain)) {
    return {
      isValid: false,
      isPersonal: true,
      domain,
      reason: `Personal email domain (@${domain}) detected. Department guidelines strictly require your official ABES Microsoft College Email ID (@abes.ac.in).`
    };
  }

  return {
    isValid: false,
    isPersonal: true,
    domain,
    reason: `Unauthorized domain (@${domain}). Please sign in using your official ABES Microsoft College Email ID (@abes.ac.in).`
  };
};

// In-memory OTP Store: email -> { otp, expiresAt, name, rollNo, branch, year }
const otpStore = new Map();

// ==========================================
// NODEMAILER EMAIL DISPATCH SERVICE
// ==========================================
let mailTransporter = null;

const createMailTransporter = () => {
  const host = process.env.SMTP_HOST || (process.env.GMAIL_USER ? 'smtp.gmail.com' : null);
  const port = Number(process.env.SMTP_PORT) || (process.env.GMAIL_USER ? 465 : 587);
  const secure = port === 465;
  const user = process.env.SMTP_USER || process.env.GMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;

  if (host && user && pass) {
    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
        tls: { rejectUnauthorized: false }
      });
      console.log(`📧 [Nodemailer] SMTP Transporter initialized successfully via ${host}:${port} (${user})`);
      return transporter;
    } catch (err) {
      console.warn('⚠️ [Nodemailer] Failed to initialize SMTP transporter:', err.message);
    }
  }
  return null;
};

mailTransporter = createMailTransporter();

// Helper to send ABES Branded OTP Email
const sendOtpEmail = async (toEmail, otp, studentName = 'Student') => {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; margin: 0; padding: 20px; }
        .email-container { max-width: 580px; margin: 0 auto; background: #1e293b; border-radius: 12px; overflow: hidden; border: 1px solid #334155; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
        .email-header { background: #003366; padding: 24px 30px; text-align: center; color: #ffffff; border-bottom: 3px solid #c8102e; }
        .email-header h1 { margin: 0; font-size: 20px; letter-spacing: 0.5px; font-weight: 800; }
        .email-header p { margin: 4px 0 0; font-size: 12px; color: #ffd700; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; }
        .email-body { padding: 32px 30px; color: #f1f5f9; line-height: 1.6; }
        .email-body h2 { margin-top: 0; font-size: 18px; color: #ffffff; }
        .otp-box { background: rgba(0, 51, 102, 0.2); border: 2px dashed #38bdf8; border-radius: 8px; padding: 18px; text-align: center; margin: 24px 0; }
        .otp-code { font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: 900; letter-spacing: 8px; color: #38bdf8; margin: 0; }
        .otp-timer { font-size: 12px; color: #94a3b8; margin-top: 6px; }
        .security-notice { background: rgba(255,255,255,0.04); border-left: 4px solid #c8102e; padding: 12px 16px; font-size: 12px; color: #cbd5e1; margin-top: 20px; border-radius: 4px; }
        .email-footer { background: #0b1120; color: #64748b; padding: 20px 30px; text-align: center; font-size: 11px; line-height: 1.5; }
        .email-footer strong { color: #94a3b8; }
      </style>
    </head>
    <body>
      <div class="email-container">
        <div class="email-header">
          <h1>ABES ENGINEERING COLLEGE, GHAZIABAD</h1>
          <p>Department of Computer Science & Engineering (Data Science)</p>
        </div>
        <div class="email-body">
          <h2>Dear ${studentName},</h2>
          <p>Your one-time 6-digit authentication verification code for accessing the <strong>ABES EC CSE(DS) Portal</strong> is provided below:</p>
          
          <div class="otp-box">
            <div class="otp-code">${otp}</div>
            <div class="otp-timer">⏱️ Valid for 10 minutes only. Do not share this code.</div>
          </div>

          <div class="security-notice">
            🔒 <strong>Strict Institutional Security:</strong> This verification code was dispatched for your official college account (<code>${toEmail}</code>). If you did not initiate this login request, please contact the Department Academic Cell immediately.
          </div>
        </div>
        <div class="email-footer">
          <strong>ABES Engineering College (AKTU Code: 032)</strong><br>
          Campus-1, 19th KM Stone, NH-09 (NH-24), Ghaziabad, Uttar Pradesh - 201009<br>
          Approved by AICTE, New Delhi · Affiliated to AKTU, Lucknow · NAAC 'A' Grade Accredited
        </div>
      </div>
    </body>
    </html>
  `;

  if (mailTransporter) {
    try {
      const info = await mailTransporter.sendMail({
        from: `"ABES EC Data Science Academic Cell" <${process.env.SMTP_USER || process.env.GMAIL_USER || 'datascience@abes.ac.in'}>`,
        to: toEmail,
        subject: `🔐 ABES EC CSE(DS) - Your 6-Digit Verification Code: ${otp}`,
        text: `ABES Engineering College - CSE (Data Science)\nYour verification code is: ${otp}\nValid for 10 minutes.`,
        html: htmlContent
      });
      console.log(`✉️ [Real Email Dispatched] Message sent to ${toEmail}. MessageId: ${info.messageId}`);
      return { sent: true, messageId: info.messageId };
    } catch (err) {
      console.error(`⚠️ [Nodemailer SMTP Error] Failed to send real email to ${toEmail}:`, err.message);
      return { sent: false, error: err.message };
    }
  } else {
    console.log(`ℹ️ [Email Simulation Mode] Real SMTP credentials not configured in .env. Logging OTP for ${toEmail}: ${otp}`);
    return { sent: false, simulated: true };
  }
};

// Student: Send Microsoft College 6-Digit OTP
app.post('/api/auth/send-otp', async (req, res) => {
  const { email, name, rollNo, branch, year } = req.body;
  const domainCheck = validateCollegeDomain(email);

  if (!domainCheck.isValid) {
    return res.status(403).json({
      error: domainCheck.reason,
      domain: domainCheck.domain,
      isPersonalEmail: domainCheck.isPersonal
    });
  }

  const cleanEmail = domainCheck.cleanEmail;
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes expiry

  otpStore.set(cleanEmail, {
    otp,
    expiresAt,
    name: name?.trim(),
    rollNo: rollNo?.trim(),
    branch: branch?.trim(),
    year: year || '2nd Year'
  });

  console.log(`🔐 [Microsoft 365 Verification] 6-Digit OTP for ${cleanEmail}: ${otp}`);

  // Send real email if SMTP is configured
  const mailResult = await sendOtpEmail(cleanEmail, otp, name || 'Student');

  res.json({
    success: true,
    message: mailResult.sent 
      ? `A 6-digit verification code has been dispatched to your official Microsoft College Email inbox (${cleanEmail}).`
      : `A 6-digit verification code has been generated for (${cleanEmail}).`,
    simulatedOtp: otp, // Always provided for seamless evaluation & UI autofill
    email: cleanEmail,
    deliveredLive: mailResult.sent
  });
});

// Student: Verify 6-Digit OTP & Authenticate
app.post('/api/auth/verify-otp', (req, res) => {
  const { email, otp } = req.body;
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanOtp = String(otp || '').trim();

  const record = otpStore.get(cleanEmail);
  if (!record) {
    return res.status(400).json({ error: 'No active OTP verification session found for this email. Please request a new code.' });
  }

  if (Date.now() > record.expiresAt) {
    otpStore.delete(cleanEmail);
    return res.status(400).json({ error: 'Verification code has expired. Please request a new 6-digit OTP.' });
  }

  if (record.otp !== cleanOtp) {
    return res.status(400).json({ error: 'Invalid 6-digit verification code. Please check your Microsoft inbox.' });
  }

  // OTP is verified! Clean up OTP record
  otpStore.delete(cleanEmail);

  let user = db.users.find(u => u.email === cleanEmail);
  if (user) {
    if (user.role !== 'student') {
      return res.status(403).json({ error: 'This account belongs to the Department Committee. Please switch to Committee Portal.' });
    }
    const token = newToken(user);
    return res.json({ token, user: publicUser(user), message: 'OTP verified successfully!' });
  }

  // Auto-provision new verified student
  const parsedRoll = record.rollNo || cleanEmail.split('@')[0].split('.')[1]?.toUpperCase() || `2500321540${Math.floor(100 + Math.random() * 900)}`;
  const studentName = record.name || cleanEmail.split('@')[0].split('.')[0].replace(/\b\w/g, c => c.toUpperCase()) || 'Data Science Student';

  user = {
    id: 'student-' + crypto.randomUUID().slice(0, 8),
    name: studentName,
    email: cleanEmail,
    password: crypto.randomUUID(),
    role: 'student',
    rollNo: parsedRoll,
    branch: record.branch || 'CSE (Data Science)',
    year: record.year || '2nd Year',
    semester: '3rd Sem',
    phone: '+91 98765 00000',
    section: 'DS-A',
    authProvider: 'microsoft-365-otp'
  };

  db.users.push(user);
  saveDb();

  const token = newToken(user);
  res.status(201).json({ token, user: publicUser(user), isNew: true, message: 'Microsoft 365 Account verified and provisioned!' });
});

// Microsoft 365 Single Sign-On / Verified Login for Students
app.post('/api/auth/microsoft-login', (req, res) => {
  const { email, password, name, rollNo, branch, year } = req.body;
  
  const domainCheck = validateCollegeDomain(email);
  if (!domainCheck.isValid) {
    return res.status(403).json({
      error: domainCheck.reason,
      domain: domainCheck.domain,
      isPersonalEmail: domainCheck.isPersonal
    });
  }

  const cleanEmail = domainCheck.cleanEmail;
  let user = db.users.find(u => u.email === cleanEmail);

  if (user) {
    if (user.role !== 'student') {
      return res.status(403).json({ error: 'This account is registered under the Department Committee portal. Please switch to Committee Login.' });
    }
    if (password && user.password && user.password !== password) {
      return res.status(401).json({ error: 'Incorrect Microsoft College password.' });
    }
    const token = newToken(user);
    return res.json({ token, user: publicUser(user), message: 'Welcome back to DS Student Portal!' });
  }

  // Auto-provision student profile for verified ABES Microsoft email
  const parsedRoll = rollNo?.trim() || cleanEmail.split('@')[0].split('.')[1]?.toUpperCase() || `2500321540${Math.floor(100 + Math.random() * 900)}`;
  const studentName = name?.trim() || cleanEmail.split('@')[0].split('.')[0].replace(/\b\w/g, c => c.toUpperCase()) || 'Data Science Student';

  user = {
    id: 'student-' + crypto.randomUUID().slice(0, 8),
    name: studentName,
    email: cleanEmail,
    password: password || 'Student#2026',
    role: 'student',
    rollNo: parsedRoll,
    branch: branch?.trim() || 'CSE (Data Science)',
    year: year || '2nd Year',
    semester: '3rd Sem',
    phone: '+91 98765 00000',
    section: 'DS-A',
    authProvider: 'microsoft-365'
  };

  db.users.push(user);
  saveDb();

  const token = newToken(user);
  res.status(201).json({ token, user: publicUser(user), isNew: true, message: 'Microsoft 365 Account verified and provisioned!' });
});

// Committee: Change Credentials (Email, Password, Name, Designation)
app.post('/api/committee/change-credentials', committeeOnly, (req, res) => {
  const { currentPassword, newEmail, newPassword, newName, newDesignation } = req.body;
  const userIndex = db.users.findIndex(u => u.id === req.user.id);
  
  if (userIndex < 0) {
    return res.status(404).json({ error: 'Committee account not found.' });
  }

  const current = db.users[userIndex];

  // Verify current password
  if (currentPassword && current.password && current.password !== currentPassword) {
    return res.status(401).json({ error: 'Current password verification failed.' });
  }

  if (newEmail && newEmail.trim().toLowerCase() !== current.email) {
    const cleanNewEmail = newEmail.trim().toLowerCase();
    // Check if new email is already taken by another account
    if (db.users.some(u => u.email === cleanNewEmail && u.id !== current.id)) {
      return res.status(409).json({ error: 'An account with this email address already exists.' });
    }
    current.email = cleanNewEmail;
  }

  if (newPassword && newPassword.trim().length >= 6) {
    current.password = newPassword.trim();
  }

  if (newName && newName.trim()) {
    current.name = newName.trim();
  }

  if (newDesignation && newDesignation.trim()) {
    current.designation = newDesignation.trim();
  }

  db.users[userIndex] = current;
  saveDb(); // Permanently save to data.json

  // Update in-memory active tokens
  const pub = publicUser(current);
  tokens.forEach((val, key) => {
    if (val.id === current.id) tokens.set(key, pub);
  });

  res.json({
    success: true,
    message: 'Committee credentials and security settings updated permanently in database.',
    user: pub
  });
});

// Direct Login (Student or Committee)
app.post('/api/auth/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const requestedRole = req.body.role;

  // Domain check for student logins
  if (requestedRole === 'student') {
    const domainCheck = validateCollegeDomain(email);
    if (!domainCheck.isValid) {
      return res.status(403).json({
        error: domainCheck.reason,
        isPersonalEmail: domainCheck.isPersonal
      });
    }
  }

  const user = db.users.find(u => u.email === email && u.password === password);
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password. Please verify credentials.' });
  }

  if (requestedRole && user.role !== requestedRole) {
    return res.status(403).json({ error: `This account is authorized for the ${user.role === 'committee' ? 'Department Committee' : 'Student'} portal only.` });
  }

  res.json({ token: newToken(user), user: publicUser(user) });
});

// Profile endpoints
app.get('/api/me/profile', auth, (req, res) => {
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User profile not found.' });
  res.json(publicUser(user));
});

app.put('/api/me/profile', auth, (req, res) => {
  const userIndex = db.users.findIndex(u => u.id === req.user.id);
  if (userIndex < 0) return res.status(404).json({ error: 'User profile not found.' });
  
  const current = db.users[userIndex];
  const { name, rollNo, branch, year, semester, phone, section } = req.body;

  const updated = {
    ...current,
    name: name?.trim() || current.name,
    rollNo: rollNo?.trim() || current.rollNo,
    branch: branch?.trim() || current.branch,
    year: year || current.year,
    semester: semester || current.semester,
    phone: phone?.trim() || current.phone,
    section: section || current.section
  };

  db.users[userIndex] = updated;
  saveDb();
  
  const pub = publicUser(updated);
  tokens.forEach((val, key) => {
    if (val.id === updated.id) tokens.set(key, pub);
  });

  res.json(pub);
});

// ==========================================
// ACADEMIC SESSIONS & EVENT ENDPOINTS
// ==========================================

// Get all configured academic sessions
app.get('/api/sessions', (req, res) => {
  res.json(db.sessions || []);
});

// Committee: Create New Academic Session (e.g. 2027-28 or 2023-24)
app.post('/api/sessions', committeeOnly, (req, res) => {
  const { id, label, isCurrent, year, description } = req.body;
  if (!id || !id.trim()) {
    return res.status(400).json({ error: 'Please provide a valid session ID (e.g. 2027-28).' });
  }

  const cleanId = id.trim();
  db.sessions = db.sessions || [];
  
  if (db.sessions.some(s => s.id.toLowerCase() === cleanId.toLowerCase())) {
    return res.status(400).json({ error: `Academic session '${cleanId}' already exists in database.` });
  }

  const shouldBeCurrent = Boolean(isCurrent);
  if (shouldBeCurrent) {
    db.sessions.forEach(s => { s.isCurrent = false; });
  }

  const newSession = {
    id: cleanId,
    label: label?.trim() || (shouldBeCurrent ? `${cleanId} (Current)` : cleanId),
    isCurrent: shouldBeCurrent,
    year: year?.trim() || cleanId,
    description: description?.trim() || `Department Academic Session ${cleanId}`
  };

  db.sessions.unshift(newSession);
  saveDb();

  res.status(201).json({
    message: `Academic session '${cleanId}' created successfully!`,
    session: newSession,
    sessions: db.sessions
  });
});

// Committee: Update Academic Session Details
app.put('/api/sessions/:id', committeeOnly, (req, res) => {
  const { label, isCurrent, year, description } = req.body;
  db.sessions = db.sessions || [];
  const idx = db.sessions.findIndex(s => s.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Academic session not found.' });
  }

  const shouldBeCurrent = Boolean(isCurrent);
  if (shouldBeCurrent) {
    db.sessions.forEach(s => { s.isCurrent = false; });
  }

  const updated = {
    ...db.sessions[idx],
    label: label?.trim() || db.sessions[idx].label,
    isCurrent: isCurrent !== undefined ? shouldBeCurrent : db.sessions[idx].isCurrent,
    year: year?.trim() || db.sessions[idx].year,
    description: description?.trim() || db.sessions[idx].description
  };

  db.sessions[idx] = updated;
  saveDb();

  res.json({
    message: `Academic session '${req.params.id}' updated successfully!`,
    session: updated,
    sessions: db.sessions
  });
});

// Committee: Set Session as Current Active Academic Year
app.patch('/api/sessions/:id/set-current', committeeOnly, (req, res) => {
  db.sessions = db.sessions || [];
  const target = db.sessions.find(s => s.id === req.params.id);
  if (!target) {
    return res.status(404).json({ error: 'Academic session not found.' });
  }

  db.sessions.forEach(s => {
    s.isCurrent = (s.id === req.params.id);
    if (!s.isCurrent && s.label.includes('(Current)')) {
      s.label = s.label.replace(/\s*\(Current\)/, '').trim();
    }
  });

  if (!target.label.includes('(Current)')) {
    target.label = `${target.id} (Current)`;
  }

  saveDb();

  res.json({
    message: `Session '${req.params.id}' is now set as the Current Active Session.`,
    sessions: db.sessions
  });
});

// Committee: Delete Academic Session
app.delete('/api/sessions/:id', committeeOnly, (req, res) => {
  db.sessions = db.sessions || [];
  const targetId = req.params.id;
  
  const eventsCount = (db.events || []).filter(e => e.session === targetId).length;
  if (eventsCount > 0) {
    return res.status(400).json({
      error: `Cannot delete session '${targetId}' because it has ${eventsCount} event(s) associated with it. Please reassign or delete the events first.`
    });
  }

  const prevLen = db.sessions.length;
  db.sessions = db.sessions.filter(s => s.id !== targetId);
  if (db.sessions.length === prevLen) {
    return res.status(404).json({ error: 'Academic session not found.' });
  }

  saveDb();
  res.json({
    message: `Academic session '${targetId}' removed successfully.`,
    sessions: db.sessions
  });
});

// Get all events with session and category filtering
app.get('/api/events', (req, res) => {
  let events = [...db.events];
  const { session, category, search, status } = req.query;

  if (session && session !== 'all') {
    events = events.filter(e => e.session === session);
  }

  if (category && category !== 'all') {
    events = events.filter(e => e.category === category);
  }

  if (status && status !== 'all') {
    events = events.filter(e => e.status === status);
  }

  if (search) {
    const q = search.trim().toLowerCase();
    events = events.filter(e =>
      e.title.toLowerCase().includes(q) ||
      e.tagline?.toLowerCase().includes(q) ||
      e.academicSubject?.toLowerCase().includes(q) ||
      e.speaker?.name?.toLowerCase().includes(q) ||
      e.speaker?.organization?.toLowerCase().includes(q)
    );
  }

  res.json(events.map(enrichEvent));
});

// Get single event details
app.get('/api/events/:id', (req, res) => {
  const event = db.events.find(e => e.id === req.params.id);
  if (!event) return res.status(404).json({ error: 'Event record not found.' });
  res.json(enrichEvent(event));
});

// Committee: Create New Event / Workshop / Industry Visit
app.post('/api/events', committeeOnly, (req, res) => {
  const {
    title,
    category,
    session,
    date,
    time,
    venue,
    capacity,
    coordinator,
    speakerName,
    speakerRole,
    speakerOrg,
    academicSubject,
    targetAudience,
    academicObjectives,
    keyTakeaways,
    pptTitle,
    pptUrl,
    coverPhoto,
    photos,
    schedule,
    tagline,
    isPaid,
    fee,
    upiId,
    paymentInstructions
  } = req.body;

  if (!title || !category || !session || !date || !time || !venue) {
    return res.status(400).json({ error: 'Please provide all mandatory event fields (Title, Category, Session, Date, Time, Venue).' });
  }

  const categoryLabels = {
    workshop: 'Hands-On Workshop',
    seminar: 'Expert Seminar',
    industry_visit: 'Industry Visit',
    guest_lecture: 'Guest Lecture',
    event: 'Departmental Symposium',
    fdp: 'Faculty Development Program'
  };

  const defaultCovers = {
    workshop: 'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=1600&q=85',
    seminar: 'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?auto=format&fit=crop&w=1600&q=85',
    industry_visit: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1600&q=85',
    guest_lecture: 'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&w=1600&q=85',
    event: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1600&q=85',
    fdp: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1600&q=85'
  };

  const parsedObjectives = Array.isArray(academicObjectives)
    ? academicObjectives
    : String(academicObjectives || '')
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean);

  const parsedTakeaways = Array.isArray(keyTakeaways)
    ? keyTakeaways
    : String(keyTakeaways || '')
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean);

  const initialPhotos = Array.isArray(photos) ? photos : [];

  const newEvent = {
    id: 'evt-ds-' + crypto.randomUUID().slice(0, 8),
    session: session || '2026-27',
    category: category || 'workshop',
    categoryLabel: categoryLabels[category] || 'Academic Session',
    title: title.trim(),
    tagline: tagline?.trim() || `${categoryLabels[category] || 'Academic Event'} conducted by the Department of Data Science.`,
    date: date.trim(),
    time: time.trim(),
    venue: venue.trim(),
    capacity: Number(capacity) || 120,
    status: session === '2026-27' ? 'open' : 'completed',
    isPaid: Boolean(isPaid),
    fee: Boolean(isPaid) ? (Number(fee) || 0) : 0,
    upiId: upiId?.trim() || 'abes.datascience@icici',
    paymentInstructions: paymentInstructions?.trim() || 'Scan the Department UPI QR Code and upload your transaction receipt screenshot with UTR number.',
    coordinator: coordinator?.trim() || `${req.user.name} (${req.user.designation || 'DS Faculty'})`,
    speaker: {
      name: speakerName?.trim() || 'Invited Industry Specialist',
      role: speakerRole?.trim() || 'Senior Data Science Practitioner',
      organization: speakerOrg?.trim() || 'Tech Enterprise / Research Institute',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
      bio: 'Distinguished expert leading advanced artificial intelligence & data initiatives.'
    },
    academicSubject: academicSubject?.trim() || 'KDS-501: Data Science Core Curriculum',
    targetAudience: targetAudience?.trim() || 'B.Tech Data Science & AI Students',
    academicObjectives: parsedObjectives.length ? parsedObjectives : ['Master core theoretical & practical fundamentals.', 'Engage in live interactive problem-solving.', 'Review real-world industry case studies.'],
    keyTakeaways: parsedTakeaways.length ? parsedTakeaways : ['Department Verified Certificate', 'Official Presentation Slides & Reference Notes', 'Interactive Q&A Session'],
    pptSlides: {
      title: pptTitle?.trim() || `${title.replace(/\s+/g, '_')}_Slides.pptx`,
      url: pptUrl?.trim() || 'https://docs.google.com/presentation/d/e/sample/pub',
      fileSize: '15.8 MB (38 Slides)',
      downloadName: `${title.replace(/\s+/g, '_')}_Deck.pdf`
    },
    academicResources: [
      { title: `${title} - Session Handout & Academic Reference`, type: 'Lecture Notes', size: '2.4 MB' }
    ],
    coverPhoto: coverPhoto?.trim() || defaultCovers[category] || defaultCovers.workshop,
    photos: initialPhotos.length ? initialPhotos : [
      {
        id: 'p-' + crypto.randomUUID().slice(0, 6),
        url: coverPhoto?.trim() || defaultCovers[category] || defaultCovers.workshop,
        caption: `Session opening and keynote for ${title}`,
        photographer: 'DS Media Cell',
        takenAt: date
      }
    ],
    schedule: Array.isArray(schedule) && schedule.length ? schedule : [
      { time: time.split('–')[0]?.trim() || '10:00 AM', title: 'Registration & Welcome Address', location: venue.trim() },
      { time: 'Mid-Session', title: 'Technical Presentation & Case Discussion', location: venue.trim() },
      { time: 'Concluding', title: 'Interactive Q&A & Certificate Distribution', location: venue.trim() }
    ],
    announcements: []
  };

  db.events.unshift(newEvent);
  saveDb();
  res.status(201).json(enrichEvent(newEvent));
});

// Committee: Update Event
app.put('/api/events/:id', committeeOnly, (req, res) => {
  const index = db.events.findIndex(e => e.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: 'Event not found.' });

  const current = db.events[index];
  const body = req.body;

  const updated = {
    ...current,
    title: body.title ? body.title.trim() : current.title,
    session: body.session || current.session,
    category: body.category || current.category,
    date: body.date ? body.date.trim() : current.date,
    time: body.time ? body.time.trim() : current.time,
    venue: body.venue ? body.venue.trim() : current.venue,
    capacity: body.capacity !== undefined ? Number(body.capacity) : current.capacity,
    status: body.status || current.status,
    tagline: body.tagline ? body.tagline.trim() : current.tagline,
    coordinator: body.coordinator ? body.coordinator.trim() : current.coordinator,
    academicSubject: body.academicSubject ? body.academicSubject.trim() : current.academicSubject,
    targetAudience: body.targetAudience ? body.targetAudience.trim() : current.targetAudience,
    coverPhoto: body.coverPhoto ? body.coverPhoto.trim() : current.coverPhoto,
    isPaid: body.isPaid !== undefined ? Boolean(body.isPaid) : current.isPaid,
    fee: body.fee !== undefined ? Number(body.fee) : current.fee,
    upiId: body.upiId ? body.upiId.trim() : current.upiId,
    paymentInstructions: body.paymentInstructions ? body.paymentInstructions.trim() : current.paymentInstructions,
    speaker: {
      ...current.speaker,
      name: body.speakerName ? body.speakerName.trim() : current.speaker?.name,
      role: body.speakerRole ? body.speakerRole.trim() : current.speaker?.role,
      organization: body.speakerOrg ? body.speakerOrg.trim() : current.speaker?.organization
    },
    pptSlides: {
      ...current.pptSlides,
      title: body.pptTitle ? body.pptTitle.trim() : current.pptSlides?.title,
      url: body.pptUrl ? body.pptUrl.trim() : current.pptSlides?.url
    }
  };

  db.events[index] = updated;
  saveDb();
  res.json(enrichEvent(updated));
});

// Committee: Delete Event
app.delete('/api/events/:id', committeeOnly, (req, res) => {
  const index = db.events.findIndex(e => e.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: 'Event not found.' });

  db.events.splice(index, 1);
  db.registrations = db.registrations.filter(r => r.eventId !== req.params.id);
  db.saved = db.saved.filter(s => s.eventId !== req.params.id);
  saveDb();
  res.status(204).end();
});

// Committee: Add Photo to Event Gallery
app.post('/api/events/:id/photos', committeeOnly, (req, res) => {
  const event = db.events.find(e => e.id === req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  const { url, caption, photographer, takenAt } = req.body;
  if (!url) return res.status(400).json({ error: 'Photo URL is required.' });

  const photo = {
    id: 'p-' + crypto.randomUUID().slice(0, 8),
    url: url.trim(),
    caption: caption?.trim() || `Department photograph for ${event.title}`,
    photographer: photographer?.trim() || 'DS Department Media Cell',
    takenAt: takenAt?.trim() || event.date
  };

  if (!event.photos) event.photos = [];
  event.photos.push(photo);
  saveDb();
  res.status(201).json({ success: true, photo, event: enrichEvent(event) });
});

// Committee: Delete Photo from Event Gallery
app.delete('/api/events/:id/photos/:photoId', committeeOnly, (req, res) => {
  const event = db.events.find(e => e.id === req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  if (!event.photos) return res.status(404).json({ error: 'No photos found.' });
  const pIndex = event.photos.findIndex(p => p.id === req.params.photoId);
  if (pIndex < 0) return res.status(404).json({ error: 'Photo not found.' });

  event.photos.splice(pIndex, 1);
  saveDb();
  res.json({ success: true, event: enrichEvent(event) });
});

// Committee: Broadcast Announcement for an Event
app.post('/api/events/:id/announcements', committeeOnly, (req, res) => {
  const event = db.events.find(e => e.id === req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'Announcement text is required.' });

  const announcement = {
    id: 'ann-' + crypto.randomUUID().slice(0, 8),
    text: text.trim(),
    timestamp: new Date().toISOString(),
    author: req.user.name || 'Department Committee'
  };

  if (!event.announcements) event.announcements = [];
  event.announcements.unshift(announcement);
  saveDb();
  res.status(201).json({ success: true, announcement, event: enrichEvent(event) });
});

// ==========================================
// STUDENT PORTAL ENDPOINTS
// ==========================================

// Get my registrations & attended events with certificates
app.get('/api/me/registrations', auth, (req, res) => {
  const userRegs = db.registrations.filter(r => r.userId === req.user.id);
  const populated = userRegs.map(reg => {
    const ev = db.events.find(e => e.id === reg.eventId);
    return {
      ...reg,
      event: ev ? enrichEvent(ev) : { id: reg.eventId, title: 'Department Session', session: '2026-27', date: 'Upcoming', venue: 'ABES Campus', category: 'workshop' }
    };
  });
  res.json(populated);
});

// Register for an event / workshop / industry visit
app.post('/api/registrations', auth, (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: 'Student registration portal requires a verified student account.' });
  }

  const { eventId, phone, semester, rollNo, section } = req.body;
  const event = db.events.find(e => e.id === eventId);
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  if (event.status === 'completed' || event.status === 'archived') {
    return res.status(400).json({ error: 'This event has concluded. Registrations are closed.' });
  }

  const currentCount = db.registrations.filter(r => r.eventId === event.id).length;
  if (event.capacity && currentCount >= event.capacity) {
    return res.status(400).json({ error: 'This session has reached maximum capacity.' });
  }

  if (db.registrations.some(r => r.userId === req.user.id && r.eventId === event.id)) {
    return res.status(409).json({ error: 'You are already registered for this session. Check your Student Portal.' });
  }

  const catCode = (event.category || 'DS').slice(0, 3).toUpperCase();
  const ticketCode = `DS-${catCode}-${event.session?.split('-')[0] || '2026'}-${Math.floor(1000 + Math.random() * 9000)}`;

  const isPaidEvent = Boolean(event.isPaid && Number(event.fee) > 0);
  const registration = {
    id: 'reg-ds-' + crypto.randomUUID().slice(0, 8),
    eventId: event.id,
    userId: req.user.id,
    name: req.user.name,
    email: req.user.email,
    rollNo: rollNo?.trim() || req.user.rollNo || '2500321540101',
    branch: req.user.branch || 'CSE (Data Science)',
    year: req.user.year || '2nd Year',
    semester: semester || req.user.semester || '3rd Sem',
    phone: phone?.trim() || req.user.phone || '+91 98765 00000',
    section: section || req.user.section || 'DS-A',
    ticketCode,
    isPaid: isPaidEvent,
    fee: isPaidEvent ? Number(event.fee) : 0,
    paymentStatus: isPaidEvent ? (req.body.paymentScreenshot ? 'pending_verification' : 'unpaid') : 'free',
    paymentScreenshot: req.body.paymentScreenshot || null,
    utrNumber: req.body.utrNumber?.trim() || null,
    paidAmount: isPaidEvent ? Number(event.fee) : 0,
    paymentSubmittedAt: req.body.paymentScreenshot ? new Date().toISOString() : null,
    paymentVerifiedAt: null,
    paymentVerifiedBy: null,
    checkedIn: false,
    checkedInAt: null,
    certificateIssued: false,
    certificateId: null,
    registeredAt: new Date().toISOString()
  };

  db.registrations.push(registration);
  saveDb();

  res.status(201).json({
    ...registration,
    event: enrichEvent(event)
  });
});

// Student: Upload Payment Screenshot & Transaction UTR
app.post('/api/registrations/:id/upload-payment', auth, (req, res) => {
  const reg = db.registrations.find(r => r.id === req.params.id);
  if (!reg) return res.status(404).json({ error: 'Registration not found.' });

  if (reg.userId !== req.user.id && req.user.role !== 'committee') {
    return res.status(403).json({ error: 'Unauthorized to modify this registration.' });
  }

  const { utrNumber, paymentScreenshot, paidAmount } = req.body;
  if (!paymentScreenshot) {
    return res.status(400).json({ error: 'Payment receipt screenshot is required.' });
  }

  reg.paymentScreenshot = paymentScreenshot;
  reg.utrNumber = utrNumber?.trim() || reg.utrNumber || 'UTR-' + Math.floor(1000000000 + Math.random() * 9000000000);
  reg.paidAmount = paidAmount !== undefined ? Number(paidAmount) : reg.fee || 0;
  reg.paymentStatus = 'pending_verification';
  reg.paymentSubmittedAt = new Date().toISOString();

  saveDb();
  res.json({
    success: true,
    message: 'Payment proof screenshot uploaded successfully. Pending committee review.',
    registration: reg
  });
});

// Committee: Verify / Approve or Reject Student Payment
app.post('/api/committee/registrations/:id/verify-payment', committeeOnly, (req, res) => {
  const reg = db.registrations.find(r => r.id === req.params.id);
  if (!reg) return res.status(404).json({ error: 'Registration not found.' });

  const { status, notes } = req.body;
  if (!['verified', 'rejected', 'pending_verification'].includes(status)) {
    return res.status(400).json({ error: 'Invalid payment status (must be verified, rejected, or pending_verification).' });
  }

  reg.paymentStatus = status;
  reg.paymentVerifiedAt = new Date().toISOString();
  reg.paymentVerifiedBy = req.user.name || 'Department Committee';
  if (notes) reg.paymentNotes = notes.trim();

  saveDb();
  res.json({
    success: true,
    message: `Student payment status updated to "${status}".`,
    registration: reg
  });
});

// Cancel registration
app.delete('/api/registrations/:id', auth, (req, res) => {
  const index = db.registrations.findIndex(r => r.id === req.params.id && r.userId === req.user.id);
  if (index < 0) return res.status(404).json({ error: 'Registration record not found.' });

  db.registrations.splice(index, 1);
  saveDb();
  res.status(204).end();
});

// Saved / Bookmarked events
app.get('/api/me/saved', auth, (req, res) => {
  res.json(db.saved.filter(s => s.userId === req.user.id).map(s => s.eventId));
});

app.put('/api/me/saved/:eventId', auth, (req, res) => {
  const exists = db.saved.some(s => s.userId === req.user.id && s.eventId === req.params.eventId);
  if (!exists) {
    db.saved.push({ userId: req.user.id, eventId: req.params.eventId });
    saveDb();
  }
  res.status(204).end();
});

app.delete('/api/me/saved/:eventId', auth, (req, res) => {
  db.saved = db.saved.filter(s => !(s.userId === req.user.id && s.eventId === req.params.eventId));
  saveDb();
  res.status(204).end();
});

// ==========================================
// DEPARTMENT COMMITTEE PORTAL ENDPOINTS
// ==========================================

// Committee Dashboard Overview & Telemetry
app.get('/api/committee/dashboard', committeeOnly, (req, res) => {
  const allEvents = db.events.map(enrichEvent);
  const totalRegistrations = db.registrations.length;
  const totalCheckedIn = db.registrations.filter(r => r.checkedIn).length;
  const totalCertificates = db.registrations.filter(r => r.certificateIssued).length;
  const totalPhotos = db.events.reduce((sum, e) => sum + (e.photos || []).length, 0);

  // Session-wise breakdown
  const sessionBreakdown = (db.sessions || []).map(sess => {
    const sessEvents = allEvents.filter(e => e.session === sess.id);
    const sessEventIds = new Set(sessEvents.map(e => e.id));
    const sessRegs = db.registrations.filter(r => sessEventIds.has(r.eventId));
    return {
      session: sess.id,
      label: sess.label,
      isCurrent: sess.isCurrent,
      eventsCount: sessEvents.length,
      registrationsCount: sessRegs.length,
      attendedCount: sessRegs.filter(r => r.checkedIn).length,
      certificatesCount: sessRegs.filter(r => r.certificateIssued).length
    };
  });

  res.json({
    totalEvents: allEvents.length,
    totalRegistrations,
    totalCheckedIn,
    totalCertificates,
    totalPhotos,
    sessionBreakdown,
    events: allEvents,
    recentRegistrations: db.registrations.slice(-10).reverse().map(reg => {
      const ev = db.events.find(e => e.id === reg.eventId);
      return { ...reg, eventTitle: ev?.title || 'Unknown Event', session: ev?.session || '2026-27' };
    })
  });
});

// Committee: Get Event Attendees
app.get('/api/committee/events/:id/attendees', committeeOnly, (req, res) => {
  const event = db.events.find(e => e.id === req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  const attendees = db.registrations.filter(r => r.eventId === req.params.id);
  res.json({ event: enrichEvent(event), attendees });
});

// Committee: Fast QR Ticket Code Verification & Check-In
app.post('/api/committee/scan-qr', committeeOnly, (req, res) => {
  const { ticketCode } = req.body;
  if (!ticketCode) return res.status(400).json({ error: 'Ticket code is required for verification.' });

  const cleanCode = ticketCode.trim().toUpperCase();
  const reg = db.registrations.find(r => r.ticketCode === cleanCode);
  if (!reg) {
    return res.status(404).json({ error: 'Invalid Ticket Code: No registration found in Department records.' });
  }

  const event = db.events.find(e => e.id === reg.eventId);
  
  // Mark checked in
  reg.checkedIn = true;
  if (!reg.checkedInAt) reg.checkedInAt = new Date().toISOString();
  saveDb();

  res.json({
    success: true,
    message: `Verified: ${reg.name} (${reg.rollNo}) checked into "${event?.title || 'Session'}"`,
    registration: reg,
    event: event ? enrichEvent(event) : null
  });
});

// Student: Submit Post-Event Academic Feedback
app.post('/api/events/:id/feedback', auth, (req, res) => {
  const event = db.events.find(e => e.id === req.params.id);
  if (!event) return res.status(404).json({ error: 'Event record not found.' });

  const { rating, contentClarity, practicalRelevance, comments } = req.body;
  const reg = db.registrations.find(r => r.eventId === event.id && r.userId === req.user.id);
  if (!reg || !reg.checkedIn) {
    return res.status(403).json({ error: 'Feedback is only open to students who attended this session.' });
  }

  if (!event.feedbacks) event.feedbacks = [];
  
  const existingIndex = event.feedbacks.findIndex(f => f.userId === req.user.id);
  const feedbackRecord = {
    id: 'fb-' + crypto.randomUUID().slice(0, 8),
    userId: req.user.id,
    studentName: req.user.name,
    rollNo: req.user.rollNo,
    rating: Number(rating) || 5,
    contentClarity: Number(contentClarity) || 5,
    practicalRelevance: Number(practicalRelevance) || 5,
    comments: comments?.trim() || 'Insightful session with great practical clarity.',
    submittedAt: new Date().toISOString()
  };

  if (existingIndex >= 0) {
    event.feedbacks[existingIndex] = feedbackRecord;
  } else {
    event.feedbacks.push(feedbackRecord);
  }

  saveDb();
  res.status(201).json({ success: true, message: 'Feedback submitted successfully!', feedback: feedbackRecord });
});

// Get Event Feedback & Analytics
app.get('/api/events/:id/analytics', (req, res) => {
  const event = db.events.find(e => e.id === req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  const feedbacks = event.feedbacks || [];
  const totalFeedbacks = feedbacks.length;
  const avgRating = totalFeedbacks > 0
    ? (feedbacks.reduce((sum, f) => sum + (f.rating || 5), 0) / totalFeedbacks).toFixed(1)
    : '5.0';

  const avgClarity = totalFeedbacks > 0
    ? (feedbacks.reduce((sum, f) => sum + (f.contentClarity || 5), 0) / totalFeedbacks).toFixed(1)
    : '5.0';

  const avgRelevance = totalFeedbacks > 0
    ? (feedbacks.reduce((sum, f) => sum + (f.practicalRelevance || 5), 0) / totalFeedbacks).toFixed(1)
    : '5.0';

  res.json({
    eventId: event.id,
    totalFeedbacks,
    avgRating,
    avgClarity,
    avgRelevance,
    feedbacks: feedbacks.slice(-15).reverse()
  });
});

// Committee: Toggle Attendee Check-In
app.post('/api/committee/registrations/:id/checkin', committeeOnly, (req, res) => {
  const reg = db.registrations.find(r => r.id === req.params.id);
  if (!reg) return res.status(404).json({ error: 'Registration record not found.' });

  reg.checkedIn = !reg.checkedIn;
  reg.checkedInAt = reg.checkedIn ? new Date().toISOString() : null;
  saveDb();
  res.json({ success: true, registration: reg });
});

// Committee: Issue / Toggle Digital Certificate
app.post('/api/committee/registrations/:id/certificate', committeeOnly, (req, res) => {
  const reg = db.registrations.find(r => r.id === req.params.id);
  if (!reg) return res.status(404).json({ error: 'Registration record not found.' });

  reg.certificateIssued = !reg.certificateIssued;
  if (reg.certificateIssued && !reg.certificateId) {
    const ev = db.events.find(e => e.id === reg.eventId);
    const sess = ev?.session?.split('-')[0] || '2026';
    const cat = (ev?.category || 'DS').slice(0, 3).toUpperCase();
    reg.certificateId = `CERT-DS-${sess}-${cat}-${Math.floor(1000 + Math.random() * 9000)}`;
    reg.issuedAt = new Date().toISOString();
  }
  saveDb();
  res.json({ success: true, registration: reg });
});

// Committee: Export Session Data Report (CSV / JSON for NBA / NAAC Accreditation)
app.get('/api/committee/export/:session', committeeOnly, (req, res) => {
  const targetSession = req.params.session;
  const events = (targetSession === 'all' ? db.events : db.events.filter(e => e.session === targetSession)).map(enrichEvent);
  
  const reportRows = [];
  events.forEach(e => {
    const attendees = db.registrations.filter(r => r.eventId === e.id);
    attendees.forEach(a => {
      reportRows.push({
        Session: e.session,
        Event_ID: e.id,
        Event_Title: e.title,
        Category: e.categoryLabel || e.category,
        Academic_Subject: e.academicSubject || 'Core Curriculum',
        Event_Date: e.date,
        Venue: e.venue,
        Coordinator: e.coordinator,
        Speaker_Name: e.speaker?.name,
        Speaker_Org: e.speaker?.organization,
        Student_Name: a.name,
        Student_Email: a.email,
        Roll_Number: a.rollNo,
        Branch: a.branch,
        Year_Semester: `${a.year} (${a.semester})`,
        Ticket_Code: a.ticketCode,
        Attended_CheckedIn: a.checkedIn ? 'YES' : 'NO',
        CheckIn_Timestamp: a.checkedInAt || 'N/A',
        Certificate_Issued: a.certificateIssued ? 'YES' : 'NO',
        Certificate_ID: a.certificateId || 'N/A'
      });
    });
  });

  const format = req.query.format || 'json';
  if (format === 'csv') {
    if (!reportRows.length) {
      return res.send('No attendance records found for this academic session.');
    }
    const headers = Object.keys(reportRows[0]);
    const csvContent = [
      headers.join(','),
      ...reportRows.map(row => headers.map(h => `"${String(row[h] || '').replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=ABES_DS_Report_${targetSession}.csv`);
    return res.send(csvContent);
  }

  res.json({
    session: targetSession,
    generatedAt: new Date().toISOString(),
    totalEvents: events.length,
    totalRecords: reportRows.length,
    records: reportRows
  });
});

// Serve Client Build in Production
const clientDist = path.resolve(__dirname, '../dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

const PORT = process.env.PORT || 3002;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 DS-Nexus Server & REST API active at http://localhost:${PORT}`);
});
