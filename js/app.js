/* ════════════════════════════════════════════
   GLOBAL STATE
   ════════════════════════════════════════════ */
const bookState = {
    title: "나의 첫 번째 이야기책", author: "무명작가",
    description: "", coverUrlWebnovel: "", coverUrlTablet: "", coverUrlStandard: "",
    chapters: [], currentChapterIndex: 0, viewMode: 'author'
};
let editingChapterId = null;
let deleteIdxTarget = null;
let db = null;
let isFirebaseConnected = false;

const IS_MOBILE = (navigator.maxTouchPoints > 0) || (window.innerWidth < 768);

// Reader engine state
let TOTAL = 1;
let TITLES = [];
let bkPages = [];
let cur = 0;
let fontSize = 16;
let pcDots = [];
let mobDots = [];
let flipping = false;
let readerInitialized = false;

// Bookmark state
const bookmarkState = {
    activeBookId: 'local_novel',
    savedPageIndex: 0, savedParagraphIndex: 0, isRestoring: false
};

// Page curl state
const st = {
    phase: 'idle', dir: 0, grabX: 0, grabY: 0, curX: 0, curY: 0,
    targetX: 0, targetY: 0, fromX: 0, fromY: 0,
    startTime: 0, duration: 0, targetIdx: -1, completing: false
};

// BGM state
let ytAudioPlayer = null;
let sunoAudioObject = null;
let currentPlayingMusicId = null;
let currentPlayingBtn = null;
let currentPlayingType = null;
let currentVolume = 15;
let isMuted = false;
let preMutedVolume = 15;

/* ════════════════════════════════════════════
   INIT
   ════════════════════════════════════════════ */
window.onload = function() {
    loadConfigAndInitialize();
    initDragAndDrop();
    const urlParams = new URLSearchParams(window.location.search);
    const cloudBookId = urlParams.get('id');
    if (cloudBookId) {
        bookmarkState.activeBookId = cloudBookId;
        firebase.auth().onAuthStateChanged(user => {
            if (user) {
                db = firebase.firestore();
                isFirebaseConnected = true;
                setBadge('ok', '뉴토끼남 클라우드 연동');
                loadBookFromCloud(cloudBookId);
            }
        });
    } else {
        loadLocalBookState();
        renderChapters();
        switchViewMode('author');
    }
    window.addEventListener('resize', () => {
        if (bookState.viewMode === 'reader') updateDynamicCoverOnResize();
    });
};

/* ════════════════════════════════════════════
   FIREBASE
   ════════════════════════════════════════════ */
async function loadConfigAndInitialize() {
    const defaultConfig = {
        apiKey: "AIzaSyAAvw0jA8ckUu2oX9I4dpb_MnNKWTZRkpw",
        authDomain: "novel-mania-a6908.firebaseapp.com",
        projectId: "novel-mania-a6908",
        storageBucket: "novel-mania-a6908.firebasestorage.app",
        messagingSenderId: "519347716266",
        appId: "1:519347716266:web:5e348bf3a2bdae56e410d3"
    };
    const saved = localStorage.getItem('newtokkinam_firebase_config');
    let cfg = defaultConfig;
    if (saved) {
        try {
            const clean = saved.replace(/const\s+\w+\s*=\s*/, '').replace(/;$/, '').trim();
            cfg = new Function(`return ${clean}`)();
        } catch(e) {}
    }
    try {
        if (firebase.apps.length === 0) firebase.initializeApp(cfg);
        await firebase.auth().signInAnonymously();
        db = firebase.firestore();
        isFirebaseConnected = true;
        setBadge('ok', '뉴토끼남 클라우드 연동');
    } catch(e) {
        setBadge('err', '연결 실패: ' + e.message);
    }
}

function setBadge(type, text) {
    const badge = document.getElementById('db-status-badge');
    if (!badge) return;
    const dot = type === 'ok'
        ? '<span class="w-2 h-2 bg-emerald-500 rounded-full mr-2"></span>'
        : '<span class="w-2 h-2 bg-rose-500 rounded-full mr-2"></span>';
    badge.innerHTML = dot + text;
    badge.className = type === 'ok'
        ? 'flex items-center px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-lg border border-emerald-200'
        : 'flex items-center px-3 py-1.5 bg-rose-50 text-rose-700 text-xs font-semibold rounded-lg border border-rose-200';
}

function openConfigModal() { document.getElementById('modal-config').classList.remove('hidden'); }
function closeConfigModal() { document.getElementById('modal-config').classList.add('hidden'); }
function saveConfig() {
    const val = document.getElementById('config-textarea').value.trim();
    if (!val) { showToast('설정값을 입력해 주세요.', 'error'); return; }
    localStorage.setItem('newtokkinam_firebase_config', val);
    closeConfigModal();
    loadConfigAndInitialize();
    showToast('설정 적용 완료!');
}
function clearConfig() {
    localStorage.removeItem('newtokkinam_firebase_config');
    localStorage.removeItem('newtokkinam_cloud_id');
    document.getElementById('config-textarea').value = '';
    closeConfigModal();
    showToast('초기화되었습니다.');
}
function closeShareModal() { document.getElementById('modal-share').classList.add('hidden'); }
function copyShareLink() {
    const inp = document.getElementById('share-link-input');
    inp.select(); inp.setSelectionRange(0, 99999);
    document.execCommand('copy');
    showToast('링크가 복사되었습니다!');
}

/* ════════════════════════════════════════════
   TOAST
   ════════════════════════════════════════════ */
function showToast(message, type = 'success') {
    const t = document.createElement('div');
    t.className = `fixed bottom-6 right-6 z-[9999] px-5 py-3 rounded-2xl shadow-xl text-white text-xs font-semibold flex items-center space-x-3 transition-all transform ${type === 'error' ? 'bg-rose-600' : type === 'info' ? 'bg-sky-700' : 'bg-slate-900'}`;
    t.innerHTML = `<i class="fa-solid ${type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check'}"></i><span>${message}</span>`;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 500); }, 3000);
}

/* ════════════════════════════════════════════
   LOCAL STORAGE
   ════════════════════════════════════════════ */
function saveLocalBookState() {
    localStorage.setItem('newtokkinam_local_book', JSON.stringify(bookState));
}
function loadLocalBookState() {
    const saved = localStorage.getItem('newtokkinam_local_book') || localStorage.getItem('epicflow_local_book');
    if (!saved) return;
    try {
        const p = JSON.parse(saved);
        bookState.title = p.title || "나의 첫 번째 이야기책";
        bookState.author = p.author || "무명작가";
        bookState.description = p.description || "";
        bookState.coverUrlWebnovel = p.coverUrlWebnovel || p.coverUrl || "";
        bookState.coverUrlTablet = p.coverUrlTablet || "";
        bookState.coverUrlStandard = p.coverUrlStandard || "";
        bookState.chapters = p.chapters || [];
        document.getElementById('input-book-title').value = bookState.title;
        document.getElementById('input-book-author').value = bookState.author;
        document.getElementById('input-book-description').value = bookState.description;
        document.getElementById('input-book-cover-webnovel').value = bookState.coverUrlWebnovel;
        document.getElementById('input-book-cover-tablet').value = bookState.coverUrlTablet;
        document.getElementById('input-book-cover-standard').value = bookState.coverUrlStandard;
    } catch(e) {}
}

/* ════════════════════════════════════════════
   AUTHOR MODE
   ════════════════════════════════════════════ */
function initDragAndDrop() {
    const dz = document.getElementById('drop-zone');
    ['dragenter','dragover'].forEach(e => dz.addEventListener(e, ev => { ev.preventDefault(); dz.classList.add('bg-indigo-100'); }));
    ['dragleave','drop'].forEach(e => dz.addEventListener(e, ev => { ev.preventDefault(); dz.classList.remove('bg-indigo-100'); }));
    dz.addEventListener('drop', e => { if (e.dataTransfer.files.length) handleNovelTxtFile(e.dataTransfer.files[0]); });
    document.getElementById('file-uploader').addEventListener('change', e => { if (e.target.files.length) handleNovelTxtFile(e.target.files[0]); });
}

function handleNovelTxtFile(file) {
    const reader = new FileReader();
    const name = file.name.replace(/\.[^/.]+$/, '');
    reader.onload = e => {
        document.getElementById('edit-chapter-title').value = name;
        document.getElementById('edit-chapter-content').value = e.target.result;
        showToast(`"${name}" 파일을 불러왔습니다.`);
    };
    reader.readAsText(file, 'UTF-8');
}

function updateBookInfo() {
    bookState.title = document.getElementById('input-book-title').value || "제목 없음";
    bookState.author = document.getElementById('input-book-author').value || "작가 미상";
    bookState.description = document.getElementById('input-book-description').value || "";
    bookState.coverUrlWebnovel = convertGoogleDriveLink(document.getElementById('input-book-cover-webnovel').value);
    bookState.coverUrlTablet = convertGoogleDriveLink(document.getElementById('input-book-cover-tablet').value);
    bookState.coverUrlStandard = convertGoogleDriveLink(document.getElementById('input-book-cover-standard').value);
    const titleEl = document.getElementById('sb-book-title-el');
    const authorEl = document.getElementById('sb-book-author-el');
    if (titleEl) titleEl.textContent = bookState.title;
    if (authorEl) authorEl.textContent = bookState.author + " 지음";
    saveLocalBookState();
}

function renderChapters() {
    const list = document.getElementById('author-chapter-list');
    document.getElementById('chapter-count').textContent = `${bookState.chapters.length}화`;
    if (!bookState.chapters.length) {
        list.innerHTML = `<div class="text-center py-10 text-slate-400 text-sm"><i class="fa-solid fa-box-open text-3xl mb-2 block"></i>등록된 회차가 없습니다.</div>`;
        return;
    }
    list.innerHTML = bookState.chapters.map((c, i) => {
        const isEditing = c.id === editingChapterId;
        return `
        <div class="group flex items-center justify-between p-3 rounded-xl border transition-all ${isEditing ? 'bg-indigo-50 border-indigo-300' : 'bg-slate-50 border-slate-200'}">
            <div class="flex-1 truncate cursor-pointer pr-2" onclick="loadToEditor(${i})">
                <span class="text-xs font-bold text-slate-400 mr-2">${i+1}화</span>
                <span class="text-sm font-semibold text-slate-700">${c.title}</span>
                ${isEditing ? '<span class="ml-2 text-[9px] text-indigo-500 font-bold bg-indigo-100 px-1.5 py-0.5 rounded">수정중</span>' : ''}
            </div>
            <div class="flex items-center space-x-1 opacity-20 group-hover:opacity-100 transition-opacity">
                <button onclick="moveChapter(${i},-1)" class="w-7 h-7 bg-white hover:bg-slate-200 text-slate-500 rounded-lg flex items-center justify-center border"><i class="fa-solid fa-chevron-up text-[10px]"></i></button>
                <button onclick="moveChapter(${i},1)" class="w-7 h-7 bg-white hover:bg-slate-200 text-slate-500 rounded-lg flex items-center justify-center border"><i class="fa-solid fa-chevron-down text-[10px]"></i></button>
                <button onclick="deleteChapter(${i})" class="w-7 h-7 bg-white hover:bg-rose-50 text-rose-500 rounded-lg flex items-center justify-center border border-rose-100"><i class="fa-solid fa-trash-can text-xs"></i></button>
            </div>
        </div>`;
    }).join('');
}

function loadToEditor(idx) {
    const chap = bookState.chapters[idx];
    editingChapterId = chap.id;
    document.getElementById('edit-chapter-title').value = chap.title;
    document.getElementById('edit-chapter-content').value = chap.content;
    document.getElementById('btn-cancel-edit').classList.remove('hidden');
    document.getElementById('btn-submit-chapter').innerHTML = '<i class="fa-solid fa-check mr-1.5"></i>이 회차를 수정';
    showToast(`"${chap.title}" 로드됨. 수정 후 저장하세요.`, 'info');
    renderChapters();
}

// ✅ 추가: resetEditor
function resetEditor() {
    editingChapterId = null;
    document.getElementById('edit-chapter-title').value = '';
    document.getElementById('edit-chapter-content').value = '';
    document.getElementById('btn-cancel-edit').classList.add('hidden');
    document.getElementById('btn-submit-chapter').innerHTML = '이 회차를 등록';
    renderChapters();
}

function addOrUpdateChapter() {
    const t = document.getElementById('edit-chapter-title').value.trim();
    const c = document.getElementById('edit-chapter-content').value.trim();
    if (!t || !c) return showToast('제목과 내용을 채워주세요.', 'error');
    if (editingChapterId) {
        const idx = bookState.chapters.findIndex(ch => ch.id === editingChapterId);
        if (idx !== -1) { bookState.chapters[idx] = { ...bookState.chapters[idx], title: t, content: c }; showToast('회차가 수정되었습니다.'); }
    } else {
        bookState.chapters.push({ id: 'ch_' + Date.now(), title: t, content: c });
        showToast('새 회차가 등록되었습니다.');
    }
    resetEditor(); saveLocalBookState(); renderChapters();
}

// ✅ 추가: moveChapter
function moveChapter(idx, dir) {
    const target = idx + dir;
    if (target < 0 || target >= bookState.chapters.length) return;
    [bookState.chapters[idx], bookState.chapters[target]] = [bookState.chapters[target], bookState.chapters[idx]];
    saveLocalBookState(); renderChapters();
}

// ✅ 추가: deleteChapter (커스텀 모달 사용)
function deleteChapter(idx) {
    deleteIdxTarget = idx;
    document.getElementById('modal-confirm-delete').classList.remove('hidden');
}
function closeDeleteModal(confirmed) {
    document.getElementById('modal-confirm-delete').classList.add('hidden');
    if (confirmed && deleteIdxTarget !== null) {
        const title = bookState.chapters[deleteIdxTarget].title;
        bookState.chapters.splice(deleteIdxTarget, 1);
        if (editingChapterId) { editingChapterId = null; resetEditor(); }
        saveLocalBookState(); renderChapters();
        showToast(`"${title}" 삭제됨.`);
    }
    deleteIdxTarget = null;
}

/* ════════════════════════════════════════════
   UTILS
   ════════════════════════════════════════════ */
function convertGoogleDriveLink(url) {
    if (!url) return '';
    url = url.trim();
    if (url.startsWith('gs://')) {
        const clean = url.replace('gs://', '');
        const slash = clean.indexOf('/');
        if (slash !== -1) return `https://firebasestorage.googleapis.com/v0/b/${clean.substring(0,slash)}/o/${encodeURIComponent(clean.substring(slash+1))}?alt=media`;
    }
    const m = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
    if (m) return `https://lh3.googleusercontent.com/d/${m[1]}`;
    return url;
}

function getDeviceCoverInfo() {
    const w = window.innerWidth;
    let ratioMode, url;
    if (w < 768) { ratioMode='webnovel'; url=bookState.coverUrlWebnovel||bookState.coverUrlStandard||bookState.coverUrlTablet; }
    else if (w < 1024) { ratioMode='tablet'; url=bookState.coverUrlTablet||bookState.coverUrlStandard||bookState.coverUrlWebnovel; }
    else { ratioMode='standard'; url=bookState.coverUrlStandard||bookState.coverUrlTablet||bookState.coverUrlWebnovel; }
    return { ratioMode, url };
}

function updateDynamicCoverOnResize() {
    const coverInner = document.querySelector('#p0 .cover-inner');
    if (!coverInner) return;
    const info = getDeviceCoverInfo();
    const wrapper = coverInner.querySelector('.cover-art-container-hook');
    const fallback = coverInner.querySelector('.cover-ornament-fallback');
    if (!wrapper || !fallback) return;
    if (info.url) {
        fallback.style.display = 'none'; wrapper.style.display = 'block';
        const rc = info.ratioMode === 'tablet' ? 'cover-ratio-tablet' : info.ratioMode === 'standard' ? 'cover-ratio-standard' : 'cover-ratio-webnovel';
        wrapper.className = `cover-art-wrapper ${rc} cover-art-container-hook`;
        wrapper.querySelector('img').src = info.url;
    } else {
        wrapper.style.display = 'none'; fallback.style.display = 'block';
    }
}

/* ════════════════════════════════════════════
   PROSE FORMATTER
   ════════════════════════════════════════════ */

// ✅ 추가: sanitizeAndFormatBold (원본에서 호출하지만 정의 없었던 함수)
function sanitizeAndFormatBold(text) {
    // <b>...</b> 와 <strong>...</strong> 태그 임시 보존
    const bTags = [];
    text = text.replace(/<b>([\s\S]*?)<\/b>/g, (_, inner) => { bTags.push(`<strong>${inner}</strong>`); return `\x00B${bTags.length-1}\x00`; });
    text = text.replace(/<strong>([\s\S]*?)<\/strong>/g, (_, inner) => { bTags.push(`<strong>${inner}</strong>`); return `\x00B${bTags.length-1}\x00`; });
    // XSS 방지 이스케이프
    text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // 마크다운 **bold** 변환
    text = text.replace(/\*\*([\s\S]*?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__([\s\S]*?)__/g, '<strong>$1</strong>');
    // 보존했던 태그 복원
    text = text.replace(/\x00B(\d+)\x00/g, (_, i) => bTags[parseInt(i)]);
    return text;
}

function parseSpecialBlocks(text) {
    text = text.replace(/\[lyrics\]([\s\S]*?)\[\/lyrics\]/g, (_, c) => {
        const inner = c.trim().split('\n').map(l => sanitizeAndFormatBold(l)).join('<br>');
        return `\n<div class="lyrics-block font-serif">${inner}</div>\n`;
    });
    text = text.replace(/\[chat\]([\s\S]*?)\[\/chat\]/g, (_, c) => {
        const lines = c.trim().split('\n').map(line => {
            const ci = line.indexOf(':');
            if (ci !== -1) {
                const sender = line.substring(0, ci).trim();
                const msg = line.substring(ci+1).trim();
                const cls = sender === '준환' ? 'chat-right' : 'chat-left';
                return `<div class="chat-line ${cls}"><span class="chat-sender">${sender}</span>: ${msg}</div>`;
            }
            return `<div class="chat-line chat-left">${line.trim()}</div>`;
        }).join('');
        return `\n<div class="chat-block">${lines}</div>\n`;
    });
    text = text.replace(/\[flashback\]([\s\S]*?)\[\/flashback\]/g, (_, c) => {
        const inner = c.trim().split('\n').map(l => sanitizeAndFormatBold(l.trim())).filter(Boolean).join('<br>');
        return `\n<div class="flashback-block font-serif">${inner}</div>\n`;
    });
    text = text.replace(/\[music=(.*?)\](.*?)\[\/music\]/g, (_, link, title) => {
        const clean = link.trim().replace(/"/g, '&quot;');
        return `\n<div class="music-block"><a onclick="togglePlayMusic('${clean}', this)" class="music-link"><i class="fa-solid fa-compact-disc"></i> <span>${title.trim()}</span></a></div>\n`;
    });
    // [autoplay=링크]곡명[/autoplay] — 화 진입 시 자동재생, 버튼은 보임
    text = text.replace(/\[autoplay=(.*?)\](.*?)\[\/autoplay\]/g, (_, link, title) => {
        const clean = link.trim().replace(/"/g, '&quot;');
        return `\n<div class="music-block music-autoplay"><a onclick="togglePlayMusic('${clean}', this)" class="music-link" data-autoplay="true"><i class="fa-solid fa-compact-disc"></i> <span>${title.trim()}</span></a></div>\n`;
    });
    text = text.replace(/\[image=(.*?)\]([\s\S]*?)\[\/image\]/g, (_, link, cap) => {
        const clean = convertGoogleDriveLink(link.trim());
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
            out.push(`<div class="scene-dots" data-para-idx="${i}"><span style="font-size:5px;line-height:1">●</span><span style="font-size:9px;line-height:1">●</span><span style="font-size:14px;line-height:1">●</span><span style="font-size:9px;line-height:1">●</span><span style="font-size:5px;line-height:1">●</span></div>`); continue;
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

/* ════════════════════════════════════════════
   VIEW MODE SWITCH
   ════════════════════════════════════════════ */
function switchViewMode(mode) {
    bookState.viewMode = mode;
    document.body.classList.toggle('reader-active', mode === 'reader');
    document.getElementById('author-workspace').classList.toggle('hidden', mode === 'reader');
    document.getElementById('author-header').classList.toggle('hidden', mode === 'reader');
    document.getElementById('author-footer').classList.toggle('hidden', mode === 'reader');

    if (IS_MOBILE) {
        // 모바일: mob-reader 토글
        const mobReader = document.getElementById('mob-reader');
        const readerWs = document.getElementById('reader-workspace');
        if (mode === 'reader') {
            readerWs.classList.add('hidden');
            mobReader.classList.add('active');
            buildReaderPages();
            resetMusicButtons();
            if (ytAudioPlayer && ytAudioPlayer.stopVideo) ytAudioPlayer.stopVideo();
        } else {
            mobReader.classList.remove('active');
            readerWs.classList.add('hidden');
        }
    } else {
        document.getElementById('reader-workspace').classList.toggle('hidden', mode === 'author');
        if (mode === 'reader') {
            buildReaderPages();
            resetMusicButtons();
            if (ytAudioPlayer && ytAudioPlayer.stopVideo) ytAudioPlayer.stopVideo();
            setTimeout(checkAndTriggerBookmark, 600);
        }
    }
}
/* ════════════════════════════════════════════
   AUTHOR MODE LOCK
   ════════════════════════════════════════════ */
const AUTHOR_PW = 'jasol53'; // ← 여기서 비밀번호 변경
let isAuthorUnlocked = false;

function promptAuthorMode() {
    const pw = prompt('작가 비밀번호를 입력하세요:');
    if (pw === null) return;
    if (pw === AUTHOR_PW) {
        isAuthorUnlocked = true;
        // ?id= 로 접속 시 숨겨진 스타일 제거
        const hs = document.getElementById('hs');
        if (hs) hs.remove();
        // author 요소 강제 표시
        ['author-header','author-workspace','author-footer'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = '';
        });
        switchViewMode('author');
    } else {
        alert('비밀번호가 틀렸습니다.');
    }
}

function goHome() { if (isAuthorUnlocked) switchViewMode('author'); }

/* ════════════════════════════════════════════
   BUILD READER PAGES
   ════════════════════════════════════════════ */
/* ════════════════════════════════════════════
   MOBILE: 챕터를 300자 단위 페이지로 분할
   ════════════════════════════════════════════ */
const MOB_CHARS_PER_PAGE = 300;

// 특수 블록 마커 (분할 시 통째로 유지)
const BLOCK_MARKER = '\x01BLOCK\x01';

function splitChapterIntoMobPages(content) {
    // 1. 특수 블록을 마커로 치환해서 분할 방지
    const blocks = [];
    let processed = content.replace(/\r/g, '');

    // 특수 블록 패턴들
    const blockPatterns = [
        /\[\[transition\]\][\s\S]*?\[\[\/transition\]\]/g,
        /\[chat\][\s\S]*?\[\/chat\]/g,
        /\[flashback\][\s\S]*?\[\/flashback\]/g,
        /\[lyrics\][\s\S]*?\[\/lyrics\]/g,
        /\[image=.*?\][\s\S]*?\[\/image\]/g,
        /\[music=.*?\].*?\[\/music\]/g,
        /\[autoplay=.*?\].*?\[\/autoplay\]/g,
    ];

    for (const pattern of blockPatterns) {
        processed = processed.replace(pattern, match => {
            blocks.push(match);
            return `${BLOCK_MARKER}${blocks.length - 1}${BLOCK_MARKER}`;
        });
    }

    // 2. 문단 단위로 쪼개기
    const paragraphs = processed.split(/\n/);
    const pages = [];
    let currentPage = [];
    let currentLen = 0;

    for (const para of paragraphs) {
        const isBlock = para.startsWith(BLOCK_MARKER);
        const paraLen = isBlock ? 0 : para.length; // 블록은 길이 0 취급 (강제 안 끊김)

        // 빈 줄
        if (!isBlock && para.trim() === '') {
            currentPage.push(para);
            continue;
        }

        // 블록이거나 현재 페이지가 비어있으면 그냥 추가
        if (isBlock || currentLen === 0) {
            currentPage.push(para);
            currentLen += paraLen;
        } else if (currentLen + paraLen > MOB_CHARS_PER_PAGE) {
            // 초과 → 새 페이지로
            pages.push(currentPage.join('\n'));
            currentPage = [para];
            currentLen = paraLen;
        } else {
            currentPage.push(para);
            currentLen += paraLen;
        }
    }
    if (currentPage.length > 0) pages.push(currentPage.join('\n'));

    // 3. 마커 복원
    return pages.map(page =>
        page.replace(new RegExp(`${BLOCK_MARKER}(\\d+)${BLOCK_MARKER}`, 'g'), (_, idx) => blocks[parseInt(idx)])
    );
}

function buildReaderPages() {
    const stage = document.getElementById('stage');
    stage.querySelectorAll('.book-page').forEach(p => p.remove());

    if (IS_MOBILE) {
        buildMobilePages(stage);
    } else {
        buildPCPages(stage);
    }

    buildTOC();
    if (IS_MOBILE) initMobile();
    else initPC();
}

function buildPCPages(stage) {
    TOTAL = bookState.chapters.length + 1;
    TITLES = [bookState.title, ...bookState.chapters.map(c => c.title)];

    const info = getDeviceCoverInfo();
    const rc = info.ratioMode === 'tablet' ? 'cover-ratio-tablet' : info.ratioMode === 'standard' ? 'cover-ratio-standard' : 'cover-ratio-webnovel';

    const coverDiv = document.createElement('div');
    coverDiv.className = 'book-page'; coverDiv.id = 'p0';
    coverDiv.innerHTML = `
        <div class="page-scroll" onscroll="handleReaderScroll(0,this)">
            <div class="cover-inner">
                <div class="cover-art-wrapper ${rc} cover-art-container-hook" style="display:${info.url?'block':'none'}">
                    <img src="${info.url||''}" alt="Cover" class="cover-art-img" onerror="this.parentElement.style.display='none';this.closest('.cover-inner').querySelector('.cover-ornament-fallback').style.display='block'">
                </div>
                <div class="cover-ornament cover-ornament-fallback" style="display:${info.url?'none':'block'}">❧</div>
                <h1 class="cover-title">${bookState.title}</h1>
                <p class="cover-sub">${bookState.description || '시놉시스가 없습니다.'}</p>
                <div class="cover-divider"></div>
                <p class="cover-author">${bookState.author} 지음</p>
            </div>
        </div>`;
    stage.insertBefore(coverDiv, canvas);

    bookState.chapters.forEach((ch, i) => {
        const pg = document.createElement('div');
        pg.className = 'book-page'; pg.id = `p${i+1}`;
        pg.innerHTML = `
            <div class="page-scroll" onscroll="handleReaderScroll(${i+1},this)">
                <div class="ch-header">
                    <div class="ch-number">제 ${i+1}화</div>
                    <h2 class="ch-title">${ch.title}</h2>
                    <div class="ch-dot">· · ·</div>
                </div>
                <div class="prose">
                    ${formatProse(ch.content)}
                    <div class="chapter-end-marker">— 제 ${i+1}화 끝 —</div>
                </div>
                <div class="page-foot">
                    <span class="pf-side">${bookState.title}</span>
                    <span class="pf-num">${i+1}</span>
                    <span class="pf-side">제 ${i+1}화</span>
                </div>
            </div>`;
        stage.insertBefore(pg, canvas);
    });

    bkPages = Array.from({length: TOTAL}, (_, i) => document.getElementById('p'+i));
}

// 모바일 전용: 챕터→페이지 분할 구조
// mobPages: [{chapterIdx, pageInChapter, totalInChapter, isFirst, isLast, content, hasMusicBlock}]
let mobPages = [];
let mobChapterMap = []; // chapterIdx → 시작 mobPage 인덱스

function buildMobilePages(stage) {
    mobPages = [];
    mobChapterMap = [];

    // 표지
    const info = getDeviceCoverInfo();
    const rc = info.ratioMode === 'webnovel' ? 'cover-ratio-webnovel' : 'cover-ratio-standard';
    const coverDiv = document.createElement('div');
    coverDiv.className = 'book-page'; coverDiv.id = 'mp0';
    coverDiv.innerHTML = `
        <div class="mob-cover-page">
            <div class="cover-art-wrapper ${rc} cover-art-container-hook" style="display:${info.url?'block':'none'};margin-bottom:24px;">
                <img src="${info.url||''}" alt="Cover" class="cover-art-img" onerror="this.parentElement.style.display='none'">
            </div>
            <div class="cover-ornament cover-ornament-fallback" style="display:${info.url?'none':'block'};font-size:32px;margin-bottom:24px;">❧</div>
            <h1 style="font-family:var(--serif);font-size:28px;font-weight:700;color:var(--ink);margin-bottom:12px;line-height:1.3;">${bookState.title}</h1>
            <p style="font-size:13px;color:var(--ink3);font-style:italic;margin-bottom:24px;line-height:1.7;">${bookState.description||''}</p>
            <div style="width:40px;height:1px;background:var(--accent2);margin:0 auto 16px;"></div>
            <p style="font-family:var(--sans);font-size:12px;color:var(--ink2);">${bookState.author} 지음</p>
            <p style="margin-top:40px;font-family:var(--sans);font-size:11px;color:var(--ink3);animation:pulse 2s ease-in-out infinite;">← 스와이프해서 읽기 →</p>
        </div>`;
    stage.insertBefore(coverDiv, canvas);
    mobPages.push({ chapterIdx: -1, pageInChapter: 0, totalInChapter: 1, isFirst: true, isLast: true, content: '', hasMusicBlock: false, domId: 'mp0' });

    let globalIdx = 1;
    bookState.chapters.forEach((ch, ci) => {
        mobChapterMap[ci] = globalIdx;
        const subPages = splitChapterIntoMobPages(ch.content);
        const total = subPages.length;
        TITLES = TITLES || [];

        subPages.forEach((pageContent, pi) => {
            const isFirst = pi === 0;
            const isLast = pi === total - 1;
            const hasMusicBlock = /\[(music|autoplay)=/.test(pageContent);
            const domId = `mp${globalIdx}`;

            const pg = document.createElement('div');
            pg.className = 'book-page'; pg.id = domId;

            const html = formatProse(pageContent);
            pg.innerHTML = `
                <div class="mob-page">
                    <div class="mob-page-header">
                        <div class="mob-page-chapter">제 ${ci+1}화</div>
                        <div class="mob-page-title">${ch.title}</div>
                    </div>
                    <div class="mob-page-body">
                        <div class="prose">${isFirst ? '' : ''}${html}${isLast ? '<div class="chapter-end-marker">— 제 '+(ci+1)+'화 끝 —</div>' : ''}</div>
                    </div>
                    <div class="mob-page-footer">
                        <span class="mob-page-num">${ci+1}화 · ${pi+1}/${total}</span>
                        <span class="mob-page-num">${bookState.title}</span>
                    </div>
                </div>`;
            stage.insertBefore(pg, canvas);

            mobPages.push({ chapterIdx: ci, pageInChapter: pi, totalInChapter: total, isFirst, isLast, content: pageContent, hasMusicBlock, domId });
            globalIdx++;
        });
    });

    TOTAL = mobPages.length;
    TITLES = ['표지', ...bookState.chapters.map(c => c.title)];
    bkPages = mobPages.map(mp => document.getElementById(mp.domId));
}

function rebuildMobileFont() {
    // 폰트 크기 바뀌면 모바일 페이지 재계산
    if (!IS_MOBILE) return;
    const stage = document.getElementById('stage');
    buildMobilePages(stage);
    buildTOC();
    // 현재 챕터 위치 복원
    const ci = mobPages[cur] ? mobPages[cur].chapterIdx : -1;
    if (ci >= 0 && mobChapterMap[ci] !== undefined) {
        cur = mobChapterMap[ci];
    } else {
        cur = 0;
    }
    layoutPages();
    mobDots.forEach((d, i) => d.classList.toggle('active', i === cur));
}

/* ════════════════════════════════════════════
   TOC
   ════════════════════════════════════════════ */
function buildTOC() {
    if (IS_MOBILE) {
        // 모바일: 챕터 단위 (표지 + 각 챕터 첫 페이지)
        const chapters = bookState.chapters;
        let items = `<button class="menu-item ${cur===0?'active':''}" onclick="mobGoToChapter(-1)">표지</button>`;
        chapters.forEach((ch, i) => {
            items += `<button class="menu-item" onclick="mobGoToChapter(${i})">${i+1}화 — ${ch.title}</button>`;
        });
        document.getElementById('mobTocContainer').innerHTML = items;
    } else {
        const items = TITLES.map((t, i) =>
            `<button class="toc-btn w-full text-left font-sans" onclick="goToPageWithState(${i})">
                <span class="toc-name">${i===0 ? '표지' : `${i}화 — ${t}`}</span>
            </button>`
        ).join('');
        document.getElementById('sbToc').innerHTML = items;
        document.getElementById('mobTocContainer').innerHTML = items;
    }
}

function mobGoToChapter(chapterIdx) {
    document.getElementById('menuOverlay').classList.remove('open');
    if (chapterIdx === -1) {
        mobCommit(0);
        return;
    }
    const startPage = mobChapterMap[chapterIdx];
    if (startPage !== undefined) mobCommit(startPage);
}

/* ════════════════════════════════════════════
   PC MODE INIT  ✅ 추가
   ════════════════════════════════════════════ */
function initPC() {
    document.getElementById('mobBottom').style.display = 'none';
    document.getElementById('pcBottom').style.display = 'flex';
    document.getElementById('sidebar').style.display = 'flex';
    document.getElementById('flipCanvas').style.display = 'none';

    // dots 재생성
    const dotsEl = document.getElementById('pcDots');
    dotsEl.innerHTML = ''; pcDots = [];
    bkPages.forEach((_, i) => {
        const d = document.createElement('button');
        d.className = 'pc-dot';
        d.addEventListener('click', () => pcCommit(i));
        dotsEl.appendChild(d); pcDots.push(d);
    });

    // 사이드바 토글
    document.getElementById('tbLeft').onclick = () => document.getElementById('sidebar').classList.toggle('collapsed');
    // Aa 버튼
    document.getElementById('tbRight').onclick = () => document.getElementById('sidebar').classList.toggle('collapsed');

    document.getElementById('pcFontUp').onclick = () => { if(fontSize<24){fontSize++;applyFont();} };
    document.getElementById('pcFontDown').onclick = () => { if(fontSize>13){fontSize--;applyFont();} };
    document.getElementById('mobFontUp').onclick = () => { if(fontSize<24){fontSize++;applyFont();} };
    document.getElementById('mobFontDown').onclick = () => { if(fontSize>13){fontSize--;applyFont();} };

    pcCommit(0);
}

/* ════════════════════════════════════════════
   MOBILE MODE INIT  ✅ 추가
   ════════════════════════════════════════════ */
let W = 0, H = 0, DPR = 1;
const canvas = document.getElementById('flipCanvas');
const ctx = canvas.getContext('2d');

function initMobile() {
    // 기존 reader-workspace 숨기기
    document.getElementById('reader-workspace').classList.add('hidden');
    // 모바일 전용 뷰어 활성화
    document.getElementById('mob-reader').classList.add('active');
    mobBuildReader();
}

/* ════════════════════════════════════════════
   MOBILE KAKAO-STYLE READER ENGINE
   ════════════════════════════════════════════ */
let mobSlides = [];       // 전체 슬라이드 데이터
let mobCurSlide = 0;      // 현재 슬라이드 인덱스
let mobChapMap = [];      // chapterIdx → slide 시작 인덱스
let mobUIVisible = false; // 상단/하단 UI 토글 상태
let mobSlideW = 0;        // 슬라이드 너비
let mobSlideH = 0;        // 슬라이드 높이
let mobFontSize = 17;     // 모바일 폰트 크기

// 터치 상태
let mobTouchStartX = 0;
let mobTouchStartY = 0;
let mobTouchDragging = false;
let mobTouchScrolling = false;

function mobBuildReader() {
    const strip = document.getElementById('mob-strip');
    if (!strip) { console.error('mob-strip not found'); return; }
    strip.innerHTML = '';
    mobSlides = [];
    mobChapMap = [];
    mobSlideW = window.innerWidth;
    mobSlideH = (window.visualViewport ? window.visualViewport.height : window.innerHeight);
    mobCurSlide = 0;

    // strip 너비 설정
    strip.style.width = 'max-content';

    // 표지 슬라이드
    const info = getDeviceCoverInfo();
    const coverSlide = document.createElement('div');
    coverSlide.className = 'mob-slide';
    coverSlide.style.width = mobSlideW + 'px';
    coverSlide.style.height = mobSlideH + 'px';

    const coverImgHtml = info.url
        ? `<div style="width:min(72vw,280px);aspect-ratio:10/16;border-radius:14px;overflow:hidden;box-shadow:0 20px 40px rgba(0,0,0,0.28);margin-bottom:28px;flex-shrink:0;"><img src="${info.url}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.style.display='none'"></div>`
        : `<div style="font-size:52px;margin-bottom:28px;color:var(--accent2)">❧</div>`;
    coverSlide.innerHTML = `
        <div class="mob-cover-slide">
            ${coverImgHtml}
            <h1 style="font-family:var(--serif);font-size:24px;font-weight:700;color:var(--ink);line-height:1.3;margin-bottom:10px;">${bookState.title}</h1>
            <p style="font-size:12px;color:var(--ink3);line-height:1.7;margin-bottom:20px;font-style:italic;max-width:260px;">${bookState.description || ''}</p>
            <div style="width:32px;height:1px;background:var(--accent2);margin:0 auto 14px;"></div>
            <p style="font-family:var(--sans);font-size:12px;color:var(--ink2);">${bookState.author} 지음</p>
            <p style="font-family:var(--sans);font-size:11px;color:var(--ink3);margin-top:28px;animation:pulse 2s ease-in-out infinite;">← 스와이프 →</p>
        </div>`;
    strip.appendChild(coverSlide);
    mobSlides.push({ type: 'cover', chapterIdx: -1, pageInChapter: 0, totalInChapter: 1, hasMusicBlock: false });

    // 챕터 슬라이드 생성
    bookState.chapters.forEach((ch, ci) => {
        mobChapMap[ci] = mobSlides.length;
        const subPages = splitChapterIntoMobPages(ch.content);
        const total = subPages.length;

        subPages.forEach((pageContent, pi) => {
            const isLast = pi === total - 1;
            const hasMusicBlock = /\[(music|autoplay)=/.test(pageContent);
            const htmlContent = mobFormatProse(pageContent, pi === 0);

            const slide = document.createElement('div');
            slide.className = 'mob-slide';
            slide.style.width = mobSlideW + 'px';
            slide.style.height = mobSlideH + 'px';

            slide.innerHTML = `<div class="mob-slide-text" style="font-size:${mobFontSize}px;">${htmlContent}${isLast ? '<div class="chapter-end-marker" style="font-size:0.8em;margin-top:1.5em!important;">— 제'+(ci+1)+'화 끝 —</div>' : ''}</div>`;
            strip.appendChild(slide);
            mobSlides.push({ type: 'chapter', chapterIdx: ci, pageInChapter: pi, totalInChapter: total, hasMusicBlock, chapterTitle: ch.title });
        });
    });

    // 이벤트 연결
    mobSetupEvents();
    mobBuildToc();
    mobBuildChDots();
    mobGoToSlide(0, false);
    mobRestoreBookmark();
    // 볼륨 슬라이더 동기화
    const mobVSlider = document.getElementById('mob-volume-slider');
    if (mobVSlider) mobVSlider.value = currentVolume;
    document.getElementById('mob-font-val').textContent = mobFontSize;
    document.getElementById('mob-font-slider').value = mobFontSize;
}

// 모바일 전용 prose 포맷 (드롭캡 없음, left align)
function mobFormatProse(rawContent, isFirstPage) {
    // parseSpecialBlocks 재사용
    let content = parseSpecialBlocks(rawContent.replace(/\r/g, ''));
    const lines = content.split('\n');
    const out = [];
    let firstPara = true;

    for (let i = 0; i < lines.length; i++) {
        const p = lines[i], t = p.trim();
        if (t === '[[transition]]') {
            const si = i; i++;
            const bl = [];
            while (i < lines.length && lines[i].trim() !== '[[/transition]]') { bl.push(lines[i]); i++; }
            out.push(`<div class="transition-block"><span>${bl.map(l => sanitizeAndFormatBold(l)).join('<br>')}</span></div>`);
            continue;
        }
        if (p.startsWith('<div') || p.startsWith('</div') || p.startsWith('<a')) { out.push(p); continue; }
        if (t === '***' || t === '* * *') { out.push(`<div class="scene-asterisk">❧&nbsp;&nbsp;❧&nbsp;&nbsp;❧</div>`); continue; }
        if (t === '<...>' || t === '<…>') { out.push(`<div class="scene-dots"><span style="font-size:5px;line-height:1">●</span><span style="font-size:9px;line-height:1">●</span><span style="font-size:14px;line-height:1">●</span><span style="font-size:9px;line-height:1">●</span><span style="font-size:5px;line-height:1">●</span></div>`); continue; }
        if (t === '-----') { out.push(`<div class="scene-long-line"></div>`); continue; }
        if (t === '=====') { out.push(`<div class="scene-double-line"></div>`); continue; }
        if (t === '') { out.push(`<p style="height:0.6em;margin:0;">&nbsp;</p>`); continue; }
        // 모바일: 드롭캡 없이 그냥 p
        out.push(`<p>${sanitizeAndFormatBold(p)}</p>`);
        firstPara = false;
    }
    return out.filter(Boolean).join('');
}

function mobSetupEvents() {
    const strip = document.getElementById('mob-strip');
    if (!strip) return;

    // 기존 오버레이 제거
    const old = document.getElementById('mob-touch-overlay');
    if (old) old.remove();

    let startX = 0, startY = 0, dragging = false, locked = false;

    strip.addEventListener('touchstart', e => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        dragging = false;
        locked = false;
        strip.style.transition = 'none';
    }, { passive: true });

    strip.addEventListener('touchmove', e => {
        if (locked) return;
        const dx = e.touches[0].clientX - startX;
        const dy = e.touches[0].clientY - startY;
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        if (!dragging) {
            if (Math.abs(dy) >= Math.abs(dx)) { locked = true; return; }
            dragging = true;
        }
        e.preventDefault();
        strip.style.transform = `translateX(${-mobCurSlide * mobSlideW + dx}px)`;
    }, { passive: false });

    strip.addEventListener('touchend', e => {
        const ex = e.changedTouches[0].clientX;
        const ey = e.changedTouches[0].clientY;
        const dx = ex - startX;
        const dy = ey - startY;
        const dist = Math.sqrt(dx*dx + dy*dy);

        if (!dragging) {
            // 탭: 이동 거리 작고, UI 바 아닌 곳
            if (dist < 12 && !e.target.closest('#mob-topbar') && !e.target.closest('#mob-bottombar') && !e.target.closest('#mob-toc-sheet') && !e.target.closest('button') && !e.target.closest('input')) {
                mobToggleUI();
            }
            strip.style.transition = 'transform 0.22s ease-out';
            strip.style.transform = `translateX(${-mobCurSlide * mobSlideW}px)`;
            return;
        }

        if (dx < -50 && mobCurSlide < mobSlides.length - 1) {
            mobGoToSlide(mobCurSlide + 1);
        } else if (dx > 50 && mobCurSlide > 0) {
            mobGoToSlide(mobCurSlide - 1);
        } else {
            strip.style.transition = 'transform 0.22s ease-out';
            strip.style.transform = `translateX(${-mobCurSlide * mobSlideW}px)`;
        }
    }, { passive: true });

    window.addEventListener('resize', () => {
        mobSlideW = window.innerWidth;
        mobSlideH = (window.visualViewport ? window.visualViewport.height : window.innerHeight);
        document.querySelectorAll('.mob-slide').forEach(s => {
            s.style.width = mobSlideW + 'px';
            s.style.height = mobSlideH + 'px';
        });
        strip.style.transition = 'none';
        strip.style.transform = `translateX(${-mobCurSlide * mobSlideW}px)`;
    });
}
function mobGoToSlide(idx) {
    if (idx < 0 || idx >= mobSlides.length) return;
    resetMusicButtons();
    mobCurSlide = idx;
    const strip = document.getElementById('mob-strip');
    strip.style.transition = 'transform 0.22s ease-out';
    strip.style.transform = `translateX(${-idx * mobSlideW}px)`;

    const slide = mobSlides[idx];
    mobUpdateUI(slide);
    if (slide.chapterIdx >= 0) saveBookmark(idx, 0);

    setTimeout(() => {
        if (slide.hasMusicBlock && !currentPlayingMusicId) {
            const slides = document.querySelectorAll('.mob-slide');
            if (slides[idx]) { const ml = slides[idx].querySelector('.music-link'); if (ml) ml.click(); }
        }
    }, 300);
}

function mobUpdateUI(slide) {
    const ci = slide.chapterIdx;
    const isCover = slide.type === 'cover';

    // 상단: 제목
    const titleEl = document.getElementById('mob-tb-title');
    if (titleEl) titleEl.textContent = isCover ? bookState.title : `${ci + 1}화 — ${slide.chapterTitle}`;

    // 상단: 챕터 라벨 + 프로그레스
    const chLabel = document.getElementById('mob-ch-label');
    const chFill = document.getElementById('mob-ch-fill');
    if (isCover) {
        if (chLabel) chLabel.textContent = '표지';
        if (chFill) chFill.style.width = '0%';
    } else {
        const total = bookState.chapters.length;
        const pct = total > 0 ? Math.round(((ci + 1) / total) * 100) : 0;
        if (chLabel) chLabel.textContent = `${ci + 1}화 / 전체 ${total}화`;
        if (chFill) chFill.style.width = pct + '%';
    }

    // 상단: 챕터 이전/다음
    const prevCh = document.getElementById('mob-prev-ch');
    const nextCh = document.getElementById('mob-next-ch');
    if (prevCh) prevCh.disabled = ci < 0;
    if (nextCh) nextCh.disabled = ci >= bookState.chapters.length - 1;

    // 하단: 페이지 라벨 + 프로그레스
    const pageLabel = document.getElementById('mob-page-label');
    const pageFill = document.getElementById('mob-page-fill');
    const prevPg = document.getElementById('mob-prev-page');
    const nextPg = document.getElementById('mob-next-page');

    if (isCover) {
        if (pageLabel) pageLabel.textContent = '';
        if (pageFill) pageFill.style.width = '0%';
        if (prevPg) prevPg.disabled = true;
        if (nextPg) nextPg.disabled = mobSlides.length <= 1;
    } else {
        const pi = slide.pageInChapter;
        const total = slide.totalInChapter;
        const pct = total > 1 ? Math.round((pi / (total - 1)) * 100) : 100;
        if (pageLabel) pageLabel.textContent = `${pi + 1} / ${total}`;
        if (pageFill) pageFill.style.width = pct + '%';
        if (prevPg) prevPg.disabled = mobCurSlide <= 0;
        if (nextPg) nextPg.disabled = mobCurSlide >= mobSlides.length - 1;
    }

    // 목차 활성
    document.querySelectorAll('.mob-toc-item').forEach((el, i) => {
        el.classList.toggle('active', i === ci + 1);
    });

    // 볼륨 아이콘 동기화
    const mobVIcon = document.getElementById('mob-volume-icon');
    if (mobVIcon) {
        mobVIcon.className = 'fa-solid cursor-pointer text-xs';
        mobVIcon.classList.add(currentVolume === 0 || isMuted ? 'fa-volume-xmark' : 'fa-volume-low');
    }
    const mobPlayBtn = document.getElementById('mob-play-btn');
    if (mobPlayBtn) updateMasterPlayPauseIcon(!!currentPlayingMusicId);
}

function mobToggleUI() {
    mobUIVisible = !mobUIVisible;
    document.getElementById('mob-topbar').classList.toggle('visible', mobUIVisible);
    document.getElementById('mob-bottombar').classList.toggle('visible', mobUIVisible);
}

function mobPrevChapter() {
    const ci = mobSlides[mobCurSlide].chapterIdx;
    if (ci <= 0) { mobGoToSlide(0); return; }
    const target = mobChapMap[ci - 1];
    if (target !== undefined) mobGoToSlide(target);
}

function mobNextChapter() {
    const ci = mobSlides[mobCurSlide].chapterIdx;
    const next = ci + 1;
    if (next < bookState.chapters.length) {
        const target = mobChapMap[next];
        if (target !== undefined) mobGoToSlide(target);
    }
}

function mobBuildToc() {
    const list = document.getElementById('mob-toc-list');
    if (!list) return;
    let html = `<button class="mob-toc-item" onclick="mobGoToSlide(0);mobTocClose()">표지</button>`;
    bookState.chapters.forEach((ch, i) => {
        html += `<button class="mob-toc-item" onclick="mobGoToSlide(${mobChapMap[i]});mobTocClose()">${i+1}화 — ${ch.title}</button>`;
    });
    list.innerHTML = html;
}

function mobBuildChDots() {
    const el = document.getElementById('mob-ch-dots');
    if (!el) return; // HTML에 없으면 무시
    const count = bookState.chapters.length + 1;
    if (count > 12) { el.style.display = 'none'; return; }
    el.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const d = document.createElement('button');
        d.className = 'mob-ch-dot';
        d.onclick = () => { if (i === 0) mobGoToSlide(0); else if (mobChapMap[i-1] !== undefined) mobGoToSlide(mobChapMap[i-1]); };
        el.appendChild(d);
    }
}

function mobTocOpen() { document.getElementById('mob-toc-sheet').classList.add('open'); }
function mobTocClose() { document.getElementById('mob-toc-sheet').classList.remove('open'); }

function mobSetFont(val) {
    mobFontSize = parseInt(val);
    document.getElementById('mob-font-val').textContent = mobFontSize;
    document.querySelectorAll('.mob-slide-text').forEach(el => el.style.fontSize = mobFontSize + 'px');
    // 폰트 바뀌면 페이지 재분할
    const curCi = mobSlides[mobCurSlide] ? mobSlides[mobCurSlide].chapterIdx : -1;
    mobBuildReader();
    // 같은 챕터 첫 페이지로
    if (curCi >= 0 && mobChapMap[curCi] !== undefined) mobGoToSlide(mobChapMap[curCi], false);
    else mobGoToSlide(0, false);
}

function mobRestoreBookmark() {
    const saved = localStorage.getItem(`newtokkinam_bookmark_${bookmarkState.activeBookId}`);
    if (!saved) return;
    try {
        const p = JSON.parse(saved);
        const ci = p.chapterIdx !== undefined ? p.chapterIdx : (p.pageIdx > 0 ? p.pageIdx - 1 : -1);
        if (ci >= 0 && ci < bookState.chapters.length && mobChapMap[ci] !== undefined) {
            const infoEl = document.getElementById('bookmark-info-text');
            if (infoEl) infoEl.innerHTML = `이전에 감상하시던 <strong>${ci+1}화 — ${bookState.chapters[ci].title}</strong>가 있습니다. 이어서 읽으시겠습니까?`;
            bookmarkState.savedPageIndex = mobChapMap[ci];
            const modal = document.getElementById('modal-bookmark');
            if (modal) modal.classList.remove('hidden');
        }
    } catch(e) {}
}

function resizeMob() {
    DPR = devicePixelRatio || 1;
    W = document.getElementById('stage').offsetWidth;
    H = document.getElementById('stage').offsetHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    layoutPages();
}

/* ════════════════════════════════════════════
   PAGE LAYOUT
   ════════════════════════════════════════════ */
function layoutPages() {
    bkPages.forEach((p, i) => { if(p) p.style.zIndex = i === cur ? 10 : (i < cur ? 5 : 2); });
}

/* ════════════════════════════════════════════
   PC COMMIT
   ════════════════════════════════════════════ */
function pcCommit(idx) {
    if (idx < 0 || idx >= TOTAL) return;
    resetMusicButtons();
    if (ytAudioPlayer && ytAudioPlayer.stopVideo) ytAudioPlayer.stopVideo();
    cur = idx;
    layoutPages();

    document.getElementById('pcPrev').disabled = cur === 0;
    document.getElementById('pcNext').disabled = cur === TOTAL - 1;
    const mp = document.getElementById('mobPrev'), mn = document.getElementById('mobNext');
    if (mp) mp.disabled = cur === 0;
    if (mn) mn.disabled = cur === TOTAL - 1;

    const tbTitle = document.getElementById('tbTitle');
    if (tbTitle) {
        tbTitle.innerHTML = cur === 0
            ? `뉴토끼남 뷰어 — <span style="color:var(--accent);font-weight:700;">표지</span>`
            : `<span style="color:var(--accent);font-weight:700;font-family:var(--sans)">${cur}화</span> / 전체 ${TOTAL-1}화 — <span style="font-family:var(--serif)">${TITLES[cur]}</span>`;
    }

    document.getElementById('sbFill').style.width = '0%';
    document.getElementById('sbText').textContent = cur === 0 ? '표지' : `제 ${cur}화`;

    const pf = document.getElementById('reader-top-progress-fill');
    const pl = document.getElementById('reader-top-progress-label');
    if (pf) pf.style.width = '0%';
    if (pl) pl.textContent = cur === 0 ? '표지' : '0%';

    pcDots.forEach((d, i) => d.classList.toggle('active', i === cur));
    document.querySelectorAll('#sbToc .toc-btn').forEach((b, i) => b.classList.toggle('active', i === cur));
    document.querySelectorAll('#mobTocContainer .toc-btn').forEach((b, i) => b.classList.toggle('active', i === cur));

    const activePage = document.getElementById(`p${cur}`);
    if (activePage) {
        const scroller = activePage.querySelector('.page-scroll');
        if (scroller) { scroller.scrollTop = 0; }
        const prog = document.getElementById('page-top-scroll-progress');
        if (prog) prog.style.width = '0%';
    }
    if (!bookmarkState.isRestoring && cur > 0) saveBookmark(cur, 0);
    setTimeout(() => triggerAutoplay(cur), 100);
}

/* ════════════════════════════════════════════
   MOBILE COMMIT
   ════════════════════════════════════════════ */
function mobCommit(idx) {
    if (idx < 0 || idx >= TOTAL) return;
    resetMusicButtons();
    cur = idx;
    layoutPages();
    mobDots.forEach((d, i) => d.classList.toggle('active', i === cur));
    document.getElementById('mobPrev').disabled = cur === 0;
    document.getElementById('mobNext').disabled = cur === TOTAL - 1;
    const tbTitle = document.getElementById('tbTitle');
    // 모바일: 현재 챕터명 표시
    if (IS_MOBILE && mobPages[cur]) {
        const mp = mobPages[cur];
        if (mp.chapterIdx >= 0) {
            const ch = bookState.chapters[mp.chapterIdx];
            if (tbTitle) tbTitle.textContent = `${mp.chapterIdx+1}화 · ${mp.pageInChapter+1}/${mp.totalInChapter}`;
        } else {
            if (tbTitle) tbTitle.textContent = bookState.title;
        }
    } else {
        if (tbTitle) tbTitle.textContent = TITLES[cur] || '';
    }
    if (!bookmarkState.isRestoring && cur > 0) saveBookmark(cur, 0);
    // 모바일: 해당 페이지에 music 블록 있으면 자동재생
    if (IS_MOBILE) {
        setTimeout(() => {
            if (!currentPlayingMusicId) {
                const page = bkPages[cur];
                if (!page) return;
                const musicLink = page.querySelector('.music-link');
                if (musicLink) musicLink.click();
            }
        }, 150);
    } else {
        setTimeout(() => triggerAutoplay(cur), 100);
    }
}

function triggerAutoplay(pageIdx) {
    if (pageIdx === 0) return;
    const page = document.getElementById(`p${pageIdx}`);
    if (!page) return;
    const autoBtn = page.querySelector('.music-link[data-autoplay="true"]');
    if (!autoBtn) return;
    if (currentPlayingMusicId) return;
    autoBtn.click();
}

function navigateToAdjacentChapter(dir) {
    const t = cur + dir;
    if (t >= 0 && t < TOTAL) pcCommit(t);
}

function goToPageWithState(idx) {
    if (!bookmarkState.isRestoring) saveBookmark(idx, 0);
    if (IS_MOBILE) { document.getElementById('menuOverlay').classList.remove('open'); triggerFlip(idx); }
    else pcCommit(idx);
}

/* ════════════════════════════════════════════
   PAGE CURL ENGINE  ✅ 추가
   ════════════════════════════════════════════ */
function isDark() { return window.matchMedia('(prefers-color-scheme:dark)').matches; }
function paperFront() { return isDark() ? '#211e17' : '#fdfaf3'; }
function paperBack()  { return isDark() ? '#1c1912' : '#ede5d0'; }

function drawCurl(fX, fY) {
    ctx.clearRect(0, 0, W, H);
    const origX = st.dir === 1 ? W : 0, origY = st.grabY;
    const midX = (origX+fX)/2, midY = (origY+fY)/2;
    const dx = fX-origX, dy = fY-origY, len = Math.sqrt(dx*dx+dy*dy)||0.001;
    const nx = dx/len, ny = dy/len;
    function sd(x,y){return nx*(x-midX)+ny*(y-midY);}
    function clip(poly){
        let r=[];
        for(let i=0;i<poly.length;i++){
            const a=poly[i],b=poly[(i+1)%poly.length],sa=sd(a.x,a.y),sb=sd(b.x,b.y);
            if(sa>=0)r.push(a);
            if((sa>0&&sb<0)||(sa<0&&sb>0)){const t=sa/(sa-sb);r.push({x:a.x+t*(b.x-a.x),y:a.y+t*(b.y-a.y)});}
        }
        return r;
    }
    const peel=clip([{x:0,y:0},{x:W,y:0},{x:W,y:H},{x:0,y:H}]);
    if(peel.length<2)return;
    const fp=peel.filter(p=>Math.abs(sd(p.x,p.y))<0.5);
    if(fp.length>=2){
        const f0=fp[0],f1=fp[fp.length-1],sw=Math.min(60,len*0.4);
        const g=ctx.createLinearGradient(f0.x,f0.y,f0.x-nx*sw,f0.y-ny*sw);
        g.addColorStop(0,isDark()?'rgba(0,0,0,0.55)':'rgba(40,20,5,0.28)');g.addColorStop(1,'rgba(0,0,0,0)');
        ctx.save();ctx.beginPath();ctx.moveTo(f0.x,f0.y);ctx.lineTo(f1.x,f1.y);ctx.lineTo(f1.x-nx*sw,f1.y-ny*sw);ctx.lineTo(f0.x-nx*sw,f0.y-ny*sw);ctx.closePath();ctx.fillStyle=g;ctx.fill();ctx.restore();
    }
    ctx.save();ctx.beginPath();peel.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));ctx.closePath();ctx.fillStyle=paperFront();ctx.fill();ctx.restore();
    function ref(p){const d=sd(p.x,p.y);return{x:p.x-2*d*nx,y:p.y-2*d*ny};}
    function clipPg(poly){
        let r=poly;
        for(const c of [{nx:1,ny:0,d:0},{nx:-1,ny:0,d:-W},{nx:0,ny:1,d:0},{nx:0,ny:-1,d:-H}]){
            const next=[];
            for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length],sa=c.nx*a.x+c.ny*a.y+c.d,sb=c.nx*b.x+c.ny*b.y+c.d;if(sa>=0)next.push(a);if((sa>0&&sb<0)||(sa<0&&sb>0)){const t=sa/(sa-sb);next.push({x:a.x+t*(b.x-a.x),y:a.y+t*(b.y-a.y)});}}
            r=next;if(!r.length)break;
        }
        return r;
    }
    const back=clipPg(peel.map(ref));
    if(back.length>=3){
        ctx.save();ctx.beginPath();back.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));ctx.closePath();ctx.fillStyle=paperBack();ctx.fill();
        if(fp.length>=2){const rf=ref(fp[0]);const bg=ctx.createLinearGradient(rf.x,rf.y,rf.x-nx*50,rf.y-ny*50);bg.addColorStop(0,isDark()?'rgba(0,0,0,0.55)':'rgba(40,15,0,0.32)');bg.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=bg;ctx.fill();}
        ctx.restore();
    }
    if(fp.length>=2){ctx.save();ctx.beginPath();ctx.moveTo(fp[0].x,fp[0].y);ctx.lineTo(fp[fp.length-1].x,fp[fp.length-1].y);ctx.strokeStyle=isDark()?'rgba(255,255,255,0.06)':'rgba(255,255,255,0.55)';ctx.lineWidth=1.5;ctx.stroke();ctx.restore();}
}

function easeIO(t){return t<0.5?2*t*t:-1+(4-2*t)*t;}

function tick(now){
    if(st.phase==='idle')return;
    if(st.phase==='dragging'){drawCurl(st.curX,st.curY);requestAnimationFrame(tick);return;}
    if(st.phase==='releasing'){
        const t=Math.min((now-st.startTime)/st.duration,1),et=easeIO(t);
        drawCurl(st.fromX+(st.targetX-st.fromX)*et,st.fromY+(st.targetY-st.fromY)*et);
        if(t<1){requestAnimationFrame(tick);return;}
        if(st.completing)mobCommit(st.targetIdx);else layoutPages();
        ctx.clearRect(0,0,W,H);st.phase='idle';flipping=false;
    }
}

function startDrag(x,y){
    if(flipping)return false;
    const dir=x>W/2?1:-1,tIdx=cur+dir;
    if(tIdx<0||tIdx>=TOTAL)return false;
    flipping=true;st.phase='dragging';st.dir=dir;st.grabX=x;st.grabY=y;st.curX=x;st.curY=y;st.targetIdx=tIdx;
    if(dir===1){bkPages[tIdx].style.zIndex=8;bkPages[cur].style.zIndex=10;}else{bkPages[tIdx].style.zIndex=12;bkPages[cur].style.zIndex=10;}
    requestAnimationFrame(tick);return true;
}
function moveDrag(x,y){if(st.phase==='dragging'){st.curX=x;st.curY=y;}}
function endDrag(x,y){
    if(st.phase!=='dragging')return;
    const origX=st.dir===1?W:0,traveled=(origX-x)*st.dir;
    st.fromX=x;st.fromY=y;st.phase='releasing';st.startTime=performance.now();
    if(traveled>W*0.28){st.targetX=st.dir===1?-W*0.5:W*1.5;st.targetY=y;st.duration=340;st.completing=true;}
    else{st.targetX=origX;st.targetY=st.grabY;st.duration=260;st.completing=false;layoutPages();}
    requestAnimationFrame(tick);
}
function triggerFlip(tIdx){
    if(flipping||tIdx===cur||tIdx<0||tIdx>=TOTAL)return;
    const dir=tIdx>cur?1:-1,gX=dir===1?W-1:1,gY=H/2;
    flipping=true;st.phase='releasing';st.dir=dir;st.grabX=gX;st.grabY=gY;st.targetIdx=tIdx;
    if(dir===1){bkPages[tIdx].style.zIndex=8;bkPages[cur].style.zIndex=10;}else{bkPages[tIdx].style.zIndex=12;bkPages[cur].style.zIndex=10;}
    st.fromX=gX;st.fromY=gY;st.startTime=performance.now();
    st.targetX=dir===1?-W*0.5:W*1.5;st.targetY=gY;st.duration=480;st.completing=true;
    requestAnimationFrame(tick);
}

/* ════════════════════════════════════════════
   FONT
   ════════════════════════════════════════════ */
function applyFont() {
    fontSize = Math.max(13, Math.min(24, fontSize));
    document.querySelectorAll('.prose').forEach(el=>el.style.fontSize=fontSize+'px');
    document.getElementById('pcFontVal').textContent=fontSize;
    document.getElementById('mobFontVal').textContent=fontSize;
    if (IS_MOBILE) {
        // 폰트 크기 바뀌면 페이지 재분할
        rebuildMobileFont();
    } else {
        const prev={page:bookmarkState.savedPageIndex,para:bookmarkState.savedParagraphIndex};
        if(prev.page>0&&!bookmarkState.isRestoring) restoreReadingPosition(prev.page,prev.para);
    }
}

/* ════════════════════════════════════════════
   SCROLL & BOOKMARK
   ════════════════════════════════════════════ */
function handleReaderScroll(pageIdx, sc) {
    if(IS_MOBILE)return; // 모바일은 가로 페이지
    if(bookmarkState.isRestoring)return;
    const sh=sc.scrollHeight-sc.clientHeight, st_=sc.scrollTop;
    const pct=sh>0?(st_/sh)*100:0;
    const prog=document.getElementById('page-top-scroll-progress');
    if(prog)prog.style.width=`${pct}%`;

    if(sh>0&&(sh-st_)<=60&&currentPlayingMusicId){
        resetMusicButtons();
        if(ytAudioPlayer&&ytAudioPlayer.stopVideo)ytAudioPlayer.stopVideo();
        showToast('배경음악을 자동 정지합니다.','info');
    }

    if(pageIdx===0){return;}

    // 음악 자동 재생
    sc.querySelectorAll('.music-block').forEach(block=>{
        const br=block.getBoundingClientRect(),cr=sc.getBoundingClientRect();
        if(Math.abs((br.top+br.height/2)-(cr.top+cr.height/2))<150){
            const ml=block.querySelector('.music-link');
            if(ml&&!ml.classList.contains('playing')){
                const m=(ml.getAttribute('onclick')||'').match(/togglePlayMusic\('(.*?)'/);
                if(m){const tid=extractSunoId(m[1])||extractVideoId(m[1]);if(currentPlayingMusicId!==tid)togglePlayMusic(m[1],ml);}
            }
        }
    });

    // 문단 추적
    const paras=sc.querySelectorAll('[data-para-idx]');
    const top=sc.getBoundingClientRect().top+15;
    let activeIdx=0;
    for(const p of paras){if(p.getBoundingClientRect().bottom>=top){activeIdx=parseInt(p.getAttribute('data-para-idx'))||0;break;}}
    saveBookmark(pageIdx,activeIdx);

    const fill=Math.round(pct);
    document.getElementById('sbFill').style.width=`${fill}%`;
    document.getElementById('sbText').textContent=`제 ${pageIdx}화 — ${fill}%`;
    const pf=document.getElementById('reader-top-progress-fill'),pl=document.getElementById('reader-top-progress-label');
    if(pf)pf.style.width=`${pct}%`;
    if(pl)pl.textContent=`${fill}% 감상 완료`;
}

function saveBookmark(pageIdx,paraIdx){
    bookmarkState.savedPageIndex=pageIdx;bookmarkState.savedParagraphIndex=paraIdx;
    try{
        let extra = {};
        if(IS_MOBILE && mobPages[pageIdx]){
            extra.chapterIdx = mobPages[pageIdx].chapterIdx;
        }
        localStorage.setItem(`newtokkinam_bookmark_${bookmarkState.activeBookId}`,JSON.stringify({pageIdx,paraIdx,...extra,savedAt:Date.now()}));
    }catch(e){}
}

function checkAndTriggerBookmark(){
    const saved=localStorage.getItem(`newtokkinam_bookmark_${bookmarkState.activeBookId}`);
    if(saved){
        try{
            const p=JSON.parse(saved);
            if(IS_MOBILE){
                // 모바일: chapterIdx 기반 복원
                const ci = p.chapterIdx !== undefined ? p.chapterIdx : (p.pageIdx > 0 ? p.pageIdx - 1 : -1);
                if(ci >= 0 && ci < bookState.chapters.length){
                    bookmarkState.savedPageIndex = mobChapterMap[ci] || 0;
                    const info=document.getElementById('bookmark-info-text');
                    if(info)info.innerHTML=`이전에 감상하시던 <strong>${ci+1}화 — ${bookState.chapters[ci].title}</strong>가 있습니다. 이어서 읽으시겠습니까?`;
                    document.getElementById('modal-bookmark').classList.remove('hidden');
                    return;
                }
            } else {
                if(p.pageIdx>0&&p.pageIdx<TOTAL){
                    bookmarkState.savedPageIndex=p.pageIdx;bookmarkState.savedParagraphIndex=p.paraIdx;
                    const info=document.getElementById('bookmark-info-text');
                    if(info)info.innerHTML=`이전에 감상하시던 <strong>제 ${p.pageIdx}화 — ${TITLES[p.pageIdx]}</strong> 지점이 있습니다. 이어서 읽으시겠습니까?`;
                    document.getElementById('modal-bookmark').classList.remove('hidden');
                    return;
                }
            }
        }catch(e){}
    }
    IS_MOBILE?mobCommit(0):pcCommit(0);
}

function closeBookmarkModal(restore){
    document.getElementById('modal-bookmark').classList.add('hidden');
    if(IS_MOBILE){
        if(restore && bookmarkState.savedPageIndex > 0){
            mobGoToSlide(bookmarkState.savedPageIndex, false);
        } else {
            mobGoToSlide(0, false);
        }
    } else {
        if(restore){restoreReadingPosition(bookmarkState.savedPageIndex,bookmarkState.savedParagraphIndex);}
        else{pcCommit(0);}
    }
}

function restoreReadingPosition(pageIdx,paraIdx){
    bookmarkState.isRestoring=true;
    IS_MOBILE?mobCommit(pageIdx):pcCommit(pageIdx);
    const page=document.getElementById(`p${pageIdx}`);
    if(!page){bookmarkState.isRestoring=false;return;}
    const sc=page.querySelector('.page-scroll');
    if(!sc){bookmarkState.isRestoring=false;return;}
    setTimeout(()=>{
        const target=sc.querySelector(`[data-para-idx="${paraIdx}"]`);
        if(target){
            const diff=target.getBoundingClientRect().top-sc.getBoundingClientRect().top;
            sc.scrollTop+=diff;
            target.classList.add('bookmark-anchor-highlight');
            setTimeout(()=>target.classList.remove('bookmark-anchor-highlight'),1800);
        }
        setTimeout(()=>bookmarkState.isRestoring=false,80);
    },200);
}

/* ════════════════════════════════════════════
   CLOUD
   ════════════════════════════════════════════ */
async function saveToCloud(){
    // 연결 안 됐으면 한 번 더 시도
    if(!isFirebaseConnected){
        showToast('클라우드 재연결 중...','info');
        await loadConfigAndInitialize();
    }
    if(!isFirebaseConnected)return showToast('클라우드 연결 실패. Firebase 익명인증이 켜져 있는지 확인해 주세요.','error');
    if(!bookState.chapters.length)return showToast('회차를 등록해주세요.','error');
    showToast('저장 중...','info');
    try{
        const payload={title:bookState.title,author:bookState.author,description:bookState.description,coverUrlWebnovel:bookState.coverUrlWebnovel||'',coverUrlTablet:bookState.coverUrlTablet||'',coverUrlStandard:bookState.coverUrlStandard||'',chapters:bookState.chapters,lastUpdated:Date.now()};
        let bookId=localStorage.getItem('newtokkinam_cloud_id');
        if(bookId){await db.collection('novels').doc(bookId).set(payload);}
        else{const doc=await db.collection('novels').add(payload);bookId=doc.id;localStorage.setItem('newtokkinam_cloud_id',bookId);}
        const url=`${location.origin}${location.pathname}?id=${bookId}`;
        document.getElementById('share-link-input').value=url;
        document.getElementById('modal-share').classList.remove('hidden');
        showToast('저장 완료!');
    }catch(e){
        showToast('저장 실패: '+e.message,'error');
    }
}

async function loadBookFromCloud(id){
    if(!isFirebaseConnected){ showToast('클라우드 연결 실패. 새로고침 해주세요.','error'); return; }
    try{
        const doc=await db.collection('novels').doc(id).get();
        if(doc.exists){
            const data = doc.data();
            bookState.title = data.title || '제목 없음';
            bookState.author = data.author || '작가 미상';
            bookState.description = data.description || '';
            bookState.coverUrlWebnovel = data.coverUrlWebnovel || '';
            bookState.coverUrlTablet = data.coverUrlTablet || '';
            bookState.coverUrlStandard = data.coverUrlStandard || '';
            bookState.chapters = data.chapters || [];
            localStorage.setItem('newtokkinam_cloud_id', id);
            // 사이드바만 업데이트 (updateBookInfo 호출 금지 — input 값으로 덮어씌움)
            const titleEl = document.getElementById('sb-book-title-el');
            const authorEl = document.getElementById('sb-book-author-el');
            if(titleEl) titleEl.textContent = bookState.title;
            if(authorEl) authorEl.textContent = bookState.author + ' 지음';
            const il = document.getElementById('init-loader');
            if (il) il.remove();
            const cl = document.getElementById('cloud-loader');
            if (cl) cl.remove();
            renderChapters();
            switchViewMode('reader');
            switchViewMode('reader');
            showToast(`"${bookState.title}" 로드 완료.`);
        }else{showToast('존재하지 않는 소설입니다.','error');}
    }catch(e){showToast('로드 실패: '+e.message,'error');}
}

/* ════════════════════════════════════════════
   BGM (YouTube + Suno)
   ════════════════════════════════════════════ */
function onYouTubeIframeAPIReady(){
    ytAudioPlayer=new YT.Player('yt-audio-player',{height:'0',width:'0',videoId:'',playerVars:{autoplay:0,controls:0,disablekb:1,fs:0,rel:0,iv_load_policy:3},events:{onStateChange:onPlayerStateChange,onReady:e=>e.target.setVolume(currentVolume)}});
}
function onPlayerStateChange(e){if(e.data===YT.PlayerState.ENDED)resetMusicButtons();}

function resetMusicButtons(){
    document.querySelectorAll('.music-link').forEach(btn=>{btn.classList.remove('playing');const i=btn.querySelector('.fa-compact-disc');if(i)i.classList.remove('fa-spin');});
    if(sunoAudioObject){sunoAudioObject.pause();sunoAudioObject=null;}
    currentPlayingMusicId=null;currentPlayingBtn=null;currentPlayingType=null;
    updateMasterPlayPauseIcon(false);
}

function changeVolume(val){
    currentVolume=parseInt(val);isMuted=(currentVolume===0);updateVolumeIcon();
    if(ytAudioPlayer&&ytAudioPlayer.setVolume)ytAudioPlayer.setVolume(currentVolume);
    if(sunoAudioObject)sunoAudioObject.volume=currentVolume/100;
}
function updateVolumeIcon(){
    const mobVIcon = document.getElementById('mob-volume-icon');
    if (mobVIcon) {
        mobVIcon.className = 'fa-solid cursor-pointer text-xs';
        mobVIcon.classList.add(currentVolume===0||isMuted?'fa-volume-xmark':currentVolume<40?'fa-volume-off':currentVolume<75?'fa-volume-low':'fa-volume-high');
    }
    const mobSlider = document.getElementById('mob-volume-slider');
    if (mobSlider) mobSlider.value = currentVolume;
    const icon=document.getElementById('volume-icon');if(!icon)return;
    icon.className='fa-solid cursor-pointer text-xs';
    icon.classList.add(currentVolume===0||isMuted?'fa-volume-xmark':currentVolume<40?'fa-volume-off':currentVolume<75?'fa-volume-low':'fa-volume-high');
}
function toggleMute(){
    const sl=document.getElementById('volume-slider');if(!sl)return;
    if(isMuted){isMuted=false;currentVolume=preMutedVolume>0?preMutedVolume:15;sl.value=currentVolume;}
    else{preMutedVolume=currentVolume;isMuted=true;currentVolume=0;sl.value=0;}
    changeVolume(sl.value);
}
function updateMasterPlayPauseIcon(playing){
    const btn=document.getElementById('master-play-pause-btn');
    if(btn)btn.innerHTML=playing?'<i class="fa-solid fa-pause"></i>':'<i class="fa-solid fa-play"></i>';
}
function toggleMasterPlayPause(){
    if(!currentPlayingMusicId){
        const ml=document.querySelector(`#p${cur} .music-link`);
        if(ml)ml.click();else showToast('현재 화에 음악이 없습니다.','info');
        return;
    }
    if(currentPlayingType==='suno'&&sunoAudioObject){
        if(sunoAudioObject.paused){sunoAudioObject.volume=currentVolume/100;sunoAudioObject.play();if(currentPlayingBtn)currentPlayingBtn.classList.add('playing');updateMasterPlayPauseIcon(true);}
        else{sunoAudioObject.pause();if(currentPlayingBtn)currentPlayingBtn.classList.remove('playing');updateMasterPlayPauseIcon(false);}
    }else if(currentPlayingType==='youtube'&&ytAudioPlayer){
        const s=ytAudioPlayer.getPlayerState();
        if(s===YT.PlayerState.PLAYING){ytAudioPlayer.pauseVideo();if(currentPlayingBtn)currentPlayingBtn.classList.remove('playing');updateMasterPlayPauseIcon(false);}
        else{ytAudioPlayer.setVolume(currentVolume);ytAudioPlayer.playVideo();if(currentPlayingBtn)currentPlayingBtn.classList.add('playing');updateMasterPlayPauseIcon(true);}
    }
}
function togglePlayMusic(url,btn){
    const vid=extractVideoId(url),sid=extractSunoId(url);
    if(!vid&&!sid){showToast('지원하지 않는 링크입니다.','error');return;}
    const isSuno=!!sid,tid=isSuno?sid:vid;
    if(currentPlayingMusicId===tid){
        if(isSuno&&sunoAudioObject){if(sunoAudioObject.paused){sunoAudioObject.play();btn.classList.add('playing');updateMasterPlayPauseIcon(true);}else{sunoAudioObject.pause();btn.classList.remove('playing');updateMasterPlayPauseIcon(false);}}
        else if(ytAudioPlayer){const s=ytAudioPlayer.getPlayerState();if(s===YT.PlayerState.PLAYING){ytAudioPlayer.pauseVideo();btn.classList.remove('playing');updateMasterPlayPauseIcon(false);}else{ytAudioPlayer.playVideo();btn.classList.add('playing');updateMasterPlayPauseIcon(true);}}
        return;
    }
    resetMusicButtons();
    currentPlayingMusicId=tid;currentPlayingBtn=btn;currentPlayingType=isSuno?'suno':'youtube';
    btn.classList.add('playing');const di=btn.querySelector('.fa-compact-disc');if(di)di.classList.add('fa-spin');updateMasterPlayPauseIcon(true);
    if(isSuno){
        const isUUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sid);
        if(!isUUID){
            resetMusicButtons();
            showToast('Suno 짧은 링크는 지원 안 돼요. Suno 주소창의 전체 URL을 복사해 주세요.','error');
            return;
        }
        if(ytAudioPlayer&&ytAudioPlayer.pauseVideo)ytAudioPlayer.pauseVideo();
        sunoAudioObject=new Audio(`https://cdn1.suno.ai/${sid}.mp3`);
        sunoAudioObject.volume=currentVolume/100;
        sunoAudioObject.play().catch(()=>resetMusicButtons());
        sunoAudioObject.onended=resetMusicButtons;
    }else{
        if(ytAudioPlayer&&ytAudioPlayer.cueVideoById){ytAudioPlayer.cueVideoById(vid);setTimeout(()=>{ytAudioPlayer.setVolume(currentVolume);ytAudioPlayer.playVideo();},150);}
        else{showToast('플레이어 준비 중입니다. 잠시 후 다시 눌러주세요.','error');resetMusicButtons();}
    }
}
function extractVideoId(url){const m=url.match(/^.*(youtu.be\/|v\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/);return m&&m[2].length===11?m[2]:null;}
function extractSunoId(url){const m=url.match(/suno\.com\/(?:song|input|s)\/([a-zA-Z0-9\-]+)/i);return m?m[1]:null;}
