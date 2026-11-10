/* ==========================================================================
   VYRONIX LABS - DEVS INTERVIEW CORE INTERVIEW & DATA SERVICE
   ========================================================================== */

class InterviewService {
  constructor() {
    this.INTERVIEWS_KEY = 'vyronix_interviews_db';
    this.EVENTS_KEY = 'vyronix_events_db';
    this.QUESTIONS_KEY = 'vyronix_questions_db';
    this.REPORTS_KEY = 'vyronix_reports_db';
    this.NOTIFICATIONS_KEY = 'vyronix_notifications_db';
    
    // BroadcastChannel for instant cross-tab real-time reactivity
    try {
      this.syncChannel = new BroadcastChannel('vyronix_interviewos_sync');
      this.syncChannel.onmessage = (event) => {
        this.handleIncomingSync(event.data);
      };
    } catch (e) {
      this.syncChannel = null;
    }
    this.listeners = [];

    // Purge any legacy demo data from storage
    this.purgeDemoData();

    // Start live authoritative Cloud Firestore synchronization
    setTimeout(() => {
      this.initCloudSync();
    }, 200);
  }

  // Timeout guard so cloud calls can never hang UI
  _withTimeout(promise, ms = 2500) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Cloud operation timeout')), ms))
    ]);
  }

  // Cross-tab broadcast dispatcher
  broadcast(action, payload) {
    const message = { action, payload, timestamp: Date.now() };
    if (this.syncChannel) {
      try { this.syncChannel.postMessage(message); } catch (e) {}
    }
    this.notifyLocalListeners(action, payload);
  }

  onSync(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  notifyLocalListeners(action, payload) {
    this.listeners.forEach(cb => {
      try { cb({ action, payload }); } catch (e) { console.error(e); }
    });
  }

  handleIncomingSync(data) {
    if (data && data.action) {
      this.notifyLocalListeners(data.action, data.payload);
    }
  }

  // Authoritative Real-time Firestore synchronization (adds, updates, and deletions reflect immediately)
  initCloudSync() {
    const fs = window.firebaseServices && window.firebaseServices.firestore;
    if (!fs || this._cloudSyncStarted) return;

    const isAdminPage = window.location.pathname.includes('/admin/');
    if (!isAdminPage) return;

    this._cloudSyncStarted = true;

    try {
      // 1. Authoritative real-time Interviews collection listener
      fs.collection('interviews').onSnapshot((snapshot) => {
        // Skip initial empty cache before server confirms state
        if (snapshot.metadata && snapshot.metadata.fromCache && snapshot.empty) return;

        const cloudList = [];
        snapshot.forEach(doc => {
          const data = doc.data();
          if (data) {
            if (!data.interviewId) data.interviewId = doc.id;
            cloudList.push(data);
          }
        });

        cloudList.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        localStorage.setItem(this.INTERVIEWS_KEY, JSON.stringify(cloudList));
        this.notifyLocalListeners('CLOUD_SYNC', { type: 'interviews', count: cloudList.length });
      }, (err) => {
        console.warn('[InterviewService] Cloud interviews snapshot notice:', err.message);
      });

      // 2. Authoritative real-time Proctoring Events listener
      fs.collection('interviewEvents').onSnapshot((snapshot) => {
        if (snapshot.metadata && snapshot.metadata.fromCache && snapshot.empty) return;

        let previousCount = 0;
        try { previousCount = (JSON.parse(localStorage.getItem(this.EVENTS_KEY)) || []).length; } catch (e) {}

        const cloudEvents = [];
        let newestAdded = null;
        snapshot.docChanges().forEach(change => {
          if (change.type === 'added') {
            newestAdded = change.doc.data();
          }
        });

        snapshot.forEach(doc => {
          const data = doc.data();
          if (data) {
            if (!data.eventId) data.eventId = doc.id;
            cloudEvents.push(data);
          }
        });

        cloudEvents.sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
        localStorage.setItem(this.EVENTS_KEY, JSON.stringify(cloudEvents));

        if (newestAdded && cloudEvents.length > previousCount) {
          this.notifyLocalListeners('PROCTORING_EVENT', newestAdded);
        } else {
          this.notifyLocalListeners('CLOUD_SYNC', { type: 'events', count: cloudEvents.length });
        }
      }, (err) => {
        console.warn('[InterviewService] Cloud events snapshot notice:', err.message);
      });

      // 3. Authoritative real-time Reports listener
      fs.collection('interviewReports').onSnapshot((snapshot) => {
        if (snapshot.metadata && snapshot.metadata.fromCache && snapshot.empty) return;

        const cloudReports = [];
        snapshot.forEach(doc => {
          const data = doc.data();
          if (data) {
            if (!data.reportId) data.reportId = doc.id;
            cloudReports.push(data);
          }
        });

        localStorage.setItem(this.REPORTS_KEY, JSON.stringify(cloudReports));
        this.notifyLocalListeners('CLOUD_SYNC', { type: 'reports', count: cloudReports.length });
      }, () => {});

      // 4. Authoritative real-time Candidate Technical Diagnostics listener
      fs.collection('candidateTechnicalInfo').onSnapshot((snapshot) => {
        if (snapshot.metadata && snapshot.metadata.fromCache && snapshot.empty) return;

        snapshot.forEach(doc => {
          const data = doc.data();
          if (data) {
            localStorage.setItem(`vyronix_techinfo_${doc.id}`, JSON.stringify(data));
          }
        });
        this.notifyLocalListeners('CLOUD_SYNC', { type: 'techinfo' });
      }, () => {});

      // 5. Authoritative real-time Notifications listener
      fs.collection('notifications').onSnapshot((snapshot) => {
        if (snapshot.metadata && snapshot.metadata.fromCache && snapshot.empty) return;

        const cloudNotifs = [];
        snapshot.forEach(doc => {
          const data = doc.data();
          if (data) {
            if (!data.notificationId) data.notificationId = doc.id;
            cloudNotifs.push(data);
          }
        });
        cloudNotifs.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        localStorage.setItem(this.NOTIFICATIONS_KEY, JSON.stringify(cloudNotifs.slice(0, 50)));
        this.notifyLocalListeners('CLOUD_SYNC', { type: 'notifications' });
      }, () => {});
    } catch (e) {
      console.warn('[InterviewService] Cloud sync init warning:', e);
    }
  }

  // Generate unguessable secure interview token
  generateSecureToken() {
    try {
      if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
        const array = new Uint8Array(24);
        window.crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
      }
    } catch (e) {}
    // Fallback cryptographic-style random string
    let fallback = '';
    const chars = '0123456789abcdef';
    for (let i = 0; i < 48; i++) {
      fallback += chars[Math.floor(Math.random() * chars.length)];
    }
    return fallback;
  }

  // Purge any demo or hardcoded records
  purgeDemoData() {
    try {
      const demoIds = ['vy-int-9041', 'vy-int-9042', 'vy-int-9038', 'rep-vy-9038'];
      
      const interviewsRaw = localStorage.getItem(this.INTERVIEWS_KEY);
      if (interviewsRaw) {
        let list = JSON.parse(interviewsRaw);
        list = list.filter(i => !demoIds.includes(i.interviewId));
        localStorage.setItem(this.INTERVIEWS_KEY, JSON.stringify(list));
      }

      const reportsRaw = localStorage.getItem(this.REPORTS_KEY);
      if (reportsRaw) {
        let reports = JSON.parse(reportsRaw);
        reports = reports.filter(r => !demoIds.includes(r.reportId) && !demoIds.includes(r.interviewId));
        localStorage.setItem(this.REPORTS_KEY, JSON.stringify(reports));
      }

      const eventsRaw = localStorage.getItem(this.EVENTS_KEY);
      if (eventsRaw) {
        let events = JSON.parse(eventsRaw);
        events = events.filter(e => !demoIds.includes(e.interviewId));
        localStorage.setItem(this.EVENTS_KEY, JSON.stringify(events));
      }
    } catch (e) {
      console.warn('Error purging demo data', e);
    }
  }

  // Clear all platform data
  clearAllData() {
    localStorage.removeItem(this.INTERVIEWS_KEY);
    localStorage.removeItem(this.EVENTS_KEY);
    localStorage.removeItem(this.QUESTIONS_KEY);
    localStorage.removeItem(this.REPORTS_KEY);
    localStorage.removeItem(this.NOTIFICATIONS_KEY);
    this.broadcast('DATA_CLEARED', {});
  }

  // Get all interviews
  getInterviews() {
    try {
      return JSON.parse(localStorage.getItem(this.INTERVIEWS_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  // Get single interview by ID
  getInterviewById(interviewId) {
    const list = this.getInterviews();
    return list.find(i => i.interviewId === interviewId);
  }

  // Get interview by unique token (synchronous cache lookup)
  getInterviewByToken(token) {
    if (!token) return null;
    const list = this.getInterviews();
    return list.find(i => i.token === token);
  }

  // Authoritative token lookup (queries Cloud Firestore first so deleted/cancelled interviews are rejected immediately)
  async getInterviewByTokenAsync(token) {
    if (!token) return null;

    if (window.firebaseServices && window.firebaseServices.firestore) {
      try {
        const querySnap = await this._withTimeout(
          window.firebaseServices.firestore
            .collection('interviews')
            .where('token', '==', token)
            .limit(1)
            .get(),
          4000
        );
        if (!querySnap.empty) {
          const found = querySnap.docs[0].data();
          this.cacheInterviewLocally(found);
          return found;
        }
        // Server authoritatively confirmed token does not exist (deleted or invalid)
        const list = this.getInterviews().filter(i => i.token !== token);
        localStorage.setItem(this.INTERVIEWS_KEY, JSON.stringify(list));
        return null;
      } catch (err) {
        console.warn('[InterviewService] Firestore lookup fallback to local cache:', err.message);
      }
    }

    // Offline / local fallback
    return this.getInterviewByToken(token);
  }

  // Real-time listener on single interview document (used by Candidate screens)
  subscribeToInterview(interviewId, callback) {
    const fs = window.firebaseServices && window.firebaseServices.firestore;
    if (!fs || !interviewId) return () => {};
    try {
      return fs.collection('interviews').doc(interviewId).onSnapshot((doc) => {
        if (doc.exists) {
          const data = doc.data();
          this.cacheInterviewLocally(data);
          callback(data);
        } else if (!doc.metadata.fromCache) {
          callback(null);
        }
      }, () => {});
    } catch (e) {
      return () => {};
    }
  }

  // Delete an interview completely (local + Cloud Firestore)
  async deleteInterview(interviewId) {
    if (!interviewId) return;
    const list = this.getInterviews().filter(i => i.interviewId !== interviewId);
    localStorage.setItem(this.INTERVIEWS_KEY, JSON.stringify(list));

    const fs = window.firebaseServices && window.firebaseServices.firestore;
    if (fs) {
      try {
        if (window.authService && typeof window.authService.ensureFirebaseAuthSession === 'function') {
          await window.authService.ensureFirebaseAuthSession();
        }
        await this._withTimeout(fs.collection('interviews').doc(interviewId).delete(), 3000);
        fs.collection('liveQuestions').doc(interviewId).delete().catch(() => {});
        fs.collection('candidateTechnicalInfo').doc(interviewId).delete().catch(() => {});
        fs.collection('interviewReports').doc(`rep-${interviewId}`).delete().catch(() => {});
      } catch (err) {
        console.warn('[InterviewService] Cloud delete notice:', err.message);
      }
    }

    this.broadcast('CLOUD_SYNC', { type: 'interviews' });
  }

  cacheInterviewLocally(interview) {
    if (!interview || !interview.interviewId) return;
    const list = this.getInterviews();
    const idx = list.findIndex(i => i.interviewId === interview.interviewId);
    if (idx >= 0) {
      list[idx] = interview;
    } else {
      list.unshift(interview);
    }
    localStorage.setItem(this.INTERVIEWS_KEY, JSON.stringify(list));
  }

  // Schedule new interview
  async createInterview(data) {
    const token = this.generateSecureToken();
    const interviewId = 'vy-int-' + Math.floor(1000 + Math.random() * 9000);
    
    const isJoint = data.interviewerId === 'both';
    const interviewerName = isJoint 
      ? 'Executive Panel (Suvajit & Swastik)' 
      : (data.interviewerName || 'Assigned Interviewer');
    const interviewerEmail = isJoint 
      ? 'suvajit.ceo@vyronixlabs.com, swastik.cto@vyronixlabs.com' 
      : (data.interviewerEmail || '');

    const newInterview = {
      interviewId,
      token,
      candidateName: (data.candidateName || '').trim(),
      candidateEmail: (data.candidateEmail || '').trim(),
      candidatePhone: data.candidatePhone || '',
      position: (data.position || '').trim(),
      department: data.department || 'Frontend Developer',
      interviewerId: data.interviewerId || 'both',
      interviewerName,
      interviewerEmail,
      scheduledDate: data.scheduledDate,
      scheduledTime: data.scheduledTime,
      duration: parseInt(data.duration || 60, 10),
      interviewType: data.interviewType || 'Technical Interview',
      instructions: data.instructions || '',
      settings: {
        requireWebcam: data.settings?.requireWebcam !== false,
        requireMicrophone: data.settings?.requireMicrophone !== false,
        requireScreenShare: data.settings?.requireScreenShare !== false,
        requireFullscreen: data.settings?.requireFullscreen !== false,
        monitorBrowserActivity: data.settings?.monitorBrowserActivity !== false,
        maxWarnings: parseInt(data.settings?.maxWarnings || 3, 10)
      },
      status: 'Scheduled',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // 1. Always save locally first (guaranteed instant)
    const interviews = this.getInterviews();
    interviews.unshift(newInterview);
    localStorage.setItem(this.INTERVIEWS_KEY, JSON.stringify(interviews));

    // 2. Persist to Cloud Firestore with Firebase Auth session check & timeout guard
    let cloudError = null;
    if (window.firebaseServices && window.firebaseServices.firestore) {
      try {
        if (window.authService && typeof window.authService.ensureFirebaseAuthSession === 'function') {
          await window.authService.ensureFirebaseAuthSession();
        }
        await this._withTimeout(
          window.firebaseServices.firestore.collection('interviews').doc(interviewId).set(newInterview),
          3500
        );
        this.lastCloudError = null;
      } catch (err) {
        cloudError = err.code || err.message || 'firestore-write-failed';
        this.lastCloudError = cloudError;
        console.error('[InterviewService] Firestore write rejected:', cloudError, err);
      }
    }

    // 3. Add activity notification
    this.addNotification({
      title: 'Interview Scheduled',
      message: `Interview created for ${newInterview.candidateName} (${newInterview.position})`,
      severity: 'info',
      interviewId: newInterview.interviewId
    });

    this.broadcast('INTERVIEW_CREATED', newInterview);
    return { ...newInterview, _cloudSynced: !cloudError, _cloudError: cloudError };
  }

  // Update interview status
  async updateStatus(interviewId, status) {
    const list = this.getInterviews();
    const target = list.find(i => i.interviewId === interviewId);
    const updatedAt = new Date().toISOString();

    if (target) {
      target.status = status;
      target.updatedAt = updatedAt;
      localStorage.setItem(this.INTERVIEWS_KEY, JSON.stringify(list));
    }

    if (window.firebaseServices && window.firebaseServices.firestore) {
      try {
        await this._withTimeout(
          window.firebaseServices.firestore.collection('interviews').doc(interviewId).set({ status, updatedAt }, { merge: true }),
          2000
        );
      } catch (e) {}
    }

    this.broadcast('STATUS_CHANGED', { interviewId, status });
    return target;
  }

  // Record proctoring events
  recordEvent(interviewId, eventType, description, severity = 'warning') {
    const event = {
      eventId: 'evt-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      interviewId,
      eventType,
      description,
      severity, // info, warning, danger
      timestamp: new Date().toISOString()
    };

    let events = [];
    try {
      events = JSON.parse(localStorage.getItem(this.EVENTS_KEY)) || [];
    } catch (e) {}

    events.push(event);
    localStorage.setItem(this.EVENTS_KEY, JSON.stringify(events));

    // Persist to Cloud Firestore
    if (window.firebaseServices && window.firebaseServices.firestore) {
      try {
        window.firebaseServices.firestore.collection('interviewEvents').doc(event.eventId).set(event).catch(() => {});
      } catch (e) {}
    }

    // Broadcast live event
    this.broadcast('PROCTORING_EVENT', event);

    // Also push notification for warnings & high severity
    if (severity === 'warning' || severity === 'danger') {
      this.addNotification({
        title: `Proctoring Alert: ${eventType}`,
        message: description,
        severity,
        interviewId
      });
    }

    return event;
  }

  getEvents(interviewId) {
    try {
      const all = JSON.parse(localStorage.getItem(this.EVENTS_KEY)) || [];
      return all.filter(e => e.interviewId === interviewId);
    } catch (e) {
      return [];
    }
  }

  // Flash question to candidate
  flashQuestion(interviewId, questionText, senderName, durationMinutes = 5) {
    const question = {
      questionId: 'q-' + Date.now(),
      interviewId,
      questionText: questionText.trim(),
      senderName,
      sentAt: new Date().toISOString(),
      durationSeconds: (durationMinutes || 5) * 60,
      active: true
    };

    let questions = [];
    try {
      questions = JSON.parse(localStorage.getItem(this.QUESTIONS_KEY)) || [];
    } catch (e) {}

    // Mark previous active questions for this interview as inactive
    questions = questions.map(q => q.interviewId === interviewId ? { ...q, active: false } : q);
    questions.push(question);
    localStorage.setItem(this.QUESTIONS_KEY, JSON.stringify(questions));

    // Push to Cloud Firestore liveQuestions doc for cross-network candidates
    if (window.firebaseServices && window.firebaseServices.firestore) {
      try {
        window.firebaseServices.firestore.collection('liveQuestions').doc(interviewId).set(question).catch(() => {});
        window.firebaseServices.firestore.collection('interviewQuestions').doc(question.questionId).set(question).catch(() => {});
      } catch (e) {}
    }

    this.broadcast('QUESTION_FLASHED', question);
    return question;
  }

  getActiveQuestion(interviewId) {
    try {
      const all = JSON.parse(localStorage.getItem(this.QUESTIONS_KEY)) || [];
      return all.find(q => q.interviewId === interviewId && q.active);
    } catch (e) {
      return null;
    }
  }

  clearActiveQuestion(interviewId) {
    let questions = [];
    try {
      questions = JSON.parse(localStorage.getItem(this.QUESTIONS_KEY)) || [];
    } catch (e) {}
    questions = questions.map(q => q.interviewId === interviewId ? { ...q, active: false } : q);
    localStorage.setItem(this.QUESTIONS_KEY, JSON.stringify(questions));

    if (window.firebaseServices && window.firebaseServices.firestore) {
      try {
        window.firebaseServices.firestore.collection('liveQuestions').doc(interviewId).set({ active: false, interviewId }).catch(() => {});
      } catch (e) {}
    }

    this.broadcast('QUESTION_CLEARED', { interviewId });
  }

  // Subscribe to live flashed questions via Cloud Firestore (cross-network)
  subscribeToQuestion(interviewId, callback) {
    const fs = window.firebaseServices && window.firebaseServices.firestore;
    if (!fs || !interviewId) return () => {};
    try {
      return fs.collection('liveQuestions').doc(interviewId).onSnapshot((doc) => {
        if (doc.exists) {
          callback(doc.data());
        } else {
          callback(null);
        }
      }, () => {});
    } catch (e) {
      return () => {};
    }
  }

  // Push any locally existing interviews to Cloud Firestore so other networks/devices can access them
  async syncAllLocalToCloud() {
    const list = this.getInterviews();
    if (!list.length) return { synced: 0, total: 0, error: null };

    const fs = window.firebaseServices && window.firebaseServices.firestore;
    if (!fs) return { synced: 0, total: list.length, error: 'firestore-not-initialized' };

    if (window.authService && typeof window.authService.ensureFirebaseAuthSession === 'function') {
      await window.authService.ensureFirebaseAuthSession();
    }

    let synced = 0;
    let lastError = null;
    for (const item of list) {
      try {
        await this._withTimeout(
          fs.collection('interviews').doc(item.interviewId).set(item, { merge: true }),
          3000
        );
        synced++;
      } catch (e) {
        lastError = e.code || e.message || 'sync-failed';
        this.lastCloudError = lastError;
        console.warn('[InterviewService] Sync to Firestore failed for', item.interviewId, ':', lastError);
      }
    }
    if (!lastError) this.lastCloudError = null;
    return { synced, total: list.length, error: lastError };
  }

  getQuestionHistory(interviewId) {
    try {
      const all = JSON.parse(localStorage.getItem(this.QUESTIONS_KEY)) || [];
      return all.filter(q => q.interviewId === interviewId);
    } catch (e) {
      return [];
    }
  }

  // Save candidate evaluation & report
  saveReport(reportData) {
    let reports = [];
    try {
      reports = JSON.parse(localStorage.getItem(this.REPORTS_KEY)) || [];
    } catch (e) {}

    const reportId = reportData.reportId || 'rep-' + reportData.interviewId;
    const fullReport = {
      ...reportData,
      reportId,
      completedAt: new Date().toISOString()
    };

    const index = reports.findIndex(r => r.reportId === reportId);
    if (index >= 0) {
      reports[index] = fullReport;
    } else {
      reports.push(fullReport);
    }

    localStorage.setItem(this.REPORTS_KEY, JSON.stringify(reports));

    if (window.firebaseServices && window.firebaseServices.firestore) {
      try {
        window.firebaseServices.firestore.collection('interviewReports').doc(reportId).set(fullReport).catch(() => {});
      } catch (e) {}
    }

    this.updateStatus(reportData.interviewId, 'Completed');
    this.broadcast('REPORT_GENERATED', fullReport);
    return fullReport;
  }

  getReport(interviewId) {
    try {
      const all = JSON.parse(localStorage.getItem(this.REPORTS_KEY)) || [];
      return all.find(r => r.interviewId === interviewId);
    } catch (e) {
      return null;
    }
  }

  getAllReports() {
    try {
      return JSON.parse(localStorage.getItem(this.REPORTS_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  // Real-time notifications
  addNotification(notif) {
    const item = {
      notificationId: 'notif-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      title: notif.title,
      message: notif.message,
      severity: notif.severity || 'info',
      interviewId: notif.interviewId || null,
      isRead: false,
      createdAt: new Date().toISOString()
    };

    let list = [];
    try {
      list = JSON.parse(localStorage.getItem(this.NOTIFICATIONS_KEY)) || [];
    } catch (e) {}

    list.unshift(item);
    if (list.length > 50) list.pop(); // keep last 50
    localStorage.setItem(this.NOTIFICATIONS_KEY, JSON.stringify(list));

    if (window.firebaseServices && window.firebaseServices.firestore) {
      try {
        window.firebaseServices.firestore.collection('notifications').doc(item.notificationId).set(item).catch(() => {});
      } catch (e) {}
    }

    this.broadcast('NOTIFICATION_ADDED', item);
    return item;
  }

  getNotifications() {
    try {
      return JSON.parse(localStorage.getItem(this.NOTIFICATIONS_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  markAllNotificationsRead() {
    let list = this.getNotifications();
    list = list.map(n => ({ ...n, isRead: true }));
    localStorage.setItem(this.NOTIFICATIONS_KEY, JSON.stringify(list));

    if (window.firebaseServices && window.firebaseServices.firestore) {
      list.forEach(n => {
        try {
          window.firebaseServices.firestore.collection('notifications').doc(n.notificationId).update({ isRead: true }).catch(() => {});
        } catch (e) {}
      });
    }

    this.broadcast('NOTIFICATIONS_READ', {});
  }
}

window.interviewService = new InterviewService();

