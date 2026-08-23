import React from 'react'

interface Props {
  children: React.ReactNode
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Erro não tratado na aplicação:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-[#0a0f14] flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#111820] border border-white/[0.08] rounded-2xl p-6 text-center space-y-4">
            <div className="text-3xl">⚠️</div>
            <h1 className="text-white font-bold text-lg">Algo deu errado</h1>
            <p className="text-slate-400 text-sm">
              Ocorreu um erro inesperado nesta tela. Você pode tentar recarregar a página.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg py-2 text-sm"
            >
              Recarregar página
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
