#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SITE_DIR="$ROOT_DIR/_site"

rm -rf "$SITE_DIR"

mkdir -p "$SITE_DIR/documentos/assets"
mkdir -p "$SITE_DIR/arquivos/assets"
mkdir -p "$SITE_DIR/configuracoes"
mkdir -p "$SITE_DIR/calculos"
mkdir -p "$SITE_DIR/financeiro"
mkdir -p "$SITE_DIR/lab/assets"
mkdir -p "$SITE_DIR/validador-projudi"
mkdir -p "$SITE_DIR/assets"

copy_static_app() {
  local source="$1"
  local destination="$2"
  cp "$source/"*.html "$destination/"
  if [[ -d "$source/assets" ]]; then
    cp -R "$source/assets" "$destination/assets"
  fi
}

cp "$ROOT_DIR/apps/portal/index.html" "$SITE_DIR/index.html"
cp -R "$ROOT_DIR/packages/ui/assets/." "$SITE_DIR/assets/"
cp -R "$ROOT_DIR/apps/portal/assets/." "$SITE_DIR/assets/"
cp "$ROOT_DIR/config/office.js" "$SITE_DIR/assets/office-config.js"
mkdir -p "$SITE_DIR/assets/document-templates/pdf"
cp "$ROOT_DIR/config/document-templates/modelo-institucional.docx.base64" "$SITE_DIR/assets/document-templates/modelo-institucional.docx.base64"
cp "$ROOT_DIR/config/document-templates/pdf/"*.png "$SITE_DIR/assets/document-templates/pdf/"
cp "$ROOT_DIR/packages/ui/office-context.js" "$SITE_DIR/assets/office-context.js"
cp "$ROOT_DIR/apps/financeiro/assets/fontawesome-7.3.0.min.js" "$SITE_DIR/assets/fontawesome-7.3.0.min.js"

copy_static_app "$ROOT_DIR/apps/configuracoes" "$SITE_DIR/configuracoes"
cp "$ROOT_DIR/apps/calculos/index.html" "$SITE_DIR/calculos/index.html"
cp -R "$ROOT_DIR/apps/calculos/assets" "$SITE_DIR/calculos/assets"
mkdir -p "$SITE_DIR/calculos/generalista"
cp -R "$ROOT_DIR/apps/calculos/generalista/assets" "$SITE_DIR/calculos/generalista/assets"

for source in "$ROOT_DIR/apps/calculos/"*; do
  module="$(basename "$source")"
  if [[ "$module" == "assets" || ! -f "$source/index.html" ]]; then
    continue
  fi
  mkdir -p "$SITE_DIR/calculos/$module"
  copy_static_app "$source" "$SITE_DIR/calculos/$module"
done

cp "$ROOT_DIR/apps/lab/index.html" "$SITE_DIR/lab/index.html"
cp -R "$ROOT_DIR/apps/lab/assets/." "$SITE_DIR/lab/assets/"

for source in "$ROOT_DIR/apps/lab/tools/"*; do
  tool="$(basename "$source")"
  if [[ ! -f "$source/index.html" ]]; then
    continue
  fi
  mkdir -p "$SITE_DIR/lab/$tool/assets"
  cp "$source/index.html" "$SITE_DIR/lab/$tool/index.html"
  if [[ -d "$source/assets" ]]; then
    cp -R "$source/assets/." "$SITE_DIR/lab/$tool/assets/"
  fi
done

RANUTS_EDITOR_SOURCE="$ROOT_DIR/third_party/ranuts-document"
RANUTS_EDITOR_BASE="fcaa66eb92d1759c1ec695f668e7adf2e4c8150b"
RANUTS_EDITOR_PATCH="$ROOT_DIR/third_party/ranuts-document.patch"
RANUTS_PATCH_APPLIED=0
if [[ ! -d "$RANUTS_EDITOR_SOURCE" ]]; then
  echo "Submódulo ranuts/document ausente; inicialize os submódulos antes de montar o site." >&2
  exit 1
fi
if [[ "$(git -C "$RANUTS_EDITOR_SOURCE" rev-parse HEAD)" != "$RANUTS_EDITOR_BASE" ]]; then
  echo "O submódulo ranuts/document precisa estar em $RANUTS_EDITOR_BASE." >&2
  exit 1
fi
if [[ ! -f "$RANUTS_EDITOR_PATCH" ]]; then
  echo "Patch local do editor Office ausente: $RANUTS_EDITOR_PATCH" >&2
  exit 1
fi
if git -C "$RANUTS_EDITOR_SOURCE" apply --check "$RANUTS_EDITOR_PATCH" >/dev/null 2>&1; then
  git -C "$RANUTS_EDITOR_SOURCE" apply "$RANUTS_EDITOR_PATCH"
  RANUTS_PATCH_APPLIED=1
elif ! git -C "$RANUTS_EDITOR_SOURCE" apply --reverse --check "$RANUTS_EDITOR_PATCH" >/dev/null 2>&1; then
  echo "Não foi possível aplicar o patch local do editor Office." >&2
  exit 1
fi
cleanup_ranuts_editor() {
  if [[ "$RANUTS_PATCH_APPLIED" == "1" ]]; then
    git -C "$RANUTS_EDITOR_SOURCE" apply --reverse "$RANUTS_EDITOR_PATCH" >/dev/null 2>&1 || true
  fi
}
trap cleanup_ranuts_editor EXIT
if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm é necessário para construir o editor Office local." >&2
  exit 1
fi
pnpm --dir "$RANUTS_EDITOR_SOURCE" install --frozen-lockfile
pnpm --dir "$RANUTS_EDITOR_SOURCE/packages/shared" run build
pnpm --dir "$RANUTS_EDITOR_SOURCE" run build
if [[ ! -f "$RANUTS_EDITOR_SOURCE/dist/index.html" ]]; then
  echo "O build do editor ranuts/document não gerou dist/index.html." >&2
  exit 1
fi
mkdir -p "$SITE_DIR/arquivos/editor"
cp -R "$RANUTS_EDITOR_SOURCE/dist/." "$SITE_DIR/arquivos/editor/"
cp "$RANUTS_EDITOR_SOURCE/LICENSE" "$SITE_DIR/arquivos/editor/AGPL-3.0.LICENSE"

FFLATE_SOURCE="$ROOT_DIR/node_modules/fflate/esm/browser.js"
if [[ ! -f "$FFLATE_SOURCE" ]]; then
  echo "A dependência fflate está ausente; execute npm ci antes de montar o site." >&2
  exit 1
fi
mkdir -p "$SITE_DIR/arquivos/assets/engine"
cp "$FFLATE_SOURCE" "$SITE_DIR/arquivos/assets/engine/fflate.js"
cp "$ROOT_DIR/node_modules/fflate/LICENSE" "$SITE_DIR/arquivos/assets/engine/fflate.LICENSE"

cp "$ROOT_DIR/apps/arquivos/index.html" "$SITE_DIR/arquivos/index.html"
cp -R "$ROOT_DIR/apps/arquivos/assets/." "$SITE_DIR/arquivos/assets/"
cp -R "$ROOT_DIR/apps/documentos/assets/." "$SITE_DIR/documentos/assets/"
cp "$ROOT_DIR/config/document-config.js" "$SITE_DIR/documentos/assets/document-config.js"

for source in "$ROOT_DIR/apps/documentos/"*; do
  module="$(basename "$source")"
  if [[ "$module" == "assets" || ! -f "$source/index.html" ]]; then
    continue
  fi
  mkdir -p "$SITE_DIR/documentos/$module"
  copy_static_app "$source" "$SITE_DIR/documentos/$module"
done
copy_static_app "$ROOT_DIR/apps/validador-projudi" "$SITE_DIR/validador-projudi"

cp "$ROOT_DIR/apps/financeiro/"*.html "$SITE_DIR/financeiro/"
cp -R "$ROOT_DIR/apps/financeiro/assets" "$SITE_DIR/financeiro/assets"
cp "$ROOT_DIR/packages/ui/help.css" "$SITE_DIR/configuracoes/assets/help.css"
cp "$ROOT_DIR/packages/ui/help.css" "$SITE_DIR/financeiro/assets/help.css"
cp "$ROOT_DIR/apps/financeiro/assets/fontawesome-7.3.0.min.js" "$SITE_DIR/configuracoes/assets/fontawesome-7.3.0.min.js"

inject_shared_ui() {
  local assets="$1"
  cp "$ROOT_DIR/packages/ui/app-switcher.js" "$assets/app-switcher.js"
  cp "$ROOT_DIR/packages/ui/site-header.css" "$assets/site-header.css"
  cp "$ROOT_DIR/packages/ui/cloud-status.js" "$assets/cloud-status.js"
  cp "$ROOT_DIR/packages/ui/gist-settings.js" "$assets/gist-settings.js"
  cp "$ROOT_DIR/packages/ui/gist-client.js" "$assets/gist-client.js"
  cp "$ROOT_DIR/packages/ui/gist-access-lease.js" "$assets/gist-access-lease.js"
  cp "$ROOT_DIR/packages/ui/local-access-blocked.js" "$assets/local-access-blocked.js"
  cp "$ROOT_DIR/packages/ui/local-access-blocked.css" "$assets/local-access-blocked.css"
  cp "$ROOT_DIR/packages/ui/modal-scroll-lock.js" "$assets/modal-scroll-lock.js"
  cp "$ROOT_DIR/packages/ui/site-footer.js" "$assets/site-footer.js"
}

for assets in \
  "$SITE_DIR/assets" \
  "$SITE_DIR/configuracoes/assets" \
  "$SITE_DIR/calculos/assets" \
  "$SITE_DIR/documentos/assets" \
  "$SITE_DIR/arquivos/assets" \
  "$SITE_DIR/financeiro/assets" \
  "$SITE_DIR/lab/assets" \
  "$SITE_DIR/validador-projudi/assets"
do
  inject_shared_ui "$assets"
done

for assets in "$SITE_DIR/lab/"*/assets; do
  if [[ -d "$assets" ]]; then
    inject_shared_ui "$assets"
  fi
done

cp "$ROOT_DIR/apps/financeiro/assets/fontawesome-7.3.0.min.js" "$SITE_DIR/lab/central-guias/assets/fontawesome-7.3.0.min.js"

touch "$SITE_DIR/.nojekyll"
