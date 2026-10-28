(() => {
    const LOGIN_GATE_KEY = 'dnd-cloud-login-approved';
    const config = window.MAP_CLOUD_CONFIG || {};
    const cloudEnabled = Boolean(config.url && config.anonKey && window.supabase?.createClient);
    const client = cloudEnabled ? window.supabase.createClient(config.url, config.anonKey, {
        auth: { persistSession: true, detectSessionInUrl: true }
    }) : null;
    const statusBox = document.getElementById('sessions-status');
    const list = document.getElementById('sessions-list');
    const createButton = document.getElementById('create-session-submit');
    const joinButton = document.getElementById('join-session-submit');
    let currentUser = null;

    function showStatus(message, kind = 'error') {
        statusBox.textContent = message;
        statusBox.className = `mb-5 rounded-xl border px-4 py-3 text-sm leading-6 ${kind === 'error' ? 'border-rose-900/80 bg-rose-950/50 text-rose-200' : 'border-emerald-900/80 bg-emerald-950/50 text-emerald-200'}`;
    }

    function setBusy(busy) {
        createButton.disabled = busy;
        joinButton.disabled = busy;
        document.getElementById('refresh-sessions').disabled = busy;
    }

    function createEmptyMapState() {
        return {
            map: { cols: 20, rows: 15, widthPx: 800, heightPx: 600, bg: '#334155', showGrid: true, cellSize: 40, snapToGrid: true, autoFitImage: true },
            palette: [], boardTokens: [], savedMaps: []
        };
    }

    function openSession(session, role) {
        const params = new URLSearchParams({ entry: 'account', role, session: session.id, v: 'sessions-2' });
        const target = role === 'player' ? './player.html' : './master.html';
        window.location.assign(`${target}?${params.toString()}`);
    }

    function renderSessionCard(session, role) {
        const card = document.createElement('article');
        card.className = 'session-list-card';
        const content = document.createElement('div');
        content.className = 'min-w-0 flex-1';
        const title = document.createElement('h3');
        title.className = 'truncate font-bold text-white';
        title.textContent = session.name || 'Sessione senza nome';
        const subtitle = document.createElement('p');
        subtitle.className = 'mt-1 text-xs text-slate-400';
        const roleLabels = {
            master: { subtitle: 'La gestisci come Master', badge: 'MASTER' },
            player: { subtitle: 'Partecipi come Player', badge: 'PLAYER' },
            viewer: { subtitle: 'Accesso in sola visualizzazione', badge: 'VISUALIZZA' }
        };
        const roleInfo = roleLabels[role] || roleLabels.player;
        subtitle.textContent = roleInfo.subtitle;
        content.append(title, subtitle);
        const badge = document.createElement('span');
        badge.className = `session-role session-role-${role in roleLabels ? role : 'player'}`;
        badge.textContent = roleInfo.badge;

        const top = document.createElement('div');
        top.className = 'flex items-start justify-between gap-3';
        top.append(content, badge);
        card.append(top);

        if (role === 'master' && session.invite_code) {
            const invite = document.createElement('div');
            invite.className = 'mt-4 flex items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2';
            const code = document.createElement('code');
            code.className = 'font-mono text-sm font-bold tracking-[.18em] text-indigo-200';
            code.textContent = session.invite_code;
            const copy = document.createElement('button');
            copy.type = 'button';
            copy.className = 'text-xs font-semibold text-slate-400 hover:text-white';
            copy.textContent = 'Copia codice';
            copy.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(session.invite_code);
                    copy.textContent = 'Copiato!';
                    window.setTimeout(() => { copy.textContent = 'Copia codice'; }, 1600);
                } catch (error) {
                    showStatus(`Codice d’invito: ${session.invite_code}`, 'success');
                }
            });
            invite.append(code, copy);
            card.append(invite);
        }

        const open = document.createElement('button');
        open.type = 'button';
        open.className = 'session-open-button';
        open.textContent = 'Apri sessione';
        open.addEventListener('click', () => openSession(session, role));
        card.append(open);
        return card;
    }

    async function refreshSessions() {
        if (!currentUser) return;
        list.replaceChildren();
        const loading = document.createElement('div');
        loading.className = 'session-empty';
        loading.textContent = 'Carico le tue sessioni…';
        list.append(loading);

        const { data: owned, error: ownedError } = await client
            .from('game_sessions').select('id,name,owner_id,invite_code,created_at')
            .eq('owner_id', currentUser.id).order('created_at', { ascending: false });
        if (ownedError) throw ownedError;

        const { data: memberships, error: memberError } = await client
            .from('game_session_members').select('session_id,role').eq('user_id', currentUser.id);
        if (memberError) throw memberError;

        const ownedIds = new Set((owned || []).map(session => session.id));
        const joined = (memberships || []).filter(member => !ownedIds.has(member.session_id));
        let shared = [];
        if (joined.length) {
            const { data, error } = await client.from('game_sessions')
                .select('id,name,owner_id,invite_code,created_at').in('id', joined.map(item => item.session_id))
                .order('created_at', { ascending: false });
            if (error) throw error;
            const roleBySession = new Map(joined.map(item => [item.session_id, item.role]));
            shared = (data || []).map(session => ({ ...session, role: roleBySession.get(session.id) || 'player' }));
        }

        list.replaceChildren();
        const sessions = [
            ...(owned || []).map(session => ({ ...session, role: 'master' })),
            ...shared
        ];
        statusBox.classList.add('hidden');
        if (!sessions.length) {
            const empty = document.createElement('div');
            empty.className = 'session-empty';
            empty.textContent = 'Non hai ancora sessioni. Creane una o inserisci un codice d’invito.';
            list.append(empty);
            return;
        }
        sessions.forEach(session => {
            const role = ['master', 'player', 'viewer'].includes(session.role) ? session.role : 'player';
            list.append(renderSessionCard(session, role));
        });
    }

    async function initialize() {
        if (!client) {
            showStatus('Configura Supabase prima di usare le sessioni.');
            return;
        }
        const { data, error } = await client.auth.getSession();
        if (error || !data.session) {
            try { sessionStorage.removeItem(LOGIN_GATE_KEY); } catch (storageError) {}
            window.location.replace('./login.html');
            return;
        }
        currentUser = data.session.user;
        document.getElementById('session-user-email').textContent = currentUser.email || '';
        try {
            await refreshSessions();
        } catch (error) {
            console.error('Impossibile caricare le sessioni:', error);
            showStatus('Non riesco a caricare le sessioni. Verifica di aver eseguito supabase-sessions.sql nel progetto Supabase.');
            list.replaceChildren();
            const empty = document.createElement('div');
            empty.className = 'session-empty';
            empty.textContent = 'Le sessioni non sono ancora configurate nel cloud.';
            list.append(empty);
        }
    }

    document.getElementById('create-session-form').addEventListener('submit', async event => {
        event.preventDefault();
        const name = document.getElementById('new-session-name').value.trim();
        if (!name || !currentUser) return;
        setBusy(true);
        try {
            const { data, error } = await client.from('game_sessions').insert({
                owner_id: currentUser.id,
                name,
                state: createEmptyMapState()
            }).select('id,name,owner_id,invite_code').single();
            if (error) throw error;
            openSession(data, 'master');
        } catch (error) {
            console.error('Creazione sessione non riuscita:', error);
            showStatus(error.message || 'Non riesco a creare la sessione. Controlla la configurazione Supabase.');
        } finally {
            setBusy(false);
        }
    });

    document.getElementById('join-session-form').addEventListener('submit', async event => {
        event.preventDefault();
        const code = document.getElementById('session-invite-code').value.trim().toUpperCase();
        const role = document.getElementById('session-join-role').value;
        if (!code || !currentUser) return;
        setBusy(true);
        try {
            const { data, error } = await client.rpc('join_game_session', { p_invite_code: code, p_role: role });
            if (error) throw error;
            const sessionId = typeof data === 'string' ? data : data?.id;
            if (!sessionId) throw new Error('Il codice è stato accettato, ma non riesco a identificare la sessione.');
            openSession({ id: sessionId }, role);
        } catch (error) {
            console.error('Accesso alla sessione non riuscito:', error);
            showStatus(error.message || 'Codice non valido o impossibile unirsi alla sessione.');
        } finally {
            setBusy(false);
        }
    });

    document.getElementById('refresh-sessions').addEventListener('click', async () => {
        setBusy(true);
        try { await refreshSessions(); }
        catch (error) { showStatus(error.message || 'Non riesco ad aggiornare le sessioni.'); }
        finally { setBusy(false); }
    });

    document.getElementById('session-sign-out').addEventListener('click', async () => {
        await client?.auth.signOut({ scope: 'local' });
        try { sessionStorage.removeItem(LOGIN_GATE_KEY); } catch (error) {}
        window.location.replace('./login.html');
    });

    initialize().catch(error => {
        console.error('Errore nella pagina sessioni:', error);
        showStatus(error.message || 'Impossibile aprire la pagina sessioni.');
    });
})();
