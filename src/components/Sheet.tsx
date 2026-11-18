import { useEffect, type ReactNode } from 'react'

/** Folha que sobe de baixo, como no iPhone. Fecha com Esc ou tocando fora. Fica por cima do detalhe. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fade-in fixed inset-0 z-40 flex items-end bg-black/30" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="sheet-up mx-auto max-h-[85dvh] w-full max-w-xl overflow-y-auto overscroll-contain rounded-t-[36px] bg-canvas px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]"
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-separator" />
        {children}
      </div>
    </div>
  )
}
