import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

const root = resolve("_site");
const htmlFiles = [];
const publishedFiles = [];

function walk(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) walk(path);
    else {
      publishedFiles.push(path);
      if (entry.endsWith(".html")) htmlFiles.push(path);
    }
  }
}

walk(root);

const missing = [];
const redirectPages = [];
const pagesWithoutModalScrollLock = [];
const pagesWithoutStandardMetadata = [];
const attributePattern = /(?<![\w-])(?:href|src)=["']([^"']+)["']/g;
// O bundle do editor preserva páginas e rotas próprias do projeto de origem.
// Seu contrato publicado é validado pelos arquivos essenciais listados abaixo.
const thirdPartyHtmlPrefixes = ["arquivos/editor/"];
const requiredEditorFiles = [
  "arquivos/editor/editor.html",
  "arquivos/editor/AGPL-3.0.LICENSE",
  "arquivos/editor/sdkjs/common/wasm/x2t/x2t.js",
  "arquivos/editor/sdkjs/common/wasm/x2t/x2t.wasm.gz",
  "arquivos/editor/web-apps/apps/api/documents/api.js",
  "arquivos/editor/web-apps/apps/documenteditor/main/index.html",
  "arquivos/editor/web-apps/apps/presentationeditor/main/index.html",
  "arquivos/editor/web-apps/apps/spreadsheeteditor/main/index.html",
];

for (const htmlFile of htmlFiles) {
  const html = readFileSync(htmlFile, "utf8");
  const publishedPath = htmlFile.replace(`${root}/`, "");
  const isThirdPartyHtml = thirdPartyHtmlPrefixes.some((prefix) =>
    publishedPath.startsWith(prefix),
  );

  if (!isThirdPartyHtml) {
    if (/http-equiv=["']refresh["']|window\.location\.replace\s*\(/i.test(html)) {
      redirectPages.push(publishedPath);
    }
    if (!html.includes("modal-scroll-lock.js")) {
      pagesWithoutModalScrollLock.push(publishedPath);
    }
    const standardMetaValues = [
      ["theme-color", "#17213a"],
      ["msapplication-TileColor", "#17213a"],
      ["application-name", "OfficeJur"],
      ["apple-mobile-web-app-title", "OfficeJur"],
      ["apple-mobile-web-app-status-bar-style", "black-translucent"],
    ];
    const hasStandardMetadata =
      standardMetaValues.every(([name, content]) =>
        new RegExp(
          `<meta\\s+[^>]*name=["']${name}["'][^>]*content=["']${content}["'][^>]*>`,
          "i",
        ).test(html),
      ) &&
      /<link\s+[^>]*rel=["']icon["'][^>]*href=["'](?:\.\.?\/)*assets\/app-icon\.png["'][^>]*type=["']image\/png["'][^>]*>/i.test(html) &&
      /<link\s+[^>]*rel=["']apple-touch-icon["'][^>]*href=["'](?:\.\.?\/)*assets\/app-icon\.png["'][^>]*>/i.test(html) &&
      html.includes("office-config.js") &&
      html.includes("office-context.js") &&
      html.indexOf("office-config.js") < html.indexOf("office-context.js");

    if (!hasStandardMetadata) {
      pagesWithoutStandardMetadata.push(publishedPath);
    }
  }
  if (isThirdPartyHtml) continue;

  for (const match of html.matchAll(attributePattern)) {
    const reference = match[1].split("#")[0].split("?")[0];
    if (
      !reference ||
      /^(?:https?:|mailto:|tel:|data:|javascript:)/.test(reference)
    )
      continue;

    const target = reference.startsWith("/")
      ? join(root, reference.replace(/^\/officejur\/?/, ""))
      : resolve(dirname(htmlFile), reference);
    const resolvedTarget = target.endsWith("/")
      ? join(target, "index.html")
      : target;

    if (!existsSync(resolvedTarget)) {
      missing.push(`${htmlFile.replace(`${root}/`, "")}: ${match[1]}`);
    }
  }
}

for (const requiredEditorFile of requiredEditorFiles) {
  if (!existsSync(join(root, requiredEditorFile))) {
    missing.push(`Bundle do editor ausente: ${requiredEditorFile}`);
  }
}

const editorAssetsDirectory = join(root, "arquivos/editor/assets");
if (
  !existsSync(editorAssetsDirectory) ||
  !readdirSync(editorAssetsDirectory).some((entry) => /^editor-.*\.js$/.test(entry))
) {
  missing.push("Bundle do editor ausente: arquivos/editor/assets/editor-*.js");
}

if (pagesWithoutModalScrollLock.length) {
  console.error("Páginas sem o bloqueio compartilhado de rolagem:");
  for (const path of pagesWithoutModalScrollLock) console.error(`- ${path}`);
  process.exit(1);
}

if (pagesWithoutStandardMetadata.length) {
  console.error("Páginas sem os metadados institucionais padronizados:");
  for (const path of pagesWithoutStandardMetadata) console.error(`- ${path}`);
  process.exit(1);
}

if (redirectPages.length) {
  console.error("Páginas de redirecionamento obsoletas foram publicadas:");
  for (const path of redirectPages) console.error(`- ${path}`);
  process.exit(1);
}

if (missing.length) {
  console.error("Referências locais ausentes:");
  for (const reference of missing) console.error(`- ${reference}`);
  process.exit(1);
}

const forbiddenPublishedFiles = publishedFiles
  .map((path) => path.replace(`${root}/`, ""))
  .filter((path) => !path.startsWith("arquivos/editor/"))
  .filter((path) =>
    /(?:^|\/)(?:README|ARCHITECTURE)\.md$|(?:^|\/)\.(?:gitignore|gitmessage)$|(?:^|\/)wrangler\.toml$|^lab\/controle-pagamentos\/controle-pagamentos\.json$/.test(
      path,
    ),
  );

if (forbiddenPublishedFiles.length) {
  console.error("Arquivos internos ou dados indevidamente publicados:");
  for (const path of forbiddenPublishedFiles) console.error(`- ${path}`);
  process.exit(1);
}

const obsoleteSourceFiles = [
  "apps/portal/scripts/index.html",
  "apps/portal/scripts/central-guias.html",
  "apps/controle-pagamentos/index.html",
  "apps/financeiro/assets/apple-touch-icon.svg",
  "apps/financeiro/assets/apple-touch-icon.png",
  "apps/financeiro/assets/favicon-32.png",
  "apps/financeiro/assets/favicon.svg",
  "apps/financeiro/assets/safari-pinned-tab.svg",
  "apps/validador-projudi/public/index.html",
];

for (const path of obsoleteSourceFiles) {
  if (existsSync(path)) {
    console.error(`Arquivo obsoleto ainda presente: ${path}`);
    process.exit(1);
  }
}

const labToolsRoot = "apps/lab/tools";
const labCatalogSource = readFileSync("apps/lab/assets/catalog.js", "utf8");
const catalogToolIds = [
  ...labCatalogSource.matchAll(/\bid\s*:\s*['"]([a-z0-9-]+)['"]/g),
].map((match) => match[1]);
const sourceToolIds = readdirSync(labToolsRoot)
  .filter((entry) => existsSync(join(labToolsRoot, entry, "index.html")))
  .sort();

if (
  catalogToolIds.length !== new Set(catalogToolIds).size ||
  catalogToolIds.slice().sort().join("\n") !== sourceToolIds.join("\n")
) {
  console.error(
    "O catálogo do Lab deve conter exatamente uma entrada para cada pasta em apps/lab/tools.",
  );
  process.exit(1);
}

const documentModulesRoot = "apps/documentos";
const sharedDocumentAssets = [
  "document-header.js",
  "document-utils.js",
  "pdf-template.js",
  "jspdf.umd.min.js",
  "styles.css",
];

const sharedHeaderPages = [
  "apps/calculos/index.html",
  "apps/configuracoes/index.html",
  "apps/configuracoes/ajuda.html",
  "apps/financeiro/index.html",
  "apps/agenda/index.html",
  "apps/configuracoes/ajuda-cloudflare-workers.html",
  "apps/lab/index.html",
  "apps/lab/tools/central-guias/index.html",
  "apps/lab/tools/controle-pagamentos/index.html",
  "apps/validador-projudi/index.html",
  "apps/arquivos/index.html",
  "apps/documentos/ciencia-audiencia/index.html",
  "apps/documentos/hipossuficiencia/index.html",
  "apps/documentos/honorarios/index.html",
  "apps/documentos/procuracao/index.html",
];

const cloudStatusPages = [
  "apps/financeiro/index.html",
  "apps/agenda/index.html",
  "apps/calculos/index.html",
  "apps/calculos/facil/index.html",
  "apps/calculos/completo/index.html",
  "apps/calculos/pensao/index.html",
  "apps/calculos/trabalhista/index.html",
  "apps/arquivos/index.html",
  "apps/lab/tools/controle-pagamentos/index.html",
  "apps/lab/tools/central-guias/index.html",
];

const localAccessBlockedPages = [
  "apps/calculos/index.html",
  "apps/calculos/facil/index.html",
  "apps/calculos/completo/index.html",
  "apps/calculos/pensao/index.html",
  "apps/calculos/trabalhista/index.html",
  "apps/financeiro/index.html",
  "apps/agenda/index.html",
  "apps/lab/tools/controle-pagamentos/index.html",
];

const localAccessBlockedReferences = new Map([
  ["apps/calculos/index.html", "./assets/"],
  ["apps/calculos/facil/index.html", "../assets/"],
  ["apps/calculos/completo/index.html", "../assets/"],
  ["apps/calculos/pensao/index.html", "../assets/"],
  ["apps/calculos/trabalhista/index.html", "../assets/"],
  ["apps/financeiro/index.html", "./assets/"],
  ["apps/agenda/index.html", "./assets/"],
  ["apps/lab/tools/controle-pagamentos/index.html", "./assets/"],
]);

const localAccessBlockedSourceCopies = [
  "apps/calculos/assets/app.js",
  "apps/calculos/generalista/assets/generalista-app.js",
  "apps/calculos/pensao/assets/app.js",
  "apps/calculos/trabalhista/assets/labor-app.js",
  "apps/financeiro/assets/app.js",
  "apps/agenda/assets/app.js",
  "apps/lab/tools/controle-pagamentos/assets/app.js",
];

if (!existsSync("packages/ui/site-header.css")) {
  console.error("Base visual compartilhada dos headers ausente.");
  process.exit(1);
}

if (!existsSync("packages/ui/cloud-status.js")) {
  console.error("Indicador compartilhado de nuvem ausente.");
  process.exit(1);
}

for (const asset of ["local-access-blocked.js", "local-access-blocked.css"]) {
  if (!existsSync(join("packages/ui", asset))) {
    console.error(`Componente compartilhado de acesso local ausente: ${asset}.`);
    process.exit(1);
  }
}

for (const path of localAccessBlockedPages) {
  const source = readFileSync(path, "utf8");
  const assetPrefix = localAccessBlockedReferences.get(path);
  for (const asset of ["local-access-blocked.js", "local-access-blocked.css"]) {
    const reference = `${assetPrefix}${asset}`;
    const publishedRelativePath = path.startsWith("apps/lab/tools/")
      ? path.replace("apps/lab/tools/", "lab/")
      : path.replace(/^apps\//, "");
    const publishedPath = join(root, publishedRelativePath);
    const published = readFileSync(publishedPath, "utf8");
    const publishedAsset = resolve(dirname(publishedPath), reference);
    if (!source.includes(reference) || !published.includes(reference) || !existsSync(publishedAsset)) {
      console.error(`Referência inválida ao estado compartilhado (${asset}) em ${path}.`);
      process.exit(1);
    }
  }
}

for (const path of localAccessBlockedSourceCopies) {
  const source = readFileSync(path, "utf8");
  if (!source.includes("OfficeJurLocalAccessBlocked") || source.includes("Acesso local bloqueado")) {
    console.error(`Montagem local divergente do componente de acesso bloqueado: ${path}.`);
    process.exit(1);
  }
}

for (const path of sharedHeaderPages) {
  if (!readFileSync(path, "utf8").includes("site-header.css")) {
    console.error(`Página sem o header visual compartilhado: ${path}.`);
    process.exit(1);
  }
}

for (const path of cloudStatusPages) {
  const source = readFileSync(path, "utf8");
  const publishedRelativePath = path.startsWith("apps/lab/tools/")
    ? path.replace("apps/lab/tools/", "lab/")
    : path.replace(/^apps\//, "");
  const publishedPath = join(root, publishedRelativePath);
  const published = readFileSync(publishedPath, "utf8");
  if (
    !source.includes("cloud-status.js") ||
    !source.includes("<office-cloud-status") ||
    !published.includes("cloud-status.js") ||
    !published.includes("<office-cloud-status")
  ) {
    console.error(`Página sincronizável sem o indicador compartilhado de nuvem: ${path}.`);
    process.exit(1);
  }
}

const institutionalAssetsRoot = "packages/ui/assets";
const institutionalAssets = ["logo-white.png", "logo.png", "app-icon.png"];
const officeConfigSource = readFileSync("config/office.js", "utf8");
const requiredOfficeConfigFields = [
  "name",
  "shortName",
  "tagline",
  "statementDescriptor",
  "logoUrl",
  "logoWhiteUrl",
  "appIconUrl",
  "baseUrl",
  "origin",
  "repositoryUrl",
];
const requiredThemeFields = [
  "primary",
  "primaryDark",
  "primarySoft",
  "accent",
  "accentStrong",
  "accentLight",
  "accentSoft",
  "canvas",
  "surface",
  "text",
  "muted",
  "line",
  "success",
  "danger",
  "warning",
  "info",
  "headerText",
  "headerMuted",
  "pdfAccent",
  "pdfText",
  "pdfMuted",
];

for (const field of requiredOfficeConfigFields) {
  if (!new RegExp(`\\b${field}\\s*:`).test(officeConfigSource)) {
    console.error(`Campo obrigatório ausente em config/office.js: ${field}.`);
    process.exit(1);
  }
}

for (const field of requiredThemeFields) {
  if (!new RegExp(`\\b${field}\\s*:\\s*["']#[0-9a-f]{6}["']`, "i").test(officeConfigSource)) {
    console.error(`Cor obrigatória ausente ou inválida em config/office.js: ${field}.`);
    process.exit(1);
  }
}

for (const asset of institutionalAssets) {
  if (!existsSync(join(institutionalAssetsRoot, asset))) {
    console.error(`Asset institucional compartilhado ausente: ${asset}.`);
    process.exit(1);
  }
}

const documentTemplatePath = "config/document-templates/modelo-institucional.docx.base64";
const publishedDocumentTemplatePath = join(root, "assets/document-templates/modelo-institucional.docx.base64");
if (!existsSync(documentTemplatePath) || !existsSync(publishedDocumentTemplatePath)) {
  console.error("Modelo institucional DOCX ausente na configuração ou no site publicado.");
  process.exit(1);
}

const documentConfigPath = "config/document-config.js";
const publishedDocumentConfigPath = join(root, "documentos/assets/document-config.js");
if (!existsSync(documentConfigPath) || !existsSync(publishedDocumentConfigPath)) {
  console.error("Configuração documental ausente na origem ou no site publicado.");
  process.exit(1);
}
const configuredTemplateHash = officeConfigSource.match(/institutionalDocxTemplate[\s\S]*?sha256:\s*["']([a-f0-9]{64})["']/i)?.[1];
const documentTemplateBytes = Buffer.from(readFileSync(documentTemplatePath, "utf8").replace(/\s+/g, ""), "base64");
const documentTemplateHash = createHash("sha256").update(documentTemplateBytes).digest("hex");
if (documentTemplateBytes[0] !== 0x50 || documentTemplateBytes[1] !== 0x4b || configuredTemplateHash !== documentTemplateHash) {
  console.error("O modelo institucional DOCX ou seu hash em config/office.js é inválido.");
  process.exit(1);
}

const duplicatedInstitutionalSources = [];

function findInstitutionalAssetCopies(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) findInstitutionalAssetCopies(path);
    else if (institutionalAssets.includes(entry)) {
      duplicatedInstitutionalSources.push(path);
    }
  }
}

findInstitutionalAssetCopies("apps");

if (duplicatedInstitutionalSources.length) {
  console.error("Assets institucionais duplicados fora de packages/ui/assets:");
  for (const path of duplicatedInstitutionalSources) console.error(`- ${path}`);
  process.exit(1);
}

for (const path of publishedFiles) {
  const relativePath = path.replace(`${root}/`, "");
  if (
    institutionalAssets.includes(relativePath.split("/").at(-1)) &&
    !relativePath.startsWith("assets/")
  ) {
    console.error(`Asset institucional duplicado na publicação: ${relativePath}.`);
    process.exit(1);
  }
}

for (const asset of sharedDocumentAssets) {
  if (!existsSync(join(documentModulesRoot, "assets", asset))) {
    console.error(`Asset comum dos geradores ausente: ${asset}.`);
    process.exit(1);
  }
}

for (const entry of readdirSync(documentModulesRoot)) {
  const moduleRoot = join(documentModulesRoot, entry);
  if (
    entry === "assets" ||
    !statSync(moduleRoot).isDirectory() ||
    !existsSync(join(moduleRoot, "index.html"))
  )
    continue;

  const html = readFileSync(join(moduleRoot, "index.html"), "utf8");
  if (
    !html.includes("<office-document-header") ||
    !html.includes("../assets/styles.css") ||
    !html.includes("../assets/document-utils.js") ||
    !html.includes("../assets/document-config.js") ||
    !html.includes("../assets/pdf-template.js") ||
    !html.includes("../assets/jspdf.umd.min.js")
  ) {
    console.error(
      `O gerador ${entry} não utiliza a base compartilhada de documentos.`,
    );
    process.exit(1);
  }

  for (const asset of sharedDocumentAssets) {
    if (existsSync(join(moduleRoot, "assets", asset))) {
      console.error(
        `Asset compartilhado duplicado no gerador ${entry}: ${asset}.`,
      );
      process.exit(1);
    }
  }
}

const jspdfSource = readFileSync(
  join(documentModulesRoot, "assets/jspdf.umd.min.js"),
  "utf8",
);
if (!jspdfSource.includes("Version 4.2.1")) {
  console.error(
    "A versão homologada do jsPDF não está publicada nos assets comuns.",
  );
  process.exit(1);
}

const currentSourceChecks = [
  [
    "apps/validador-projudi/src/validation.js",
    /pdfjs-dist\/legacy\//,
    "build legado do PDF.js",
  ],
  [
    "apps/lab/tools/controle-pagamentos/assets/app.js",
    /payload\.data\s*\|\|\s*payload/,
    "formato antigo de backup",
  ],
  [
    "apps/lab/tools/central-guias/assets/app.js",
    /function\s+getPayloadDb\b/,
    "formato antigo da Central de Guias",
  ],
  [
    "apps/lab/tools/central-guias/assets/app.js",
    /(?:github-token|FINANCE_SETTINGS_KEY|DEFAULT_GIST_ID|Authorization[^\n]+state\.token|\bfetch\s*\()/,
    "credencial ou configuração herdada na Central de Guias",
  ],
  [
    "apps/financeiro/assets/app.js",
    /schema\s*:\s*SCHEMA\s*}\s*;/,
    "migração silenciosa de esquema",
  ],
  [
    "apps/financeiro/assets/app.js",
    /\b(?:billingMode|feeAmount)\b/,
    "campos contratuais antigos",
  ],
  [
    "packages/ui/gist-client.js",
    /["']If-Match["']/,
    "cabeçalho condicional incompatível com PATCH do Gist",
  ],
];

for (const [path, pattern, label] of currentSourceChecks) {
  if (pattern.test(readFileSync(path, "utf8"))) {
    console.error(`Compatibilidade obsoleta encontrada em ${path}: ${label}.`);
    process.exit(1);
  }
}

const modularPages = [
  "apps/portal/index.html",
  "apps/lab/index.html",
  "apps/lab/tools/central-guias/index.html",
];

for (const path of modularPages) {
  const html = readFileSync(path, "utf8");
  if (
    /<style\b/i.test(html) ||
    /<script\b(?![^>]*\bsrc\s*=)[^>]*>/i.test(html) ||
    /\sstyle\s*=/i.test(html)
  ) {
    console.error(`CSS ou JavaScript embutido encontrado em ${path}.`);
    process.exit(1);
  }
}

if (!readFileSync("apps/lab/tools/central-guias/index.html", "utf8").includes("gist-client.js")) {
  console.error("A Central de Guias não utiliza o cliente compartilhado do Gist.");
  process.exit(1);
}

const duplicatedDocumentUtilityPattern =
  /^function\s+(?:todayISO|clean|joinParts|formatCPF|formatCNPJ|formatZip|formatPhone|normalizeFilename|formatLongDate|formatShortDate|formatTime|arrayBufferToBinaryString)\b/m;

for (const entry of readdirSync(documentModulesRoot)) {
  const appScript = join(documentModulesRoot, entry, "assets", "app.js");
  if (existsSync(appScript) && duplicatedDocumentUtilityPattern.test(readFileSync(appScript, "utf8"))) {
    console.error(`Utilitário documental compartilhado duplicado no gerador ${entry}.`);
    process.exit(1);
  }
}

const financeScript = readFileSync(
  join(root, "financeiro/assets/app.js"),
  "utf8",
);
const financeHtml = readFileSync(join(root, "financeiro/index.html"), "utf8");
const requiredDocumentRoutes = [
  /procuracao\s*:\s*["']\.\.\/documentos\/procuracao\/["']/,
  /honorarios\s*:\s*["']\.\.\/documentos\/honorarios\/["']/,
];

if (
  requiredDocumentRoutes.some((route) => !route.test(financeScript)) ||
  /['"]\.\.\/(?:procuracao|honorarios)\//.test(financeScript)
) {
  console.error(
    "As rotas de geração de documentos do Financeiro estão incorretas.",
  );
  process.exit(1);
}

if (
  !financeHtml.includes("./assets/libphonenumber-max.js") ||
  !financeScript.includes("phoneCountry")
) {
  console.error(
    "O cadastro internacional de telefones não está completo no Financeiro.",
  );
  process.exit(1);
}

const require = createRequire(import.meta.url);
const phoneApi = require(join(root, "financeiro/assets/libphonenumber-max.js"));
const phoneCases = [
  ["BR", "62999999999", "+5562999999999", "+55 62 99999 9999"],
  ["CH", "791234567", "+41791234567", "+41 79 123 45 67"],
];

for (const [country, input, e164, international] of phoneCases) {
  const phone = phoneApi.parsePhoneNumberFromString(input, country);
  if (
    !phone?.isValid() ||
    phone.number !== e164 ||
    phone.formatInternational() !== international
  ) {
    console.error(`Falha na validação de telefone internacional: ${country}.`);
    process.exit(1);
  }
}

console.log(
  `${htmlFiles.length} páginas HTML e ${publishedFiles.length} arquivos publicados verificados.`,
);
