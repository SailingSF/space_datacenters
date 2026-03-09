# Space Datacenter Interactive Explorer

Static HTML/JS app for interacting with the simplified `sunonly` fleet model used in
`/Users/maxabouchar/Documents/github/space_datacenters/space_gpu_datacenter.ipynb`.

## Local run

Because this app fetches local JSON files, use a static server rather than opening the file directly.

```bash
cd /Users/maxabouchar/Documents/github/space_datacenters/web
python3 -m http.server 8000
```

Then visit [http://localhost:8000](http://localhost:8000).

## Data files

- `data/model_defaults.json`: model constants, input ranges, and beta presets.
- `data/reference_snapshot.json`: notebook-aligned reference scenario and outputs shown in the UI.

## Launch cost model

The UI now follows the notebook's two-tier launch model:

- Base launch cost in `$ / kg` to a baseline deployment altitude.
- For higher final orbits, a Hohmann-transfer delta-v is converted into an equivalent launched-mass multiplier using transfer `Isp` and propulsion dry-mass fraction.
- Satellite mass changes from arrays, radiators, and bus structure therefore propagate directly into launch spend.

Launch presets in `model_defaults.json` include source links and can be edited.

## Deployment (S3 + CloudFront)

1. Upload contents of `/Users/maxabouchar/Documents/github/space_datacenters/web` to your S3 origin path.
2. Set cache policy:
   - `index.html`: short TTL.
   - `data/*.json` and static assets: longer TTL with invalidation/versioning on updates.
3. Invalidate CloudFront paths after each model/content update.

No build step is required.
