"""Record public licensing/identity evidence; never bypass authenticated downloads."""
from __future__ import annotations

import concurrent.futures
import csv
import hashlib
import json
import struct
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "research/models/acquisition-2026-11-23"
EXISTING = ("california", "bismarck", "yamato", "yorktown")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def fetch(url: str) -> tuple[int, bytes]:
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()
    except urllib.error.URLError as error:
        return 0, json.dumps({"network_error": str(error.reason)}).encode()


def audit_candidate(row: dict[str, str]) -> dict:
    uid = row["model_url"].rsplit("-", 1)[-1]
    endpoint = f"https://api.sketchfab.com/v3/models/{uid}"
    status, body = fetch(endpoint)
    directory = OUTPUT / row["id"]
    directory.mkdir(parents=True, exist_ok=True)
    evidence_file = directory / "public-metadata.json"
    evidence_file.write_bytes(body)
    metadata = json.loads(body) if status == 200 else {}
    download_url = endpoint + "/download"
    download_status, download_body = fetch(download_url)
    # Do not store successful download responses: they may contain signed URLs.
    failure = None
    if download_status != 200:
        try:
            failure = json.loads(download_body)
        except ValueError:
            failure = {"message": "non-JSON error response"}
    record = {
        "shipId": row["id"], "requestedIdentity": row["ship_name"],
        "sourceUrl": row["model_url"], "publicMetadataUrl": endpoint,
        "metadataHttpStatus": status, "metadataSha256": sha256(body),
        "metadataFile": str(evidence_file.relative_to(ROOT)).replace("\\", "/"),
        "name": metadata.get("name"), "author": metadata.get("user", {}).get("displayName"),
        "license": metadata.get("license"), "description": metadata.get("description"),
        "tags": [tag["name"] for tag in metadata.get("tags", [])],
        "isDownloadable": metadata.get("isDownloadable"),
        "triangles": metadata.get("faceCount"), "animations": metadata.get("animationCount"),
        "downloadEndpoint": download_url, "anonymousDownloadHttpStatus": download_status,
        "anonymousDownloadError": failure,
        "downloadedFiles": [], "sourceModelSha256": None, "runtimeAsset": None,
        "modifications": "None; no source model downloaded or converted.",
        "checkedAt": datetime.now(timezone.utc).isoformat(),
    }
    (directory / "audit.json").write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n")
    return record


def inspect_glb(key: str) -> dict:
    path = ROOT / f"content/assets/ships/{key}/{key}.glb"
    data = path.read_bytes()
    magic, version, length = struct.unpack_from("<4sII", data)
    assert magic == b"glTF" and version == 2 and length == len(data), key
    offset = 12
    document = None
    binary = b""
    while offset < length:
        chunk_length, chunk_type = struct.unpack_from("<II", data, offset)
        offset += 8
        chunk = data[offset:offset + chunk_length]
        assert len(chunk) == chunk_length
        offset += chunk_length
        if chunk_type == 0x4E4F534A:
            document = json.loads(chunk)
        elif chunk_type == 0x004E4942:
            binary = chunk
    assert offset == length and document and document["asset"]["version"] == "2.0"
    assert len(document.get("buffers", [])) == 1
    assert "uri" not in document["buffers"][0]
    assert document["buffers"][0]["byteLength"] <= len(binary)
    assert all("uri" not in image for image in document.get("images", []))
    views = document.get("bufferViews", [])
    for view in views:
        assert view.get("buffer", 0) == 0
        assert view.get("byteOffset", 0) + view["byteLength"] <= len(binary)
    nodes = document.get("nodes", [])
    for node in nodes:
        assert all(0 <= child < len(nodes) for child in node.get("children", []))
    names = [node.get("name", "") for node in nodes]
    turret_names = [name for name in names if name.startswith("Turret-")]
    barrel_names = [name for name in names if name.startswith("Barrel-")]
    mesh_triangles = []
    for mesh in document.get("meshes", []):
        count = 0
        for primitive in mesh["primitives"]:
            assert primitive.get("mode", 4) == 4
            accessor = primitive.get("indices", primitive["attributes"]["POSITION"])
            count += document["accessors"][accessor]["count"] // 3
        mesh_triangles.append(count)
    roots = document["scenes"][document.get("scene", 0)]["nodes"]

    def count_scene(index: int, ancestors: frozenset[int]) -> int:
        assert index not in ancestors, "Cyclic scene graph"
        node = nodes[index]
        return (mesh_triangles[node["mesh"]] if "mesh" in node else 0) + sum(
            count_scene(child, ancestors | {index}) for child in node.get("children", []))

    triangles = sum(count_scene(root, frozenset()) for root in roots)
    source = json.loads((path.parent / "source.json").read_text())
    conversion = json.loads((path.parent / "conversion.json").read_text())
    report = {
        "modelId": key, "runtimeAsset": str(path.relative_to(ROOT)),
        "sourceUrl": source["source"], "author": source["author"],
        "license": source["license"], "licenseUrl": source["licenseUrl"],
        "credits": source.get("credits", [source["author"]]),
        "sourceLicenseEvidence": "Existing source.json; not freshly cleared upstream rights.",
        "upstreamRightsStatus": "upstream_unverified",
        "modifications": source.get("modifications", conversion.get("modifications")),
        "conversion": conversion,
        "bytes": len(data), "sha256": sha256(data), "glbVersion": version,
        "selfContained": True, "meshCount": len(document.get("meshes", [])),
        "triangles": triangles, "uniqueMeshTriangles": sum(mesh_triangles), "scene": document.get("scene", 0),
        "sceneRootNames": [nodes[index].get("name", "") for index in document["scenes"][document.get("scene", 0)]["nodes"]],
        "turrets": turret_names, "elevations": [name for name in names if name.startswith("Elevation-")],
        "barrels": barrel_names, "muzzles": [name for name in names if name.startswith("Muzzle-")],
        "funnelNames": [name for name in names if "funnel" in name.lower()],
        "nodeHierarchy": [{"index": i, "name": node.get("name", ""), "children": node.get("children", []),
                           "translation": node.get("translation"), "rotation": node.get("rotation"),
                           "scale": node.get("scale"), "mesh": node.get("mesh")} for i, node in enumerate(nodes)],
    }
    return report


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with (ROOT / "design-data/source/models.csv").open(newline="") as stream:
        candidates = [row for row in csv.DictReader(stream) if row["id"] not in EXISTING]
    before = {key: sha256((ROOT / f"content/assets/ships/{key}/{key}.glb").read_bytes()) for key in EXISTING}
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        audits = list(pool.map(audit_candidate, candidates))
    existing = [inspect_glb(key) for key in EXISTING]
    assert before == {row["modelId"]: row["sha256"] for row in existing}
    report = {"checkedAt": datetime.now(timezone.utc).isoformat(), "candidates": audits,
              "existingAssets": existing, "existingGlbsUnchanged": True,
              "newSourceModelsDownloaded": 0, "newRuntimeModelsConverted": 0,
              "policy": "Public metadata and official anonymous download endpoint only; no authentication, payment, viewer extraction, or restriction bypass."}
    (OUTPUT / "audit-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    for row in audits:
        print(json.dumps({key: row[key] for key in ("shipId", "name", "metadataHttpStatus", "anonymousDownloadHttpStatus")}, ensure_ascii=False))
    print(json.dumps({"existingGlbsUnchanged": True, "newSourceModelsDownloaded": 0, "existingAssets": [{k: row[k] for k in ("modelId", "bytes", "triangles", "turrets", "elevations", "barrels", "muzzles")} for row in existing]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
