const DB_NAME = 'recipe-book-db';
const DB_VERSION = 1;
const STORE = 'recipes';

let db;
let recipes = [];
let favoriteOnly = false;
let detailRecipeId = null;
let pendingImages = [];

const els = {};

document.addEventListener('DOMContentLoaded', async () => {
  Object.assign(els, {
    recipeGrid: document.getElementById('recipeGrid'),
    emptyState: document.getElementById('emptyState'),
    recipeCount: document.getElementById('recipeCount'),
    searchInput: document.getElementById('searchInput'),
    favoriteFilterBtn: document.getElementById('favoriteFilterBtn'),
    sortSelect: document.getElementById('sortSelect'),
    fab: document.getElementById('fab'),
    recipeDialog: document.getElementById('recipeDialog'),
    recipeForm: document.getElementById('recipeForm'),
    recipeId: document.getElementById('recipeId'),
    formTitle: document.getElementById('formTitle'),
    titleInput: document.getElementById('titleInput'),
    favoriteInput: document.getElementById('favoriteInput'),
    imageInput: document.getElementById('imageInput'),
    imagePreview: document.getElementById('imagePreview'),
    imageCountText: document.getElementById('imageCountText'),
    detailDialog: document.getElementById('detailDialog'),
    detailCloseBtn: document.getElementById('detailCloseBtn'),
    detailFavoriteBtn: document.getElementById('detailFavoriteBtn'),
    detailEditBtn: document.getElementById('detailEditBtn'),
    detailDeleteBtn: document.getElementById('detailDeleteBtn'),
    detailTitle: document.getElementById('detailTitle'),
    detailImages: document.getElementById('detailImages'),
    backupBtn: document.getElementById('backupBtn'),
    backupDialog: document.getElementById('backupDialog'),
    exportBackupBtn: document.getElementById('exportBackupBtn'),
    importBackupBtn: document.getElementById('importBackupBtn'),
    backupFileInput: document.getElementById('backupFileInput'),
    toast: document.getElementById('toast')
  });

  db = await openDB();
  await refreshRecipes();
  bindEvents();
  registerServiceWorker();
});

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) {
        const store = database.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
        store.createIndex('title', 'title');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAllRecipes() {
  const tx = db.transaction(STORE, 'readonly');
  return requestToPromise(tx.objectStore(STORE).getAll());
}

async function putRecipe(recipe) {
  const tx = db.transaction(STORE, 'readwrite');
  await requestToPromise(tx.objectStore(STORE).put(recipe));
}

async function deleteRecipeById(id) {
  const tx = db.transaction(STORE, 'readwrite');
  await requestToPromise(tx.objectStore(STORE).delete(id));
}

async function refreshRecipes() {
  recipes = await getAllRecipes();
  renderRecipes();
}

function bindEvents() {
  els.fab?.addEventListener('click', () => openRecipeForm());
  document.querySelectorAll('[data-close-dialog]').forEach(btn => {
    btn.addEventListener('click', () => document.getElementById(btn.dataset.closeDialog)?.close());
  });
  els.searchInput.addEventListener('input', renderRecipes);
  els.sortSelect.addEventListener('change', renderRecipes);
  els.favoriteFilterBtn.addEventListener('click', () => {
    favoriteOnly = !favoriteOnly;
    els.favoriteFilterBtn.classList.toggle('active', favoriteOnly);
    els.favoriteFilterBtn.textContent = favoriteOnly ? '★ お気に入り' : '☆ お気に入り';
    renderRecipes();
  });
  els.imageInput.addEventListener('change', handleImageSelection);
  els.recipeForm.addEventListener('submit', saveRecipeFromForm);
  els.detailCloseBtn.addEventListener('click', () => els.detailDialog.close());
  els.detailFavoriteBtn.addEventListener('click', toggleDetailFavorite);
  els.detailEditBtn.addEventListener('click', editCurrentRecipe);
  els.detailDeleteBtn.addEventListener('click', deleteCurrentRecipe);
  els.backupBtn.addEventListener('click', () => els.backupDialog.showModal());
  els.exportBackupBtn.addEventListener('click', exportBackup);
  els.importBackupBtn.addEventListener('click', () => els.backupFileInput.click());
  els.backupFileInput.addEventListener('change', importBackup);
}

function openRecipeForm(recipe = null) {
  els.recipeForm.reset();
  pendingImages = [];
  els.recipeId.value = recipe?.id || '';
  els.formTitle.textContent = recipe ? 'レシピを編集' : 'レシピを追加';
  els.titleInput.value = recipe?.title || '';
  els.favoriteInput.checked = !!recipe?.favorite;
  pendingImages = (recipe?.images || []).map((blob, idx) => ({ key: `${recipe.id}-${idx}`, blob }));
  renderImagePreview();
  els.recipeDialog.showModal();
  setTimeout(() => els.titleInput.focus(), 80);
}

async function handleImageSelection(e) {
  const files = Array.from(e.target.files || []);
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    const compressed = await compressImage(file);
    pendingImages.push({ key: crypto.randomUUID(), blob: compressed });
  }
  e.target.value = '';
  renderImagePreview();
}

async function compressImage(file) {
  const bitmap = await createImageBitmap(file);
  const maxSide = 1800;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob || file), 'image/jpeg', 0.88);
  });
}

function renderImagePreview() {
  els.imagePreview.innerHTML = '';
  els.imageCountText.textContent = `${pendingImages.length}枚`;
  pendingImages.forEach((item, index) => {
    const wrap = document.createElement('div');
    wrap.className = 'preview-item';
    const img = document.createElement('img');
    const url = URL.createObjectURL(item.blob);
    img.src = url;
    img.onload = () => URL.revokeObjectURL(url);
    img.alt = `スクショ ${index + 1}`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'preview-remove';
    remove.textContent = '×';
    remove.setAttribute('aria-label', '画像を削除');
    remove.addEventListener('click', () => {
      pendingImages.splice(index, 1);
      renderImagePreview();
    });
    wrap.append(img, remove);
    els.imagePreview.appendChild(wrap);
  });
}

async function saveRecipeFromForm(e) {
  e.preventDefault();
  const title = els.titleInput.value.trim();
  if (!title) return;

  const id = els.recipeId.value || crypto.randomUUID();
  const existing = recipes.find(r => r.id === id);
  const now = Date.now();
  const recipe = {
    id,
    title,
    favorite: els.favoriteInput.checked,
    images: pendingImages.map(i => i.blob),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  try {
    await putRecipe(recipe);
    els.recipeDialog.close();
    await refreshRecipes();
    showToast(existing ? 'レシピを更新しました' : 'レシピを追加しました');
  } catch (err) {
    console.error(err);
    showToast('保存できませんでした。端末の空き容量をご確認ください。');
  }
}

function getFilteredRecipes() {
  const q = els.searchInput.value.trim().toLowerCase();
  let list = recipes.filter(recipe => {
    const matchesText = !q || recipe.title.toLowerCase().includes(q);
    const matchesFavorite = !favoriteOnly || recipe.favorite;
    return matchesText && matchesFavorite;
  });

  const sort = els.sortSelect.value;
  list.sort((a, b) => {
    if (sort === 'name') return a.title.localeCompare(b.title, 'ja');
    if (sort === 'favorite') return Number(b.favorite) - Number(a.favorite) || b.createdAt - a.createdAt;
    return b.createdAt - a.createdAt;
  });
  return list;
}

function renderRecipes() {
  const list = getFilteredRecipes();
  els.recipeCount.textContent = `${list.length}件`;
  els.recipeGrid.innerHTML = '';
  const hasAny = recipes.length > 0;
  els.emptyState.hidden = hasAny;
  els.recipeGrid.hidden = !hasAny;

  if (hasAny && list.length === 0) {
    const msg = document.createElement('div');
    msg.className = 'empty-state';
    msg.style.gridColumn = '1 / -1';
    msg.innerHTML = '<div class="empty-icon">🔎</div><h3>該当するレシピがありません</h3><p>検索条件を変えてみてください。</p>';
    els.recipeGrid.appendChild(msg);
    return;
  }

  list.forEach(recipe => {
    const card = document.createElement('article');
    card.className = 'recipe-card compact';

    const body = document.createElement('div');
    body.className = 'card-body compact-body';

    const title = document.createElement('h3');
    title.className = 'card-title compact-title';
    title.textContent = recipe.title;

    const star = document.createElement('button');
    star.className = 'card-star compact-star';
    star.textContent = recipe.favorite ? '★' : '☆';
    star.setAttribute('aria-label', recipe.favorite ? 'お気に入り解除' : 'お気に入り登録');
    star.addEventListener('click', async e => {
      e.stopPropagation();
      recipe.favorite = !recipe.favorite;
      recipe.updatedAt = Date.now();
      await putRecipe(recipe);
      await refreshRecipes();
    });

    body.append(title, star);
    card.append(body);
    card.addEventListener('click', () => openDetail(recipe.id));
    els.recipeGrid.appendChild(card);
  });
}

function openDetail(id) {
  const recipe = recipes.find(r => r.id === id);
  if (!recipe) return;
  detailRecipeId = id;
  els.detailTitle.textContent = recipe.title;
  els.detailFavoriteBtn.textContent = recipe.favorite ? '★' : '☆';
  els.detailFavoriteBtn.classList.toggle('active', recipe.favorite);
  els.detailImages.innerHTML = '';
  if (!recipe.images?.length) {
    const div = document.createElement('div');
    div.className = 'detail-no-image';
    div.textContent = '画像は登録されていません';
    els.detailImages.appendChild(div);
  } else {
    recipe.images.forEach((blob, idx) => {
      const img = document.createElement('img');
      const url = URL.createObjectURL(blob);
      img.src = url;
      img.onload = () => URL.revokeObjectURL(url);
      img.alt = `${recipe.title} スクショ ${idx + 1}`;
      els.detailImages.appendChild(img);
    });
  }
  if (!els.detailDialog.open) els.detailDialog.showModal();
  els.detailDialog.scrollTop = 0;
}

async function toggleDetailFavorite() {
  const recipe = recipes.find(r => r.id === detailRecipeId);
  if (!recipe) return;
  recipe.favorite = !recipe.favorite;
  recipe.updatedAt = Date.now();
  await putRecipe(recipe);
  await refreshRecipes();
  openDetail(detailRecipeId);
}

function editCurrentRecipe() {
  const recipe = recipes.find(r => r.id === detailRecipeId);
  if (!recipe) return;
  els.detailDialog.close();
  openRecipeForm(recipe);
}

async function deleteCurrentRecipe() {
  const recipe = recipes.find(r => r.id === detailRecipeId);
  if (!recipe) return;
  if (!confirm(`「${recipe.title}」を削除しますか？`)) return;
  await deleteRecipeById(recipe.id);
  els.detailDialog.close();
  detailRecipeId = null;
  await refreshRecipes();
  showToast('レシピを削除しました');
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function exportBackup() {
  try {
    const exportedRecipes = [];
    for (const recipe of recipes) {
      const images = [];
      for (const blob of recipe.images || []) images.push(await blobToDataURL(blob));
      exportedRecipes.push({
        id: recipe.id,
        title: recipe.title,
        favorite: !!recipe.favorite,
        createdAt: recipe.createdAt,
        updatedAt: recipe.updatedAt,
        images
      });
    }
    const payload = {
      format: 'recipe-book-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      recipes: exportedRecipes
    };
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    a.href = url;
    a.download = `recipe-book-backup-${date}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('バックアップを書き出しました');
  } catch (err) {
    console.error(err);
    showToast('バックアップの作成に失敗しました');
  }
}

async function dataURLToBlob(dataURL) {
  const response = await fetch(dataURL);
  return response.blob();
}

async function importBackup(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    if (payload?.format !== 'recipe-book-backup' || !Array.isArray(payload.recipes)) {
      throw new Error('Invalid backup format');
    }
    if (!confirm(`${payload.recipes.length}件のレシピを復元しますか？\n同じレシピは上書きされ、その他の既存レシピは残ります。`)) return;
    for (const item of payload.recipes) {
      if (!item?.id || typeof item.title !== 'string') continue;
      const images = [];
      for (const dataURL of item.images || []) {
        if (typeof dataURL === 'string' && dataURL.startsWith('data:image/')) images.push(await dataURLToBlob(dataURL));
      }
      await putRecipe({
        id: item.id,
        title: item.title,
        favorite: !!item.favorite,
        images,
        createdAt: Number(item.createdAt) || Date.now(),
        updatedAt: Number(item.updatedAt) || Date.now()
      });
    }
    await refreshRecipes();
    els.backupDialog.close();
    showToast('バックアップから復元しました');
  } catch (err) {
    console.error(err);
    showToast('このバックアップは復元できませんでした');
  }
}

let toastTimer;
function showToast(message) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add('show');
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2200);
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(console.warn);
  }
}
