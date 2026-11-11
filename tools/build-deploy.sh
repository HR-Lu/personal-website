#!/bin/sh
# 生成可直接上传 EdgeOne Pages 的静态目录 deploy/
# 用法：sh tools/build-deploy.sh
set -eu

cd "$(dirname "$0")/.."

rm -rf deploy
mkdir -p deploy/assets

cp index.html deploy/index.html
cp assets/jelly-button.js deploy/assets/jelly-button.js
cp assets/ziwei-ui.js deploy/assets/ziwei-ui.js
cp assets/ziwei.engine.js deploy/assets/ziwei.engine.js

echo "deploy/ 已生成："
find deploy -type f | sort
