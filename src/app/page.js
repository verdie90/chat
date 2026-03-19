'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const ADJECTIVES = [
  'Anonymous',
  'Silent',
  'Shadow',
  'Ghost',
  'Stealth',
  'Hidden',
  'Phantom',
  'Secret',
  'Covert',
  'Masked',
  'Mystic',
  'Cipher',
]
const NOUNS = [
  'Panda',
  'Eagle',
  'Fox',
  'Hawk',
  'Wolf',
  'Bear',
  'Lynx',
  'Raven',
  'Viper',
  'Falcon',
  'Otter',
  'Moose',
]

const FRUITS = [
  'Apple',
  'Mango',
  'Kiwi',
  'Grape',
  'Lemon',
  'Peach',
  'Berry',
  'Melon',
  'Cherry',
  'Papaya',
  'Guava',
  'Lychee',
  'Plum',
  'Fig',
  'Lime',
  'Pear',
  'Banana',
  'Orange',
  'Coconut',
  'Apricot',
]

function generateUsername() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]
  const num = Math.floor(Math.random() * 99) + 1
  return `${adj}${noun}${num}`
}

function generateRoomId() {
  const a = FRUITS[Math.floor(Math.random() * FRUITS.length)]
  let b
  do {
    b = FRUITS[Math.floor(Math.random() * FRUITS.length)]
  } while (b === a)
  const n = Math.floor(Math.random() * 99) + 1
  return `${a}-${b}-${n}`
}

export default function Home() {
  const router = useRouter()
  // Initialize with empty string to avoid SSR/client hydration mismatch,
  // then set random values on the client via useEffect.
  const [username, setUsername] = useState('')
  const [roomId, setRoomId] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setUsername(generateUsername())
    setRoomId(generateRoomId())
  }, [])

  const handleJoin = (e) => {
    e.preventDefault()
    const safeRoom = roomId.trim()
    const safeUser = username.trim()
    if (!safeUser || !safeRoom) return
    router.push(
      `/room/${encodeURIComponent(safeRoom)}?username=${encodeURIComponent(safeUser)}`
    )
  }

  const handleCopyRoom = () => {
    if (!roomId.trim()) return
    navigator.clipboard
      .writeText(roomId.trim())
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => {})
  }

  return (
    <div className='min-h-screen bg-linear-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-4'>
      <div className='w-full max-w-md'>
        {/* Logo */}
        <div className='text-center mb-8'>
          <div className='inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600 mb-4 shadow-lg shadow-indigo-500/30'>
            <svg
              className='w-8 h-8 text-white'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'>
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z'
              />
            </svg>
          </div>
          <h1 className='text-3xl font-bold text-white tracking-tight mb-1'>
            AnonChat
          </h1>
          <p className='text-slate-400 text-sm'>
            Realtime anonymous video &amp; text chat via WebRTC
          </p>
        </div>

        {/* Card */}
        <div className='bg-slate-800/60 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-8 shadow-2xl'>
          <form
            onSubmit={handleJoin}
            className='space-y-5'>
            {/* Username */}
            <div>
              <label className='block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2'>
                Username
              </label>
              <div className='flex gap-2'>
                <input
                  type='text'
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  maxLength={30}
                  placeholder='Your anonymous name'
                  className='flex-1 bg-slate-700/50 border border-slate-600/70 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition'
                />
                <button
                  type='button'
                  onClick={() => setUsername(generateUsername())}
                  className='px-3 py-3 bg-slate-700/80 hover:bg-slate-600/80 border border-slate-600/70 rounded-xl text-slate-300 hover:text-white transition text-lg'
                  title='Random username'>
                  🎲
                </button>
              </div>
            </div>

            {/* Room ID */}
            <div>
              <label className='block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2'>
                Room ID
              </label>
              <div className='flex gap-2'>
                <input
                  type='text'
                  value={roomId}
                  onChange={(e) =>
                    setRoomId(e.target.value.replace(/[^A-Za-z0-9-]/g, ''))
                  }
                  maxLength={30}
                  placeholder='Room code'
                  className='flex-1 bg-slate-700/50 border border-slate-600/70 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 font-mono tracking-wide focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition'
                />
                <button
                  type='button'
                  onClick={handleCopyRoom}
                  disabled={!roomId.trim()}
                  className='px-3 py-3 bg-slate-700/80 hover:bg-slate-600/80 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-600/70 rounded-xl text-slate-300 hover:text-white transition text-lg'
                  title={copied ? 'Copied!' : 'Copy room ID'}>
                  {copied ? '✅' : '📋'}
                </button>
                <button
                  type='button'
                  onClick={() => setRoomId(generateRoomId())}
                  className='px-3 py-3 bg-slate-700/80 hover:bg-slate-600/80 border border-slate-600/70 rounded-xl text-slate-300 hover:text-white transition text-lg'
                  title='Random room ID'>
                  🔀
                </button>
              </div>
              <p className='text-xs text-slate-500 mt-1.5'>
                {copied
                  ? '✅ Room ID copied!'
                  : 'Click 📋 to copy room ID, then share it with friends'}
              </p>
            </div>

            {/* Join */}
            <button
              type='submit'
              disabled={!username.trim() || !roomId.trim()}
              className='w-full py-3.5 px-6 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 text-sm'>
              Join Room →
            </button>
          </form>

          <div className='mt-6 pt-5 border-t border-slate-700/40'>
            <p className='text-xs text-slate-500 text-center leading-relaxed'>
              🔒 End-to-end encrypted via WebRTC &nbsp;·&nbsp; No accounts
              &nbsp;·&nbsp; No data stored
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
