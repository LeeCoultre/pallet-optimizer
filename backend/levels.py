"""Physical-level classification — Python mirror of src/utils/auftragHelpers.ts:getLevel.

The frontend parses .docx into pallets[].items[]; level is computed
in-browser from item.title via a title regex (SOP v1.1 Appendix A.6).
For server-side aggregations (Berichte analytics) we need the same
classification without round-tripping every parsed blob through the
client — this module is the SSoT mirror. Patterns and ordering MUST
stay in lockstep with auftragHelpers.ts:getLevel — any drift between
the two means the same Auftrag classifies differently in Pruefen vs
the dashboard, which is the kind of bug nobody notices until a worker
asks "warum sind 50 Rollen verschwunden".

Order is intentional: Tacho/Kürbis/Klebeband/Produktion patterns are
checked BEFORE the öko/veit/thermo defaults because their patterns
are more specific.
"""

from __future__ import annotations

import re
from typing import Any, Optional

# Compiled once at import; case-insensitive everywhere because real-world
# Lagerauftrag titles mix "TACHO", "Tacho", "tacho" freely.
_RE_TACHO      = re.compile(r"\btacho", re.IGNORECASE)
_RE_KERNOL     = re.compile(r"(kürbis|kernöl)", re.IGNORECASE)
_RE_KLEBEBAND  = re.compile(
    r"(klebeband|paketband|packband|absperrband|fragile|bruchgefahr)",
    re.IGNORECASE,
)
_RE_PRODUKTION = re.compile(
    r"(wird (von .* )?produziert|tk\s+thermalking|big\s*bag|silosack|"
    r"sandsack|sandsäcke|sandsaecke|säcke|bauschutt|holzsack|holzwolle|"
    r"füllmaterial)",
    re.IGNORECASE,
)
_RE_OKO        = re.compile(r"öko", re.IGNORECASE)
_RE_VEIT       = re.compile(r"\bveit\b", re.IGNORECASE)

# Legacy parsed Aufträge stored only `category` (pre-v2 ESKU rewrite).
# Frontend's CATEGORY_TO_LEVEL — kept identical so old Historie entries
# still render consistently in analytics.
_CATEGORY_TO_LEVEL: dict[str, int] = {
    "thermorollen":       1,
    "heipa":              1,
    "veit":               2,
    "klebeband":          4,
    "produktion":         5,
    "tachographenrollen": 7,
    "sonstige":           1,
}


def level_from_title(title: Optional[str]) -> int:
    """Pure title-regex classification. Default = 1 (Thermorollen)."""
    if not title:
        return 1
    if _RE_TACHO.search(title):      return 7
    if _RE_KERNOL.search(title):     return 6
    if _RE_KLEBEBAND.search(title):  return 4
    if _RE_PRODUKTION.search(title): return 5
    if _RE_OKO.search(title):        return 3
    if _RE_VEIT.search(title):       return 2
    return 1


def level_of(item: dict[str, Any]) -> int:
    """Mirrors auftragHelpers.ts:getDisplayLevel — prefers explicit
    `level` field (set by the ESKU distributor or future parsers),
    then title regex, then legacy `category` map, then default 1."""
    if not isinstance(item, dict):
        return 1
    lvl = item.get("level")
    if isinstance(lvl, int) and 1 <= lvl <= 7:
        return lvl
    title = item.get("title")
    if isinstance(title, str) and title.strip():
        return level_from_title(title)
    category = item.get("category")
    if isinstance(category, str):
        return _CATEGORY_TO_LEVEL.get(category.lower(), 1)
    return 1


# Number of physical levels in the SOP v1.1 hierarchy — used by callers
# for fixed-width buckets / iteration. Keep in sync with LEVEL_META in
# auftragHelpers.ts.
LEVEL_COUNT = 7
