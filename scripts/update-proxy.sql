UPDATE "Proxy" SET enabled = true, host = '192.168.1.100', port = '10800', protocol = 'socks5' WHERE id = 'proxy-tapronto-1';
SELECT id, enabled, host, port, protocol FROM "Proxy";
