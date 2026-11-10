/* ==========================================================================
   VYRONIX LABS - INTERVIEWOS DASHBOARD CONTROLLER
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  const user = window.authService.getCurrentUser();
  if (!user) return;

  initDashboardView(user);

  // Live real-time updates
  window.interviewService.onSync(() => {
    initDashboardView(user);
  });
});

function initDashboardView(user) {
  const isAdmin = user.role === 'admin';
  const nameElem = document.getElementById('user-display-name');
  const scopeMsg = document.getElementById('user-role-scope-msg');
  const topScheduleBtn = document.getElementById('topbar-schedule-btn');

  if (nameElem) nameElem.textContent = user.name;
  if (scopeMsg) {
    scopeMsg.textContent = isAdmin
      ? 'Viewing organization-wide recruitment intelligence, security audits, and live telemetry.'
      : `Restricted view: displaying only interviews assigned to ${user.name}.`;
  }

  // Hide topbar schedule button if interviewer
  if (topScheduleBtn && !isAdmin) {
    topScheduleBtn.style.display = 'none';
  }

  // Get and filter interviews
  let interviews = window.interviewService.getInterviews();
  if (!isAdmin) {
    interviews = interviews.filter(i => 
      i.interviewerId === 'both' ||
      i.interviewerId === user.uid || 
      (i.interviewerEmail && i.interviewerEmail.toLowerCase().includes(user.email.toLowerCase()))
    );
  }

  // Compute 8 Statistics
  const todayStr = new Date().toISOString().split('T')[0];

  const totalCandidates = new Set(interviews.map(i => i.candidateEmail.toLowerCase())).size;
  const totalInterviews = interviews.length;
  const todayInterviews = interviews.filter(i => i.scheduledDate === todayStr).length;
  const upcomingInterviews = interviews.filter(i => i.status === 'Scheduled' || i.status === 'Waiting').length;
  const inProgress = interviews.filter(i => i.status === 'In Progress' || i.status === 'Joined').length;
  const completed = interviews.filter(i => i.status === 'Completed').length;
  const cancelled = interviews.filter(i => i.status === 'Cancelled').length;
  const noShow = interviews.filter(i => i.status === 'No Show').length;

  document.getElementById('stat-total-candidates').textContent = totalCandidates;
  document.getElementById('stat-total-interviews').textContent = totalInterviews;
  document.getElementById('stat-today-interviews').textContent = todayInterviews;
  document.getElementById('stat-upcoming-interviews').textContent = upcomingInterviews;
  document.getElementById('stat-in-progress').textContent = inProgress;
  document.getElementById('stat-completed').textContent = completed;
  document.getElementById('stat-cancelled').textContent = cancelled;
  document.getElementById('stat-no-show').textContent = noShow;

  const activeBadge = document.getElementById('active-count-badge');
  if (activeBadge) activeBadge.textContent = inProgress;

  // Render Table
  renderDashboardTable(interviews);

  // Render Activity Timeline
  renderRecentActivity(interviews);

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function renderDashboardTable(interviews) {
  const tbody = document.getElementById('dashboard-interviews-tbody');
  if (!tbody) return;

  if (interviews.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="empty-state" style="padding: 24px;">
            <p class="text-muted">No interviews scheduled yet.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  // Sort: In Progress first, then Scheduled by date
  const sorted = [...interviews].sort((a, b) => {
    if (a.status === 'In Progress' && b.status !== 'In Progress') return -1;
    if (b.status === 'In Progress' && a.status !== 'In Progress') return 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  tbody.innerHTML = sorted.slice(0, 6).map(item => {
    const statusBadge = getStatusBadge(item.status);
    const isLive = item.status === 'In Progress' || item.status === 'Joined';

    return `
      <tr>
        <td>
          <div style="font-weight: 600; color: var(--text-main);">${item.candidateName}</div>
          <div class="text-muted" style="font-size: 0.78rem;">${item.candidateEmail}</div>
        </td>
        <td>
          <span style="font-size: 0.88rem;">${item.position}</span>
          <div class="text-muted" style="font-size: 0.75rem;">${item.department}</div>
        </td>
        <td>
          <div style="font-weight: 500;">${item.scheduledDate}</div>
          <div class="text-muted" style="font-size: 0.78rem;">${item.scheduledTime} (${item.duration}m)</div>
        </td>
        <td>
          <span style="font-size: 0.85rem;">${item.interviewerName}</span>
        </td>
        <td>${statusBadge}</td>
        <td style="text-align: right;">
          ${isLive ? `
            <a href="monitoring.html?id=${item.interviewId}" class="btn btn-sm btn-success">
              <i data-lucide="video"></i> Monitor Live
            </a>
          ` : `
            <a href="interviews.html?id=${item.interviewId}" class="btn btn-sm btn-outline">
              Details
            </a>
          `}
        </td>
      </tr>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons({ root: tbody });
}

function renderRecentActivity(interviews) {
  const timelineElem = document.getElementById('dashboard-activity-timeline');
  if (!timelineElem) return;

  // Gather proctoring events
  let allEvents = [];
  try {
    allEvents = JSON.parse(localStorage.getItem('vyronix_events_db')) || [];
  } catch (e) {}

  // Filter events belonging to permitted interviews
  const allowedIds = new Set(interviews.map(i => i.interviewId));
  const relevantEvents = allEvents.filter(e => allowedIds.has(e.interviewId)).reverse().slice(0, 8);

  if (relevantEvents.length === 0) {
    timelineElem.innerHTML = `
      <div class="empty-state" style="padding: 24px;">
        <i data-lucide="shield-check" style="width: 32px; height: 32px; color: var(--success); margin: 0 auto 8px; display: block;"></i>
        <div class="empty-state-title" style="font-size: 0.95rem;">All Systems Nominal</div>
        <p class="empty-state-desc" style="font-size: 0.8rem;">No proctoring violations or suspicious activity detected in the active pipeline.</p>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons({ root: timelineElem });
    return;
  }

  timelineElem.innerHTML = relevantEvents.map(evt => {
    let icon = 'shield-alert';
    let color = 'var(--warning)';
    if (evt.severity === 'danger') { icon = 'alert-octagon'; color = 'var(--danger)'; }
    if (evt.severity === 'info') { icon = 'info'; color = 'var(--secondary)'; }

    const timeStr = formatTime(evt.timestamp);

    return `
      <div class="timeline-item">
        <div class="timeline-dot" style="color: ${color};">
          <i data-lucide="${icon}" style="width: 14px; height: 14px;"></i>
        </div>
        <div class="timeline-content">
          <div style="font-weight: 600; font-size: 0.85rem; color: var(--text-main);">${evt.eventType}</div>
          <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 2px;">${evt.description}</div>
          <div class="timeline-time">${timeStr} · Session: ${evt.interviewId}</div>
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons({ root: timelineElem });
}

function getStatusBadge(status) {
  switch (status) {
    case 'In Progress':
      return `<span class="badge badge-in-progress"><span class="badge-dot"></span>In Progress</span>`;
    case 'Joined':
      return `<span class="badge badge-live"><span class="badge-dot"></span>Joined</span>`;
    case 'Scheduled':
      return `<span class="badge badge-scheduled"><span class="badge-dot"></span>Scheduled</span>`;
    case 'Completed':
      return `<span class="badge badge-completed"><span class="badge-dot"></span>Completed</span>`;
    case 'Cancelled':
      return `<span class="badge badge-cancelled"><span class="badge-dot"></span>Cancelled</span>`;
    case 'Waiting':
      return `<span class="badge badge-waiting"><span class="badge-dot"></span>Waiting</span>`;
    case 'No Show':
      return `<span class="badge badge-no-show"><span class="badge-dot"></span>No Show</span>`;
    default:
      return `<span class="badge">${status}</span>`;
  }
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

