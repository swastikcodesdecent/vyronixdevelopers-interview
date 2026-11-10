/* ==========================================================================
   VYRONIX LABS - INTERVIEWOS PROCTORING & ACTIVITY MONITORING SERVICE
   ========================================================================== */

class MonitoringService {
  constructor() {
    this.interviewId = null;
    this.maxWarnings = 3;
    this.currentWarnings = 0;
    this.isMonitoring = false;
    this.onWarningTriggered = null;
    this.onProctoringEvent = null;

    this.boundVisibilityHandler = this.handleVisibilityChange.bind(this);
    this.boundFullscreenHandler = this.handleFullscreenChange.bind(this);
    this.boundWindowBlurHandler = this.handleWindowBlur.bind(this);
    this.boundWindowFocusHandler = this.handleWindowFocus.bind(this);
  }

  startCandidateMonitoring(interviewId, maxWarnings = 3) {
    this.interviewId = interviewId;
    this.maxWarnings = maxWarnings;
    this.currentWarnings = 0;
    this.isMonitoring = true;

    document.addEventListener('visibilitychange', this.boundVisibilityHandler);
    document.addEventListener('fullscreenchange', this.boundFullscreenHandler);
    document.addEventListener('webkitfullscreenchange', this.boundFullscreenHandler);
    window.addEventListener('blur', this.boundWindowBlurHandler);
    window.addEventListener('focus', this.boundWindowFocusHandler);

    console.log(`[Proctoring] Proctoring engine active for interview ${interviewId}`);
  }

  stopCandidateMonitoring() {
    this.isMonitoring = false;
    document.removeEventListener('visibilitychange', this.boundVisibilityHandler);
    document.removeEventListener('fullscreenchange', this.boundFullscreenHandler);
    document.removeEventListener('webkitfullscreenchange', this.boundFullscreenHandler);
    window.removeEventListener('blur', this.boundWindowBlurHandler);
    window.removeEventListener('focus', this.boundWindowFocusHandler);
  }

  handleFullscreenChange() {
    if (!this.isMonitoring) return;
    const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);

    if (!isFullscreen) {
      this.currentWarnings++;
      const severity = this.getSeverity();
      const desc = `Candidate exited full-screen mode (Warning ${this.currentWarnings}/${this.maxWarnings})`;
      
      const evt = window.interviewService.recordEvent(this.interviewId, 'Fullscreen Exit', desc, severity);
      
      if (this.onWarningTriggered) {
        this.onWarningTriggered({
          type: 'FULLSCREEN_EXIT',
          message: 'You have exited fullscreen mode. Please return to fullscreen immediately.',
          severity,
          warningCount: this.currentWarnings,
          maxWarnings: this.maxWarnings
        });
      }

      if (this.onProctoringEvent) this.onProctoringEvent(evt);
    } else {
      const evt = window.interviewService.recordEvent(this.interviewId, 'Fullscreen Resumed', 'Candidate re-entered full-screen mode', 'info');
      if (this.onProctoringEvent) this.onProctoringEvent(evt);
    }
  }

  handleVisibilityChange() {
    if (!this.isMonitoring) return;

    if (document.visibilityState === 'hidden') {
      this.currentWarnings++;
      const severity = this.getSeverity();
      const desc = `Candidate switched tabs or minimized window (Warning ${this.currentWarnings}/${this.maxWarnings})`;
      
      const evt = window.interviewService.recordEvent(this.interviewId, 'Tab Switch / Hidden', desc, severity);
      
      if (this.onWarningTriggered) {
        this.onWarningTriggered({
          type: 'TAB_SWITCH',
          message: 'Tab switching or window hiding detected. All proctoring events are permanently recorded.',
          severity,
          warningCount: this.currentWarnings,
          maxWarnings: this.maxWarnings
        });
      }

      if (this.onProctoringEvent) this.onProctoringEvent(evt);
    } else {
      const evt = window.interviewService.recordEvent(this.interviewId, 'Tab Returned', 'Candidate returned focus to interview session', 'info');
      if (this.onProctoringEvent) this.onProctoringEvent(evt);
    }
  }

  handleWindowBlur() {
    if (!this.isMonitoring) return;
    const evt = window.interviewService.recordEvent(this.interviewId, 'Window Focus Lost', 'Candidate window lost focus', 'warning');
    if (this.onProctoringEvent) this.onProctoringEvent(evt);
  }

  handleWindowFocus() {
    if (!this.isMonitoring) return;
    const evt = window.interviewService.recordEvent(this.interviewId, 'Window Focus Regained', 'Candidate window regained focus', 'info');
    if (this.onProctoringEvent) this.onProctoringEvent(evt);
  }

  getSeverity() {
    if (this.currentWarnings >= this.maxWarnings) return 'danger';
    if (this.currentWarnings >= 2) return 'warning';
    return 'warning';
  }

  // Request browser fullscreen helper
  async requestFullscreen(element = document.documentElement) {
    try {
      if (element.requestFullscreen) {
        await element.requestFullscreen();
      } else if (element.webkitRequestFullscreen) {
        await element.webkitRequestFullscreen();
      }
      return true;
    } catch (err) {
      console.warn('[Proctoring] Fullscreen request rejected or unsupported', err);
      return false;
    }
  }

  exitFullscreen() {
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen();
      }
    } catch (e) {}
  }
}

window.monitoringService = new MonitoringService();

