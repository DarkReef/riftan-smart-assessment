"""Verify the installable archive before publishing; no third-party dependencies."""
import json
from pathlib import Path
import posixpath
import re
import sys
from zipfile import ZipFile

archive, manifest = map(Path, sys.argv[1:3])
with ZipFile(archive) as bundle:
    assert bundle.testzip() is None, "Corrupt ZIP member"
    assert bundle.read("module.json") == manifest.read_bytes(), "Manifest differs from ZIP"
    data = json.loads(bundle.read("module.json"))
    assert data["id"] == "riftan-smart-assessment"
    assert data["download"].endswith(f'/v{data["version"]}/riftan-smart-assessment.zip')
    names = set(bundle.namelist())
    required = set(data["esmodules"] + data["styles"] + [v["path"] for v in data["languages"]])
    required.update({"scripts/combat/damage-ui.mjs", "damage.css", "docs/combat-damage-v0.1.md", "templates/action-reference.hbs", "scripts/combat/action-reference-data.mjs", "scripts/combat/action-reference-menu.mjs", "LICENSE", "README.md", "RELEASE.md", "docs/combat-action-reference.md"})
    assert required <= names, f"Missing runtime files: {required - names}"
    for name in names:
        assert not name.startswith(("/", "../")) and "\\" not in name, name
        if name.endswith(".mjs"):
            source = bundle.read(name).decode("utf-8")
            for target in re.findall(r"from\s+['\"](\.[^'\"]+)['\"]", source):
                resolved = posixpath.normpath(posixpath.join(posixpath.dirname(name), target))
                assert resolved in names, f"Missing import: {name} -> {resolved}"
print(f'Verified {data["id"]} {data["version"]}: manifest and runtime files match.')
