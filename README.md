# Storyboard Batch Cropper

Split composite storyboard sheets into individual scene shots — built for a **short film workflow** with AI storyboarding in mind.

## Quick start

```bash
npm install
npm run dev
```

Open the URL shown in the terminal (usually `http://localhost:5173`).

## Short film workflow

### Step 1 — Section
Drop storyboard sheet(s), pick panel count (4 / 6 / 8 / 12), drag grid lines to split panels.

### Step 2 — Crop
Fine-tune each panel individually. Drag green edges to trim titles, notes, or uneven spacing.

### Step 3 — Export
Review all scenes in story order, then download the package:

```
your-project-2026-05-24.zip
├── scenes/
│   ├── scene-001.png
│   ├── scene-002.png
│   └── ...
├── manifest.json
└── README.txt
```

**manifest.json** lists every scene in order with metadata slots (`shot`, `action`, `dialogue`, `notes`) ready for your AI pipeline.

### Step 4 — Generate (fal.ai video)

Before generation:

- **License key** — activate on launch (program members or $9.99 purchase from [Benji's AI Empire](https://benjisaiempire.com/software))
- **FAL API key** — required in Step 4 sidebar (you pay fal.ai for model usage)
- **Model picker** — loads all active fal.ai image-to-video models
- **Per-scene prompts** — animation prompt for each scene
- **Per-scene reference images** — optional style/character references
- **Global extra assets** — shared images or audio

Then **Start generation** animates each scene with your selected model.

See [DEPLOY.md](./DEPLOY.md) for license API + benjisaiempire.com/software deployment.

## Export options

- **Download package** — storyboard ZIP (Step 3) or Happy Horse ZIP (Step 4)
- **Download manifest.json** — metadata only
- **Copy manifest** — paste into your AI tooling
- **Start Happy Horse** — build 16:9 frames + job manifest after reviewing assets

## Offline build

```bash
npm run build
npm run preview
```

All processing runs locally in your browser.
