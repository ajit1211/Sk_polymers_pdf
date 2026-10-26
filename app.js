/* =========================================================================
   SK POLYMERS - GST Tax Invoice  |  app logic
   - live totals + GST split + amount in words (Indian numbering)
   - PDF download named "<Company Name> <Document Name>.pdf"
   - fit-to-screen scaling, offline PWA
   ========================================================================= */
(function () {
'use strict';

var MAX_ROWS = 17;                 // rows that fit inside the ruled item box
var PAGE_W = 595.32 * 96 / 72;     // A4 in CSS px
var PAGE_H = 841.92 * 96 / 72;
var STORE = 'sk_invoice_v1';

var $ = function (id) { return document.getElementById(id); };

/* ---------------------------------------------------------------- assets */
if (window.ASSETS) {
  $('imgLogo').src = ASSETS.logo;
  $('imgBush').src = ASSETS.bush;
  $('imgSign').src = ASSETS.sign;
}

/* ------------------------------------------------------------ formatting */
function toNum(v) {
  var n = parseFloat(String(v == null ? '' : v).replace(/[,  ]/g, ''));
  return isFinite(n) ? n : 0;
}

/* 188000 -> "1,88,000" (Indian grouping) */
function indian(n) {
  var s = String(Math.abs(Math.trunc(n)));
  if (s.length <= 3) return (n < 0 ? '-' : '') + s;
  var last3 = s.slice(-3), rest = s.slice(0, -3);
  rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return (n < 0 ? '-' : '') + rest + ',' + last3;
}

var ONES = ['zero','one','two','three','four','five','six','seven','eight','nine','ten',
  'eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
var TENS = ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];

function twoDigit(n) {
  if (n < 20) return ONES[n];
  var t = TENS[Math.floor(n / 10)], o = n % 10;
  return o ? t + ' ' + ONES[o] : t;
}

function threeDigit(n) {
  var out = [];
  if (n > 99) { out.push(ONES[Math.floor(n / 100)], 'hundred'); n %= 100; }
  if (n) out.push(twoDigit(n));
  return out.join(' ');
}

/* Indian numbering: crore / lakh / thousand / hundred */
function words(n) {
  n = Math.trunc(Math.abs(n));
  if (n === 0) return 'zero';
  var out = [];
  var crore = Math.floor(n / 10000000); n %= 10000000;
  var lakh  = Math.floor(n / 100000);   n %= 100000;
  var thou  = Math.floor(n / 1000);     n %= 1000;
  if (crore) out.push(words(crore), 'crore');
  if (lakh)  out.push(twoDigit(lakh), 'lakh');
  if (thou)  out.push(twoDigit(thou), 'thousand');
  if (n)     out.push(threeDigit(n));
  return out.join(' ');
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function amountInWords(rupees, paise) {
  var s = words(rupees) + ' rupees';
  if (paise > 0) s += ' and ' + words(paise) + ' paise';
  return cap(s) + ' only';
}

/* split a float amount into rupees + paise */
function split(v) {
  var c = Math.round(v * 100);
  return { r: Math.floor(c / 100), p: c % 100 };
}
function pad2(n) { return (n < 10 ? '0' : '') + n; }

/* -------------------------------------------------------------- auto-fit
   Every box on the sheet is a fixed number of points wide. Calibri is what the
   original document used, but phones and most non-Windows browsers fall back to
   a wider face, which is why labels such as TAXABLE AMOUNT, the rupees-in-words
   line and the signature block used to spill past their rules. Each listed box
   is measured off-screen and its font-size stepped down until the text fits. */
/* Boxes that belong to the same visual block are shrunk by one shared ratio, so
   a single long label can't leave its neighbours at a different size. */
var FIT_GROUPS = [
  ['.l-ms', '.l-gst'],                                    /* buyer column labels */
  ['.l-bill', '.l-date', '.l-po', '.l-podate', '.l-state'], /* bill column labels */
  ['.f-gstin', '.f-pan'],
  ['.f-bank1', '.f-bank2', '.f-bank3', '.f-bank4'],
  ['.f-l1', '.f-l2', '.f-l3', '.f-l4', '.g-lbl'],         /* tax label column */
  ['.tm .tm-l'],
  ['.cert div'],
  ['.sg-for', '.sg-auth']
];

/* the rest stand alone - their size doesn't have to agree with anything */
var FIT_SOLO = [
  '.s-sub', '.s-addr', '.th-desc',
  '.v-company', '.v-gst', '.v-bill', '.v-date', '.v-po', '.v-podate', '.v-state',
  '.grp', '.g-rup', '.g-words', '.rows td'
];

var meter = document.createElement('span');
meter.style.cssText = 'position:absolute;left:-10000px;top:0;white-space:pre;' +
                      'visibility:hidden;pointer-events:none';
document.body.appendChild(meter);

/* text as it will actually be laid out - absolutely positioned children (the
   "1." markers in the terms list) sit outside the flow, so they don't count */
function flowText(el) {
  var out = '', i, n;
  for (i = 0; i < el.childNodes.length; i++) {
    n = el.childNodes[i];
    if (n.nodeType === 3) { out += n.nodeValue; continue; }
    if (n.nodeType !== 1) continue;
    if (getComputedStyle(n).position === 'absolute') continue;
    out += n.textContent;
  }
  return out;
}

/* recalc() runs on every keystroke and re-fits the whole sheet, so the same
   string/font/size triple gets asked for over and over - memoise it */
var mcache = {};

function measure(cs, text, sizePt) {
  var key = cs.fontFamily + '|' + cs.fontWeight + '|' + cs.fontStyle + '|' +
            cs.letterSpacing + '|' + cs.textTransform + '|' + sizePt + '|' + text;
  if (mcache[key] != null) return mcache[key];

  meter.style.fontFamily    = cs.fontFamily;
  meter.style.fontWeight    = cs.fontWeight;
  meter.style.fontStyle     = cs.fontStyle;
  meter.style.letterSpacing = cs.letterSpacing;
  meter.style.textTransform = cs.textTransform;
  meter.style.fontSize      = sizePt + 'pt';
  meter.textContent         = text;

  var w = meter.getBoundingClientRect().width;  /* layout px - meter is untransformed */
  mcache[key] = w;
  return w;
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { mcache = {}; });

/* shrinks el until its text fits its box; returns fitted/original size */
function fit(el) {
  if (el.style.fontSize) el.style.fontSize = '';   /* back to the stylesheet size */
  var text = flowText(el);
  if (!text.trim()) { el._basePt = 0; return 1; }

  var cs = getComputedStyle(el);
  /* clientWidth is layout px and ignores the page's scale() transform */
  var avail = el.clientWidth - (parseFloat(cs.paddingLeft) || 0) -
                               (parseFloat(cs.paddingRight) || 0) - 1;
  var base = parseFloat(cs.fontSize) * 0.75;    /* px -> pt */
  el._basePt = base;
  if (!(avail > 0)) return 1;

  var w = measure(cs, text, base);
  if (w <= avail) return 1;

  var s = Math.floor(base * avail / w * 20) / 20;   /* first guess, 0.05pt steps */
  var guard = 0;
  while (s > 5 && measure(cs, text, s) > avail && guard++ < 60) s -= 0.05;
  el.style.fontSize = s.toFixed(2) + 'pt';
  return s / base;
}

function collect(sels) {
  var els = [], i, j, list;
  for (i = 0; i < sels.length; i++) {
    list = document.querySelectorAll(sels[i]);
    for (j = 0; j < list.length; j++) els.push(list[j]);
  }
  return els;
}

function fitAll() {
  var i, j, els, ratio;

  els = collect(FIT_SOLO);
  for (i = 0; i < els.length; i++) fit(els[i]);

  for (i = 0; i < FIT_GROUPS.length; i++) {
    els = collect(FIT_GROUPS[i]);
    ratio = 1;
    for (j = 0; j < els.length; j++) ratio = Math.min(ratio, fit(els[j]));
    if (ratio >= 1) continue;
    /* the tightest box in the block sets the size for the whole block */
    for (j = 0; j < els.length; j++) {
      if (els[j]._basePt) els[j].style.fontSize = (els[j]._basePt * ratio).toFixed(2) + 'pt';
    }
  }
}

var fitPending = false;
function scheduleFit() {
  if (fitPending) return;
  fitPending = true;
  var run = function () { fitPending = false; fitAll(); };
  if (window.requestAnimationFrame) window.requestAnimationFrame(run);
  else setTimeout(run, 16);
}
window.addEventListener('resize', scheduleFit);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitAll);

/* ------------------------------------------------------------------ rows */
var rowsBody = $('rowsBody');

function makeRow() {
  var tr = document.createElement('tr');
  tr.innerHTML =
    '<td class="c-sr"></td>' +
    '<td class="c-desc ed" contenteditable="true"></td>' +
    '<td class="c-hsn ed"  contenteditable="true"></td>' +
    '<td class="c-qty ed"  contenteditable="true"></td>' +
    '<td class="c-rate ed" contenteditable="true"></td>' +
    '<td class="c-rs"></td>' +
    '<td class="c-p"></td>';
  return tr;
}

function addRow(focus) {
  if (rowsBody.rows.length >= MAX_ROWS) { toast('Sheet is full (' + MAX_ROWS + ' rows)'); return null; }
  var tr = makeRow();
  rowsBody.appendChild(tr);
  if (focus) tr.cells[1].focus();
  recalc();
  return tr;
}

function delRow() {
  if (rowsBody.rows.length <= 1) { toast('At least one row is needed'); return; }
  rowsBody.deleteRow(rowsBody.rows.length - 1);
  recalc();
}

function setRowCount(n) {
  while (rowsBody.rows.length > n) rowsBody.deleteRow(rowsBody.rows.length - 1);
  while (rowsBody.rows.length < n) rowsBody.appendChild(makeRow());
}

/* ------------------------------------------------------------- calculate */
function recalc() {
  var taxable = 0, i, tr, qty, rate, amt, a;

  for (i = 0; i < rowsBody.rows.length; i++) {
    tr = rowsBody.rows[i];
    var desc = tr.cells[1].textContent.trim();
    var hsn  = tr.cells[2].textContent.trim();
    qty  = tr.cells[3].textContent.trim();
    rate = tr.cells[4].textContent.trim();
    var used = desc || hsn || qty || rate;

    tr.cells[0].textContent = used ? String(i + 1) : '';

    if (qty !== '' && rate !== '') {
      amt = toNum(qty) * toNum(rate);
      a = split(amt);
      tr.cells[5].textContent = indian(a.r);
      tr.cells[6].textContent = pad2(a.p);
      taxable += amt;
    } else {
      tr.cells[5].textContent = '';
      tr.cells[6].textContent = '';
    }
  }

  var rateP = toNum($('inTaxRate').value);
  var inter = $('taxInter').checked;
  var half  = rateP / 2;

  $('pctCgst').textContent = trimNum(half) + ' %';
  $('pctSgst').textContent = trimNum(half) + ' %';
  $('pctIgst').innerHTML   = trimNum(rateP) + '<sup>%</sup>';

  var t = split(taxable);
  $('tTaxableRs').textContent = indian(t.r);
  $('tTaxableP').textContent  = pad2(t.p);

  var tax = taxable * rateP / 100;
  var cg = split(taxable * half / 100);

  if (inter) {
    var ig = split(tax);
    $('tIgstRs').textContent = indian(ig.r);
    $('tIgstP').textContent  = '-';
    $('tCgstRs').textContent = ''; $('tCgstP').textContent = '';
    $('tSgstRs').textContent = ''; $('tSgstP').textContent = '';
  } else {
    $('tCgstRs').textContent = indian(cg.r); $('tCgstP').textContent = pad2(cg.p);
    $('tSgstRs').textContent = indian(cg.r); $('tSgstP').textContent = pad2(cg.p);
    $('tIgstRs').textContent = ''; $('tIgstP').textContent = '';
  }

  var grand = taxable + tax;
  if ($('chkRound').checked) grand = Math.round(grand);
  var g = split(grand);
  $('tGrandRs').textContent = indian(g.r);
  $('tGrandP').textContent  = pad2(g.p);
  $('tWords').textContent   = amountInWords(g.r, g.p);

  syncFileName();
  scheduleFit();
  save();
}

function trimNum(n) {
  return (Math.round(n * 100) / 100).toString();
}

/* ------------------------------------------------------------------ dates
   The sheet prints dd/mm/yyyy; <input type="date"> speaks yyyy-mm-dd. */
function toDMY(iso) {
  var p = String(iso || '').split('-');
  return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : '';
}

function toISO(dmy) {
  var m = /^\s*(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{2}|\d{4})\s*$/.exec(dmy || '');
  if (!m) return '';
  var d = +m[1], mo = +m[2], y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return '';
  return y + '-' + pad2(mo) + '-' + pad2(d);
}

function todayISO() {
  var t = new Date();
  return t.getFullYear() + '-' + pad2(t.getMonth() + 1) + '-' + pad2(t.getDate());
}

/* toolbar date input <-> the DATE box on the sheet */
function bindDate(inputEl, fieldEl) {
  inputEl.addEventListener('change', function () {
    fieldEl.textContent = inputEl.value ? toDMY(inputEl.value) : '';
    if (inputEl.value) { fieldEl.classList.remove('missing'); inputEl.classList.remove('missing'); }
    recalc();
  });
  fieldEl.addEventListener('input', function () {
    inputEl.value = toISO(fieldEl.textContent);   /* '' while half-typed - that's fine */
  });
}

/* the calendar square beside a date row on the sheet.
   The browser opens the picker on its own when the input is tapped; all we do
   is seed it with the date already in the box (or today) just before that
   happens, and copy the result back out. */
function bindPicker(picker, fieldEl) {
  var seed = function () { picker.value = toISO(fieldEl.textContent) || todayISO(); };
  picker.addEventListener('pointerdown', seed);   /* fires before the picker opens */
  picker.addEventListener('focus', seed);

  picker.addEventListener('change', function () {
    if (!picker.value) return;
    fieldEl.textContent = toDMY(picker.value);
    fieldEl.classList.remove('missing');
    /* bubbles to the toolbar mirror and to the shared recalc listener */
    fieldEl.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/* --------------------------------------------------------- file name box */
function clean(s) {
  return String(s || '').replace(/[\\\/:*?"<>|\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim();
}

function fileBase() {
  var c = clean($('inCompany').value || $('fCompany').textContent);
  var d = clean($('inDocName').value || $('fBillNo').textContent);
  var base = (c + ' ' + d).trim();
  return base || 'invoice';
}

function syncFileName() { $('outFileName').textContent = fileBase() + '.pdf'; }

/* ----------------------------------------------------- two-way field sync */
function bindMirror(inputEl, fieldEl) {
  inputEl.addEventListener('input', function () {
    if (fieldEl.textContent !== inputEl.value) fieldEl.textContent = inputEl.value;
    /* typing in the toolbar fills the sheet field, so drop its required flag too */
    if (inputEl.value.trim() !== '') fieldEl.classList.remove('missing');
    syncFileName(); scheduleFit(); save();
  });
  fieldEl.addEventListener('input', function () {
    var v = fieldEl.textContent.replace(/\s+$/, '');
    if (inputEl.value !== v) inputEl.value = v;
    syncFileName(); save();
  });
}

/* ------------------------------------------------------ editing behaviour */
document.addEventListener('keydown', function (e) {
  var el = e.target;
  if (!el || !el.classList || !el.classList.contains('ed')) return;

  if (e.key === 'Enter' && el.id !== 'fAddress') {
    e.preventDefault();
    var td = el.closest ? el.closest('td') : null;
    if (td) {
      var tr = td.parentNode, idx = td.cellIndex, next = tr.nextElementSibling;
      if (!next) next = addRow(false);
      if (next) next.cells[idx].focus();
    }
  }
});

document.addEventListener('paste', function (e) {
  var el = e.target;
  if (!el || !el.classList || !el.classList.contains('ed')) return;
  e.preventDefault();
  var txt = (e.clipboardData || window.clipboardData).getData('text');
  if (el.id !== 'fAddress') txt = txt.replace(/[\r\n]+/g, ' ');
  document.execCommand('insertText', false, txt);
});

document.addEventListener('input', function (e) {
  if (e.target && e.target.classList && e.target.classList.contains('ed')) recalc();
});

/* GSTIN is always upper case. text-transform paints it that way while typing
   (and carries into the PDF); this rewrites the stored text on the way out so
   the saved value matches what is printed. Done on blur - rewriting mid-keystroke
   would throw the caret to the start of the field. */
$('fBuyerGst').addEventListener('blur', function () {
  var el = $('fBuyerGst');
  var up = el.textContent.toUpperCase();
  if (el.textContent !== up) { el.textContent = up; save(); }
});

/* auto-pick IGST / CGST+SGST from the buyer GSTIN state code */
$('fBuyerGst').addEventListener('input', function () {
  var g = $('fBuyerGst').textContent.trim().toUpperCase();
  var code = g.slice(0, 2);
  if (!/^\d{2}$/.test(code)) { $('taxHint').textContent = ''; return; }
  if (code === '27') {
    $('taxIntra').checked = true;
    $('taxHint').textContent = 'Buyer state 27 (Maharashtra) - intra-state, CGST + SGST';
  } else {
    $('taxInter').checked = true;
    $('taxHint').textContent = 'Buyer state ' + code + ' - inter-state, IGST';
  }
  recalc();
});

/* ------------------------------------------------------------ persistence */
var EDIT_IDS = ['fCompany','fAddress','fBuyerGst','fBillNo','fBillDate','fPoNo','fPoDate','fStateCode','fGroup'];

function snapshot() {
  var d = { rows: [], fields: {} };
  EDIT_IDS.forEach(function (id) { d.fields[id] = $(id).innerHTML; });
  for (var i = 0; i < rowsBody.rows.length; i++) {
    var c = rowsBody.rows[i].cells;
    d.rows.push([c[1].textContent, c[2].textContent, c[3].textContent, c[4].textContent]);
  }
  d.taxMode = $('taxInter').checked ? 'inter' : 'intra';
  d.taxRate = $('inTaxRate').value;
  d.round   = $('chkRound').checked;
  d.company = $('inCompany').value;
  d.docName = $('inDocName').value;
  return d;
}

var saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(function () {
    try { localStorage.setItem(STORE, JSON.stringify(snapshot())); } catch (err) { /* quota / private mode */ }
  }, 250);
}

function restore(d, silent) {
  if (!d) return false;
  EDIT_IDS.forEach(function (id) { if (d.fields && d.fields[id] != null) $(id).innerHTML = d.fields[id]; });
  setRowCount(Math.max(1, Math.min(MAX_ROWS, (d.rows || []).length || 8)));
  (d.rows || []).forEach(function (r, i) {
    var tr = rowsBody.rows[i]; if (!tr) return;
    tr.cells[1].textContent = r[0] || '';
    tr.cells[2].textContent = r[1] || '';
    tr.cells[3].textContent = r[2] || '';
    tr.cells[4].textContent = r[3] || '';
  });
  if (d.taxMode === 'intra') $('taxIntra').checked = true; else $('taxInter').checked = true;
  if (d.taxRate != null) $('inTaxRate').value = d.taxRate;
  $('chkRound').checked = d.round !== false;
  $('inCompany').value = d.company || $('fCompany').textContent;
  $('inDocName').value = d.docName || $('fBillNo').textContent;
  $('inBillDate').value = toISO($('fBillDate').textContent);
  $('inPoDate').value   = toISO($('fPoDate').textContent);
  REQUIRED.forEach(function (r) { $(r.id).classList.remove('missing'); });
  $('inBillDate').classList.remove('missing');
  recalc();
  fitAll();
  if (!silent) toast('Restored');
  return true;
}

/* ------------------------------------------------------------ sample data */
var SAMPLE = {
  fields: {
    fCompany:  'ASBESTOS INDIA',
    fAddress:  'SMALL INDUSTREAL ESTATE COMPOUND\nB/S UTTAM DAIRY RAKHIAL _380023',
    fBuyerGst: '24AAFFA7941M1Z8',
    fBillNo:   '138',
    fBillDate: '03/08/2026',
    fPoNo:     '',
    fPoDate:   '',
    fStateCode:'27',
    fGroup:    'PTFE GASKET 3MM'
  },
  rows: [
    ['0.5"',  '3926', '2000', '6'],
    ['1"',    '3926', '2000', '10'],
    ['1.25"', '3926', '500',  '13'],
    ['1.5"',  '3926', '2000', '17'],
    ['2"',    '3926', '1000', '25'],
    ['3"',    '3926', '1000', '35'],
    ['4"',    '3926', '500',  '51'],
    ['6"',    '3926', '500',  '60']
  ],
  taxMode: 'inter', taxRate: '18', round: true,
  company: 'ASBESTOS INDIA', docName: '138'
};

function blank() {
  return {
    fields: { fCompany:'', fAddress:'', fBuyerGst:'', fBillNo:'', fBillDate:'',
              fPoNo:'', fPoDate:'', fStateCode:'27', fGroup:'' },
    rows: [[ '','','','' ],[ '','','','' ],[ '','','','' ],[ '','','','' ],
           [ '','','','' ],[ '','','','' ],[ '','','','' ],[ '','','','' ]],
    taxMode:'inter', taxRate:'18', round:true, company:'', docName:''
  };
}

/* ------------------------------------------------------------------ zoom */
var userZoom = 0;   // 0 = fit to screen

function fitScale() {
  var w = Math.min($('stage').clientWidth || Infinity,
                   document.documentElement.clientWidth || Infinity,
                   window.innerWidth || Infinity);
  return Math.min(1, (w - 16) / PAGE_W);
}

function applyZoom() {
  var wrap = $('pageWrap');
  var k = userZoom || fitScale();
  wrap.style.transformOrigin = 'top left';
  wrap.style.transform = 'scale(' + k + ')';
  wrap.style.width = (PAGE_W * k) + 'px';
  wrap.style.height = (PAGE_H * k) + 'px';
  $('zoomLabel').textContent = userZoom ? Math.round(k * 100) + '%' : 'Fit';
  /* the sheet's calendar squares are scaled along with the page, so below ~90%
     they stop being a usable tap target - hide them and let the toolbar date
     fields do the job. Zooming back in brings them back. */
  document.body.classList.toggle('scaled-down', k < 0.9);
}
window.addEventListener('resize', applyZoom);
window.addEventListener('orientationchange', applyZoom);
window.addEventListener('load', applyZoom);
if (window.ResizeObserver) new ResizeObserver(applyZoom).observe(document.documentElement);

/* ----------------------------------------------------------------- toast */
var toastTimer;
function toast(msg) {
  var t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
}

/* -------------------------------------------------------------- required */
/* Note: DATE here is the invoice date (fBillDate), not the order date. */
var REQUIRED = [
  { id: 'fCompany',  label: 'Company name', input: 'inCompany' },
  { id: 'fBillNo',   label: 'Bill no.',     input: 'inDocName' },
  { id: 'fBillDate', label: 'Date',         input: 'inBillDate' },
  { id: 'fBuyerGst', label: 'GST no.' }
];

function checkRequired() {
  var missing = [], first = null;

  REQUIRED.forEach(function (r) {
    var el = $(r.id);
    var empty = el.textContent.trim() === '';
    if (empty) { missing.push(r.label); if (!first) first = el; }
    if (empty) el.classList.add('missing'); else el.classList.remove('missing');
    /* mirror the flag onto the toolbar copy of the field */
    if (r.input) {
      if (empty) $(r.input).classList.add('missing'); else $(r.input).classList.remove('missing');
    }
  });

  if (!missing.length) return true;

  toast('Required: ' + missing.join(', '));
  if (first) {
    if (first.scrollIntoView) first.scrollIntoView({ block: 'center', inline: 'nearest' });
    first.focus();
  }
  return false;
}

/* clearing the flag as soon as something is typed */
document.addEventListener('input', function (e) {
  var el = e.target;
  if (!el || !el.classList || !el.classList.contains('missing')) return;
  var filled = el.tagName === 'INPUT' ? el.value.trim() !== '' : el.textContent.trim() !== '';
  if (filled) el.classList.remove('missing');
});

/* ------------------------------------------------------------------- pdf
   The PDF is drawn from a copy of the sheet, never from the sheet on screen.
   - html2pdf parks the copy at the top-left corner of the viewport, and every
     html2canvas window/scroll option is pinned to match. Left to its defaults
     the bundled html2canvas adds the page's scroll offset to the capture, so
     a scrolled page came out shifted down with the bottom of the invoice cut
     off, and a wide window cut off the left edge.
   - The sheet on screen is never touched, so a phone doesn't jump to 100% zoom
     (a big white sheet) while the PDF renders.
   - Taps while a PDF is being built are ignored. A second render used to save
     the first one's 100% zoom as the state to restore, leaving the page stuck
     there. */
var busy = false;
var jobSeq = 0;

function setBusy(on) {
  busy = on;
  var b = $('btnDownload');
  b.disabled = on;
  $('btnPrint').disabled = on;
  b.textContent = on ? 'Preparing PDF…' : 'Download PDF';
  b.setAttribute('aria-busy', on ? 'true' : 'false');
}

/* print-ready copy of the sheet: no ids, no editing state, no calendar squares */
function sheetCopy() {
  var page = $('invoice').cloneNode(true);
  var i, list;
  page.removeAttribute('id');
  page.style.boxShadow = 'none';
  list = page.querySelectorAll('.cal');
  for (i = list.length - 1; i >= 0; i--) list[i].parentNode.removeChild(list[i]);
  list = page.querySelectorAll('[id]');
  for (i = 0; i < list.length; i++) list[i].removeAttribute('id');
  list = page.querySelectorAll('.ed');
  for (i = 0; i < list.length; i++) {
    list[i].removeAttribute('contenteditable');
    list[i].classList.remove('ed');
    list[i].classList.remove('missing');
  }
  return page;
}

/* html2canvas clones the whole document into an iframe before drawing. Only
   the copy is drawn, so skip the toolbar and the on-screen sheet - half the
   work on a phone. */
function skipInCapture(el) {
  return el.id === 'stage' || el.id === 'toast' ||
         (el.classList && el.classList.contains('toolbar'));
}

/* anything a failed render can leave behind (html2pdf only removes its overlay
   on success, html2canvas only removes its iframe on success) */
function cleanupCapture() {
  var list = document.querySelectorAll('.html2pdf__overlay, iframe.html2canvas-container');
  for (var i = list.length - 1; i >= 0; i--) list[i].parentNode.removeChild(list[i]);
}

function renderPdf(page) {
  /* phones run out of canvas memory well before desktops do */
  var phone = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  return new Promise(function (resolve, reject) {
    html2pdf().set({
      margin: 0,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: phone || window.innerWidth < 700 ? 2 : 3,
        backgroundColor: '#ffffff', useCORS: true, logging: false,
        x: 0, y: 0, scrollX: 0, scrollY: 0,
        width: PAGE_W, height: PAGE_H, windowWidth: PAGE_W, windowHeight: PAGE_H,
        ignoreElements: skipInCapture
      },
      jsPDF: { unit: 'pt', format: 'a4', orientation: 'portrait', compress: true }
    }).from(page).toPdf().get('pdf').then(function (pdf) {
      /* The canvas can be a pixel taller than the page once it is rounded to
         whole pixels, and jsPDF then opens a second sheet for that one-pixel
         sliver of bottom margin. The invoice is always exactly one page. */
      for (var i = pdf.internal.getNumberOfPages(); i > 1; i--) pdf.deletePage(i);
      resolve(pdf);
    })['catch'](reject);
  });
}

function download() {
  if (busy || !checkRequired()) return;
  if (!window.html2pdf) { printPdf(); return; }

  var name = fileBase() + '.pdf';
  var job = ++jobSeq;
  var current = function () { return job === jobSeq; };

  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  setBusy(true);
  toast('Building ' + name + ' ...');

  /* it takes a second or two - if it ever hangs, hand the buttons back */
  var watchdog = setTimeout(function () {
    if (!current()) return;
    jobSeq++;                       /* a late result is dropped, not saved */
    cleanupCapture();
    setBusy(false);
    toast('PDF is taking too long - please try again');
  }, 45000);

  Promise.resolve(document.fonts && document.fonts.ready).then(function () {
    fitAll();                       /* sizes are copied into the snapshot */
    return renderPdf(sheetCopy());
  }).then(function (pdf) {
    if (!current()) return;
    pdf.save(name);
    toast('Saved ' + name);
  })['catch'](function (err) {
    console.error(err);
    if (current()) toast('Could not build the PDF - use Print > Save as PDF');
  }).then(function () {
    if (!current()) return;
    clearTimeout(watchdog);
    cleanupCapture();
    setBusy(false);
  });
}

/* browser "Save as PDF" - the tab title becomes the suggested file name */
function printPdf() {
  if (busy || !checkRequired()) return;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  fitAll();
  var prev = document.title, restored = false;
  var restore = function () {
    if (restored) return;
    restored = true;
    window.removeEventListener('afterprint', restore);
    document.title = prev;
  };
  document.title = fileBase();
  window.addEventListener('afterprint', restore);
  window.print();
  /* desktop print() blocks until the dialog closes, phones return straight
     away and fire afterprint later - restoring on a timer would rename the PDF
     back to the app title before the phone's print screen reads it */
  if (!('onafterprint' in window)) setTimeout(restore, 1000);
}

/* -------------------------------------------------------------- controls */
$('btnDownload').addEventListener('click', download);
$('btnPrint').addEventListener('click', printPdf);
$('btnAddRow').addEventListener('click', function () { addRow(true); });
$('btnDelRow').addEventListener('click', delRow);
$('btnSample').addEventListener('click', function () { restore(SAMPLE, true); toast('Sample data loaded'); });
$('btnClear').addEventListener('click', function () {
  if (!confirm('Clear the whole invoice?')) return;
  restore(blank(), true); toast('Cleared');
});
$('btnZoomIn').addEventListener('click', function () {
  var cur = userZoom || fitScale();
  userZoom = Math.min(2.5, cur + 0.15); applyZoom();
});
$('btnZoomOut').addEventListener('click', function () {
  var cur = userZoom || fitScale();
  userZoom = Math.max(0.25, cur - 0.15);
  if (Math.abs(userZoom - fitScale()) < 0.02) userZoom = 0;
  applyZoom();
});
['inTaxRate', 'chkRound', 'taxIntra', 'taxInter'].forEach(function (id) {
  $(id).addEventListener('change', recalc);
  $(id).addEventListener('input', recalc);
});

bindMirror($('inCompany'), $('fCompany'));
bindMirror($('inDocName'), $('fBillNo'));
bindDate($('inBillDate'), $('fBillDate'));
bindDate($('inPoDate'),   $('fPoDate'));
bindPicker($('calBill'), $('fBillDate'));
bindPicker($('calPo'),   $('fPoDate'));

/* --------------------------------------------------------------- install */
var deferredPrompt = null;
window.addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault();
  deferredPrompt = e;
  $('btnInstall').classList.remove('hidden');
});
$('btnInstall').addEventListener('click', function () {
  if (!deferredPrompt) { toast('Use your browser menu > Install app'); return; }
  deferredPrompt.prompt();
  deferredPrompt.userChoice.then(function () {
    deferredPrompt = null;
    $('btnInstall').classList.add('hidden');
  });
});
window.addEventListener('appinstalled', function () { $('btnInstall').classList.add('hidden'); });

if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function () { /* offline cache unavailable */ });
  });
}

/* ------------------------------------------------------------------ boot */
(function init() {
  if (/[?&]sample/.test(location.search)) { restore(SAMPLE, true); applyZoom(); fitAll(); return; }
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { saved = null; }
  restore(saved || blank(), true);
  applyZoom();
  fitAll();
})();

})();
