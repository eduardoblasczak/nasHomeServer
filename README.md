# 🏠 Home Server & NAS Caseiro

> Transformação de um notebook antigo em um servidor caseiro multifunção 24/7 com Nuvem Pessoal, Bloqueador de Anúncios DNS, Proxy Reverso, VPN Mesh e Painel de Monitoramento Físico.

![Ubuntu](https://img.shields.io/badge/Ubuntu_Server-24.04_LTS-E95420?style=for-the-badge&logo=ubuntu&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-24.0+-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![Tailscale](https://img.shields.io/badge/Tailscale-VPN_Mesh-242424?style=for-the-badge&logo=tailscale&logoColor=white)
![AdGuard](https://img.shields.io/badge/AdGuard_Home-DNS_Blocker-00A968?style=for-the-badge&logo=adguard&logoColor=white)
![Nextcloud](https://img.shields.io/badge/Nextcloud-Nuvem_Pessoal-0082C9?style=for-the-badge&logo=nextcloud&logoColor=white)

---

## 💻 Hardware

| Componente | Especificação | Uso no Servidor |
|---|---|---|
| **Dispositivo** | Acer Aspire E15 | Notebook reaproveitado |
| **Processador** | Intel Core i5-5200U (2 cores / 4 threads, 2.2GHz) | Baixo consumo (~12W idle) |
| **Memória RAM** | 4 GB DDR3 | Otimizado via Docker (sem GUI) |
| **Armazenamento** | SSD SATA Kingston 222 GB | Sistema (`/` 30GB) + Dados (`/data` 178GB) |
| **Display** | Tela nativa do notebook | Monitoramento 24/7 com `btop` em auto-login |

---

## 🧰 Stack de Serviços Implantados

| Serviço | Função | Porta | Status |
|---|---|---|---|
| 🐳 **Portainer CE** | Gerenciamento de Containers Docker | `:9443` | 🟢 Ativo |
| 🛡️ **Tailscale** | VPN Mesh para acesso remoto seguro | `100.x.y.z` | 🟢 Ativo |
| 📊 **`btop`** | Painel de monitoramento no display físico | TTY1 | 🟢 Ativo |
| 🚫 **AdGuard Home** | Bloqueador de anúncios e rastreadores DNS | `:8080` / `:53` | 🟢 Ativo |
| 🌐 **Nginx Proxy Manager** | Proxy Reverso & Certificados SSL | `:81` / `:80` / `:443` | 🟢 Ativo |
| ☁️ **Nextcloud** | Nuvem pessoal (Nextcloud + MariaDB + Redis) | `:8085` | 🟢 Ativo |
| 🎬 **Jellyfin** | Streaming de Mídia | `:8096` | 🟡 Planejado |
| 📈 **Grafana + Prometheus** | Dashboards de Métricas avançadas | `:3000` | 🟡 Planejado |
| 🌍 **Cloudflare Tunnel** | Exposição Web com HTTPS seguro | `--` | 🟡 Planejado |

---

## 📁 Estrutura do Repositório

```text
Projeto_NAS/
├── .gitignore                   # Proteção contra vazamento de credenciais/dados
├── README.md                    # Visão geral do projeto e documentação
├── historicoCompleto.md         # Diário de bordo detalhado de cada sessão
├── docker/                      # Modelos limpos de Docker Compose (sem senhas reais)
│   ├── adguard/
│   │   └── docker-compose.yml
│   ├── nginx-proxy-manager/
│   │   └── docker-compose.yml
│   └── nextcloud/
│       ├── docker-compose.yml
│       └── .env.example
└── scripts/                     # Scripts de automação do servidor
    ├── 01-free-port53.sh
    └── 02-setup-btop-tty1.sh
```

---

## 🗺️ Roteiro de Implantação

### ✅ Fase 1 — Base
- [x] Instalação do Ubuntu Server 24.04 LTS sem GUI
- [x] Configuração de SSH, Firewall (UFW) e Usuário
- [x] Instalação do Docker + Docker Compose + Portainer CE

### ✅ Fase 2 — Serviços Essenciais
- [x] VPN Mesh Tailscale para acesso remoto sem abrir portas
- [x] Dashboard de monitoramento físico `btop` em autologin na TTY1
- [x] AdGuard Home com liberação da porta 53 do `systemd-resolved`
- [x] Nginx Proxy Manager para proxy reverso
- [x] Nextcloud stack (Nextcloud + MariaDB + Redis) armazenado na partição `/data`

### 🟡 Fase 3 — Serviços Extras (Próxima Etapa)
- [ ] Jellyfin Media Server
- [ ] Grafana + Prometheus
- [ ] Cloudflare Tunnel + Domínio público com HTTPS

---

## 🔒 Segurança & Privacidade

Este repositório é público e **higienizado**. Nenhuma senha, chave SSH, IP privado de VPN ou arquivo de dados reais está presente neste código. Para utilizar as composições em seu próprio servidor, copie os arquivos de exemplo em `docker/` e ajuste os arquivos `.env` com suas próprias credenciais seguras.

---

## 📜 Histórico de Desenvolvimento

Para ver o diário de bordo completo com a explicação técnica detalhada de cada sessão, consulte o arquivo [`historicoCompleto.md`](file:///c:/Users/eduar/OneDrive%20-%20Grupo%20Marista/Particular/Projeto_NAS/historicoCompleto.md).
