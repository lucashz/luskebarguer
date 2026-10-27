#!/bin/bash
curl -s -X POST "http://192.168.1.108:8080/chat/whatsappNumbers/t%C3%A1pronto" \
  -H "apikey: b99ee681a32aafc2cc8376608494974676fd7d19363a60a0d4f6c7a650e9f062" \
  -H "Content-Type: application/json" \
  -d '{"numbers":["5514981822115","5555996079117","5555991788212","5548991059863","5548998153247","5514996159795","5514981353017","5514981488180","551436551101"]}'
echo ""

