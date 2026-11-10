/* ==========================================================================
   VYRONIX LABS - INTERVIEWOS NOTIFICATION & TOAST SERVICE
   ========================================================================== */

class NotificationService {
  constructor() {
    this.audioContext = null;
    this.createToastContainer();
    this.initAudio();
  }

  createToastContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
    this.container = container;
  }

  // Web Audio subtle chime for proctoring alerts
  initAudio() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.audioContext = new AudioCtx();
      }
    } catch (e) {}
  }

  playAlertSound(type = 'warning') {
    if (!this.audioContext) return;
    try {
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      osc.connect(gain);
      gain.connect(this.audioContext.destination);

      const now = this.audioContext.currentTime;
      if (type === 'danger' || type === 'warning') {
        osc.frequency.setValueAtTime(440, now); // A4
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else {
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      }
    } catch (e) {}
  }

  showToast(title, message, type = 'info', duration = 4500) {
    if (!this.container) this.createToastContainer();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconName = 'info';
    if (type === 'success') iconName = 'check-circle';
    if (type === 'warning') iconName = 'alert-triangle';
    if (type === 'danger') iconName = 'alert-octagon';

    toast.innerHTML = `
      <div style="color: var(--${type === 'info' ? 'secondary' : type}); display: flex; align-items: center;">
        <i data-lucide="${iconName}"></i>
      </div>
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        <div class="toast-desc">${message}</div>
      </div>
      <button class="toast-close" title="Dismiss">&times;</button>
    `;

    this.container.appendChild(toast);
    if (window.lucide) window.lucide.createIcons({ root: toast });

    if (type === 'warning' || type === 'danger') {
      this.playAlertSound(type);
    }

    const closeBtn = toast.querySelector('.toast-close');
    const dismiss = () => {
      toast.style.animation = 'slideOutRight 0.25s ease forwards';
      setTimeout(() => toast.remove(), 250);
    };

    closeBtn.addEventListener('click', dismiss);

    if (duration > 0) {
      setTimeout(dismiss, duration);
    }
  }
}

window.notificationService = new NotificationService();

