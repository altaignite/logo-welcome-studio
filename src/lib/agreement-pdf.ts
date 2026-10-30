import logo from "@/assets/logo.png.asset.json";
import { AGREEMENT_VERSION, company } from "@/lib/signup";

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

  header(); y = 148;
  pdf.setFont("helvetica", "bold").setFontSize(20).text(doc.title, M, y); y += 18;
  pdf.setFont("helvetica", "normal").setFontSize(9).setTextColor(110).text(`Version ${version}${signer ? ` · Account ${signer.accountNumber}` : ""}`, M, y); y += 26;
  pdf.setTextColor(20);

  for (const para of text.split(/\n\s*\n/)) {
    const lines = para.split("\n");
    for (const [i, line] of lines.entries()) {
      const heading = (/^\d+\.\s/.test(line) && line.length < 80) || /^(PARTIES|Provider:|Client:)$/.test(line);
      pdf.setFont("helvetica", heading ? "bold" : "normal").setFontSize(heading ? 11.5 : 10.5);
      const wrapped = pdf.splitTextToSize(line, maxW) as string[];
      const lh = heading ? 16 : 15;
      need(wrapped.length * lh + (heading ? 8 : 0));
      if (heading && i === 0) y += 4;
      pdf.text(wrapped, M, y); y += wrapped.length * lh + (heading ? 2 : 0);
    }
    y += 8;
  }

  if (signer || footer) {
    need(110); y += 10;
    pdf.setDrawColor(200).roundedRect(M, y, maxW, 86, 6, 6);
    pdf.setFont("helvetica", "bold").setFontSize(10).text("Signed digitally", M + 16, y + 22);
    pdf.setFont("helvetica", "normal").setFontSize(10);
    const rows = signer
      ? [`Name: ${signer.name}`, `Account number: ${signer.accountNumber}`, `Signed: ${new Date(signer.signedAt).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })}`]
      : (footer ?? "").split("\n").filter(Boolean);
    pdf.text(rows, M + 16, y + 40);
  }

  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setFont("helvetica", "normal").setFontSize(8).setTextColor(130);
    pdf.text(`${company.name} · ${doc.title} · Version ${version}`, M, H - 32);
    pdf.text(`Page ${i} of ${pages}`, W - M, H - 32, { align: "right" });
  }
  pdf.save(`${doc.title.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}.pdf`);
}
