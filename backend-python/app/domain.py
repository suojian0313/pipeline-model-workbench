"""纯数据规则：HTTP 请求校验与导入共用日期规则。"""
import re
from datetime import date

from pydantic import BaseModel, ConfigDict, field_validator


def normalize_id(value: str) -> str:
    normalized = re.sub(r"[\s\ufeff]+", "", value)
    return "" if normalized == "-" else normalized


def valid_date(value: object) -> bool:
    if not isinstance(value, str) or not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", value):
        return False
    try:
        date.fromisoformat(value)
        return True
    except ValueError:
        return False


class WeldUpdate(BaseModel):
    # strict 阻止数字、布尔等被悄悄转换；无默认值表示字段不能省略。
    model_config = ConfigDict(strict=True, extra="forbid")
    welded_on: str | None

    @field_validator("welded_on")
    @classmethod
    def calendar_date(cls, value: str | None) -> str | None:
        if value is not None and not valid_date(value):
            raise ValueError("welded_on 必须是有效的 YYYY-MM-DD 日期或 null")
        return value
