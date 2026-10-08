/* NeuralMail AI v4 - background.js */
const BACKEND_URL = 'https://neuralmail-ai-3x2c.onrender.com';

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
            // Automatically migrate any legacy localhost setting to production Render URL
            if (!url || url.includes('localhost')) {
                url = BACKEND_URL;
                chrome.storage.sync.set({ backendUrl: BACKEND_URL });
            }
            res(url);
        })
    );
}

async function post(endpoint, payload) {
    const base     = await getUrl();
    const deviceId = await getDeviceId();
    const body     = JSON.stringify({ ...payload, deviceId });
    let resp;
    try {
        resp = await fetch(base + '/api/email/' + endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body
        });
    } catch (e) {
        throw new Error('Cannot reach server. Make sure backend is running on ' + base);
    }
    if (!resp.ok) {
        let err = '';
        try { const j = await resp.json(); err = j.error || j.message || ''; } catch {}
        throw new Error(err || 'Backend error ' + resp.status);
    }
    const data = await resp.json();
    if (!data.success) throw new Error(data.error || 'Backend error');
    return data;
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    (async () => {
        try {
            let out = {};
            const { type, emailContent, threadContext, tone, replyLength, customPrompt, intentMode, mediaContent, mediaType, endpoint, base64Data, fileName, mimeType, extraFields } = msg;

            if (type === 'GET_DEVICE_ID') {
                out = { deviceId: await getDeviceId() };

            } else if (type === 'ANALYZE_MEDIA') {
                const base = await getUrl();
                const deviceId = await getDeviceId();

                // Reconstruct byte array from base64
                const byteChars = atob(base64Data);
                const byteNums = new Array(byteChars.length);
                for (let i = 0; i < byteChars.length; i++) {
                    byteNums[i] = byteChars.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNums);
                const blob = new Blob([byteArray], { type: mimeType || 'application/octet-stream' });

                const fd = new FormData();
                fd.append('file', blob, fileName || 'media_file');
                fd.append('deviceId', deviceId);
                if (extraFields) {
                    for (const [k, v] of Object.entries(extraFields)) {
                        fd.append(k, v);
                    }
                }

                let resp;
                try {
                    resp = await fetch(base + '/api/media/' + endpoint, {
                        method: 'POST',
                        body: fd
                    });
                } catch (e) {
                    throw new Error('Cannot reach server at ' + base + ': ' + e.message);
                }

                if (!resp.ok) {
                    let err = '';
                    try { const j = await resp.json(); err = j.error || j.message || ''; } catch {}
                    throw new Error(err || 'Media analysis failed: ' + resp.status);
                }
                const data = await resp.json();
                if (!data.success) throw new Error(data.error || 'Media analysis failed');
                out = { ...data };

            } else if (type === 'DUAL_REPLY') {
                const data = await post('dual-reply', {
                    emailContent,
                    threadContext: threadContext || '',
                    tone: tone || 'professional',
                    replyLength: replyLength || 'medium',
                    customPrompt: customPrompt || '',
                    mediaContent: mediaContent || null,
                    mediaType: mediaType || null
                });
                out = { ...data };

            } else if (type === 'GENERATE_REPLY') {
                const data = await post('reply', {
                    emailContent,
                    threadContext: threadContext || '',
                    tone: tone || 'professional',
                    replyLength: replyLength || 'medium',
                    customPrompt: customPrompt || '',
                    intentMode: intentMode || 'proposed',
                    mediaContent: mediaContent || null,
                    mediaType: mediaType || null
                });
                out.aiReply       = data.result;
                out.intent        = data.intent;
                out.intentMode    = data.intentMode;
                out.intentReason  = data.intentReason;
                out.keywordsFound = data.keywordsFound;
                out.promptUsed    = data.promptUsed;

            } else if (type === 'FOLLOWUP_EMAIL') {
                const data = await post('followup', {
                    emailContent,
                    tone: tone || 'professional',
                    customPrompt: customPrompt || ''
                });
                out.aiReply = data.result;

            } else if (type === 'GENERATE_VARIATIONS') {
                const [f, fr, c] = await Promise.all([
                    post('reply', { emailContent, tone: 'formal',       replyLength: 'medium', intentMode: 'proposed', mediaContent: mediaContent || null, mediaType: mediaType || null }),
                    post('reply', { emailContent, tone: 'friendly',     replyLength: 'medium', intentMode: 'proposed', mediaContent: mediaContent || null, mediaType: mediaType || null }),
                    post('reply', { emailContent, tone: 'professional', replyLength: 'short',  intentMode: 'proposed', mediaContent: mediaContent || null, mediaType: mediaType || null }),
                ]);
                out.variations = [f.result, fr.result, c.result];
                out.intent = f.intent;

            } else if (type === 'REWRITE_EMAIL') {
                const data = await post('rewrite', { emailContent, tone: tone || 'professional' });
                out.result = data.result;

            } else if (type === 'IMPROVE_EMAIL') {
                const data = await post('improve', { emailContent });
                out.result = data.result;

            } else if (type === 'SUMMARIZE_EMAIL') {
                const data = await post('summarize', { emailContent });
                out.result = data.result;

            } else if (type === 'DECODE_SUBTEXT') {
                const data = await post('decode-subtext', { emailContent });
                out.result = data.result;

            } else if (type === 'PSYCH_RADAR') {
                const data = await post('psych-radar', { emailContent });
                out.result = data.result;

            } else if (type === 'TACTICAL_NEGOTIATE') {
                const data = await post('negotiate', { emailContent, customPrompt: customPrompt || 'SALARY_COUNTER' });
                out.result = data.result;

            } else if (type === 'CULTURAL_DIPLOMAT') {
                const data = await post('cultural-diplomat', { emailContent, tone: tone || 'JAPAN' });
                out.result = data.result;

            } else if (type === 'AUTOCOMPLETE') {
                const data = await post('autocomplete', {
                    customPrompt: customPrompt || '',
                    emailContent: emailContent || ''
                });
                out.result = data.result;

            } else if (type === 'CALENDAR_RSVP') {
                const data = await post('calendar-rsvp', {
                    emailContent,
                    intentMode: intentMode || 'CONFIRM_PROPOSED',
                    customPrompt: customPrompt || ''
                });
                out.result = data.result;

            } else if (type === 'THREAD_BRIEF') {
                const data = await post('thread-brief', {
                    emailContent: emailContent || ''
                });
                out.result = data.result;

            } else {
                throw new Error('Unknown message type: ' + type);
            }

            sendResponse({ success: true, ...out });
        } catch (err) {
            console.error('[NeuralMail]', err.message);
            sendResponse({ success: false, error: err.message });
        }
    })();
    return true;
});

chrome.runtime.onInstalled.addListener(() => {
    console.log('[NeuralMail v3] Installed — PDF + Image + Audio + Intent Detection');
});