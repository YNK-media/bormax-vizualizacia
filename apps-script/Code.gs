// ============================================================
//  Bormax – vizualizátor farby okien · Apps Script backend
//  Beží v Google účte tomas@ynk.media. Nasadiť ako Webová aplikácia
//  (Spustiť ako: ja · Prístup: ktokoľvek) a URL vložiť do index.html.
// ============================================================

var SHEET_ID         = '1r61YNKYT42glZssE0_VnDWFH56EWubeUcy5XDAcEMC4'; // Bormax vizualizátor – odpovede
var SHEET_NAME       = 'Odpovede';                                         // list, do ktorého sa zapisuje (vytvorí sa, ak chýba)
var PRIJATE_FOLDER   = '1e5ExJ1x2Q09xpz6Q6uhnnvVOhC2MJ_xX';               // BORMAX - Claude/Vizualizator okien/prijate
var HOTOVE_FOLDER    = '1EhAHhmzqv3-5pRz0mujx3HBAhWRkJoDe';               // BORMAX - Claude/Vizualizator okien/hotove
var MAX_BYTES        = 12 * 1024 * 1024;

// ---------- 1. Príjem zo stránky ----------
function doPost(e) {
  if (!e) return setupTriggers(); // spustené ručne z editora → nastavenie
  var out = { ok: false };
  try {
    var raw = (e && e.parameter && e.parameter.payload) || (e && e.postData && e.postData.contents) || '{}';
    var d = JSON.parse(raw);

    var email = String(d.email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error('bad email');
    if (!d.foto_base64) throw new Error('no photo');

    var bytes = Utilities.base64Decode(d.foto_base64);
    if (bytes.length > MAX_BYTES) throw new Error('photo too large');

    var ts = new Date();
    var stamp = Utilities.formatDate(ts, 'Europe/Bratislava', 'yyyy-MM-dd_HHmmss');
    var safeMail = email.replace(/[^a-zA-Z0-9@._-]/g, '_');
    var blob = Utilities.newBlob(bytes, 'image/jpeg', stamp + '_' + safeMail + '.jpg');

    var file = DriveApp.getFolderById(PRIJATE_FOLDER).createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var fileUrl = 'https://drive.google.com/open?id=' + file.getId();

    var sheet = getSheet_();
    sheet.appendRow([
      Utilities.formatDate(ts, 'Europe/Bratislava', 'dd.MM.yyyy HH:mm:ss'),
      fileUrl,
      String(d.farby || ''),
      email,
      String(d.telefon || ''),
      String(d.suhlas || ''),
      String(d.foto_rozmer || ''),
      String(d.zdroj || ''),
      'nove'
    ]);

    out = { ok: true, id: file.getId() };
  } catch (err) {
    out = { ok: false, error: String(err) };
    Logger.log('doPost error: ' + err);
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService.createTextOutput('Bormax vizualizátor – OK').setMimeType(ContentService.MimeType.TEXT);
}

function getSheet_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['Časová pečiatka', 'Fotka (URL)', 'Farby', 'E-mail', 'Telefón', 'Súhlas', 'Rozmer fotky', 'Zdroj', 'Stav']);
    sh.setFrozenRows(1);
  }
  return sh;
}

// ---------- 2. Stiahnutie hotových vizualizácií na Drive ----------
// Každú hodinu: v priečinku "hotove" nájde *.json (zapíše ich Claude) a stiahne obrázky.
// JSON: {"email":"…","datum":"2026-10-21","farby":[…],"obrazky":[{"nazov":"Antracit","url":"https://…"}],"original":"https://…"}
function saveResults() {
  var folder = DriveApp.getFolderById(HOTOVE_FOLDER);
  var files = folder.getFilesByType('application/json');
  while (files.hasNext()) {
    var jf = files.next();
    var name = jf.getName();
    if (name.indexOf('.done.json') > -1 || name.indexOf('.error.json') > -1) continue;
    try {
      var data = JSON.parse(jf.getBlob().getDataAsString());
      var sub = folder.createFolder((data.datum || Utilities.formatDate(new Date(), 'Europe/Bratislava', 'yyyy-MM-dd')) + '_' + String(data.email || 'neznamy').replace(/[^a-zA-Z0-9@._-]/g, '_'));
      (data.obrazky || []).forEach(function (o, i) {
        var blob = UrlFetchApp.fetch(o.url).getBlob();
        var ext = (o.url.split('?')[0].match(/\.(png|jpg|jpeg|webp)$/i) || ['', 'png'])[1];
        sub.createFile(blob.setName((i + 1) + '-' + (o.nazov || 'vizualizacia') + '.' + ext));
      });
      if (data.original) { try { sub.createFile(UrlFetchApp.fetch(data.original).getBlob().setName('0-original.jpg')); } catch (e2) {} }
      jf.setName(name.replace(/\.json$/, '.done.json'));
      markStatus_(data.email, data.casova_peciatka, 'hotove');
    } catch (err) {
      Logger.log('saveResults error ' + name + ': ' + err);
      jf.setName(name.replace(/\.json$/, '.error.json'));
    }
  }
}

function markStatus_(email, stamp, status) {
  try {
    var sh = getSheet_();
    var vals = sh.getDataRange().getValues();
    for (var r = 1; r < vals.length; r++) {
      if (String(vals[r][3]).toLowerCase() === String(email).toLowerCase() && (!stamp || String(vals[r][0]) === String(stamp))) {
        sh.getRange(r + 1, 9).setValue(status);
      }
    }
  } catch (e) {}
}

// ---------- 3. Jednorazové nastavenie ----------
function setupTriggers() {
  var have = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  if (have.indexOf('saveResults') < 0) ScriptApp.newTrigger('saveResults').timeBased().everyHours(1).create();
  getSheet_();
  Logger.log('OK – trigger saveResults každú hodinu, list "' + SHEET_NAME + '" pripravený');
}

// Test bez stránky: vytvorí riadok s malým obrázkom.
function testPost() {
  var png1px = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  var r = doPost({ parameter: { payload: JSON.stringify({ email: 'test@ynk.media', telefon: '', farby: '2. Antracit, 6. Zlatý dub', suhlas: 'Súhlasím', foto_base64: png1px, foto_rozmer: '1x1', zdroj: 'test' }) } });
  Logger.log(r.getContent());
}
