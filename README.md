# Devs Interview - By Vyronix Labs
### Enterprise Interview Management & Remote Proctoring Platform
**Tagline:** Smarter Interviews. Better Decisions.

---

## 1. Executive Summary

**Devs Interview - By Vyronix Labs** is a production-grade, enterprise-ready digital interview management and remote proctoring system engineered for **Vyronix Labs**. Built with a unified Single Sign-On (SSO) architecture for administrative and evaluating staff, alongside a secluded, distraction-free candidate interview room, it enables organizations to schedule, conduct, monitor, and evaluate candidate sessions with deep technical proctoring telemetry.

---

## 2. Platform Architecture

```
vyronix-interviewos/
│
├── index.html                   # Landing & operations portal gateway
├── login.html                   # Unified authentication & demo account selector
│
├── admin/                       # Unified Admin / Interviewer Dashboard
│   ├── dashboard.html           # 8-metric overview, active pipeline, live telemetry
│   ├── interviews.html          # Searchable/filterable interview management directory
│   ├── schedule.html            # Interview scheduling & token generator
│   ├── monitoring.html          # Real-time WebRTC live screen & webcam surveillance
│   ├── candidates.html          # Talent directory & candidate dossier
│   ├── reports.html             # Evaluation rubrics, proctoring metrics & printable PDF
│   ├── interviewers.html        # Admin-only staff account provisioning
│   └── settings.html            # Platform parameters & Firebase/WebRTC configuration
│
├── candidate/                   # Distraction-Free Candidate Interface
│   ├── pre-check.html           # Token validation, consent agreement & device diagnostics
│   ├── interview.html           # Fullscreen proctored room, dual-stream WebRTC, question dock
│   └── completed.html           # Session finalized receipt screen
│
├── assets/
│   ├── css/
│   │   ├── global.css           # Design system tokens, variables, typography, UI components
│   │   ├── dashboard.css        # Sidebar, topbar, monitoring canvas & timeline layouts
│   │   └── candidate.css        # Candidate room layout, warning banners & modals
│   └── js/
│       ├── app.js               # Unified navigation & role-based sidebar controller
│       └── dashboard.js         # Reactive metric computations & pipeline table renderer
│
├── firebase/
│   ├── config.js                # Dual-mode Firebase / Local reactive signaling engine
│   └── ...
│
├── services/
│   ├── auth-service.js          # Role-based access control (Admin vs Interviewer)
│   ├── interview-service.js     # Interviews, questions, events, and reports database
│   ├── webrtc-service.js        # RTCPeerConnection dual-stream (Screen & Webcam) engine
│   ├── monitoring-service.js    # Fullscreen, tab visibility & window focus detection
│   ├── network-service.js       # Client device fingerprint, IP intelligence & latency
│   └── notification-service.js  # Audio-visual toast notifications & alert chimes
│
├── functions/                   # Firebase Cloud Functions backend
│   ├── index.js                 # Email dispatch, token validation, IP lookup proxy
│   └── package.json
│
├── firestore.rules              # Backend security rules for Firestore
├── database.rules.json          # Realtime Database rules for WebRTC signalling
├── firebase.json                # Firebase hosting & routing configuration
└── README.md
```

---

## 3. Brand Identity & Design System

The interface adheres strictly to the Vyronix enterprise SaaS aesthetic:

- **Main Background:** `#0B1020`
- **Secondary Background:** `#111827`
- **Card Background:** `#151E30`
- **Primary Accent:** `#6366F1` (Indigo)
- **Secondary Accent:** `#38BDF8` (Sky)
- **Success:** `#10B981` (Emerald)
- **Warning:** `#F59E0B` (Amber)
- **Danger:** `#EF4444` (Rose)
- **Border:** `#263449`
- **Headings Font:** `Manrope` (800 / 700 / 600)
- **Body Font:** `Inter` (300 / 400 / 500 / 600)
- **Icons:** Lucide Icons (zero emojis for interface controls)

---

## 4. Role-Based Permissions Matrix

Admin and Interviewer share the exact same login portal and dashboard codebase:

| Capability | System Administrator | Interviewer | Candidate |
|---|:---:|:---:|:---:|
| Unified Portal Login | Yes | Yes | No (Token link only) |
| Organization-Wide Metrics | Yes | No (Assigned only) | No |
| View All Interviews | Yes | No (Assigned only) | No |
| Schedule Interviews | Yes | No | No |
| Cancel / Reschedule | Yes | No | No |
| Live WebRTC Surveillance | Any Session | Assigned Only | No |
| Flash Live Questions | Yes | Yes | View Only |
| Candidate Dossier & Reports | All | Assigned Only | No |
| Fill Evaluation Rubric | Yes | Yes | No |
| Manage Interviewer Staff | Yes | No | No |
| Platform Global Settings | Yes | No | No |

---

## 5. Executive Administrator Credentials

### Administrator 1 (CEO)
- **Email:** `suvajit.ceo@vyronixlabs.com`
- **Password:** `ceo1234`

### Administrator 2 (CTO)
- **Email:** `swastik.cto@vyronixlabs.com`
- **Password:** `cto1234`

*Note: Both administrators can change their password at any time via the key icon in the sidebar profile footer or within **Platform Settings** (`admin/settings.html`).*

---

## 6. End-to-End Operational Workflow

1. **Sign in to Operations Portal:**
   Root URL redirects straight to `login.html`. Sign in using either administrator account.
2. **Schedule an Interview:**
   Navigate to **"Schedule Interview"**, enter candidate details, assign an interviewer, select webcam, microphone, screen sharing, and fullscreen proctoring requirements, and click **"Schedule & Generate Invitation Token"**.
3. **Direct Candidate Access:**
   Candidates join directly via their unique cryptographic interview link (`candidate/pre-check.html?token=<token>`). There is no public landing page.
4. **Device Compatibility & Consent:**
   On `candidate/pre-check.html`, the candidate reviews proctoring consent, completes camera, microphone, and desktop screen sharing verification, and enters the proctored interview room.
5. **Live Monitoring & Surveillance:**
   In the admin console under **"Live Monitoring"**, the assigned interviewer or administrator monitors:
   - Real-time candidate shared screen stream.
   - Candidate webcam stream in picture-in-picture.
   - Hardware status indicators (Webcam, Screen, Fullscreen, Warning Count).
6. **Flash Questions in Real Time:**
   From the question dock, broadcast questions with optional timers directly onto the candidate's screen in real time.
7. **Proctoring Telemetry:**
   Candidate fullscreen exits, tab switches, and window focus losses are detected and logged in the activity audit stream in real time.
8. **Evaluation & Official PDF Report:**
   Conclude the interview to open `admin/reports.html`. Score candidate rating rubrics, enter technical notes, select the recommendation (*Selected / Rejected / Further Review / On Hold*), and export or print the official PDF report.
6. **Flash Questions in Real Time:**
   In the Live Monitoring question dock, type a question (e.g. *"Design a distributed key-value store with raft consensus"*), select a 5-minute timer, and click **"Flash Question"**. Switch to the Candidate tab: the question card appears instantly with an animated countdown timer without refreshing the page!
7. **Proctoring Violations:**
   In the Candidate tab, switch to another tab or exit fullscreen. The candidate receives an alert warning banner and overlay, while the Interviewer/Admin dashboard timeline logs the violation in real time with an audio chime!
8. **Evaluation & Official PDF Report:**
   Conclude the interview to open `admin/reports.html`. Review technical client diagnostics (IP, ISP, ASN, OS, browser, latency), proctoring metrics summary, score candidate rating sliders, enter feedback, choose a recommendation (*Selected / Rejected / Further Review / On Hold*), and click **"Print / Export PDF"**.

---

## 7. Cloud Deployment & Production Hosting

### Hosting on Firebase:
```bash
# 1. Install Firebase CLI (if not installed)
npm install -g firebase-tools

# 2. Login to your Google Cloud / Firebase account
firebase login

# 3. Deploy Firestore rules, Realtime Database rules, Functions & Hosting
firebase deploy
```

