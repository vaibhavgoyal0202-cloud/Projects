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

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:10000').split(',').map(value => value.trim()).filter(Boolean);
const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed by CORS policy.'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

const app = express();
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());

const starterEvents = [
  { id:'hack', category:'tech', type:'TECH & BUILD', title:'CodeStorm: 24H Hackathon', date:'18–19 October 2026', time:'10:00 AM onwards', venue:'Innovation Lab, Block C', entry:'Free · teams of 2–4', image:'https://images.unsplash.com/photo-1551818255-e6e10975bc17?auto=format&fit=crop&w=1600&q=85', description:'An all-night build sprint for teams ready to turn sharp ideas into working prototypes.', purpose:'Bring a problem you care about, meet curious collaborators, and build a real solution in 24 hours with guidance from senior developers and industry mentors.', perks:['Prize pool','Verified certificate','Mentor hours','Meals included'] },
  { id:'vibrance', category:'culture', type:'CULTURE', title:"Vibrance '26: Opening Night", date:'17 October 2026', time:'6:00 PM – 10:30 PM', venue:'Central Lawn, ABES Campus', entry:'Free with college ID', image:'https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=1600&q=85', description:'The first big night of ABES’s two-day cultural celebration.', purpose:'Come for live music, dance crews and theatre; stay for food, photo zones and the feeling of campus celebrating together.', perks:['Live performances','Photo zones','Food pop-ups','Open to everyone'] },
  { id:'startup', category:'career', type:'CAREER', title:'ABES Startup Sprint', date:'21 October 2026', time:'2:00 PM – 6:00 PM', venue:'Seminar Hall A, Block B', entry:'Free · individual or team', image:'https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&w=1600&q=85', description:'Turn an idea into a crisp, confident pitch.', purpose:'Pressure-test your idea, learn what investors listen for, and leave with a pitch you can use again.', perks:['Founder feedback','Certificate','Meet collaborators','Pitch toolkit'] },
  { id:'robotics', category:'tech', type:'TECH & BUILD', title:'RoboWars Build Day', date:'24 October 2026', time:'11:00 AM – 5:00 PM', venue:'Robotics Lab, Block C', entry:'Free · limited lab seats', image:'https://images.unsplash.com/photo-1535378917042-10a22c95931a?auto=format&fit=crop&w=1600&q=85', description:'Build, test and battle your own robot.', purpose:'Learn mechanisms, motors and control by assembling a bot and testing it on the arena.', perks:['Build kit access','Certificate','Arena time','Club mentorship'] },
  { id:'run', category:'sports', type:'SPORTS', title:'Sunday Sunrise Run', date:'26 October 2026', time:'6:30 AM – 8:30 AM', venue:'Main Gate, ABES Campus', entry:'Free · all fitness levels', image:'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?auto=format&fit=crop&w=1600&q=85', description:'A five-kilometre campus run for every pace.', purpose:'Walk, jog or run at your own pace and meet the run club before the week starts.', perks:['Pacer support','Refreshments','Run photos','Run club community'] },
  { id:'stage', category:'culture', type:'CULTURE', title:'Open Mic Under the Stars', date:'29 October 2026', time:'4:30 PM – 8:00 PM', venue:'Amphitheatre, ABES Campus', entry:'Free · performers and audience', image:'https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?auto=format&fit=crop&w=1600&q=85', description:'Poetry, acoustic sets, stand-up and stories from campus.', purpose:'Bring a poem, song, story, or five minutes of comedy—or just cheer from the audience.', perks:['A moment on stage','Performance photos','Campus talent','Easy evening vibe'] }
];
const initial = { users: [{ id:'organizer-demo', name:'Vaibhav', email:'vaibhav.25b15410097', password:'Vaibhav#2025', role:'organizer' }], events: starterEvents, registrations: [], saved: [] };
const load = () => fs.existsSync(storageFile) ? JSON.parse(fs.readFileSync(storageFile, 'utf8')) : structuredClone(initial);
let db = load();
const save = () => fs.writeFileSync(storageFile, JSON.stringify(db, null, 2));
const tokens = new Map();
const auth = (req, res, next) => { const user = tokens.get(req.headers.authorization?.replace('Bearer ', '')); if (!user) return res.status(401).json({ error:'Sign in required.' }); req.user = user; next(); };
const publicUser = ({ password, ...user }) => user;
const newToken = user => { const token = crypto.randomUUID(); tokens.set(token, publicUser(user)); return token; };

app.post('/api/auth/register', (req, res) => { const { name, email, password, role } = req.body; if (!name || !email || !password || !['student','organizer'].includes(role)) return res.status(400).json({ error:'Please complete all fields.' }); const cleanEmail = email.trim().toLowerCase(); if (db.users.some(user => user.email === cleanEmail)) return res.status(409).json({ error:'An account with this email already exists.' }); const user = { id:crypto.randomUUID(), name:name.trim(), email:cleanEmail, password, role }; db.users.push(user); save(); res.status(201).json({ token:newToken(user), user:publicUser(user) }); });
app.post('/api/auth/login', (req, res) => { const user = db.users.find(item => item.email === String(req.body.email).trim().toLowerCase() && item.password === req.body.password); if (!user || user.role !== req.body.role) return res.status(401).json({ error:'Incorrect credentials or portal.' }); res.json({ token:newToken(user), user:publicUser(user) }); });
app.get('/api/events', (req, res) => res.json(db.events));
app.get('/api/events/:id', (req, res) => { const event = db.events.find(item => item.id === req.params.id); if (!event) return res.status(404).json({ error:'Event not found.' }); res.json(event); });
app.post('/api/events', auth, (req, res) => { if (req.user.role !== 'organizer') return res.status(403).json({ error:'Organizer access required.' }); const { title, category, date, time, venue, purpose, benefits } = req.body; if (![title,category,date,time,venue,purpose].every(Boolean)) return res.status(400).json({ error:'Please complete required fields.' }); const event = { id:crypto.randomUUID(), ownerId:req.user.id, title:title.trim(), category, type:category.toUpperCase(), date:date.trim(), time:time.trim(), venue:venue.trim(), entry:'Free with college ID', image:'https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=1600&q=85', description:purpose.trim(), purpose:purpose.trim(), perks:String(benefits || 'Campus experience').split(',').map(item => item.trim()).filter(Boolean) }; db.events.unshift(event); save(); res.status(201).json(event); });
app.delete('/api/events/:id', auth, (req, res) => { const index = db.events.findIndex(event => event.id === req.params.id && event.ownerId === req.user.id); if (index < 0) return res.status(404).json({ error:'Your event was not found.' }); db.events.splice(index, 1); db.registrations = db.registrations.filter(registration => registration.eventId !== req.params.id); db.saved = db.saved.filter(item => item.eventId !== req.params.id); save(); res.status(204).end(); });
app.get('/api/me/registrations', auth, (req,res) => res.json(db.registrations.filter(item => item.userId === req.user.id)));
app.post('/api/registrations', auth, (req,res) => { if (req.user.role !== 'student') return res.status(403).json({ error:'Student access required.' }); const event = db.events.find(item => item.id === req.body.eventId); if (!event) return res.status(404).json({ error:'Event not found.' }); if (db.registrations.some(item => item.userId === req.user.id && item.eventId === event.id)) return res.status(409).json({ error:'You are already registered.' }); const registration = { id:crypto.randomUUID(), eventId:event.id, userId:req.user.id, event, name:req.body.name?.trim(), year:req.body.year, branch:req.body.branch, createdAt:new Date().toISOString() }; db.registrations.push(registration); save(); res.status(201).json(registration); });
app.get('/api/me/saved', auth, (req,res) => res.json(db.saved.filter(item => item.userId === req.user.id).map(item => item.eventId)));
app.put('/api/me/saved/:eventId', auth, (req,res) => { const exists = db.saved.some(item => item.userId === req.user.id && item.eventId === req.params.eventId); if (!exists) db.saved.push({ userId:req.user.id, eventId:req.params.eventId }); save(); res.status(204).end(); });
app.delete('/api/me/saved/:eventId', auth, (req,res) => { db.saved = db.saved.filter(item => !(item.userId === req.user.id && item.eventId === req.params.eventId)); save(); res.status(204).end(); });
app.get('/api/organizer/dashboard', auth, (req,res) => { if (req.user.role !== 'organizer') return res.status(403).json({ error:'Organizer access required.' }); const events = db.events.filter(item => item.ownerId === req.user.id); res.json({ events, registrations:db.registrations.filter(item => events.some(event => event.id === item.eventId)).length }); });

const client = path.resolve(__dirname, '../dist');
if (fs.existsSync(client)) {
  app.use(express.static(client));
  app.get('*', (_, res) => res.sendFile(path.join(client, 'index.html')));
}
const PORT = process.env.PORT || 10000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`ABES Pulse API listening on port ${PORT}`);
});
