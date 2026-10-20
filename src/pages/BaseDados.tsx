import { PageHead } from '../components/ui'
import Historico from '../components/Historico'

export function BaseHistorico() {
  return (
    <>
      <PageHead title="Histórico de alterações" sub="Quem mudou o quê e quando, em todo o sistema (últimas 300 alterações)." />
      <Historico />
    </>
  )
}
