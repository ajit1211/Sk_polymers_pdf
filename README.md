# SK POLYMERS — GST Tax Invoice (HTML app)

A pixel-for-pixel HTML rebuild of the SK POLYMERS GST tax invoice, with live
calculation, amount in words, one-click PDF download and offline app install.

## Run it

| How | What you get |
|---|---|
| Double-click `index.html` | Everything works, including PDF download. "Install app" is **not** offered (browsers require http/https). |
| Double-click `serve.bat` | Opens `http://localhost:8080/` — full PWA: installable, works offline. Needs Python. |
| Phone on the same Wi-Fi | Run `serve.bat`, then open `http://<your-pc-ip>:8080/` on the phone. |

Any other static host works too (GitHub Pages, Netlify, a shared folder on your
server) — just upload the whole folder.

## Using it

- Type straight into the invoice. Every yellow-highlighted spot is editable:
  buyer name, address, GSTIN, bill no., dates, item group title, and each item
  row (description / HSN / qty / rate).
- **SR no., AMOUNT, TAXABLE AMOUNT, CGST/SGST/IGST, GRAND TOTAL and the
  RUPEES-in-words line are calculated automatically.** Amount = qty × rate,
  grouped Indian-style (`1,88,000`) with paise in the `P.` column.
- **Tax type** — pick `CGST + SGST` (same state) or `IGST` (other state) and set
  the rate. Typing a buyer GSTIN picks the right one for you from its state
  code (`27…` → CGST+SGST, anything else → IGST).
- **Round off** rounds the grand total to whole rupees (on by default).
- `＋ Row` / `− Row` add and remove item lines (17 fit on the sheet).
  Pressing `Enter` in a cell jumps to the next row.
- **Sample** loads the ASBESTOS INDIA / bill 138 data; **Clear** empties the form.
- Work is saved in the browser automatically, so a reload does not lose it.

## The PDF

`⬇ Download PDF` saves an A4 PDF named from the two toolbar boxes:

```
Company Name  +  Document Name   ->   "ASBESTOS INDIA 138.pdf"
```

Those two boxes are linked to the `M/s.` and `BILL NO.` fields on the invoice —
edit either side and both follow.

`🖨 Print` uses the browser's own print dialog (choose *Save as PDF*), which
gives sharper, selectable text. Useful if you want the smallest possible file.

## Install as an app

Serve over http/https, then:

- **Android / Chrome / Edge** — tap the `⤓ Install App` button in the toolbar,
  or browser menu → *Install app* / *Add to Home screen*.
- **iPhone / Safari** — Share → *Add to Home Screen*.
- **Windows / Chrome / Edge** — install icon in the address bar.

Once installed it opens full-screen and keeps working with no internet.

## Files

```
index.html   invoice markup (every element positioned from the original PDF)
app.css      layout in points — A4 595.32 x 841.92 pt, scaled to fit any screen
app.js       calculations, amount in words, PDF export, autosave, zoom, PWA
assets.js    logo, product photo and signature embedded as data URIs
manifest.json / sw.js / icons/   PWA install + offline cache
vendor/      html2pdf (html2canvas + jsPDF) bundled locally so it works offline
serve.bat    local web server on port 8080
```

Changing anything under `vendor/`, `icons/` or the core files? Bump `CACHE` in
`sw.js` so installed copies pick up the new version.
