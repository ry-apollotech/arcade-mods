"""Parse and build the flat `key: "value"` frontmatter used by task files."""

REQUIRED_FIELDS = ("task_id", "title", "author", "target_agent", "status")
VALID_MODES = ("auto", "collab")
DEFAULT_MODE = "auto"


class FrontmatterError(ValueError):
    pass


def parse(markdown: str) -> dict:
    """Return the frontmatter fields, with `mode` defaulted and validated."""
    lines = markdown.splitlines()
    if not lines or lines[0].strip() != "---":
        raise FrontmatterError("file must start with a '---' frontmatter block")
    closing = next((i for i, line in enumerate(lines[1:], 1) if line.strip() == "---"), None)
    if closing is None:
        raise FrontmatterError("frontmatter block is not closed with '---'")

    fields = {}
    for line in lines[1:closing]:
        if not line.strip():
            continue
        key, sep, value = line.partition(":")
        if not sep or not key.strip():
            raise FrontmatterError(f"invalid frontmatter line: {line!r}")
        fields[key.strip()] = value.strip().strip('"').strip("'")

    missing = [name for name in REQUIRED_FIELDS if not fields.get(name)]
    if missing:
        raise FrontmatterError(f"missing frontmatter fields: {', '.join(missing)}")

    mode = fields.get("mode") or DEFAULT_MODE
    if mode not in VALID_MODES:
        raise FrontmatterError(f"mode must be one of {', '.join(VALID_MODES)}")
    return {**fields, "mode": mode}


def body(markdown: str) -> str:
    """Return the markdown after the frontmatter block."""
    lines = markdown.splitlines()
    closing = next(i for i, line in enumerate(lines[1:], 1) if line.strip() == "---")
    return "\n".join(lines[closing + 1:]).lstrip("\n")


def build(fields: dict, content: str) -> str:
    header = "\n".join(f'{key}: "{value}"' for key, value in fields.items())
    return f"---\n{header}\n---\n\n{content.strip()}\n"
