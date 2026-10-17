#!/bin/sh
# Builds the Lottie animations with EffectCraft's headless CLI.
#   EFFECTCRAFT_CLI=/path/to/effectcraft-cli sh tools/build_motion_assets.sh
set -e
cd "$(dirname "$0")/.."
CLI="${EFFECTCRAFT_CLI:?set EFFECTCRAFT_CLI to the effectcraft-cli binary}"
for name in loader alert-pulse; do
  cat tools/motion/lib.jsx "tools/motion/$name.jsx" > "design/motion/$name.build.jsx"
  "$CLI" script "design/motion/$name.build.jsx" --empty --save-as "design/motion/$name.ecproj"
  rm "design/motion/$name.build.jsx"
  "$CLI" --project "design/motion/$name.ecproj" exec file.exportLottie \
    --params "{\"comp\":\"$name\",\"path\":\"$PWD/public/assets/$name.json\"}" > /dev/null
  "$CLI" --project "design/motion/$name.ecproj" render-frame --comp "$name" --time 0.5 \
    --out "design/motion/$name-preview.png" > /dev/null
  echo "built public/assets/$name.json"
done
