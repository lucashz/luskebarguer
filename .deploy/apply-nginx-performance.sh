#!/usr/bin/env bash
set -euo pipefail

config=/etc/nginx/conf.d/taprontomenu.conf
backup="${config}.bak.performance-$(date +%Y%m%d%H%M%S)"
cp -a "$config" "$backup"

cat > /etc/nginx/conf.d/00-tapronto-performance.conf <<'EOF'
map $http_upgrade $tapronto_connection_upgrade {
    default upgrade;
    ''      '';
}

upstream tapronto_node {
    server 127.0.0.1:3000;
    keepalive 32;
}

gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_comp_level 5;
gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;
EOF

sed -i 's|proxy_pass http://127\.0\.0\.1:3000;|proxy_pass http://tapronto_node;|g' "$config"
sed -i 's|proxy_set_header Connection "upgrade";|proxy_set_header Connection $tapronto_connection_upgrade;|g' "$config"

if ! nginx -t; then
  cp -a "$backup" "$config"
  rm -f /etc/nginx/conf.d/00-tapronto-performance.conf
  nginx -t
  exit 1
fi

systemctl reload nginx
echo "backup=$backup"
