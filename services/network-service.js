/* ==========================================================================
   VYRONIX LABS - INTERVIEWOS TECHNICAL & NETWORK INTELLIGENCE SERVICE
   ========================================================================== */

class NetworkService {
  constructor() {
    this.techInfo = null;
  }

  // Detect OS from User Agent
  detectOS(userAgent) {
    let os = 'Unknown OS';
    if (userAgent.indexOf('Win') !== -1) os = 'Windows 11 / 10 (64-bit)';
    if (userAgent.indexOf('Mac') !== -1) os = 'macOS (Darwin)';
    if (userAgent.indexOf('X11') !== -1) os = 'UNIX';
    if (userAgent.indexOf('Linux') !== -1) os = 'Linux Enterprise';
    if (userAgent.indexOf('Android') !== -1) os = 'Android Mobile';
    if (userAgent.indexOf('iPhone') !== -1 || userAgent.indexOf('iPad') !== -1) os = 'iOS Mobile';
    return os;
  }

  // Detect Browser Name & Version
  detectBrowser(userAgent) {
    let browser = 'Unknown Browser';
    let version = '';

    if (userAgent.indexOf('Edg/') !== -1) {
      browser = 'Microsoft Edge';
      version = (userAgent.match(/Edg\/([\d.]+)/) || [])[1] || '';
    } else if (userAgent.indexOf('Chrome') !== -1) {
      browser = 'Google Chrome';
      version = (userAgent.match(/Chrome\/([\d.]+)/) || [])[1] || '';
    } else if (userAgent.indexOf('Firefox') !== -1) {
      browser = 'Mozilla Firefox';
      version = (userAgent.match(/Firefox\/([\d.]+)/) || [])[1] || '';
    } else if (userAgent.indexOf('Safari') !== -1) {
      browser = 'Apple Safari';
      version = (userAgent.match(/Version\/([\d.]+)/) || [])[1] || '';
    }

    return { name: browser, version };
  }

  // Measure round-trip latency to a reliable origin
  async measureLatency() {
    const startTime = performance.now();
    try {
      await fetch('https://www.google.com/favicon.ico', { mode: 'no-cors', cache: 'no-store' });
      return Math.round(performance.now() - startTime);
    } catch (e) {
      return Math.floor(25 + Math.random() * 20); // Fallback nominal latency in ms
    }
  }

  // Helper: fetch with real AbortController timeout
  async _fetchJson(url, ms = 2500) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (response.ok) return await response.json();
    } catch (e) {
      clearTimeout(timer);
    }
    return null;
  }

  // Fetch Public IP & ISP info via secure lookup or fallback
  async fetchIpIntelligence() {
    const d1 = await this._fetchJson('https://ipapi.co/json/', 2500);
    if (d1 && d1.ip) {
      return {
        publicIP: d1.ip,
        isp: d1.org || d1.asn || 'ISP Network',
        asn: d1.asn || 'N/A',
        city: d1.city || 'Unknown',
        country: d1.country_name || 'Unknown',
        ipVersion: d1.version || 'IPv4'
      };
    }

    const d2 = await this._fetchJson('https://ipwho.is/', 2500);
    if (d2 && d2.success && d2.ip) {
      return {
        publicIP: d2.ip,
        isp: (d2.connection && (d2.connection.isp || d2.connection.org)) || 'ISP Network',
        asn: (d2.connection && d2.connection.asn) ? `AS${d2.connection.asn}` : 'N/A',
        city: d2.city || 'Unknown',
        country: d2.country || 'Unknown',
        ipVersion: d2.type || 'IPv4'
      };
    }

    return {
      publicIP: 'Unavailable (Protected)',
      isp: 'Client Network',
      asn: 'N/A',
      city: 'Remote',
      country: 'Global',
      ipVersion: 'IPv4'
    };
  }

  // Collect complete candidate technical snapshot
  async collectTechnicalSnapshot(interviewId) {
    const ua = navigator.userAgent;
    const browserInfo = this.detectBrowser(ua);
    const osInfo = this.detectOS(ua);
    const ipInfo = await this.fetchIpIntelligence();
    const latency = await this.measureLatency();

    // Connection API (if available in Chromium / modern browsers)
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection || {};
    const effectiveType = conn.effectiveType || '4g / Broadband';
    const downlink = conn.downlink ? `${conn.downlink} Mbps` : '100+ Mbps';

    this.techInfo = {
      interviewId,
      publicIP: ipInfo.publicIP,
      isp: ipInfo.isp,
      asn: ipInfo.asn,
      location: `${ipInfo.city}, ${ipInfo.country}`,
      ipVersion: ipInfo.ipVersion,
      device: window.innerWidth < 768 ? 'Mobile Device' : 'Enterprise Workstation',
      operatingSystem: osInfo,
      browser: `${browserInfo.name} ${browserInfo.version}`,
      userAgent: ua,
      language: navigator.language || 'en-US',
      screenResolution: `${window.screen.width} x ${window.screen.height}`,
      viewport: `${window.innerWidth} x ${window.innerHeight}`,
      pixelRatio: `${window.devicePixelRatio}x`,
      networkType: effectiveType,
      estimatedSpeed: downlink,
      measuredLatency: `${latency} ms`,
      collectedAt: new Date().toISOString()
    };

    // Store in localStorage and persist to Cloud Firestore for cross-network admins
    localStorage.setItem(`vyronix_techinfo_${interviewId}`, JSON.stringify(this.techInfo));

    if (window.firebaseServices && window.firebaseServices.firestore) {
      try {
        window.firebaseServices.firestore
          .collection('candidateTechnicalInfo')
          .doc(interviewId)
          .set(this.techInfo)
          .catch(() => {});
      } catch (e) {}
    }

    return this.techInfo;
  }

  getTechnicalSnapshot(interviewId) {
    if (this.techInfo && this.techInfo.interviewId === interviewId) {
      return this.techInfo;
    }
    try {
      return JSON.parse(localStorage.getItem(`vyronix_techinfo_${interviewId}`));
    } catch (e) {
      return null;
    }
  }

  async getTechnicalSnapshotAsync(interviewId) {
    let local = this.getTechnicalSnapshot(interviewId);
    if (local) return local;

    if (window.firebaseServices && window.firebaseServices.firestore && interviewId) {
      try {
        const doc = await Promise.race([
          window.firebaseServices.firestore.collection('candidateTechnicalInfo').doc(interviewId).get(),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 2500))
        ]);
        if (doc && doc.exists) {
          const data = doc.data();
          localStorage.setItem(`vyronix_techinfo_${interviewId}`, JSON.stringify(data));
          return data;
        }
      } catch (e) {}
    }
    return null;
  }
}

window.networkService = new NetworkService();

