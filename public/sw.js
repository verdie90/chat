const CACHE = 'anonchat-v1'

const PRECACHE = ['/', '/icons/icon.svg']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
        )
      )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  const { request } = e
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Never intercept socket.io or cross-origin
  if (!url.origin.startsWith(self.location.origin)) return
  if (url.pathname.startsWith('/socket.io')) return

  // Cache-first for immutable Next.js static chunks
  if (url.pathname.startsWith('/_next/static/')) {
    e.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            const clone = res.clone()
            caches.open(CACHE).then((c) => c.put(request, clone))
            return res
          })
      )
    )
    return
  }

  // Cache-first for icons / svg
  if (url.pathname.startsWith('/icons/') || url.pathname.endsWith('.svg')) {
    e.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            const clone = res.clone()
            caches.open(CACHE).then((c) => c.put(request, clone))
            return res
          })
      )
    )
    return
  }

  // Network-first for navigation (pages), fall back to cached root
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request).catch(
        () => caches.match('/') ?? new Response('Offline', { status: 503 })
      )
    )
    return
  }
})
