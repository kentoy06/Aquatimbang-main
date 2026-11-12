import re
from pathlib import Path

from PIL import Image, UnidentifiedImageError

from django.core.exceptions import ValidationError


# Scanned documents can be large; photos are shrunk in the browser
# before upload, so 5 MB is plenty for them.
MAX_DOCUMENT_SIZE = 10 * 1024 * 1024  # 10 MB
MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5 MB

ALLOWED_DOCUMENT_EXTENSIONS = {
    ".pdf", ".jpg", ".jpeg", ".png"
}

ALLOWED_IMAGE_EXTENSIONS = {
    ".jpg", ".jpeg", ".png"
}

def validate_file_contents(file, extension):
    current_position = file.tell()

    try:
        file.seek(0)

        if extension == ".pdf":
            header = file.read(5)

            if header != b"%PDF-":
                raise ValidationError(
                    "The uploaded file is not a valid PDF."
                )

        elif extension in {".jpg", ".jpeg", ".png"}:
            try:
                with Image.open(file) as image:
                    detected_format = image.format
                    image.verify()

                expected_formats = {
                    ".jpg": "JPEG",
                    ".jpeg": "JPEG",
                    ".png": "PNG",
                }

                if detected_format != expected_formats[extension]:
                    raise ValidationError(
                        "The image content does not match its file extension."
                    )

            except (UnidentifiedImageError, OSError, ValueError):
                raise ValidationError(
                    "The uploaded file is not a valid image."
                )

    finally:
        file.seek(current_position)


def validate_document_upload(file):
    if file.size > MAX_DOCUMENT_SIZE:
        raise ValidationError(
            "File size must not exceed 10 MB."
        )

    extension = Path(file.name).suffix.lower()

    if extension not in ALLOWED_DOCUMENT_EXTENSIONS:
        raise ValidationError(
            "Only PDF, JPG, JPEG, and PNG files are allowed."
        )
    validate_file_contents(file, extension)


def validate_image_upload(file):
    if file.size > MAX_IMAGE_SIZE:
        raise ValidationError(
            "File size must not exceed 5 MB."
        )

    extension = Path(file.name).suffix.lower()

    if extension not in ALLOWED_IMAGE_EXTENSIONS:
        raise ValidationError(
            "Only JPG, JPEG, and PNG images are allowed."
        )
    validate_file_contents(file, extension)

def _cap(part, lower_first):
    """Capital first letter; the rest in small letters when lower_first."""
    if lower_first:
        part = part.lower()
    for i, ch in enumerate(part):
        if ch.isalpha():
            return part[:i] + ch.upper() + part[i + 1:]
    return part


def clean_fish_name(raw):
    """
    Tidy a fish name the same way everywhere:

    - single spaces, no spaces around a hyphen ("lapu - lapu" -> "lapu-lapu")
    - a repeated word is joined with a hyphen, as in Cebuano and Filipino
      fish names ("lapu lapu", "lapulapu", "lapu2x" -> "Lapu-Lapu",
      "salay salay" -> "Salay-Salay")
    - every word, and every part after a hyphen, starts with a capital letter
      ("bangus" or "BANGUS" -> "Bangus", "dalagang  bukid" -> "Dalagang Bukid",
      "maya-maya" -> "Maya-Maya")

    A name typed all in small letters or all in capitals gets small letters
    after each capital; a name that already mixes capitals keeps them
    ("LGU Test Fish").
    """
    text = " ".join(str(raw or "").replace("_", " ").split())
    # Text shorthand for a repeated word: "lapu2x", "lapu 2x", "lapu2" -> "lapu-lapu".
    text = re.sub(r"\b([A-Za-z]{2,})\s?(?:2x|x2|2)\b", lambda m: f"{m.group(1)}-{m.group(1)}", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*-\s*", "-", text).strip("-")
    letters = [ch for ch in text if ch.isalpha()]
    one_case = bool(letters) and (all(ch.islower() for ch in letters) or all(ch.isupper() for ch in letters))

    words = []
    for word in text.split(" "):
        # "lapu lapu": the same word twice in a row becomes "lapu-lapu".
        if words and "-" not in words[-1] and word.lower() == words[-1].lower():
            words[-1] = f"{words[-1]}-{word}"
            continue
        # "lapulapu": a word made of the same half twice (at least 4 letters each,
        # so one-word names such as "Sapsap" stay as they are).
        half = len(word) // 2
        if len(word) >= 8 and len(word) % 2 == 0 and word.isalpha() and word[:half].lower() == word[half:].lower():
            word = f"{word[:half]}-{word[half:]}"
        words.append(word)

    tidy = ["-".join(_cap(part, one_case) for part in word.split("-")) for word in words]
    return " ".join(tidy).strip()
