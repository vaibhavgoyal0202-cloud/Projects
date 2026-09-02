import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storageFile = path.join(__dirname, 'data.json');
const apiKey = process.env.API_KEY;

if (!apiKey) {
  console.warn('Warning: API_KEY is not set. Add it to a .env file before using external API integrations.');
}

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:3001,http://localhost:10000').split(',').map(value => value.trim()).filter(Boolean);
const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, true); // Allow during local dev
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

const app = express();
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());

const starterEvents = [
  {
    id: 'hack',
    ownerId: 'organizer-demo',
    category: 'tech',
    type: 'TECH & HACKATHON',
    title: 'CodeStorm 2026: 24H Campus Build sprint',
    tagline: '24 hours of pure adrenaline, caffeine, and breakthrough software engineering.',
    date: '18–19 October 2026',
    time: '10:00 AM onwards (24 Hours)',
    venue: 'Innovation & Incubation Hub, Block C (3rd Floor)',
    capacity: 120,
    teamSize: 'Teams of 2–4 members',
    prizePool: '₹60,000 Cash Pool + Cloud Credits',
    entry: 'Free with verified College ID',
    status: 'open',
    image: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=1600&q=85',
    description: 'An all-night build sprint bringing together the sharpest coders, AI tinkerers, and designers to solve real-world industry problems.',
    purpose: 'CodeStorm is ABES\'s flagship hackathon. Bring a problem you care about, meet passionate collaborators, get mentorship from senior engineers at top product companies, and deploy production-grade software in 24 hours.',
    perks: ['₹60,000 Cash Prize Pool', 'Verified Digital Merit Certificate', '1:1 Mentor Hours with Industry Leads', 'Red Bull, Midnight Pizza & Swag Kits', 'Direct Fast-Track Interview Shortlisting'],
    schedule: [
      { time: '10:00 AM', title: 'Opening Ceremony & Track Release', location: 'Kalpana Chawla Audi' },
      { time: '11:30 AM', title: 'Hacking Begins & Team Formations', location: 'Innovation Hub C301' },
      { time: '04:00 PM', title: 'Mentorship Round 1: Architecture Review', location: 'Mentorship Desks' },
      { time: '12:00 AM', title: 'Midnight Snack & Gaming Break', location: 'Cafeteria Courtyard' },
      { time: '08:00 AM', title: 'Code Freeze & Final Deployments', location: 'GitHub Submissions' },
      { time: '10:00 AM', title: 'Grand Jury Pitches & Award Ceremony', location: 'Kalpana Chawla Audi' }
    ],
    announcements: [
      { id: 'ann-1', text: 'Hardware sandbox and GPU cluster access keys will be distributed at 11:00 AM at Desk 4.', timestamp: '2026-10-18T09:30:00Z', organizer: 'Vaibhav Goyal' }
    ]
  },
  {
    id: 'vibrance',
    ownerId: 'organizer-demo',
    category: 'culture',
    type: 'CULTURE & FEST',
    title: "Vibrance '26: Grand Cultural Gala Night",
    tagline: 'Electrifying beats, synchronized choreography, and unforgettable campus memories.',
    date: '17 October 2026',
    time: '5:30 PM – 10:30 PM',
    venue: 'Central Lawn & Open Amphitheatre',
    capacity: 650,
    teamSize: 'Solo or Group entry',
    prizePool: 'Trophies, Goodies & Campus Fame',
    entry: 'Free with College ID',
    status: 'filling_fast',
    image: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1600&q=85',
    description: 'The monumental opening night of ABES’s annual two-day cultural explosion featuring powerhouse bands, battle of the crews, and illuminated food popups.',
    purpose: 'Vibrance is where the entire campus comes alive. Experience high-octane rock performances, classical fusion ensembles, street theater, fashion showcases, and curated artisan food stalls under the stars.',
    perks: ['Headline Live Band Performance', 'Curated Campus Food Village', 'Neon Photo Booths & 360 Video Pods', 'Student Artist Showcase stage', 'Official Fest Pass & Bandana'],
    schedule: [
      { time: '05:30 PM', title: 'Gates Open & Red Carpet Welcoming', location: 'Main Lawn Entrance' },
      { time: '06:15 PM', title: 'Battle of the Beats: Dance Crews', location: 'Main Stage' },
      { time: '08:00 PM', title: 'Fashion Pulse 2026 Runway', location: 'Amphitheatre' },
      { time: '09:00 PM', title: 'Live Rock Band Headline Act', location: 'Central Lawn Stage' }
    ],
    announcements: [
      { id: 'ann-2', text: 'Entry through Gate 2 starts strictly at 5:00 PM. Please keep your QR Pass ready on your phone.', timestamp: '2026-10-17T15:00:00Z', organizer: 'Cultural Committee' }
    ]
  },
  {
    id: 'startup',
    ownerId: 'organizer-demo',
    category: 'career',
    type: 'CAREER & PITCH',
    title: 'ABES Founder Catalyst & Angel Pitch',
    tagline: 'From napkin sketch to term sheet — pitch your venture to seed investors.',
    date: '21 October 2026',
    time: '2:00 PM – 6:30 PM',
    venue: 'Ramanujan Seminar Hall, Block B (Auditorium 2)',
    capacity: 80,
    teamSize: 'Individual Founders or Co-founders (up to 3)',
    prizePool: '₹2,00,000 Seed Grant + Incubator Desk',
    entry: 'Free for student entrepreneurs',
    status: 'open',
    image: 'https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&w=1600&q=85',
    description: 'A high-impact pitching summit where student-led startups and SaaS ideas pitch live before angel investors and alumni venture founders.',
    purpose: 'Pressure-test your business model, master unit economics, and get blunt actionable feedback from active VC partners, ABES alumni unicorns, and startup accelerators.',
    perks: ['₹2,00,000 Zero-Equity Seed Grants', 'ABES Incubation Space (6 Months Free)', 'AWS & GCP Startup Credit Bundles', 'Exclusive Dinner with Angel Investors', 'Certificate of Founder Recognition'],
    schedule: [
      { time: '02:00 PM', title: 'Keynote: Scaling B2B SaaS from Campus', location: 'Ramanujan Hall' },
      { time: '03:00 PM', title: 'Round 1: 3-Minute Lightning Pitches', location: 'Pitch Deck Stage' },
      { time: '04:45 PM', title: 'Jury Deliberation & VC AMA Session', location: 'Executive Lounge' },
      { time: '05:45 PM', title: 'Grant Distribution & Networking Tea', location: 'Seminar Hall Foyer' }
    ],
    announcements: []
  },
  {
    id: 'robotics',
    ownerId: 'organizer-demo',
    category: 'robotics',
    type: 'ROBOTICS & AI',
    title: 'RoboWars 2026: Combat Bot Arena & Tele-Op',
    tagline: 'High-torque motors, custom titanium armor, and tactical combat in the steel arena.',
    date: '24 October 2026',
    time: '11:00 AM – 5:30 PM',
    venue: 'Mechatronics & Robotics Arena, Block B Ground',
    capacity: 100,
    teamSize: 'Teams of 2–4 members',
    prizePool: '₹35,000 Cash + Combat Shields',
    entry: 'Free for participants & spectators',
    status: 'open',
    image: 'https://images.unsplash.com/photo-1535378917042-10a22c95931a?auto=format&fit=crop&w=1600&q=85',
    description: 'Design, build, and pilot wired or wireless combat robots (under 15kg & 30kg classes) through custom obstacles and sudden-death battle royale rounds.',
    purpose: 'Master motor drivers, lithium polymer power delivery, RF controllers, and chassis design under the guidance of the ABES Robotics Society.',
    perks: ['Hardware Lab Kit & 3D Printer Access', 'Official Battle Trophy & Cash Prize', 'Verified Technical Merit Certificate', 'Technical Safety Gear Provided', 'Robotics Club Core Membership'],
    schedule: [
      { time: '11:00 AM', title: 'Safety Inspection & Weight Scrutiny', location: 'Arena Pit Lane' },
      { time: '12:30 PM', title: 'Round 1: Obstacle Navigation Time Trial', location: 'Arena Grid' },
      { time: '02:30 PM', title: 'Quarter & Semi-Final Combat Duels', location: 'Enclosed Steel Cage' },
      { time: '04:45 PM', title: 'Grand 1v1 Final Championship', location: 'Main Arena' }
    ],
    announcements: []
  },
  {
    id: 'run',
    ownerId: 'organizer-demo',
    category: 'sports',
    type: 'SPORTS & FITNESS',
    title: 'Sunday Sunrise 5K Campus Marathon',
    tagline: 'Lace up, recharge your mind, and run through the scenic campus circuit.',
    date: '26 October 2026',
    time: '6:15 AM – 8:30 AM',
    venue: 'Main Gate Archway & Sports Complex Circuit',
    capacity: 250,
    teamSize: 'Solo (All fitness levels welcome)',
    prizePool: 'Finisher Medals + Sports Gift Cards',
    entry: 'Free for all students & faculty',
    status: 'open',
    image: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?auto=format&fit=crop&w=1600&q=85',
    description: 'A vibrant morning campus run designed for sprinters, joggers, and walkers alike to build healthy habits and meet fellow runners.',
    purpose: 'Kick off your Sunday with energizing music, paced group pacers (5min/km to 8min/km), hydration stations, post-run electrolyte juices, and professional photo moments.',
    perks: ['Custom Finisher Medals & Digital Badges', 'Hydration & Enerzal Electrolyte Stations', 'Pre-run Dynamic Warmup by Fitness Coaches', 'High-res Action Photography on Route', 'Healthy Breakfast Box (Bananas, Energy Bars)'],
    schedule: [
      { time: '06:15 AM', title: 'Bib Collection & Warmup Routine', location: 'Main Gate Plaza' },
      { time: '06:45 AM', title: 'Flag-Off: 5K Campus Circuit', location: 'Starting Line Arch' },
      { time: '07:45 AM', title: 'Cool Down Stretches & Medals', location: 'Sports Pavilion' }
    ],
    announcements: []
  },
  {
    id: 'gaming',
    ownerId: 'organizer-demo',
    category: 'gaming',
    type: 'E-SPORTS & GAMING',
    title: 'Valorant & BGMI Campus Showdown',
    tagline: 'High-refresh monitors, low-ping LAN server, and tactical esports glory.',
    date: '28 October 2026',
    time: '1:00 PM – 8:00 PM',
    venue: 'Advanced High-Performance Compute Lab 4, Block C',
    capacity: 90,
    teamSize: 'Teams of 5 (Valorant) / Squads of 4 (BGMI)',
    prizePool: '₹25,000 + Gaming Peripherals',
    entry: 'Free for registered squads',
    status: 'filling_fast',
    image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1600&q=85',
    description: 'The definitive inter-branch esports tournament streamed live on college screens with live casting, brackets, and grand finals.',
    purpose: 'Showcase tactical shooter prowess, team communication, and map strategy in a structured LAN environment with zero latency.',
    perks: ['Mechanical Keyboards & Gaming Mice Prizes', 'Live Streamed with Campus Casters', 'Verified E-Sports Certificate', 'Red Bull Energy Support', 'Official Campus Gamer Tags'],
    schedule: [
      { time: '01:00 PM', title: 'Bracket Seeding & Discord Setup', location: 'Lab 4' },
      { time: '01:45 PM', title: 'Elimination Knockout Matches', location: 'LAN Server 1 & 2' },
      { time: '06:00 PM', title: 'Grand Finals Best-of-3 on Big Screen', location: 'Auditorium Audi 1' }
    ],
    announcements: []
  },
  {
    id: 'stage',
    ownerId: 'organizer-demo',
    category: 'culture',
    type: 'CULTURE & ARTS',
    title: 'Acoustic Under the Stars & Poetry Slam',
    tagline: 'Original poetry, unplugged acoustic sets, storytelling, and honest laughter.',
    date: '29 October 2026',
    time: '4:30 PM – 8:00 PM',
    venue: 'Open-Air Amphitheatre, ABES Campus',
    capacity: 180,
    teamSize: 'Solo or Duo acts',
    prizePool: 'Special Feature in ABES Literary Magazine',
    entry: 'Free for performers & audience',
    status: 'open',
    image: 'https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?auto=format&fit=crop&w=1600&q=85',
    description: 'An intimate sunset gathering celebrating raw acoustic melodies, spoken word poetry, stand-up comedy routines, and campus storytelling.',
    purpose: 'Step onto the stage to share your original writing, perform a stripped-down song, or sit back with coffee and enjoy the authentic creative spirit of ABES.',
    perks: ['Spotlight Stage Time with Pro Audio Mic', 'High-Quality Audio & Video Recording', 'ABES Literary Magazine Feature', 'Warm Coffee & Cinnamon Cookies', 'Certificate of Artistic Expression'],
    schedule: [
      { time: '04:30 PM', title: 'Performer Sound Check & Coffee', location: 'Amphitheatre Stage' },
      { time: '05:00 PM', title: 'Spoken Word Poetry & Stories', location: 'Central Circle' },
      { time: '06:30 PM', title: 'Unplugged Indie Music & Stand-up', location: 'Illuminated Stage' }
    ],
    announcements: []
  }
];

const initialUsers = [
  {
    id: 'organizer-demo',
    name: 'Vaibhav Goyal',
    email: 'vaibhav.25b15410097@abes.ac.in',
    password: 'Vaibhav#2025',
    role: 'organizer',
    department: 'Department of Computer Science & Engineering',
    phone: '+91 98765 43210'
  },
  {
    id: 'student-demo',
    name: 'Aarav Sharma',
    email: 'aarav.23cs102@abes.ac.in',
    password: 'Student#2026',
    role: 'student',
    rollNo: '2300320100042',
    branch: 'Computer Science & Engineering',
    year: '3rd year',
    phone: '+91 98111 22334'
  }
];

const initialRegistrations = [
  {
    id: 'reg-demo-1',
    eventId: 'hack',
    userId: 'student-demo',
    name: 'Aarav Sharma',
    email: 'aarav.23cs102@abes.ac.in',
    rollNo: '2300320100042',
    branch: 'Computer Science & Engineering',
    year: '3rd year',
    phone: '+91 98111 22334',
    teamName: 'ByteForce AI',
    ticketCode: 'ABES-CODE-8942',
    checkedIn: true,
    checkedInAt: '2026-10-18T10:15:00Z',
    certificateIssued: true,
    certificateId: 'CERT-2026-HACK-4412',
    createdAt: '2026-09-02T14:22:00Z'
  },
  {
    id: 'reg-demo-2',
    eventId: 'vibrance',
    userId: 'student-demo',
    name: 'Aarav Sharma',
    email: 'aarav.23cs102@abes.ac.in',
    rollNo: '2300320100042',
    branch: 'Computer Science & Engineering',
    year: '3rd year',
    phone: '+91 98111 22334',
    teamName: '',
    ticketCode: 'ABES-VIB-1049',
    checkedIn: false,
    checkedInAt: null,
    certificateIssued: false,
    certificateId: null,
    createdAt: '2026-09-10T11:05:00Z'
  },
  {
    id: 'reg-sample-3',
    eventId: 'hack',
    userId: 'user-sample-3',
    name: 'Ananya Verma',
    email: 'ananya.24it055@abes.ac.in',
    rollNo: '2400320130055',
    branch: 'Information Technology',
    year: '2nd year',
    phone: '+91 98777 66554',
    teamName: 'CyberNexus',
    ticketCode: 'ABES-CODE-9104',
    checkedIn: true,
    checkedInAt: '2026-10-18T10:20:00Z',
    certificateIssued: true,
    certificateId: 'CERT-2026-HACK-4413',
    createdAt: '2026-09-05T09:12:00Z'
  },
  {
    id: 'reg-sample-4',
    eventId: 'hack',
    userId: 'user-sample-4',
    name: 'Rohan Gupta',
    email: 'rohan.22ece081@abes.ac.in',
    rollNo: '2200320310081',
    branch: 'Electronics & Comm. Engg',
    year: '4th year',
    phone: '+91 97654 32190',
    teamName: 'WaveCrafters',
    ticketCode: 'ABES-CODE-7723',
    checkedIn: false,
    checkedInAt: null,
    certificateIssued: false,
    certificateId: null,
    createdAt: '2026-09-11T16:40:00Z'
  },
  {
    id: 'reg-sample-5',
    eventId: 'vibrance',
    userId: 'user-sample-5',
    name: 'Priya Mishra',
    email: 'priya.24aiml012@abes.ac.in',
    rollNo: '2400321530012',
    branch: 'CSE (AI & ML)',
    year: '2nd year',
    phone: '+91 98321 00987',
    teamName: '',
    ticketCode: 'ABES-VIB-5521',
    checkedIn: true,
    checkedInAt: '2026-10-17T17:45:00Z',
    certificateIssued: true,
    certificateId: 'CERT-2026-VIB-1092',
    createdAt: '2026-09-12T18:30:00Z'
  }
];

const initial = {
  users: initialUsers,
  events: starterEvents,
  registrations: initialRegistrations,
  saved: [{ userId: 'student-demo', eventId: 'startup' }, { userId: 'student-demo', eventId: 'gaming' }]
};

const load = () => {
  try {
    if (fs.existsSync(storageFile)) {
      const parsed = JSON.parse(fs.readFileSync(storageFile, 'utf8'));
      if (parsed.events && parsed.users) return parsed;
    }
  } catch (e) {
    console.error('Error loading data.json, restoring initial defaults', e);
  }
  return structuredClone(initial);
};

let db = load();
const save = () => {
  try {
    fs.writeFileSync(storageFile, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error('Failed to write storage file', e);
  }
};

const tokens = new Map();
const auth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const user = tokens.get(token);
  if (!user) return res.status(401).json({ error: 'Sign in required.' });
  req.user = user;
  next();
};

const publicUser = ({ password, ...user }) => user;
const newToken = user => {
  const token = crypto.randomUUID();
  tokens.set(token, publicUser(user));
  return token;
};

// Populate tokens for demo users at boot for instant session restore
const demoOrganizerToken = 'demo-token-organizer';
const demoStudentToken = 'demo-token-student';
tokens.set(demoOrganizerToken, publicUser(initialUsers[0]));
tokens.set(demoStudentToken, publicUser(initialUsers[1]));

// Helper to attach registeredCount to events
const enrichEvent = (event) => {
  const count = db.registrations.filter(r => r.eventId === event.id).length;
  return {
    ...event,
    registeredCount: count,
    remainingCapacity: Math.max(0, (event.capacity || 100) - count),
    isFillingFast: event.capacity ? count >= event.capacity * 0.75 : false,
    isSoldOut: event.capacity ? count >= event.capacity : false
  };
};

// Auth routes
app.post('/api/auth/register', (req, res) => {
  const { name, email, password, role, rollNo, branch, year, department, phone } = req.body;
  if (!name || !email || !password || !['student', 'organizer'].includes(role)) {
    return res.status(400).json({ error: 'Please complete all required fields.' });
  }
  const cleanEmail = email.trim().toLowerCase();
  if (db.users.some(user => user.email === cleanEmail)) {
    return res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
  }
  const user = {
    id: crypto.randomUUID(),
    name: name.trim(),
    email: cleanEmail,
    password,
    role,
    rollNo: rollNo?.trim() || `230032${Math.floor(100000 + Math.random() * 900000)}`,
    branch: branch?.trim() || 'Computer Science & Engineering',
    year: year || '2nd year',
    department: department?.trim() || (role === 'organizer' ? 'Department of Student Affairs' : 'Engineering'),
    phone: phone?.trim() || '+91 98765 00000'
  };
  db.users.push(user);
  save();
  res.status(201).json({ token: newToken(user), user: publicUser(user) });
});

app.post('/api/auth/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const requestedRole = req.body.role;

  const user = db.users.find(item => item.email === email && item.password === password);
  if (!user) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }
  if (requestedRole && user.role !== requestedRole) {
    return res.status(401).json({ error: `This account is registered under the ${user.role} workspace.` });
  }
  res.json({ token: newToken(user), user: publicUser(user) });
});

app.post('/api/auth/google', (req, res) => {
  const { credential, profile, role = 'student' } = req.body;
  let googleEmail, googleName, googlePicture, googleSub;

  if (credential) {
    try {
      const base64Url = credential.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        Buffer.from(base64, 'base64')
          .toString('utf8')
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      const decoded = JSON.parse(jsonPayload);
      googleEmail = decoded.email;
      googleName = decoded.name || decoded.given_name || 'Google User';
      googlePicture = decoded.picture;
      googleSub = decoded.sub;
    } catch (e) {
      return res.status(400).json({ error: 'Invalid Google credential payload.' });
    }
  } else if (profile && profile.email) {
    googleEmail = profile.email;
    googleName = profile.name || 'Google User';
    googlePicture = profile.picture;
    googleSub = profile.sub || crypto.randomUUID();
  } else {
    return res.status(400).json({ error: 'Google authentication details missing.' });
  }

  const cleanEmail = String(googleEmail).trim().toLowerCase();
  let user = db.users.find(u => u.email === cleanEmail);

  if (user) {
    if (!user.googleId) user.googleId = googleSub;
    if (googlePicture && !user.avatar) user.avatar = googlePicture;
    save();
    return res.json({ token: newToken(user), user: publicUser(user), isNew: false });
  }

  user = {
    id: crypto.randomUUID(),
    name: googleName.trim(),
    email: cleanEmail,
    password: crypto.randomUUID(),
    role: ['student', 'organizer'].includes(role) ? role : 'student',
    googleId: googleSub,
    avatar: googlePicture || null,
    rollNo: `230032${Math.floor(100000 + Math.random() * 900000)}`,
    branch: 'Computer Science & Engineering',
    year: '2nd year',
    department: role === 'organizer' ? 'Department of Student Affairs' : 'Engineering',
    phone: '+91 98765 00000'
  };

  db.users.push(user);
  save();

  res.status(201).json({ token: newToken(user), user: publicUser(user), isNew: true });
});


// Profile
app.get('/api/me/profile', auth, (req, res) => {
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json(publicUser(user));
});

app.put('/api/me/profile', auth, (req, res) => {
  const userIndex = db.users.findIndex(u => u.id === req.user.id);
  if (userIndex < 0) return res.status(404).json({ error: 'User not found.' });
  const { name, rollNo, branch, year, department, phone } = req.body;
  const current = db.users[userIndex];
  const updated = {
    ...current,
    name: name?.trim() || current.name,
    rollNo: rollNo?.trim() || current.rollNo,
    branch: branch?.trim() || current.branch,
    year: year || current.year,
    department: department?.trim() || current.department,
    phone: phone?.trim() || current.phone
  };
  db.users[userIndex] = updated;
  save();
  const pub = publicUser(updated);
  tokens.forEach((val, key) => {
    if (val.id === updated.id) tokens.set(key, pub);
  });
  res.json(pub);
});

// Events routes
app.get('/api/events', (req, res) => {
  res.json(db.events.map(enrichEvent));
});

app.get('/api/events/:id', (req, res) => {
  const event = db.events.find(item => item.id === req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found.' });
  res.json(enrichEvent(event));
});

// Organizer: Create Event
app.post('/api/events', auth, (req, res) => {
  if (req.user.role !== 'organizer') return res.status(403).json({ error: 'Organizer workspace access required.' });
  const { title, category, date, time, venue, description, purpose, perks, capacity, teamSize, prizePool, image, schedule } = req.body;
  if (![title, category, date, time, venue, purpose].every(Boolean)) {
    return res.status(400).json({ error: 'Please complete all required fields.' });
  }

  const categoryTypes = {
    tech: 'TECH & HACKATHON',
    culture: 'CULTURE & FEST',
    career: 'CAREER & PITCH',
    sports: 'SPORTS & FITNESS',
    gaming: 'E-SPORTS & GAMING',
    robotics: 'ROBOTICS & AI'
  };

  const defaultImages = {
    tech: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=1600&q=85',
    culture: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1600&q=85',
    career: 'https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&w=1600&q=85',
    sports: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?auto=format&fit=crop&w=1600&q=85',
    gaming: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1600&q=85',
    robotics: 'https://images.unsplash.com/photo-1535378917042-10a22c95931a?auto=format&fit=crop&w=1600&q=85'
  };

  const parsedPerks = Array.isArray(perks)
    ? perks
    : String(perks || 'Verified Digital Certificate, Refreshments, Official Badges')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);

  const event = {
    id: crypto.randomUUID(),
    ownerId: req.user.id,
    title: title.trim(),
    category: category || 'tech',
    type: categoryTypes[category] || String(category).toUpperCase(),
    tagline: (description || purpose).slice(0, 100) + '...',
    date: date.trim(),
    time: time.trim(),
    venue: venue.trim(),
    capacity: Number(capacity) || 150,
    teamSize: teamSize?.trim() || 'Solo or Teams of 2–4',
    prizePool: prizePool?.trim() || 'Verified Certificates & Swag',
    entry: 'Free with College ID',
    status: 'open',
    image: image?.trim() || defaultImages[category] || defaultImages.tech,
    description: (description || purpose).trim(),
    purpose: purpose.trim(),
    perks: parsedPerks.length ? parsedPerks : ['Verified Digital Certificate', 'Networking & Mentorship'],
    schedule: Array.isArray(schedule) && schedule.length ? schedule : [
      { time: time.split('–')[0]?.trim() || 'Start Time', title: 'Reporting & Keynote Address', location: venue.trim() },
      { time: 'Midway', title: 'Interactive Sessions & Competitions', location: venue.trim() },
      { time: 'Closing', title: 'Award Ceremony & Certificate Distribution', location: venue.trim() }
    ],
    announcements: []
  };

  db.events.unshift(event);
  save();
  res.status(201).json(enrichEvent(event));
});

// Organizer: Update Event
app.put('/api/events/:id', auth, (req, res) => {
  if (req.user.role !== 'organizer') return res.status(403).json({ error: 'Organizer access required.' });
  const index = db.events.findIndex(e => e.id === req.params.id && (e.ownerId === req.user.id || req.user.id === 'organizer-demo'));
  if (index < 0) return res.status(404).json({ error: 'Event not found or unauthorized.' });

  const current = db.events[index];
  const { title, category, date, time, venue, purpose, description, perks, capacity, teamSize, prizePool, image, status } = req.body;

  const parsedPerks = Array.isArray(perks)
    ? perks
    : perks ? String(perks).split(',').map(s => s.trim()).filter(Boolean) : current.perks;

  const updated = {
    ...current,
    title: title ? title.trim() : current.title,
    category: category || current.category,
    type: category ? (category.toUpperCase() + ' & EXPERIENCE') : current.type,
    date: date ? date.trim() : current.date,
    time: time ? time.trim() : current.time,
    venue: venue ? venue.trim() : current.venue,
    capacity: capacity !== undefined ? Number(capacity) : current.capacity,
    teamSize: teamSize !== undefined ? teamSize.trim() : current.teamSize,
    prizePool: prizePool !== undefined ? prizePool.trim() : current.prizePool,
    image: image ? image.trim() : current.image,
    purpose: purpose ? purpose.trim() : current.purpose,
    description: description ? description.trim() : current.description,
    perks: parsedPerks,
    status: status || current.status
  };

  db.events[index] = updated;
  save();
  res.json(enrichEvent(updated));
});

// Organizer: Status Toggle
app.patch('/api/events/:id/status', auth, (req, res) => {
  if (req.user.role !== 'organizer') return res.status(403).json({ error: 'Organizer access required.' });
  const event = db.events.find(e => e.id === req.params.id && (e.ownerId === req.user.id || req.user.id === 'organizer-demo'));
  if (!event) return res.status(404).json({ error: 'Event not found.' });
  if (['open', 'filling_fast', 'closed', 'completed'].includes(req.body.status)) {
    event.status = req.body.status;
    save();
    return res.json(enrichEvent(event));
  }
  res.status(400).json({ error: 'Invalid status value.' });
});

// Organizer: Delete Event
app.delete('/api/events/:id', auth, (req, res) => {
  const index = db.events.findIndex(event => event.id === req.params.id && (event.ownerId === req.user.id || req.user.id === 'organizer-demo'));
  if (index < 0) return res.status(404).json({ error: 'Event not found or unauthorized.' });
  db.events.splice(index, 1);
  db.registrations = db.registrations.filter(registration => registration.eventId !== req.params.id);
  db.saved = db.saved.filter(item => item.eventId !== req.params.id);
  save();
  res.status(204).end();
});

// Organizer: Dashboard Stats & Event List
app.get('/api/organizer/dashboard', auth, (req, res) => {
  if (req.user.role !== 'organizer') return res.status(403).json({ error: 'Organizer workspace access required.' });
  const isDemo = req.user.id === 'organizer-demo';
  const organizerEvents = db.events.filter(item => isDemo ? true : item.ownerId === req.user.id).map(enrichEvent);
  const eventIds = new Set(organizerEvents.map(e => e.id));
  const relevantRegistrations = db.registrations.filter(r => eventIds.has(r.eventId));
  const checkedInCount = relevantRegistrations.filter(r => r.checkedIn).length;
  const totalCapacity = organizerEvents.reduce((acc, curr) => acc + (curr.capacity || 100), 0);
  const capacityPct = totalCapacity > 0 ? Math.min(100, Math.round((relevantRegistrations.length / totalCapacity) * 100)) : 0;

  res.json({
    events: organizerEvents,
    totalRegistrations: relevantRegistrations.length,
    checkedInCount,
    totalCapacity,
    capacityUtilization: capacityPct,
    activeEventsCount: organizerEvents.filter(e => e.status !== 'completed').length,
    recentRegistrations: relevantRegistrations.slice(-8).reverse()
  });
});

// Organizer: View Event Attendees
app.get('/api/organizer/events/:id/attendees', auth, (req, res) => {
  if (req.user.role !== 'organizer') return res.status(403).json({ error: 'Organizer access required.' });
  const event = db.events.find(e => e.id === req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found.' });
  const attendees = db.registrations.filter(r => r.eventId === req.params.id);
  res.json({ event: enrichEvent(event), attendees });
});

// Organizer: Toggle Attendee Check-In
app.post('/api/organizer/registrations/:id/checkin', auth, (req, res) => {
  if (req.user.role !== 'organizer') return res.status(403).json({ error: 'Organizer access required.' });
  const reg = db.registrations.find(r => r.id === req.params.id);
  if (!reg) return res.status(404).json({ error: 'Registration record not found.' });

  reg.checkedIn = !reg.checkedIn;
  reg.checkedInAt = reg.checkedIn ? new Date().toISOString() : null;
  save();
  res.json({ success: true, registration: reg });
});

// Organizer: Toggle Certificate
app.post('/api/organizer/registrations/:id/certificate', auth, (req, res) => {
  if (req.user.role !== 'organizer') return res.status(403).json({ error: 'Organizer access required.' });
  const reg = db.registrations.find(r => r.id === req.params.id);
  if (!reg) return res.status(404).json({ error: 'Registration record not found.' });

  reg.certificateIssued = !reg.certificateIssued;
  if (reg.certificateIssued && !reg.certificateId) {
    reg.certificateId = `CERT-2026-ABES-${Math.floor(1000 + Math.random() * 9000)}`;
  }
  save();
  res.json({ success: true, registration: reg });
});

// Organizer: Broadcast Announcement
app.post('/api/events/:id/announcements', auth, (req, res) => {
  if (req.user.role !== 'organizer') return res.status(403).json({ error: 'Organizer access required.' });
  const event = db.events.find(e => e.id === req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found.' });
  const text = req.body.text?.trim();
  if (!text) return res.status(400).json({ error: 'Announcement message cannot be blank.' });

  const announcement = {
    id: 'ann-' + crypto.randomUUID().slice(0, 8),
    text,
    timestamp: new Date().toISOString(),
    organizer: req.user.name || 'Event Coordinator'
  };

  if (!event.announcements) event.announcements = [];
  event.announcements.unshift(announcement);
  save();
  res.status(201).json({ success: true, announcement, event: enrichEvent(event) });
});

// Student: Get My Registrations
app.get('/api/me/registrations', auth, (req, res) => {
  const userRegs = db.registrations.filter(item => item.userId === req.user.id);
  const populated = userRegs.map(reg => {
    const ev = db.events.find(e => e.id === reg.eventId);
    return {
      ...reg,
      event: ev ? enrichEvent(ev) : { id: reg.eventId, title: 'Campus Event', date: 'Upcoming', venue: 'ABES Campus', type: 'CAMPUS' }
    };
  });
  res.json(populated);
});

// Student: Register for Event
app.post('/api/registrations', auth, (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'Student registration portal requires a student account.' });
  const event = db.events.find(item => item.id === req.body.eventId);
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  if (event.status === 'closed' || event.status === 'completed') {
    return res.status(400).json({ error: 'Registrations are currently closed for this event.' });
  }

  const currentCount = db.registrations.filter(r => r.eventId === event.id).length;
  if (event.capacity && currentCount >= event.capacity) {
    return res.status(400).json({ error: 'This event has reached full capacity. Registrations are closed.' });
  }

  if (db.registrations.some(item => item.userId === req.user.id && item.eventId === event.id)) {
    return res.status(409).json({ error: 'You are already registered for this event. Check your Student Portal.' });
  }

  const cleanPrefix = (event.category || 'EVT').slice(0, 4).toUpperCase();
  const ticketCode = `ABES-${cleanPrefix}-${Math.floor(1000 + Math.random() * 9000)}`;

  const registration = {
    id: crypto.randomUUID(),
    eventId: event.id,
    userId: req.user.id,
    name: req.body.name?.trim() || req.user.name,
    email: req.user.email,
    rollNo: req.body.rollNo?.trim() || req.user.rollNo || '2300320100000',
    year: req.body.year || req.user.year || '2nd year',
    branch: req.body.branch?.trim() || req.user.branch || 'Computer Science & Engineering',
    phone: req.body.phone?.trim() || req.user.phone || '+91 98765 00000',
    teamName: req.body.teamName?.trim() || '',
    ticketCode,
    checkedIn: false,
    checkedInAt: null,
    certificateIssued: false,
    certificateId: null,
    createdAt: new Date().toISOString()
  };

  db.registrations.push(registration);
  save();
  res.status(201).json({
    ...registration,
    event: enrichEvent(event)
  });
});

// Student: Cancel Registration
app.delete('/api/registrations/:id', auth, (req, res) => {
  const index = db.registrations.findIndex(r => r.id === req.params.id && r.userId === req.user.id);
  if (index < 0) return res.status(404).json({ error: 'Registration record not found.' });
  db.registrations.splice(index, 1);
  save();
  res.status(204).end();
});

// Saved Events
app.get('/api/me/saved', auth, (req, res) => {
  res.json(db.saved.filter(item => item.userId === req.user.id).map(item => item.eventId));
});

app.put('/api/me/saved/:eventId', auth, (req, res) => {
  const exists = db.saved.some(item => item.userId === req.user.id && item.eventId === req.params.eventId);
  if (!exists) {
    db.saved.push({ userId: req.user.id, eventId: req.params.eventId });
    save();
  }
  res.status(204).end();
});

app.delete('/api/me/saved/:eventId', auth, (req, res) => {
  db.saved = db.saved.filter(item => !(item.userId === req.user.id && item.eventId === req.params.eventId));
  save();
  res.status(204).end();
});

// Static files in production
const client = path.resolve(__dirname, '../dist');
if (fs.existsSync(client)) {
  app.use(express.static(client));
  app.get('*', (_, res) => res.sendFile(path.join(client, 'index.html')));
}

const PORT = process.env.PORT || 3001;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`⚡ ABES Pulse Server & REST API active at http://localhost:${PORT}`);
});

