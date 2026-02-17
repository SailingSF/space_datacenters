# AGENTS.md

## Repository purpose
This repository contains a single, analysis-focused Jupyter notebook:

- `space_gpu_datacenter_simplified.ipynb`

The notebook is a first-pass feasibility model for **space-based GPU datacenters for LLM inference**.  
Its goal is to test whether a cluster-satellite concept can plausibly deliver useful inference capacity by modeling:

- electrical load and overhead,
- thermal rejection and radiator sizing,
- power system implications (solar array sizing),
- mass and performance tradeoffs.

Use this repo for exploratory engineering analysis, assumption testing, and sensitivity studies. A blog post will be written based on this analysis to add to the discourse about space based data centers. The audience for the blog post will be to a generally technical audience but not general satellite and data center experts.

## What this repo is not
- Not a production software package.
- Not a flight-ready spacecraft design.
- Not a definitive cost model.

It is a transparent, editable notebook model for rapid iteration.

## Main files
- `space_gpu_datacenter_simplified.ipynb`: Primary model and narrative.
- `requirements.txt`: Python dependencies needed to run the notebook.
- `scripts/setup_env.sh`: One-command local environment bootstrap.
- `README.md`: Quick start for humans.
- `.gitignore`: Excludes local virtual environment and notebook checkpoint artifacts.

## Environment and execution
Target Python version: **Python 3.14**.

Recommended setup:

```bash
./scripts/setup_env.sh
source .venv/bin/activate
jupyter notebook
```

Then open `space_gpu_datacenter_simplified.ipynb` and use kernel:

- `Python 3.14 (space_datacenters)`

## Agent operating guidance
When working in this repository:

1. Treat the notebook as the source of truth.
2. Preserve clarity and readability of equations, assumptions, and narrative cells.
3. Keep assumptions explicit and editable in a centralized section when possible.
4. Prefer small, traceable changes over broad rewrites.
5. If adding libraries, update `requirements.txt`.
6. If setup steps change, update both `README.md` and `scripts/setup_env.sh`.
7. Do not commit `.venv`, generated checkpoints, or other local artifacts.

## Reproducibility expectations
For any model change, agents should aim to keep results reproducible by:

- keeping dependency changes minimal and documented,
- avoiding hidden state in notebook execution order,
- rerunning key cells in order before sharing outputs.

## Collaboration intent
This repo is optimized for fast iteration and shared understanding.  
Prioritize explanations that let another engineer quickly understand:

- what changed,
- why it changed,
- how to rerun and validate the notebook.

