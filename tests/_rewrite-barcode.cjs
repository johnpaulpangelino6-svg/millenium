// Rewrites generateWarrantyBarcode() for the restructured sticker modal.
const fs = require('fs');
const FILE = 'public/js/app.js';
const src = fs.readFileSync(FILE, 'utf8');

const START = 'function generateWarrantyBarcode(warranty, device) {';
const END = '// Print Warranty Barcode';
const i = src.indexOf(START);
const j = src.indexOf(END);
if (i < 0 || j < 0) throw new Error('anchors not found');

const replacement = `function generateWarrantyBarcode(warranty, device) {
  try {
    // A bare serial/ID keeps the sticker scannable by this app's own scanner
    // AND by generic 1D barcode readers. (A URL payload would not fit CODE128
    // legibly at sticker size, and would break external readers.)
    const barcodeValue = buildWarrantyBarcodePayload(device);

    if (!barcodeValue) {
      showToast('This device has no serial number or ID to encode', 'error');
      return;
    }

    if (typeof JsBarcode === 'undefined') {
      showToast('Barcode library failed to load (offline?). Check your connection.', 'error');
      return;
    }

    const svgEl = document.getElementById('warrantyBarcode');

    JsBarcode('#warrantyBarcode', barcodeValue, {
      format: 'CODE128',
      width: 1.6,
      height: 62,
      displayValue: true,
      fontSize: 13,
      fontOptions: 'bold',
      textMargin: 5,
      margin: 0,
      background: '#ffffff',
      lineColor: '#000000',
    });

    // JsBarcode emits fixed pixel width/height and no viewBox, so a long serial
    // silently overflowed the sticker (and got clipped by the card's padding)
    // instead of shrinking. Adding a viewBox makes the SVG scale to its box.
    if (svgEl) {
      const w = Number(svgEl.getAttribute('width')) || svgEl.getBBox?.().width || 0;
      const h = Number(svgEl.getAttribute('height')) || 0;
      if (w && h && !svgEl.getAttribute('viewBox')) {
        svgEl.setAttribute('viewBox', \`0 0 \${w} \${h}\`);
      }
      svgEl.removeAttribute('width');
      svgEl.removeAttribute('height');
      svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    }

    const today = new Date();
    const expiryDate = new Date(warranty.expiryDate);
    const daysRemaining = Math.ceil((expiryDate.getTime() - today.getTime()) / 86400000);

    // One state machine for the pill: the old code carried an emoji icon plus a
    // colour, which meant the same contract could read "green" in the summary
    // and "amber" in the detail list.
    let stateLabel = 'Active';
    let stateClass = 'is-active';
    if (daysRemaining < 0) {
      stateLabel = 'Expired';
      stateClass = 'is-expired';
    } else if (daysRemaining <= 30) {
      stateLabel = 'Expiring soon';
      stateClass = 'is-soon';
    }

    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };

    setText('barcodeWarrantyTitle', \`Contract \${warranty.id}\`);
    setText('barcodeWarrantySubtitle', warranty.coverageType || 'Warranty coverage');
    setText('barcodeDeviceId', device.id || '—');
    setText('barcodeDeviceInfo', [device.model, device.customerName].filter(Boolean).join(' · '));

    const pill = document.getElementById('barcodeStatusPill');
    if (pill) {
      pill.textContent = stateLabel;
      pill.className = \`bc-state \${stateClass}\`;
    }

    const rows = [
      ['Coverage', warranty.coverageType || '—'],
      ['Purchased', formatShortDate(warranty.purchaseDate)],
      ['Expires', formatShortDate(warranty.expiryDate)],
      ['Remaining', daysRemaining < 0 ? 'Expired' : \`\${daysRemaining} day\${daysRemaining === 1 ? '' : 's'}\`],
      ['Serial', device.serialNumber || '—'],
      ['Location', [device.location, device.city].filter(Boolean).join(', ') || '—'],
    ];

    const details = document.getElementById('barcodeWarrantyDetails');
    if (details) {
      details.innerHTML = rows.map(([label, value], index) => \`
        <div class="bc-row\${index === 3 && daysRemaining < 0 ? ' is-alert' : ''}">
          <dt>\${escapeHtml(label)}</dt>
          <dd>\${escapeHtml(String(value))}</dd>
        </div>\`).join('');
    }
  } catch (error) {
    console.error('Failed to generate barcode:', error);
    showToast('Failed to generate barcode', 'error');
  }
}

`;

fs.writeFileSync(FILE, src.slice(0, i) + replacement + src.slice(j));
console.log('replaced', j - i, '->', replacement.length);
