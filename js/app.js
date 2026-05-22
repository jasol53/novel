/* ════════════════════════════════════════════
   주남 유니버스 — 공통 모듈 (app.js)
   ════════════════════════════════════════════ */

/* ── Firebase 설정 ── */
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyAAvw0jA8ckUu2oX9I4dpb_MnNKWTZRkpw",
    authDomain: "novel-mania-a6908.firebaseapp.com",
    projectId: "novel-mania-a6908",
    storageBucket: "novel-mania-a6908.firebasestorage.app",
    messagingSenderId: "519347716266",
    appId: "1:519347716266:web:5e348bf3a2bdae56e410d3"
};

/* ── Firebase 초기화 ── */
async function initFirebase() {
    try {
        if (firebase.apps.length === 0) {
            firebase.initializeApp(FIREBASE_CONFIG);
        }
        try {
            firebase.firestore().settings({
                experimentalForceLongPolling: true,
                useFetchStreams: false
            });
        } catch (e) {}
        await firebase.auth().signInAnonymously();
        return firebase.firestore();
    } catch (e) {
        console.error('[Firebase 초기화 실패]', e);
        return null;
    }
}

/* ── Firestore 데이터 로드 ── */
async function loadBook(db, bookId) {
    try {
        const doc = await db.collection('novels').doc(bookId).get();
        if (doc.exists) return { id: doc.id, ...doc.data() };
        return null;
    } catch (e) {
        console.error('[loadBook 실패]', e);
        return null;
    }
}

async function loadAllBooks(db) {
    try {
        const snap = await db.collection('novels').get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
        console.error('[loadAllBooks 실패]', e);
        return [];
    }
}

/* ── URL 파라미터 유틸 ── */
function getParam(key) {
    return new URLSearchParams(location.search).get(key);
}

function buildUrl(file, params = {}) {
    const q = new URLSearchParams(params).toString();
    return q ? `${file}?${q}` : file;
}

/* ── Google Drive / Firebase Storage 링크 변환 ── */
function convertImageUrl(url) {
    if (!url) return '';
    url = url.trim();
    if (url.startsWith('gs://')) {
        const clean = url.replace('gs://', '');
        const slash = clean.indexOf('/');
        if (slash !== -1)
            return `https://firebasestorage.googleapis.com/v0/b/${clean.substring(0, slash)}/o/${encodeURIComponent(clean.substring(slash + 1))}?alt=media`;
    }
    const m = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
    if (m) return `https://lh3.googleusercontent.com/d/${m[1]}`;
    return url;
}

/* ── 텍스트 포맷 (산문 → HTML) ── */
function sanitizeAndFormatBold(text) {
    const bTags = [];
    text = text.replace(/<b>([\s\S]*?)<\/b>/g, (_, inner) => { bTags.push(`<div class="b-impact">${inner}</div>`); return `\x00B${bTags.length - 1}\x00`; });
    text = text.replace(/<strong>([\s\S]*?)<\/strong>/g, (_, inner) => { bTags.push(`<strong>${inner}</strong>`); return `\x00B${bTags.length - 1}\x00`; });
    text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    text = text.replace(/\*\*([\s\S]*?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__([\s\S]*?)__/g, '<strong>$1</strong>');
    text = text.replace(/\x00B(\d+)\x00/g, (_, i) => bTags[parseInt(i)]);
    return text;
}

function parseSpecialBlocks(text) {
    text = text.replace(/\[lyrics\]([\s\S]*?)\[\/lyrics\]/g, (_, c) => {
        const inner = c.trim().split('\n').map(l => sanitizeAndFormatBold(l)).join('<br>');
        return `\n<div class="lyrics-block">${inner}</div>\n`;
    });
    text = text.replace(/\[chat\]([\s\S]*?)\[(?:\/|／)chat\]/g, (_, c) => {
        const lines = c.trim().split('\n').map(line => {
            const ci = line.indexOf(':');
            if (ci !== -1) {
                const sender = line.substring(0, ci).trim();
                const msg = line.substring(ci + 1).trim();
                const isJunhwan = sender === '준환';
                const cls = isJunhwan ? 'chat-right chat-junhwan' : 'chat-left';
                return `<div class="chat-line ${cls}"><span class="chat-sender">${sender}</span><span class="chat-msg">${msg}</span></div>`;
            }
            return `<div class="chat-line chat-left"><span class="chat-msg">${line.trim()}</span></div>`;
        }).join('');
        return `\n<div class="chat-block">${lines}</div>\n`;
    });
    text = text.replace(/\[flashback\]([\s\S]*?)\[\/flashback\]/g, (_, c) => {
        const inner = c.trim().split('\n').map(l => sanitizeAndFormatBold(l.trim())).filter(Boolean).join('<br>');
        return `\n<div class="flashback-block">${inner}</div>\n`;
    });
    text = text.replace(/\[music=(.*?)\](.*?)\[\/music\]/g, (_, link, title) => {
        const clean = link.trim().replace(/"/g, '&quot;');
        return `\n<div class="music-block music-center"><a onclick="togglePlayMusic('${clean}', this)" class="music-link" data-music-url="${clean}"><i class="fa-solid fa-compact-disc"></i> <span>${title.trim()}</span></a></div>\n`;
    });
    text = text.replace(/\[autoplay=(.*?)\](.*?)\[\/autoplay\]/g, (_, link, title) => {
        const clean = link.trim().replace(/"/g, '&quot;');
        return `\n<div class="music-block music-autoplay music-center"><a onclick="togglePlayMusic('${clean}', this)" class="music-link" data-autoplay="true" data-music-url="${clean}"><i class="fa-solid fa-compact-disc"></i> <span>${title.trim()}</span></a></div>\n`;
    });
    text = text.replace(/\[image=(.*?)\]([\s\S]*?)\[\/image\]/g, (_, link, cap) => {
        const clean = convertImageUrl(link.trim());
        return `\n<div class="illustration-block"><img src="${clean}" alt="${cap.trim()}" class="illustration-img" onerror="this.parentElement.style.display='none'"><p class="illustration-caption">${cap.trim()}</p></div>\n`;
    });
    return text;
}

function formatProse(c) {
    const clean = c.replace(/\r/g, '');
    let firstDrop = false;
    let content = parseSpecialBlocks(clean);
    const lines = content.split('\n');
    const out = [];
    for (let i = 0; i < lines.length; i++) {
        const p = lines[i], t = p.trim();
        if (t === '[[transition]]') {
            const si = i; i++;
            const bl = [];
            while (i < lines.length && lines[i].trim() !== '[[/transition]]') { bl.push(lines[i]); i++; }
            out.push(`<div class="transition-block" data-para-idx="${si}"><span>${bl.map(l => sanitizeAndFormatBold(l)).join('<br>')}</span></div>`);
            continue;
        }
        if (p.startsWith('<div') || p.startsWith('</div') || p.startsWith('<blockquote') || p.startsWith('</blockquote') || p.startsWith('<a')) { out.push(p); continue; }
        if (t === '***' || t === '* * *') { out.push(`<div class="scene-asterisk" data-para-idx="${i}">❧&nbsp;&nbsp;&nbsp;❧&nbsp;&nbsp;&nbsp;❧</div>`); continue; }
        if (t === '<...>' || t === '<…>') {
            out.push(`<div class="scene-dots" data-para-idx="${i}"><span style="font-size:5px">●</span><span style="font-size:9px">●</span><span style="font-size:14px">●</span><span style="font-size:9px">●</span><span style="font-size:5px">●</span></div>`);
            continue;
        }
        if (t === '-----') { out.push(`<div class="scene-long-line" data-para-idx="${i}"></div>`); continue; }
        if (t === '=====') { out.push(`<div class="scene-double-line" data-para-idx="${i}"></div>`); continue; }
        if (t === '') { out.push(`<p class="prose-empty-line" data-para-idx="${i}">&nbsp;</p>`); continue; }
        if (!firstDrop) {
            firstDrop = true;
            out.push(`<p class="drop" data-para-idx="${i}">${sanitizeAndFormatBold(p)}</p>`);
        } else {
            out.push(`<p data-para-idx="${i}">${sanitizeAndFormatBold(p)}</p>`);
        }
    }
    return out.filter(Boolean).join('');
}

/* ── BGM 유틸 ── */
function extractVideoId(url) {
    const m = url.match(/^.*(youtu.be\/|v\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/);
    return m && m[2].length === 11 ? m[2] : null;
}
function extractSunoId(url) {
    const m = url.match(/suno\.com\/(?:song|input|s)\/([a-zA-Z0-9\-]+)/i);
    return m ? m[1] : null;
}

/* ── 북마크 유틸 ── */
function saveBookmark(bookId, chapterIdx, pageIdx = 0) {
    try {
        localStorage.setItem(`joonam_bookmark_${bookId}`, JSON.stringify({ chapterIdx, pageIdx, savedAt: Date.now() }));
    } catch (e) {}
}

function loadBookmark(bookId) {
    try {
        const s = localStorage.getItem(`joonam_bookmark_${bookId}`);
        return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
}

/* ── Toast ── */
function showToast(message, type = 'success') {
    const t = document.createElement('div');
    t.className = `joonam-toast ${type}`;
    t.textContent = message;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3000);
}
