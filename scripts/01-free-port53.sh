#!/bin/bash
# Script para liberar a porta 53 do systemd-resolved no Ubuntu Server para o AdGuard Home

set -e

echo "Desativando DNSStubListener do systemd-resolved..."
sudo mkdir -p /etc/systemd/resolved.conf.d
sudo bash -c 'cat <<EOF > /etc/systemd/resolved.conf.d/adguardhome.conf
[Resolve]
DNS=1.1.1.1
DNSStubListener=no
EOF'

echo "Atualizando link simbólico do resolv.conf..."
sudo mv /etc/resolv.conf /etc/resolv.conf.backup 2>/dev/null || true
sudo ln -sf /run/systemd/resolve/resolv.conf /etc/resolv.conf

echo "Reiniciando systemd-resolved..."
sudo systemctl reload-or-restart systemd-resolved

echo "Porta 53 liberada com sucesso!"
