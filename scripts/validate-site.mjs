import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
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

for (const htmlFile of htmlFiles) {
  const html = readFileSync(htmlFile, "utf8");
  if (/http-equiv=["']refresh["']|window\.location\.replace\s*\(/i.test(html)) {
    redirectPages.push(htmlFile.replace(`${root}/`, ""));
  }
  if (!html.includes("modal-scroll-lock.js")) {
    pagesWithoutModalScrollLock.push(htmlFile.replace(`${root}/`, ""));
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
    pagesWithoutStandardMetadata.push(htmlFile.replace(`${root}/`, ""));
  }
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
  "jspdf.umd.min.js",
  "styles.css",
  "watermark.png",
  "wordmark.png",
];

const institutionalAssetsRoot = "packages/ui/assets";
const institutionalAssets = ["logo-white.png", "logo.png", "app-icon.png"];
const officeConfigSource = readFileSync("config/office.js", "utf8");
const requiredOfficeConfigFields = [
  "name",
  "shortName",
  "tagline",
  "statementDescriptor",
  "logoWhiteUrl",
  "appIconUrl",
  "baseUrl",
  "origin",
  "repositoryUrl",
];

for (const field of requiredOfficeConfigFields) {
  if (!new RegExp(`\\b${field}\\s*:`).test(officeConfigSource)) {
    console.error(`Campo obrigatório ausente em config/office.js: ${field}.`);
    process.exit(1);
  }
}

for (const asset of institutionalAssets) {
  if (!existsSync(join(institutionalAssetsRoot, asset))) {
    console.error(`Asset institucional compartilhado ausente: ${asset}.`);
    process.exit(1);
  }
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
    "apps/lab/tools/central-guias/index.html",
    /function\s+getPayloadDb\b/,
    "formato antigo da Central de Guias",
  ],
  [
    "apps/lab/tools/central-guias/index.html",
    /(?:github-token|FINANCE_SETTINGS_KEY|DEFAULT_GIST_ID|Authorization[^\n]+state\.token)/,
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
];

for (const [path, pattern, label] of currentSourceChecks) {
  if (pattern.test(readFileSync(path, "utf8"))) {
    console.error(`Compatibilidade obsoleta encontrada em ${path}: ${label}.`);
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
