"""
Add a starter list of fish commonly sold in Philippine (Cebu) markets:

    python manage.py load_fish_species

Fish already in AquaTimbang (same name, any capitalisation) are skipped;
only a blank scientific name or description is filled in. Nothing is
deleted or renamed. Check the local names with DVFM / BFAR and edit them
in Fish Species if your markets use different ones.
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from api.models import FishSpecies

# (name, scientific name, description)
STARTER_SPECIES = [
    ("Galunggong", "Decapterus macrosoma", "Round scad. Bisaya: Budloy."),
    ("Bangus", "Chanos chanos", "Milkfish."),
    ("Tilapia", "Oreochromis niloticus", "Nile tilapia (freshwater)."),
    ("Tulingan", "Auxis thazard", "Frigate tuna."),
    ("Alumahan", "Rastrelliger kanagurta", "Indian mackerel. Bisaya: Anduhaw."),
    ("Hasa-hasa", "Rastrelliger brachysoma", "Short mackerel."),
    ("Tamban", "Sardinella lemuru", "Bali sardinella."),
    ("Matambaka", "Selar crumenophthalmus", "Bigeye scad."),
    ("Salay-salay", "Selaroides leptolepis", "Yellowstripe scad."),
    ("Dilis", "Stolephorus spp.", "Anchovy. Bisaya: Bolinaw."),
    ("Lapu-lapu", "Epinephelus spp.", "Grouper. Bisaya: Pugapo."),
    ("Maya-maya", "Lutjanus spp.", "Snapper."),
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
    help = "Add a starter list of common Philippine market fish (skips fish already added)."

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
        self.stdout.write("Add photos in Fish Species → Edit → Photo.")
