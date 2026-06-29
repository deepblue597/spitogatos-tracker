"""Photo-based listing assessment via LLM vision — catches things Spitogatos's
own filters can't (renovated bathroom, room spaciousness, natural light) by
looking at the listing's actual photos.

Supports Anthropic, OpenAI, Mistral, and Ollama providers.
"""
import json

import anthropic
import openai

MAX_IMAGES = 8

SCHEMA = {
    "type": "object",
    "properties": {
        "bathroom": {
            "type": "object",
            "properties": {
                "visible_in_photos": {"type": "boolean"},
                "renovated": {"type": "boolean"},
                "spacious": {"type": "boolean"},
                "notes": {"type": "string"},
            },
            "required": ["visible_in_photos", "renovated", "spacious", "notes"],
            "additionalProperties": False,
        },
        "kitchen": {
            "type": "object",
            "properties": {
                "visible_in_photos": {"type": "boolean"},
                "renovated": {"type": "boolean"},
                "spacious": {"type": "boolean"},
                "notes": {"type": "string"},
            },
            "required": ["visible_in_photos", "renovated", "spacious", "notes"],
            "additionalProperties": False,
        },
        "overall_condition": {
            "type": "string",
            "enum": ["newly_renovated", "good", "dated", "needs_renovation", "unclear"],
        },
        "natural_light": {
            "type": "string",
            "enum": ["bright", "moderate", "dim", "unclear"],
        },
        "ai_score": {
            "type": "integer",
            "description": (
                "Overall quality score from 1 (needs major work, cramped, dark) to "
                "10 (excellent — spacious, fully renovated, bright, move-in ready), "
                "based only on visible condition/spaciousness/light, not price."
            ),
        },
        "summary": {
            "type": "string",
            "description": "One or two sentences a renter would find useful, covering anything notable beyond the structured fields.",
        },
    },
    "required": ["bathroom", "kitchen", "overall_condition", "natural_light", "ai_score", "summary"],
    "additionalProperties": False,
}

SCHEMA_INSTRUCTION = """
You MUST respond with a JSON object matching this exact schema (no extra keys, no markdown fencing):
{schema}
""".strip()

DEFAULT_PROMPT = """Listing text (from Spitogatos, Greek rental market):
Title: {title}
Description: {description}

The attached photos are this listing's actual photos. Use both the text and \
the photos — the description sometimes states renovation/condition directly \
(e.g. "ανακαινισμένο" = renovated), which is more reliable than guessing from \
a photo alone. Don't guess about rooms that aren't shown in photos and aren't \
mentioned in the text; set visible_in_photos to false for those instead of \
inferring. Judge "renovated" by visible finishes or explicit text mentions, \
and "spacious" relative to a typical Greek apartment room of that type."""

DEFAULT_MODELS = {
    "anthropic": "claude-sonnet-4-6",
    "openai": "gpt-4o",
    "mistral": "pixtral-large-latest",
    "ollama": "llama3.2-vision",
}


def _build_prompt(listing: dict, custom_prompt: str | None) -> str:
    template = custom_prompt or DEFAULT_PROMPT
    return template.format(
        title=listing.get("title") or "(none)",
        description=listing.get("description") or "(none)",
    )


def _analyze_anthropic(images: list[str], prompt: str, api_key: str, model: str) -> dict:
    content = [
        {"type": "image", "source": {"type": "url", "url": url}}
        for url in images
    ]
    content.append({"type": "text", "text": prompt})

    client = anthropic.Anthropic(api_key=api_key)
    response = client.messages.create(
        model=model,
        max_tokens=1024,
        output_config={
            "format": {"type": "json_schema", "schema": SCHEMA},
        },
        messages=[{"role": "user", "content": content}],
    )

    if response.stop_reason == "refusal":
        raise RuntimeError("Model declined to analyze these photos")

    text = next(b.text for b in response.content if b.type == "text")
    return json.loads(text)


def _analyze_openai_compat(
    images: list[str], prompt: str, api_key: str, model: str,
    base_url: str | None = None,
) -> dict:
    """Works for OpenAI, Mistral (OpenAI-compatible), and Ollama."""
    content: list[dict] = [
        {"type": "image_url", "image_url": {"url": url}}
        for url in images
    ]
    schema_text = SCHEMA_INSTRUCTION.format(schema=json.dumps(SCHEMA, indent=2))
    content.append({"type": "text", "text": f"{prompt}\n\n{schema_text}"})

    kwargs: dict = {}
    if base_url:
        kwargs["base_url"] = base_url

    client = openai.OpenAI(api_key=api_key, **kwargs)

    create_kwargs: dict = dict(
        model=model,
        max_tokens=1024,
        messages=[{"role": "user", "content": content}],
    )
    if not base_url:
        create_kwargs["response_format"] = {
            "type": "json_schema",
            "json_schema": {"name": "listing_analysis", "strict": True, "schema": SCHEMA},
        }
    else:
        create_kwargs["response_format"] = {"type": "json_object"}

    response = client.chat.completions.create(**create_kwargs)

    text = response.choices[0].message.content
    if not text:
        raise RuntimeError("Model returned an empty response")
    return json.loads(text)


def analyze_listing(listing: dict, settings: dict | None = None) -> dict:
    images = listing.get("images") or []
    if not images:
        raise ValueError("No photos available for this listing")

    settings = settings or {}
    provider = settings.get("provider", "anthropic")
    custom_prompt = settings.get("custom_prompt") or None
    model = settings.get("model") or DEFAULT_MODELS.get(provider, "")

    prompt = _build_prompt(listing, custom_prompt)
    image_urls = images[:MAX_IMAGES]

    if provider == "anthropic":
        api_key = settings.get("anthropic_api_key", "")
        result = _analyze_anthropic(image_urls, prompt, api_key, model)
    elif provider == "openai":
        api_key = settings.get("openai_api_key", "")
        result = _analyze_openai_compat(image_urls, prompt, api_key, model)
    elif provider == "mistral":
        api_key = settings.get("mistral_api_key", "")
        result = _analyze_openai_compat(
            image_urls, prompt, api_key, model,
            base_url="https://api.mistral.ai/v1",
        )
    elif provider == "ollama":
        base_url = settings.get("ollama_base_url", "http://localhost:11434/v1")
        result = _analyze_openai_compat(
            image_urls, prompt, "ollama", model,
            base_url=base_url,
        )
    else:
        raise ValueError(f"Unknown provider: {provider}")

    result["ai_score"] = max(1, min(10, int(result.get("ai_score", 5))))
    return result
