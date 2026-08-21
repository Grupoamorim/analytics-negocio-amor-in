import React, { useState, useRef, useMemo } from 'react'
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Download,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  parseCSV,
  validateCsvHeaders,
  transformCsvToEntities,
  downloadTemplateCsv,
  TEMPLATE_COLUMNS,
  CsvParsedData,
  CsvColumnMapping,
  ImportResult,
} from '@/utils/csvImporter'
import { useCRM } from '@/context/CRMContext'
import { useToast } from '@/hooks/use-toast'

interface ImportCsvModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImportComplete?: (result: ImportResult) => void
}

type Step = 'upload' | 'preview' | 'importing' | 'complete'

export default function ImportCsvModal({
  open,
  onOpenChange,
  onImportComplete,
}: ImportCsvModalProps) {
  const { leads, deals, members, importBatchEntities } = useCRM()
  const { toast } = useToast()

  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [parsedData, setParsedData] = useState<CsvParsedData | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [progressPercent, setProgressPercent] = useState(0)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Reset modal state
  const resetState = () => {
    setStep('upload')
    setFile(null)
    setParsedData(null)
    setProgressPercent(0)
    setImportResult(null)
    setErrorMsg(null)
    setIsDragging(false)
  }

  const handleModalClose = (isOpen: boolean) => {
    if (!isOpen) {
      resetState()
    }
    onOpenChange(isOpen)
  }

  // Handle file selection & reading
  const processFile = (selectedFile: File) => {
    if (!selectedFile) return
    if (!selectedFile.name.endsWith('.csv') && !selectedFile.name.endsWith('.txt')) {
      setErrorMsg('Por favor, selecione um arquivo no formato .CSV')
      return
    }

    setErrorMsg(null)
    setFile(selectedFile)

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string
        const parsed = parseCSV(text)

        if (parsed.headers.length === 0 || parsed.rows.length === 0) {
          setErrorMsg('O arquivo CSV parece estar vazio ou não possui linhas válidas.')
          return
        }

        // Rigorous validation against template columns
        const validation = validateCsvHeaders(parsed.headers)
        if (!validation.isValid) {
          setErrorMsg(
            validation.error ||
              'O arquivo não segue o formato esperado. Baixe a planilha modelo e use-a como base.',
          )
          return
        }

        setParsedData(parsed)
        setStep('preview')
      } catch (err: any) {
        setErrorMsg('Erro ao processar o arquivo CSV: ' + (err.message || 'formato inválido'))
      }
    }

    reader.onerror = () => {
      setErrorMsg('Não foi possível ler o arquivo selecionado.')
    }

    reader.readAsText(selectedFile, 'UTF-8')
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0])
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0])
    }
  }

  // Execute import process
  const executeImport = () => {
    if (!parsedData) return
    setStep('importing')
    setProgressPercent(10)

    // Direct mapping based on fixed template columns
    const fixedMapping: CsvColumnMapping = {
      empresa: 'Empresa',
      curso: 'Curso',
      faculdade: 'Faculdade',
      turma: 'Turma',
      anoFormatura: 'Ano Formatura',
      cidade: 'Cidade',
      funil: 'Funil',
      contato: 'Contato',
      telefone: 'Telefone',
      sdr: 'SDR',
      closer: 'Closer',
      observacoes: 'Observações',
      concorrentes: 'Concorrentes',
      tipoServico: 'Tipo de Serviço',
      comoConheceu: 'Como Conheceu',
      proposta: 'Proposta',
    }

    setTimeout(() => {
      try {
        const defaultOwner = members[0]?.id || 'm-1'
        const {
          leads: newLeads,
          deals: newDeals,
          result,
        } = transformCsvToEntities(parsedData, fixedMapping, leads, deals, defaultOwner, (pct) =>
          setProgressPercent(pct),
        )

        setProgressPercent(100)

        // Save batch
        const summaryText = `${result.importedCount} criadas, ${result.updatedCount} atualizadas (${result.dealsCreatedCount} deals)`
        const { storageWarning } = importBatchEntities(newLeads, newDeals, summaryText)
        result.storageWarning = Boolean(result.storageWarning || storageWarning)

        setImportResult(result)
        setStep('complete')

        if (onImportComplete) {
          onImportComplete(result)
        }

        // Show feedback toast
        toast({
          title: 'Importação concluída com sucesso!',
          description: `${result.importedCount} turmas importadas, ${result.updatedCount} atualizadas, ${result.ignoredCount} ignoradas.`,
        })

        if (result.storageWarning) {
          toast({
            variant: 'destructive',
            title: 'Aviso de Armazenamento',
            description:
              'Armazenamento cheio ou próximo do limite (~5MB). Considere conectar um banco de dados (Supabase) para importar o restante.',
          })
        }
      } catch (err: any) {
        setErrorMsg('Ocorreu um erro durante a importação: ' + (err.message || 'erro interno'))
        setStep('upload')
      }
    }, 400)
  }

  // Top 5 preview rows
  const previewRows = useMemo(() => {
    if (!parsedData) return []
    return parsedData.rows.slice(0, 5)
  }, [parsedData])

  return (
    <Dialog open={open} onOpenChange={handleModalClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 overflow-hidden bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
        {/* Header */}
        <DialogHeader className="p-6 pb-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-orange-50 dark:bg-orange-950/60 border border-orange-200/60 dark:border-orange-800/60 text-orange-600 dark:text-orange-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                Importar Turmas via Planilha CSV
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                O arquivo deve seguir exatamente as colunas e a ordem da planilha modelo.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMsg && (
            <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 space-y-2 text-xs text-rose-700 dark:text-rose-300">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-600" />
                <div className="flex-1 font-medium">{errorMsg}</div>
              </div>
              <div className="pt-2 border-t border-rose-200/60 dark:border-rose-800/60 flex items-center justify-between">
                <span className="text-[11px] text-rose-600 dark:text-rose-400">
                  Precisa do formato correto? Baixe a planilha modelo.
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={downloadTemplateCsv}
                  className="h-7 text-xs gap-1.5 border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/40"
                >
                  <Download className="w-3.5 h-3.5" />
                  Baixar Planilha Modelo
                </Button>
              </div>
            </div>
          )}

          {/* STEP 1: Upload */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                  isDragging
                    ? 'border-orange-500 bg-orange-50/40 dark:bg-orange-950/20 scale-[0.99]'
                    : 'border-slate-300 dark:border-slate-700 hover:border-orange-400 dark:hover:border-orange-600 bg-slate-50/50 dark:bg-slate-950/20'
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileInputChange}
                  accept=".csv,text/csv,text/plain"
                  className="hidden"
                />

                <div className="mx-auto w-14 h-14 rounded-2xl bg-orange-50 dark:bg-orange-950/50 flex items-center justify-center text-orange-600 dark:text-orange-400 mb-3 border border-orange-100 dark:border-orange-900">
                  <UploadCloud className="w-7 h-7" />
                </div>

                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Arraste seu arquivo CSV aqui ou clique para selecionar
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                  Apenas arquivos que correspondam exatamente às colunas da planilha modelo serão
                  aceitos.
                </p>

                <div className="mt-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs font-semibold bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                  >
                    Procurar no computador
                  </Button>
                </div>
              </div>

              {/* Download template notice */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
                <div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200">
                    Estrutura esperada do arquivo (16 colunas)
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">{TEMPLATE_COLUMNS.join(', ')}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={downloadTemplateCsv}
                  className="text-xs gap-1.5 flex-shrink-0"
                >
                  <Download className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
                  Baixar Modelo
                </Button>
              </div>
            </div>
          )}

          {/* STEP 2: Preview validated file */}
          {step === 'preview' && parsedData && (
            <div className="space-y-6">
              {/* File Info */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-xs text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      {file?.name || 'arquivo.csv'}
                      <Badge className="bg-emerald-600 text-white text-[10px] px-1.5 py-0">
                        Estrutura Válida (16 colunas)
                      </Badge>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      <strong>{parsedData.rows.length}</strong> turmas prontas para importação.
                    </div>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep('upload')}
                  className="text-xs text-slate-500 hover:text-slate-900"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1" />
                  Trocar arquivo
                </Button>
              </div>

              {/* Preview Rows */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <span>Pré-visualização dos dados:</span>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {previewRows.length} de {parsedData.rows.length} linhas
                  </Badge>
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-50/50 dark:bg-slate-950/40">
                  <div className="overflow-x-auto max-h-64">
                    <table className="w-full text-left text-[11px] border-collapse">
                      <thead>
                        <tr className="bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider">
                          <th className="py-2 px-3">#</th>
                          {parsedData.headers.map((h, i) => (
                            <th key={i} className="py-2 px-3 whitespace-nowrap">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
                        {previewRows.map((row, rIdx) => (
                          <tr
                            key={rIdx}
                            className="hover:bg-slate-100/50 dark:hover:bg-slate-900/40"
                          >
                            <td className="py-2 px-3 font-mono text-slate-400">{rIdx + 1}</td>
                            {parsedData.headers.map((_, cIdx) => (
                              <td
                                key={cIdx}
                                className="py-2 px-3 text-slate-700 dark:text-slate-300 max-w-[180px] truncate"
                                title={row[cIdx] || ''}
                              >
                                {row[cIdx] || <span className="text-slate-400 italic">—</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Importing */}
          {step === 'importing' && (
            <div className="py-12 px-4 text-center space-y-5">
              <div className="w-16 h-16 rounded-2xl bg-orange-50 dark:bg-orange-950/50 mx-auto flex items-center justify-center text-orange-600 dark:text-orange-400 animate-pulse border border-orange-200 dark:border-orange-800">
                <RefreshCw className="w-8 h-8 animate-spin" />
              </div>

              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Importando turmas e sincronizando com o CRM...
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Criando turmas, mapeando estágios do funil e deduplicando registros.
                </p>
              </div>

              <div className="max-w-md mx-auto space-y-2">
                <Progress value={progressPercent} className="h-2.5" />
                <div className="text-xs text-slate-500 font-mono text-right">
                  {progressPercent}%
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Complete */}
          {step === 'complete' && importResult && (
            <div className="py-6 px-4 space-y-6 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-950/50 mx-auto flex items-center justify-center text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  Importação Finalizada!
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Todas as turmas foram sincronizadas no localStorage e integradas ao CRM.
                </p>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-xl mx-auto text-left">
                <div className="p-3.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                  <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                    Novas Turmas
                  </div>
                  <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 mt-0.5">
                    {importResult.importedCount}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                  <div className="text-[11px] font-medium text-blue-700 dark:text-blue-300">
                    Atualizadas
                  </div>
                  <div className="text-2xl font-bold text-blue-700 dark:text-blue-300 mt-0.5">
                    {importResult.updatedCount}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-orange-50/60 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800">
                  <div className="text-[11px] font-medium text-orange-700 dark:text-orange-300">
                    Deals Criados
                  </div>
                  <div className="text-2xl font-bold text-orange-700 dark:text-orange-300 mt-0.5">
                    {importResult.dealsCreatedCount}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] font-medium text-slate-500">Ignoradas</div>
                  <div className="text-2xl font-bold text-slate-700 dark:text-slate-300 mt-0.5">
                    {importResult.ignoredCount}
                  </div>
                </div>
              </div>

              {importResult.storageWarning && (
                <div className="max-w-xl mx-auto p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-left flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-800 dark:text-amber-200 space-y-1">
                    <strong className="font-semibold block">Limite do Navegador Próximo</strong>
                    <p>
                      Armazenamento cheio ou próximo do limite (~5MB). Considere conectar um banco
                      de dados (Supabase) para importar o restante sem restrições.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 flex items-center justify-between sm:justify-between">
          {step === 'preview' && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStep('upload')}
                className="text-xs"
              >
                Voltar
              </Button>
              <Button
                type="button"
                onClick={executeImport}
                className="bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold gap-1.5 shadow-sm"
              >
                Importar {parsedData?.rows.length || 0} Turmas
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </>
          )}

          {step === 'upload' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleModalClose(false)}
              className="text-xs ml-auto"
            >
              Cancelar
            </Button>
          )}

          {step === 'complete' && (
            <Button
              type="button"
              onClick={() => handleModalClose(false)}
              className="bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold ml-auto"
            >
              Concluir e Ver Turmas
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
