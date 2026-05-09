---
name: search-workspace
description: "Search a Notion workspace and synthesize a cited answer. When an agent needs to: (1) Find or search for information across Notion pages and databases, (2) Look up internal terminology, processes, or technical details documented in Notion, (3) Explain what something is or how it works using workspace content, or (4) Combine information from multiple Notion sources with citations."
---

# Search Workspace

## Keywords
search Notion, find page, look up, what is, explain, internal docs, knowledge base, find everything about, search workspace, our docs, internal documentation, find in Notion, ask Notion, query Notion

## Overview

Answer natural-language questions by searching a Notion workspace, fetching the most relevant pages or database rows in full, and synthesizing a cited answer. This skill never writes — it only reads and explains.

**Use this skill when:** Users ask a question whose answer probably lives somewhere in their Notion workspace.

---

## Workflow

1. **Identify search terms** — pull key nouns and distinctive phrases from the question.
2. **Cross-search** — `post-search` with no filter for broad coverage.
3. **Narrow if needed** — re-search with a `page` or `data_source` filter when the result set is dominated by one type.
4. **Fetch detail for the top hits** — `retrieve-a-page` + `get-block-children` for prose pages; `query-data-source` for hits inside a database.
5. **Synthesize** — answer first, supporting detail next, citations always.
6. **Flag gaps and conflicts** — when sources disagree or coverage is thin, say so.

---

## Step 1: Identify search terms

Pull from the question:
- Concepts, system names, internal terms ("Stratus minions", "billing reconciliation").
- Distinctive nouns or acronyms.
- Symptoms or verbs when the question is about an issue or behavior.

Drop filler ("what is", "how does", "our", "the").

**Example:**
- Question: "How does our billing reconciliation handle EU customers?"
- Terms: `billing reconciliation EU customers`

---

## Step 2: Cross-search

Always start broad. One unfiltered call covers both pages and database rows.

```
post-search(query="<terms>")
```

Look at the result types. The next step depends on the mix.

---

## Step 3: Narrow if needed

If the unfiltered result is dominated by one type and you need the other, re-search:

```
post-search(query="<terms>", filter={ "value": "page",        "property": "object" })
post-search(query="<terms>", filter={ "value": "data_source", "property": "object" })
```

If the unfiltered set is empty:
- Try one obvious synonym (`reconciliation` → `recon`, `auth` → `authentication`).
- Try splitting compound terms (`billing reconciliation EU` → just `EU customers`).
- If two retries return nothing, stop and tell the user — do not pretend to have found something.

---

## Step 4: Fetch detail

Pick the top 3–5 candidates. Prioritize:
1. Official-looking pages (titles containing "guide", "doc", "overview", "spec").
2. Recently edited pages (last 90 days are stronger than year-old pages).
3. Pages whose title closely matches the question.

For each prose page:

```
retrieve-a-page(page_id="<id>")
get-block-children(block_id="<id>", page_size=100)
```

For each database hit:

```
retrieve-a-data-source(data_source_id="<id>")
query-data-source(
  data_source_id="<id>",
  filter={ "or": [
    { "property": "<Title column>", "title":     { "contains": "<term>" } },
    { "property": "<Body column>",  "rich_text": { "contains": "<term>" } }
  ]},
  page_size=20
)
```

Stop fetching once you have enough material to answer. Pulling 5 pages is plenty for most questions; pulling 20 is wasted tokens.

---

## Step 5: Synthesize

Structure the answer:

```
**Direct answer (1–3 sentences).**

**Detail.** Organize by topic, not by source. Pull the key facts from each fetched page into a single coherent picture. Quote sparingly — paraphrase and cite.

**Sources.**
- [<Page title>](<Notion URL>) — last edited <when>
- [<Page title>](<Notion URL>) — last edited <when>
- Database row [<Title>](<Notion URL>) — in <Database>
```

Notion URL pattern: `https://www.notion.so/<workspace?>/<page_id_without_dashes>`. The `id` from `retrieve-a-page` (with dashes) → strip dashes → that is the URL slug. If the user's workspace has a custom domain, prefer the URL the page returns directly when available.

---

## Step 6: Flag gaps and conflicts

Always make the limits of the answer visible.

### Sources agree

```
The billing reconciliation runs nightly at 02:00 UTC. The reconciliation engine doc and the on-call runbook both confirm this; the runbook adds that EU customers are batched separately because of VAT requirements.

Sources:
- [Billing Reconciliation Engine](URL)
- [On-call Runbook — Billing](URL)
```

### Sources disagree

```
There is conflicting information on session timeout:
- The "Security Guidelines" page says 30 minutes.
- A bug page from October 2024 reports the actual timeout is 15 minutes due to a load balancer setting that overrides the application config.
- No newer page resolves this. Treat the actual behavior as 15 minutes until confirmed otherwise.

Sources:
- [Security Guidelines](URL)
- [Bug: short session timeout](URL)
```

### Coverage is thin

```
Based on what I found:
- [What we know about the deployment process from the CI/CD doc].

I could not find documented information about:
- Rollback procedures
- Database migration handling

Want me to search again with different terms, or check a specific database?

Sources:
- [CI/CD Guide](URL)
```

---

## Edge Cases

### Restricted pages

If `retrieve-a-page` returns a permission error for a hit that looks promising, surface it: "I see a page titled `<title>` that may have the answer, but my integration does not have access to it. Open it in Notion → ··· → Connections to grant access." Move on with what you can read.

### The user references a specific page

If the question is "What does <page title> say about X?", search for that page first (`post-search(query="<title>", filter={ "value": "page", "property": "object" })`), then `retrieve-a-page` + `get-block-children` rather than running a workspace-wide search.

### Outdated information

Note the page's `last_edited_time` in the citation. If the most authoritative-looking source is more than a year old, say so explicitly — the user can decide whether to trust it.

### Many similar pages

If `post-search` returns 20+ pages with similar titles (e.g., "Notes — 2024-09-15"), do not fetch all of them. Pick the top 3 by recency and ask the user whether to include older notes.

### Database hits without a clear title

Some database rows have title properties that read like "Untitled" or numeric IDs. Fall back to the row's URL and a short summary of its first paragraph (if any) so the citation is useful.

---

## When NOT to use this skill

- **General internet questions** ("What is React?") → use the agent's training knowledge or web search.
- **Writing or updating a Notion page** → use `triage-page`, `capture-tasks-from-meeting-notes`, `spec-to-implementation`, or `generate-status-update`.
- **Finding a single page by exact title** → use `post-search` directly with a tight query, no synthesis needed.
- **Listing every match for a term** → `post-search` is the right primitive; this skill is for synthesized answers, not raw lists.

---

## Quick Reference

**Tools used (notion-mcp-server `operationId`s):**
- `post-search`
- `retrieve-a-page`
- `get-block-children`
- `retrieve-a-data-source`
- `query-data-source`

**Workflow shape:** Identify → Search → Narrow → Fetch → Synthesize → Cite.

**Discipline:**
- Always cite every source with a URL.
- Always flag conflicts between sources explicitly.
- Always say "I could not find X" instead of inventing X.
- Synthesize, do not just list raw search results.
