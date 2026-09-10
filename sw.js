const CACHE = "saxchord-v3";
const SHELL = ["./index.html", "./styles.css", "./app.js", "./manifest.json", "./icon.svg", "./saxfinger-mask.png"];

self.addEventListener("install", (e) => {
  // cache: "reload" で、インストール時に必ずサーバから取り直す
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(SHELL.map((u) => fetch(new Request(u, { cache: "reload" })).then((r) => c.put(u, r)))))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k.startsWith("saxchord-")).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
// 練習中はオフラインでも動いてほしいので、シェルはネットワーク優先＋キャッシュ退避。
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  // このアプリのディレクトリ配下だけを担当する（同じサイトの他のアプリに触らない）
  if (!url.pathname.startsWith(new URL("./", self.location).pathname)) return;
  // ネットワーク優先。ブラウザの HTTP キャッシュに古い app.js が残っていても
  // 拾わないよう、必ずサーバに確認させる（更新が無ければ 304 で軽い）。
  e.respondWith(
    fetch(new Request(e.request, { cache: "no-cache" }))
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() =>
        caches.match(e.request, { ignoreSearch: true })
          .then((c) => c || caches.match("./index.html"))
      )
  );
});
