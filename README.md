# Founder Skill MCP — InstaBox deployment

This repository adapts [Jake Schincariol's Founder Skill](https://github.com/Jakeschincariol/founder-skill) (MIT license) into an authenticated **remote MCP server** for ChatGPT-compatible MCP clients. It does not change the original project.

## What is included

- 11 explicit founder skill tools (board, competitors, consumer, pricing, offer, CFO, marketing, brand, ops, launch and plan).
- Skill discovery, search and retrieval of original reference material.
- Deterministic CFO calculator backed by the original project's Python script.
- Token-authenticated MCP over Streamable HTTP at `/mcp`.
- InstaBox machine creation/reuse and HTTPS port publication through a manually triggered GitHub Actions workflow.

The upstream skill source is fetched at deployment and **pinned** to commit `fd9385b0cfe1b96bebce3898fbd506d73eff5a9d`, rather than executing an unreviewed moving upstream branch.

## Deployment

1. Under **Settings → Secrets and variables → Actions**, add the secret `INSTABOX_API_KEY` (scopes: `machines:read`, `machines:write`, optionally `images:read`).
2. Add `FOUNDER_MCP_TOKEN`: a separate random access token for clients connecting to this MCP server. Use at least 32 cryptographically random bytes (for example `openssl rand -hex 32`). Never commit either secret.
3. Select **Actions → Deploy Founder MCP to InstaBox → Run workflow** on the `main` branch.
4. Check the workflow run summary for the deployed public URL. The MCP endpoint is `https://<your-instabox-url>/mcp` and the health endpoint is `/healthz`.
5. Configure your MCP client to send the HTTP header `Authorization: Bearer <FOUNDER_MCP_TOKEN>`. Whether ChatGPT's custom app UI accepts a static bearer token varies by connection mode; if OAuth is required, add an OAuth gateway instead of exposing the bearer token publicly.

The workflow stores the token in a restrictive machine-local `.env` file; it never outputs it. The InstaBox public URL is publicly reachable, but requests to `/mcp` without the token are rejected. Do not use this server with confidential information until you have evaluated machine security, logging, and authentication requirements.

## Availability

InstaBox machines may idle-suspend by default. This workflow turns **auto-suspend off** and clears the time-based timeout, but InstaBox does not promise permanent uptime. The deployment attempts to launch the service with a restarting systemd unit where available, otherwise runs it as a background process; on systems without systemd, a full machine restart may require rerunning the workflow.

## Local development

Python 3.11+ recommended:

```sh
git clone https://github.com/Jakeschincariol/founder-skill.git upstream-founder-skill
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
export FOUNDER_SKILLS_ROOT="$PWD/upstream-founder-skill/skills"
export FOUNDER_MCP_TOKEN="your-long-random-token"
uvicorn server:app --host 127.0.0.1 --port 8000
```

Test with an MCP Streamable HTTP client at `http://127.0.0.1:8000/mcp` and the same bearer token. `GET /healthz` does not require a token.

## Functional scope and limitations

The eleven tools expose the **original methodology and source material** to an LLM. The MCP server itself does **not** autonomously launch 100 LLM agents, browse competitors, or write a business plan without an LLM client orchestrating those steps. The deterministic `founder_cfo_calculate` tool does perform the upstream numeric computation. The consumer panel's per-buyer LLM calls and other multi-agent activities remain the client agent's responsibility.

## Attribution

Original founder-skill copyright (c) 2026 Jake Schincariol, MIT license. Source and notices are retained in the pinned upstream checkout. This deployment wrapper is separate from the upstream project.
