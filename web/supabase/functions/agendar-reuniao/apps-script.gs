/**
 * Web App do Google Apps Script — ponte entre o Amor In Gestão e a agenda
 * "AMOR IN GESTÃO" do Google. Rodar na conta adm@lucasamorim.com.br.
 *
 * COMO PUBLICAR:
 *  1. script.google.com -> Novo projeto -> cole este arquivo.
 *  2. Troque SECRET abaixo por uma senha longa aleatória (a MESMA vai no
 *     secret GCAL_APPS_SCRIPT_SECRET do Supabase).
 *  3. Confirme o nome da agenda em CAL_NOME (crie no Google Agenda a agenda
 *     "AMOR IN GESTÃO" e compartilhe com o e-mail de cada usuário, permissão
 *     "Fazer alterações nos eventos" — pra todo mundo ver os compromissos).
 *  4. Implantar -> Nova implantação -> tipo "App da Web":
 *       - Executar como: Eu (adm@lucasamorim.com.br)
 *       - Quem pode acessar: Qualquer pessoa
 *     Copie a URL /exec -> vai no secret GCAL_APPS_SCRIPT_URL do Supabase.
 *  5. Toda vez que editar o script, "Gerenciar implantações" -> editar ->
 *     nova versão (a URL continua a mesma).
 */

var SECRET = 'TROQUE-POR-UMA-SENHA-LONGA-ALEATORIA';
var CAL_NOME = 'AMOR IN GESTÃO';

function _cal() {
  var c = CalendarApp.getCalendarsByName(CAL_NOME)[0];
  if (!c) c = CalendarApp.getOwnedCalendarsByName(CAL_NOME)[0];
  if (!c) throw new Error('Agenda "' + CAL_NOME + '" não encontrada nesta conta');
  return c;
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.secret !== SECRET) return _json({ error: 'não autorizado' });

    var cal = _cal();

    if (body.action === 'create') {
      var ev = cal.createEvent(
        body.titulo,
        new Date(body.inicio),
        new Date(body.fim),
        { description: body.descricao || '' }
      );
      return _json({ id: ev.getId(), htmlLink: _linkDoEvento(cal, ev) });
    }

    if (body.action === 'update') {
      var ev2 = cal.getEventById(body.eventId);
      if (!ev2) return _json({ error: 'evento não encontrado' });
      if (body.titulo) ev2.setTitle(body.titulo);
      if (body.inicio && body.fim) ev2.setTime(new Date(body.inicio), new Date(body.fim));
      if (body.descricao != null) ev2.setDescription(body.descricao);
      return _json({ id: ev2.getId(), htmlLink: _linkDoEvento(cal, ev2) });
    }

    if (body.action === 'delete') {
      var ev3 = cal.getEventById(body.eventId);
      if (ev3) ev3.deleteEvent();
      return _json({ ok: true });
    }

    return _json({ error: 'ação desconhecida' });
  } catch (err) {
    return _json({ error: String(err) });
  }
}

function _linkDoEvento(cal, ev) {
  // id vem como "xxxxx@google.com" — o link do calendário usa a parte antes do @
  var eid = ev.getId().split('@')[0];
  var b64 = Utilities.base64Encode(eid + ' ' + cal.getId());
  return 'https://calendar.google.com/calendar/event?eid=' + b64.replace(/=+$/, '');
}
