/* 健康计划 PWA 离线缓存
   策略：页面导航 network-first（保证更新及时），静态资源 cache-first；
   只处理本站 GET 请求，AI 分析等跨域请求一律直连、不缓存。
   改动图标/manifest 等静态资源时请把 CACHE 版本号 +1。 */
var CACHE = "healthplan-pwa-v3";
var SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-180.png", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

/* Web Push：到点提醒由 Worker 推送过来，这里负责展示；点通知回到 App */
self.addEventListener("push", function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "健康计划", {
    body: d.body || "到点打卡啦",
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    tag: d.tag || "healthplan",
    renotify: true,
    data: { url: d.url || "./" }
  }));
});
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (cs) {
    for (var i = 0; i < cs.length; i++) {
      if ("focus" in cs[i]) return cs[i].focus();
    }
    return self.clients.openWindow(url);
  }));
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 跨域（AI 代理等）不接管
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put("./index.html", copy); });
      return res;
    }).catch(function () {
      return caches.match("./index.html").then(function (r) { return r || caches.match("./"); });
    }));
    return;
  }
  e.respondWith(caches.match(req).then(function (hit) {
    if (hit) return hit;
    return fetch(req).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
      return res;
    });
  }));
});