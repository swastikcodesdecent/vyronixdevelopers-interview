/* ==========================================================================
   VYRONIX LABS - INTERVIEWOS AUTH & ROLE SERVICE
   ========================================================================== */

class AuthService {
  constructor() {
    this.STORAGE_KEY = 'vyronix_auth_session';
    this.USERS_KEY = 'vyronix_users_db';
    this.currentUser = null;
    this.initDefaultUsers();
    this.loadSession();
  }

  // Initialize designated executive administrator accounts
  initDefaultUsers() {
    let users = [];
    try {
      users = JSON.parse(localStorage.getItem(this.USERS_KEY)) || [];
    } catch (e) {
      users = [];
    }

    const defaultAdmins = [
      {
        uid: 'usr_suvajit_ceo',
        name: 'Suvajit',
        email: 'suvajit.ceo@vyronixlabs.com',
        password: 'ceo1234',
        role: 'admin',
        position: 'Chief Executive Officer (CEO)',
        department: 'Executive Leadership',
        isActive: true,
        createdAt: new Date().toISOString()
      },
      {
        uid: 'usr_swastik_cto',
        name: 'Swastik',
        email: 'swastik.cto@vyronixlabs.com',
        password: 'cto1234',
        role: 'admin',
        position: 'Chief Technology Officer (CTO)',
        department: 'Executive Leadership',
        isActive: true,
        createdAt: new Date().toISOString()
      }
    ];

    // Ensure both executive admin accounts are present
    defaultAdmins.forEach(admin => {
      const existingIndex = users.findIndex(u => u.email.toLowerCase() === admin.email.toLowerCase());
      if (existingIndex >= 0) {
        // preserve updated passwords if changed
        if (!users[existingIndex].password) users[existingIndex].password = admin.password;
        users[existingIndex].role = 'admin';
        users[existingIndex].name = admin.name;
        users[existingIndex].position = admin.position;
      } else {
        users.unshift(admin);
      }
    });

    // Remove obsolete legacy demo users if any exist
    users = users.filter(u => u.email !== 'admin@vyronix.com');

    localStorage.setItem(this.USERS_KEY, JSON.stringify(users));
  }

  getUsers() {
    try {
      return JSON.parse(localStorage.getItem(this.USERS_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  saveUsers(users) {
    localStorage.setItem(this.USERS_KEY, JSON.stringify(users));
    if (window.firebaseServices && window.firebaseServices.firestore) {
      users.forEach(u => {
        try {
          const safeUser = { ...u };
          delete safeUser.password;
          window.firebaseServices.firestore.collection('users').doc(u.uid).set(safeUser, { merge: true }).catch(() => {});
        } catch (e) {}
      });
    }
  }

  _withTimeout(promise, ms = 2500) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Auth timeout')), ms))
    ]);
  }

  loadSession() {
    const raw = localStorage.getItem(this.STORAGE_KEY);
    if (raw) {
      try {
        this.currentUser = JSON.parse(raw);
      } catch (e) {
        this.currentUser = null;
      }
    }
  }

  async login(email, password) {
    const cleanEmail = (email || '').trim().toLowerCase();

    // Check local enterprise user database first or via Firebase Auth
    const users = this.getUsers();
    const localUser = users.find(u => u.email.toLowerCase() === cleanEmail);

    if (window.firebaseServices && window.firebaseServices.auth) {
      try {
        const userCredential = await this._withTimeout(
          window.firebaseServices.auth.signInWithEmailAndPassword(cleanEmail, password),
          2500
        );
        let user = localUser;
        if (!user) {
          user = {
            uid: userCredential.user.uid,
            name: userCredential.user.displayName || cleanEmail.split('@')[0],
            email: cleanEmail,
            role: (cleanEmail === 'suvajit.ceo@vyronixlabs.com' || cleanEmail === 'swastik.cto@vyronixlabs.com') ? 'admin' : 'interviewer',
            isActive: true
          };
        }
        if (!user.isActive) {
          throw new Error('This account has been deactivated by the system administrator.');
        }
        const sessionUser = {
          uid: user.uid,
          name: user.name,
          email: user.email,
          role: user.role,
          position: user.position,
          department: user.department,
          isActive: user.isActive
        };
        this.currentUser = sessionUser;
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(sessionUser));
        return { success: true, user: sessionUser };
      } catch (fbErr) {
        if (fbErr && fbErr.message && fbErr.message.includes('deactivated')) {
          throw fbErr;
        }
        console.warn('Firebase signin fallback to database verification:', fbErr.message);
      }
    }

    // Direct enterprise database verification
    if (!localUser || localUser.password !== password) {
      throw new Error('Invalid email or password. Please verify credentials.');
    }

    if (!localUser.isActive) {
      throw new Error('This account has been deactivated by the system administrator.');
    }

    // Provision or sign in Firebase Auth user so Firestore Security Rules recognize request.auth
    if (window.firebaseServices && window.firebaseServices.auth) {
      try {
        await this._withTimeout(
          window.firebaseServices.auth.createUserWithEmailAndPassword(cleanEmail, password),
          2500
        );
      } catch (createErr) {
        this.lastAuthError = createErr.code || createErr.message;
      }
    }

    const sessionUser = {
      uid: localUser.uid,
      name: localUser.name,
      email: localUser.email,
      role: localUser.role,
      position: localUser.position,
      department: localUser.department,
      isActive: localUser.isActive
    };

    this.currentUser = sessionUser;
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(sessionUser));
    return { success: true, user: sessionUser };
  }

  // Ensure Firebase Auth SDK is signed in for the currently active local session
  async ensureFirebaseAuthSession() {
    const auth = window.firebaseServices && window.firebaseServices.auth;
    if (!auth) return { ok: false, reason: 'auth-not-initialized' };

    if (auth.currentUser) {
      return { ok: true, email: auth.currentUser.email };
    }

    // Deduplicate concurrent ensure calls
    if (this._ensurePromise) return this._ensurePromise;

    this._ensurePromise = (async () => {
      try {
        // Wait briefly for Firebase IndexedDB session restoration
        await new Promise((resolve) => {
          let settled = false;
          const unsub = auth.onAuthStateChanged(() => {
            if (!settled) { settled = true; unsub(); resolve(); }
          });
          setTimeout(() => {
            if (!settled) { settled = true; try { unsub(); } catch (e) {} resolve(); }
          }, 1000);
        });

        if (auth.currentUser) {
          return { ok: true, email: auth.currentUser.email };
        }

        const session = this.getCurrentUser();
        if (!session || !session.email) {
          return { ok: false, reason: 'no-local-session' };
        }

        const localRecord = this.getUsers().find(u => u.email.toLowerCase() === session.email.toLowerCase());
        if (!localRecord || !localRecord.password) {
          return { ok: false, reason: 'missing-credentials' };
        }

        try {
          await this._withTimeout(auth.signInWithEmailAndPassword(localRecord.email, localRecord.password), 2500);
          return { ok: true, email: auth.currentUser?.email || localRecord.email };
        } catch (signInErr) {
          try {
            await this._withTimeout(auth.createUserWithEmailAndPassword(localRecord.email, localRecord.password), 2500);
            return { ok: true, email: auth.currentUser?.email || localRecord.email };
          } catch (createErr) {
            this.lastAuthError = createErr.code || signInErr.code || createErr.message;
            console.warn('[Auth] Firebase Auth auto-session failed:', this.lastAuthError);
            return { ok: false, reason: this.lastAuthError };
          }
        }
      } finally {
        this._ensurePromise = null;
      }
    })();

    return this._ensurePromise;
  }

  // Change Password for logged in user (Supports Suvajit and Swastik)
  async changePassword(oldPassword, newPassword) {
    if (!this.currentUser) {
      throw new Error('No authenticated user session.');
    }

    const users = this.getUsers();
    const userRecord = users.find(u => u.email.toLowerCase() === this.currentUser.email.toLowerCase());

    if (!userRecord) {
      throw new Error('User record not found in system database.');
    }

    if (userRecord.password && userRecord.password !== oldPassword) {
      throw new Error('Current password does not match records.');
    }

    // Update in Firebase Auth if online user exists
    if (window.firebaseServices && window.firebaseServices.auth && window.firebaseServices.auth.currentUser) {
      try {
        await window.firebaseServices.auth.currentUser.updatePassword(newPassword);
        console.log('[Auth] Password updated in Firebase Authentication');
      } catch (fbErr) {
        console.warn('[Auth] Firebase Auth password update notice:', fbErr.message);
      }
    }

    // Update in local records
    userRecord.password = newPassword;
    userRecord.updatedAt = new Date().toISOString();
    this.saveUsers(users);

    return { success: true, message: 'Password updated successfully.' };
  }

  logout() {
    if (window.firebaseServices && window.firebaseServices.auth) {
      try {
        window.firebaseServices.auth.signOut();
      } catch (e) {}
    }
    this.currentUser = null;
    localStorage.removeItem(this.STORAGE_KEY);
    window.location.href = '../login.html';
  }

  getCurrentUser() {
    if (!this.currentUser) {
      this.loadSession();
    }
    return this.currentUser;
  }

  isAdmin() {
    return this.currentUser && this.currentUser.role === 'admin';
  }

  isInterviewer() {
    return this.currentUser && this.currentUser.role === 'interviewer';
  }

  canAccessInterview(interview) {
    if (!this.currentUser) return false;
    if (this.isAdmin()) return true;
    if (interview.interviewerId === 'both') return true;
    return (
      interview.interviewerId === this.currentUser.uid ||
      (interview.interviewerEmail && interview.interviewerEmail.toLowerCase().includes(this.currentUser.email.toLowerCase()))
    );
  }

  // Guard page for Admin/Interviewer
  requireAuth(requiredRole = null) {
    const user = this.getCurrentUser();
    if (!user) {
      const inAdmin = window.location.pathname.includes('/admin/');
      window.location.href = inAdmin ? '../login.html' : 'login.html';
      return null;
    }

    if (requiredRole === 'admin' && user.role !== 'admin') {
      alert('Access restricted to System Administrators.');
      window.location.href = 'dashboard.html';
      return null;
    }

    return user;
  }

  // Real-time cloud sync for users collection
  initUsersCloudSync() {
    const fs = window.firebaseServices && window.firebaseServices.firestore;
    if (!fs || this._usersSyncActive) return;
    this._usersSyncActive = true;

    try {
      fs.collection('users').onSnapshot((snapshot) => {
        if (snapshot.metadata && snapshot.metadata.fromCache && snapshot.empty) return;
        const localUsers = this.getUsers();
        const passMap = new Map();
        localUsers.forEach(u => {
          if (u && u.email && u.password) passMap.set(u.email.toLowerCase(), u.password);
        });

        const cloudUsers = [];
        snapshot.forEach(doc => {
          const data = doc.data();
          if (data && data.email) {
            const savedPass = passMap.get(data.email.toLowerCase());
            cloudUsers.push({
              ...data,
              uid: data.uid || doc.id,
              password: savedPass || data.password || ''
            });
          }
        });

        if (cloudUsers.length > 0) {
          // Ensure core executive admins always remain available
          localUsers.forEach(u => {
            if ((u.email === 'suvajit.ceo@vyronixlabs.com' || u.email === 'swastik.cto@vyronixlabs.com') &&
                !cloudUsers.some(cu => cu.email.toLowerCase() === u.email.toLowerCase())) {
              cloudUsers.unshift(u);
            }
          });
          localStorage.setItem(this.USERS_KEY, JSON.stringify(cloudUsers));
          if (window.interviewService) {
            window.interviewService.notifyLocalListeners('USERS_SYNCED', cloudUsers);
          }
        }
      }, () => {});
    } catch (e) {}
  }
}

window.authService = new AuthService();

// Automatically synchronize Firebase Auth session on admin pages & attach authoritative cloud listeners
if (typeof window !== 'undefined' && window.location && window.location.pathname.includes('/admin/')) {
  setTimeout(async () => {
    const authRes = await window.authService.ensureFirebaseAuthSession();
    window.authService.initUsersCloudSync();
    if (window.interviewService && typeof window.interviewService.initCloudSync === 'function') {
      window.interviewService.initCloudSync();
    }
    if (!authRes.ok && authRes.reason === 'auth/operation-not-allowed') {
      console.warn('[Auth] Email/Password Sign-In is disabled in Firebase Authentication Console.');
    }
  }, 150);
}
