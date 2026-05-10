import { PDFDocument } from 'pdf-lib';
import { EventSettings, GuestMessage } from '../contexts/GuestbookContext';

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src.substring(0, 60)}`));
    img.src = src;
  });
}

export async function exportGuestbookToPDF(
  messages: GuestMessage[],
  settings: EventSettings,
  onProgress?: (current: number, total: number) => void
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();

  for (let i = 0; i < messages.length; i++) {
    onProgress?.(i + 1, messages.length);
    const msg = messages[i];

    // Load the saved message image, which already includes drawing + frame overlay.
    const msgImg = await loadImageElement(msg.pesanImageUrl);
    const response = await fetch(msg.pesanImageUrl);
    const pngBytes = await response.arrayBuffer();
    const pngImage = await pdfDoc.embedPng(pngBytes);

    const pageWidth = Math.round(msgImg.width);
    const pageHeight = Math.round(msgImg.height);
    const page = pdfDoc.addPage([pageWidth, pageHeight]);

    page.drawImage(pngImage, {
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
    });
  }

  return pdfDoc.save();
}

export function downloadPDF(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
