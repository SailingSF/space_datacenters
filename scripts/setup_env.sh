#!/usr/bin/env bash
set -euo pipefail

python3.14 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
python -m ipykernel install --user --name space_datacenters_py314 --display-name "Python 3.14 (space_datacenters)"

echo "Environment ready."
echo "Activate with: source .venv/bin/activate"
echo "Start notebook with: jupyter notebook"

