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
const storageDir = process.env.DATA_STORAGE_DIR || (process.env.RENDER && fs.existsSync('/var/data') ? '/var/data' : null);
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
    return callback(new Error('Origin is not allowed by CORS.'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

const app = express();
// Enable this only when the app is deployed behind a trusted HTTPS reverse proxy.
if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Load and Persist Database with Auto-Seeding
const loadDb = () => {
  try {
    if (fs.existsSync(storageFile)) {
      const content = fs.readFileSync(storageFile, 'utf8');
      if (content.trim()) {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed.events) && parsed.events.length > 0 && Array.isArray(parsed.users) && parsed.users.length > 0) {
          return parsed;
        }
      }
    }
  } catch (err) {
    console.error('Error reading storageFile:', err.message);
  }

  // Fallback and auto-seed from bundled default data.json
  try {
    if (fs.existsSync(defaultStoragePath)) {
      const defaultContent = fs.readFileSync(defaultStoragePath, 'utf8');
      const defaultParsed = JSON.parse(defaultContent);
      if (Array.isArray(defaultParsed.events) && Array.isArray(defaultParsed.users)) {
        console.log(`📦 Seeded ${defaultParsed.events.length} events and ${defaultParsed.sessions.length} sessions from default data.json`);
        if (storageFile !== defaultStoragePath) {
          try {
            fs.writeFileSync(storageFile, JSON.stringify(defaultParsed, null, 2), 'utf8');
          } catch (writeErr) {
            console.warn('Could not seed to storageFile, using in-memory default:', writeErr.message);
          }
        }
        return defaultParsed;
      }
    }
  } catch (seedErr) {
    console.error('Error seeding from default data.json:', seedErr.message);
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
// ==========================================
// 1. INPUT SANITIZATION & EMAIL VALIDATION
// ==========================================
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

const sanitizeEmail = (email) => {
  if (!email || typeof email !== 'string') {
    return { isValid: false, reason: 'Email address is required.' };
  }
  const clean = email.trim().toLowerCase();
  if (clean.length > 254 || !EMAIL_REGEX.test(clean)) {
    return { isValid: false, reason: 'Please enter a valid, well-formed email address.' };
  }
  const parts = clean.split('@');
  if (parts.length !== 2 || !parts[1].includes('.')) {
    return { isValid: false, reason: 'Please enter a valid domain (e.g. yourname@abes.ac.in).' };
  }
  const domain = parts[1];
  const isAbes = domain === 'abes.ac.in' || domain.endsWith('.abes.ac.in');
  return { isValid: true, cleanEmail: clean, domain, isAbes };
};

// ==========================================
// 2. PLUGGABLE OTP STORAGE ENGINE
// (In-Memory Implementation, Swappable to Redis)
// ==========================================
class InMemoryOtpStore {
  constructor() {
    this.store = new Map();
    // Auto-cleanup stale expired tokens every 60 seconds
    setInterval(() => this.cleanupExpired(), 60 * 1000).unref();
  }

  async set(email, data, ttlMs = 5 * 60 * 1000) {
    const expiresAt = Date.now() + ttlMs;
    this.store.set(email, {
      ...data,
      attempts: 0,
      createdAt: Date.now(),
      expiresAt
    });
    return true;
  }

  async get(email) {
    const record = this.store.get(email);
    if (!record) return null;
    return record;
  }

  async incrementAttempts(email) {
    const record = this.store.get(email);
    if (!record) return 0;
    record.attempts = (record.attempts || 0) + 1;
    this.store.set(email, record);
    return record.attempts;
  }

  async delete(email) {
    return this.store.delete(email);
  }

  cleanupExpired() {
    const now = Date.now();
    for (const [email, record] of this.store.entries()) {
      if (now > record.expiresAt) {
        this.store.delete(email);
      }
    }
  }
}

const otpStore = new InMemoryOtpStore();

// ==========================================
// 3. SECURITY RATE LIMITING ENGINE
// - 30s Cooldown per email/IP
// - 5 Requests per 1 Hour Quota per email/IP
// ==========================================
class SecurityRateLimiter {
  constructor() {
    this.cooldowns = new Map(); // key -> lastRequestTimestamp
    this.hourlyQuotas = new Map(); // key -> [timestamps]
  }

  // Check 30-second cooldown
  checkCooldown(key, cooldownMs = 30 * 1000) {
    const now = Date.now();
    const last = this.cooldowns.get(key);
    if (last && now - last < cooldownMs) {
      const waitSec = Math.ceil((cooldownMs - (now - last)) / 1000);
      return { allowed: false, waitSec };
    }
    return { allowed: true };
  }

  // Check 5 requests per hour quota
  checkHourlyQuota(key, maxRequests = 5, windowMs = 60 * 60 * 1000) {
    const now = Date.now();
    let history = this.hourlyQuotas.get(key) || [];
    // Keep only timestamps within the last 1 hour
    history = history.filter(ts => now - ts < windowMs);
    
    if (history.length >= maxRequests) {
      const oldest = history[0];
      const resetMin = Math.ceil((windowMs - (now - oldest)) / 60000);
      return { allowed: false, resetMin };
    }
    return { allowed: true, currentCount: history.length };
  }

  recordRequest(key) {
    const now = Date.now();
    this.cooldowns.set(key, now);
    const history = (this.hourlyQuotas.get(key) || []).filter(ts => now - ts < 3600000);
    history.push(now);
    this.hourlyQuotas.set(key, history);
  }

  check(keys) {
    for (const key of keys) {
      const cooldown = this.checkCooldown(key);
      if (!cooldown.allowed) return { allowed: false, error: `Please wait ${cooldown.waitSec} seconds before requesting a new OTP.` };
      const hourly = this.checkHourlyQuota(key);
      if (!hourly.allowed) return { allowed: false, error: `Too many OTP requests. Please try again in ${hourly.resetMin} minutes.` };
    }
    return { allowed: true };
  }

  record(keys) {
    keys.forEach(key => this.recordRequest(key));
  }
}

const rateLimiter = new SecurityRateLimiter();

// Constants
const OTP_TTL_MS = 5 * 60 * 1000; // Strictly 5 Minutes Expiry
const MAX_VERIFY_ATTEMPTS = 5;      // Max 5 Failed Verification Attempts
const hashOtp = otp => crypto.createHash('sha256').update(otp).digest();
const safeOtpMatch = (storedHash, submittedOtp) => {
  const submittedHash = hashOtp(submittedOtp);
  return Buffer.isBuffer(storedHash)
    && storedHash.length === submittedHash.length
    && crypto.timingSafeEqual(storedHash, submittedHash);
};
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);

// ==========================================
// 4. NODEMAILER SMTP EMAIL DISPATCH SERVICE
// ==========================================
let mailTransporter = null;

const createMailTransporter = () => {
  const user = process.env.SMTP_USER || process.env.GMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = port === 465;

  if (!user || !pass) {
    console.warn('OTP email is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD (or SMTP_USER and SMTP_PASS).');
    return null;
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });
    console.log(`📧 OTP mail transporter configured for ${host}:${port}`);
    return transporter;
  } catch (err) {
    console.warn('⚠️ [Nodemailer] Failed to initialize SMTP transporter:', err.message);
    return null;
  }
};

mailTransporter = createMailTransporter();

// Helper to send ABES Branded OTP Email with 5-Minute Expiry Notice
const sendOtpEmail = async (toEmail, otp, studentName = 'Student') => {
  const safeName = escapeHtml(String(studentName).trim().slice(0, 80) || 'Student');
  const safeEmail = escapeHtml(toEmail);
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f3f4f4; margin: 0; padding: 20px; color: #1e293b; }
        .email-container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e4e4e7; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
        .email-header { background: #992728; padding: 26px 30px; text-align: center; color: #ffffff; border-bottom: 3px solid #772823; }
        .email-header h1 { margin: 0; font-size: 20px; letter-spacing: 0.5px; font-weight: 800; }
        .email-header p { margin: 6px 0 0; font-size: 12px; color: #ffd700; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; }
        .email-body { padding: 32px 30px; color: #0e0e0e; line-height: 1.6; }
        .email-body h2 { margin-top: 0; font-size: 18px; color: #0e0e0e; }
        .otp-box { background: #fdf5f5; border: 2px dashed #992728; border-radius: 10px; padding: 22px; text-align: center; margin: 24px 0; }
        .otp-label { font-size: 12px; font-weight: 700; color: #71717a; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
        .otp-code { font-family: 'Courier New', Courier, monospace; font-size: 40px; font-weight: 900; letter-spacing: 10px; color: #992728; margin: 0; }
        .otp-timer { font-size: 13px; font-weight: 700; color: #dc2626; margin-top: 10px; }
        .security-notice { background: #fafafa; border-left: 4px solid #992728; padding: 12px 16px; font-size: 12px; color: #4a4a4a; margin-top: 24px; border-radius: 4px; }
        .email-footer { background: #0e0e0e; color: #a1a1aa; padding: 20px 30px; text-align: center; font-size: 11px; line-height: 1.5; }
        .email-footer strong { color: #ffffff; }
      </style>
    </head>
    <body>
      <div class="email-container">
        <div class="email-header">
          <h1>ABES ENGINEERING COLLEGE, GHAZIABAD</h1>
          <p>Department of Computer Science & Engineering (Data Science)</p>
        </div>
        <div class="email-body">
          <h2>Dear ${safeName},</h2>
          <p>Your one-time 6-digit authentication verification code to access the <strong>ABES EC CSE(DS) Portal</strong> is:</p>
          
          <div class="otp-box">
            <div class="otp-label">Verification OTP Code</div>
            <div class="otp-code">${otp}</div>
            <div class="otp-timer">⏱️ Valid for 5 minutes only. Do not share this code with anyone.</div>
          </div>

          <p style="font-size: 13px; color: #555;">Enter this 6-digit code in the login verification screen to access your Student Portal.</p>

          <div class="security-notice">
            🔒 <strong>Institutional Security:</strong> This verification request was dispatched for <code>${safeEmail}</code>. You have up to 5 verification attempts. If you did not initiate this request, please disregard this email.
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

  if (!mailTransporter) {
    mailTransporter = createMailTransporter();
  }

  if (mailTransporter) {
    try {
      const senderAddr = process.env.SMTP_FROM || process.env.SMTP_USER || process.env.GMAIL_USER;
      const info = await mailTransporter.sendMail({
        from: `"ABES EC Data Science Academic Cell" <${senderAddr}>`,
        to: toEmail,
        subject: `🔐 ABES EC CSE(DS) - Your 6-Digit Verification Code: ${otp}`,
        text: `ABES Engineering College - CSE (Data Science)\nYour verification code is: ${otp}\nValid for 5 minutes.`,
        html: htmlContent
      });
      console.log(`✉️ OTP email sent. MessageId: ${info.messageId}`);
      return { sent: true, messageId: info.messageId };
    } catch (err) {
      console.error(`⚠️ [Nodemailer SMTP Error] Failed to send real email to ${toEmail}:`, err.message);
      return { sent: false, error: err.message };
    }
  } else {
    console.error('⚠️ [Nodemailer] Transporter not available.');
    return { sent: false, error: 'Mail transporter could not be initialized.' };
  }
};

// ==========================================
// 5. BACKEND ENDPOINTS (SEND-OTP & VERIFY-OTP)
// ==========================================

// Endpoint: Send OTP with 30s Cooldown, Hourly Quota, and 5-min Expiry
app.post('/api/auth/send-otp', async (req, res) => {
  const { email, name, rollNo, branch, year } = req.body;
  const clientIp = req.ip || 'client';
  
  // Step 1: Sanitize and validate email
  const validation = sanitizeEmail(email);
  if (!validation.isValid) {
    return res.status(400).json({ error: validation.reason });
  }

  const cleanEmail = validation.cleanEmail;
  // Keep independent limits for both identities: switching either the email or IP
  // must not bypass the request throttle.
  const rateLimitKeys = [`email:${cleanEmail}`, `ip:${clientIp}`];

  // Step 2: 30-second cooldown and five requests/hour, per email and per IP.
  const rateLimit = rateLimiter.check(rateLimitKeys);
  if (!rateLimit.allowed) return res.status(429).json({ error: rateLimit.error });

  // Step 3: Cryptographically secure 6-digit OTP generation (uniform random distribution)
  const otp = crypto.randomInt(100000, 1000000).toString();

  // Step 4: Record the request before sending so a failing SMTP provider cannot be abused.
  rateLimiter.record(rateLimitKeys);

  // Step 5: Dispatch the email. The OTP is never returned to the browser.
  const mailResult = await sendOtpEmail(cleanEmail, otp, name || 'Student');

  if (!mailResult.sent) {
    console.error('❌ [Email Error] Could not dispatch verification email:', mailResult.error);
    return res.status(500).json({
      error: 'We could not send the verification email right now. Please try again later.'
    });
  }

  // Step 6: Store only a hash server-side; an in-memory implementation can be replaced by Redis.
  await otpStore.set(cleanEmail, {
    otpHash: hashOtp(otp),
    name: typeof name === 'string' ? name.trim().slice(0, 80) : undefined,
    rollNo: typeof rollNo === 'string' ? rollNo.trim().slice(0, 40) : undefined,
    branch: typeof branch === 'string' ? branch.trim().slice(0, 80) : undefined,
    year: typeof year === 'string' ? year.trim().slice(0, 30) : '2nd Year'
  }, OTP_TTL_MS);

  // Never return the OTP to the client for zero-trust security
  res.json({
    success: true,
    message: `A 6-digit verification code has been dispatched to your email inbox (${cleanEmail}).`,
    email: cleanEmail,
    expiresInSeconds: 300,
    cooldownSeconds: 30,
    deliveredLive: true
  });
});

// Endpoint: Verify OTP with Expiry, Max 5 Attempts, and Session Provisioning
app.post('/api/auth/verify-otp', async (req, res) => {
  const { email, otp } = req.body;
  const validation = sanitizeEmail(email);
  if (!validation.isValid) {
    return res.status(400).json({ error: validation.reason });
  }

  const cleanEmail = validation.cleanEmail;
  const cleanOtp = String(otp || '').trim();

  if (!cleanOtp || cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
    return res.status(400).json({ error: 'Please enter a valid 6-digit numeric verification code.' });
  }

  // Step 1: Retrieve OTP from store
  const record = await otpStore.get(cleanEmail);
  if (!record) {
    return res.status(400).json({
      error: 'No active verification session found or the OTP has expired (5 minutes limit). Please request a new code.'
    });
  }

  // Step 2: Check 5-minute expiry
  if (Date.now() > record.expiresAt) {
    await otpStore.delete(cleanEmail);
    return res.status(410).json({
      error: 'Verification code has expired (5 minutes limit). Please request a new code.'
    });
  }

  // Step 3: Check OTP match vs Failed Attempts Rate Limit
  if (!safeOtpMatch(record.otpHash, cleanOtp)) {
    const attempts = await otpStore.incrementAttempts(cleanEmail);
    const remaining = MAX_VERIFY_ATTEMPTS - attempts;

    if (remaining <= 0) {
      await otpStore.delete(cleanEmail);
      return res.status(429).json({
        error: 'Too many failed verification attempts (5/5). For your security, this verification code has been invalidated. Please request a new OTP.'
      });
    }

    return res.status(400).json({
      error: `OTP didn't match. Please try again. (${remaining} attempt${remaining > 1 ? 's' : ''} remaining)`
    });
  }

  // Step 4: OTP is verified! Invalidate stored OTP immediately
  await otpStore.delete(cleanEmail);

  // Step 5: Lookup existing user or auto-provision verified student profile
  let user = db.users.find(u => u.email === cleanEmail);
  if (user) {
    if (user.role !== 'student') {
      return res.status(403).json({ error: 'This account belongs to the Department Committee. Please switch to Committee Portal.' });
    }
    const token = newToken(user);
    return res.json({ token, user: publicUser(user), message: 'OTP verified successfully! Welcome back to the Student Portal.' });
  }

  // Provision new student profile (zero password stored)
  const parsedRoll = record.rollNo || (cleanEmail.includes('.') ? cleanEmail.split('@')[0].split('.')[1]?.toUpperCase() : null) || `2500321540${Math.floor(100 + Math.random() * 900)}`;
  const studentName = record.name || (cleanEmail.includes('.') ? cleanEmail.split('@')[0].split('.')[0].replace(/\b\w/g, c => c.toUpperCase()) : cleanEmail.split('@')[0].replace(/\b\w/g, c => c.toUpperCase())) || 'Data Science Student';

  user = {
    id: 'student-' + crypto.randomUUID().slice(0, 8),
    name: studentName,
    email: cleanEmail,
    role: 'student',
    rollNo: parsedRoll,
    branch: record.branch || 'CSE (Data Science)',
    year: record.year || '2nd Year',
    semester: '3rd Sem',
    phone: '+91 98765 00000',
    section: 'DS-A',
    authProvider: 'email-otp-verified'
  };

  db.users.push(user);
  saveDb();

  const token = newToken(user);
  res.status(201).json({
    token,
    user: publicUser(user),
    isNew: true,
    message: 'Email verified successfully! Welcome to the Student Portal.'
  });
});

// Microsoft 365 Single Sign-On / Verified Login for Students
app.post('/api/auth/microsoft-login', (req, res) => {
  const { email, password, name, rollNo, branch, year } = req.body;
  
  const domainCheck = validateCollegeDomain(email);
  if (!domainCheck.isValid) {
    return res.status(400).json({ error: domainCheck.reason });
  }

  const cleanEmail = domainCheck.cleanEmail;
  let user = db.users.find(u => u.email === cleanEmail);

  if (user) {
    if (user.role !== 'student') {
      return res.status(403).json({ error: 'This account is registered under the Department Committee portal. Please switch to Committee Login.' });
    }
    const token = newToken(user);
    return res.json({ token, user: publicUser(user), message: 'Welcome back to DS Student Portal!' });
  }

  // Auto-provision student profile for verified email
  const parsedRoll = rollNo?.trim() || (cleanEmail.includes('.') ? cleanEmail.split('@')[0].split('.')[1]?.toUpperCase() : null) || `2500321540${Math.floor(100 + Math.random() * 900)}`;
  const studentName = name?.trim() || (cleanEmail.includes('.') ? cleanEmail.split('@')[0].split('.')[0].replace(/\b\w/g, c => c.toUpperCase()) : cleanEmail.split('@')[0].replace(/\b\w/g, c => c.toUpperCase())) || 'Data Science Student';

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
    if (attendees.length === 0) {
      reportRows.push({
        Session: e.session,
        Event_ID: e.id,
        Event_Title: e.title,
        Category: e.categoryLabel || e.category,
        Academic_Subject: e.academicSubject || 'Core Curriculum',
        Event_Date: e.date,
        Venue: e.venue,
        Coordinator: e.coordinator || 'Department Faculty',
        Speaker_Name: e.speaker?.name || 'Department Faculty',
        Speaker_Org: e.speaker?.organization || 'ABES Engineering College',
        Student_Name: 'None (No active registrations)',
        Student_Email: 'N/A',
        Roll_Number: 'N/A',
        Branch: 'N/A',
        Year_Semester: 'N/A',
        Ticket_Code: 'N/A',
        Attended_CheckedIn: 'NO',
        CheckIn_Timestamp: 'N/A',
        Certificate_Issued: 'NO',
        Certificate_ID: 'N/A'
      });
    } else {
      attendees.forEach(a => {
        reportRows.push({
          Session: e.session,
          Event_ID: e.id,
          Event_Title: e.title,
          Category: e.categoryLabel || e.category,
          Academic_Subject: e.academicSubject || 'Core Curriculum',
          Event_Date: e.date,
          Venue: e.venue,
          Coordinator: e.coordinator || 'Department Faculty',
          Speaker_Name: e.speaker?.name || 'Department Faculty',
          Speaker_Org: e.speaker?.organization || 'ABES Engineering College',
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
    }
  });

  const format = req.query.format || 'json';
  if (format === 'csv') {
    if (!reportRows.length) {
      const defaultHeader = 'Session,Event_ID,Event_Title,Category,Academic_Subject,Event_Date,Venue,Coordinator,Speaker_Name,Speaker_Org,Student_Name,Student_Email,Roll_Number,Branch,Year_Semester,Ticket_Code,Attended_CheckedIn,CheckIn_Timestamp,Certificate_Issued,Certificate_ID\n';
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=ABES_DS_Report_${targetSession}.csv`);
      return res.send(defaultHeader);
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

const PORT = process.env.PORT || 3004;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 DS-Nexus Light Server & REST API active at http://localhost:${PORT}`);
});
