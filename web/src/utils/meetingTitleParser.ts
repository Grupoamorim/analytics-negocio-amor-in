import type { MeetingType } from '@/types/crm'

// Convenção de nomenclatura de reunião: "Apresentação - Comissão|Turma - <Nome da turma> (ON|PR-S|PR-F)"
// Usada tanto pela rotina automática do Fathom (via e-mail) quanto aqui no upload manual,
// pra não obrigar o usuário a escolher tipo de reunião e turma na mão se o título já segue o padrão.
export interface ParsedMeetingTitle {
  meetingType: MeetingType | null
  turmaText: string
  isOnline: boolean
}

export function parseMeetingTitle(rawTitle: string): ParsedMeetingTitle {
  const title = (rawTitle || '').trim()

  const isOnline = /\(on\)/i.test(title)

  let meetingType: MeetingType | null = null
  if (/comiss[aã]o/i.test(title)) {
    meetingType = 'Reunião Comissão'
  } else if (/\bturma\b/i.test(title)) {
    meetingType = 'Reunião Turma'
  }

  const turmaText = title
    .replace(/\((on|pr-s|pr-f)\)/gi, '')
    .replace(/^\s*apresenta[cç][aã]o\s*-\s*/i, '')
    .replace(/^\s*(comiss[aã]o|turma)\s*-\s*/i, '')
    .trim()

  return { meetingType, turmaText, isOnline }
}
