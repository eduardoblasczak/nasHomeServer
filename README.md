# Self-Hosted Home Server & Personal NAS

> A lightweight, modular 24/7 home server infrastructure converted from a repurposed laptop. Built with Docker, Tailscale VPN, AdGuard Home DNS, Nginx Proxy Manager, and Nextcloud.

English | [Português](#versão-em-português)

---

## Technical Specifications

| Hardware Component | Specification | Operational Role |
| :--- | :--- | :--- |
| **Host Machine** | Acer Aspire E15 | Primary Server Chassis |
| **Processor** | Intel Core i5-5200U (2C/4T @ 2.20 GHz) | Low Power Consumption (~12W Idle) |
| **System Memory** | 4 GB DDR3 RAM | Headless Execution (No Desktop GUI) |
| **Storage Architecture** | Kingston SATA SSD 222 GB | Root OS (`/` 30GB) + Persistent Volume (`/data` 178GB) |
| **Local Display** | Integrated Laptop Panel | Real-Time Hardware Monitoring (`btop` TTY1) |

---

## Infrastructure Stack

| Service | Category | Exposure / Port | Status |
| :--- | :--- | :--- | :--- |
| **Portainer CE** | Container Orchestration | `:9443` | Active |
| **Tailscale** | Mesh VPN / Remote Access | Private Overlay Network | Active |
| **btop** | Physical TTY Hardware Monitor | TTY1 Terminal | Active |
| **AdGuard Home** | DNS Sinkhole & Ad Blocker | `:8080` / `:53` | Active |
| **Nginx Proxy Manager** | Reverse Proxy & SSL Management | `:80` / `:443` / `:81` | Active |
| **Nextcloud Stack** | Cloud Storage (MariaDB + Redis) | `:8085` | Active |
| **Jellyfin** | Media Streaming Server | `:8096` | Planned |
| **Grafana + Prometheus** | System Metrics & Telemetry | `:3000` | Planned |
| **Cloudflare Tunnel** | Zero-Trust Web Publishing | Domain Routing | Planned |

---

## Repository Structure

```text
.
├── README.md                    # Project documentation (English / Portuguese)
├── historicoCompleto.md         # Detailed session-by-session development logs
├── docker/                      # Sanitized Docker Compose templates
│   ├── adguard/
│   │   └── docker-compose.yml
│   ├── nginx-proxy-manager/
│   │   └── docker-compose.yml
│   └── nextcloud/
│       ├── docker-compose.yml
│       └── .env.example
└── scripts/                     # System configuration & setup scripts
    ├── 01-free-port53.sh
    └── 02-setup-btop-tty1.sh
```

---

## Deployment Roadmap

### Phase 1: Core Foundation
- [x] Installation of headless Ubuntu Server 24.04 LTS
- [x] Hardening: SSH, UFW Firewall, Admin privileges
- [x] Deployment of Docker Engine, Docker Compose, and Portainer CE

### Phase 2: Core Services
- [x] Provisioning Tailscale Mesh VPN for encrypted remote administration
- [x] Auto-login TTY1 configuration with `btop` system monitor
- [x] AdGuard Home deployment (resolved port 53 `systemd-resolved` conflict)
- [x] Nginx Proxy Manager setup for reverse proxying
- [x] Nextcloud stack initialization with MariaDB relational database and Redis cache

### Phase 3: Extended Services (In Progress)
- [ ] Jellyfin Media Server deployment
- [ ] Grafana and Prometheus monitoring integration
- [ ] Cloudflare Tunnel provisioning for HTTPS domain routing

---

## Security & Privacy Standards

This repository is sanitized and safe for public distribution:
- Secret management via environment variables (`.env`).
- Excluded persistent data directories, SSL keys, and local credentials via `.gitignore`.
- Anonymized network IP addresses and internal configuration hostnames.

For detailed session logs and implementation history, refer to [historicoCompleto.md](historicoCompleto.md).

---

<a name="versão-em-português"></a>
## Versão em Português

# Servidor Caseiro & NAS Pessoal

> Infraestrutura modular e leve para servidor caseiro 24/7 construída a partir de um notebook reaproveitado. Mantida com Docker, Tailscale VPN, AdGuard Home, Nginx Proxy Manager e Nextcloud.

[English](#self-hosted-home-server--personal-nas) | Português

---

### Especificações Técnicas

| Componente | Especificação | Função Operacional |
| :--- | :--- | :--- |
| **Equipamento** | Acer Aspire E15 | Servidor Principal |
| **Processador** | Intel Core i5-5200U (2C/4T @ 2.20 GHz) | Baixo Consumo Elétrico (~12W Idle) |
| **Memória RAM** | 4 GB DDR3 | Execução Headless (Sem Interface Gráfica) |
| **Armazenamento** | SSD SATA Kingston 222 GB | Sistema (`/` 30GB) + Volume de Dados (`/data` 178GB) |
| **Display Local** | Tela Nativa do Notebook | Monitoramento Físico (`btop` no TTY1) |

---

### Stack de Infraestrutura

| Serviço | Categoria | Porta / Exposição | Status |
| :--- | :--- | :--- | :--- |
| **Portainer CE** | Orquestração de Containers | `:9443` | Ativo |
| **Tailscale** | VPN Mesh / Acesso Remoto | Rede Privada Virtual | Ativo |
| **btop** | Monitor de Hardware Físico | Terminal TTY1 | Ativo |
| **AdGuard Home** | Bloqueador DNS | `:8080` / `:53` | Ativo |
| **Nginx Proxy Manager** | Proxy Reverso e SSL | `:80` / `:443` / `:81` | Ativo |
| **Nextcloud Stack** | Armazenamento (MariaDB + Redis) | `:8085` | Ativo |
| **Jellyfin** | Servidor de Mídia | `:8096` | Planejado |
| **Grafana + Prometheus** | Telemetria e Métricas | `:3000` | Planejado |
| **Cloudflare Tunnel** | Exposição Web Zero-Trust | Roteamento de Domínio | Planejado |

---

### Roteiro de Implantação

#### Fase 1: Base do Sistema
- [x] Instalação do Ubuntu Server 24.04 LTS sem GUI
- [x] Configuração de SSH, Firewall UFW e permissões de administração
- [x] Instalação do Docker Engine, Docker Compose e Portainer CE

#### Fase 2: Serviços Essenciais
- [x] Configuração do Tailscale VPN para administração remota segura
- [x] Autologin na TTY1 com monitoramento de sistema `btop`
- [x] Implantação do AdGuard Home (resolvido conflito da porta 53 do `systemd-resolved`)
- [x] Implantação do Nginx Proxy Manager
- [x] Inicialização do Nextcloud com banco de dados MariaDB e cache Redis em `/data`

#### Fase 3: Serviços Extras (Em Andamento)
- [ ] Implantação do Jellyfin Media Server
- [ ] Integração do Grafana + Prometheus
- [ ] Configuração do Cloudflare Tunnel para HTTPS público

---

### Segurança e Privacidade

Este repositório é higienizado e seguro para publicação:
- Gestão de credenciais através de variáveis de ambiente (`.env`).
- Exclusão de diretórios de dados, chaves SSL e credenciais locais via `.gitignore`.
- Endereços IP e nomes de host internos anonimizados.

Para consultar o registro de bordo detalhado de cada sessão, veja [historicoCompleto.md](historicoCompleto.md).
