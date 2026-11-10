/* ==========================================================================
   VYRONIX LABS - INTERVIEWOS CORE APPLICATION UI CONTROLLER
   Unified Navigation & Role-Based Layout Management
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // Check auth on admin pages
  const inAdmin = window.location.pathname.includes('/admin/');
  if (inAdmin) {
    const user = window.authService.requireAuth();
    if (!user) return;
    initAdminNavigation(user);
    initNotificationDrawer();
  }

  // Initialize Lucide icons
  if (window.lucide) {
    window.lucide.createIcons();
  }
});

function initAdminNavigation(user) {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  const currentPath = window.location.pathname.split('/').pop() || 'dashboard.html';

  // Build navigation items based on user role
  const isAdmin = user.role === 'admin';

  const navHtml = `
    <div class="sidebar-brand">
      <a href="dashboard.html" class="brand-link">
        <div class="brand-logo-icon">
          <i data-lucide="shield-check"></i>
        </div>
        <div class="brand-text">
          <span class="brand-name">Devs Interview</span>
          <span class="brand-tagline">By Vyronix Labs</span>
        </div>
      </a>
      <button class="sidebar-toggle-btn" id="sidebar-toggle" title="Toggle Sidebar">
        <i data-lucide="chevron-left"></i>
      </button>
    </div>

    <div class="sidebar-nav-container">
      <div class="nav-section">
        <div class="nav-section-title">Core Operations</div>
        <ul class="nav-list">
          <li class="nav-item">
            <a href="dashboard.html" class="nav-link ${currentPath === 'dashboard.html' ? 'active' : ''}" title="Dashboard">
              <i data-lucide="layout-dashboard"></i>
              <span>Dashboard</span>
            </a>
          </li>
          <li class="nav-item">
            <a href="interviews.html" class="nav-link ${currentPath === 'interviews.html' ? 'active' : ''}" title="Interviews">
              <i data-lucide="calendar"></i>
              <span>Interviews</span>
            </a>
          </li>
          ${isAdmin ? `
          <li class="nav-item">
            <a href="schedule.html" class="nav-link ${currentPath === 'schedule.html' ? 'active' : ''}" title="Schedule Interview">
              <i data-lucide="plus-circle"></i>
              <span>Schedule Interview</span>
            </a>
          </li>` : ''}
          <li class="nav-item">
            <a href="monitoring.html" class="nav-link ${currentPath === 'monitoring.html' ? 'active' : ''}" title="Live Monitoring">
              <i data-lucide="video"></i>
              <span>Live Monitoring</span>
              <span class="nav-badge" style="background-color: var(--success);">LIVE</span>
            </a>
          </li>
          <li class="nav-item">
            <a href="candidates.html" class="nav-link ${currentPath === 'candidates.html' ? 'active' : ''}" title="Candidates">
              <i data-lucide="users"></i>
              <span>Candidates</span>
            </a>
          </li>
          <li class="nav-item">
            <a href="reports.html" class="nav-link ${currentPath === 'reports.html' ? 'active' : ''}" title="Interview Reports">
              <i data-lucide="file-text"></i>
              <span>Interview Reports</span>
            </a>
          </li>
        </ul>
      </div>

      ${isAdmin ? `
      <div class="nav-section">
        <div class="nav-section-title">Administration</div>
        <ul class="nav-list">
          <li class="nav-item">
            <a href="interviewers.html" class="nav-link ${currentPath === 'interviewers.html' ? 'active' : ''}" title="Manage Interviewers">
              <i data-lucide="user-check"></i>
              <span>Manage Interviewers</span>
            </a>
          </li>
          <li class="nav-item">
            <a href="settings.html" class="nav-link ${currentPath === 'settings.html' ? 'active' : ''}" title="Platform Settings">
              <i data-lucide="sliders"></i>
              <span>Platform Settings</span>
            </a>
          </li>
        </ul>
      </div>` : ''}
    </div>

    <div class="sidebar-footer">
      <div class="user-profile-widget">
        <div class="user-avatar">${getInitials(user.name)}</div>
        <div class="user-info">
          <div class="user-name" title="${user.name}">${user.name}</div>
          <div class="user-role-badge">${isAdmin ? 'System Admin' : 'Interviewer'}</div>
        </div>
        <div style="display: flex; gap: 4px;">
          <button class="btn btn-icon btn-outline btn-sm" id="open-change-pwd-btn" title="Change Password">
            <i data-lucide="key"></i>
          </button>
          <button class="btn btn-icon btn-outline btn-sm" id="logout-btn" title="Sign Out">
            <i data-lucide="log-out"></i>
          </button>
        </div>
      </div>
    </div>
  `;

  sidebar.innerHTML = navHtml;

  // Append reusable Change Password modal
  initChangePasswordModal(user);

  // Sidebar collapse toggle
  const toggleBtn = document.getElementById('sidebar-toggle');
  if (toggleBtn) {
    const updateToggleIcon = (isCollapsed) => {
      toggleBtn.innerHTML = `<i data-lucide="${isCollapsed ? 'chevron-right' : 'chevron-left'}"></i>`;
      toggleBtn.setAttribute('title', isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar');
      if (window.lucide) window.lucide.createIcons({ root: toggleBtn });
    };

    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
      const isCollapsed = sidebar.classList.contains('collapsed');
      localStorage.setItem('vyronix_sidebar_collapsed', isCollapsed ? 'true' : 'false');
      updateToggleIcon(isCollapsed);
    });

    if (localStorage.getItem('vyronix_sidebar_collapsed') === 'true') {
      sidebar.classList.add('collapsed');
      updateToggleIcon(true);
    } else {
      sidebar.classList.remove('collapsed');
      updateToggleIcon(false);
    }
  }

  // Mobile menu toggle & backdrop
  const mobileBtn = document.getElementById('mobile-menu-btn');
  let mobileBackdrop = document.querySelector('.sidebar-backdrop');
  if (!mobileBackdrop) {
    mobileBackdrop = document.createElement('div');
    mobileBackdrop.className = 'sidebar-backdrop';
    document.body.appendChild(mobileBackdrop);
  }

  const closeMobileSidebar = () => {
    sidebar.classList.remove('mobile-open');
    if (mobileBackdrop) mobileBackdrop.classList.remove('active');
  };

  const openMobileSidebar = () => {
    sidebar.classList.add('mobile-open');
    if (mobileBackdrop) mobileBackdrop.classList.add('active');
  };

  if (mobileBtn) {
    mobileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (sidebar.classList.contains('mobile-open')) {
        closeMobileSidebar();
      } else {
        openMobileSidebar();
      }
    });

    mobileBackdrop.addEventListener('click', closeMobileSidebar);

    document.addEventListener('click', (e) => {
      if (!sidebar.contains(e.target) && !mobileBtn.contains(e.target)) {
        closeMobileSidebar();
      }
    });

    // Close on navigation click on mobile
    sidebar.querySelectorAll('.sidebar-nav-item').forEach(link => {
      link.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
          closeMobileSidebar();
        }
      });
    });
  }

  // Logout button
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to sign out of Devs Interview - By Vyronix Labs?')) {
        window.authService.logout();
      }
    });
  }

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function initNotificationDrawer() {
  const notifBtn = document.getElementById('notif-bell-btn');
  const dropdown = document.getElementById('notification-dropdown');
  const badge = document.getElementById('notif-badge-count');
  const listElem = document.getElementById('notification-list');
  const markAllBtn = document.getElementById('mark-all-read-btn');

  if (!notifBtn || !dropdown) return;

  function renderNotifications() {
    const notifications = window.interviewService.getNotifications();
    const unread = notifications.filter(n => !n.isRead).length;

    if (badge) {
      badge.textContent = unread;
      badge.style.display = unread > 0 ? 'flex' : 'none';
    }

    if (listElem) {
      if (notifications.length === 0) {
        listElem.innerHTML = `
          <div class="empty-state" style="padding: 24px;">
            <p class="text-muted" style="font-size: 0.85rem;">No notifications recorded</p>
          </div>
        `;
        return;
      }

      listElem.innerHTML = notifications.slice(0, 8).map(n => {
        let icon = 'bell';
        let colorClass = 'var(--secondary)';
        if (n.severity === 'danger') { icon = 'alert-triangle'; colorClass = 'var(--danger)'; }
        if (n.severity === 'warning') { icon = 'alert-circle'; colorClass = 'var(--warning)'; }
        if (n.severity === 'success') { icon = 'check-circle'; colorClass = 'var(--success)'; }

        const timeStr = formatRelativeTime(n.createdAt);

        return `
          <li class="notification-item ${n.isRead ? '' : 'unread'}" data-id="${n.notificationId}">
            <div class="notification-icon" style="background-color: rgba(255,255,255,0.04); color: ${colorClass};">
              <i data-lucide="${icon}"></i>
            </div>
            <div class="notification-details">
              <div class="notification-title">${n.title}</div>
              <div class="text-muted" style="font-size: 0.78rem;">${n.message}</div>
              <div class="notification-time">${timeStr}</div>
            </div>
          </li>
        `;
      }).join('');

      if (window.lucide) window.lucide.createIcons({ root: listElem });
    }
  }

  notifBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('active');
    renderNotifications();
  });

  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && !notifBtn.contains(e.target)) {
      dropdown.classList.remove('active');
    }
  });

  if (markAllBtn) {
    markAllBtn.addEventListener('click', () => {
      window.interviewService.markAllNotificationsRead();
      renderNotifications();
    });
  }

  // Subscribe to live notifications & real-time cloud updates
  window.interviewService.onSync(({ action, payload }) => {
    if (action === 'NOTIFICATION_ADDED') {
      renderNotifications();
      if (payload && payload.title) {
        window.notificationService.showToast(payload.title, payload.message, payload.severity);
      }
    } else if (action === 'CLOUD_SYNC' || action === 'NOTIFICATIONS_READ' || action === 'DATA_CLEARED') {
      renderNotifications();
    }
  });

  renderNotifications();
}

function getInitials(name) {
  if (!name) return 'VY';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function formatRelativeTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const diffSec = Math.floor((now - date) / 1000);
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

function initChangePasswordModal(user) {
  let modal = document.getElementById('global-change-pwd-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.id = 'global-change-pwd-modal';
    modal.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-header">
          <h3 class="card-title">
            <i data-lucide="key" style="color: var(--primary);"></i>
            Change Account Password
          </h3>
          <button class="btn btn-icon btn-outline btn-sm" id="close-modal-pwd-x">&times;</button>
        </div>
        <form id="global-change-pwd-form">
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Account</label>
              <input type="text" class="form-input" readonly value="${user.name} (${user.email})" style="background-color: var(--bg-main); color: var(--secondary); font-weight: 600;">
            </div>
            <div class="form-group">
              <label class="form-label" for="g-curr-pwd">Current Password <span class="required">*</span></label>
              <input type="password" id="g-curr-pwd" class="form-input" placeholder="Enter current password" required>
            </div>
            <div class="form-group">
              <label class="form-label" for="g-new-pwd">New Password <span class="required">*</span></label>
              <input type="password" id="g-new-pwd" class="form-input" placeholder="Enter new password (min. 6 characters)" required minlength="6">
            </div>
            <div class="form-group">
              <label class="form-label" for="g-conf-pwd">Confirm New Password <span class="required">*</span></label>
              <input type="password" id="g-conf-pwd" class="form-input" placeholder="Re-type new password" required minlength="6">
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="close-modal-pwd-cancel">Cancel</button>
            <button type="submit" class="btn btn-primary" id="g-pwd-submit-btn">
              <i data-lucide="check"></i> Save New Password
            </button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
  }

  const openBtn = document.getElementById('open-change-pwd-btn');
  const closeX = document.getElementById('close-modal-pwd-x');
  const closeCancel = document.getElementById('close-modal-pwd-cancel');
  const form = document.getElementById('global-change-pwd-form');

  if (openBtn) {
    openBtn.addEventListener('click', () => {
      modal.classList.add('active');
      if (window.lucide) window.lucide.createIcons({ root: modal });
    });
  }

  const hideModal = () => modal.classList.remove('active');
  if (closeX) closeX.addEventListener('click', hideModal);
  if (closeCancel) closeCancel.addEventListener('click', hideModal);

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const curr = document.getElementById('g-curr-pwd').value;
      const next = document.getElementById('g-new-pwd').value;
      const conf = document.getElementById('g-conf-pwd').value;

      if (next !== conf) {
        alert('New passwords do not match. Please re-enter.');
        return;
      }

      const submitBtn = document.getElementById('g-pwd-submit-btn');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Updating...';

      try {
        await window.authService.changePassword(curr, next);
        window.notificationService.showToast('Password Updated', 'Your password has been changed successfully.', 'success');
        form.reset();
        hideModal();
      } catch (err) {
        alert(err.message || 'Failed to update password.');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<i data-lucide="check"></i> Save New Password`;
        if (window.lucide) window.lucide.createIcons({ root: modal });
      }
    });
  }
}

