# Purpose

This repo contains the calculations and assumptions for a blog post about the feasibility of space based datacenters as Elon Musk has described them. I use some clarifications, simplifications, and assumptions based on the conversation Elon had with Dwarkesh Patel, mentioned here: [https://www.dwarkesh.com/p/notes-on-space-gpus](https://www.dwarkesh.com/p/notes-on-space-gpus)

# Space Datacenters Notebook Setup

This project uses Python 3.14 and a local virtual environment.

## 1) Create and activate the environment

```bash
python3.14 -m venv .venv
source .venv/bin/activate
```

## 2) Install dependencies

```bash
python -m pip install --upgrade pip
pip install -r requirements.txt
```

## 3) Register a Jupyter kernel for this project

```bash
python -m ipykernel install --user --name space_datacenters_py314 --display-name "Python 3.14 (space_datacenters)"
```

## 4) Launch Jupyter

```bash
jupyter notebook
```

Then open:

- `space_gpu_datacenter_simplified.ipynb`

and select kernel:

- `Python 3.14 (space_datacenters)`

