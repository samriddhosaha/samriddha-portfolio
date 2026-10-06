#!/bin/sh
# usage: tools/lh.sh <url> <outDir> <label>   (needs lighthouse on PATH via npx and CHROME_PATH set)
npx lighthouse "$1" --quiet --chrome-flags="--headless=new --no-sandbox" --only-categories=performance,accessibility,best-practices,seo --output=json --output-path="$2/lh-$3-mobile.json" >/dev/null
npx lighthouse "$1" --quiet --preset=desktop --chrome-flags="--headless=new --no-sandbox" --only-categories=performance,accessibility,best-practices,seo --output=json --output-path="$2/lh-$3-desktop.json" >/dev/null
