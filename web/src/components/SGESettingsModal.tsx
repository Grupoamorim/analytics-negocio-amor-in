import { useState, useEffect } from 'react'
import {
  KeyRound,
  Building,
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Settings,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { useConfiguracoes } from '@/hooks/useConfiguracoes'
import { getSGEConfig, saveSGEConfig, testSGEConnection } from '@/utils/sgeIntegration'

interface SGESettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfigSaved?: () => void
}

export default function SGESettingsModal({
  open,
  onOpenChange,
  onConfigSaved,
}: SGESettingsModalProps) {
  const { toast } = useToast()
  const { config: dbConfig, saveConfig } = useConfiguracoes()
  const [cnpj, setCnpj] = useState('')
  const [token, setToken] = useState('')
  const [testingConnection, setTestingConnection] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<{
    tested: boolean
    ok: boolean
    message: string
  } | null>(null)

  useEffect(() => {
    if (open) {
      const cfg = getSGEConfig()
      setCnpj(dbConfig.sgeCnpj || cfg.cnpj || '')
      setToken(dbConfig.sgeToken || cfg.token || '')
      setConnectionStatus(null)
    }
  }, [open, dbConfig])

  const handleSave = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!cnpj.trim() || !token.trim()) {
      toast({
        title: 'Campos incompletos',
        description: 'Informe o CNPJ e o Token para salvar a configuração.',
        variant: 'destructive',
      })
      return
    }

    saveSGEConfig({ cnpj: cnpj.trim(), token: token.trim() })
    saveConfig({ sgeCnpj: cnpj.trim(), sgeToken: token.trim() })
    toast({
      title: 'Configurações do SGE salvas',
      description: 'Credenciais atualizadas com sucesso no Supabase.',
    })
    onConfigSaved?.()
    onOpenChange(false)
  }

  const handleTest = async () => {
    if (!cnpj.trim() || !token.trim()) {
      toast({
        title: 'Atenção',
        description: 'Preencha CNPJ e Token antes de testar a conexão.',
        variant: 'destructive',
      })
      return
    }

    setTestingConnection(true)
    setConnectionStatus(null)

    try {
      const result = await testSGEConnection(cnpj, token)
      setConnectionStatus({
        tested: true,
        ok: result.ok,
        message: result.message,
      })

      if (result.ok) {
        toast({
          title: 'Conexão estabelecida!',
          description: result.message,
        })
      } else {
        toast({
          title: 'Falha na conexão',
          description: result.message,
          variant: 'destructive',
        })
      }
    } catch {
      const msg = 'Servidor SGE indisponível. Tente novamente.'
      setConnectionStatus({
        tested: true,
        ok: false,
        message: msg,
      })
      toast({
        title: 'Erro de comunicação',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setTestingConnection(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Settings className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            Configuração do SGE ERP
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Configure as credenciais de autenticação (Basic Auth) para sincronização direta com a
            API do SGE.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="sge-modal-cnpj" className="text-xs font-semibold">
              CNPJ da Empresa
            </Label>
            <div className="relative">
              <Building className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                id="sge-modal-cnpj"
                type="text"
                placeholder="00.000.000/0000-00"
                value={cnpj}
                onChange={(e) => setCnpj(e.target.value)}
                className="pl-9 text-xs"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sge-modal-token" className="text-xs font-semibold">
              Token de Integração (API)
            </Label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                id="sge-modal-token"
                type="password"
                placeholder="Cole o token secreto aqui"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="pl-9 text-xs"
                autoComplete="new-password"
              />
            </div>
            <p className="text-[11px] text-slate-400">
              As credenciais ficam salvas no navegador e são utilizadas no botão
              &quot;Sincronizar&quot;.
            </p>
          </div>

          {connectionStatus && (
            <div
              className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${
                connectionStatus.ok
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                  : 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300'
              }`}
            >
              {connectionStatus.ok ? (
                <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              )}
              <div className="flex-1 leading-relaxed">{connectionStatus.message}</div>
            </div>
          )}

          <div className="pt-1 flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={testingConnection || !cnpj.trim() || !token.trim()}
              className="text-xs gap-1.5"
            >
              {testingConnection ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-orange-600" />
                  Testando...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-orange-600" />
                  Testar Conexão
                </>
              )}
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-orange-600 hover:bg-orange-700 text-white text-xs"
              >
                Salvar
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
