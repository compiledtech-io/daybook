"""Build Daybook packages without installing them on the build machine."""

import argparse
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
from zipfile import ZipFile, ZIP_DEFLATED

PROJECT = Path(__file__).resolve().parent.parent
PACKAGING = PROJECT / "packaging"


def run(*args):
    subprocess.run([str(arg) for arg in args], check=True)


def linux(output, version, scratch):
    package = scratch / "deb"
    control = package / "DEBIAN"
    app = package / "usr/share/daybook"
    menu = package / "usr/share/applications"
    copyright_dir = package / "usr/share/doc/daybook"
    for folder in (control, app, menu, copyright_dir):
        folder.mkdir(parents=True)
    (control / "control").write_text(
        f"Package: daybook\nVersion: {version}\nSection: office\nPriority: optional\n"
        "Architecture: all\nDepends: xdg-utils\nMaintainer: Compiled Tech <140924431+Ubaid123678@users.noreply.github.com>\n"
        "Description: Offline personal finance tracker\n"
        " Track expenses, budgets and account balances in a portable local CSV.\n",
        encoding="utf-8",
    )
    shutil.copyfile(PROJECT / "Daybook.html", app / "Daybook.html")
    shutil.copyfile(PROJECT / "LICENSE", copyright_dir / "copyright")
    shutil.copyfile(PACKAGING / "daybook.desktop", menu / "daybook.desktop")
    for path in [package, *package.rglob("*")]:
        path.chmod(0o755 if path.is_dir() else 0o644)
    run("dpkg-deb", "--root-owner-group", "-Zxz", "--build", package,
        output / f"daybook_{version}_all.deb")


def windows(output, version, makensis):
    run(
        makensis, "-V2", f"-DVERSION={version}", f"-DPROJECT={PROJECT}",
        f"-DOUTPUT={output / f'Daybook-{version}-Windows-Setup.exe'}", PACKAGING / "daybook.nsi",
    )


def android(output, version, version_code, scratch, sdk, platform, build_tools, keystore):
    tools = sdk / "build-tools" / build_tools
    android_jar = sdk / "platforms" / platform / "android.jar"
    source = PACKAGING / "android"
    assets = scratch / "assets"
    classes = scratch / "classes"
    dex = scratch / "dex"
    for folder in (assets, classes, dex):
        folder.mkdir()
    html = (PROJECT / "Daybook.html").read_text(encoding="utf-8")
    bridge = (source / "files.js").read_text(encoding="utf-8")
    csp = (
        '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; '
        "script-src 'unsafe-inline'; style-src 'unsafe-inline'\">"
    )
    html = html.replace("</head>", f"{csp}\n<script>\n{bridge}\n</script>\n</head>", 1)
    (assets / "daybook.html").write_text(html, encoding="utf-8")
    shutil.copyfile(PROJECT / "LICENSE", assets / "LICENSE")

    run("javac", "-encoding", "UTF-8", "--release", "8", "-classpath", android_jar,
        "-d", classes, source / "DaybookActivity.java")
    run(tools / "d8", "--lib", android_jar, "--min-api", "26", "--output", dex, *sorted(classes.rglob("*.class")))
    unsigned = scratch / "unsigned.apk"
    aligned = scratch / "aligned.apk"
    run(tools / "aapt2", "link", "-I", android_jar, "--manifest", source / "AndroidManifest.xml",
        "-A", assets, "--version-code", version_code, "--version-name", version, "-o", unsigned)
    with ZipFile(unsigned, "a", compression=ZIP_DEFLATED) as apk:
        apk.write(dex / "classes.dex", "classes.dex")
    run(tools / "zipalign", "-f", "4", unsigned, aligned)

    if not keystore.exists():
        keystore.parent.mkdir(parents=True, exist_ok=True)
        previous_umask = os.umask(0o077)
        try:
            run("keytool", "-genkeypair", "-keystore", keystore, "-storetype", "PKCS12",
                "-storepass", "android", "-keypass", "android", "-alias", "daybookpreview",
                "-dname", "CN=Daybook Preview, O=Compiled Tech", "-keyalg", "RSA",
                "-keysize", "2048", "-validity", "3650")
        finally:
            os.umask(previous_umask)

    apk = output / f"Daybook-{version}-Android-Preview.apk"
    run(tools / "apksigner", "sign", "--ks", keystore, "--ks-key-alias", "daybookpreview",
        "--ks-pass", "pass:android", "--v4-signing-enabled", "false", "--out", apk, aligned)
    run(tools / "apksigner", "verify", "--verbose", apk)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target", choices=("linux", "windows", "android", "all"))
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--version", default="0.1.0")
    parser.add_argument("--version-code", type=int, default=1)
    parser.add_argument("--makensis", default="makensis")
    parser.add_argument("--sdk", type=Path, default=os.environ.get("ANDROID_HOME") or Path.home() / "Android/Sdk")
    parser.add_argument("--platform", default="android-37.0")
    parser.add_argument("--build-tools", default="36.0.0")
    parser.add_argument("--preview-keystore", type=Path)
    args = parser.parse_args()
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", args.version) or args.version_code < 1:
        parser.error("Use a numeric X.Y.Z version and a positive Android version code.")
    if args.target in ("android", "all") and args.preview_keystore is None:
        parser.error("Android builds require a private --preview-keystore path outside the repository.")
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    run(sys.executable, PROJECT / "build.py")
    with tempfile.TemporaryDirectory(prefix="daybook-build-") as directory:
        scratch = Path(directory)
        if args.target in ("linux", "all"):
            linux(output, args.version, scratch)
        if args.target in ("windows", "all"):
            windows(output, args.version, args.makensis)
        if args.target in ("android", "all"):
            android(output, args.version, args.version_code, scratch, args.sdk.resolve(),
                    args.platform, args.build_tools, args.preview_keystore.resolve())


if __name__ == "__main__":
    main()
