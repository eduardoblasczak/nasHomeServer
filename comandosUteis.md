# 🛠️ Guia de Comandos Úteis — Servidor NAS (`nas-server`)

Guia rápido de referência com os comandos mais utilizados para administração, manutenção e monitoramento do seu servidor caseiro.

---

## 🐳 1. Docker & Containers

| Objetivo | Comando |
| :--- | :--- |
| **Listar containers ativos** | `docker ps` |
| **Listar TODOS os containers (inclusive parados)** | `docker ps -a` |
| **Ver logs em tempo real de um container** | `docker logs -f <nome-do-container>` |
| **Ver as últimas 100 linhas de log** | `docker logs --tail 100 <nome-do-container>` |
| **Reiniciar um container** | `docker restart <nome-do-container>` |
| **Parar um container** | `docker stop <nome-do-container>` |
| **Iniciar um container parado** | `docker start <nome-do-container>` |
| **Subir uma stack Docker Compose em segundo plano** | `docker compose up -d` |
| **Parar e remover uma stack Docker Compose** | `docker compose down` |
| **Ver consumo de CPU/RAM em tempo real de todos os containers** | `docker stats` |
| **Acessar o terminal (bash/sh) dentro de um container** | `docker exec -it <nome-do-container> bash` |
| **Limpar imagens e containers não utilizados (liberar espaço)** | `docker system prune -a --volumes` |

---

## 📊 2. Monitoramento de Sistema & Hardware

| Objetivo | Comando |
| :--- | :--- |
| **Abrir monitor de recursos avançado (GUI no terminal)** | `btop` *(ou `htop`)* |
| **Ver uso de espaço em disco (partições)** | `df -h` |
| **Ver tamanho ocupado por cada pasta em `/data`** | `sudo du -sh /data/*` |
| **Ver uso de memória RAM** | `free -h` |
| **Ver tempo ligado e carga de processamento** | `uptime` |
| **Ver temperatura da CPU** | `sensors` *(ou `cat /sys/class/thermal/thermal_zone*/temp`)* |
| **Ver informações detalhadas da CPU** | `lscpu` |
| **Ver detalhes do SSD (saúde e espaço)** | `sudo smartctl -a /dev/sda` *(se `smartmontools` instalado)* |

---

## 🌐 3. Rede, Firewall & VPN (Tailscale)

| Objetivo | Comando |
| :--- | :--- |
| **Ver endereços IP locais e interfaces** | `ip a` |
| **Status do Tailscale e dispositivos conectados** | `tailscale status` |
| **Ver o endereço IP do servidor na VPN Tailscale** | `tailscale ip -4` |
| **Ver regras e status do Firewall (UFW)** | `sudo ufw status verbose` |
| **Liberar uma nova porta no Firewall (ex: 8096)** | `sudo ufw allow 8096/tcp` |
| **Ver todas as portas em escuta no servidor** | `sudo ss -tulpn` |
| **Testar se o bloqueador DNS AdGuard está respondendo localmente** | `dig @127.0.0.1 google.com` |
| **Ver logs do Cloudflare Tunnel em tempo real** | `docker logs -f cloudflared` |
| **Reiniciar o container do Cloudflare Tunnel** | `docker restart cloudflared` |

---

## 🧹 4. Manutenção & Atualização do Sistema Ubuntu

| Objetivo | Comando |
| :--- | :--- |
| **Atualizar lista de pacotes e atualizar programas** | `sudo apt update && sudo apt upgrade -y` |
| **Remover pacotes e dependências desnecessárias** | `sudo apt autoremove -y && sudo apt clean` |
| **Reiniciar o servidor** | `sudo reboot` |
| **Desligar o servidor com segurança** | `sudo shutdown -h now` |
| **Ver os últimos logs do sistema operacional** | `sudo journalctl -xe --no-pager | tail -n 100` |
| **Ver logs de reinicialização/boot** | `sudo journalctl -b` |

---

## 📁 5. Diretório de Dados (`/data`) e Permissões

| Objetivo | Comando |
| :--- | :--- |
| **Ir para o diretório de dados principal** | `cd /data` |
| **Listar arquivos e permissões com tamanhos legíveis** | `ls -la` |
| **Garantir que seu usuário tem permissão na pasta `/data`** | `sudo chown -R $USER:$USER /data` |

---

> 💡 **Dica de Ouro:** Para evitar digitar comandos longos, você pode criar apelidos (*aliases*) adicionando linhas no seu `~/.bashrc` do servidor, como por exemplo:
> ```bash
> alias dps='docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"'
> alias dlogs='docker logs -f'
> alias dstats='docker stats'
> ```
