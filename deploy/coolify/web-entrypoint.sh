#!/bin/sh
set -eu

html=/usr/share/nginx/html/index.html
config=/usr/share/nginx/html/runtime-config.js

cat > "$config" <<'EOF'
window.__VELLUM_CONFIG__ = {
  mode: "remote-gateway",
  disablePlatform: true,
};
EOF

if ! grep -q 'runtime-config.js' "$html"; then
  sed -i \
    's#</head>#  <script src="/runtime-config.js"></script>\n</head>#' \
    "$html"
fi
