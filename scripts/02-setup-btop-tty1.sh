#!/bin/bash
# Script para configurar autologin na TTY1 e inicialização automática do btop no display do notebook

set -e

echo "Instalando btop..."
sudo apt update && sudo apt install -y btop

echo "Configurando autologin no TTY1 para o usuário atual ($USER)..."
sudo mkdir -p /etc/systemd/system/getty@tty1.service.d/
sudo bash -c 'cat <<EOF > /etc/systemd/system/getty@tty1.service.d/override.conf
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin '"$USER"' --noclear %I \$TERM
EOF'

echo "Adicionando auto-start do btop no ~/.profile..."
cat << 'EOF' >> ~/.profile

# Auto-iniciar o btop apenas se for a tela física do notebook (tty1)
if [ "$(tty)" = "/dev/tty1" ]; then
    exec btop
fi
EOF

echo "Recarregando systemd..."
sudo systemctl daemon-reload
sudo systemctl restart getty@tty1.service

echo "Configuração concluída com sucesso!"
