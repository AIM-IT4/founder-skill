"""Authenticated Streamable HTTP MCP adapter for the pinned Founder Skill project.

The upstream SKILL.md files provide methodology for the client LLM; this server
does not claim to execute simulated buyer agents or web research itself.
"""
from __future__ import annotations

import json
import os
import re
import secrets
import subprocess
import sys
import tempfile
from pathlib import Path

from mcp.server.fastmcp import FastMCP
from starlette.responses import JSONResponse

ROOT = Path(os.environ.get("FOUNDER_SKILLS_ROOT", "/data/home/founder-skill-upstream/skills"))
SKILLS = {
    "founder-board": "Evaluate a business idea with three distinct board frameworks and critical risks.",
    "founder-competitors": "Research real direct and indirect competitors and substitutes with verifiable sources.",
    "founder-consumer": "Design and analyse a simulated buyer panel; simulation is not real-world demand.",
    "founder-pricing": "Evaluate customer willingness to pay, price ranges, and margin constraints.",
    "founder-offer": "Design an evidence-based offer, bonuses, guarantees, and objection handling.",
    "founder-cfo": "Build contribution margins, break-even, cash flow, and financial sensitivities.",
    "founder-marketing": "Create positioning, acquisition channels, hooks, and a launch campaign.",
    "founder-brand": "Define brand positioning, voice, name candidates, and visual identity requirements.",
    "founder-ops": "Plan suppliers, staffing, tools, operating procedures, and operational risks.",
    "founder-launch": "Create a low-cost market test, launch sequence, and 30-day follow-through.",
    "founder-plan": "Compile an evidence-based business plan with a numbers-driven verdict.",
}

mcp = FastMCP(
    "founder-skill",
    stateless_http=True,
    json_response=True,
    host="0.0.0.0",
    port=8000,
)


def _skill(name: str) -> Path:
    if name not in SKILLS:
        raise ValueError("Unknown skill: " + name + ". Valid: " + ", ".join(SKILLS))
    path = ROOT / name / "SKILL.md"
    if not path.is_file():
        raise RuntimeError("Skill sources missing; expected " + str(path))
    return path


def _guidance(name: str, business_context: str = "") -> str:
    if len(business_context) > 20000:
        raise ValueError("business_context must be 20,000 characters or fewer")
    methodology = _skill(name).read_text(encoding="utf-8")
    extra = "\n\nBUSINESS CONTEXT PROVIDED BY USER:\n" + business_context if business_context else ""
    return (
        "FOUNDERSHIP METHODOLOGY: " + name + "\n\n"
        + methodology
        + extra
        + "\n\nApply the methodology; distinguish verifiable facts, user inputs, "
          "simulated opinions and estimates. Do not claim external research or "
          "multi-agent execution unless performed by the client."
    )


@mcp.tool()
def list_founder_skills() -> str:
    """List the 11 founder skills and their purposes."""
    return json.dumps(SKILLS, indent=2)


@mcp.tool()
def search_founder_skills(query: str) -> str:
    """Locate useful original skills from a founder/business question."""
    if not query.strip() or len(query) > 1000:
        raise ValueError("Provide a query of 1 to 1000 characters")
    terms = set(re.findall(r"[a-z0-9]+", query.lower()))
    results = []
    for name, description in SKILLS.items():
        text = _skill(name).read_text(encoding="utf-8")
        haystack = (name + " " + description + " " + text).lower()
        score = sum(min(haystack.count(term), 3) for term in terms)
        if score:
            results.append((score, name, description))
    results.sort(key=lambda item: (-item[0], item[1]))
    return json.dumps(
        [{"name": n, "description": d, "relevance": s} for s, n, d in results[:7]],
        indent=2,
    )


@mcp.tool()
def get_founder_skill(skill: str, business_context: str = "") -> str:
    """Read an original founder SKILL.md, optionally framed by your business context."""
    return _guidance(skill, business_context)


@mcp.tool()
def get_founder_reference(skill: str, filename: str) -> str:
    """Read a bundled reference/sample from one skill, such as lenses.md or example.json."""
    base = _skill(skill).parent.resolve()
    allowed = {
        "SKILL.md", "lenses.md", "example.json", "customer.example.json",
        "pitch.example.md", "unit_economics.py", "panel.py", "van_westendorp.py",
        "compile.py",
    }
    if filename not in allowed:
        raise ValueError("Unsupported reference filename")
    selected = (base / filename).resolve()
    if selected.parent != base or not selected.is_file():
        raise ValueError("Reference does not exist within selected skill")
    if selected.stat().st_size > 100_000:
        raise ValueError("Reference exceeds size limit")
    return selected.read_text(encoding="utf-8")


@mcp.tool()
def founder_board(business_context: str) -> str:
    """Board evaluation and decision frameworks for a startup concept."""
    return _guidance("founder-board", business_context)


@mcp.tool()
def founder_competitors(business_context: str) -> str:
    """Competitor research plan requiring real cited sources, no invented competitors."""
    return _guidance("founder-competitors", business_context)


@mcp.tool()
def founder_consumer(business_context: str) -> str:
    """Simulated buyer panel method and cautions; client must run its LLM agents."""
    return _guidance("founder-consumer", business_context)


@mcp.tool()
def founder_pricing(business_context: str) -> str:
    """Pricing strategy and willingness-to-pay assessment framework."""
    return _guidance("founder-pricing", business_context)


@mcp.tool()
def founder_offer(business_context: str) -> str:
    """Offer design framework based on customer objections and value."""
    return _guidance("founder-offer", business_context)


@mcp.tool()
def founder_cfo(business_context: str) -> str:
    """CFO methodology for margins, cash requirements and break-even."""
    return _guidance("founder-cfo", business_context)


@mcp.tool()
def founder_marketing(business_context: str) -> str:
    """Marketing positioning and 30-day acquisition campaign methodology."""
    return _guidance("founder-marketing", business_context)


@mcp.tool()
def founder_brand(business_context: str) -> str:
    """Brand identity, naming checks, messaging and voice methodology."""
    return _guidance("founder-brand", business_context)


@mcp.tool()
def founder_ops(business_context: str) -> str:
    """Operating procedures, supplier diligence, staffing and risk methodology."""
    return _guidance("founder-ops", business_context)


@mcp.tool()
def founder_launch(business_context: str) -> str:
    """Lean test, prelaunch plan, launch run sheet and postlaunch methodology."""
    return _guidance("founder-launch", business_context)


@mcp.tool()
def founder_plan(business_context: str) -> str:
    """Business-plan assembly and evidence-based go/no-go methodology."""
    return _guidance("founder-plan", business_context)


@mcp.tool()
def founder_cfo_calculate(numbers_json: str) -> str:
    """Calculate real financial projections using upstream unit_economics.py and supplied JSON.

    Use the JSON schema from get_founder_reference('founder-cfo', 'example.json').
    No LLM estimates are added, and no numbers are invented.
    """
    if len(numbers_json) > 60000:
        raise ValueError("JSON input is too large")
    try:
        value = json.loads(numbers_json)
    except json.JSONDecodeError as exc:
        raise ValueError("Invalid JSON input") from exc
    if not isinstance(value, dict):
        raise ValueError("Expected a JSON object")
    program = _skill("founder-cfo").parent / "unit_economics.py"
    if not program.is_file():
        raise RuntimeError("Unit economics tool is missing")
    with tempfile.TemporaryDirectory(prefix="founder-cfo-") as directory:
        data = Path(directory) / "numbers.json"
        output = Path(directory) / "cfo.md"
        data.write_text(json.dumps(value), encoding="utf-8")
        proc = subprocess.run(
            [sys.executable, str(program), str(data), "--out", str(output)],
            cwd=directory,
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        if proc.returncode:
            return "CFO calculation rejected the input:\n" + (proc.stderr or proc.stdout)[-3500:]
        if output.is_file():
            return output.read_text(encoding="utf-8")[:100000]
        return proc.stdout[:100000]


class AuthenticatedApp:
    """Verify bearer auth before forwarding HTTP requests to the MCP ASGI app."""

    def __init__(self, downstream):
        self.downstream = downstream

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.downstream(scope, receive, send)
            return
        if scope["path"] == "/healthz":
            is_ready = all((ROOT / name / "SKILL.md").is_file() for name in SKILLS)
            reply = JSONResponse(
                {"status": "ok" if is_ready else "missing_skills", "skills": len(SKILLS)},
                status_code=200 if is_ready else 503,
            )
            await reply(scope, receive, send)
            return
        expected = os.environ.get("FOUNDER_MCP_TOKEN", "")
        if len(expected) < 32:
            await JSONResponse({"error": "MCP token is not configured"}, status_code=503)(
                scope, receive, send
            )
            return
        headers = dict(scope.get("headers", []))
        provided = headers.get(b"authorization", b"").decode("utf-8", "replace")
        if not secrets.compare_digest(provided, "Bearer " + expected):
            await JSONResponse({"error": "Unauthorized"}, status_code=401)(
                scope, receive, send
            )
            return
        await self.downstream(scope, receive, send)


app = AuthenticatedApp(mcp.streamable_http_app())
