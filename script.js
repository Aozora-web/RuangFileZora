const DB_NAME = 'ruangfile-db';
const STORE_NAME = 'files';
let db;
let currentFilter = 'all';
let allFiles = [];
const $ = (id) => document.getElementById(id);

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('addedAt', 'addedAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function storeTransaction(mode = 'readonly') {
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}
function getAllFiles() {
  return new Promise((resolve, reject) => {
    const req = storeTransaction().getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function saveFile(file) {
  return new Promise((resolve, reject) => {
    const req = storeTransaction('readwrite').add({
      name: file.name, type: file.type || '', size: file.size,
      addedAt: Date.now(), blob: file
    });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function deleteFile(id) {
  return new Promise((resolve, reject) => {
    const req = storeTransaction('readwrite').delete(Number(id));
    req.onsuccess = resolve;
    req.onerror = () => reject(req.error);
  });
}
function formatSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
function getCategory(file) {
  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();
  if (type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp|heic)$/.test(name)) return 'image';
  if (type.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm)$/.test(name)) return 'video';
  if (type.startsWith('text/') || /\.(pdf|docx?|xlsx?|pptx?|txt|csv|rtf|odt|ods)$/.test(name)) return 'document';
  return 'other';
}
function categoryLabel(category) {
  return ({ document: 'Dokumen', image: 'Gambar', video: 'Video', other: 'Lainnya' })[category] || 'Lainnya';
}
function fileBadge(file) {
  const category = getCategory(file);
  const ext = file.name.includes('.') ? file.name.split('.').pop().slice(0, 4).toUpperCase() : 'FILE';
  let css = 'type-other';
  if (category === 'image') css = 'type-img';
  else if (category === 'video') css = 'type-video';
  else if (/pdf$/i.test(file.name)) css = 'type-pdf';
  else if (category === 'document') css = 'type-doc';
  return `<div class="file-type-icon ${css}">${escapeHTML(ext)}</div>`;
}
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function formatDate(timestamp) {
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(timestamp));
}
function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 3000);
}
async function refreshFiles() {
  allFiles = await getAllFiles();
  render();
}
function render() {
  const query = $('searchInput').value.trim().toLowerCase();
  const sort = $('sortSelect').value;
  let list = allFiles.filter(file => {
    const matchesFilter = currentFilter === 'all' || getCategory(file) === currentFilter;
    return matchesFilter && file.name.toLowerCase().includes(query);
  });
  if (sort === 'newest') list.sort((a,b) => b.addedAt - a.addedAt);
  if (sort === 'oldest') list.sort((a,b) => a.addedAt - b.addedAt);
  if (sort === 'name') list.sort((a,b) => a.name.localeCompare(b.name, 'id'));
  if (sort === 'size') list.sort((a,b) => b.size - a.size);

  $('fileRows').innerHTML = list.map(file => `
    <tr>
      <td><div class="file-name-cell">${fileBadge(file)}<div><div class="file-name" title="${escapeHTML(file.name)}">${escapeHTML(file.name)}</div><div class="file-sub">${escapeHTML(file.type || 'Jenis file tidak diketahui')}</div></div></div></td>
      <td><span class="category-pill">${categoryLabel(getCategory(file))}</span></td>
      <td>${formatSize(file.size)}</td><td>${formatDate(file.addedAt)}</td>
      <td><div class="row-actions"><button class="icon-btn" title="Unduh file" aria-label="Unduh ${escapeHTML(file.name)}" data-action="download" data-id="${file.id}">↓</button><button class="icon-btn" title="Hapus file" aria-label="Hapus ${escapeHTML(file.name)}" data-action="delete" data-id="${file.id}">×</button></div></td>
    </tr>`).join('');

  $('emptyState').style.display = list.length ? 'none' : 'block';
  $('fileRows').parentElement.style.display = list.length ? 'table' : 'none';
  $('statTotal').textContent = allFiles.length;
  $('statDocs').textContent = allFiles.filter(f => getCategory(f) === 'document').length;
  $('statImages').textContent = allFiles.filter(f => getCategory(f) === 'image').length;
  $('statSize').textContent = formatSize(allFiles.reduce((sum, f) => sum + f.size, 0));
  $('allCount').textContent = allFiles.length;
  $('storageText').textContent = `${allFiles.length} file tersimpan`;
  const labels = { all: 'Semua file', document: 'Dokumen', image: 'Gambar', video: 'Video', other: 'File lainnya' };
  $('pageTitle').textContent = labels[currentFilter];
  $('listTitle').textContent = currentFilter === 'all' ? 'File terbaru' : labels[currentFilter];
  document.querySelectorAll('.nav-item[data-filter]').forEach(btn => btn.classList.toggle('active', btn.dataset.filter === currentFilter));
}
async function handleFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  let count = 0;
  for (const file of files) {
    try { await saveFile(file); count++; }
    catch (err) { console.error(err); toast(`Tidak bisa menyimpan ${file.name}. Ruang penyimpanan browser mungkin penuh.`); }
  }
  await refreshFiles();
  if (count) toast(`${count} file berhasil ditambahkan.`);
  $('fileInput').value = '';
}
function pickFiles() { $('fileInput').click(); }

$('uploadTop').addEventListener('click', pickFiles);
$('browseBtn').addEventListener('click', event => { event.stopPropagation(); pickFiles(); });
$('emptyUpload').addEventListener('click', pickFiles);
$('dropzone').addEventListener('click', pickFiles);
$('dropzone').addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pickFiles(); } });
$('fileInput').addEventListener('change', event => handleFiles(event.target.files));
$('searchInput').addEventListener('input', render);
$('sortSelect').addEventListener('change', render);
document.querySelectorAll('.nav-item[data-filter]').forEach(btn => btn.addEventListener('click', () => {
  currentFilter = btn.dataset.filter;
  render();
  $('sidebar').classList.remove('open');
}));
['dragenter','dragover'].forEach(name => $('dropzone').addEventListener(name, event => {
  event.preventDefault(); $('dropzone').classList.add('dragover');
}));
['dragleave','drop'].forEach(name => $('dropzone').addEventListener(name, event => {
  event.preventDefault(); $('dropzone').classList.remove('dragover');
}));
$('dropzone').addEventListener('drop', event => handleFiles(event.dataTransfer.files));
$('fileRows').addEventListener('click', async event => {
  const btn = event.target.closest('button[data-action]');
  if (!btn) return;
  const file = allFiles.find(item => item.id === Number(btn.dataset.id));
  if (!file) return;
  if (btn.dataset.action === 'download') {
    const url = URL.createObjectURL(file.blob);
    const a = document.createElement('a');
    a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } else if (btn.dataset.action === 'delete') {
    if (confirm(`Hapus file "${file.name}" dari RuangFile?`)) {
      await deleteFile(file.id); await refreshFiles(); toast('File berhasil dihapus.');
    }
  }
});
$('menuBtn').addEventListener('click', () => $('sidebar').classList.toggle('open'));
$('aboutBtn').addEventListener('click', () => $('aboutDialog').showModal());
$('closeAbout').addEventListener('click', () => $('aboutDialog').close());
$('closeAbout2').addEventListener('click', () => $('aboutDialog').close());
$('aboutDialog').addEventListener('click', event => { if (event.target === $('aboutDialog')) $('aboutDialog').close(); });

(async function init() {
  try {
    if (!('indexedDB' in window)) throw new Error('Browser tidak mendukung IndexedDB');
    db = await openDatabase();
    await refreshFiles();
  } catch (error) {
    console.error(error);
    toast('Penyimpanan tidak dapat dibuka. Coba gunakan browser modern.');
  }
})();