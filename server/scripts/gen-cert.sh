#!/usr/bin/env bash
# 生成本地开发用自签证书（仅供本地 HTTPS 测试，浏览器/客户端会提示不受信任）
# 上云请改用 Let's Encrypt 等正式证书。
set -e
cd "$(dirname "$0")/.."
mkdir -p certs
MSYS_NO_PATHCONV=1 openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout certs/key.pem -out certs/cert.pem -days 365 \
  -subj "/CN=localhost"
echo "✅ 已生成 certs/key.pem 和 certs/cert.pem（自签，仅本地测试用）"
