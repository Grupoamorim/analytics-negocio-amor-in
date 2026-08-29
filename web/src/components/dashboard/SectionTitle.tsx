import InfoHint from './InfoHint'

/** Cabeçalho de faixa do Dashboard (Comercial, Financeiro, ...) com explicação. */
export default function SectionTitle({
  children,
  ajuda,
  right,
}: {
  children: React.ReactNode
  ajuda: React.ReactNode
  right?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
        {children}
        <InfoHint title={typeof children === 'string' ? children : undefined}>{ajuda}</InfoHint>
      </h2>
      {right}
    </div>
  )
}
