const DAILY_LIMIT = 50;

async function getDeviceId() {
    return new Promise(res => {
        chrome.storage.local.get(['nmDeviceId'], r => {
            if (r.nmDeviceId) { res(r.nmDeviceId); return; }
            const id = 'nm-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
            chrome.storage.local.set({ nmDeviceId: id }, () => res(id));
        });
    });
}

async function getUrl() {
    return new Promise(res =>
        chrome.storage.sync.get(['backendUrl'], r => {
            let url = (r && r.backendUrl ? r.backendUrl.trim() : '');
            url = url.replace(/\/+$/, '');
            if (!url || url === 'http://localhost:8080' || url === 'http://localhost:8081' || (url.includes('localhost') && !url.includes('8082'))) {
                url = 'http://localhost:8082';
                chrome.storage.sync.set({ backendUrl: 'http://localhost:8082' });
            }
            res(url);
        })
    );
}

function setStatus(state, text) {
    const pill = document.getElementById('status-pill');
    const txt  = document.getElementById('status-text');
    pill.className = 'status-pill ' + state;
    txt.textContent = text;
}

async function checkHealth() {
    setStatus('checking', 'checking');
    try {
        const base = await getUrl();
        const r = await fetch(base + '/api/email/health', { signal: AbortSignal.timeout(8000) });
        if (r.ok) setStatus('online', 'online');
        else setStatus('offline', 'error ' + r.status);
    } catch { setStatus('offline', 'offline'); }
}

async function loadUsage() {
    try {
        const base = await getUrl();
        const deviceId = await getDeviceId();
        const r = await fetch(base + '/api/email/rate-status?deviceId=' + encodeURIComponent(deviceId));
        if (!r.ok) return;
        const data = await r.json();
        const remaining = parseInt(data.result) || 0;
        const used = DAILY_LIMIT - remaining;
        const pct = Math.min(100, Math.round((used / DAILY_LIMIT) * 100));
        document.getElementById('usage-nums').textContent = used + ' / ' + DAILY_LIMIT;
        const fill = document.getElementById('bar-fill');
        fill.style.width = pct + '%';
        if (pct > 80) fill.style.background = 'linear-gradient(90deg,#ff7a7a,#f87171)';
        else if (pct > 50) fill.style.background = 'linear-gradient(90deg,#ffd97a,#f59e0b)';
        else fill.style.background = 'linear-gradient(90deg,#c8b8ff,#a78bfa)';
    } catch {}
}

async function init() {
    const [deviceId, url] = await Promise.all([getDeviceId(), getUrl()]);
    document.getElementById('device-id').textContent = deviceId;
    document.getElementById('url-display').textContent = url;
    document.getElementById('url-input').value = url;
    await checkHealth();
    await loadUsage();
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('check-btn').onclick = async () => { await checkHealth(); await loadUsage(); };
    document.getElementById('url-edit-btn').onclick = () => document.getElementById('url-modal').classList.add('show');
    document.getElementById('url-cancel').onclick = () => document.getElementById('url-modal').classList.remove('show');
    document.getElementById('url-save').onclick = async () => {
        const val = document.getElementById('url-input').value.trim();
        if (!val) return;
        await new Promise(res => chrome.storage.sync.set({ backendUrl: val }, res));
        document.getElementById('url-display').textContent = val;
        document.getElementById('url-modal').classList.remove('show');
        await checkHealth();
    };
    init();
});