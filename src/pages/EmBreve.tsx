import { PageHead } from '../components/ui'
import type { Secao } from '../lib/secoes'

/** Área prevista na arquitetura, ainda sem módulo construído. */
export default function EmBreve({ secao }: { secao: Secao }) {
  return (
    <>
      <PageHead title={secao.titulo} sub={secao.desc} />
      <div className="card" style={{ maxWidth: 560 }}>
        <p style={{ marginTop: 0 }}><b>Em breve · {secao.fase}</b></p>
        <p className="muted">
          Esta área faz parte da arquitetura do sistema, mas o módulo ainda não foi construído. Os indicadores do Dashboard Executivo que dependem dela
          aparecem como “—” até lá.
        </p>
      </div>
    </>
  )
}
