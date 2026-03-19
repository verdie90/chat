# AnonChat

Anonymous peer-to-peer chat powered by WebRTC, with end-to-end encryption, file sharing, and PWA support.

## Features

- **Anonymous** — random usernames generated on each visit, no accounts or sign-up
- **End-to-end encrypted** — ECDH P-256 key exchange + AES-256-GCM per message
- **Fruit-code rooms** — short, memorable room IDs (e.g. `Mango-Kiwi-Lime`)
- **File & image sharing** — chunked transfer over WebRTC DataChannel, with inline preview
- **Location sharing** — share a Google Maps pin directly in chat
- **Idle detection** — automatically marks you as idle after inactivity
- **PWA** — installable on desktop and mobile, works offline for static assets
- **Mobile-friendly** — `h-dvh` layout, virtual-keyboard aware, iOS tap/zoom fixes

## Tech Stack

| Layer | Library |
|---|---|
| Framework | Next.js 16.2 (App Router) |
| UI | React 19, Tailwind CSS v4, Lucide icons |
| Realtime | Socket.io 4.8 (signaling server) |
| P2P | WebRTC DataChannel |
| Encryption | Web Crypto API (ECDH + AES-GCM) |
| PWA | Service Worker + Web App Manifest |

## Getting Started

### Development

```bash
npm install
npm run dev
```

The custom server (`server.mjs`) starts Next.js **and** the Socket.io signaling server together on port `3000`.

Open [http://localhost:3000](http://localhost:3000).

### Production

```bash
npm run build
npm start
```

Set `PORT` env var to change the port (default `3000`).

## How It Works

1. User lands on the home page, gets a random username and can generate or paste a room ID.
2. Two users join the same room — the signaling server relays WebRTC `offer`/`answer`/`candidate` messages.
3. Once connected, all chat messages and files go **directly** over the encrypted WebRTC DataChannel — the server sees nothing after the handshake.
4. Encryption keys are negotiated via ECDH on the client; every message is encrypted with AES-256-GCM before being sent through the DataChannel.

## Project Structure

```
src/
  app/
    page.js              # Landing page (username + room picker)
    layout.js            # Root layout, PWA metadata
    globals.css          # Global styles, mobile fixes
    manifest.js          # Web app manifest
    icon.js              # Favicon (Next.js ImageResponse)
    apple-icon.js        # iOS home screen icon
    pwa-register.js      # Service worker registration
    room/[roomId]/
      page.js            # Chat room (WebRTC, E2E crypto, file transfer)
public/
  sw.js                  # Service worker (cache-first static, network-first pages)
  icons/icon.svg         # App icon
server.mjs               # Socket.io + Next.js combined server
```
