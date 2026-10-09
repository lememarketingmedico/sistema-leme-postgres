(function () {
  'use strict';
  var config = window.LEMEAnalyticsConfig || {};
  if (!config.endpoint || navigator.webdriver) return;
  var technical = /\/(wp-admin|wp-json|wp-login\.php|health|healthz|status|uptime)(\/|$)/i;
  var heartbeatSeconds = Math.max(10, Number(config.heartbeatSeconds || 15));
  var sessionKey = 'leme_analytics_session_v2';
  var sessionId = '';
  var lastTick = Date.now();
  var lastTrackedUrl = '';

  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    var bytes = new Uint8Array(16);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (var i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    return Array.prototype.map.call(bytes, function (value) { return value.toString(16).padStart(2, '0'); }).join('');
  }

  function persistSession() {
    try { window.localStorage.setItem(sessionKey, JSON.stringify({ id: sessionId, last: Date.now() })); } catch (error) {}
  }
  try {
    var saved = JSON.parse(window.localStorage.getItem(sessionKey) || '{}');
    if (/^[a-f0-9-]{20,64}$/i.test(saved.id || '') && Date.now() - Number(saved.last || 0) < 30 * 60 * 1000) sessionId = saved.id;
    else sessionId = uuid();
    persistSession();
  } catch (error) { sessionId = uuid(); }

  function pageData(eventType) {
    var query = new URLSearchParams(window.location.search || '');
    var now = Date.now();
    var elapsed = Math.min(30, Math.max(0, Math.round((now - lastTick) / 1000)));
    lastTick = now;
    return {
      event_type: eventType,
      event_uuid: eventType === 'pageview' ? uuid() : '',
      session_id: sessionId,
      visible: document.visibilityState === 'visible',
      engaged_seconds: eventType === 'pageview' ? 0 : elapsed,
      page_id: Number(config.pageId || 0), title: document.title || '',
      url: window.location.href.split('#')[0], path: window.location.pathname || '/',
      referrer: document.referrer || '', utm_source: query.get('utm_source') || '',
      utm_medium: query.get('utm_medium') || '', utm_campaign: query.get('utm_campaign') || ''
    };
  }

  function send(eventType, beacon) {
    if (technical.test(window.location.pathname || '/')) return;
    persistSession();
    var body = JSON.stringify(pageData(eventType));
    if (beacon && navigator.sendBeacon) {
      try { if (navigator.sendBeacon(config.endpoint, new Blob([body], { type: 'application/json' }))) return; } catch (error) {}
    }
    fetch(config.endpoint, { method: 'POST', credentials: 'same-origin', keepalive: true,
      headers: { 'Content-Type': 'application/json' }, body: body }).catch(function () {});
  }

  function pageview() {
    var current = window.location.href.split('#')[0];
    if (current === lastTrackedUrl) return;
    lastTrackedUrl = current;
    lastTick = Date.now();
    send('pageview', false);
  }

  function wrapHistory(method) {
    var original = history[method];
    if (typeof original !== 'function') return;
    history[method] = function () { var result = original.apply(this, arguments); window.setTimeout(pageview, 0); return result; };
  }
  wrapHistory('pushState'); wrapHistory('replaceState');
  window.addEventListener('popstate', function () { window.setTimeout(pageview, 0); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') { lastTick = Date.now(); send('heartbeat', false); }
    else send('heartbeat', true);
  });
  window.addEventListener('pagehide', function () { send('leave', true); });
  window.setInterval(function () { if (document.visibilityState === 'visible') send('heartbeat', false); }, heartbeatSeconds * 1000);
  if (document.readyState === 'complete') window.setTimeout(pageview, 80);
  else window.addEventListener('load', function () { window.setTimeout(pageview, 80); }, { once: true });
})();
