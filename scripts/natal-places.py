"""Build the local city picker from the GeoNames cities15000 ZIP (CC BY 4.0).

Usage: python3 scripts/natal-places.py /path/to/cities15000.zip > public/data/natal-places.tsv
Source: https://download.geonames.org/export/dump/cities15000.zip
Fields: name, differing ASCII spelling, ISO country, first-order region code,
latitude, longitude, IANA time zone. Largest populations are listed first.
"""
from argparse import ArgumentParser
from zipfile import ZipFile
import sys

parser = ArgumentParser(description=__doc__)
parser.add_argument("archive")
args = parser.parse_args()
with ZipFile(args.archive) as archive:
    records = [line.split("\t") for line in archive.read("cities15000.txt").decode("utf-8").splitlines()]

records.sort(key=lambda row: -int(row[14] or 0))
for row in records:
    name, ascii_name, latitude, longitude = row[1], row[2], row[4], row[5]
    if not name or not row[8] or not row[17] or not (-90 <= float(latitude) <= 90 and -180 <= float(longitude) <= 180):
        raise ValueError(f"Invalid GeoNames record {row[0]}")
    fields = [name, ascii_name if ascii_name != name else "", row[8], row[10], latitude, longitude, row[17]]
    sys.stdout.buffer.write(("\t".join(fields) + "\n").encode("utf-8"))
