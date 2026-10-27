#!/bin/bash
set -euo pipefail

cat << 'EOF' > /etc/systemd/system/tapronto-outreach.service
[Unit]
Description=TáPronto automated outreach worker
Requires=tapronto-outreach-tunnel.service
Requires=docker.service
After=network-online.target docker.service tapronto-outreach-tunnel.service

[Service]
Type=simple
WorkingDirectory=/opt/tapronto-outreach
EnvironmentFile=/opt/tapronto-outreach/.env
ExecStartPre=-/usr/bin/docker rm -f tapronto-outreach-worker
ExecStartPre=/usr/bin/docker image inspect tapronto/outreach-worker:2026-10-15
ExecStart=/usr/bin/docker run --rm --name tapronto-outreach-worker --network bridge --add-host host.docker.internal:host-gateway --env-file /opt/tapronto-outreach/.env --init --read-only --tmpfs /tmp:size=256m,mode=1777 --mount type=volume,source=tapronto_outreach_artifacts,target=/app/artifacts/outreach/automated -v /opt/tapronto-outreach/src/lib/outreach-delivery.js:/app/src/lib/outreach-delivery.js:ro --cap-drop ALL --security-opt no-new-privileges tapronto/outreach-worker:2026-10-15
ExecStop=-/usr/bin/docker stop --time 20 tapronto-outreach-worker
Restart=on-failure
RestartSec=15
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl restart tapronto-outreach.service
echo "Service updated and restarted successfully!"

