import { useEffect, useRef } from 'react'
import AuthForm from './AuthForm'
import { CloseIcon } from './Icons'

/** Login / sign-up in a native <dialog>: focus trapping, Esc to close and a backdrop come built in. */
export default function AuthDialog({ open, message, onClose }: {
  open: boolean
  message?: string
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog ref={ref} className="modal" aria-labelledby="auth-title" onClose={onClose}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      {open && (
        <>
          <button className="icon-btn close-x" onClick={onClose} aria-label="Close"><CloseIcon /></button>
          <AuthForm message={message} onDone={onClose} />
        </>
      )}
    </dialog>
  )
}
