const panel = document.getElementById('visitor-stats');
const key = 'sanga-visitor-session';
const duration = 30 * 60 * 1000;
const number = new Intl.NumberFormat('ko-KR');
let session;
let pending = false;

function getSession() {
  const now = Date.now();
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (saved?.id && now - saved.seen < duration) session = saved;
  } catch {}
  if (!session || now - session.seen >= duration) session = {id: crypto.randomUUID()};
  session.seen = now;
  try { localStorage.setItem(key, JSON.stringify(session)); } catch {}
  return session.id;
}

async function refresh() {
  if (document.hidden || pending) return;
  pending = true;
  try {
    const result = await fetch('/api/visitor-stats', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({session: getSession()}),
    });
    if (!result.ok) return;
    const data = await result.json();
    const parts = [
      '현재 이용 ' + number.format(data.active) + '세션',
      '오늘 방문 ' + number.format(data.today) + '회',
      '누적 방문 ' + number.format(data.total) + '회',
    ];
    panel.textContent = parts.join(' · ');
    panel.hidden = false;
  } catch {
    // Statistics are optional; the disclosure pages remain usable.
  } finally {
    pending = false;
  }
}
document.addEventListener('visibilitychange', refresh);
setInterval(refresh, 60000);
refresh();
