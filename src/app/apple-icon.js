import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#4f46e5',
        borderRadius: '36px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <svg
        width='110'
        height='110'
        viewBox='0 0 512 512'
        fill='none'>
        <rect
          x='80'
          y='108'
          width='352'
          height='228'
          rx='44'
          fill='white'
        />
        <polygon
          points='172,336 256,428 214,336'
          fill='white'
        />
        <circle
          cx='176'
          cy='222'
          r='24'
          fill='#4f46e5'
        />
        <circle
          cx='256'
          cy='222'
          r='24'
          fill='#4f46e5'
        />
        <circle
          cx='336'
          cy='222'
          r='24'
          fill='#4f46e5'
        />
      </svg>
    </div>,
    { ...size }
  )
}
