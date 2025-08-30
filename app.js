/* app.js - Jarfolio
   Vanilla JS single-file app. Stores metadata in localStorage (key: jarfolio_v1).
   Features: add via URL or file, compute SHA-256 of local files, search, filter, export/import.
*/

(() => {
  'use strict';

  // --- Utilities ---
  const qs = sel => document.querySelector(sel);
  const qsa = sel => Array.from(document.querySelectorAll(sel));
  const $gallery = qs('#gallery');
  const DBKEY = 'jarfolio_v1';
  let state = { items: [] };

  // sample data (three demo jars)
  const SAMPLE = [
    {
      id: genId(),
      name: "Sparkle-CLI",
      version: "2.1.0",
      description: "Fast CLI for file transformations. Compact and battle-tested.",
      url: "https://example.com/jars/sparkle-cli-2.1.0.jar",
      repo: "https://github.com/you/sparkle-cli",
      license: "Apache-2.0",
      tags: ["cli","utility"],
      size: 1432164,
      addedAt: Date.now()-86400000*10,
      sha256: null
    },
    {
      id: genId(),
      name: "DB-Connector",
      version: "1.4.3",
      description: "Lightweight JDBC helper with connection pooling.",
      url: "https://example.com/jars/db-connector-1.4.3.jar",
      repo: "https://github.com/you/db-connector",
      license: "MIT",
      tags: ["db","jdbc"],
      size: 654320,
      addedAt: Date.now()-86400000*30,
      sha256: null
    },
    {
      id: genId(),
      name: "ImageOps",
      version: "0.9.7",
      description: "Image processing utilities (resize, crop, filter) for Java apps.",
      url: "https://example.com/jars/imageops-0.9.7.jar",
      repo: "https://github.com/you/imageops",
      license: "BSD-3-Clause",
      tags: ["image","media"],
      size: 2222331,
      addedAt: Date.now()-86400000*60,
      sha256: null
    }
  ];

  // --- Simple storage ---
  function load() {
    const raw = localStorage.getItem(DBKEY);
    if (raw) {
      try { state = JSON.parse(raw); }
      catch (e) { console.warn('failed parse db',e); state = { items: SAMPLE }; }
    } else {
      state.items = SAMPLE;
      save();
    }
  }
  function save() { localStorage.setItem(DBKEY, JSON.stringify(state)); }

  // --- DOM helpers & render ---
  function render() {
    const query = qs('#search').value.trim().toLowerCase();
    const sort = qs('#sort').value;
    const items = state.items.slice();

    const filtered = items.filter(it => {
      if (!query) return true;
      const hay = (it.name + ' ' + it.description + ' ' + (it.tags||[]).join(' ') + ' ' + it.groupId + ' ' + it.artifactId).toLowerCase();
      return hay.includes(query);
    });

    if (sort === 'alpha') filtered.sort((a,b)=>a.name.localeCompare(b.name));
    else if (sort === 'size') filtered.sort((a,b)=> (b.size||0)-(a.size||0));
    else filtered.sort((a,b)=> (b.addedAt||0)-(a.addedAt||0));

    $gallery.innerHTML = '';
    if (!filtered.length) {
      $gallery.innerHTML = `<div class="card"><div class="title">No JARs found</div><div class="meta">Add your first JAR using + Add JAR or drag & drop.</div></div>`;
      return;
    }

    for (const it of filtered) {
      const el = document.createElement('article');
      el.className = 'card';
      el.tabIndex = 0;
      el.innerHTML = `
        <div class="title">
          <div>
            <div style="font-size:15px;font-weight:700">${escapeHtml(it.name)}</div>
            <div class="meta">${escapeHtml(it.version || '')} • ${formatBytes(it.size||0)}</div>
          </div>
          <div style="text-align:right">
            <div class="chip">${(it.tags||[]).slice(0,2).join(', ') || 'jar'}</div>
          </div>
        </div>
        <div class="meta">${escapeHtml(truncate(it.description || '',140))}</div>
        <div class="tags" aria-hidden="true">
          ${(it.tags || []).map(t => `<span class="chip">${escapeHtml(t)}</span>`).join('')}
        </div>
        <div class="actions">
          <button class="btn primary btn-open" data-id="${it.id}">Details</button>
          <a class="btn" href="${it.url || '#'}" target="_blank" rel="noopener noreferrer" ${it.url?'':'aria-disabled="true"'}>Download</a>
          <button class="btn btn-copy" data-id="${it.id}">Copy mvn</button>
        </div>
      `;
      $gallery.appendChild(el);
    }
  }

  // --- Event wiring ---
  function wire() {
    qs('#btnAdd').addEventListener('click', openAdd);
    qs('#modalClose').addEventListener('click', closeModal);
    qs('#jarForm').addEventListener('submit', onSubmitForm);
    qs('#btnClearForm').addEventListener('click', e => qs('#jarForm').reset());
    qs('#search').addEventListener('input', render);
    qs('#sort').addEventListener('change', render);

    qs('#dropzone').addEventListener('dragover', e => { e.preventDefault(); qs('#dropzone').classList.add('dragover'); });
    qs('#dropzone').addEventListener('dragleave', e => { qs('#dropzone').classList.remove('dragover'); });
    qs('#dropzone').addEventListener('drop', async e => {
      e.preventDefault(); qs('#dropzone').classList.remove('dragover');
      const f = (e.dataTransfer.files && e.dataTransfer.files[0]);
      if (f) await handleLocalJarFile(f);
    });

    qs('#jarFile').addEventListener('change', async e => {
      const f = e.target.files[0];
      if (f) await handleLocalJarFile(f);
    });

    document.addEventListener('click', e => {
      const open = e.target.closest('.btn-open');
      if (open) {
        const id = open.dataset.id;
        const it = state.items.find(i=>i.id===id);
        if (it) showDetail(it);
      }
      const copy = e.target.closest('.btn-copy');
      if (copy) {
        const id = copy.dataset.id;
        const it = state.items.find(i=>i.id===id);
        if (it) {
          navigator.clipboard?.writeText(mavenSnippet(it)).then(()=>alert('Maven snippet copied to clipboard'));
        }
      }
    });

    qs('#btnExport').addEventListener('click', exportJSON);
    qs('#importFile').addEventListener('change', importJSON);
    qs('#resetBtn').addEventListener('click', e => { e.preventDefault(); if (confirm('Reset demo data?')) { state.items = SAMPLE; save(); render(); } });

    qs('#toggleTheme').addEventListener('click', toggleTheme);

    // modal detail close
    qs('#detailClose').addEventListener('click', () => closeDetail());
  }

  // --- Modal management ---
  function openAdd() {
    qs('#modalTitle').textContent = 'Add JAR';
    qs('#jarForm').reset();
    qs('#modal').setAttribute('aria-hidden', 'false');
  }
  function closeModal() { qs('#modal').setAttribute('aria-hidden', 'true'); }
  function showDetail(it) {
    const d = qs('#detailModal');
    const el = qs('#detailContent');
    el.innerHTML = `
      <h2>${escapeHtml(it.name)} <span class="meta" style="font-weight:400">v${escapeHtml(it.version||'')}</span></h2>
      <p class="meta">${escapeHtml(it.description||'')}</p>
      <div class="kv"><div>Repository</div><div><a href="${it.repo || '#'}" target="_blank" rel="noopener noreferrer">${it.repo || '—'}</a></div></div>
      <div class="kv"><div>License</div><div class="meta">${escapeHtml(it.license||'—')}</div></div>
      <div class="kv"><div>Tags</div><div>${(it.tags||[]).map(t=>`<span class="chip">${escapeHtml(t)}</span>`).join(' ')}</div></div>
      <div class="kv"><div>Size</div><div class="meta">${formatBytes(it.size||0)}</div></div>
      <div class="kv"><div>SHA-256</div><div class="code" id="shaBlock">${escapeHtml(it.sha256||'—')}</div></div>
      <div style="margin-top:12px;display:flex;gap:8px">
        <a class="btn primary" href="${it.url||'#'}" target="_blank" rel="noopener noreferrer">Download</a>
        <button class="btn" id="copyMvn">Copy Maven</button>
        <button class="btn" id="btnDel" style="color:#ff7a7a">Delete</button>
      </div>
    `;
    qsa('#copyMvn').forEach(x=>x.addEventListener('click', ()=>navigator.clipboard?.writeText(mavenSnippet(it))));
    qs('#btnDel').addEventListener('click', ()=> {
      if (confirm('Delete this jar from the gallery?')) {
        state.items = state.items.filter(x=>x.id!==it.id); save(); render(); closeDetail();
      }
    });
    d.setAttribute('aria-hidden','false');
  }
  function closeDetail(){ qs('#detailModal').setAttribute('aria-hidden','true'); }

  // --- Add form submit ---
  async function onSubmitForm(e) {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    const entry = {
      id: genId(),
      name: fd.get('name') || 'Unnamed',
      version: fd.get('version') || '',
      description: fd.get('description') || '',
      groupId: fd.get('groupId') || '',
      artifactId: fd.get('artifactId') || '',
      tags: (fd.get('tags') || '').split(',').map(s=>s.trim()).filter(Boolean),
      url: fd.get('url') || null,
      repo: fd.get('repo') || null,
      license: fd.get('license') || null,
      size: 0,
      sha256: null,
      addedAt: Date.now()
    };

    const fileInput = qs('#jarFile');
    if (fileInput.files && fileInput.files[0]) {
      const f = fileInput.files[0];
      const blobUrl = URL.createObjectURL(f);
      entry.url = blobUrl;
      entry.size = f.size;
      try {
        entry.sha256 = await hashFileSHA256(f);
      } catch(e) { console.warn('sha failed', e) }
    } else if (entry.url) {
      // url provided: we can try to fetch HEAD to get size (best-effort)
      try {
        const r = await fetch(entry.url, { method:'HEAD' });
        const len = r.headers.get('content-length');
        if (len) entry.size = parseInt(len, 10);
      } catch(e){}
    }

    state.items.unshift(entry);
    save();
    render();
    closeModal();
  }

  // --- Handle drag/upload ---
  async function handleLocalJarFile(file) {
    // prefill modal with file meta and open
    openAdd();
    qs('#modalTitle').textContent = 'Add JAR (from file)';
    const form = qs('#jarForm');
    form.elements['name'].value = file.name.replace(/\.jar$/i,'');
    form.elements['version'].value = '';
    form.elements['description'].value = `Uploaded file ${file.name}`;
    // set file input programmatically is not allowed for security; we create a blob URL and store it directly
    // Instead we compute hash and create entry directly:
    const shouldAdd = confirm(`Add ${file.name} directly to gallery now? (This will store URL as an in-memory object URL for this browser.)`);
    if (!shouldAdd) return;
    const entry = {
      id: genId(),
      name: file.name.replace(/\.jar$/i,''),
      version: '',
      description: `Uploaded: ${file.name}`,
      tags: [],
      url: URL.createObjectURL(file),
      repo: null,
      license: null,
      size: file.size,
      sha256: null,
      addedAt: Date.now()
    };
    try {
      entry.sha256 = await hashFileSHA256(file);
    } catch(e){ console.warn('sha error',e) }
    state.items.unshift(entry);
    save(); render();
  }

  // --- SHA256 hashing for local file ---
  async function hashFileSHA256(file) {
    const buf = await file.arrayBuffer();
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  // --- Export / Import ---
  function exportJSON() {
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'jarfolio.json';
    a.click();
  }
  function importJSON(e) {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result);
        if (json.items && Array.isArray(json.items)) {
          state.items = json.items.concat(state.items);
          save(); render(); alert('Imported items added.');
        } else alert('Invalid JSON format (expected { items: [...] })');
      } catch(err) { alert('Failed to parse JSON: ' + err.message) }
    };
    reader.readAsText(f);
  }

  // --- Helpers ---
  function genId() { return 'j_' + Math.random().toString(36).slice(2,10); }
  function escapeHtml(s){ if(!s) return ''; return String(s).replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]); }
  function truncate(s,n){ return s && s.length>n ? s.slice(0,n-1)+'…' : s || ''; }
  function formatBytes(n){
    if (!n) return '0 B';
    const units = ['B','KB','MB','GB','TB'];
    let i=0; while(n>=1024 && i<units.length-1){ n/=1024; i++ }
    return `${Math.round(n*10)/10} ${units[i]}`;
  }
  function mavenSnippet(it){
    const group = it.groupId || 'com.example';
    const artifact = it.artifactId || (it.name||'artifact').toLowerCase().replace(/\s+/g,'-');
    const version = it.version || '1.0.0';
    return `<dependency>\n  <groupId>${group}</groupId>\n  <artifactId>${artifact}</artifactId>\n  <version>${version}</version>\n</dependency>`;
  }

  // theme toggle
  function toggleTheme(){
    const root = document.documentElement;
    if (root.classList.contains('light')) { root.classList.remove('light'); qs('#toggleTheme').textContent = 'Dark'; }
    else { root.classList.add('light'); qs('#toggleTheme').textContent = 'Light'; }
  }

  // --- init ---
  load();
  wire();
  render();

  // Expose small api for debugging
  window.jarfolio = {
    getAll: ()=>state.items,
    add: item => { item.id = genId(); item.addedAt = Date.now(); state.items.unshift(item); save(); render(); },
    clear: ()=>{ state.items = []; save(); render(); }
  };

})();
