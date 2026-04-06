/**
 * Indie Toolbox i18n — flat keys in locales/en.json and locales/ru.json
 * Uses localStorage cache so the chosen language can apply before fetch finishes.
 */
(function (global) {
    'use strict';

    const STORAGE_KEY = 'indietoolbox_lang';
    const MSG_TYPE = 'indietoolbox-set-lang';
    const CACHE_PREFIX = 'indietoolbox_locale_bundle_v1_';
    const CACHE_MIN_KEYS = 40;

    let strings = {};
    let currentLang = 'en';

    function detectBrowserLang() {
        const list = (navigator.languages && navigator.languages.length)
            ? navigator.languages
            : [navigator.language || 'en'];
        for (let i = 0; i < list.length; i++) {
            const s = String(list[i]).toLowerCase();
            if (s.startsWith('ru')) return 'ru';
        }
        return 'en';
    }

    function getStoredOrDetect() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved === 'en' || saved === 'ru') return saved;
        } catch (e) { /* ignore */ }
        return detectBrowserLang();
    }

    function readLocaleCache(lang) {
        try {
            const raw = localStorage.getItem(CACHE_PREFIX + lang);
            if (!raw) return null;
            const o = JSON.parse(raw);
            if (!o || typeof o !== 'object' || Object.keys(o).length < CACHE_MIN_KEYS) return null;
            return o;
        } catch (e) {
            return null;
        }
    }

    function writeLocaleCache(lang, obj) {
        if (!obj || typeof obj !== 'object') return;
        try {
            localStorage.setItem(CACHE_PREFIX + lang, JSON.stringify(obj));
        } catch (e) { /* quota or private mode */ }
    }

    async function loadStrings(lang) {
        const url = 'locales/' + lang + '.json';
        const r = await fetch(url);
        if (!r.ok) throw new Error('i18n: ' + url);
        return r.json();
    }

    function setHtmlLang() {
        document.documentElement.lang = currentLang === 'ru' ? 'ru' : 'en';
    }

    function finishI18nPaint() {
        try {
            document.documentElement.classList.remove('i18n-pending');
            document.documentElement.classList.add('i18n-ready');
        } catch (e) { /* ignore */ }
    }

    function t(key) {
        if (strings[key] != null && strings[key] !== '') return strings[key];
        return key;
    }

    function applyTo(root) {
        root = root || document;
        root.querySelectorAll('[data-i18n]').forEach(function (el) {
            el.textContent = t(el.getAttribute('data-i18n'));
        });
        root.querySelectorAll('[data-i18n-html]').forEach(function (el) {
            el.innerHTML = t(el.getAttribute('data-i18n-html'));
        });
        ['title', 'placeholder', 'aria-label', 'alt'].forEach(function (attr) {
            var d = 'data-i18n-' + attr;
            root.querySelectorAll('[' + d + ']').forEach(function (el) {
                el.setAttribute(attr, t(el.getAttribute(d)));
            });
        });
    }

    async function init() {
        let revealedEarly = false;
        try {
            currentLang = getStoredOrDetect();
            const cached = readLocaleCache(currentLang);
            if (cached) {
                strings = cached;
                setHtmlLang();
                if (document.body) applyTo(document.body);
                finishI18nPaint();
                revealedEarly = true;
            }

            try {
                const fresh = await loadStrings(currentLang);
                strings = fresh;
                writeLocaleCache(currentLang, fresh);
            } catch (e) {
                if (!cached) {
                    currentLang = 'en';
                    try {
                        const enCached = readLocaleCache('en');
                        if (enCached) {
                            strings = enCached;
                        } else {
                            strings = await loadStrings('en');
                            writeLocaleCache('en', strings);
                        }
                    } catch (e2) {
                        strings = strings && Object.keys(strings).length ? strings : {};
                    }
                }
            }

            setHtmlLang();
            if (document.body) applyTo(document.body);
            global.dispatchEvent(new CustomEvent('indietoolbox-lang-applied', { detail: { lang: currentLang } }));
        } finally {
            if (!revealedEarly) finishI18nPaint();
        }
    }

    async function setLang(lang) {
        if (lang !== 'en' && lang !== 'ru') return;
        try {
            localStorage.setItem(STORAGE_KEY, lang);
        } catch (e) { /* ignore */ }
        currentLang = lang;
        const cached = readLocaleCache(lang);
        if (cached) {
            strings = cached;
            setHtmlLang();
            if (document.body) applyTo(document.body);
        }
        try {
            const fresh = await loadStrings(lang);
            strings = fresh;
            writeLocaleCache(lang, fresh);
        } catch (e) {
            if (!cached) {
                currentLang = 'en';
                const enCached = readLocaleCache('en');
                if (enCached) {
                    strings = enCached;
                } else {
                    try {
                        strings = await loadStrings('en');
                        writeLocaleCache('en', strings);
                    } catch (e2) {
                        strings = {};
                    }
                }
            }
        }
        setHtmlLang();
        if (document.body) applyTo(document.body);
        global.dispatchEvent(new CustomEvent('indietoolbox-lang-applied', { detail: { lang: currentLang } }));
    }

    function getLang() {
        return currentLang;
    }

    function rememberLangChoice(lang) {
        if (lang !== 'en' && lang !== 'ru') return;
        try {
            localStorage.setItem(STORAGE_KEY, lang);
        } catch (e) { /* ignore */ }
    }

    const api = {
        init: init,
        t: t,
        setLang: setLang,
        getLang: getLang,
        applyTo: applyTo,
        rememberLangChoice: rememberLangChoice,
        MSG_TYPE: MSG_TYPE
    };
    global.IndieI18n = api;
    global.I18n = api;
})(window);
