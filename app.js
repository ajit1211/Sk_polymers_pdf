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
  REQUIRED.forEach(function (r) { $(r.id).classList.remove('missing'); });
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
  { id: 'fCompany',  label: 'Company name' },
  { id: 'fBillNo',   label: 'Bill no.' },
  { id: 'fBillDate', label: 'Date' },
  { id: 'fBuyerGst', label: 'GST no.' }
];

function checkRequired() {
  var missing = [], first = null;

  REQUIRED.forEach(function (r) {
    var el = $(r.id);
    var empty = el.textContent.trim() === '';
    if (empty) { missing.push(r.label); if (!first) first = el; }
    if (empty) el.classList.add('missing'); else el.classList.remove('missing');
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
  if (el && el.classList && el.classList.contains('missing') && el.textContent.trim() !== '') {
    el.classList.remove('missing');
  }
});

/* ------------------------------------------------------------------- pdf */
function download() {
  if (!checkRequired()) return;
  var name = fileBase() + '.pdf';
  var page = $('invoice');
  var wrap = $('pageWrap');
  var prevTransform = wrap.style.transform;

  document.body.classList.add('exporting');
  wrap.style.transform = 'none';
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  fitAll();                       /* re-measure at 1:1 before the canvas snapshot */

  var finish = function () {
    wrap.style.transform = prevTransform;
    document.body.classList.remove('exporting');
  };

  if (!window.html2pdf) { finish(); printPdf(); return; }

  toast('Building ' + name + ' ...');

  html2pdf().set({
    margin: 0,
    filename: name,
    image: { type: 'jpeg', quality: 0.98 },
    /* phones run out of canvas memory well before desktops do */
    html2canvas: { scale: window.innerWidth < 700 ? 2 : 3,
                   backgroundColor: '#ffffff', useCORS: true, logging: false,
                   windowWidth: PAGE_W, width: PAGE_W, height: PAGE_H },
    jsPDF: { unit: 'pt', format: 'a4', orientation: 'portrait', compress: true }
  }).from(page).toPdf().get('pdf').then(function (pdf) {
    /* The canvas is a hair taller than one A4 (793.76x1122.56 css px against a
       595.28x841.89pt page), so jsPDF opens a second, empty sheet for the
       leftover sliver. The invoice is always exactly one page - drop the rest. */
    var n = pdf.internal.getNumberOfPages();
    for (var i = n; i > 1; i--) pdf.deletePage(i);
  }).save()
    .then(function () { finish(); toast('Saved ' + name); })
    .catch(function (err) { finish(); console.error(err); toast('PDF failed - using Print instead'); printPdf(); });
}

/* browser "Save as PDF" - the tab title becomes the suggested file name */
function printPdf() {
  if (!checkRequired()) return;
  fitAll();
  var prev = document.title;
  document.title = fileBase();
  document.body.classList.add('exporting');
  window.print();
  setTimeout(function () {
    document.title = prev;
    document.body.classList.remove('exporting');
  }, 600);
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
