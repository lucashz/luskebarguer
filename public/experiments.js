const script = document.currentScript;
const surface = script?.dataset.surface || document.body?.dataset.experimentSurface || '';
const defaultTargets = {
  home: '.home-hero .home-button:not(.demo):not(.ghost)',
  plans: '.plans-grid .portal-button',
  signup: '#signupSubmitButton'
};

if (surface) initializeExperiment(surface).catch(() => {});

async function initializeExperiment(currentSurface) {
  const response = await fetch(`/api/experiments/assignment?surface=${encodeURIComponent(currentSurface)}`, { credentials: 'same-origin' });
  if (!response.ok) return;
  const { assignment } = await response.json();
  if (!assignment?.id || !assignment.value) return;
  let target = null;
  try { target = document.querySelector(assignment.target || defaultTargets[currentSurface] || ''); } catch {}
  if (!target) return;
  target.textContent = assignment.value;
  target.dataset.experimentAssignment = assignment.id;
  sendEvent(assignment.id, 'exposure');
  target.addEventListener('click', () => sendEvent(assignment.id, 'conversion', assignment.primary_kpi || 'click'), { once: true });
  window.addEventListener('tapronto:conversion', (event) => sendEvent(assignment.id, 'conversion', event.detail?.event || assignment.primary_kpi || 'conversion'), { once: true });
}

function sendEvent(assignmentId, event, conversionEvent = '') {
  const body = JSON.stringify({ assignment_id: assignmentId, event, conversion_event: conversionEvent });
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/experiments/event', new Blob([body], { type: 'application/json' }));
    return;
  }
  fetch('/api/experiments/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true, credentials: 'same-origin' }).catch(() => {});
}
