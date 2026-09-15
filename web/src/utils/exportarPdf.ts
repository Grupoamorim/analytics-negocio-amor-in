// Exportação de qualquer tela (Dashboard, DRE...) pra PDF — tira uma "foto" do elemento (mesmo
// visual da tela, cores e gráficos inclusos) e monta um PDF em A4, paginando automaticamente
// quando o conteúdo é mais alto que uma página. Tudo no navegador, sem servidor/backend.
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas-pro'

export async function exportarElementoParaPdf(elementoId: string, nomeArquivo: string): Promise<void> {
  const elemento = document.getElementById(elementoId)
  if (!elemento) throw new Error(`Elemento #${elementoId} não encontrado pra exportar.`)

  const canvas = await html2canvas(elemento, {
    backgroundColor: '#0a0f14',
    scale: 1.5,
    useCORS: true,
  })

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const larguraPagina = pdf.internal.pageSize.getWidth()
  const alturaPagina = pdf.internal.pageSize.getHeight()

  const larguraImg = larguraPagina
  const alturaImg = (canvas.height * larguraImg) / canvas.width

  // JPEG (com qualidade) em vez de PNG: o conteúdo tem gráficos com gradiente/degradê, que o PNG
  // (sem perdas) comprime muito mal — chegava a dezenas de MB por PDF. JPEG a 85% fica leve o
  // suficiente pra anexar em e-mail sem perda visível de legibilidade.
  const QUALIDADE_JPEG = 0.85

  if (alturaImg <= alturaPagina) {
    const imgData = canvas.toDataURL('image/jpeg', QUALIDADE_JPEG)
    pdf.addImage(imgData, 'JPEG', 0, 0, larguraImg, alturaImg)
  } else {
    // Conteúdo mais alto que uma página A4 — fatia o canvas em pedaços do tamanho de uma
    // página e adiciona uma página nova do PDF pra cada fatia.
    const pxPorPagina = Math.floor((alturaPagina * canvas.width) / larguraImg)
    let offsetPx = 0
    let primeira = true
    while (offsetPx < canvas.height) {
      const alturaFatiaPx = Math.min(pxPorPagina, canvas.height - offsetPx)
      const fatia = document.createElement('canvas')
      fatia.width = canvas.width
      fatia.height = alturaFatiaPx
      const ctx = fatia.getContext('2d')!
      ctx.fillStyle = '#0a0f14'
      ctx.fillRect(0, 0, fatia.width, fatia.height)
      ctx.drawImage(canvas, 0, offsetPx, canvas.width, alturaFatiaPx, 0, 0, canvas.width, alturaFatiaPx)
      const fatiaData = fatia.toDataURL('image/jpeg', QUALIDADE_JPEG)
      const alturaFatiaMm = (alturaFatiaPx * larguraImg) / canvas.width
      if (!primeira) pdf.addPage()
      pdf.addImage(fatiaData, 'JPEG', 0, 0, larguraImg, alturaFatiaMm)
      offsetPx += alturaFatiaPx
      primeira = false
    }
  }

  pdf.save(`${nomeArquivo}.pdf`)
}
