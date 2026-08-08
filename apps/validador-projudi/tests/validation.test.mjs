import test from "node:test";
import assert from "node:assert/strict";
import * as asn1js from "asn1js";
import { SignedData } from "pkijs";

globalThis.DOMMatrix ??= class DOMMatrix {};

const { parsePdf, parseP7s } = await import("../src/validation.js");

const PDF_BYTES = new TextEncoder().encode(
  "%PDF-1.4\n"
    + "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
    + "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
    + "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n"
    + "trailer\n<< /Root 1 0 R >>\n%%EOF"
);

function signedPdfBytes(pdfBytes) {
  const digestAlgorithm = new asn1js.Sequence({
    value: [
      new asn1js.ObjectIdentifier({ value: "2.16.840.1.101.3.4.2.1" }),
      new asn1js.Null()
    ]
  });
  const encapsulatedContent = new asn1js.Sequence({
    value: [
      new asn1js.ObjectIdentifier({ value: "1.2.840.113549.1.7.1" }),
      new asn1js.Constructed({
        idBlock: { tagClass: 3, tagNumber: 0 },
        value: [new asn1js.OctetString({ valueHex: pdfBytes.slice().buffer })]
      })
    ]
  });
  const signedData = new asn1js.Sequence({
    value: [
      new asn1js.Integer({ value: 1 }),
      new asn1js.Set({ value: [digestAlgorithm] }),
      encapsulatedContent,
      new asn1js.Set({ value: [] })
    ]
  });
  const contentInfo = new asn1js.Sequence({
    value: [
      new asn1js.ObjectIdentifier({ value: "1.2.840.113549.1.7.2" }),
      new asn1js.Constructed({
        idBlock: { tagClass: 3, tagNumber: 0 },
        value: [signedData]
      })
    ]
  });
  return new Uint8Array(contentInfo.toBER(false));
}

test("valida PDF sem chamar destroy no documento retornado", async () => {
  assert.equal(await parsePdf(PDF_BYTES), 1);
});

test("mantém a validação PDF/P7S livre do erro de destroy", async () => {
  const originalVerify = SignedData.prototype.verify;
  SignedData.prototype.verify = async () => true;

  try {
    const signature = await parseP7s(signedPdfBytes(PDF_BYTES));
    assert.equal(signature.signatureVerified, true);
    assert.deepEqual(signature.pdfBytes, PDF_BYTES);
    assert.equal(await parsePdf(signature.pdfBytes), 1);
  } finally {
    SignedData.prototype.verify = originalVerify;
  }
});
