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
- `data/reference_snapshot.json`: fixed notebook reference scenario and outputs.

## Launch cost model

The UI uses a simple linear launch cost model:

- Base launch cost in `$ / kg` to a baseline altitude.
- Incremental launch cost in `$ / kg / km` for altitude above that baseline.

Launch presets in `model_defaults.json` include source links and can be edited.

## Deployment (S3 + CloudFront)

1. Upload contents of `/Users/maxabouchar/Documents/github/space_datacenters/web` to your S3 origin path.
2. Set cache policy:
   - `index.html`: short TTL.
   - `data/*.json` and static assets: longer TTL with invalidation/versioning on updates.
3. Invalidate CloudFront paths after each model/content update.

No build step is required.
