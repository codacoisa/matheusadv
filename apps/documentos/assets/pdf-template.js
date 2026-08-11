(() => {
  const documentConfig = window.OFFICEJUR_DOCUMENT_CONFIG || {};
  const pdfConfig = documentConfig.pdf || {};
  const colors = pdfConfig.colors || {};
  const footer = pdfConfig.footer || {};

  function loadCroppedImage(src, crop) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = crop.w;
        canvas.height = crop.h;
        canvas.getContext('2d').drawImage(image, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
        resolve(canvas.toDataURL('image/png'));
      };
      image.onerror = reject;
      image.src = src;
    });
  }

  async function loadAssets() {
    const assets = pdfConfig.assets || {};
    const crop = (value, fallback) => ({ ...fallback, ...(value || {}) });
    const [logo, wordmark, watermark] = await Promise.all([
      loadCroppedImage(assets.logoUrl, crop(assets.logoCrop, { x: 200, y: 234, w: 623, h: 962 })),
      loadCroppedImage(assets.wordmarkUrl, crop(assets.wordmarkCrop, { x: 238, y: 384, w: 1068, h: 190 })),
      loadCroppedImage(assets.watermarkUrl, crop(assets.watermarkCrop, { x: 0, y: 0, w: 1414, h: 2000 })),
    ]);
    return { logo, wordmark, watermark };
  }

  function drawWatermark(doc, assets) {
    if (!assets?.watermark) return;
    if (doc.GState && doc.setGState) doc.setGState(new doc.GState({ opacity: 0.18 }));
    doc.addImage(assets.watermark, 'PNG', 134.4, 42.3, 150, 212.3);
    if (doc.GState && doc.setGState) doc.setGState(new doc.GState({ opacity: 1 }));
  }

  function drawFooter(doc, drawIcon) {
    const footerGray = colors.footerGray || [125, 125, 128];
    const rows = [
      { icon: 'phone', text: footer.phone || '', y: 282, link: footer.whatsappUrl },
      { icon: 'pin', text: footer.address || '', y: 287, link: footer.mapsUrl },
      { icon: 'envelope', text: footer.email || '', y: 292 },
    ].filter((row) => row.text);

    doc.setDrawColor(...(colors.gold || [179, 135, 49]));
    doc.setLineWidth(0.25);
    doc.line(0, 274, 210, 274);
    doc.setLineWidth(0.8);
    doc.line(0, 294, 210, 294);
    doc.setLineWidth(0.3);
    doc.line(0, 296, 210, 296);
    doc.setFont('times', 'normal');
    doc.setTextColor(...footerGray);
    doc.setFontSize(9);

    const iconSize = 3;
    const gap = 1.6;
    rows.forEach(({ icon, text, y, link }) => {
      const textWidth = doc.getTextWidth(text);
      const startX = 105 - (iconSize + gap + textWidth) / 2;
      drawIcon(doc, icon, startX, y - iconSize * 0.78, iconSize, footerGray);
      if (link) doc.textWithLink(text, startX + iconSize + gap, y, { url: link });
      else doc.text(text, startX + iconSize + gap, y);
    });
  }

  function setProperties(doc, template, draft, encodeDraft) {
    const metadata = template?.metadata || {};
    const officeName = documentConfig.office?.name || window.OFFICEJUR_CONFIG?.office?.name || '';
    doc.setProperties({
      title: metadata.title || 'Documento',
      author: officeName,
      subject: metadata.subject || `${metadata.title || 'Documento'} gerado pelo ${documentConfig.office?.productName || 'OfficeJur'}`,
      keywords: encodeDraft(draft),
    });
  }

  window.OfficeJurPdfTemplate = Object.freeze({
    colors,
    drawFooter,
    drawWatermark,
    loadAssets,
    setProperties,
  });
})();
