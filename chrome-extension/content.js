/* NeuralMail Enterprise v4 — content.js */
console.log('[NeuralMail AI v4.0] Content script active on Gmail');

var NM_BACKEND = 'https://neuralmail-ai-3x2c.onrender.com';

function getBackendUrl() {
    return new Promise(function(resolve) {
        chrome.storage.sync.get(['backendUrl'], function(r) {
            var url = (r && r.backendUrl ? r.backendUrl.trim() : '');
            url = url.replace(/\/+$/, '');
            if (!url || url.includes('localhost')) {
                url = NM_BACKEND;
                chrome.storage.sync.set({ backendUrl: NM_BACKEND });
            }
            resolve(url);
        });
    });
}

function cleanEmailBody(text) {
    if (!text) return '';
    var lines = text.split('\n').filter(function(line) {
        var l = line.trim();
        if (!l) return false;
        if (l === 'Reply' || l === 'Forward' || l === 'Reply all') return false;
        if (l.startsWith('Send') && l.includes('Formatting options')) return false;
        return true;
    });
    return lines.join('\n').trim();
}

function getEmailContent() {
    // 1. Primary: Search Gmail message body containers (div.a3s, .ii.gt)
    var bodies = Array.from(document.querySelectorAll('div.a3s, .ii.gt'));
    var validBodies = bodies.filter(function(el) {
        if (!el || !el.innerText) return false;
        if (el.closest('.Am.Al.editable, [role="dialog"], .M9, .AD, .nH.Hd')) return false;
        var text = cleanEmailBody(el.innerText);
        return text.length > 3;
    });

    if (validBodies.length > 0) {
        // Last visible message is the latest message in the thread
        for (var i = validBodies.length - 1; i >= 0; i--) {
            var el = validBodies[i];
            if (el.offsetParent !== null || el.offsetHeight > 0) {
                var cleanText = cleanEmailBody(el.innerText);
                if (cleanText.length > 3) return cleanText;
            }
        }
        var lastText = cleanEmailBody(validBodies[validBodies.length - 1].innerText);
        if (lastText.length > 3) return lastText;
    }

    // 2. Fallback: Search message wrappers (.adn.ads) excluding compose box
    var msgWrappers = Array.from(document.querySelectorAll('.adn.ads, [role="listitem"]'));
    for (var j = msgWrappers.length - 1; j >= 0; j--) {
        var w = msgWrappers[j];
        if (w.querySelector('.Am.Al.editable, [role="textbox"]')) continue;
        var bEl = w.querySelector('div[dir="ltr"], .a3s, .ii.gt');
        if (bEl && bEl.innerText) {
            var t = cleanEmailBody(bEl.innerText);
            if (t.length > 5) return t;
        }
    }

    // 3. Fallback: User selected text
    var sel = window.getSelection() ? window.getSelection().toString().trim() : '';
    if (sel && sel.length > 5) return sel;

    // 4. Fallback: Main view container
    var main = document.querySelector('.AO') || document.querySelector('[role="main"]');
    if (main) {
        var clone = main.cloneNode(true);
        var junk = clone.querySelectorAll('.G-atb, .nH.oy8Mbf, .Am.Al.editable, [role="toolbar"], [role="navigation"]');
        junk.forEach(function(j) { j.remove(); });
        var ct = cleanEmailBody(clone.innerText);
        if (ct && ct.length > 20) return ct.slice(0, 3000);
    }
    return null;
}

function getThreadContext() {
    var messages = Array.from(document.querySelectorAll('div.a3s, .ii.gt'));
    messages = messages.filter(function(el) {
        return el && el.innerText && !el.closest('.Am.Al.editable, [role="dialog"], .M9, .AD');
    });
    if (messages.length <= 1) return '';
    var parts = [];
    messages.forEach(function(m, i) {
        var txt = cleanEmailBody(m.innerText);
        if (txt && txt.length > 10 && i < messages.length - 1)
            parts.push('--- Message ' + (i + 1) + ' ---\n' + txt.slice(0, 450));
    });
    return parts.join('\n\n');
}

function getComposeBox() {
    var selectors = [
        'div[aria-label="Message Body"]',
        'div[aria-label*="Message Body" i]',
        'div[aria-label*="Message text" i]',
        'div[aria-label*="Corps du message" i]',
        'div.Am.Al.editable',
        'div[role="textbox"][contenteditable="true"]',
        'div.editable[contenteditable="true"]',
        'div[g_editable="true"]'
    ];
    for (var s = 0; s < selectors.length; s++) {
        var boxes = document.querySelectorAll(selectors[s]);
        for (var i = 0; i < boxes.length; i++) {
            var b = boxes[i];
            if (b && b.offsetParent && (b.isContentEditable || b.getAttribute('contenteditable') === 'true')) {
                return b;
            }
        }
    }
    return null;
}

function openReplyComposeIfClosed() {
    var b = getComposeBox();
    if (b) return Promise.resolve(b);

    // Look for Gmail's reply button on the open message or thread
    var replySelectors = [
        'span[role="button"][data-tooltip*="Reply" i]',
        'div[role="button"][data-tooltip*="Reply" i]',
        '.T-I.J-J5-Ji.T-I-Js-IF[data-tooltip*="Reply" i]',
        'div[aria-label*="Reply" i][role="button"]',
        '.ams.bkH',
        'span.ams.bkH',
        '.m9 .T-I-ax7'
    ];
    for (var i = 0; i < replySelectors.length; i++) {
        var btn = document.querySelector(replySelectors[i]);
        if (btn && btn.offsetParent) {
            btn.click();
            break;
        }
    }

    return new Promise(function(resolve) {
        var count = 0;
        var checkInterval = setInterval(function() {
            var box = getComposeBox();
            count++;
            if (box || count > 15) {
                clearInterval(checkInterval);
                resolve(box);
            }
        }, 150);
    });
}

function insertCompose(text) {
    var b = getComposeBox();
    if (!b) return false;
    b.focus();

    var formattedHtml = text
        .split('\n\n')
        .map(function(p) { return '<div>' + p.replace(/\n/g, '<br>') + '</div>'; })
        .join('<div><br></div>');

    var success = false;
    try {
        document.execCommand('selectAll', false, null);
        success = document.execCommand('insertHTML', false, formattedHtml);
    } catch (e) {}

    if (!success || b.innerText.trim().length === 0) {
        try {
            document.execCommand('selectAll', false, null);
            success = document.execCommand('insertText', false, text);
        } catch (e) {}
    }

    if (!success || b.innerText.trim().length === 0) {
        b.innerHTML = formattedHtml;
    }

    b.dispatchEvent(new Event('input', { bubbles: true }));
    b.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
}

function getActiveMessageContainer() {
    var composeBox = getComposeBox();
    if (composeBox) {
        var container = composeBox.closest('.adn.ads, .h7, [role="listitem"]') || composeBox.closest('.AO');
        if (container) {
            var messages = document.querySelectorAll('.adn.ads, .h7, [data-message-id]');
            if (messages.length > 0) return messages[messages.length - 1];
        }
    }
    var allMessages = document.querySelectorAll('.adn.ads, .h7, [data-message-id]');
    if (allMessages.length > 0) return allMessages[allMessages.length - 1];
    return document.querySelector('.AO') || document.querySelector('[role="main"]') || document.body;
}

function scanIncomingAttachments() {
    var container = getActiveMessageContainer();
    if (!container) return [];
    var items = [];
    var seenUrls = new Set();

    // 1. Scan attachment cards in Gmail (.aZo, .a6S, .hq.gt, [role="listitem"], etc.)
    var attContainers = container.querySelectorAll('.aZo, .a6S, .hq.gt, div[aria-label*="Attachment" i], div[data-tooltip*="Attachment" i], .aQH');
    attContainers.forEach(function(card) {
        if (card.closest('.Am.Al.editable, [role="dialog"], .M9, .AD')) return;
        var link = card.querySelector('a[href*="disp=attd"], a[href*="view=att"], a[download], a[href*="disp=safe"]');
        var nameEl = card.querySelector('.aQy, [data-tooltip*="Download" i], .aV3') || card;
        var name = (nameEl.innerText || nameEl.getAttribute('aria-label') || nameEl.getAttribute('title') || '').trim();
        var url = link ? link.href : null;

        if (url && !seenUrls.has(url)) {
            var lower = (name + ' ' + url).toLowerCase();
            var type = null;
            if (lower.includes('.pdf') || lower.includes('pdf')) type = 'pdf';
            else if (lower.match(/\.(png|jpg|jpeg|webp|gif|bmp)/) || lower.includes('image')) type = 'image';
            else if (lower.match(/\.(mp3|wav|m4a|ogg|webm|aac|flac)/) || lower.includes('audio')) type = 'audio';

            if (type) {
                seenUrls.add(url);
                items.push({
                    type: type,
                    name: (name.split('\n')[0] || ('attachment.' + type)).slice(0, 35),
                    url: url,
                    isInline: false
                });
            }
        }
    });

    // 2. Also look for direct attachment download anchors anywhere in container
    var allLinks = container.querySelectorAll('a[href*="view=att"], a[href*="disp=attd"]');
    allLinks.forEach(function(a) {
        if (a.closest('.Am.Al.editable, [role="dialog"], .M9, .AD')) return;
        var url = a.href;
        if (!url || seenUrls.has(url)) return;
        var name = (a.innerText || a.getAttribute('download') || a.getAttribute('aria-label') || '').trim();
        var lower = (name + ' ' + url).toLowerCase();
        var type = null;
        if (lower.includes('.pdf')) type = 'pdf';
        else if (lower.match(/\.(png|jpg|jpeg|webp|gif|bmp)/)) type = 'image';
        else if (lower.match(/\.(mp3|wav|m4a|ogg|webm|aac)/)) type = 'audio';

        if (type) {
            seenUrls.add(url);
            items.push({
                type: type,
                name: (name.split('\n')[0] || ('attachment.' + type)).slice(0, 35),
                url: url,
                isInline: false
            });
        }
    });

    // 3. Scan audio elements
    var audios = container.querySelectorAll('audio, [role="region"][aria-label*="audio" i]');
    audios.forEach(function(aud, idx) {
        var src = aud.src || (aud.querySelector('source') ? aud.querySelector('source').src : null);
        if (src && !seenUrls.has(src)) {
            seenUrls.add(src);
            items.push({
                type: 'audio',
                name: 'audio_note_' + (idx + 1) + '.mp3',
                url: src,
                isInline: false
            });
        }
    });

    return items;
}

async function fetchAttachmentBlob(item) {
    if (item.url.startsWith('data:')) {
        var parts = item.url.split(',');
        var mime = parts[0].match(/:(.*?);/)[1];
        var bstr = atob(parts[1]);
        var n = bstr.length;
        var u8arr = new Uint8Array(n);
        while (n--) u8arr[n] = bstr.charCodeAt(n);
        return new File([u8arr], item.name, { type: mime });
    }
    var resp = await fetch(item.url, { credentials: 'include' });
    if (!resp.ok) throw new Error('Could not download ' + item.name + ' (' + resp.status + ')');
    var blob = await resp.blob();
    var mime = item.type === 'pdf' ? 'application/pdf' :
               item.type === 'image' ? (blob.type || 'image/jpeg') :
               (blob.type || 'audio/mp3');
    return new File([blob], item.name, { type: mime });
}

async function analyzeIncomingAttachments(attachments, onProgress) {
    if (!attachments || attachments.length === 0) return null;
    var results = [];
    var primaryType = attachments[0].type;

    for (var i = 0; i < attachments.length; i++) {
        var item = attachments[i];
        if (onProgress) onProgress(item, i + 1, attachments.length);
        try {
            var file = await fetchAttachmentBlob(item);
            var endpoint = item.type === 'pdf' ? 'extract-pdf' :
                           item.type === 'image' ? 'analyze-image' : 'transcribe-audio';
            var data = await uploadMedia(file, endpoint);
            var text = (data.result || '').trim();
            if (text) {
                var label = item.type === 'pdf' ? 'Extracted PDF Content' :
                            item.type === 'image' ? 'Gemini Vision Analysis' : 'Whisper Voice Transcription';
                results.push('--- Incoming ' + item.name + ' [' + label + '] ---\n' + text);
            }
        } catch (err) {
            console.warn('[NeuralMail] Attachment analysis error for ' + item.name, err);
            results.push('--- Incoming ' + item.name + ' ---\n[Extraction error: ' + err.message + ']');
        }
    }

    if (results.length === 0) return null;
    return {
        mediaContent: results.join('\n\n'),
        mediaType: primaryType
    };
}

// ── ZERO-KNOWLEDGE DIFFERENTIAL PRIVACY SHIELD ─────────────────
function maskPII(text) {
    if (!text) return { text: '', map: {}, count: 0 };
    var map = {};
    var count = 0;
    var res = text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, function(match) {
        var token = '[CLIENT_EMAIL_' + (++count) + ']';
        map[token] = match;
        return token;
    });
    res = res.replace(/(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, function(match) {
        if (match.replace(/\D/g, '').length < 7) return match;
        var token = '[PHONE_' + (++count) + ']';
        map[token] = match;
        return token;
    });
    res = res.replace(/\b(?:\d{4}[-\s]?){3}\d{4}\b/g, function(match) {
        var token = '[CARD_NUM_' + (++count) + ']';
        map[token] = match;
        return token;
    });
    return { text: res, map: map, count: count };
}

function unmaskPII(text, map) {
    if (!text || !map) return text;
    var res = text;
    for (var token in map) {
        res = res.split(token).join(map[token]);
    }
    return res;
}

// ── CONTEXTUAL INTENT ACTION CHIPS ─────────────────────────────
function getIntentActionChips(intentLabel) {
    var intent = (intentLabel || '').toUpperCase();
    switch (intent) {
        case 'MEETING':
            return [
                { label: 'Accept Meeting', prompt: 'Accept the meeting invitation, confirm availability, and suggest sending a calendar invite.' },
                { label: 'Propose Tomorrow', prompt: 'Politely request to reschedule to tomorrow afternoon instead.' },
                { label: 'Decline Politely', prompt: 'Politely decline the meeting due to an unavoidable conflict with warm regards.' }
            ];
        case 'JOB':
            return [
                { label: 'Confirm Interest', prompt: 'Express enthusiasm for the role and provide availability for next steps/interview.' },
                { label: 'Send Highlights', prompt: 'Briefly highlight relevant experience and confirm eagerness.' },
                { label: 'Polite Decline', prompt: 'Thank them sincerely for reaching out, but decline as I am not looking right now.' }
            ];
        case 'FINANCE':
            return [
                { label: 'Payment Sent', prompt: 'Confirm payment has been processed and transaction reference will follow.' },
                { label: 'Request Breakdown', prompt: 'Request an itemized billing breakdown and clarification on charges.' },
                { label: 'Dispute Charge', prompt: 'Politely question the figure and ask to reconcile against agreed contract.' }
            ];
        case 'COMPLAINT':
            return [
                { label: 'Apologize & Resolve', prompt: 'Offer a sincere professional apology acknowledging the issue with immediate action steps.' },
                { label: 'Offer Direct Call', prompt: 'Apologize and offer an immediate call to personally resolve the situation today.' }
            ];
        case 'URGENT':
            return [
                { label: 'On It Right Now', prompt: 'Acknowledge urgent priority and confirm immediate attention with quick status.' },
                { label: 'ETA 2 Hours', prompt: 'Acknowledge urgent priority and provide an ETA of resolution within 2 hours.' }
            ];
        case 'FOLLOWUP':
            return [
                { label: 'Status Update', prompt: 'Provide a clear, reassuring status update on the ongoing progress.' },
                { label: 'Need 24 Hours', prompt: 'Thank them for following up and ask for 24 hours more to finalize.' }
            ];
        default:
            return [
                { label: 'Warm Thanks', prompt: 'Send a concise, warm thank-you message.' },
                { label: 'Confirm & Close', prompt: 'Confirm everything looks good and thank them for the update.' }
            ];
    }
}

// ── MULTILINGUAL DETECTION ─────────────────────────────────────
function detectLanguageHint(text) {
    if (!text) return null;
    if (/[\u0900-\u097F]/.test(text)) return 'Hindi';
    if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(text)) return 'Japanese/Chinese';
    if (/[áéíóúüñ¿¡]/i.test(text)) return 'Spanish';
    if (/[àâçéèêëîïôûùüÿœæ]/i.test(text)) return 'French';
    if (/[äöüß]/i.test(text)) return 'German';
    return null;
}

// ── VIBE CHECK (EMOTIONAL TONE & OVER-APOLOGY WARNING) ─────────
function checkDraftVibe(text) {
    if (!text) return null;
    var lower = text.toLowerCase();
    var apologies = (lower.match(/\b(sorry|apologize|apologies|pardon|my bad|regret)\b/g) || []).length;
    var hedgeWords = (lower.match(/\b(just wanted to|maybe|i think|sorry to bother)\b/g) || []).length;
    if (apologies >= 2 || hedgeWords >= 2) {
        return {
            risk: true,
            msg: 'Tone Alert: ' + (apologies >= 2 ? apologies + ' apologies' : 'hesitant phrasing') + ' detected. Click to strengthen.'
        };
    }
    return { risk: false, msg: 'Confident and balanced' };
}

function callBg(msg) {
    return new Promise(function(res, rej) {
        try {
            if (!chrome || !chrome.runtime || !chrome.runtime.id)
                return rej(new Error('Extension disconnected — refresh Gmail'));
            chrome.runtime.sendMessage(msg, function(r) {
                if (chrome.runtime.lastError) return rej(new Error(chrome.runtime.lastError.message));
                if (!r) return rej(new Error('No response from background'));
                if (!r.success) return rej(new Error(r.error || 'Request failed'));
                res(r);
            });
        } catch(e) { rej(e); }
    });
}

function detectIntent(text) {
    if (!text) return { label:'General', color:'#94a3b8', tone:'professional', length:'medium' };
    var t = text.toLowerCase();
    var wc = text.split(/\s+/).length;
    var al = wc < 60 ? 'short' : wc > 300 ? 'long' : 'medium';
    if (t.match(/interview|resume|cv|hiring|job offer|apply|internship/))
        return { label:'Job', color:'#818cf8', tone:'formal', length:al };
    if (t.match(/urgent|asap|immediately|critical|emergency/))
        return { label:'Urgent', color:'#fb923c', tone:'assertive', length:'short' };
    if (t.match(/invoice|payment|billing|amount due|refund|transaction/))
        return { label:'Finance', color:'#fbbf24', tone:'formal', length:'short' };
    if (t.match(/complain|disappointed|frustrated|issue|problem|broken/))
        return { label:'Complaint', color:'#f87171', tone:'apology', length:'medium' };
    if (t.match(/follow.?up|following up|checking in|any update|reminder/))
        return { label:'Follow-Up', color:'#60a5fa', tone:'friendly', length:'short' };
    if (t.match(/meeting|schedule|calendar|call|sync|discuss|zoom|available/))
        return { label:'Meeting', color:'#34d399', tone:'professional', length:al };
    if (t.match(/hi |hey |hello|hope you|how are you/))
        return { label:'Casual', color:'#a78bfa', tone:'friendly', length:'short' };
    return { label:'General', color:'#94a3b8', tone:'professional', length:al };
}

function hasInjection(text) {
    if (!text) return false;
    var t = text.toLowerCase();
    return ['ignore previous','ignore all instructions','act as','you are now',
        'forget your instructions','jailbreak','system prompt','override'].some(function(p){ return t.includes(p); });
}

function getDeviceId() {
    return new Promise(function(res) {
        chrome.storage.local.get(['nmDeviceId'], function(r) {
            if (r.nmDeviceId) { res(r.nmDeviceId); return; }
            var id = 'nm-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,9);
            chrome.storage.local.set({ nmDeviceId: id }, function(){ res(id); });
        });
    });
}

function blobToBase64(blob) {
    return new Promise(function(resolve, reject) {
        var reader = new FileReader();
        reader.onloadend = function() {
            var dataUrl = reader.result;
            var base64 = dataUrl.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

async function uploadMedia(file, endpoint, extraFields) {
    var base64 = await blobToBase64(file);
    var resp = await callBg({
        type: 'ANALYZE_MEDIA',
        endpoint: endpoint,
        base64Data: base64,
        fileName: file.name || 'media_file',
        mimeType: file.type || 'application/octet-stream',
        extraFields: extraFields || {}
    });
    return resp;
}

function injectStyles() {
    if (document.getElementById('nm-v3-styles')) return;
    var s = document.createElement('style');
    s.id = 'nm-v3-styles';
    s.textContent = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');

:root {
  --nm-bg: rgba(11, 12, 22, 0.94);
  --nm-glass-border: rgba(255, 255, 255, 0.12);
  --nm-glass-highlight: rgba(255, 255, 255, 0.28);
  --nm-accent-indigo: #6366f1;
  --nm-accent-violet: #8b5cf6;
  --nm-accent-cyan: #06b6d4;
  --nm-accent-emerald: #10b981;
  --nm-accent-rose: #f43f5e;
  --nm-accent-amber: #f59e0b;
}

/* Base resets & typography */
.nm-panel, .nm-panel * { box-sizing: border-box; }
.nm-wrap { display: inline-flex; align-items: center; margin-left: 8px; }

/* In-compose toolbar FAB */
.nm-fab {
  width: 34px; height: 34px; border: none; cursor: pointer; border-radius: 11px;
  position: relative; overflow: hidden; flex-shrink: 0;
  box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s;
}
.nm-fab-bg {
  position: absolute; inset: 0;
  background: conic-gradient(from 0deg, #6366f1, #a855f7, #ec4899, #06b6d4, #6366f1);
  animation: nmChromaSpin 3.5s linear infinite;
}
.nm-fab-inner {
  position: absolute; inset: 1.5px; border-radius: 9.5px;
  background: linear-gradient(135deg, #0e0f20, #191b35);
  display: flex; align-items: center; justify-content: center;
}
.nm-fab:hover { transform: scale(1.14) rotate(-3deg); box-shadow: 0 6px 20px rgba(168, 85, 247, 0.6); }
.nm-fab:active { transform: scale(0.92); }
.nm-fab.busy .nm-fab-inner::after {
  content: ''; position: absolute; width: 14px; height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.2); border-top-color: #fff;
  border-radius: 50%; animation: nmSpin 0.6s linear infinite;
}
.nm-fab.busy img { opacity: 0; }

/* Ghostwriter Predictive Autocomplete Inline Ghost Text */
.nm-ghost-preview {
  color: #94a3b8 !important;
  opacity: 0.72 !important;
  font-style: italic !important;
  font-size: 0.95em !important;
  pointer-events: none !important;
  user-select: none !important;
  padding: 0 5px !important;
  margin-left: 2px !important;
  background: rgba(99, 102, 241, 0.12) !important;
  border-radius: 4px !important;
  border: 1px dashed rgba(99, 102, 241, 0.3) !important;
  display: inline !important;
  font-family: inherit !important;
}

@keyframes nmChromaSpin { to { transform: rotate(360deg); } }
@keyframes nmSpin { to { transform: rotate(360deg); } }
@keyframes nmMasterSheen { 0% { transform: translateX(-120%); } 100% { transform: translateX(240%); } }
@keyframes nmPulseGlow { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }

/* Floating Main Panel — VisionOS Spatial Glass */
.nm-panel {
  position: fixed; width: 382px; z-index: 2147483647;
  font-family: 'Plus Jakarta Sans', -apple-system, 'SF Pro Display', sans-serif;
  border-radius: 24px; overflow: hidden;
  box-shadow: 0 28px 80px -10px rgba(0, 0, 0, 0.88), 0 0 0 1px rgba(255, 255, 255, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.32);
  animation: nmIn 0.38s cubic-bezier(0.22, 1, 0.36, 1) both;
}
@keyframes nmIn { from { opacity: 0; transform: translateY(18px) scale(0.94); } to { opacity: 1; transform: none; } }
@keyframes nmOut { from { opacity: 1; } to { opacity: 0; transform: translateY(14px) scale(0.95); } }

.nm-glass {
  position: absolute; inset: 0; border-radius: 24px;
  background: var(--nm-bg);
  backdrop-filter: blur(48px) saturate(220%);
  -webkit-backdrop-filter: blur(48px) saturate(220%);
}
.nm-glass-mesh {
  position: absolute; inset: -40%; width: 180%; height: 180%; pointer-events: none;
  background:
    radial-gradient(circle at 15% 10%, rgba(99, 102, 241, 0.22) 0%, transparent 45%),
    radial-gradient(circle at 85% 90%, rgba(217, 70, 239, 0.18) 0%, transparent 50%),
    radial-gradient(circle at 50% 50%, rgba(6, 182, 212, 0.10) 0%, transparent 60%);
}
.nm-glass-border {
  position: absolute; inset: 0; border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.1); pointer-events: none;
}
.nm-body { position: relative; z-index: 2; max-height: 86vh; overflow-y: auto; padding-bottom: 6px; }
.nm-body::-webkit-scrollbar { width: 3px; }
.nm-body::-webkit-scrollbar-thumb { background: linear-gradient(180deg, #6366f1, #a855f7); border-radius: 99px; }

/* Panel Header */
.nm-head {
  padding: 14px 16px 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  display: flex; align-items: center; gap: 10px; cursor: grab; user-select: none;
}
.nm-logo { width: 34px; height: 34px; border-radius: 11px; position: relative; overflow: hidden; flex-shrink: 0; }
.nm-logo-ring {
  position: absolute; inset: 0; border-radius: 11px;
  background: conic-gradient(from 0deg, #6366f1, #ec4899, #06b6d4, #6366f1);
  animation: nmChromaSpin 4s linear infinite;
}
.nm-logo-core {
  position: absolute; inset: 1.5px; border-radius: 9.5px; background: #0c0d1e;
  display: flex; align-items: center; justify-content: center;
}
.nm-logo-core svg { width: 18px; height: 18px; }
.nm-title-wrap { flex: 1; }
.nm-title {
  font-size: 13.5px; font-weight: 800; color: #fff; letter-spacing: -0.35px;
  display: flex; align-items: center; gap: 6px;
}
.nm-sub {
  font-size: 8.5px; color: rgba(255, 255, 255, 0.4); font-family: 'JetBrains Mono', monospace;
  margin-top: 1px; display: flex; align-items: center; gap: 5px;
}
.nm-live-dot {
  width: 5px; height: 5px; border-radius: 50%; background: #10b981;
  box-shadow: 0 0 8px #10b981; animation: nmPulseGlow 2s infinite;
}
.nm-badge {
  display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 20px;
  font-size: 9.5px; font-weight: 800; font-family: 'JetBrains Mono', monospace;
  border: 1px solid; flex-shrink: 0; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}
.nm-lang-badge {
  display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 8px;
  background: rgba(168, 85, 247, 0.15); border: 1px solid rgba(168, 85, 247, 0.35);
  font-size: 8.5px; font-family: 'JetBrains Mono', monospace; color: #d8b4fe; cursor: pointer;
  transition: all 0.18s;
}
.nm-lang-badge:hover { background: rgba(168, 85, 247, 0.3); transform: scale(1.04); }
.nm-x {
  width: 26px; height: 26px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.08);
  cursor: pointer; margin-left: 2px; background: rgba(255, 255, 255, 0.04); color: rgba(255, 255, 255, 0.35);
  font-size: 11px; display: flex; align-items: center; justify-content: center; transition: all 0.2s;
}
.nm-x:hover { background: rgba(244, 63, 94, 0.2); border-color: rgba(244, 63, 94, 0.4); color: #f43f5e; transform: rotate(90deg); }

/* Incoming Attachments Tray */
.nm-in-att-section {
  margin: 10px 14px 0; padding: 9px 12px; border-radius: 14px;
  background: linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%);
  border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
}
.nm-in-att-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.nm-in-att-title { font-size: 8px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; color: rgba(255, 255, 255, 0.35); font-family: 'JetBrains Mono', monospace; }
.nm-in-att-badge {
  font-size: 8.5px; font-weight: 700; font-family: 'JetBrains Mono', monospace; padding: 2px 7px;
  border-radius: 6px; background: rgba(99, 102, 241, 0.18); color: #a5b4fc; border: 1px solid rgba(99, 102, 241, 0.3);
}
.nm-in-att-badge.none { background: rgba(255, 255, 255, 0.04); color: rgba(255, 255, 255, 0.2); border-color: transparent; }
.nm-in-att-list { display: flex; flex-wrap: wrap; gap: 5px; }
.nm-in-att-item {
  display: inline-flex; align-items: center; gap: 6px; padding: 4px 9px; border-radius: 8px;
  font-size: 9.5px; font-family: 'JetBrains Mono', monospace;
  background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); color: #e2e8f0;
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.nm-in-att-item.pdf { border-color: rgba(244, 63, 94, 0.35); color: #fecdd3; background: rgba(244, 63, 94, 0.08); }
.nm-in-att-item.image { border-color: rgba(129, 140, 248, 0.35); color: #c7d2fe; background: rgba(129, 140, 248, 0.08); }
.nm-in-att-item.audio { border-color: rgba(16, 185, 129, 0.35); color: #a7f3d0; background: rgba(16, 185, 129, 0.08); }
.nm-in-att-item svg { width: 13px; height: 13px; flex-shrink: 0; }
.nm-in-att-note {
  font-size: 8.5px; font-family: 'JetBrains Mono', monospace; color: #34d399; margin-top: 5px;
  display: flex; align-items: center; gap: 5px;
}

/* Quick Action Chips */
.nm-smart-action-row {
  margin: 10px 14px 0; padding: 10px 12px; border-radius: 14px;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(168, 85, 247, 0.04) 100%);
  border: 1px solid rgba(165, 180, 252, 0.2); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
}
.nm-smart-action-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 7px; }
.nm-smart-action-lbl { font-size: 8px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; color: #a5b4fc; font-family: 'JetBrains Mono', monospace; }
.nm-smart-chips-grid { display: flex; flex-wrap: wrap; gap: 6px; }
.nm-smart-chip {
  padding: 6px 11px; border-radius: 10px; font-size: 10px; font-weight: 700;
  font-family: 'Plus Jakarta Sans', -apple-system, sans-serif; cursor: pointer;
  border: 1px solid rgba(165, 180, 252, 0.25); background: linear-gradient(180deg, rgba(99, 102, 241, 0.24) 0%, rgba(99, 102, 241, 0.10) 100%);
  color: #f1f5f9; box-shadow: 0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255, 255, 255, 0.12);
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.nm-smart-chip:hover {
  transform: translateY(-2px) scale(1.03); background: linear-gradient(180deg, rgba(99, 102, 241, 0.42) 0%, rgba(99, 102, 241, 0.22) 100%);
  border-color: #a5b4fc; box-shadow: 0 6px 18px rgba(99, 102, 241, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.25);
  color: #fff;
}
.nm-smart-chip:active { transform: scale(0.95); }

/* Voice & Privacy Shield Row */
.nm-voice-row { display: flex; align-items: center; justify-content: space-between; margin: 10px 14px 0; gap: 8px; }
.nm-voice-btn {
  flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 8px 12px;
  border-radius: 12px; background: linear-gradient(180deg, rgba(244, 63, 94, 0.16) 0%, rgba(244, 63, 94, 0.06) 100%);
  border: 1px solid rgba(244, 63, 94, 0.35); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 2px 8px rgba(244, 63, 94, 0.15);
  color: #fecdd3; font-size: 11px; font-weight: 700; cursor: pointer; transition: all 0.2s ease;
}
.nm-voice-btn:hover { background: linear-gradient(180deg, rgba(244, 63, 94, 0.28) 0%, rgba(244, 63, 94, 0.12) 100%); border-color: rgba(244, 63, 94, 0.6); transform: translateY(-1px); }
.nm-voice-btn.recording { background: linear-gradient(135deg, #e11d48, #f43f5e); color: #fff; animation: nmPulse 1.2s infinite; }
@keyframes nmPulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(244, 63, 94, 0.6); } 50% { box-shadow: 0 0 0 8px rgba(244, 63, 94, 0); } }

.nm-privacy-pill {
  display: inline-flex; align-items: center; gap: 6px; padding: 8px 11px; border-radius: 12px;
  background: linear-gradient(180deg, rgba(16, 185, 129, 0.12) 0%, rgba(16, 185, 129, 0.04) 100%);
  border: 1px solid rgba(16, 185, 129, 0.3); font-size: 9.5px; font-weight: 700; color: #6ee7b7;
  font-family: 'JetBrains Mono', monospace; box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

/* Master AI Reply Engine Button */
.nm-gen {
  margin: 11px 14px 0; width: calc(100% - 28px); display: flex; align-items: center; gap: 12px;
  padding: 13px 16px; border: none; border-radius: 16px; cursor: pointer; position: relative; overflow: hidden;
  font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
  box-shadow: 0 10px 32px rgba(99, 102, 241, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.35);
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.25s;
}
.nm-gen-bg {
  position: absolute; inset: 0;
  background: linear-gradient(135deg, #4338ca 0%, #6366f1 35%, #8b5cf6 70%, #d946ef 100%);
}
.nm-gen-sheen {
  position: absolute; inset: 0;
  background: linear-gradient(105deg, transparent 25%, rgba(255, 255, 255, 0.28) 50%, transparent 75%);
  animation: nmMasterSheen 3.2s ease-in-out infinite;
}
.nm-gen-border {
  position: absolute; inset: 0; border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.35); pointer-events: none;
}
.nm-gen-ic {
  position: relative; z-index: 1; width: 32px; height: 32px; border-radius: 10px;
  background: rgba(255, 255, 255, 0.18); border: 1px solid rgba(255, 255, 255, 0.3);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  box-shadow: 0 2px 10px rgba(0,0,0,0.3);
}
.nm-gen-ic svg { width: 17px; height: 17px; stroke: #fff; }
.nm-gen-copy { position: relative; z-index: 1; flex: 1; text-align: left; }
.nm-gen-title { font-size: 13.5px; font-weight: 800; color: #fff; display: block; letter-spacing: -0.3px; text-shadow: 0 1px 2px rgba(0,0,0,0.3); }
.nm-gen-hint { font-size: 9px; color: rgba(255, 255, 255, 0.85); display: block; margin-top: 1px; font-family: 'JetBrains Mono', monospace; }
.nm-gen-arr { position: relative; z-index: 1; color: rgba(255, 255, 255, 0.7); font-size: 16px; font-weight: 900; transition: transform 0.2s; }
.nm-gen:hover { transform: translateY(-2px) scale(1.015); box-shadow: 0 16px 45px rgba(124, 58, 237, 0.65); }
.nm-gen:hover .nm-gen-arr { transform: translateX(3px); color: #fff; }
.nm-gen:active { transform: scale(0.97) translateY(1px); }

/* System Mode Segmented Slider */
.nm-toggle-row {
  margin: 10px 14px 0; display: flex; gap: 5px; align-items: center; padding: 7px 11px;
  background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.07); border-radius: 12px;
}
.nm-toggle-lbl { font-size: 8px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; color: rgba(255, 255, 255, 0.35); font-family: 'JetBrains Mono', monospace; flex: 1; }
.nm-toggle-wrap { display: flex; background: rgba(0, 0, 0, 0.4); border-radius: 9px; padding: 2.5px; gap: 3px; }
.nm-toggle-btn {
  padding: 5px 12px; border: none; border-radius: 7px; cursor: pointer; font-size: 9.5px; font-weight: 800;
  text-transform: uppercase; font-family: 'JetBrains Mono', monospace; transition: all 0.2s;
  color: rgba(255, 255, 255, 0.35); background: transparent;
}
.nm-toggle-btn.active-baseline { background: rgba(244, 63, 94, 0.2); color: #f43f5e; border: 1px solid rgba(244, 63, 94, 0.4); }
.nm-toggle-btn.active-proposed { background: rgba(99, 102, 241, 0.25); color: #c7d2fe; border: 1px solid rgba(99, 102, 241, 0.5); }

/* Media Studio Tray (Compact, High-Tech Dock) */
.nm-media-section {
  margin: 10px 14px 0; border-radius: 15px; overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: linear-gradient(180deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.01) 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
}
.nm-media-title {
  padding: 8px 12px 0; font-size: 8px; font-weight: 800; letter-spacing: 1.5px;
  text-transform: uppercase; color: rgba(255, 255, 255, 0.3); font-family: 'JetBrains Mono', monospace;
}
.nm-media-btns { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 7px; padding: 7px 10px 10px; }
.nm-media-btn {
  display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 9px 6px;
  border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.07);
  background: rgba(255, 255, 255, 0.03); cursor: pointer; transition: all 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
  box-shadow: 0 2px 8px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.08);
}
.nm-media-btn:hover { transform: translateY(-2px) scale(1.02); box-shadow: 0 8px 20px rgba(0,0,0,0.4); }
.nm-media-btn-pdf:hover { border-color: rgba(244, 63, 94, 0.5); background: rgba(244, 63, 94, 0.1); }
.nm-media-btn-img:hover { border-color: rgba(99, 102, 241, 0.5); background: rgba(99, 102, 241, 0.1); }
.nm-media-btn-aud:hover { border-color: rgba(16, 185, 129, 0.5); background: rgba(16, 185, 129, 0.1); }
.nm-media-icon-badge {
  width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center;
  margin-bottom: 2px;
}
.nm-media-btn-pdf .nm-media-icon-badge { background: rgba(244, 63, 94, 0.15); color: #f43f5e; }
.nm-media-btn-img .nm-media-icon-badge { background: rgba(99, 102, 241, 0.15); color: #a5b4fc; }
.nm-media-btn-aud .nm-media-icon-badge { background: rgba(16, 185, 129, 0.15); color: #34d399; }
.nm-media-icon-badge svg { width: 15px !important; height: 15px !important; }
.nm-media-btn-label { font-size: 9.5px; font-weight: 800; font-family: 'JetBrains Mono', monospace; text-transform: uppercase; color: #f1f5f9; }
.nm-media-btn-hint { font-size: 7.5px; color: rgba(255, 255, 255, 0.35); font-family: 'JetBrains Mono', monospace; }
.nm-media-result {
  margin: 0 10px 10px; padding: 10px 12px; border-radius: 11px;
  background: rgba(0, 0, 0, 0.35); border: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 11px; color: #cbd5e1; line-height: 1.6; display: none; max-height: 110px; overflow-y: auto;
}
.nm-media-result.show { display: block; }
.nm-media-use {
  margin: 0 10px 10px; width: calc(100% - 20px); padding: 9px; border: none; border-radius: 10px;
  background: linear-gradient(135deg, #4f46e5, #7c3aed); color: #fff; font-size: 11.5px; font-weight: 800;
  cursor: pointer; display: none; transition: all 0.18s;
  box-shadow: 0 4px 14px rgba(79, 70, 229, 0.4);
}
.nm-media-use.show { display: block; }
.nm-media-use:hover { filter: brightness(1.15); transform: translateY(-1px); }

/* Feature Action Grid (Rewrite, Improve, Summarize, Follow-Up, Variations) */
.nm-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; padding: 8px 14px 0; }
.nm-btn {
  display: flex; align-items: center; gap: 9px; padding: 9px 11px; border-radius: 13px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: linear-gradient(180deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.015) 100%);
  cursor: pointer; position: relative; overflow: hidden;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 3px 10px rgba(0,0,0,0.25);
  transition: all 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.nm-btn:hover {
  transform: translateY(-2px); border-color: rgba(255, 255, 255, 0.18);
  background: linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%);
  box-shadow: 0 8px 22px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.18);
}
.nm-btn:active { transform: scale(0.97); }
.nm-btn-ic {
  width: 28px; height: 28px; border-radius: 9px; flex-shrink: 0; display: flex;
  align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}
.nm-btn-ic svg { width: 14px; height: 14px; }
.nm-btn-label { font-size: 11.5px; font-weight: 800; color: #f1f5f9; display: block; letter-spacing: -0.2px; }
.nm-btn-hint { font-size: 8px; color: rgba(255, 255, 255, 0.35); font-family: 'JetBrains Mono', monospace; }
.nm-btn-full { grid-column: span 2; }

/* Tone & Length Dials */
.nm-ctrl-row { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; padding: 9px 14px 0; }
.nm-ctrl { position: relative; }
.nm-ctrl-lbl {
  position: absolute; top: -7px; left: 10px; z-index: 3; font-size: 7.5px; font-weight: 800;
  letter-spacing: 1.5px; text-transform: uppercase; color: rgba(255, 255, 255, 0.4);
  background: #0d0e1d; padding: 0 5px; border-radius: 4px; font-family: 'JetBrains Mono', monospace;
  display: flex; align-items: center; gap: 4px;
}
.nm-auto-badge { font-size: 6.5px; font-weight: 800; color: #34d399; background: rgba(52,211,153,0.15); border: 1px solid rgba(52,211,153,0.35); padding: 1px 4px; border-radius: 4px; }
.nm-sel {
  width: 100%; padding: 9px 11px; appearance: none;
  background: linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%);
  border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 11px;
  color: #f1f5f9; font-family: 'Plus Jakarta Sans', sans-serif; font-size: 11.5px; font-weight: 700;
  cursor: pointer; outline: none; box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
}
.nm-sel:focus { border-color: #818cf8; box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2); }
.nm-sel option { background: #0e0f20; color: #fff; }

/* Custom Instruction Console */
.nm-prompt { padding: 9px 14px 0; }
.nm-pbox {
  border-radius: 14px; overflow: hidden; background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(99, 102, 241, 0.3); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
  transition: all 0.2s;
}
.nm-pbox:focus-within { border-color: #818cf8; box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.25); }
.nm-ptop { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px 0; }
.nm-plbl { font-size: 8px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: rgba(255, 255, 255, 0.3); font-family: 'JetBrains Mono', monospace; }
.nm-pclr { font-size: 9px; color: rgba(255, 255, 255, 0.25); background: none; border: none; cursor: pointer; transition: color 0.15s; }
.nm-pclr:hover { color: #fff; }
.nm-pinput {
  width: 100%; padding: 8px 12px 9px; box-sizing: border-box; background: transparent; border: none; outline: none;
  color: #fff; font-family: 'Plus Jakarta Sans', sans-serif; font-size: 12px; resize: none; line-height: 1.5;
}
.nm-pinput::placeholder { color: rgba(255, 255, 255, 0.25); }
.nm-chips { display: flex; flex-wrap: wrap; gap: 5px; padding: 0 10px 9px; }
.nm-chip {
  padding: 4px 10px; border-radius: 20px; border: none; cursor: pointer; font-size: 9.5px; font-weight: 700;
  transition: all 0.18s;
}
.nm-chip-blue { background: rgba(99, 102, 241, 0.14); border: 1px solid rgba(99, 102, 241, 0.28); color: #c7d2fe; }
.nm-chip-blue:hover { background: rgba(99, 102, 241, 0.35); color: #fff; transform: translateY(-1px); }
.nm-chip-green { background: rgba(16, 185, 129, 0.14); border: 1px solid rgba(16, 185, 129, 0.28); color: #a7f3d0; }
.nm-chip-green:hover { background: rgba(16, 185, 129, 0.35); color: #fff; transform: translateY(-1px); }

/* Generated Reply Preview Card */
.nm-reply-wrap {
  margin: 11px 14px 0; border-radius: 16px; display: none;
  border: 1px solid rgba(99, 102, 241, 0.4);
  background: linear-gradient(180deg, rgba(99, 102, 241, 0.12) 0%, rgba(14, 15, 30, 0.8) 100%);
  box-shadow: 0 12px 35px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.15);
  overflow: hidden;
}
.nm-rhead {
  padding: 10px 14px 0; font-size: 8.5px; font-weight: 800; letter-spacing: 1.4px; text-transform: uppercase;
  color: #a5b4fc; font-family: 'JetBrains Mono', monospace; display: flex; align-items: center; gap: 8px;
}
.nm-rhead::after { content: ''; flex: 1; height: 1px; background: rgba(255, 255, 255, 0.08); }
.nm-copy-btn {
  margin-left: auto; font-size: 9.5px; font-weight: 800; color: #fff; background: rgba(99, 102, 241, 0.25);
  border: 1px solid rgba(99, 102, 241, 0.45); border-radius: 7px; padding: 3px 9px; cursor: pointer;
  transition: all 0.18s; font-family: 'JetBrains Mono', monospace;
}
.nm-copy-btn:hover { background: rgba(99, 102, 241, 0.5); transform: translateY(-1px); }
.nm-reply-body {
  padding: 11px 14px; font-size: 12.5px; color: #f8fafc; line-height: 1.7; max-height: 190px;
  overflow-y: auto; white-space: pre-wrap; font-family: -apple-system, sans-serif;
  background: rgba(0, 0, 0, 0.35); margin: 8px 11px; border-radius: 11px; border: 1px solid rgba(255, 255, 255, 0.06);
}
.nm-insert-btn {
  margin: 0 11px 11px; width: calc(100% - 22px); padding: 10px; border: none; border-radius: 11px;
  background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #fff; font-size: 12px; font-weight: 800;
  cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 18px rgba(79, 70, 229, 0.45);
}
.nm-insert-btn:hover { filter: brightness(1.15); transform: translateY(-1px); box-shadow: 0 8px 24px rgba(124, 58, 237, 0.65); }

/* Vibe Check Alert */
.nm-vibe-box {
  margin: 8px 14px 0; padding: 8px 12px; border-radius: 11px;
  background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.35);
  font-size: 10px; color: #fde68a; display: none;
}
.nm-vibe-box.show { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.nm-vibe-fix-btn {
  padding: 3px 8px; border-radius: 7px; background: rgba(245, 158, 11, 0.25);
  border: 1px solid rgba(245, 158, 11, 0.5); color: #fff; font-size: 9px; font-weight: 800; cursor: pointer;
}

/* Explainability */
.nm-explain {
  margin: 8px 14px 0; padding: 9px 12px; border-radius: 12px;
  background: rgba(16, 185, 129, 0.05); border: 1px solid rgba(16, 185, 129, 0.2); display: none;
}
.nm-explain-title { font-size: 8px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; color: #34d399; font-family: 'JetBrains Mono', monospace; margin-bottom: 5px; }
.nm-explain-row { font-size: 10.5px; color: rgba(255, 255, 255, 0.55); line-height: 1.7; }
.nm-explain-row span { color: #f1f5f9; font-weight: 700; }
.nm-kw { display: inline-block; padding: 1px 7px; background: rgba(99, 102, 241, 0.18); border: 1px solid rgba(99, 102, 241, 0.35); border-radius: 6px; font-size: 9px; color: #c7d2fe; margin: 2px 2px 0 0; }
.nm-inject-warn { margin: 8px 14px 0; padding: 8px 12px; border-radius: 11px; background: rgba(244, 63, 94, 0.12); border: 1px solid rgba(244, 63, 94, 0.4); font-size: 11px; color: #fca5a5; display: none; }

/* Summary & Variations Wraps */
.nm-sum-wrap, .nm-var-wrap {
  margin: 10px 14px 0; border-radius: 14px; display: none; border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.35); overflow: hidden;
}
.nm-sum-body { padding: 10px 14px 13px; font-size: 12px; color: #cbd5e1; line-height: 1.75; }
.nm-var-list { padding: 8px 12px 12px; display: flex; flex-direction: column; gap: 6px; }
.nm-var-item {
  padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.07);
  background: rgba(255, 255, 255, 0.03); cursor: pointer; transition: all 0.2s;
}
.nm-var-item:hover { background: rgba(255, 255, 255, 0.06); border-color: rgba(255, 255, 255, 0.15); }
.nm-var-item.sel { border-color: rgba(99, 102, 241, 0.5); background: rgba(99, 102, 241, 0.12); }
.nm-var-tag { font-size: 8.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; color: #a5b4fc; font-family: 'JetBrains Mono', monospace; margin-bottom: 4px; }
.nm-var-txt { font-size: 11.5px; color: #cbd5e1; line-height: 1.6; }
.nm-var-use {
  display: none; margin-top: 8px; width: 100%; padding: 8px; border: none; border-radius: 9px;
  background: linear-gradient(135deg, #4f46e5, #7c3aed); color: #fff; font-size: 12px; font-weight: 800; cursor: pointer;
}
.nm-var-item.sel .nm-var-use { display: block; }

/* Panel Footer */
.nm-foot { display: flex; align-items: center; justify-content: space-between; padding: 11px 14px 14px; }
.nm-regen {
  font-size: 10px; font-weight: 800; color: rgba(255, 255, 255, 0.45); background: none; cursor: pointer;
  border: 1px solid rgba(255, 255, 255, 0.09); border-radius: 9px; padding: 6px 13px; transition: all 0.18s;
  font-family: 'JetBrains Mono', monospace;
}
.nm-regen:hover { color: #fff; background: rgba(255, 255, 255, 0.08); border-color: rgba(255, 255, 255, 0.2); }
.nm-foot-tag { font-size: 8.5px; color: rgba(255, 255, 255, 0.2); font-family: 'JetBrains Mono', monospace; }

/* Toast Notifications */
.nm-toast {
  position: fixed; bottom: 24px; right: 24px; z-index: 2147483647; display: flex; align-items: center;
  gap: 10px; padding: 12px 18px; border-radius: 16px; font-family: 'Plus Jakarta Sans', sans-serif;
  font-size: 12.5px; font-weight: 700; color: #fff; pointer-events: none;
  background: rgba(12, 13, 24, 0.96); backdrop-filter: blur(28px);
  border: 1px solid rgba(255, 255, 255, 0.14); box-shadow: 0 20px 70px rgba(0,0,0,0.7); max-width: 320px;
}
.nm-toast.ok { border-color: rgba(16, 185, 129, 0.5); }
.nm-toast.err { border-color: rgba(244, 63, 94, 0.5); }
.nm-toast.load { border-color: rgba(99, 102, 241, 0.5); }
.nm-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.nm-toast.ok .nm-dot { background: #10b981; box-shadow: 0 0 10px #10b981; }
.nm-toast.err .nm-dot { background: #f43f5e; box-shadow: 0 0 10px #f43f5e; }
.nm-toast.load .nm-dot {
  width: 13px; height: 13px; background: none; border: 2px solid rgba(255, 255, 255, 0.2);
  border-top-color: #818cf8; border-radius: 50%; animation: nmSpin 0.65s linear infinite;
}
/* Global Intelligence Suite */
.nm-suite-section {
  margin: 10px 14px 0; border-radius: 16px; overflow: hidden;
  border: 1px solid rgba(139, 92, 246, 0.25);
  background: linear-gradient(180deg, rgba(30, 27, 75, 0.35) 0%, rgba(15, 23, 42, 0.6) 100%);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.1);
}
.nm-suite-header {
  padding: 8px 12px; display: flex; align-items: center; justify-content: space-between;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.nm-suite-title {
  font-size: 8.5px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase;
  color: #c4b5fd; font-family: 'JetBrains Mono', monospace;
}
.nm-suite-badge {
  font-size: 8px; font-weight: 800; font-family: 'JetBrains Mono', monospace;
  padding: 2px 6px; border-radius: 6px; background: rgba(139, 92, 246, 0.2);
  color: #ddd6fe; border: 1px solid rgba(139, 92, 246, 0.4);
}
.nm-suite-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; padding: 8px 10px; }
.nm-suite-btn {
  display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 7px 4px;
  border-radius: 11px; border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.035); cursor: pointer; transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.nm-suite-btn:hover { transform: translateY(-2px) scale(1.03); background: rgba(255, 255, 255, 0.08); border-color: rgba(255, 255, 255, 0.22); }
.nm-suite-btn:active { transform: scale(0.95); }
.nm-suite-icon {
  width: 26px; height: 26px; border-radius: 8px; display: flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}
.nm-suite-icon svg { width: 14px; height: 14px; }
.nm-suite-lbl { font-size: 8.5px; font-weight: 800; color: #f1f5f9; font-family: 'JetBrains Mono', monospace; text-align: center; }
.nm-suite-sub { font-size: 7px; color: rgba(255, 255, 255, 0.4); font-family: 'JetBrains Mono', monospace; text-align: center; }

/* Interactive Output Cards for Suite */
.nm-intel-card {
  margin: 0 10px 10px; border-radius: 12px; background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(139, 92, 246, 0.3); box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
  display: none; position: relative; overflow: hidden; animation: nmIn 0.25s ease both;
}
.nm-intel-scanline {
  position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, transparent, #06b6d4, #a855f7, transparent);
  animation: nmScanPulse 2.5s infinite;
}
@keyframes nmScanPulse { 0%, 100% { opacity: 0.3; transform: scaleX(0.7); } 50% { opacity: 1; transform: scaleX(1); } }
.nm-intel-head {
  padding: 8px 12px 6px; font-size: 8px; font-weight: 800; letter-spacing: 1.2px;
  color: #a5b4fc; font-family: 'JetBrains Mono', monospace; display: flex;
  align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.nm-intel-close {
  background: none; border: none; color: rgba(255, 255, 255, 0.4); cursor: pointer;
  font-size: 10px; font-weight: 800; transition: color 0.15s;
}
.nm-intel-close:hover { color: #f43f5e; }
.nm-intel-body {
  padding: 10px 12px; font-size: 11px; line-height: 1.65; color: #e2e8f0;
  max-height: 160px; overflow-y: auto; white-space: pre-wrap; font-family: -apple-system, sans-serif;
}
.nm-deal-chips, .nm-diplo-chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 12px; }
.nm-deal-chip, .nm-diplo-chip {
  padding: 6px 11px; border-radius: 9px; font-size: 10px; font-weight: 700;
  cursor: pointer; transition: all 0.2s; font-family: 'Plus Jakarta Sans', sans-serif;
  border: 1px solid rgba(255, 255, 255, 0.12); background: rgba(255, 255, 255, 0.05); color: #fff;
}
.nm-deal-chip:hover {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.3), rgba(217, 119, 6, 0.2));
  border-color: #f59e0b; transform: translateY(-1px);
}
.nm-diplo-chip:hover {
  background: linear-gradient(135deg, rgba(168, 85, 247, 0.3), rgba(99, 102, 241, 0.2));
  border-color: #a855f7; transform: translateY(-1px);
}
`;
    document.head.appendChild(s);
}

var IC = {
    reply:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 015.5 5.5v1"/></svg>',
    rewrite:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
    improve:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    sum:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
    follow:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    vars:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
    logo:     '<svg viewBox="0 0 24 24" fill="none"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="url(#nmLogoGrad)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><defs><linearGradient id="nmLogoGrad" x1="3" y1="2" x2="21" y2="22"><stop stop-color="#818cf8"/><stop offset="0.5" stop-color="#c084fc"/><stop offset="1" stop-color="#38bdf8"/></linearGradient></defs></svg>',
    pdf:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M10 12h4"/><path d="M10 16h4"/></svg>',
    img:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
    audio:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
    sparkle:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>',
    subtext:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/><path d="M4.93 4.93l4.24 4.24"/></svg>',
    radar:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1010 10A10 10 0 0012 2zm0 18a8 8 0 118-8 8 8 0 01-8 8z"/><circle cx="12" cy="12" r="2"/><line x1="12" y1="12" x2="19" y2="5"/></svg>',
    deal:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>',
    diplomat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    brief:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M9 12h6M9 16h4"/></svg>',
    persona:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
};

function toast(msg, type) {
    type = type || 'load';
    document.querySelectorAll('.nm-toast').forEach(function(e){ e.remove(); });
    var el = document.createElement('div');
    el.className = 'nm-toast ' + type;
    el.innerHTML = '<div class="nm-dot"></div><span>' + msg + '</span>';
    document.body.appendChild(el);
    if (type !== 'load') setTimeout(function(){
        el.style.transition = 'all 0.22s ease';
        el.style.opacity = '0';
        setTimeout(function(){ el.remove(); }, 220);
    }, 3200);
    return el;
}

function buildPanel(fab) {
    var email  = getEmailContent();
    var incomingAtts = scanIncomingAttachments();
    var intent = detectIntent(email);
    var langHint = detectLanguageHint(email);
    var actionChips = getIntentActionChips(intent.label);
    var logoUrl = chrome.runtime.getURL('icons/icon48.png');
    var panel  = document.createElement('div');
    panel.className = 'nm-panel';
    panel._intentMode          = 'proposed';
    panel._baselineReply       = '';
    panel._proposedReply       = '';
    panel._mediaReply          = '';
    panel._incomingAttachments = incomingAtts;

    panel.innerHTML =
    '<div class="nm-glass"><div class="nm-glass-mesh"></div><div class="nm-glass-border"></div></div>' +
    '<div class="nm-body">' +

      // HEAD
      '<div class="nm-head">' +
        '<div class="nm-logo"><div class="nm-logo-ring"></div><div class="nm-logo-core" style="display:flex;align-items:center;justify-content:center;background:#0c0c1a;"><img src="'+logoUrl+'" alt="NeuralMail" style="width:20px;height:20px;object-fit:contain;border-radius:4px;pointer-events:none;" /></div></div>' +
        '<div class="nm-title-wrap">' +
          '<div class="nm-title">NeuralMail AI <span class="nm-live-dot"></span></div>' +
          '<div class="nm-sub">ENTERPRISE V4.0 · AUTONOMOUS AGENT SUITE</div>' +
        '</div>' +
        '<div class="nm-badge" style="color:'+intent.color+';border-color:'+intent.color+'44;background:'+intent.color+'15;">'+intent.label+'</div>' +
        (langHint ? '<span class="nm-lang-badge" title="Click to reply in ' + langHint + '">🌐 ' + langHint + '</span>' : '') +
        '<button class="nm-persona-btn" id="nm-persona-btn" title="Edit Persona & Signature Profile" style="background:rgba(99,102,241,0.18);border:1px solid rgba(99,102,241,0.35);color:#c7d2fe;border-radius:8px;padding:3px 7px;font-size:8.5px;font-weight:800;cursor:pointer;font-family:\'JetBrains Mono\',monospace;margin-left:auto;">👤 Persona</button>' +
        '<button class="nm-x" title="Close" style="margin-left:6px;">✕</button>' +
      '</div>' +

      // PERSONAL PERSONA DRAWER CARD
      '<div class="nm-intel-card" id="nm-persona-card" style="display:none;background:rgba(15,23,42,0.96);border:1px solid rgba(99,102,241,0.4);">' +
        '<div class="nm-intel-head"><span>👤 PERSONAL PERSONA & SIGNATURE</span><button class="nm-intel-close" data-close="nm-persona-card">✕</button></div>' +
        '<div style="padding:10px 12px;display:flex;flex-direction:column;gap:7px;">' +
          '<div>' +
            '<label style="font-size:7.5px;font-family:\'JetBrains Mono\',monospace;color:#94a3b8;text-transform:uppercase;display:block;margin-bottom:2px;">Your Full Name</label>' +
            '<input class="nm-pinput" id="nm-p-name" placeholder="e.g. Omkar Patil" style="border:1px solid rgba(255,255,255,0.12);border-radius:6px;background:rgba(0,0,0,0.5);padding:5px 8px;font-size:11px;color:#fff;width:100%;box-sizing:border-box;" />' +
          '</div>' +
          '<div>' +
            '<label style="font-size:7.5px;font-family:\'JetBrains Mono\',monospace;color:#94a3b8;text-transform:uppercase;display:block;margin-bottom:2px;">Role & Company</label>' +
            '<input class="nm-pinput" id="nm-p-role" placeholder="e.g. Lead Software Architect" style="border:1px solid rgba(255,255,255,0.12);border-radius:6px;background:rgba(0,0,0,0.5);padding:5px 8px;font-size:11px;color:#fff;width:100%;box-sizing:border-box;" />' +
          '</div>' +
          '<div>' +
            '<label style="font-size:7.5px;font-family:\'JetBrains Mono\',monospace;color:#94a3b8;text-transform:uppercase;display:block;margin-bottom:2px;">Calendly / Booking Link</label>' +
            '<input class="nm-pinput" id="nm-p-link" placeholder="e.g. https://calendly.com/your-name" style="border:1px solid rgba(255,255,255,0.12);border-radius:6px;background:rgba(0,0,0,0.5);padding:5px 8px;font-size:11px;color:#fff;width:100%;box-sizing:border-box;" />' +
          '</div>' +
          '<div>' +
            '<label style="font-size:7.5px;font-family:\'JetBrains Mono\',monospace;color:#94a3b8;text-transform:uppercase;display:block;margin-bottom:2px;">Custom Signature / Style Rules</label>' +
            '<input class="nm-pinput" id="nm-p-rules" placeholder="e.g. Sign off with Warm regards, Omkar" style="border:1px solid rgba(255,255,255,0.12);border-radius:6px;background:rgba(0,0,0,0.5);padding:5px 8px;font-size:11px;color:#fff;width:100%;box-sizing:border-box;" />' +
          '</div>' +
          '<button class="nm-insert-btn" id="nm-save-persona-btn" style="margin:4px 0 0;padding:8px;font-size:11px;">💾 Save Persona Profile</button>' +
        '</div>' +
      '</div>' +

      // INCOMING ATTACHMENTS SECTION
      (incomingAtts.length > 0 ?
      '<div class="nm-in-att-section">' +
        '<div class="nm-in-att-header">' +
          '<span class="nm-in-att-title">📎 Incoming Mail Attachments</span>' +
          '<span class="nm-in-att-badge">' + incomingAtts.length + ' detected</span>' +
        '</div>' +
        '<div class="nm-in-att-list">' +
          incomingAtts.map(function(att) {
            var icon = att.type === 'pdf' ? IC.pdf : (att.type === 'image' ? IC.img : IC.audio);
            return '<div class="nm-in-att-item ' + att.type + '">' + icon + '<span>' + att.name + '</span></div>';
          }).join('') +
        '</div>' +
        '<div class="nm-in-att-note"><span>●</span> Auto-grounded in contextual AI response</div>' +
      '</div>' : '') +

      // SMART INTENT ACTION CHIPS (1-Click Instant Actions)
      '<div class="nm-smart-action-row">' +
        '<div class="nm-smart-action-top">' +
          '<span class="nm-smart-action-lbl">⚡ Quick Action Chips (' + intent.label + ')</span>' +
        '</div>' +
        '<div class="nm-smart-chips-grid">' +
          actionChips.map(function(c) {
            return '<button class="nm-smart-chip" data-quick-action="' + c.prompt.replace(/"/g, '&quot;') + '">' + c.label + '</button>';
          }).join('') +
        '</div>' +
      '</div>' +

      // VOICE DRAFT & PRIVACY SHIELD ROW
      '<div class="nm-voice-row">' +
        '<button class="nm-voice-btn" id="nm-voice-draft-btn">' +
          '<span>🎙️</span><span class="nm-voice-text">Voice-to-Email Draft</span>' +
        '</button>' +
        '<span class="nm-privacy-pill" title="Client-Side Zero-Knowledge Privacy: emails & phone numbers masked locally">🛡️ Zero-Knowledge Shield</span>' +
      '</div>' +

      // VIBE CHECK ALERT BOX (Confidence & Tone Risk)
      '<div class="nm-vibe-box" id="nm-vibe-box">' +
        '<span class="nm-vibe-msg"></span>' +
        '<button class="nm-vibe-fix-btn" id="nm-vibe-fix-btn">Strengthen</button>' +
      '</div>' +

      // MASTER AI GENERATION ENGINE BUTTON
      '<button class="nm-gen" data-action="reply">' +
        '<div class="nm-gen-bg"></div><div class="nm-gen-sheen"></div><div class="nm-gen-border"></div>' +
        '<div class="nm-gen-ic">' + IC.reply + '</div>' +
        '<div class="nm-gen-copy">' +
          '<span class="nm-gen-title">' + (incomingAtts.length > 0 ? ('Auto-Reply (' + incomingAtts.length + ' Attachment Grounded)') : 'Generate AI Reply') + '</span>' +
          '<span class="nm-gen-hint nm-gen-hint-txt">' +
            (incomingAtts.length > 0 ? 'Proposed: Multimodal context draft' : 'Proposed: Intent-aware contextual prompt') +
          '</span>' +
        '</div>' +
        '<span class="nm-gen-arr">→</span>' +
      '</button>' +

      // SYSTEM MODE TOGGLE
      '<div class="nm-toggle-row">' +
        '<span class="nm-toggle-lbl">System Mode</span>' +
        '<div class="nm-toggle-wrap">' +
          '<button class="nm-toggle-btn" data-mode="baseline">Baseline</button>' +
          '<button class="nm-toggle-btn active-proposed" data-mode="proposed">Proposed</button>' +
        '</div>' +
      '</div>' +

      // GLOBAL INTELLIGENCE SUITE (6 EXECUTIVE ENGINES)
      '<div class="nm-suite-section">' +
        '<div class="nm-suite-header">' +
          '<span class="nm-suite-title">⚡ Global Intelligence Suite</span>' +
          '<span class="nm-suite-badge">6 Pro Engines</span>' +
        '</div>' +
        '<div class="nm-suite-grid">' +
          '<button class="nm-suite-btn" data-action="decode-subtext" title="Decodes hidden corporate meaning">' +
            '<div class="nm-suite-icon" style="background:rgba(244,63,94,0.18);color:#f43f5e;">' + IC.subtext + '</div>' +
            '<span class="nm-suite-lbl">Subtext</span>' +
            '<span class="nm-suite-sub">Truth Scan</span>' +
          '</button>' +
          '<button class="nm-suite-btn" data-action="psych-radar" title="Biometric-style sender mood & power dynamic">' +
            '<div class="nm-suite-icon" style="background:rgba(6,182,212,0.18);color:#06b6d4;">' + IC.radar + '</div>' +
            '<span class="nm-suite-lbl">Psych Radar</span>' +
            '<span class="nm-suite-sub">Mood & Stance</span>' +
          '</button>' +
          '<button class="nm-suite-btn" id="nm-open-deal-btn" title="Tactical counter-offers (FBI negotiation)">' +
            '<div class="nm-suite-icon" style="background:rgba(245,158,11,0.18);color:#fbbf24;">' + IC.deal + '</div>' +
            '<span class="nm-suite-lbl">Negotiate</span>' +
            '<span class="nm-suite-sub">Deal Closer</span>' +
          '</button>' +
          '<button class="nm-suite-btn" id="nm-open-diplo-btn" title="Zero-offense native business etiquette">' +
            '<div class="nm-suite-icon" style="background:rgba(168,85,247,0.18);color:#c084fc;">' + IC.diplomat + '</div>' +
            '<span class="nm-suite-lbl">Diplomat</span>' +
            '<span class="nm-suite-sub">Global Norms</span>' +
          '</button>' +
          '<button class="nm-suite-btn" id="nm-open-calendar-btn" title="Smart calendar RSVP & meeting counter-proposals">' +
            '<div class="nm-suite-icon" style="background:rgba(16,185,129,0.18);color:#34d399;">' + IC.calendar + '</div>' +
            '<span class="nm-suite-lbl">Calendar</span>' +
            '<span class="nm-suite-sub">Smart RSVP</span>' +
          '</button>' +
          '<button class="nm-suite-btn" id="nm-open-brief-btn" title="Executive thread brief & action items checklist">' +
            '<div class="nm-suite-icon" style="background:rgba(59,130,246,0.18);color:#60a5fa;">' + IC.brief + '</div>' +
            '<span class="nm-suite-lbl">TL;DR Brief</span>' +
            '<span class="nm-suite-sub">Action Items</span>' +
          '</button>' +
        '</div>' +

        '<div class="nm-intel-card" id="nm-subtext-card">' +
          '<div class="nm-intel-scanline"></div>' +
          '<div class="nm-intel-head"><span>🕵️ DECODED CORPORATE TRUTH</span><button class="nm-intel-close" data-close="nm-subtext-card">✕</button></div>' +
          '<div class="nm-intel-body" id="nm-subtext-body"></div>' +
        '</div>' +

        '<div class="nm-intel-card" id="nm-radar-card">' +
          '<div class="nm-intel-scanline"></div>' +
          '<div class="nm-intel-head"><span>🧠 SENDER PSYCHOMETRIC RADAR</span><button class="nm-intel-close" data-close="nm-radar-card">✕</button></div>' +
          '<div class="nm-intel-body" id="nm-radar-body"></div>' +
        '</div>' +

        '<div class="nm-intel-card" id="nm-deal-card">' +
          '<div class="nm-intel-head"><span>💼 TACTICAL COUNTER-OFFER</span><button class="nm-intel-close" data-close="nm-deal-card">✕</button></div>' +
          '<div class="nm-deal-chips">' +
            '<button class="nm-deal-chip" data-deal="SALARY_COUNTER">💰 Salary Counter (+15%)</button>' +
            '<button class="nm-deal-chip" data-deal="SCOPE_CREEP">🛑 Scope Creep Pushback</button>' +
            '<button class="nm-deal-chip" data-deal="DISCOUNT_VENDOR">💸 Negotiate Discount</button>' +
            '<button class="nm-deal-chip" data-deal="DEADLINE_PUSHBACK">⏱️ Push Deadline</button>' +
          '</div>' +
        '</div>' +

        '<div class="nm-intel-card" id="nm-diplomat-card">' +
          '<div class="nm-intel-head"><span>🌍 NATIVE CULTURAL ADAPTER</span><button class="nm-intel-close" data-close="nm-diplomat-card">✕</button></div>' +
          '<div class="nm-diplo-chips">' +
            '<button class="nm-diplo-chip" data-diplo="JAPAN">🇯🇵 Japan (Keigo)</button>' +
            '<button class="nm-diplo-chip" data-diplo="GERMANY">🇩🇪 Germany (Direct)</button>' +
            '<button class="nm-diplo-chip" data-diplo="USA">🇺🇸 USA (Silicon Valley)</button>' +
            '<button class="nm-diplo-chip" data-diplo="UK">🇬🇧 UK (Tactful)</button>' +
            '<button class="nm-diplo-chip" data-diplo="MIDDLE_EAST">🇦🇪 Middle East (Warm)</button>' +
            '<button class="nm-diplo-chip" data-diplo="INDIA">🇮🇳 India (Cordial)</button>' +
          '</div>' +
        '</div>' +

        '<div class="nm-intel-card" id="nm-calendar-card">' +
          '<div class="nm-intel-head"><span>📅 SMART CALENDAR & MEETING RSVP</span><button class="nm-intel-close" data-close="nm-calendar-card">✕</button></div>' +
          '<div class="nm-deal-chips">' +
            '<button class="nm-deal-chip" data-rsvp="CONFIRM_PROPOSED" style="border-color:#10b981;background:rgba(16,185,129,0.15);color:#6ee7b7;">✅ Confirm Proposed Slot</button>' +
            '<button class="nm-deal-chip" data-rsvp="PROPOSE_ALTERNATIVES" style="border-color:#f59e0b;background:rgba(245,158,11,0.15);color:#fde68a;">🔄 Propose 2 Alternatives</button>' +
            '<button class="nm-deal-chip" data-rsvp="DECLINE_CONFLICT" style="border-color:#f43f5e;background:rgba(244,63,94,0.15);color:#fca5a5;">⛔ Polite Schedule Conflict</button>' +
          '</div>' +
        '</div>' +

        '<div class="nm-intel-card" id="nm-brief-card">' +
          '<div class="nm-intel-scanline"></div>' +
          '<div class="nm-intel-head"><span>📌 EXECUTIVE THREAD BRIEF & ACTIONS</span><button class="nm-intel-close" data-close="nm-brief-card">✕</button></div>' +
          '<div class="nm-intel-body" id="nm-brief-body" style="font-size:11px;line-height:1.65;"></div>' +
          '<div style="padding:6px 12px 10px;display:flex;gap:8px;">' +
            '<button class="nm-copy-btn" id="nm-copy-brief-btn" style="flex:1;padding:6px;font-size:10px;">📋 Copy Brief</button>' +
            '<button class="nm-copy-btn" id="nm-insert-brief-btn" style="flex:1;padding:6px;font-size:10px;background:rgba(16,185,129,0.25);border-color:#10b981;">📝 Insert into Draft</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // INJECTION WARNING
      '<div class="nm-inject-warn">⚠️ Prompt injection pattern detected in email content.</div>' +

      // EXPLAINABILITY
      '<div class="nm-explain">' +
        '<div class="nm-explain-title">Intent Explainability Analysis</div>' +
        '<div class="nm-explain-row nm-ei"></div>' +
        '<div class="nm-explain-row nm-er"></div>' +
        '<div class="nm-explain-row nm-ek"></div>' +
        '<div class="nm-explain-row nm-ep"></div>' +
      '</div>' +

      // MEDIA STUDIO (Manual File Upload)
      '<div class="nm-media-section">' +
        '<div class="nm-media-title">Media Studio (Manual Upload)</div>' +
        '<div class="nm-media-btns">' +
          '<button class="nm-media-btn nm-media-btn-pdf" data-media="pdf">' +
            '<div class="nm-media-icon-badge">' + IC.pdf + '</div>' +
            '<span class="nm-media-btn-label">PDF Doc</span>' +
            '<span class="nm-media-btn-hint">extract text</span>' +
          '</button>' +
          '<button class="nm-media-btn nm-media-btn-img" data-media="image">' +
            '<div class="nm-media-icon-badge">' + IC.img + '</div>' +
            '<span class="nm-media-btn-label">Vision</span>' +
            '<span class="nm-media-btn-hint">analyze image</span>' +
          '</button>' +
          '<button class="nm-media-btn nm-media-btn-aud" data-media="audio">' +
            '<div class="nm-media-icon-badge">' + IC.audio + '</div>' +
            '<span class="nm-media-btn-label">Audio</span>' +
            '<span class="nm-media-btn-hint">whisper AI</span>' +
          '</button>' +
        '</div>' +
        '<div class="nm-media-result" id="nm-media-result"></div>' +
        '<button class="nm-media-use" id="nm-media-use">⚡ Insert into Compose</button>' +
      '</div>' +

      // ACTION GRID
      '<div class="nm-grid">' +
        '<button class="nm-btn" data-action="rewrite">' +
          '<div class="nm-btn-ic" style="background:rgba(16,185,129,0.15);color:#34d399;">' + IC.rewrite + '</div>' +
          '<div><span class="nm-btn-label">Rewrite</span><span class="nm-btn-hint">polish draft</span></div>' +
        '</button>' +
        '<button class="nm-btn" data-action="improve">' +
          '<div class="nm-btn-ic" style="background:rgba(245,158,11,0.15);color:#fbbf24;">' + IC.improve + '</div>' +
          '<div><span class="nm-btn-label">Improve</span><span class="nm-btn-hint">grammar + flow</span></div>' +
        '</button>' +
        '<button class="nm-btn" data-action="summarize">' +
          '<div class="nm-btn-ic" style="background:rgba(168,85,247,0.15);color:#c084fc;">' + IC.sum + '</div>' +
          '<div><span class="nm-btn-label">Summarize</span><span class="nm-btn-hint">key points</span></div>' +
        '</button>' +
        '<button class="nm-btn" data-action="followup">' +
          '<div class="nm-btn-ic" style="background:rgba(6,182,212,0.15);color:#38bdf8;">' + IC.follow + '</div>' +
          '<div><span class="nm-btn-label">Follow-Up</span><span class="nm-btn-hint">auto check-in</span></div>' +
        '</button>' +
        '<button class="nm-btn nm-btn-full" data-action="variations">' +
          '<div class="nm-btn-ic" style="background:rgba(244,63,94,0.15);color:#fb7185;">' + IC.vars + '</div>' +
          '<div><span class="nm-btn-label">3 Variations</span><span class="nm-btn-hint">Formal · Friendly · Concise</span></div>' +
        '</button>' +
      '</div>' +

      // CONTROLS (Tone & Length)
      '<div class="nm-ctrl-row">' +
        '<div class="nm-ctrl">' +
          '<span class="nm-ctrl-lbl">Tone <span class="nm-auto-badge">auto</span></span>' +
          '<select class="nm-sel nm-tone">' +
            '<option value="professional">Professional</option>' +
            '<option value="formal">Formal</option>' +
            '<option value="friendly">Friendly</option>' +
            '<option value="executive">Executive</option>' +
            '<option value="casual">Casual</option>' +
            '<option value="assertive">Assertive</option>' +
          '</select>' +
        '</div>' +
        '<div class="nm-ctrl">' +
          '<span class="nm-ctrl-lbl">Length <span class="nm-auto-badge">auto</span></span>' +
          '<select class="nm-sel nm-len">' +
            '<option value="medium">Medium</option>' +
            '<option value="short">Short</option>' +
            '<option value="long">Detailed</option>' +
          '</select>' +
        '</div>' +
      '</div>' +

      // CUSTOM INSTRUCTION CONSOLE
      '<div class="nm-prompt">' +
        '<div class="nm-pbox">' +
          '<div class="nm-ptop"><span class="nm-plbl">Custom Prompt</span><button class="nm-pclr">clear</button></div>' +
          '<input class="nm-pinput" type="text" placeholder="e.g. Keep under 3 lines, mention Thursday..." />' +
          '<div class="nm-chips">' +
            '<button class="nm-chip nm-chip-blue" data-fill="Make it shorter">Shorter</button>' +
            '<button class="nm-chip nm-chip-blue" data-fill="Executive concise tone">Executive</button>' +
            '<button class="nm-chip nm-chip-green" data-fill="Reply in Hindi">Hindi</button>' +
            '<button class="nm-chip nm-chip-blue" data-fill="Make it more polite">Polite</button>' +
            '<button class="nm-chip nm-chip-blue" data-fill="Add gentle urgency">Urgent</button>' +
            '<button class="nm-chip nm-chip-blue" data-fill="Sound casual and warm">Warm</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // GENERATED REPLY PREVIEW CARD
      '<div class="nm-reply-wrap" id="nm-reply-wrap">' +
        '<div class="nm-rhead"><span>✨ Neural Draft</span><button class="nm-copy-btn" id="nm-copy-reply-btn" title="Copy to clipboard">📋 Copy</button></div>' +
        '<div class="nm-reply-body" id="nm-reply-body"></div>' +
        '<button class="nm-insert-btn" id="nm-insert-reply-btn">⚡ Insert into Compose</button>' +
      '</div>' +
      '<div class="nm-sum-wrap"><div class="nm-rhead">Executive Summary</div><div class="nm-sum-body"></div></div>' +
      '<div class="nm-var-wrap"><div class="nm-rhead">3 Adaptive Variations</div><div class="nm-var-list"></div></div>' +

      // FOOTER
      '<div class="nm-foot">' +
        '<button class="nm-regen" data-action="reply">↻ Regenerate</button>' +
        '<span class="nm-foot-tag">NeuralMail AI v3.5 · Groq Llama · Vision · Whisper</span>' +
      '</div>' +
    '</div>';

    // Set auto tone and length
    var toneEl = panel.querySelector('.nm-tone');
    var lenEl  = panel.querySelector('.nm-len');
    if (toneEl) toneEl.value = intent.tone   || 'professional';
    if (lenEl)  lenEl.value  = intent.length || 'medium';

    // Injection warning
    if (email && hasInjection(email))
        panel.querySelector('.nm-inject-warn').style.display = 'block';

    // Close button
    panel.querySelector('.nm-x').onclick = function(){ closePanel(panel, fab); };

    // Mode toggle
    panel.querySelectorAll('[data-mode]').forEach(function(btn) {
        btn.onclick = function() {
            panel._intentMode = btn.dataset.mode;
            panel.querySelectorAll('[data-mode]').forEach(function(b){ b.className = 'nm-toggle-btn'; });
            btn.classList.add(panel._intentMode === 'baseline' ? 'active-baseline' : 'active-proposed');
            panel.querySelector('.nm-gen-hint-txt').textContent =
                panel._intentMode === 'baseline' ? 'Baseline: single generic prompt' : 'Proposed: intent-aware prompt';
        };
    });

    // Media buttons
    panel.querySelectorAll('[data-media]').forEach(function(btn) {
        btn.onclick = function() {
            var mediaType = btn.dataset.media;
            var accept = mediaType === 'pdf' ? '.pdf' :
                         mediaType === 'image' ? '.jpg,.jpeg,.png,.gif,.webp,.bmp' :
                         '.mp3,.wav,.m4a,.ogg,.webm,.mp4';
            var input = document.createElement('input');
            input.type = 'file';
            input.accept = accept;
            input.onchange = function() {
                if (!input.files || !input.files[0]) return;
                handleMediaUpload(input.files[0], mediaType, panel, fab);
            };
            input.click();
        };
    });

    // Media use button
    panel.querySelector('#nm-media-use').onclick = function() {
        if (!panel._mediaReply) return;
        if (!insertCompose(panel._mediaReply)) { toast('Click Reply in Gmail first', 'err'); return; }
        toast('Reply inserted', 'ok');
    };

    // Action buttons
    panel.querySelectorAll('[data-action]').forEach(function(b){
        b.onclick = function(){ handleAction(b.dataset.action, panel, fab); };
    });

    // Global Intelligence Suite Card & Drawer Handlers
    panel.querySelectorAll('.nm-intel-close').forEach(function(b) {
        b.onclick = function() {
            var c = panel.querySelector('#' + b.getAttribute('data-close'));
            if (c) c.style.display = 'none';
        };
    });

    var dealBtn = panel.querySelector('#nm-open-deal-btn');
    if (dealBtn) {
        dealBtn.onclick = function() {
            var c = panel.querySelector('#nm-deal-card');
            if (c) c.style.display = c.style.display === 'block' ? 'none' : 'block';
        };
    }

    var diploBtn = panel.querySelector('#nm-open-diplo-btn');
    if (diploBtn) {
        diploBtn.onclick = function() {
            var c = panel.querySelector('#nm-diplomat-card');
            if (c) c.style.display = c.style.display === 'block' ? 'none' : 'block';
        };
    }

    var calBtn = panel.querySelector('#nm-open-calendar-btn');
    if (calBtn) {
        calBtn.onclick = function() {
            var c = panel.querySelector('#nm-calendar-card');
            if (c) c.style.display = c.style.display === 'block' ? 'none' : 'block';
        };
    }

    var briefBtn = panel.querySelector('#nm-open-brief-btn');
    if (briefBtn) {
        briefBtn.onclick = function() {
            handleThreadBrief(panel, fab);
        };
    }

    var personaBtn = panel.querySelector('#nm-persona-btn');
    if (personaBtn) {
        personaBtn.onclick = function() {
            var c = panel.querySelector('#nm-persona-card');
            if (!c) return;
            var isHidden = c.style.display === 'none' || !c.style.display;
            c.style.display = isHidden ? 'block' : 'none';
            if (isHidden) {
                chrome.storage.sync.get(['nmPersonaName', 'nmPersonaRole', 'nmPersonaLink', 'nmPersonaRules'], function(d) {
                    if (d) {
                        if (panel.querySelector('#nm-p-name')) panel.querySelector('#nm-p-name').value = d.nmPersonaName || '';
                        if (panel.querySelector('#nm-p-role')) panel.querySelector('#nm-p-role').value = d.nmPersonaRole || '';
                        if (panel.querySelector('#nm-p-link')) panel.querySelector('#nm-p-link').value = d.nmPersonaLink || '';
                        if (panel.querySelector('#nm-p-rules')) panel.querySelector('#nm-p-rules').value = d.nmPersonaRules || '';
                    }
                });
            }
        };
    }

    var savePersonaBtn = panel.querySelector('#nm-save-persona-btn');
    if (savePersonaBtn) {
        savePersonaBtn.onclick = function() {
            var name  = (panel.querySelector('#nm-p-name') || {}).value || '';
            var role  = (panel.querySelector('#nm-p-role') || {}).value || '';
            var link  = (panel.querySelector('#nm-p-link') || {}).value || '';
            var rules = (panel.querySelector('#nm-p-rules') || {}).value || '';
            chrome.storage.sync.set({
                nmPersonaName: name.trim(),
                nmPersonaRole: role.trim(),
                nmPersonaLink: link.trim(),
                nmPersonaRules: rules.trim()
            }, function() {
                toast('Persona profile saved!', 'ok');
                var c = panel.querySelector('#nm-persona-card');
                if (c) c.style.display = 'none';
            });
        };
    }

    panel.querySelectorAll('.nm-deal-chip').forEach(function(chip) {
        chip.onclick = function() {
            handleTacticalNegotiate(chip.getAttribute('data-deal'), panel, fab);
        };
    });

    panel.querySelectorAll('.nm-diplo-chip').forEach(function(chip) {
        chip.onclick = function() {
            handleCulturalDiplomat(chip.getAttribute('data-diplo'), panel, fab);
        };
    });

    panel.querySelectorAll('[data-rsvp]').forEach(function(chip) {
        chip.onclick = function() {
            handleCalendarRsvp(chip.getAttribute('data-rsvp'), panel, fab);
        };
    });

    var copyBriefBtn = panel.querySelector('#nm-copy-brief-btn');
    if (copyBriefBtn) {
        copyBriefBtn.onclick = function() {
            var body = panel.querySelector('#nm-brief-body');
            var txt = (body && body.innerText) || '';
            if (txt) {
                navigator.clipboard.writeText(txt);
                toast('Brief copied to clipboard!', 'ok');
            }
        };
    }

    var insertBriefBtn = panel.querySelector('#nm-insert-brief-btn');
    if (insertBriefBtn) {
        insertBriefBtn.onclick = function() {
            var body = panel.querySelector('#nm-brief-body');
            var txt = (body && body.innerText) || '';
            if (txt) {
                openReplyComposeIfClosed().then(function() {
                    insertCompose(txt);
                    toast('Brief inserted into draft!', 'ok');
                });
            }
        };
    }

    // Smart quick action chips (1-click reply generation)
    panel.querySelectorAll('.nm-smart-chip').forEach(function(chip){
        chip.onclick = function(){
            var prompt = chip.getAttribute('data-quick-action');
            var inp = panel.querySelector('.nm-pinput');
            if (inp) inp.value = prompt;
            toast('Action: ' + chip.textContent.trim(), 'load');
            handleAction('reply', panel, fab);
        };
    });

    // Multilingual badge click
    var lb = panel.querySelector('.nm-lang-badge');
    if (lb && langHint) {
        lb.onclick = function() {
            var inp = panel.querySelector('.nm-pinput');
            if (inp) {
                inp.value = 'Reply fluently and idiomatically in ' + langHint;
                toast('Language set to ' + langHint, 'ok');
            }
        };
    }

    // Voice Draft button (Microphone -> Whisper -> Executive Draft)
    var voiceBtn = panel.querySelector('#nm-voice-draft-btn');
    if (voiceBtn) {
        voiceBtn.onclick = async function() {
            if (panel._mediaRecorder && panel._mediaRecorder.state === 'recording') {
                panel._mediaRecorder.stop();
                voiceBtn.classList.remove('recording');
                voiceBtn.querySelector('.nm-voice-text').textContent = 'Processing Voice...';
                return;
            }
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                toast('Microphone not supported in this browser', 'err');
                return;
            }
            try {
                var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                var recorder = new MediaRecorder(stream);
                var chunks = [];
                recorder.ondataavailable = function(e){ if (e.data && e.data.size > 0) chunks.push(e.data); };
                recorder.onstop = async function() {
                    stream.getTracks().forEach(function(t){ t.stop(); });
                    var blob = new Blob(chunks, { type: 'audio/webm' });
                    var file = new File([blob], 'voice_prompt.webm', { type: 'audio/webm' });
                    var tV = toast('Transcribing voice prompt with Whisper...', 'load');
                    try {
                        var res = await uploadMedia(file, 'transcribe-audio');
                        tV.remove();
                        var spokenText = (res.result || '').trim();
                        if (!spokenText) {
                            toast('No speech detected', 'err');
                            voiceBtn.querySelector('.nm-voice-text').textContent = 'Voice Draft';
                            return;
                        }
                        var pInput = panel.querySelector('.nm-pinput');
                        if (pInput) pInput.value = spokenText;
                        toast('Voice captured! Generating executive reply...', 'load');
                        var toneEl = panel.querySelector('.nm-tone');
                        if (toneEl) toneEl.value = 'executive';
                        handleAction('reply', panel, fab);
                    } catch(err) {
                        tV.remove();
                        toast('Voice transcription failed: ' + err.message, 'err');
                    } finally {
                        voiceBtn.querySelector('.nm-voice-text').textContent = 'Voice Draft';
                    }
                };
                panel._mediaRecorder = recorder;
                recorder.start();
                voiceBtn.classList.add('recording');
                voiceBtn.querySelector('.nm-voice-text').textContent = 'Recording... (Click to stop)';
                toast('Listening... Speak your email instructions', 'load');
            } catch(err) {
                toast('Mic error: ' + err.message, 'err');
            }
        };
    }

    // Vibe Check tone strengthening button
    var vibeFixBtn = panel.querySelector('#nm-vibe-fix-btn');
    if (vibeFixBtn) {
        vibeFixBtn.onclick = function() {
            var inp = panel.querySelector('.nm-pinput');
            if (inp) inp.value = 'Remove all hesitant and overly apologetic phrasing. Make the tone assertive, direct, and confident.';
            var toneEl = panel.querySelector('.nm-tone');
            if (toneEl) toneEl.value = 'assertive';
            toast('Strengthening tone...', 'load');
            handleAction('reply', panel, fab);
            var vb = panel.querySelector('#nm-vibe-box');
            if (vb) vb.classList.remove('show');
        };
    }

    // Copy reply button
    var copyReplyBtn = panel.querySelector('#nm-copy-reply-btn');
    if (copyReplyBtn) {
        copyReplyBtn.onclick = function() {
            var replyBody = panel.querySelector('#nm-reply-body');
            var text = (replyBody && replyBody.innerText) || panel._lastReply || '';
            if (!text) return;
            navigator.clipboard.writeText(text);
            toast('Copied to clipboard!', 'ok');
        };
    }

    // Insert reply button
    var insertReplyBtn = panel.querySelector('#nm-insert-reply-btn');
    if (insertReplyBtn) {
        insertReplyBtn.onclick = function() {
            var replyBody = panel.querySelector('#nm-reply-body');
            var text = (replyBody && replyBody.innerText) || panel._lastReply || '';
            if (!text) return;
            openReplyComposeIfClosed().then(function() {
                if (insertCompose(text)) {
                    toast('Inserted into compose!', 'ok');
                } else {
                    navigator.clipboard.writeText(text);
                    toast('Copied! Click Reply in Gmail to paste', 'ok');
                }
            });
        };
    }

    // Chip fills
    panel.querySelectorAll('[data-fill]').forEach(function(chip){
        chip.onclick = function(){ panel.querySelector('.nm-pinput').value = chip.dataset.fill; };
    });

    // Clear
    panel.querySelector('.nm-pclr').onclick = function(){ panel.querySelector('.nm-pinput').value = ''; };

    return panel;
}

async function handleMediaUpload(file, mediaType, panel, fab) {
    fab.classList.add('busy');
    var resultDiv = panel.querySelector('#nm-media-result');
    var useBtn    = panel.querySelector('#nm-media-use');
    var tone      = (panel.querySelector('.nm-tone') || {}).value || 'professional';
    var len       = (panel.querySelector('.nm-len')  || {}).value || 'medium';
    var custom    = (panel.querySelector('.nm-pinput') || {}).value || '';
    var emailCtx  = getEmailContent() || '';

    var endpointMap = { pdf: 'pdf-reply', image: 'image-reply', audio: 'audio-reply' };
    var labelMap    = { pdf: 'Analyzing PDF...', image: 'Analyzing image...', audio: 'Transcribing audio...' };

    var t = toast(labelMap[mediaType], 'load');

    try {
        var data = await uploadMedia(file, endpointMap[mediaType], {
            emailContext: emailCtx,
            tone: tone,
            replyLength: len,
            customPrompt: custom
        });

        t.remove();
        var reply = data.result || '';
        panel._mediaReply = reply;

        resultDiv.textContent = reply.slice(0, 150) + (reply.length > 150 ? '...' : '');
        resultDiv.classList.add('show');
        useBtn.classList.add('show');

        if (data.intent) {
            var badge = panel.querySelector('.nm-badge');
            if (badge) badge.textContent = data.intent;
        }

        toast('Reply ready — click Use to insert', 'ok');

        // Auto insert if compose is open
        if (getComposeBox()) {
            insertCompose(reply);
            toast('Reply inserted automatically', 'ok');
        }

    } catch(err) {
        t.remove();
        toast(err.message || 'Analysis failed', 'err');
    } finally {
        fab.classList.remove('busy');
    }
}

function renderExplainability(panel, data) {
    var box = panel.querySelector('.nm-explain');
    if (!box) return;
    box.querySelector('.nm-ei').innerHTML = 'Intent: <span>' + (data.intent || '') + '</span>';
    box.querySelector('.nm-er').innerHTML = 'Reason: <span>' + (data.intentReason || '') + '</span>';
    box.querySelector('.nm-ep').innerHTML = 'Template: <span>' + (data.promptUsed || '') + '</span>';
    var kw = box.querySelector('.nm-ek');
    if (data.keywordsFound && data.keywordsFound !== 'none') {
        kw.innerHTML = 'Keywords: ' + data.keywordsFound.split(',').map(function(k){
            return '<span class="nm-kw">' + k.trim() + '</span>';
        }).join('');
    } else {
        kw.innerHTML = 'Keywords: <span>none detected</span>';
    }
    box.style.display = 'block';
}

function closePanel(panel, fab) {
    panel.style.animation = 'nmOut .22s ease both';
    fab.classList.remove('open', 'busy');
    setTimeout(function(){ panel.remove(); }, 220);
}

function clampPanel(panel) {
    var pw = panel.offsetWidth || 372;
    var vw = window.innerWidth, vh = window.innerHeight;
    var maxH = Math.max(280, vh - 24);
    panel.style.maxHeight = maxH + 'px';
    var ph = panel.offsetHeight || 500;
    var t = parseInt(panel.style.top) || 0, l = parseInt(panel.style.left) || 0;
    if (t < 12) t = 12;
    if (l < 12) l = 12;
    if (l + pw > vw - 12) l = Math.max(12, vw - pw - 12);
    if (t + ph > vh - 12) t = Math.max(12, vh - ph - 12);
    panel.style.top = t + 'px';
    panel.style.left = l + 'px';
}

function makeDraggable(panel) {
    var header = panel.querySelector('.nm-head');
    if (!header) return;
    var dragging = false, ox = 0, oy = 0;
    header.addEventListener('mousedown', function(e){
        if (e.target.closest('.nm-x,.nm-badge')) return;
        dragging = true; ox = e.clientX - panel.offsetLeft; oy = e.clientY - panel.offsetTop;
        panel.style.transition = 'none'; e.preventDefault();
    });
    document.addEventListener('mousemove', function(e){
        if (!dragging) return;
        panel.style.left = (e.clientX - ox) + 'px';
        panel.style.top  = (e.clientY - oy) + 'px';
        clampPanel(panel);
    });
    document.addEventListener('mouseup', function(){
        if (dragging){ dragging = false; panel.style.transition = ''; }
    });
}

function positionPanel(panel, fab) {
    document.body.appendChild(panel);
    requestAnimationFrame(function(){ requestAnimationFrame(function(){
        var pw = 372;
        var vw = window.innerWidth, vh = window.innerHeight;
        var maxH = Math.max(280, vh - 32);
        panel.style.maxHeight = maxH + 'px';
        var ph = panel.offsetHeight || Math.min(540, maxH);

        // Default position: neatly docked on bottom right
        var left = Math.max(12, vw - pw - 24);
        var top = Math.max(12, vh - ph - 24);

        // If opened specifically from the in-compose Send toolbar button
        if (fab && fab.classList && fab.classList.contains('nm-fab') && !fab.id) {
            var r = fab.getBoundingClientRect();
            if (r.top > 0 && r.left > 0 && r.right < vw) {
                var proposedTop = r.top - ph - 12;
                var proposedLeft = r.right - pw;
                if (proposedTop >= 12) top = proposedTop;
                if (proposedLeft >= 12 && proposedLeft + pw <= vw - 12) left = proposedLeft;
            }
        }

        // Viewport bounds protection
        if (top < 12) top = 12;
        if (left < 12) left = 12;
        if (left + pw > vw - 12) left = Math.max(12, vw - pw - 12);
        if (top + ph > vh - 12) top = Math.max(12, vh - ph - 12);

        panel.style.top = top + 'px';
        panel.style.left = left + 'px';
        makeDraggable(panel);
        window.addEventListener('resize', function(){ clampPanel(panel); });
    }); });
}

function handleAction(action, panel, fab) {
    if (fab) fab.classList.add('busy');
    var tone       = (panel.querySelector('.nm-tone') || {}).value || 'professional';
    var len        = (panel.querySelector('.nm-len')  || {}).value || 'medium';
    var custom     = (panel.querySelector('.nm-pinput') || {}).value || '';
    var intentMode = panel._intentMode || 'proposed';

    (async function(){
        var t = null;
        try {
            var persona = await getPersonaContext();
            var effectiveCustom = custom;
            if (persona) {
                effectiveCustom = (effectiveCustom ? (effectiveCustom + '\n') : '') + persona;
            }

            if (action === 'reply' || action === 'auto-reply' || action === 'followup') {
                var ec = getEmailContent();
                var incoming = panel._incomingAttachments || [];
                if (!ec && incoming.length === 0) {
                    toast('Open an email thread first (or select text)', 'err');
                    return;
                }
                var thread = getThreadContext();

                // 1. Client-Side Zero-Knowledge Differential Privacy Shield
                var piiEc = maskPII(ec || '');
                var piiThread = maskPII(thread || '');

                // 2. If incoming attachments exist, read/analyze them in parallel
                var mediaPayload = null;
                if (incoming.length > 0) {
                    var tAtt = toast('Reading ' + incoming.length + ' incoming attachment(s)...', 'load');
                    try {
                        mediaPayload = await analyzeIncomingAttachments(incoming, function(item, cur, total) {
                            toast('Analyzing ' + item.name + ' (' + cur + '/' + total + ')...', 'load');
                        });
                    } catch(attErr) {
                        console.warn('[NeuralMail] Attachment read warning:', attErr);
                    }
                    if (tAtt) tAtt.remove();
                }

                // 3. Generate the reply with intent-aware prompt + media content
                t = toast((intentMode === 'proposed' ? 'Proposed' : 'Baseline') + ' - generating reply...', 'load');
                var res = await callBg({
                    type: action === 'followup' ? 'FOLLOWUP_EMAIL' : 'GENERATE_REPLY',
                    emailContent: piiEc.text || '',
                    threadContext: piiThread.text,
                    tone: tone,
                    replyLength: len,
                    customPrompt: effectiveCustom,
                    intentMode: intentMode,
                    mediaContent: mediaPayload ? mediaPayload.mediaContent : null,
                    mediaType: mediaPayload ? mediaPayload.mediaType : null
                });
                if (t) t.remove();

                var reply = res.aiReply || res.result || '';
                if (!reply) { toast('Empty response from AI - try again', 'err'); return; }

                // 4. Restore masked PII locally in browser
                if (piiEc.count > 0 || piiThread.count > 0) {
                    reply = unmaskPII(reply, piiEc.map);
                    reply = unmaskPII(reply, piiThread.map);
                    toast('🛡️ Shielded ' + (piiEc.count + piiThread.count) + ' sensitive token(s)', 'ok');
                }

                // Store and display in panel so user ALWAYS sees the generated reply!
                panel._lastReply = reply;
                var replyWrap = panel.querySelector('#nm-reply-wrap');
                if (replyWrap) {
                    var rBody = replyWrap.querySelector('#nm-reply-body');
                    if (rBody) rBody.innerText = reply;
                    replyWrap.style.display = 'block';
                    replyWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }

                // 5. Emotional Tone & Vibe Check (Over-apology & hesitancy detection)
                var vibe = checkDraftVibe(reply);
                var vb = panel.querySelector('#nm-vibe-box');
                if (vb) {
                    if (vibe && vibe.risk) {
                        vb.querySelector('.nm-vibe-msg').textContent = vibe.msg;
                        vb.classList.add('show');
                    } else {
                        vb.classList.remove('show');
                    }
                }

                if (res.intent) renderExplainability(panel, res);
                if (res.intent) {
                    var badge = panel.querySelector('.nm-badge');
                    if (badge) badge.textContent = res.intent;
                }

                // 6. Automatically attempt to insert into Gmail reply compose box
                var inserted = insertCompose(reply);
                if (!inserted) {
                    await openReplyComposeIfClosed();
                    inserted = insertCompose(reply);
                }

                if (inserted) {
                    toast(mediaPayload ? 'Auto-reply inserted with attachment analysis!' : 'Reply inserted!', 'ok');
                } else {
                    toast('Reply generated! Click "Insert into Compose" to paste', 'ok');
                }

            } else if (action === 'rewrite') {
                var ec = (getComposeBox() || {}).innerText || ''; ec = ec.trim();
                if (ec.length < 5){ toast('Type a draft first', 'err'); return; }
                var piiDraft = maskPII(ec);
                t = toast('Rewriting...', 'load');
                var res = await callBg({ type: 'REWRITE_EMAIL', emailContent: piiDraft.text, tone: tone });
                if (t) t.remove();
                var resultText = unmaskPII(res.result, piiDraft.map);
                var vibe = checkDraftVibe(resultText);
                var vb = panel.querySelector('#nm-vibe-box');
                if (vb) {
                    if (vibe && vibe.risk) {
                        vb.querySelector('.nm-vibe-msg').textContent = vibe.msg;
                        vb.classList.add('show');
                    } else {
                        vb.classList.remove('show');
                    }
                }
                insertCompose(resultText);
                toast('Rewritten', 'ok');

            } else if (action === 'improve') {
                var ec = (getComposeBox() || {}).innerText || ''; ec = ec.trim();
                if (ec.length < 5){ toast('Type a draft first', 'err'); return; }
                var piiDraft = maskPII(ec);
                t = toast('Improving...', 'load');
                var res = await callBg({ type: 'IMPROVE_EMAIL', emailContent: piiDraft.text });
                if (t) t.remove();
                var resultText = unmaskPII(res.result, piiDraft.map);
                var vibe = checkDraftVibe(resultText);
                var vb = panel.querySelector('#nm-vibe-box');
                if (vb) {
                    if (vibe && vibe.risk) {
                        vb.querySelector('.nm-vibe-msg').textContent = vibe.msg;
                        vb.classList.add('show');
                    } else {
                        vb.classList.remove('show');
                    }
                }
                insertCompose(resultText);
                toast('Improved', 'ok');

            } else if (action === 'summarize') {
                var ec = getEmailContent();
                if (!ec){ toast('Open an email first', 'err'); return; }
                var piiEc = maskPII(ec);
                t = toast('Summarizing...', 'load');
                var res = await callBg({ type: 'SUMMARIZE_EMAIL', emailContent: piiEc.text });
                if (t) t.remove();
                var sumText = unmaskPII(res.result, piiEc.map);
                var w = panel.querySelector('.nm-sum-wrap');
                w.querySelector('.nm-sum-body').innerHTML = sumText.replace(/\n/g, '<br>');
                w.style.display = 'block';
                toast('Summary ready', 'ok');

            } else if (action === 'variations') {
                var ec = getEmailContent();
                var incoming = panel._incomingAttachments || [];
                if (!ec && incoming.length === 0){ toast('Open an email first', 'err'); return; }
                var piiEc = maskPII(ec || '');

                var mediaPayload = null;
                if (incoming.length > 0) {
                    var tAtt = toast('Analyzing attachments for variations...', 'load');
                    try {
                        mediaPayload = await analyzeIncomingAttachments(incoming);
                    } catch(e) {}
                    if (tAtt) tAtt.remove();
                }

                t = toast('Generating 3 variations...', 'load');
                var res = await callBg({
                    type: 'GENERATE_VARIATIONS',
                    emailContent: piiEc.text || '',
                    tone: tone,
                    customPrompt: custom,
                    mediaContent: mediaPayload ? mediaPayload.mediaContent : null,
                    mediaType: mediaPayload ? mediaPayload.mediaType : null
                });
                if (t) t.remove();
                var unmaskedVars = (res.variations || []).map(function(v){ return unmaskPII(v, piiEc.map); });
                renderVariations(panel, unmaskedVars);
                toast('3 variations ready', 'ok');

            } else if (action === 'decode-subtext') {
                var ec = getEmailContent();
                if (!ec) { toast('Open an email first to decode subtext', 'err'); return; }
                var piiEc = maskPII(ec);
                t = toast('Scanning corporate subtext & hidden meaning...', 'load');
                var res = await callBg({ type: 'DECODE_SUBTEXT', emailContent: piiEc.text });
                if (t) t.remove();
                var text = unmaskPII(res.result, piiEc.map);
                var card = panel.querySelector('#nm-subtext-card');
                var body = panel.querySelector('#nm-subtext-body');
                if (card && body) {
                    body.innerText = text;
                    card.style.display = 'block';
                    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
                toast('Truth decoded!', 'ok');

            } else if (action === 'psych-radar') {
                var ec = getEmailContent();
                if (!ec) { toast('Open an email first to run psych radar', 'err'); return; }
                var piiEc = maskPII(ec);
                t = toast('Analyzing recipient psychometrics & leverage...', 'load');
                var res = await callBg({ type: 'PSYCH_RADAR', emailContent: piiEc.text });
                if (t) t.remove();
                var text = unmaskPII(res.result, piiEc.map);
                var card = panel.querySelector('#nm-radar-card');
                var body = panel.querySelector('#nm-radar-body');
                if (card && body) {
                    body.innerText = text;
                    card.style.display = 'block';
                    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
                toast('Psychometric radar ready!', 'ok');
            }
        } catch(err) {
            console.error('[NeuralMail Error]', err);
            if (t) t.remove();
            toast(err.message || 'Something went wrong', 'err');
        } finally {
            if (fab) fab.classList.remove('busy');
        }
    })();
}

async function handleTacticalNegotiate(strategy, panel, fab) {
    if (fab) fab.classList.add('busy');
    var ec = getEmailContent();
    if (!ec) { toast('Open an email first to negotiate', 'err'); if (fab) fab.classList.remove('busy'); return; }
    var piiEc = maskPII(ec);
    var t = toast('Drafting tactical counter-offer (' + strategy + ')...', 'load');
    try {
        var res = await callBg({ type: 'TACTICAL_NEGOTIATE', emailContent: piiEc.text, customPrompt: strategy });
        t.remove();
        var reply = unmaskPII(res.result, piiEc.map);
        panel._lastReply = reply;
        var replyWrap = panel.querySelector('#nm-reply-wrap');
        if (replyWrap) {
            var rBody = replyWrap.querySelector('#nm-reply-body');
            if (rBody) rBody.innerText = reply;
            replyWrap.style.display = 'block';
            replyWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        await openReplyComposeIfClosed();
        insertCompose(reply);
        toast('Tactical counter-offer inserted into compose!', 'ok');
    } catch(err) {
        if (t) t.remove();
        toast('Negotiation failed: ' + err.message, 'err');
    } finally {
        if (fab) fab.classList.remove('busy');
    }
}

async function handleCulturalDiplomat(culture, panel, fab) {
    if (fab) fab.classList.add('busy');
    var ec = (getComposeBox() || {}).innerText || getEmailContent() || '';
    if (!ec || ec.length < 5) { toast('Type a draft or open an email first', 'err'); if (fab) fab.classList.remove('busy'); return; }
    var piiEc = maskPII(ec);
    var t = toast('Adapting to ' + culture + ' native etiquette...', 'load');
    try {
        var res = await callBg({ type: 'CULTURAL_DIPLOMAT', emailContent: piiEc.text, tone: culture });
        t.remove();
        var reply = unmaskPII(res.result, piiEc.map);
        panel._lastReply = reply;
        var replyWrap = panel.querySelector('#nm-reply-wrap');
        if (replyWrap) {
            var rBody = replyWrap.querySelector('#nm-reply-body');
            if (rBody) rBody.innerText = reply;
            replyWrap.style.display = 'block';
            replyWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        await openReplyComposeIfClosed();
        insertCompose(reply);
        toast('Adapted to ' + culture + ' business etiquette!', 'ok');
    } catch(err) {
        if (t) t.remove();
        toast('Diplomat failed: ' + err.message, 'err');
    } finally {
        if (fab) fab.classList.remove('busy');
    }
}

function renderVariations(panel, vars) {
    var list = panel.querySelector('.nm-var-list'), wrap = panel.querySelector('.nm-var-wrap');
    wrap.style.display = 'block'; list.innerHTML = '';
    ['Formal', 'Friendly', 'Concise'].forEach(function(lbl, i){
        var text = (vars[i] || '').trim();
        var d = document.createElement('div'); d.className = 'nm-var-item';
        d.innerHTML = '<div class="nm-var-tag">' + lbl + '</div>' +
            '<div class="nm-var-txt">' + (text.slice(0, 120) + (text.length > 120 ? '...' : '')) + '</div>' +
            '<button class="nm-var-use">Use this reply</button>';
        d.querySelector('.nm-var-use').onclick = function(e){
            e.stopPropagation(); insertCompose(text); toast('Inserted', 'ok');
        };
        d.onclick = function(){
            list.querySelectorAll('.nm-var-item').forEach(function(x){ x.classList.remove('sel'); });
            d.classList.toggle('sel');
        };
        list.appendChild(d);
    });
}

function getPersonaContext() {
    return new Promise(function(resolve) {
        chrome.storage.sync.get(['nmPersonaName', 'nmPersonaRole', 'nmPersonaLink', 'nmPersonaRules'], function(d) {
            var parts = [];
            if (d && d.nmPersonaName) parts.push('My Name: ' + d.nmPersonaName);
            if (d && d.nmPersonaRole) parts.push('My Role/Company: ' + d.nmPersonaRole);
            if (d && d.nmPersonaLink) parts.push('My Calendar Booking Link: ' + d.nmPersonaLink);
            if (d && d.nmPersonaRules) parts.push('My Persona/Signature Guidelines: ' + d.nmPersonaRules);
            resolve(parts.join('\n'));
        });
    });
}

async function handleCalendarRsvp(rsvpType, panel, fab) {
    if (fab) fab.classList.add('busy');
    var ec = getEmailContent();
    if (!ec) { toast('Open an email first to schedule RSVP', 'err'); if (fab) fab.classList.remove('busy'); return; }
    var piiEc = maskPII(ec);
    var persona = await getPersonaContext();
    var t = toast('Drafting calendar RSVP...', 'load');
    try {
        var res = await callBg({
            type: 'CALENDAR_RSVP',
            emailContent: piiEc.text,
            intentMode: rsvpType,
            customPrompt: persona
        });
        t.remove();
        var reply = unmaskPII(res.result, piiEc.map);
        panel._lastReply = reply;
        var replyWrap = panel.querySelector('#nm-reply-wrap');
        if (replyWrap) {
            var rBody = replyWrap.querySelector('#nm-reply-body');
            if (rBody) rBody.innerText = reply;
            replyWrap.style.display = 'block';
            replyWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        await openReplyComposeIfClosed();
        insertCompose(reply);
        toast('Meeting RSVP inserted into compose!', 'ok');
    } catch(err) {
        if (t) t.remove();
        toast('Calendar RSVP failed: ' + err.message, 'err');
    } finally {
        if (fab) fab.classList.remove('busy');
    }
}

async function handleThreadBrief(panel, fab) {
    if (fab) fab.classList.add('busy');
    var ec = getEmailContent();
    var thread = getThreadContext();
    var contentToBrief = thread ? (thread + '\n\n' + (ec || '')) : (ec || '');
    if (!contentToBrief || contentToBrief.length < 10) {
        toast('Open an email thread first to extract brief', 'err');
        if (fab) fab.classList.remove('busy');
        return;
    }
    var piiEc = maskPII(contentToBrief);
    var t = toast('Condensing thread into executive brief...', 'load');
    try {
        var res = await callBg({
            type: 'THREAD_BRIEF',
            emailContent: piiEc.text
        });
        t.remove();
        var brief = unmaskPII(res.result, piiEc.map);
        var card = panel.querySelector('#nm-brief-card');
        var body = panel.querySelector('#nm-brief-body');
        if (card && body) {
            var formatted = brief.replace(/^- \[( |x)\] (.*)$/gim, function(m, chk, text) {
                var isChecked = chk.toLowerCase() === 'x';
                return '<label style="display:flex;align-items:flex-start;gap:6px;margin:3px 0;cursor:pointer;"><input type="checkbox" ' + (isChecked ? 'checked' : '') + ' style="margin-top:2px;" /><span>' + text + '</span></label>';
            });
            body.innerHTML = formatted.replace(/\n/g, '<br>');
            card.style.display = 'block';
            card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        toast('Executive thread brief ready!', 'ok');
    } catch(err) {
        if (t) t.remove();
        toast('Brief failed: ' + err.message, 'err');
    } finally {
        if (fab) fab.classList.remove('busy');
    }
}

// ── 👻 GHOSTWRITER PREDICTIVE INLINE AUTOCOMPLETE ────────────
var ghostTimer = null;
var ghostActiveSpan = null;

function removeGhostText(box) {
    if (ghostActiveSpan && ghostActiveSpan.parentNode) {
        ghostActiveSpan.remove();
    }
    if (box) {
        var spans = box.querySelectorAll('.nm-ghost-preview');
        spans.forEach(function(s) { s.remove(); });
    }
    ghostActiveSpan = null;
}

function attachGhostwriter() {
    var boxes = document.querySelectorAll('div[role="textbox"][contenteditable="true"], div.Am.Al.editable');
    boxes.forEach(function(box) {
        if (box.dataset.nmGhostAttached) return;
        box.dataset.nmGhostAttached = 'true';

        box.addEventListener('keydown', function(e) {
            var ghost = box.querySelector('.nm-ghost-preview');
            if (ghost && (e.key === 'Tab' || e.key === 'ArrowRight')) {
                e.preventDefault();
                e.stopPropagation();
                var raw = ghost.getAttribute('data-raw') || '';
                removeGhostText(box);
                if (raw) {
                    document.execCommand('insertText', false, raw);
                }
                return;
            }
            if (ghost && e.key === 'Escape') {
                e.preventDefault();
                removeGhostText(box);
                return;
            }
            if (ghost && e.key !== 'Shift' && e.key !== 'Control' && e.key !== 'Alt') {
                removeGhostText(box);
            }
        }, true);

        box.addEventListener('input', function(e) {
            removeGhostText(box);
            if (ghostTimer) clearTimeout(ghostTimer);

            ghostTimer = setTimeout(function() {
                var sel = window.getSelection();
                if (!sel || !sel.rangeCount) return;
                var range = sel.getRangeAt(0);
                if (!box.contains(range.startContainer)) return;

                var preRange = range.cloneRange();
                preRange.selectNodeContents(box);
                preRange.setEnd(range.startContainer, range.startOffset);
                var text = preRange.toString();
                var lines = text.split('\n');
                var currentLine = (lines[lines.length - 1] || '').trim();

                if (currentLine.length < 8 || /[.?!]$/.test(currentLine)) return;

                var ec = getEmailContent() || '';
                chrome.runtime.sendMessage({
                    type: 'AUTOCOMPLETE',
                    customPrompt: currentLine,
                    emailContent: ec.slice(0, 500)
                }, function(resp) {
                    if (chrome.runtime.lastError || !resp || !resp.success || !resp.result) return;
                    var suggestion = resp.result.trim();
                    if (!suggestion) return;
                    if (!suggestion.startsWith(' ') && !currentLine.endsWith(' ')) {
                        suggestion = ' ' + suggestion;
                    }

                    var curSel = window.getSelection();
                    if (!curSel || !curSel.rangeCount) return;
                    var curRange = curSel.getRangeAt(0);
                    if (!box.contains(curRange.startContainer)) return;

                    removeGhostText(box);
                    var span = document.createElement('span');
                    span.className = 'nm-ghost-preview';
                    span.contentEditable = 'false';
                    span.setAttribute('data-raw', suggestion);
                    span.innerText = suggestion + '  ⇥';

                    try {
                        curRange.insertNode(span);
                        curSel.collapse(span, 0);
                    } catch(ex) {}
                    ghostActiveSpan = span;
                });
            }, 450);
        });
    });
}

function injectFAB(toolbar) {
    if (!toolbar || toolbar.querySelector('.nm-fab')) return;
    var sendBtn =
        toolbar.querySelector('div[role="button"].T-I.J-J5-Ji.aoO.v7') ||
        toolbar.querySelector('[data-tooltip="Send"]') ||
        toolbar.querySelector('.T-I.J-J5-Ji.aoO');
    if (!sendBtn) return;
    injectStyles();
    var wrap = document.createElement('div'); wrap.className = 'nm-wrap';
    var fab  = document.createElement('button'); fab.className = 'nm-fab'; fab.title = 'NeuralMail AI';
    var logoUrl = chrome.runtime.getURL('icons/icon48.png');
    fab.innerHTML =
        '<div class="nm-fab-bg"></div>' +
        '<div class="nm-fab-inner" style="display:flex;align-items:center;justify-content:center;">' +
            '<img src="' + logoUrl + '" alt="NeuralMail" style="width: 20px; height: 20px; object-fit: contain; border-radius: 4px; pointer-events: none;" />' +
        '</div>';
    var active = null;
    fab.onclick = function(e){
        e.stopPropagation();
        if (active){ closePanel(active, fab); active = null; return; }
        fab.classList.add('open');
        var panel = buildPanel(fab);
        positionPanel(panel, fab);
        active = panel;
        setTimeout(function(){
            function out(ev){
                if (!panel.contains(ev.target) && ev.target !== fab){
                    closePanel(panel, fab); active = null;
                    document.removeEventListener('click', out, true);
                }
            }
            document.addEventListener('click', out, true);
        }, 180);
    };
    wrap.appendChild(fab);
    var ins = sendBtn; var nx = sendBtn.nextElementSibling;
    if (nx && (nx.classList.contains('T-I-Js-Gs') || nx.getAttribute('role') === 'button')) ins = nx;
    if (ins.nextSibling) ins.parentNode.insertBefore(wrap, ins.nextSibling);
    else ins.parentNode.appendChild(wrap);
}

function scan(){
    // Delete any old floating FAB or thread buttons that were cluttering the UI
    var oldGlobalFab = document.getElementById('nm-global-fab-btn');
    if (oldGlobalFab) oldGlobalFab.remove();
    document.querySelectorAll('.nm-thread-reply-btn').forEach(function(b) { b.remove(); });

    // Inject ONLY into compose toolbars
    document.querySelectorAll('.gU.Up').forEach(injectFAB);
    document.querySelectorAll('[role="dialog"]').forEach(function(d){
        var t = d.querySelector('.gU.Up'); if(t) injectFAB(t);
    });

    // Attach ghostwriter inline autocomplete
    attachGhostwriter();
}
new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
setTimeout(scan, 500); setTimeout(scan, 1500); setTimeout(scan, 3500);