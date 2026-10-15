"""Explainable controlled classification for Nanjing duck restaurant candidates."""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass
from typing import Literal

from .api_models import DuckType


SUPPORTED_DUCK_TYPES: tuple[DuckType, ...] = (
    "salted_duck",
    "duck_blood_soup",
    "roast_duck",
    "pressed_duck",
    "nanjing_cuisine",
)

# Stage 2 will use only these terms for provider searches. They are deliberately
# separate from the matching rules so an upstream query cannot become a rule.
DUCK_SEARCH_KEYWORDS: tuple[str, ...] = (
    "盐水鸭",
    "鸭血粉丝汤",
    "金陵烤鸭",
    "板鸭",
    "南京特色菜",
    "南京大牌档",
)

ClassificationRejection = Literal["non_restaurant_category", "no_supported_rule"]


@dataclass(frozen=True)
class DuckRuleMatch:
    """One auditable rule match retained for internal tests and verification."""

    rule_id: str
    duck_type: DuckType
    source_field: Literal["name", "category"]
    matched_term: str


@dataclass(frozen=True)
class DuckClassification:
    """Deterministic classification result without public contract expansion."""

    duck_types: tuple[DuckType, ...]
    matches: tuple[DuckRuleMatch, ...]
    rejection_reason: ClassificationRejection | None = None

    @property
    def matched_rule_ids(self) -> tuple[str, ...]:
        return tuple(dict.fromkeys(match.rule_id for match in self.matches))


@dataclass(frozen=True)
class DuckClassificationRule:
    rule_id: str
    duck_type: DuckType
    terms: tuple[str, ...]
    excluded_terms: tuple[str, ...] = ()


DUCK_CLASSIFICATION_RULES: tuple[DuckClassificationRule, ...] = (
    DuckClassificationRule(
        rule_id="salted_duck_explicit",
        duck_type="salted_duck",
        terms=("盐水鸭",),
    ),
    DuckClassificationRule(
        rule_id="duck_blood_soup_explicit",
        duck_type="duck_blood_soup",
        terms=("鸭血粉丝汤", "鸭血粉丝"),
    ),
    DuckClassificationRule(
        rule_id="nanjing_roast_duck_explicit",
        duck_type="roast_duck",
        terms=("南京烤鸭", "金陵烤鸭"),
    ),
    DuckClassificationRule(
        rule_id="pressed_duck_explicit",
        duck_type="pressed_duck",
        terms=("南京板鸭", "金陵板鸭", "板鸭"),
    ),
    DuckClassificationRule(
        rule_id="nanjing_cuisine_explicit",
        duck_type="nanjing_cuisine",
        terms=("南京特色菜", "南京菜馆", "南京菜", "金陵菜馆", "金陵菜"),
        excluded_terms=("南京菜鸟", "南京菜市场", "金陵菜市场"),
    ),
    DuckClassificationRule(
        rule_id="nanjing_dapaidang_explicit",
        duck_type="nanjing_cuisine",
        terms=("南京大牌档",),
    ),
)

_FOOD_CATEGORY_HINTS = (
    "餐饮",
    "餐厅",
    "中餐",
    "小吃",
    "快餐",
    "粉面",
)
_NON_FOOD_CATEGORY_HINTS = (
    "风景名胜",
    "科教文化",
    "博物馆",
    "购物服务",
    "生活服务",
    "商务住宅",
    "公司企业",
    "政府机构",
    "交通设施",
    "地名地址",
)


def normalize_classification_text(value: str | None) -> str:
    """Normalize width, case, whitespace, and punctuation before rule matching."""

    if not isinstance(value, str):
        return ""
    normalized = unicodedata.normalize("NFKC", value).casefold()
    return "".join(character for character in normalized if character.isalnum())


def _is_explicitly_non_restaurant(category: str) -> bool:
    if not category:
        return False
    if any(hint in category for hint in _FOOD_CATEGORY_HINTS):
        return False
    return any(hint in category for hint in _NON_FOOD_CATEGORY_HINTS)


def classify_duck_restaurant(
    *, name: str | None, category: str | None
) -> DuckClassification:
    """Classify only explicit supported evidence from a POI name or category."""

    normalized_fields: tuple[tuple[Literal["name", "category"], str], ...] = (
        ("name", normalize_classification_text(name)),
        ("category", normalize_classification_text(category)),
    )
    normalized_category = normalized_fields[1][1]
    if _is_explicitly_non_restaurant(normalized_category):
        return DuckClassification(
            duck_types=(),
            matches=(),
            rejection_reason="non_restaurant_category",
        )

    matches: list[DuckRuleMatch] = []
    for rule in DUCK_CLASSIFICATION_RULES:
        normalized_exclusions = tuple(
            normalize_classification_text(term) for term in rule.excluded_terms
        )
        normalized_terms = tuple(
            (term, normalize_classification_text(term)) for term in rule.terms
        )
        for source_field, evidence in normalized_fields:
            if not evidence or any(term in evidence for term in normalized_exclusions):
                continue
            matched_term = next(
                (original for original, term in normalized_terms if term in evidence),
                None,
            )
            if matched_term is not None:
                matches.append(
                    DuckRuleMatch(
                        rule_id=rule.rule_id,
                        duck_type=rule.duck_type,
                        source_field=source_field,
                        matched_term=matched_term,
                    )
                )
                break

    matched_types = {match.duck_type for match in matches}
    duck_types = tuple(
        duck_type for duck_type in SUPPORTED_DUCK_TYPES if duck_type in matched_types
    )
    return DuckClassification(
        duck_types=duck_types,
        matches=tuple(matches),
        rejection_reason=None if duck_types else "no_supported_rule",
    )
