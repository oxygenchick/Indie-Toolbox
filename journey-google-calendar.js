/* Optional one-way export of dated Journey Book tasks to a selected calendar. */
const JourneyCalendar = (() => {
    const SCOPES = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly';
    const API = 'https://www.googleapis.com/calendar/v3';
    const CLIENT_KEY = 'indietoolbox_google_calendar_client_id';
    let token = '';
    let tokenExpiresAt = 0;
    let clientId = '';
    let dialog = null;
    let guideDialog = null;
    let syncQueue = Promise.resolve();
    let lastSynced = '';
    let syncTimer = null;

    function label(key) { return I18n.t('calendar.' + key); }
    function status(message, error = false) {
        const target = dialog?.querySelector('[data-calendar-status]');
        if (target) { target.textContent = message; target.style.color = error ? '#a00000' : ''; }
        const button = document.getElementById('calendar-sync-button');
        if (button) button.title = message;
    }
    function savedClientId() { try { return localStorage.getItem(CLIENT_KEY) || ''; } catch (_) { return ''; } }
    function rememberClientId(value) { try { localStorage.setItem(CLIENT_KEY, value); } catch (_) {} }
    function activeToken() { return !!token && tokenExpiresAt > Date.now() + 30000; }
    function forgetToken() {
        token = '';
        tokenExpiresAt = 0;
        updateButton();
        if (calendarSync?.accessToken) {
            delete calendarSync.accessToken;
            delete calendarSync.tokenExpiresAt;
            save();
        }
    }
    function updateButton() {
        const button = document.getElementById('calendar-sync-button');
        if (button) button.textContent = calendarSync?.calendarId && activeToken() ? label('connectedButton') : label('button');
    }
    function onFileLoaded() {
        token = '';
        tokenExpiresAt = 0;
        clientId = calendarSync?.clientId || savedClientId();
        const migrateClientId = !!calendarSync && !calendarSync.clientId && !!clientId;
        if (migrateClientId) calendarSync.clientId = clientId;
        if (migrateClientId) queueMicrotask(() => { if (fileHandle) save(); });
        if (calendarSync?.clientId && calendarSync.accessToken && calendarSync.tokenExpiresAt > Date.now() + 30000) {
            token = calendarSync.accessToken;
            tokenExpiresAt = calendarSync.tokenExpiresAt;
            queueMicrotask(() => { if (fileHandle && activeToken()) enqueue(); });
        }
        lastSynced = '';
        clearTimeout(syncTimer);
        updateButton();
        if (dialog) dialog.close();
    }
    function validDay(day) {
        if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
        const date = new Date(day + 'T00:00:00Z');
        return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === day;
    }
    function nextDay(day) {
        const date = new Date(day + 'T00:00:00Z');
        date.setUTCDate(date.getUTCDate() + 1);
        return date.toISOString().slice(0, 10);
    }
    function eventId(projectId, taskId, day) {
        return 'it' + projectId.replace(/-/g, '').toLowerCase() + taskId.replace(/-/g, '').toLowerCase() + day.replace(/-/g, '');
    }
    function desiredEvents() {
        const events = new Map();
        if (!calendarSync) return events;
        for (const task of tasks) {
            for (const day of new Set(Array.isArray(task.days) ? task.days : [])) {
                if (!validDay(day)) continue;
                const id = eventId(calendarSync.projectId, task.id, day);
                events.set(id, {
                    id,
                    summary: (task.done ? '✓ ' : '') + (task.text || label('untitledTask')),
                    start: { date: day }, end: { date: nextDay(day) },
                    transparency: 'transparent',
                    extendedProperties: { private: { indietoolboxProject: calendarSync.projectId, indietoolboxTask: task.id, indietoolboxDay: day } }
                });
            }
        }
        return events;
    }
    function fingerprint() {
        return JSON.stringify([calendarSync, tasks.map(task => [task.id, task.text, task.done, [...new Set((task.days || []).filter(validDay))].sort()])]);
    }
    async function request(path, options = {}) {
        const response = await fetch(API + path, {
            ...options,
            headers: { Authorization: 'Bearer ' + token, ...(options.body ? { 'Content-Type': 'application/json' } : {}) }
        });
        if (response.status === 401) {
            forgetToken();
            throw new Error(label('sessionExpired'));
        }
        if (!response.ok) {
            let detail = '';
            try { detail = (await response.json()).error?.message || ''; } catch (_) {}
            throw new Error(detail || `Google Calendar: HTTP ${response.status}`);
        }
        return response.status === 204 ? null : response.json();
    }
    async function pages(path) {
        const items = [];
        let pageToken = '';
        do {
            const separator = path.includes('?') ? '&' : '?';
            const result = await request(path + (pageToken ? separator + 'pageToken=' + encodeURIComponent(pageToken) : ''));
            items.push(...(result.items || []));
            pageToken = result.nextPageToken || '';
        } while (pageToken);
        return items;
    }
    async function calendars() {
        return pages('/users/me/calendarList?minAccessRole=writer&maxResults=250');
    }
    async function syncNow(force = false) {
        if (!calendarSync || !activeToken() || !fileHandle || unsavedChanges) return;
        const selected = { ...calendarSync };
        const current = fingerprint();
        if (!force && current === lastSynced) return;
        status(label('syncing'));
        const path = '/calendars/' + encodeURIComponent(selected.calendarId) + '/events';
        const existing = await pages(path + '?showDeleted=false&maxResults=250&privateExtendedProperty=' + encodeURIComponent('indietoolboxProject=' + selected.projectId));
        const wanted = desiredEvents();
        if (calendarSync?.calendarId !== selected.calendarId || calendarSync?.projectId !== selected.projectId) return;
        for (const event of existing) {
            const desired = wanted.get(event.id);
            if (!desired) {
                await request(path + '/' + encodeURIComponent(event.id), { method: 'DELETE' });
                continue;
            }
            wanted.delete(event.id);
            if (event.summary !== desired.summary || event.start?.date !== desired.start.date || event.end?.date !== desired.end.date) {
                await request(path + '/' + encodeURIComponent(event.id), { method: 'PATCH', body: JSON.stringify({ summary: desired.summary, start: desired.start, end: desired.end }) });
            }
        }
        for (const event of wanted.values()) {
            await request(path, { method: 'POST', body: JSON.stringify(event) });
        }
        lastSynced = current;
        status(label('synced'));
    }
    function enqueue(force = false) {
        if (!activeToken()) { forgetToken(); status(label('sessionInactive'), true); return Promise.resolve(); }
        if (!calendarSync) { status(label('notSelected'), true); return Promise.resolve(); }
        syncQueue = syncQueue.catch(() => {}).then(() => syncNow(force)).catch(error => {
            console.warn('Google Calendar sync failed:', error);
            status(error.message || label('syncFailed'), true);
        });
        return syncQueue;
    }
    function onSaved() {
        if (!calendarSync || !activeToken()) return;
        clearTimeout(syncTimer);
        syncTimer = setTimeout(() => enqueue(), 400);
    }
    function addText(parent, value) {
        const p = document.createElement('p'); p.textContent = value; parent.append(p); return p;
    }
    function openGuide() {
        if (guideDialog?.open) { guideDialog.focus(); return; }
        const opener = document.activeElement;
        const guide = document.createElement('dialog');
        guide.className = 'calendar-guide-dialog';
        guide.setAttribute('aria-labelledby', 'calendar-guide-title');
        guideDialog = guide;
        const bar = document.createElement('div'); bar.className = 'title-bar';
        const controls = document.createElement('div'); controls.className = 'title-bar-controls';
        const close = document.createElement('button');
        close.type = 'button'; close.className = 'calendar-guide-close'; close.setAttribute('aria-label', label('close'));
        close.onclick = () => guide.close();
        controls.append(close);
        const lines = document.createElement('div'); lines.className = 'title-bar-lines'; lines.setAttribute('aria-hidden', 'true');
        const title = document.createElement('span'); title.className = 'title-bar-text'; title.id = 'calendar-guide-title';
        title.textContent = label('guideTitle');
        bar.append(controls, lines, title);
        const body = document.createElement('div'); body.className = 'calendar-guide-body';
        addText(body, label('guideIntro')).className = 'calendar-guide-intro';
        const steps = document.createElement('ol'); steps.className = 'calendar-guide-steps';
        const language = I18n.getLang() === 'ru' ? 'ru' : 'en';
        const docs = {
            calendar: `https://support.google.com/calendar/answer/37095?hl=${language}`,
            cloud: 'https://console.cloud.google.com/',
            api: 'https://console.cloud.google.com/apis/library/calendar-json.googleapis.com',
            consent: `https://developers.google.com/workspace/guides/configure-oauth-consent?hl=${language}`,
            scopes: `https://developers.google.com/workspace/calendar/api/auth?hl=${language}`,
            clients: 'https://console.cloud.google.com/auth/clients',
            errors: `https://developers.google.com/workspace/calendar/api/troubleshoot-authentication-authorization?hl=${language}`
        };
        function link(parent, url, text) {
            const anchor = document.createElement('a');
            anchor.href = url; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer';
            anchor.textContent = text;
            parent.append(anchor);
        }
        for (const [number, doc] of [[1, 'calendar'], [2, 'cloud'], [3, 'api'], [4, 'consent'], [5, 'consent'], [6, 'scopes'], [7, 'clients'], [8, null]]) {
            const item = document.createElement('li');
            const heading = document.createElement('h3'); heading.textContent = label('guideStep' + number + 'Title');
            item.append(heading);
            addText(item, label('guideStep' + number + 'Body'));
            if (number === 6) {
                const codes = document.createElement('div'); codes.className = 'calendar-guide-codes';
                for (const scope of SCOPES.split(' ')) { const code = document.createElement('code'); code.textContent = scope; codes.append(code); }
                item.append(codes);
            }
            if (number === 7) {
                const origin = document.createElement('code'); origin.className = 'calendar-guide-origin';
                origin.textContent = location.origin;
                item.append(origin);
                addText(item, label('guideOriginNote'));
            }
            if (doc) { const source = document.createElement('div'); source.className = 'calendar-guide-source'; link(source, docs[doc], label('guideOpenSource')); item.append(source); }
            steps.append(item);
        }
        body.append(steps);
        const notes = document.createElement('div'); notes.className = 'calendar-guide-notes';
        const noteTitle = document.createElement('h3'); noteTitle.textContent = label('guideNotesTitle'); notes.append(noteTitle);
        addText(notes, label('guideNotesBody'));
        link(notes, docs.errors, label('guideTroubleshooting'));
        body.append(notes);
        const footer = document.createElement('div'); footer.className = 'calendar-guide-footer';
        footer.append(paintingDialogButton(label('close'), () => guide.close()));
        guide.append(bar, body, footer);
        guide.addEventListener('close', () => { guide.remove(); if (guideDialog === guide) guideDialog = null; if (opener?.isConnected) opener.focus(); });
        document.body.append(guide);
        guide.showModal();
        close.focus();
    }
    function connect() {
        const input = dialog?.querySelector('[data-calendar-client]');
        const id = input?.value.trim() || '';
        if (!/^[0-9]+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/i.test(id)) {
            status(label('invalidClient'), true); return;
        }
        if (!window.google?.accounts?.oauth2) { status(label('scriptUnavailable'), true); return; }
        if (clientId !== id) { token = ''; tokenExpiresAt = 0; updateButton(); }
        clientId = id;
        rememberClientId(id);
        const oauth = google.accounts.oauth2.initTokenClient({
            client_id: id, scope: SCOPES,
            callback: async result => {
                if (result.error || !result.access_token) { status(result.error_description || result.error || label('authFailed'), true); return; }
                token = result.access_token;
                tokenExpiresAt = Number(result.expires_in) > 0 ? Date.now() + Number(result.expires_in) * 1000 : 0;
                updateButton();
                if (calendarSync) {
                    calendarSync.clientId = id;
                    if (activeToken()) {
                        calendarSync.accessToken = token;
                        calendarSync.tokenExpiresAt = tokenExpiresAt;
                    } else {
                        delete calendarSync.accessToken;
                        delete calendarSync.tokenExpiresAt;
                    }
                    await save();
                }
                status(label('loadingCalendars'));
                try { await showCalendars(await calendars()); }
                catch (error) { status(error.message, true); }
            },
            error_callback: error => status(error.message || error.type || label('authFailed'), true)
        });
        // A direct click handler keeps the browser's user activation for Google's popup.
        oauth.requestAccessToken({ prompt: calendarSync?.clientId === id ? '' : 'consent' });
    }
    async function showCalendars(items) {
        if (!dialog?.isConnected) return;
        const slot = dialog.querySelector('[data-calendar-picker]');
        slot.replaceChildren();
        if (!items.length) { status(label('noWritableCalendars'), true); return; }
        const select = document.createElement('select');
        select.setAttribute('aria-label', label('chooseCalendar'));
        for (const item of items) select.add(new Option(item.summary || item.id, item.id));
        if (calendarSync?.calendarId && items.some(item => item.id === calendarSync.calendarId)) select.value = calendarSync.calendarId;
        const choose = paintingDialogButton(label('useCalendar'), async () => {
            if (!fileHandle) { status(label('saveFileFirst'), true); return; }
            const previous = calendarSync;
            calendarSync = { projectId: previous?.projectId || crypto.randomUUID(), calendarId: select.value, clientId };
            if (activeToken()) { calendarSync.accessToken = token; calendarSync.tokenExpiresAt = tokenExpiresAt; }
            lastSynced = '';
            updateButton();
            await save();
            if (unsavedChanges) { calendarSync = previous; updateButton(); status(label('saveFileFirst'), true); return; }
            await enqueue(true);
            const current = dialog?.querySelector('[data-calendar-current]');
            if (current) current.textContent = label('currentCalendar') + ': ' + select.selectedOptions[0].textContent;
            if (previous?.calendarId && previous.calendarId !== select.value) status(label('oldCalendarRemains'));
        });
        slot.append(select, choose);
        status(label('chooseCalendar'));
    }
    function open() {
        updateButton();
        if (dialog) dialog.close();
        const built = paintingDialog(label('title'));
        dialog = built.dialog;
        const form = built.form;
        form.addEventListener('submit', event => event.preventDefault());
        addText(form, label('explanation'));
        const guideLink = paintingDialogButton(label('guideLink'), openGuide, 'calendar-guide-link');
        form.append(guideLink);
        const inputLabel = document.createElement('label');
        inputLabel.textContent = label('clientLabel');
        const input = document.createElement('input');
        input.type = 'text'; input.className = 'painting-name-input'; input.value = calendarSync?.clientId || clientId || savedClientId();
        input.placeholder = label('clientPlaceholder'); input.setAttribute('aria-label', label('clientLabel'));
        input.dataset.calendarClient = '';
        const connectButton = paintingDialogButton(label('connect'), connect);
        const picker = document.createElement('div'); picker.dataset.calendarPicker = '';
        const info = addText(form, calendarSync?.calendarId ? label('currentCalendar') + ': ' + calendarSync.calendarId : label('notSelected'));
        info.dataset.calendarCurrent = '';
        info.style.overflowWrap = 'anywhere';
        const state = addText(form, activeToken() ? label('sessionActive') : label('sessionInactive'));
        state.dataset.calendarStatus = '';
        const actions = document.createElement('div'); actions.className = 'painting-dialog-actions';
        actions.append(connectButton, paintingDialogButton(label('syncNow'), () => enqueue(true)), paintingDialogButton(label('close'), () => built.dialog.close()));
        inputLabel.append(input);
        guideLink.after(inputLabel);
        const credentialsNote = addText(form, label('credentialsNote'));
        credentialsNote.className = 'painting-dialog-note';
        inputLabel.after(credentialsNote);
        form.append(picker, actions);
        built.dialog.addEventListener('close', () => { if (dialog === built.dialog) dialog = null; });
        built.dialog.showModal();
        input.focus();
    }
    return { open, onSaved, onFileLoaded, updateLanguage: updateButton, syncNow, desiredEvents, validDay, nextDay };
})();
