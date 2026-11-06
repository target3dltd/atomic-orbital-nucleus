/**
 * Nucleus · Support dashboard · support@ inbox reader (v1.1.0)
 *
 * Lets the Nucleus Support dashboard list support@target3d.co.uk threads without anyone
 * connecting Gmail in the browser. Deploy it from an account that receives support@ mail.
 *
 * 1. Signed in as that account, go to https://script.google.com → New project. Paste this file in. Save.
 * 2. Choose the function "setup" and press Run. Approve the permissions. The execution log shows a token.
 * 3. Deploy → New deployment → type "Web app". Execute as: Me. Who has access: Anyone. Deploy.
 * 4. In Netlify set SUPPORT_GMAIL_APPS_SCRIPT_URL (the web app URL) and SUPPORT_GMAIL_APPS_SCRIPT_TOKEN
 *    (the token from step 2). Redeploy the site.
 *
 * The token is kept in this project's Script Properties (never in the code). Run setup again to make a new one.
 * Only requests carrying the token get an answer, and it only ever returns subject, date, sender address
 * and read state for threads matching a search about support@. Message bodies are never sent.
 */
function setup() {
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('TOKEN', token);
  GmailApp.search('to:support@target3d.co.uk', 0, 1); // asks for Gmail permission now, not on the first request
  Logger.log('Token for SUPPORT_GMAIL_APPS_SCRIPT_TOKEN in Netlify: ' + token);
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  var token = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (!token || p.token !== token) return out({ error: 'bad token' });
  var q = p.q || '';
  if (!/support@target3d\.co\.uk/i.test(q)) return out({ error: 'search must be about support@' });
  var max = Math.max(1, Math.min(100, Number(p.max) || 50));
  var threads = GmailApp.search(q, 0, max).map(function (t) {
    var msgs = t.getMessages().map(function (m) {
      var from = m.getFrom(), a = from.match(/<([^>]+)>/);
      return { subject: m.getSubject(), date: m.getDate().toISOString(), sender: (a ? a[1] : from).trim().toLowerCase(), labelIds: m.isUnread() ? ['UNREAD'] : [] };
    });
    return { id: t.getId(), messageCount: msgs.length, viewUrl: t.getPermalink(), messages: msgs };
  });
  return out({ threads: threads });
}

function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
