'use client'

import { Suspense } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { io } from 'socket.io-client'

const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
}

// ─── E2E Encryption helpers (ECDH + AES-GCM) ─────────────────────────────────

async function generateKeyPair() {
  return crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey']
  )
}

async function exportPublicKey(key) {
  const raw = await crypto.subtle.exportKey('raw', key)
  return btoa(String.fromCharCode(...new Uint8Array(raw)))
}

async function importPublicKey(b64) {
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  return crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  )
}

async function deriveSharedKey(privateKey, remotePubKey) {
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: remotePubKey },
    privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

async function encryptText(sharedKey, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(plaintext)
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    sharedKey,
    encoded
  )
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(ciphertext), iv.byteLength)
  return btoa(String.fromCharCode(...combined))
}

async function decryptText(sharedKey, b64) {
  const combined = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  const iv = combined.slice(0, 12)
  const ciphertext = combined.slice(12)
  const buf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    sharedKey,
    ciphertext
  )
  return new TextDecoder().decode(buf)
}

async function encryptBinary(sharedKey, arrayBuffer) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    sharedKey,
    arrayBuffer
  )
  return {
    iv: btoa(String.fromCharCode(...iv)),
    ct: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
  }
}

async function decryptBinary(sharedKey, { iv: ivB64, ct: ctB64 }) {
  const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0))
  const ct = Uint8Array.from(atob(ctB64), (c) => c.charCodeAt(0))
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, sharedKey, ct)
}

// ─── Icons ────────────────────────────────────────────────────────────

function MicIcon({ muted }) {
  return muted ? (
    <svg
      className='w-5 h-5'
      fill='none'
      stroke='currentColor'
      viewBox='0 0 24 24'>
      <path
        strokeLinecap='round'
        strokeLinejoin='round'
        strokeWidth={2}
        d='M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z'
      />
      <path
        strokeLinecap='round'
        strokeLinejoin='round'
        strokeWidth={2}
        d='M3 3l18 18'
      />
    </svg>
  ) : (
    <svg
      className='w-5 h-5'
      fill='none'
      stroke='currentColor'
      viewBox='0 0 24 24'>
      <path
        strokeLinecap='round'
        strokeLinejoin='round'
        strokeWidth={2}
        d='M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z'
      />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg
      className='w-4 h-4'
      fill='none'
      stroke='currentColor'
      viewBox='0 0 24 24'>
      <path
        strokeLinecap='round'
        strokeLinejoin='round'
        strokeWidth={2}
        d='M12 19l9 2-9-18-9 18 9-2zm0 0v-8'
      />
    </svg>
  )
}

function ChatIcon() {
  return (
    <svg
      className='w-5 h-5'
      fill='none'
      stroke='currentColor'
      viewBox='0 0 24 24'>
      <path
        strokeLinecap='round'
        strokeLinejoin='round'
        strokeWidth={2}
        d='M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z'
      />
    </svg>
  )
}

function LeaveIcon() {
  return (
    <svg
      className='w-5 h-5'
      fill='none'
      stroke='currentColor'
      viewBox='0 0 24 24'>
      <path
        strokeLinecap='round'
        strokeLinejoin='round'
        strokeWidth={2}
        d='M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1'
      />
    </svg>
  )
}

function AttachIcon() {
  return (
    <svg
      className='w-5 h-5'
      fill='none'
      stroke='currentColor'
      viewBox='0 0 24 24'>
      <path
        strokeLinecap='round'
        strokeLinejoin='round'
        strokeWidth={2}
        d='M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13'
      />
    </svg>
  )
}

function LocationIcon() {
  return (
    <svg
      className='w-4 h-4'
      fill='none'
      stroke='currentColor'
      viewBox='0 0 24 24'>
      <path
        strokeLinecap='round'
        strokeLinejoin='round'
        strokeWidth={2}
        d='M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z'
      />
      <path
        strokeLinecap='round'
        strokeLinejoin='round'
        strokeWidth={2}
        d='M15 11a3 3 0 11-6 0 3 3 0 016 0z'
      />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg
      className='w-3 h-3'
      fill='none'
      stroke='currentColor'
      viewBox='0 0 24 24'>
      <path
        strokeLinecap='round'
        strokeLinejoin='round'
        strokeWidth={2}
        d='M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z'
      />
    </svg>
  )
}

// ─── Attachment viewer ────────────────────────────────────────────────────────

function AttachmentBubble({ att }) {
  const { mimeType, name, url, size } = att
  if (mimeType.startsWith('image/')) {
    return (
      <a
        href={url}
        target='_blank'
        rel='noreferrer'>
        <img
          src={url}
          alt={name}
          className='max-w-65 max-h-50 rounded-xl object-cover cursor-pointer hover:opacity-90 transition'
        />
      </a>
    )
  }
  if (mimeType.startsWith('video/')) {
    return (
      <video
        src={url}
        controls
        className='max-w-70 rounded-xl'
      />
    )
  }
  if (mimeType.startsWith('audio/')) {
    return (
      <audio
        src={url}
        controls
        className='w-full min-w-55'
      />
    )
  }
  return (
    <a
      href={url}
      download={name}
      className='flex items-center gap-2.5 bg-slate-700/60 hover:bg-slate-700 rounded-xl px-3 py-2.5 transition text-sm text-slate-200'>
      <svg
        className='w-8 h-8 shrink-0 text-indigo-400'
        fill='none'
        stroke='currentColor'
        viewBox='0 0 24 24'>
        <path
          strokeLinecap='round'
          strokeLinejoin='round'
          strokeWidth={1.5}
          d='M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'
        />
      </svg>
      <div className='min-w-0'>
        <p className='truncate font-medium'>{name}</p>
        <p className='text-xs text-slate-400'>
          {size ? (size / 1024).toFixed(1) + ' KB' : ''}
        </p>
      </div>
    </a>
  )
}

function LocationBubble({ lat, lng }) {
  const mapUrl = `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=14&size=280x160&markers=${lat},${lng}`
  const osmUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}&zoom=15`
  return (
    <a
      href={osmUrl}
      target='_blank'
      rel='noreferrer'
      className='block max-w-70'>
      <div className='rounded-xl overflow-hidden border border-slate-700/60'>
        <img
          src={mapUrl}
          alt='location'
          className='w-full block'
        />
        <div className='bg-slate-800/80 px-3 py-1.5 flex items-center gap-1.5 text-xs text-slate-300'>
          <LocationIcon />
          <span>
            {lat.toFixed(5)}, {lng.toFixed(5)}
          </span>
        </div>
      </div>
    </a>
  )
}

// ─── Typing indicator ─────────────────────────────────────────────────────────

function TypingIndicator({ name }) {
  return (
    <div className='flex items-end gap-1.5'>
      <span className='text-xs text-slate-400 italic'>{name} is typing</span>
      <span className='flex gap-0.5 mb-0.5'>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className='w-1 h-1 rounded-full bg-slate-400 animate-bounce'
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </span>
    </div>
  )
}

// ─── Status badge ─────────────────────────────────────────────────────

const STATUS_MAP = {
  connecting: {
    label: 'Connecting…',
    color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  },
  waiting: {
    label: 'Waiting for peer',
    color: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  },
  connected: {
    label: 'Connected',
    color: 'bg-green-500/20 text-green-300 border-green-500/30',
  },
  error: {
    label: 'Error',
    color: 'bg-red-500/20 text-red-300 border-red-500/30',
  },
}

function StatusBadge({ status }) {
  const s = STATUS_MAP[status] || STATUS_MAP.connecting
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${s.color}`}>
      <span className='w-1.5 h-1.5 rounded-full bg-current animate-pulse' />
      {s.label}
    </span>
  )
}

// ─── Main Room Component ───────────────────────────────────────────────

function RoomContent() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()

  const roomId = decodeURIComponent(params.roomId)
  const username = decodeURIComponent(
    searchParams.get('username') || 'Anonymous'
  )

  // Refs — never cause re-renders
  const socketRef = useRef(null)
  const pcRef = useRef(null)
  const dcRef = useRef(null)
  const localStreamRef = useRef(null)
  const remoteAudioRef = useRef(null)
  const msgEndRef = useRef(null)
  const pendingIceRef = useRef([])
  const remoteIdRef = useRef(null)
  const fileInputRef = useRef(null)

  // Encryption refs
  const keyPairRef = useRef(null) // own ECDH key pair
  const sharedKeyRef = useRef(null) // derived AES-GCM shared key
  const remotePubKeyRef = useRef(null) // remote ECDH public key (b64)

  // Typing debounce refs
  const typingTimerRef = useRef(null)
  const isTypingRef = useRef(false)

  // Idle timeout ref
  const idleTimerRef = useRef(null)
  const IDLE_MS = 3 * 60 * 1000

  // State
  const [messages, setMessages] = useState([])
  const [msgInput, setMsgInput] = useState('')
  const [status, setStatus] = useState('connecting')
  const [remoteUser, setRemoteUser] = useState(null)
  const [isMuted, setIsMuted] = useState(false)
  const [isEncrypted, setIsEncrypted] = useState(false)
  const [peerTyping, setPeerTyping] = useState(false)
  const [peerIdle, setPeerIdle] = useState(false)
  const [myIdle, setMyIdle] = useState(false)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [attachType, setAttachType] = useState(null)

  // Auto-scroll chat
  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, peerTyping])

  // ── Helpers ──────────────────────────────────────────────────────────

  const pushMsg = (msg) =>
    setMessages((prev) => [
      ...prev,
      { ...msg, id: `${Date.now()}-${Math.random()}` },
    ])

  const sysMsg = (text) => pushMsg({ type: 'system', text, ts: Date.now() })

  // ── Send unencrypted control message (typing / idle) ──────────────────

  function sendCtrl(obj) {
    const dc = dcRef.current
    if (dc?.readyState === 'open') {
      try {
        dc.send(JSON.stringify({ __ctrl: true, ...obj }))
      } catch {}
    }
  }

  // ── Typing notification ────────────────────────────────────────────────

  function notifyTyping() {
    if (!isTypingRef.current) {
      isTypingRef.current = true
      sendCtrl({ type: 'typing', value: true })
    }
    clearTimeout(typingTimerRef.current)
    typingTimerRef.current = setTimeout(() => {
      isTypingRef.current = false
      sendCtrl({ type: 'typing', value: false })
    }, 2000)
  }

  // ── ECDH: derive shared key once both public keys are available ────────

  async function tryDeriveKey() {
    if (!keyPairRef.current || !remotePubKeyRef.current || sharedKeyRef.current)
      return
    try {
      const remotePub = await importPublicKey(remotePubKeyRef.current)
      sharedKeyRef.current = await deriveSharedKey(
        keyPairRef.current.privateKey,
        remotePub
      )
      setIsEncrypted(true)
      sysMsg('🔒 End-to-end encryption established (ECDH + AES-256-GCM).')
    } catch (e) {
      console.error('Key derivation failed', e)
    }
  }

  // ── Handle incoming DataChannel message ───────────────────────────────

  async function handleDcMessage(raw) {
    let msg
    try {
      msg = JSON.parse(raw)
    } catch {
      return
    }

    // Key exchange (plain JSON, before encryption is ready)
    if (msg.__keyExchange) {
      remotePubKeyRef.current = msg.pubKey
      await tryDeriveKey()
      return
    }

    // Control messages (typing / idle) — not encrypted, no sensitive data
    if (msg.__ctrl) {
      if (msg.type === 'typing') setPeerTyping(msg.value)
      if (msg.type === 'idle') setPeerIdle(msg.value)
      return
    }

    // Encrypted messages require shared key
    if (!sharedKeyRef.current) return

    try {
      if (msg.encText !== undefined) {
        const text = await decryptText(sharedKeyRef.current, msg.encText)
        pushMsg({ type: 'remote', username: msg.username, text, ts: msg.ts })
      } else if (msg.encAttachment) {
        const decrypted = await decryptBinary(
          sharedKeyRef.current,
          msg.encAttachment
        )
        const blob = new Blob([decrypted], { type: msg.mimeType })
        const url = URL.createObjectURL(blob)
        pushMsg({
          type: 'remote',
          username: msg.username,
          ts: msg.ts,
          attachment: {
            mimeType: msg.mimeType,
            name: msg.name,
            url,
            size: msg.size,
          },
        })
      } else if (msg.location) {
        pushMsg({
          type: 'remote',
          username: msg.username,
          ts: msg.ts,
          location: msg.location,
        })
      }
    } catch (e) {
      console.error('Decryption error', e)
    }
  }

  // ── Create / reset peer connection ────────────────────────────────────

  function buildPC(socket) {
    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }
    dcRef.current = null
    sharedKeyRef.current = null
    keyPairRef.current = null
    remotePubKeyRef.current = null
    setIsEncrypted(false)

    const pc = new RTCPeerConnection(ICE_CONFIG)
    pcRef.current = pc

    // Add local tracks
    localStreamRef.current
      ?.getTracks()
      .forEach((t) => pc.addTrack(t, localStreamRef.current))

    // Send ICE candidates
    pc.onicecandidate = ({ candidate }) => {
      if (candidate && remoteIdRef.current) {
        socket.emit('ice-candidate', { to: remoteIdRef.current, candidate })
      }
    }

    // Remote stream → audio element
    pc.ontrack = ({ streams }) => {
      if (remoteAudioRef.current && streams[0]) {
        remoteAudioRef.current.srcObject = streams[0]
      }
    }

    // Connection state changes
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState
      if (s === 'connected') {
        setStatus('connected')
      } else if (s === 'disconnected' || s === 'failed' || s === 'closed') {
        setStatus('waiting')
        if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null
        sysMsg('Peer disconnected. Waiting for a new connection…')
        remoteIdRef.current = null
        setRemoteUser(null)
        sharedKeyRef.current = null
        setIsEncrypted(false)
        setPeerTyping(false)
        setPeerIdle(false)
      }
    }

    return pc
  }

  // ── Drain queued ICE candidates ────────────────────────────────────────

  async function drainIce(pc) {
    for (const c of pendingIceRef.current) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(c))
      } catch {}
    }
    pendingIceRef.current = []
  }

  // ── Setup data channel (both sides) ───────────────────────────────────

  function bindDataChannel(dc) {
    dcRef.current = dc
    dc.onopen = async () => {
      sysMsg('Secure channel open — performing key exchange…')
      try {
        keyPairRef.current = await generateKeyPair()
        const pubKeyB64 = await exportPublicKey(keyPairRef.current.publicKey)
        dc.send(JSON.stringify({ __keyExchange: true, pubKey: pubKeyB64 }))
        await tryDeriveKey()
      } catch (e) {
        console.error('Key exchange error', e)
      }
    }
    dc.onclose = () => {
      dcRef.current = null
    }
    dc.onerror = (e) => {
      const err = e?.error
      console.error('DataChannel error', err?.message ?? err ?? e)
    }
    dc.onmessage = ({ data }) => handleDcMessage(data)
  }

  // ── Main effect: media → socket → WebRTC ──────────────────────────────

  useEffect(() => {
    let destroyed = false

    async function init() {
      // 1. Get local audio
      let stream
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch {
        stream = new MediaStream()
        sysMsg('No microphone detected.')
      }
      if (destroyed) {
        stream?.getTracks().forEach((t) => t.stop())
        return
      }

      localStreamRef.current = stream

      // 2. Connect to signaling server
      const socket = io({
        path: '/socket.io',
        transports: ['websocket', 'polling'],
      })
      socketRef.current = socket

      socket.on('connect', () => {
        socket.emit('join-room', { roomId, username })
      })

      // ── room-joined: server tells us who is already in the room ─────────
      socket.on('room-joined', async ({ existingUsers }) => {
        if (!existingUsers.length) {
          setStatus('waiting')
          sysMsg(`You joined room "${roomId}". Waiting for peers…`)
          return
        }

        // Take the first existing peer and initiate offer
        const peer = existingUsers[0]
        remoteIdRef.current = peer.socketId
        setRemoteUser(peer.username)
        sysMsg(`${peer.username} is already here. Connecting…`)
        setStatus('connecting')

        try {
          const pc = buildPC(socket)

          // Initiator creates the data channel
          const dc = pc.createDataChannel('chat', { ordered: true })
          bindDataChannel(dc)

          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          socket.emit('offer', { to: peer.socketId, offer })
        } catch (err) {
          console.error('Error creating offer:', err)
          sysMsg('Failed to initiate connection. Please try again.')
          setStatus('waiting')
        }
      })

      // ── A new user joined our room ────────────────────────────────────────
      socket.on('user-joined', ({ socketId, username: peerName }) => {
        remoteIdRef.current = socketId
        setRemoteUser(peerName)
        sysMsg(`${peerName} joined the room.`)
      })

      // ── We received an offer — become answerer ────────────────────────────
      socket.on('offer', async ({ from, offer }) => {
        try {
          setStatus('connecting')
          remoteIdRef.current = from
          const pc = buildPC(socket)

          // Answerer receives data channel
          pc.ondatachannel = ({ channel }) => bindDataChannel(channel)

          await pc.setRemoteDescription(new RTCSessionDescription(offer))
          await drainIce(pc)

          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          socket.emit('answer', { to: from, answer })
        } catch (err) {
          console.error('Error handling offer:', err)
          sysMsg('Failed to connect with peer. Please try again.')
          setStatus('waiting')
        }
      })

      // ── We received an answer ─────────────────────────────────────────────
      socket.on('answer', async ({ answer }) => {
        try {
          const pc = pcRef.current
          if (!pc) return
          await pc.setRemoteDescription(new RTCSessionDescription(answer))
          await drainIce(pc)
        } catch (err) {
          console.error('Error handling answer:', err)
        }
      })

      // ── ICE candidate from remote ─────────────────────────────────────────
      socket.on('ice-candidate', async ({ candidate }) => {
        const pc = pcRef.current
        if (pc && pc.remoteDescription) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate))
          } catch {}
        } else {
          pendingIceRef.current.push(candidate)
        }
      })

      // ── Remote peer left ──────────────────────────────────────────────────
      socket.on('user-left', ({ socketId }) => {
        if (socketId !== remoteIdRef.current) return
        setStatus('waiting')
        setRemoteUser(null)
        remoteIdRef.current = null
        if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null
        sysMsg('Peer left the room. Waiting for a new connection…')
        // Clean up PC so next entrant gets a fresh one
        if (pcRef.current) {
          pcRef.current.close()
          pcRef.current = null
        }
        dcRef.current = null
        pendingIceRef.current = []
        sharedKeyRef.current = null
        keyPairRef.current = null
        remotePubKeyRef.current = null
        setIsEncrypted(false)
        setPeerTyping(false)
        setPeerIdle(false)
      })

      socket.on('connect_error', () => setStatus('error'))

      // ── Room is full (server enforces max 2 participants) ─────────────────
      socket.on('room-full', ({ roomId: fullRoom }) => {
        sysMsg(`Room "${fullRoom}" is full (max 2 participants). Redirecting…`)
        setStatus('error')
        setTimeout(() => router.push('/'), 3000)
      })
    }

    init()

    // Idle detection via page visibility
    const handleVisibility = () => {
      const idle = document.hidden
      setMyIdle(idle)
      sendCtrl({ type: 'idle', value: idle })
    }
    document.addEventListener('visibilitychange', handleVisibility)

    // Idle detection via user inactivity
    const resetIdle = () => {
      clearTimeout(idleTimerRef.current)
      setMyIdle(false)
      sendCtrl({ type: 'idle', value: false })
      idleTimerRef.current = setTimeout(() => {
        setMyIdle(true)
        sendCtrl({ type: 'idle', value: true })
      }, IDLE_MS)
    }
    window.addEventListener('mousemove', resetIdle)
    window.addEventListener('keydown', resetIdle)
    resetIdle()

    return () => {
      destroyed = true
      clearTimeout(typingTimerRef.current)
      clearTimeout(idleTimerRef.current)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('mousemove', resetIdle)
      window.removeEventListener('keydown', resetIdle)
      localStreamRef.current?.getTracks().forEach((t) => t.stop())
      pcRef.current?.close()
      socketRef.current?.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, username])

  // ── Send encrypted text ───────────────────────────────────────────────────

  async function sendMessage() {
    const text = msgInput.trim()
    if (!text) return
    if (dcRef.current?.readyState !== 'open') {
      sysMsg('Not connected — message not sent.')
      return
    }
    if (!sharedKeyRef.current) {
      sysMsg('Encryption not ready yet — please wait.')
      return
    }
    try {
      const ts = Date.now()
      const encText = await encryptText(sharedKeyRef.current, text)
      dcRef.current.send(JSON.stringify({ username, ts, encText }))
      pushMsg({ type: 'local', username, text, ts })
      setMsgInput('')
      clearTimeout(typingTimerRef.current)
      isTypingRef.current = false
      sendCtrl({ type: 'typing', value: false })
    } catch (e) {
      console.error('Send error', e)
    }
  }

  // ── Send location ─────────────────────────────────────────────────────────

  function sendLocation() {
    setShowAttachMenu(false)
    if (!navigator.geolocation) {
      sysMsg('Geolocation not supported.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const location = { lat: coords.latitude, lng: coords.longitude }
        const payload = { username, ts: Date.now(), location }
        if (dcRef.current?.readyState === 'open')
          dcRef.current.send(JSON.stringify(payload))
        pushMsg({ type: 'local', ...payload })
      },
      () => sysMsg('Could not get your location.')
    )
  }

  // ── Send file attachment ──────────────────────────────────────────────────

  async function sendFile(file) {
    if (!file || dcRef.current?.readyState !== 'open') return
    if (!sharedKeyRef.current) {
      sysMsg('Encryption not ready — cannot send attachment.')
      return
    }
    if (file.size > 25 * 1024 * 1024) {
      sysMsg('File too large (max 25 MB).')
      return
    }
    try {
      const buf = await file.arrayBuffer()
      const enc = await encryptBinary(sharedKeyRef.current, buf)
      const ts = Date.now()
      dcRef.current.send(
        JSON.stringify({
          username,
          ts,
          encAttachment: enc,
          mimeType: file.type || 'application/octet-stream',
          name: file.name,
          size: file.size,
        })
      )
      const url = URL.createObjectURL(file)
      pushMsg({
        type: 'local',
        username,
        ts,
        attachment: {
          mimeType: file.type || 'application/octet-stream',
          name: file.name,
          url,
          size: file.size,
        },
      })
    } catch (e) {
      console.error('Attachment error', e)
      sysMsg('Failed to send attachment.')
    }
  }

  function openFilePicker(type) {
    setAttachType(type)
    setShowAttachMenu(false)
    setTimeout(() => fileInputRef.current?.click(), 50)
  }

  function onFileSelected(e) {
    const file = e.target.files?.[0]
    if (file) sendFile(file)
    e.target.value = ''
  }

  function getAccept() {
    if (attachType === 'image') return 'image/*'
    if (attachType === 'video') return 'video/*'
    if (attachType === 'audio') return 'audio/*'
    if (attachType === 'document')
      return '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar,.csv'
    return '*/*'
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  function handleInputChange(e) {
    setMsgInput(e.target.value)
    if (e.target.value) notifyTyping()
  }

  // ── Media controls ──────────────────────────────────────────────────────

  function toggleMute() {
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = isMuted
    })
    setIsMuted((v) => !v)
  }

  function leave() {
    router.push('/')
  }

  function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div
      className='h-screen bg-slate-950 flex flex-col overflow-hidden select-none'
      onClick={() => setShowAttachMenu(false)}>
      {/* Hidden audio for remote stream */}
      <audio
        ref={remoteAudioRef}
        autoPlay
        playsInline
        className='hidden'
      />

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type='file'
        accept={getAccept()}
        className='hidden'
        onChange={onFileSelected}
      />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className='flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800 shrink-0 z-10'>
        <div className='flex items-center gap-2.5'>
          <div className='w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0'>
            <ChatIcon />
          </div>
          <span className='text-white font-bold text-sm hidden sm:block'>
            AnonChat
          </span>
        </div>

        <div className='flex items-center gap-2 text-xs'>
          <div className='flex items-center gap-1.5 bg-slate-800 rounded-lg px-2.5 py-1.5 border border-slate-700/50'>
            <span className='text-slate-400'>Room</span>
            <span className='text-white font-mono font-bold tracking-wider'>
              {roomId}
            </span>
          </div>
          <div className='flex items-center gap-1.5 bg-slate-800 rounded-lg px-2.5 py-1.5 border border-slate-700/50'>
            <div className='w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold text-[10px] shrink-0'>
              {username[0]?.toUpperCase()}
            </div>
            <span className='text-white max-w-25 truncate'>{username}</span>
            {myIdle && (
              <span className='text-amber-400 text-[10px] ml-1'>· idle</span>
            )}
          </div>
          <div className='hidden sm:block'>
            <StatusBadge status={status} />
          </div>
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div className='flex flex-1 overflow-hidden flex-col'>
        {/* Sub-header */}
        <div className='px-4 py-3 border-b border-slate-800 shrink-0 flex items-center justify-between bg-slate-900/60'>
          <div>
            <div className='flex items-center gap-2'>
              <p className='text-sm font-semibold text-white'>Chat</p>
              {isEncrypted && (
                <span className='inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5'>
                  <LockIcon /> E2E Encrypted
                </span>
              )}
            </div>
            <p className='text-xs text-slate-500 mt-0.5'>
              {remoteUser ? (
                <span>
                  with <strong className='text-slate-300'>{remoteUser}</strong>
                  {peerIdle && <span className='text-amber-400'> · idle</span>}
                </span>
              ) : (
                'No peer connected'
              )}
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <button
              onClick={toggleMute}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all text-white ${
                isMuted
                  ? 'bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/30'
                  : 'bg-slate-700 hover:bg-slate-600'
              }`}
              title={isMuted ? 'Unmute mic' : 'Mute mic'}>
              <MicIcon muted={isMuted} />
            </button>
            <button
              onClick={leave}
              className='w-10 h-10 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-all shadow-lg shadow-red-500/20 text-white'
              title='Leave room'>
              <LeaveIcon />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className='flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin'>
          {messages.length === 0 && (
            <div className='text-center text-slate-600 text-sm mt-12'>
              <div className='flex justify-center mb-2 opacity-30'>
                <ChatIcon />
              </div>
              <p>No messages yet</p>
              <p className='text-xs mt-1'>
                Messages are end-to-end encrypted peer-to-peer
              </p>
            </div>
          )}
          {messages.map((msg) => {
            if (msg.type === 'system') {
              return (
                <div
                  key={msg.id}
                  className='flex justify-center'>
                  <span className='text-xs text-slate-500 bg-slate-800/80 rounded-full px-3 py-1 text-center max-w-[90%]'>
                    {msg.text}
                  </span>
                </div>
              )
            }
            const isLocal = msg.type === 'local'
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isLocal ? 'items-end' : 'items-start'}`}>
                <div className='flex items-center gap-1.5 mb-1'>
                  <span className='text-[11px] font-semibold text-slate-400'>
                    {isLocal ? 'You' : msg.username}
                  </span>
                  <span className='text-[10px] text-slate-600'>
                    {fmtTime(msg.ts)}
                  </span>
                  {isLocal && isEncrypted && (
                    <span
                      className='text-emerald-500 text-[10px]'
                      title='Sent encrypted'>
                      🔒
                    </span>
                  )}
                </div>

                {msg.location && (
                  <LocationBubble
                    lat={msg.location.lat}
                    lng={msg.location.lng}
                  />
                )}

                {msg.attachment && (
                  <div className='max-w-[82%]'>
                    <AttachmentBubble att={msg.attachment} />
                  </div>
                )}

                {msg.text && (
                  <div
                    className={`max-w-[82%] wrap-break-word rounded-2xl px-3.5 py-2 text-sm leading-relaxed select-text ${
                      isLocal
                        ? 'bg-indigo-600 text-white rounded-tr-sm'
                        : 'bg-slate-800 text-slate-100 rounded-tl-sm'
                    }`}>
                    {msg.text}
                  </div>
                )}
              </div>
            )
          })}

          {/* Typing indicator */}
          {peerTyping && remoteUser && (
            <div className='flex items-start'>
              <div className='bg-slate-800 rounded-2xl rounded-tl-sm px-3.5 py-2.5'>
                <TypingIndicator name={remoteUser} />
              </div>
            </div>
          )}

          <div ref={msgEndRef} />
        </div>

        {/* Input bar */}
        <div className='p-3 border-t border-slate-800 shrink-0 bg-slate-900/40'>
          <div className='flex gap-2 items-center'>
            {/* Attach button + dropdown menu */}
            <div
              className='relative'
              onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setShowAttachMenu((v) => !v)}
                disabled={status !== 'connected' || !isEncrypted}
                className='w-10 h-10 rounded-xl bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-slate-300 transition shrink-0'
                title='Send attachment'>
                <AttachIcon />
              </button>

              {showAttachMenu && (
                <div className='absolute bottom-12 left-0 bg-slate-800 border border-slate-700 rounded-2xl p-1.5 shadow-2xl z-50 min-w-42.5'>
                  {[
                    { key: 'image', emoji: '🖼️', label: 'Image' },
                    { key: 'video', emoji: '🎬', label: 'Video' },
                    { key: 'audio', emoji: '🎵', label: 'Audio' },
                    { key: 'document', emoji: '📄', label: 'Document' },
                  ].map(({ key, emoji, label }) => (
                    <button
                      key={key}
                      onClick={() => openFilePicker(key)}
                      className='flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-slate-700 text-sm text-slate-200 transition text-left'>
                      <span>{emoji}</span>
                      <span>{label}</span>
                    </button>
                  ))}
                  <div className='my-1 border-t border-slate-700' />
                  <button
                    onClick={sendLocation}
                    className='flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-slate-700 text-sm text-slate-200 transition text-left'>
                    <span>📍</span>
                    <span>Location</span>
                  </button>
                </div>
              )}
            </div>

            {/* Text input */}
            <input
              type='text'
              value={msgInput}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={
                status !== 'connected'
                  ? 'Waiting for connection…'
                  : !isEncrypted
                    ? 'Establishing encryption…'
                    : 'Type a message…'
              }
              disabled={status !== 'connected' || !isEncrypted}
              maxLength={2000}
              className='flex-1 bg-slate-800/80 border border-slate-700/60 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/80 focus:border-transparent disabled:opacity-40 transition'
            />

            {/* Send button */}
            <button
              onClick={sendMessage}
              disabled={
                !msgInput.trim() || status !== 'connected' || !isEncrypted
              }
              className='px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-all shrink-0'
              title='Send'>
              <SendIcon />
            </button>
          </div>

          <p className='text-[10px] text-slate-600 mt-1.5 text-center flex items-center justify-center gap-1'>
            <LockIcon />
            {isEncrypted
              ? 'ECDH · AES-256-GCM · end-to-end encrypted'
              : 'Establishing secure channel…'}
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Suspense boundary required for useSearchParams ────────────────────────────

export default function RoomPage() {
  return (
    <Suspense
      fallback={
        <div className='h-screen bg-slate-950 flex items-center justify-center'>
          <div className='flex flex-col items-center gap-4'>
            <div className='w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin' />
            <p className='text-slate-400 text-sm'>Loading room…</p>
          </div>
        </div>
      }>
      <RoomContent />
    </Suspense>
  )
}
