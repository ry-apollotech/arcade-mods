import pytest

from agent_link import frontmatter

VALID = '---\ntask_id: "t1"\ntitle: "Spec"\nauthor: "You"\ntarget_agent: "P1"\nstatus: "pending_review"\n---\n# Body\n'


def test_parses_fields_and_defaults_mode_to_auto():
    fields = frontmatter.parse(VALID)
    assert fields["task_id"] == "t1"
    assert fields["mode"] == "auto"


def test_body_returns_content_after_frontmatter():
    assert frontmatter.body(VALID) == "# Body"


def test_build_round_trips():
    fields = frontmatter.parse(VALID)
    assert frontmatter.parse(frontmatter.build(fields, "text")) == fields


@pytest.mark.parametrize(
    "markdown, message",
    [
        ("# no frontmatter", "must start"),
        ('---\ntask_id: "t1"\n', "not closed"),
        ('---\ntask_id: "t1"\n---\n', "missing frontmatter fields"),
        (VALID.replace('status: "pending_review"', 'status: "x"\nmode: "yolo"'), "mode must be"),
        (VALID.replace('title: "Spec"', "no colon here"), "invalid frontmatter line"),
    ],
)
def test_rejects_invalid(markdown, message):
    with pytest.raises(frontmatter.FrontmatterError, match=message):
        frontmatter.parse(markdown)
