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
  const pendingIceRef = useRef([]) // ICE candidates received before remote description is set
  const remoteIdRef = useRef(null) // socketId of the remote peer

  // State
  const [messages, setMessages] = useState([])
  const [msgInput, setMsgInput] = useState('')
  const [status, setStatus] = useState('connecting')
  const [remoteUser, setRemoteUser] = useState(null)
  const [isMuted, setIsMuted] = useState(false)

  // Auto-scroll chat
  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Helpers (stable via refs) ────────────────────────────────────────

  const pushMsg = (msg) =>
    setMessages((prev) => [
      ...prev,
      { ...msg, id: `${Date.now()}-${Math.random()}` },
    ])

  const sysMsg = (text) => pushMsg({ type: 'system', text, ts: Date.now() })

  // ── Create / reset peer connection ────────────────────────────────────

  function buildPC(socket) {
    // Close any previous connection
    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }
    // NOTE: do NOT clear pendingIceRef here — it may already hold ICE candidates
    // that arrived before the offer (trickle ICE race). Clear only on user-left.
    dcRef.current = null

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
    dc.onopen = () =>
      sysMsg('Chat channel open — messages are end-to-end encrypted.')
    dc.onclose = () => {
      dcRef.current = null
    }
    dc.onerror = (e) => console.error('DataChannel error', e)
    dc.onmessage = ({ data }) => {
      try {
        const msg = JSON.parse(data)
        pushMsg({ type: 'remote', ...msg })
        setUnread((n) => n + 1)
      } catch {}
    }
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

    return () => {
      destroyed = true
      localStreamRef.current?.getTracks().forEach((t) => t.stop())
      pcRef.current?.close()
      socketRef.current?.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, username])

  // ── Send text via DataChannel ──────────────────────────────────────────

  function sendMessage() {
    const text = msgInput.trim()
    if (!text) return
    if (dcRef.current?.readyState !== 'open') {
      sysMsg('Not connected — message not sent.')
      return
    }
    const payload = { username, text, ts: Date.now() }
    dcRef.current.send(JSON.stringify(payload))
    pushMsg({ type: 'local', ...payload })
    setMsgInput('')
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
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
    <div className='h-screen bg-slate-950 flex flex-col overflow-hidden select-none'>
      {/* Hidden audio element — receives remote peer's audio track */}
      <audio
        ref={remoteAudioRef}
        autoPlay
        playsInline
        className='hidden'
      />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className='flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800 shrink-0 z-10'>
        {/* Brand */}
        <div className='flex items-center gap-2.5'>
          <div className='w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0'>
            <ChatIcon />
          </div>
          <span className='text-white font-bold text-sm hidden sm:block'>
            AnonChat
          </span>
        </div>

        {/* Room + user info */}
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
          </div>
          <div className='hidden sm:block'>
            <StatusBadge status={status} />
          </div>
        </div>
      </header>

      {/* ── Body — full-width chat ────────────────────────────────────────────── */}
      <div className='flex flex-1 overflow-hidden flex-col'>
        {/* Chat sub-header: peer info + controls */}
        <div className='px-4 py-3 border-b border-slate-800 shrink-0 flex items-center justify-between bg-slate-900/60'>
          <div>
            <p className='text-sm font-semibold text-white'>Chat</p>
            <p className='text-xs text-slate-500 mt-0.5'>
              {remoteUser ? `with ${remoteUser}` : 'No peer connected'}
            </p>
          </div>
          <div className='flex items-center gap-2'>
            {/* Mute */}
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
            {/* Leave */}
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
              <ChatIcon />
              <p className='mt-2'>No messages yet</p>
              <p className='text-xs mt-1'>Messages go directly peer-to-peer</p>
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
                </div>
                <div
                  className={`max-w-[82%] wrap-break-word rounded-2xl px-3.5 py-2 text-sm leading-relaxed select-text ${
                    isLocal
                      ? 'bg-indigo-600 text-white rounded-tr-sm'
                      : 'bg-slate-800 text-slate-100 rounded-tl-sm'
                  }`}>
                  {msg.text}
                </div>
              </div>
            )
          })}
          <div ref={msgEndRef} />
        </div>

        {/* Input */}
        <div className='p-3 border-t border-slate-800 shrink-0'>
          <div className='flex gap-2'>
            <input
              type='text'
              value={msgInput}
              onChange={(e) => setMsgInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                status === 'connected'
                  ? 'Type a message…'
                  : 'Waiting for connection…'
              }
              disabled={status !== 'connected'}
              maxLength={500}
              className='flex-1 bg-slate-800/80 border border-slate-700/60 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/80 focus:border-transparent disabled:opacity-40 transition'
            />
            <button
              onClick={sendMessage}
              disabled={!msgInput.trim() || status !== 'connected'}
              className='px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-all'
              title='Send'>
              <SendIcon />
            </button>
          </div>
          <p className='text-[10px] text-slate-600 mt-1.5 text-center'>
            Enter ↵ to send · messages are end-to-end encrypted
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
