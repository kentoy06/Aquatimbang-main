"""
Add a starter list of fish commonly sold in Philippine (Cebu) markets:

    python manage.py load_fish_species

Fish already in AquaTimbang (same name, any capitalisation) are skipped;
only a blank scientific name or description is filled in. Nothing is
deleted or renamed. Check the local names with DVFM / BFAR and edit them
in Fish Species if your markets use different ones.

Photos in api/fish_photos/ (named after the fish, e.g. bangus.jpg or
lapu-lapu.jpg) are attached to fish that have no photo yet. Add
--replace-photos to replace photos that are already there.
"""
from pathlib import Path

from django.core.files import File
from django.core.management.base import BaseCommand
from django.db import transaction

from api.models import FishSpecies

PHOTO_DIR = Path(__file__).resolve().parents[2] / "fish_photos"
PHOTO_TYPES = {".jpg", ".jpeg", ".png"}


def simple(name):
    """'Lapu-lapu', 'lapu_lapu' and 'LAPULAPU' all become 'lapulapu'."""
    return "".join(ch for ch in name.lower() if ch.isalnum())

# (name, scientific name, description)
STARTER_SPECIES = [
    ("Galunggong", "Decapterus macrosoma", "Round scad. Bisaya: Budloy."),
    ("Bangus", "Chanos chanos", "Milkfish."),
    ("Tilapia", "Oreochromis niloticus", "Nile tilapia (freshwater)."),
    ("Tulingan", "Auxis thazard", "Frigate tuna."),
    ("Alumahan", "Rastrelliger kanagurta", "Indian mackerel. Bisaya: Anduhaw."),
    ("Hasa-Hasa", "Rastrelliger brachysoma", "Short mackerel."),
    ("Tamban", "Sardinella lemuru", "Bali sardinella."),
    ("Matambaka", "Selar crumenophthalmus", "Bigeye scad."),
    ("Salay-Salay", "Selaroides leptolepis", "Yellowstripe scad."),
    ("Dilis", "Stolephorus spp.", "Anchovy. Bisaya: Bolinaw."),
    ("Lapu-Lapu", "Epinephelus spp.", "Grouper. Bisaya: Pugapo."),
    ("Maya-Maya", "Lutjanus spp.", "Snapper."),
    ("Tambakol", "Thunnus albacares", "Yellowfin tuna. Bisaya: Bariles."),
    ("Tanigue", "Scomberomorus commerson", "Narrow-barred Spanish mackerel. Bisaya: Tangigue."),
    ("Danggit", "Siganus spp.", "Rabbitfish."),
    ("Dalagang Bukid", "Caesio cuning", "Redbelly yellowtail fusilier."),
    ("Sapsap", "Leiognathus spp.", "Ponyfish / slipmouth."),
    ("Talakitok", "Caranx spp.", "Trevally."),
    ("Bisugo", "Nemipterus spp.", "Threadfin bream."),
    ("Pampano", "Trachinotus blochii", "Snubnose pompano."),
    ("Espada", "Trichiurus lepturus", "Largehead hairtail."),
    ("Hito", "Clarias batrachus", "Walking catfish (freshwater)."),
    ("Dalag", "Channa striata", "Striped snakehead / mudfish (freshwater)."),
]


class Command(BaseCommand):
    help = "Add a starter list of common Philippine market fish and their photos (skips what is already there)."

    def add_arguments(self, parser):
        parser.add_argument("--replace-photos", action="store_true", help="Replace photos that are already set.")

    @transaction.atomic
    def handle(self, *args, **options):
        existing = {fish.name.strip().lower(): fish for fish in FishSpecies.objects.all()}
        added, filled, skipped = [], [], []
        for name, scientific, description in STARTER_SPECIES:
            fish = existing.get(name.lower())
            if fish is None:
                FishSpecies.objects.create(name=name, scientific_name=scientific, description=description)
                added.append(name)
                continue
            changes = []
            if not fish.scientific_name.strip():
                fish.scientific_name = scientific
                changes.append("scientific_name")
            if not fish.description.strip():
                fish.description = description
                changes.append("description")
            if changes:
                fish.save(update_fields=changes + ["updated_at"])
                filled.append(fish.name)
            else:
                skipped.append(fish.name)

        self.stdout.write(self.style.SUCCESS(f"Added {len(added)}: {', '.join(added) or 'none'}"))
        if filled:
            self.stdout.write(f"Filled in missing details for {len(filled)}: {', '.join(filled)}")
        if skipped:
            self.stdout.write(f"Already complete, left unchanged: {', '.join(skipped)}")
        self.attach_photos(options.get("replace_photos", False))

        # Link newly added fish to the default BFAR closed seasons.
        from api.closed_seasons import seed_closed_seasons
        from api.models import ClosedFishingSeason
        seed_closed_seasons(ClosedFishingSeason, FishSpecies, create=False)

    def attach_photos(self, replace):
        if not PHOTO_DIR.is_dir():
            return
        species = {simple(fish.name): fish for fish in FishSpecies.objects.all()}
        attached, kept, unknown = [], [], []
        for path in sorted(PHOTO_DIR.iterdir()):
            if path.suffix.lower() not in PHOTO_TYPES:
                continue
            fish = species.get(simple(path.stem))
            if fish is None:
                unknown.append(path.name)
                continue
            if fish.photo and not replace:
                kept.append(fish.name)
                continue
            with path.open("rb") as handle:
                fish.photo.save(f"{simple(fish.name)}{path.suffix.lower()}", File(handle), save=False)
            fish.save(update_fields=["photo", "updated_at"])
            attached.append(fish.name)
        self.stdout.write(self.style.SUCCESS(f"Photos added: {', '.join(attached) or 'none'}"))
        if kept:
            self.stdout.write(f"Already had a photo (use --replace-photos to change): {', '.join(kept)}")
        if unknown:
            self.stdout.write(self.style.WARNING(f"No fish with these names: {', '.join(unknown)}"))
