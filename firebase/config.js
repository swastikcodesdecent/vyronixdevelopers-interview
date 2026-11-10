/* ==========================================================================
   VYRONIX LABS - DEVS INTERVIEW FIREBASE CONFIGURATION & HYBRID ENGINE
   ========================================================================== */

// Hardcoded Firebase Production Configuration
const hardcodedFirebaseConfig = {
  apiKey: "AIzaSyA23o-V3DoIu_ce_uc0na8p5i33J6qXRls",
  authDomain: "vyronix-labs.firebaseapp.com",
  projectId: "vyronix-labs",
  storageBucket: "vyronix-labs.firebasestorage.app",
  messagingSenderId: "214825027795",
  appId: "1:214825027795:web:0dc0d10c8be950d8592c26",
  databaseURL: "https://vyronix-labs-default-rtdb.firebaseio.com"
};

window.VyronixFirebaseConfig = hardcodedFirebaseConfig;

// Initialize Firebase if CDN SDKs are loaded
let firebaseApp = null;
let firebaseAuth = null;
let firestoreDb = null;
let realtimeDb = null;

try {
  if (typeof firebase !== 'undefined') {
    firebaseApp = firebase.apps.length ? firebase.app() : firebase.initializeApp(window.VyronixFirebaseConfig);
    firebaseAuth = firebase.auth();
    firestoreDb = firebase.firestore();
    // Note: Cloud Firestore is the active primary cloud engine for project vyronix-labs.
    // Realtime DB is kept null unless verified to exist to avoid hanging WebSockets on 404 endpoints.
    console.log('[Devs Interview] Connected to Cloud Firestore (vyronix-labs)');
  } else {
    console.warn('[Devs Interview] Firebase CDN SDKs not detected; running on local fallback');
  }
} catch (err) {
  console.warn('[Devs Interview] Firebase initialization note:', err.message);
}

// Global Firebase accessor
window.firebaseServices = {
  app: firebaseApp,
  auth: firebaseAuth,
  firestore: firestoreDb,
  realtime: realtimeDb,
  isLiveFirebase: !!(firebaseApp && firestoreDb)
};
