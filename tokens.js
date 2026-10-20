(() => {
    class TokenManager extends HTMLElement {
        constructor() {
            super();
            this.context = null;
            this.pendingTokenImage = null;
            this.pendingEditImage = null;
            this.editImageChanged = false;
        }

        connectedCallback() {
            if (this.dataset.ready) return;
            this.dataset.ready = 'true';
            this.render();
            this.bindEvents();
        }

        configure(context) {
            this.context = context;
            if (!this.mapEventsReady) {
                this.mapEventsReady = true;
                this.setupMapEvents();
            }
        }

        createBoardToken(template, x, y) {
            const state = this.context.state;
            state.boardTokens.push({
                id: 'tok_' + Date.now() + Math.random().toString(16).slice(2),
                templateId: template.id,
                name: template.name,
                color: template.color,
                opacity: template.opacity ?? 100,
                image: template.image || null,
                hidden: Boolean(template.hidden),
                hiddenBy: template.hidden ? (template.hiddenBy || 'master') : null,
                size: template.size,
                x,
                y
            });
            this.renderBoardTokens();
        }

        placeTokenAtMapCenter(template) {
            const { state } = this.context;
            const x = Math.max(0, (state.map.cols - template.size) / 2);
            const y = Math.max(0, (state.map.rows - template.size) / 2);
            this.createBoardToken(template, state.map.snapToGrid ? Math.round(x) : x, state.map.snapToGrid ? Math.round(y) : y);
            this.context.showToast(`${template.name} aggiunta al centro della mappa.`);
        }

        setupMapEvents() {
            const { state, viewport, wrapper } = this.context;
            viewport.addEventListener('dragover', event => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
            });
            viewport.addEventListener('drop', event => {
                event.preventDefault();
                const data = event.dataTransfer.getData('text/plain');
                if (!data) return;
                try {
                    const template = JSON.parse(data);
                    const rect = wrapper.getBoundingClientRect();
                    const mapX = ((event.clientX - rect.left) - state.view.panX) / state.view.scale;
                    const mapY = ((event.clientY - rect.top) - state.view.panY) / state.view.scale;
                    let x = mapX / this.context.cellSize() - template.size / 2;
                    let y = mapY / this.context.cellSize() - template.size / 2;
                    if (state.map.snapToGrid) { x = Math.round(x); y = Math.round(y); }
                    x = Math.max(0, Math.min(x, state.map.cols - template.size));
                    y = Math.max(0, Math.min(y, state.map.rows - template.size));
                    this.createBoardToken(template, x, y);
                } catch (error) {
                    console.error('Errore nel piazzamento della pedina:', error);
                }
            });

            this.draggedToken = null;
            this.tokenDragMoved = false;
            this.startClientX = 0;
            this.startClientY = 0;
            this.tokenInitX = 0;
            this.tokenInitY = 0;
            window.addEventListener('pointermove', event => this.moveDraggedToken(event));
            window.addEventListener('pointerup', () => this.finishTokenDrag());
            window.addEventListener('pointercancel', () => this.finishTokenDrag());
        }

        moveDraggedToken(event) {
            if (!this.draggedToken) return;
            const element = document.getElementById(this.draggedToken.id);
            if (!element) return;
            const { state } = this.context;
            const deltaX = (event.clientX - this.startClientX) / state.view.scale;
            const deltaY = (event.clientY - this.startClientY) / state.view.scale;
            if (!this.tokenDragMoved && Math.hypot(event.clientX - this.startClientX, event.clientY - this.startClientY) < 4) return;
            this.tokenDragMoved = true;
            element.style.left = `${this.tokenInitX + deltaX}px`;
            element.style.top = `${this.tokenInitY + deltaY}px`;
        }

        finishTokenDrag() {
            if (!this.draggedToken) return;
            const { state } = this.context;
            const element = document.getElementById(this.draggedToken.id);
            if (!this.tokenDragMoved) {
                if (element) element.style.zIndex = '10';
                this.draggedToken = null;
                return;
            }
            if (element) {
                let x = parseFloat(element.style.left) / this.context.cellSize();
                let y = parseFloat(element.style.top) / this.context.cellSize();
                if (state.map.snapToGrid) { x = Math.round(x); y = Math.round(y); }
                this.draggedToken.x = Math.max(0, Math.min(x, state.map.cols - this.draggedToken.size));
                this.draggedToken.y = Math.max(0, Math.min(y, state.map.rows - this.draggedToken.size));
            }
            this.draggedToken = null;
            this.tokenDragMoved = false;
            this.renderBoardTokens();
        }

        renderBoardTokens() {
            const { state, mapContainer, cellSize, colorWithOpacity, saveTokens } = this.context;
            const isPlayerMode = this.context.isPlayerMode();
            mapContainer.querySelectorAll('.token').forEach(element => element.remove());
            state.boardTokens.forEach(token => {
                if (token.hidden && isPlayerMode && token.hiddenBy !== 'player') return;
                const element = document.createElement('div');
                element.className = token.hidden ? 'token token-hidden' : 'token';
                element.id = token.id;
                const pixelSize = token.size * cellSize();
                element.style.width = `${pixelSize}px`;
                element.style.height = `${pixelSize}px`;
                element.style.backgroundColor = colorWithOpacity(token.color, token.opacity ?? 100);
                element.style.border = `3px solid ${colorWithOpacity(token.color, token.opacity ?? 100)}`;
                if (token.image) {
                    const portrait = document.createElement('img');
                    portrait.src = token.image;
                    portrait.alt = token.name;
                    portrait.draggable = false;
                    portrait.style.cssText = 'position:absolute;inset:3px;width:calc(100% - 6px);height:calc(100% - 6px);border-radius:50%;object-fit:cover;pointer-events:none;';
                    element.appendChild(portrait);
                }
                element.style.left = `${token.x * cellSize()}px`;
                element.style.top = `${token.y * cellSize()}px`;
                element.style.fontSize = `${Math.max(13, pixelSize * 0.3)}px`;
                if (!token.image) element.innerText = token.name.substring(0, 2).toUpperCase();
                element.title = `${token.name} (${token.size}x${token.size})${token.hidden ? ' - Nascosta ai Player' : ''} - Doppio click per modificare`;
                element.addEventListener('pointerdown', event => {
                    if (event.button !== 0) return;
                    event.stopPropagation();
                    this.draggedToken = token;
                    this.tokenDragMoved = false;
                    this.startClientX = event.clientX;
                    this.startClientY = event.clientY;
                    this.tokenInitX = token.x * cellSize();
                    this.tokenInitY = token.y * cellSize();
                    element.style.zIndex = '50';
                    element.setPointerCapture(event.pointerId);
                });
                element.addEventListener('dblclick', event => {
                    event.stopPropagation();
                    this.openEditModal('board', token.id);
                });
                element.addEventListener('contextmenu', event => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (!window.confirm(`Eliminare la pedina "${token.name}" dalla mappa?`)) return;
                    state.boardTokens = state.boardTokens.filter(entry => entry.id !== token.id);
                    this.renderBoardTokens();
                });
                mapContainer.appendChild(element);
            });
            saveTokens();
        }

        render() {
            this.innerHTML = `
                <section class="token-panel text-xs">
                    <button id="btn-open-token-create" type="button" aria-haspopup="dialog" class="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-400/30 bg-gradient-to-r from-emerald-600 to-teal-600 px-3 py-2.5 text-xs font-semibold text-white shadow-lg shadow-emerald-950/30 transition hover:-translate-y-0.5 hover:from-emerald-500 hover:to-teal-500 focus:outline-none focus:ring-2 focus:ring-emerald-300">
                        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
                        <span>Crea personaggio</span>
                    </button>
                </section>
                <section class="token-panel text-xs">
                    <div class="mb-2 flex items-center justify-between">
                        <h2 class="font-semibold uppercase tracking-wider text-slate-300">Pedine</h2>
                        <span class="text-[10px] text-slate-400">Trascina sulla mappa</span>
                    </div>
                    <div class="space-y-2">
                        <details class="rounded-md border border-slate-700 bg-slate-900/60">
                            <summary class="flex cursor-pointer select-none items-center justify-between px-2.5 py-2 font-semibold text-slate-300 hover:text-white">
                                <span>Avventurieri</span><span id="adventurer-token-count" class="text-[10px] text-slate-500">0</span>
                            </summary>
                            <div id="token-palette-adventurers" class="flex max-h-48 flex-col gap-1.5 overflow-y-auto px-2 pb-2 pr-3"><p class="empty-category-msg py-2 text-center italic text-slate-500">Nessun avventuriero</p></div>
                        </details>
                        <details id="enemy-token-section" class="rounded-md border border-slate-700 bg-slate-900/60">
                            <summary class="flex cursor-pointer select-none items-center justify-between px-2.5 py-2 font-semibold text-slate-300 hover:text-white">
                                <span>Nemici</span><span id="enemy-token-count" class="text-[10px] text-slate-500">0</span>
                            </summary>
                            <div id="token-palette-enemies" class="flex max-h-48 flex-col gap-1.5 overflow-y-auto px-2 pb-2 pr-3"><p class="empty-category-msg py-2 text-center italic text-slate-500">Nessun nemico</p></div>
                        </details>
                    </div>
                </section>`;

            document.body.insertAdjacentHTML('beforeend', `
                <div id="token-create-modal" class="fixed inset-0 z-50 hidden items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm" role="presentation">
                    <section role="dialog" aria-modal="true" aria-labelledby="token-create-title" class="w-full max-w-xl overflow-hidden rounded-3xl border border-emerald-400/20 bg-slate-900 shadow-2xl shadow-black/60">
                        <header class="relative flex items-center justify-between gap-4 overflow-hidden border-b border-white/10 bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-900 px-6 py-5 sm:px-7">
                            <div class="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-emerald-500/10 blur-3xl"></div>
                            <div class="relative flex min-w-0 items-center gap-4">
                                <span class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-emerald-300/20 bg-emerald-400/10 shadow-inner shadow-emerald-200/5"><img src="https://i.pinimg.com/736x/8a/ee/3c/8aee3cf9eb3649b4d50c8c900b45c0de.jpg" alt="" aria-hidden="true" class="h-full w-full object-cover"></span>
                                <div class="min-w-0"><span class="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300/80">Nuovo elemento</span><h2 id="token-create-title" class="text-lg font-bold text-white">Crea personaggio</h2><p class="mt-1 text-xs text-slate-400">Personalizza aspetto e categoria della pedina.</p></div>
                            </div>
                            <button id="btn-close-token-create" type="button" aria-label="Chiudi creazione personaggio" class="relative shrink-0 rounded-xl border border-white/10 bg-white/5 p-2.5 text-slate-300 transition hover:border-white/20 hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-emerald-400"><svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M4.22 4.22a.75.75 0 0 1 1.06 0L10 8.94l4.72-4.72a.75.75 0 1 1 1.06 1.06L11.06 10l4.72 4.72a.75.75 0 1 1-1.06 1.06L10 11.06l-4.72 4.72a.75.75 0 1 1-1.06-1.06L8.94 10 4.22 5.28a.75.75 0 0 1 0-1.06Z"/></svg></button>
                        </header>
                        <div class="max-h-[75vh] space-y-5 overflow-y-auto bg-gradient-to-b from-slate-900 to-slate-950 p-6 text-xs sm:p-7">
                            <div class="space-y-2"><label for="token-name" class="block text-[11px] font-semibold uppercase tracking-wider text-slate-300">Nome del personaggio</label><input type="text" id="token-name" placeholder="es. Paladino, Drago, Scheletro..." class="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-white placeholder:text-slate-600 transition focus:border-emerald-400/70 focus:outline-none focus:ring-2 focus:ring-emerald-400/15"></div>
                            <div class="space-y-2"><label for="token-category" class="block text-[11px] font-semibold uppercase tracking-wider text-slate-300">Dove inserirlo</label><select id="token-category" class="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-white transition focus:border-emerald-400/70 focus:outline-none focus:ring-2 focus:ring-emerald-400/15"><option value="avventurieri">🛡️ Avventurieri</option><option value="nemici">👹 Nemici</option></select></div>
                            <div class="grid grid-cols-[5rem_1fr] gap-3"><div class="space-y-2"><label for="token-color" class="block text-[11px] font-semibold uppercase tracking-wider text-slate-300">Colore</label><input type="color" id="token-color" value="#dc2626" class="h-12 w-full cursor-pointer rounded-xl border border-slate-700 bg-slate-950 p-1.5"></div><div class="space-y-2"><label for="token-size" class="block text-[11px] font-semibold uppercase tracking-wider text-slate-300">Dimensione sulla griglia</label><select id="token-size" class="h-12 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-4 text-sm text-white transition focus:border-emerald-400/70 focus:outline-none focus:ring-2 focus:ring-emerald-400/15"><option value="1">Media (1x1)</option><option value="2">Grande (2x2)</option><option value="3">Enorme (3x3)</option><option value="4">Mastodontica (4x4)</option></select></div></div>
                            <div class="space-y-2"><label for="token-image" class="block text-[11px] font-semibold uppercase tracking-wider text-slate-300">Ritratto <span class="font-normal normal-case tracking-normal text-slate-500">facoltativo</span></label><div class="flex items-center gap-3 rounded-xl border border-dashed border-slate-700 bg-slate-950/50 p-3 transition hover:border-emerald-400/40"><input type="file" id="token-image" accept="image/*" class="min-w-0 flex-1 text-[11px] text-slate-400 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-xs file:font-medium file:text-slate-200 hover:file:bg-slate-700"><img id="token-image-preview" class="hidden h-12 w-12 rounded-xl border border-emerald-300/30 object-cover shadow-lg" alt="Anteprima immagine pedina"></div><p class="text-[10px] text-slate-500">Puoi aggiungere o cambiare il ritratto anche più avanti.</p></div>
                            <button id="btn-create-token" type="button" class="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-950/40 transition hover:-translate-y-0.5 hover:from-emerald-400 hover:to-teal-400 focus:outline-none focus:ring-2 focus:ring-emerald-300"><svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Aggiungi alla palette</button>
                        </div>
                    </section>
                </div>
                <div id="edit-modal" class="fixed inset-0 z-50 hidden flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
                    <div class="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-800 p-4 text-xs shadow-2xl">
                        <h3 class="mb-3 text-sm font-bold text-white">Modifica Pedina</h3>
                        <div class="mb-4 space-y-3">
                            <div><label for="edit-token-name" class="mb-1 block text-slate-400">Nome</label><input type="text" id="edit-token-name" class="w-full rounded border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-white focus:border-indigo-500 focus:outline-none"></div>
                            <div id="edit-token-category-field"><label for="edit-token-category" class="mb-1 block text-slate-400">Categoria</label><select id="edit-token-category" class="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-white focus:border-indigo-500 focus:outline-none"><option value="avventurieri">Avventurieri</option><option value="nemici">Nemici</option></select></div>
                            <div class="flex gap-2"><div class="w-16"><label for="edit-token-color" class="mb-1 block text-slate-400">Colore</label><input type="color" id="edit-token-color" class="h-8 w-full cursor-pointer rounded border border-slate-600 bg-slate-900 p-0.5"></div><div class="flex-1"><label for="edit-token-size" class="mb-1 block text-slate-400">Taglia (Quadretti)</label><select id="edit-token-size" class="h-8 w-full rounded border border-slate-600 bg-slate-900 px-2 text-white focus:border-indigo-500 focus:outline-none"><option value="1">Media (1x1)</option><option value="2">Grande (2x2)</option><option value="3">Enorme (3x3)</option><option value="4">Mastodontica (4x4)</option></select></div></div>
                            <div><div class="mb-1 flex items-center justify-between"><label for="edit-token-opacity" class="text-slate-400">Opacità colore</label><span id="edit-token-opacity-value" class="text-slate-300">100%</span></div><input type="range" id="edit-token-opacity" min="0" max="100" value="100" class="w-full accent-indigo-500"></div>
                            <div><label for="edit-token-image" class="mb-1 block text-slate-400">Immagine pedina</label><div class="flex items-center gap-2"><input type="file" id="edit-token-image" accept="image/*" class="min-w-0 flex-1 text-[10px] text-slate-300 file:mr-2 file:rounded file:border-0 file:bg-slate-700 file:px-2 file:py-1 file:text-slate-200"><img id="edit-token-image-preview" class="hidden h-9 w-9 rounded-full border border-white/50 object-cover" alt="Anteprima immagine pedina"><button id="btn-clear-edit-image" type="button" class="text-slate-400 hover:text-rose-300">Rimuovi</button></div></div>
                        </div>
                        <div class="flex justify-end gap-2"><button id="btn-modal-cancel" type="button" class="rounded bg-slate-700 px-3 py-1.5 font-medium text-slate-300 transition hover:bg-slate-600">Annulla</button><button id="btn-modal-save" type="button" class="rounded bg-indigo-600 px-3 py-1.5 font-medium text-white transition hover:bg-indigo-500">Salva Modifiche</button></div>
                    </div>
                </div>`);
        }

        bindEvents() {
            const $ = id => document.getElementById(id);
            const createModal = $('token-create-modal');
            const editModal = $('edit-modal');
            const createButton = $('btn-open-token-create');
            const createImageInput = $('token-image');
            const createPreview = $('token-image-preview');

            const closeCreate = () => {
                createModal.classList.add('hidden');
                createModal.classList.remove('flex');
                createButton.focus();
            };
            createButton.addEventListener('click', () => {
                createModal.classList.remove('hidden');
                createModal.classList.add('flex');
                $('token-name').focus();
            });
            $('btn-close-token-create').addEventListener('click', closeCreate);
            createModal.addEventListener('click', event => { if (event.target === createModal) closeCreate(); });
            window.addEventListener('keydown', event => {
                if (event.key === 'Escape' && !createModal.classList.contains('hidden')) closeCreate();
                else if (event.key === 'Escape' && !editModal.classList.contains('hidden')) this.closeEditModal();
            });

            createImageInput.addEventListener('change', async () => {
                const file = createImageInput.files[0];
                if (!file) return;
                try {
                    this.pendingTokenImage = await this.makeThumbnail(file);
                    createPreview.src = this.pendingTokenImage;
                    createPreview.classList.remove('hidden');
                } catch (error) {
                    this.pendingTokenImage = null;
                    createPreview.classList.add('hidden');
                    this.context?.showToast(error.message);
                }
            });
            $('btn-create-token').addEventListener('click', () => {
                const state = this.context?.state;
                if (!state) return;
                const name = $('token-name').value.trim() || 'Pedina';
                state.palette.push({
                    id: 'pal_' + Date.now() + Math.random().toString(16).slice(2),
                    name,
                    color: $('token-color').value,
                    size: parseInt($('token-size').value, 10),
                    category: $('token-category').value,
                    opacity: 100,
                    image: this.pendingTokenImage,
                    hidden: false
                });
                $('token-name').value = '';
                this.pendingTokenImage = null;
                createImageInput.value = '';
                createPreview.removeAttribute('src');
                createPreview.classList.add('hidden');
                this.renderPalette();
                closeCreate();
            });

            for (const [category, id] of [['avventurieri', 'token-palette-adventurers'], ['nemici', 'token-palette-enemies']]) {
                const container = $(id);
                container.addEventListener('dragover', event => {
                    if (!Array.from(event.dataTransfer.types).includes('application/x-mappadnd-palette-token')) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                });
                container.addEventListener('drop', event => {
                    const templateId = event.dataTransfer.getData('application/x-mappadnd-palette-token');
                    if (!templateId) return;
                    event.preventDefault();
                    event.stopPropagation();
                    const template = this.context?.state.palette.find(item => item.id === templateId);
                    if (!template || (template.category === 'nemici' ? 'nemici' : 'avventurieri') === category) return;
                    template.category = category;
                    this.renderPalette();
                    this.context.showToast(`"${template.name}" spostata in ${category === 'nemici' ? 'Nemici' : 'Avventurieri'}.`);
                });
            }

            $('edit-token-opacity').addEventListener('input', event => { $('edit-token-opacity-value').textContent = `${event.target.value}%`; });
            $('edit-token-image').addEventListener('change', async event => {
                const file = event.target.files[0];
                if (!file) return;
                try {
                    this.pendingEditImage = await this.makeThumbnail(file);
                    this.editImageChanged = true;
                    this.showEditImagePreview(this.pendingEditImage);
                } catch (error) { this.context?.showToast(error.message); }
            });
            $('btn-clear-edit-image').addEventListener('click', () => {
                this.pendingEditImage = null;
                this.editImageChanged = true;
                $('edit-token-image').value = '';
                this.showEditImagePreview(null);
            });
            $('btn-modal-cancel').addEventListener('click', () => this.closeEditModal());
            $('btn-modal-save').addEventListener('click', () => this.saveEditModal());
        }

        async makeThumbnail(file) {
            if (!file || !file.type.startsWith('image/')) throw new Error('Seleziona un file immagine valido.');
            const source = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(new Error('Impossibile leggere il file immagine.'));
                reader.readAsDataURL(file);
            });
            const image = await new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error('Impossibile aprire il file immagine.'));
                img.src = source;
            });
            const scale = Math.min(1, 256 / Math.max(image.naturalWidth, image.naturalHeight));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
            canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL('image/webp', 0.8);
        }

        renderPalette() {
            if (!this.context) return;
            const { state, colorWithOpacity, renderBoardTokens, saveTokens, showToast } = this.context;
            const containers = {
                avventurieri: document.getElementById('token-palette-adventurers'),
                nemici: document.getElementById('token-palette-enemies')
            };
            Object.values(containers).forEach(container => {
                container.querySelectorAll('.palette-item').forEach(item => item.remove());
                container.querySelector('.empty-category-msg').style.display = 'block';
            });
            document.getElementById('adventurer-token-count').textContent = state.palette.filter(item => (item.category || 'avventurieri') === 'avventurieri').length;
            document.getElementById('enemy-token-count').textContent = state.palette.filter(item => item.category === 'nemici').length;

            state.palette.forEach(template => {
                const category = template.category === 'nemici' ? 'nemici' : 'avventurieri';
                const target = containers[category];
                target.querySelector('.empty-category-msg').style.display = 'none';
                const item = document.createElement('div');
                item.className = 'palette-item bg-slate-800/90 border border-slate-700 rounded-lg p-1.5 flex items-center gap-2 hover:bg-slate-700 transition select-none';
                item.draggable = !window.matchMedia('(pointer: coarse)').matches;
                item.addEventListener('dragstart', event => {
                    event.dataTransfer.setData('text/plain', JSON.stringify(template));
                    event.dataTransfer.setData('application/x-mappadnd-palette-token', template.id);
                    event.dataTransfer.effectAllowed = 'copyMove';
                });
                item.addEventListener('click', event => {
                    if (event.target.closest('button')) return;
                    if (window.matchMedia('(pointer: coarse)').matches) this.placeTokenAtMapCenter(template);
                });
                item.innerHTML = `<div class="palette-avatar w-7 h-7 rounded-full border border-white/60 flex items-center justify-center text-[10px] font-bold shadow shrink-0">${template.name.substring(0, 2).toUpperCase()}</div><div class="flex-1 overflow-hidden"><p class="font-semibold text-white truncate text-xs">${template.name}</p><p class="text-[10px] text-slate-400 leading-tight">${template.size}x${template.size} quadretti</p></div><button class="btn-toggle-token-visibility p-1 text-slate-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-40" type="button"></button><button class="btn-edit-pal p-1 text-slate-400 hover:text-white" title="Modifica pedina" type="button">✏️</button><button class="btn-del-pal p-1 text-slate-400 hover:text-rose-400" title="Elimina dalla lista" type="button">🗑️</button>`;
                const avatar = item.querySelector('.palette-avatar');
                avatar.style.backgroundColor = colorWithOpacity(template.color, template.opacity ?? 100);
                if (template.image) {
                    avatar.style.backgroundImage = `url("${template.image}")`;
                    avatar.style.backgroundSize = 'cover';
                    avatar.style.backgroundPosition = 'center';
                    avatar.textContent = '';
                }

                const linkedTokens = () => state.boardTokens.filter(token => token.templateId === template.id || (!token.templateId && token.name === template.name && token.color === template.color && token.size === template.size));
                const visibilityButton = item.querySelector('.btn-toggle-token-visibility');
                const updateVisibilityButton = () => {
                    const linked = linkedTokens();
                    const allHidden = linked.length > 0 ? linked.every(token => token.hidden) : Boolean(template.hidden);
                    const isPlayerMode = this.context.isPlayerMode();
                    template.hidden = allHidden;
                    if (allHidden && linked.length) {
                        const origins = new Set(linked.map(token => token.hiddenBy || 'master'));
                        template.hiddenBy = origins.size === 1 ? origins.values().next().value : 'master';
                    } else if (!allHidden) template.hiddenBy = null;
                    const canPlayerToggle = linked.some(token => !(token.hidden && (token.hiddenBy || 'master') === 'master'))
                        || (!linked.length && !(template.hidden && (template.hiddenBy || 'master') === 'master'));
                    visibilityButton.disabled = isPlayerMode && !canPlayerToggle;
                    visibilityButton.textContent = allHidden ? '🙈' : '👁️';
                    visibilityButton.title = isPlayerMode
                        ? (canPlayerToggle
                            ? (allHidden ? 'Mostra normalmente i tuoi avventurieri' : 'Attenua i tuoi avventurieri sulla mappa')
                            : 'Il Master ha nascosto questa pedina')
                        : (allHidden ? 'Mostra le pedine ai Player (anche quelle future)' : 'Nascondi le pedine ai Player (anche quelle future)');
                    visibilityButton.setAttribute('aria-label', visibilityButton.title);
                };
                updateVisibilityButton();
                visibilityButton.addEventListener('click', event => {
                    event.stopPropagation();
                    const linked = linkedTokens();
                    const isPlayerMode = this.context.isPlayerMode();
                    if (isPlayerMode) {
                        const playerControlledTokens = linked.filter(token => !(token.hidden && (token.hiddenBy || 'master') === 'master'));
                        if (!playerControlledTokens.length && template.hidden && (template.hiddenBy || 'master') === 'master') return;
                        const shouldHide = playerControlledTokens.length
                            ? playerControlledTokens.some(token => !(token.hidden && token.hiddenBy === 'player'))
                            : !template.hidden;
                        template.hidden = shouldHide;
                        template.hiddenBy = shouldHide ? 'player' : null;
                        playerControlledTokens.forEach(token => {
                            token.hidden = shouldHide;
                            token.hiddenBy = template.hiddenBy;
                        });
                    } else {
                        const shouldHide = linked.length > 0
                            ? linked.some(token => !token.hidden)
                            : !template.hidden;
                        template.hidden = shouldHide;
                        template.hiddenBy = shouldHide ? 'master' : null;
                        linked.forEach(token => {
                            token.hidden = shouldHide;
                            token.hiddenBy = template.hiddenBy;
                        });
                    }
                    renderBoardTokens();
                    updateVisibilityButton();
                });
                item.querySelector('.btn-edit-pal').addEventListener('click', event => {
                    event.stopPropagation();
                    this.openEditModal('palette', template.id);
                });
                item.querySelector('.btn-del-pal').addEventListener('click', event => {
                    event.stopPropagation();
                    const count = linkedTokens().length;
                    const warning = count ? ` Verranno eliminate anche ${count} pedine già posizionate sulla mappa.` : '';
                    if (!window.confirm(`Eliminare "${template.name}" dalla palette?${warning}`)) return;
                    state.palette = state.palette.filter(entry => entry.id !== template.id);
                    state.boardTokens = state.boardTokens.filter(token => token.templateId ? token.templateId !== template.id : token.name !== template.name || token.color !== template.color || token.size !== template.size);
                    this.renderPalette();
                    renderBoardTokens();
                });
                target.appendChild(item);
            });
            saveTokens();
        }

        showEditImagePreview(image) {
            const preview = document.getElementById('edit-token-image-preview');
            if (image) {
                preview.src = image;
                preview.classList.remove('hidden');
            } else {
                preview.removeAttribute('src');
                preview.classList.add('hidden');
            }
        }

        openEditModal(type, id) {
            const state = this.context?.state;
            if (!state) return;
            const item = type === 'palette' ? state.palette.find(entry => entry.id === id) : state.boardTokens.find(entry => entry.id === id);
            if (!item) return;
            state.editing = { type, id };
            document.getElementById('edit-token-category-field').classList.toggle('hidden', this.context.isPlayerMode());
            document.getElementById('edit-token-name').value = item.name;
            document.getElementById('edit-token-color').value = item.color;
            document.getElementById('edit-token-category').value = item.category === 'nemici' ? 'nemici' : 'avventurieri';
            document.getElementById('edit-token-size').value = item.size;
            document.getElementById('edit-token-opacity').value = item.opacity ?? 100;
            document.getElementById('edit-token-opacity-value').textContent = `${item.opacity ?? 100}%`;
            this.pendingEditImage = item.image || null;
            this.editImageChanged = false;
            document.getElementById('edit-token-image').value = '';
            this.showEditImagePreview(this.pendingEditImage);
            const modal = document.getElementById('edit-modal');
            modal.classList.remove('hidden');
            document.getElementById('edit-token-name').focus();
        }

        closeEditModal() {
            document.getElementById('edit-modal').classList.add('hidden');
            if (this.context) this.context.state.editing = null;
            this.pendingEditImage = null;
            this.editImageChanged = false;
        }

        saveEditModal() {
            const { state, renderBoardTokens } = this.context;
            if (!state.editing) return;
            const { type, id } = state.editing;
            const name = document.getElementById('edit-token-name').value.trim() || 'Pedina';
            const color = document.getElementById('edit-token-color').value;
            const size = parseInt(document.getElementById('edit-token-size').value, 10);
            const opacity = parseInt(document.getElementById('edit-token-opacity').value, 10);

            if (type === 'palette') {
                const item = state.palette.find(entry => entry.id === id);
                if (item) {
                    const previous = { name: item.name, color: item.color, size: item.size };
                    const linked = state.boardTokens.filter(token => token.templateId === item.id || (!token.templateId && token.name === previous.name && token.color === previous.color && token.size === previous.size));
                    Object.assign(item, {
                        name,
                        color,
                        size,
                        ...(this.context.isPlayerMode() ? {} : { category: document.getElementById('edit-token-category').value }),
                        opacity
                    });
                    if (this.editImageChanged) item.image = this.pendingEditImage;
                    linked.forEach(token => {
                        token.color = color;
                        token.opacity = opacity;
                        if (this.editImageChanged) token.image = this.pendingEditImage;
                    });
                    this.renderPalette();
                    renderBoardTokens();
                }
            } else {
                const item = state.boardTokens.find(entry => entry.id === id);
                if (item) {
                    Object.assign(item, { name, color, size, opacity });
                    if (this.editImageChanged) item.image = this.pendingEditImage;
                    item.x = Math.max(0, Math.min(item.x, state.map.cols - size));
                    item.y = Math.max(0, Math.min(item.y, state.map.rows - size));
                    renderBoardTokens();
                }
            }
            this.closeEditModal();
        }
    }

    customElements.define('token-manager', TokenManager);
})();
