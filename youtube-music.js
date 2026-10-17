(() => {
    const DEFAULT_PRESETS = [
        { name: 'Taverna', url: '4xDzrJKXOOY', icon: '🍺' },
        { name: 'Combattimento', url: 'k3WKVGKA9E4', icon: '⚔️' },
        { name: 'Dungeon', url: 'g6h0m4_Qy1s', icon: '🕯️' },
        { name: 'Foresta', url: 'oW_E5z5Pj_E', icon: '🌲' }
    ];

    class YouTubeMusic extends HTMLElement {
        constructor() {
            super();
            this.settings = this.normalizeSettings();
            this.player = null;
            this.playerReady = false;
            this.render();
        }

        connectedCallback() {
            this.setupEvents();
            this.loadYouTubeApi();
        }

        normalizeSettings(saved = {}) {
            const presets = Array.isArray(saved?.presets) ? saved.presets : DEFAULT_PRESETS;
            return {
                customUrl: typeof saved?.customUrl === 'string' ? saved.customUrl : '',
                presets: presets.slice(0, 20).map((preset, index) => ({
                    name: typeof preset?.name === 'string' ? preset.name : `Pulsante ${index + 1}`,
                    url: typeof preset?.url === 'string' ? preset.url : '',
                    icon: typeof preset?.icon === 'string' ? preset.icon : DEFAULT_PRESETS[index]?.icon || '🎵'
                }))
            };
        }

        getSettings() {
            return JSON.parse(JSON.stringify(this.settings));
        }

        setSettings(settings, { emit = false } = {}) {
            this.settings = this.normalizeSettings(settings);
            const customUrlInput = this.querySelector('[data-role="custom-url"]');
            if (customUrlInput) customUrlInput.value = this.settings.customUrl;
            this.renderPresets();
            if (emit) this.emitSettingsChange();
            return this.getSettings();
        }

        emitSettingsChange() {
            this.dispatchEvent(new CustomEvent('music-settings-change', {
                bubbles: true,
                detail: this.getSettings()
            }));
        }

        emitToast(message) {
            this.dispatchEvent(new CustomEvent('music-toast', { bubbles: true, detail: message }));
        }

        render() {
            this.innerHTML = `
                <style>
                    .youtube-music-wave { animation: youtube-music-bounce 1s infinite ease-in-out; }
                    @keyframes youtube-music-bounce { 0%, 100% { height: 4px; } 50% { height: 16px; } }
                </style>
                <section class="w-full rounded-2xl border border-slate-600/40 bg-gradient-to-br from-slate-800/90 to-slate-900/95 p-4 text-xs shadow-lg shadow-slate-950/20">
                    <div class="mb-3 flex items-center justify-between gap-2">
                        <h2 class="font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                            <svg class="w-3.5 h-3.5 text-red-500" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/></svg>
                            Musica YouTube
                        </h2>
                        <button data-action="stop" type="button" class="shrink-0 rounded-md border border-rose-800 bg-rose-950/60 px-2.5 py-1.5 text-[10px] text-rose-300 transition hover:text-white">Ferma</button>
                    </div>
                    <div class="mb-3 flex items-stretch gap-2">
                        <input data-role="custom-url" type="text" placeholder="Incolla link YouTube..." class="min-w-0 flex-1 truncate rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500">
                        <button data-action="play-custom" type="button" class="shrink-0 rounded-md bg-indigo-600 px-3.5 py-2 font-semibold text-white transition hover:bg-indigo-500">Avvia</button>
                    </div>
                    <div data-role="preset-buttons" class="mb-3 grid grid-cols-2 gap-2"></div>
                    <button data-action="open-settings" type="button" aria-haspopup="dialog" class="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-indigo-400/30 bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-950/30 transition hover:-translate-y-0.5 hover:from-indigo-500 hover:to-violet-500 focus:outline-none focus:ring-2 focus:ring-indigo-300">
                        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/><path d="m19.4 15 .1.1a1.7 1.7 0 0 1-2.4 2.4l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a1.7 1.7 0 0 1-3.4 0v-.2a1.7 1.7 0 0 0-2.9-1.2l-.1.1a1.7 1.7 0 0 1-2.4-2.4l.1-.1a1.7 1.7 0 0 0-1.2-2.9H4a1.7 1.7 0 0 1 0-3.4h.2a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a1.7 1.7 0 0 1 2.4-2.4l.1.1a1.7 1.7 0 0 0 2.9-1.2V2a1.7 1.7 0 0 1 3.4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a1.7 1.7 0 0 1 2.4 2.4l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a1.7 1.7 0 0 1 0 3.4h-.2a1.7 1.7 0 0 0-1.2 2.9Z"/></svg>
                        <span>Personalizza musica</span>
                    </button>
                    <div data-role="status" class="mt-3 hidden items-center gap-2 rounded-md border border-slate-800 bg-slate-950 p-2.5">
                        <div class="flex h-3 items-end gap-0.5"><span class="youtube-music-wave w-1 bg-emerald-400" style="animation-delay:.1s"></span><span class="youtube-music-wave w-1 bg-emerald-400" style="animation-delay:.3s"></span><span class="youtube-music-wave w-1 bg-emerald-400" style="animation-delay:.2s"></span></div>
                        <span data-role="track-name" class="flex-1 truncate text-[11px] font-medium text-slate-300">In riproduzione...</span>
                    </div>
                    <div data-role="player-container" class="mt-3 hidden overflow-hidden rounded-lg border border-slate-700 bg-black"><div data-role="player"></div></div>
                </section>
                <div data-role="settings-modal" class="fixed inset-0 z-50 hidden items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm" role="presentation">
                    <section role="dialog" aria-modal="true" aria-labelledby="music-settings-title" class="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-600/70 bg-slate-900 shadow-2xl shadow-black/50">
                        <header class="flex items-center justify-between border-b border-slate-700 bg-gradient-to-r from-indigo-950 to-slate-900 px-5 py-4">
                            <div><h2 id="music-settings-title" class="text-base font-bold text-white">Personalizza musica</h2><p class="mt-1 text-xs text-slate-400">Modifica i nomi e i link dei pulsanti.</p></div>
                            <button data-action="close-settings" type="button" aria-label="Chiudi personalizzazione musica" class="rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-300 transition hover:bg-slate-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400"><svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M4.22 4.22a.75.75 0 0 1 1.06 0L10 8.94l4.72-4.72a.75.75 0 1 1 1.06 1.06L11.06 10l4.72 4.72a.75.75 0 1 1-1.06 1.06L10 11.06l-4.72 4.72a.75.75 0 1 1-1.06-1.06L8.94 10 4.22 5.28a.75.75 0 0 1 0-1.06Z"/></svg></button>
                        </header>
                        <div class="max-h-[70vh] overflow-y-auto p-5">
                            <button data-action="add-preset" type="button" class="mb-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-600/15 px-3 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-600/25 focus:outline-none focus:ring-2 focus:ring-emerald-400"><span class="text-lg leading-none" aria-hidden="true">＋</span> Aggiungi pulsante musicale</button>
                            <div data-role="preset-editor" class="space-y-3"></div>
                        </div>
                    </section>
                </div>`;
            this.querySelector('[data-role="custom-url"]').value = this.settings.customUrl;
            this.renderPresets();
        }

        renderPresets() {
            const buttons = this.querySelector('[data-role="preset-buttons"]');
            const editor = this.querySelector('[data-role="preset-editor"]');
            if (!buttons || !editor) return;
            buttons.replaceChildren();
            editor.replaceChildren();

            this.settings.presets.forEach((preset, index) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.dataset.action = 'play-preset';
                button.dataset.slot = String(index);
                button.className = 'flex min-w-0 items-center gap-1.5 truncate rounded-lg border border-slate-700 bg-slate-900 p-2 text-left text-xs font-medium text-slate-200 transition hover:border-indigo-400/50 hover:bg-slate-800 hover:text-white';
                const icon = document.createElement('span');
                icon.textContent = preset.icon;
                const label = document.createElement('span');
                label.className = 'truncate';
                label.textContent = preset.name || `Pulsante ${index + 1}`;
                button.append(icon, label);
                buttons.appendChild(button);

                const group = document.createElement('div');
                group.className = 'space-y-2 rounded-xl border border-slate-700 bg-slate-950/70 p-3';
                const header = document.createElement('div');
                header.className = 'flex items-center justify-between gap-2';
                const title = document.createElement('span');
                title.className = 'text-xs font-semibold text-slate-200';
                title.textContent = `Pulsante musicale ${index + 1}`;
                const remove = document.createElement('button');
                remove.type = 'button';
                remove.dataset.action = 'remove-preset';
                remove.dataset.slot = String(index);
                remove.className = 'rounded-md border border-rose-900/70 bg-rose-950/50 px-2 py-1 text-[11px] font-medium text-rose-300 transition hover:bg-rose-900/60 hover:text-white';
                remove.textContent = 'Rimuovi';
                header.append(title, remove);

                const nameLabel = document.createElement('label');
                nameLabel.className = 'block text-slate-400';
                nameLabel.textContent = `Nome pulsante ${index + 1}`;
                const nameInput = document.createElement('input');
                nameInput.type = 'text';
                nameInput.value = preset.name;
                nameInput.maxLength = 40;
                nameInput.dataset.field = 'name';
                nameInput.dataset.slot = String(index);
                nameInput.className = 'w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-white focus:outline-none focus:border-indigo-500';

                const urlLabel = document.createElement('label');
                urlLabel.className = 'block text-slate-400';
                urlLabel.textContent = 'URL o ID YouTube';
                const urlInput = document.createElement('input');
                urlInput.type = 'text';
                urlInput.value = preset.url;
                urlInput.placeholder = 'https://www.youtube.com/watch?v=...';
                urlInput.dataset.field = 'url';
                urlInput.dataset.slot = String(index);
                urlInput.className = 'w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-white focus:outline-none focus:border-indigo-500';
                group.append(header, nameLabel, nameInput, urlLabel, urlInput);
                editor.appendChild(group);
            });
        }

        setupEvents() {
            if (this.eventsReady) return;
            this.eventsReady = true;
            this.addEventListener('input', event => {
                const target = event.target;
                if (target.matches('[data-role="custom-url"]')) {
                    this.settings.customUrl = target.value;
                    this.emitSettingsChange();
                    return;
                }
                if (!target.matches('[data-field]')) return;
                const preset = this.settings.presets[Number(target.dataset.slot)];
                if (!preset) return;
                preset[target.dataset.field] = target.value.trim();
                if (target.dataset.field === 'name') {
                    const label = this.querySelector(`[data-action="play-preset"][data-slot="${target.dataset.slot}"] span:last-child`);
                    if (label) label.textContent = preset.name || `Pulsante ${Number(target.dataset.slot) + 1}`;
                }
                this.emitSettingsChange();
            });
            this.addEventListener('click', event => {
                if (event.target === this.querySelector('[data-role="settings-modal"]')) {
                    this.closeSettings();
                    return;
                }
                const action = event.target.closest('[data-action]')?.dataset.action;
                if (!action) return;
                if (action === 'open-settings') this.openSettings();
                if (action === 'close-settings') this.closeSettings();
                if (action === 'add-preset') this.addPreset();
                if (action === 'remove-preset') this.removePreset(Number(event.target.closest('[data-action]').dataset.slot));
                if (action === 'stop') this.stopAudio();
                if (action === 'play-custom') this.playCustom();
                if (action === 'play-preset') this.playPreset(Number(event.target.closest('[data-action]').dataset.slot));
            });
            window.addEventListener('keydown', event => {
                if (event.key === 'Escape' && !this.querySelector('[data-role="settings-modal"]').classList.contains('hidden')) this.closeSettings();
            });
        }

        openSettings() {
            const modal = this.querySelector('[data-role="settings-modal"]');
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            this.querySelector('[data-action="close-settings"]').focus();
        }

        closeSettings() {
            const modal = this.querySelector('[data-role="settings-modal"]');
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            this.querySelector('[data-action="open-settings"]').focus();
        }

        addPreset() {
            if (this.settings.presets.length >= 20) {
                this.emitToast('Puoi aggiungere fino a 20 pulsanti musicali.');
                return;
            }
            this.settings.presets.push({ name: `Nuova musica ${this.settings.presets.length + 1}`, url: '', icon: '🎵' });
            this.renderPresets();
            this.emitSettingsChange();
        }

        removePreset(index) {
            this.settings.presets.splice(index, 1);
            this.renderPresets();
            this.emitSettingsChange();
        }

        extractYouTubeID(value) {
            const url = String(value || '').trim();
            if (/^[\w-]{11}$/.test(url)) return url;
            try {
                const parsed = new URL(url);
                const host = parsed.hostname.replace(/^www\./, '');
                if (host === 'youtu.be') return parsed.pathname.slice(1).split('/')[0] || null;
                if (host.endsWith('youtube.com')) {
                    const queryId = parsed.searchParams.get('v');
                    if (queryId) return queryId;
                    const match = parsed.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{11})/);
                    if (match) return match[1];
                }
            } catch (error) {}
            return null;
        }

        playCustom() {
            const videoId = this.extractYouTubeID(this.querySelector('[data-role="custom-url"]').value);
            if (!videoId) return this.emitToast('URL YouTube non valido o non riconosciuto.');
            this.playYouTubeAudio(videoId, 'Traccia Personalizzata');
        }

        playPreset(index) {
            const preset = this.settings.presets[index];
            const videoId = this.extractYouTubeID(preset?.url);
            if (!videoId) return this.emitToast('Inserisci un link o ID YouTube valido per questo pulsante.');
            this.playYouTubeAudio(videoId, preset.name || 'Musica');
        }

        loadYouTubeApi() {
            if (window.YT?.Player) return this.createPlayer();
            const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
            const previousReady = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = () => {
                if (typeof previousReady === 'function') previousReady();
                this.createPlayer();
            };
            if (!existing) {
                const script = document.createElement('script');
                script.src = 'https://www.youtube.com/iframe_api';
                document.head.appendChild(script);
            }
        }

        createPlayer() {
            if (this.player || !window.YT?.Player) return;
            this.player = new YT.Player(this.querySelector('[data-role="player"]'), {
                height: '200',
                width: '260',
                playerVars: { autoplay: 0, controls: 1, playsinline: 1 },
                events: {
                    onReady: () => { this.playerReady = true; },
                    onStateChange: event => {
                        if (event.data === YT.PlayerState.PLAYING) {
                            this.querySelector('[data-role="status"]').classList.remove('hidden');
                            this.querySelector('[data-role="status"]').classList.add('flex');
                            this.emitToast('Riproduzione avviata.');
                        }
                    },
                    onError: event => {
                        const messages = {
                            2: 'ID video non valido.',
                            5: 'Il video non è riproducibile nel player HTML5.',
                            100: 'Video non trovato o non più disponibile.',
                            101: 'Il proprietario non consente la riproduzione incorporata.',
                            150: 'Il proprietario non consente la riproduzione incorporata.',
                            153: 'YouTube non riceve i dati di origine. Riprova da una pagina servita via HTTP.'
                        };
                        this.emitToast(messages[event.data] || `Errore del player YouTube (${event.data}).`);
                    }
                }
            });
        }

        playYouTubeAudio(videoId, trackTitle) {
            if (!this.playerReady || !this.player) return this.emitToast('Caricamento player YouTube in corso...');
            this.querySelector('[data-role="player-container"]').classList.remove('hidden');
            this.player.loadVideoById(videoId);
            this.player.playVideo();
            this.querySelector('[data-role="track-name"]').textContent = trackTitle;
            this.emitToast('Avvio del player YouTube...');
        }

        stopAudio() {
            if (this.player && typeof this.player.stopVideo === 'function') this.player.stopVideo();
            this.querySelector('[data-role="status"]').classList.add('hidden');
            this.querySelector('[data-role="status"]').classList.remove('flex');
            this.querySelector('[data-role="player-container"]').classList.add('hidden');
            this.emitToast('Audio fermato.');
        }
    }

    customElements.define('youtube-music', YouTubeMusic);
})();
