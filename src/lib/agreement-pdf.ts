import logo from "@/assets/logo.png.asset.json";
import { AGREEMENT_VERSION, company, parseAgreement } from "@/lib/agreements";

type Signer = { name: string; accountNumber: string; signedAt: string };

async function logoData(): Promise<{ data: string; w: number; h: number } | null> {
  // Load the logo like the page does (same origin, so the canvas stays readable), then shrink it to a print-sized PNG.
  const load = (src: string) => new Promise<HTMLImageElement>((ok, fail) => { const i = new Image(); i.decoding = "async"; i.onload = () => ok(i); i.onerror = () => fail(new Error("logo")); i.src = src; });
  for (const src of [logo.url, new URL(logo.url, window.location.origin).href]) {
    try {
      const img = await load(src);
      const scale = Math.min(1, 480 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale); canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      return { data: canvas.toDataURL("image/png"), w: canvas.width, h: canvas.height };
    } catch { /* try the next source */ }
  }
  return null;
}

/** Strips the plain-text signature footer stored on signed copies, so the PDF can draw a proper signature block instead. */
function splitSigned(body: string): { text: string; footer: string | null } {
  const i = body.lastIndexOf("\n\n---\n");
  return i === -1 ? { text: body, footer: null } : { text: body.slice(0, i), footer: body.slice(i + 6) };
}

/** Downloads an agreement as a branded PDF: letterhead with the logo, numbered sections, page numbers and, when signed, a signature block. */
export async function downloadAgreementPdf(doc: { title: string; body: string; version?: string }, signer?: Signer) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight(), M = 56, maxW = W - M * 2;
  const mark = await logoData();
  const { text, footer } = splitSigned(doc.body);
  const version = doc.version ?? AGREEMENT_VERSION;

  const header = () => {
    if (mark) { const h = 34, w = Math.min((mark.w / mark.h) * h, 180); pdf.addImage(mark.data, "PNG", M, 36, w, h); }
    else { pdf.setFont("helvetica", "bold").setFontSize(14).text(company.name, M, 56); }
    pdf.setFont("helvetica", "normal").setFontSize(9).setTextColor(110);
    pdf.setFont("helvetica", "bold").text(company.name, W - M, 42, { align: "right" });
    pdf.setFont("helvetica", "normal").text([`Operated by ${company.legalName}`, ...company.address, company.website], W - M, 53, { align: "right" });
    pdf.setDrawColor(220).setLineWidth(0.5).line(M, 112, W - M, 112);
    pdf.setTextColor(20);
  };
  let y = 0;
  const newPage = () => { pdf.addPage(); header(); y = 138; };
  const need = (h: number) => { if (y + h > H - 64) newPage(); };

  header(); y = 146;
  pdf.setFont("helvetica", "bold").setFontSize(15).text(doc.title, M, y); y += 14;
  pdf.setFont("helvetica", "normal").setFontSize(8).setTextColor(110).text(`Version ${version}${signer ? ` · Account ${signer.accountNumber}` : ""}`, M, y); y += 20;
  pdf.setTextColor(30);

  const BODY = 8.75, LH = 12.2;
  const table = (header: string[] | null, rows: string[][]) => {
    const cols = Math.max(...[header, ...rows].filter(Boolean).map((r) => r!.length));
    const first = cols === 2 ? 150 : 96;
    const widths = [first, ...Array(cols - 1).fill((maxW - first) / (cols - 1))] as number[];
    const pad = 5, lh = 10.8;
    const draw = (cells: string[], head: boolean) => {
      pdf.setFont("helvetica", head ? "bold" : "normal").setFontSize(8);
      const wrapped = widths.map((w, c) => pdf.splitTextToSize(cells[c] ?? "", w - pad * 2) as string[]);
      const h = Math.max(...wrapped.map((w) => w.length)) * lh + pad * 2 - 2;
      need(h);
      let x = M;
      if (head) { pdf.setFillColor(243, 244, 246); pdf.rect(M, y, maxW, h, "F"); }
      pdf.setDrawColor(225).setLineWidth(0.5);
      widths.forEach((w, c) => {
        pdf.rect(x, y, w, h);
        if (!head && c === 0) pdf.setFont("helvetica", "bold");
        pdf.setTextColor(head ? 60 : 30).text(wrapped[c]!, x + pad, y + pad + 6.5);
        if (!head && c === 0) pdf.setFont("helvetica", "normal");
        x += w;
      });
      y += h;
    };
    if (header) draw(header, true);
    rows.forEach((r) => draw(r, false));
    y += 16; pdf.setTextColor(30);
  };

  for (const b of parseAgreement(text)) {
    if (b.kind === "table") { table(b.header, b.rows); continue; }
    if (b.kind === "heading") {
      need(30); y += 5;
      pdf.setFont("helvetica", "bold").setFontSize(9.5).text(b.text, M, y); y += 13;
      continue;
    }
    pdf.setFont("helvetica", "normal").setFontSize(BODY);
    if (b.kind === "notice") {
      pdf.setFont("helvetica", "bold");
      const wrapped = pdf.splitTextToSize(b.text, maxW - 20) as string[];
      const h = wrapped.length * LH + 14;
      need(h + 6);
      pdf.setFillColor(243, 244, 246).setDrawColor(210).roundedRect(M, y, maxW, h, 4, 4, "FD");
      pdf.text(wrapped, M + 10, y + 15);
      y += h + 10;
      continue;
    }
    for (const line of b.text.split("\n")) {
      const sub = /^\d+\.\d+\s/.test(line);
      const wrapped = pdf.splitTextToSize(line, maxW - (sub ? 14 : 0)) as string[];
      for (const w of wrapped) { need(LH); pdf.text(w, M + (sub ? 14 : 0), y); y += LH; }
      y += 2.5;
    }
    y += 4;
  }

  if (signer || footer) {
    y += 6;
    const rows = signer
      ? [["Signed by", signer.name], ["Account number", signer.accountNumber], ["Signed", new Date(signer.signedAt).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })], ["Method", "Electronic signature with a one-time confirmation code"]]
      : (footer ?? "").split("\n").filter(Boolean).map((l) => ["Signature", l]);
    need(30 + rows.length * 18);
    pdf.setFont("helvetica", "bold").setFontSize(9.5).text("Electronic signature", M, y); y += 8;
    table(null, rows);
  }

  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setFont("helvetica", "normal").setFontSize(7).setTextColor(130);
    pdf.text(`${company.legalName} d/b/a ${company.name} · ${doc.title} · Version ${version}`, M, H - 32);
    pdf.text(`Page ${i} of ${pages}`, W - M, H - 32, { align: "right" });
  }
  pdf.save(`${doc.title.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}.pdf`);
}
