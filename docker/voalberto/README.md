# Livraria Vô Alberto — `voalberto.com.br`

Site da Livraria e Papelaria Vô Alberto (Itapiranga, SC): página estática em
React, pré-renderizada no build e servida por nginx. Não tem backend nem
banco de dados — todo contato vai para o WhatsApp da loja.

Como o Draft, este serviço **não** tem `docker-compose.yml` aqui: a stack
precisa do código-fonte como contexto de build, então vive no repositório da
aplicação. Este arquivo documenta só como ele se encaixa na infraestrutura.

- Repositório: `Livraria_Particular`, pasta `site-v2/`, arquivo `docker-compose.prod.yml`
- Guia de implantação: `site-v2/DEPLOY.md`
- Caminho no servidor: `/data/voalberto`

---

## Integração com a infraestrutura

| Item | Valor |
| :--- | :--- |
| Porta local | `8093` (container `voalberto-site`, porta interna 8080) |
| Exposição | Cloudflare Tunnel → `HTTP 172.17.0.1:8093` |
| Hostname | `voalberto.com.br` e `www.voalberto.com.br` (www redireciona) |
| Endereço de hoje | `https://ebls.com.br/voalberto`, até o dono trocar os nameservers. No túnel, a regra de caminho `^/voalberto` precisa vir antes da regra geral do `ebls.com.br`: a primeira que casa vence |
| DNS | Domínio no Registro.br, com nameservers apontando para a Cloudflare |
| Imagem | `voalberto-site:latest` (`nginxinc/nginx-unprivileged`, sem root) |
| Volumes | Nenhum — o site inteiro está dentro da imagem |
| Hardening | `read_only`, `cap_drop: ALL`, `no-new-privileges`, `mem_limit: 64m` |

## Impacto no orçamento de RAM

Desprezível: cerca de 15 MB medidos em teste local. Não há processo além do
nginx servindo arquivos.

## Atualização

A imagem é gerada no computador (Docker do WSL) e enviada pronta com
`docker save` / `docker load`, para o servidor não depender da rede WiFi
para baixar pacotes do npm. Passo a passo em `site-v2/DEPLOY.md`.
