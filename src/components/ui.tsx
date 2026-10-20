import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react'

/* ---------- toasts ---------- */
type ToastKind = 'erro' | 'ok'
interface ToastItem {
  id: number
  msg: string
  kind: ToastKind
}
const ToastCtx = createContext<(msg: string, kind?: ToastKind) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const push = useCallback((msg: string, kind: ToastKind = 'ok') => {
    const id = Date.now() + Math.random()
    setItems((l) => [...l, { id, msg, kind }])
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), kind === 'erro' ? 7000 : 3500)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)

/** Traduz erros técnicos do banco em frases que a equipe entende. */
const ERROS: [RegExp, string][] = [
  [/tarefas_vinculo_chk/, 'Ligue a tarefa a uma oportunidade, projeto, empresa ou contato.'],
  [/tarefas_andamento_responsavel_chk/, 'Uma tarefa em andamento precisa de um responsável.'],
  [/tarefas_aprovacao_responsavel_chk/, 'Uma aprovação concluída precisa de um responsável.'],
  [/organizacoes_cnpj_uq/, 'Já existe uma empresa cadastrada com este CNPJ.'],
  [/projetos_oportunidade_uq/, 'Esta oportunidade já gerou um projeto.'],
  [/documentos_check/, 'O documento precisa de um arquivo ou link e de um vínculo (empresa, oportunidade ou projeto).'],
  [/row-level security|violates row-level/, 'Seu papel não tem permissão para esta ação.'],
  [/violates foreign key constraint/, 'Este registro está em uso em outro lugar e não pode ser excluído.'],
]
export const friendly = (msg: string) => ERROS.find(([re]) => re.test(msg))?.[1] ?? msg

/** Executa uma ação; mostra o erro do banco (ex.: trava da Woba) como aviso. */
export function useAct() {
  const toast = useToast()
  return useCallback(
    async (fn: () => Promise<unknown>, okMsg?: string): Promise<boolean> => {
      try {
        await fn()
        if (okMsg) toast(okMsg, 'ok')
        return true
      } catch (e) {
        toast(friendly((e as Error).message), 'erro')
        return false
      }
    },
    [toast],
  )
}

/* ---------- modal ---------- */
export function Modal({
  title,
  onClose,
  children,
  wide,
  footer,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
  footer?: ReactNode
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  )
}

/* ---------- campos ---------- */
export function Field({
  label,
  children,
  hint,
  span,
}: {
  label: string
  children: ReactNode
  hint?: string
  span?: 2 | 3
}) {
  return (
    <label className={`field ${span ? `span-${span}` : ''}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

type Opt = string | number | { v: string | number; l: string }
export function Select({
  options,
  placeholder = '—',
  value,
  ...rest
}: { options: readonly Opt[]; placeholder?: string; value: string | number | null | undefined } & Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'value'
>) {
  return (
    <select value={value ?? ''} {...rest}>
      <option value="">{placeholder}</option>
      {options.map((o) => {
        const v = typeof o === 'object' ? o.v : o
        const l = typeof o === 'object' ? o.l : o
        return (
          <option key={String(v)} value={v}>
            {l}
          </option>
        )
      })}
    </select>
  )
}

/* ---------- pequenos blocos ---------- */
export function Badge({
  children,
  tone = 'neutral',
  title,
}: {
  children: ReactNode
  tone?: 'neutral' | 'bronze' | 'ok' | 'warn' | 'bad' | 'info'
  title?: string
}) {
  return (
    <span className={`badge badge-${tone}`} title={title}>
      {children}
    </span>
  )
}

export function WobaBadge({ v }: { v: 'Sim' | 'Não' | 'Validar' | undefined | null }) {
  if (v === 'Sim') return <Badge tone="bad" title="Atendida pela Woba: só demandas via Woba">Atendida pela Woba</Badge>
  if (v === 'Validar') return <Badge tone="warn" title="Confirmar com a Woba antes de avançar da etapa 1">Woba: validar</Badge>
  return null
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}

export function PageHead({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      <div className="actions">{actions}</div>
    </div>
  )
}

export function Loading({ error }: { error?: string | null }) {
  if (error) return <div className="alert alert-bad">Não foi possível carregar: {error}</div>
  return <div className="loading">Carregando…</div>
}

export function Confirm({
  title,
  message,
  confirmLabel = 'Confirmar',
  onConfirm,
  onCancel,
}: {
  title: string
  message: ReactNode
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button className="btn" onClick={onCancel}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <p>{message}</p>
    </Modal>
  )
}
