"""Export validated target CSVs; no models or experiment results enter runtime data."""
import argparse
import hashlib
import json
from pathlib import Path
from unittest.mock import patch
import model
from model import ROOT, load_data

TABLES = ('ships', 'weapons', 'armor', 'shells', 'rooms', 'rules', 'profiles',
          'automation', 'controls', 'weapon_modes')


def load_numeric_data(root):
    # The legacy offline loader requires models for its research reports. Reuse all
    # numeric parsing/validation, but make that one unrelated coverage invariant
    # optional for runtime export. No model row is read, synthesized or hashed.
    schemas = {key: value for key, value in model.SCHEMAS.items() if key != 'models'}
    original_require, original_validate = model.require, model.validate

    def numeric_require(condition, message):
        if message != 'models must cover every named ship':
            original_require(condition, message)

    def numeric_validate(data):
        original_validate({**data, 'models': {}})

    with patch.dict(model.SCHEMAS, schemas, clear=True), patch.object(model, 'require', numeric_require), patch.object(model, 'validate', numeric_validate):
        return load_data(root)


def export(root=ROOT):
    data = load_numeric_data(root)
    paths = sorted(root / 'design-data' / 'source' / f'{table}.csv' for table in TABLES)
    digest = hashlib.sha256()
    for path in paths:
        digest.update(str(path.relative_to(root)).encode())
        digest.update(b'\0')
        digest.update(path.read_bytes())
    return {
        'schemaVersion': data['rules']['schema_version'],
        'rulesVersion': data['rules']['rule_version'],
        'inputSha256': digest.hexdigest(),
        'inputFiles': [str(path.relative_to(root)) for path in paths],
        **{table: data[table] for table in TABLES},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    destination = ROOT / 'content' / 'data' / 'ships' / 'target.json'
    text = json.dumps(export(), ensure_ascii=False, indent=2, allow_nan=False) + '\n'
    if args.verify:
        if not destination.exists() or destination.read_text(encoding='utf-8') != text:
            raise SystemExit('target runtime data is stale; run tools/balance/export-runtime.py')
        print('target runtime data verified')
    else:
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(text, encoding='utf-8')
        print(f'exported {destination.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
