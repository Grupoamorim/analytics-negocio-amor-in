/* 404 Page - Displays when a user attempts to access a non-existent route - translate to the language of the user */
import { useLocation } from 'react-router-dom'
import { useEffect } from 'react'

const NotFound = () => {
  const location = useLocation()

  useEffect(() => {
    console.error('404 Error: User attempted to access non-existent route:', location.pathname)
  }, [location.pathname])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0f14]">
      <div className="text-center">
        <h1 className="text-5xl font-bold mb-4 text-orange-400">404</h1>
        <p className="text-lg text-slate-400 mb-4">Ops! Essa página não existe.</p>
        <a href="/" className="text-orange-400 hover:text-orange-300 underline text-sm">
          Voltar para o início
        </a>
      </div>
    </div>
  )
}

export default NotFound
