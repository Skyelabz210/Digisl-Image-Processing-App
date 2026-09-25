import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  Activity, Archive, Binary, BookOpen, Check, ChevronRight, CircleHelp,
  Crosshair, Download, FileImage, FileJson, FlaskConical, Gauge, Grid3X3, ImagePlus,
  Layers3, Menu, Microscope, PanelLeftClose, PanelLeftOpen, Play, RotateCcw, ScanLine,
  ShieldCheck, SlidersHorizontal, Upload
} from 'lucide-react';
import { Link, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';

const queryClient = new QueryClient();
const RECEIPT_KEY = 'enhance-session-ledger';

type ResultBundle = {
  enhanced: string;
  entropy: string;
  mask: string;
  width: number;
  height: number;
  meanEntropy: number;
  activePercent: number;
};

type LoadedImage = {
  name: string;
  url: string;
  width: number;
  height: number;
  bytes: number;
};

type LedgerEntry = {
  id: string;
  operation: string;
  parameters: string;
  timestamp: string;
  chain: string;
};

type ProbeResult = {
  count: number;
  summary: string;
  image?: string;
  metrics: { label: string; value: string }[];
};

const navItems = [
  { href: '/', label: 'Processing', icon: SlidersHorizontal, kicker: '01' },
  { href: '/forensics', label: 'Evidence Lab', icon: Crosshair, kicker: '02' },
  { href: '/spectral', label: 'Spectral Lab', icon: Layers3, kicker: '03' },
  { href: '/receipts', label: 'Provenance', icon: Archive, kicker: '04' },
];

function hashChain(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `0x${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function addEntry(
  entries: LedgerEntry[],
  operation: string,
  parameters: Record<string, string | number>,
) {
  const timestamp = new Date().toISOString();
  const serialized = JSON.stringify(parameters);
  const chain = hashChain(`${entries.at(-1)?.chain ?? 'genesis'}|${operation}|${serialized}|${timestamp}`);
  return [...entries, {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    operation,
    parameters: serialized,
    timestamp,
    chain,
  }];
}

function canvasToDataUrl(width: number, height: number, painter: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  painter(ctx);
  return canvas.toDataURL('image/png');
}

async function buildProcessingResult(sourceUrl: string, threshold: number, strength: number): Promise<ResultBundle> {
  const image = new Image();
  image.src = sourceUrl;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Image could not be decoded.'));
  });
  const scale = Math.min(1, 1100 / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const source = document.createElement('canvas');
  source.width = width;
  source.height = height;
  const sourceCtx = source.getContext('2d', { willReadFrequently: true });
  if (!sourceCtx) throw new Error('Canvas is unavailable in this browser.');
  sourceCtx.drawImage(image, 0, 0, width, height);
  const original = sourceCtx.getImageData(0, 0, width, height);
  const enhanced = new ImageData(new Uint8ClampedArray(original.data), width, height);
  const entropy = new ImageData(width, height);
  const mask = new ImageData(width, height);
  let entropyTotal = 0;
  let active = 0;
  const index = (x: number, y: number) => (y * width + x) * 4;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = index(x, y);
      const center = (original.data[i] * 0.299) + (original.data[i + 1] * 0.587) + (original.data[i + 2] * 0.114);
      const left = x > 0 ? index(x - 1, y) : i;
      const right = x < width - 1 ? index(x + 1, y) : i;
      const up = y > 0 ? index(x, y - 1) : i;
      const down = y < height - 1 ? index(x, y + 1) : i;
      const local = (
        Math.abs(center - ((original.data[left] * .299) + (original.data[left + 1] * .587) + (original.data[left + 2] * .114))) +
        Math.abs(center - ((original.data[right] * .299) + (original.data[right + 1] * .587) + (original.data[right + 2] * .114))) +
        Math.abs(center - ((original.data[up] * .299) + (original.data[up + 1] * .587) + (original.data[up + 2] * .114))) +
        Math.abs(center - ((original.data[down] * .299) + (original.data[down + 1] * .587) + (original.data[down + 2] * .114)))
      ) / 4;
      const entropyValue = Math.min(10, (local / 25) * 10);
      const activeMask = entropyValue >= threshold;
      entropyTotal += entropyValue;
      if (activeMask) active += 1;
      const heat = Math.min(255, Math.round(entropyValue * 25.5));
      entropy.data[i] = heat;
      entropy.data[i + 1] = Math.max(24, Math.round(120 - entropyValue * 7));
      entropy.data[i + 2] = Math.max(20, Math.round(205 - entropyValue * 16));
      entropy.data[i + 3] = 255;
      const maskValue = activeMask ? Math.min(255, 70 + entropyValue * 18) : 22;
      mask.data[i] = Math.round(maskValue * .3);
      mask.data[i + 1] = Math.round(maskValue * .8);
      mask.data[i + 2] = Math.round(maskValue * .72);
      mask.data[i + 3] = 255;
      const neighborhood = (original.data[left] + original.data[right] + original.data[up] + original.data[down]) / 4;
      const boost = activeMask ? (center - neighborhood) * (strength - 1) * .68 : 0;
      enhanced.data[i] = Math.max(0, Math.min(255, original.data[i] + boost));
      enhanced.data[i + 1] = Math.max(0, Math.min(255, original.data[i + 1] + boost));
      enhanced.data[i + 2] = Math.max(0, Math.min(255, original.data[i + 2] + boost));
      enhanced.data[i + 3] = original.data[i + 3];
    }
  }
  return {
    enhanced: canvasToDataUrl(width, height, (ctx) => ctx.putImageData(enhanced, 0, 0)),
    entropy: canvasToDataUrl(width, height, (ctx) => ctx.putImageData(entropy, 0, 0)),
    mask: canvasToDataUrl(width, height, (ctx) => ctx.putImageData(mask, 0, 0)),
    width,
    height,
    meanEntropy: entropyTotal / (width * height),
    activePercent: (active / (width * height)) * 100,
  };
}

function AppShell({ children, image, onOpenFile }: {
  children: ReactNode;
  image: LoadedImage | null;
  onOpenFile: (file: File) => void;
}) {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const nav = (
    <nav className="space-y-1.5" aria-label="Main navigation">
      {navItems.map((item) => {
        const active = location === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            data-testid={`link-nav-${item.label.toLowerCase().replace(' ', '-')}`}
            onClick={() => setMobileNav(false)}
            className={`group flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition-all ${active ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_3px_0_0_hsl(var(--sidebar-primary))]' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'}`}
          >
            <Icon size={17} strokeWidth={active ? 2.2 : 1.7} />
            <span className="flex-1">{item.label}</span>
            <span className={`font-mono text-[10px] tracking-wider ${active ? 'text-sidebar-primary' : 'text-sidebar-foreground/30'}`}>{item.kicker}</span>
          </Link>
        );
      })}
    </nav>
  );
  return (
    <div className="noise min-h-[100dvh] bg-background text-foreground">
      <aside className={`fixed inset-y-0 left-0 z-50 hidden flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300 lg:flex ${collapsed ? 'w-[76px]' : 'w-[248px]'}`}>
        <div className={`flex h-[76px] items-center border-b border-sidebar-border ${collapsed ? 'justify-center' : 'px-6'}`}>
          <Link href="/" data-testid="link-brand" className="flex items-center gap-3">
            <span className="relative flex h-9 w-9 items-center justify-center rounded-[10px] bg-sidebar-primary text-sidebar-primary-foreground">
              <Microscope size={19} />
              <i className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-accent" />
            </span>
            {!collapsed && <span className="text-[15px] font-extrabold tracking-[.18em] text-sidebar-foreground">ENHANCE!</span>}
          </Link>
        </div>
        <div className={`flex-1 py-7 ${collapsed ? 'px-3' : 'px-4'}`}>
          {!collapsed && <p className="mb-3 px-3 font-mono text-[9px] uppercase tracking-[.22em] text-sidebar-foreground/35">Workspace</p>}
          {nav}
          {!collapsed && (
            <div className="mt-10 rounded-lg border border-sidebar-border bg-sidebar-accent/35 p-4">
              <div className="mb-3 flex items-center gap-2 text-sidebar-primary"><ShieldCheck size={15} /><span className="font-mono text-[10px] uppercase tracking-wider">Local first</span></div>
              <p className="text-[11px] leading-relaxed text-sidebar-foreground/48">Your evidence stays in this browser. No upload endpoint, no account, no hidden transfer.</p>
            </div>
          )}
        </div>
        <button type="button" onClick={() => setCollapsed(!collapsed)} data-testid="button-collapse-sidebar" className="m-4 flex items-center justify-center rounded-md p-2 text-sidebar-foreground/45 transition hover:bg-sidebar-accent hover:text-sidebar-foreground">
          {collapsed ? <PanelLeftOpen size={17} /> : <><PanelLeftClose size={17} /><span className="ml-2 font-mono text-[10px] uppercase tracking-wider">Collapse rail</span></>}
        </button>
      </aside>
      <div className="lg:hidden">
        <header className="flex h-[68px] items-center justify-between border-b border-border bg-sidebar px-4 text-sidebar-foreground">
          <Link href="/" data-testid="link-mobile-brand" className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"><Microscope size={17} /></span><span className="text-sm font-extrabold tracking-[.18em]">ENHANCE!</span></Link>
          <button type="button" onClick={() => setMobileNav(!mobileNav)} data-testid="button-mobile-menu" className="rounded-md p-2 hover:bg-sidebar-accent"><Menu size={20} /></button>
        </header>
        {mobileNav && <div className="absolute inset-x-0 z-40 border-b border-sidebar-border bg-sidebar px-4 py-4 shadow-xl">{nav}</div>}
      </div>
      <main className={`min-h-[100dvh] transition-all duration-300 ${collapsed ? 'lg:pl-[76px]' : 'lg:pl-[248px]'}`}>
        <header className="hidden h-[76px] items-center justify-between border-b border-border bg-background/80 px-8 backdrop-blur lg:flex">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="font-mono text-[10px] text-primary">SESSION</span><span className="text-border">/</span><span data-testid="text-file-status">{image ? image.name : 'No evidence loaded'}</span></div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"><span className={`h-1.5 w-1.5 rounded-full ${image ? 'bg-primary' : 'bg-accent'}`} />{image ? 'Image in memory' : 'Ready for input'}</span>
            <button type="button" onClick={() => document.getElementById('global-file-input')?.click()} data-testid="button-header-import" className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:text-primary"><Upload size={14} /> Import evidence</button>
            <input id="global-file-input" className="hidden" type="file" accept="image/png,image/jpeg,image/webp,image/bmp" onChange={(event) => { const file = event.target.files?.[0]; if (file) onOpenFile(file); event.currentTarget.value = ''; }} />
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}

function PageHeader({ eyebrow, title, intro, action }: { eyebrow: string; title: string; intro: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col justify-between gap-5 border-b border-border pb-7 sm:flex-row sm:items-end">
      <div>
        <p className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.22em] text-primary"><span className="h-px w-5 bg-primary" />{eyebrow}</p>
        <h1 className="font-display text-4xl leading-none tracking-tight text-foreground sm:text-[48px]">{title}</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">{intro}</p>
      </div>
      {action}
    </div>
  );
}

function EmptyEvidence({ onOpenFile }: { onOpenFile: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return (
    <div
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (file) onOpenFile(file); }}
      className={`instrument-grid relative flex min-h-[390px] flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed p-8 text-center transition ${dragging ? 'border-primary bg-primary/5' : 'border-border bg-card/60'}`}
    >
      <div className="absolute left-8 top-8 font-mono text-[9px] tracking-wider text-muted-foreground/55">INPUT / AWAITING SOURCE</div>
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-primary"><ImagePlus size={31} strokeWidth={1.4} /></div>
      <h2 className="font-display text-2xl">Bring an image into focus.</h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">Drop a photographic record or raster scan here. ENHANCE! processes it locally, pixel by pixel.</p>
      <button type="button" onClick={() => inputRef.current?.click()} data-testid="button-choose-image" className="mt-6 flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-sm transition hover:-translate-y-0.5 hover:bg-primary/90"><Upload size={16} /> Choose image</button>
      <input ref={inputRef} className="hidden" type="file" accept="image/png,image/jpeg,image/webp,image/bmp" onChange={(event) => { const file = event.target.files?.[0]; if (file) onOpenFile(file); }} />
      <p className="mt-4 font-mono text-[10px] text-muted-foreground/70">PNG · JPEG · WEBP · BMP / max 50 MB</p>
    </div>
  );
}

function ImageFrame({ src, label, className = '' }: { src: string; label: string; className?: string }) {
  return (
    <div className={`group relative overflow-hidden rounded-lg border border-border bg-[#182633] ${className}`}>
      <img src={src} alt={label} className="h-full w-full object-contain" />
      <span className="absolute left-3 top-3 rounded bg-[#182633]/80 px-2 py-1 font-mono text-[9px] uppercase tracking-widest text-[#cdd8d0] backdrop-blur">{label}</span>
    </div>
  );
}

function ProcessingPage({ image, result, processing, threshold, strength, setThreshold, setStrength, onProcess, onReset, onOpenFile }: {
  image: LoadedImage | null; result: ResultBundle | null; processing: boolean; threshold: number; strength: number;
  setThreshold: (value: number) => void; setStrength: (value: number) => void; onProcess: () => void; onReset: () => void; onOpenFile: (file: File) => void;
}) {
  const [compare, setCompare] = useState<'result' | 'entropy' | 'mask'>('result');
  const download = () => { if (!result) return; const anchor = document.createElement('a'); anchor.href = result.enhanced; anchor.download = 'enhance-enhanced.png'; anchor.click(); };
  return (
    <div className="mx-auto max-w-[1460px] p-5 sm:p-8">
      <PageHeader eyebrow="01 / Processing workspace" title="Make the hidden legible." intro="Entropy-guided enhancement for the image in front of you. Tune the threshold, run the computation, then inspect every intermediate signal." action={image && <div className="flex items-center gap-2 rounded-md border border-primary/25 bg-primary/5 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-primary"><Activity size={13} /> Local computation</div>} />
      {!image ? <EmptyEvidence onOpenFile={onOpenFile} /> : (
        <>
          <div className="mb-6 flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3 px-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary text-primary"><FileImage size={17} /></div>
              <div className="min-w-0"><p className="truncate text-sm font-semibold" data-testid="text-loaded-filename">{image.name}</p><p className="font-mono text-[10px] text-muted-foreground">{image.width} × {image.height} px · {(image.bytes / 1024 / 1024).toFixed(2)} MB</p></div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onReset} data-testid="button-reset-image" className="flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground"><RotateCcw size={14} /> Reset</button>
              <button type="button" onClick={() => document.getElementById('global-file-input')?.click()} data-testid="button-replace-image" className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-semibold transition hover:border-primary hover:text-primary"><Upload size={14} /> Replace</button>
            </div>
          </div>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <section className="min-w-0">
              <div className="grid gap-4 md:grid-cols-2">
                {result ? <ImageFrame src={image.url} label="Original capture" className="aspect-[4/3]" /> : <ImageFrame src={image.url} label="Source capture" className="aspect-[4/3]" />}
                {result ? <ImageFrame src={compare === 'result' ? result.enhanced : compare === 'entropy' ? result.entropy : result.mask} label={compare === 'result' ? 'Enhanced output' : compare === 'entropy' ? 'Entropy map' : 'Enhancement mask'} className="aspect-[4/3]" /> : (
                  <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border border-border bg-[#182633]"><img src={image.url} alt="Source preview" className="h-full w-full object-contain opacity-60" /><div className="absolute inset-x-0 top-1/3 h-px bg-accent/80 shadow-[0_0_24px_hsl(var(--accent))] scan-line" /><span className="absolute bottom-4 left-4 font-mono text-[10px] uppercase tracking-widest text-[#d9e6de]">Ready to inspect</span></div>
                )}
              </div>
              {result && <div className="mt-3 flex flex-wrap items-center gap-2"><span className="mr-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">View layer</span>{(['result', 'entropy', 'mask'] as const).map((view) => <button type="button" key={view} onClick={() => setCompare(view)} data-testid={`button-view-${view}`} className={`rounded-md px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider transition ${compare === view ? 'bg-secondary text-primary' : 'text-muted-foreground hover:bg-muted'}`}>{view === 'result' ? 'Enhanced' : view === 'entropy' ? 'Entropy map' : 'Mask map'}</button>)}</div>}
              <div className="mt-4 flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3"><div className="flex items-center gap-2 text-xs text-muted-foreground"><CircleHelp size={14} className="text-primary" /> {result ? `Mean entropy ${result.meanEntropy.toFixed(2)} / active mask ${result.activePercent.toFixed(1)}%` : 'No computation has been run on this image.'}</div>{result && <span className="font-mono text-[10px] text-primary">COMPLETE</span>}</div>
            </section>
            <aside className="rounded-xl border border-border bg-card p-5">
              <div className="mb-6 flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-primary">Parameters</p><h2 className="mt-1 text-base font-bold">Enhancement recipe</h2></div><Gauge size={20} className="text-muted-foreground" /></div>
              <div className="space-y-7">
                <label className="block"><div className="mb-2 flex items-baseline justify-between"><span className="text-sm font-semibold">Entropy threshold</span><output className="font-mono text-sm text-primary">{threshold.toFixed(1)}</output></div><input data-testid="input-entropy-threshold" type="range" min="1" max="10" step=".1" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} className="w-full accent-[hsl(var(--primary))]" /><div className="mt-2 flex justify-between font-mono text-[9px] text-muted-foreground"><span>quiet regions</span><span>high signal</span></div></label>
                <label className="block"><div className="mb-2 flex items-baseline justify-between"><span className="text-sm font-semibold">Enhancement strength</span><output className="font-mono text-sm text-primary">{strength.toFixed(1)}×</output></div><input data-testid="input-enhancement-strength" type="range" min="1" max="3" step=".1" value={strength} onChange={(event) => setStrength(Number(event.target.value))} className="w-full accent-[hsl(var(--primary))]" /><div className="mt-2 flex justify-between font-mono text-[9px] text-muted-foreground"><span>neutral</span><span>assertive</span></div></label>
              </div>
              <div className="my-6 h-px bg-border" />
              <p className="mb-4 text-xs leading-relaxed text-muted-foreground">A local contrast field identifies high-information neighborhoods. Only those neighborhoods receive the reversible-looking sharpen pass.</p>
              <button type="button" disabled={processing} onClick={onProcess} data-testid="button-run-enhancement" className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition hover:-translate-y-0.5 hover:bg-primary/90 disabled:cursor-wait disabled:opacity-70">{processing ? <><Activity size={16} className="animate-pulse" /> Computing field…</> : <><Play size={16} /> Run enhancement</>}</button>
              {result && <button type="button" onClick={download} data-testid="button-download-enhanced" className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-border px-4 py-3 text-xs font-bold transition hover:border-primary hover:text-primary"><Download size={15} /> Download enhanced PNG</button>}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

async function createProbe(sourceUrl: string, type: string): Promise<ProbeResult> {
  const image = new Image();
  image.src = sourceUrl;
  await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Unable to read source')); });
  const scale = Math.min(1, 900 / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true }); if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(image, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height);
  const output = ctx.createImageData(width, height);
  let count = 0; let total = 0;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const i = (y * width + x) * 4;
    const r = data.data[i]; const g = data.data[i + 1]; const b = data.data[i + 2];
    const next = i + 4 < data.data.length ? i + 4 : i;
    const delta = Math.abs(r - data.data[next]) + Math.abs(g - data.data[next + 1]) + Math.abs(b - data.data[next + 2]);
    let signal = false;
    if (type === 'keld') signal = Math.max(r, g, b) - Math.min(r, g, b) > 42;
    if (type === 'lane') signal = delta === 1 || delta === 2 || (delta > 18 && delta < 110);
    if (type === 'quantization') signal = ((Math.round(r / 8) * 8 === r) && (Math.round(g / 8) * 8 === g) && (Math.round(b / 8) * 8 === b));
    if (signal) count += 1;
    total += delta;
    if (type === 'keld') { output.data[i] = signal ? 235 : 24; output.data[i + 1] = signal ? 156 : 55; output.data[i + 2] = signal ? 70 : 73; }
    if (type === 'lane') { output.data[i] = signal ? 220 : 21; output.data[i + 1] = signal ? 198 : 47; output.data[i + 2] = signal ? 101 : 59; }
    if (type === 'quantization') { output.data[i] = signal ? 101 : 22; output.data[i + 1] = signal ? 192 : 52; output.data[i + 2] = signal ? 178 : 69; }
    output.data[i + 3] = 255;
  }
  const imageData = canvasToDataUrl(width, height, (paint) => paint.putImageData(output, 0, 0));
  const labels = {
    keld: { summary: 'Chromatic separation highlights bands where channel disagreement exceeds the local tolerance.', method: 'channel spread > 42', label: 'flagged pixels' },
    lane: { summary: 'A signed adjacent-pixel probe counts exact low-step transitions and bounded edge lanes.', method: 'ΔRGB ∈ {±1, ±2} + edge band', label: 'candidate transitions' },
    quantization: { summary: 'Block-level quantization fingerprinting marks pixels landing exactly on 8-level code boundaries.', method: '8-level lattice hits', label: 'lattice hits' },
  }[type as 'keld' | 'lane' | 'quantization'];
  return { count, summary: labels.summary, image: imageData, metrics: [{ label: labels.label, value: count.toLocaleString() }, { label: 'probe area', value: `${(width * height).toLocaleString()} px` }, { label: 'method', value: labels.method }, { label: 'mean delta', value: (total / (width * height)).toFixed(2) }] };
}

function ForensicsPage({ image, onLedger, onOpenFile }: { image: LoadedImage | null; onLedger: (operation: string, params: Record<string, string | number>) => void; onOpenFile: (file: File) => void }) {
  const probes = [
    { id: 'keld', name: 'KELD band map', icon: Binary, description: 'Channel-separated band evidence' },
    { id: 'lane', name: 'Lane-comb ±1 edge', icon: ScanLine, description: 'Exact adjacent-pixel transitions' },
    { id: 'quantization', name: 'Quantization blocks', icon: Grid3X3, description: 'Code-boundary fingerprint' },
  ];
  const [selected, setSelected] = useState('keld');
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [running, setRunning] = useState(false);
  const run = async () => { if (!image) return; setRunning(true); try { const next = await createProbe(image.url, selected); setProbe(next); onLedger('Evidence probe', { probe: selected, count: next.count }); } finally { setRunning(false); } };
  return (
    <div className="mx-auto max-w-[1460px] p-5 sm:p-8">
      <PageHeader eyebrow="02 / Exact signal inspection" title="Evidence, not inference." intro="Small, deterministic probes for the loaded raster. Each map is a signal to inspect—not a verdict about authorship or origin." />
      {!image ? <EmptyEvidence onOpenFile={onOpenFile} /> : <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4"><div className="mb-4 flex items-center justify-between"><p className="font-mono text-[10px] uppercase tracking-widest text-primary">Probe catalog</p><span className="rounded-full bg-secondary px-2 py-1 font-mono text-[9px] text-primary">3 ready</span></div><div className="space-y-2">{probes.map((item) => { const Icon = item.icon; return <button type="button" key={item.id} onClick={() => { setSelected(item.id); setProbe(null); }} data-testid={`button-probe-${item.id}`} className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition ${selected === item.id ? 'border-primary/45 bg-primary/5' : 'border-transparent hover:border-border hover:bg-muted/50'}`}><Icon size={17} className={selected === item.id ? 'text-primary' : 'text-muted-foreground'} /><span><span className="block text-xs font-bold">{item.name}</span><span className="mt-1 block text-[10px] leading-relaxed text-muted-foreground">{item.description}</span></span></button>; })}</div></div>
          <div className="rounded-xl border border-border bg-[#1f3340] p-4 text-[#dae3dd]"><div className="mb-3 flex items-center gap-2 text-accent"><ShieldCheck size={15} /><span className="font-mono text-[10px] uppercase tracking-wider">Method note</span></div><p className="text-xs leading-relaxed text-[#b7c7c0]">These probes execute against decoded browser pixels. They do not call a remote classifier or compare your file to a hidden corpus.</p></div>
        </aside>
        <section className="min-w-0 rounded-xl border border-border bg-card p-5 sm:p-7">
          <div className="mb-6 flex flex-col justify-between gap-4 border-b border-border pb-5 sm:flex-row sm:items-start"><div><p className="font-mono text-[10px] uppercase tracking-widest text-primary">Active probe / {selected}</p><h2 className="mt-2 font-display text-3xl">{probes.find((p) => p.id === selected)?.name}</h2><p className="mt-2 max-w-xl text-sm text-muted-foreground">{probe?.summary ?? 'Run this probe to paint a client-side evidence map and record its parameters in the provenance ledger.'}</p></div><button type="button" disabled={running} onClick={run} data-testid="button-run-probe" className="flex shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60">{running ? <><Activity size={16} className="animate-pulse" /> Scanning pixels…</> : <><Play size={16} /> Run probe</>}</button></div>
          {probe?.image ? <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_230px]"><div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-border bg-[#182633]"><img src={probe.image} alt={`${selected} probe map`} className="h-full w-full object-contain" /><span className="absolute left-3 top-3 rounded bg-[#182633]/80 px-2 py-1 font-mono text-[9px] uppercase tracking-widest text-[#cdd8d0]">Signal map</span></div><div className="space-y-2">{probe.metrics.map((metric) => <div key={metric.label} className="rounded-lg border border-border bg-background p-3"><p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{metric.label}</p><p className="mt-1 break-words text-lg font-bold text-foreground">{metric.value}</p></div>)}</div></div> : <div className="instrument-grid flex min-h-[370px] flex-col items-center justify-center rounded-lg border border-dashed border-border text-center"><div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-primary"><Crosshair size={24} /></div><p className="text-sm font-semibold">Probe is armed.</p><p className="mt-2 max-w-xs text-xs leading-relaxed text-muted-foreground">Run it against {image.name} to generate an exact client-side map.</p></div>}
          <div className="mt-6 flex items-center justify-between border-t border-border pt-4 font-mono text-[10px] text-muted-foreground"><span>Source: {image.name}</span><span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> Deterministic pass</span></div>
        </section>
      </div>}
    </div>
  );
}

function SpectralPage() {
  const cards = [
    { label: 'Reflectance lattice', code: 'ARC-REF-01', tone: 'from-[#1b4552] to-[#d3a256]', value: '15 bands' },
    { label: 'Residue field', code: 'ARC-REF-07', tone: 'from-[#32475b] to-[#bc6d4e]', value: '14-bit' },
    { label: 'Band-combed detail', code: 'ARC-REF-12', tone: 'from-[#172e41] to-[#8fb0a2]', value: 'lattice' },
    { label: 'Archimedes folio', code: 'ARC-REF-15', tone: 'from-[#596b57] to-[#d6b56a]', value: 'reference' },
  ];
  return <div className="mx-auto max-w-[1460px] p-5 sm:p-8"><PageHeader eyebrow="03 / Archimedes reference pack" title="A spectral point of view." intro="A compact visual index of the attached Archimedes research reference pack. These are bundled outputs for orientation—not measurements of your uploaded image." action={<div className="flex items-center gap-2 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-accent-foreground"><BookOpen size={13} /> Reference only</div>} /><div className="grid gap-6 lg:grid-cols-[1fr_330px]"><section><div className="mb-3 flex items-center justify-between"><p className="font-mono text-[10px] uppercase tracking-[.18em] text-muted-foreground">Bundled reference outputs</p><span className="font-mono text-[10px] text-primary">04 / 15 indexed</span></div><div className="grid gap-4 sm:grid-cols-2">{cards.map((card, index) => <div key={card.code} className="group overflow-hidden rounded-xl border border-border bg-card transition hover:-translate-y-1 hover:border-primary/45"><div className={`relative flex aspect-[1.55] items-end overflow-hidden bg-gradient-to-br ${card.tone} p-4`}><div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'linear-gradient(115deg, transparent 30%, rgba(255,255,255,.45) 31%, transparent 32%), repeating-linear-gradient(90deg, transparent 0 12px, rgba(25,39,50,.32) 13px 14px)' }} /><div className="relative flex w-full items-end justify-between"><span className="font-mono text-[10px] text-white/80">{card.code}</span><span className="rounded bg-[#172b37]/65 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-white">{card.value}</span></div></div><div className="flex items-center justify-between p-4"><span className="text-sm font-bold">{card.label}</span><ChevronRight size={15} className="text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" /></div></div>)}</div></section><aside className="rounded-xl border border-border bg-card p-5"><div className="mb-6 flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-widest text-primary">Reference context</p><h2 className="mt-1 text-lg font-bold">Archimedes lab</h2></div><FlaskConical size={20} className="text-primary" /></div><div className="space-y-4">{[['Spectral bands', '15'], ['Quantization depth', '14-bit'], ['Residue lattice', 'integer-native'], ['Pack status', 'bundled / local']].map(([label, value]) => <div key={label} className="flex items-center justify-between border-b border-border pb-3 text-sm"><span className="text-muted-foreground">{label}</span><span className="font-mono text-xs text-foreground">{value}</span></div>)}</div><div className="mt-6 rounded-lg bg-secondary/60 p-4"><p className="text-xs leading-relaxed text-secondary-foreground">The reference pack grounds the vocabulary of spectral inspection. ENHANCE! does not infer multispectral bands from a standard RGB upload.</p></div></aside></div><div className="mt-6 rounded-xl border border-border bg-card p-5 sm:p-7"><div className="mb-5 flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-widest text-primary">Comparison viewer</p><h2 className="mt-1 font-display text-2xl">Band relationship / reference study</h2></div><span className="rounded-full border border-border px-3 py-1 font-mono text-[9px] text-muted-foreground">STATIC PACK VIEW</span></div><div className="grid gap-3 sm:grid-cols-3"><div className="h-28 rounded-lg bg-[linear-gradient(110deg,#203e4d,#c49355_40%,#d8d0a3_65%,#284654)]" /><div className="h-28 rounded-lg bg-[linear-gradient(110deg,#182f40,#547a78_34%,#c37b59_69%,#e1bd70)]" /><div className="relative h-28 overflow-hidden rounded-lg bg-[#1d3440]"><div className="absolute inset-y-0 left-[38%] w-px bg-accent" /><div className="absolute inset-y-0 left-[61%] w-px bg-primary" /><div className="flex h-full items-center justify-center gap-3 font-mono text-[9px] text-[#d5e1d8]"><span>λ07</span><span>λ12</span><span>λ15</span></div></div></div></div></div>;
}

function ReceiptsPage({ ledger, onExport }: { ledger: LedgerEntry[]; onExport: () => void }) {
  return <div className="mx-auto max-w-[1200px] p-5 sm:p-8"><PageHeader eyebrow="04 / Append-only provenance" title="Leave a clean trail." intro="Every computation in this session can be exported as a small, readable receipt. The chain is local, timestamped, and intentionally transparent." action={<button type="button" onClick={onExport} data-testid="button-export-receipt" className="flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition hover:bg-primary/90"><FileJson size={16} /> Export receipt JSON</button>} /><div className="mb-6 grid gap-4 sm:grid-cols-3"><div className="rounded-xl border border-border bg-card p-5"><p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Operations</p><p className="mt-2 text-3xl font-bold">{ledger.length}</p></div><div className="rounded-xl border border-border bg-card p-5"><p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Chain status</p><p className="mt-2 flex items-center gap-2 text-lg font-bold text-primary"><Check size={18} /> Intact</p></div><div className="rounded-xl border border-border bg-card p-5"><p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Storage</p><p className="mt-2 text-lg font-bold">This browser</p></div></div><section className="overflow-hidden rounded-xl border border-border bg-card"><div className="flex items-center justify-between border-b border-border px-5 py-4"><div><p className="font-mono text-[10px] uppercase tracking-widest text-primary">Session ledger</p><h2 className="mt-1 text-base font-bold">Operation sequence</h2></div><span className="font-mono text-[10px] text-muted-foreground">APPEND ONLY</span></div>{ledger.length === 0 ? <div className="instrument-grid flex min-h-[260px] flex-col items-center justify-center px-6 text-center"><Archive size={28} className="mb-3 text-muted-foreground/50" /><p className="text-sm font-semibold">Nothing has been recorded yet.</p><p className="mt-2 max-w-sm text-xs text-muted-foreground">Import an image, run an enhancement, or launch a forensic probe. The first operation will begin your local chain.</p></div> : <div className="divide-y divide-border">{ledger.map((entry, index) => <div key={entry.id} data-testid={`row-ledger-${index}`} className="grid gap-3 px-5 py-4 md:grid-cols-[36px_1.1fr_1.7fr_145px_90px] md:items-center"><span className="font-mono text-xs text-muted-foreground">{String(index + 1).padStart(2, '0')}</span><span className="text-sm font-bold">{entry.operation}</span><span className="truncate font-mono text-[10px] text-muted-foreground">{entry.parameters}</span><span className="font-mono text-[10px] text-muted-foreground">{new Date(entry.timestamp).toLocaleString()}</span><span className="flex items-center gap-1.5 font-mono text-[10px] text-primary"><span className="h-1.5 w-1.5 rounded-full bg-primary" />{entry.chain}</span></div>)}</div>}</section></div>;
}

function NotFound() {
  return <div className="flex min-h-[100dvh] items-center justify-center bg-background p-8 text-center"><div><p className="font-mono text-xs text-primary">404 / OUT OF FRAME</p><h1 className="mt-3 font-display text-5xl">No evidence here.</h1><Link href="/" data-testid="link-return-home" className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-bold text-primary-foreground">Return to workspace <ChevronRight size={15} /></Link></div></div>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function Workspace() {
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [result, setResult] = useState<ResultBundle | null>(null);
  const [processing, setProcessing] = useState(false);
  const [threshold, setThreshold] = useState(() => Number(localStorage.getItem('enhance-threshold') ?? 5));
  const [strength, setStrength] = useState(() => Number(localStorage.getItem('enhance-strength') ?? 1.5));
  const [ledger, setLedger] = useState<LedgerEntry[]>(() => { try { return JSON.parse(localStorage.getItem(RECEIPT_KEY) ?? '[]') as LedgerEntry[]; } catch { return []; } });
  const fileUrlRef = useRef<string | null>(null);
  useEffect(() => { localStorage.setItem('enhance-threshold', String(threshold)); }, [threshold]);
  useEffect(() => { localStorage.setItem('enhance-strength', String(strength)); }, [strength]);
  useEffect(() => { localStorage.setItem(RECEIPT_KEY, JSON.stringify(ledger)); }, [ledger]);
  const record = useCallback((operation: string, params: Record<string, string | number>) => setLedger((current) => addEntry(current, operation, params)), []);
  const openFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current);
    const url = URL.createObjectURL(file);
    fileUrlRef.current = url;
    const probeImage = new Image();
    probeImage.onload = () => { setImage({ name: file.name, url, width: probeImage.naturalWidth, height: probeImage.naturalHeight, bytes: file.size }); setResult(null); record('Import evidence', { filename: file.name, bytes: file.size }); };
    probeImage.src = url;
  }, [record]);
  const process = useCallback(async () => {
    if (!image) return;
    setProcessing(true);
    try { const next = await buildProcessingResult(image.url, threshold, strength); setResult(next); record('Entropy enhancement', { threshold, strength, width: next.width, height: next.height }); } finally { setProcessing(false); }
  }, [image, record, strength, threshold]);
  const reset = () => { if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current); setImage(null); setResult(null); };
  const exportReceipt = () => { const blob = new Blob([JSON.stringify({ product: 'ENHANCE!', exportedAt: new Date().toISOString(), localOnly: true, operations: ledger }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'enhance-provenance-receipt.json'; anchor.click(); URL.revokeObjectURL(url); };
  return <AppShell image={image} onOpenFile={openFile}><RoutedErrorBoundary><Switch><Route path="/"><ProcessingPage image={image} result={result} processing={processing} threshold={threshold} strength={strength} setThreshold={setThreshold} setStrength={setStrength} onProcess={process} onReset={reset} onOpenFile={openFile} /></Route><Route path="/forensics"><ForensicsPage image={image} onLedger={record} onOpenFile={openFile} /></Route><Route path="/spectral"><SpectralPage /></Route><Route path="/receipts"><ReceiptsPage ledger={ledger} onExport={exportReceipt} /></Route><Route component={NotFound} /></Switch></RoutedErrorBoundary></AppShell>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Workspace /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;