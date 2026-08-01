#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SITE_DIR="$ROOT_DIR/_site"

rm -rf "$SITE_DIR"

mkdir -p "$SITE_DIR/documentos/assets"
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
  cp -R "$source/assets" "$destination/assets"
}

cp "$ROOT_DIR/apps/portal/index.html" "$SITE_DIR/index.html"
cp -R "$ROOT_DIR/packages/ui/assets/." "$SITE_DIR/assets/"
cp -R "$ROOT_DIR/apps/portal/assets/." "$SITE_DIR/assets/"
cp "$ROOT_DIR/config/office.js" "$SITE_DIR/assets/office-config.js"
cp "$ROOT_DIR/packages/ui/office-context.js" "$SITE_DIR/assets/office-context.js"
cp "$ROOT_DIR/apps/financeiro/assets/fontawesome-7.3.0.min.js" "$SITE_DIR/assets/fontawesome-7.3.0.min.js"

copy_static_app "$ROOT_DIR/apps/configuracoes" "$SITE_DIR/configuracoes"
cp "$ROOT_DIR/apps/calculos/index.html" "$SITE_DIR/calculos/index.html"
cp -R "$ROOT_DIR/apps/calculos/assets" "$SITE_DIR/calculos/assets"

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

cp -R "$ROOT_DIR/apps/documentos/assets/." "$SITE_DIR/documentos/assets/"

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
  cp "$ROOT_DIR/packages/ui/gist-settings.js" "$assets/gist-settings.js"
  cp "$ROOT_DIR/packages/ui/gist-client.js" "$assets/gist-client.js"
  cp "$ROOT_DIR/packages/ui/modal-scroll-lock.js" "$assets/modal-scroll-lock.js"
  cp "$ROOT_DIR/packages/ui/site-footer.js" "$assets/site-footer.js"
}

for assets in \
  "$SITE_DIR/assets" \
  "$SITE_DIR/configuracoes/assets" \
  "$SITE_DIR/calculos/assets" \
  "$SITE_DIR/documentos/assets" \
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
