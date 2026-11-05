/**
 * Motive Upgrade Planner – lets the Netlify site read Lana's serials sheet (first tab) as CSV,
 * without making the sheet public. Paste into Extensions > Apps Script in the serials sheet.
 *
 * 1. Change TOKEN below to a long random string (any letters and numbers).
 * 2. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone.
 * 3. Copy the Web app URL. In Netlify set SHEET_APPS_SCRIPT_URL = that URL and
 *    SHEET_APPS_SCRIPT_TOKEN = the same token, then redeploy.
 * Only someone with the token gets the data; everyone else gets "ERROR: not allowed".
 */
const TOKEN = 'CHANGE-ME-to-a-long-random-string';

function doGet(e) {
  if (!e || !e.parameter || e.parameter.token !== TOKEN || TOKEN.indexOf('CHANGE-ME') === 0) {
    return ContentService.createTextOutput('ERROR: not allowed').setMimeType(ContentService.MimeType.TEXT);
  }
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  const values = sheet.getDataRange().getDisplayValues();
  const csv = values.map(function (row) {
    return row.map(function (cell) {
      const s = String(cell);
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',');
  }).join('\n');
  return ContentService.createTextOutput(csv).setMimeType(ContentService.MimeType.CSV);
}
