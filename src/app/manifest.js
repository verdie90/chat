export default function manifest() {
  return {
    name: 'AnonChat',
    short_name: 'AnonChat',
    description: 'Anonymous peer-to-peer chat powered by WebRTC',
    start_url: '/',
    display: 'standalone',
    background_color: '#0f172a',
    theme_color: '#4f46e5',
    orientation: 'portrait-primary',
    lang: 'en',
    scope: '/',
    categories: ['social', 'communication'],
    icons: [
      {
        src: '/icons/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any maskable',
      },
    ],
  }
}
