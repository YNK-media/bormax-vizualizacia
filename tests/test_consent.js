const { chromium, devices } = require('playwright');
// spustenie: python3 -m http.server 8765 (v koreni repa) a potom node tests/test_consent.js
const BASE = 'http://localhost:8765/';
const GA_STUB = 'document.cookie="_ga=GA1.1.123;path=/";document.cookie="_ga_B6J2PGZ8C5=GS1;path=/";window.__gaLoaded=(window.__gaLoaded||0)+1;';
const FB_STUB = 'document.cookie="_fbp=fb.1.123;path=/";window.__fbLoaded=(window.__fbLoaded||0)+1;';
let ok = 0, fail = 0;
function check(name, cond, extra) { if (cond) { ok++; console.log('  ✔', name); } else { fail++; console.log('  ✘', name, extra !== undefined ? JSON.stringify(extra) : ''); } }

async function setup(ctx) {
  const reqs = [];
  await ctx.route('**/*', r => {
    const u = r.request().url();
    if (u.startsWith(BASE)) return r.continue();
    if (u.includes('googletagmanager.com')) { reqs.push('ga'); return r.fulfill({ status: 200, contentType: 'text/javascript', body: GA_STUB }); }
    if (u.includes('connect.facebook.net')) { reqs.push('fb'); return r.fulfill({ status: 200, contentType: 'text/javascript', body: FB_STUB }); }
    if (u.includes('facebook.com/tr')) { reqs.push('fbtr'); return r.fulfill({ status: 200, body: '' }); }
    if (u.includes('script.google.com')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    return r.abort();
  });
  return reqs;
}
const cookies = async ctx => (await ctx.cookies()).map(c => c.name).sort();
const visible = p => p.evaluate(() => !document.getElementById('ck').hidden);

async function lead(p) {
  return p.evaluate(async () => {
    photoData = { base64: 'AAAA', name: 'x.jpg', w: 10, h: 10 };
    document.querySelector('#swatches button').click();
    document.getElementById('email').value = 'test@ynk.media';
    document.getElementById('suhlas').checked = true;
    document.getElementById('vizForm').requestSubmit();
    await new Promise(r => setTimeout(r, 1500));
    return {
      done: getComputedStyle(document.getElementById('done')).display,
      ga: (window.dataLayer || []).map(a => Array.from(a)).filter(a => a[0] === 'event').map(a => a[1]),
      fb: window.fbq ? (fbq.queue || []).map(a => Array.from(a)).filter(a => a[0] === 'track').map(a => a[1]) : null
    };
  });
}

(async () => {
  const b = await chromium.launch();

  console.log('A – prvá návšteva');
  let ctx = await b.newContext(); let reqs = await setup(ctx); let p = await ctx.newPage();
  await p.goto(BASE); await p.waitForTimeout(500);
  check('lišta sa zobrazí', await visible(p));
  check('žiadny Google ani Meta request pred súhlasom', reqs.length === 0, reqs);
  check('žiadne cookies pred súhlasom', (await cookies(ctx)).length === 0, await cookies(ctx));
  check('gtag/fbq nie sú definované', await p.evaluate(() => typeof gtag === 'undefined' && typeof fbq === 'undefined'));
  check('stránka nie je zablokovaná (klik na farbu funguje)', await p.evaluate(() => { const b = document.querySelector('#swatches button'); b.click(); const r = b.getAttribute('aria-pressed') === 'true'; b.click(); return r; }));
  const st = await p.evaluate(() => ['ckAccept', 'ckReject', 'ckMore'].map(id => { const c = getComputedStyle(document.getElementById(id)); return [c.backgroundColor, c.color, c.fontSize, c.fontWeight, document.getElementById(id).offsetHeight].join('|'); }));
  check('Prijať / Odmietnuť / Nastavenia majú rovnaký vzhľad', new Set(st).size === 1, st);
  check('checkboxy kategórií nie sú predvolene zaškrtnuté', await p.evaluate(() => !document.getElementById('ckStats').checked && !document.getElementById('ckMkt').checked));
  const l0 = await lead(p);
  check('lead bez voľby: formulár funguje, nič sa nemeria', l0.done !== 'none' && l0.ga.length === 0 && l0.fb === null, l0);
  await ctx.close();

  console.log('B – Odmietnuť všetko');
  ctx = await b.newContext(); reqs = await setup(ctx); p = await ctx.newPage();
  await p.goto(BASE); await p.click('#ckReject'); await p.waitForTimeout(500);
  check('lišta zmizne', !(await visible(p)));
  check('žiadny request', reqs.length === 0, reqs);
  await p.reload(); await p.waitForTimeout(500);
  check('po obnovení lišta nie je, voľba zapamätaná', !(await visible(p)));
  check('po obnovení stále žiadny request ani cookie', reqs.length === 0 && (await cookies(ctx)).length === 0, { reqs, c: await cookies(ctx) });
  await ctx.close();

  console.log('C – Prijať všetko');
  ctx = await b.newContext(); reqs = await setup(ctx); p = await ctx.newPage();
  await p.goto(BASE); await p.click('#ckAccept'); await p.waitForTimeout(800);
  check('Google tag aj Meta Pixel sa načítajú až po kliknutí', reqs.includes('ga') && reqs.includes('fb'), reqs);
  const cons = await p.evaluate(() => dataLayer.map(a => Array.from(a)).filter(a => a[0] === 'consent').map(a => [a[1], a[2]]));
  check('Consent Mode: default denied → update granted', cons[0][0] === 'default' && cons[0][1].ad_storage === 'denied' && cons[1][1].analytics_storage === 'granted' && cons[1][1].ad_storage === 'granted', cons);
  const l1 = await lead(p);
  check('lead po súhlase: generate_lead aj Meta Lead', l1.ga.includes('generate_lead') && l1.fb.includes('Lead'), l1);
  reqs.length = 0; await p.reload(); await p.waitForTimeout(800);
  check('po obnovení bez lišty a meranie beží', !(await visible(p)) && reqs.includes('ga') && reqs.includes('fb'), reqs);

  console.log('E – odvolanie súhlasu cez „Nastavenia cookies“');
  await p.click('#ckOpen');
  check('lišta sa otvorí s predvyplnenou voľbou', await p.evaluate(() => !document.getElementById('ck').hidden && document.getElementById('ckStats').checked && document.getElementById('ckMkt').checked));
  await p.uncheck('#ckStats'); await p.uncheck('#ckMkt');
  reqs.length = 0;
  await Promise.all([p.waitForNavigation(), p.click('#ckMore')]); await p.waitForTimeout(800);
  check('cookies _ga/_fbp zmazané', (await cookies(ctx)).length === 0, await cookies(ctx));
  check('po odvolaní žiadny request', reqs.length === 0, reqs);
  await ctx.close();

  console.log('D – len štatistické');
  ctx = await b.newContext(); reqs = await setup(ctx); p = await ctx.newPage();
  await p.goto(BASE); await p.click('#ckMore'); await p.check('#ckStats'); await p.click('#ckMore'); await p.waitForTimeout(800);
  check('načíta sa len Google tag, Meta nie', reqs.includes('ga') && !reqs.includes('fb'), reqs);
  const c2 = await p.evaluate(() => dataLayer.map(a => Array.from(a)).filter(a => a[0] === 'consent')[1][2]);
  check('reklamné signály Google odmietnuté', c2.analytics_storage === 'granted' && c2.ad_storage === 'denied' && c2.ad_user_data === 'denied', c2);
  const l2 = await lead(p);
  check('lead: generate_lead áno, Meta nie', l2.ga.includes('generate_lead') && l2.fb === null, l2);

  console.log('G – rozšírenie na všetko bez obnovenia');
  await p.click('#ckOpen'); await p.check('#ckMkt'); await p.click('#ckMore'); await p.waitForTimeout(800);
  const c3 = await p.evaluate(() => dataLayer.map(a => Array.from(a)).filter(a => a[0] === 'consent').pop()[2]);
  check('Meta Pixel sa načíta a Google dostane update granted', reqs.includes('fb') && c3.ad_storage === 'granted', { reqs, c3 });
  await ctx.close();

  console.log('Screenshoty');
  ctx = await b.newContext({ ...devices['iPhone 13'] }); await setup(ctx); p = await ctx.newPage();
  await p.goto(BASE); await p.waitForTimeout(800);
  await p.screenshot({ path: 'tests/cookie-lista-mobil.png' });
  await p.click('#ckMore'); await p.waitForTimeout(300);
  await p.screenshot({ path: 'tests/cookie-lista-mobil-nastavenia.png' });
  await ctx.close();
  ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 }); await setup(ctx); p = await ctx.newPage();
  await p.goto(BASE); await p.waitForTimeout(800);
  await p.screenshot({ path: 'tests/cookie-lista-desktop.png' });
  await ctx.close();

  await b.close();
  console.log(`\n${ok} OK, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})();
