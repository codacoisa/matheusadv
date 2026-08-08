import * as asn1js from "asn1js";
import * as pdfjsLib from "pdfjs-dist/build/pdf.mjs";
import {
  Certificate,
  ContentInfo,
  CryptoEngine,
  SignedData,
  setEngine
} from "pkijs";

setEngine("WebCrypto", crypto, new CryptoEngine({ name: "WebCrypto", crypto, subtle: crypto.subtle }));

export function configurePdfWorker(url) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = url;
}

function concatViews(views) {
  const total = views.reduce((sum, view) => sum + view.byteLength, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const view of views) {
    output.set(view, offset);
    offset += view.byteLength;
  }
  return output;
}

function octetBytes(octetString) {
  const block = octetString?.valueBlock;
  if (!block) throw new Error("O arquivo P7S não contém o documento assinado.");
  if (block.isConstructed && Array.isArray(block.value)) {
    return concatViews(block.value.map(item => new Uint8Array(item.valueBlock.valueHexView)));
  }
  return new Uint8Array(block.valueHexView);
}

function attributeValue(certificate, oid) {
  const attribute = certificate?.subject?.typesAndValues?.find(item => item.type === oid);
  return attribute?.value?.valueBlock?.value || null;
}

function signingDate(signedData) {
  const oid = "1.2.840.113549.1.9.5";
  const value = signedData.signerInfos?.[0]?.signedAttrs?.attributes
    ?.find(attribute => attribute.type === oid)?.values?.[0];
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  return value.valueBlock?.valueDate || null;
}

export async function parsePdf(pdfBytes) {
  const loadingTask = pdfjsLib.getDocument({
    data: pdfBytes.slice(),
    isEvalSupported: false,
    useWorkerFetch: false
  });
  let parsingFailed = false;

  try {
    const document = await loadingTask.promise;
    return document.numPages;
  } catch (error) {
    parsingFailed = true;
    throw error;
  } finally {
    try {
      await loadingTask.destroy();
    } catch (error) {
      if (!parsingFailed) throw error;
    }
  }
}

export async function parseP7s(buffer) {
  const decoded = asn1js.fromBER(buffer);
  if (decoded.offset === -1) throw new Error("Estrutura P7S inválida ou corrompida.");

  const contentInfo = new ContentInfo({ schema: decoded.result });
  if (contentInfo.contentType !== "1.2.840.113549.1.7.2") {
    throw new Error("O arquivo não usa o formato CMS SignedData esperado.");
  }

  const signedData = new SignedData({ schema: contentInfo.content });
  const pdfBytes = octetBytes(signedData.encapContentInfo.eContent);
  if (pdfBytes[0] !== 0x25 || pdfBytes[1] !== 0x50 || pdfBytes[2] !== 0x44 || pdfBytes[3] !== 0x46) {
    throw new Error("A assinatura não contém um PDF reconhecível.");
  }

  const verification = await signedData.verify({ signer: 0, checkChain: false, extendedMode: true });
  const signatureVerified = typeof verification === "boolean"
    ? verification
    : Boolean(verification?.signatureVerified);
  const certificate = signedData.certificates?.find(item => item instanceof Certificate) || null;

  return {
    pdfBytes,
    signatureVerified,
    signer: certificate ? attributeValue(certificate, "2.5.4.3") : null,
    issuer: certificate?.issuer?.typesAndValues
      ?.find(item => item.type === "2.5.4.3")?.value?.valueBlock?.value || null,
    validFrom: certificate?.notBefore?.value || null,
    validUntil: certificate?.notAfter?.value || null,
    signedAt: signingDate(signedData)
  };
}
