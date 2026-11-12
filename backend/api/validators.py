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

def clean_fish_name(raw):
    """
    Tidy a fish name the same way everywhere: single spaces, and each word
    starts with a capital letter. A name typed all in small letters or all in
    capitals is turned into normal capitals ("bangus" or "BANGUS" -> "Bangus",
    "dalagang  bukid" -> "Dalagang Bukid", "lapu-lapu" -> "Lapu-lapu"); a name
    that already mixes capitals keeps them ("LGU Test Fish").
    """
    text = " ".join(str(raw or "").split())
    letters = [ch for ch in text if ch.isalpha()]
    one_case = letters and (all(ch.islower() for ch in letters) or all(ch.isupper() for ch in letters))
    tidy = []
    for word in text.split(" "):
        word = word.lower() if one_case else word
        for i, ch in enumerate(word):
            if ch.isalpha():
                word = word[:i] + ch.upper() + word[i + 1:]
                break
        tidy.append(word)
    return " ".join(tidy).strip()
