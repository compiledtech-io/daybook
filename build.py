from pathlib import Path

root = Path(__file__).resolve().parent
src = root / "src"
html = (src / "index.html").read_text(encoding="utf-8")
for marker, name in (
    ("STYLES", "styles.css"),
    ("LEDGER", "ledger.js"),
    ("FEATURES", "features.js"),
    ("APP", "app.js"),
):
    html = html.replace(f"/* {marker} */", (src / name).read_text(encoding="utf-8"))
(root / "Daybook.html").write_text(html, encoding="utf-8")
