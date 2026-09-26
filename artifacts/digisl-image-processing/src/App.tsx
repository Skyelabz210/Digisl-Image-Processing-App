import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  Activity,
  Archive,
  Binary,
  ChevronRight,
  CircleHelp,
  Crosshair,
  Download,
  FileImage,
  FileJson,
  Gauge,
  Grid3X3,
  ImagePlus,
  Layers3,
  Menu,
  Microscope,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import {
  ALGORITHM_VERSION,
  validateFile,
  validateDimensions,
  type Channel,
  type ProbeType,
} from "@/lib/processing";
import {
  RECEIPT_KEY,
  LEGACY_RECEIPT_KEY,
  addEntry,
  verifyLedger,
  sha256,
  rasterDigest,
  readSetting,
  type LedgerEntry,
  type Parameters,
} from "@/lib/provenance";
import {
  decodeImage,
  readRaster,
  runWorker,
  rasterToBlob,
  downloadBlob,
  downloadUrl,
  outputName,
  isAbort,
} from "@/lib/image-io";
import {
  Link,
  Route,
  Switch,
  Router as WouterRouter,
  useLocation,
} from "wouter";

const queryClient = new QueryClient();

type ResultBundle = {
  enhanced: string;
  entropy: string;
  mask: string;
  width: number;
  height: number;
  meanEntropy: number;
  activePercent: number;
  clippedPixels: number;
  threshold: number;
  strength: number;
};

type LoadedImage = {
  name: string;
  url: string;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
};

type ProbeResult = {
  count: number;
  summary: string;
  image: string;
  metrics: { label: string; value: string }[];
};

const navItems = [
  { href: "/", label: "Processing", icon: SlidersHorizontal, kicker: "01" },
  { href: "/forensics", label: "Evidence Lab", icon: Crosshair, kicker: "02" },
  { href: "/spectral", label: "Spectral Lab", icon: Layers3, kicker: "03" },
  { href: "/receipts", label: "Provenance", icon: Archive, kicker: "04" },
];

function AppShell({
  children,
  image,
  onOpenFile,
}: {
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
            data-testid={`link-nav-${item.label.toLowerCase().replace(" ", "-")}`}
            onClick={() => setMobileNav(false)}
            title={item.label}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            className={`group flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition-all ${active ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_3px_0_0_hsl(var(--sidebar-primary))]" : "text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"}`}
          >
            <Icon size={17} strokeWidth={active ? 2.2 : 1.7} />
            <span className={collapsed ? "lg:hidden" : "flex-1"}>
              {item.label}
            </span>
            <span
              className={`${collapsed ? "lg:hidden" : ""} font-mono text-[10px] tracking-wider ${active ? "text-sidebar-primary" : "text-sidebar-foreground/30"}`}
            >
              {item.kicker}
            </span>
          </Link>
        );
      })}
    </nav>
  );
  return (
    <div className="noise min-h-[100dvh] bg-background text-foreground">
      <aside
        className={`fixed inset-y-0 left-0 z-50 hidden flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300 lg:flex ${collapsed ? "w-[76px]" : "w-[248px]"}`}
      >
        <div
          className={`flex h-[76px] items-center border-b border-sidebar-border ${collapsed ? "justify-center" : "px-6"}`}
        >
          <Link
            href="/"
            data-testid="link-brand"
            className="flex items-center gap-3"
          >
            <span className="relative flex h-9 w-9 items-center justify-center rounded-[10px] bg-sidebar-primary text-sidebar-primary-foreground">
              <Microscope size={19} />
              <i className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-accent" />
            </span>
            {!collapsed && (
              <span className="text-[15px] font-extrabold tracking-[.18em] text-sidebar-foreground">
                ENHANCE!
              </span>
            )}
          </Link>
        </div>
        <div className={`flex-1 py-7 ${collapsed ? "px-3" : "px-4"}`}>
          {!collapsed && (
            <p className="mb-3 px-3 font-mono text-[9px] uppercase tracking-[.22em] text-sidebar-foreground/35">
              Workspace
            </p>
          )}
          {nav}
          {!collapsed && (
            <div className="mt-10 rounded-lg border border-sidebar-border bg-sidebar-accent/35 p-4">
              <div className="mb-3 flex items-center gap-2 text-sidebar-primary">
                <ShieldCheck size={15} />
                <span className="font-mono text-[10px] uppercase tracking-wider">
                  Local first
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-sidebar-foreground/48">
                Your evidence stays in this browser. No upload endpoint, no
                account, no hidden transfer.
              </p>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          data-testid="button-collapse-sidebar"
          className="m-4 flex items-center justify-center rounded-md p-2 text-sidebar-foreground/45 transition hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          {collapsed ? (
            <PanelLeftOpen size={17} />
          ) : (
            <>
              <PanelLeftClose size={17} />
              <span className="ml-2 font-mono text-[10px] uppercase tracking-wider">
                Collapse rail
              </span>
            </>
          )}
        </button>
      </aside>
      <div className="lg:hidden">
        <header className="flex h-[68px] items-center justify-between border-b border-border bg-sidebar px-4 text-sidebar-foreground">
          <Link
            href="/"
            data-testid="link-mobile-brand"
            className="flex items-center gap-3"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <Microscope size={17} />
            </span>
            <span className="text-sm font-extrabold tracking-[.18em]">
              ENHANCE!
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setMobileNav(!mobileNav)}
            aria-label="Toggle navigation"
            aria-expanded={mobileNav}
            data-testid="button-mobile-menu"
            className="rounded-md p-2 hover:bg-sidebar-accent"
          >
            <Menu size={20} />
          </button>
        </header>
        {mobileNav && (
          <div className="absolute inset-x-0 z-40 border-b border-sidebar-border bg-sidebar px-4 py-4 shadow-xl">
            {nav}
          </div>
        )}
      </div>
      <main
        className={`min-h-[100dvh] transition-all duration-300 ${collapsed ? "lg:pl-[76px]" : "lg:pl-[248px]"}`}
      >
        <header className="hidden h-[76px] items-center justify-between border-b border-border bg-background/80 px-8 backdrop-blur lg:flex">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono text-[10px] text-primary">SESSION</span>
            <span className="text-border">/</span>
            <span data-testid="text-file-status">
              {image ? image.name : "No evidence loaded"}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <span
                className={`h-1.5 w-1.5 rounded-full ${image ? "bg-primary" : "bg-accent"}`}
              />
              {image ? "Image in memory" : "Ready for input"}
            </span>
            <button
              type="button"
              onClick={() =>
                document.getElementById("global-file-input")?.click()
              }
              data-testid="button-header-import"
              className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:text-primary"
            >
              <Upload size={14} /> Import evidence
            </button>
            <input
              id="global-file-input"
              className="hidden"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/bmp"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onOpenFile(file);
                event.currentTarget.value = "";
              }}
            />
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}

function PageHeader({
  eyebrow,
  title,
  intro,
  action,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col justify-between gap-5 border-b border-border pb-7 sm:flex-row sm:items-end">
      <div>
        <p className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.22em] text-primary">
          <span className="h-px w-5 bg-primary" />
          {eyebrow}
        </p>
        <h1 className="font-display text-4xl leading-none tracking-tight text-foreground sm:text-[48px]">
          {title}
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          {intro}
        </p>
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
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files[0];
        if (file) onOpenFile(file);
      }}
      className={`instrument-grid relative flex min-h-[390px] flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed p-8 text-center transition ${dragging ? "border-primary bg-primary/5" : "border-border bg-card/60"}`}
    >
      <div className="absolute left-8 top-8 font-mono text-[9px] tracking-wider text-muted-foreground/55">
        INPUT / AWAITING SOURCE
      </div>
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-primary">
        <ImagePlus size={31} strokeWidth={1.4} />
      </div>
      <h2 className="font-display text-2xl">Bring an image into focus.</h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        Drop a photographic record or raster scan here. ENHANCE! processes it
        locally, pixel by pixel.
      </p>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        data-testid="button-choose-image"
        className="mt-6 flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-sm transition hover:-translate-y-0.5 hover:bg-primary/90"
      >
        <Upload size={16} /> Choose image
      </button>
      <input
        ref={inputRef}
        className="hidden"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/bmp"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onOpenFile(file);
          event.currentTarget.value = "";
        }}
      />
      <p className="mt-4 font-mono text-[10px] text-muted-foreground/70">
        PNG · JPEG · WEBP · BMP / max 50 MB · 16 MP · 8,192 px per side
      </p>
    </div>
  );
}

function ImageFrame({
  src,
  label,
  className = "",
}: {
  src: string;
  label: string;
  className?: string;
}) {
  return (
    <div
      className={`group relative overflow-hidden rounded-lg border border-border bg-[#182633] ${className}`}
    >
      <img src={src} alt={label} className="h-full w-full object-contain" />
      <span className="absolute left-3 top-3 rounded bg-[#182633]/80 px-2 py-1 font-mono text-[9px] uppercase tracking-widest text-[#cdd8d0] backdrop-blur">
        {label}
      </span>
    </div>
  );
}

function ProcessingPage({
  image,
  result,
  processing,
  importing,
  threshold,
  strength,
  setThreshold,
  setStrength,
  onProcess,
  onCancel,
  onReset,
  onOpenFile,
}: {
  image: LoadedImage | null;
  result: ResultBundle | null;
  processing: boolean;
  importing: boolean;
  threshold: number;
  strength: number;
  setThreshold: (value: number) => void;
  setStrength: (value: number) => void;
  onProcess: () => void;
  onCancel: () => void;
  onReset: () => void;
  onOpenFile: (file: File) => void;
}) {
  const [compare, setCompare] = useState<"result" | "entropy" | "mask">(
    "result",
  );
  const stale =
    !!result &&
    (result.threshold !== threshold || result.strength !== strength);
  const download = () => {
    if (result && image)
      downloadUrl(
        compare === "result" ? result.enhanced : result[compare],
        outputName(image.name, compare === "result" ? "enhanced" : compare),
      );
  };
  return (
    <div className="mx-auto max-w-[1460px] p-5 sm:p-8">
      <PageHeader
        eyebrow="01 / Processing workspace"
        title="Make the hidden legible."
        intro="Entropy-guided enhancement for the image in front of you. Tune the threshold, run the computation, then inspect every intermediate signal."
        action={
          image && (
            <div className="flex items-center gap-2 rounded-md border border-primary/25 bg-primary/5 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-primary">
              <Activity size={13} /> Local computation
            </div>
          )
        }
      />
      {!image ? (
        <EmptyEvidence onOpenFile={onOpenFile} />
      ) : (
        <>
          <div className="mb-6 flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3 px-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
                <FileImage size={17} />
              </div>
              <div className="min-w-0">
                <p
                  className="truncate text-sm font-semibold"
                  data-testid="text-loaded-filename"
                >
                  {image.name}
                </p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {image.width} × {image.height} px ·{" "}
                  {(image.bytes / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onReset}
                data-testid="button-reset-image"
                className="flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <RotateCcw size={14} /> Reset
              </button>
              <button
                type="button"
                onClick={() =>
                  document.getElementById("global-file-input")?.click()
                }
                data-testid="button-replace-image"
                className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-semibold transition hover:border-primary hover:text-primary"
              >
                <Upload size={14} /> Replace
              </button>
            </div>
          </div>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <section className="min-w-0">
              <div className="grid gap-4 md:grid-cols-2">
                {result ? (
                  <ImageFrame
                    src={image.url}
                    label="Original capture"
                    className="aspect-[4/3]"
                  />
                ) : (
                  <ImageFrame
                    src={image.url}
                    label="Source capture"
                    className="aspect-[4/3]"
                  />
                )}
                {result ? (
                  <ImageFrame
                    src={
                      compare === "result"
                        ? result.enhanced
                        : compare === "entropy"
                          ? result.entropy
                          : result.mask
                    }
                    label={
                      compare === "result"
                        ? "Enhanced output"
                        : compare === "entropy"
                          ? "Entropy map"
                          : "Enhancement mask"
                    }
                    className="aspect-[4/3]"
                  />
                ) : (
                  <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border border-border bg-[#182633]">
                    <img
                      src={image.url}
                      alt="Source preview"
                      className="h-full w-full object-contain opacity-60"
                    />
                    <div className="absolute inset-x-0 top-1/3 h-px bg-accent/80 shadow-[0_0_24px_hsl(var(--accent))] scan-line" />
                    <span className="absolute bottom-4 left-4 font-mono text-[10px] uppercase tracking-widest text-[#d9e6de]">
                      Ready to inspect
                    </span>
                  </div>
                )}
              </div>
              {result && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="mr-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    View layer
                  </span>
                  {(["result", "entropy", "mask"] as const).map((view) => (
                    <button
                      type="button"
                      key={view}
                      onClick={() => setCompare(view)}
                      data-testid={`button-view-${view}`}
                      className={`rounded-md px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider transition ${compare === view ? "bg-secondary text-primary" : "text-muted-foreground hover:bg-muted"}`}
                    >
                      {view === "result"
                        ? "Enhanced"
                        : view === "entropy"
                          ? "Entropy map"
                          : "Mask map"}
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-4 flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CircleHelp size={14} className="text-primary" />{" "}
                  {result
                    ? `Mean entropy ${result.meanEntropy.toFixed(2)} bits / active mask ${result.activePercent.toFixed(1)}%`
                    : "No computation has been run on this image."}
                </div>
                {result && (
                  <span className="font-mono text-[10px] text-primary">
                    {stale ? "RECIPE CHANGED" : "COMPLETE"}
                  </span>
                )}
              </div>
            </section>
            <aside className="rounded-xl border border-border bg-card p-5">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[.18em] text-primary">
                    Parameters
                  </p>
                  <h2 className="mt-1 text-base font-bold">
                    Enhancement recipe
                  </h2>
                </div>
                <Gauge size={20} className="text-muted-foreground" />
              </div>
              <div className="space-y-7">
                <label className="block">
                  <div className="mb-2 flex items-baseline justify-between">
                    <span className="text-sm font-semibold">
                      Entropy threshold
                    </span>
                    <output className="font-mono text-sm text-primary">
                      {threshold.toFixed(1)} bits
                    </output>
                  </div>
                  <input
                    data-testid="input-entropy-threshold"
                    type="range"
                    min="0"
                    max="6.3"
                    step=".1"
                    value={threshold}
                    onChange={(event) =>
                      setThreshold(Number(event.target.value))
                    }
                    className="w-full accent-[hsl(var(--primary))]"
                  />
                  <div className="mt-2 flex justify-between font-mono text-[9px] text-muted-foreground">
                    <span>quiet regions</span>
                    <span>high signal</span>
                  </div>
                </label>
                <label className="block">
                  <div className="mb-2 flex items-baseline justify-between">
                    <span className="text-sm font-semibold">
                      Enhancement strength
                    </span>
                    <output className="font-mono text-sm text-primary">
                      {strength.toFixed(1)}×
                    </output>
                  </div>
                  <input
                    data-testid="input-enhancement-strength"
                    type="range"
                    min="1"
                    max="3"
                    step=".1"
                    value={strength}
                    onChange={(event) =>
                      setStrength(Number(event.target.value))
                    }
                    className="w-full accent-[hsl(var(--primary))]"
                  />
                  <div className="mt-2 flex justify-between font-mono text-[9px] text-muted-foreground">
                    <span>neutral</span>
                    <span>assertive</span>
                  </div>
                </label>
              </div>
              <div className="my-6 h-px bg-border" />
              <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
                Shannon entropy is measured in 9×9 luminance neighborhoods.
                Selected pixels receive a luminance sharpen pass; the original
                stays available for comparison.
              </p>
              <button
                type="button"
                disabled={processing || importing}
                onClick={onProcess}
                data-testid="button-run-enhancement"
                className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition hover:-translate-y-0.5 hover:bg-primary/90 disabled:cursor-wait disabled:opacity-70"
              >
                {processing ? (
                  <>
                    <Activity size={16} className="animate-pulse" /> Computing
                    field…
                  </>
                ) : (
                  <>
                    <Play size={16} /> Run enhancement
                  </>
                )}
              </button>
              {processing && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="mt-2 w-full rounded-md border border-border p-3 text-xs font-bold"
                >
                  Cancel processing
                </button>
              )}
              {stale && (
                <p role="status" className="mt-3 text-xs text-muted-foreground">
                  The displayed result uses {result.threshold.toFixed(1)} bits
                  and {result.strength.toFixed(1)}×. Run again to apply the
                  current recipe.
                </p>
              )}
              {result && (
                <p
                  className="mt-3 text-xs text-muted-foreground"
                  data-testid="text-output-dimensions"
                >
                  Output: {result.width} × {result.height} px ·{" "}
                  {result.clippedPixels.toLocaleString()} clipped pixels
                </p>
              )}
              {result && (
                <button
                  type="button"
                  onClick={download}
                  data-testid="button-download-enhanced"
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-border px-4 py-3 text-xs font-bold transition hover:border-primary hover:text-primary"
                >
                  <Download size={15} /> Download{" "}
                  {compare === "result" ? "enhanced" : compare} PNG
                </button>
              )}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

function ForensicsPage({
  image,
  onLedger,
  onOpenFile,
}: {
  image: LoadedImage | null;
  onLedger: (operation: string, params: Parameters) => Promise<void>;
  onOpenFile: (file: File) => void;
}) {
  const probes = [
    {
      id: "keld",
      name: "KELD band map",
      icon: Binary,
      description: "STAR8 / exact 36-level bands",
    },
    {
      id: "lane",
      name: "Lane-comb ±1 edge",
      icon: ScanLine,
      description: "Residue lanes 7 · 11 · 13",
    },
    {
      id: "quantization",
      name: "Quantization blocks",
      icon: Grid3X3,
      description: "16×16 block GCD fingerprint",
    },
  ];
  const [selected, setSelected] = useState<ProbeType>("keld");
  const [channel, setChannel] = useState<Channel>(1);
  const [error, setError] = useState("");
  const job = useRef<AbortController | null>(null);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [running, setRunning] = useState(false);
  useEffect(() => () => job.current?.abort(), []);
  useEffect(
    () => () => {
      if (probe) URL.revokeObjectURL(probe.image);
    },
    [probe],
  );
  const cancel = () => {
    job.current?.abort();
    job.current = null;
    setRunning(false);
  };
  const run = async () => {
    if (!image) return;
    cancel();
    const controller = new AbortController();
    job.current = controller;
    const signal = controller.signal;
    setRunning(true);
    setError("");
    try {
      const source = await readRaster(image.url, signal);
      const inputDigest = await rasterDigest(source);
      const response = await runWorker(
        { kind: "probe", source, probe: selected, channel },
        signal,
      );
      if ("error" in response || response.kind !== "probe")
        throw new Error("Unexpected probe result.");
      const next = response.result;
      const png = await rasterToBlob(next.map);
      const outputDigest = await sha256(await png.arrayBuffer());
      signal.throwIfAborted();
      await onLedger("Evidence probe", {
        algorithm: ALGORITHM_VERSION,
        probe: selected,
        channel,
        sourceSha256: image.sha256,
        inputRasterSha256: inputDigest,
        outputPngSha256: outputDigest,
        count: next.count,
        width: next.map.width,
        height: next.map.height,
        alphaPolicy: "opaque-only",
        ...(selected === "quantization"
          ? { blockSize: 16, partialEdgeBlocks: true }
          : {}),
      });
      signal.throwIfAborted();
      setProbe({
        count: next.count,
        summary: next.summary,
        metrics: next.metrics,
        image: URL.createObjectURL(png),
      });
    } catch (error) {
      if (job.current === controller && !isAbort(error))
        setError(error instanceof Error ? error.message : "Probe failed.");
    } finally {
      if (job.current === controller) {
        job.current = null;
        setRunning(false);
      }
    }
  };
  return (
    <div className="mx-auto max-w-[1460px] p-5 sm:p-8">
      <PageHeader
        eyebrow="02 / Exact signal inspection"
        title="Inspect the exact signal."
        intro="CRAM-DSP probes on full-resolution browser-decoded RGB samples. Choose a channel, inspect its integer structure, and export the resulting map."
      />
      {!image ? (
        <EmptyEvidence onOpenFile={onOpenFile} />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="mb-4 flex items-center justify-between">
                <p className="font-mono text-[10px] uppercase tracking-widest text-primary">
                  Probe catalog
                </p>
                <span className="rounded-full bg-secondary px-2 py-1 font-mono text-[9px] text-primary">
                  3 ready
                </span>
              </div>
              <div className="space-y-2">
                {probes.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => {
                        cancel();
                        setSelected(item.id as ProbeType);
                        setProbe(null);
                        setError("");
                      }}
                      data-testid={`button-probe-${item.id}`}
                      className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition ${selected === item.id ? "border-primary/45 bg-primary/5" : "border-transparent hover:border-border hover:bg-muted/50"}`}
                    >
                      <Icon
                        size={17}
                        className={
                          selected === item.id
                            ? "text-primary"
                            : "text-muted-foreground"
                        }
                      />
                      <span>
                        <span className="block text-xs font-bold">
                          {item.name}
                        </span>
                        <span className="mt-1 block text-[10px] leading-relaxed text-muted-foreground">
                          {item.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-[#1f3340] p-4 text-[#dae3dd]">
              <div className="mb-3 flex items-center gap-2 text-accent">
                <ShieldCheck size={15} />
                <span className="font-mono text-[10px] uppercase tracking-wider">
                  Method note
                </span>
              </div>
              <p className="text-xs leading-relaxed text-[#b7c7c0]">
                These probes inspect the selected 8-bit RGB channel at native
                dimensions. Fully opaque pixels are included. Browser decoding
                may apply color conversion; raw sensor and 16-bit analysis
                require the archived CRAM-DSP pipeline.
              </p>
            </div>
          </aside>
          <section className="min-w-0 rounded-xl border border-border bg-card p-5 sm:p-7">
            <label className="mb-4 flex items-center gap-3 text-sm font-semibold">
              Sample channel
              <select
                aria-label="Sample channel"
                value={channel}
                onChange={(event) => {
                  cancel();
                  setChannel(Number(event.target.value) as Channel);
                  setProbe(null);
                  setError("");
                }}
                className="rounded-md border border-border bg-background p-2"
              >
                <option value={0}>Red</option>
                <option value={1}>Green</option>
                <option value={2}>Blue</option>
              </select>
            </label>
            {error && (
              <p
                role="alert"
                className="mb-4 rounded-md border border-destructive p-3 text-sm text-destructive"
              >
                {error}
              </p>
            )}
            {running && (
              <button
                type="button"
                onClick={cancel}
                className="mb-4 rounded-md border border-border px-3 py-2 text-xs"
              >
                Cancel probe
              </button>
            )}
            <div className="mb-6 flex flex-col justify-between gap-4 border-b border-border pb-5 sm:flex-row sm:items-start">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-primary">
                  Active probe / {selected}
                </p>
                <h2 className="mt-2 font-display text-3xl">
                  {probes.find((p) => p.id === selected)?.name}
                </h2>
                <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                  {probe?.summary ??
                    "Run this probe to paint a client-side evidence map and record its parameters in the provenance ledger."}
                </p>
              </div>
              <button
                type="button"
                disabled={running}
                onClick={run}
                data-testid="button-run-probe"
                className="flex shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
              >
                {running ? (
                  <>
                    <Activity size={16} className="animate-pulse" /> Scanning
                    pixels…
                  </>
                ) : (
                  <>
                    <Play size={16} /> Run probe
                  </>
                )}
              </button>
            </div>
            {probe?.image ? (
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_230px]">
                <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-border bg-[#182633]">
                  <img
                    src={probe.image}
                    alt={`${selected} probe map`}
                    className="h-full w-full object-contain"
                  />
                  <span className="absolute left-3 top-3 rounded bg-[#182633]/80 px-2 py-1 font-mono text-[9px] uppercase tracking-widest text-[#cdd8d0]">
                    Signal map
                  </span>
                </div>
                <div className="space-y-2">
                  {probe.metrics.map((metric) => (
                    <div
                      key={metric.label}
                      className="rounded-lg border border-border bg-background p-3"
                    >
                      <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                        {metric.label}
                      </p>
                      <p className="mt-1 break-words text-lg font-bold text-foreground">
                        {metric.value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="instrument-grid flex min-h-[370px] flex-col items-center justify-center rounded-lg border border-dashed border-border text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-primary">
                  <Crosshair size={24} />
                </div>
                <p className="text-sm font-semibold">Probe is armed.</p>
                <p className="mt-2 max-w-xs text-xs leading-relaxed text-muted-foreground">
                  Run it against {image.name} to generate an exact client-side
                  map.
                </p>
              </div>
            )}
            {probe && (
              <button
                type="button"
                onClick={() =>
                  downloadUrl(
                    probe.image,
                    outputName(
                      image.name,
                      `${selected}-${["red", "green", "blue"][channel]}`,
                    ),
                  )
                }
                className="mt-4 flex items-center gap-2 rounded-md border border-border px-4 py-3 text-xs font-bold"
              >
                <Download size={15} /> Download probe PNG
              </button>
            )}
            <div className="mt-6 flex items-center justify-between border-t border-border pt-4 font-mono text-[10px] text-muted-foreground">
              <span>Source: {image.name}</span>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />{" "}
                Deterministic pass
              </span>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function SpectralPage() {
  const references = [
    {
      file: "archimedes-keld.png",
      label: "Archimedes KELD map",
      detail: "Exact band stratification reference",
    },
    {
      file: "archimedes-pc1.png",
      label: "Archimedes principal component",
      detail: "Bundled PC1 visualization",
    },
    {
      file: "archimedes-ratio.png",
      label: "Archimedes band ratio",
      detail: "Bundled spectral ratio visualization",
    },
    {
      file: "recover-raw.png",
      label: "Recovery source",
      detail: "Source reference for the recovery study",
    },
    {
      file: "recover-pca.png",
      label: "Recovery PCA",
      detail: "Component view of the reference study",
    },
    {
      file: "recover-undertext.png",
      label: "Recovery inspection",
      detail: "Candidate detail for visual inspection",
    },
    {
      file: "proof-panel.png",
      label: "Comparison panel",
      detail: "Bundled side-by-side reference output",
    },
  ];
  return (
    <div className="mx-auto max-w-[1460px] p-5 sm:p-8">
      <PageHeader
        eyebrow="03 / Archimedes reference pack"
        title="A spectral point of view."
        intro="Explore the actual bundled reference images. Open a full-size image to inspect the source study alongside your own processing workflow."
        action={
          <span className="rounded-md border border-border px-3 py-2 font-mono text-[10px]">
            7 reference images
          </span>
        }
      />
      <p className="mb-6 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        The archived pack describes a 700 × 700 × 15 spectral cube. These PNGs
        are rendered reference outputs; measurements from an imported image
        appear in the Evidence Lab.
      </p>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {references.map((reference) => (
          <a
            key={reference.file}
            href={`${import.meta.env.BASE_URL}reference/${reference.file}`}
            target="_blank"
            rel="noreferrer"
            className="group overflow-hidden rounded-xl border border-border bg-card transition hover:border-primary focus-visible:outline focus-visible:outline-primary"
          >
            <img
              src={`${import.meta.env.BASE_URL}reference/${reference.file}`}
              alt={reference.label}
              loading="lazy"
              className="aspect-[4/3] w-full bg-[#182633] object-contain"
            />
            <div className="p-4">
              <h2 className="text-sm font-bold">{reference.label}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {reference.detail}
              </p>
              <span className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-primary">
                Open full-size reference <ChevronRight size={14} />
              </span>
            </div>
          </a>
        ))}
      </div>
      <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
        Archimedes Palimpsest source data: the Owner of the Archimedes
        Palimpsest; imaging by W. A. Christens-Barry, R. L. Easton Jr., and K.
        T. Knox, CC BY 3.0. Reference processing: Anthony Diaz, HackFate
        Research. See THIRD_PARTY_NOTICES.md for attribution.
      </p>
    </div>
  );
}

function ReceiptsPage({
  ledger,
  status,
  storage,
  notice,
  legacy,
  preservedReceipt,
  onExport,
  onExportStored,
}: {
  ledger: LedgerEntry[];
  status: string;
  storage: string;
  notice: string;
  legacy: boolean;
  preservedReceipt: boolean;
  onExport: () => void;
  onExportStored: (legacy: boolean) => void;
}) {
  return (
    <div className="mx-auto max-w-[1200px] p-5 sm:p-8">
      <PageHeader
        eyebrow="04 / Verifiable provenance"
        title="Leave a clean trail."
        intro="Source files, decoded rasters, and generated PNGs have SHA-256 digests. Export the local receipt to verify its operation sequence and parameters."
        action={
          <button
            type="button"
            onClick={onExport}
            data-testid="button-export-receipt"
            className="flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition hover:bg-primary/90"
          >
            <FileJson size={16} /> Export receipt JSON
          </button>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Operations
          </p>
          <p className="mt-2 text-3xl font-bold">{ledger.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Chain status
          </p>
          <p className="mt-2 flex items-center gap-2 text-lg font-bold text-primary">
            <ShieldCheck size={18} /> {status}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Storage
          </p>
          <p className="mt-2 text-lg font-bold">{storage}</p>
        </div>
      </div>
      {notice && (
        <p
          role="status"
          className="mb-4 rounded-md border border-border bg-card p-4 text-sm"
        >
          {notice}{" "}
          {preservedReceipt && (
            <button
              type="button"
              onClick={() => onExportStored(false)}
              className="ml-2 underline"
            >
              Export stored data
            </button>
          )}
        </p>
      )}
      {legacy && (
        <p className="mb-4 text-sm text-muted-foreground">
          An earlier receipt is preserved separately.{" "}
          <button
            type="button"
            onClick={() => onExportStored(true)}
            className="underline"
          >
            Export legacy receipt
          </button>
        </p>
      )}
      <p className="mb-4 text-xs text-muted-foreground">
        Verification checks the local hash sequence. Keep an exported copy to
        compare later changes. A local chain does not authenticate the capture
        or establish an external timestamp.
      </p>
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-primary">
              Session ledger
            </p>
            <h2 className="mt-1 text-base font-bold">Operation sequence</h2>
          </div>
          <span className="font-mono text-[10px] text-muted-foreground">
            SHA-256 / V2
          </span>
        </div>
        {ledger.length === 0 ? (
          <div className="instrument-grid flex min-h-[260px] flex-col items-center justify-center px-6 text-center">
            <Archive size={28} className="mb-3 text-muted-foreground/50" />
            <p className="text-sm font-semibold">
              Nothing has been recorded yet.
            </p>
            <p className="mt-2 max-w-sm text-xs text-muted-foreground">
              Import an image, run an enhancement, or launch a forensic probe.
              The first operation will begin your local chain.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {ledger.map((entry, index) => (
              <div
                key={entry.id}
                data-testid={`row-ledger-${index}`}
                className="grid gap-3 px-5 py-4 md:grid-cols-[36px_1.1fr_1.7fr_145px_110px] md:items-center"
              >
                <span className="font-mono text-xs text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="text-sm font-bold">{entry.operation}</span>
                <span
                  className="truncate font-mono text-[10px] text-muted-foreground"
                  title={JSON.stringify(entry.parameters)}
                >
                  {JSON.stringify(entry.parameters)}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {new Date(entry.timestamp).toLocaleString()}
                </span>
                <span className="flex items-center gap-1.5 font-mono text-[10px] text-primary">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  <span title={entry.chain}>{entry.chain.slice(0, 12)}…</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function NotFound() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background p-8 text-center">
      <div>
        <p className="font-mono text-xs text-primary">404 / OUT OF FRAME</p>
        <h1 className="mt-3 font-display text-5xl">No evidence here.</h1>
        <Link
          href="/"
          data-testid="link-return-home"
          className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"
        >
          Return to workspace <ChevronRight size={15} />
        </Link>
      </div>
    </div>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function Workspace() {
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [result, setResult] = useState<ResultBundle | null>(null);
  const [processing, setProcessing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const initialSetting = (
    key: string,
    fallback: number,
    min: number,
    max: number,
  ) => {
    try {
      return readSetting(localStorage, key, fallback, min, max);
    } catch {
      return fallback;
    }
  };
  const [threshold, setThreshold] = useState(() =>
    initialSetting("enhance-threshold", 5, 0, 6.3),
  );
  const [strength, setStrength] = useState(() =>
    initialSetting("enhance-strength", 1.5, 1, 3),
  );
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [ledgerStatus, setLedgerStatus] = useState("Checking");
  const [storage, setStorage] = useState("This browser");
  const [notice, setNotice] = useState("");
  const [legacy, setLegacy] = useState(false);
  const [preservedReceipt, setPreservedReceipt] = useState(false);
  const entriesRef = useRef<LedgerEntry[]>([]);
  const canPersist = useRef(true);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const fileUrlRef = useRef<string | null>(null);
  const importJob = useRef<AbortController | null>(null);
  const processJob = useRef<AbortController | null>(null);
  const reportError = (error: unknown) => {
    if (!isAbort(error))
      setError(
        error instanceof Error
          ? error.message
          : "The operation could not be completed.",
      );
  };
  useEffect(() => {
    queue.current = (async () => {
      let saved: string | null = null;
      try {
        setLegacy(localStorage.getItem(LEGACY_RECEIPT_KEY) !== null);
        saved = localStorage.getItem(RECEIPT_KEY);
        const verified = await verifyLedger(JSON.parse(saved ?? "[]"));
        entriesRef.current = verified;
        setLedger(verified);
        setLedgerStatus(verified.length ? "Verified" : "Empty");
      } catch (error) {
        setPreservedReceipt(saved !== null);
        canPersist.current = false;
        setStorage("Memory only");
        setLedgerStatus("New session");
        setNotice(
          `${error instanceof Error ? error.message : "Browser storage is unavailable."} New operations stay in memory. Export this session before closing the page.`,
        );
      }
    })();
    return () => {
      importJob.current?.abort();
      processJob.current?.abort();
      if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current);
    };
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("enhance-threshold", String(threshold));
      localStorage.setItem("enhance-strength", String(strength));
    } catch {
      setStorage("Memory only");
    }
  }, [threshold, strength]);
  useEffect(
    () => () => {
      if (result)
        for (const url of [result.enhanced, result.entropy, result.mask])
          URL.revokeObjectURL(url);
    },
    [result],
  );
  const record = useCallback(
    (operation: string, params: Parameters): Promise<void> => {
      const next = queue.current.then(async () => {
        const updated = await addEntry(entriesRef.current, operation, params);
        entriesRef.current = updated;
        setLedger(updated);
        setLedgerStatus("Verified");
        if (canPersist.current) {
          try {
            localStorage.setItem(RECEIPT_KEY, JSON.stringify(updated));
          } catch {
            canPersist.current = false;
            setStorage("Memory only");
            setNotice(
              "Browser storage is full or unavailable. Export the current receipt before closing this page.",
            );
          }
        }
      });
      queue.current = next.catch(() => {});
      return next;
    },
    [],
  );
  const cancelProcessing = () => {
    processJob.current?.abort();
    processJob.current = null;
    setProcessing(false);
  };
  const openFile = async (file: File) => {
    importJob.current?.abort();
    const controller = new AbortController();
    importJob.current = controller;
    setError("");
    setImporting(true);
    let url: string | null = null;
    try {
      validateFile(file);
      url = URL.createObjectURL(file);
      const decoded = await decodeImage(url, controller.signal);
      validateDimensions(decoded.naturalWidth, decoded.naturalHeight);
      const digest = await sha256(await file.arrayBuffer());
      controller.signal.throwIfAborted();
      cancelProcessing();
      if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current);
      fileUrlRef.current = url;
      setImage({
        name: file.name,
        url,
        width: decoded.naturalWidth,
        height: decoded.naturalHeight,
        bytes: file.size,
        sha256: digest,
      });
      url = null;
      setResult(null);
      await record("Import evidence", {
        filename: file.name,
        bytes: file.size,
        sourceSha256: digest,
        width: decoded.naturalWidth,
        height: decoded.naturalHeight,
      });
    } catch (error) {
      if (importJob.current === controller) reportError(error);
    } finally {
      if (url) URL.revokeObjectURL(url);
      if (importJob.current === controller) {
        importJob.current = null;
        setImporting(false);
      }
    }
  };
  const process = async () => {
    if (!image || importing) return;
    cancelProcessing();
    const controller = new AbortController();
    processJob.current = controller;
    const signal = controller.signal;
    setProcessing(true);
    setError("");
    try {
      const source = await readRaster(image.url, signal);
      const inputDigest = await rasterDigest(source);
      const response = await runWorker(
        { kind: "enhance", source, threshold, strength },
        signal,
      );
      if ("error" in response || response.kind !== "enhance")
        throw new Error("Unexpected enhancement result.");
      const next = response.result;
      signal.throwIfAborted();
      const enhanced = await rasterToBlob(next.enhanced);
      signal.throwIfAborted();
      const entropy = await rasterToBlob(next.entropy);
      signal.throwIfAborted();
      const mask = await rasterToBlob(next.mask);
      const outputDigest = await sha256(await enhanced.arrayBuffer());
      const entropyDigest = await sha256(await entropy.arrayBuffer());
      const maskDigest = await sha256(await mask.arrayBuffer());
      signal.throwIfAborted();
      await record("Entropy enhancement", {
        algorithm: ALGORITHM_VERSION,
        threshold,
        strength,
        entropyWindow: 9,
        entropyUnits: "bits",
        alphaPolicy: "exclude-zero-weight-sharpen-by-alpha",
        sourceSha256: image.sha256,
        inputRasterSha256: inputDigest,
        outputPngSha256: outputDigest,
        entropyPngSha256: entropyDigest,
        maskPngSha256: maskDigest,
        width: next.enhanced.width,
        height: next.enhanced.height,
        clippedPixels: next.clippedPixels,
      });
      signal.throwIfAborted();
      setResult({
        enhanced: URL.createObjectURL(enhanced),
        entropy: URL.createObjectURL(entropy),
        mask: URL.createObjectURL(mask),
        width: next.enhanced.width,
        height: next.enhanced.height,
        meanEntropy: next.meanEntropy,
        activePercent: next.activePercent,
        clippedPixels: next.clippedPixels,
        threshold,
        strength,
      });
    } catch (error) {
      if (processJob.current === controller) reportError(error);
    } finally {
      if (processJob.current === controller) {
        processJob.current = null;
        setProcessing(false);
      }
    }
  };
  const reset = () => {
    importJob.current?.abort();
    importJob.current = null;
    setImporting(false);
    cancelProcessing();
    if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current);
    fileUrlRef.current = null;
    setImage(null);
    setResult(null);
    setError("");
  };
  const exportReceipt = async () => {
    try {
      await queue.current;
      const operations = await verifyLedger(entriesRef.current);
      downloadBlob(
        new Blob(
          [
            JSON.stringify(
              {
                product: "ENHANCE!",
                schemaVersion: 2,
                hashAlgorithm: "SHA-256",
                exportedAt: new Date().toISOString(),
                localOnly: true,
                operationCount: operations.length,
                head: operations.at(-1)?.chain ?? null,
                operations,
              },
              null,
              2,
            ),
          ],
          { type: "application/json" },
        ),
        "enhance-provenance-receipt.json",
      );
    } catch (error) {
      reportError(error);
    }
  };
  const exportStored = (old: boolean) => {
    try {
      const saved = localStorage.getItem(
        old ? LEGACY_RECEIPT_KEY : RECEIPT_KEY,
      );
      if (saved === null)
        throw new Error("No saved receipt is available for export.");
      downloadBlob(
        new Blob([saved], { type: "application/json" }),
        old ? "enhance-legacy-receipt.json" : "enhance-stored-receipt.json",
      );
    } catch (error) {
      reportError(error);
    }
  };
  return (
    <AppShell image={image} onOpenFile={openFile}>
      {importing && (
        <p
          role="status"
          className="mx-5 mt-4 rounded-md border border-border bg-card p-3 text-sm"
        >
          Reading image and calculating source digest…
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mx-5 mt-4 rounded-md border border-destructive bg-card p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {storage === "Memory only" && (
        <p role="status" className="mx-5 mt-4 text-xs text-muted-foreground">
          Session receipts are in memory. Export your receipt before closing the
          page.
        </p>
      )}
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/">
            <ProcessingPage
              image={image}
              result={result}
              processing={processing}
              importing={importing}
              threshold={threshold}
              strength={strength}
              setThreshold={setThreshold}
              setStrength={setStrength}
              onProcess={process}
              onCancel={cancelProcessing}
              onReset={reset}
              onOpenFile={openFile}
            />
          </Route>
          <Route path="/forensics">
            <ForensicsPage
              key={image?.url ?? "empty"}
              image={image}
              onLedger={record}
              onOpenFile={openFile}
            />
          </Route>
          <Route path="/spectral">
            <SpectralPage />
          </Route>
          <Route path="/receipts">
            <ReceiptsPage
              ledger={ledger}
              status={ledgerStatus}
              storage={storage}
              notice={notice}
              legacy={legacy}
              preservedReceipt={preservedReceipt}
              onExport={exportReceipt}
              onExportStored={exportStored}
            />
          </Route>
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </AppShell>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Workspace />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
