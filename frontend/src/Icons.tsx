import type { SVGProps } from 'react'

const base = {
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2,
  strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
} as const

type P = SVGProps<SVGSVGElement>

export const SearchIcon = (p: P) => (
  <svg {...base} {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
)
export const SparkleIcon = (p: P) => (
  <svg {...base} {...p}><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M19 3v4M17 5h4" /></svg>
)
export const StarIcon = ({ filled, ...p }: P & { filled?: boolean }) => (
  <svg {...base} {...p} fill={filled ? 'currentColor' : 'none'}>
    <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
  </svg>
)
export const SunIcon = (p: P) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
)
export const MoonIcon = (p: P) => (
  <svg {...base} {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
)
export const CheckIcon = (p: P) => (
  <svg {...base} {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
)
export const AlertIcon = (p: P) => (
  <svg {...base} {...p}><path d="M12 3 2.5 20h19z" /><path d="M12 10v4M12 17.5v.01" /></svg>
)
export const ChevronIcon = (p: P) => (
  <svg {...base} {...p}><path d="m6 9 6 6 6-6" /></svg>
)
export const CloseIcon = (p: P) => (
  <svg {...base} {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>
)
export const BookmarkIcon = (p: P) => (
  <svg {...base} {...p}><path d="M6 3h12v18l-6-4.5L6 21z" /></svg>
)
export const ChartIcon = (p: P) => (
  <svg {...base} {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>
)
export const MicIcon = (p: P) => (
  <svg {...base} {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
)

export function Logo() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7c7cff" /><stop offset="1" stopColor="#4747d6" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#lg)" />
      <path d="M9 11.5A2.5 2.5 0 0 1 11.5 9h9a2.5 2.5 0 0 1 2.5 2.5v6a2.5 2.5 0 0 1-2.5 2.5H15l-3.6 3v-3A2.5 2.5 0 0 1 9 17.5z" fill="#fff" />
      <circle cx="13" cy="14.5" r="1.1" fill="#5b5bf0" /><circle cx="16" cy="14.5" r="1.1" fill="#5b5bf0" /><circle cx="19" cy="14.5" r="1.1" fill="#5b5bf0" />
    </svg>
  )
}
