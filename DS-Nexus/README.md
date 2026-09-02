# DS-Nexus · ABES Data Science Department Portal

A full-featured portal for the **Department of Data Science & Artificial Intelligence (CSE - DS)** at **ABES Engineering College**, dedicated to managing and archiving **Seminars, Hands-on Workshops, Industry Visits, Guest Lectures, and Departmental Symposiums**.

---

## 🌟 Key Features

### 1. Multi-Session Retrieval & Archival
- **Current Active Session**: `2026-27`
- **Past Archived Sessions**: `2025-26`, `2024-25`, and full historical archives.
- Filter by session, category (Workshops, Seminars, Industry Visits, Guest Lectures, Symposiums), and academic subject.
- Complete session data export in **CSV / JSON** for **NAAC / NBA Accreditation** records.

### 2. Rich Photographic Albums & Fullscreen Lightbox
- High-resolution multi-photo galleries for every event with photographer tags, timestamps, and captions.
- Fullscreen interactive slideshow with keyboard navigation (`Left`, `Right`, `Esc`) and high-res photo download.

### 3. Academic Materials & Presentation Slides (PPTs)
- Direct access to curriculum-mapped lecture slide decks (`.pptx` / `.pdf`), academic study handouts, and lab manuals.
- AKTU syllabus subject mapping (e.g., `KDS-501: Deep Learning`, `KDS-602: Cloud Data Engineering`).

### 4. Two Dedicated Portals
- **Student Portal**:
  - Live QR Entry Passes with high-DPI rendering and 1-click download for on-campus verification.
  - History of attended workshops and seminars.
  - **Verified Digital Certificates** with unique verifiable Certificate IDs and print-ready format.
  - Academic PPTs & Notes library from registered sessions.
- **Department Committee Portal** (Faculty & Coordinators):
  - Executive telemetry dashboard (Total events, attendees, certificates, photo archive count).
  - Event lifecycle management (Create, Edit, Delete, Session tagging, PPT link attachments).
  - Live Attendee Management with 1-click QR Check-In toggle.
  - Digital Certificate Generator & Issuer.
  - Photo Album uploader and manager.
  - Department broadcast announcements.

### 5. Microsoft College Email Authentication (`@abes.ac.in`)
- **Strict Domain Verification**: Real-time domain checker enforcing institutional email policy.
- **Personal Email Detection**: Automatically identifies and rejects personal email domains (`@gmail.com`, `@yahoo.com`, `@outlook.com`, etc.) with informative policy alerts.
- Dedicated Microsoft 365 Single Sign-On flow.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
cd DS-Nexus
npm install
```

### 2. Run in Development Mode
```bash
npm run dev
```
- Client runs on `http://localhost:5173`
- Backend API runs on `http://localhost:3002`

### 3. Production Build
```bash
npm run build
npm start
```

---

## 👥 Demo Accounts

### Student Portal (Microsoft 365)
- **Email**: `vaibhav.25ds101@abes.ac.in`
- **Password**: `Vaibhav#2026`
- **Role**: 2nd Year B.Tech CSE (Data Science)

### Department Committee Portal (Faculty)
- **Email**: `hod.ds@abes.ac.in`
- **Password**: `Admin#DS2026`
- **Role**: Head of Department (Prof. Dr. Sanjay Singh)
- **Convener Email**: `committee.ds@abes.ac.in` (Password: `Faculty#DS2026`)
